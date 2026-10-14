import express from 'express';
import { pool } from '../../config/db.js';
const router=express.Router();
router.get('/sales', async(req,res)=>{
  const r=await pool.query('SELECT sr.*, c.name as customer_name, i.invoice_number FROM sales_returns sr LEFT JOIN customers c ON c.id=sr.customer_id LEFT JOIN invoices i ON i.id=sr.invoice_id ORDER BY sr.id DESC LIMIT 50');
  res.json(r.rows);
});
router.get('/sales/:id', async(req,res)=>{
  const h=await pool.query('SELECT sr.*, c.name FROM sales_returns sr LEFT JOIN customers c ON c.id=sr.customer_id WHERE sr.id=$1',[req.params.id]);
  const items=await pool.query('SELECT sri.*, p.name FROM sales_return_items sri JOIN products p ON p.id=sri.product_id WHERE sri.return_id=$1',[req.params.id]);
  const claims=await pool.query("SELECT * FROM claims WHERE reference_type='SALES_RETURN' AND reference_id=$1",[req.params.id]);
  res.json({...h.rows[0], items:items.rows, claims:claims.rows});
});
router.post('/sales', async(req,res)=>{
  const {invoice_id,customer_id,reason,settlement_type,items,notes}=req.body;
  if(!items?.length) return res.status(400).json({error:'items required'});
  const num='RS-'+Date.now().toString().slice(-6);
  let total=0; for(const it of items) total+= parseFloat(it.qty)*parseFloat(it.unit_price||0);
  const ins=await pool.query('INSERT INTO sales_returns (return_number,invoice_id,customer_id,reason,settlement_type,total,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',[num,invoice_id,customer_id,reason||'OTHER',settlement_type||'CREDIT_NOTE',total,req.user.id]);
  const rid=ins.rows[0].id;
  for(const it of items){
    await pool.query('INSERT INTO sales_return_items (return_id,product_id,qty,unit_price,total,condition) VALUES ($1,$2,$3,$4,$5,$6)',[rid,it.product_id,it.qty,it.unit_price||0,parseFloat(it.qty)*parseFloat(it.unit_price||0),it.condition||'QUARANTINE']);
    // masuk karantina, tambah stok karantina (warehouse transit)
    await pool.query('INSERT INTO stocks (product_id,warehouse_id,qty_on_hand) VALUES ($1,2,$2) ON CONFLICT (product_id,warehouse_id,batch_no) DO UPDATE SET qty_on_hand = stocks.qty_on_hand + EXCLUDED.qty_on_hand',[it.product_id,it.qty]);
    await pool.query("INSERT INTO stock_movements (product_id,warehouse_id,movement_type,reference_type,reference_id,qty_in,created_by) VALUES ($1,2,'IN','SALES_RETURN',$2,$3,$4)",[it.product_id,rid,it.qty,req.user.id]);
  }
  // jika CREDIT_NOTE, kurangi piutang
  if(settlement_type==='CREDIT_NOTE' && invoice_id){
    await pool.query('UPDATE invoices SET total = total - $1 WHERE id=$2',[total,invoice_id]);
    await pool.query("INSERT INTO journal_entries (entry_number,entry_date,description,total_debit,total_credit,posted) VALUES ($1,CURRENT_DATE,$2,$3,$3,true)",['JE-RS-'+rid,'Retur '+num,total]);
  }
  await pool.query('INSERT INTO audit_logs (user_id,action,entity_type,entity_id,new_value) VALUES ($1,\'CREATE\',\'SALES_RETURN\',$2,$3)',[req.user.id,rid,JSON.stringify({num,reason})]);
  res.json({id:rid, return_number:num, total});
});
router.post('/sales/:id/approve', async(req,res)=>{
  await pool.query("UPDATE sales_returns SET status='APPROVED' WHERE id=$1",[req.params.id]);
  res.json({ok:true});
});
router.get('/purchase', async(req,res)=>{
  const r=await pool.query('SELECT pr.*, s.name as supplier_name FROM purchase_returns pr LEFT JOIN suppliers s ON s.id=pr.supplier_id ORDER BY pr.id DESC LIMIT 50');
  res.json(r.rows);
});
router.post('/purchase', async(req,res)=>{
  const {po_id,supplier_id,reason,items}=req.body;
  const num='RP-'+Date.now().toString().slice(-6);
  let total=0; for(const it of items) total+= parseFloat(it.qty)*50000;
  await pool.query('INSERT INTO purchase_returns (return_number,po_id,supplier_id,reason,total) VALUES ($1,$2,$3,$4,$5)',[num,po_id,supplier_id,reason||'OTHER',total]);
  res.json({ok:true, return_number:num});
});
router.get('/claims', async(req,res)=>{
  const r=await pool.query('SELECT * FROM claims ORDER BY id DESC LIMIT 50');
  res.json(r.rows);
});
router.post('/claims', async(req,res)=>{
  const {claim_type,reference_type,reference_id,amount_claimed,notes}=req.body;
  const num='CLM-'+Date.now().toString().slice(-6);
  const ins=await pool.query('INSERT INTO claims (claim_number,claim_type,reference_type,reference_id,amount_claimed,notes,status) VALUES ($1,$2,$3,$4,$5,$6,\'SUBMITTED\') RETURNING id',[num,claim_type||'SUPPLIER',reference_type,reference_id,amount_claimed||0,notes]);
  res.json({id:ins.rows[0].id, claim_number:num});
});
router.post('/claims/:id/settle', async(req,res)=>{
  const {amount_settled,status}=req.body;
  await pool.query('UPDATE claims SET amount_settled=$1, status=$2, settled_date=CURRENT_DATE WHERE id=$3',[amount_settled,status||'PAID',req.params.id]);
  res.json({ok:true});
});
router.post('/claims/:id/attach', async(req,res)=>{
  await pool.query('INSERT INTO claim_attachments (claim_id,file_url,file_type,description) VALUES ($1,$2,$3,$4)',[req.params.id,req.body.file_url,req.body.file_type,req.body.description]);
  res.json({ok:true});
});
export default router;
