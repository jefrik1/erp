import express from 'express';
import { pool } from '../../config/db.js';
import { paginate } from '../../utils/helpers.js';
const router = express.Router();

// Plan B: DO estimasi muatan & biaya zona (idempotent)
let deliveryEstEnsured=false;
async function ensureDeliveryEst(){
  if(deliveryEstEnsured) return;
  try{
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS distance_km DECIMAL(10,2)`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS delivery_lat DECIMAL(10,7)`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS delivery_lng DECIMAL(10,7)`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS delivery_address TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS delivery_lat DECIMAL(10,7)`).catch(()=>{});
    await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS delivery_lng DECIMAL(10,7)`).catch(()=>{});
    await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS lat DECIMAL(10,7)`).catch(()=>{});
    await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS lng DECIMAL(10,7)`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS est_weight_ton DECIMAL(10,2)`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS est_volume_m3 DECIMAL(10,2)`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS est_zone VARCHAR(50)`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS est_cost DECIMAL(15,2)`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS est_cost_dalam DECIMAL(15,2)`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS est_cost_luar DECIMAL(15,2)`).catch(()=>{});
    await pool.query(`UPDATE delivery_orders SET est_cost_dalam = COALESCE(est_cost_dalam, 150000 + COALESCE(est_weight_ton,0)*120000) WHERE est_cost_dalam IS NULL AND est_weight_ton IS NOT NULL`).catch(()=>{});
    await pool.query(`UPDATE delivery_orders SET est_cost_luar  = COALESCE(est_cost_luar, 600000 + COALESCE(est_weight_ton,0)*350000) WHERE est_cost_luar IS NULL AND est_weight_ton IS NOT NULL`).catch(()=>{});
    deliveryEstEnsured=true;
  }catch{}
}
function estZoneFromKm(km, override){
  if(override) return override;
  if(km==null || isNaN(km)) return 'Bekasi';
  if(km<=15) return 'Bekasi';
  if(km<=40) return 'Jakarta';
  return 'Luar Kota';
}
function tarifForZone(z){
  if(z==='Jakarta') return {flat:250000, perTon:180000};
  if(z==='Luar Kota') return {flat:600000, perTon:350000};
  return {flat:150000, perTon:120000};
}
const ORIGIN = { lat: -6.8392646, lng: 111.9838451 };
function haversineKm(a,b,c,d){ const R=6371, dLat=(c-a)*Math.PI/180, dLng=(d-b)*Math.PI/180; const s=Math.sin(dLat/2)**2 + Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(dLng/2)**2; return R*2*Math.atan2(Math.sqrt(s),Math.sqrt(1-s)); }
function tarifDalamForVehicle(v){
  const flat=parseFloat(v?.tarif_dalam_flat); const per=parseFloat(v?.tarif_dalam_per_ton);
  return {flat:(isFinite(flat)&&flat>0?flat:150000), perTon:(isFinite(per)&&per>0?per:120000)};
}
function tarifLuarForVehicle(v){
  const flat=parseFloat(v?.tarif_luar_flat); const per=parseFloat(v?.tarif_luar_per_ton);
  return {flat:(isFinite(flat)&&flat>0?flat:600000), perTon:(isFinite(per)&&per>0?per:350000)};
}
function estCostForVehicle(w, v){
  const td=tarifDalamForVehicle(v), tl=tarifLuarForVehicle(v);
  return { dalam: Math.round(td.flat + w*td.perTon), luar: Math.round(tl.flat + w*tl.perTon) };
}

router.get('/orders', async (req,res)=>{
  const {limit,offset}=paginate(req);
  const status=req.query.status;
  const search=req.query.search||'';
  const source=req.query.source||'';
  let where='WHERE 1=1'; const p=[];
  if(status){ p.push(status); where+=' AND so.status=$'+p.length; }
  if(source==='pos'){ where+=" AND so.so_number LIKE 'SO-POS-%'"; }
  if(search){ p.push('%'+search+'%'); where+=' AND (so.so_number ILIKE $'+p.length+' OR c.name ILIKE $'+p.length+' OR c.code ILIKE $'+p.length+')'; }
  const cnt=await pool.query('SELECT COUNT(*) FROM sales_orders so JOIN customers c ON c.id=so.customer_id '+where,p);
  const data=await pool.query("SELECT so.*, c.name as customer_name, c.code as customer_code, b.name as branch_name, CASE WHEN so.so_number LIKE 'SO-POS-%' THEN true ELSE false END as is_pos FROM sales_orders so JOIN customers c ON c.id=so.customer_id LEFT JOIN branches b ON b.id=so.branch_id "+where+" ORDER BY so.id DESC LIMIT $"+(p.length+1)+" OFFSET $"+(p.length+2), [...p,limit,offset]);
  res.json({data:data.rows, total:parseInt(cnt.rows[0].count)});
});
router.get('/orders/:id', async (req,res)=>{
  const so=await pool.query('SELECT so.*, c.name as customer_name, c.phone as customer_phone, c.code as customer_code FROM sales_orders so JOIN customers c ON c.id=so.customer_id WHERE so.id=$1',[req.params.id]);
  if(!so.rows[0]) return res.status(404).json({error:'Not found'});
  const details=await pool.query('SELECT d.*, p.name as product_name, p.sku, u.code as unit_code FROM so_details d JOIN products p ON p.id=d.product_id LEFT JOIN units u ON u.id=d.unit_id WHERE d.so_id=$1',[req.params.id]);
  const inv=await pool.query('SELECT * FROM invoices WHERE so_id=$1 ORDER BY id DESC LIMIT 1',[req.params.id]);
  const dos=await pool.query('SELECT * FROM delivery_orders WHERE so_id=$1 ORDER BY id DESC',[req.params.id]);
  res.json({...so.rows[0], details: details.rows, invoice: inv.rows[0]||null, deliveries: dos.rows});
});
router.post('/orders', async (req,res)=>{
  await ensureDeliveryEst();
  const {customer_id, branch_id, delivery_date, delivery_address, delivery_lat, delivery_lng, notes, items, discount, discount_percent, voucher_code, dp_percent} = req.body;
  if(!items||!items.length) return res.status(400).json({error:'Items required'});
  const so_number = 'SO-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+String(Math.floor(Math.random()*9000+1000));
  let subtotal=0;
  for(const it of items){ subtotal += parseFloat(it.qty)*parseFloat(it.unit_price); }
  const discPct=Math.min(100,Math.max(0,parseInt(discount_percent||0,10)||0));
  const vAmt=voucherAmt(voucher_code);
  const discPctAmt=Math.round(subtotal*discPct/100);
  const pctPlusVoucher = discPct>0 || voucher_code ? Math.min(subtotal, discPctAmt+vAmt) : null;
  const disc = pctPlusVoucher!=null ? pctPlusVoucher : parseFloat(discount||0);
  const taxable=subtotal-disc;
  const tax = taxable*0.11;
  const total = taxable + tax;
  const status = disc/subtotal > 0.1 ? 'PENDING' : 'APPROVED';
  await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS discount_pct INT DEFAULT 0`).catch(()=>{});
  await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS voucher_code VARCHAR(30)`).catch(()=>{});
  await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS dp_percent INT DEFAULT 0`).catch(()=>{});
  await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_pct INT DEFAULT 0`).catch(()=>{});
  await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS voucher_code VARCHAR(30)`).catch(()=>{});
  await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount DECIMAL(15,2) DEFAULT 0`).catch(()=>{});
  const ins=await pool.query('INSERT INTO sales_orders (so_number, customer_id, branch_id, so_date, delivery_date, delivery_address, delivery_lat, delivery_lng, status, subtotal, discount, discount_pct, voucher_code, dp_percent, tax, total, notes, created_by) VALUES ($1,$2,$3,CURRENT_DATE,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id',[so_number, customer_id, branch_id||1, delivery_date, delivery_address||null, delivery_lat!=null?parseFloat(delivery_lat):null, delivery_lng!=null?parseFloat(delivery_lng):null, status, subtotal, disc, discPct, voucher_code?String(voucher_code).toUpperCase():null, parseInt(dp_percent||0)||0, tax, total, notes, req.user.id]);
  const soId=ins.rows[0].id;
  for(const it of items){
    const lineTotal = parseFloat(it.qty)*parseFloat(it.unit_price) - (parseFloat(it.discount_amt||0));
    const lineTax = lineTotal*0.11;
    await pool.query('INSERT INTO so_details (so_id, product_id, unit_id, qty, unit_price, discount_pct, discount_amt, tax_amt, total) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',[soId, it.product_id, it.unit_id||1, it.qty, it.unit_price, it.discount_pct||0, it.discount_amt||0, lineTax, lineTotal+lineTax]);
    await pool.query('UPDATE stocks SET qty_reserved = qty_reserved + $1 WHERE product_id=$2 AND warehouse_id=$3', [it.qty, it.product_id, 1]);
    await pool.query("INSERT INTO stock_movements (product_id, warehouse_id, movement_type, reference_type, reference_id, qty_out, balance_qty, created_by) VALUES ($1,$2,'OUT','SO',$3,$4,0,$5)",[it.product_id, 1, soId, it.qty, req.user.id]);
  }
  res.json({id:soId, so_number, status});
});
router.post('/orders/:id/approve', async (req,res)=>{
  const so=await pool.query('SELECT status FROM sales_orders WHERE id=$1',[req.params.id]);
  if(!so.rows[0]) return res.status(404).json({error:'SO not found'});
  if(so.rows[0].status!=='PENDING') return res.status(400).json({error:'Hanya PENDING yang bisa di-approve (status sekarang: '+so.rows[0].status+')'});
  await pool.query("UPDATE sales_orders SET status='APPROVED', approved_by=$1, approved_at=NOW() WHERE id=$2",[req.user.id, req.params.id]);
  res.json({ok:true});
});
router.post('/orders/:id/cancel', async (req,res)=>{ await pool.query("UPDATE sales_orders SET status='CANCELLED' WHERE id=$1",[req.params.id]); res.json({ok:true}); });
router.post('/orders/:id/picking', async (req,res)=>{
  const so=await pool.query('SELECT status FROM sales_orders WHERE id=$1',[req.params.id]);
  if(!so.rows[0]) return res.status(404).json({error:'SO not found'});
  const st=so.rows[0].status;
  // PARTIAL legacy tetap diizinkan masuk PICKING untuk data lama
  if(!['APPROVED','SHIPPED','PARTIAL'].includes(st)) return res.status(400).json({error:'Hanya APPROVED/SHIPPED yang bisa masuk PICKING (status sekarang: '+st+')'});
  await pool.query("UPDATE sales_orders SET status='PICKING' WHERE id=$1",[req.params.id]);
  res.json({ok:true, status:'PICKING'});
});
router.post('/orders/:id/complete', async (req,res)=>{
  const so=await pool.query('SELECT * FROM sales_orders WHERE id=$1',[req.params.id]);
  if(!so.rows[0]) return res.status(404).json({error:'SO not found'});
  if(so.rows[0].status==='COMPLETED') return res.json({ok:true, already:true});
  const invs=await pool.query('SELECT * FROM invoices WHERE so_id=$1',[req.params.id]);
  if(!invs.rows.length) return res.status(400).json({error:'Belum ada invoice untuk SO ini'});
  const unpaid=invs.rows.filter(r=> String(r.status)!=='PAID' || parseFloat(r.paid_amount)+0.5 < parseFloat(r.total));
  if(unpaid.length){
    const sisa=unpaid.reduce((s,r)=> s + (parseFloat(r.total)-parseFloat(r.paid_amount)),0);
    return res.status(400).json({error:`Belum lunas — ${unpaid.length} invoice belum PAID, sisa Rp ${new Intl.NumberFormat('id-ID').format(sisa)}`});
  }
  await pool.query("UPDATE sales_orders SET status='COMPLETED' WHERE id=$1",[req.params.id]);
  res.json({ok:true});
});

router.get('/deliveries', async (req,res)=>{
  await ensureDeliveryEst();
  const so_id=req.query.so_id;
  if(so_id){
    const r=await pool.query('SELECT d.*, c.name as customer_name, so.so_number FROM delivery_orders d LEFT JOIN customers c ON c.id=d.customer_id LEFT JOIN sales_orders so ON so.id=d.so_id WHERE d.so_id=$1 ORDER BY d.id DESC',[so_id]);
    return res.json(r.rows);
  }
  const r=await pool.query('SELECT d.*, c.name as customer_name, so.so_number FROM delivery_orders d LEFT JOIN customers c ON c.id=d.customer_id LEFT JOIN sales_orders so ON so.id=d.so_id ORDER BY d.id DESC LIMIT 50');
  res.json(r.rows);
});
// estimasi helper exported for fleet
export function calcEst(totalQty, distanceKm, zoneOverride, vehicleRow){
  const w=parseFloat((totalQty*0.05).toFixed(2));
  const v=parseFloat((totalQty*0.05).toFixed(2));
  const zone=estZoneFromKm(distanceKm, zoneOverride);
  const tarif=tarifForZone(zone);
  const cost=Math.round(tarif.flat + w*tarif.perTon);
  let costDalam=null, costLuar=null;
  if(vehicleRow){
    const c=estCostForVehicle(w, vehicleRow);
    costDalam=c.dalam; costLuar=c.luar;
  } else {
    // fallback global: dalam=Bekasi tariif, luar=Luar Kota tarif
    costDalam=Math.round(150000 + w*120000);
    costLuar=Math.round(600000 + w*350000);
  }
  return {est_weight_ton:w, est_volume_m3:v, est_zone:zone, est_cost:cost, est_cost_dalam:costDalam, est_cost_luar:costLuar, distance_km: distanceKm? parseFloat(distanceKm): null};
}
router.post('/deliveries', async (req,res)=>{
  await ensureDeliveryEst();
  const {so_id, warehouse_id, delivery_date, vehicle_no, vehicle_id, driver_id: bodyDriverId, items, distance_km, est_zone, delivery_lat, delivery_lng, delivery_address} = req.body;
  const so=await pool.query('SELECT * FROM sales_orders WHERE id=$1',[so_id]);
  if(!so.rows[0]) return res.status(404).json({error:'SO not found'});
  const st=so.rows[0].status;
  if(!['APPROVED','PICKING','SHIPPED','PARTIAL'].includes(st)) return res.status(400).json({error:'SO harus APPROVED/PICKING dulu sebelum buat DO (status sekarang: '+st+')'});
  // wajib pilih armada AVAILABLE
  let plat = (vehicle_no||'').trim() || null;
  let driverId = bodyDriverId ? parseInt(bodyDriverId) : null;
  let vehicleRow=null;
  if(vehicle_id){
    const vr=await pool.query('SELECT * FROM vehicles WHERE id=$1',[vehicle_id]);
    if(!vr.rows[0]) return res.status(400).json({error:'Armada tidak ditemukan'});
    if(vr.rows[0].status!=='AVAILABLE') return res.status(400).json({error:'Armada '+vr.rows[0].plat_no+' sedang dipakai ('+vr.rows[0].status+')'});
    plat=vr.rows[0].plat_no; driverId=vr.rows[0].driver_id; vehicleRow=vr.rows[0];
  } else if(plat){
    const vr=await pool.query('SELECT * FROM vehicles WHERE plat_no=$1',[plat]);
    if(!vr.rows[0]) return res.status(400).json({error:'Armada plat '+plat+' tidak ditemukan'});
    if(vr.rows[0].status!=='AVAILABLE') return res.status(400).json({error:'Armada '+plat+' sedang dipakai'});
    driverId=vr.rows[0].driver_id; vehicleRow=vr.rows[0];
  } else {
    return res.status(400).json({error:'Pilih armada AVAILABLE terlebih dahulu'});
  }
  // Plan B: hitung estimasi — jarak bisa dari map (haversine dari origin fixed) atau input manual
  const totalQty = Array.isArray(items) ? items.reduce((s,it)=> s + (parseFloat(it.qty)||0), 0) : 0;
  let distKm = distance_km!=null && distance_km!=='' ? parseFloat(distance_km) : null;
  let effLat = delivery_lat!=null && delivery_lat!=='' ? parseFloat(delivery_lat) : null;
  let effLng = delivery_lng!=null && delivery_lng!=='' ? parseFloat(delivery_lng) : null;
  let effAddr = (delivery_address||'').trim() || null;
  // fallback alamat+koordinat dari SO jika DO tidak kirim
  if((effLat==null||isNaN(effLat)) && so.rows[0].delivery_lat!=null) effLat=parseFloat(so.rows[0].delivery_lat);
  if((effLng==null||isNaN(effLng)) && so.rows[0].delivery_lng!=null) effLng=parseFloat(so.rows[0].delivery_lng);
  if(!effAddr && so.rows[0].delivery_address) effAddr=so.rows[0].delivery_address;
  if((distKm==null||isNaN(distKm)) && effLat!=null && effLng!=null && isFinite(effLat) && isFinite(effLng)){
    distKm = +haversineKm(ORIGIN.lat, ORIGIN.lng, effLat, effLng).toFixed(2);
  }
  const calc = calcEst(totalQty, distKm, (est_zone||'').trim() || null, vehicleRow);
  // guard overload konsisten dengan fleet (ton & volume 0.05/qty)
  if(vehicleRow){
    const capTon=parseFloat(vehicleRow.capacity_ton||0);
    const capVol=parseFloat(vehicleRow.capacity_volume_m3||999);
    if(calc.est_weight_ton > capTon + 0.01) return res.status(400).json({error:`OVERLOAD: estimasi ${calc.est_weight_ton} ton > kapasitas ${capTon} ton (${vehicleRow.plat_no}). Pilih armada lebih besar atau bagi DO.`});
    if(calc.est_volume_m3 > capVol + 0.01) return res.status(400).json({error:`OVERLOAD volume: ${calc.est_volume_m3} m³ > kapasitas ${capVol} m³ (${vehicleRow.plat_no})`});
    // Plan 2: Minimum load guard Luar Kota (>= 5 ton)
    const MIN_LOAD_LUAR=5;
    if(calc.est_zone==='Luar Kota' && calc.est_weight_ton < MIN_LOAD_LUAR){
      return res.status(400).json({error:`Muatan Luar Kota minimum ${MIN_LOAD_LUAR} ton (estimasi ${calc.est_weight_ton} ton). Tambah muatan atau ubah ke armada/rute dalam kota agar tidak rugi ritase.`});
    }
  }
  const do_number='DO-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+String(Math.floor(Math.random()*9000+1000));
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    // lock vehicle row
    await client.query('SELECT * FROM vehicles WHERE plat_no=$1 FOR UPDATE',[plat]);
    const chkV=await client.query('SELECT status FROM vehicles WHERE plat_no=$1',[plat]);
    if(chkV.rows[0]?.status!=='AVAILABLE'){ await client.query('ROLLBACK'); return res.status(400).json({error:'Armada '+plat+' baru saja dipakai, pilih lain'}); }
    const ins=await client.query(
      "INSERT INTO delivery_orders (do_number, so_id, customer_id, warehouse_id, delivery_date, vehicle_no, driver_id, status, distance_km, delivery_lat, delivery_lng, delivery_address, est_weight_ton, est_volume_m3, est_zone, est_cost, est_cost_dalam, est_cost_luar) VALUES ($1,$2,$3,$4,$5,$6,$7,'IN_TRANSIT',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id",
      [do_number, so_id, so.rows[0].customer_id, warehouse_id||1, delivery_date||new Date().toISOString().slice(0,10), plat, driverId, calc.distance_km, isFinite(effLat)?effLat:null, isFinite(effLng)?effLng:null, effAddr, calc.est_weight_ton, calc.est_volume_m3, calc.est_zone, calc.est_cost, calc.est_cost_dalam, calc.est_cost_luar]
    );
    const doId=ins.rows[0].id;
    if(items) for(const it of items) await client.query('INSERT INTO do_details (do_id, product_id, qty) VALUES ($1,$2,$3)',[doId, it.product_id, it.qty]);
    // status baru: SHIPPED (menggantikan PARTIAL yg dulu dipakai sebelum COMPLETED)
    if(st!=='COMPLETED') await client.query("UPDATE sales_orders SET status='SHIPPED' WHERE id=$1",[so_id]);
    if(items) for(const it of items){
      await client.query('UPDATE stocks SET qty_on_hand = qty_on_hand - $1, qty_reserved = GREATEST(qty_reserved - $1,0) WHERE product_id=$2 AND warehouse_id=$3',[it.qty, it.product_id, warehouse_id||1]);
    }
    await client.query("UPDATE vehicles SET status='IN_TRANSIT' WHERE plat_no=$1",[plat]);
    await client.query('COMMIT');
    res.json({id:doId, do_number, vehicle_no: plat, driver_id: driverId, ...calc});
  }catch(e){ try{ await client.query('ROLLBACK'); }catch{}; console.error('[deliveries]',e); res.status(500).json({error:e.message}); }
  finally{ client.release(); }
});

router.get('/invoices', async (req,res)=>{
  const {limit,offset}=paginate(req);
  const status=req.query.status;
  const source=req.query.source||'';
  const search=req.query.search||'';
  let where='WHERE 1=1'; const p=[];
  if(status){ p.push(status); where+=' AND inv.status=$'+p.length; }
  if(source==='pos'){ where+=" AND inv.invoice_number LIKE 'INV-POS-%'"; }
  if(search){ p.push('%'+search+'%'); where+=' AND (inv.invoice_number ILIKE $'+p.length+' OR c.name ILIKE $'+p.length+' OR c.code ILIKE $'+p.length+' OR dinv.do_number ILIKE $'+p.length+')'; }
  const cnt=await pool.query('SELECT COUNT(*) FROM invoices inv JOIN customers c ON c.id=inv.customer_id LEFT JOIN delivery_orders dinv ON dinv.id=inv.do_id '+where,p);
  const data=await pool.query("SELECT inv.*, c.name as customer_name, c.code as customer_code, c.phone as customer_phone, so.delivery_address, so.notes, so.so_number, so.status as so_status, dinv.do_number, CASE WHEN inv.invoice_number LIKE 'INV-POS-%' THEN true ELSE false END as is_pos FROM invoices inv JOIN customers c ON c.id=inv.customer_id LEFT JOIN sales_orders so ON so.id=inv.so_id LEFT JOIN delivery_orders dinv ON dinv.id=inv.do_id "+where+" ORDER BY inv.id DESC LIMIT $"+(p.length+1)+" OFFSET $"+(p.length+2), [...p,limit,offset]);
  res.json({data:data.rows, total:parseInt(cnt.rows[0].count)});
});
router.post('/invoices', async (req,res)=>{
  const {so_id: bodySoId, do_id: bodyDoId, customer_id: bodyCustId, due_date, items: bodyItems, discount_percent: bodyDiscPct, voucher_code: bodyVoucher, dp_percent: bodyDpPct, discount: bodyDisc} = req.body;
  let so_id = bodySoId ? parseInt(bodySoId) : null;
  let do_id = bodyDoId ? parseInt(bodyDoId) : null;
  let customer_id = bodyCustId ? parseInt(bodyCustId) : null;
  let items = Array.isArray(bodyItems) ? bodyItems : null;
  const client = await pool.connect();
  try{
    await client.query('BEGIN');
    let doRow=null;
    if(do_id){
      const dr=await client.query('SELECT * FROM delivery_orders WHERE id=$1 FOR UPDATE',[do_id]);
      if(!dr.rows[0]){ await client.query('ROLLBACK'); return res.status(404).json({error:'DO tidak ditemukan'}); }
      doRow=dr.rows[0];
      if(doRow.status==='INVOICED'){ await client.query('ROLLBACK'); return res.status(400).json({error:'DO '+doRow.do_number+' sudah INVOICED'}); }
      if(doRow.status!=='DELIVERED'){ await client.query('ROLLBACK'); return res.status(400).json({error:'DO harus DITERIMA (DELIVERED) dulu sebelum buat Invoice. Status sekarang: '+doRow.status}); }
      if(!customer_id) customer_id = doRow.customer_id;
      if(!so_id) so_id = doRow.so_id;
      // auto-derive items dari DO jika tidak dikirim
      if(!items || !items.length){
        const dd=await client.query('SELECT dd.product_id, dd.qty, p.name FROM do_details dd JOIN products p ON p.id=dd.product_id WHERE dd.do_id=$1',[do_id]);
        if(!dd.rows.length){ await client.query('ROLLBACK'); return res.status(400).json({error:'DO tidak punya item'}); }
        items=[];
        for(const r of dd.rows){
          // cari harga dari SO detail, fallback product_units
          let unit_price=0;
          if(so_id){
            const sp=await client.query('SELECT unit_price FROM so_details WHERE so_id=$1 AND product_id=$2 LIMIT 1',[so_id, r.product_id]);
            if(sp.rows[0]) unit_price=parseFloat(sp.rows[0].unit_price);
          }
          if(!unit_price){
            const pu=await client.query('SELECT selling_price FROM product_units WHERE product_id=$1 ORDER BY id LIMIT 1',[r.product_id]);
            unit_price = pu.rows[0] ? parseFloat(pu.rows[0].selling_price) : 65000;
          }
          items.push({product_id: r.product_id, qty: parseFloat(r.qty), unit_price});
        }
      }
    }
    if(!customer_id) { await client.query('ROLLBACK'); return res.status(400).json({error:'customer_id wajib (atau kirim do_id)'}); }
    if(!items || !items.length){ await client.query('ROLLBACK'); return res.status(400).json({error:'Items required'}); }
    const inv_number='INV-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+String(Math.floor(Math.random()*9000+1000));
    let subtotal=0; for(const it of items) subtotal+= parseFloat(it.qty)*parseFloat(it.unit_price);
    const discPct=Math.min(100,Math.max(0,parseInt(bodyDiscPct||0,10)||0));
    const vAmt=voucherAmt(bodyVoucher);
    const discPctAmt=Math.round(subtotal*discPct/100);
    const discFromPctVoucher = (bodyDiscPct!=null||bodyVoucher) ? Math.min(subtotal, discPctAmt+vAmt) : null;
    const discAmt = discFromPctVoucher!=null ? discFromPctVoucher : parseFloat(bodyDisc||0);
    const discount=Math.min(subtotal, Math.max(0, discAmt));
    const taxable=subtotal-discount;
    const tax=Math.round(taxable*0.11); const total=taxable+tax;
    const dpPct=Math.min(100,Math.max(0,parseInt(bodyDpPct||0,10)||0));
    const dpAmt = dpPct>0 ? Math.round(total*dpPct/100) : 0;
    const initPaid = dpAmt;
    const invStatus = dpPct>0 ? 'PARTIAL' : 'SENT';
    const due = due_date||new Date(Date.now()+14*86400000).toISOString().slice(0,10);
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount DECIMAL(15,2) DEFAULT 0`).catch(()=>{});
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_pct INT DEFAULT 0`).catch(()=>{});
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS voucher_code VARCHAR(30)`).catch(()=>{});
    const ins=await client.query("INSERT INTO invoices (invoice_number, customer_id, so_id, do_id, invoice_date, due_date, status, subtotal, discount, discount_pct, voucher_code, tax, total, paid_amount) VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id",[inv_number, customer_id, so_id, do_id, due, invStatus, subtotal, discount, discPct, bodyVoucher?String(bodyVoucher).toUpperCase():null, tax, total, initPaid]);
    const invId=ins.rows[0].id;
    for(const it of items) await client.query('INSERT INTO invoice_details (invoice_id, product_id, qty, unit_price, total) VALUES ($1,$2,$3,$4,$5)',[invId, it.product_id, it.qty, it.unit_price, parseFloat(it.qty)*parseFloat(it.unit_price)]);
    await client.query("INSERT INTO journal_entries (entry_number, entry_date, reference_type, reference_id, description, total_debit, total_credit, posted) VALUES ($1,CURRENT_DATE,'INVOICE',$2,$3,$4,$4,true)", ['JE-'+Date.now(), invId, 'Invoice '+inv_number, total]);
    if(initPaid>0){ await client.query("INSERT INTO payments (payment_number, type, invoice_id, payment_date, method, amount, created_by) VALUES ($1,'AR',$2,CURRENT_DATE,'TRANSFER',$3,$4)",['PAY-INV-'+Date.now(), invId, initPaid, req.user.id]); }
    if(doRow){
      await client.query("UPDATE delivery_orders SET status='INVOICED' WHERE id=$1",[do_id]);
      // SO TIDAK auto COMPLETED saat Invoice dibuat (SENT/PARTIAL) — tunggu PAID lunas.
    }
    await client.query('COMMIT');
    res.json({id:invId, invoice_number: inv_number, do_invoiced: !!doRow, total, subtotal, discount, discount_pct: discPct, voucher_code: bodyVoucher||null, dp_percent: dpPct, dp_amount: initPaid, remaining: total-initPaid, status: invStatus, tax, est_cost: doRow?.est_cost, est_cost_dalam: doRow?.est_cost_dalam, est_cost_luar: doRow?.est_cost_luar});
  }catch(e){ try{ await client.query('ROLLBACK'); }catch{}; console.error('[invoices]',e); res.status(500).json({error:e.message}); }
  finally{ client.release(); }
});
router.post('/invoices/:id/pay', async (req,res)=>{
  const {amount, method} = req.body;
  const inv=await pool.query('SELECT * FROM invoices WHERE id=$1',[req.params.id]);
  if(!inv.rows[0]) return res.status(404).json({error:'Not found'});
  const remaining = parseFloat(inv.rows[0].total) - parseFloat(inv.rows[0].paid_amount);
  if(remaining <= 0.5) return res.status(400).json({error:'Invoice sudah lunas'});
  const payAmt = parseFloat(amount);
  if(isNaN(payAmt) || payAmt <=0) return res.status(400).json({error:'Nominal tidak valid'});
  // ponytail: full payment only - harus bayar sisa penuh, upgrade ke partial bertahap jika butuh cicilan
  if(Math.abs(payAmt - remaining) > 1) return res.status(400).json({error:`Harus bayar full sisa Rp ${new Intl.NumberFormat('id-ID').format(remaining)}`});
  const pay_no='PAY-'+Date.now();
  await pool.query("INSERT INTO payments (payment_number, type, invoice_id, payment_date, method, amount, created_by) VALUES ($1,'AR',$2,CURRENT_DATE,$3,$4,$5)",[pay_no, req.params.id, method||'TRANSFER', payAmt, req.user.id]);
  await pool.query("UPDATE invoices SET paid_amount = paid_amount + $1, status = CASE WHEN paid_amount + $1 >= total - 0.5 THEN 'PAID' ELSE 'PARTIAL' END WHERE id=$2",[payAmt, req.params.id]);
  // auto-complete SO hanya jika SEMUA invoice untuk SO tersebut sudah PAID/lunas
  const soId=inv.rows[0].so_id;
  if(soId){
    const chk=await pool.query('SELECT status FROM invoices WHERE id=$1',[req.params.id]);
    if(chk.rows[0]?.status==='PAID'){
      const unpaid=await pool.query(`SELECT COUNT(*) FROM invoices WHERE so_id=$1 AND status!='PAID'`,[soId]);
      if(parseInt(unpaid.rows[0].count)===0){
        // pastikan ada minimal 1 invoice (sudah PAID) dan tidak ada yang belum lunas
        const anyInv=await pool.query('SELECT COUNT(*) FROM invoices WHERE so_id=$1',[soId]);
        if(parseInt(anyInv.rows[0].count)>0){
          await pool.query("UPDATE sales_orders SET status='COMPLETED' WHERE id=$1 AND status NOT IN ('COMPLETED','CANCELLED')",[soId]);
        }
      }
    }
  }
  res.json({ok:true});
});

function voucherAmt(code){ if(!code) return 0; const c=String(code).trim().toUpperCase(); const map={ 'VOUCHER10':10000,'VOUCHER50':50000,'DISKON10K':10000,'HEMAT20':20000,'PROMO20K':20000,'DISKON50K':50000 }; if(map[c]!=null) return map[c]; const n=parseInt(c.replace(/[^0-9]/g,''),10); if(!isNaN(n) && String(n)===c) return n; if(!isNaN(n) && c.startsWith('RP')) return n; return 0; }
router.post('/pos', async (req,res)=>{
  try{
    const {customer_id, items, payment_method, delivery_address, delivery_lat, delivery_lng, notes, dp_percent, discount_percent, voucher_code} = req.body;
    if(!items||!items.length) return res.status(400).json({error:'Items required'});
    const so_number='SO-POS-'+Date.now();
    let subtotal=0; for(const it of items) subtotal+= parseFloat(it.qty)*parseFloat(it.unit_price);
    const discPct=Math.min(100,Math.max(0,parseInt(discount_percent||0,10)||0));
    const vAmt=voucherAmt(voucher_code);
    const discPctAmt=Math.round(subtotal*discPct/100);
    const discTotal=Math.min(subtotal, discPctAmt+vAmt);
    const taxable=subtotal-discTotal;
    const tax=Math.round(taxable*0.11); const total=taxable+tax;
    // robust parse: JSON may send string
    const dpPctRaw = dp_percent;
    const dpPct = dpPctRaw==null||dpPctRaw==='' ? 0 : parseInt(dpPctRaw,10);
    const dpPctValid = isNaN(dpPct) ? 0 : Math.min(100, Math.max(0, dpPct));
    const dp = dpPctValid>0 ? Math.round(total*dpPctValid/100) : total;
    const isPartial = dp + 0.5 < total;
    const soStatus = isPartial ? 'PARTIAL' : 'COMPLETED';
    const invStatus = isPartial ? 'PARTIAL' : 'PAID';
    console.log(`[POS] dp%=${dpPctValid} disc%=${discPct} voucher=${voucher_code}->${vAmt} discTotal=${discTotal} total=${total} dp=${dp}`);
    await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS discount_pct INT DEFAULT 0`).catch(()=>{});
    await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS voucher_code VARCHAR(30)`).catch(()=>{});
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_pct INT DEFAULT 0`).catch(()=>{});
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS voucher_code VARCHAR(30)`).catch(()=>{});
    const soIns=await pool.query("INSERT INTO sales_orders (so_number, customer_id, branch_id, so_date, delivery_address, delivery_lat, delivery_lng, notes, status, subtotal, discount, discount_pct, voucher_code, tax, total, created_by) VALUES ($1,$2,1,CURRENT_DATE,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id",[so_number, customer_id||4, delivery_address||null, delivery_lat?parseFloat(delivery_lat):null, delivery_lng?parseFloat(delivery_lng):null, notes||null, soStatus, subtotal, discTotal, discPct, voucher_code?String(voucher_code).toUpperCase():null, tax, total, req.user.id]);
    const soId=soIns.rows[0].id;
    for(const it of items){
      await pool.query('INSERT INTO so_details (so_id, product_id, unit_id, qty, unit_price, total) VALUES ($1,$2,1,$3,$4,$5)',[soId, it.product_id, it.qty, it.unit_price, parseFloat(it.qty)*parseFloat(it.unit_price)]);
      await pool.query('UPDATE stocks SET qty_on_hand = qty_on_hand - $1 WHERE product_id=$2 AND warehouse_id=1',[it.qty, it.product_id]);
    }
    const invNo='INV-POS-'+Date.now();
    const invIns=await pool.query("INSERT INTO invoices (invoice_number, customer_id, so_id, invoice_date, due_date, status, subtotal, discount, discount_pct, voucher_code, tax, total, paid_amount) VALUES ($1,$2,$3,CURRENT_DATE,CURRENT_DATE,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id",[invNo, customer_id||4, soId, invStatus, subtotal, discTotal, discPct, voucher_code?String(voucher_code).toUpperCase():null, tax, total, dp]);
    await pool.query("INSERT INTO payments (payment_number, type, invoice_id, payment_date, method, amount, created_by) VALUES ($1,'AR',$2,CURRENT_DATE,$3,$4,$5)",['PAY-POS-'+Date.now(), invIns.rows[0].id, payment_method||'CASH', dp, req.user.id]);
    res.json({so_number, invoice_number: invNo, total, subtotal, discTotal, discPct, voucherAmt: vAmt, dp_amount: dp, remaining_amount: total - dp, status: invStatus, so_status: soStatus, dp_percent: dpPctValid});
  }catch(e){ console.error('[POS] err',e); res.status(500).json({error:e.message}); }
});

export default router;
