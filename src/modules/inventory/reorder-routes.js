import express from 'express';
import { pool } from '../../config/db.js';

const router = express.Router();

/* ─────────────────────────────────────────────────────────────────────────────
   REORDER OTOMATIS
   Produk yang stok tersedianya <= reorder_point dibuatkan Purchase Request
   otomatis (tidak dobel bila sudah ada PR terbuka untuk produk itu).
   ───────────────────────────────────────────────────────────────────────────── */

async function criticalProducts(){
  const r = await pool.query(`
    SELECT p.id, p.sku, p.name, COALESCE(p.reorder_point,0) AS reorder_point,
           COALESCE(p.max_stock,0) AS max_stock, COALESCE(p.min_stock,0) AS min_stock,
           COALESCE(SUM(s.qty_available),0)::numeric AS qty_available
      FROM products p LEFT JOIN stocks s ON s.product_id=p.id
     WHERE COALESCE(p.is_active,true)=true AND COALESCE(p.reorder_point,0) > 0
     GROUP BY p.id
    HAVING COALESCE(SUM(s.qty_available),0) <= COALESCE(p.reorder_point,0)
     ORDER BY qty_available ASC, p.name`);
  return r.rows;
}

async function openPrProductIds(){
  const r = await pool.query(`SELECT DISTINCT product_id FROM purchase_requests
    WHERE product_id IS NOT NULL AND UPPER(COALESCE(status,'DRAFT')) NOT IN ('CANCELLED','REJECTED','COMPLETED','CLOSED')`);
  return new Set(r.rows.map(x=>x.product_id));
}

function suggestQty(p){
  // Stok negatif = data lama yang perlu diopname; jangan sampai usulan PR membengkak.
  const avail = Math.max(0, Number(p.qty_available)||0);
  const max = Number(p.max_stock)||0;
  const rop = Number(p.reorder_point)||0;
  const target = max > rop ? max : rop*2;
  const qty = Math.max(rop, target - avail);
  return Math.ceil(qty);
}

// GET /inventory/reorder/suggestions
router.get('/suggestions', async (req,res)=>{
  try{
    const items = await criticalProducts();
    const open = await openPrProductIds();
    res.json(items.map(p=>({
      product_id:p.id, sku:p.sku, name:p.name,
      qty_available:Number(p.qty_available), reorder_point:Number(p.reorder_point),
      max_stock:Number(p.max_stock), suggest_qty:suggestQty(p),
      has_open_pr: open.has(p.id),
    })));
  }catch(e){ res.status(500).json({error:e.message}); }
});

// POST /inventory/reorder/run  { needed_days?:7 }
router.post('/run', async (req,res)=>{
  const days = Math.min(90, Math.max(1, parseInt(req.body?.needed_days||'7',10)||7));
  try{
    const items = await criticalProducts();
    if(!items.length) return res.json({ ok:true, created:0, skipped:0, message:'Tidak ada produk di bawah reorder point.' });
    const open = await openPrProductIds();
    const today = new Date(Date.now()+7*3600*1000);
    const needed = new Date(today.getTime()+days*86400000).toISOString().slice(0,10);
    const stamp = today.toISOString().slice(0,10).replace(/-/g,'');
    let created=0, skipped=0; const rows=[];
    for(const p of items){
      if(open.has(p.id)){ skipped++; continue; }
      const qty = suggestQty(p);
      const seq = await pool.query(`SELECT COUNT(*)::int n FROM purchase_requests WHERE pr_number LIKE $1`, ['PR-AUTO-'+stamp+'-%']);
      const prNumber = `PR-AUTO-${stamp}-${String(seq.rows[0].n+1).padStart(3,'0')}`;
      const ins = await pool.query(`INSERT INTO purchase_requests (pr_number, product_id, qty, needed_date, notes, status, created_by)
        VALUES ($1,$2,$3,$4,$5,'PENDING',$6) RETURNING id`,
        [prNumber, p.id, qty, needed, `Auto reorder: stok ${Number(p.qty_available)} <= ROP ${Number(p.reorder_point)}`, req.user.id]);
      rows.push({ id:ins.rows[0].id, pr_number:prNumber, product_id:p.id, name:p.name, qty });
      created++;
    }
    res.json({ ok:true, created, skipped, items:rows,
      message:`${created} Purchase Request dibuat${skipped? `, ${skipped} dilewati karena sudah ada PR terbuka`:''}.` });
  }catch(e){ console.error('[reorder]',e); res.status(500).json({error:e.message}); }
});

export default router;
