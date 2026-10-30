import express from 'express';
import { pool } from '../../config/db.js';
import { rbac } from '../../middleware/auth.js';
const router = express.Router();

// Widget PENJUALAN (KPI, tren, top produk/customer, margin) hanya untuk admin,
// kasir, dan sales. Role lain mendapat 403 dan memakai dashboard operasionalnya
// sendiri di frontend (gudang/purchasing/HRD/finance/driver/karyawan).
const SALES_VIEWERS = ['direktur','super_admin','sales','sales_trading','pos_cashier','pos_supervisor','pos_manager'];

// Zona bisnis = WIB (UTC+7). JANGAN pakai toISOString() mentah untuk "hari ini":
// sebelum 07:00 WIB, tanggal UTC masih kemarin sehingga KPI harian salah.
const WIB_MS = 7 * 3600 * 1000;
const wibDate = (shiftDays = 0) => new Date(Date.now() + WIB_MS + shiftDays * 86400000).toISOString().slice(0, 10);

router.get('/kpi', rbac(...SALES_VIEWERS), async (req,res)=>{
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

router.get('/sales-trend', rbac(...SALES_VIEWERS), async (req,res)=>{
  // 14 hari kalender terakhir (WIB); hari tanpa transaksi tetap tampil sebagai 0
  const start = wibDate(-13), end = wibDate(0);
  const r = await pool.query(`
    SELECT d::date as date, COALESCE(SUM(so.total),0) as total
    FROM generate_series($1::date, $2::date, INTERVAL '1 day') d
    LEFT JOIN sales_orders so ON so.so_date = d::date AND so.status != 'CANCELLED'
    GROUP BY d ORDER BY d`, [start, end]);
  res.json(r.rows.map(x=>({ date: x.date, total: parseFloat(x.total) })));
});

router.get('/top-products', rbac(...SALES_VIEWERS), async (req,res)=>{
  const r = await pool.query(`
    SELECT p.name, SUM(d.qty) as qty, SUM(d.total) as revenue
    FROM so_details d
    JOIN products p ON p.id = d.product_id
    JOIN sales_orders so ON so.id = d.so_id
    WHERE so.status != 'CANCELLED'
    GROUP BY p.name ORDER BY revenue DESC LIMIT 5`);
  res.json(r.rows.map(x=>({ name:x.name, qty:parseFloat(x.qty), revenue:parseFloat(x.revenue) })));
});

router.get('/top-customers', rbac(...SALES_VIEWERS), async (req,res)=>{
  const r = await pool.query(`
    SELECT c.name, SUM(so.total) as total
    FROM sales_orders so JOIN customers c ON c.id = so.customer_id
    WHERE so.status != 'CANCELLED'
    GROUP BY c.name ORDER BY total DESC LIMIT 5`);
  res.json(r.rows.map(x=>({ name:x.name, total:parseFloat(x.total) })));
});

router.get('/profit-margin', rbac(...SALES_VIEWERS), async (req,res)=>{
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
// Bentuk item: { kind, count, title, desc, to, label } - title/desc dipakai UI baru,
// label dipertahankan untuk pemakai lama.
router.get('/my-notifications', async (req,res)=>{
  const roles = (req.user?.roles||[]).map(r=>String(r).toLowerCase());
  const has = (...rs)=> roles.length===0 || roles.includes('direktur') || roles.includes('super_admin') || rs.some(r=>roles.includes(r));
  const out = [];
  const push = (kind, count, title, desc, to)=>{
    const n = parseInt(count||0);
    if(n>0) out.push({ kind, count:n, title, desc, to, label:`${title} - ${desc}` });
  };
  try{
    if(has('warehouse','purchasing')){
      const c=await pool.query("SELECT COUNT(*)::int n FROM stocks s JOIN products p ON p.id=s.product_id WHERE s.qty_available <= p.reorder_point");
      push('stock', c.rows[0].n, 'Stok kritis', `${c.rows[0].n} SKU di bawah reorder point`, '/inventory/stocks');
    }
    if(has('finance','sales')){
      const c=await pool.query("SELECT COUNT(*)::int n FROM invoices WHERE status='OVERDUE'");
      push('invoice', c.rows[0].n, 'Invoice jatuh tempo', `${c.rows[0].n} invoice lewat jatuh tempo`, '/sales/invoices');
    }
    if(has('purchasing','warehouse','finance')){
      const c=await pool.query("SELECT COUNT(*)::int n FROM purchase_orders WHERE expected_date < $1 AND status IN ('APPROVED','PENDING')",[wibDate(0)]);
      push('po', c.rows[0].n, 'PO terlambat diterima', `${c.rows[0].n} purchase order lewat tanggal terima`, '/purchase/orders');
    }
    if(has('driver','warehouse')){
      // DO belum ada sopir + SO/POS yang belum dibuatkan DO = semua yang bisa diklaim driver
      const c=await pool.query(`SELECT (
          (SELECT COUNT(*) FROM delivery_orders d
            WHERE d.status='IN_TRANSIT' AND d.driver_id IS NULL
              AND NOT EXISTS (SELECT 1 FROM trips t WHERE t.do_id=d.id AND t.status='IN_PROGRESS'))
        + (SELECT COUNT(*) FROM sales_orders so
            WHERE ( (so.so_number NOT LIKE 'SO-POS-%' AND so.status IN ('APPROVED','PICKING'))
                 OR (so.so_number LIKE 'SO-POS-%' AND so.status IN ('COMPLETED','PARTIAL')
                     AND so.delivery_address IS NOT NULL AND BTRIM(so.delivery_address)<>''
                     AND so.so_date >= CURRENT_DATE - INTERVAL '60 days') )
              AND EXISTS (SELECT 1 FROM so_details sd WHERE sd.so_id=so.id)
              AND NOT EXISTS (SELECT 1 FROM delivery_orders d WHERE d.so_id=so.id AND d.status<>'CANCELLED'))
      )::int AS n`);
      push('delivery', c.rows[0].n, 'Pengiriman siap diklaim', `${c.rows[0].n} DO / SO / POS menunggu sopir`, '/driver');
    }
    if(has('sales','finance')){
      const c=await pool.query("SELECT COUNT(*)::int n FROM delivery_orders d WHERE d.status='DELIVERED' AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.do_id=d.id OR i.so_id=d.so_id)");
      push('do_invoice', c.rows[0].n, 'DO siap di-invoice', `${c.rows[0].n} DO sudah diterima, invoice belum dibuat`, '/sales/invoices');
    }
    if(has('sales','warehouse')){
      const c=await pool.query("SELECT COUNT(*)::int n FROM sales_orders so WHERE so.status IN ('APPROVED','PICKING') AND so.so_number NOT LIKE 'SO-POS-%' AND NOT EXISTS (SELECT 1 FROM delivery_orders d WHERE d.so_id=so.id AND d.status<>'CANCELLED')");
      push('so_ready', c.rows[0].n, 'Pesanan siap dikirim', `${c.rows[0].n} SO menunggu dibuatkan DO / diklaim driver`, '/sales/orders');
    }
    if(has('hrd')){
      const c=await pool.query("SELECT COUNT(*)::int n FROM leaves WHERE status='PENDING'");
      push('leave', c.rows[0].n, 'Cuti menunggu persetujuan', `${c.rows[0].n} pengajuan cuti perlu ditinjau`, '/hr');
      // Catatan keterlambatan hari ini (batas masuk 08:00 WIB) untuk HR/admin.
      const lt=await pool.query("SELECT COUNT(*)::int n FROM attendances WHERE date=$1 AND check_in IS NOT NULL AND check_in::time > TIME '08:00'",[wibDate(0)]);
      push('attendance_late', lt.rows[0].n, 'Karyawan terlambat', `${lt.rows[0].n} check-in lewat 08:00 hari ini`, '/hr?tab=keterlambatan');
    }
    if(has('finance','sales','warehouse','purchasing','hrd','project_manager','sales_trading')){
      const c=await pool.query("SELECT COUNT(*)::int n FROM approval_requests WHERE status='PENDING'");
      push('approval', c.rows[0].n, 'Approval menunggu tindakan', `${c.rows[0].n} permintaan menunggu persetujuan`, '/approvals');
    }
  }catch(e){ console.error('[my-notifications]', e.message); }
  res.json(out);
});

export default router;
