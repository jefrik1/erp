// Uji pusat rekonsiliasi keuangan (P0). Read-only: memastikan semua cek berjalan,
// trial balance seimbang, dan AR/inventarisasi konsisten dengan buku besar.
import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();
const BASE = process.env.API_BASE || 'http://localhost:4000/api';
const SECRET = process.env.JWT_SECRET || 'erp_jwt_super_secret_2024';
const admin = jwt.sign({ id: 1, username: 'admin', roles: ['direktur'] }, SECRET, { expiresIn: '10m' });
const kasir = jwt.sign({ id: 481, username: 'kasir', roles: ['POS_CASHIER'] }, SECRET, { expiresIn: '10m' });

const get = async (path, token = admin) => {
  const r = await fetch(BASE + path, { headers: { Authorization: 'Bearer ' + token } });
  let j = null; try { j = await r.json(); } catch { /* non-JSON */ }
  return { status: r.status, body: j };
};

test('recon-center mengembalikan semua cek', async () => {
  const r = await get('/finance/recon-center');
  assert.equal(r.status, 200);
  const keys = r.body.checks.map((c) => c.key).sort();
  assert.deepEqual(keys, ['AP', 'AR', 'CASH', 'GRIR', 'INVENTORY', 'JOURNALS', 'ORPHANS', 'TAX']);
  for (const c of r.body.checks) assert.ok(['OK', 'P1', 'P2'].includes(c.status), 'status aneh: ' + c.status);
});

test('trial balance seimbang', async () => {
  const r = await get('/finance/recon-center?only=inventory');
  assert.equal(r.status, 200);
  assert.equal(r.body.trial_balance.balanced, true);
});

test('AR dan nilai persediaan cocok dengan buku besar', async () => {
  const r = await get('/finance/recon-center?only=ar,inventory');
  const ar = r.body.checks.find((c) => c.key === 'AR');
  const inv = r.body.checks.find((c) => c.key === 'INVENTORY');
  assert.equal(ar.status, 'OK', 'AR selisih ' + ar.variance);
  assert.equal(inv.status, 'OK', 'Persediaan selisih ' + inv.variance);
});

test('recon-center hanya untuk peran keuangan', async () => {
  const r = await get('/finance/recon-center', kasir);
  assert.equal(r.status, 403);
});

test('drilldown mengembalikan baris bukti', async () => {
  const r = await get('/finance/recon-center/AR');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.rows));
});
