import fs from 'fs'; import path from 'path';
const r='C:/Users/jefri/Downloads/erptest';
const w=(p,c)=>{ const fp=path.join(r,p); fs.mkdirSync(path.dirname(fp),{recursive:true}); fs.writeFileSync(fp,c); console.log('w',p); };

// ----- MIGRATION 002 already written, ensure index.js runner later

// BACKEND MODULES
w('src/modules/consignment/routes.js', `import express from 'express';
import { pool } from '../../config/db.js';
import { paginate } from '../../utils/helpers.js';
const router=express.Router();
router.get('/', async(req,res)=>{
  const {type,status}=req.query; let where='WHERE 1=1'; const p=[];
  if(type){ p.push(type); where+=' AND type=$'+p.length; }
  if(status){ p.push(status); where+=' AND status=$'+p.length; }
  const data=await pool.query('SELECT c.*, coalesce(json_agg(json_build_object(\\'product_name\\',p.name,\\'sku\\',p.sku,\\'qty_sent\\',ci.qty_sent,\\'qty_sold\\',ci.qty_sold) ORDER BY ci.id),\\'[]\\') as items FROM consignments c LEFT JOIN consignment_items ci ON ci.consignment_id=c.id LEFT JOIN products p ON p.id=ci.product_id '+where+' GROUP BY c.id ORDER BY c.id DESC',p);
  const stats=await pool.query("SELECT type, status, COUNT(*) FROM consignments GROUP BY type,status");
  res.json({data:data.rows, stats:stats.rows});
});
router.get('/:id', async(req,res)=>{
  const c=await pool.query('SELECT * FROM consignments WHERE id=$1',[req.params.id]);
  if(!c.rows[0]) return res.status(404).json({error:'Not found'});
  const items=await pool.query('SELECT ci.*, p.name as product_name, p.sku FROM consignment_items ci JOIN products p ON p.id=ci.product_id WHERE ci.consignment_id=$1',[req.params.id]);
  const moves=await pool.query('SELECT cm.*, p.name FROM consignment_movements cm JOIN consignment_items ci ON ci.id=cm.consignment_item_id JOIN products p ON p.id=ci.product_id WHERE ci.consignment_id=$1 ORDER BY cm.id DESC',[req.params.id]);
  res.json({...c.rows[0], items:items.rows, movements:moves.rows});
});
router.post('/', async(req,res)=>{
  const {type, partner_type, partner_id, location_name, location_address, start_date, end_date, notes, items}=req.body;
  if(!location_name||!items?.length) return res.status(400).json({error:'location_name & items required'});
  const num=(type==='IN'?'CSI-':'CSO-')+Date.now().toString().slice(-6);
  const ins=await pool.query('INSERT INTO consignments (consignment_number,type,partner_type,partner_id,location_name,location_address,start_date,end_date,notes,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id', [num,type||'OUT',partner_type||'CUSTOMER',partner_id,location_name,location_address,start_date||new Date().toISOString().slice(0,10),end_date,notes,req.user.id]);
  const cid=ins.rows[0].id;
  for(const it of items){
    const itIns=await pool.query('INSERT INTO consignment_items (consignment_id,product_id,qty_sent,selling_price) VALUES ($1,$2,$3,$4) RETURNING id',[cid,it.product_id,it.qty_sent||it.qty,it.selling_price||65000]);
    await pool.query('INSERT INTO consignment_movements (consignment_item_id,type,qty) VALUES ($1,\\'SENT\\',$2)',[itIns.rows[0].id, it.qty_sent||it.qty]);
    // move stock OUT from warehouse 1 to consignment (decrease on_hand, keep as consigned asset)
    await pool.query('UPDATE stocks SET qty_on_hand = qty_on_hand - $1 WHERE product_id=$2 AND warehouse_id=1',[it.qty_sent||it.qty, it.product_id]);
    await pool.query("INSERT INTO stock_movements (product_id,warehouse_id,movement_type,reference_type,reference_id,qty_out,created_by) VALUES ($1,1,'OUT','CONSIGNMENT',$2,$3,$4)",[it.product_id,cid,it.qty_sent||it.qty,req.user.id]);
  }
  await pool.query('INSERT INTO audit_logs (user_id,action,entity_type,entity_id,new_value) VALUES ($1,\\'CREATE\\',\\'CONSIGNMENT\\',$2,$3)',[req.user.id,cid,JSON.stringify({num,type})]);
  res.json({id:cid, consignment_number:num});
});
router.post('/:id/movement', async(req,res)=>{
  const {item_id,type,qty,notes}=req.body;
  await pool.query('INSERT INTO consignment_movements (consignment_item_id,type,qty,notes) VALUES ($1,$2,$3,$4)',[item_id,type,qty,notes]);
  if(type==='SOLD') await pool.query('UPDATE consignment_items SET qty_sold = qty_sold + $1 WHERE id=$2',[qty,item_id]);
  if(type==='RETURNED'){ await pool.query('UPDATE consignment_items SET qty_returned = qty_returned + $1 WHERE id=$2',[qty,item_id]); // balik ke gudang
    const it=await pool.query('SELECT product_id FROM consignment_items WHERE id=$1',[item_id]);
    await pool.query('UPDATE stocks SET qty_on_hand = qty_on_hand + $1 WHERE product_id=$2 AND warehouse_id=1',[qty,it.rows[0].product_id]);
  }
  if(type==='LOST') await pool.query('UPDATE consignment_items SET qty_lost = qty_lost + $1 WHERE id=$2',[qty,item_id]);
  // auto close check
  res.json({ok:true});
});
router.post('/:id/close', async(req,res)=>{
  await pool.query("UPDATE consignments SET status='CLOSED' WHERE id=$1",[req.params.id]);
  res.json({ok:true});
});
router.get('/stats/summary', async(req,res)=>{
  const s=await pool.query("SELECT COUNT(*) FILTER (WHERE type='OUT' AND status='ACTIVE') as out_active, COUNT(*) FILTER (WHERE type='IN' AND status='ACTIVE') as in_active, COUNT(*) FILTER (WHERE status='CLOSED') as closed FROM consignments");
  const aging=await pool.query("SELECT consignment_number, location_name, CURRENT_DATE - start_date as umur_hari FROM consignments WHERE type='OUT' AND status='ACTIVE' AND CURRENT_DATE - start_date > 90");
  res.json({...s.rows[0], long_pending:aging.rows});
});
export default router;
`);

w('src/modules/projects/routes.js', `import express from 'express';
import { pool } from '../../config/db.js';
import { paginate } from '../../utils/helpers.js';
const router=express.Router();
router.get('/', async(req,res)=>{
  const status=req.query.status;
  let where='WHERE 1=1'; const p=[];
  if(status){ p.push(status); where+=' AND pr.status=$'+p.length; }
  const data=await pool.query('SELECT pr.*, c.name as customer_name, (SELECT COALESCE(SUM(amount),0) FROM project_terms WHERE project_id=pr.id AND status=\\'PAID\\') as paid_amount, (SELECT COALESCE(SUM(amount),0) FROM project_terms WHERE project_id=pr.id) as total_terms FROM projects pr LEFT JOIN customers c ON c.id=pr.customer_id '+where+' ORDER BY pr.id DESC',p);
  res.json(data.rows);
});
router.get('/:id', async(req,res)=>{
  const pr=await pool.query('SELECT pr.*, c.name as customer_name FROM projects pr LEFT JOIN customers c ON c.id=pr.customer_id WHERE pr.id=$1',[req.params.id]);
  if(!pr.rows[0]) return res.status(404).json({error:'Not found'});
  const terms=await pool.query('SELECT * FROM project_terms WHERE project_id=$1 ORDER BY term_number',[req.params.id]);
  const prices=await pool.query('SELECT pp.*, p.name as product_name, p.sku FROM project_prices pp JOIN products p ON p.id=pp.product_id WHERE pp.project_id=$1',[req.params.id]);
  const docs=await pool.query('SELECT * FROM project_documents WHERE project_id=$1 ORDER BY doc_date DESC',[req.params.id]);
  const rab=await pool.query('SELECT r.*, p.name as product_name, p.sku FROM project_rab r JOIN products p ON p.id=r.product_id WHERE r.project_id=$1',[req.params.id]);
  const sos=await pool.query('SELECT so.*, c.name as customer_name FROM sales_orders so LEFT JOIN customers c ON c.id=so.customer_id WHERE so.notes ILIKE \\'%PRJ-\\'+req.params.id+'%\\' OR so.customer_id=pr.rows[0].customer_id ORDER BY so.id DESC LIMIT 20');
  const invs=await pool.query('SELECT inv.*, c.name FROM invoices inv LEFT JOIN customers c ON c.id=inv.customer_id WHERE inv.customer_id=pr.rows[0].customer_id ORDER BY inv.id DESC LIMIT 20');
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
  await pool.query('INSERT INTO audit_logs (user_id,action,entity_type,entity_id,new_value) VALUES ($1,\\'CREATE\\',\\'PROJECT\\',$2,$3)',[req.user.id,pid,JSON.stringify({code,name})]);
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
`);

w('src/modules/pricing/routes.js', `import express from 'express';
import { pool } from '../../config/db.js';
const router=express.Router();
router.get('/lists', async(req,res)=>{
  const r=await pool.query('SELECT * FROM price_lists ORDER BY type, name');
  res.json(r.rows);
});
router.post('/lists', async(req,res)=>{
  const {code,name,type}=req.body;
  const rr=await pool.query('INSERT INTO price_lists (code,name,type) VALUES ($1,$2,$3) RETURNING id',[code,name,type||'RETAIL']);
  res.json(rr.rows[0]);
});
router.get('/lists/:id/items', async(req,res)=>{
  const r=await pool.query('SELECT pli.*, p.name as product_name, p.sku, u.code as unit_code FROM price_list_items pli JOIN products p ON p.id=pli.product_id LEFT JOIN units u ON u.id=pli.unit_id WHERE pli.price_list_id=$1 ORDER BY p.name',[req.params.id]);
  res.json(r.rows);
});
router.post('/lists/:id/items', async(req,res)=>{
  const {product_id,price,min_qty,unit_id}=req.body;
  await pool.query('INSERT INTO price_list_items (price_list_id,product_id,unit_id,min_qty,price) VALUES ($1,$2,$3,$4,$5)',[req.params.id,product_id,unit_id||1,min_qty||1,price]);
  res.json({ok:true});
});
router.get('/customer-prices', async(req,res)=>{
  const cid=req.query.customer_id;
  let q='SELECT cp.*, p.name as product_name, p.sku, c.name as customer_name FROM customer_prices cp JOIN products p ON p.id=cp.product_id JOIN customers c ON c.id=cp.customer_id';
  const p=[];
  if(cid){ p.push(cid); q+=' WHERE cp.customer_id=$1'; }
  q+=' ORDER BY cp.id DESC LIMIT 100';
  const r=await pool.query(q,p);
  res.json(r.rows);
});
router.post('/customer-prices', async(req,res)=>{
  const {customer_id,product_id,price,valid_from,valid_to}=req.body;
  await pool.query('INSERT INTO customer_prices (customer_id,product_id,unit_id,price,valid_from,valid_to,approved_by) VALUES ($1,$2,1,$3,$4,$5,$6)',[customer_id,product_id,price,valid_from,valid_to,req.user.id]);
  // audit trail harga
  await pool.query('INSERT INTO data_change_logs (table_name,record_id,field_name,old_value,new_value,changed_by,reason) VALUES (\\'customer_prices\\',$1,\\'price\\',\\'\\',$2,$3,\\'set customer price\\')',[customer_id,String(price),req.user.id]);
  res.json({ok:true});
});
router.get('/floor-prices', async(req,res)=>{
  const r=await pool.query('SELECT id, name, sku, floor_price FROM products WHERE floor_price>0 ORDER BY name');
  res.json(r.rows);
});
router.put('/floor-prices/:product_id', async(req,res)=>{
  await pool.query('UPDATE products SET floor_price=$1 WHERE id=$2',[req.body.floor_price,req.params.product_id]);
  await pool.query('INSERT INTO data_change_logs (table_name,record_id,field_name,old_value,new_value,changed_by) VALUES (\\'products\\',$1,\\'floor_price\\',\\'\\',$2,$3)',[req.params.product_id, String(req.body.floor_price), req.user.id]);
  res.json({ok:true});
});
router.get('/promotions', async(req,res)=>{
  const r=await pool.query('SELECT * FROM promotions ORDER BY is_active DESC, start_date DESC');
  res.json(r.rows);
});
router.post('/promotions', async(req,res)=>{
  const {code,name,type,start_date,end_date,conditions,benefits}=req.body;
  await pool.query('INSERT INTO promotions (code,name,type,start_date,end_date,conditions,benefits) VALUES ($1,$2,$3,$4,$5,$6,$7)',[code,name,type,start_date,end_date,conditions||'{}',benefits||'{}']);
  res.json({ok:true});
});
router.post('/check', async(req,res)=>{
  const {customer_id, project_id, product_id, qty}=req.body;
  // priority: project_price > customer_price > price_list tier
  let price=null, source='retail';
  if(project_id){
    const pr=await pool.query('SELECT price FROM project_prices WHERE project_id=$1 AND product_id=$2 LIMIT 1',[project_id,product_id]);
    if(pr.rows[0]){ price=parseFloat(pr.rows[0].price); source='project'; }
  }
  if(!price && customer_id){
    const cr=await pool.query('SELECT price FROM customer_prices WHERE customer_id=$1 AND product_id=$2 AND (valid_to IS NULL OR valid_to >= CURRENT_DATE) ORDER BY id DESC LIMIT 1',[customer_id,product_id]);
    if(cr.rows[0]){ price=parseFloat(cr.rows[0].price); source='customer'; }
  }
  if(!price){
    // tier by customer type
    let tier='RETAIL';
    if(customer_id){ const c=await pool.query('SELECT type FROM customers WHERE id=$1',[customer_id]); tier = c.rows[0]?.type==='wholesale'?'WHOLESALE':c.rows[0]?.type==='contractor'?'CONTRACTOR':'RETAIL'; }
    const list=await pool.query('SELECT id FROM price_lists WHERE type=$1 LIMIT 1',[tier]);
    if(list.rows[0]){
      const it=await pool.query('SELECT price FROM price_list_items WHERE price_list_id=$1 AND product_id=$2 AND min_qty <= $3 ORDER BY min_qty DESC LIMIT 1',[list.rows[0].id, product_id, qty||1]);
      if(it.rows[0]){ price=parseFloat(it.rows[0].price); source='pricelist:'+tier; }
    }
  }
  if(!price){
    const pu=await pool.query('SELECT selling_price FROM product_units WHERE product_id=$1 LIMIT 1',[product_id]);
    price=parseFloat(pu.rows[0]?.selling_price||0);
    source='base';
  }
  const prod=await pool.query('SELECT floor_price FROM products WHERE id=$1',[product_id]);
  const floor=parseFloat(prod.rows[0]?.floor_price||0);
  const belowFloor = floor>0 && price < floor;
  res.json({price, source, floor_price:floor, below_floor:belowFloor, warning: belowFloor? 'Harga di bawah floor price, butuh approval Direktur':'',_qty:qty});
});
router.get('/history', async(req,res)=>{
  const pid=req.query.product_id;
  const r=await pool.query("SELECT * FROM data_change_logs WHERE table_name IN ('customer_prices','products') AND (record_id=$1 OR field_name='price') ORDER BY changed_at DESC LIMIT 50",[pid]);
  res.json(r.rows);
});
export default router;
`);

w('src/modules/returns/routes.js', `import express from 'express';
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
  await pool.query('INSERT INTO audit_logs (user_id,action,entity_type,entity_id,new_value) VALUES ($1,\\'CREATE\\',\\'SALES_RETURN\\',$2,$3)',[req.user.id,rid,JSON.stringify({num,reason})]);
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
  const ins=await pool.query('INSERT INTO claims (claim_number,claim_type,reference_type,reference_id,amount_claimed,notes,status) VALUES ($1,$2,$3,$4,$5,$6,\\'SUBMITTED\\') RETURNING id',[num,claim_type||'SUPPLIER',reference_type,reference_id,amount_claimed||0,notes]);
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
`);

w('src/modules/landedcost/routes.js', `import express from 'express';
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
`);

w('src/modules/fleet/routes.js', `import express from 'express';
import { pool } from '../../config/db.js';
import { paginate } from '../../utils/helpers.js';
const router=express.Router();
router.get('/vehicles', async(req,res)=>{
  const r=await pool.query('SELECT v.*, e.name as driver_name FROM vehicles v LEFT JOIN employees e ON e.id=v.driver_id ORDER BY v.plat_no');
  // enrich with next maintenance
  for(const v of r.rows){
    const m=await pool.query('SELECT * FROM vehicle_maintenance WHERE vehicle_id=$1 ORDER BY service_date DESC LIMIT 1',[v.id]);
    v.last_maintenance=m.rows[0]||null;
  }
  res.json(r.rows);
});
router.post('/vehicles', async(req,res)=>{
  const {plat_no,type,brand,capacity_ton,driver_id}=req.body;
  const ins=await pool.query('INSERT INTO vehicles (plat_no,plate_number,type,brand,capacity_ton,status,driver_id, capacity_weight_kg) VALUES ($1,$2,$3,$4,$5,\\'AVAILABLE\\',$6,$7) RETURNING id',[plat_no,plat_no,type||'ENGKEL',brand||'Mitsubishi',capacity_ton||8,driver_id, (capacity_ton||8)*1000]);
  res.json(ins.rows[0]);
});
router.get('/drivers', async(req,res)=>{
  const r=await pool.query('SELECT d.*, e.name, e.phone FROM drivers d JOIN employees e ON e.id=d.employee_id ORDER BY e.name');
  res.json(r.rows);
});
router.post('/drivers', async(req,res)=>{
  const {employee_id,sim_number,sim_expiry}=req.body;
  const ins=await pool.query('INSERT INTO drivers (employee_id,sim_number,sim_expiry) VALUES ($1,$2,$3) RETURNING id',[employee_id,sim_number,sim_expiry]);
  res.json(ins.rows[0]);
});
router.get('/trips', async(req,res)=>{
  const r=await pool.query('SELECT t.*, v.plat_no, e.name as driver_name, do.do_number FROM trips t LEFT JOIN vehicles v ON v.id=t.vehicle_id LEFT JOIN drivers d ON d.id=t.driver_id LEFT JOIN employees e ON e.id=d.employee_id LEFT JOIN delivery_orders do ON do.id=t.do_id ORDER BY t.id DESC LIMIT 50');
  res.json(r.rows);
});
router.post('/trips', async(req,res)=>{
  const {vehicle_id,driver_id,do_id,route,distance_km,fuel_cost,toll_cost,other_cost}=req.body;
  const num='TRIP-'+Date.now().toString().slice(-6);
  const ins=await pool.query('INSERT INTO trips (trip_number,vehicle_id,driver_id,do_id,route,distance_km,fuel_cost,toll_cost,other_cost,status,departure_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,\\'IN_PROGRESS\\',NOW()) RETURNING id',[num,vehicle_id,driver_id,do_id,route,distance_km||0,fuel_cost||0,toll_cost||0,other_cost||0]);
  await pool.query("UPDATE vehicles SET status='IN_TRANSIT' WHERE id=$1",[vehicle_id]);
  res.json({id:ins.rows[0].id, trip_number:num});
});
router.post('/trips/:id/complete', async(req,res)=>{
  const t=await pool.query('SELECT vehicle_id FROM trips WHERE id=$1',[req.params.id]);
  await pool.query("UPDATE trips SET status='COMPLETED', arrival_date=NOW() WHERE id=$1",[req.params.id]);
  if(t.rows[0]) await pool.query("UPDATE vehicles SET status='AVAILABLE' WHERE id=$1",[t.rows[0].vehicle_id]);
  // hitung laba trip: revenue dari DO vs cost
  res.json({ok:true});
});
router.get('/maintenance', async(req,res)=>{
  const r=await pool.query('SELECT vm.*, v.plat_no FROM vehicle_maintenance vm JOIN vehicles v ON v.id=vm.vehicle_id ORDER BY vm.service_date DESC LIMIT 50');
  res.json(r.rows);
});
router.post('/maintenance', async(req,res)=>{
  const {vehicle_id,maintenance_type,service_date,next_service_date,description,cost}=req.body;
  await pool.query('INSERT INTO vehicle_maintenance (vehicle_id,maintenance_type,service_date,next_service_date,description,cost) VALUES ($1,$2,$3,$4,$5,$6)',[vehicle_id,maintenance_type||'PREVENTIVE',service_date||new Date().toISOString().slice(0,10),next_service_date,description,cost||0]);
  res.json({ok:true});
});
router.get('/stats', async(req,res)=>{
  const tot=await pool.query('SELECT COUNT(*) FROM vehicles');
  const avail=await pool.query("SELECT COUNT(*) FROM vehicles WHERE status='AVAILABLE'");
  const maint=await pool.query("SELECT COUNT(*) FROM vehicle_maintenance WHERE service_date >= CURRENT_DATE - INTERVAL '30 days'");
  const trips=await pool.query("SELECT COUNT(*) FROM trips WHERE departure_date >= CURRENT_DATE - INTERVAL '30 days'");
  const cost=await pool.query("SELECT COALESCE(SUM(fuel_cost+toll_cost+other_cost),0) as total FROM trips WHERE departure_date >= CURRENT_DATE - INTERVAL '30 days'");
  const overdueKir=await pool.query("SELECT COUNT(*) FROM vehicles WHERE kir_expiry IS NOT NULL AND kir_expiry < CURRENT_DATE + INTERVAL '14 days'");
  res.json({total:parseInt(tot.rows[0].count), available:parseInt(avail.rows[0].count), maintenance_30:parseInt(maint.rows[0].count), trips_30:parseInt(trips.rows[0].count), cost_30:parseFloat(cost.rows[0].total), kir_overdue:parseInt(overdueKir.rows[0].count)});
});
router.get('/zones', async(req,res)=>{
  res.json([
    {zone:'Dalam Kota Bekasi', tarif_per_ton:120000, tarif_flat:150000, jangkauan:'0-15km'},
    {zone:'Jakarta', tarif_per_ton:180000, tarif_flat:250000, jangkauan:'15-40km'},
    {zone:'Bandung/Luar Kota', tarif_per_ton:350000, tarif_flat:600000, jangkauan:'>40km'},
  ]);
});
export default router;
`);

w('src/modules/loyalty/routes.js', `import express from 'express';
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
  await pool.query('INSERT INTO loyalty_transactions (customer_id,transaction_type,points,reference_type,reference_id,description) VALUES ($1,\\'EARN\\',$2,$3,$4,$5)',[customer_id,points,reference_type,reference_id,description]);
  await pool.query('INSERT INTO loyalty_points (customer_id,points_balance,lifetime_points) VALUES ($1,$2,$2) ON CONFLICT (customer_id) DO UPDATE SET points_balance = loyalty_points.points_balance + $2, lifetime_points = loyalty_points.lifetime_points + $2',[customer_id,points]);
  res.json({ok:true});
});
router.post('/redeem', async(req,res)=>{
  const {customer_id,points,description}=req.body;
  const bal=await pool.query('SELECT points_balance FROM loyalty_points WHERE customer_id=$1',[customer_id]);
  if(!bal.rows[0]|| parseInt(bal.rows[0].points_balance) < points) return res.status(400).json({error:'Poin tidak cukup'});
  await pool.query('INSERT INTO loyalty_transactions (customer_id,transaction_type,points,description) VALUES ($1,\\'REDEEM\\',$2,$3)',[customer_id,-points,description||'Redeem']);
  await pool.query('UPDATE loyalty_points SET points_balance = points_balance - $1 WHERE customer_id=$2',[points,customer_id]);
  res.json({ok:true});
});
router.get('/transactions', async(req,res)=>{
  const r=await pool.query('SELECT lt.*, c.name FROM loyalty_transactions lt JOIN customers c ON c.id=lt.customer_id ORDER BY lt.id DESC LIMIT 50');
  res.json(r.rows);
});
export default router;
`);

w('src/modules/budget/routes.js', `import express from 'express';
import { pool } from '../../config/db.js';
const router=express.Router();
router.get('/', async(req,res)=>{
  const fy=req.query.fiscal_year||2024;
  const r=await pool.query('SELECT b.*, br.name as branch_name, a.code as account_code, a.name as account_name FROM budgets b LEFT JOIN branches br ON br.id=b.branch_id LEFT JOIN accounts a ON a.id=b.account_id WHERE b.fiscal_year=$1 ORDER BY b.period_month',[fy]);
  res.json(r.rows);
});
router.post('/', async(req,res)=>{
  const {fiscal_year,branch_id,department,account_id,period_month,budget_amount,notes}=req.body;
  await pool.query('INSERT INTO budgets (fiscal_year,branch_id,department,account_id,period_month,budget_amount,notes) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (fiscal_year,branch_id,account_id,period_month) DO UPDATE SET budget_amount=$6',[fiscal_year,branch_id,department,account_id,period_month,budget_amount,notes]);
  res.json({ok:true});
});
router.get('/comparison', async(req,res)=>{
  const fy=req.query.fiscal_year||2024;
  // sum actual from journal_entries grouped by month approximated via entry_date, join to budgets via account not yet linked, so use total revenue vs budget
  const budgets=await pool.query('SELECT period_month, SUM(budget_amount) as budget FROM budgets WHERE fiscal_year=$1 GROUP BY period_month ORDER BY period_month',[fy]);
  const actuals=await pool.query("SELECT EXTRACT(MONTH FROM entry_date)::int as period_month, SUM(total_debit) as actual FROM journal_entries WHERE EXTRACT(YEAR FROM entry_date)=$1 GROUP BY period_month ORDER BY period_month",[fy]);
  const map={}; budgets.rows.forEach(b=> map[b.period_month]={budget:parseFloat(b.budget), actual:0}); actuals.rows.forEach(a=> { if(!map[a.period_month]) map[a.period_month]={budget:0,actual:0}; map[a.period_month].actual=parseFloat(a.actual); });
  const merged=Object.entries(map).map(([m,v])=>({period_month:parseInt(m), ...v, variance: v.actual - v.budget, pct: v.budget? (v.actual/v.budget*100).toFixed(1):0 }));
  res.json(merged);
});
router.get('/cashflow', async(req,res)=>{
  const days=parseInt(req.query.days||'90');
  const ar=await pool.query("SELECT COALESCE(SUM(outstanding),0) as total FROM invoices WHERE status != 'PAID' AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + ($1 || ' days')::interval",[days]);
  const ap=await pool.query("SELECT COALESCE(SUM(total),0) as total FROM purchase_orders WHERE status IN ('APPROVED','RECEIVED','PARTIAL') AND expected_date BETWEEN CURRENT_DATE AND CURRENT_DATE + ($1 || ' days')::interval",[days]);
  const budgets=await pool.query("SELECT COALESCE(SUM(budget_amount),0) as total FROM budgets WHERE fiscal_year=EXTRACT(YEAR FROM CURRENT_DATE)::int AND period_month BETWEEN EXTRACT(MONTH FROM CURRENT_DATE)::int AND EXTRACT(MONTH FROM CURRENT_DATE + ($1 || ' days')::interval)::int",[days]);
  const cash=await pool.query('SELECT COALESCE(SUM(balance),0) as total FROM bank_accounts');
  res.json({
    horizon_days:days,
    cash_now: parseFloat(cash.rows[0].total),
    ar_expected: parseFloat(ar.rows[0].total),
    ap_expected: parseFloat(ap.rows[0].total),
    budget_expense_expected: parseFloat(budgets.rows[0].total),
    net_projection: parseFloat(cash.rows[0].total) + parseFloat(ar.rows[0].total) - parseFloat(ap.rows[0].total) - parseFloat(budgets.rows[0].total),
    breakdown: [
      {label:'Kas Sekarang', amount: parseFloat(cash.rows[0].total)},
      {label:'Piutang dalam '+days+' hari', amount: parseFloat(ar.rows[0].total)},
      {label:'Hutang jatuh tempo '+days+' hari', amount: -parseFloat(ap.rows[0].total)},
      {label:'Budget expense '+days+' hari', amount: -parseFloat(budgets.rows[0].total)},
    ]
  });
});
router.get('/scenarios', async(req,res)=>{
  const rev=await pool.query("SELECT COALESCE(SUM(total),0) as rev FROM invoices WHERE status != 'CANCELLED'");
  const base=parseFloat(rev.rows[0].rev||0);
  res.json([
    {scenario:'Base', revenue:base, opex: base*0.08, profit: base*0.14},
    {scenario:'Penjualan -20%', revenue:base*0.8, opex: base*0.08, profit: base*0.8 - base*0.75*0.8 - base*0.08},
    {scenario:'Penjualan +15%', revenue:base*1.15, opex: base*0.09, profit: base*1.15 - base*0.75*1.15 - base*0.09},
  ]);
});
export default router;
`);

w('src/modules/assets/routes.js', `import express from 'express';
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
`);

w('src/modules/marketplace/routes.js', `import express from 'express';
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
    await pool.query('INSERT INTO marketplace_orders (channel_id,external_order_id,buyer_name,buyer_phone,shipping_address,total,status) VALUES ($1,$2,$3,$4,$5,$6,\\'PENDING\\') ON CONFLICT DO NOTHING',[channel_id,ext,'Buyer '+i,'0812'+Math.floor(Math.random()*1e7),'Alamat '+i, Math.floor(Math.random()*500000)+50000]);
  }
  await pool.query('UPDATE marketplace_channels SET last_sync=NOW() WHERE id=$1',[channel_id]);
  res.json({ok:true, synced:2});
});
router.post('/orders/:id/convert', async(req,res)=>{
  const mo=await pool.query('SELECT * FROM marketplace_orders WHERE id=$1',[req.params.id]);
  if(!mo.rows[0]) return res.status(404).json({error:'Not found'});
  const soNum='SO-MP-'+Date.now();
  const ins=await pool.query("INSERT INTO sales_orders (so_number,customer_id,branch_id,so_date,status,subtotal,tax,total,notes,created_by) VALUES ($1,4,1,CURRENT_DATE,'APPROVED',$2,$3,$4,$5,$6) RETURNING id",[soNum, mo.rows[0].total, mo.rows[0].total*0.11, mo.rows[0].total*1.11, 'Marketplace '+mo.rows[0].external_order_id, req.user.id]);
  await pool.query('UPDATE marketplace_orders SET so_id=$1, status=\\'CONVERTED\\' WHERE id=$2',[ins.rows[0].id, req.params.id]);
  res.json({ok:true, so_id:ins.rows[0].id, so_number:soNum});
});
export default router;
`);

w('src/modules/waste/routes.js', `import express from 'express';
import { pool } from '../../config/db.js';
const router=express.Router();
router.get('/', async(req,res)=>{
  const r=await pool.query('SELECT w.*, p.name as product_name, p.sku, wh.name as warehouse_name, u.username as approver FROM waste_logs w LEFT JOIN products p ON p.id=w.product_id LEFT JOIN warehouses wh ON wh.id=w.warehouse_id LEFT JOIN users u ON u.id=w.approved_by ORDER BY w.id DESC LIMIT 50');
  res.json(r.rows);
});
router.post('/', async(req,res)=>{
  const {product_id,warehouse_id,qty,waste_type,reason}=req.body;
  const prod=await pool.query('SELECT avg_cost FROM stocks WHERE product_id=$1 AND warehouse_id=$2 LIMIT 1',[product_id,warehouse_id||1]);
  const cost = parseFloat(prod.rows[0]?.avg_cost||50000) * parseFloat(qty);
  const wtype = waste_type||'OTHER';
  // auto need approval if >500rb
  const status = cost > 500000 ? 'PENDING' : 'APPROVED';
  const ins=await pool.query('INSERT INTO waste_logs (product_id,warehouse_id,qty,waste_type,reason,cost,status,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[product_id,warehouse_id||1,qty,wtype,reason,cost,status,req.user.id]);
  if(status==='APPROVED'){
    await pool.query('UPDATE stocks SET qty_on_hand = qty_on_hand - $1 WHERE product_id=$2 AND warehouse_id=$3',[qty,product_id,warehouse_id||1]);
    await pool.query("INSERT INTO stock_movements (product_id,warehouse_id,movement_type,reference_type,reference_id,qty_out,created_by) VALUES ($1,$2,'ADJ','WASTE',$3,$4,$5)",[product_id,warehouse_id||1,ins.rows[0].id,qty,req.user.id]);
    await pool.query("INSERT INTO journal_entries (entry_number,entry_date,description,total_debit,total_credit,posted) VALUES ($1,CURRENT_DATE,$2,$3,$3,true)",['JE-WASTE-'+ins.rows[0].id,'Write-off waste '+wtype,cost]);
  }
  res.json({id:ins.rows[0].id, cost, status});
});
router.post('/:id/approve', async(req,res)=>{
  const {status}=req.body; // APPROVED / REJECTED
  const w=await pool.query('SELECT * FROM waste_logs WHERE id=$1',[req.params.id]);
  if(!w.rows[0]) return res.status(404).json({error:'Not found'});
  // threshold check
  const cost=parseFloat(w.rows[0].cost);
  if(cost>5000000 && status==='APPROVED'){
    // need direktur role check (simplified: allow any but log)
  }
  await pool.query('UPDATE waste_logs SET status=$1, approved_by=$2 WHERE id=$3',[status,req.user.id,req.params.id]);
  if(status==='APPROVED'){
    await pool.query('UPDATE stocks SET qty_on_hand = qty_on_hand - $1 WHERE product_id=$2 AND warehouse_id=$3',[w.rows[0].qty,w.rows[0].product_id,w.rows[0].warehouse_id]);
    await pool.query("INSERT INTO stock_movements (product_id,warehouse_id,movement_type,reference_type,reference_id,qty_out,created_by) VALUES ($1,$2,'ADJ','WASTE',$3,$4,$5)",[w.rows[0].product_id,w.rows[0].warehouse_id,req.params.id,w.rows[0].qty,req.user.id]);
  }
  res.json({ok:true});
});
router.get('/stats/summary', async(req,res)=>{
  const r=await pool.query("SELECT waste_type, COUNT(*) as cnt, SUM(qty) as qty, SUM(cost) as cost FROM waste_logs GROUP BY waste_type ORDER BY cost DESC");
  const pending=await pool.query("SELECT COUNT(*) FROM waste_logs WHERE status='PENDING'");
  res.json({by_type:r.rows, pending:parseInt(pending.rows[0].count)});
});
export default router;
`);

w('src/modules/credit/routes.js', `import express from 'express';
import { pool } from '../../config/db.js';
const router=express.Router();
router.get('/holds', async(req,res)=>{
  const r=await pool.query('SELECT * FROM customers WHERE is_hold=true');
  res.json(r.rows);
});
router.post('/hold', async(req,res)=>{
  const {customer_id,reason}=req.body;
  await pool.query('UPDATE customers SET is_hold=true, hold_reason=$1 WHERE id=$2',[reason,customer_id]);
  await pool.query('INSERT INTO data_change_logs (table_name,record_id,field_name,old_value,new_value,changed_by,reason) VALUES (\\'customers\\',$1,\\'is_hold\\',\\'false\\',\\'true\\',$2,$3)',[customer_id,req.user.id,reason]);
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
  const ar=await pool.query("SELECT COALESCE(SUM(outstanding),0) as total FROM invoices WHERE customer_id=$1 AND status != 'PAID'",[req.params.customer_id]);
  const outstanding=parseFloat(ar.rows[0].total);
  const limit=parseFloat(c.rows[0].credit_limit);
  const isHold=c.rows[0].is_hold;
  const usage = limit? (outstanding/limit*100).toFixed(1):0;
  res.json({credit_limit:limit, outstanding, usage_pct:usage, is_hold:isHold, blocked: isHold || outstanding > limit, warning: outstanding>limit? 'Melebihi limit kredit, butuh approval Finance Manager': isHold? 'Customer di-HOLD, hanya Direktur bisa buka':''});
});
router.get('/reminders', async(req,res)=>{
  // mock WA reminders: invoices due in 7,3,1, -1, -7
  const r=await pool.query("SELECT i.invoice_number, c.name as customer_name, c.phone, i.due_date, i.outstanding, CURRENT_DATE - i.due_date as diff FROM invoices i JOIN customers c ON c.id=i.customer_id WHERE i.status != 'PAID' AND ABS(CURRENT_DATE - i.due_date) IN (7,3,1,0) OR i.due_date = CURRENT_DATE + INTERVAL '7 days' LIMIT 20");
  res.json(r.rows.map(x=>({...x, channel:'WA', template: x.diff<=0? 'Reminder H-'+Math.abs(x.diff): 'Overdue H+'+x.diff})));
});
export default router;
`);

w('src/modules/approvals/routes.js', `import express from 'express';
import { pool } from '../../config/db.js';
const router=express.Router();
router.get('/', async(req,res)=>{
  const status=req.query.status||'PENDING';
  const me=req.query.mine==='true' ? ' AND approver_id='+req.user.id : '';
  const q='SELECT ar.*, u1.username as requester_name, u2.username as approver_name, u3.username as delegated_name FROM approval_requests ar LEFT JOIN users u1 ON u1.id=ar.requester_id LEFT JOIN users u2 ON u2.id=ar.approver_id LEFT JOIN users u3 ON u3.id=ar.delegated_to WHERE ar.status=\\''+status+'\\''+me+' ORDER BY ar.id DESC LIMIT 50';
  const r=await pool.query(q);
  res.json(r.rows);
});
router.post('/request', async(req,res)=>{
  const {entity_type,entity_id,approver_id,level}=req.body;
  const ins=await pool.query('INSERT INTO approval_requests (entity_type,entity_id,requester_id,approver_id,level) VALUES ($1,$2,$3,$4,$5) RETURNING id',[entity_type,entity_id,req.user.id,approver_id||1,level||1]);
  // push notif mock
  res.json({id:ins.rows[0].id});
});
router.post('/:id/approve', async(req,res)=>{
  await pool.query("UPDATE approval_requests SET status='APPROVED', responded_at=NOW(), notes=$1 WHERE id=$2",[req.body.notes,req.params.id]);
  // auto update entity status
  const ar=await pool.query('SELECT * FROM approval_requests WHERE id=$1',[req.params.id]);
  if(ar.rows[0]) {
    const e=ar.rows[0];
    if(e.entity_type==='SALES_ORDER') await pool.query("UPDATE sales_orders SET status='APPROVED' WHERE id=$1",[e.entity_id]);
    if(e.entity_type==='PURCHASE_ORDER') await pool.query("UPDATE purchase_orders SET status='APPROVED' WHERE id=$1",[e.entity_id]);
    if(e.entity_type==='WASTE') await pool.query("UPDATE waste_logs SET status='APPROVED' WHERE id=$1",[e.entity_id]);
  }
  res.json({ok:true});
});
router.post('/:id/reject', async(req,res)=>{
  await pool.query("UPDATE approval_requests SET status='REJECTED', responded_at=NOW(), notes=$1 WHERE id=$2",[req.body.notes,req.params.id]);
  res.json({ok:true});
});
router.post('/:id/delegate', async(req,res)=>{
  await pool.query("UPDATE approval_requests SET status='DELEGATED', delegated_to=$1 WHERE id=$2",[req.body.delegated_to,req.params.id]);
  // create new delegated request
  const ar=await pool.query('SELECT * FROM approval_requests WHERE id=$1',[req.params.id]);
  await pool.query('INSERT INTO approval_requests (entity_type,entity_id,requester_id,approver_id,level,status) VALUES ($1,$2,$3,$4,$5,\\'PENDING\\')',[ar.rows[0].entity_type, ar.rows[0].entity_id, ar.rows[0].requester_id, req.body.delegated_to, ar.rows[0].level]);
  res.json({ok:true});
});
export default router;
`);

w('src/modules/calculator/routes.js', `import express from 'express';
const router=express.Router();
router.post('/estimate', async(req,res)=>{
  const {type, length, width, thickness, height, area_override, waste_pct}=req.body;
  // type: keramik, cat, semen_pasir, besi, bata
  let area = area_override || (parseFloat(length||0)*parseFloat(width||0));
  if(type==='keramik'){
    const tileSize = parseFloat(req.body.tile_size||0.36); // 60x60=0.36
    const tiles = Math.ceil(area / tileSize * (1+parseFloat(waste_pct||10)/100));
    const dus = Math.ceil(tiles / 4); // 4 tile per dus avg
    res.json({area, tiles, dus, semen: Math.ceil(area*0.02), pasir: (area*0.03).toFixed(2)+' m3', catatan:'1 dus 60x60 = 1.44m2, waste 10% included'});
  } else if(type==='cat'){
    const daya_sebar = 8; // m2 per liter
    const liter = Math.ceil(area / daya_sebar * 1.15);
    const kaleng5kg = Math.ceil(liter/5);
    res.json({area, liter, kaleng5kg, liter_per_coat: liter, catatan:'Daya sebar 8m2/L, 2 lapis + waste 15%'});
  } else if(type==='bata'){
    const perM2 = type==='bata_merah'? 70 : 12; // batako 12 per m2
    const qty = Math.ceil(area * perM2 * 1.05);
    res.json({area, qty, semen: Math.ceil(area*0.1)+' sak', pasir: (area*0.05).toFixed(2)+' m3'});
  } else if(type==='plester'){
    const semen = Math.ceil(area*0.12); // sak per m2
    const pasir = (area*0.02).toFixed(2);
    res.json({area, semen: semen+' sak (50kg)', pasir: pasir+' m3', thickness: thickness||'1.5cm'});
  } else {
    res.json({area, estimate: 'Pilih tipe: keramik | cat | bata | plester', area_m2:area});
  }
});
router.post('/quotation', async(req,res)=>{
  // auto jadi quotation: body same as estimate + customer_id
  const est = req.body;
  // mock: return SO draft number
  res.json({quotation_number:'QUO-'+Date.now().toString().slice(-6), estimate:est, valid_days:14, note:'Auto dari kalkulator material'});
});
export default router;
`);

w('src/modules/audit/routes.js', `import express from 'express';
import { pool } from '../../config/db.js';
const router=express.Router();
router.get('/logs', async(req,res)=>{
  const limit=Math.min(100, parseInt(req.query.limit||'50'));
  const entity=req.query.entity_type;
  let where=''; const p=[];
  if(entity){ p.push(entity); where='WHERE entity_type=$1'; }
  const r=await pool.query('SELECT al.*, u.username FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id '+where+' ORDER BY al.id DESC LIMIT $'+(p.length+1), [...p,limit]);
  res.json(r.rows);
});
router.get('/data-changes', async(req,res)=>{
  const table=req.query.table_name;
  let where=''; const p=[];
  if(table){ p.push(table); where='WHERE table_name=$1'; }
  const r=await pool.query('SELECT dcl.*, u.username as changed_by_name FROM data_change_logs dcl LEFT JOIN users u ON u.id=dcl.changed_by '+where+' ORDER BY dcl.id DESC LIMIT 50',p);
  res.json(r.rows);
});
router.get('/fraud', async(req,res)=>{
  // basic patterns
  const bigDiscount=await pool.query("SELECT so.so_number, so.discount, so.total, u.username FROM sales_orders so LEFT JOIN users u ON u.id=so.created_by WHERE so.discount/so.total > 0.2 LIMIT 10");
  const nightTx=await pool.query("SELECT * FROM sales_orders WHERE EXTRACT(HOUR FROM created_at) BETWEEN 0 AND 5 LIMIT 10");
  const bigQty=await pool.query('SELECT sd.*, p.name FROM so_details sd JOIN products p ON p.id=sd.product_id WHERE sd.qty > 1000 LIMIT 10');
  res.json({big_discount:bigDiscount.rows, night_transactions:nightTx.rows, big_qty:bigQty.rows, alerts: (bigDiscount.rows.length?1:0)+(nightTx.rows.length?1:0)+(bigQty.rows.length?1:0)});
});
router.get('/segregation', async(req,res)=>{
  // who created and approved same doc
  const r=await pool.query("SELECT 'SO' as type, so_number as doc, created_by, approved_by FROM sales_orders WHERE created_by=approved_by AND approved_by IS NOT NULL UNION ALL SELECT 'PO', po_number, created_by, approved_by FROM purchase_orders WHERE created_by=approved_by AND approved_by IS NOT NULL LIMIT 20");
  res.json(r.rows);
});
export default router;
`);

console.log('backend modules done');
