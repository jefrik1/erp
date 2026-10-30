import express from 'express';
import { pool } from '../../config/db.js';

const router = express.Router();

// ========== MANAGER: DAILY CLOSE REPORT ==========
router.get('/daily-report', async (req, res) => {
  try {
    const { date } = req.query;
    const reportDate = date || new Date().toISOString().split('T')[0];

    // Check if exists
    let report = await pool.query(`
      SELECT * FROM pos_daily_reports WHERE report_date = $1
    `, [reportDate]);

    if (report.rows.length === 0) {
      // Generate new report
      const data = await pool.query(`
        SELECT
          COUNT(DISTINCT pt.id) as total_transactions,
          COALESCE(SUM(pt.total), 0) as total_sales,
          COALESCE(SUM(CASE WHEN pt.payment_method='CASH' THEN pt.paid_amount ELSE 0 END), 0) as cash_payments,
          COALESCE(SUM(CASE WHEN pt.payment_method='CARD' THEN pt.paid_amount ELSE 0 END), 0) as card_payments,
          COALESCE(SUM(CASE WHEN pt.payment_method='QRIS' THEN pt.paid_amount ELSE 0 END), 0) as qris_payments,
          COALESCE(SUM(pv.void_amount), 0) as void_amount,
          COUNT(DISTINCT pv.id) as void_count,
          COALESCE(SUM(prf.refund_amount), 0) as refund_amount,
          COUNT(DISTINCT prf.id) as refund_count,
          COALESCE(SUM(pti.discount_amt), 0) as discount_amount,
          COUNT(DISTINCT pfa.id) as alert_count,
          COALESCE(SUM(pcs.variance), 0) as total_variance
        FROM pos_transactions pt
        WHERE DATE(pt.created_at) = $1
        LEFT JOIN pos_transaction_voids pv ON pv.transaction_id = pt.id AND pv.status = 'APPROVED'
        LEFT JOIN pos_refunds prf ON prf.transaction_id = pt.id
        LEFT JOIN pos_transaction_items pti ON pti.transaction_id = pt.id
        LEFT JOIN pos_fraud_alerts pfa ON DATE(pfa.alert_time) = $1 AND pfa.status = 'ACTIVE'
        LEFT JOIN pos_cashier_shifts pcs ON DATE(pcs.shift_date) = $1
      `, [reportDate]);

      const d = data.rows[0];
      const net_sales = d.total_sales - d.void_amount - d.refund_amount;

      const inserted = await pool.query(`
        INSERT INTO pos_daily_reports 
        (report_date, total_transactions, total_sales, total_cash_payments, total_card_payments, 
         total_voids, total_refunds, total_discounts, num_alerts, generated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING *
      `, [reportDate, d.total_transactions, d.total_sales, d.cash_payments, d.card_payments,
          d.void_amount, d.refund_amount, d.discount_amount, d.alert_count]);

      report = inserted;
    }

    res.json(report.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== MANAGER: SEND DAILY REPORT TO EMAIL ==========
router.post('/daily-report-send', async (req, res) => {
  try {
    const { date, manager_email } = req.body;
    const reportDate = date || new Date().toISOString().split('T')[0];

    const report = await pool.query(`
      SELECT * FROM pos_daily_reports WHERE report_date = $1
    `, [reportDate]);

    if (!report.rows[0]) 
      return res.status(404).json({ error: 'Report not found' });

    // TODO: Integrate email service (SendGrid, etc)
    // For now, just mark as sent
    await pool.query(`
      UPDATE pos_daily_reports SET sent_to_manager = true, sent_at = NOW()
      WHERE report_date = $1
    `, [reportDate]);

    res.json({ 
      message: 'Report marked as sent',
      report_date: reportDate,
      email: manager_email
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== MANAGER: REVENUE SUMMARY (multi-day) ==========
router.get('/revenue-summary', async (req, res) => {
  try {
    const { from, to } = req.query;
    const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = to || new Date().toISOString().split('T')[0];

    const summary = await pool.query(`
      SELECT
        DATE(pt.created_at) as sale_date,
        COUNT(DISTINCT pt.id) as transactions,
        COALESCE(SUM(pt.total), 0) as gross_sales,
        COALESCE(SUM(pv.void_amount), 0) as voids,
        COALESCE(SUM(prf.refund_amount), 0) as refunds,
        COALESCE(SUM(pti.discount_amt), 0) as discounts,
        COALESCE(SUM(pt.total), 0) - COALESCE(SUM(pv.void_amount), 0) - COALESCE(SUM(prf.refund_amount), 0) as net_sales
      FROM pos_transactions pt
      LEFT JOIN pos_transaction_voids pv ON pv.transaction_id = pt.id AND pv.status = 'APPROVED'
      LEFT JOIN pos_refunds prf ON prf.transaction_id = pt.id
      LEFT JOIN pos_transaction_items pti ON pti.transaction_id = pt.id
      WHERE DATE(pt.created_at) BETWEEN $1 AND $2
      GROUP BY DATE(pt.created_at)
      ORDER BY sale_date DESC
    `, [fromDate, toDate]);

    res.json(summary.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== MANAGER: CASHIER MONTHLY PERFORMANCE ==========
router.get('/cashier-monthly', async (req, res) => {
  try {
    const perf = await pool.query(`
      SELECT
        u.id,
        u.username as cashier_name,
        COUNT(DISTINCT pt.id) as transactions,
        COALESCE(SUM(pt.total), 0) as total_sales,
        COUNT(DISTINCT pv.id) as void_count,
        COALESCE(SUM(pv.void_amount), 0) as void_amount,
        COUNT(DISTINCT prf.id) as refund_count,
        COALESCE(SUM(prf.refund_amount), 0) as refund_amount,
        AVG(ABS(pcs.variance_pct)) as avg_variance_pct,
        COUNT(DISTINCT pfa.id) as alert_count,
        COUNT(DISTINCT pcs.id) as shifts_worked
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      JOIN roles r ON r.id = ur.role_id AND r.name = 'POS_CASHIER'
      LEFT JOIN pos_transactions pt ON pt.cashier_id = u.id AND MONTH(pt.created_at) = MONTH(NOW())
      LEFT JOIN pos_transaction_voids pv ON pv.transaction_id = pt.id AND pv.status = 'APPROVED'
      LEFT JOIN pos_refunds prf ON prf.transaction_id = pt.id
      LEFT JOIN pos_fraud_alerts pfa ON pfa.cashier_id = u.id AND MONTH(pfa.alert_time) = MONTH(NOW())
      LEFT JOIN pos_cashier_shifts pcs ON pcs.cashier_id = u.id AND MONTH(pcs.shift_date) = MONTH(NOW())
      WHERE u.is_active = true
      GROUP BY u.id, u.username
      ORDER BY total_sales DESC
    `);

    res.json(perf.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== MANAGER: PRODUCT SALES ANALYSIS ==========
router.get('/product-sales', async (req, res) => {
  try {
    const { from, to, limit } = req.query;
    const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = to || new Date().toISOString().split('T')[0];
    const lim = parseInt(limit) || 50;

    const products = await pool.query(`
      SELECT
        p.id,
        p.sku,
        p.name,
        SUM(pti.qty) as qty_sold,
        SUM(pti.qty * pti.price_per_unit) as total_sales,
        AVG(pti.price_per_unit) as avg_price,
        COUNT(DISTINCT pt.id) as transaction_count
      FROM pos_transaction_items pti
      JOIN pos_transactions pt ON pt.id = pti.transaction_id
      JOIN products p ON p.id = pti.product_id
      WHERE DATE(pt.created_at) BETWEEN $1 AND $2
      GROUP BY p.id, p.sku, p.name
      ORDER BY total_sales DESC
      LIMIT $3
    `, [fromDate, toDate, lim]);

    res.json(products.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== MANAGER: LOW STOCK ALERT ==========
router.get('/low-stock-alert', async (req, res) => {
  try {
    const lowStock = await pool.query(`
      SELECT
        psl.product_id,
        p.sku,
        p.name,
        psl.qty_on_hand,
        psl.min_stock,
        (psl.min_stock - psl.qty_on_hand) as shortage,
        psl.location_name,
        psl.last_updated
      FROM pos_stock_locations psl
      JOIN products p ON p.id = psl.product_id
      WHERE psl.qty_on_hand <= psl.min_stock
      ORDER BY shortage DESC
      LIMIT 50
    `);

    res.json(lowStock.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
