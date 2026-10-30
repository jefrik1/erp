#!/usr/bin/env node
// Rekonsiliasi GL vs subledger (P0 — pusat integritas keuangan).
//   node scripts/reconcile-gl-inventory.mjs          → tabel + exit 1 bila ada P1
//   node scripts/reconcile-gl-inventory.mjs --json   → keluaran JSON (untuk CI/cron)
// Memakai endpoint /api/finance/recon-center sehingga logika sama dengan yang dilihat user.
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config();
const API = process.env.API_BASE || 'http://localhost:4000/api';
const TOKEN = jwt.sign({ id: 1, username: 'admin', roles: ['direktur'] },
  process.env.JWT_SECRET || 'erp_jwt_super_secret_2024', { expiresIn: '10m' });

const rp = (n) => 'Rp ' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));

const res = await fetch(API + '/finance/recon-center', { headers: { Authorization: 'Bearer ' + TOKEN } });
if (!res.ok) { console.error('Gagal memanggil recon-center:', res.status, await res.text()); process.exitCode = 2; }
const data = await res.json();

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(data, null, 2));
} else {
  console.log(`=== REKONSILIASI KEUANGAN (${data.generated_at}) ===\n`);
  console.log('STATUS  CEK                                                   GL                 SUBLEDGER          SELISIH');
  for (const c of data.checks) {
    const flag = c.status === 'OK' ? '  OK  ' : '[' + c.status + ']';
    const fin = ['AR', 'AP', 'GRIR', 'INVENTORY', 'CASH', 'TAX'].includes(c.key);
    console.log(`${flag} ${String(c.label).padEnd(50)} ${fin ? rp(c.gl).padStart(18) : ' '.repeat(18)} ${fin ? rp(c.subledger).padStart(18) : ' '.repeat(18)} ${fin ? rp(c.variance).padStart(16) : String(c.count).padStart(16)}`);
    if (c.note) console.log('        ↳ ' + c.note);
    if (c.detail) console.log('        ↳ ' + JSON.stringify(c.detail));
  }
  const tb = data.trial_balance;
  console.log(`\nNeraca saldo: D ${rp(tb.debit)} · K ${rp(tb.credit)} · ${tb.balanced ? 'SEIMBANG ✓' : 'TIDAK SEIMBANG ✗'}`);
  console.log(`Status keseluruhan: ${data.overall}`);
  if (data.exceptions.length) {
    console.log('\nPengecualian:');
    for (const e of data.exceptions) console.log(`  - [${e.status}] ${e.label}`);
  }
}

process.exitCode = data.overall === 'P1' ? 1 : 0;   // jangan process.exit(): socket keep-alive bisa memicu assertion libuv di Windows
