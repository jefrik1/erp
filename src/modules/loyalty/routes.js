import express from 'express';
import { pool } from '../../config/db.js';
import { sendReport } from '../../lib/exporters.js';
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

// ------------------------------------------------------------- GET /export
router.get('/export', async(req,res)=>{
  const format=String(req.query.format||'xlsx').toLowerCase();
  if(!['csv','xlsx','pdf'].includes(format)) return res.status(400).json({error:`Format tidak didukung: ${format}`});
  const dataset=String(req.query.dataset||'points');
  const num=(v)=>parseFloat(v||0)||0;
  try{
    if(dataset==='transactions'){
      const r=await pool.query('SELECT lt.*, c.name FROM loyalty_transactions lt LEFT JOIN customers c ON c.id=lt.customer_id ORDER BY lt.id DESC LIMIT 5000');
      const columns=[{label:'Tanggal'},{label:'Customer'},{label:'Tipe'},{label:'Poin',numeric:true,total:true},{label:'Referensi'},{label:'Keterangan'}];
      const rows=r.rows.map(t=>[String(t.transaction_date||'').slice(0,10), t.name||('-'), t.transaction_type,
        num(t.points), t.reference_type?`${t.reference_type} #${t.reference_id??'-'}`:'-', t.description||'-']);
      const totals=columns.map((c,i)=>c.total?rows.reduce((a,x)=>a+num(x[i]),0):'');
      return sendReport(res,{format,filename:'mutasi-poin-loyalty',
        payload:{title:'Mutasi Poin Loyalty',subtitle:`${rows.length} transaksi`,columns,rows,totals,sheetName:'Mutasi Poin'}});
    }
    if(dataset==='tiers'){
      const r=await pool.query('SELECT t.*, (SELECT COUNT(*)::int FROM customers c WHERE c.type IS NOT NULL) as dummy FROM customer_tiers t ORDER BY t.min_spend');
      const columns=[{label:'Tier'},{label:'Min Belanja',numeric:true},{label:'Diskon %',numeric:true},{label:'Benefit'}];
      const rows=r.rows.map(t=>[t.name, num(t.min_spend), num(t.discount_pct),
        Object.entries(t.benefits||{}).filter(([,v])=>v).map(([k])=>k.replace(/_/g,' ')).join(', ')||'-']);
      const totals=columns.map((c,i)=>c.total?rows.reduce((a,x)=>a+num(x[i]),0):'');
      return sendReport(res,{format,filename:'tier-loyalty',
        payload:{title:'Tier & Benefit Loyalty',subtitle:`${rows.length} tier`,columns,rows,totals,sheetName:'Tier'}});
    }
    const r=await pool.query(`SELECT lp.*, c.name, c.phone,
        (SELECT MAX(transaction_date) FROM loyalty_transactions lt WHERE lt.customer_id=lp.customer_id) as last_tx
      FROM loyalty_points lp JOIN customers c ON c.id=lp.customer_id ORDER BY lp.points_balance DESC LIMIT 5000`);
    const columns=[{label:'Customer'},{label:'Telepon'},{label:'Saldo Poin',numeric:true,total:true},
      {label:'Lifetime Poin',numeric:true,total:true},{label:'Terakhir Transaksi'}];
    const rows=r.rows.map(p=>[p.name, p.phone||'-', num(p.points_balance), num(p.lifetime_points),
      p.last_tx?String(p.last_tx).slice(0,10):'-']);
    const totals=columns.map((c,i)=>c.total?rows.reduce((a,x)=>a+num(x[i]),0):'');
    return sendReport(res,{format,filename:'saldo-poin-loyalty',
      payload:{title:'Saldo Poin Loyalty',subtitle:`${rows.length} member  |  Total poin beredar ${new Intl.NumberFormat('id-ID').format(totals[2]||0)}`,columns,rows,totals,sheetName:'Saldo Poin'}});
  }catch(e){
    console.error('loyalty export error',e);
    res.status(500).json({error:'Gagal membuat laporan: '+e.message});
  }
});
export default router;
