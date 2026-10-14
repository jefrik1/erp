import express from 'express';
import { pool } from '../../config/db.js';
const router=express.Router();

let fleetEnsured=false;
async function ensureFleetCols(){
  if(fleetEnsured) return;
  try{
    await pool.query(`ALTER TABLE trips ADD COLUMN IF NOT EXISTS odometer_start INT`);
    await pool.query(`ALTER TABLE trips ADD COLUMN IF NOT EXISTS odometer_end INT`);
    await pool.query(`ALTER TABLE trips ADD COLUMN IF NOT EXISTS fuel_liters DECIMAL(10,2)`);
    await pool.query(`ALTER TABLE trips ADD COLUMN IF NOT EXISTS notes TEXT`);
    await pool.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS photo_url TEXT`);
    await pool.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS stnk_url TEXT`);
    await pool.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS notes TEXT`);
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

// GET vehicles — enriched for Phase 0-2
router.get('/vehicles', async(req,res)=>{
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
        // DO estimasi 30d per kendaraan — 2 kolom terpisah Dalam Kota vs Luar Kota (per-armada tarif)
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

router.get('/vehicles/:id/history', async(req,res)=>{
  await ensureFleetCols();
  const v=await pool.query('SELECT plat_no FROM vehicles WHERE id=$1',[req.params.id]);
  if(!v.rows[0]) return res.status(404).json({error:'Armada tidak ditemukan'});
  const plat=v.rows[0].plat_no;
  const dos=await pool.query(`SELECT d.*, c.name as customer_name, so.so_number, so.total as so_total FROM delivery_orders d LEFT JOIN customers c ON c.id=d.customer_id LEFT JOIN sales_orders so ON so.id=d.so_id WHERE d.vehicle_no=$1 ORDER BY d.id DESC LIMIT 20`,[plat]);
  const trips=await pool.query(`SELECT t.*, del.do_number FROM trips t LEFT JOIN delivery_orders del ON del.id=t.do_id WHERE t.vehicle_id=$1 ORDER BY t.id DESC LIMIT 20`,[req.params.id]);
  const maint=await pool.query(`SELECT * FROM vehicle_maintenance WHERE vehicle_id=$1 ORDER BY service_date DESC LIMIT 20`,[req.params.id]);
  res.json({plat_no: plat, deliveries: dos.rows, trips: trips.rows, maintenance: maint.rows});
});

router.post('/vehicles', async(req,res)=>{
  await ensureFleetCols();
  try{
    const {plat_no, plate_number, type, brand, model, year, capacity_ton, capacity_volume_m3, capacity_weight_kg, ownership, kir_expiry, tax_expiry, driver_id, photo_url, area, tarif_dalam_flat, tarif_dalam_per_ton, tarif_luar_flat, tarif_luar_per_ton} = req.body;
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
      `INSERT INTO vehicles (plat_no,plate_number,type,brand,model,year,capacity_ton,capacity_weight_kg,capacity_volume_m3,ownership,status,driver_id,kir_expiry,tax_expiry,photo_url, area, tarif_dalam_flat, tarif_dalam_per_ton, tarif_luar_flat, tarif_luar_per_ton)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'AVAILABLE',$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`,
      [plat, plat, type||'ENGKEL', brand||'Mitsubishi', model||null, year?parseInt(year):null, ton, wkg, vol, own, driver_id||null, kir_expiry||null, tax_expiry||null, photo_url||null, areaVal, tDalamFlat, tDalamTon, tLuarFlat, tLuarTon]
    );
    res.json(ins.rows[0]);
  }catch(e){ console.error('[fleet POST vehicles]',e); res.status(500).json({error:e.message}); }
});

router.put('/vehicles/:id', async(req,res)=>{
  await ensureFleetCols();
  try{
    const {plat_no, type, brand, model, year, capacity_ton, capacity_volume_m3, capacity_weight_kg, ownership, kir_expiry, tax_expiry, driver_id, status, photo_url, area, tarif_dalam_flat, tarif_dalam_per_ton, tarif_luar_flat, tarif_luar_per_ton} = req.body;
    const v=await pool.query('SELECT * FROM vehicles WHERE id=$1',[req.params.id]);
    if(!v.rows[0]) return res.status(404).json({error:'Armada tidak ditemukan'});
    const plat=(plat_no||v.rows[0].plat_no).trim().toUpperCase();
    const areaVal= area!=null ? (['DALAM_KOTA','LUAR_KOTA'].includes(area)?area:v.rows[0].area) : v.rows[0].area;
    const tDalamFlat= tarif_dalam_flat!=null && tarif_dalam_flat!=='' ? parseFloat(tarif_dalam_flat) : v.rows[0].tarif_dalam_flat;
    const tDalamTon = tarif_dalam_per_ton!=null && tarif_dalam_per_ton!=='' ? parseFloat(tarif_dalam_per_ton) : v.rows[0].tarif_dalam_per_ton;
    const tLuarFlat = tarif_luar_flat!=null && tarif_luar_flat!=='' ? parseFloat(tarif_luar_flat) : v.rows[0].tarif_luar_flat;
    const tLuarTon  = tarif_luar_per_ton!=null && tarif_luar_per_ton!=='' ? parseFloat(tarif_luar_per_ton) : v.rows[0].tarif_luar_per_ton;
    await pool.query(
      `UPDATE vehicles SET plat_no=$1, plate_number=$1, type=$2, brand=$3, model=$4, year=$5, capacity_ton=$6, capacity_weight_kg=$7, capacity_volume_m3=$8, ownership=$9, kir_expiry=$10, tax_expiry=$11, driver_id=$12, status=COALESCE($13,status), photo_url=$14, area=$15, tarif_dalam_flat=$16, tarif_dalam_per_ton=$17, tarif_luar_flat=$18, tarif_luar_per_ton=$19 WHERE id=$20`,
      [plat, type||v.rows[0].type, brand||v.rows[0].brand, model||v.rows[0].model, year?parseInt(year):v.rows[0].year, capacity_ton?parseFloat(capacity_ton):v.rows[0].capacity_ton, capacity_weight_kg?parseFloat(capacity_weight_kg):v.rows[0].capacity_weight_kg, capacity_volume_m3?parseFloat(capacity_volume_m3):v.rows[0].capacity_volume_m3, ownership||v.rows[0].ownership, kir_expiry||v.rows[0].kir_expiry, tax_expiry||v.rows[0].tax_expiry, driver_id!==undefined?driver_id:v.rows[0].driver_id, status||null, photo_url!==undefined?photo_url:v.rows[0].photo_url, areaVal, tDalamFlat, tDalamTon, tLuarFlat, tLuarTon, req.params.id]
    );
    res.json({ok:true});
  }catch(e){ console.error('[fleet PUT vehicles]',e); res.status(500).json({error:e.message}); }
});

router.get('/drivers', async(req,res)=>{
  await ensureFleetCols();
  const r=await pool.query('SELECT d.*, e.name, e.phone, e.position FROM drivers d JOIN employees e ON e.id=d.employee_id ORDER BY e.name');
  res.json(r.rows);
});
router.post('/drivers', async(req,res)=>{
  const {employee_id,sim_number,sim_expiry, sim_type}=req.body;
  const ins=await pool.query('INSERT INTO drivers (employee_id,sim_number,sim_expiry,sim_type) VALUES ($1,$2,$3,$4) RETURNING id',[employee_id,sim_number,sim_expiry, sim_type||'B1']);
  res.json(ins.rows[0]);
});

// employees for driver select (vehicles.driver_id -> employees)
router.get('/employees', async(req,res)=>{
  const r=await pool.query(`SELECT id, employee_code, name, phone, position FROM employees WHERE is_active=true ORDER BY name LIMIT 100`);
  res.json(r.rows);
});

router.get('/trips', async(req,res)=>{
  await ensureFleetCols();
  const r=await pool.query(`
    SELECT t.*, v.plat_no, v.type as vehicle_type, v.capacity_ton, v.area as vehicle_area,
           e.name as driver_name, e.phone as driver_phone,
           d.sim_expiry,
           del.do_number, del.status as do_status, del.so_id,
           del.distance_km as do_distance_km, del.est_cost as do_est_cost, del.est_cost_dalam as do_est_cost_dalam, del.est_cost_luar as do_est_cost_luar, del.est_zone as do_est_zone, del.est_weight_ton as do_est_weight, del.est_volume_m3 as do_est_volume,
           c.name as customer_name
    FROM trips t
    LEFT JOIN vehicles v ON v.id=t.vehicle_id
    LEFT JOIN drivers dr ON dr.id=t.driver_id
    LEFT JOIN employees e ON e.id=dr.employee_id
    LEFT JOIN drivers d ON d.employee_id=e.id
    LEFT JOIN delivery_orders del ON del.id=t.do_id
    LEFT JOIN customers c ON c.id=del.customer_id
    ORDER BY t.id DESC LIMIT 80`);
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

router.post('/trips', async(req,res)=>{
  await ensureFleetCols();
  try{
    const {vehicle_id,driver_id,do_id,route,distance_km,fuel_cost,toll_cost,other_cost,fuel_liters, odometer_start, notes} = req.body;
    if(!vehicle_id) return res.status(400).json({error:'Pilih armada'});
    const vRes=await pool.query('SELECT v.*, e.name as driver_name FROM vehicles v LEFT JOIN employees e ON e.id=v.driver_id WHERE v.id=$1',[vehicle_id]);
    if(!vRes.rows[0]) return res.status(404).json({error:'Armada tidak ditemukan'});
    const v=vRes.rows[0];
    if(v.status!=='AVAILABLE') return res.status(400).json({error:`Armada ${v.plat_no} tidak AVAILABLE (status: ${v.status}) — selesaikan DO/Trip aktif dulu`});
    // KIR & Pajak guard
    if(v.kir_expiry){
      const kir=new Date(v.kir_expiry); const now=new Date(); kir.setHours(0,0,0,0); now.setHours(0,0,0,0);
      if(kir < now) return res.status(400).json({error:`KIR ${v.plat_no} sudah habis (${v.kir_expiry.toISOString? v.kir_expiry.toISOString().slice(0,10): v.kir_expiry}) — perpanjang sebelum jalan (tilang)`});
    }
    if(v.tax_expiry){
      const tax=new Date(v.tax_expiry); const now=new Date(); tax.setHours(0,0,0,0); now.setHours(0,0,0,0);
      if(tax < now) return res.status(400).json({error:`Pajak STNK ${v.plat_no} sudah habis — perpanjang sebelum jalan`});
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
          if(sim < now) return res.status(400).json({error:`SIM driver ${v.driver_name||v.driver_id} sudah habis (${String(dr.rows[0].sim_expiry).slice(0,10)}) — ganti driver`});
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
        // heuristic: 1 qty unit ≈ 50kg (1 sak semen 50kg) — for mixed, conservative
        let totalQty=0; for(const it of items.rows) totalQty+=parseFloat(it.qty||0);
        const estTon = totalQty * 0.05; // 50kg per qty
        const capTon = parseFloat(v.capacity_ton||8);
        // if product cat pasir m3, still approximate — use ton as main
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

router.post('/trips/:id/complete', async(req,res)=>{
  await ensureFleetCols();
  try{
    const {odometer_end, fuel_liters, fuel_cost, distance_km, notes} = req.body;
    const t=await pool.query('SELECT * FROM trips WHERE id=$1',[req.params.id]);
    if(!t.rows[0]) return res.status(404).json({error:'Trip tidak ditemukan'});
    if(t.rows[0].status==='COMPLETED') return res.json({ok:true, already:true});
    if(t.rows[0].status==='CANCELLED') return res.status(400).json({error:'Trip sudah dibatalkan'});
    const startOdo=t.rows[0].odometer_start;
    let dist=parseFloat(distance_km)|| parseFloat(t.rows[0].distance_km)||0;
    if(odometer_end && startOdo) {
      const odoDist=parseInt(odometer_end)-parseInt(startOdo);
      if(odoDist>0) dist=odoDist;
    }
    await pool.query(
      `UPDATE trips SET status='COMPLETED', arrival_date=NOW(), odometer_end=$1, fuel_liters=COALESCE($2,fuel_liters), fuel_cost=COALESCE($3,fuel_cost), distance_km=$4, notes=COALESCE($5,notes) WHERE id=$6`,
      [odometer_end?parseInt(odometer_end):null, fuel_liters?parseFloat(fuel_liters):null, fuel_cost?parseFloat(fuel_cost):null, dist, notes||null, req.params.id]
    );
    if(t.rows[0].vehicle_id) await pool.query("UPDATE vehicles SET status='AVAILABLE' WHERE id=$1",[t.rows[0].vehicle_id]);
    // compute metrics
    const updated=await pool.query('SELECT * FROM trips WHERE id=$1',[req.params.id]);
    const u=updated.rows[0];
    const cost=parseFloat(u.fuel_cost||0)+parseFloat(u.toll_cost||0)+parseFloat(u.other_cost||0);
    const km=parseFloat(u.distance_km||0);
    const cost_per_km = km>0 ? cost/km : 0;
    const km_per_l = (parseFloat(u.fuel_liters||0)>0 && km>0) ? km/parseFloat(u.fuel_liters): null;
    res.json({ok:true, cost_per_km, km_per_l, distance_km: km});
  }catch(e){ console.error('[fleet complete]',e); res.status(500).json({error:e.message}); }
});

router.post('/trips/:id/cancel', async(req,res)=>{
  const t=await pool.query('SELECT vehicle_id, status FROM trips WHERE id=$1',[req.params.id]);
  if(!t.rows[0]) return res.status(404).json({error:'Trip tidak ditemukan'});
  if(t.rows[0].status==='COMPLETED') return res.status(400).json({error:'Trip sudah selesai'});
  await pool.query("UPDATE trips SET status='CANCELLED' WHERE id=$1",[req.params.id]);
  if(t.rows[0].vehicle_id) await pool.query("UPDATE vehicles SET status='AVAILABLE' WHERE id=$1",[t.rows[0].vehicle_id]);
  res.json({ok:true});
});

router.get('/maintenance', async(req,res)=>{
  const r=await pool.query('SELECT vm.*, v.plat_no, v.type as vehicle_type FROM vehicle_maintenance vm JOIN vehicles v ON v.id=vm.vehicle_id ORDER BY vm.service_date DESC LIMIT 80');
  res.json(r.rows);
});
router.post('/maintenance', async(req,res)=>{
  const {vehicle_id,maintenance_type,service_date,next_service_date,description,cost, workshop} = req.body;
  if(!vehicle_id) return res.status(400).json({error:'Pilih armada'});
  await pool.query('INSERT INTO vehicle_maintenance (vehicle_id,maintenance_type,service_date,next_service_date,description,cost,workshop) VALUES ($1,$2,$3,$4,$5,$6,$7)',[vehicle_id,maintenance_type||'PREVENTIVE',service_date||new Date().toISOString().slice(0,10),next_service_date||null,description||null,cost?parseFloat(cost):0, workshop||null]);
  res.json({ok:true});
});

router.get('/stats', async(req,res)=>{
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
  // Plan B: est vs actual variance 30 hari — 2 kolom Dalam vs Luar (sesuai tarif per-armada)
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

router.get('/zones', async(req,res)=>{
  res.json([
    {zone:'Dalam Kota Bekasi', tarif_per_ton:120000, tarif_flat:150000, jangkauan:'0-15km'},
    {zone:'Jakarta', tarif_per_ton:180000, tarif_flat:250000, jangkauan:'15-40km'},
    {zone:'Bandung/Luar Kota', tarif_per_ton:350000, tarif_flat:600000, jangkauan:'>40km'},
  ]);
});

export default router;
