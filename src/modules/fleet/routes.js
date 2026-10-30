import express from 'express';
import { pool } from '../../config/db.js';
import { rbac } from '../../middleware/auth.js';
import { createDelivery, DeliveryError, distanceFromAddress, estZoneFromKm, ensureSignatureCols } from '../sales/delivery-service.js';
const router=express.Router();
const R_ALL=['direktur','super_admin'];
async function myEmployeeId(user){ const r=await pool.query('SELECT employee_id FROM users WHERE id=$1',[user.id]); return r.rows[0]?.employee_id||null; }
async function myDriverId(user){ const emp=await myEmployeeId(user); if(!emp) return null; const d=await pool.query('SELECT id FROM drivers WHERE employee_id=$1',[emp]); return d.rows[0]?.id||null; }
function expiredOn(v){ if(!v) return false; const d=new Date(v), n=new Date(); d.setHours(0,0,0,0); n.setHours(0,0,0,0); return d<n; }
function isDriverOnly(user){ const roles=(user?.roles||[]).map(r=>String(r).toLowerCase()); return roles.includes('driver') && !roles.some(r=>['warehouse','direktur','super_admin'].includes(r)); }

let fleetEnsured=false;
async function ensureFleetCols(){
  if(fleetEnsured) return;
  try{
    await pool.query(`ALTER TABLE trips ADD COLUMN IF NOT EXISTS odometer_start INT`);
    await pool.query(`ALTER TABLE trips ADD COLUMN IF NOT EXISTS odometer_end INT`);
    await pool.query(`ALTER TABLE trips ADD COLUMN IF NOT EXISTS fuel_liters DECIMAL(10,2)`);
    await pool.query(`ALTER TABLE trips ADD COLUMN IF NOT EXISTS notes TEXT`);
    // Bukti serah terima: dipakai alur klaim driver + auto-complete dokumen
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS invoice_handed BOOLEAN DEFAULT false`).catch(()=>{});
    await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP`).catch(()=>{});
    await pool.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS photo_url TEXT`);
    await pool.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS stnk_url TEXT`);
    await pool.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS notes TEXT`);
    // Data perolehan untuk Aset Tetap - armada milik sendiri ikut didepresiasi
    await pool.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS acquisition_date DATE`).catch(()=>{});
    await pool.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS acquisition_cost DECIMAL(18,2) DEFAULT 0`).catch(()=>{});
    await pool.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS residual_value DECIMAL(18,2) DEFAULT 0`).catch(()=>{});
    await pool.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS useful_life_years INT DEFAULT 8`).catch(()=>{});
    await pool.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS asset_code VARCHAR(20)`).catch(()=>{});
    // Plan B: pastikan kolom estimasi DO ada (defensive, juga ada di sales)
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS distance_km DECIMAL(10,2)`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS est_weight_ton DECIMAL(10,2)`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS est_volume_m3 DECIMAL(10,2)`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS est_zone VARCHAR(50)`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS est_cost DECIMAL(15,2)`).catch(()=>{});
    // Area armada: Dalam Kota vs Luar Kota + tarif per-armada (kolom sendiri)
    await pool.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS area VARCHAR(20) DEFAULT 'DALAM_KOTA'`).catch(()=>{});
    await pool.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS tarif_dalam_flat DECIMAL(12,2) DEFAULT 150000`).catch(()=>{});
    await pool.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS tarif_dalam_per_ton DECIMAL(12,2) DEFAULT 120000`).catch(()=>{});
    await pool.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS tarif_luar_flat DECIMAL(12,2) DEFAULT 600000`).catch(()=>{});
    await pool.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS tarif_luar_per_ton DECIMAL(12,2) DEFAULT 350000`).catch(()=>{});
    await pool.query(`UPDATE vehicles SET area='DALAM_KOTA' WHERE area IS NULL`).catch(()=>{});
    // seed drivers for employees yang jadi supir armada tapi belum ada row di drivers (FK trip butuh drivers.id)
    await pool.query(`
      INSERT INTO drivers (employee_id, sim_number, sim_type, sim_expiry, is_active)
      SELECT e.id, 'SIM-'||LPAD(e.id::text,4,'0'), 'B1', CURRENT_DATE + INTERVAL '2 year', true
      FROM employees e
      WHERE e.id IN (SELECT driver_id FROM vehicles WHERE driver_id IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM drivers d WHERE d.employee_id=e.id)
    `).catch(()=>{});
    // fallback: pastikan minimal ada 1 driver jika vehicles kosong
    await pool.query(`
      INSERT INTO drivers (employee_id, sim_number, sim_type, sim_expiry, is_active)
      SELECT e.id, 'SIM-'||LPAD(e.id::text,4,'0'), 'B1', CURRENT_DATE + INTERVAL '2 year', true
      FROM employees e WHERE e.position ILIKE '%driver%' AND NOT EXISTS (SELECT 1 FROM drivers d WHERE d.employee_id=e.id)
      LIMIT 2
    `).catch(()=>{});
    fleetEnsured=true;
  }catch(e){ console.error('[fleet ensure]',e.message); }
}

// GET vehicles - enriched for Phase 0-2
router.get('/vehicles', rbac('warehouse','driver','super_admin'), async(req,res)=>{
  await ensureFleetCols();
  try{
    const r=await pool.query(`
      SELECT v.*,
        e.name as driver_name, e.phone as driver_phone,
        d.sim_number, d.sim_expiry, d.sim_type,
        (SELECT service_date FROM vehicle_maintenance WHERE vehicle_id=v.id ORDER BY service_date DESC LIMIT 1) as last_service_date,
        (SELECT next_service_date FROM vehicle_maintenance WHERE vehicle_id=v.id ORDER BY next_service_date DESC LIMIT 1) as next_service_date,
        (SELECT COUNT(*) FROM delivery_orders WHERE vehicle_no=v.plat_no AND status='IN_TRANSIT') as active_do_count,
        (SELECT do_number FROM delivery_orders WHERE vehicle_no=v.plat_no AND status='IN_TRANSIT' ORDER BY id DESC LIMIT 1) as active_do_number
      FROM vehicles v
      LEFT JOIN employees e ON e.id=v.driver_id
      LEFT JOIN drivers d ON d.employee_id=e.id
      ORDER BY v.plat_no`);
    // attach recent DO history per vehicle (10 latest) + est vs actual 30d
    for(const v of r.rows){
      try{
        const hist=await pool.query(`SELECT id, do_number, status, delivery_date, customer_id, distance_km, est_weight_ton, est_zone, est_cost, (SELECT name FROM customers WHERE id=delivery_orders.customer_id) as customer_name FROM delivery_orders WHERE vehicle_no=$1 ORDER BY id DESC LIMIT 10`,[v.plat_no]);
        v.recent_dos=hist.rows;
        // trips aggregate 30d
        const agg=await pool.query(`SELECT COUNT(*) as cnt, COALESCE(SUM(fuel_cost+toll_cost+other_cost),0) as cost, COALESCE(SUM(distance_km),0) as km FROM trips WHERE vehicle_id=$1 AND departure_date >= NOW() - INTERVAL '30 days'`,[v.id]);
        v.trips_30=parseInt(agg.rows[0].cnt||0);
        v.cost_30=parseFloat(agg.rows[0].cost||0);
        v.km_30=parseFloat(agg.rows[0].km||0);
        // DO estimasi 30d per kendaraan - 2 kolom terpisah Dalam Kota vs Luar Kota (per-armada tarif)
        const aggEst=await pool.query(`SELECT COALESCE(SUM(est_cost),0) as est, COALESCE(SUM(est_cost_dalam),0) as est_dalam, COALESCE(SUM(est_cost_luar),0) as est_luar, COALESCE(SUM(distance_km),0) as km FROM delivery_orders WHERE vehicle_no=$1 AND created_at >= NOW() - INTERVAL '30 days' AND est_cost IS NOT NULL`,[v.plat_no]);
        v.est_30=parseFloat(aggEst.rows[0].est||0);
        v.est_dalam_30=parseFloat(aggEst.rows[0].est_dalam||0);
        v.est_luar_30=parseFloat(aggEst.rows[0].est_luar||0);
        v.est_km_30=parseFloat(aggEst.rows[0].km||0);
        v.variance_30 = (parseFloat(aggEst.rows[0].est||0) > 0) ? (v.cost_30 - parseFloat(aggEst.rows[0].est)) : 0;
        v.variance_dalam_30 = v.est_dalam_30>0 ? (v.cost_30 - v.est_dalam_30) : 0;
        v.variance_luar_30 = v.est_luar_30>0 ? (v.cost_30 - v.est_luar_30) : 0;
      }catch{}
    }
    res.json(r.rows);
  }catch(e){ console.error('[fleet vehicles]',e); res.status(500).json({error:e.message}); }
});

router.get('/vehicles/:id/history', rbac('warehouse','super_admin'), async(req,res)=>{
  await ensureFleetCols();
  const v=await pool.query('SELECT plat_no FROM vehicles WHERE id=$1',[req.params.id]);
  if(!v.rows[0]) return res.status(404).json({error:'Armada tidak ditemukan'});
  const plat=v.rows[0].plat_no;
  const dos=await pool.query(`SELECT d.*, c.name as customer_name, so.so_number, so.total as so_total FROM delivery_orders d LEFT JOIN customers c ON c.id=d.customer_id LEFT JOIN sales_orders so ON so.id=d.so_id WHERE d.vehicle_no=$1 ORDER BY d.id DESC LIMIT 20`,[plat]);
  const trips=await pool.query(`SELECT t.*, del.do_number FROM trips t LEFT JOIN delivery_orders del ON del.id=t.do_id WHERE t.vehicle_id=$1 ORDER BY t.id DESC LIMIT 20`,[req.params.id]);
  const maint=await pool.query(`SELECT * FROM vehicle_maintenance WHERE vehicle_id=$1 ORDER BY service_date DESC LIMIT 20`,[req.params.id]);
  res.json({plat_no: plat, deliveries: dos.rows, trips: trips.rows, maintenance: maint.rows});
});

router.post('/vehicles', rbac('warehouse','super_admin'), async(req,res)=>{
  await ensureFleetCols();
  try{
    const {plat_no, plate_number, type, brand, model, year, capacity_ton, capacity_volume_m3, capacity_weight_kg, ownership, kir_expiry, tax_expiry, driver_id, photo_url, area, tarif_dalam_flat, tarif_dalam_per_ton, tarif_luar_flat, tarif_luar_per_ton, acquisition_date, acquisition_cost, residual_value, useful_life_years} = req.body;
    const plat=(plat_no||plate_number||'').trim().toUpperCase();
    if(!plat) return res.status(400).json({error:'Plat nomor wajib'});
    if(!type) return res.status(400).json({error:'Tipe armada wajib'});
    const dup=await pool.query('SELECT id FROM vehicles WHERE plat_no=$1',[plat]);
    if(dup.rows[0]) return res.status(400).json({error:'Plat '+plat+' sudah ada'});
    const ton=parseFloat(capacity_ton)||8;
    const vol=parseFloat(capacity_volume_m3)||20;
    const wkg=parseFloat(capacity_weight_kg)|| ton*1000;
    const own=['OWNED','RENTED','THIRD_PARTY'].includes(ownership)?ownership:'OWNED';
    const areaVal=['DALAM_KOTA','LUAR_KOTA'].includes(area)?area:'DALAM_KOTA';
    const tDalamFlat= tarif_dalam_flat!=null? parseFloat(tarif_dalam_flat):150000;
    const tDalamTon = tarif_dalam_per_ton!=null? parseFloat(tarif_dalam_per_ton):120000;
    const tLuarFlat = tarif_luar_flat!=null? parseFloat(tarif_luar_flat):600000;
    const tLuarTon  = tarif_luar_per_ton!=null? parseFloat(tarif_luar_per_ton):350000;
    const ins=await pool.query(
      `INSERT INTO vehicles (plat_no,plate_number,type,brand,model,year,capacity_ton,capacity_weight_kg,capacity_volume_m3,ownership,status,driver_id,kir_expiry,tax_expiry,photo_url, area, tarif_dalam_flat, tarif_dalam_per_ton, tarif_luar_flat, tarif_luar_per_ton, acquisition_date, acquisition_cost, residual_value, useful_life_years)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'AVAILABLE',$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING id`,
      [plat, plat, type||'ENGKEL', brand||'Mitsubishi', model||null, year?parseInt(year):null, ton, wkg, vol, own, driver_id||null, kir_expiry||null, tax_expiry||null, photo_url||null, areaVal, tDalamFlat, tDalamTon, tLuarFlat, tLuarTon, acquisition_date||null, parseFloat(acquisition_cost)||0, parseFloat(residual_value)||0, parseInt(useful_life_years)||8]
    );
    // armada milik sendiri langsung dibuatkan baris Aset Tetap (bisa juga lewat tombol di halaman Aset)
    if(own==='OWNED'){
      try{ await fetch(`${process.env.SELF_URL||'http://127.0.0.1:'+(process.env.PORT||4000)}/api/assets/sync-fleet`, {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'}); }catch{}
    }
    res.json(ins.rows[0]);
  }catch(e){ console.error('[fleet POST vehicles]',e); res.status(500).json({error:e.message}); }
});

router.put('/vehicles/:id', rbac('warehouse','super_admin'), async(req,res)=>{
  await ensureFleetCols();
  try{
    const {plat_no, type, brand, model, year, capacity_ton, capacity_volume_m3, capacity_weight_kg, ownership, kir_expiry, tax_expiry, driver_id, status, photo_url, area, tarif_dalam_flat, tarif_dalam_per_ton, tarif_luar_flat, tarif_luar_per_ton, acquisition_date, acquisition_cost, residual_value, useful_life_years} = req.body;
    const v=await pool.query('SELECT * FROM vehicles WHERE id=$1',[req.params.id]);
    if(!v.rows[0]) return res.status(404).json({error:'Armada tidak ditemukan'});
    const plat=(plat_no||v.rows[0].plat_no).trim().toUpperCase();
    const areaVal= area!=null ? (['DALAM_KOTA','LUAR_KOTA'].includes(area)?area:v.rows[0].area) : v.rows[0].area;
    const tDalamFlat= tarif_dalam_flat!=null && tarif_dalam_flat!=='' ? parseFloat(tarif_dalam_flat) : v.rows[0].tarif_dalam_flat;
    const tDalamTon = tarif_dalam_per_ton!=null && tarif_dalam_per_ton!=='' ? parseFloat(tarif_dalam_per_ton) : v.rows[0].tarif_dalam_per_ton;
    const tLuarFlat = tarif_luar_flat!=null && tarif_luar_flat!=='' ? parseFloat(tarif_luar_flat) : v.rows[0].tarif_luar_flat;
    const tLuarTon  = tarif_luar_per_ton!=null && tarif_luar_per_ton!=='' ? parseFloat(tarif_luar_per_ton) : v.rows[0].tarif_luar_per_ton;
    await pool.query(
      `UPDATE vehicles SET plat_no=$1, plate_number=$1, type=$2, brand=$3, model=$4, year=$5, capacity_ton=$6, capacity_weight_kg=$7, capacity_volume_m3=$8, ownership=$9, kir_expiry=$10, tax_expiry=$11, driver_id=$12, status=COALESCE($13,status), photo_url=$14, area=$15, tarif_dalam_flat=$16, tarif_dalam_per_ton=$17, tarif_luar_flat=$18, tarif_luar_per_ton=$19,
              acquisition_date=COALESCE($21,acquisition_date), acquisition_cost=COALESCE($22,acquisition_cost), residual_value=COALESCE($23,residual_value), useful_life_years=COALESCE($24,useful_life_years)
       WHERE id=$20`,
      [plat, type||v.rows[0].type, brand||v.rows[0].brand, model||v.rows[0].model, year?parseInt(year):v.rows[0].year, capacity_ton?parseFloat(capacity_ton):v.rows[0].capacity_ton, capacity_weight_kg?parseFloat(capacity_weight_kg):v.rows[0].capacity_weight_kg, capacity_volume_m3?parseFloat(capacity_volume_m3):v.rows[0].capacity_volume_m3, ownership||v.rows[0].ownership, kir_expiry||v.rows[0].kir_expiry, tax_expiry||v.rows[0].tax_expiry, driver_id!==undefined?driver_id:v.rows[0].driver_id, status||null, photo_url!==undefined?photo_url:v.rows[0].photo_url, areaVal, tDalamFlat, tDalamTon, tLuarFlat, tLuarTon, req.params.id,
       acquisition_date||null, acquisition_cost!=null && acquisition_cost!==''?parseFloat(acquisition_cost):null,
       residual_value!=null && residual_value!==''?parseFloat(residual_value):null,
       useful_life_years!=null && useful_life_years!==''?parseInt(useful_life_years):null]
    );
    // Data perolehan yang diisi di Armada langsung dipakai baris Aset Tetap-nya.
    // (Di halaman Aset, tombol "Tarik Armada" tidak menimpa angka yang sudah ada.)
    try{
      const fa=await pool.query('SELECT id FROM fixed_assets WHERE vehicle_id=$1',[req.params.id]);
      if(fa.rows[0]){
        await pool.query(
          `UPDATE fixed_assets SET
             name = COALESCE($1, name), photo_url = COALESCE($2, photo_url),
             acquisition_date = COALESCE($3, acquisition_date),
             acquisition_cost = COALESCE($4, acquisition_cost),
             book_value = CASE WHEN $4::numeric IS NOT NULL AND COALESCE(accumulated_depreciation,0)=0 THEN $4::numeric ELSE book_value END,
             residual_value = COALESCE($5, residual_value),
             useful_life_years = COALESCE($6, useful_life_years)
           WHERE id = $7`,
          [`${type||v.rows[0].type||'Armada'} - ${plat}`, photo_url!==undefined?photo_url:null,
           acquisition_date||null, acquisition_cost!=null && acquisition_cost!==''?parseFloat(acquisition_cost):null,
           residual_value!=null && residual_value!==''?parseFloat(residual_value):null,
           useful_life_years!=null && useful_life_years!==''?parseInt(useful_life_years):null, fa.rows[0].id]);
      }
    }catch(e){ console.error('[fleet sync asset on PUT]', e.message); }
    res.json({ok:true});
  }catch(e){ console.error('[fleet PUT vehicles]',e); res.status(500).json({error:e.message}); }
});

router.get('/drivers', rbac('warehouse','super_admin'), async(req,res)=>{
  await ensureFleetCols();
  const r=await pool.query('SELECT d.*, e.name, e.phone, e.position FROM drivers d JOIN employees e ON e.id=d.employee_id ORDER BY e.name');
  res.json(r.rows);
});
router.post('/drivers', rbac('warehouse','super_admin'), async(req,res)=>{
  const {employee_id,sim_number,sim_expiry, sim_type}=req.body;
  const ins=await pool.query('INSERT INTO drivers (employee_id,sim_number,sim_expiry,sim_type) VALUES ($1,$2,$3,$4) RETURNING id',[employee_id,sim_number,sim_expiry, sim_type||'B1']);
  res.json(ins.rows[0]);
});

// employees for driver select (vehicles.driver_id -> employees)
router.get('/employees', rbac('warehouse','super_admin'), async(req,res)=>{
  const r=await pool.query(`SELECT id, employee_code, name, phone, position FROM employees WHERE is_active=true ORDER BY name LIMIT 100`);
  res.json(r.rows);
});

router.get('/trips', rbac('warehouse','driver','super_admin'), async(req,res)=>{
  await ensureFleetCols();
  const mine = String(req.query.mine||'')==='1' || isDriverOnly(req.user);
  let where=''; const params=[];
  if(mine){
    const mid = await myDriverId(req.user);
    if(!mid) return res.json([]);
    params.push(mid); where='WHERE t.driver_id=$1';
  }
  const r=await pool.query(`
    SELECT t.*, v.plat_no, v.type as vehicle_type, v.capacity_ton, v.area as vehicle_area,
           e.name as driver_name, e.phone as driver_phone,
           d.sim_expiry,
           del.do_number, del.status as do_status, del.so_id,
           del.received_by as do_received_by, del.pod_signature_url as do_signature_url,
           del.pod_photo_url as do_photo_url, del.invoice_handed as do_invoice_handed, del.delivered_at as do_delivered_at,
           (del.driver_signature_url IS NOT NULL) as do_driver_signed,
           (del.sender_signature_url IS NOT NULL) as do_sender_signed,
           del.office_confirmed_at as do_office_confirmed_at,
           del.distance_km as do_distance_km, del.est_cost as do_est_cost, del.est_cost_dalam as do_est_cost_dalam, del.est_cost_luar as do_est_cost_luar, del.est_zone as do_est_zone, del.est_weight_ton as do_est_weight, del.est_volume_m3 as do_est_volume,
           c.name as customer_name,
           (SELECT COUNT(*)::int FROM invoices i WHERE (del.so_id IS NOT NULL AND i.so_id=del.so_id) OR i.do_id=del.id) as invoice_count,
           (SELECT invoice_number FROM invoices i WHERE (del.so_id IS NOT NULL AND i.so_id=del.so_id) OR i.do_id=del.id ORDER BY i.id DESC LIMIT 1) as invoice_number
    FROM trips t
    LEFT JOIN vehicles v ON v.id=t.vehicle_id
    LEFT JOIN drivers dr ON dr.id=t.driver_id
    LEFT JOIN employees e ON e.id=dr.employee_id
    LEFT JOIN drivers d ON d.employee_id=e.id
    LEFT JOIN delivery_orders del ON del.id=t.do_id
    LEFT JOIN customers c ON c.id=del.customer_id
    ${where}
    ORDER BY t.id DESC LIMIT 80`, params);
  // enrich with cost/km & km/l + variance vs DO estimasi
  for(const t of r.rows){
    const dist=parseFloat(t.distance_km)||0;
    const cost=parseFloat(t.fuel_cost||0)+parseFloat(t.toll_cost||0)+parseFloat(t.other_cost||0);
    t.cost_per_km = dist>0 ? cost/dist : 0;
    const liters=parseFloat(t.fuel_liters||0);
    t.km_per_liter = liters>0 && dist>0 ? dist/liters : null;
    if(t.odometer_start && t.odometer_end) t.odo_distance=(parseInt(t.odometer_end)-parseInt(t.odometer_start));
    const estCost=parseFloat(t.do_est_cost||0);
    if(estCost>0){
      t.est_cost=estCost; t.variance_cost = cost - estCost;
      t.variance_pct = estCost>0 ? (t.variance_cost/estCost*100) : 0;
    }
    const estDalam=parseFloat(t.do_est_cost_dalam||0);
    if(estDalam>0){ t.est_cost_dalam=estDalam; t.variance_dalam = cost - estDalam; t.variance_dalam_pct = estDalam? (cost-estDalam)/estDalam*100:0; }
    const estLuar=parseFloat(t.do_est_cost_luar||0);
    if(estLuar>0){ t.est_cost_luar=estLuar; t.variance_luar = cost - estLuar; t.variance_luar_pct = estLuar? (cost-estLuar)/estLuar*100:0; }
    const doKm=parseFloat(t.do_distance_km||0);
    if(doKm>0 && dist>0) t.variance_km = dist - doKm;
  }
  res.json(r.rows);
});

router.post('/trips', rbac('warehouse','driver','super_admin'), async(req,res)=>{
  await ensureFleetCols();
  try{
    let {vehicle_id,driver_id,do_id,route,distance_km,fuel_cost,toll_cost,other_cost,fuel_liters, odometer_start, notes} = req.body;
    if(isDriverOnly(req.user)){
      const mid=await myDriverId(req.user);
      if(!mid) return res.status(400).json({error:'Akun driver belum tertaut ke data driver (SIM). Hubungi admin.'});
      driver_id=mid;
    }
    if(!vehicle_id) return res.status(400).json({error:'Pilih armada'});
    const vRes=await pool.query('SELECT v.*, e.name as driver_name FROM vehicles v LEFT JOIN employees e ON e.id=v.driver_id WHERE v.id=$1',[vehicle_id]);
    if(!vRes.rows[0]) return res.status(404).json({error:'Armada tidak ditemukan'});
    const v=vRes.rows[0];
    if(v.status!=='AVAILABLE') return res.status(400).json({error:`Armada ${v.plat_no} tidak AVAILABLE (status: ${v.status}) - selesaikan DO/Trip aktif dulu`});
    // KIR & Pajak guard
    if(v.kir_expiry){
      const kir=new Date(v.kir_expiry); const now=new Date(); kir.setHours(0,0,0,0); now.setHours(0,0,0,0);
      if(kir < now) return res.status(400).json({error:`KIR ${v.plat_no} sudah habis (${v.kir_expiry.toISOString? v.kir_expiry.toISOString().slice(0,10): v.kir_expiry}) - perpanjang sebelum jalan (tilang)`});
    }
    if(v.tax_expiry){
      const tax=new Date(v.tax_expiry); const now=new Date(); tax.setHours(0,0,0,0); now.setHours(0,0,0,0);
      if(tax < now) return res.status(400).json({error:`Pajak STNK ${v.plat_no} sudah habis - perpanjang sebelum jalan`});
    }
    // SIM expiry guard + resolve drivers.id (FK trips.driver_id -> drivers.id)
    let driverIdToUse = driver_id ? parseInt(driver_id) : null;
    // if caller sent employee id instead of drivers.id, resolve
    if(driverIdToUse){
      const chk=await pool.query('SELECT id FROM drivers WHERE id=$1',[driverIdToUse]);
      if(!chk.rows[0]){
        const byEmp=await pool.query('SELECT id, sim_expiry FROM drivers WHERE employee_id=$1',[driverIdToUse]);
        if(byEmp.rows[0]) driverIdToUse=byEmp.rows[0].id;
        else {
          // auto-create drivers row for that employee
          const ins=await pool.query(`INSERT INTO drivers (employee_id, sim_number, sim_type, sim_expiry, is_active) VALUES ($1,$2,'B1',CURRENT_DATE + INTERVAL '2 year', true) RETURNING id`,[driverIdToUse]);
          driverIdToUse=ins.rows[0].id;
        }
      }
    }
    if(!driverIdToUse && v.driver_id){
      const dr=await pool.query('SELECT id, sim_expiry FROM drivers WHERE employee_id=$1',[v.driver_id]);
      if(dr.rows[0]){
        driverIdToUse=dr.rows[0].id;
        if(dr.rows[0].sim_expiry){
          const sim=new Date(dr.rows[0].sim_expiry); const now=new Date(); sim.setHours(0,0,0,0); now.setHours(0,0,0,0);
          if(sim < now) return res.status(400).json({error:`SIM driver ${v.driver_name||v.driver_id} sudah habis (${String(dr.rows[0].sim_expiry).slice(0,10)}) - ganti driver`});
        }
      } else {
        const ins=await pool.query(`INSERT INTO drivers (employee_id, sim_number, sim_type, sim_expiry) VALUES ($1,$2,'B1',CURRENT_DATE + INTERVAL '2 year') RETURNING id`,[v.driver_id]);
        driverIdToUse=ins.rows[0].id;
      }
    }
    if(!driverIdToUse){
      // last resort: ambil driver pertama yang ada
      const any=await pool.query('SELECT id FROM drivers ORDER BY id LIMIT 1');
      if(any.rows[0]) driverIdToUse=any.rows[0].id;
      else {
        const emp=await pool.query('SELECT id FROM employees WHERE is_active=true ORDER BY id LIMIT 1');
        const ins=await pool.query(`INSERT INTO drivers (employee_id, sim_number, sim_type, sim_expiry) VALUES ($1,'SIM-AUTO','B1',CURRENT_DATE + INTERVAL '2 year') RETURNING id`,[emp.rows[0]?.id||1]);
        driverIdToUse=ins.rows[0].id;
      }
    }

    // capacity vs muatan check if do_id present
    if(do_id){
      const doRow=await pool.query('SELECT id, so_id FROM delivery_orders WHERE id=$1',[do_id]);
      if(doRow.rows[0]){
        const items=await pool.query('SELECT qty FROM do_details WHERE do_id=$1',[do_id]);
        // heuristic: 1 qty unit ≈ 50kg (1 sak semen 50kg) - for mixed, conservative
        let totalQty=0; for(const it of items.rows) totalQty+=parseFloat(it.qty||0);
        const estTon = totalQty * 0.05; // 50kg per qty
        const capTon = parseFloat(v.capacity_ton||8);
        // if product cat pasir m3, still approximate - use ton as main
        if(estTon > capTon + 0.01){
          return res.status(400).json({error:`OVERLOAD: muatan estimasi ${estTon.toFixed(2)} ton > kapasitas ${capTon} ton (${v.plat_no}). Ganti armada lebih besar atau bagi DO.`});
        }
        // also volume check rough: 1 qty ~ 0.05 m3
        const estVol = totalQty * 0.05;
        const capVol = parseFloat(v.capacity_volume_m3||20);
        if(estVol > capVol + 0.01){
          return res.status(400).json({error:`OVERLOAD volume: ${estVol.toFixed(1)} m³ > kapasitas ${capVol} m³`});
        }
      }
    }

    const num='TRIP-'+Date.now().toString().slice(-6);
    const ins=await pool.query(
      `INSERT INTO trips (trip_number,vehicle_id,driver_id,do_id,route,distance_km,fuel_cost,toll_cost,other_cost,fuel_liters,odometer_start,notes,status,departure_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'IN_PROGRESS',NOW()) RETURNING id`,
      [num, vehicle_id, driverIdToUse, do_id||null, route||null, parseFloat(distance_km)||0, parseFloat(fuel_cost)||0, parseFloat(toll_cost)||0, parseFloat(other_cost)||0, fuel_liters?parseFloat(fuel_liters):null, odometer_start?parseInt(odometer_start):null, notes||null]
    );
    await pool.query("UPDATE vehicles SET status='IN_TRANSIT' WHERE id=$1",[vehicle_id]);
    res.json({id:ins.rows[0].id, trip_number:num});
  }catch(e){ console.error('[fleet POST trips]',e); res.status(500).json({error:e.message}); }
});

router.post('/trips/:id/complete', rbac('warehouse','driver','super_admin'), async(req,res)=>{
  await ensureFleetCols();
  await ensureSignatureCols();
  try{
    const {odometer_end, fuel_liters, fuel_cost, distance_km, notes,
           received_by, pod_signature_url, signature_url, pod_photo_url, pod_notes, invoice_handed, driver_signature_url} = req.body;
    const t=await pool.query('SELECT * FROM trips WHERE id=$1',[req.params.id]);
    if(!t.rows[0]) return res.status(404).json({error:'Trip tidak ditemukan'});
    const trip=t.rows[0];
    if(isDriverOnly(req.user)){ const mid=await myDriverId(req.user); if(trip.driver_id!==mid) return res.status(403).json({error:'Trip ini bukan milik Anda'}); }
    if(trip.status==='COMPLETED') return res.json({ok:true, already:true});
    if(trip.status==='CANCELLED') return res.status(400).json({error:'Trip sudah dibatalkan'});

    // ── Bukti serah terima wajib untuk trip yang membawa pengiriman ──────────
    const sig = pod_signature_url || signature_url || null;
    const photo = pod_photo_url || null;
    const handed = invoice_handed===true || invoice_handed==='true' || invoice_handed===1 || invoice_handed==='1';
    const doRow = trip.do_id ? (await pool.query(
      `SELECT d.*, so.so_number, so.status AS so_status
         FROM delivery_orders d LEFT JOIN sales_orders so ON so.id=d.so_id WHERE d.id=$1`,[trip.do_id])).rows[0] : null;
    if(doRow){
      if(!String(received_by||'').trim()) return res.status(400).json({error:'Nama penerima wajib diisi'});
      if(!sig) return res.status(400).json({error:'Tanda tangan penerima wajib — minta penerima menandatangan di layar'});
      // Tanda tangan pengemudi wajib (serah terima perjalanan); kalau sudah ada saat klaim, tidak diminta ulang
      if(!doRow.driver_signature_url && !driver_signature_url){
        return res.status(400).json({error:'Tanda tangan pengemudi wajib — tanda tangani dulu di area "Tanda Tangan Pengemudi"'});
      }
      if(driver_signature_url){
        if(!String(driver_signature_url).startsWith('data:image/')) return res.status(400).json({error:'Format tanda tangan pengemudi tidak valid'});
        if(String(driver_signature_url).length > 2_000_000) return res.status(400).json({error:'Ukuran tanda tangan terlalu besar'});
      }
      const inv=await pool.query('SELECT COUNT(*)::int AS n FROM invoices WHERE so_id=$1',[doRow.so_id]);
      if(parseInt(inv.rows[0].n)>0 && !handed){
        return res.status(400).json({error:'Konfirmasi invoice sudah diserahkan langsung ke penerima (centang serah terima invoice)'});
      }
    }

    const startOdo=trip.odometer_start;
    let dist=parseFloat(distance_km)|| parseFloat(trip.distance_km)||0;
    if(odometer_end && startOdo) {
      const odoDist=parseInt(odometer_end)-parseInt(startOdo);
      if(odoDist>0) dist=odoDist;
    }

    const client=await pool.connect();
    let docs=null;
    try{
      await client.query('BEGIN');
      await client.query(
        `UPDATE trips SET status='COMPLETED', arrival_date=NOW(), odometer_end=$1, fuel_liters=COALESCE($2,fuel_liters), fuel_cost=COALESCE($3,fuel_cost), distance_km=$4, notes=COALESCE($5,notes) WHERE id=$6`,
        [odometer_end?parseInt(odometer_end):null, fuel_liters?parseFloat(fuel_liters):null, fuel_cost?parseFloat(fuel_cost):null, dist, notes||null, req.params.id]
      );
      if(trip.vehicle_id) await client.query("UPDATE vehicles SET status='AVAILABLE' WHERE id=$1",[trip.vehicle_id]);

      if(doRow){
        // DO: IN_TRANSIT → DELIVERED + bukti serah terima + tanda tangan pengemudi
        await client.query(
          `UPDATE delivery_orders
              SET status='DELIVERED', received_by=$1, pod_signature_url=$2, pod_photo_url=$3,
                  pod_notes=$4, delivered_at=NOW(), invoice_handed=$5,
                  driver_signature_url=COALESCE(driver_signature_url,$6),
                  driver_signed_at=COALESCE(driver_signed_at, CASE WHEN $6::text IS NOT NULL THEN NOW() ELSE NULL END)
            WHERE id=$7 AND status='IN_TRANSIT'`,
          [String(received_by).trim(), sig, photo, pod_notes||notes||null, handed, driver_signature_url||null, doRow.id]
        );
        // Auto-complete SO/POS hanya bila SEMUA invoice lunas DAN semua DO sudah
        // dikonfirmasi Pengirim/Gudang/Kantor (tanda tangan konfirmasi kantor).
        if(doRow.so_id){
          const invAgg=await client.query(
            `SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE COALESCE(paid_amount,0)+0.5 < COALESCE(total,0))::int AS unpaid
               FROM invoices WHERE so_id=$1`,[doRow.so_id]);
          const unpaid=parseInt(invAgg.rows[0]?.unpaid||0);
          const doAgg=await client.query(
            `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE office_confirmed_at IS NULL)::int AS unconfirmed
               FROM delivery_orders WHERE so_id=$1 AND status<>'CANCELLED'`,[doRow.so_id]);
          const unconfirmed=parseInt(doAgg.rows[0]?.unconfirmed||0);
          const cur=String(doRow.so_status||'').toUpperCase();
          const next = (unpaid===0 && unconfirmed===0) ? 'COMPLETED' : (cur==='PARTIAL'||cur==='PENDING' ? cur : 'SHIPPED');
          await client.query(
            `UPDATE sales_orders SET delivered_at=NOW(), status=$1 WHERE id=$2 AND status<>'CANCELLED'`,
            [next, doRow.so_id]
          );
          docs={ source: String(doRow.so_number||'').startsWith('SO-POS-')?'POS':'SO',
                 do_number: doRow.do_number, do_status:'DELIVERED',
                 so_number: doRow.so_number, so_status: next,
                 invoice_handed: handed, fully_paid: unpaid===0, pending_invoices: unpaid,
                 office_confirmed: unconfirmed===0, pending_confirmations: unconfirmed };
        } else {
          docs={ source:'DO', do_number: doRow.do_number, do_status:'DELIVERED', invoice_handed: handed };
        }
      }
      await client.query('COMMIT');
    }catch(e){
      try{ await client.query('ROLLBACK'); }catch{}
      console.error('[fleet complete]',e);
      return res.status(500).json({error:e.message});
    }finally{ client.release(); }

    const updated=await pool.query('SELECT * FROM trips WHERE id=$1',[req.params.id]);
    const u=updated.rows[0];
    const cost=parseFloat(u.fuel_cost||0)+parseFloat(u.toll_cost||0)+parseFloat(u.other_cost||0);
    const km=parseFloat(u.distance_km||0);
    const cost_per_km = km>0 ? cost/km : 0;
    const km_per_l = (parseFloat(u.fuel_liters||0)>0 && km>0) ? km/parseFloat(u.fuel_liters): null;
    res.json({ok:true, cost_per_km, km_per_l, distance_km: km, documents: docs});
  }catch(e){ console.error('[fleet complete]',e); res.status(500).json({error:e.message}); }
});

router.post('/trips/:id/cancel', rbac('warehouse','driver','super_admin'), async(req,res)=>{
  const t=await pool.query('SELECT vehicle_id, status, driver_id, do_id FROM trips WHERE id=$1',[req.params.id]);
  if(isDriverOnly(req.user)){ const mid=await myDriverId(req.user); if(t.rows[0] && t.rows[0].driver_id!==mid) return res.status(403).json({error:'Trip ini bukan milik Anda'}); }
  if(!t.rows[0]) return res.status(404).json({error:'Trip tidak ditemukan'});
  if(t.rows[0].status==='COMPLETED') return res.status(400).json({error:'Trip sudah selesai'});
  await pool.query("UPDATE trips SET status='CANCELLED' WHERE id=$1",[req.params.id]);
  if(t.rows[0].vehicle_id) await pool.query("UPDATE vehicles SET status='AVAILABLE' WHERE id=$1",[t.rows[0].vehicle_id]);
  // DO yang belum terkirim dilepas lagi supaya bisa diklaim driver lain
  const doId=t.rows[0].do_id;
  if(doId){
    const d=await pool.query("SELECT status, do_number, so_id FROM delivery_orders WHERE id=$1",[doId]);
    if(d.rows[0]?.status==='IN_TRANSIT'){
      await pool.query("UPDATE delivery_orders SET driver_id=NULL WHERE id=$1",[doId]);
      // kalau DO ini dibuat dari klaim SO/POS (belum ada invoice), batalkan juga DO-nya
      const inv=await pool.query('SELECT COUNT(*)::int AS n FROM invoices WHERE do_id=$1',[doId]);
      if(parseInt(inv.rows[0].n)===0){
        await pool.query("UPDATE delivery_orders SET status='CANCELLED' WHERE id=$1",[doId]);
        // Kembalikan stok hanya bila stok dipotong saat DO dibuat (SO gudang).
        // Order POS sudah memotong stok di checkout, jadi jangan ditambah lagi.
        const soInfo=await pool.query('SELECT so_number FROM sales_orders WHERE id=$1',[d.rows[0].so_id]);
        const posOrder=/^SO-POS-/i.test(String(soInfo.rows[0]?.so_number||''));
        if(!posOrder) await pool.query("UPDATE stocks s SET qty_on_hand=s.qty_on_hand+dd.qty FROM do_details dd WHERE dd.do_id=$1 AND dd.product_id=s.product_id AND s.warehouse_id=1",[doId]).catch(()=>{});
        await pool.query("UPDATE sales_orders SET status='APPROVED' WHERE id=$1 AND status='SHIPPED'",[d.rows[0].so_id]).catch(()=>{});
      }
    }
  }
  res.json({ok:true});
});

router.get('/maintenance', rbac('warehouse','super_admin'), async(req,res)=>{
  const r=await pool.query('SELECT vm.*, v.plat_no, v.type as vehicle_type FROM vehicle_maintenance vm JOIN vehicles v ON v.id=vm.vehicle_id ORDER BY vm.service_date DESC LIMIT 80');
  res.json(r.rows);
});
router.post('/maintenance', rbac('warehouse','super_admin'), async(req,res)=>{
  const {vehicle_id,maintenance_type,service_date,next_service_date,description,cost, workshop} = req.body;
  if(!vehicle_id) return res.status(400).json({error:'Pilih armada'});
  await pool.query('INSERT INTO vehicle_maintenance (vehicle_id,maintenance_type,service_date,next_service_date,description,cost,workshop) VALUES ($1,$2,$3,$4,$5,$6,$7)',[vehicle_id,maintenance_type||'PREVENTIVE',service_date||new Date().toISOString().slice(0,10),next_service_date||null,description||null,cost?parseFloat(cost):0, workshop||null]);
  res.json({ok:true});
});

router.get('/stats', rbac('warehouse','super_admin'), async(req,res)=>{
  await ensureFleetCols();
  const tot=await pool.query('SELECT COUNT(*) FROM vehicles');
  const avail=await pool.query("SELECT COUNT(*) FROM vehicles WHERE status='AVAILABLE'");
  const intransit=await pool.query("SELECT COUNT(*) FROM vehicles WHERE status='IN_TRANSIT'");
  const maintCount=await pool.query("SELECT COUNT(*) FROM vehicle_maintenance WHERE service_date >= CURRENT_DATE - INTERVAL '30 days'");
  const trips=await pool.query("SELECT COUNT(*) FROM trips WHERE departure_date >= CURRENT_DATE - INTERVAL '30 days'");
  const cost=await pool.query("SELECT COALESCE(SUM(fuel_cost+toll_cost+other_cost),0) as total, COALESCE(SUM(distance_km),0) as km, COALESCE(SUM(fuel_liters),0) as liters FROM trips WHERE departure_date >= CURRENT_DATE - INTERVAL '30 days'");
  const kirOverdue=await pool.query("SELECT COUNT(*) FROM vehicles WHERE kir_expiry IS NOT NULL AND kir_expiry < CURRENT_DATE");
  const kirSoon=await pool.query("SELECT COUNT(*) FROM vehicles WHERE kir_expiry IS NOT NULL AND kir_expiry >= CURRENT_DATE AND kir_expiry < CURRENT_DATE + INTERVAL '30 days'");
  const taxOverdue=await pool.query("SELECT COUNT(*) FROM vehicles WHERE tax_expiry IS NOT NULL AND tax_expiry < CURRENT_DATE");
  const simOverdue=await pool.query("SELECT COUNT(*) FROM drivers WHERE sim_expiry IS NOT NULL AND sim_expiry < CURRENT_DATE");
  const byOwnership=await pool.query("SELECT ownership, COUNT(*) as cnt FROM vehicles GROUP BY ownership");
  const topCost=await pool.query(`
    SELECT v.plat_no, v.type, COUNT(t.id) as trips, COALESCE(SUM(t.fuel_cost+t.toll_cost+t.other_cost),0) as cost, COALESCE(SUM(t.distance_km),0) as km
    FROM vehicles v LEFT JOIN trips t ON t.vehicle_id=v.id AND t.departure_date >= NOW() - INTERVAL '30 days'
    GROUP BY v.id, v.plat_no, v.type ORDER BY cost DESC LIMIT 5`);
  const totalKm=parseFloat(cost.rows[0].km||0);
  const totalCost=parseFloat(cost.rows[0].total||0);
  const avgCostPerKm = totalKm>0 ? totalCost/totalKm : 0;
  // Plan B: est vs actual variance 30 hari - 2 kolom Dalam vs Luar (sesuai tarif per-armada)
  let est30=0, estDalam30=0, estLuar30=0, variance30=0, varianceDalam30=0, varianceLuar30=0;
  try{
    const estQ=await pool.query("SELECT COALESCE(SUM(est_cost),0) as est, COALESCE(SUM(est_cost_dalam),0) as est_dalam, COALESCE(SUM(est_cost_luar),0) as est_luar FROM delivery_orders WHERE created_at >= NOW() - INTERVAL '30 days' AND est_cost IS NOT NULL");
    est30=parseFloat(estQ.rows[0].est||0);
    estDalam30=parseFloat(estQ.rows[0].est_dalam||0);
    estLuar30=parseFloat(estQ.rows[0].est_luar||0);
    variance30 = est30>0 ? totalCost - est30 : 0;
    varianceDalam30 = estDalam30>0 ? totalCost - estDalam30 : 0;
    varianceLuar30 = estLuar30>0 ? totalCost - estLuar30 : 0;
  }catch{}
  res.json({
    total:parseInt(tot.rows[0].count),
    available:parseInt(avail.rows[0].count),
    in_transit:parseInt(intransit.rows[0].count),
    maintenance_30:parseInt(maintCount.rows[0].count),
    trips_30:parseInt(trips.rows[0].count),
    cost_30:totalCost,
    km_30: totalKm,
    liters_30: parseFloat(cost.rows[0].liters||0),
    avg_cost_per_km: avgCostPerKm,
    kir_overdue:parseInt(kirOverdue.rows[0].count),
    kir_soon:parseInt(kirSoon.rows[0].count),
    tax_overdue:parseInt(taxOverdue.rows[0].count),
    sim_overdue:parseInt(simOverdue.rows[0].count),
    by_ownership: byOwnership.rows,
    top_cost: topCost.rows,
    est_30: est30,
    est_dalam_30: estDalam30, est_luar_30: estLuar30,
    variance_30: variance30, variance_dalam_30: varianceDalam30, variance_luar_30: varianceLuar30,
    variance_pct: est30>0 ? (variance30/est30*100): 0,
    variance_dalam_pct: estDalam30>0 ? (varianceDalam30/estDalam30*100): 0,
    variance_luar_pct: estLuar30>0 ? (varianceLuar30/estLuar30*100): 0,
    by_area: await (async()=>{ try{ const ra=await pool.query("SELECT area, COUNT(*) as cnt FROM vehicles GROUP BY area"); return ra.rows; }catch{return []}})(),
    cost_by_area: await (async()=>{ try{ const rc=await pool.query(`SELECT v.area, COALESCE(SUM(t.fuel_cost+t.toll_cost+t.other_cost),0) as cost, COALESCE(SUM(t.distance_km),0) as km, COUNT(t.id) as trips FROM vehicles v LEFT JOIN trips t ON t.vehicle_id=v.id AND t.departure_date>=NOW()-INTERVAL '30 days' GROUP BY v.area`); return rc.rows; }catch{return []}})()
  });
});

router.get('/zones', rbac('warehouse','super_admin'), async(req,res)=>{
  res.json([
    {zone:'Dalam Kota Bekasi', tarif_per_ton:120000, tarif_flat:150000, jangkauan:'0-15km'},
    {zone:'Jakarta', tarif_per_ton:180000, tarif_flat:250000, jangkauan:'15-40km'},
    {zone:'Bandung/Luar Kota', tarif_per_ton:350000, tarif_flat:600000, jangkauan:'>40km'},
  ]);
});

// DO yang ditugaskan ke driver yang login (halaman Trip Saya)
router.get('/my-deliveries', rbac('driver','warehouse','super_admin'), async(req,res)=>{
  await ensureFleetCols();
  try{
    const emp=await myEmployeeId(req.user);
    if(!emp) return res.json([]);
    const r=await pool.query(`SELECT d.id, d.do_number, d.status, d.delivery_date, d.shipping_address,
        d.delivery_address, d.vehicle_no, d.received_by, d.pod_signature_url, d.pod_photo_url,
        d.invoice_handed, d.delivered_at, d.so_id,
        (d.driver_signature_url IS NOT NULL) AS driver_signed,
        (d.sender_signature_url IS NOT NULL) AS sender_signed,
        d.office_confirmed_at,
        c.name AS customer_name, c.phone AS customer_phone,
        so.so_number, so.total AS so_total,
        inv.invoice_number, inv.status AS invoice_status, inv.total AS invoice_total, inv.paid_amount AS invoice_paid
      FROM delivery_orders d
      LEFT JOIN customers c ON c.id=d.customer_id
      LEFT JOIN sales_orders so ON so.id=d.so_id
      LEFT JOIN LATERAL (SELECT invoice_number, status, total, paid_amount FROM invoices WHERE so_id=d.so_id OR do_id=d.id ORDER BY id DESC LIMIT 1) inv ON true
      WHERE d.driver_id=$1 AND d.status NOT IN ('COMPLETED','CANCELLED') ORDER BY d.id DESC LIMIT 30`,[emp]);
    res.json(r.rows);
  }catch(e){ res.status(500).json({error:e.message}); }
});

// ── Klaim pengiriman oleh driver ────────────────────────────────────────────
// Sumber klaim: 1) DO yang sudah diproses gudang tapi belum ada sopir,
//               2) Sales Order APPROVED/PICKING yang belum dibuatkan DO,
//               3) Order POS (SO-POS-*) lunas/DP yang belum dibuatkan DO.
router.get('/claimable', rbac('driver','warehouse','super_admin'), async(req,res)=>{
  await ensureFleetCols();
  try{
    const dos=await pool.query(`
      SELECT 'DO' AS source, d.id, d.do_number AS number, d.status, d.delivery_date, d.vehicle_no,
             COALESCE(d.delivery_address, c.address) AS address,
             c.name AS customer_name, c.phone AS customer_phone,
             so.so_number, so.total, d.est_weight_ton, d.est_zone, d.distance_km,
             d.delivery_lat, d.delivery_lng,
             (SELECT COUNT(*)::int FROM do_details dd WHERE dd.do_id=d.id) AS items_count,
             (SELECT COALESCE(SUM(qty),0)::float FROM do_details dd WHERE dd.do_id=d.id) AS total_qty
        FROM delivery_orders d
        LEFT JOIN customers c ON c.id=d.customer_id
        LEFT JOIN sales_orders so ON so.id=d.so_id
       WHERE d.status='IN_TRANSIT' AND d.driver_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM trips t WHERE t.do_id=d.id AND t.status='IN_PROGRESS')
       ORDER BY d.id DESC LIMIT 40`);
    const sos=await pool.query(`
      SELECT CASE WHEN so.so_number LIKE 'SO-POS-%' THEN 'POS' ELSE 'SO' END AS source,
             so.id, so.so_number AS number, so.status, so.delivery_date, NULL::varchar AS vehicle_no,
             COALESCE(so.delivery_address, c.address) AS address,
             c.name AS customer_name, c.phone AS customer_phone,
             so.so_number, so.total, NULL::numeric AS est_weight_ton, NULL::varchar AS est_zone, NULL::numeric AS distance_km,
             COALESCE(so.delivery_lat, c.lat) AS delivery_lat, COALESCE(so.delivery_lng, c.lng) AS delivery_lng,
             (SELECT COUNT(*)::int FROM so_details sd WHERE sd.so_id=so.id) AS items_count,
             (SELECT COALESCE(SUM(qty),0)::float FROM so_details sd WHERE sd.so_id=so.id) AS total_qty
        FROM sales_orders so
        JOIN customers c ON c.id=so.customer_id
       WHERE ( (so.so_number NOT LIKE 'SO-POS-%' AND so.status IN ('APPROVED','PICKING'))
            OR (so.so_number LIKE 'SO-POS-%' AND so.status IN ('COMPLETED','PARTIAL')
                AND so.delivery_address IS NOT NULL AND BTRIM(so.delivery_address)<>''
                AND so.so_date >= CURRENT_DATE - INTERVAL '60 days') )
         AND EXISTS (SELECT 1 FROM so_details sd2 WHERE sd2.so_id=so.id)
         AND NOT EXISTS (SELECT 1 FROM delivery_orders d WHERE d.so_id=so.id AND d.status NOT IN ('CANCELLED'))
       ORDER BY so.id DESC LIMIT 40`);
    const data=[...dos.rows, ...sos.rows];
    res.json({data, counts:{
      DO: dos.rows.length,
      SO: sos.rows.filter(r=>r.source==='SO').length,
      POS: sos.rows.filter(r=>r.source==='POS').length,
      total: data.length,
    }});
  }catch(e){ console.error('[claimable]',e); res.status(500).json({error:e.message}); }
});

router.post('/claim', rbac('driver','warehouse','super_admin'), async(req,res)=>{
  await ensureFleetCols();
  await ensureSignatureCols();
  const {source, id, vehicle_id, odometer_start, notes, distance_km, delivery_lat, delivery_lng, driver_signature_url, sender_signature_url, sender_signed_by} = req.body;
  const src=String(source||'').toUpperCase();
  if(!['DO','SO','POS'].includes(src)) return res.status(400).json({error:'Jenis klaim harus DO, SO, atau POS'});
  if(!id) return res.status(400).json({error:'Pengiriman yang diklaim belum dipilih'});
  if(!vehicle_id) return res.status(400).json({error:'Pilih armada dulu sebelum klaim'});
  // Tanda tangan pengemudi wajib saat klaim (serah terima muatan dari gudang ke driver)
  if(!driver_signature_url || !String(driver_signature_url).startsWith('data:image/')){
    return res.status(400).json({error:'Tanda tangan pengemudi wajib — tanda tangani dulu sebelum klaim pengiriman'});
  }
  if(String(driver_signature_url).length > 2_000_000) return res.status(400).json({error:'Ukuran tanda tangan terlalu besar'});
  // Tanda tangan Pengirim/Gudang saat serah terima muatan (opsional di jalur klaim,
  // karena DO dari gudang sudah ditandatangani saat pembuatan DO).
  const senderSig = sender_signature_url ? String(sender_signature_url) : null;
  if(senderSig && !senderSig.startsWith('data:image/')) return res.status(400).json({error:'Format tanda tangan pengirim tidak valid'});
  if(senderSig && senderSig.length > 2_000_000) return res.status(400).json({error:'Ukuran tanda tangan pengirim terlalu besar'});
  const senderBy = String(sender_signed_by||'').trim() || null;
  if(senderSig && !senderBy) return res.status(400).json({error:'Nama petugas gudang/pengirim wajib diisi bersama tanda tangannya'});
  try{
    const empId=await myEmployeeId(req.user);
    if(!empId) return res.status(400).json({error:'Akun belum terhubung ke data karyawan'});
    const drvId=await myDriverId(req.user);
    if(!drvId) return res.status(400).json({error:'Data sopir belum ada untuk akun ini - hubungi HRD'});
    const active=await pool.query("SELECT trip_number FROM trips WHERE driver_id=$1 AND status='IN_PROGRESS' ORDER BY id DESC LIMIT 1",[drvId]);
    if(active.rows[0]) return res.status(400).json({error:`Masih ada trip aktif ${active.rows[0].trip_number}. Selesaikan trip itu dulu sebelum klaim pengiriman baru.`});

    const v=await pool.query('SELECT * FROM vehicles WHERE id=$1',[vehicle_id]);
    if(!v.rows[0]) return res.status(404).json({error:'Armada tidak ditemukan'});
    if(v.rows[0].status!=='AVAILABLE'){
      // Armada yang sudah ditugaskan gudang ke DO ini (status IN_TRANSIT karena DO)
      // tetap boleh dipakai driver yang mengklaim DO tersebut.
      let milikDoIni=false;
      if(src==='DO'){
        const dchk=await pool.query('SELECT vehicle_no, status FROM delivery_orders WHERE id=$1',[id]);
        milikDoIni = dchk.rows[0]?.status==='IN_TRANSIT' && dchk.rows[0]?.vehicle_no===v.rows[0].plat_no;
      }
      if(!milikDoIni) return res.status(400).json({error:`Armada ${v.rows[0].plat_no} tidak AVAILABLE (status ${v.rows[0].status})`});
    }
    if(expiredOn(v.rows[0].kir_expiry)) return res.status(400).json({error:`KIR ${v.rows[0].plat_no} sudah habis - perpanjang dulu`});
    if(expiredOn(v.rows[0].tax_expiry)) return res.status(400).json({error:`Pajak STNK ${v.rows[0].plat_no} sudah habis - perpanjang dulu`});
    const sim=await pool.query('SELECT sim_expiry FROM drivers WHERE id=$1',[drvId]);
    if(expiredOn(sim.rows[0]?.sim_expiry)) return res.status(400).json({error:'SIM Anda sudah habis - perbarui data SIM dulu'});

    let doId=null, doNumber=null, soNumber=null, plannedKm=0;
    if(src==='DO'){
      const d=await pool.query('SELECT * FROM delivery_orders WHERE id=$1',[id]);
      const row=d.rows[0];
      if(!row) return res.status(404).json({error:'DO tidak ditemukan'});
      if(row.status!=='IN_TRANSIT') return res.status(400).json({error:`DO ${row.do_number} tidak bisa diklaim (status ${row.status})`});
      if(row.driver_id && row.driver_id!==empId){
        // driver_id bisa saja terisi otomatis dari armada saat gudang membuat DO
        // (bukan klaim sungguhan). Klaim hanya ditolak kalau DO sudah punya trip aktif
        // atau driver-nya bukan driver default armada tersebut.
        const def=await pool.query('SELECT driver_id FROM vehicles WHERE plat_no=$1',[row.vehicle_no]);
        const isDefault = !!def.rows[0]?.driver_id && def.rows[0].driver_id===row.driver_id;
        const taken=await pool.query("SELECT 1 FROM trips WHERE do_id=$1 AND status='IN_PROGRESS' LIMIT 1",[id]);
        if(!isDefault || taken.rows[0]) return res.status(403).json({error:'DO ini sudah diklaim driver lain'});
      }
      // Kalau driver memakai armada lain, armada yang dipilih gudang tadi dilepas lagi
      // supaya tidak menggantung IN_TRANSIT tanpa sopir.
      if(row.vehicle_no && row.vehicle_no!==v.rows[0].plat_no){
        await pool.query(`UPDATE vehicles SET status='AVAILABLE'
            WHERE plat_no=$1 AND status='IN_TRANSIT'
              AND NOT EXISTS (SELECT 1 FROM delivery_orders x WHERE x.vehicle_no=$1 AND x.status='IN_TRANSIT' AND x.id<>$2)`,[row.vehicle_no, id]).catch(()=>{});
      }
      await pool.query(`UPDATE delivery_orders
          SET driver_id=$1, vehicle_no=$2, driver_signature_url=$3, driver_signed_at=NOW(),
              sender_signature_url=COALESCE($5, sender_signature_url),
              sender_signed_at=CASE WHEN $5::text IS NOT NULL THEN COALESCE(sender_signed_at, NOW()) ELSE sender_signed_at END,
              sender_signed_by=COALESCE($6, sender_signed_by)
        WHERE id=$4`,[empId, v.rows[0].plat_no, driver_signature_url, id, senderSig, senderBy]);
      // jarak otomatis: nilai dari UI (peta/geocode) > koordinat tersimpan > geocode alamat
      const distIn = parseFloat(distance_km||0) || 0;
      if(distIn>0){
        await pool.query('UPDATE delivery_orders SET distance_km=$1, est_zone=$2, delivery_lat=COALESCE($3,delivery_lat), delivery_lng=COALESCE($4,delivery_lng) WHERE id=$5',
          [distIn, estZoneFromKm(distIn), delivery_lat?parseFloat(delivery_lat):null, delivery_lng?parseFloat(delivery_lng):null, id]);
      } else if(!parseFloat(row.distance_km||0)){
        const cust=await pool.query('SELECT address, lat, lng FROM customers WHERE id=$1',[row.customer_id]);
        const dist=await distanceFromAddress({
          lat: row.delivery_lat ?? cust.rows[0]?.lat,
          lng: row.delivery_lng ?? cust.rows[0]?.lng,
          address: row.delivery_address || row.shipping_address || cust.rows[0]?.address,
        });
        if(dist){
          await pool.query('UPDATE delivery_orders SET distance_km=$1, est_zone=$2, delivery_lat=COALESCE(delivery_lat,$3), delivery_lng=COALESCE(delivery_lng,$4) WHERE id=$5',
            [dist.km, dist.zone, dist.lat, dist.lng, id]);
        }
      }
      const so=await pool.query('SELECT so_number FROM sales_orders WHERE id=$1',[row.so_id]);
      const distRow=await pool.query('SELECT distance_km FROM delivery_orders WHERE id=$1',[id]);
      plannedKm=parseFloat(distRow.rows[0]?.distance_km||0)||0;
      doId=row.id; doNumber=row.do_number; soNumber=so.rows[0]?.so_number||null;
    }else{
      const created=await createDelivery({
        so_id:parseInt(id), vehicle_id:parseInt(vehicle_id), driver_id:empId, allow_completed:src==='POS',
        distance_km: distance_km? parseFloat(distance_km): undefined,
        delivery_lat: delivery_lat||undefined, delivery_lng: delivery_lng||undefined,
        driver_signature_url,
        sender_signature_url: senderSig||undefined,
        sender_signed_by: senderBy||undefined,
      });
      const so=await pool.query('SELECT so_number FROM sales_orders WHERE id=$1',[id]);
      plannedKm=parseFloat(created.distance_km||0)||0;
      doId=created.id; doNumber=created.do_number; soNumber=so.rows[0]?.so_number||null;
    }

    const num='TRIP-'+Date.now().toString().slice(-6);
    const t=await pool.query(
      `INSERT INTO trips (trip_number,vehicle_id,driver_id,do_id,route,distance_km,fuel_cost,toll_cost,other_cost,status,departure_date,odometer_start,notes)
       VALUES ($1,$2,$3,$4,NULL,$7,0,0,0,'IN_PROGRESS',NOW(),$5,$6) RETURNING id`,
      [num, vehicle_id, drvId, doId, odometer_start?parseInt(odometer_start):null, notes||null, plannedKm]
    );
    await pool.query("UPDATE vehicles SET status='IN_TRANSIT' WHERE id=$1",[vehicle_id]);
    res.json({ok:true, trip_id:t.rows[0].id, trip_number:num, do_id:doId, do_number:doNumber, so_number:soNumber, source:src, plat_no:v.rows[0].plat_no, distance_km:plannedKm});
  }catch(e){
    if(e instanceof DeliveryError) return res.status(e.status).json({error:e.message});
    console.error('[claim]',e); res.status(500).json({error:e.message});
  }
});


// Jarak + koordinat dari alamat (dipakai modal klaim & form pengiriman).
// Geocoding dilakukan di server (cache) supaya tidak kena rate-limit browser.
router.get('/geocode', rbac('driver','warehouse','super_admin','sales','sales_trading','pos_cashier','pos_supervisor','pos_manager'), async(req,res)=>{
  const address=String(req.query.address||'').trim();
  if(!address) return res.status(400).json({error:'Alamat tujuan wajib diisi'});
  try{
    const d=await distanceFromAddress({ address });
    if(!d) return res.json({ found:false, km:null, zone:null, lat:null, lng:null });
    res.json({ found:true, ...d });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// Daftar surat jalan: driver hanya melihat miliknya, gudang/sales melihat semua.
router.get('/surat-jalan', rbac('driver','warehouse','sales','sales_trading','finance','super_admin','direktur','pos_cashier','pos_supervisor','pos_manager'), async(req,res)=>{
  await ensureFleetCols();
  try{
    const driverOnly=isDriverOnly(req.user);
    const emp = driverOnly ? await myEmployeeId(req.user) : null;
    if(driverOnly && !emp) return res.json([]);
    const r=await pool.query(`
      SELECT d.id, d.do_number, d.status, d.delivery_date, d.distance_km, d.vehicle_no,
             d.received_by, d.delivered_at, d.invoice_handed,
             COALESCE(d.delivery_address, c.address) AS address,
             c.name AS customer_name, so.so_number, e.name AS driver_name,
             (SELECT COUNT(*)::int FROM do_details dd WHERE dd.do_id=d.id) AS items_count,
             (SELECT COALESCE(SUM(qty),0)::float FROM do_details dd WHERE dd.do_id=d.id) AS total_qty
        FROM delivery_orders d
        LEFT JOIN customers c ON c.id=d.customer_id
        LEFT JOIN sales_orders so ON so.id=d.so_id
        LEFT JOIN employees e ON e.id=d.driver_id
       WHERE d.status <> 'CANCELLED' ${driverOnly? 'AND d.driver_id=$1':''}
       ORDER BY d.id DESC LIMIT 60`, driverOnly? [emp] : []);
    res.json(r.rows);
  }catch(e){ console.error('[surat-jalan list]',e); res.status(500).json({error:e.message}); }
});

// ── Surat Jalan (dokumen DO) ────────────────────────────────────────────────
// Dibuka driver setelah klaim, juga dari Logistik/gudang. Berisi item, tujuan,
// kendaraan, bukti serah terima (TTD/foto), dan info invoice.
router.get('/surat-jalan/:id', rbac('driver','warehouse','sales','sales_trading','finance','super_admin','direktur','pos_cashier','pos_supervisor','pos_manager'), async (req,res)=>{
  await ensureFleetCols();
  try{
    const r=await pool.query(`
      SELECT d.*, c.name AS customer_name, c.phone AS customer_phone, c.address AS customer_address, c.code AS customer_code,
             so.so_number, so.so_date, so.total AS so_total, so.status AS so_status,
             inv.invoice_number, inv.status AS invoice_status, inv.total AS invoice_total, inv.paid_amount AS invoice_paid,
             e.name AS driver_name, e.phone AS driver_phone,
             v.plat_no AS vehicle_plat, v.type AS vehicle_type, v.capacity_ton AS vehicle_capacity,
             t.trip_number, t.departure_date, t.arrival_date, t.status AS trip_status
        FROM delivery_orders d
        LEFT JOIN customers c ON c.id=d.customer_id
        LEFT JOIN sales_orders so ON so.id=d.so_id
        LEFT JOIN LATERAL (
          SELECT invoice_number, status, total, paid_amount
            FROM invoices WHERE do_id=d.id OR so_id=d.so_id ORDER BY id DESC LIMIT 1
        ) inv ON true
        LEFT JOIN vehicles v ON v.plat_no=d.vehicle_no
        LEFT JOIN LATERAL (
          SELECT trip_number, departure_date, arrival_date, status, driver_id AS trip_driver_id
            FROM trips WHERE do_id=d.id ORDER BY id DESC LIMIT 1
        ) t ON true
        LEFT JOIN drivers dr ON dr.id = COALESCE(t.trip_driver_id, NULL)
        LEFT JOIN employees e ON e.id = COALESCE(dr.employee_id, d.driver_id)
       WHERE d.id=$1`,[req.params.id]);
    if(!r.rows[0]) return res.status(404).json({error:'Surat jalan tidak ditemukan'});
    const doc=r.rows[0];
    const items=await pool.query(`
      SELECT dd.id, dd.qty, p.name AS product_name, p.sku, u.code AS unit_code
        FROM do_details dd
        JOIN products p ON p.id=dd.product_id
        LEFT JOIN units u ON u.id=p.base_unit_id
       WHERE dd.do_id=$1 ORDER BY dd.id`,[req.params.id]);
    doc.items=items.rows;
    doc.address = doc.delivery_address || doc.shipping_address || doc.customer_address || null;
    res.json(doc);
  }catch(e){ console.error('[surat-jalan]',e); res.status(500).json({error:e.message}); }
});

export default router;
