import express from 'express';
import { pool } from '../../config/db.js';

const router = express.Router();

/* ─────────────────────────────────────────────────────────────────────────────
   APPROVAL MATRIX
   Ambang batas per modul/metrik. Dipakai sales (diskon %) dan purchasing (nilai PO).
   Contoh: SALES_ORDER/DISCOUNT_PCT threshold 10 → diskon > 10% wajib approval.
   ───────────────────────────────────────────────────────────────────────────── */

let ensured = false;
export async function ensureApprovalRules(){
  if(ensured) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS approval_rules (
    id SERIAL PRIMARY KEY,
    module VARCHAR(40) NOT NULL,
    metric VARCHAR(40) NOT NULL,
    threshold NUMERIC(18,2) NOT NULL DEFAULT 0,
    approver_roles VARCHAR(200) DEFAULT 'direktur',
    active BOOLEAN DEFAULT true,
    notes TEXT,
    updated_by INT REFERENCES users(id),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(module, metric)
  )`).catch(()=>{});
  const defaults = [
    ['SALES_ORDER','DISCOUNT_PCT',10,'direktur','Diskon di atas 10% wajib approval'],
    ['PURCHASE_ORDER','VALUE',50000000,'direktur','PO di atas Rp 50 juta wajib approval'],
  ];
  for(const [m,mt,t,roles,notes] of defaults){
    await pool.query(`INSERT INTO approval_rules (module, metric, threshold, approver_roles, notes)
      VALUES ($1,$2,$3,$4,$5) ON CONFLICT (module, metric) DO NOTHING`, [m,mt,t,roles,notes]).catch(()=>{});
  }
  ensured = true;
}

const cache = new Map(); // key -> { rule, at }
export async function getRule(module, metric){
  await ensureApprovalRules();
  const key = `${module}|${metric}`;
  const hit = cache.get(key);
  if(hit && Date.now()-hit.at < 30_000) return hit.rule;
  const r = await pool.query(`SELECT * FROM approval_rules WHERE module=$1 AND metric=$2 AND active=true`, [module, metric]);
  const rule = r.rows[0] || null;
  cache.set(key, { rule, at: Date.now() });
  return rule;
}
export function clearRuleCache(){ cache.clear(); }

/** Cari user pertama yang punya salah satu role (untuk approver default). */
export async function firstApprover(rolesCsv){
  const roles = String(rolesCsv||'direktur').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  const r = await pool.query(`
    SELECT u.id FROM users u
      JOIN user_roles ur ON ur.user_id=u.id
      JOIN roles ro ON ro.id=ur.role_id
     WHERE LOWER(ro.name) = ANY($1) AND u.is_active=true
     ORDER BY u.id LIMIT 1`, [roles]);
  return r.rows[0]?.id || null;
}

/** Buat permintaan approval + kembalikan id (atau null bila tidak ada approver). */
export async function createApproval({ entityType, entityId, requesterId, roles, level=1 }){
  const approverId = await firstApprover(roles);
  if(!approverId) return null;
  const ins = await pool.query(`INSERT INTO approval_requests (entity_type, entity_id, requester_id, approver_id, level)
    VALUES ($1,$2,$3,$4,$5) RETURNING id`, [entityType, entityId, requesterId, approverId, level]);
  return ins.rows[0].id;
}

// GET /approval-rules
router.get('/', async (req,res)=>{
  await ensureApprovalRules();
  try{ const r = await pool.query('SELECT * FROM approval_rules ORDER BY module, metric'); res.json(r.rows); }
  catch(e){ res.status(500).json({error:e.message}); }
});

// POST /approval-rules  { module, metric, threshold, approver_roles, notes, active }
router.post('/', async (req,res)=>{
  await ensureApprovalRules();
  const { module, metric, threshold, approver_roles, notes, active } = req.body||{};
  if(!module || !metric) return res.status(400).json({error:'module & metric wajib'});
  try{
    const r = await pool.query(`INSERT INTO approval_rules (module, metric, threshold, approver_roles, notes, active, updated_by)
      VALUES ($1,$2,$3,$4,$5,COALESCE($6,true),$7)
      ON CONFLICT (module, metric) DO UPDATE SET threshold=$3, approver_roles=$4, notes=$5, active=COALESCE($6,true), updated_by=$7, updated_at=NOW()
      RETURNING *`,
      [String(module).toUpperCase(), String(metric).toUpperCase(), Number(threshold)||0, approver_roles||'direktur', notes||null, active==null? null : !!active, req.user.id]);
    clearRuleCache();
    res.json({ ok:true, data:r.rows[0] });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// PUT /approval-rules/:id
router.put('/:id', async (req,res)=>{
  await ensureApprovalRules();
  const { threshold, approver_roles, notes, active } = req.body||{};
  try{
    const r = await pool.query(`UPDATE approval_rules SET
        threshold=COALESCE($2, threshold), approver_roles=COALESCE($3, approver_roles),
        notes=COALESCE($4, notes), active=COALESCE($5, active), updated_by=$6, updated_at=NOW()
      WHERE id=$1 RETURNING *`,
      [req.params.id, threshold==null? null : Number(threshold), approver_roles||null, notes||null, active==null? null : !!active, req.user.id]);
    if(!r.rows[0]) return res.status(404).json({error:'Rule tidak ditemukan'});
    clearRuleCache();
    res.json({ ok:true, data:r.rows[0] });
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.delete('/:id', async (req,res)=>{
  await ensureApprovalRules();
  try{ await pool.query('DELETE FROM approval_rules WHERE id=$1',[req.params.id]); clearRuleCache(); res.json({ ok:true }); }
  catch(e){ res.status(500).json({error:e.message}); }
});

// GET /approval-rules/check?module=SALES_ORDER&metric=DISCOUNT_PCT&value=15
router.get('/check', async (req,res)=>{
  const rule = await getRule(String(req.query.module||'').toUpperCase(), String(req.query.metric||'').toUpperCase());
  const value = Number(req.query.value)||0;
  res.json({ rule, value, required: !!rule && value > Number(rule.threshold) });
});

export default router;
