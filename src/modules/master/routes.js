import express from 'express';
import { pool } from '../../config/db.js';
import { paginate } from '../../utils/helpers.js';
import { sendReport } from '../../lib/exporters.js';
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
  // stok & harga dasar diambil sekaligus (dulu: 1 query stok per baris produk)
  const data = await pool.query(
    `SELECT p.*, c.name as category_name, u.code as unit_code, t.rate as tax_rate,
            COALESCE(st.onhand,0)::float AS stock_onhand,
            COALESCE(st.available,0)::float AS stock_available,
            COALESCE(st.value,0)::float AS stock_value,
            COALESCE(st.warehouses,0)::int AS stock_warehouses,
            COALESCE(pr.selling_price,0)::float AS base_price
       FROM products p
       LEFT JOIN product_categories c ON c.id=p.category_id
       LEFT JOIN units u ON u.id=p.base_unit_id
       LEFT JOIN taxes t ON t.id=p.tax_id
       LEFT JOIN (
         SELECT product_id, SUM(qty_on_hand) onhand, SUM(qty_available) available,
                SUM(qty_on_hand*COALESCE(avg_cost,0)) value, COUNT(DISTINCT warehouse_id) warehouses
           FROM stocks GROUP BY product_id
       ) st ON st.product_id = p.id
       LEFT JOIN LATERAL (SELECT selling_price FROM product_units pu WHERE pu.product_id=p.id ORDER BY pu.id LIMIT 1) pr ON true
       ${where} ORDER BY p.id DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
    [...params, limit, offset]);
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
  const {search,type,is_active,hold}=req.query;
  let where='WHERE 1=1'; const p=[];
  if(search){ p.push('%'+search+'%'); where+=' AND (c.name ILIKE $'+p.length+' OR c.code ILIKE $'+p.length+' OR COALESCE(c.phone,\'\') ILIKE $'+p.length+')'; }
  if(type && type!=='Semua'){ p.push(type); where+=' AND UPPER(c.type)=UPPER($'+p.length+')'; }
  if(is_active==='true'||is_active==='false'){ p.push(is_active==='true'); where+=' AND c.is_active=$'+p.length; }
  if(hold==='true'){ where+=' AND c.is_hold = true'; }
  try{
    const cnt=await pool.query('SELECT COUNT(*) FROM customers c '+where,p);
    // statistik penjualan & piutang diambil sekaligus supaya kartu pelanggan berguna
    const data=await pool.query(
      `SELECT c.*,
              COALESCE(inv.total_sales,0)::float AS total_sales,
              COALESCE(inv.outstanding,0)::float AS outstanding,
              inv.last_invoice, inv.invoice_count,
              COALESCE(so.so_count,0)::int AS so_count
         FROM customers c
         LEFT JOIN (
           SELECT customer_id, SUM(total) AS total_sales,
                  SUM(CASE WHEN UPPER(TRIM(status)) NOT IN ('PAID','CANCELLED','VOID','LUNAS')
                           THEN COALESCE(total,0)-COALESCE(paid_amount,0) ELSE 0 END) AS outstanding,
                  MAX(invoice_date) AS last_invoice, COUNT(*)::int AS invoice_count
             FROM invoices GROUP BY customer_id
         ) inv ON inv.customer_id = c.id
         LEFT JOIN (SELECT customer_id, COUNT(*)::int AS so_count FROM sales_orders GROUP BY customer_id) so ON so.customer_id = c.id
         ${where} ORDER BY c.id DESC LIMIT $${p.length+1} OFFSET $${p.length+2}`, [...p,limit,offset]);
    res.json({ data:data.rows, total:parseInt(cnt.rows[0].count) });
  }catch(e){ res.status(500).json({error:e.message}); }
});
router.post('/customers', async (req,res)=>{
  const {code,name,type,address,phone,email,credit_limit,payment_term_days,npwp}=req.body||{};
  if(!code || !name) return res.status(400).json({error:'Kode dan nama pelanggan wajib diisi'});
  try{
    const dup=await pool.query('SELECT id FROM customers WHERE code=$1',[code]);
    if(dup.rows[0]) return res.status(409).json({error:'Kode pelanggan '+code+' sudah dipakai'});
    const r=await pool.query(
      `INSERT INTO customers (code,name,type,address,phone,email,credit_limit,payment_term_days,npwp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [code, name, (type||'RETAIL').toUpperCase(), address||null, phone||null, email||null,
       parseFloat(credit_limit)||0, parseInt(payment_term_days)||0, npwp||null]);
    res.json(r.rows[0]);
  }catch(e){ res.status(500).json({error:e.message}); }
});
router.get('/customers/:id', async (req,res)=>{
  try{
    const r=await pool.query('SELECT * FROM customers WHERE id=$1',[req.params.id]);
    if(!r.rows[0]) return res.status(404).json({error:'Pelanggan tidak ditemukan'});
    const stats=await pool.query(
      `SELECT COALESCE(SUM(total),0)::float AS total_sales,
              COALESCE(SUM(CASE WHEN UPPER(TRIM(status)) NOT IN ('PAID','CANCELLED','VOID','LUNAS')
                                THEN COALESCE(total,0)-COALESCE(paid_amount,0) ELSE 0 END),0)::float AS outstanding,
              COUNT(*)::int AS invoice_count FROM invoices WHERE customer_id=$1`, [req.params.id]);
    const invoices=await pool.query(
      `SELECT id, invoice_number, invoice_date, total, status FROM invoices WHERE customer_id=$1 ORDER BY id DESC LIMIT 10`, [req.params.id]);
    const orders=await pool.query(
      `SELECT id, so_number, so_date, total, status FROM sales_orders WHERE customer_id=$1 ORDER BY id DESC LIMIT 10`, [req.params.id]);
    const points=await pool.query('SELECT points_balance, lifetime_points FROM loyalty_points WHERE customer_id=$1',[req.params.id]);
    res.json({ ...r.rows[0], ...stats.rows[0], invoices:invoices.rows, orders:orders.rows, loyalty:points.rows[0]||null });
  }catch(e){ res.status(500).json({error:e.message}); }
});
router.put('/customers/:id', async (req,res)=>{
  const f=['name','type','address','phone','email','credit_limit','payment_term_days','is_active','npwp','is_hold','hold_reason'];
  const sets=[]; const vals=[]; let i=1;
  try{
    for(const k of f) if(req.body[k]!==undefined){
      sets.push(k+'=$'+i);
      vals.push(k==='type' ? String(req.body[k]).toUpperCase() : k==='credit_limit' ? (parseFloat(req.body[k])||0) : req.body[k]);
      i++;
    }
    if(!sets.length) return res.status(400).json({error:'Tidak ada perubahan'});
    vals.push(req.params.id);
    await pool.query('UPDATE customers SET '+sets.join(',')+' WHERE id=$'+i, vals);
    res.json({ok:true});
  }catch(e){ res.status(500).json({error:e.message}); }
});
router.get('/suppliers', async (req,res)=>{
  const {limit,offset}=paginate(req);
  const {search,is_active}=req.query;
  let where='WHERE 1=1'; const p=[];
  if(search){ p.push('%'+search+'%'); where+=' AND (s.name ILIKE $'+p.length+' OR s.code ILIKE $'+p.length+' OR COALESCE(s.phone,\'\') ILIKE $'+p.length+')'; }
  if(is_active==='true'||is_active==='false'){ p.push(is_active==='true'); where+=' AND s.is_active=$'+p.length; }
  try{
    const cnt=await pool.query('SELECT COUNT(*) FROM suppliers s '+where,p);
    const data=await pool.query(
      `SELECT s.*,
              COALESCE(po.po_count,0)::int AS po_count,
              COALESCE(po.po_value,0)::float AS po_value,
              COALESCE(po.outstanding,0)::float AS outstanding,
              po.last_po
         FROM suppliers s
         LEFT JOIN (
           SELECT supplier_id, COUNT(*)::int AS po_count, SUM(total) AS po_value,
                  SUM(CASE WHEN status NOT IN ('RECEIVED','CANCELLED') THEN COALESCE(total,0) ELSE 0 END) AS outstanding,
                  MAX(po_date) AS last_po
             FROM purchase_orders GROUP BY supplier_id
         ) po ON po.supplier_id = s.id
         ${where} ORDER BY s.id DESC LIMIT $${p.length+1} OFFSET $${p.length+2}`, [...p,limit,offset]);
    res.json({data:data.rows, total:parseInt(cnt.rows[0].count)});
  }catch(e){ res.status(500).json({error:e.message}); }
});
router.post('/suppliers', async (req,res)=>{
  const {code,name,address,phone,email,payment_term_days,npwp,rating}=req.body||{};
  if(!code || !name) return res.status(400).json({error:'Kode dan nama supplier wajib diisi'});
  try{
    const dup=await pool.query('SELECT id FROM suppliers WHERE code=$1',[code]);
    if(dup.rows[0]) return res.status(409).json({error:'Kode supplier '+code+' sudah dipakai'});
    const r=await pool.query(
      `INSERT INTO suppliers (code,name,address,phone,email,payment_term_days,npwp,rating)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [code, name, address||null, phone||null, email||null, parseInt(payment_term_days)||0, npwp||null, parseFloat(rating)||null]);
    res.json(r.rows[0]);
  }catch(e){ res.status(500).json({error:e.message}); }
});
router.get('/suppliers/:id', async (req,res)=>{
  try{
    const r=await pool.query('SELECT * FROM suppliers WHERE id=$1',[req.params.id]);
    if(!r.rows[0]) return res.status(404).json({error:'Supplier tidak ditemukan'});
    const stats=await pool.query(
      `SELECT COUNT(*)::int AS po_count, COALESCE(SUM(total),0)::float AS po_value,
              COALESCE(SUM(CASE WHEN status NOT IN ('RECEIVED','CANCELLED') THEN COALESCE(total,0) ELSE 0 END),0)::float AS outstanding
         FROM purchase_orders WHERE supplier_id=$1`,[req.params.id]);
    const orders=await pool.query(
      `SELECT id, po_number, po_date, total, status FROM purchase_orders WHERE supplier_id=$1 ORDER BY id DESC LIMIT 10`,[req.params.id]);
    const items=await pool.query(
      `SELECT DISTINCT p.id, p.name, p.sku FROM po_details pd JOIN purchase_orders po ON po.id=pd.po_id
         JOIN products p ON p.id=pd.product_id WHERE po.supplier_id=$1 LIMIT 20`,[req.params.id]);
    res.json({ ...r.rows[0], ...stats.rows[0], orders:orders.rows, products:items.rows });
  }catch(e){ res.status(500).json({error:e.message}); }
});
router.put('/suppliers/:id', async (req,res)=>{
  const f=['name','address','phone','email','payment_term_days','is_active','npwp','rating'];
  const sets=[]; const vals=[]; let i=1;
  try{
    for(const k of f) if(req.body[k]!==undefined){
      sets.push(k+'=$'+i);
      vals.push(k==='rating' ? (parseFloat(req.body[k])||null) : k==='payment_term_days' ? (parseInt(req.body[k])||0) : req.body[k]);
      i++;
    }
    if(!sets.length) return res.status(400).json({error:'Tidak ada perubahan'});
    vals.push(req.params.id);
    await pool.query('UPDATE suppliers SET '+sets.join(',')+' WHERE id=$'+i, vals);
    res.json({ok:true});
  }catch(e){ res.status(500).json({error:e.message}); }
});
// ------------------------------------------- GET /master/export (pelanggan/supplier)
router.get('/export', async (req,res)=>{
  const format=String(req.query.format||'xlsx').toLowerCase();
  if(!['csv','xlsx','pdf'].includes(format)) return res.status(400).json({error:`Format tidak didukung: ${format}`});
  const dataset=String(req.query.dataset||'customers');
  const money=(n)=>new Intl.NumberFormat('id-ID').format(parseFloat(n||0)||0);
  try{
    if(dataset==='suppliers'){
      const r=await pool.query(
        `SELECT s.*, COALESCE(po.po_count,0)::int AS po_count, COALESCE(po.po_value,0)::float AS po_value, po.last_po
           FROM suppliers s LEFT JOIN (
             SELECT supplier_id, COUNT(*)::int AS po_count, SUM(total) AS po_value, MAX(po_date) AS last_po
               FROM purchase_orders GROUP BY supplier_id) po ON po.supplier_id=s.id
          ORDER BY s.name LIMIT 5000`);
      const columns=[{label:'Kode'},{label:'Nama'},{label:'NPWP'},{label:'Telepon'},{label:'Email'},{label:'Termin (hari)',numeric:true},
        {label:'Rating',numeric:true},{label:'Jumlah PO',numeric:true,total:true},{label:'Nilai PO',numeric:true,total:true},
        {label:'PO Terakhir'},{label:'Status'}];
      const rows=r.rows.map(s=>[s.code, s.name, s.npwp||'-', s.phone||'-', s.email||'-', parseInt(s.payment_term_days)||0,
        parseFloat(s.rating)||0, s.po_count||0, parseFloat(s.po_value)||0, s.last_po?String(s.last_po).slice(0,10):'-',
        s.is_active?'AKTIF':'NONAKTIF']);
      const totals=columns.map((c,i)=>c.total?rows.reduce((a,x)=>a+(parseFloat(x[i])||0),0):'');
      return sendReport(res,{format,filename:'daftar-supplier',
        payload:{title:'Daftar Supplier',subtitle:`${rows.length} supplier  |  Total nilai PO ${money(totals[8]||0)}`,columns,rows,totals,sheetName:'Supplier'}});
    }
    const r=await pool.query(
      `SELECT c.*, COALESCE(inv.total_sales,0)::float AS total_sales, COALESCE(inv.outstanding,0)::float AS outstanding, inv.last_invoice
         FROM customers c LEFT JOIN (
           SELECT customer_id, SUM(total) AS total_sales,
                  SUM(CASE WHEN UPPER(TRIM(status)) NOT IN ('PAID','CANCELLED','VOID','LUNAS')
                           THEN COALESCE(total,0)-COALESCE(paid_amount,0) ELSE 0 END) AS outstanding,
                  MAX(invoice_date) AS last_invoice
             FROM invoices GROUP BY customer_id) inv ON inv.customer_id=c.id
        ORDER BY c.name LIMIT 5000`);
    const columns=[{label:'Kode'},{label:'Nama'},{label:'Tipe'},{label:'Telepon'},{label:'Email'},{label:'Kota/Alamat'},
      {label:'Limit Kredit',numeric:true,total:true},{label:'Termin (hari)',numeric:true},{label:'Total Penjualan',numeric:true,total:true},
      {label:'Piutang Terbuka',numeric:true,total:true},{label:'Invoice Terakhir'},{label:'Status'}];
    const rows=r.rows.map(c=>[c.code, c.name, (c.type||'-').toUpperCase(), c.phone||'-', c.email||'-',
      (c.address||'-').slice(0,60), parseFloat(c.credit_limit)||0, parseInt(c.payment_term_days)||0,
      c.total_sales||0, c.outstanding||0, c.last_invoice?String(c.last_invoice).slice(0,10):'-',
      c.is_active? (c.is_hold? 'HOLD':'AKTIF') : 'NONAKTIF']);
    const totals=columns.map((c,i)=>c.total?rows.reduce((a,x)=>a+(parseFloat(x[i])||0),0):'');
    return sendReport(res,{format,filename:'daftar-pelanggan',
      payload:{title:'Daftar Pelanggan',subtitle:`${rows.length} pelanggan  |  Piutang terbuka ${money(totals[9]||0)}`,columns,rows,totals,sheetName:'Pelanggan'}});
  }catch(e){
    console.error('master export error',e);
    res.status(500).json({error:'Gagal membuat laporan: '+e.message});
  }
});
router.get('/taxes', async (req,res)=>{ const r=await pool.query('SELECT * FROM taxes'); res.json(r.rows); });
router.get('/accounts', async (req,res)=>{ const r=await pool.query('SELECT * FROM accounts ORDER BY code'); res.json(r.rows); });

export default router;
