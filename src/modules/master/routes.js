import express from 'express';
import { pool } from '../../config/db.js';
import { paginate } from '../../utils/helpers.js';
const router = express.Router();

// products
router.get('/products', async (req,res)=>{
  const { limit, offset } = paginate(req);
  const search = req.query.search || '';
  const cat = req.query.category;
  let where='WHERE p.is_active=true';
  const params=[];
  if(search){ params.push('%'+search+'%'); where+=' AND (p.name ILIKE $'+params.length+' OR p.sku ILIKE $'+params.length+')'; }
  if(cat){ params.push(cat); where+=' AND p.category_id=$'+params.length; }
  const count = await pool.query('SELECT COUNT(*) FROM products p '+where, params);
  const data = await pool.query('SELECT p.*, c.name as category_name, u.code as unit_code, t.rate as tax_rate FROM products p LEFT JOIN product_categories c ON c.id=p.category_id LEFT JOIN units u ON u.id=p.base_unit_id LEFT JOIN taxes t ON t.id=p.tax_id '+where+' ORDER BY p.id DESC LIMIT $'+(params.length+1)+' OFFSET $'+(params.length+2), [...params, limit, offset]);
  // attach stock summary
  for(const row of data.rows){
    const st = await pool.query('SELECT COALESCE(SUM(qty_available),0) as available, COALESCE(SUM(qty_on_hand),0) as onhand FROM stocks WHERE product_id=$1',[row.id]);
    row.stock_available = parseFloat(st.rows[0].available);
    row.stock_onhand = parseFloat(st.rows[0].onhand);
  }
  res.json({ data: data.rows, total: parseInt(count.rows[0].count), page: Math.floor(offset/limit)+1 });
});
router.post('/products', async (req,res)=>{
  const {sku, barcode, name, category_id, base_unit_id, tax_id, min_stock, reorder_point, description} = req.body;
  const r=await pool.query('INSERT INTO products (sku, barcode, name, category_id, base_unit_id, tax_id, min_stock, reorder_point, description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id', [sku, barcode, name, category_id, base_unit_id, tax_id, min_stock, reorder_point, description]);
  res.json(r.rows[0]);
});
router.get('/products/:id', async (req,res)=>{
  const r=await pool.query('SELECT p.*, c.name as category_name FROM products p LEFT JOIN product_categories c ON c.id=p.category_id WHERE p.id=$1',[req.params.id]);
  if(!r.rows[0]) return res.status(404).json({error:'Not found'});
  const units = await pool.query('SELECT pu.*, u.code, u.name FROM product_units pu JOIN units u ON u.id=pu.unit_id WHERE pu.product_id=$1',[req.params.id]);
  const stocks = await pool.query('SELECT s.*, w.name as warehouse_name, w.code as warehouse_code FROM stocks s JOIN warehouses w ON w.id=s.warehouse_id WHERE s.product_id=$1',[req.params.id]);
  res.json({...r.rows[0], units: units.rows, stocks: stocks.rows});
});
router.put('/products/:id', async (req,res)=>{
  const fields=['name','sku','barcode','category_id','base_unit_id','min_stock','reorder_point','is_active','description'];
  const sets=[]; const vals=[]; let idx=1;
  for(const f of fields) if(req.body[f]!==undefined){ sets.push(f+'=$'+idx); vals.push(req.body[f]); idx++; }
  if(sets.length){ vals.push(req.params.id); await pool.query('UPDATE products SET '+sets.join(',')+' WHERE id=$'+idx, vals); }
  res.json({ok:true});
});
router.delete('/products/:id', async (req,res)=>{ await pool.query('UPDATE products SET is_active=false WHERE id=$1',[req.params.id]); res.json({ok:true}); });

// categories
router.get('/categories', async (req,res)=>{
  const r=await pool.query('SELECT * FROM product_categories ORDER BY name');
  res.json(r.rows);
});
// units
router.get('/units', async (req,res)=>{ const r=await pool.query('SELECT * FROM units ORDER BY code'); res.json(r.rows); });
// warehouses
router.get('/warehouses', async (req,res)=>{ const r=await pool.query('SELECT w.*, b.name as branch_name FROM warehouses w LEFT JOIN branches b ON b.id=w.branch_id ORDER BY w.code'); res.json(r.rows); });
router.get('/branches', async (req,res)=>{ const r=await pool.query('SELECT b.*, c.name as company_name FROM branches b LEFT JOIN companies c ON c.id=b.company_id ORDER BY b.code'); res.json(r.rows); });
router.get('/customers', async (req,res)=>{
  const {limit,offset}=paginate(req);
  const s=req.query.search||'';
  let where='WHERE 1=1'; const p=[];
  if(s){ p.push('%'+s+'%'); where+=' AND (name ILIKE $'+p.length+' OR code ILIKE $'+p.length+')'; }
  const cnt=await pool.query('SELECT COUNT(*) FROM customers '+where,p);
  const data=await pool.query('SELECT * FROM customers '+where+' ORDER BY id DESC LIMIT $'+(p.length+1)+' OFFSET $'+(p.length+2), [...p,limit,offset]);
  res.json({data:data.rows, total:parseInt(cnt.rows[0].count)});
});
router.post('/customers', async (req,res)=>{
  const {code,name,type,address,phone,email,credit_limit,payment_term_days}=req.body;
  const r=await pool.query('INSERT INTO customers (code,name,type,address,phone,email,credit_limit,payment_term_days) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[code,name,type,address,phone,email,credit_limit,payment_term_days]);
  res.json(r.rows[0]);
});
router.get('/customers/:id', async (req,res)=>{ const r=await pool.query('SELECT * FROM customers WHERE id=$1',[req.params.id]); res.json(r.rows[0]); });
router.put('/customers/:id', async (req,res)=>{
  const f=['name','type','address','phone','email','credit_limit','payment_term_days','is_active'];
  const sets=[]; const vals=[]; let i=1;
  for(const k of f) if(req.body[k]!==undefined){ sets.push(k+'=$'+i); vals.push(req.body[k]); i++; }
  if(sets.length){ vals.push(req.params.id); await pool.query('UPDATE customers SET '+sets.join(',')+' WHERE id=$'+i, vals); }
  res.json({ok:true});
});
router.get('/suppliers', async (req,res)=>{
  const {limit,offset}=paginate(req);
  const s=req.query.search||'';
  let where='WHERE 1=1'; const p=[];
  if(s){ p.push('%'+s+'%'); where+=' AND (name ILIKE $'+p.length+' OR code ILIKE $'+p.length+')'; }
  const cnt=await pool.query('SELECT COUNT(*) FROM suppliers '+where,p);
  const data=await pool.query('SELECT * FROM suppliers '+where+' ORDER BY id DESC LIMIT $'+(p.length+1)+' OFFSET $'+(p.length+2), [...p,limit,offset]);
  res.json({data:data.rows, total:parseInt(cnt.rows[0].count)});
});
router.post('/suppliers', async (req,res)=>{
  const {code,name,address,phone,email,payment_term_days}=req.body;
  const r=await pool.query('INSERT INTO suppliers (code,name,address,phone,email,payment_term_days) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',[code,name,address,phone,email,payment_term_days]);
  res.json(r.rows[0]);
});
router.get('/taxes', async (req,res)=>{ const r=await pool.query('SELECT * FROM taxes'); res.json(r.rows); });
router.get('/accounts', async (req,res)=>{ const r=await pool.query('SELECT * FROM accounts ORDER BY code'); res.json(r.rows); });

export default router;
