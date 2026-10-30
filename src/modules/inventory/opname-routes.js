import express from 'express';
import { pool } from '../../config/db.js';
import { postJournal, ensureCoa, withTx } from '../../lib/journal.js';

const router = express.Router();

/* ─────────────────────────────────────────────────────────────────────────────
   STOCK OPNAME — sesi hitung fisik per gudang.
   Alur: DRAFT → COUNTING (mulai input) → SUBMITTED → APPROVED → POSTED.
   Posting = stok diset ke hasil hitung + kartu stok ADJ + jurnal selisih.
   ───────────────────────────────────────────────────────────────────────────── */

const R_APPROVE = ['direktur','super_admin','finance'];

let ensured = false;
export async function ensureOpnameTables(){
  if(ensured) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS stock_opname_sessions (
    id SERIAL PRIMARY KEY,
    session_number VARCHAR(30) UNIQUE NOT NULL,
    warehouse_id INT REFERENCES warehouses(id),
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    notes TEXT,
    total_items INT DEFAULT 0,
    total_variance_value NUMERIC(18,2) DEFAULT 0,
    journal_id INT,
    created_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    submitted_at TIMESTAMP,
    approved_by INT REFERENCES users(id),
    approved_at TIMESTAMP,
    posted_at TIMESTAMP
  )`).catch(()=>{});
  await pool.query(`CREATE TABLE IF NOT EXISTS stock_opname_items (
    id SERIAL PRIMARY KEY,
    session_id INT REFERENCES stock_opname_sessions(id) ON DELETE CASCADE,
    product_id INT REFERENCES products(id),
    qty_system NUMERIC(15,3) DEFAULT 0,
    qty_counted NUMERIC(15,3) DEFAULT 0,
    variance NUMERIC(15,3) DEFAULT 0,
    unit_cost NUMERIC(15,2) DEFAULT 0,
    notes TEXT,
    UNIQUE(session_id, product_id)
  )`).catch(()=>{});
  await ensureCoa([
    { code:'1-1200', name:'Persediaan', type:'ASSET' },
    { code:'6-1100', name:'Selisih Stok Opname', type:'EXPENSE' },
  ]);
  ensured = true;
}

const canApprove = (req)=> (req.user?.roles||[]).some(r=>R_APPROVE.includes(String(r).toLowerCase()));

async function nextNumber(){
  const d = new Date(Date.now()+7*3600*1000).toISOString().slice(0,10).replace(/-/g,'');
  const r = await pool.query(`SELECT COUNT(*)::int n FROM stock_opname_sessions WHERE session_number LIKE $1`, ['OPN-'+d+'-%']);
  return `OPN-${d}-${String(r.rows[0].n+1).padStart(3,'0')}`;
}

// GET /inventory/opname/sessions
router.get('/sessions', async (req,res)=>{
  await ensureOpnameTables();
  try{
    const {status} = req.query;
    let where='WHERE 1=1'; const p=[];
    if(status && status!=='Semua'){ p.push(status); where+=` AND s.status=$${p.length}`; }
    const r = await pool.query(`
      SELECT s.*, w.name AS warehouse_name, u.username AS created_by_name, a.username AS approved_by_name,
             (SELECT COUNT(*)::int FROM stock_opname_items i WHERE i.session_id=s.id) AS items,
             (SELECT COUNT(*)::int FROM stock_opname_items i WHERE i.session_id=s.id AND i.variance<>0) AS items_diff
        FROM stock_opname_sessions s
        LEFT JOIN warehouses w ON w.id=s.warehouse_id
        LEFT JOIN users u ON u.id=s.created_by
        LEFT JOIN users a ON a.id=s.approved_by
        ${where} ORDER BY s.id DESC LIMIT 100`, p);
    res.json(r.rows);
  }catch(e){ console.error('[opname list]',e); res.status(500).json({error:e.message}); }
});

// GET /inventory/opname/sessions/:id
router.get('/sessions/:id', async (req,res)=>{
  await ensureOpnameTables();
  try{
    const s = await pool.query(`SELECT s.*, w.name AS warehouse_name, u.username AS created_by_name, a.username AS approved_by_name
      FROM stock_opname_sessions s LEFT JOIN warehouses w ON w.id=s.warehouse_id
      LEFT JOIN users u ON u.id=s.created_by LEFT JOIN users a ON a.id=s.approved_by WHERE s.id=$1`, [req.params.id]);
    if(!s.rows[0]) return res.status(404).json({error:'Sesi opname tidak ditemukan'});
    const items = await pool.query(`SELECT i.*, p.name, p.sku, u.code AS unit_code
      FROM stock_opname_items i JOIN products p ON p.id=i.product_id
      LEFT JOIN units u ON u.id=p.base_unit_id
      WHERE i.session_id=$1 ORDER BY p.name`, [req.params.id]);
    res.json({ ...s.rows[0], items: items.rows });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// POST /inventory/opname/sessions  { warehouse_id, notes }
router.post('/sessions', async (req,res)=>{
  await ensureOpnameTables();
  const warehouseId = parseInt(req.body?.warehouse_id);
  if(!warehouseId) return res.status(400).json({error:'Pilih gudang yang akan dihitung'});
  try{
    const open = await pool.query(`SELECT id, session_number FROM stock_opname_sessions WHERE warehouse_id=$1 AND status NOT IN ('POSTED','CANCELLED') LIMIT 1`, [warehouseId]);
    if(open.rows[0]) return res.status(409).json({error:`Masih ada sesi opname berjalan (${open.rows[0].session_number}) untuk gudang ini. Selesaikan atau batalkan dulu.`});
    const num = await nextNumber();
    const id = await withTx(async (c)=>{
      const s = await c.query(`INSERT INTO stock_opname_sessions (session_number, warehouse_id, status, notes, created_by) VALUES ($1,$2,'DRAFT',$3,$4) RETURNING id`,
        [num, warehouseId, req.body?.notes||null, req.user.id]);
      const sid = s.rows[0].id;
      // Satu produk = satu baris hitung. Stok bisa punya beberapa baris di gudang
      // yang sama (baris batch, atau sisa impor lama): jumlahkan qty & HPP tertimbang
      // supaya UNIQUE(session_id, product_id) tidak pecah dan angka sistem = total nyata.
      const ins = await c.query(`INSERT INTO stock_opname_items (session_id, product_id, qty_system, qty_counted, variance, unit_cost)
        SELECT $1, t.product_id, t.qty, t.qty, 0, t.avg_cost
          FROM (SELECT st.product_id,
                       SUM(st.qty_on_hand)::numeric AS qty,
                       CASE WHEN SUM(st.qty_on_hand) <> 0
                            THEN SUM(st.qty_on_hand * COALESCE(st.avg_cost,0)) / SUM(st.qty_on_hand)
                            ELSE COALESCE(MAX(st.avg_cost),0) END::numeric AS avg_cost
                  FROM stocks st WHERE st.warehouse_id=$2
                 GROUP BY st.product_id) t`, [sid, warehouseId]);
      await c.query(`UPDATE stock_opname_sessions SET total_items=$1 WHERE id=$2`, [ins.rowCount, sid]);
      return sid;
    });
    res.json({ ok:true, id, session_number:num, message:`Sesi ${num} dibuat. Masukkan hasil hitung fisik.` });
  }catch(e){ console.error('[opname create]',e); res.status(500).json({error:e.message}); }
});

// PATCH /inventory/opname/sessions/:id/items  { items:[{product_id|id, qty_counted, notes}] }
router.patch('/sessions/:id/items', async (req,res)=>{
  await ensureOpnameTables();
  const items = Array.isArray(req.body?.items)? req.body.items : [];
  if(!items.length) return res.status(400).json({error:'Tidak ada item yang dikirim'});
  try{
    const s = await pool.query('SELECT * FROM stock_opname_sessions WHERE id=$1',[req.params.id]);
    if(!s.rows[0]) return res.status(404).json({error:'Sesi tidak ditemukan'});
    if(!['DRAFT','COUNTING'].includes(s.rows[0].status)) return res.status(400).json({error:'Sesi sudah dikunci (status '+s.rows[0].status+'). Tidak bisa diubah.'});
    let n=0;
    await withTx(async (c)=>{
      for(const it of items){
        const qty = Number(it.qty_counted);
        if(isNaN(qty) || qty < 0) continue;
        // unit_cost opsional: dipakai sebagai dasar penilaian selisih. Untuk baris
        // yang HPP-nya sudah tidak relevan (stok minus warisan impor), isi 0 supaya
        // posting tidak membukukan aset yang tidak ada.
        const costRaw = it.unit_cost;
        const cost = (costRaw===undefined || costRaw===null || costRaw==='') ? null : Number(costRaw);
        if (cost!==null && (isNaN(cost) || cost < 0)) continue;
        const r = await c.query(`UPDATE stock_opname_items
          SET qty_counted=$1, variance = $1 - qty_system, notes=$2,
              unit_cost = COALESCE($6::numeric, unit_cost)
          WHERE session_id=$3 AND (id=$4 OR product_id=$5) RETURNING id`,
          [qty, it.notes||null, req.params.id, parseInt(it.id)||0, parseInt(it.product_id)||0, cost]);
        n += r.rowCount;
      }
      await c.query(`UPDATE stock_opname_sessions SET status='COUNTING' WHERE id=$1 AND status='DRAFT'`, [req.params.id]);
    });
    res.json({ ok:true, updated:n });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// POST /inventory/opname/sessions/:id/submit
router.post('/sessions/:id/submit', async (req,res)=>{
  await ensureOpnameTables();
  try{
    const s = await pool.query('SELECT * FROM stock_opname_sessions WHERE id=$1',[req.params.id]);
    if(!s.rows[0]) return res.status(404).json({error:'Sesi tidak ditemukan'});
    if(!['DRAFT','COUNTING'].includes(s.rows[0].status)) return res.status(400).json({error:'Status tidak bisa diajukan (sudah '+s.rows[0].status+')'});
    const agg = await pool.query(`SELECT COUNT(*) FILTER (WHERE variance<>0)::int AS diff,
        COALESCE(SUM(variance*unit_cost),0)::numeric AS value FROM stock_opname_items WHERE session_id=$1`,[req.params.id]);
    await pool.query(`UPDATE stock_opname_sessions SET status='SUBMITTED', submitted_at=NOW(), total_variance_value=$1 WHERE id=$2`,
      [agg.rows[0].value, req.params.id]);
    res.json({ ok:true, status:'SUBMITTED', items_diff:agg.rows[0].diff, variance_value:parseFloat(agg.rows[0].value) });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// POST /inventory/opname/sessions/:id/approve  (direktur/super_admin/finance)
router.post('/sessions/:id/approve', async (req,res)=>{
  await ensureOpnameTables();
  if(!canApprove(req)) return res.status(403).json({error:'Approval opname hanya Direktur / Super Admin / Finance'});
  try{
    const s = await pool.query('SELECT * FROM stock_opname_sessions WHERE id=$1',[req.params.id]);
    if(!s.rows[0]) return res.status(404).json({error:'Sesi tidak ditemukan'});
    if(s.rows[0].status!=='SUBMITTED') return res.status(400).json({error:'Hanya sesi SUBMITTED yang bisa di-approve (sekarang '+s.rows[0].status+')'});
    await pool.query(`UPDATE stock_opname_sessions SET status='APPROVED', approved_by=$1, approved_at=NOW() WHERE id=$2`,[req.user.id, req.params.id]);
    res.json({ ok:true, status:'APPROVED' });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// POST /inventory/opname/sessions/:id/post  → set stok + kartu stok + jurnal
router.post('/sessions/:id/post', async (req,res)=>{
  await ensureOpnameTables();
  if(!canApprove(req)) return res.status(403).json({error:'Posting opname hanya Direktur / Super Admin / Finance'});
  try{
    const s = await pool.query('SELECT * FROM stock_opname_sessions WHERE id=$1',[req.params.id]);
    if(!s.rows[0]) return res.status(404).json({error:'Sesi tidak ditemukan'});
    if(s.rows[0].status!=='APPROVED') return res.status(400).json({error:'Sesi harus APPROVED sebelum posting (sekarang '+s.rows[0].status+')'});
    const items = await pool.query('SELECT * FROM stock_opname_items WHERE session_id=$1 AND variance<>0',[req.params.id]);
    if(!items.rows.length){
      await pool.query(`UPDATE stock_opname_sessions SET status='POSTED', posted_at=NOW(), total_variance_value=0 WHERE id=$1`,[req.params.id]);
      return res.json({ ok:true, adjusted:0, journal_id:null, message:'Tidak ada selisih — sesi ditutup tanpa jurnal.' });
    }
    const negative = items.rows.filter(x=> Number(x.qty_counted) < 0);
    if(negative.length) return res.status(400).json({error:'Jumlah fisik tidak boleh negatif. Perbaiki hasil hitung dulu (produk #'+negative[0].product_id+').'});
    let value = 0;
    const journalId = await withTx(async (c)=>{
      for(const it of items.rows){
        const variance = Number(it.variance)||0;
        const counted = Number(it.qty_counted)||0;
        value += variance * Number(it.unit_cost||0);
        // Semua baris stok (produk+gudang) dilebur jadi SATU baris = hasil hitung fisik.
        // Tanpa ini baris batch / baris kembar tertinggal, sehingga total stok gudang
        // tidak sama dengan angka yang diposting & dijurnal.
        // qty_available = GENERATED (qty_on_hand - qty_reserved): JANGAN di-update langsung.
        const cur = await c.query(`SELECT id, COALESCE(qty_reserved,0)::numeric AS reserved
            FROM stocks WHERE product_id=$1 AND warehouse_id=$2
           ORDER BY (batch_no IS NOT NULL), id`, [it.product_id, s.rows[0].warehouse_id]);
        const keep = cur.rows[0];
        if(keep){
          const reservedTotal = cur.rows.reduce((a,r)=> a + Number(r.reserved||0), 0);
          for(const extra of cur.rows.slice(1)) await c.query('DELETE FROM stocks WHERE id=$1', [extra.id]);
          await c.query(`UPDATE stocks SET qty_on_hand=$1, qty_reserved=LEAST($2::numeric,$1::numeric), last_updated=NOW() WHERE id=$3`,
            [counted, reservedTotal, keep.id]);
        } else {
          await c.query(`INSERT INTO stocks (product_id, warehouse_id, qty_on_hand, qty_reserved, avg_cost, last_updated)
            VALUES ($1,$2,$3,0,$4,NOW())`,
            [it.product_id, s.rows[0].warehouse_id, counted, Number(it.unit_cost||0)]);
        }
        await c.query(`INSERT INTO stock_movements (product_id, warehouse_id, movement_type, reference_type, reference_id, qty_in, qty_out, unit_cost, balance_qty, created_by)
          VALUES ($1,$2,'ADJ','OPNAME',$3,$4,$5,$6,$7,$8)`,
          [it.product_id, s.rows[0].warehouse_id, Number(req.params.id),
           variance>0? variance:0, variance<0? Math.abs(variance):0,
           Number(it.unit_cost||0), Number(it.qty_counted), req.user.id]);
      }
      if(Math.abs(value) > 0.5){
        const lines = value>0
          ? [{ code:'1-1200', debit:value, description:'Penambahan stok hasil opname' }, { code:'6-1100', credit:value, description:'Selisih opname' }]
          : [{ code:'6-1100', debit:Math.abs(value), description:'Selisih opname' }, { code:'1-1200', credit:Math.abs(value), description:'Pengurangan stok hasil opname' }];
        return await postJournal({ refType:'OPNAME', refId:Number(req.params.id), description:`Opname ${s.rows[0].session_number}`, lines, createdBy:req.user.id, client:c });
      }
      return null;
    });
    await pool.query(`UPDATE stock_opname_sessions SET status='POSTED', posted_at=NOW(), total_variance_value=$1, journal_id=$2 WHERE id=$3`,
      [value, journalId, req.params.id]);
    res.json({ ok:true, adjusted:items.rowCount, variance_value:value, journal_id:journalId });
  }catch(e){ console.error('[opname post]',e); res.status(500).json({error:e.message}); }
});

// POST /inventory/opname/sessions/:id/cancel
router.post('/sessions/:id/cancel', async (req,res)=>{
  await ensureOpnameTables();
  try{
    const s = await pool.query('SELECT * FROM stock_opname_sessions WHERE id=$1',[req.params.id]);
    if(!s.rows[0]) return res.status(404).json({error:'Sesi tidak ditemukan'});
    if(s.rows[0].status==='POSTED') return res.status(400).json({error:'Sesi sudah POSTED — tidak bisa dibatalkan'});
    await pool.query(`UPDATE stock_opname_sessions SET status='CANCELLED' WHERE id=$1`,[req.params.id]);
    res.json({ ok:true, status:'CANCELLED' });
  }catch(e){ res.status(500).json({error:e.message}); }
});

export default router;
