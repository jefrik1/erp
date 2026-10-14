import express from 'express';
import { pool } from '../../config/db.js';
const router=express.Router();
router.get('/tiers', async(req,res)=>{ const r=await pool.query('SELECT * FROM customer_tiers ORDER BY min_spend'); res.json(r.rows); });
router.post('/tiers', async(req,res)=>{
  const {name,min_spend,discount_pct,benefits}=req.body;
  await pool.query('INSERT INTO customer_tiers (name,min_spend,discount_pct,benefits) VALUES ($1,$2,$3,$4)',[name,min_spend,discount_pct,benefits||'{}']);
  res.json({ok:true});
});
router.get('/points', async(req,res)=>{
  const cid=req.query.customer_id;
  if(cid){
    const r=await pool.query('SELECT lp.*, c.name as customer_name FROM loyalty_points lp JOIN customers c ON c.id=lp.customer_id WHERE lp.customer_id=$1',[cid]);
    const tx=await pool.query('SELECT * FROM loyalty_transactions WHERE customer_id=$1 ORDER BY transaction_date DESC LIMIT 20',[cid]);
    res.json({points:r.rows[0]||null, transactions:tx.rows});
  } else {
    const r=await pool.query('SELECT lp.*, c.name FROM loyalty_points lp JOIN customers c ON c.id=lp.customer_id ORDER BY lp.points_balance DESC');
    res.json(r.rows);
  }
});
router.post('/earn', async(req,res)=>{
  const {customer_id,points,reference_type,reference_id,description}=req.body;
  await pool.query('INSERT INTO loyalty_transactions (customer_id,transaction_type,points,reference_type,reference_id,description) VALUES ($1,\'EARN\',$2,$3,$4,$5)',[customer_id,points,reference_type,reference_id,description]);
  await pool.query('INSERT INTO loyalty_points (customer_id,points_balance,lifetime_points) VALUES ($1,$2,$2) ON CONFLICT (customer_id) DO UPDATE SET points_balance = loyalty_points.points_balance + $2, lifetime_points = loyalty_points.lifetime_points + $2',[customer_id,points]);
  res.json({ok:true});
});
router.post('/redeem', async(req,res)=>{
  const {customer_id,points,description}=req.body;
  const bal=await pool.query('SELECT points_balance FROM loyalty_points WHERE customer_id=$1',[customer_id]);
  if(!bal.rows[0]|| parseInt(bal.rows[0].points_balance) < points) return res.status(400).json({error:'Poin tidak cukup'});
  await pool.query('INSERT INTO loyalty_transactions (customer_id,transaction_type,points,description) VALUES ($1,\'REDEEM\',$2,$3)',[customer_id,-points,description||'Redeem']);
  await pool.query('UPDATE loyalty_points SET points_balance = points_balance - $1 WHERE customer_id=$2',[points,customer_id]);
  res.json({ok:true});
});
router.get('/transactions', async(req,res)=>{
  const r=await pool.query('SELECT lt.*, c.name FROM loyalty_transactions lt JOIN customers c ON c.id=lt.customer_id ORDER BY lt.id DESC LIMIT 50');
  res.json(r.rows);
});
export default router;
