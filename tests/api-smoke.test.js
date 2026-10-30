/**
 * Smoke test API (node:test) — memverifikasi kontrak penting tanpa mengubah data
 * bisnis: health, auth, RBAC, scope riwayat order, modul baru (pajak, periode,
 * approval rules, valuasi stok, rekon).
 *
 * Jalankan: node --test tests/api-smoke.test.js
 * Butuh backend hidup di API_BASE (default http://localhost:4000/api).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const API = process.env.API_BASE || 'http://localhost:4000/api';

async function api(path, { method='GET', token, body } = {}){
  const res = await fetch(API+path, {
    method,
    headers: { ...(token? { Authorization:'Bearer '+token } : {}), 'Content-Type':'application/json' },
    body: body? JSON.stringify(body) : undefined,
  });
  let json = null;
  try{ json = await res.json(); }catch{}
  return { status: res.status, json };
}

async function login(username, password){
  const r = await api('/auth/login', { method:'POST', body:{ username, password } });
  assert.equal(r.status, 200, `login ${username} gagal: ${JSON.stringify(r.json)}`);
  return r.json.token;
}

let admin, kasir, finance;

test('health check melaporkan DB', async ()=>{
  const r = await api('/health');
  assert.equal(r.status, 200);
  assert.equal(r.json.status, 'ok');
  assert.ok(r.json.db_ms >= 0);
});

test('login: password salah ditolak', async ()=>{
  const r = await api('/auth/login', { method:'POST', body:{ username:'admin', password:'salah-sekali' } });
  assert.equal(r.status, 401);
});

test('login: admin & kasir & finance', async ()=>{
  admin = await login('admin','admin123');
  kasir = await login('kasir','kasir123');
  finance = await login('finance','finance123');
  assert.ok(admin && kasir && finance);
});

test('RBAC: kasir tidak boleh akses HR', async ()=>{
  const r = await api('/hr/attendance', { token: kasir });
  assert.equal(r.status, 403);
});

test('RBAC: kasir tidak boleh akses approval rules', async ()=>{
  const r = await api('/approval-rules', { token: kasir });
  assert.equal(r.status, 403);
});

test('riwayat order: kasir hanya melihat POS miliknya', async ()=>{
  const r = await api('/sales/orders/history?limit=5', { token: kasir });
  assert.equal(r.status, 200);
  assert.equal(r.json.scope, 'POS_MILIK_SAYA');
});

test('riwayat order: finance melihat semua', async ()=>{
  const r = await api('/sales/orders/history?limit=5', { token: finance });
  assert.equal(r.status, 200);
  assert.equal(r.json.scope, 'SEMUA');
});

test('pajak: summary periode berjalan', async ()=>{
  const r = await api('/tax/summary', { token: finance });
  assert.equal(r.status, 200);
  assert.ok('ppn_keluaran' in r.json && 'ppn_masukan' in r.json);
});

test('tutup buku: daftar periode', async ()=>{
  const r = await api('/finance/periods', { token: finance });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.json) && r.json.length > 0);
  assert.ok(['OPEN','CLOSED'].includes(r.json[0].status));
});

test('approval rules: default terpasang', async ()=>{
  const r = await api('/approval-rules', { token: admin });
  assert.equal(r.status, 200);
  const keys = r.json.map(x=>x.module+'/'+x.metric);
  assert.ok(keys.includes('SALES_ORDER/DISCOUNT_PCT'));
  assert.ok(keys.includes('PURCHASE_ORDER/VALUE'));
});

test('approval check: diskon 15% butuh approval', async ()=>{
  const r = await api('/approval-rules/check?module=SALES_ORDER&metric=DISCOUNT_PCT&value=15', { token: admin });
  assert.equal(r.status, 200);
  assert.equal(r.json.required, true);
});

test('valuasi stok: total & baris', async ()=>{
  const r = await api('/reports/stock-valuation', { token: finance });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.json.data));
  assert.equal(typeof r.json.total_value, 'number');
});

test('margin produk: periode default', async ()=>{
  const r = await api('/reports/product-margin', { token: finance });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.json.data));
});

test('reorder: daftar saran tanpa membuat PR', async ()=>{
  const r = await api('/inventory/reorder/suggestions', { token: admin });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.json));
});

test('rekon: butuh account_id', async ()=>{
  const r = await api('/finance/recon', { token: finance });
  assert.equal(r.status, 400);
});

test('opname: daftar sesi', async ()=>{
  const r = await api('/inventory/opname/sessions', { token: admin });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.json));
});

test('lacak publik: token ngawur 404', async ()=>{
  const r = await api('/public/track/zzzzzzzzzzzzzzzz');
  assert.equal(r.status, 404);
});

test('metrics: hanya admin/auditor', async ()=>{
  const denied = await api('/metrics', { token: kasir });
  assert.equal(denied.status, 403);
  const ok = await api('/metrics', { token: admin });
  assert.equal(ok.status, 200);
  assert.ok('requests' in ok.json);
});
