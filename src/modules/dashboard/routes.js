import express from 'express';
import { pool } from '../../config/db.js';
const router = express.Router();

// Zona bisnis = WIB (UTC+7). JANGAN pakai toISOString() mentah untuk "hari ini":
// sebelum 07:00 WIB, tanggal UTC masih kemarin sehingga KPI harian salah.
const WIB_MS = 7 * 3600 * 1000;
const wibDate = (shiftDays = 0) => new Date(Date.now() + WIB_MS + shiftDays * 86400000).toISOString().slice(0, 10);

router.get('/kpi', async (req,res)=>{
  const today = wibDate(0);
  const yesterday = wibDate(-1);
  const [todayQ, yestQ, stokKritis, piutangJt, cash, banks, poOverdue] = await Promise.all([
    pool.query("SELECT COALESCE(SUM(total),0) as val FROM sales_orders WHERE so_date=$1 AND status != 'CANCELLED'",[today]),
    pool.query("SELECT COALESCE(SUM(total),0) as val FROM sales_orders WHERE so_date=$1 AND status != 'CANCELLED'",[yesterday]),
    pool.query("SELECT COUNT(*) as cnt FROM stocks s JOIN products p ON p.id=s.product_id WHERE s.qty_available <= p.reorder_point"),
    pool.query("SELECT COALESCE(SUM(outstanding),0) as val, COUNT(*) as cnt FROM invoices WHERE due_date <= $1 AND status IN ('SENT','PARTIAL','OVERDUE')",[today]),
    pool.query("SELECT COALESCE(SUM(balance),0) as val FROM bank_accounts"),
    pool.query("SELECT bank_name FROM bank_accounts ORDER BY bank_name"),
    pool.query("SELECT COUNT(*) as cnt FROM purchase_orders WHERE expected_date < $1 AND status IN ('APPROVED','PENDING')",[today]),
  ]);
  const todayVal = parseFloat(todayQ.rows[0].val);
  const yestVal = parseFloat(yestQ.rows[0].val);
  res.json({
    penjualan_hari_ini: todayVal,
    penjualan_kemarin: yestVal,
    growth_pct: yestVal > 0 ? Math.round(((todayVal - yestVal) / yestVal) * 1000) / 10 : null,
    stok_kritis: parseInt(stokKritis.rows[0].cnt),
    piutang_jatuh_tempo: { amount: parseFloat(piutangJt.rows[0].val), count: parseInt(piutangJt.rows[0].cnt) },
    cash_position: parseFloat(cash.rows[0].val),
    bank_names: banks.rows.map(b => b.bank_name),
    po_overdue: parseInt(poOverdue.rows[0].cnt),
    as_of: today
  });
});

router.get('/sales-trend', async (req,res)=>{
  // 14 hari kalender terakhir (WIB); hari tanpa transaksi tetap tampil sebagai 0
  const start = wibDate(-13), end = wibDate(0);
  const r = await pool.query(`
    SELECT d::date as date, COALESCE(SUM(so.total),0) as total
    FROM generate_series($1::date, $2::date, INTERVAL '1 day') d
    LEFT JOIN sales_orders so ON so.so_date = d::date AND so.status != 'CANCELLED'
    GROUP BY d ORDER BY d`, [start, end]);
  res.json(r.rows.map(x=>({ date: x.date, total: parseFloat(x.total) })));
});

router.get('/top-products', async (req,res)=>{
  const r = await pool.query(`
    SELECT p.name, SUM(d.qty) as qty, SUM(d.total) as revenue
    FROM so_details d
    JOIN products p ON p.id = d.product_id
    JOIN sales_orders so ON so.id = d.so_id
    WHERE so.status != 'CANCELLED'
    GROUP BY p.name ORDER BY revenue DESC LIMIT 5`);
  res.json(r.rows.map(x=>({ name:x.name, qty:parseFloat(x.qty), revenue:parseFloat(x.revenue) })));
});

router.get('/top-customers', async (req,res)=>{
  const r = await pool.query(`
    SELECT c.name, SUM(so.total) as total
    FROM sales_orders so JOIN customers c ON c.id = so.customer_id
    WHERE so.status != 'CANCELLED'
    GROUP BY c.name ORDER BY total DESC LIMIT 5`);
  res.json(r.rows.map(x=>({ name:x.name, total:parseFloat(x.total) })));
});

router.get('/profit-margin', async (req,res)=>{
  // ESTIMASI: HPP = qty x avg_cost stok saat ini (weighted semua gudang).
  // Cost per transaksi tidak disimpan di so_details; ini pendekatan terbaik tanpa ubah skema.
  const start = wibDate(-6), end = wibDate(0);
  const r = await pool.query(`
    SELECT so.so_date as date, SUM(d.total) as revenue,
           SUM(d.qty * COALESCE(c.avg_cost,0)) as hpp
    FROM so_details d
    JOIN sales_orders so ON so.id = d.so_id
    LEFT JOIN LATERAL (
      SELECT SUM(s.qty_on_hand * s.avg_cost) / NULLIF(SUM(s.qty_on_hand),0) as avg_cost
      FROM stocks s WHERE s.product_id = d.product_id
    ) c ON true
    WHERE so.status != 'CANCELLED' AND so.so_date BETWEEN $1 AND $2
    GROUP BY so.so_date ORDER BY so.so_date`, [start, end]);
  res.json(r.rows.map(x=>{
    const rev = parseFloat(x.revenue) || 0;
    const hpp = parseFloat(x.hpp) || 0;
    return { date:x.date, revenue:rev, profit:rev - hpp, estimated:true };
  }));
});

router.get('/notifications', async (req,res)=>{
  const today = wibDate(0);
  const [low, overdueInv, po, lowC, invC, poC] = await Promise.all([
    pool.query("SELECT p.name, s.qty_available, p.reorder_point, w.name as wh FROM stocks s JOIN products p ON p.id=s.product_id JOIN warehouses w ON w.id=s.warehouse_id WHERE s.qty_available <= p.reorder_point LIMIT 5"),
    pool.query("SELECT invoice_number, due_date, outstanding FROM invoices WHERE status='OVERDUE' LIMIT 5"),
    pool.query("SELECT po_number, expected_date FROM purchase_orders WHERE expected_date < $1 AND status IN ('APPROVED','PENDING') LIMIT 5",[today]),
    pool.query("SELECT COUNT(*) as cnt FROM stocks s JOIN products p ON p.id=s.product_id WHERE s.qty_available <= p.reorder_point"),
    pool.query("SELECT COUNT(*) as cnt FROM invoices WHERE status='OVERDUE'"),
    pool.query("SELECT COUNT(*) as cnt FROM purchase_orders WHERE expected_date < $1 AND status IN ('APPROVED','PENDING')",[today]),
  ]);
  res.json({
    lowStock: low.rows, overdueInvoices: overdueInv.rows, poOverdue: po.rows,
    counts: { lowStock: parseInt(lowC.rows[0].cnt), overdueInvoices: parseInt(invC.rows[0].cnt), poOverdue: parseInt(poC.rows[0].cnt) }
  });
});


// Notifikasi relevan per role (dipakai dropdown lonceng di Layout).
router.get('/my-notifications', async (req,res)=>{
  const roles = (req.user?.roles||[]).map(r=>String(r).toLowerCase());
  const has = (...rs)=> roles.length===0 || roles.includes('direktur') || roles.includes('super_admin') || rs.some(r=>roles.includes(r));
  const out = [];
  try{
    if(has('warehouse','purchasing')){
      const c=await pool.query("SELECT COUNT(*)::int n FROM stocks s JOIN products p ON p.id=s.product_id WHERE s.qty_available <= p.reorder_point");
      if(c.rows[0].n>0) out.push({ kind:'stock', count:c.rows[0].n, label:c.rows[0].n+' SKU stok kritis (di bawah reorder point)', to:'/inventory/stocks' });
    }
    if(has('finance','sales')){
      const c=await pool.query("SELECT COUNT(*)::int n FROM invoices WHERE status='OVERDUE'");
      if(c.rows[0].n>0) out.push({ kind:'invoice', count:c.rows[0].n, label:c.rows[0].n+' invoice lewat jatuh tempo', to:'/sales/invoices' });
    }
    if(has('purchasing','warehouse','finance')){
      const c=await pool.query("SELECT COUNT(*)::int n FROM purchase_orders WHERE expected_date < $1 AND status IN ('APPROVED','PENDING')",[wibDate(0)]);
      if(c.rows[0].n>0) out.push({ kind:'po', count:c.rows[0].n, label:c.rows[0].n+' PO terlambat diterima', to:'/purchase/orders' });
    }
    if(has('hrd')){
      const c=await pool.query("SELECT COUNT(*)::int n FROM leaves WHERE status='PENDING'");
      if(c.rows[0].n>0) out.push({ kind:'leave', count:c.rows[0].n, label:c.rows[0].n+' pengajuan cuti menunggu persetujuan', to:'/hr' });
    }
    if(has('finance','sales','warehouse','purchasing','hrd','project_manager','sales_trading')){
      const c=await pool.query("SELECT COUNT(*)::int n FROM approval_requests WHERE status='PENDING'");
      if(c.rows[0].n>0) out.push({ kind:'approval', count:c.rows[0].n, label:c.rows[0].n+' approval menunggu tindakan', to:'/approvals' });
    }
  }catch(e){}
  res.json(out);
});

export default router;
