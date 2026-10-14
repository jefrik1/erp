import express from 'express';
import { pool } from '../../config/db.js';
const router = express.Router();

router.get('/kpi', async (req,res)=>{
  const today = new Date().toISOString().slice(0,10);
  const salesToday = await pool.query("SELECT COALESCE(SUM(total),0) as val FROM sales_orders WHERE so_date=$1 AND status != 'CANCELLED'",[today]);
  // fallback to last sales if today zero -> show total
  let todayVal = parseFloat(salesToday.rows[0].val);
  if(todayVal===0){
    const tot = await pool.query("SELECT COALESCE(SUM(total),0) as val FROM sales_orders WHERE status != 'CANCELLED'");
    todayVal = parseFloat(tot.rows[0].val);
  }
  const stokKritis = await pool.query("SELECT COUNT(*) as cnt FROM stocks s JOIN products p ON p.id=s.product_id WHERE s.qty_available <= p.reorder_point");
  const piutangJt = await pool.query("SELECT COALESCE(SUM(outstanding),0) as val, COUNT(*) as cnt FROM invoices WHERE due_date <= CURRENT_DATE AND status IN ('SENT','PARTIAL','OVERDUE')");
  const cash = await pool.query("SELECT COALESCE(SUM(balance),0) as val FROM bank_accounts");
  const poOverdue = await pool.query("SELECT COUNT(*) as cnt FROM purchase_orders WHERE expected_date < CURRENT_DATE AND status IN ('APPROVED','PENDING')");
  res.json({
    penjualan_hari_ini: todayVal,
    stok_kritis: parseInt(stokKritis.rows[0].cnt),
    piutang_jatuh_tempo: { amount: parseFloat(piutangJt.rows[0].val), count: parseInt(piutangJt.rows[0].cnt)},
    cash_position: parseFloat(cash.rows[0].val),
    po_overdue: parseInt(poOverdue.rows[0].cnt)
  });
});

router.get('/sales-trend', async (req,res)=>{
  const r=await pool.query("SELECT so_date as date, SUM(total) as total FROM sales_orders WHERE status != 'CANCELLED' GROUP BY so_date ORDER BY so_date DESC LIMIT 14");
  res.json(r.rows.reverse().map(x=>({date:x.date, total: parseFloat(x.total)})));
});

router.get('/top-products', async (req,res)=>{
  const r=await pool.query("SELECT p.name, SUM(d.qty) as qty, SUM(d.total) as revenue FROM so_details d JOIN products p ON p.id=d.product_id JOIN sales_orders so ON so.id=d.so_id GROUP BY p.name ORDER BY revenue DESC LIMIT 5");
  res.json(r.rows.map(x=>({name:x.name, qty:parseFloat(x.qty), revenue:parseFloat(x.revenue)})));
});

router.get('/top-customers', async (req,res)=>{
  const r=await pool.query("SELECT c.name, SUM(so.total) as total FROM sales_orders so JOIN customers c ON c.id=so.customer_id GROUP BY c.name ORDER BY total DESC LIMIT 5");
  res.json(r.rows.map(x=>({name:x.name, total:parseFloat(x.total)})));
});

router.get('/profit-margin', async (req,res)=>{
  // mock profit 18-25%
  const r=await pool.query("SELECT so_date, SUM(total) as rev FROM sales_orders GROUP BY so_date ORDER BY so_date DESC LIMIT 7");
  res.json(r.rows.reverse().map(x=>({date:x.so_date, revenue:parseFloat(x.rev), profit: parseFloat(x.rev)*0.22 })));
});

router.get('/notifications', async (req,res)=>{
  const low = await pool.query("SELECT p.name, s.qty_available, p.reorder_point, w.name as wh FROM stocks s JOIN products p ON p.id=s.product_id JOIN warehouses w ON w.id=s.warehouse_id WHERE s.qty_available <= p.reorder_point LIMIT 5");
  const overdueInv = await pool.query("SELECT invoice_number, due_date, outstanding FROM invoices WHERE status='OVERDUE' LIMIT 5");
  const po = await pool.query("SELECT po_number, expected_date FROM purchase_orders WHERE expected_date < CURRENT_DATE AND status IN ('APPROVED','PENDING') LIMIT 5");
  res.json({ lowStock: low.rows, overdueInvoices: overdueInv.rows, poOverdue: po.rows });
});

export default router;
