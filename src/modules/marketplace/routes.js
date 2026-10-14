import express from 'express';
import { pool } from '../../config/db.js';
const router=express.Router();
router.get('/channels', async(req,res)=>{
  const r=await pool.query('SELECT * FROM marketplace_channels ORDER BY name');
  res.json(r.rows);
});
router.post('/channels', async(req,res)=>{
  const {name,store_id,api_key}=req.body;
  await pool.query('INSERT INTO marketplace_channels (name,store_id,api_key) VALUES ($1,$2,$3)',[name,store_id,api_key]);
  res.json({ok:true});
});
router.get('/orders', async(req,res)=>{
  const r=await pool.query('SELECT mo.*, mc.name as channel_name FROM marketplace_orders mo LEFT JOIN marketplace_channels mc ON mc.id=mo.channel_id ORDER BY mo.id DESC LIMIT 50');
  res.json(r.rows);
});
router.post('/sync', async(req,res)=>{
  const {channel_id}=req.body;
  // mock sync: create 2 fake orders
  const ch=await pool.query('SELECT * FROM marketplace_channels WHERE id=$1',[channel_id]);
  if(!ch.rows[0]) return res.status(404).json({error:'Channel not found'});
  for(let i=0;i<2;i++){
    const ext='EXT-'+channel_id+'-'+Date.now()+i;
    await pool.query('INSERT INTO marketplace_orders (channel_id,external_order_id,buyer_name,buyer_phone,shipping_address,total,status) VALUES ($1,$2,$3,$4,$5,$6,\'PENDING\') ON CONFLICT DO NOTHING',[channel_id,ext,'Buyer '+i,'0812'+Math.floor(Math.random()*1e7),'Alamat '+i, Math.floor(Math.random()*500000)+50000]);
  }
  await pool.query('UPDATE marketplace_channels SET last_sync=NOW() WHERE id=$1',[channel_id]);
  res.json({ok:true, synced:2});
});
router.post('/orders/:id/convert', async(req,res)=>{
  const mo=await pool.query('SELECT * FROM marketplace_orders WHERE id=$1',[req.params.id]);
  if(!mo.rows[0]) return res.status(404).json({error:'Not found'});
  const soNum='SO-MP-'+Date.now();
  const ins=await pool.query("INSERT INTO sales_orders (so_number,customer_id,branch_id,so_date,status,subtotal,tax,total,notes,created_by) VALUES ($1,4,1,CURRENT_DATE,'APPROVED',$2,$3,$4,$5,$6) RETURNING id",[soNum, mo.rows[0].total, mo.rows[0].total*0.11, mo.rows[0].total*1.11, 'Marketplace '+mo.rows[0].external_order_id, req.user.id]);
  await pool.query('UPDATE marketplace_orders SET so_id=$1, status=\'CONVERTED\' WHERE id=$2',[ins.rows[0].id, req.params.id]);
  res.json({ok:true, so_id:ins.rows[0].id, so_number:soNum});
});
export default router;
