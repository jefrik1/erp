import express from 'express';
import { pool } from '../../config/db.js';
import { sendReport } from '../../lib/exporters.js';
const router = express.Router();

const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const monthName = (m)=> MONTHS[(parseInt(m, 10) || 1) - 1] || String(m);

const num = (v)=> parseFloat(v ?? 0) || 0;
const int = (v)=> parseInt(v, 10) || 0;

function budgetWhere(q, alias = 'b'){
  const w = [];
  const p = [];
  if (q.fiscal_year){ p.push(int(q.fiscal_year)); w.push(`${alias}.fiscal_year = $${p.length}`); }
  if (q.branch_id){ p.push(int(q.branch_id)); w.push(`${alias}.branch_id = $${p.length}`); }
  if (q.account_id){ p.push(int(q.account_id)); w.push(`${alias}.account_id = $${p.length}`); }
  return { where: w.length ? 'WHERE ' + w.join(' AND ') : '', params: p };
}

// ------------------------------------------------------------------ GET /budgets
router.get('/', async (req, res)=>{
  try {
    const { where, params } = budgetWhere(req.query);
    const r = await pool.query(
      `SELECT b.*, br.name AS branch_name, a.code AS account_code, a.name AS account_name
         FROM budgets b
         LEFT JOIN branches br ON br.id = b.branch_id
         LEFT JOIN accounts a ON a.id = b.account_id
         ${where}
        ORDER BY b.fiscal_year DESC, b.period_month, br.name`, params);
    res.json(r.rows.map(x=>({ ...x, budget_amount: num(x.budget_amount) })));
  } catch (e){ res.status(500).json({ error: e.message }); }
});

// --------------------------------------------------------------- POST /budgets
// Upsert (tahun+cabang+akun+bulan unik). Validasi required + nilai > 0.
router.post('/', async (req, res)=>{
  const fiscal_year = int(req.body.fiscal_year);
  const branch_id = int(req.body.branch_id);
  const account_id = int(req.body.account_id);
  const period_month = int(req.body.period_month);
  const budget_amount = num(req.body.budget_amount);
  const missing = [];
  if (!fiscal_year) missing.push('fiscal_year');
  if (!branch_id) missing.push('branch_id');
  if (!account_id) missing.push('account_id');
  if (!period_month || period_month < 1 || period_month > 12) missing.push('period_month (1-12)');
  if (!(budget_amount > 0)) missing.push('budget_amount (> 0)');
  if (missing.length) return res.status(400).json({ error: 'Field wajib belum lengkap: ' + missing.join(', ') });

  try {
    const r = await pool.query(
      `INSERT INTO budgets (fiscal_year, branch_id, department, account_id, period_month, budget_amount, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (fiscal_year, branch_id, account_id, period_month)
       DO UPDATE SET budget_amount = $6, notes = COALESCE($7, budgets.notes)
       RETURNING *`,
      [fiscal_year, branch_id, req.body.department || null, account_id, period_month, budget_amount, req.body.notes || null]);
    res.json({ ok: true, row: { ...r.rows[0], budget_amount: num(r.rows[0].budget_amount) } });
  } catch (e){ res.status(400).json({ error: e.message }); }
});

// ------------------------------------------------------------- PUT /budgets/:id
router.put('/:id', async (req, res)=>{
  const budget_amount = num(req.body.budget_amount);
  if (!(budget_amount > 0)) return res.status(400).json({ error: 'Nilai budget harus lebih dari 0' });
  try {
    const r = await pool.query(
      'UPDATE budgets SET budget_amount = $1, notes = COALESCE($2, notes) WHERE id = $3 RETURNING *',
      [budget_amount, req.body.notes ?? null, req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Budget tidak ditemukan' });
    res.json({ ok: true, row: { ...r.rows[0], budget_amount: num(r.rows[0].budget_amount) } });
  } catch (e){ res.status(400).json({ error: e.message }); }
});

// ---------------------------------------------------------- DELETE /budgets/:id
router.delete('/:id', async (req, res)=>{
  try {
    const r = await pool.query('DELETE FROM budgets WHERE id = $1 RETURNING id', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Budget tidak ditemukan' });
    res.json({ ok: true, id: r.rows[0].id });
  } catch (e){ res.status(500).json({ error: e.message }); }
});

// --------------------------------------------------- GET /budgets/comparison
// Selalu 12 bulan penuh (bulan tanpa budget/aktual tetap muncul, nilainya 0).
// Dipakai juga oleh /export supaya angka di file sama dengan angka di layar.
async function buildComparison(q){
  const fy = int(q.fiscal_year) || new Date().getFullYear();
  const bp = [fy];
  let bw = 'WHERE b.fiscal_year = $1';
  if (q.branch_id){ bp.push(int(q.branch_id)); bw += ` AND b.branch_id = $${bp.length}`; }
  if (q.account_id){ bp.push(int(q.account_id)); bw += ` AND b.account_id = $${bp.length}`; }

  const budgets = await pool.query(
    `SELECT b.period_month, SUM(b.budget_amount)::float AS budget FROM budgets b ${bw}
      GROUP BY b.period_month`, bp);

  // Aktual: total debit jurnal per bulan. Cabang tidak ada di journal_entries,
  // jadi filter cabang hanya menyaring sisi budget (dicatat di catatan UI).
  const actuals = await pool.query(
    `SELECT EXTRACT(MONTH FROM entry_date)::int AS period_month, SUM(total_debit)::float AS actual
       FROM journal_entries WHERE EXTRACT(YEAR FROM entry_date)::int = $1
      GROUP BY 1`, [fy]);

  const rows = [];
  let ytdBudget = 0, ytdActual = 0;
  for (let m = 1; m <= 12; m++){
    const b = num((budgets.rows.find(x=> x.period_month === m) || {}).budget);
    const a = num((actuals.rows.find(x=> x.period_month === m) || {}).actual);
    ytdBudget += b; ytdActual += a;
    rows.push({
      period_month: m, budget: b, actual: a, variance: a - b,
      pct: b ? parseFloat((a / b * 100).toFixed(1)) : 0,
      progress: b ? parseFloat(Math.min(200, a / b * 100).toFixed(1)) : 0,
    });
  }
  return { fiscal_year: fy, rows, ytd: { budget: ytdBudget, actual: ytdActual,
    variance: ytdActual - ytdBudget, pct: ytdBudget ? parseFloat((ytdActual / ytdBudget * 100).toFixed(1)) : 0 } };
}

router.get('/comparison', async (req, res)=>{
  try { res.json(await buildComparison(req.query)); }
  catch (e){ res.status(500).json({ error: e.message }); }
});

// -------------------------------------------------------- GET /budgets/export
// dataset=comparison (12 bulan + baris YTD) atau dataset=list (daftar budget).
router.get('/export', async (req, res)=>{
  const format = String(req.query.format || 'xlsx').toLowerCase();
  if (!['csv', 'xlsx', 'pdf'].includes(format)) return res.status(400).json({ error: `Format tidak didukung: ${format}` });
  const dataset = String(req.query.dataset || 'comparison');
  const fy = int(req.query.fiscal_year) || new Date().getFullYear();
  try {
    let branchLabel = '';
    if (req.query.branch_id){
      const b = await pool.query('SELECT name FROM branches WHERE id = $1', [int(req.query.branch_id)]).catch(()=>({ rows: [] }));
      branchLabel = '  |  Cabang: ' + (b.rows[0]?.name || req.query.branch_id);
    }
    let accountLabel = '';
    if (req.query.account_id){
      const a = await pool.query('SELECT code, name FROM accounts WHERE id = $1', [int(req.query.account_id)]).catch(()=>({ rows: [] }));
      accountLabel = '  |  Akun: ' + (a.rows[0] ? `${a.rows[0].code} ${a.rows[0].name}` : req.query.account_id);
    }

    if (dataset === 'list'){
      const { where, params } = budgetWhere(req.query);
      const r = await pool.query(
        `SELECT b.*, br.name AS branch_name, a.code AS account_code, a.name AS account_name
           FROM budgets b LEFT JOIN branches br ON br.id = b.branch_id LEFT JOIN accounts a ON a.id = b.account_id
           ${where} ORDER BY b.fiscal_year DESC, b.period_month, br.name`, params);
      const columns = [{ label: 'Tahun' }, { label: 'Cabang' }, { label: 'Akun' }, { label: 'Bulan' },
                       { label: 'Nilai Budget', numeric: true, total: true }];
      const rows = r.rows.map(x=>[x.fiscal_year, x.branch_name || ('Cabang #' + x.branch_id),
                                   `${x.account_code || ''} ${x.account_name || ''}`.trim(), monthName(x.period_month),
                                   num(x.budget_amount)]);
      const totals = columns.map((c, i)=> c.total ? rows.reduce((s, row)=> s + num(row[i]), 0) : '');
      const subtitle = `Tahun ${fy}${branchLabel}${accountLabel}  |  ${rows.length} baris`;
      return sendReport(res, { format, filename: `budget-list-${fy}`,
        payload: { title: 'Budget List', subtitle, columns, rows, totals, sheetName: 'Budget List' } });
    }

    const cmp = await buildComparison(req.query);
    const columns = [{ label: 'Bulan' }, { label: 'Budget', numeric: true, total: true },
                     { label: 'Actual', numeric: true, total: true }, { label: 'Selisih', numeric: true, total: true },
                     { label: 'Pencapaian %', numeric: true }, { label: 'Keterangan' }];
    const rows = cmp.rows.map(x=>[monthName(x.period_month), num(x.budget), num(x.actual), num(x.variance), num(x.pct),
      x.budget ? (x.variance >= 0 ? 'Di atas budget' : 'Di bawah budget') : 'Belum ada budget']);
    const totals = ['', num(cmp.ytd.budget), num(cmp.ytd.actual), num(cmp.ytd.variance), num(cmp.ytd.pct), 'Akumulasi Jan-Des'];
    const subtitle = `Tahun ${fy}${branchLabel}${accountLabel}  |  Actual dari jurnal (company-wide)  |  ${rows.length} baris`;
    return sendReport(res, { format, filename: `realisasi-vs-budget-${fy}`,
      payload: { title: `Realisasi vs Budget ${fy}`, subtitle, columns, rows, totals, sheetName: `Realisasi vs Budget` } });
  } catch (e){
    console.error('budget export error', e);
    res.status(500).json({ error: 'Gagal membuat laporan: ' + e.message });
  }
});

// ----------------------------------------------------- GET /budgets/cashflow
router.get('/cashflow', async (req, res)=>{
  const days = int(req.query.days) || 90;
  try {
    const ar = await pool.query(
      `SELECT COALESCE(SUM(outstanding),0)::float AS total FROM invoices
        WHERE status != 'PAID' AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1::int`, [days]);
    const ap = await pool.query(
      `SELECT COALESCE(SUM(total),0)::float AS total FROM purchase_orders
        WHERE status IN ('APPROVED','RECEIVED','PARTIAL') AND expected_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1::int`, [days]);
    const budgets = await pool.query(
      `SELECT COALESCE(SUM(budget_amount),0)::float AS total FROM budgets
        WHERE fiscal_year = EXTRACT(YEAR FROM CURRENT_DATE)::int
          AND period_month BETWEEN EXTRACT(MONTH FROM CURRENT_DATE)::int
                              AND EXTRACT(MONTH FROM CURRENT_DATE + $1::int)::int`, [days]);
    const cash = await pool.query('SELECT COALESCE(SUM(balance),0)::float AS total FROM bank_accounts');

    const cashNow = num(cash.rows[0].total);
    const arExpected = num(ar.rows[0].total);
    const apExpected = num(ap.rows[0].total);
    const expense = num(budgets.rows[0].total);
    res.json({
      horizon_days: days,
      cash_now: cashNow,
      ar_expected: arExpected,
      ap_expected: apExpected,
      budget_expense_expected: expense,
      net_projection: cashNow + arExpected - apExpected - expense,
      formula: 'Kas Sekarang + Piutang jatuh tempo - Hutang jatuh tempo - Budget expense',
      breakdown: [
        { label: 'Kas Sekarang', amount: cashNow },
        { label: `Piutang jatuh tempo ${days} hari`, amount: arExpected },
        { label: `Hutang jatuh tempo ${days} hari`, amount: -apExpected },
        { label: `Budget expense ${days} hari`, amount: -expense },
      ],
    });
  } catch (e){ res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------- GET /budgets/scenarios
// Asumsi dari user (sales_pct, collection_pct, opex_pct) - dihitung live, bukan list statis.
router.get('/scenarios', async (req, res)=>{
  const salesPct = req.query.sales_pct !== undefined ? num(req.query.sales_pct) : 0;
  const collectionPct = req.query.collection_pct !== undefined ? num(req.query.collection_pct) : 85;
  const opexPct = req.query.opex_pct !== undefined ? num(req.query.opex_pct) : 8;
  try {
    const rev = await pool.query(
      "SELECT COALESCE(SUM(total),0)::float AS rev FROM invoices WHERE status != 'CANCELLED'");
    const ar = await pool.query(
      "SELECT COALESCE(SUM(outstanding),0)::float AS ar FROM invoices WHERE status != 'PAID'");
    const base = num(rev.rows[0].rev);
    const arOpen = num(ar.rows[0].ar);

    const calc = (deltaPct)=>{
      const revenue = base * (1 + deltaPct / 100);
      const opex = revenue * opexPct / 100;
      return { revenue, opex, profit: revenue - opex, margin_pct: revenue ? parseFloat(((revenue - opex) / revenue * 100).toFixed(1)) : 0 };
    };
    const current = calc(salesPct);
    const arCollected = arOpen * collectionPct / 100;
    res.json({
      assumptions: { sales_pct: salesPct, collection_pct: collectionPct, opex_pct: opexPct },
      base_revenue: base,
      open_ar: arOpen,
      ar_collected: arCollected,
      net_cash: arCollected - current.opex,
      current,
      scenarios: [
        { scenario: 'Base', ...calc(0) },
        { scenario: 'Penjualan -20%', ...calc(-20) },
        { scenario: 'Penjualan +15%', ...calc(15) },
        { scenario: `Asumsi user (${salesPct > 0 ? '+' : ''}${salesPct}%)`, ...current },
      ],
    });
  } catch (e){ res.status(500).json({ error: e.message }); }
});

export default router;
