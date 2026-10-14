import express from 'express';
import { pool } from '../../config/db.js';
const router=express.Router();
router.get('/holds', async(req,res)=>{
  const r=await pool.query('SELECT * FROM customers WHERE is_hold=true');
  res.json(r.rows);
});
router.post('/hold', async(req,res)=>{
  const {customer_id,reason}=req.body;
  await pool.query('UPDATE customers SET is_hold=true, hold_reason=$1 WHERE id=$2',[reason,customer_id]);
  await pool.query('INSERT INTO data_change_logs (table_name,record_id,field_name,old_value,new_value,changed_by,reason) VALUES (\'customers\',$1,\'is_hold\',\'false\',\'true\',$2,$3)',[customer_id,req.user.id,reason]);
  res.json({ok:true});
});
router.post('/unhold', async(req,res)=>{
  const {customer_id}=req.body;
  // only direktur can unhold - check role
  if(!req.user.roles.includes('direktur')) return res.status(403).json({error:'Hanya Direktur bisa buka blokir'});
  await pool.query('UPDATE customers SET is_hold=false, hold_reason=NULL WHERE id=$1',[customer_id]);
  res.json({ok:true});
});
router.get('/promises', async(req,res)=>{
  const r=await pool.query('SELECT ptp.*, c.name as customer_name, i.invoice_number FROM promise_to_pay ptp JOIN customers c ON c.id=ptp.customer_id LEFT JOIN invoices i ON i.id=ptp.invoice_id ORDER BY ptp.promise_date DESC LIMIT 50');
  res.json(r.rows);
});
router.post('/promises', async(req,res)=>{
  const {customer_id,invoice_id,promise_date,amount,notes}=req.body;
  await pool.query('INSERT INTO promise_to_pay (customer_id,invoice_id,promise_date,amount,notes,created_by) VALUES ($1,$2,$3,$4,$5,$6)',[customer_id,invoice_id,promise_date,amount,notes,req.user.id]);
  res.json({ok:true});
});
router.get('/dunning', async(req,res)=>{
  const r=await pool.query('SELECT dl.*, c.name as customer_name, i.invoice_number FROM dunning_letters dl JOIN customers c ON c.id=dl.customer_id LEFT JOIN invoices i ON i.id=dl.invoice_id ORDER BY dl.letter_date DESC LIMIT 50');
  res.json(r.rows);
});
router.post('/dunning', async(req,res)=>{
  const {customer_id,invoice_id,level,content,sent_via}=req.body;
  await pool.query('INSERT INTO dunning_letters (customer_id,invoice_id,level,content,sent_via) VALUES ($1,$2,$3,$4,$5)',[customer_id,invoice_id,level||1,content,sent_via||'WA']);
  res.json({ok:true});
});
router.get('/check/:customer_id', async(req,res)=>{
  const c=await pool.query('SELECT credit_limit, is_hold FROM customers WHERE id=$1',[req.params.customer_id]);
  if(!c.rows[0]) return res.status(404).json({error:'Not found'});
  const ar=await pool.query("SELECT COALESCE(SUM(COALESCE(total,0)-COALESCE(paid_amount,0)),0) as total FROM invoices WHERE customer_id=$1 AND UPPER(TRIM(status)) NOT IN ('PAID','CANCELLED','VOID','LUNAS') AND COALESCE(total,0)-COALESCE(paid_amount,0) > 0.5",[req.params.customer_id]);
  const outstanding=parseFloat(ar.rows[0].total||0);
  const limit=parseFloat(c.rows[0].credit_limit||0);
  const isHold=c.rows[0].is_hold;
  const usage = limit? (outstanding/limit*100).toFixed(1):0;
  res.json({credit_limit:limit, outstanding, usage_pct:usage, is_hold:isHold, blocked: isHold || outstanding > limit, warning: outstanding>limit? 'Melebihi limit kredit, butuh approval Finance Manager': isHold? 'Customer di-HOLD, hanya Direktur bisa buka':''});
});
router.patch('/promises/:id', async(req,res)=>{
  const id=parseInt(req.params.id,10); const {status}=req.body;
  if(!['FULFILLED','BROKEN','PENDING'].includes(String(status||'').toUpperCase())) return res.status(400).json({error:'status FULFILLED/BROKEN/PENDING'});
  await pool.query('UPDATE promise_to_pay SET status=$1 WHERE id=$2',[String(status).toUpperCase(), id]);
  res.json({ok:true});
});
router.post('/reminders/send', async(req,res)=>{
  const {invoice_number}=req.body;
  // mock kirim WA: catat dunning letter level 1
  if(invoice_number){
    const inv=await pool.query('SELECT id,customer_id FROM invoices WHERE invoice_number=$1',[invoice_number]);
    if(inv.rows[0]) await pool.query("INSERT INTO dunning_letters (customer_id,invoice_id,level,content,sent_via) VALUES ($1,$2,1,$3,'WA')",[inv.rows[0].customer_id, inv.rows[0].id, 'WA Reminder '+invoice_number]);
  }
  res.json({ok:true, message:'WA terkirim (mock)'});
});
router.get('/reminders', async(req,res)=>{
  try{
    const r=await pool.query("SELECT i.invoice_number, i.id as invoice_id, c.name as customer_name, c.phone, i.due_date, (COALESCE(i.total,0)-COALESCE(i.paid_amount,0)) as outstanding, (CURRENT_DATE - i.due_date)::int as diff FROM invoices i JOIN customers c ON c.id=i.customer_id WHERE UPPER(TRIM(i.status)) NOT IN ('PAID','CANCELLED','VOID','LUNAS') AND (ABS((CURRENT_DATE - i.due_date)::int) IN (7,3,1,0) OR i.due_date = CURRENT_DATE + INTERVAL '7 days') LIMIT 20");
    res.json(r.rows.map(x=>({...x, channel:'WA', template: (x.diff||0)<=0? 'Reminder H-'+Math.abs(x.diff||0): 'Overdue H+'+x.diff})));
  }catch(e){ console.error('reminders',e.message); res.json([]); }
});
export default router;
