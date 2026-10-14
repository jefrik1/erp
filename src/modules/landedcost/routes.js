import express from 'express';
import { pool } from '../../config/db.js';
const router=express.Router();
router.get('/', async(req,res)=>{
  const r=await pool.query('SELECT lc.*, po.po_number FROM landed_costs lc LEFT JOIN purchase_orders po ON po.id=lc.po_id ORDER BY lc.id DESC LIMIT 50');
  res.json(r.rows);
});
router.get('/:id', async(req,res)=>{
  const h=await pool.query('SELECT lc.*, po.po_number FROM landed_costs lc LEFT JOIN purchase_orders po ON po.id=lc.po_id WHERE lc.id=$1',[req.params.id]);
  if(!h.rows[0]) return res.status(404).json({error:'Not found'});
  const details=await pool.query('SELECT * FROM landed_cost_details WHERE landed_cost_id=$1',[req.params.id]);
  const grnItems= h.rows[0].grn_id ? await pool.query('SELECT gd.*, p.name FROM grn_details gd JOIN products p ON p.id=gd.product_id WHERE gd.grn_id=$1',[h.rows[0].grn_id]) : {rows:[]};
  res.json({...h.rows[0], details:details.rows, grn_items:grnItems.rows});
});
router.post('/', async(req,res)=>{
  const {po_id,grn_id,container_no,bl_number,pib_number,allocation_method,details}=req.body;
  let total=0; if(details) for(const d of details) total+= parseFloat(d.amount_idr||d.amount||0);
  const ins=await pool.query('INSERT INTO landed_costs (po_id,grn_id,container_no,bl_number,pib_number,total_cost,allocation_method) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',[po_id,grn_id,container_no,bl_number,pib_number,total,allocation_method||'VALUE']);
  const lcId=ins.rows[0].id;
  if(details) for(const d of details){
    const amtIdr = parseFloat(d.amount_idr|| (parseFloat(d.amount)*(parseFloat(d.exchange_rate||1))));
    await pool.query('INSERT INTO landed_cost_details (landed_cost_id,cost_type,description,amount,currency,exchange_rate,amount_idr) VALUES ($1,$2,$3,$4,$5,$6,$7)',[lcId,d.cost_type||'OTHER',d.description,d.amount,d.currency||'IDR',d.exchange_rate||1,amtIdr]);
  }
  res.json({id:lcId, total_cost:total});
});
router.post('/:id/calculate', async(req,res)=>{
  const lc=await pool.query('SELECT * FROM landed_costs WHERE id=$1',[req.params.id]);
  if(!lc.rows[0]) return res.status(404).json({error:'Not found'});
  const details=await pool.query('SELECT * FROM landed_cost_details WHERE landed_cost_id=$1',[req.params.id]);
  const totalCost= details.rows.reduce((a,b)=> a+parseFloat(b.amount_idr),0);
  // get PO details for allocation
  const poDetails=await pool.query('SELECT * FROM po_details WHERE po_id=$1',[lc.rows[0].po_id]);
  let totalBase=0;
  if(lc.rows[0].allocation_method==='VALUE') totalBase=poDetails.rows.reduce((a,b)=> a+parseFloat(b.total),0);
  else if(lc.rows[0].allocation_method==='WEIGHT') totalBase=poDetails.rows.reduce((a,b)=> a+parseFloat(b.qty),0);
  else totalBase=poDetails.rows.length||1;
  const allocations=[];
  for(const pd of poDetails.rows){
    const base = lc.rows[0].allocation_method==='VALUE'? parseFloat(pd.total) : parseFloat(pd.qty);
    const share = totalBase? base/totalBase : 1/poDetails.rows.length;
    const extra = totalCost*share;
    const perUnit = pd.qty? extra/parseFloat(pd.qty):0;
    allocations.push({product_id:pd.product_id, qty:pd.qty, base, share, extra, per_unit:perUnit});
    // update avg_cost for stocks (if exists)
    await pool.query('UPDATE stocks SET avg_cost = avg_cost + $1 WHERE product_id=$2',[perUnit,pd.product_id]);
  }
  await pool.query("UPDATE landed_costs SET total_cost=$1, status='CALCULATED' WHERE id=$2",[totalCost,req.params.id]);
  res.json({totalCost, allocations});
});
router.post('/:id/post', async(req,res)=>{
  await pool.query("UPDATE landed_costs SET status='POSTED' WHERE id=$1",[req.params.id]);
  const lc=await pool.query('SELECT total_cost FROM landed_costs WHERE id=$1',[req.params.id]);
  await pool.query("INSERT INTO journal_entries (entry_number,entry_date,description,total_debit,total_credit,posted) VALUES ($1,CURRENT_DATE,$2,$3,$3,true)",['JE-LC-'+req.params.id,'Landed cost posting', lc.rows[0].total_cost]);
  res.json({ok:true});
});
export default router;
