import express from 'express';
import { pool } from '../../config/db.js';
import { paginate } from '../../utils/helpers.js';
const router=express.Router();
router.get('/', async(req,res)=>{
  const status=req.query.status;
  let where='WHERE 1=1'; const p=[];
  if(status){ p.push(status); where+=' AND pr.status=$'+p.length; }
  const data=await pool.query('SELECT pr.*, c.name as customer_name, (SELECT COALESCE(SUM(amount),0) FROM project_terms WHERE project_id=pr.id AND status=\'PAID\') as paid_amount, (SELECT COALESCE(SUM(amount),0) FROM project_terms WHERE project_id=pr.id) as total_terms FROM projects pr LEFT JOIN customers c ON c.id=pr.customer_id '+where+' ORDER BY pr.id DESC',p);
  res.json(data.rows);
});
router.get('/:id', async(req,res)=>{
  const pr=await pool.query('SELECT pr.*, c.name as customer_name FROM projects pr LEFT JOIN customers c ON c.id=pr.customer_id WHERE pr.id=$1',[req.params.id]);
  if(!pr.rows[0]) return res.status(404).json({error:'Not found'});
  const terms=await pool.query('SELECT * FROM project_terms WHERE project_id=$1 ORDER BY term_number',[req.params.id]);
  const prices=await pool.query('SELECT pp.*, p.name as product_name, p.sku FROM project_prices pp JOIN products p ON p.id=pp.product_id WHERE pp.project_id=$1',[req.params.id]);
  const docs=await pool.query('SELECT * FROM project_documents WHERE project_id=$1 ORDER BY doc_date DESC',[req.params.id]);
  const rab=await pool.query('SELECT r.*, p.name as product_name, p.sku FROM project_rab r JOIN products p ON p.id=r.product_id WHERE r.project_id=$1',[req.params.id]);
  const sos=await pool.query('SELECT so.*, c.name as customer_name FROM sales_orders so LEFT JOIN customers c ON c.id=so.customer_id WHERE so.notes ILIKE $1 OR so.customer_id=$2 ORDER BY so.id DESC LIMIT 20',['%PRJ-'+req.params.id+'%', pr.rows[0].customer_id]);
  const invs=await pool.query('SELECT inv.*, c.name FROM invoices inv LEFT JOIN customers c ON c.id=inv.customer_id WHERE inv.customer_id=$1 ORDER BY inv.id DESC LIMIT 20',[pr.rows[0].customer_id]);
  const stats=await pool.query('SELECT COALESCE(SUM(qty_actual),0) as qty_actual, COALESCE(SUM(amount_actual),0) as amount_actual FROM project_rab WHERE project_id=$1',[req.params.id]);
  res.json({...pr.rows[0], terms:terms.rows, prices:prices.rows, documents:docs.rows, rab:rab.rows, sales_orders:sos.rows, invoices:invs.rows, stats:stats.rows[0]});
});
router.post('/', async(req,res)=>{
  const {name,customer_id,contract_value,start_date,end_date,location,pic_name,pic_phone,retention_pct,terms,rab}=req.body;
  if(!name) return res.status(400).json({error:'name required'});
  const code='PRJ-'+new Date().getFullYear()+'-'+String(Math.floor(Math.random()*9000+1000));
  const ins=await pool.query('INSERT INTO projects (project_code,name,customer_id,contract_value,start_date,end_date,location,pic_name,pic_phone,retention_pct,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',[code,name,customer_id,contract_value||0,start_date,end_date,location,pic_name,pic_phone,retention_pct||5,req.user.id]);
  const pid=ins.rows[0].id;
  if(terms?.length) for(const t of terms) await pool.query('INSERT INTO project_terms (project_id,term_number,description,percentage,amount,due_date) VALUES ($1,$2,$3,$4,$5,$6)',[pid,t.term_number,t.description,t.percentage,t.amount,t.due_date]);
  if(rab?.length) for(const r of rab) await pool.query('INSERT INTO project_rab (project_id,product_id,qty_planned,amount_planned) VALUES ($1,$2,$3,$4)',[pid,r.product_id,r.qty_planned,r.amount_planned]);
  await pool.query('INSERT INTO audit_logs (user_id,action,entity_type,entity_id,new_value) VALUES ($1,\'CREATE\',\'PROJECT\',$2,$3)',[req.user.id,pid,JSON.stringify({code,name})]);
  res.json({id:pid, project_code:code});
});
router.put('/:id/status', async(req,res)=>{
  await pool.query('UPDATE projects SET status=$1 WHERE id=$2',[req.body.status,req.params.id]);
  res.json({ok:true});
});
router.post('/:id/terms', async(req,res)=>{
  const {term_number,description,percentage,amount,due_date}=req.body;
  await pool.query('INSERT INTO project_terms (project_id,term_number,description,percentage,amount,due_date) VALUES ($1,$2,$3,$4,$5,$6)',[req.params.id,term_number,description,percentage,amount,due_date]);
  res.json({ok:true});
});
router.post('/:id/prices', async(req,res)=>{
  const {product_id,price,unit_id}=req.body;
  await pool.query('INSERT INTO project_prices (project_id,product_id,unit_id,price) VALUES ($1,$2,$3,$4)',[req.params.id,product_id,unit_id||1,price]);
  res.json({ok:true});
});
router.post('/:id/documents', async(req,res)=>{
  const {doc_type,doc_number,file_url,doc_date}=req.body;
  await pool.query('INSERT INTO project_documents (project_id,doc_type,doc_number,file_url,doc_date,uploaded_by) VALUES ($1,$2,$3,$4,$5,$6)',[req.params.id,doc_type,doc_number,file_url,doc_date,req.user.id]);
  res.json({ok:true});
});
router.get('/:id/cashflow', async(req,res)=>{
  // cashflow proyek: termin due vs paid
  const rows=await pool.query('SELECT term_number, description, amount, due_date, status FROM project_terms WHERE project_id=$1 ORDER BY term_number',[req.params.id]);
  res.json(rows.rows);
});
export default router;
