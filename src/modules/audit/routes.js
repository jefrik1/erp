import express from 'express';
import { pool } from '../../config/db.js';
const router=express.Router();
router.get('/logs', async(req,res)=>{
  const limit=Math.min(100, parseInt(req.query.limit||'50'));
  const entity=req.query.entity_type;
  let where=''; const p=[];
  if(entity){ p.push(entity); where='WHERE entity_type=$1'; }
  const r=await pool.query('SELECT al.*, u.username FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id '+where+' ORDER BY al.id DESC LIMIT $'+(p.length+1), [...p,limit]);
  res.json(r.rows);
});
router.get('/data-changes', async(req,res)=>{
  const table=req.query.table_name;
  let where=''; const p=[];
  if(table){ p.push(table); where='WHERE table_name=$1'; }
  const r=await pool.query('SELECT dcl.*, u.username as changed_by_name FROM data_change_logs dcl LEFT JOIN users u ON u.id=dcl.changed_by '+where+' ORDER BY dcl.id DESC LIMIT 50',p);
  res.json(r.rows);
});
router.get('/fraud', async(req,res)=>{
  // basic patterns
  const bigDiscount=await pool.query("SELECT so.so_number, so.discount, so.total, u.username FROM sales_orders so LEFT JOIN users u ON u.id=so.created_by WHERE so.discount/so.total > 0.2 LIMIT 10");
  const nightTx=await pool.query("SELECT * FROM sales_orders WHERE EXTRACT(HOUR FROM created_at) BETWEEN 0 AND 5 LIMIT 10");
  const bigQty=await pool.query('SELECT sd.*, p.name FROM so_details sd JOIN products p ON p.id=sd.product_id WHERE sd.qty > 1000 LIMIT 10');
  res.json({big_discount:bigDiscount.rows, night_transactions:nightTx.rows, big_qty:bigQty.rows, alerts: (bigDiscount.rows.length?1:0)+(nightTx.rows.length?1:0)+(bigQty.rows.length?1:0)});
});
router.get('/segregation', async(req,res)=>{
  // who created and approved same doc
  const r=await pool.query("SELECT 'SO' as type, so_number as doc, created_by, approved_by FROM sales_orders WHERE created_by=approved_by AND approved_by IS NOT NULL UNION ALL SELECT 'PO', po_number, created_by, approved_by FROM purchase_orders WHERE created_by=approved_by AND approved_by IS NOT NULL LIMIT 20");
  res.json(r.rows);
});
export default router;
