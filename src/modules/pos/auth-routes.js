import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../../config/db.js';
import { getJwtSecret } from '../../middleware/auth.js';

const router = express.Router();

// ========== CASHIER LOGIN (creates shift) ==========
router.post('/cashier-login', async (req, res) => {
  try {
    const { username, password, register_id } = req.body;
    if (!username || !password || !register_id) 
      return res.status(400).json({ error: 'username, password, register_id required' });

    // Verify user exists and has POS_CASHIER role
    const u = await pool.query(`
      SELECT u.*, array_agg(r.name) as roles 
      FROM users u 
      LEFT JOIN user_roles ur ON ur.user_id = u.id 
      LEFT JOIN roles r ON r.id = ur.role_id 
      WHERE u.username = $1 AND u.is_active = true 
      GROUP BY u.id
    `, [username]);

    if (u.rows.length === 0) 
      return res.status(401).json({ error: 'User not found' });

    const user = u.rows[0];
    const roles = (user.roles || []).filter(Boolean);
    
    // Check if user has POS role
    if (!roles.some(r => r.includes('POS'))) 
      return res.status(403).json({ error: 'User not authorized for POS' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) 
      return res.status(401).json({ error: 'Wrong password' });

    // Check if already have active shift on other register
    const activeShift = await pool.query(`
      SELECT id FROM pos_cashier_shifts 
      WHERE cashier_id = $1 AND status = 'OPEN' AND register_id != $2
    `, [user.id, register_id]);

    if (activeShift.rows.length > 0) 
      return res.status(409).json({ error: `Already logged in on register ${activeShift.rows[0].register_id}` });

    // Check if already logged in TODAY on same register
    const todayShift = await pool.query(`
      SELECT id, status FROM pos_cashier_shifts 
      WHERE cashier_id = $1 AND register_id = $2 AND shift_date = CURRENT_DATE
      ORDER BY id DESC LIMIT 1
    `, [user.id, register_id]);

    let shiftId;
    if (todayShift.rows.length > 0 && todayShift.rows[0].status === 'OPEN') {
      shiftId = todayShift.rows[0].id;
    } else {
      // Create new shift
      const shift = await pool.query(`
        INSERT INTO pos_cashier_shifts (cashier_id, register_id, shift_date, login_time, opening_cash)
        VALUES ($1, $2, CURRENT_DATE, now(), 0)
        RETURNING id
      `, [user.id, register_id]);
      shiftId = shift.rows[0].id;
    }

    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    
    const payload = { id: user.id, username: user.username, roles, shift_id: shiftId, register_id };
    const token = jwt.sign(payload, getJwtSecret(), { expiresIn: '12h' });

    res.json({ 
      token, 
      shift_id: shiftId,
      user: { id: user.id, username: user.username, email: user.email, roles }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== CASHIER LOGOUT (close shift, trigger reconciliation) ==========
router.post('/cashier-logout', async (req, res) => {
  try {
    const { shift_id } = req.body;
    if (!shift_id) return res.status(400).json({ error: 'shift_id required' });

    const shift = await pool.query(`
      SELECT * FROM pos_cashier_shifts WHERE id = $1
    `, [shift_id]);

    if (!shift.rows[0]) return res.status(404).json({ error: 'Shift not found' });
    if (shift.rows[0].status !== 'OPEN') 
      return res.status(409).json({ error: `Shift already ${shift.rows[0].status}` });

    // Calculate expected closing cash
    const txns = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN payment_method='CASH' THEN paid_amount ELSE 0 END), 0) as cash_received,
        COALESCE(SUM(CASE WHEN status='REFUNDED' THEN -paid_amount ELSE 0 END), 0) as refunds
      FROM pos_transactions 
      WHERE cashier_id = $1 AND created_at >= $2 AND created_at < $2 + INTERVAL '1 day'
    `, [shift.rows[0].cashier_id, shift.rows[0].shift_date]);

    const cashReceived = parseFloat(txns.rows[0].cash_received);
    const refunds = parseFloat(txns.rows[0].refunds);
    const expectedClosing = shift.rows[0].opening_cash + cashReceived + refunds;

    // Update shift to RECONCILING
    await pool.query(`
      UPDATE pos_cashier_shifts 
      SET logout_time = now(), status = 'RECONCILING', expected_closing = $1
      WHERE id = $2
    `, [expectedClosing, shift_id]);

    res.json({
      shift_id,
      opening_cash: shift.rows[0].opening_cash,
      expected_closing: expectedClosing,
      message: 'Please count cash and submit reconciliation'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== SUBMIT RECONCILIATION ==========
router.post('/reconciliation-submit', async (req, res) => {
  try {
    const { shift_id, actual_cash, notes } = req.body;
    if (!shift_id || actual_cash === undefined) 
      return res.status(400).json({ error: 'shift_id, actual_cash required' });

    const shift = await pool.query(`
      SELECT * FROM pos_cashier_shifts WHERE id = $1
    `, [shift_id]);

    if (!shift.rows[0]) return res.status(404).json({ error: 'Shift not found' });
    const s = shift.rows[0];
    
    const variance = actual_cash - s.expected_closing;
    const variancePct = (variance / s.expected_closing * 100).toFixed(2);

    // Flag if variance > 2%
    if (Math.abs(parseFloat(variancePct)) > 2) {
      await pool.query(`
        INSERT INTO pos_fraud_alerts (alert_type, cashier_id, register_id, count, threshold, details, status)
        VALUES ('STOCK_MISMATCH', $1, $2, 1, 2, $3, 'ACTIVE')
      `, [s.cashier_id, s.register_id, JSON.stringify({ 
        shift_id, variance, variancePct, expected: s.expected_closing, actual: actual_cash
      })]);
    }

    // Update shift status
    await pool.query(`
      UPDATE pos_cashier_shifts 
      SET closing_cash = $1, variance = $2, variance_pct = $3, status = 'COMPLETED', notes = $4
      WHERE id = $5
    `, [actual_cash, variance, variancePct, notes, shift_id]);

    res.json({ 
      shift_id,
      variance,
      variance_pct: variancePct,
      status: Math.abs(parseFloat(variancePct)) > 2 ? 'NEEDS_SUPERVISOR_REVIEW' : 'OK'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
