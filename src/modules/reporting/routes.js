import express from 'express';
import { pool } from '../../config/db.js';
import { buildPdf, buildXlsx, buildCsv } from '../../lib/exporters.js';

const router = express.Router();

const num = (v)=> parseFloat(v ?? 0) || 0;
// pg mengembalikan DATE sebagai objek Date (tengah malam lokal). Format dari komponen lokal,
// jangan toISOString() - di UTC+7 itu menggeser tanggal ke hari sebelumnya.
const iso = (d)=>{
  if (!d) return '';
  if (d instanceof Date){
    const p = (n)=> String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  return String(d).slice(0, 10);
};
const DEF_START = '2024-01-01';
const DEF_END = '2024-12-31';

// ---------------------------------------------------------------- filter helper
// Dipakai bareng oleh /sales dan /export?type=sales supaya hasil layar = hasil export.
function salesWhere(q){
  const w = ['so.so_date >= $1', 'so.so_date <= $2'];
  const p = [q.start || DEF_START, q.end || DEF_END];
  if (q.branch_id){ p.push(parseInt(q.branch_id, 10)); w.push(`so.branch_id = $${p.length}`); }
  if (q.category_id){ p.push(parseInt(q.category_id, 10)); w.push(`p.category_id = $${p.length}`); }
  if (q.q){ p.push('%' + String(q.q).toLowerCase() + '%'); w.push(`LOWER(c.name) LIKE $${p.length}`); }
  if (q.status){ p.push(q.status); w.push(`so.status = $${p.length}`); }
  return { where: w.join(' AND '), params: p };
}

// ---------------------------------------------------------------- GET /sales
router.get('/sales', async (req, res)=>{
  const { group_by } = req.query;
  const { where, params } = salesWhere(req.query);
  try {
    if (group_by === 'product'){
      const q = await pool.query(
        `SELECT p.name, pc.name AS category, SUM(d.qty)::float AS qty, SUM(d.total)::float AS revenue
           FROM so_details d
           JOIN products p ON p.id = d.product_id
           JOIN sales_orders so ON so.id = d.so_id
           LEFT JOIN customers c ON c.id = so.customer_id
           LEFT JOIN product_categories pc ON pc.id = p.category_id
          WHERE ${where}
          GROUP BY p.name, pc.name
          ORDER BY revenue DESC`, params);
      return res.json(q.rows);
    }
    if (group_by === 'customer'){
      const q = await pool.query(
        `SELECT c.name, SUM(so.total)::float AS total
           FROM sales_orders so
           JOIN customers c ON c.id = so.customer_id
          WHERE ${where}
          GROUP BY c.name ORDER BY total DESC`, params);
      return res.json(q.rows);
    }
    const q = await pool.query(
      `SELECT so.so_date AS date, SUM(so.total)::float AS total
         FROM sales_orders so
         JOIN customers c ON c.id = so.customer_id
        WHERE ${where}
        GROUP BY so.so_date ORDER BY so.so_date`, params);
    res.json(q.rows);
  } catch (e){ res.status(500).json({ error: e.message }); }
});

// ------------------------------------------------------------- GET /stock-card
router.get('/stock-card', async (req, res)=>{
  try {
    const r = await pool.query(
      `SELECT m.*, w.name AS wh FROM stock_movements m
        LEFT JOIN warehouses w ON w.id = m.warehouse_id
       WHERE m.product_id = $1 ORDER BY m.movement_date ASC`, [req.query.product_id]);
    res.json(r.rows);
  } catch (e){ res.status(500).json({ error: e.message }); }
});

// -------------------------------------------------------------- GET /aging-ar
// Bucket jujur: Current / 1-30 / 31-60 / 61-90 / >90 (61-90 jangan dilabeli '>60').
router.get('/aging-ar', async (req, res)=>{
  const p = [];
  const w = ["inv.status != 'PAID'"];
  if (req.query.q){ p.push('%' + String(req.query.q).toLowerCase() + '%'); w.push(`LOWER(c.name) LIKE $${p.length}`); }
  if (req.query.customer_id){ p.push(parseInt(req.query.customer_id, 10)); w.push(`c.id = $${p.length}`); }
  try {
    const r = await pool.query(
      `SELECT c.id AS customer_id, c.name, c.phone, inv.id AS invoice_id, inv.invoice_number,
              inv.invoice_date, inv.due_date, inv.total::float, inv.outstanding::float,
              (CURRENT_DATE - inv.due_date)::int AS days_overdue,
              CASE WHEN CURRENT_DATE - inv.due_date <= 0 THEN 'Current'
                   WHEN CURRENT_DATE - inv.due_date <= 30 THEN '1-30'
                   WHEN CURRENT_DATE - inv.due_date <= 60 THEN '31-60'
                   WHEN CURRENT_DATE - inv.due_date <= 90 THEN '61-90'
                   ELSE '>90' END AS bucket
         FROM invoices inv JOIN customers c ON c.id = inv.customer_id
        WHERE ${w.join(' AND ')} ORDER BY inv.due_date`, p);
    const rows = r.rows.map(x=>({
      ...x, total: num(x.total), outstanding: num(x.outstanding),
      days_overdue: num(x.days_overdue), due_date: iso(x.due_date), invoice_date: iso(x.invoice_date),
    }));
    const filtered = req.query.bucket && req.query.bucket !== 'Semua'
      ? rows.filter(x=> x.bucket === req.query.bucket) : rows;
    res.json(filtered);
  } catch (e){ res.status(500).json({ error: e.message }); }
});

// ------------------------------------------- GET /ar-invoice/:id (drill-down)
router.get('/ar-invoice/:id', async (req, res)=>{
  try {
    const inv = await pool.query(
      `SELECT inv.*, c.name AS customer_name, c.phone, c.code AS customer_code, c.credit_limit
         FROM invoices inv JOIN customers c ON c.id = inv.customer_id WHERE inv.id = $1`, [req.params.id]);
    if (!inv.rows[0]) return res.status(404).json({ error: 'Invoice tidak ditemukan' });
    const items = await pool.query(
      `SELECT d.*, p.name AS product_name, p.sku FROM invoice_details d
        LEFT JOIN products p ON p.id = d.product_id WHERE d.invoice_id = $1`, [req.params.id]);
    const pays = await pool.query('SELECT * FROM payments WHERE invoice_id = $1 ORDER BY id', [req.params.id])
      .catch(()=>({ rows: [] }));
    const i = inv.rows[0];
    res.json({
      invoice: {
        ...i, total: num(i.total), outstanding: num(i.outstanding), paid_amount: num(i.paid_amount),
        invoice_date: iso(i.invoice_date), due_date: iso(i.due_date),
        days_overdue: i.due_date ? Math.round((Date.now() - new Date(i.due_date).getTime()) / 86400000) : 0,
      },
      items: items.rows.map(x=>({ ...x, qty: num(x.qty), unit_price: num(x.unit_price), total: num(x.total) })),
      payments: pays.rows,
    });
  } catch (e){ res.status(500).json({ error: e.message }); }
});

// ------------------------------------------------------------------ GET /margin
// Urut margin terendah dulu supaya produk tipis/rugi langsung kelihatan.
router.get('/margin', async (req, res)=>{
  try {
    const r = await pool.query(
      `SELECT p.sku, p.name, pc.name AS category,
              AVG(pu.selling_price)::float AS price, AVG(s.avg_cost)::float AS cost,
              COALESCE(SUM(s.qty_on_hand),0)::float AS stock
         FROM products p
         LEFT JOIN product_units pu ON pu.product_id = p.id
         LEFT JOIN product_categories pc ON pc.id = p.category_id
         LEFT JOIN stocks s ON s.product_id = p.id
        GROUP BY p.sku, p.name, pc.name`);
    const rows = r.rows.map(x=>{
      const price = num(x.price), cost = num(x.cost);
      const margin = price - cost;
      return { sku: x.sku, name: x.name, category: x.category, price, cost, margin,
               pct: price > 0 ? parseFloat((margin / price * 100).toFixed(1)) : 0, stock: num(x.stock) };
    }).sort((a, b)=> a.pct - b.pct);
    res.json(rows);
  } catch (e){ res.status(500).json({ error: e.message }); }
});

// ------------------------------------------------- GET /meta (opsi filter UI)
router.get('/meta', async (_req, res)=>{
  try {
    const [br, cat] = await Promise.all([
      pool.query('SELECT id, name FROM branches ORDER BY id'),
      pool.query('SELECT id, name FROM product_categories ORDER BY name'),
    ]);
    res.json({ branches: br.rows, categories: cat.rows });
  } catch (e){ res.status(500).json({ error: e.message }); }
});

// ------------------------------------------------------------------ /export
const EXPORTS = {
  'sales': {
    label: 'Laporan Penjualan',
    async run(q){
      const { where, params } = salesWhere(q);
      const r = await pool.query(
        `SELECT so.so_number, so.so_date, c.name AS customer, b.name AS branch, so.status,
                so.subtotal::float, so.discount::float, so.tax::float, so.total::float
           FROM sales_orders so
           JOIN customers c ON c.id = so.customer_id
           LEFT JOIN branches b ON b.id = so.branch_id
          WHERE ${where} ORDER BY so.so_date DESC`, params);
      return {
        columns: [{ label: 'No SO' }, { label: 'Tanggal' }, { label: 'Pelanggan' }, { label: 'Cabang' }, { label: 'Status' },
                  { label: 'Subtotal', numeric: true, total: true }, { label: 'Diskon', numeric: true, total: true },
                  { label: 'PPN', numeric: true, total: true }, { label: 'Total', numeric: true, total: true }],
        rows: r.rows.map(x=>[x.so_number, iso(x.so_date), x.customer, x.branch || '-', x.status,
                             num(x.subtotal), num(x.discount), num(x.tax), num(x.total)]),
      };
    },
  },
  'purchases': {
    label: 'Laporan Pembelian',
    async run(q){
      const r = await pool.query(
        `SELECT po.po_number, po.po_date, s.name AS supplier, po.status, po.total::float
           FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id
          WHERE COALESCE(po.po_date, po.created_at::date) BETWEEN $1 AND $2
          ORDER BY po.po_date DESC`, [q.start || DEF_START, q.end || DEF_END]);
      return {
        columns: [{ label: 'No PO' }, { label: 'Tanggal' }, { label: 'Supplier' }, { label: 'Status' },
                  { label: 'Total', numeric: true, total: true }],
        rows: r.rows.map(x=>[x.po_number, iso(x.po_date), x.supplier || '-', x.status, num(x.total)]),
      };
    },
  },
  'stock-card': {
    label: 'Kartu Stok',
    async run(q){
      const r = await pool.query(
        `SELECT m.movement_date, p.sku, p.name, w.name AS warehouse, m.movement_type,
                m.qty_in::float, m.qty_out::float, m.reference_type, m.reference_id
           FROM stock_movements m
           LEFT JOIN products p ON p.id = m.product_id
           LEFT JOIN warehouses w ON w.id = m.warehouse_id
          WHERE m.movement_date BETWEEN $1 AND $2 ORDER BY m.movement_date DESC`,
        [q.start || DEF_START, q.end || DEF_END]);
      return {
        columns: [{ label: 'Tanggal' }, { label: 'SKU' }, { label: 'Produk' }, { label: 'Gudang' },
                  { label: 'Tipe' }, { label: 'Masuk', numeric: true, total: true },
                  { label: 'Keluar', numeric: true, total: true }, { label: 'Referensi' }],
        rows: r.rows.map(x=>[iso(x.movement_date), x.sku, x.name, x.warehouse || '-', x.movement_type,
                             num(x.qty_in), num(x.qty_out),
                             x.reference_type ? `${x.reference_type}#${x.reference_id ?? '-'}` : '-']),
      };
    },
  },
  'aging': {
    label: 'Aging Piutang',
    async run(q){
      const r = await pool.query(
        `SELECT c.name, inv.invoice_number, inv.invoice_date, inv.due_date, inv.total::float, inv.outstanding::float,
                (CURRENT_DATE - inv.due_date)::int AS days
           FROM invoices inv JOIN customers c ON c.id = inv.customer_id
          WHERE inv.status != 'PAID' AND inv.invoice_date BETWEEN $1 AND $2
          ORDER BY inv.due_date`, [q.start || DEF_START, q.end || DEF_END]);
      const bucket = (d)=> d <= 0 ? 'Current' : d <= 30 ? '1-30' : d <= 60 ? '31-60' : d <= 90 ? '61-90' : '>90';
      return {
        columns: [{ label: 'Pelanggan' }, { label: 'No Invoice' }, { label: 'Tgl Invoice' }, { label: 'Jatuh Tempo' },
                  { label: 'Nilai', numeric: true, total: true }, { label: 'Outstanding', numeric: true, total: true },
                  { label: 'Hari', numeric: true }, { label: 'Bucket' }],
        rows: r.rows.map(x=>[x.name, x.invoice_number, iso(x.invoice_date), iso(x.due_date),
                             num(x.total), num(x.outstanding), num(x.days), bucket(num(x.days))]),
      };
    },
  },
  'profit-loss': {
    label: 'Laba Rugi per Akun',
    async run(q){
      const r = await pool.query(
        `SELECT a.code, a.name, a.type, COALESCE(SUM(d.credit),0)::float AS credit, COALESCE(SUM(d.debit),0)::float AS debit
           FROM accounts a
           LEFT JOIN journal_details d ON d.account_id = a.id
           LEFT JOIN journal_entries e ON e.id = d.journal_id AND e.entry_date BETWEEN $1 AND $2
          GROUP BY a.code, a.name, a.type ORDER BY a.code`, [q.start || DEF_START, q.end || DEF_END]);
      return {
        columns: [{ label: 'Kode' }, { label: 'Akun' }, { label: 'Tipe' },
                  { label: 'Debit', numeric: true, total: true }, { label: 'Kredit', numeric: true, total: true },
                  { label: 'Saldo', numeric: true, total: true }],
        rows: r.rows.map(x=>[x.code, x.name, x.type, num(x.debit), num(x.credit), num(x.debit) - num(x.credit)]),
      };
    },
  },
  'margin': {
    label: 'Analisa Margin',
    async run(){
      const r = await pool.query(
        `SELECT p.sku, p.name, AVG(pu.selling_price)::float AS price, AVG(s.avg_cost)::float AS cost
           FROM products p LEFT JOIN product_units pu ON pu.product_id = p.id LEFT JOIN stocks s ON s.product_id = p.id
          GROUP BY p.sku, p.name`);
      return {
        columns: [{ label: 'SKU' }, { label: 'Produk' }, { label: 'Harga', numeric: true }, { label: 'HPP', numeric: true },
                  { label: 'Margin Rp', numeric: true, total: true }, { label: 'Margin %', numeric: true }],
        rows: r.rows.map(x=>{
          const price = num(x.price), cost = num(x.cost);
          return [x.sku, x.name, price, cost, price - cost, price > 0 ? ((price - cost) / price * 100).toFixed(1) : '0.0'];
        }),
      };
    },
  },
  'commission': {
    label: 'Komisi Sales',
    async run(q){
      const r = await pool.query(
        `SELECT COALESCE(emp.name, u.username, 'User ' || so.created_by) AS sales, COUNT(*)::int AS orders,
                SUM(so.total)::float AS revenue
           FROM sales_orders so
           LEFT JOIN users u ON u.id = so.created_by
           LEFT JOIN employees emp ON emp.id = u.employee_id
          WHERE so.so_date BETWEEN $1 AND $2
          GROUP BY 1 ORDER BY revenue DESC`, [q.start || DEF_START, q.end || DEF_END]);
      return {
        columns: [{ label: 'Sales' }, { label: 'Jumlah SO', numeric: true, total: true },
                  { label: 'Omzet', numeric: true, total: true }, { label: 'Komisi 1%', numeric: true, total: true }],
        rows: r.rows.map(x=>[x.sales, x.orders, num(x.revenue), Math.round(num(x.revenue) * 0.01)]),
      };
    },
  },
  'payroll': {
    label: 'Absensi & Payroll',
    async run(){
      const r = await pool.query(
        `SELECT e.employee_code, e.name AS full_name, p.period, p.basic_salary::float,
                p.allowances::float, p.overtime::float, p.deductions::float, p.pph21::float,
                p.bpjs_employee::float, p.net_salary::float, p.status
           FROM payrolls p LEFT JOIN employees e ON e.id = p.employee_id
          ORDER BY p.period DESC`).catch(()=>({ rows: [] }));
      return {
        columns: [{ label: 'NIK' }, { label: 'Nama' }, { label: 'Periode' },
                  { label: 'Gaji Pokok', numeric: true, total: true }, { label: 'Tunjangan', numeric: true, total: true },
                  { label: 'Lembur', numeric: true, total: true }, { label: 'Potongan', numeric: true, total: true },
                  { label: 'PPh21', numeric: true, total: true }, { label: 'BPJS', numeric: true, total: true },
                  { label: 'Take Home', numeric: true, total: true }, { label: 'Status' }],
        rows: r.rows.map(x=>[x.employee_code || '-', x.full_name || '-', x.period,
                             num(x.basic_salary), num(x.allowances), num(x.overtime), num(x.deductions),
                             num(x.pph21), num(x.bpjs_employee), num(x.net_salary), x.status || '-']),
      };
    },
  },
};

// ── Laporan persediaan & margin (dipakai halaman Laporan Persediaan) ─────────
// Valuasi stok: qty × HPP rata-rata per produk/gudang.
router.get('/stock-valuation', async (req, res)=>{
  try{
    const warehouseId = parseInt(req.query.warehouse_id)||null;
    const p = []; let where='WHERE 1=1';
    if(warehouseId){ p.push(warehouseId); where += ` AND s.warehouse_id=$${p.length}`; }
    const r = await pool.query(`
      SELECT p.id AS product_id, p.sku, p.name, w.id AS warehouse_id, w.name AS warehouse_name,
             COALESCE(s.qty_on_hand,0)::numeric AS qty, COALESCE(s.avg_cost,0)::numeric AS avg_cost,
             (COALESCE(s.qty_on_hand,0) * COALESCE(s.avg_cost,0))::numeric AS value
        FROM stocks s
        JOIN products p ON p.id=s.product_id
        JOIN warehouses w ON w.id=s.warehouse_id
        ${where}
       ORDER BY value DESC, p.name`, p);
    // Baris stok negatif (data lama) dipisahkan: kalau dijumlahkan, nilainya
    // mengacaukan total persediaan. Total dihitung dari baris qty >= 0.
    const negative = r.rows.filter(x=>Number(x.qty) < 0);
    const positives = r.rows.filter(x=>Number(x.qty) >= 0);
    const totalQty = positives.reduce((a,x)=>a+Number(x.qty||0),0);
    const totalValue = positives.reduce((a,x)=>a+Number(x.value||0),0);
    res.json({ data:r.rows, total_qty:totalQty, total_value:totalValue,
      negative_count: negative.length,
      negative_value: negative.reduce((a,x)=>a+Number(x.value||0),0),
      warehouses: await pool.query('SELECT id,name FROM warehouses ORDER BY id').then(x=>x.rows) });
  }catch(e){ console.error('[valuation]',e); res.status(500).json({error:e.message}); }
});

// Margin per produk: pendapatan (invoice_details) vs estimasi HPP (avg cost saat ini).
router.get('/product-margin', async (req, res)=>{
  try{
    const start = req.query.start || new Date(Date.now()+7*3600*1000-30*86400000).toISOString().slice(0,10);
    const end = req.query.end || new Date(Date.now()+7*3600*1000).toISOString().slice(0,10);
    const r = await pool.query(`
      WITH cost AS (
        SELECT product_id,
               COALESCE(NULLIF(SUM(ABS(qty_on_hand)*avg_cost)/NULLIF(SUM(ABS(qty_on_hand)),0),0), MAX(avg_cost), 0) AS avg_cost
          FROM stocks GROUP BY product_id
      )
      SELECT p.id AS product_id, p.sku, p.name,
             SUM(d.qty)::numeric AS qty_sold,
             SUM(d.total)::numeric AS revenue,
             SUM(d.qty * COALESCE(c.avg_cost,0))::numeric AS est_cost,
             (SUM(d.total) - SUM(d.qty * COALESCE(c.avg_cost,0)))::numeric AS gross_margin,
             CASE WHEN SUM(d.total)>0 THEN ROUND(((SUM(d.total) - SUM(d.qty*COALESCE(c.avg_cost,0))) / SUM(d.total) * 100)::numeric, 1) ELSE 0 END AS margin_pct
        FROM invoice_details d
        JOIN invoices inv ON inv.id=d.invoice_id
        JOIN products p ON p.id=d.product_id
        LEFT JOIN cost c ON c.product_id=p.id
       WHERE inv.invoice_date BETWEEN $1 AND $2
         AND UPPER(COALESCE(inv.status,'')) NOT IN ('CANCELLED','VOID')
       GROUP BY p.id, p.sku, p.name
       ORDER BY gross_margin DESC`, [start, end]);
    res.json({ start, end, data:r.rows,
      // Produk terjual tapi HPP-nya 0 → margin akan tampak 100%. Ditandai agar tidak menyesatkan.
      cost_missing: r.rows.filter(x=>Number(x.revenue)>0 && Number(x.est_cost)===0).length,
      totals: r.rows.reduce((a,x)=>({ revenue:a.revenue+Number(x.revenue||0), cost:a.cost+Number(x.est_cost||0), margin:a.margin+Number(x.gross_margin||0) }), {revenue:0,cost:0,margin:0}) });
  }catch(e){ console.error('[margin]',e); res.status(500).json({error:e.message}); }
});

router.get('/export/types', (_req, res)=>{
  res.json(Object.entries(EXPORTS).map(([key, v])=>({ key, label: v.label })));
});

router.get('/export', async (req, res)=>{
  const type = String(req.query.type || 'sales');
  const format = String(req.query.format || 'csv').toLowerCase();
  const def = EXPORTS[type];
  if (!def) return res.status(400).json({ error: `Tipe laporan tidak dikenal: ${type}`, available: Object.keys(EXPORTS) });
  if (!['csv', 'xlsx', 'pdf'].includes(format)) return res.status(400).json({ error: `Format tidak didukung: ${format}` });

  try {
    const { columns, rows } = await def.run(req.query);

    // baris TOTAL: hanya kolom yang ditandai total:true
    const totals = columns.map((c, i)=> c.total
      ? rows.reduce((a, r)=> a + (typeof r[i] === 'number' && Number.isFinite(r[i]) ? r[i] : 0), 0)
      : '');
    const hasTotals = totals.some((t, i)=> columns[i].total);

    // subjudul: periode + filter yang sedang aktif, supaya file bisa dibaca tanpa buka aplikasi
    const parts = [`Periode ${req.query.start || DEF_START} s/d ${req.query.end || DEF_END}`];
    if (req.query.branch_id){
      const r = await pool.query('SELECT name FROM branches WHERE id = $1', [parseInt(req.query.branch_id, 10)]).catch(()=>({ rows: [] }));
      parts.push('Cabang: ' + (r.rows[0]?.name || req.query.branch_id));
    }
    if (req.query.category_id){
      const r = await pool.query('SELECT name FROM product_categories WHERE id = $1', [parseInt(req.query.category_id, 10)]).catch(()=>({ rows: [] }));
      parts.push('Kategori: ' + (r.rows[0]?.name || req.query.category_id));
    }
    if (req.query.q) parts.push('Pencarian: "' + String(req.query.q) + '"');
    if (req.query.bucket) parts.push('Bucket: ' + req.query.bucket);
    parts.push(rows.length + ' baris');
    const subtitle = parts.join('  |  ');

    const stamp = new Date().toISOString().slice(0, 10);
    const base = `${type}-${stamp}`;
    const payload = { title: def.label, subtitle, columns, rows, totals: hasTotals ? totals : null, sheetName: def.label };

    if (format === 'csv'){
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.csv"`);
      return res.send(buildCsv(payload));
    }
    if (format === 'xlsx'){
      const buf = buildXlsx(payload);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.xlsx"`);
      return res.send(buf);
    }
    const pdf = buildPdf(payload);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.pdf"`);
    res.send(pdf);
  } catch (e){
    console.error('export error', e);
    res.status(500).json({ error: 'Gagal membuat laporan: ' + e.message });
  }
});

export default router;
