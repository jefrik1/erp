// Uji penjaga integritas Phase 1 (perlu API berjalan di :4000).
//   npm test
// Uji pembalik jurnal menulis pasangan jurnal Rp 1.000 (net nol) ke buku besar, jadi
// hanya dijalankan bila PHASE1_LEDGER_TEST=1.
import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();
const BASE = process.env.API_BASE || 'http://localhost:4000/api';
const SECRET = process.env.JWT_SECRET || 'erp_jwt_super_secret_2024';
const adminToken = jwt.sign({ id: 1, username: 'admin', roles: ['direktur'] }, SECRET, { expiresIn: '10m' });
const kasirToken = jwt.sign({ id: 481, username: 'kasir', roles: ['POS_CASHIER'] }, SECRET, { expiresIn: '10m' });

async function call(method, path, body, token = adminToken) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body: json };
}

const posBody = (items) => ({ items, payment_method: 'CASH' });

test('checkout POS menolak stok tidak cukup dengan 422 INSUFFICIENT_STOCK', async () => {
  const r = await call('POST', '/sales/pos', posBody([{ product_id: 9, qty: 999999, unit_price: 2800 }]));
  assert.equal(r.status, 422);
  assert.equal(r.body?.code, 'INSUFFICIENT_STOCK');
});

test('harga >5x HPP ditolak (PRICE_OUTLIER_DETECTED)', async () => {
  const r = await call('POST', '/sales/pos', posBody([{ product_id: 1, qty: 1, unit_price: 120000000 }]));
  assert.equal(r.status, 422);
  assert.equal(r.body?.code, 'PRICE_OUTLIER_DETECTED');
});

test('harga di bawah HPP ditolak untuk kasir (butuh persetujuan)', async () => {
  const r = await call('POST', '/sales/pos', posBody([{ product_id: 1, qty: 1, unit_price: 1000 }]), kasirToken);
  assert.equal(r.status, 422);
  assert.ok(['PRICE_BELOW_LIMIT', 'PRICE_OUTLIER_DETECTED'].includes(r.body?.code), 'kode: ' + r.body?.code);
});

test('sales order juga melewati penjaga harga', async () => {
  const r = await call('POST', '/sales/orders', {
    customer_id: 4, items: [{ product_id: 1, qty: 1, unit_price: 999999999 }],
  });
  assert.equal(r.status, 422);
  assert.equal(r.body?.code, 'PRICE_OUTLIER_DETECTED');
});

test('tabel buku besar tidak bisa dihapus/diubah (immutability)', async () => {
  const pg = (await import('pg')).default;
  dotenv.config();
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    for (const sql of ['DELETE FROM journal_details WHERE id=(SELECT id FROM journal_details LIMIT 1)',
                       'DELETE FROM journal_entries WHERE id=(SELECT id FROM journal_entries LIMIT 1)',
                       'UPDATE audit_logs SET action=action WHERE id=(SELECT id FROM audit_logs LIMIT 1)']) {
      await client.query('BEGIN');
      let blocked = false;
      try { await client.query(sql); } catch (e) { blocked = /IMMUTABLE_RECORD_VIOLATION/.test(e.message); }
      await client.query('ROLLBACK');
      assert.ok(blocked, 'harus ditolak: ' + sql);
    }
  } finally { client.release(); await pool.end(); }
});

test('pembalik jurnal: sekali jalan, kedua kali ditolak', async (t) => {
  if (process.env.PHASE1_LEDGER_TEST !== '1') return t.skip('set PHASE1_LEDGER_TEST=1 untuk menguji buku besar');
  const acc = await call('GET', '/finance/coa');
  const list = Array.isArray(acc.body) ? acc.body : (acc.body?.data || []);
  const kas = list.find((a) => a.code === '1-1010');
  const modal = list.find((a) => a.code === '3-1100');
  if (!kas || !modal) return t.skip('akun COA uji tidak ada');
  const mk = await call('POST', '/finance/journals', {
    description: 'Uji pembalik jurnal (self-test)',
    details: [
      { account_id: kas.id, debit: 1000, credit: 0, description: 'uji' },
      { account_id: modal.id, debit: 0, credit: 1000, description: 'uji' },
    ],
  });
  assert.equal(mk.status, 200);
  const rev = await call('POST', `/finance/journals/${mk.body.id}/reverse`, { reason: 'self-test' });
  assert.equal(rev.status, 200);
  assert.ok(rev.body.reversal_id);
  const again = await call('POST', `/finance/journals/${mk.body.id}/reverse`, {});
  assert.equal(again.status, 400);
});
