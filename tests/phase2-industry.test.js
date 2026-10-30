// Uji Phase 2: FEFO/kedaluwarsa, jembatan timbang, dan hold selisih berat GRN.
// Read-only kecuali satu baris scale_readings yang dihapus lagi di akhir test.
import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();
const BASE = process.env.API_BASE || 'http://localhost:4000/api';
const SECRET = process.env.JWT_SECRET || 'erp_jwt_super_secret_2024';
const admin = jwt.sign({ id: 1, username: 'admin', roles: ['direktur'] }, SECRET, { expiresIn: '10m' });
const gudang = jwt.sign({ id: 4, username: 'gudang', roles: ['warehouse'] }, SECRET, { expiresIn: '10m' });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function call(method, path, body, token = admin) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body: json };
}

test('FEFO: batch diurutkan menurut tanggal kedaluwarsa', async () => {
  const r = await call('GET', '/inventory/stocks/fefo/9');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.batches));
  const dates = r.body.batches.map((b) => b.expired_date).filter(Boolean);
  const sorted = [...dates].sort();
  assert.deepEqual(dates, sorted, 'urutan expired_date harus naik');
});

test('peringatan stok mendekati kedaluwarsa', async () => {
  const r = await call('GET', '/inventory/expiring?days=30');
  assert.equal(r.status, 200);
  assert.equal(typeof r.body.count, 'number');
});

test('jembatan timbang: ingest lalu bind ke DO, bind ganda ditolak', async () => {
  const ingest = await call('POST', '/logistics/scale/readings', {
    device_id: 'WB-TEST', vehicle_plate: 'B 9001 JKT', gross_kg: 5000, tare_kg: 1000,
  });
  assert.equal(ingest.status, 201);
  assert.equal(Number(ingest.body.reading.net_kg), 4000);
  const id = ingest.body.reading.id;
  try {
    const doRow = (await pool.query('SELECT id FROM delivery_orders ORDER BY id DESC LIMIT 1')).rows[0];
    if (!doRow) return;
    const bind = await call('POST', `/logistics/scale/readings/${id}/bind`, { reference_type: 'DO', reference_id: doRow.id }, gudang);
    assert.equal(bind.status, 200);
    assert.equal(Number(bind.body.net_kg), 4000);
    const again = await call('POST', `/logistics/scale/readings/${id}/bind`, { reference_type: 'DO', reference_id: doRow.id }, gudang);
    assert.equal(again.status, 400);
  } finally {
    await pool.query("DELETE FROM scale_readings WHERE scale_device_id='WB-TEST'");
  }
});

test('GRN menolak selisih berat di luar toleransi SNI (role gudang)', async () => {
  const po = (await pool.query("SELECT id FROM purchase_orders WHERE status IN ('APPROVED','PARTIAL') ORDER BY id DESC LIMIT 1")).rows[0];
  if (!po) return;
  const steel = (await pool.query('SELECT id FROM products WHERE COALESCE(weight_kg,0) > 0 ORDER BY id LIMIT 1')).rows[0];
  if (!steel) return;
  const r = await call('POST', '/purchase/receipts', {
    po_id: po.id, warehouse_id: 1,
    items: [{ product_id: steel.id, qty_received: 10, unit_cost: 100000, secondary_qty_actual: 1 }],
  }, gudang);
  assert.equal(r.status, 422);
  assert.equal(r.body.code, 'WEIGHT_VARIANCE_HOLD');
});

test.after(async () => { await pool.end(); });
