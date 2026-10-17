import express from 'express';
import { pool } from '../../config/db.js';
import { sendReport } from '../../lib/exporters.js';
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
  await pool.query('INSERT INTO data_change_logs (table_name,record_id,field_name,old_value,new_value,changed_by,reason) VALUES (\'customer_prices\',$1,\'price\',\'\',$2,$3,\'set customer price\')',[customer_id,String(price),req.user.id]);
  res.json({ok:true});
});
router.get('/floor-prices', async(req,res)=>{
  const r=await pool.query('SELECT id, name, sku, floor_price FROM products WHERE floor_price>0 ORDER BY name');
  res.json(r.rows);
});
router.put('/floor-prices/:product_id', async(req,res)=>{
  await pool.query('UPDATE products SET floor_price=$1 WHERE id=$2',[req.body.floor_price,req.params.product_id]);
  await pool.query('INSERT INTO data_change_logs (table_name,record_id,field_name,old_value,new_value,changed_by) VALUES (\'products\',$1,\'floor_price\',\'\',$2,$3)',[req.params.product_id, String(req.body.floor_price), req.user.id]);
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

// ------------------------------------------------------------- GET /export
router.get('/export', async(req,res)=>{
  const format=String(req.query.format||'xlsx').toLowerCase();
  if(!['csv','xlsx','pdf'].includes(format)) return res.status(400).json({error:`Format tidak didukung: ${format}`});
  const dataset=String(req.query.dataset||'items');
  const num=(v)=>parseFloat(v||0)||0;
  const money=(n)=>new Intl.NumberFormat('id-ID').format(num(n));
  try{
    if(dataset==='lists'){
      const r=await pool.query(`SELECT pl.*, (SELECT COUNT(*)::int FROM price_list_items i WHERE i.price_list_id=pl.id) as item_count
        FROM price_lists pl ORDER BY pl.type, pl.name`);
      const columns=[{label:'Kode'},{label:'Nama'},{label:'Tipe'},{label:'Jumlah Item',numeric:true,total:true}];
      const rows=r.rows.map(l=>[l.code, l.name, l.type, l.item_count||0]);
      const totals=columns.map((c,i)=>c.total?rows.reduce((a,x)=>a+num(x[i]),0):'');
      return sendReport(res,{format,filename:'daftar-price-list',
        payload:{title:'Daftar Price List',subtitle:`${rows.length} price list`,columns,rows,totals,sheetName:'Price List'}});
    }
    if(dataset==='customer-prices'){
      const r=await pool.query('SELECT cp.*, p.name as product_name, p.sku, c.name as customer_name FROM customer_prices cp JOIN products p ON p.id=cp.product_id JOIN customers c ON c.id=cp.customer_id ORDER BY c.name, p.name');
      const columns=[{label:'Customer'},{label:'Produk'},{label:'SKU'},{label:'Harga Khusus',numeric:true,total:true},
        {label:'Berlaku Dari'},{label:'Berlaku Sampai'}];
      const rows=r.rows.map(cp=>[cp.customer_name, cp.product_name, cp.sku, num(cp.price),
        cp.valid_from?String(cp.valid_from).slice(0,10):'-', cp.valid_to?String(cp.valid_to).slice(0,10):'selamanya']);
      const totals=columns.map((c,i)=>c.total?rows.reduce((a,x)=>a+num(x[i]),0):'');
      return sendReport(res,{format,filename:'harga-khusus-customer',
        payload:{title:'Harga Khusus per Customer',subtitle:`${rows.length} baris`,columns,rows,totals,sheetName:'Harga Customer'}});
    }
    if(dataset==='floor'){
      const r=await pool.query('SELECT p.id, p.sku, p.name, p.floor_price, (SELECT selling_price FROM product_units u WHERE u.product_id=p.id ORDER BY u.id LIMIT 1) as selling_price FROM products p WHERE p.floor_price>0 ORDER BY p.name');
      const columns=[{label:'SKU'},{label:'Produk'},{label:'Floor Price',numeric:true},{label:'Harga Jual',numeric:true},
        {label:'Selisih',numeric:true},{label:'Margin %',numeric:true}];
      const rows=r.rows.map(p=>{ const sel=num(p.selling_price), fl=num(p.floor_price);
        return [p.sku, p.name, fl, sel, sel-fl, sel>0?((sel-fl)/sel*100):0]; });
      const totals=columns.map((c,i)=>c.total?rows.reduce((a,x)=>a+num(x[i]),0):'');
      return sendReport(res,{format,filename:'floor-price',
        payload:{title:'Floor Price & Margin',subtitle:`${rows.length} produk punya floor price`,columns,rows,totals,sheetName:'Floor Price'}});
    }
    const listId=req.query.list_id;
    const r=await pool.query(`SELECT pli.*, p.name as product_name, p.sku, pl.code as list_code, pl.name as list_name, pl.type as list_type
      FROM price_list_items pli JOIN products p ON p.id=pli.product_id JOIN price_lists pl ON pl.id=pli.price_list_id
      ${listId?'WHERE pli.price_list_id=$1':''} ORDER BY pl.type, p.name`, listId?[listId]:[]);
    const columns=[{label:'Price List'},{label:'Tipe'},{label:'SKU'},{label:'Produk'},{label:'Min Qty',numeric:true},
      {label:'Harga',numeric:true,total:true}];
    const rows=r.rows.map(it=>[it.list_code, it.list_type, it.sku, it.product_name, num(it.min_qty), num(it.price)]);
    const totals=columns.map((c,i)=>c.total?rows.reduce((a,x)=>a+num(x[i]),0):'');
    const nm=r.rows[0]? (r.rows[0].list_name+' ('+r.rows[0].list_type+')') : 'semua price list';
    return sendReport(res,{format,filename:'item-price-list',
      payload:{title:'Item Price List - '+nm,subtitle:`${rows.length} baris  |  Total harga ${money(totals[5]||0)}`,columns,rows,totals,sheetName:'Item Harga'}});
  }catch(e){
    console.error('pricing export error',e);
    res.status(500).json({error:'Gagal membuat laporan: '+e.message});
  }
});
export default router;
