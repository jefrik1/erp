#!/usr/bin/env node
// npm run verify:golive — gerbang pra-peluncuran (pre-flight go-live).
// Memeriksa invarian produksi dan keluar dengan kode 0 HANYA bila semua lulus.
//   node scripts/production-cutover-check.mjs [--json]
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();
pg.types.setTypeParser(1114, v => (v ? String(v).replace(' ', 'T').slice(0, 23) : v));
pg.types.setTypeParser(1082, v => v);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const JSON_OUT = process.argv.includes('--json');
// --profile=production: item keamanan/infra menjadi WAJIB (FAIL, bukan WARN).
const PROD = process.argv.includes('--profile=production');
const crit = (base) => (PROD ? true : base);

const results = [];
const add = (id, label, ok, detail, critical = true) => results.push({ id, label, ok: !!ok, critical, detail: detail ?? null });
const one = async (sql, p) => (await pool.query(sql, p)).rows[0] || {};
const rp = (n) => 'Rp ' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));

try {
  // ── 1. Konfigurasi & rahasia ──────────────────────────────────────────────
  const secret = process.env.JWT_SECRET || '';
  add('SECRET', 'JWT_SECRET bukan default & ≥32 karakter', secret.length >= 32 && secret !== 'erp_jwt_super_secret_2024',
    `panjang ${secret.length}`, crit(false));
  add('NODE_ENV', 'NODE_ENV=production', process.env.NODE_ENV === 'production', process.env.NODE_ENV || 'development', crit(false));
  add('CORS', 'ALLOWED_ORIGINS diisi', !!process.env.ALLOWED_ORIGINS, process.env.ALLOWED_ORIGINS || 'kosong', crit(false));

  // ── 2. Akun demo ─────────────────────────────────────────────────────────
  const demo = await one(`SELECT COUNT(*)::int n FROM users WHERE username = ANY($1) AND is_active`,
    [['admin', 'kasir', 'driver', 'hrd', 'purchasing', 'auditor']]);
  add('DEMO_ACCOUNTS', 'Tidak ada akun demo aktif', demo.n === 0, `${demo.n} akun demo masih aktif`, crit(false));

  // ── 3. Integritas stok ───────────────────────────────────────────────────
  const neg = await one('SELECT COUNT(*)::int n FROM stocks WHERE qty_on_hand < 0');
  add('STOCK_NEGATIVE', 'Tidak ada stok minus', neg.n === 0, `${neg.n} baris`);
  const zeroCost = await one('SELECT COUNT(*)::int n FROM stocks WHERE COALESCE(avg_cost,0)=0 AND qty_on_hand<>0');
  add('STOCK_HPP0', 'Tidak ada stok ber-HPP 0', zeroCost.n === 0, `${zeroCost.n} baris`);
  const dupRow = await one(`SELECT COUNT(*)::int n FROM (SELECT product_id, warehouse_id FROM stocks
     GROUP BY 1,2 HAVING COUNT(*)>1) x`);
  add('STOCK_DUPLICATE', 'Tidak ada baris stok kembar', dupRow.n === 0, `${dupRow.n} grup`);
  const noCard = await one(`SELECT COUNT(*)::int n FROM stocks s
     WHERE NOT EXISTS (SELECT 1 FROM stock_movements m WHERE m.product_id=s.product_id AND m.warehouse_id=s.warehouse_id)`);
  add('STOCK_CARD', 'Semua baris stok punya kartu stok', noCard.n === 0, `${noCard.n} baris tanpa riwayat`, crit(false));

  // ── 4. Buku besar ────────────────────────────────────────────────────────
  const tb = await one('SELECT COALESCE(SUM(debit),0)::numeric d, COALESCE(SUM(credit),0)::numeric c FROM journal_details');
  add('TB_BALANCE', 'Neraca saldo debit = kredit', Math.abs(Number(tb.d) - Number(tb.c)) < 1, `${rp(tb.d)} vs ${rp(tb.c)}`);
  const stockVal = await one('SELECT COALESCE(SUM(qty_on_hand*COALESCE(avg_cost,0)),0)::numeric v FROM stocks');
  const glInv = await one(`SELECT COALESCE(SUM(jd.debit-jd.credit),0)::numeric v FROM journal_details jd
     JOIN accounts a ON a.id=jd.account_id WHERE a.code='1-1200'`);
  const invDelta = Number(stockVal.v) - Number(glInv.v);
  add('GL_INVENTORY', 'GL Persediaan = nilai stok fisik', Math.abs(invDelta) < 1,
    `stok ${rp(stockVal.v)} · GL ${rp(glInv.v)} · selisih ${rp(invDelta)}`);
  const noLines = await one(`SELECT COUNT(*)::int n FROM journal_entries je
     WHERE NOT EXISTS (SELECT 1 FROM journal_details jd WHERE jd.journal_id=je.id)`);
  add('JOURNAL_LINES', 'Tidak ada jurnal tanpa baris', noLines.n === 0, `${noLines.n} jurnal`);
  const unbal = await one(`SELECT COUNT(*)::int n FROM (SELECT je.id FROM journal_entries je
     JOIN journal_details jd ON jd.journal_id=je.id GROUP BY je.id
     HAVING ABS(SUM(jd.debit)-SUM(jd.credit))>0.5) x`);
  add('JOURNAL_BALANCE', 'Semua jurnal balance', unbal.n === 0, `${unbal.n} jurnal`);
  const dupRef = await one(`SELECT COUNT(*)::int n FROM (SELECT reference_type, reference_id FROM journal_entries
     WHERE reference_id IS NOT NULL GROUP BY 1,2 HAVING COUNT(*)>1) x`);
  add('JOURNAL_DUPLICATE', 'Tidak ada referensi jurnal ganda', dupRef.n === 0, `${dupRef.n} pasang`, crit(false));

  // ── 5. Subledger ─────────────────────────────────────────────────────────
  const ar = await one(`SELECT COALESCE(SUM(GREATEST(total-paid_amount,0)),0)::numeric v FROM invoices
     WHERE UPPER(COALESCE(status,'')) NOT IN ('CANCELLED','VOID')`);
  const arGl = await one(`SELECT COALESCE(SUM(jd.debit-jd.credit),0)::numeric v FROM journal_details jd
     JOIN accounts a ON a.id=jd.account_id WHERE a.code='1-1100'`);
  add('AR', 'Piutang GL = sisa tagihan invoice', Math.abs(Number(ar.v) - Number(arGl.v)) < 1,
    `${rp(arGl.v)} vs ${rp(ar.v)}`);
  const apInv = await one(`SELECT COALESCE(SUM(total),0)::numeric v FROM purchase_invoices
     WHERE UPPER(COALESCE(status,'')) IN ('APPROVED','PAID','MATCHED')`);
  const apPay = await one(`SELECT COALESCE(SUM(amount),0)::numeric v FROM payments WHERE type='AP'`);
  const apGl = await one(`SELECT COALESCE(SUM(jd.credit-jd.debit),0)::numeric v FROM journal_details jd
     JOIN accounts a ON a.id=jd.account_id WHERE a.code='2-1000'`);
  const apDelta = Number(apInv.v) - Number(apPay.v) - Number(apGl.v);
  add('AP', 'Hutang Usaha = invoice pemasok − pembayaran', Math.abs(apDelta) < 1, `selisih ${rp(apDelta)}`);
  const grnNoJournal = await one(`SELECT COUNT(*)::int n FROM goods_receipts gr
     WHERE gr.is_dropship IS NOT TRUE
       AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_type='GRN' AND je.reference_id=gr.id)`);
  add('GRN_JOURNAL', 'Semua GRN sudah berjurnal', grnNoJournal.n === 0, `${grnNoJournal.n} GRN`, crit(false));

  // ── 6. Penjaga basis data ────────────────────────────────────────────────
  const trg = await one(`SELECT COUNT(*)::int n FROM pg_trigger WHERE tgname LIKE 'trg_immutable%' AND NOT tgisinternal`);
  add('IMMUTABLE', 'Trigger append-only terpasang (5 tabel)', trg.n >= 5, `${trg.n} trigger`);
  const chk = await one(`SELECT COUNT(*)::int n FROM pg_constraint WHERE conname='chk_stocks_qty_nonneg'`);
  add('STOCK_CHECK', 'Constraint qty_on_hand >= 0 terpasang', chk.n === 1, chk.n ? 'ada' : 'tidak ada');
  const fk = await one(`SELECT COUNT(*)::int n FROM pg_constraint WHERE contype='f'`);
  add('FK', 'Foreign key aktif', fk.n > 50, `${fk.n} FK`, crit(false));

  // ── 7. Backup ────────────────────────────────────────────────────────────
  const dir = path.resolve('backups');
  let newest = null;
  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.dump')).sort();
    if (files.length) newest = { name: files.at(-1), mtime: fs.statSync(path.join(dir, files.at(-1))).mtime };
  } catch { /* folder belum ada */ }
  const ageH = newest ? (Date.now() - newest.mtime.getTime()) / 36e5 : Infinity;
  add('BACKUP', 'Backup < 48 jam tersedia', ageH <= 48, newest ? `${newest.name} (${ageH.toFixed(1)} jam lalu)` : 'tidak ada backup', crit(false));

  // ── 8. Redis (opsional) ──────────────────────────────────────────────────
  add('REDIS', 'REDIS_URL dikonfigurasi', !!process.env.REDIS_URL, process.env.REDIS_URL ? 'ada' : 'kosong', crit(false));
} catch (e) {
  add('FATAL', 'Pemeriksaan berjalan', false, e.message);
}

const failedCritical = results.filter((r) => !r.ok && r.critical);
if (JSON_OUT) {
  console.log(JSON.stringify({ generated_at: new Date().toISOString(), profile: PROD ? 'production' : 'default', ready: failedCritical.length === 0, results }, null, 2));
} else {
  console.log('=== PRE-FLIGHT GO-LIVE ===\n');
  for (const r of results) {
    const flag = r.ok ? 'PASS' : (r.critical ? 'FAIL' : 'WARN');
    console.log(`${flag}  ${String(r.label).padEnd(48)} ${r.detail || ''}`);
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} lulus · ${failedCritical.length} kegagalan kritis`);
  console.log(failedCritical.length === 0
    ? 'Sistem SIAP untuk lalu lintas komersial (kriteria kritis terpenuhi).'
    : 'BELUM SIAP — selesaikan item FAIL di atas.');
}
await pool.end();
process.exitCode = failedCritical.length === 0 ? 0 : 1;
