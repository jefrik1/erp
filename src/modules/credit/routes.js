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
  const id=parseInt(req.params.id,10); const st=String(req.body.status||'').toUpperCase();
  if(!['FULFILLED','BROKEN','PENDING'].includes(st)) return res.status(400).json({error:'status FULFILLED/BROKEN/PENDING'});
  const cur=await pool.query('SELECT * FROM promise_to_pay WHERE id=$1',[id]);
  if(!cur.rows[0]) return res.status(404).json({error:'Janji tidak ditemukan'});
  await pool.query('UPDATE promise_to_pay SET status=$1 WHERE id=$2',[st, id]);
  // FULFILLED: tetap history di promise_to_pay (tidak pindah tabel). Jika janji terikat invoice, auto lunasi invoice linked (AR) biar outstanding turun.
  if(st==='FULFILLED' && cur.rows[0].invoice_id){
    const inv=await pool.query('SELECT id, total, paid_amount, status FROM invoices WHERE id=$1',[cur.rows[0].invoice_id]);
    if(inv.rows[0] && String(inv.rows[0].status).toUpperCase()!=='PAID'){
      const remain=parseFloat(inv.rows[0].total||0)-parseFloat(inv.rows[0].paid_amount||0);
      const payAmt=Math.min(remain, parseFloat(cur.rows[0].amount||remain));
      if(payAmt>0.5){
        const payNo='PAY-PTP-'+Date.now();
        await pool.query("INSERT INTO payments (payment_number, type, invoice_id, payment_date, method, amount, created_by) VALUES ($1,'AR',$2,CURRENT_DATE,'TRANSFER',$3,$4)",[payNo, cur.rows[0].invoice_id, payAmt, req.user.id]);
        await pool.query("UPDATE invoices SET paid_amount = paid_amount + $1, status = CASE WHEN paid_amount + $1 >= total - 0.5 THEN 'PAID' ELSE 'PARTIAL' END WHERE id=$2",[payAmt, cur.rows[0].invoice_id]);
      }
    }
  }
  // BROKEN: tetap history, jadi dasar HOLD / dunning level naik (tidak auto HOLD, Finance putuskan manual biar tidak salah blokir)
  res.json({ok:true, note: st==='FULFILLED' ? 'Status jadi FULFILLED (history tetap di promise_to_pay); jika terikat invoice, invoice ter-bayar otomatis.' : st==='BROKEN' ? 'BROKEN - history tetap, gunakan sebagai alasan HOLD/dunning.' : 'updated'});
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
