import express from 'express';
import { pool } from '../../config/db.js';
import { paginate } from '../../utils/helpers.js';
const router = express.Router();
router.get('/stocks', async (req,res)=>{
  const {limit,offset}=paginate(req);
  const wh=req.query.warehouse_id;
  const search=req.query.search||'';
  let where='WHERE 1=1'; const p=[];
  if(wh){ p.push(wh); where+=' AND s.warehouse_id=$'+p.length; }
  if(search){ p.push('%'+search+'%'); where+=' AND p.name ILIKE $'+p.length; }
  const cnt=await pool.query('SELECT COUNT(*) FROM stocks s JOIN products p ON p.id=s.product_id '+where,p);
  const data=await pool.query('SELECT s.*, p.name as product_name, p.sku, p.reorder_point, p.min_stock, w.name as warehouse_name, w.code as warehouse_code FROM stocks s JOIN products p ON p.id=s.product_id JOIN warehouses w ON w.id=s.warehouse_id '+where+' ORDER BY s.qty_available ASC LIMIT $'+(p.length+1)+' OFFSET $'+(p.length+2), [...p,limit,offset]);
  res.json({data:data.rows, total:parseInt(cnt.rows[0].count)});
});
router.get('/movements', async (req,res)=>{
  const {limit,offset}=paginate(req);
  const pid=req.query.product_id;
  let where='WHERE 1=1'; const p=[];
  if(pid){ p.push(pid); where+=' AND m.product_id=$'+p.length; }
  const cnt=await pool.query('SELECT COUNT(*) FROM stock_movements m '+where,p);
  const data=await pool.query('SELECT m.*, p.name as product_name, p.sku, w.name as warehouse_name FROM stock_movements m JOIN products p ON p.id=m.product_id LEFT JOIN warehouses w ON w.id=m.warehouse_id '+where+' ORDER BY m.movement_date DESC LIMIT $'+(p.length+1)+' OFFSET $'+(p.length+2), [...p,limit,offset]);
  res.json({data:data.rows, total:parseInt(cnt.rows[0].count)});
});
router.get('/opname', async (req,res)=>{
  const r=await pool.query('SELECT s.*, p.name, p.sku, w.name as wh FROM stocks s JOIN products p ON p.id=s.product_id JOIN warehouses w ON w.id=s.warehouse_id WHERE s.qty_available <= p.reorder_point ORDER BY s.qty_available ASC LIMIT 20');
  res.json(r.rows);
});
router.post('/adjustment', async (req,res)=>{
  const {product_id, warehouse_id, qty_adjust, reason} = req.body;
  await pool.query('UPDATE stocks SET qty_on_hand = qty_on_hand + $1 WHERE product_id=$2 AND warehouse_id=$3',[qty_adjust, product_id, warehouse_id]);
  await pool.query("INSERT INTO stock_movements (product_id, warehouse_id, movement_type, reference_type, qty_in, qty_out, balance_qty, created_by) VALUES ($1,$2,'ADJ','ADJUSTMENT',$3,$4,0,$5)",[product_id, warehouse_id, qty_adjust>0?qty_adjust:0, qty_adjust<0?Math.abs(qty_adjust):0, req.user.id]);
  await pool.query('INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value) VALUES ($1,\'UPDATE\',\'STOCK_ADJUST\',$2,$3)',[req.user.id, product_id, JSON.stringify({qty_adjust, reason})]);
  res.json({ok:true});
});
router.get('/transfers', async (req,res)=>{
  const r=await pool.query('SELECT t.*, wf.name as from_name, wt.name as to_name FROM stock_transfers t LEFT JOIN warehouses wf ON wf.id=t.from_warehouse_id LEFT JOIN warehouses wt ON wt.id=t.to_warehouse_id ORDER BY t.id DESC LIMIT 50');
  res.json(r.rows);
});
router.post('/transfers', async (req,res)=>{
  const {from_warehouse_id, to_warehouse_id, items} = req.body;
  const tn='TRF-'+Date.now();
  const ins=await pool.query("INSERT INTO stock_transfers (transfer_number, from_warehouse_id, to_warehouse_id, transfer_date, status) VALUES ($1,$2,$3,CURRENT_DATE,'IN_TRANSIT') RETURNING id",[tn, from_warehouse_id, to_warehouse_id]);
  const tid=ins.rows[0].id;
  for(const it of items){
    await pool.query('INSERT INTO stock_transfer_details (transfer_id, product_id, qty) VALUES ($1,$2,$3)',[tid, it.product_id, it.qty]);
    await pool.query('UPDATE stocks SET qty_on_hand = qty_on_hand - $1 WHERE product_id=$2 AND warehouse_id=$3',[it.qty, it.product_id, from_warehouse_id]);
    await pool.query('INSERT INTO stocks (product_id, warehouse_id, qty_on_hand) VALUES ($1,$2,$3) ON CONFLICT (product_id, warehouse_id, batch_no) DO UPDATE SET qty_on_hand = stocks.qty_on_hand + EXCLUDED.qty_on_hand',[it.product_id, to_warehouse_id, it.qty]);
    await pool.query("INSERT INTO stock_movements (product_id, warehouse_id, movement_type, reference_type, reference_id, qty_out, created_by) VALUES ($1,$2,'TRF','TRANSFER',$3,$4,$5)",[it.product_id, from_warehouse_id, tid, it.qty, req.user.id]);
  }
  res.json({id:tid, transfer_number: tn});
});
router.post('/transfers/:id/receive', async (req,res)=>{
  await pool.query("UPDATE stock_transfers SET status='RECEIVED' WHERE id=$1",[req.params.id]);
  res.json({ok:true});
});
export default router;
