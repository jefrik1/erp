import express from 'express';
import { pool } from '../../config/db.js';

const router = express.Router();

/* ─────────────────────────────────────────────────────────────────────────────
   ADMINISTRASI PAJAK — nomor faktur pajak (e-Faktur), rekap PPN masa,
   dan pemotongan PPh (21/23/4(2)).
   Sumber PPN keluaran = invoices.tax; PPN masukan = purchase_invoices.tax.
   ───────────────────────────────────────────────────────────────────────────── */

let ensured = false;
async function ensureTaxTables(){
  if(ensured) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS tax_invoices (
    id SERIAL PRIMARY KEY,
    invoice_id INT UNIQUE REFERENCES invoices(id) ON DELETE CASCADE,
    tax_number VARCHAR(25) NOT NULL,
    dpp NUMERIC(18,2) DEFAULT 0,
    ppn NUMERIC(18,2) DEFAULT 0,
    period VARCHAR(7),
    status VARCHAR(20) DEFAULT 'ISSUED',
    created_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
  )`).catch(()=>{});
  await pool.query(`CREATE TABLE IF NOT EXISTS pph_withholdings (
    id SERIAL PRIMARY KEY,
    ref_type VARCHAR(20) DEFAULT 'SALES',
    ref_id INT,
    invoice_number VARCHAR(40),
    partner_name VARCHAR(200),
    pph_type VARCHAR(10) NOT NULL,
    rate NUMERIC(6,2) DEFAULT 0,
    base NUMERIC(18,2) DEFAULT 0,
    amount NUMERIC(18,2) DEFAULT 0,
    period VARCHAR(7),
    notes TEXT,
    created_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
  )`).catch(()=>{});
  ensured = true;
}

const currentPeriod = ()=> new Date(Date.now()+7*3600*1000).toISOString().slice(0,7);
const cleanPeriod = (v)=> /^\d{4}-\d{2}$/.test(String(v||'')) ? String(v) : currentPeriod();
const rp = (n)=> new Intl.NumberFormat('id-ID').format(Math.round(Number(n)||0));

// GET /tax/summary?period=YYYY-MM
router.get('/summary', async (req,res)=>{
  await ensureTaxTables();
  const period = cleanPeriod(req.query.period);
  try{
    const out = await pool.query(`
      SELECT COALESCE(SUM(inv.tax),0)::numeric AS ppn, COALESCE(SUM(inv.total - COALESCE(inv.tax,0)),0)::numeric AS dpp,
             COUNT(*)::int AS invoices,
             COUNT(*) FILTER (WHERE ti.id IS NOT NULL)::int AS with_number,
             COUNT(*) FILTER (WHERE ti.id IS NULL AND COALESCE(inv.tax,0) > 0)::int AS missing_number
        FROM invoices inv LEFT JOIN tax_invoices ti ON ti.invoice_id = inv.id
       WHERE to_char(inv.invoice_date,'YYYY-MM')=$1 AND UPPER(COALESCE(inv.status,'')) NOT IN ('CANCELLED','VOID')`, [period]);
    const inp = await pool.query(`
      SELECT COALESCE(SUM(tax),0)::numeric AS ppn, COALESCE(SUM(total - COALESCE(tax,0)),0)::numeric AS dpp, COUNT(*)::int AS invoices
        FROM purchase_invoices
       WHERE to_char(invoice_date,'YYYY-MM')=$1 AND UPPER(COALESCE(status,'')) <> 'CANCELLED'`, [period]);
    const pph = await pool.query(`
      SELECT pph_type, COUNT(*)::int AS n, COALESCE(SUM(amount),0)::numeric AS amount
        FROM pph_withholdings WHERE period=$1 GROUP BY pph_type ORDER BY pph_type`, [period]);
    const keluaran = parseFloat(out.rows[0].ppn)||0;
    const masukan = parseFloat(inp.rows[0].ppn)||0;
    res.json({
      period,
      ppn_keluaran: keluaran, dpp_keluaran: parseFloat(out.rows[0].dpp)||0,
      ppn_masukan: masukan, dpp_masukan: parseFloat(inp.rows[0].dpp)||0,
      ppn_kurang_bayar: Math.max(0, keluaran - masukan),
      ppn_lebih_bayar: Math.max(0, masukan - keluaran),
      invoices: out.rows[0].invoices, invoices_with_number: out.rows[0].with_number, invoices_missing_number: out.rows[0].missing_number,
      purchase_invoices: inp.rows[0].invoices,
      pph: pph.rows.map(r=>({ type:r.pph_type, count:r.n, amount:parseFloat(r.amount) })),
      pph_total: pph.rows.reduce((s,r)=>s+parseFloat(r.amount),0),
    });
  }catch(e){ console.error('[tax summary]',e); res.status(500).json({error:e.message}); }
});

// GET /tax/invoices?period=&search=
router.get('/invoices', async (req,res)=>{
  await ensureTaxTables();
  const period = cleanPeriod(req.query.period);
  const search = String(req.query.search||'').trim();
  try{
    const p = [period]; let extra='';
    if(search){ p.push('%'+search+'%'); extra = ` AND (inv.invoice_number ILIKE $2 OR c.name ILIKE $2)`; }
    const r = await pool.query(`
      SELECT inv.id, inv.invoice_number, inv.invoice_date, inv.status, inv.total, COALESCE(inv.tax,0) AS ppn,
             inv.total - COALESCE(inv.tax,0) AS dpp, c.name AS customer_name, c.npwp,
             ti.tax_number, ti.period AS tax_period, ti.status AS tax_status, ti.id AS tax_id
        FROM invoices inv
        LEFT JOIN customers c ON c.id=inv.customer_id
        LEFT JOIN tax_invoices ti ON ti.invoice_id=inv.id
       WHERE to_char(inv.invoice_date,'YYYY-MM')=$1 ${extra}
       ORDER BY inv.invoice_date DESC, inv.id DESC LIMIT 300`, p);
    res.json({ period, data:r.rows });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// POST /tax/invoices/:id/number  { tax_number, dpp?, ppn? }
router.post('/invoices/:id/number', async (req,res)=>{
  await ensureTaxTables();
  const raw = String(req.body?.tax_number||'').replace(/[^0-9]/g,'');
  if(raw.length !== 16) return res.status(400).json({error:'Nomor faktur pajak harus 16 digit angka (format e-Faktur: 010.000-26.00000001)'});
  try{
    const inv = await pool.query('SELECT * FROM invoices WHERE id=$1',[req.params.id]);
    if(!inv.rows[0]) return res.status(404).json({error:'Invoice tidak ditemukan'});
    const total = Number(inv.rows[0].total)||0;
    const ppn = req.body?.ppn!=null ? Number(req.body.ppn) : Number(inv.rows[0].tax||0);
    const dpp = req.body?.dpp!=null ? Number(req.body.dpp) : (total - ppn);
    const period = String(inv.rows[0].invoice_date||'').slice(0,7) || currentPeriod();
    await pool.query(`INSERT INTO tax_invoices (invoice_id, tax_number, dpp, ppn, period, status, created_by)
      VALUES ($1,$2,$3,$4,$5,'ISSUED',$6)
      ON CONFLICT (invoice_id) DO UPDATE SET tax_number=$2, dpp=$3, ppn=$4, period=$5`,
      [inv.rows[0].id, raw, dpp, ppn, period, req.user.id]);
    res.json({ ok:true, tax_number: raw.replace(/(\d{3})(\d{3})-?(\d{2})\.?(\d{8})/, '$1.$2-$3.$4'), dpp, ppn, period });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// DELETE /tax/invoices/:id/number
router.delete('/invoices/:id/number', async (req,res)=>{
  await ensureTaxTables();
  try{ await pool.query('DELETE FROM tax_invoices WHERE invoice_id=$1',[req.params.id]); res.json({ ok:true }); }
  catch(e){ res.status(500).json({error:e.message}); }
});

// GET /tax/pph?period=
router.get('/pph', async (req,res)=>{
  await ensureTaxTables();
  const period = cleanPeriod(req.query.period);
  try{
    const r = await pool.query(`SELECT * FROM pph_withholdings WHERE period=$1 ORDER BY id DESC LIMIT 300`,[period]);
    res.json({ period, data:r.rows, total: r.rows.reduce((s,x)=>s+Number(x.amount||0),0) });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// POST /tax/pph  { pph_type, base, rate?, amount?, ref_type?, ref_id?, invoice_number?, partner_name?, notes?, period? }
router.post('/pph', async (req,res)=>{
  await ensureTaxTables();
  const type = String(req.body?.pph_type||'').toUpperCase();
  const allowed = { PPH21:[5,15,25,30], PPH23:[2], PPH4_2:[10] };
  if(!allowed[type]) return res.status(400).json({error:'Jenis PPh harus PPH21, PPH23, atau PPH4_2'});
  const base = Number(req.body?.base)||0;
  if(base<=0) return res.status(400).json({error:'Dasar pengenaan (base) harus lebih dari 0'});
  let rate = Number(req.body?.rate);
  if(!rate) rate = type==='PPH21' ? 5 : allowed[type][0];
  const amount = req.body?.amount!=null ? Number(req.body.amount) : Math.round(base*rate/100);
  try{
    const r = await pool.query(`INSERT INTO pph_withholdings (ref_type, ref_id, invoice_number, partner_name, pph_type, rate, base, amount, period, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.body?.ref_type||'MANUAL', req.body?.ref_id||null, req.body?.invoice_number||null, req.body?.partner_name||null,
       type, rate, base, amount, cleanPeriod(req.body?.period), req.body?.notes||null, req.user.id]);
    res.json({ ok:true, data:r.rows[0] });
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.delete('/pph/:id', async (req,res)=>{
  await ensureTaxTables();
  try{ await pool.query('DELETE FROM pph_withholdings WHERE id=$1',[req.params.id]); res.json({ ok:true }); }
  catch(e){ res.status(500).json({error:e.message}); }
});

// GET /tax/export?period=  → rekap siap impor e-Faktur (CSV text)
router.get('/export', async (req,res)=>{
  await ensureTaxTables();
  const period = cleanPeriod(req.query.period);
  try{
    const r = await pool.query(`
      SELECT inv.invoice_number, to_char(inv.invoice_date,'YYYY-MM-DD') AS tanggal, c.name AS pembeli, c.npwp,
             (inv.total - COALESCE(inv.tax,0)) AS dpp, COALESCE(inv.tax,0) AS ppn, COALESCE(ti.tax_number,'') AS nomor_faktur
        FROM invoices inv LEFT JOIN customers c ON c.id=inv.customer_id
        LEFT JOIN tax_invoices ti ON ti.invoice_id=inv.id
       WHERE to_char(inv.invoice_date,'YYYY-MM')=$1 AND UPPER(COALESCE(inv.status,'')) NOT IN ('CANCELLED','VOID')
       ORDER BY inv.invoice_date, inv.id`, [period]);
    const header = 'invoice,tanggal,pembeli,npwp,dpp,ppn,nomor_faktur';
    const rows = r.rows.map(x=>[x.invoice_number,x.tanggal,x.pembeli||'',x.npwp||'',x.dpp,x.ppn,x.nomor_faktur]
      .map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','));
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="rekap-pajak-${period}.csv"`);
    res.send([header, ...rows].join('\n'));
  }catch(e){ res.status(500).json({error:e.message}); }
});

export default router;
