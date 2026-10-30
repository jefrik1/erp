require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'erp-super-secret-2026';
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://erp_user:erp_pass@localhost:5432/erp_db';

const pool = new Pool({ connectionString: DATABASE_URL });
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- helpers ----------
const q = (text, params) => pool.query(text, params);
const sign = payload => jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
const auth = async (req, res, next) => {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(h.replace('Bearer ', ''), JWT_SECRET); next(); } catch { return res.status(401).json({ error: 'Invalid token' }); }
};
const audit = async (userId, action, entity_type, entity_id, oldV, newV, req) => {
  try { await q(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,old_value,new_value,ip_address,user_agent) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [userId||null, action, entity_type, entity_id, oldV?JSON.stringify(oldV):null, newV?JSON.stringify(newV):null, req.ip, req.headers['user-agent']||'']); } catch(e){ console.error('audit',e.message)}
};
const paginate = (req) => {
  let page = Math.max(1, parseInt(req.query.page)||1);
  let limit = Math.min(100, Math.max(1, parseInt(req.query.limit)||20));
  let offset = (page-1)*limit;
  return { page, limit, offset };
};
// generic CRUD factory
function crud(router, table, opts={}){
  const pk = opts.pk||'id';
  const searchFields = opts.search||[];
  const orderBy = opts.orderBy||'id DESC';
  // list
  router.get(`/${table}`, async (req,res)=>{
    const { limit, offset, page } = paginate(req);
    let where=' WHERE 1=1', params=[], idx=1;
    if(req.query.search && searchFields.length){
      where+=` AND (${searchFields.map(f=>`${f} ILIKE $${idx}`).join(' OR ')})`;
      params.push(`%${req.query.search}%`); idx++;
    }
    // optional filters passthrough: ?status=xxx ?cluster_id=1 etc
    for(const [k,v] of Object.entries(req.query)){
      if(['page','limit','search','sort'].includes(k)) continue;
      // allow filtering by any column safely via parameterization if column name is alphanumeric
      if(!/^[a-z_]+$/.test(k)) continue;
      where+=` AND ${k} = $${idx}`;
      params.push(v); idx++;
    }
    const cnt = await q(`SELECT COUNT(*) FROM ${table}${where}`, params);
    const total = parseInt(cnt.rows[0].count);
    const rows = await q(`SELECT * FROM ${table}${where} ORDER BY ${orderBy} LIMIT $${idx} OFFSET $${idx+1}`, [...params, limit, offset]);
    res.json({ data: rows.rows, total, page, limit });
  });
  // get one
  router.get(`/${table}/:id`, async (req,res)=>{
    const r = await q(`SELECT * FROM ${table} WHERE ${pk}=$1`, [req.params.id]);
    if(!r.rows[0]) return res.status(404).json({error:'Not found'});
    res.json(r.rows[0]);
  });
  // create
  router.post(`/${table}`, async (req,res)=>{
    const body = req.body;
    // strip id
    delete body.id;
    const keys = Object.keys(body);
    if(!keys.length) return res.status(400).json({error:'Empty body'});
    const vals = keys.map((_,i)=>`$${i+1}`);
    const r = await q(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${vals.join(',')}) RETURNING *`, keys.map(k=> body[k]==='' ? null : body[k]));
    await audit(req.user?.id||null,'CREATE',table,r.rows[0][pk],null,r.rows[0],req);
    res.status(201).json(r.rows[0]);
  });
  // update
  router.put(`/${table}/:id`, async (req,res)=>{
    const body={...req.body}; delete body.id;
    const keys=Object.keys(body);
    if(!keys.length) return res.status(400).json({error:'Empty body'});
    const before = await q(`SELECT * FROM ${table} WHERE ${pk}=$1`, [req.params.id]);
    const set = keys.map((k,i)=>`${k}=$${i+1}`).join(',');
    const r = await q(`UPDATE ${table} SET ${set} WHERE ${pk}=$${keys.length+1} RETURNING *`, [...keys.map(k=> body[k]==='' ? null : body[k]), req.params.id]);
    if(!r.rows[0]) return res.status(404).json({error:'Not found'});
    await audit(req.user?.id,'UPDATE',table,req.params.id,before.rows[0],r.rows[0],req);
    res.json(r.rows[0]);
  });
  // delete
  router.delete(`/${table}/:id`, async (req,res)=>{
    const before = await q(`SELECT * FROM ${table} WHERE ${pk}=$1`, [req.params.id]);
    await q(`DELETE FROM ${table} WHERE ${pk}=$1`, [req.params.id]);
    await audit(req.user?.id,'DELETE',table,req.params.id,before.rows[0],null,req);
    res.json({ ok:true });
  });
}

// ---------- run migrations on boot ----------
async function migrate(){
  // wait for db
  for(let i=0;i<20;i++){
    try{ await q('SELECT 1'); break; }catch(e){ console.log('waiting db...',e.message); await new Promise(r=>setTimeout(r,2000)); }
  }
  const dir = path.join(__dirname,'migrations');
  const files = fs.readdirSync(dir).filter(f=>f.endsWith('.sql')).sort();
  for(const f of files){
    const sql = fs.readFileSync(path.join(dir,f),'utf8');
    console.log('migrating',f);
    try{ await q(sql); }catch(e){ console.error('migrate',f,e.message); }
  }
  // fix material_issue_items generated col needs Approval view workaround already handled in schema
  // hash admin if default bcrypt placeholder not valid
  try{
    const u = await q(`SELECT id, password_hash FROM users WHERE username='admin'`);
    if(u.rows[0]){
      // check if hash is valid bcrypt; if login fails we reset
      const isBcrypt = u.rows[0].password_hash.startsWith('$2');
      if(!isBcrypt){
        const h = await bcrypt.hash('admin123',10);
        await q(`UPDATE users SET password_hash=$1 WHERE id=$2`,[h,u.rows[0].id]);
      } else {
        // try verify admin123, if mismatch reset
        const ok = await bcrypt.compare('admin123', u.rows[0].password_hash);
        if(!ok){ const h=await bcrypt.hash('admin123',10); await q(`UPDATE users SET password_hash=$1 WHERE id=$2`,[h,u.rows[0].id]); }
      }
    }
  }catch(e){console.error(e.message)}
}

// ---------- AUTH ----------
app.post('/api/auth/login', async (req,res)=>{
  const { username, password } = req.body;
  if(!username||!password) return res.status(400).json({error:'username & password required'});
  const r = await q(`SELECT u.*, array_agg(r.name) as roles FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id WHERE u.username=$1 GROUP BY u.id`, [username]);
  const user = r.rows[0];
  if(!user) return res.status(401).json({error:'Invalid credentials'});
  const ok = await bcrypt.compare(password, user.password_hash);
  if(!ok) return res.status(401).json({error:'Invalid credentials'});
  await q(`UPDATE users SET last_login=now() WHERE id=$1`,[user.id]);
  const token = sign({ id:user.id, username:user.username, roles:user.roles });
  res.json({ token, user:{ id:user.id, username:user.username, email:user.email, branch_id:user.branch_id, roles:user.roles }});
});
app.post('/api/auth/register', async (req,res)=>{
  const { username, email, password, branch_id } = req.body;
  if(!username||!email||!password) return res.status(400).json({error:'username email password required'});
  const h = await bcrypt.hash(password,10);
  try{
    const r = await q(`INSERT INTO users (username,email,password_hash,branch_id) VALUES ($1,$2,$3,$4) RETURNING id,username,email`,[username,email,h,branch_id||1]);
    res.status(201).json(r.rows[0]);
  }catch(e){ res.status(400).json({error:e.message});}
});
app.get('/api/auth/me', auth, async (req,res)=>{
  const r = await q(`SELECT u.id,u.username,u.email,u.branch_id, array_agg(r.name) as roles FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id WHERE u.id=$1 GROUP BY u.id`,[req.user.id]);
  res.json(r.rows[0]);
});

// ---------- API router ----------
const api = express.Router();
api.use(auth);

// dashboard summary
api.get('/dashboard/summary', async (req,res)=>{
  const [so, po, stock, units, bookings, kpr, claims] = await Promise.all([
    q(`SELECT COUNT(*) c, COALESCE(SUM(total),0) s FROM sales_orders WHERE status<>'CANCELLED'`),
    q(`SELECT COUNT(*) c, COALESCE(SUM(total),0) s FROM purchase_orders WHERE status<>'CANCELLED'`),
    q(`SELECT COUNT(*) c, COALESCE(SUM(qty_on_hand*avg_cost),0) v FROM stocks`),
    q(`SELECT sale_status, COUNT(*) c FROM property_units GROUP BY sale_status`),
    q(`SELECT status, COUNT(*) c FROM bookings GROUP BY status`),
    q(`SELECT status, COUNT(*) c FROM kpr_applications GROUP BY status`),
    q(`SELECT COUNT(*) c FROM stock_movements WHERE movement_date > now() - interval '30 days'`),
  ]);
  const ar = await q(`SELECT COALESCE(SUM(outstanding),0) s FROM invoices WHERE status IN ('SENT','PARTIAL','OVERDUE')`);
  const ap = await q(`SELECT COALESCE(SUM(total),0) s FROM purchase_orders WHERE status IN ('APPROVED','PARTIAL')`);
  res.json({
    sales: so.rows[0], purchase: po.rows[0], stock: stock.rows[0],
    units: units.rows, bookings: bookings.rows, kpr: kpr.rows,
    movements30d: claims.rows[0].c,
    ar: ar.rows[0].s, ap: ap.rows[0].s
  });
});

// approval actions
api.post('/approvals/:id/decide', async (req,res)=>{
  const { status, reason } = req.body; // APPROVED / REJECTED
  const r = await q(`UPDATE approvals SET status=$1, reason=$2, decided_at=now() WHERE id=$3 RETURNING *`,[status, reason, req.params.id]);
  res.json(r.rows[0]);
});
api.get('/approvals', async (req,res)=>{
  const r = await q(`SELECT * FROM approvals ORDER BY created_at DESC LIMIT 100`);
  res.json(r.rows);
});

// stock movement helper: POST /api/stock-move
api.post('/stock-move', async (req,res)=>{
  const { product_id, warehouse_id, movement_type, qty, reference_type, reference_id, unit_cost } = req.body;
  if(!product_id||!warehouse_id||!movement_type||!qty) return res.status(400).json({error:'missing fields'});
  const qty_in = movement_type==='IN' ? qty : 0;
  const qty_out = movement_type==='OUT' ? qty : 0;
  // compute balance
  const bal = await q(`SELECT COALESCE(SUM(qty_in - qty_out),0) as bal FROM stock_movements WHERE product_id=$1 AND warehouse_id=$2`,[product_id, warehouse_id]);
  const balance = parseFloat(bal.rows[0].bal) + parseFloat(qty_in) - parseFloat(qty_out);
  const r = await q(`INSERT INTO stock_movements (product_id,warehouse_id,movement_type,reference_type,reference_id,qty_in,qty_out,unit_cost,balance_qty,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [product_id, warehouse_id, movement_type, reference_type, reference_id, qty_in, qty_out, unit_cost||0, balance, req.user.id]);
  // update stocks table
  await q(`INSERT INTO stocks (product_id,warehouse_id,qty_on_hand,avg_cost) VALUES ($1,$2,$3,$4)
    ON CONFLICT (product_id,warehouse_id,COALESCE(bin_id,0),COALESCE(batch_no,'')) DO UPDATE SET qty_on_hand = stocks.qty_on_hand + EXCLUDED.qty_on_hand - $5, last_updated=now()`,
    [product_id, warehouse_id, parseFloat(qty_in)-parseFloat(qty_out), unit_cost||0, parseFloat(qty_out)]);
  // actually simpler: upsert by product+warehouse
  // fallback: ensure stock row exists then update
  try{
    await q(`UPDATE stocks SET qty_on_hand = (SELECT COALESCE(SUM(qty_in - qty_out),0) FROM stock_movements WHERE product_id=$1 AND warehouse_id=$2) WHERE product_id=$1 AND warehouse_id=$2`,[product_id, warehouse_id]);
  }catch(e){}
  res.status(201).json(r.rows[0]);
});

// material issue over-run check
api.post('/material-issues/check-overrun', async (req,res)=>{
  const { unit_id, product_id, issued_qty } = req.body;
  if(!unit_id||!product_id||!issued_qty) return res.status(400).json({error:'unit_id product_id issued_qty required'});
  // get house_type via property_units
  const u = await q(`SELECT pu.house_type_id FROM property_units pu WHERE pu.id=$1`,[unit_id]);
  if(!u.rows[0]) return res.status(404).json({error:'unit not found'});
  const bom = await q(`SELECT total_qty_with_waste, qty_per_unit, waste_pct FROM house_type_bom WHERE house_type_id=$1 AND product_id=$2 AND is_active=true LIMIT 1`,[u.rows[0].house_type_id, product_id]);
  if(!bom.rows[0]) return res.json({ bom_qty:0, over_pct:0, needs_approval:false, message:'No BOM found, free issue' });
  const bomQty = parseFloat(bom.rows[0].total_qty_with_waste);
  const over = ((parseFloat(issued_qty)-bomQty)/bomQty*100);
  let level='OK';
  if(over>15) level='DIREKTUR';
  else if(over>5) level='PM';
  else if(over>0) level='SITE_ENGINEER';
  res.json({ bom_qty:bomQty, issued_qty: parseFloat(issued_qty), over_pct: Number(over.toFixed(2)), needs_approval: over>0, approval_level: level });
});

// MRP run
api.post('/mrp/run', async (req,res)=>{
  const { period_start, period_end, cluster_ids, planned_units } = req.body;
  // planned_units: [{house_type_id, qty}]
  if(!period_start||!period_end||!planned_units) return res.status(400).json({error:'period_start period_end planned_units required'});
  const run = await q(`INSERT INTO mrp_runs (period_start,period_end,cluster_ids,created_by,status) VALUES ($1,$2,$3,$4,'DRAFT') RETURNING *`,[period_start, period_end, JSON.stringify(cluster_ids||[]), req.user.id]);
  const runId = run.rows[0].id;
  for(const pu of planned_units){
    const boms = await q(`SELECT product_id, total_qty_with_waste FROM house_type_bom WHERE house_type_id=$1 AND is_active=true`,[pu.house_type_id]);
    for(const b of boms.rows){
      const gross = parseFloat(b.total_qty_with_waste) * parseFloat(pu.qty);
      const stock = await q(`SELECT COALESCE(SUM(qty_on_hand),0) s FROM stocks WHERE product_id=$1`,[b.product_id]);
      const onOrder = await q(`SELECT COALESCE(SUM(qty - qty_received),0) s FROM stock_transfer_details std JOIN stock_transfers st ON st.id=std.transfer_id WHERE std.product_id=$1 AND st.status='IN_TRANSIT'`,[b.product_id]);
      const onHand = parseFloat(stock.rows[0].s);
      const onOrd = parseFloat(onOrder.rows[0].s||0);
      const net = Math.max(0, gross - onHand - onOrd);
      // lead time from material_catalog or 7 days default
      const prod = await q(`SELECT p.id FROM products p WHERE p.id=$1`,[b.product_id]);
      // suggested order date = period_start - lead_time
      const leadDays = 7;
      const suggDate = new Date(period_start); suggDate.setDate(suggDate.getDate()-leadDays);
      await q(`INSERT INTO mrp_details (mrp_run_id,product_id,gross_requirement,on_hand_qty,on_order_qty,net_requirement,suggested_order_date,status) VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING')`,
        [runId, b.product_id, gross, onHand, onOrd, net, suggDate.toISOString().slice(0,10)]);
    }
  }
  const details = await q(`SELECT d.*, p.sku, p.name_id FROM mrp_details d JOIN products p ON p.id=d.product_id WHERE d.mrp_run_id=$1 ORDER BY d.net_requirement DESC`,[runId]);
  res.status(201).json({ run: run.rows[0], details: details.rows });
});

// site plan data
api.get('/site-plan/:clusterId', async (req,res)=>{
  const c = await q(`SELECT * FROM clusters WHERE id=$1`,[req.params.clusterId]);
  if(!c.rows[0]) return res.status(404).json({error:'cluster not found'});
  const blocks = await q(`SELECT * FROM cluster_blocks WHERE cluster_id=$1 ORDER BY block_code`,[req.params.clusterId]);
  const units = await q(`SELECT pu.*, ht.type_code, ht.type_name FROM property_units pu LEFT JOIN house_types ht ON ht.id=pu.house_type_id WHERE pu.cluster_id=$1 ORDER BY pu.unit_number`,[req.params.clusterId]);
  res.json({ cluster:c.rows[0], blocks:blocks.rows, units:units.rows });
});

// reports
api.get('/reports/:type', async (req,res)=>{
  const t = req.params.type;
  if(t==='sales-by-product'){
    const r = await q(`SELECT p.sku,p.name_id, SUM(sd.qty) as qty, SUM(sd.total) as total FROM so_details sd JOIN products p ON p.id=sd.product_id GROUP BY p.sku,p.name_id ORDER BY total DESC LIMIT 50`);
    return res.json(r.rows);
  }
  if(t==='stock-card'){
    const { product_id, warehouse_id, from, to } = req.query;
    let where=' WHERE 1=1', params=[], idx=1;
    if(product_id){ where+=` AND product_id=$${idx++}`; params.push(product_id)}
    if(warehouse_id){ where+=` AND warehouse_id=$${idx++}`; params.push(warehouse_id)}
    if(from){ where+=` AND movement_date >= $${idx++}`; params.push(from)}
    if(to){ where+=` AND movement_date <= $${idx++}`; params.push(to)}
    const r = await q(`SELECT * FROM stock_movements ${where} ORDER BY movement_date DESC LIMIT 200`, params);
    return res.json(r.rows);
  }
  if(t==='bom-variance'){
    const r = await q(`
      SELECT pu.unit_number, p.sku, p.name_id, b.qty_per_unit as bom_qty, COALESCE(SUM(mii.issued_qty),0) as issued, COALESCE(SUM(mii.issued_qty)-b.qty_per_unit,0) as variance
      FROM property_units pu
      JOIN house_types ht ON ht.id=pu.house_type_id
      JOIN house_type_bom b ON b.house_type_id=ht.id
      JOIN products p ON p.id=b.product_id
      LEFT JOIN material_issues mi ON mi.unit_id=pu.id
      LEFT JOIN material_issue_items mii ON mii.issue_id=mi.id AND mii.product_id=p.id
      GROUP BY pu.unit_number,p.sku,p.name_id,b.qty_per_unit
      HAVING COALESCE(SUM(mii.issued_qty),0) > 0
      ORDER BY variance DESC LIMIT 100
    `);
    return res.json(r.rows);
  }
  if(t==='kpr-pipeline'){
    const r = await q(`SELECT k.status, COUNT(*) c, COALESCE(SUM(k.loan_amount_requested),0) s FROM kpr_applications k GROUP BY k.status ORDER BY c DESC`);
    return res.json(r.rows);
  }
  res.status(404).json({error:'unknown report'});
});

// Generic CRUD for all tables (order matters: specific first, generic after)
// We expose ~50 resources; define search fields for nicer UX
const crudDefs = [
  ['companies',['code','name']], ['branches',['code','name']], ['warehouses',['code','name']], ['bin_locations',['code','name']],
  ['product_categories',['code','name']], ['units',['code','name']], ['taxes',['code','name']], ['products',['sku','name_id']], ['product_units',[]],
  ['customers',['code','name','phone']], ['suppliers',['code','name']], ['employees',['employee_code','name']], ['users',['username','email']], ['roles',['name']],
  ['sales_leads',['name','company']], ['sales_orders',['so_number']], ['so_details',[]], ['delivery_orders',['do_number']], ['do_details',[]], ['invoices',['invoice_number']], ['invoice_details',[]], ['payments',['payment_number']],
  ['purchase_orders',['po_number']], ['po_details',[]], ['goods_receipts',['grn_number']], ['grn_details',[]], ['landed_costs',['bl_number']], ['landed_cost_details',[]],
  ['stocks',[]], ['stock_movements',[]], ['stock_transfers',['transfer_number']], ['stock_transfer_details',[]], ['stock_opnames',['opname_number']],
  ['consignments',['consignment_number']], ['consignment_items',[]], ['sales_returns',['return_number']], ['sales_return_items',[]], ['claims',['claim_number']], ['price_lists',['code','name']], ['price_list_items',[]], ['customer_prices',[]],
  ['vehicles',['plate_number']], ['drivers',[]], ['trips',['trip_number']], ['vehicle_maintenance',[]],
  ['accounts',['code','name']], ['journal_entries',['entry_number']], ['journal_details',[]], ['bank_accounts',['bank_name']], ['budgets',[]], ['fixed_assets',['asset_code','name']],
  ['attendances',[]], ['payrolls',[]], ['leaves',[]],
  ['customer_tiers',['name']], ['loyalty_points',[]], ['marketplace_channels',['name']],
  ['material_catalog',['item_code','item_name_id']], ['house_types',['type_code','type_name']], ['house_type_bom',[]],
  ['clusters',['cluster_code','cluster_name']], ['cluster_blocks',['block_code']], ['property_units',['unit_number']], ['build_stages',['stage_code','stage_name']], ['unit_build_progress',[]], ['daily_progress_reports',[]],
  ['material_issues',['issue_number']], ['material_issue_items',[]], ['installed_materials',[]], ['waste_records',[]],
  ['subcontractors',['subcon_code','name']], ['subcon_contracts',['contract_number']], ['subcon_contract_terms',[]], ['subcon_claims',['claim_number']], ['subcon_claim_items',[]],
  ['banks',['bank_code','bank_name']], ['buyers',['buyer_code','full_name']], ['buyer_leads',['lead_name']], ['bookings',['booking_number']], ['payment_schedules',[]], ['kpr_applications',['application_number']], ['kpr_documents',[]],
  ['permits',['permit_code','permit_name']], ['legal_documents',[]], ['tax_payments',[]], ['qc_checklists',[]], ['unit_qc',[]], ['bast_documents',['bast_number']], ['warranties',[]], ['after_sales_complaints',['complaint_number']], ['infrastructure_items',['item_code','item_name']], ['mrp_runs',[]], ['mrp_details',[]],
  ['audit_logs',[]], ['notifications',[]],
];
crudDefs.forEach(([tbl, search])=> crud(api, tbl, { search }));

app.use('/api', api);
app.use('/api/sales', api);

// SPA fallback
app.get('*', (req,res)=>{
  const f = path.join(__dirname,'public','index.html');
  if(fs.existsSync(f)) return res.sendFile(f);
  res.send('ERP API running. Frontend not built yet. See /api');
});

// ---------- boot ----------
migrate().then(()=>{
  app.listen(PORT, ()=> console.log(`ERP v3.0 listening on http://localhost:${PORT}  DB:${DATABASE_URL}`));
}).catch(e=>{ console.error(e); process.exit(1)});
