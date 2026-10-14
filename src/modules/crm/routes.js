import express from 'express';
import { pool } from '../../config/db.js';
import { paginate } from '../../utils/helpers.js';
const router = express.Router();

// Ensure 006 columns exist even if server belum restart / migrasi belum jalan
let crmColumnsEnsured = false;
async function ensureCrmColumns(){
  if(crmColumnsEnsured) return;
  try{
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_so_id INT REFERENCES sales_orders(id)`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_at TIMESTAMP`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_by INT REFERENCES users(id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_converted ON leads(converted_so_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_status_converted ON leads(status, converted_so_id)`);
    crmColumnsEnsured = true;
  }catch(e){
    // jangan block request, fallback query tanpa kolom
    console.error('[crm ensure] ', e.message);
  }
}

router.get('/leads', async (req,res)=>{
  await ensureCrmColumns();
  const {limit,offset}=paginate(req);
  const status=req.query.status;
  const search=(req.query.search||'').trim();
  let where='WHERE 1=1'; const p=[];
  if(status){ p.push(status); where+=' AND l.status=$'+p.length; }
  if(search){ p.push('%'+search+'%'); where+=' AND (l.name ILIKE $'+p.length+' OR l.company ILIKE $'+p.length+' OR l.phone ILIKE $'+p.length+')'; }
  try{
    const cnt=await pool.query('SELECT COUNT(*) FROM leads l '+where,p);
    const data=await pool.query('SELECT l.*, u.username as assigned_name, so.so_number as converted_so_number FROM leads l LEFT JOIN users u ON u.id=l.assigned_to LEFT JOIN sales_orders so ON so.id=l.converted_so_id '+where+' ORDER BY l.id DESC LIMIT $'+(p.length+1)+' OFFSET $'+(p.length+2), [...p,limit,offset]);
    res.json({data:data.rows, total:parseInt(cnt.rows[0].count)});
  }catch(e){
    // fallback jika kolom belum ada (42703 undefined_column)
    if(e.code==='42703'){
      const cnt2=await pool.query('SELECT COUNT(*) FROM leads '+where,p);
      const data2=await pool.query('SELECT l.*, u.username as assigned_name, NULL::text as converted_so_number, NULL::int as converted_so_id FROM leads l LEFT JOIN users u ON u.id=l.assigned_to '+where+' ORDER BY l.id DESC LIMIT $'+(p.length+1)+' OFFSET $'+(p.length+2), [...p,limit,offset]);
      return res.json({data:data2.rows, total:parseInt(cnt2.rows[0].count)});
    }
    console.error('[crm leads]',e);
    res.status(500).json({error:e.message});
  }
});

router.get('/pipeline', async (req,res)=>{
  try{
    const r=await pool.query("SELECT status, COUNT(*) as count, COALESCE(SUM(expected_value),0) as value FROM leads GROUP BY status ORDER BY CASE status WHEN 'NEW' THEN 1 WHEN 'CONTACTED' THEN 2 WHEN 'QUALIFIED' THEN 3 WHEN 'PROPOSAL' THEN 4 WHEN 'WON' THEN 5 ELSE 6 END");
    res.json(r.rows.map(x=>({...x, count:parseInt(x.count), value:parseFloat(x.value)})));
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.get('/leads/:id', async (req,res)=>{
  await ensureCrmColumns();
  try{
    const r=await pool.query('SELECT l.*, so.so_number as converted_so_number FROM leads l LEFT JOIN sales_orders so ON so.id=l.converted_so_id WHERE l.id=$1',[req.params.id]);
    if(!r.rows[0]) return res.status(404).json({error:'Lead not found'});
    res.json(r.rows[0]);
  }catch(e){
    if(e.code==='42703'){
      const r2=await pool.query('SELECT l.* FROM leads l WHERE l.id=$1',[req.params.id]);
      if(!r2.rows[0]) return res.status(404).json({error:'Lead not found'});
      return res.json(r2.rows[0]);
    }
    res.status(500).json({error:e.message});
  }
});

router.post('/leads', async (req,res)=>{
  try{
    const {name,company,phone,email,source,expected_value,assigned_to,notes}=req.body;
    if(!name) return res.status(400).json({error:'Nama wajib'});
    const r=await pool.query('INSERT INTO leads (name,company,phone,email,source,expected_value,assigned_to,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[name,company,phone,email,source,expected_value||0,assigned_to,notes]);
    res.json(r.rows[0]);
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.put('/leads/:id', async (req,res)=>{
  try{
    const {status}=req.body;
    const allowed=['NEW','CONTACTED','QUALIFIED','PROPOSAL','WON','LOST'];
    if(status && !allowed.includes(status)) return res.status(400).json({error:'Status tidak valid'});
    await pool.query('UPDATE leads SET status=$1 WHERE id=$2',[status, req.params.id]);
    res.json({ok:true});
  }catch(e){ res.status(500).json({error:e.message}); }
});

// V1 proper: WON -> SO converter (toko bangunan)
router.post('/leads/:id/convert', async (req,res)=>{
  await ensureCrmColumns();
  const leadId=parseInt(req.params.id);
  if(!leadId) return res.status(400).json({error:'id tidak valid'});
  const {customer_id: bodyCustomerId, items: bodyItems, discount, notes: bodyNotes, delivery_date} = req.body||{};
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const leadRes=await client.query('SELECT * FROM leads WHERE id=$1 FOR UPDATE',[leadId]);
    const lead=leadRes.rows[0];
    if(!lead) { await client.query('ROLLBACK'); return res.status(404).json({error:'Lead not found'}); }
    // idempotent: sudah pernah convert
    if(lead.converted_so_id){
      const so=await client.query('SELECT id, so_number, status FROM sales_orders WHERE id=$1',[lead.converted_so_id]);
      await client.query('ROLLBACK');
      return res.json({ok:true, already:true, so_id: lead.converted_so_id, so_number: so.rows[0]?.so_number, status: so.rows[0]?.status});
    }
    if(['LOST'].includes(lead.status)){
      await client.query('ROLLBACK');
      return res.status(400).json({error:'Lead sudah LOST tidak bisa dikonversi'});
    }

    let customerId = bodyCustomerId ? parseInt(bodyCustomerId) : null;
    let customerRow=null;
    if(customerId){
      const cr=await client.query('SELECT id, name, phone, code FROM customers WHERE id=$1',[customerId]);
      if(!cr.rows[0]){ await client.query('ROLLBACK'); return res.status(400).json({error:'Customer tidak ditemukan'}); }
      customerRow=cr.rows[0];
    } else {
      const phone=(lead.phone||'').trim();
      if(phone){
        const norm=phone.replace(/\D/g,'');
        if(norm){
          const cr=await client.query("SELECT id, name, phone, code FROM customers WHERE regexp_replace(phone,'\\D','','g')=$1 LIMIT 1",[norm]);
          if(cr.rows[0]) { customerRow=cr.rows[0]; customerId=cr.rows[0].id; }
        }
      }
      if(!customerId){
        // auto create customer dari lead — retry code jika collision
        let tries=0; let ins=null;
        while(tries<3){
          const code='C'+String(Date.now()+tries).slice(-6) + String(Math.floor(Math.random()*10));
          const name=(lead.company && lead.company.trim() ? lead.company.trim() : lead.name) || 'Pelanggan Lead #'+lead.id;
          try{
            ins=await client.query('INSERT INTO customers (code,name,type,address,phone,email,credit_limit,payment_term_days) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, name, phone, code',[code, name, 'retail', lead.company||'', lead.phone||'', lead.email||'', 50000000, 14]);
            break;
          }catch(e){
            if(e.code==='23505'){ tries++; continue; }
            throw e;
          }
        }
        if(!ins) throw new Error('Gagal buat customer');
        customerId=ins.rows[0].id;
        customerRow=ins.rows[0];
      }
    }

    let items = Array.isArray(bodyItems) ? bodyItems.filter(it=> it.product_id && parseFloat(it.qty)>0) : [];
    if(items.length===0){
      const prod=await client.query("SELECT id FROM products WHERE sku='SEM-001' LIMIT 1");
      const prodId = prod.rows[0]?.id || 1;
      const unitPrice = lead.expected_value ? Math.max(1000, Math.round(parseFloat(lead.expected_value))) : 1000000;
      items=[{product_id: prodId, qty:1, unit_price: unitPrice, unit_id:1}];
    }
    for(const it of items){
      const pr=await client.query('SELECT id FROM products WHERE id=$1',[it.product_id]);
      if(!pr.rows[0]){ await client.query('ROLLBACK'); return res.status(400).json({error:'Produk id '+it.product_id+' tidak ditemukan'}); }
      if(!it.unit_id) it.unit_id=1;
      const pu = parseFloat(it.unit_price);
      if(isNaN(pu) || pu<=0){ await client.query('ROLLBACK'); return res.status(400).json({error:'Harga produk '+it.product_id+' tidak valid'}); }
      it.qty=parseFloat(it.qty);
      it.unit_price=pu;
      // normalisasi unit_id jika tidak ada di product_units, fallback 1
      const uChk=await client.query('SELECT id FROM units WHERE id=$1',[it.unit_id]);
      if(!uChk.rows[0]) it.unit_id=1;
    }

    let subtotal=0;
    for(const it of items) subtotal+= it.qty * it.unit_price;
    let discRaw = parseFloat(discount);
    let disc = isNaN(discRaw) ? 0 : discRaw;
    if(disc<0 || disc>subtotal) { await client.query('ROLLBACK'); return res.status(400).json({error:'Diskon tidak valid'}); }
    const tax=(subtotal-disc)*0.11;
    const total=subtotal-disc+tax;
    const status = subtotal>0 && disc/subtotal > 0.1 ? 'PENDING' : 'APPROVED';
    const branchId = req.user.branch_id || 1;
    let warehouseId=1;
    try{
      const wh=await client.query('SELECT id FROM warehouses WHERE branch_id=$1 AND is_active=true ORDER BY id LIMIT 1',[branchId]);
      if(wh.rows[0]) warehouseId=wh.rows[0].id;
    }catch{}
    const so_number='SO-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+String(Math.floor(Math.random()*9000+1000));
    const soNotes=((bodyNotes||'') + (lead.company? ' [Lead '+(lead.company)+' - '+lead.name+']' : ' [Lead '+lead.name+']') + (lead.phone? ' '+lead.phone:'')).trim().slice(0,500);

    const insSO=await client.query('INSERT INTO sales_orders (so_number, customer_id, branch_id, so_date, delivery_date, status, subtotal, discount, tax, total, notes, created_by) VALUES ($1,$2,$3,CURRENT_DATE,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',[so_number, customerId, branchId, delivery_date||null, status, subtotal, disc, tax, total, soNotes, req.user.id]);
    const soId=insSO.rows[0].id;

    for(const it of items){
      const lineTotal= it.qty * it.unit_price - (parseFloat(it.discount_amt||0) || 0);
      const lineTax= lineTotal*0.11;
      await client.query('INSERT INTO so_details (so_id, product_id, unit_id, qty, unit_price, discount_pct, discount_amt, tax_amt, total) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',[soId, it.product_id, it.unit_id, it.qty, it.unit_price, it.discount_pct||0, it.discount_amt||0, lineTax, lineTotal+lineTax]);
      // upsert stocks qty_reserved — jika row belum ada, buat 0 lalu update
      const upd=await client.query('UPDATE stocks SET qty_reserved = qty_reserved + $1 WHERE product_id=$2 AND warehouse_id=$3',[it.qty, it.product_id, warehouseId]);
      if(upd.rowCount===0){
        // buat stok placeholder jika belum ada (toko: produk baru belum stok di gudang cabang)
        await client.query('INSERT INTO stocks (product_id, warehouse_id, qty_on_hand, qty_reserved, avg_cost) VALUES ($1,$2,0,$3,0) ON CONFLICT DO NOTHING',[it.product_id, warehouseId, it.qty]);
        // fallback kedua: jika insert conflict karena batch_no null unique, coba update lagi
        await client.query('UPDATE stocks SET qty_reserved = qty_reserved + $1 WHERE product_id=$2 AND warehouse_id=$3',[0, it.product_id, warehouseId]);
      }
      await client.query("INSERT INTO stock_movements (product_id, warehouse_id, movement_type, reference_type, reference_id, qty_out, balance_qty, created_by) VALUES ($1,$2,'OUT','SO',$3,$4,0,$5)",[it.product_id, warehouseId, soId, it.qty, req.user.id]);
    }

    await client.query('UPDATE leads SET status=$1, converted_so_id=$2, converted_at=NOW(), converted_by=$3 WHERE id=$4',['WON', soId, req.user.id, leadId]);
    await client.query('COMMIT');
    res.json({ok:true, so_id: soId, so_number, status, customer_id: customerId, customer_name: customerRow?.name, total});
  }catch(e){
    try{ await client.query('ROLLBACK'); }catch{}
    console.error('[crm convert] err',e);
    res.status(500).json({error:e.message});
  }finally{
    client.release();
  }
});

export default router;
