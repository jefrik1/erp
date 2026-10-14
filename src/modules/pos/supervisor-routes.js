import express from 'express';
import { pool } from '../../config/db.js';

const router = express.Router();

// ========== SUPERVISOR: PENDING VOIDS & APPROVALS ==========
router.get('/pending-voids', async (req, res) => {
  try {
    const voids = await pool.query(`
      SELECT 
        pv.*, 
        u_cashier.username as cashier_name,
        pt.transaction_number,
        pt.total
      FROM pos_transaction_voids pv
      JOIN users u_cashier ON u_cashier.id = pv.cashier_id
      JOIN pos_transactions pt ON pt.id = pv.transaction_id
      WHERE pv.status = 'PENDING'
      ORDER BY pv.requested_at DESC
      LIMIT 50
    `);

    res.json(voids.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== SUPERVISOR: PENDING RECONCILIATIONS ==========
router.get('/pending-reconciliations', async (req, res) => {
  try {
    const reconsWithAlerts = await pool.query(`
      SELECT 
        pcs.*,
        u.username as cashier_name,
        COUNT(pfa.id) as alert_count
      FROM pos_cashier_shifts pcs
      JOIN users u ON u.id = pcs.cashier_id
      LEFT JOIN pos_fraud_alerts pfa ON pfa.cashier_id = pcs.cashier_id 
        AND pfa.alert_time > pcs.login_time 
        AND pfa.status = 'ACTIVE'
      WHERE pcs.status IN ('COMPLETED', 'RECONCILING')
      GROUP BY pcs.id, u.username
      ORDER BY pcs.logout_time DESC
      LIMIT 50
    `);

    res.json(reconsWithAlerts.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== SUPERVISOR: APPROVE RECONCILIATION ==========
router.post('/reconciliation-approve', async (req, res) => {
  try {
    const { shift_id, approved, supervisor_id, notes } = req.body;
    
    if (!shift_id || approved === undefined || !supervisor_id)
      return res.status(400).json({ error: 'Missing required fields' });

    const shift = await pool.query(`
      SELECT * FROM pos_cashier_shifts WHERE id = $1
    `, [shift_id]);

    if (!shift.rows[0]) return res.status(404).json({ error: 'Shift not found' });

    const newStatus = approved ? 'APPROVED' : 'COMPLETED';
    
    await pool.query(`
      UPDATE pos_cashier_shifts 
      SET status = $1, reviewed_by = $2, reviewed_at = NOW(), notes = $3
      WHERE id = $4
    `, [newStatus, supervisor_id, notes, shift_id]);

    res.json({ shift_id, status: newStatus });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== SUPERVISOR: ACTIVE FRAUD ALERTS ==========
router.get('/fraud-alerts', async (req, res) => {
  try {
    const alerts = await pool.query(`
      SELECT 
        pfa.*,
        u.username as cashier_name
      FROM pos_fraud_alerts pfa
      LEFT JOIN users u ON u.id = pfa.cashier_id
      WHERE pfa.status = 'ACTIVE'
      ORDER BY pfa.alert_time DESC
      LIMIT 100
    `);

    res.json(alerts.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== SUPERVISOR: RESOLVE FRAUD ALERT ==========
router.post('/fraud-alert-resolve', async (req, res) => {
  try {
    const { alert_id, status, supervisor_id, notes } = req.body;
    
    if (!alert_id || !status || !supervisor_id)
      return res.status(400).json({ error: 'alert_id, status, supervisor_id required' });

    if (!['REVIEWED', 'RESOLVED', 'FALSE_ALARM'].includes(status))
      return res.status(400).json({ error: 'Invalid status' });

    await pool.query(`
      UPDATE pos_fraud_alerts 
      SET status = $1, reviewed_by = $2, reviewed_at = NOW(), notes = $3
      WHERE id = $4
    `, [status, supervisor_id, notes, alert_id]);

    res.json({ alert_id, status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== SUPERVISOR: CASHIER PERFORMANCE (daily) ==========
router.get('/cashier-performance', async (req, res) => {
  try {
    const { date, cashier_id } = req.query;
    const checkDate = date || new Date().toISOString().split('T')[0];
    
    let where = "pcs.shift_date = $1";
    let params = [checkDate];
    
    if (cashier_id) {
      where += " AND pcs.cashier_id = $2";
      params.push(cashier_id);
    }

    const perf = await pool.query(`
      SELECT 
        pcs.cashier_id,
        u.username as cashier_name,
        COUNT(DISTINCT pt.id) as transaction_count,
        COALESCE(SUM(pt.total), 0) as total_sales,
        COALESCE(SUM(CASE WHEN pt.payment_method='CASH' THEN pt.paid_amount ELSE 0 END), 0) as cash_payments,
        COALESCE(SUM(CASE WHEN pt.payment_method='CARD' THEN pt.paid_amount ELSE 0 END), 0) as card_payments,
        COUNT(DISTINCT pv.id) as void_count,
        COALESCE(SUM(pv.void_amount), 0) as void_amount,
        COUNT(DISTINCT prf.id) as refund_count,
        COALESCE(SUM(prf.refund_amount), 0) as refund_amount,
        pcs.variance,
        pcs.variance_pct,
        pcs.status
      FROM pos_cashier_shifts pcs
      JOIN users u ON u.id = pcs.cashier_id
      LEFT JOIN pos_transactions pt ON pt.cashier_id = pcs.cashier_id 
        AND pt.created_at >= pcs.login_time 
        AND pt.created_at < COALESCE(pcs.logout_time, NOW())
      LEFT JOIN pos_transaction_voids pv ON pv.transaction_id = pt.id 
        AND pv.status = 'APPROVED'
      LEFT JOIN pos_refunds prf ON prf.transaction_id = pt.id
      WHERE ${where}
      GROUP BY pcs.id, u.username
      ORDER BY total_sales DESC
    `, params);

    res.json(perf.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
