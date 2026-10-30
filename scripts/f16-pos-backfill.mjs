#!/usr/bin/env node
/**
 * F16 — Backfill pendapatan & PPN invoice POS historis.
 *
 *   node scripts/f16-pos-backfill.mjs                 # dry-run (default, tidak menulis apa pun)
 *   node scripts/f16-pos-backfill.mjs --apply         # eksekusi
 *   node scripts/f16-pos-backfill.mjs --json          # keluaran JSON
 *
 * Prinsip (lihat docs/F16-ACCOUNTING-DESIGN.md):
 *  - Tidak menebak: semua angka diambil dari invoices/payments.
 *  - Idempoten: invoice yang sudah punya jurnal POS_SALE dilewati; jurnal pembalik
 *    shift hanya dibuat sekali (unique index reference_type/reference_id).
 *  - Tidak menghapus/mengubah jurnal lama: koreksi agregat shift dilakukan dengan
 *    jurnal PEMBALIK (reversal_of).
 *  - Satu transaksi per invoice agar kegagalan sebagian tetap terlacak.
 */
import dotenv from 'dotenv';
import pg from 'pg';
import { assertRepairAllowed } from '../src/lib/repair-guard.js';
assertRepairAllowed('f16-pos-backfill.mjs');

dotenv.config();
pg.types.setTypeParser(1114, (v) => (v ? String(v).replace(' ', 'T').slice(0, 23) : v));
pg.types.setTypeParser(1082, (v) => v);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const APPLY = process.argv.includes('--apply');
const JSON_OUT = process.argv.includes('--json');
const BATCH_CODE = 'F16-POS-REVENUE';
const ACTOR = 1; // admin/direktur — dicatat di jurnal & batch
const CASH_GL = '1-1010', BANK_GL = '1-1020', AR_GL = '1-1100', REV_GL = '4-1000', VAT_GL = '2-1100', OVERPAY_GL = '2-1400';
const rp = (n) => 'Rp ' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));
const n = (v) => Number(v) || 0;

async function buildDataset(db) {
  // Invoice POS + pembayarannya + shift yang menaunginya.
  const { rows } = await db.query(`
    SELECT i.id, i.invoice_number, i.invoice_date, i.status,
           i.subtotal, i.discount, i.tax, i.total, i.paid_amount,
           (i.total - COALESCE(i.paid_amount,0)) AS unpaid,
           (i.subtotal - COALESCE(i.discount,0))  AS net,
           (SELECT id FROM journal_entries je WHERE je.reference_type='POS_SALE' AND je.reference_id=i.id LIMIT 1) AS existing_journal,
           (SELECT json_agg(json_build_object('id',p.id,'method',p.method,'amount',p.amount) ORDER BY p.id)
              FROM payments p WHERE p.invoice_id=i.id) AS pays,
           (SELECT s.id FROM pos_cashier_shifts s
             WHERE i.created_at >= s.login_time AND i.created_at <= COALESCE(s.logout_time, now())
             ORDER BY s.login_time DESC LIMIT 1) AS shift_id
      FROM invoices i
     WHERE i.invoice_number LIKE 'INV-POS-%'
     ORDER BY i.invoice_date, i.id`);
  return rows;
}

async function shiftJournals(db) {
  // Jurnal agregat tutup shift yang mengakui pendapatan (Cr 4-1000).
  const { rows } = await db.query(`
    SELECT je.id, je.reference_id AS shift_id, je.entry_date, je.description,
           SUM(jd.credit) AS revenue,
           (SELECT id FROM journal_entries r WHERE r.reversal_of = je.id LIMIT 1) AS reversed_by
      FROM journal_entries je
      JOIN journal_details jd ON jd.journal_id = je.id
      JOIN accounts a ON a.id = jd.account_id
     WHERE je.reference_type = 'SHIFT' AND a.code = $1
     GROUP BY je.id, je.reference_id, je.entry_date, je.description
     ORDER BY je.id`, [REV_GL]);
  return rows;
}

function classify(inv) {
  if (String(inv.status).toUpperCase() === 'CANCELLED' || String(inv.status).toUpperCase() === 'VOID') return 'F';
  if (inv.existing_journal) return 'A';
  if (n(inv.net) > 0 && n(inv.tax) > 0) return 'D'; // revenue & VAT dua-duanya belum ada
  return 'E';
}

function planInvoice(inv) {
  const pays = inv.pays || [];
  const cash = pays.filter((p) => String(p.method).toUpperCase() === 'CASH').reduce((s, p) => s + n(p.amount), 0);
  const nonCash = pays.filter((p) => String(p.method).toUpperCase() !== 'CASH').reduce((s, p) => s + n(p.amount), 0);
  const unpaid = Math.max(0, n(inv.total) - n(inv.paid_amount));
  const lines = [];
  if (cash > 0.005) lines.push({ code: CASH_GL, debit: cash, description: `Kas tunai POS ${inv.invoice_number}` });
  if (nonCash > 0.005) lines.push({ code: BANK_GL, debit: nonCash, description: `Bank/EDC POS ${inv.invoice_number}` });
  if (unpaid > 0.005) lines.push({ code: AR_GL, debit: unpaid, description: `Piutang POS ${inv.invoice_number}` });
  lines.push({ code: REV_GL, credit: n(inv.net), description: `Penjualan POS ${inv.invoice_number}` });
  if (n(inv.tax) > 0.005) lines.push({ code: VAT_GL, credit: n(inv.tax), description: `PPN keluaran POS ${inv.invoice_number}` });
  // Kelebihan bayar (pembayaran ganda) BUKAN pendapatan → liabilitas uang muka pelanggan.
  const overpay = Math.max(0, cash + nonCash + unpaid - n(inv.total));
  if (overpay > 0.005) lines.push({ code: OVERPAY_GL, credit: overpay, description: `Kelebihan bayar POS ${inv.invoice_number}` });
  return { lines, cash, nonCash, unpaid, overpay, settle: cash + nonCash + unpaid };
}

(async () => {
  const out = { mode: APPLY ? 'APPLY' : 'DRY_RUN', batch: BATCH_CODE, generated_at: new Date().toISOString() };
  try {
    const invoices = await buildDataset(pool);
    const sj = await shiftJournals(pool);
    const byShift = new Map();
    for (const inv of invoices) {
      if (!inv.shift_id) continue;
      const k = Number(inv.shift_id);
      byShift.set(k, (byShift.get(k) || 0) + n(inv.paid_amount));
    }

    // Klasifikasi + rencana jurnal per invoice.
    const plans = invoices.map((inv) => {
      const cls = classify(inv);
      const plan = cls === 'A' || cls === 'F' ? { lines: [], cash: 0, nonCash: 0, unpaid: 0, settle: 0 } : planInvoice(inv);
      const dSum = plan.lines.reduce((s, l) => s + n(l.debit), 0);
      const cSum = plan.lines.reduce((s, l) => s + n(l.credit), 0);
      return { ...inv, cls, ...plan, balanced: Math.abs(dSum - cSum) < 0.5 };
    });

    // Jurnal shift yang menduplikasi invoice (revenue = total pembayaran invoice pada shift itu).
    const reversals = [];
    for (const j of sj) {
      if (j.reversed_by) { reversals.push({ ...j, action: 'SKIP', reason: 'sudah dibalik' }); continue; }
      const invPaid = byShift.get(Number(j.shift_id)) || 0;
      if (Math.abs(invPaid - n(j.revenue)) < 0.5 && invPaid > 0) {
        reversals.push({ ...j, action: 'REVERSE', reason: `pendapatan shift ${j.shift_id} sudah dibukukan per-invoice` });
      } else {
        reversals.push({ ...j, action: 'EXCEPTION', reason: `pendapatan ${rp(j.revenue)} tanpa invoice pendukung (invoice pada shift = ${rp(invPaid)})` });
      }
    }

    const summary = {
      invoices: plans.length,
      a_already: plans.filter((p) => p.cls === 'A').length,
      d_post: plans.filter((p) => p.cls === 'D').length,
      e_review: plans.filter((p) => p.cls === 'E').length,
      f_excluded: plans.filter((p) => p.cls === 'F').length,
      unbalanced: plans.filter((p) => !p.balanced).length,
      total_net: plans.filter((p) => p.cls === 'D').reduce((s, p) => s + n(p.net), 0),
      total_vat: plans.filter((p) => p.cls === 'D').reduce((s, p) => s + n(p.tax), 0),
      total_settle: plans.filter((p) => p.cls === 'D').reduce((s, p) => s + n(p.settle), 0),
      reversals: reversals.filter((r) => r.action === 'REVERSE').length,
      reversal_amount: reversals.filter((r) => r.action === 'REVERSE').reduce((s, r) => s + n(r.revenue), 0),
      shift_exceptions: reversals.filter((r) => r.action === 'EXCEPTION').map((r) => ({ journal_id: r.id, shift_id: r.shift_id, revenue: n(r.revenue), reason: r.reason })),
    };
    out.summary = summary;
    out.reversals = reversals;
    if (!JSON_OUT) {
      console.log(`=== F16 ${out.mode} · ${plans.length} invoice POS ===`);
      console.log(`  A sudah terjurnal : ${summary.a_already}`);
      console.log(`  D akan dijurnal   : ${summary.d_post}  (net ${rp(summary.total_net)} · PPN ${rp(summary.total_vat)} · settlement ${rp(summary.total_settle)})`);
      console.log(`  E perlu review    : ${summary.e_review}   F dikecualikan: ${summary.f_excluded}   tidak balance: ${summary.unbalanced}`);
      console.log(`  Pembalik shift    : ${summary.reversals} jurnal · ${rp(summary.reversal_amount)}`);
      for (const e of summary.shift_exceptions) console.log(`  ! PENGECUALIAN shift #${e.shift_id}: ${e.reason}`);
      console.log('\n  Contoh jurnal (3 invoice pertama):');
      for (const p of plans.filter((x) => x.cls === 'D').slice(0, 3)) {
        console.log(`  ${p.invoice_number} · ${p.invoice_date} · net ${rp(p.net)} · PPN ${rp(p.tax)}`);
        for (const l of p.lines) console.log(`     ${l.code}  D ${String(rp(l.debit)).padStart(16)}  K ${String(rp(l.credit)).padStart(16)}  ${l.description}`);
      }
    }

    if (!APPLY) {
      out.note = 'DRY-RUN: tidak ada jurnal, mutasi kas, atau perubahan data yang ditulis.';
      if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
      await pool.end();
      return;
    }

    // ── EKSEKUSI ───────────────────────────────────────────────────────────
    const { postJournal } = await import('../src/lib/journal.js');
    const b = await pool.query(`
      INSERT INTO data_backfill_batches (code, version, scope, status, invoice_count, total_revenue, total_vat, total_settle, approved_by, executed_by, started_at)
      VALUES ($1,'1','POS invoices historis (INV-POS-*)',$2,$3,$4,$5,$6,'user:jefri (instruksi F16 30-Okt-2026)',$7, now())
      ON CONFLICT (code) DO UPDATE SET status=$2, invoice_count=$3, total_revenue=$4, total_vat=$5, total_settle=$6, executed_by=$7, started_at=now()
      RETURNING id`,
      [BATCH_CODE, 'EXECUTING', summary.d_post, summary.total_net, summary.total_vat, summary.total_settle, `user:${ACTOR}`]);
    const batchId = b.rows[0].id;

    let posted = 0, skipped = 0, failed = 0;
    for (const p of plans) {
      if (p.cls !== 'D') {
        await pool.query(`INSERT INTO data_backfill_items (batch_id, entity_id, entity_number, classification, source_total, source_net, source_vat, status, error)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'SKIPPED',$8) ON CONFLICT (batch_id, entity_type, entity_id) DO NOTHING`,
          [batchId, p.id, p.invoice_number, p.cls, p.total, p.net, p.tax, p.cls === 'A' ? 'sudah terjurnal' : 'dikecualikan/review']);
        skipped++;
        continue;
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const jid = await postJournal({ date: p.invoice_date, refType: 'POS_SALE', refId: p.id,
          description: `F16 backfill pendapatan POS ${p.invoice_number}`, lines: p.lines, createdBy: ACTOR, client });
        // Sisi kas/bank: catat mutasi + saldo rekening agar GL dan master kas konsisten.
        // Pembayaran tunai pada shift yang sudah menyetor kas (creditCash) dilewati.
        for (const pay of (p.pays || [])) {
          const isCash = String(pay.method).toUpperCase() === 'CASH';
          const dup = await client.query(`SELECT 1 FROM cash_movements WHERE reference_type='PAYMENT' AND reference_id=$1 LIMIT 1`, [pay.id]);
          if (dup.rowCount) continue;
          if (isCash && p.shift_id) {
            const sh = await client.query(`SELECT 1 FROM cash_movements WHERE reference_type='SHIFT' AND reference_id=$1 LIMIT 1`, [p.shift_id]);
            if (sh.rowCount) continue;
          }
          const acct = isCash ? 233 : 231;
          await client.query(`INSERT INTO cash_movements (account_id, direction, amount, source, reference_type, reference_id, notes, created_by)
             VALUES ($1,'IN',$2,'POS_BACKFILL','PAYMENT',$3,$4,$5)`, [acct, n(pay.amount), pay.id, `F16 backfill ${p.invoice_number}`, ACTOR]);
          await client.query(`UPDATE bank_accounts SET balance = balance + $2 WHERE id = $1`, [acct, n(pay.amount)]);
        }
        await client.query(`INSERT INTO data_backfill_items (batch_id, entity_id, entity_number, classification, source_total, source_net, source_vat, posted_net, posted_vat, posted_settle, journal_id, status, payload)
           VALUES ($1,$2,$3,'D',$4,$5,$6,$5,$6,$7,$8,'POSTED',$9)
           ON CONFLICT (batch_id, entity_type, entity_id) DO UPDATE SET status='POSTED', journal_id=$8, posted_net=$5, posted_vat=$6, posted_settle=$7`,
          [batchId, p.id, p.invoice_number, p.total, p.net, p.tax, p.settle, jid, JSON.stringify(p.lines)]);
        await client.query('COMMIT');
        posted++;
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch {}
        await pool.query(`INSERT INTO data_backfill_items (batch_id, entity_id, entity_number, classification, source_total, source_net, source_vat, status, error)
           VALUES ($1,$2,$3,'D',$4,$5,$6,'FAILED',$7) ON CONFLICT (batch_id, entity_type, entity_id) DO UPDATE SET status='FAILED', error=$7`,
          [batchId, p.id, p.invoice_number, p.total, p.net, p.tax, e.message]);
        failed++;
      } finally { client.release(); }
    }

    // Pembalik jurnal shift agregat (hanya yang terbukti menduplikasi invoice).
    let reversed = 0;
    for (const r of reversals.filter((x) => x.action === 'REVERSE')) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await postJournal({ date: r.entry_date, refType: 'SHIFT_REVERSAL', refId: r.id,
          description: `Pembalik ${r.description} — pendapatan kini dibukukan per invoice (F16)`,
          lines: [{ code: REV_GL, debit: n(r.revenue), description: `Pembalik pendapatan shift ${r.shift_id}` },
                  { code: CASH_GL, credit: n(r.revenue), description: `Pembalik kas shift ${r.shift_id}` }],
          createdBy: ACTOR, client, reversalOf: r.id, reversalReason: 'F16: hindari pengakuan pendapatan ganda' });
        await client.query('COMMIT');
        reversed++;
      } catch (e) { try { await client.query('ROLLBACK'); } catch {} console.error('reversal gagal', r.id, e.message); failed++; }
      finally { client.release(); }
    }

    await pool.query(`UPDATE data_backfill_batches SET status=$2, finished_at=now() WHERE id=$1`, [batchId, failed ? 'FAILED' : 'DONE']);
    out.result = { batch_id: batchId, posted, skipped, failed, reversed };
    if (!JSON_OUT) console.log(`\n  EXECUTION: ${posted} jurnal diposting · ${skipped} dilewati · ${reversed} pembalik · ${failed} gagal`);
    if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
  } catch (e) {
    console.error('F16 gagal:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
})();
