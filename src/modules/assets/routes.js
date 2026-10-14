import express from 'express';
import { pool } from '../../config/db.js';
const router=express.Router();
router.get('/', async(req,res)=>{
  const r=await pool.query('SELECT * FROM fixed_assets ORDER BY asset_code');
  // calculate book value on fly if not set
  res.json(r.rows);
});
router.post('/', async(req,res)=>{
  const {asset_code,name,category,acquisition_date,acquisition_cost,useful_life_years,depreciation_method,location}=req.body;
  const book=parseFloat(acquisition_cost);
  await pool.query('INSERT INTO fixed_assets (asset_code,name,category,acquisition_date,acquisition_cost,useful_life_years,depreciation_method,book_value,location) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',[asset_code,name,category,acquisition_date,acquisition_cost,useful_life_years||5,depreciation_method||'STRAIGHT',book,location]);
  res.json({ok:true});
});
router.get('/:id/depreciation', async(req,res)=>{
  const a=await pool.query('SELECT * FROM fixed_assets WHERE id=$1',[req.params.id]);
  if(!a.rows[0]) return res.status(404).json({error:'Not found'});
  const asset=a.rows[0];
  const life=asset.useful_life_years||5;
  const cost=parseFloat(asset.acquisition_cost);
  const years=[]; let accum=0;
  for(let y=1;y<=life;y++){
    let dep;
    if(asset.depreciation_method==='STRAIGHT') dep=cost/life;
    else { // double declining approximate
      const rate=2/life; dep = (cost - accum)*rate; if(y===life) dep=cost-accum;
    }
    accum+=dep;
    years.push({year:y, depreciation:dep, accumulated:accum, book_value:cost-accum});
  }
  res.json({asset, schedule:years, monthly: cost/life/12});
});
router.post('/:id/maintenance', async(req,res)=>{
  const {maintenance_date,type,cost,description}=req.body;
  await pool.query('INSERT INTO asset_maintenance (asset_id,maintenance_date,type,cost,description) VALUES ($1,$2,$3,$4,$5)',[req.params.id,maintenance_date,type||'PREVENTIVE',cost,description]);
  res.json({ok:true});
});
router.post('/:id/dispose', async(req,res)=>{
  const {price, disposal_date}=req.body;
  const a=await pool.query('SELECT * FROM fixed_assets WHERE id=$1',[req.params.id]);
  const book=parseFloat(a.rows[0].book_value || a.rows[0].acquisition_cost);
  const gain=parseFloat(price)-book;
  await pool.query("UPDATE fixed_assets SET status='DISPOSED' WHERE id=$1",[req.params.id]);
  await pool.query("INSERT INTO journal_entries (entry_number,entry_date,description,total_debit,total_credit,posted) VALUES ($1,$2,$3,$4,$4,true)",['JE-DISP-'+req.params.id, disposal_date||new Date().toISOString().slice(0,10),'Disposal '+a.rows[0].asset_code, Math.abs(gain)]);
  res.json({ok:true, gain});
});
export default router;
