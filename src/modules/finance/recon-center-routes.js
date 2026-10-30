import express from 'express';
import { pool } from '../../config/db.js';

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// PUSAT INTEGRITAS KEUANGAN & REKONSILIASI
// Membandingkan buku besar (GL) dengan buku pembantu (subledger) dan dokumen
// sumber. Tidak pernah mengubah saldo — hanya melaporkan selisih + bukti.
//   GET /api/finance/recon-center            → semua cek + daftar pengecualian
//   GET /api/finance/recon-center/:key       → drilldown satu cek
// ─────────────────────────────────────────────────────────────────────────────

const num = (v) => Number(v || 0);

// side: 'D' = saldo normal debit (aset), 'K' = saldo normal kredit (kewajiban/ekuitas).
async function glBalance(codes, side = 'D') {
  const r = await pool.query(
    `SELECT COALESCE(SUM(jd.debit - jd.credit),0)::numeric AS saldo
       FROM journal_details jd JOIN accounts a ON a.id = jd.account_id
      WHERE a.code = ANY($1)`, [codes]);
  const d = num(r.rows[0]?.saldo);
  return side === 'K' ? -d : d;
}

const checks = {
  // Piutang usaha: GL 1-1100 vs sisa tagihan SEMUA invoice (POS kini juga membuat piutang saat DP < total).
  async ar() {
    const gl = await glBalance(['1-1100']);
    const r = await pool.query(
      `SELECT COALESCE(SUM(GREATEST(total - paid_amount, 0)),0)::numeric AS saldo, COUNT(*)::int AS n
         FROM invoices
        WHERE UPPER(COALESCE(status,'')) NOT IN ('CANCELLED','VOID')`);
    // Kelebihan bayar bukan piutang negatif — dicatat sebagai liabilitas 2-1400 (uang muka pelanggan).
    const over = await pool.query(
      `SELECT COALESCE(SUM(GREATEST(paid_amount - total, 0)),0)::numeric AS saldo, COUNT(*)::int AS n
         FROM invoices WHERE UPPER(COALESCE(status,'')) NOT IN ('CANCELLED','VOID')`);
    return {
      key: 'AR', label: 'Piutang Usaha (1-1100) vs sisa tagihan invoice', gl,
      subledger: num(r.rows[0].saldo), count: r.rows[0].n,
      note: num(over.rows[0].saldo) > 0.5
        ? `Kelebihan bayar Rp ${Math.round(num(over.rows[0].saldo)).toLocaleString('id-ID')} (${over.rows[0].n} invoice) dicatat di 2-1400 Uang Muka Pelanggan, bukan piutang negatif.`
        : null,
    };
  },

  // Hutang usaha: GL 2-1000 vs (invoice pemasok disetujui − pembayaran AP).
  async ap() {
    const gl = await glBalance(['2-1000'], 'K');
    const inv = await pool.query(
      `SELECT COALESCE(SUM(total),0)::numeric AS t FROM purchase_invoices
        WHERE UPPER(COALESCE(status,'')) IN ('APPROVED','PAID','MATCHED')`);
    const pay = await pool.query(`SELECT COALESCE(SUM(amount),0)::numeric AS t FROM payments WHERE type='AP'`);
    return {
      key: 'AP', label: 'Hutang Usaha (2-1000) vs invoice pemasok − pembayaran',
      gl, subledger: num(inv.rows[0].t) - num(pay.rows[0].t), count: 0,
      note: 'Saldo debit berarti pembayaran AP melebihi kewajiban yang tercatat (penerimaan barang belum dijurnal).',
    };
  },

  // GR/IR: barang diterima belum ditagih (2-1150).
  async grir() {
    const gl = await glBalance(['2-1150'], 'K');
    const grn = await pool.query(
      `SELECT COALESCE(SUM(gd.qty_received * gd.unit_cost),0)::numeric AS t, COUNT(DISTINCT gr.id)::int AS n
         FROM grn_details gd JOIN goods_receipts gr ON gr.id = gd.grn_id
        WHERE gr.is_dropship IS NOT TRUE`);
    const pinv = await pool.query(
      `SELECT COALESCE(SUM(total - COALESCE(tax,0)),0)::numeric AS t FROM purchase_invoices
        WHERE UPPER(COALESCE(status,'')) IN ('APPROVED','PAID','MATCHED')`);
    const grnJournaled = await pool.query(
      `SELECT COALESCE(SUM(gd.qty_received * gd.unit_cost),0)::numeric AS t, COUNT(DISTINCT gr.id)::int AS n
         FROM grn_details gd JOIN goods_receipts gr ON gr.id = gd.grn_id
        WHERE gr.is_dropship IS NOT TRUE
          AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_type='GRN' AND je.reference_id=gr.id)`);
    return {
      key: 'GRIR', label: 'GR/IR (2-1150) vs nilai barang diterima − invoice pemasok',
      gl, subledger: num(grn.rows[0].t) - num(pinv.rows[0].t),
      count: grn.rows[0].n,
      note: `${grn.rows[0].n} GRN senilai Rp ${Math.round(num(grn.rows[0].t)).toLocaleString('id-ID')}, baru ${grnJournaled.rows[0].n} GRN yang punya jurnal.`,
    };
  },

  // Persediaan: GL 1-1200 vs nilai stok fisik (qty × HPP rata-rata).
  async inventory() {
    const gl = await glBalance(['1-1200']);
    const r = await pool.query(`SELECT COALESCE(SUM(qty_on_hand*COALESCE(avg_cost,0)),0)::numeric AS t FROM stocks`);
    return { key: 'INVENTORY', label: 'Persediaan (1-1200) vs nilai stok fisik', gl, subledger: num(r.rows[0].t), count: 0 };
  },

  // Kas & bank: GL vs saldo master rekening.
  async cash() {
    const gl = await glBalance(['1-1000', '1-1010', '1-1020']);
    const r = await pool.query(`SELECT COALESCE(SUM(balance),0)::numeric AS t, COUNT(*)::int AS n FROM bank_accounts`);
    return { key: 'CASH', label: 'Kas & Bank (1-1000/1010/1020) vs saldo rekening', gl, subledger: num(r.rows[0].t), count: r.rows[0].n };
  },

  // PPN: GL 2-1100 vs PPN keluaran dari invoice yang masih berlaku.
  async tax() {
    const gl = await glBalance(['2-1100'], 'K');
    const r = await pool.query(
      `SELECT COALESCE(SUM(tax),0)::numeric AS t FROM invoices WHERE UPPER(COALESCE(status,'')) NOT IN ('CANCELLED','VOID')`);
    return { key: 'TAX', label: 'Hutang PPN (2-1100) vs PPN keluaran invoice', gl, subledger: num(r.rows[0].t), count: 0,
      note: 'Termasuk PPN dari invoice POS yang pendapatannya belum dijurnal.' };
  },

  // Jurnal tanpa baris / tidak balance / duplikat.
  async journals() {
    const noLines = await pool.query(
      `SELECT COUNT(*)::int AS n FROM journal_entries je
        WHERE NOT EXISTS (SELECT 1 FROM journal_details jd WHERE jd.journal_id=je.id)`);
    const unbalanced = await pool.query(
      `SELECT COUNT(*)::int AS n FROM (
         SELECT je.id, SUM(jd.debit) d, SUM(jd.credit) c
           FROM journal_entries je JOIN journal_details jd ON jd.journal_id=je.id
          GROUP BY je.id HAVING ABS(SUM(jd.debit)-SUM(jd.credit)) > 0.5) x`);
    const dupNo = await pool.query(
      `SELECT COUNT(*)::int AS n FROM (
         SELECT entry_number FROM journal_entries GROUP BY entry_number HAVING COUNT(*) > 1) x`);
    const dupRef = await pool.query(
      `SELECT COUNT(*)::int AS n FROM (
         SELECT reference_type, reference_id FROM journal_entries
          WHERE reference_id IS NOT NULL
          GROUP BY reference_type, reference_id HAVING COUNT(*) > 1) x`);
    return {
      key: 'JOURNALS', label: 'Integritas jurnal (tanpa baris / tidak balance / duplikat)',
      gl: 0, subledger: 0,
      count: noLines.rows[0].n + unbalanced.rows[0].n + dupNo.rows[0].n + dupRef.rows[0].n,
      detail: {
        tanpa_baris: noLines.rows[0].n, tidak_balance: unbalanced.rows[0].n,
        nomor_duplikat: dupNo.rows[0].n, referensi_duplikat: dupRef.rows[0].n,
      },
    };
  },

  // Dokumen sumber yang dirujuk jurnal tapi tidak ada.
  async orphans() {
    const r = await pool.query(`
      SELECT je.reference_type, COUNT(*)::int AS n
        FROM journal_entries je
       WHERE je.reference_id IS NOT NULL AND (
             (je.reference_type='INVOICE' AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id=je.reference_id))
          OR (je.reference_type='GRN'     AND NOT EXISTS (SELECT 1 FROM goods_receipts g WHERE g.id=je.reference_id))
          OR (je.reference_type='PINV'    AND NOT EXISTS (SELECT 1 FROM purchase_invoices p WHERE p.id=je.reference_id))
          OR (je.reference_type='PAYMENT' AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.id=je.reference_id)))
       GROUP BY je.reference_type`);
    const total = r.rows.reduce((a, x) => a + x.n, 0);
    return { key: 'ORPHANS', label: 'Jurnal menunjuk dokumen yang tidak ada', gl: 0, subledger: 0, count: total,
      detail: Object.fromEntries(r.rows.map((x) => [x.reference_type, x.n])) };
  },
};

function statusOf(variance, tolerance = 1) {
  if (Math.abs(variance) <= tolerance) return 'OK';
  return Math.abs(variance) > 10000000 ? 'P1' : 'P2';   // > Rp 10 jt = P1
}

router.get('/', async (req, res) => {
  try {
    const keys = (req.query.only ? String(req.query.only).split(',') : Object.keys(checks));
    const out = [];
    for (const k of keys) {
      const fn = checks[k] || checks[String(k).toLowerCase()] || checks[String(k).toUpperCase()];
      if (!fn) continue;
      const c = await fn();
      const variance = num(c.gl) - num(c.subledger);
      const financial = ['AR', 'AP', 'GRIR', 'INVENTORY', 'CASH', 'TAX'].includes(c.key);
      out.push({ ...c, variance, status: financial ? statusOf(variance) : (c.count > 0 ? 'P2' : 'OK') });
    }
    const exceptions = out.filter((c) => c.status !== 'OK');
    res.json({
      generated_at: new Date(Date.now() + 7 * 3600 * 1000).toISOString().replace('Z', '+07:00'),
      overall: exceptions.some((c) => c.status === 'P1') ? 'P1' : exceptions.length ? 'P2' : 'OK',
      checks: out, exceptions,
      trial_balance: await pool.query(
        `SELECT COALESCE(SUM(debit),0)::numeric d, COALESCE(SUM(credit),0)::numeric c FROM journal_details`)
        .then((r) => ({ debit: num(r.rows[0].d), credit: num(r.rows[0].c), balanced: Math.abs(num(r.rows[0].d) - num(r.rows[0].c)) < 1 })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Drilldown: baris yang membentuk selisih (invoice/GRN/jurnal terbaru).
router.get('/:key', async (req, res) => {
  const key = String(req.params.key).toUpperCase();
  try {
    if (key === 'AR') {
      const r = await pool.query(
        `SELECT i.id, i.invoice_number, i.invoice_date, i.status, i.total, i.paid_amount,
                (i.total - i.paid_amount) AS outstanding, c.name AS customer_name
           FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id
          WHERE UPPER(COALESCE(i.status,'')) NOT IN ('CANCELLED','VOID') AND i.total - i.paid_amount > 0.5
          ORDER BY outstanding DESC LIMIT 100`);
      return res.json({ key, rows: r.rows });
    }
    if (key === 'AP' || key === 'GRIR') {
      const r = await pool.query(
        `SELECT gr.id, gr.grn_number, gr.receipt_date, gr.po_id,
                COALESCE(SUM(gd.qty_received*gd.unit_cost),0)::numeric AS nilai,
                EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_type='GRN' AND je.reference_id=gr.id) AS berjurnal
           FROM goods_receipts gr LEFT JOIN grn_details gd ON gd.grn_id=gr.id
          GROUP BY gr.id ORDER BY gr.id DESC LIMIT 100`);
      return res.json({ key, rows: r.rows });
    }
    if (key === 'JOURNALS' || key === 'ORPHANS') {
      const r = await pool.query(
        `SELECT je.id, je.entry_number, je.reference_type, je.reference_id, je.entry_date, je.description,
                (SELECT COUNT(*) FROM journal_details jd WHERE jd.journal_id=je.id) AS baris,
                (SELECT COALESCE(SUM(jd.debit),0) FROM journal_details jd WHERE jd.journal_id=je.id) AS debit,
                (SELECT COALESCE(SUM(jd.credit),0) FROM journal_details jd WHERE jd.journal_id=je.id) AS credit
           FROM journal_entries je ORDER BY je.id DESC LIMIT 100`);
      return res.json({ key, rows: r.rows });
    }
    if (key === 'INVENTORY') {
      const r = await pool.query(
        `SELECT w.code, w.name, COALESCE(SUM(s.qty_on_hand*s.avg_cost),0)::numeric AS nilai
           FROM stocks s JOIN warehouses w ON w.id=s.warehouse_id GROUP BY w.code, w.name ORDER BY nilai DESC`);
      return res.json({ key, rows: r.rows });
    }
    res.status(400).json({ error: 'key tidak dikenal', available: Object.keys(checks) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
