#!/usr/bin/env node
// Perbaikan data persediaan lewat jalur resmi aplikasi (API), bukan UPDATE langsung:
//   A. Stok minus            → Stock Opname (hitung fisik = 0), nilai selisih 0
//   B. Baris stok kembar     → Stock Opname (lebur jadi satu baris = hasil hitung)
//   C. Stok ber-HPP 0        → Penambahan Stok jenis "Opname Fisik" (SET) + HPP gudang lain
//
// Pakai:
//   node scripts/fix-inventory-data.mjs                 → rencana saja (dry-run, default)
//   node scripts/fix-inventory-data.mjs --apply         → eksekusi
//   node scripts/fix-inventory-data.mjs --apply --only=STOK_MINUS,HPP_NOL
//
// Catatan akuntansi: koreksi kuantitas pada skrip ini memakai HPP 0 pada baris opname.
// Alasannya: nilai minus / baris kembar itu warisan impor tanpa jurnal, jadi membukukan
// nilainya akan menciptakan aset fiktif di GL. Bila finance ingin nilai tertentu,
// isi kolom HPP di sesi opname sebelum posting.
import dotenv from 'dotenv';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { assertRepairAllowed } from '../src/lib/repair-guard.js';
assertRepairAllowed('fix-inventory-data.mjs');

dotenv.config();
const API = process.env.API_BASE || 'http://localhost:4000/api';
const SECRET = process.env.JWT_SECRET || 'erp_jwt_super_secret_2024';
const APPLY = process.argv.includes('--apply');
const ONLY = (process.argv.find(a=>a.startsWith('--only=')) || '').split('=')[1]?.split(',').filter(Boolean) || null;
const want = (cls)=> !ONLY || ONLY.includes(cls);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const nf = (n)=> new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}).format(Number(n)||0);
const log = (...a)=> console.log(...a);

// Token admin (direktur) — sama seperti middleware auth: {id, username, roles}.
const admin = (await pool.query(`SELECT u.id, u.username, array_agg(r.name) roles
   FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
  WHERE u.username='admin' GROUP BY u.id, u.username`)).rows[0];
if(!admin) { console.error('User admin tidak ditemukan'); process.exit(2); }
const TOKEN = jwt.sign({ id: admin.id, username: admin.username, roles: admin.roles }, SECRET, { expiresIn:'30m' });

async function api(method, path, body){
  const res = await fetch(API+path, {
    method,
    headers: { 'Content-Type':'application/json', Authorization:'Bearer '+TOKEN },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; try{ data = await res.json(); }catch(_e){}
  if(!res.ok) throw new Error(`${method} ${path} → ${res.status} ${data?.error || ''}`);
  return data;
}

/* ─────────────────────────── rencana perbaikan ─────────────────────────── */
async function buildPlan(){
  const plan = { warehouses: new Map(), hpp: [], notes: [] };
  const addWh = (whId, whCode, whName)=>{
    if(!plan.warehouses.has(whId)) plan.warehouses.set(whId, { id:whId, code:whCode, name:whName, items:[] });
    return plan.warehouses.get(whId);
  };

  // A. stok minus
  if(want('STOK_MINUS')){
    const neg = (await pool.query(`SELECT s.product_id, s.qty_on_hand, s.avg_cost, p.sku, p.name,
                                          w.id wh_id, w.code wh_code, w.name wh_name
                                     FROM stocks s JOIN products p ON p.id=s.product_id JOIN warehouses w ON w.id=s.warehouse_id
                                    WHERE s.qty_on_hand < 0 ORDER BY s.qty_on_hand`)).rows;
    for(const r of neg){
      addWh(r.wh_id, r.wh_code, r.wh_name).items.push({
        product_id:r.product_id, sku:r.sku, name:r.name, cls:'STOK_MINUS',
        qty_system:Number(r.qty_on_hand), counted:0, unit_cost:0,
        note:`Koreksi stok minus ${nf(r.qty_on_hand)} (data awal/impor tanpa kartu stok). Nilai selisih 0 agar tidak membukukan aset fiktif.`,
      });
    }
  }

  // B. baris kembar
  if(want('BARIS_KEMBAR')){
    const dup = (await pool.query(`
      SELECT s.product_id, s.warehouse_id, p.sku, p.name, w.code wh_code, w.name wh_name,
             COUNT(*)::int AS baris, SUM(s.qty_on_hand)::numeric AS qty_total,
             (SELECT i.qty_counted FROM stock_opname_items i
                JOIN stock_opname_sessions se ON se.id=i.session_id
               WHERE i.product_id=s.product_id AND se.warehouse_id=s.warehouse_id AND se.status='POSTED'
               ORDER BY se.posted_at DESC NULLS LAST, se.id DESC LIMIT 1) AS last_counted
        FROM stocks s JOIN products p ON p.id=s.product_id JOIN warehouses w ON w.id=s.warehouse_id
       GROUP BY s.product_id, s.warehouse_id, p.sku, p.name, w.code, w.name
      HAVING COUNT(*) > 1`)).rows;
    for(const r of dup){
      const target = r.last_counted !== null ? Number(r.last_counted) : Number(r.qty_total);
      addWh(r.warehouse_id, r.wh_code, r.wh_name).items.push({
        product_id:r.product_id, sku:r.sku, name:r.name, cls:'BARIS_KEMBAR',
        qty_system:Number(r.qty_total), counted:target, unit_cost:0,
        note:`Lebur ${r.baris} baris stok jadi satu (hasil hitung terakhir ${nf(target)}). Nilai selisih 0: perubahan nilai sudah dijurnal pada opname sebelumnya.`,
      });
    }
  }

  // C. HPP nol padahal ada stok
  if(want('HPP_NOL')){
    const zero = (await pool.query(`SELECT s.id, s.product_id, s.warehouse_id, s.qty_on_hand, p.sku, p.name,
                                           w.code wh_code, w.name wh_name
                                      FROM stocks s JOIN products p ON p.id=s.product_id JOIN warehouses w ON w.id=s.warehouse_id
                                     WHERE COALESCE(s.avg_cost,0)=0 AND COALESCE(s.qty_on_hand,0) <> 0
                                     ORDER BY s.qty_on_hand DESC`)).rows;
    for(const r of zero){
      const ref = (await pool.query(`SELECT MAX(avg_cost)::numeric AS cost FROM stocks
                                      WHERE product_id=$1 AND COALESCE(avg_cost,0) > 0`, [r.product_id])).rows[0];
      const cost = Number(ref?.cost||0);
      if(!cost){
        plan.notes.push(`HPP ${r.sku} @ ${r.wh_code} tidak bisa diisi otomatis: belum ada harga beli di gudang lain.`);
        continue;
      }
      plan.hpp.push({ product_id:r.product_id, warehouse_id:r.warehouse_id, sku:r.sku, name:r.name,
        wh_code:r.wh_code, wh_name:r.wh_name, qty:Number(r.qty_on_hand), unit_cost:cost });
    }
  }
  return plan;
}

/* ─────────────────────────── eksekusi opname ─────────────────────────── */
async function runOpname(wh){
  const open = (await api('GET', '/inventory/opname/sessions')).find(s=> s.warehouse_id===wh.id && !['POSTED','CANCELLED'].includes(s.status));
  if(open) throw new Error(`Gudang ${wh.code} masih punya sesi opname berjalan (${open.session_number}). Selesaikan/batalkan dulu.`);

  const created = await api('POST','/inventory/opname/sessions', {
    warehouse_id: wh.id,
    notes: 'Perapian data persediaan: ' + wh.items.map(i=>i.sku).join(', '),
  });
  const detail = await api('GET', '/inventory/opname/sessions/'+created.id);
  const patch = [];
  for(const it of wh.items){
    const row = detail.items.find(x=> x.product_id===it.product_id);
    if(!row){ log(`  ! ${it.sku} tidak ada di snapshot sesi — dilewati`); continue; }
    patch.push({ id:row.id, product_id:it.product_id, qty_counted:it.counted, unit_cost:it.unit_cost, notes:it.note });
  }
  if(!patch.length) throw new Error('Tidak ada item yang bisa dipatch');
  await api('PATCH', `/inventory/opname/sessions/${created.id}/items`, { items: patch });
  await api('POST', `/inventory/opname/sessions/${created.id}/submit`);
  await api('POST', `/inventory/opname/sessions/${created.id}/approve`);
  const posted = await api('POST', `/inventory/opname/sessions/${created.id}/post`);
  return { session: created.session_number, ...posted };
}

/* ─────────────────────────── eksekusi HPP ─────────────────────────── */
async function runHpp(rows){
  const byWh = new Map();
  for(const r of rows){
    if(!byWh.has(r.warehouse_id)) byWh.set(r.warehouse_id, []);
    byWh.get(r.warehouse_id).push(r);
  }
  const out = [];
  for(const [whId, list] of byWh){
    const res = await api('POST','/inventory/adjustments', {
      warehouse_id: whId, type:'SET', reason:'OPNAME_FISIK',
      note: 'Isi HPP dari harga beli gudang lain: ' + list.map(x=>x.sku).join(', '),
      items: list.map(x=>({ product_id:x.product_id, qty:x.qty, unit_cost:x.unit_cost })),
    });
    out.push({ warehouse_id:whId, document:res.adjustment_number, items:list.length });
  }
  return out;
}

/* ─────────────────────────── main ─────────────────────────── */
const plan = await buildPlan();
const totalOpnameItems = [...plan.warehouses.values()].reduce((a,w)=> a + w.items.length, 0);

log(`\n=== RENCANA PERBAIKAN ${APPLY ? '(EKSEKUSI)' : '(DRY-RUN)'} ===\n`);
for(const wh of plan.warehouses.values()){
  log(`Stock Opname • ${wh.code} ${wh.name}`);
  for(const it of wh.items) log(`   - ${it.sku} ${it.name}: sistem ${nf(it.qty_system)} → fisik ${nf(it.counted)} (HPP ${nf(it.unit_cost)}) [${it.cls}]`);
}
for(const r of plan.hpp) log(`Penambahan Stok (SET) • ${r.wh_code} ${r.wh_name}: ${r.sku} qty ${nf(r.qty)} @ HPP ${nf(r.unit_cost)}`);
for(const n of plan.notes) log('CATATAN: '+n);

if(!totalOpnameItems && !plan.hpp.length){ log('\nTidak ada yang perlu diperbaiki. Data sudah bersih.'); await pool.end(); process.exit(0); }

if(!APPLY){ log('\nDry-run selesai. Jalankan ulang dengan --apply untuk mengeksekusi.'); await pool.end(); process.exit(0); }

let failed = 0;
for(const wh of plan.warehouses.values()){
  try{
    const r = await runOpname(wh);
    log(`\n✓ Opname ${r.session} • ${wh.code}: ${r.adjusted} baris disesuaikan, nilai selisih ${nf(r.variance_value)}, jurnal ${r.journal_id || '-'}`);
  }catch(e){ failed++; console.error(`\n✗ Opname ${wh.code} gagal: ${e.message}`); }
}
if(plan.hpp.length){
  try{
    const r = await runHpp(plan.hpp);
    for(const x of r) log(`✓ Penambahan Stok ${x.document} • gudang #${x.warehouse_id}: ${x.items} produk diisi HPP-nya`);
  }catch(e){ failed++; console.error(`✗ Pengisian HPP gagal: ${e.message}`); }
}
await pool.end();
process.exit(failed ? 1 : 0);
