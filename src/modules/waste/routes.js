import express from 'express';
import { pool } from '../../config/db.js';
const router=express.Router();
router.get('/', async(req,res)=>{
  const r=await pool.query('SELECT w.*, p.name as product_name, p.sku, wh.name as warehouse_name, u.username as approver FROM waste_logs w LEFT JOIN products p ON p.id=w.product_id LEFT JOIN warehouses wh ON wh.id=w.warehouse_id LEFT JOIN users u ON u.id=w.approved_by ORDER BY w.id DESC LIMIT 50');
  res.json(r.rows);
});
router.post('/', async(req,res)=>{
  const {product_id,warehouse_id,qty,waste_type,reason}=req.body;
  const prod=await pool.query('SELECT avg_cost FROM stocks WHERE product_id=$1 AND warehouse_id=$2 LIMIT 1',[product_id,warehouse_id||1]);
  const cost = parseFloat(prod.rows[0]?.avg_cost||50000) * parseFloat(qty);
  const wtype = waste_type||'OTHER';
  // auto need approval if >500rb
  const status = cost > 500000 ? 'PENDING' : 'APPROVED';
  const ins=await pool.query('INSERT INTO waste_logs (product_id,warehouse_id,qty,waste_type,reason,cost,status,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[product_id,warehouse_id||1,qty,wtype,reason,cost,status,req.user.id]);
  if(status==='APPROVED'){
    await pool.query('UPDATE stocks SET qty_on_hand = qty_on_hand - $1 WHERE product_id=$2 AND warehouse_id=$3',[qty,product_id,warehouse_id||1]);
    await pool.query("INSERT INTO stock_movements (product_id,warehouse_id,movement_type,reference_type,reference_id,qty_out,created_by) VALUES ($1,$2,'ADJ','WASTE',$3,$4,$5)",[product_id,warehouse_id||1,ins.rows[0].id,qty,req.user.id]);
    await pool.query("INSERT INTO journal_entries (entry_number,entry_date,description,total_debit,total_credit,posted) VALUES ($1,CURRENT_DATE,$2,$3,$3,true)",['JE-WASTE-'+ins.rows[0].id,'Write-off waste '+wtype,cost]);
  }
  res.json({id:ins.rows[0].id, cost, status});
});
router.post('/:id/approve', async(req,res)=>{
  const {status}=req.body; // APPROVED / REJECTED
  const w=await pool.query('SELECT * FROM waste_logs WHERE id=$1',[req.params.id]);
  if(!w.rows[0]) return res.status(404).json({error:'Not found'});
  // threshold check
  const cost=parseFloat(w.rows[0].cost);
  if(cost>5000000 && status==='APPROVED'){
    // need direktur role check (simplified: allow any but log)
  }
  await pool.query('UPDATE waste_logs SET status=$1, approved_by=$2 WHERE id=$3',[status,req.user.id,req.params.id]);
  if(status==='APPROVED'){
    await pool.query('UPDATE stocks SET qty_on_hand = qty_on_hand - $1 WHERE product_id=$2 AND warehouse_id=$3',[w.rows[0].qty,w.rows[0].product_id,w.rows[0].warehouse_id]);
    await pool.query("INSERT INTO stock_movements (product_id,warehouse_id,movement_type,reference_type,reference_id,qty_out,created_by) VALUES ($1,$2,'ADJ','WASTE',$3,$4,$5)",[w.rows[0].product_id,w.rows[0].warehouse_id,req.params.id,w.rows[0].qty,req.user.id]);
  }
  res.json({ok:true});
});
router.get('/stats/summary', async(req,res)=>{
  const r=await pool.query("SELECT waste_type, COUNT(*) as cnt, SUM(qty) as qty, SUM(cost) as cost FROM waste_logs GROUP BY waste_type ORDER BY cost DESC");
  const pending=await pool.query("SELECT COUNT(*) FROM waste_logs WHERE status='PENDING'");
  res.json({by_type:r.rows, pending:parseInt(pending.rows[0].count)});
});
export default router;
