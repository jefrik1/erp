import express from 'express';
import { pool } from '../../config/db.js';

const router = express.Router();

/* ─────────────────────────────────────────────────────────────────────────────
   REKONSILIASI BANK
   Impor mutasi rekening (CSV/JSON) → cocokkan otomatis dengan payments
   (nominal sama, tanggal ±5 hari, rekening sama) → sisa dicocokkan manual.
   Tidak mengubah saldo bank; hanya penanda "sudah cocok" + laporan selisih.
   ───────────────────────────────────────────────────────────────────────────── */

let ensured = false;
async function ensureTables(){
  if(ensured) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS bank_statement_lines (
    id SERIAL PRIMARY KEY,
    account_id INT REFERENCES bank_accounts(id) ON DELETE CASCADE,
    line_date DATE NOT NULL,
    description TEXT,
    amount NUMERIC(18,2) NOT NULL,
    ref VARCHAR(80),
    status VARCHAR(15) NOT NULL DEFAULT 'UNMATCHED',
    matched_payment_id INT REFERENCES payments(id),
    matched_by INT REFERENCES users(id),
    matched_at TIMESTAMP,
    notes TEXT,
    created_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
  )`).catch(()=>{});
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_recon_acc_date ON bank_statement_lines(account_id, line_date)`).catch(()=>{});
  ensured = true;
}

const currentPeriod = ()=> new Date(Date.now()+7*3600*1000).toISOString().slice(0,7);
const rp = (n)=> 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(Number(n)||0));

// POST /finance/recon/import { account_id, rows:[{date, description, amount, ref}] }
router.post('/import', async (req,res)=>{
  await ensureTables();
  const accountId = parseInt(req.body?.account_id);
  const rows = Array.isArray(req.body?.rows)? req.body.rows : [];
  if(!accountId) return res.status(400).json({error:'Pilih rekening bank'});
  if(!rows.length) return res.status(400).json({error:'Tidak ada baris mutasi'});
  const clean = [];
  for(const r of rows){
    const amt = Number(r.amount);
    if(!r.date || !isFinite(amt) || amt===0) continue;
    clean.push({ date:String(r.date).slice(0,10), desc:r.description||null, amount:amt, ref:r.ref||null });
  }
  if(!clean.length) return res.status(400).json({error:'Semua baris tidak valid (butuh date + amount ≠ 0)'});
  try{
    let inserted = 0;
    for(const r of clean){
      await pool.query(`INSERT INTO bank_statement_lines (account_id, line_date, description, amount, ref, created_by)
        VALUES ($1,$2,$3,$4,$5,$6)`, [accountId, r.date, r.desc, r.amount, r.ref, req.user.id]);
      inserted++;
    }
    // Auto-match setelah impor
    const auto = await autoMatch(accountId, req.user.id);
    res.json({ ok:true, inserted, auto_matched: auto, message:`${inserted} baris diimpor, ${auto} otomatis cocok.` });
  }catch(e){ console.error('[recon import]',e); res.status(500).json({error:e.message}); }
});

async function autoMatch(accountId, userId){
  const lines = await pool.query(`SELECT * FROM bank_statement_lines WHERE account_id=$1 AND status='UNMATCHED' ORDER BY line_date`,[accountId]);
  let matched = 0;
  for(const l of lines.rows){
    const p = await pool.query(`
      SELECT p.id FROM payments p
       WHERE p.bank_account_id=$1
         AND ABS(COALESCE(p.amount,0) - ABS($2)) < 1
         AND p.payment_date BETWEEN $3::date - INTERVAL '5 days' AND $3::date + INTERVAL '5 days'
         AND NOT EXISTS (SELECT 1 FROM bank_statement_lines b WHERE b.matched_payment_id=p.id)
       ORDER BY ABS(p.payment_date - $3::date) LIMIT 1`,
      [accountId, Number(l.amount), l.line_date]);
    if(p.rows[0]){
      await pool.query(`UPDATE bank_statement_lines SET status='MATCHED', matched_payment_id=$1, matched_by=$2, matched_at=NOW() WHERE id=$3`,
        [p.rows[0].id, userId, l.id]);
      matched++;
    }
  }
  return matched;
}

// POST /finance/recon/auto { account_id }
router.post('/auto', async (req,res)=>{
  await ensureTables();
  const accountId = parseInt(req.body?.account_id);
  if(!accountId) return res.status(400).json({error:'Pilih rekening bank'});
  try{ const n = await autoMatch(accountId, req.user.id); res.json({ ok:true, matched:n }); }
  catch(e){ res.status(500).json({error:e.message}); }
});

// GET /finance/recon?account_id=&period=
router.get('/', async (req,res)=>{
  await ensureTables();
  const accountId = parseInt(req.query.account_id);
  const period = /^\d{4}-\d{2}$/.test(String(req.query.period||'')) ? req.query.period : currentPeriod();
  if(!accountId) return res.status(400).json({error:'account_id wajib'});
  try{
    const acc = await pool.query('SELECT * FROM bank_accounts WHERE id=$1',[accountId]);
    if(!acc.rows[0]) return res.status(404).json({error:'Rekening tidak ditemukan'});
    const lines = await pool.query(`
      SELECT b.*, p.payment_number, p.method, p.payment_date, p.amount AS payment_amount
        FROM bank_statement_lines b LEFT JOIN payments p ON p.id=b.matched_payment_id
       WHERE b.account_id=$1 AND to_char(b.line_date,'YYYY-MM')=$2
       ORDER BY b.line_date, b.id`, [accountId, period]);
    const summary = lines.rows.reduce((a,x)=>{
      const amt = Number(x.amount)||0;
      a.total += 1;
      if(x.status==='MATCHED'){ a.matched += 1; a.matched_value += amt; }
      else if(x.status==='IGNORED'){ a.ignored += 1; }
      else { a.unmatched += 1; a.unmatched_value += amt; }
      return a;
    }, { total:0, matched:0, unmatched:0, ignored:0, matched_value:0, unmatched_value:0 });
    res.json({ account: acc.rows[0], period, summary, lines: lines.rows });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// GET /finance/recon/candidates/:lineId → pembayaran yang mungkin cocok
router.get('/candidates/:lineId', async (req,res)=>{
  await ensureTables();
  try{
    const l = await pool.query('SELECT * FROM bank_statement_lines WHERE id=$1',[req.params.lineId]);
    if(!l.rows[0]) return res.status(404).json({error:'Baris tidak ditemukan'});
    const line = l.rows[0];
    const r = await pool.query(`
      SELECT p.id, p.payment_number, p.payment_date, p.method, p.amount, p.type,
             i.invoice_number, c.name AS customer_name
        FROM payments p
        LEFT JOIN invoices i ON i.id=p.invoice_id
        LEFT JOIN customers c ON c.id=i.customer_id
       WHERE p.bank_account_id=$1
         AND NOT EXISTS (SELECT 1 FROM bank_statement_lines b WHERE b.matched_payment_id=p.id)
       ORDER BY ABS(COALESCE(p.amount,0) - ABS($2)) ASC, ABS(p.payment_date - $3::date) ASC
       LIMIT 10`, [line.account_id, Number(line.amount), line.line_date]);
    res.json({ line, candidates: r.rows });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// POST /finance/recon/:id/match { payment_id }
router.post('/:id/match', async (req,res)=>{
  await ensureTables();
  const paymentId = parseInt(req.body?.payment_id);
  if(!paymentId) return res.status(400).json({error:'payment_id wajib'});
  try{
    const used = await pool.query(`SELECT id FROM bank_statement_lines WHERE matched_payment_id=$1 AND id<>$2`, [paymentId, req.params.id]);
    if(used.rows[0]) return res.status(409).json({error:'Pembayaran itu sudah dicocokkan ke baris lain'});
    await pool.query(`UPDATE bank_statement_lines SET status='MATCHED', matched_payment_id=$1, matched_by=$2, matched_at=NOW() WHERE id=$3`,
      [paymentId, req.user.id, req.params.id]);
    res.json({ ok:true });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// POST /finance/recon/:id/unmatch
router.post('/:id/unmatch', async (req,res)=>{
  await ensureTables();
  try{
    await pool.query(`UPDATE bank_statement_lines SET status='UNMATCHED', matched_payment_id=NULL, matched_by=NULL, matched_at=NULL WHERE id=$1`,[req.params.id]);
    res.json({ ok:true });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// POST /finance/recon/:id/ignore  { notes }
router.post('/:id/ignore', async (req,res)=>{
  await ensureTables();
  try{
    await pool.query(`UPDATE bank_statement_lines SET status='IGNORED', notes=$1 WHERE id=$2`,[req.body?.notes||null, req.params.id]);
    res.json({ ok:true });
  }catch(e){ res.status(500).json({error:e.message}); }
});

export default router;
