import express from 'express';
import { pool } from '../../config/db.js';
import { rbac } from '../../middleware/auth.js';

const router = express.Router();

/* ─────────────────────────────────────────────────────────────────────────────
   TUTUP BUKU (period lock)
   Periode yang CLOSED tidak bisa menerima jurnal baru — postJournal() menolak.
   Buka kembali hanya oleh Direktur/Super Admin (dengan alasan, tercatat audit).
   ───────────────────────────────────────────────────────────────────────────── */

let ensured = false;
async function ensureTable(){
  if(ensured) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS accounting_periods (
    period VARCHAR(7) PRIMARY KEY,
    status VARCHAR(10) NOT NULL DEFAULT 'OPEN',
    closed_by INT REFERENCES users(id),
    closed_at TIMESTAMP,
    reopened_by INT REFERENCES users(id),
    reopened_at TIMESTAMP,
    notes TEXT
  )`).catch(()=>{});
  ensured = true;
}

const validPeriod = (p)=> /^\d{4}-\d{2}$/.test(String(p||''));
const currentPeriod = ()=> new Date(Date.now()+7*3600*1000).toISOString().slice(0,7);

function lastPeriods(n=18){
  const out = [];
  const now = new Date();
  for(let i=0;i<n;i++){
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth()-i, 1));
    out.push(d.toISOString().slice(0,7));
  }
  return out;
}

// GET /finance/periods
router.get('/', async (req,res)=>{
  await ensureTable();
  try{
    const periods = lastPeriods(18);
    const rows = await pool.query(`SELECT * FROM accounting_periods WHERE period = ANY($1)`, [periods]);
    const byPeriod = new Map(rows.rows.map(r=>[r.period, r]));
    const jr = await pool.query(`
      SELECT to_char(entry_date,'YYYY-MM') AS period, COUNT(*)::int AS journals,
             COALESCE(SUM(total_debit),0)::numeric AS debit
        FROM journal_entries WHERE to_char(entry_date,'YYYY-MM') = ANY($1)
       GROUP BY 1`, [periods]);
    const jMap = new Map(jr.rows.map(r=>[r.period, r]));
    res.json(periods.map(p=>{
      const rec = byPeriod.get(p) || {};
      const j = jMap.get(p) || {};
      return {
        period: p,
        status: String(rec.status||'OPEN').toUpperCase(),
        journals: j.journals||0,
        debit: parseFloat(j.debit||0),
        closed_at: rec.closed_at||null,
        reopened_at: rec.reopened_at||null,
        notes: rec.notes||null,
      };
    }));
  }catch(e){ console.error('[periods]',e); res.status(500).json({error:e.message}); }
});

// POST /finance/periods/:period/close  { notes }
router.post('/:period/close', rbac('finance','direktur','super_admin'), async (req,res)=>{
  await ensureTable();
  const p = req.params.period;
  if(!validPeriod(p)) return res.status(400).json({error:'Format periode harus YYYY-MM'});
  if(p > currentPeriod()) return res.status(400).json({error:'Tidak bisa menutup periode yang belum berjalan'});
  try{
    const chk = await pool.query(`SELECT COALESCE(SUM(total_debit),0) d, COALESCE(SUM(total_credit),0) c, COUNT(*)::int n FROM journal_entries WHERE to_char(entry_date,'YYYY-MM')=$1`,[p]);
    const d = parseFloat(chk.rows[0].d), c = parseFloat(chk.rows[0].c);
    if(Math.abs(d-c) > 1) return res.status(400).json({error:`Trial balance periode ${p} tidak seimbang (D ${Math.round(d)} vs K ${Math.round(c)}). Perbaiki jurnal dulu.`});
    await pool.query(`INSERT INTO accounting_periods (period, status, closed_by, closed_at, notes)
      VALUES ($1,'CLOSED',$2,NOW(),$3)
      ON CONFLICT (period) DO UPDATE SET status='CLOSED', closed_by=$2, closed_at=NOW(), notes=$3`,
      [p, req.user.id, req.body?.notes||null]);
    res.json({ ok:true, period:p, status:'CLOSED', journals: chk.rows[0].n, message:`Periode ${p} ditutup. Jurnal baru untuk periode ini akan ditolak.` });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// POST /finance/periods/:period/reopen  (direktur/super_admin)
router.post('/:period/reopen', rbac('direktur','super_admin'), async (req,res)=>{
  await ensureTable();
  const p = req.params.period;
  if(!validPeriod(p)) return res.status(400).json({error:'Format periode harus YYYY-MM'});
  if(!req.body?.reason || String(req.body.reason).trim().length < 5){
    return res.status(400).json({error:'Alasan buka periode wajib diisi (minimal 5 karakter) — tercatat di audit'});
  }
  try{
    await pool.query(`INSERT INTO accounting_periods (period, status, reopened_by, reopened_at, notes)
      VALUES ($1,'OPEN',$2,NOW(),$3)
      ON CONFLICT (period) DO UPDATE SET status='OPEN', reopened_by=$2, reopened_at=NOW(), notes=$3`,
      [p, req.user.id, req.body.reason.trim()]);
    res.json({ ok:true, period:p, status:'OPEN', message:`Periode ${p} dibuka kembali.` });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// GET /finance/periods/:period/status → dipakai UI untuk badge
router.get('/:period/status', async (req,res)=>{
  await ensureTable();
  const p = req.params.period;
  if(!validPeriod(p)) return res.status(400).json({error:'Format periode harus YYYY-MM'});
  const r = await pool.query('SELECT * FROM accounting_periods WHERE period=$1',[p]);
  res.json({ period:p, status: String(r.rows[0]?.status||'OPEN').toUpperCase(), closed_at: r.rows[0]?.closed_at||null });
});

export default router;
