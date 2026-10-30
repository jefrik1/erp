// Service pembuatan Delivery Order (DO) yang dipakai bersama oleh:
//  - POST /api/sales/deliveries  (gudang membuat DO untuk sebuah SO)
//  - POST /api/fleet/claim       (driver mengklaim SO/POS lalu DO dibuat otomatis)
// Semua validasi armada, overload, estimasi zona, stok, dan status SO ada di sini
// supaya kedua jalur tidak pernah berbeda perilaku.
import { pool } from '../../config/db.js';
import { mutateStock, cogsValue, BusinessError } from '../../lib/stock-service.js';
import { postJournal } from '../../lib/journal.js';

const ORIGIN = { lat: -6.8392646, lng: 111.9838451 };

function haversineKm(a,b,c,d){
  const R=6371, dLat=(c-a)*Math.PI/180, dLng=(d-b)*Math.PI/180;
  const s=Math.sin(dLat/2)**2 + Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(s),Math.sqrt(1-s));
}
export function estZoneFromKm(km, override){
  if(override) return override;
  if(km==null || isNaN(km)) return 'Bekasi';
  if(km<=15) return 'Bekasi';
  if(km<=40) return 'Jakarta';
  return 'Luar Kota';
}

// Geocoding alamat → koordinat (Nominatim OSM). Dipakai otomatis saat
// DO dibuat/diklaim tapi alamat belum punya titik peta (lat/lng).
const geoCache = new Map();

// Alamat Indonesia sering ditulis lengkap ("Jalan X No. 12, Kel., Kec., Kota, Prov")
// dan Nominatim gagal pada bentuk itu. Coba bertahap: alamat penuh → tanpa nomor
// rumah → tanpa nama jalan (kota/provinsi). Hasil fallback ditandai approx=true
// supaya UI bisa bilang "perkiraan" dan pengguna memeriksa/mengubah jaraknya.
function addressVariants(q){
  const out = [];
  const push = (v)=>{ const s=String(v||'').replace(/\s{2,}/g,' ').replace(/\s*,\s*,+/g,', ').replace(/^[,\s]+|[,\s]+$/g,'').trim(); if(s && !out.includes(s)) out.push(s); };
  push(q);
  push(q.replace(/\b(no\.?|nomor)\s*\d+[a-z]?\b/gi,'').replace(/\b(rt|rw)\.?\s*\d+\s*\/?\s*\d*\b/gi,''));
  push(q.replace(/\b\d+[a-z]?\b/gi,''));
  const parts = String(q||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(parts.length>2) push(parts.slice(1).join(', '));
  if(parts.length>1) push(parts.slice(-2).join(', '));
  if(parts.length>1) push(parts[parts.length-1]);
  return out;
}

async function nominatim(q){
  const key = String(q||'').toLowerCase().trim();
  if(!key) return null;
  if(geoCache.has(key)) return geoCache.get(key);
  try{
    const ctrl = new AbortController();
    const timer = setTimeout(()=>ctrl.abort(), 6000);
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&countrycodes=id&q='+encodeURIComponent(q), {
      headers:{ 'User-Agent':'erptest-suratjalan/1.0 (ERP lokal PT Sumber Material Jaya)', 'Accept-Language':'id' },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if(!r.ok){ geoCache.set(key, null); return null; }
    const rows = await r.json();
    const hit = rows[0];
    if(!hit){ geoCache.set(key, null); return null; }
    const out = { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon), display_name: hit.display_name || q };
    geoCache.set(key, out);
    return out;
  }catch(e){ console.error('[geocode]', e.message); geoCache.set(key, null); return null; }
}

export async function geocodeAddress(q){
  // alamat terlalu pendek ("m", "asda") bukan alamat sungguhan - jangan ditebak
  if(String(q||'').trim().length < 5) return null;
  const variants = addressVariants(q);
  for(let i=0;i<variants.length;i++){
    const hit = await nominatim(variants[i]);
    if(hit) return { ...hit, approx: i>0, matched: variants[i] };
  }
  return null;
}

/** Jarak (km) + zona dari origin gudang ke alamat tujuan.
 *  Pakai lat/lng bila ada; kalau tidak, geocode alamatnya dulu. */
export async function distanceFromAddress({ lat, lng, address }){
  let la = lat!=null && lat!=='' && isFinite(parseFloat(lat)) ? parseFloat(lat) : null;
  let lo = lng!=null && lng!=='' && isFinite(parseFloat(lng)) ? parseFloat(lng) : null;
  let approx = false, matched = null;
  if(la==null || lo==null){
    if(!address) return null;
    const g = await geocodeAddress(address);
    if(!g) return null;
    la=g.lat; lo=g.lng; approx=!!g.approx; matched=g.matched;
  }
  const km = +haversineKm(ORIGIN.lat, ORIGIN.lng, la, lo).toFixed(2);
  return { km, zone: estZoneFromKm(km), lat: la, lng: lo, approx, matched };
}
function tarifForZone(z){
  if(z==='Jakarta') return {flat:250000, perTon:180000};
  if(z==='Luar Kota') return {flat:600000, perTon:350000};
  return {flat:150000, perTon:120000};
}
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

/** Estimasi berat/volume/zona/biaya DO dari total qty + jarak. */
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
    costDalam=Math.round(150000 + w*120000);
    costLuar=Math.round(600000 + w*350000);
  }
  return {est_weight_ton:w, est_volume_m3:v, est_zone:zone, est_cost:cost, est_cost_dalam:costDalam, est_cost_luar:costLuar, distance_km: distanceKm? parseFloat(distanceKm): null};
}

export class DeliveryError extends Error {
  constructor(status, message){ super(message); this.status=status; }
}

// Tanggal (KIR/STNK/SIM) sudah lewat? Nilai kosong dianggap belum ada data → lolos.
function expiredOn(v){
  if(!v) return false;
  const d=new Date(v); if(isNaN(d.getTime())) return false;
  const now=new Date(); d.setHours(0,0,0,0); now.setHours(0,0,0,0);
  return d < now;
}

// Kolom tanda tangan 3 pihak + konfirmasi kantor (idempotent, dipakai sales/fleet/logistics)
let sigEnsured=false;
export async function ensureSignatureCols(){
  if(sigEnsured) return;
  try{
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS driver_signature_url TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS driver_signed_at TIMESTAMP`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS sender_signature_url TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS sender_signed_at TIMESTAMP`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS sender_signed_by VARCHAR(120)`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS office_confirmed_by VARCHAR(120)`).catch(()=>{});
    await pool.query(`ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS office_confirmed_at TIMESTAMP`).catch(()=>{});
    // Satu DO maksimal satu invoice (mencegah double-klik buat 2 invoice untuk DO yang sama)
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS invoices_do_id_uniq ON invoices (do_id) WHERE do_id IS NOT NULL`).catch(()=>{});
    sigEnsured=true;
  }catch(e){ console.error('[ensure sig cols]', e.message); }
}

/**
 * Buat DO untuk sebuah SO.
 * @param {object} p
 * @param {number} p.so_id
 * @param {number} [p.vehicle_id]     armada (wajib salah satu dengan vehicle_no)
 * @param {string} [p.vehicle_no]     plat armada
 * @param {number} [p.driver_id]      employees.id sopir (disimpan di delivery_orders.driver_id)
 * @param {number} [p.warehouse_id]
 * @param {Array}  [p.items]          [{product_id, qty}] - kalau kosong diambil dari so_details
 * @param {boolean}[p.allow_completed] izinkan SO berstatus COMPLETED (POS lunas) dibuatkan DO
 */
export async function createDelivery(p){
  const {
    so_id, warehouse_id, vehicle_id, vehicle_no, driver_id: bodyDriverId,
    items: bodyItems, distance_km, est_zone,
    delivery_lat, delivery_lng, delivery_address, allow_completed=false,
    sender_signature_url, sender_signed_by, driver_signature_url, created_by,
  } = p;
  await ensureSignatureCols();
  if(!so_id) throw new DeliveryError(400,'so_id wajib');
  // Tanda tangan Pengirim/Gudang wajib, KECUALI jalur klaim driver — pada jalur itu
  // driver menandatangani serah terima muatan, dan pengirim mengisi lewat halaman
  // Logistik/Surat Jalan (konfirmasi kantor) sebelum invoice bisa dilunasi.
  const viaDriverClaim = !!driver_signature_url;
  if(!viaDriverClaim){
    if(!sender_signature_url || !String(sender_signature_url).startsWith('data:')){
      throw new DeliveryError(400,'Tanda tangan Pengirim/Gudang wajib — pengirim menandatangani sebelum barang keluar gudang');
    }
    if(!String(sender_signature_url).startsWith('data:image/')) throw new DeliveryError(400,'Format tanda tangan pengirim tidak valid');
    if(String(sender_signature_url).length > 2_000_000) throw new DeliveryError(400,'Ukuran tanda tangan terlalu besar');
    if(!String(sender_signed_by||'').trim()) throw new DeliveryError(400,'Nama petugas gudang/pengirim wajib diisi');
  }

  const so=await pool.query('SELECT * FROM sales_orders WHERE id=$1',[so_id]);
  if(!so.rows[0]) throw new DeliveryError(404,'SO not found');
  const st=so.rows[0].status;
  // Order POS sudah memotong stok fisik saat checkout (POST /sales/pos). DO yang
  // dibuat dari order POS hanya memindahkan barang, jadi stok TIDAK boleh dipotong
  // dua kali. Non-POS (SO gudang) memotong stok di sini karena di SO hanya reservasi.
  const isPosOrder = /^SO-POS-/i.test(String(so.rows[0].so_number||''));
  const senderSigBy = String(sender_signed_by||'').trim() || null;
  const okStatus = ['APPROVED','PICKING','SHIPPED','PARTIAL'].includes(st) || (allow_completed && st==='COMPLETED');
  if(!okStatus){
    throw new DeliveryError(400,`SO harus APPROVED/PICKING dulu sebelum buat DO (status sekarang: ${st})`);
  }

  // wajib pilih armada AVAILABLE
  let plat = (vehicle_no||'').trim() || null;
  let driverId = bodyDriverId ? parseInt(bodyDriverId) : null;
  let vehicleRow=null;
  if(vehicle_id){
    const vr=await pool.query('SELECT * FROM vehicles WHERE id=$1',[vehicle_id]);
    if(!vr.rows[0]) throw new DeliveryError(400,'Armada tidak ditemukan');
    if(vr.rows[0].status!=='AVAILABLE') throw new DeliveryError(400,`Armada ${vr.rows[0].plat_no} sedang dipakai (${vr.rows[0].status})`);
    plat=vr.rows[0].plat_no; vehicleRow=vr.rows[0];
    // driver_id TIDAK diwarisi dari armada: sopir default armada bukan berarti sudah
    // mengklaim DO. Pengiriman tetap muncul di daftar "Pengiriman Tersedia" driver.
  } else if(plat){
    const vr=await pool.query('SELECT * FROM vehicles WHERE plat_no=$1',[plat]);
    if(!vr.rows[0]) throw new DeliveryError(400,`Armada plat ${plat} tidak ditemukan`);
    if(vr.rows[0].status!=='AVAILABLE') throw new DeliveryError(400,`Armada ${plat} sedang dipakai`);
    vehicleRow=vr.rows[0];
  } else {
    throw new DeliveryError(400,'Pilih armada AVAILABLE terlebih dahulu');
  }
  // KIR/STNK habis = armada tidak boleh jalan (sama seperti guard di klaim driver).
  if(expiredOn(vehicleRow?.kir_expiry)) throw new DeliveryError(400,`KIR ${plat} sudah habis - perpanjang dulu sebelum membuat DO`);
  if(expiredOn(vehicleRow?.tax_expiry)) throw new DeliveryError(400,`Pajak STNK ${plat} sudah habis - perpanjang dulu sebelum membuat DO`);

  // item: dari body, atau salin dari SO (dipakai saat driver klaim SO/POS)
  let items = Array.isArray(bodyItems) && bodyItems.length ? bodyItems : null;
  if(!items){
    const dd=await pool.query('SELECT product_id, qty FROM so_details WHERE so_id=$1',[so_id]);
    items = dd.rows.map(r=>({product_id:r.product_id, qty:parseFloat(r.qty)}));
  }
  if(!items.length) throw new DeliveryError(400,'SO belum punya item untuk dikirim');

  const totalQty = items.reduce((s,it)=> s + (parseFloat(it.qty)||0), 0);
  let distKm = distance_km!=null && distance_km!=='' ? parseFloat(distance_km) : null;
  let effLat = delivery_lat!=null && delivery_lat!=='' ? parseFloat(delivery_lat) : null;
  let effLng = delivery_lng!=null && delivery_lng!=='' ? parseFloat(delivery_lng) : null;
  let effAddr = (delivery_address||'').trim() || null;
  if((effLat==null||isNaN(effLat)) && so.rows[0].delivery_lat!=null) effLat=parseFloat(so.rows[0].delivery_lat);
  if((effLng==null||isNaN(effLng)) && so.rows[0].delivery_lng!=null) effLng=parseFloat(so.rows[0].delivery_lng);
  if(!effAddr && so.rows[0].delivery_address) effAddr=so.rows[0].delivery_address;
  if(!effAddr){
    const c=await pool.query('SELECT address, lat, lng FROM customers WHERE id=$1',[so.rows[0].customer_id]);
    if(c.rows[0]?.address) effAddr=c.rows[0].address;
    if((effLat==null||isNaN(effLat)) && c.rows[0]?.lat!=null && c.rows[0]?.lng!=null){ effLat=parseFloat(c.rows[0].lat); effLng=parseFloat(c.rows[0].lng); }
  }
  // Koordinat belum ada → geocode dari teks alamat, lalu simpan ke master customer
  if((effLat==null||isNaN(effLat) || effLng==null||isNaN(effLng)) && effAddr){
    const g = await geocodeAddress(effAddr);
    if(g){
      effLat=g.lat; effLng=g.lng;
      await pool.query('UPDATE customers SET lat=$1, lng=$2 WHERE id=$3 AND (lat IS NULL OR lng IS NULL)',[g.lat, g.lng, so.rows[0].customer_id]).catch(()=>{});
    }
  }
  if((distKm==null||isNaN(distKm)) && effLat!=null && effLng!=null && isFinite(effLat) && isFinite(effLng)){
    distKm = +haversineKm(ORIGIN.lat, ORIGIN.lng, effLat, effLng).toFixed(2);
  }
  // Jarak belum diketahui tapi alamatnya ada (SO/POS tanpa pin peta):
  // geocode alamatnya supaya jarak & zona tetap terisi otomatis.
  if(distKm==null || isNaN(distKm)){
    const geo = await distanceFromAddress({ lat: effLat, lng: effLng, address: effAddr });
    if(geo){
      distKm = geo.km;
      if(effLat==null) effLat = geo.lat;
      if(effLng==null) effLng = geo.lng;
    }
  }
  const calc = calcEst(totalQty, distKm, (est_zone||'').trim() || null, vehicleRow);

  // guard overload konsisten dengan fleet (ton & volume 0.05/qty)
  if(vehicleRow){
    const capTon=parseFloat(vehicleRow.capacity_ton||0);
    const capVol=parseFloat(vehicleRow.capacity_volume_m3||999);
    if(calc.est_weight_ton > capTon + 0.01) throw new DeliveryError(400,`OVERLOAD: estimasi ${calc.est_weight_ton} ton > kapasitas ${capTon} ton (${vehicleRow.plat_no}). Pilih armada lebih besar atau bagi DO.`);
    if(calc.est_volume_m3 > capVol + 0.01) throw new DeliveryError(400,`OVERLOAD volume: ${calc.est_volume_m3} m³ > kapasitas ${capVol} m³ (${vehicleRow.plat_no})`);
    const MIN_LOAD_LUAR=5;
    if(calc.est_zone==='Luar Kota' && calc.est_weight_ton < MIN_LOAD_LUAR){
      throw new DeliveryError(400,`Muatan Luar Kota minimum ${MIN_LOAD_LUAR} ton (estimasi ${calc.est_weight_ton} ton). Tambah muatan atau ubah ke armada/rute dalam kota agar tidak rugi ritase.`);
    }
  }

  const do_number='DO-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+String(Math.floor(Math.random()*9000+1000));
  const wh = warehouse_id||1;
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('SELECT * FROM vehicles WHERE plat_no=$1 FOR UPDATE',[plat]);
    const chkV=await client.query('SELECT status FROM vehicles WHERE plat_no=$1',[plat]);
    if(chkV.rows[0]?.status!=='AVAILABLE'){ await client.query('ROLLBACK'); throw new DeliveryError(400,`Armada ${plat} baru saja dipakai, pilih lain`); }
    const ins=await client.query(
      "INSERT INTO delivery_orders (do_number, so_id, customer_id, warehouse_id, delivery_date, vehicle_no, driver_id, status, distance_km, delivery_lat, delivery_lng, delivery_address, est_weight_ton, est_volume_m3, est_zone, est_cost, est_cost_dalam, est_cost_luar, sender_signature_url, sender_signed_at, sender_signed_by, driver_signature_url, driver_signed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'IN_TRANSIT',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW(),$19,$20,CASE WHEN $20::text IS NOT NULL THEN NOW() ELSE NULL END) RETURNING id",
      [do_number, so_id, so.rows[0].customer_id, wh, so.rows[0].delivery_date||new Date().toISOString().slice(0,10), plat, driverId, calc.distance_km, isFinite(effLat)?effLat:null, isFinite(effLng)?effLng:null, effAddr, calc.est_weight_ton, calc.est_volume_m3, calc.est_zone, calc.est_cost, calc.est_cost_dalam, calc.est_cost_luar, sender_signature_url||null, senderSigBy, driver_signature_url||null]
    );
    const doId=ins.rows[0].id;
    for(const it of items) await client.query('INSERT INTO do_details (do_id, product_id, qty) VALUES ($1,$2,$3)',[doId, it.product_id, it.qty]);
    // status SO: SHIPPED (kecuali sudah COMPLETED - POS lunas)
    if(st!=='COMPLETED') await client.query("UPDATE sales_orders SET status='SHIPPED' WHERE id=$1",[so_id]);
    if(isPosOrder){
      // Stok sudah keluar saat checkout POS - catat jejak DO tanpa mengubah qty_on_hand.
      for(const it of items){
        const bal=await client.query('SELECT qty_on_hand FROM stocks WHERE product_id=$1 AND warehouse_id=$2',[it.product_id, wh]);
        await client.query("INSERT INTO stock_movements (product_id, warehouse_id, movement_type, reference_type, reference_id, qty_out, balance_qty, created_by) VALUES ($1,$2,'OUT','DO',$3,$4,$5,$6)",[it.product_id, wh, doId, it.qty, bal.rows[0]?.qty_on_hand ?? 0, created_by||null]);
      }
    } else {
      // Stok keluar lewat pintu tunggal mutateStock (kunci baris + tolak stok minus).
      let cogs = 0;
      const costs = await cogsValue(client, items, wh);
      for(const it of items){
        const mv = await mutateStock(client, {
          productId: it.product_id, warehouseId: wh, qtyDelta: -Math.abs(Number(it.qty)),
          refType: 'DO', refId: doId, userId: created_by || null,
          notes: `Pengiriman ${do_number}`,
        });
        // Reservasi ikut dilepas saat barang keluar
        await client.query('UPDATE stocks SET qty_reserved = GREATEST(COALESCE(qty_reserved,0) - $1, 0) WHERE id=$2', [Math.abs(Number(it.qty)), mv.stock_id]);
        cogs += Math.abs(Number(it.qty)) * (Number(costs.get(Number(it.product_id))) || 0);
      }
      // HPP diakui saat barang keluar gudang (DO), bukan saat invoice dibuat.
      if(cogs > 0.5){
        await postJournal({ refType:'DO', refId:doId, description:`HPP pengiriman ${do_number}`,
          lines:[ { code:'5-1000', debit:cogs, description:`HPP ${do_number}` },
                  { code:'1-1200', credit:cogs, description:`Persediaan keluar ${do_number}` } ],
          createdBy: created_by || null, client });
      }
    }
    await client.query("UPDATE vehicles SET status='IN_TRANSIT' WHERE plat_no=$1",[plat]);
    await client.query('COMMIT');
    return {id:doId, do_number, vehicle_no: plat, driver_id: driverId, items_count: items.length, stock_already_out: isPosOrder, ...calc};
  }catch(e){
    try{ await client.query('ROLLBACK'); }catch{}
    if(e instanceof DeliveryError) throw e;
    if(e instanceof BusinessError) throw new DeliveryError(e.status || 422, e.message);
    console.error('[createDelivery]',e);
    throw new DeliveryError(500, e.message);
  }finally{ client.release(); }
}
