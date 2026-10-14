import express from 'express';
import { pool } from '../../config/db.js';
const router=express.Router();
router.get('/', async(req,res)=>{
  const fy=req.query.fiscal_year||2024;
  const r=await pool.query('SELECT b.*, br.name as branch_name, a.code as account_code, a.name as account_name FROM budgets b LEFT JOIN branches br ON br.id=b.branch_id LEFT JOIN accounts a ON a.id=b.account_id WHERE b.fiscal_year=$1 ORDER BY b.period_month',[fy]);
  res.json(r.rows);
});
router.post('/', async(req,res)=>{
  const {fiscal_year,branch_id,department,account_id,period_month,budget_amount,notes}=req.body;
  await pool.query('INSERT INTO budgets (fiscal_year,branch_id,department,account_id,period_month,budget_amount,notes) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (fiscal_year,branch_id,account_id,period_month) DO UPDATE SET budget_amount=$6',[fiscal_year,branch_id,department,account_id,period_month,budget_amount,notes]);
  res.json({ok:true});
});
router.get('/comparison', async(req,res)=>{
  const fy=req.query.fiscal_year||2024;
  // sum actual from journal_entries grouped by month approximated via entry_date, join to budgets via account not yet linked, so use total revenue vs budget
  const budgets=await pool.query('SELECT period_month, SUM(budget_amount) as budget FROM budgets WHERE fiscal_year=$1 GROUP BY period_month ORDER BY period_month',[fy]);
  const actuals=await pool.query("SELECT EXTRACT(MONTH FROM entry_date)::int as period_month, SUM(total_debit) as actual FROM journal_entries WHERE EXTRACT(YEAR FROM entry_date)=$1 GROUP BY period_month ORDER BY period_month",[fy]);
  const map={}; budgets.rows.forEach(b=> map[b.period_month]={budget:parseFloat(b.budget), actual:0}); actuals.rows.forEach(a=> { if(!map[a.period_month]) map[a.period_month]={budget:0,actual:0}; map[a.period_month].actual=parseFloat(a.actual); });
  const merged=Object.entries(map).map(([m,v])=>({period_month:parseInt(m), ...v, variance: v.actual - v.budget, pct: v.budget? (v.actual/v.budget*100).toFixed(1):0 }));
  res.json(merged);
});
router.get('/cashflow', async(req,res)=>{
  const days=parseInt(req.query.days||'90');
  const ar=await pool.query("SELECT COALESCE(SUM(outstanding),0) as total FROM invoices WHERE status != 'PAID' AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + ($1 || ' days')::interval",[days]);
  const ap=await pool.query("SELECT COALESCE(SUM(total),0) as total FROM purchase_orders WHERE status IN ('APPROVED','RECEIVED','PARTIAL') AND expected_date BETWEEN CURRENT_DATE AND CURRENT_DATE + ($1 || ' days')::interval",[days]);
  const budgets=await pool.query("SELECT COALESCE(SUM(budget_amount),0) as total FROM budgets WHERE fiscal_year=EXTRACT(YEAR FROM CURRENT_DATE)::int AND period_month BETWEEN EXTRACT(MONTH FROM CURRENT_DATE)::int AND EXTRACT(MONTH FROM CURRENT_DATE + ($1 || ' days')::interval)::int",[days]);
  const cash=await pool.query('SELECT COALESCE(SUM(balance),0) as total FROM bank_accounts');
  res.json({
    horizon_days:days,
    cash_now: parseFloat(cash.rows[0].total),
    ar_expected: parseFloat(ar.rows[0].total),
    ap_expected: parseFloat(ap.rows[0].total),
    budget_expense_expected: parseFloat(budgets.rows[0].total),
    net_projection: parseFloat(cash.rows[0].total) + parseFloat(ar.rows[0].total) - parseFloat(ap.rows[0].total) - parseFloat(budgets.rows[0].total),
    breakdown: [
      {label:'Kas Sekarang', amount: parseFloat(cash.rows[0].total)},
      {label:'Piutang dalam '+days+' hari', amount: parseFloat(ar.rows[0].total)},
      {label:'Hutang jatuh tempo '+days+' hari', amount: -parseFloat(ap.rows[0].total)},
      {label:'Budget expense '+days+' hari', amount: -parseFloat(budgets.rows[0].total)},
    ]
  });
});
router.get('/scenarios', async(req,res)=>{
  const rev=await pool.query("SELECT COALESCE(SUM(total),0) as rev FROM invoices WHERE status != 'CANCELLED'");
  const base=parseFloat(rev.rows[0].rev||0);
  res.json([
    {scenario:'Base', revenue:base, opex: base*0.08, profit: base*0.14},
    {scenario:'Penjualan -20%', revenue:base*0.8, opex: base*0.08, profit: base*0.8 - base*0.75*0.8 - base*0.08},
    {scenario:'Penjualan +15%', revenue:base*1.15, opex: base*0.09, profit: base*1.15 - base*0.75*1.15 - base*0.09},
  ]);
});
export default router;
