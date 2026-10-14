import express from 'express';
import { pool } from '../../config/db.js';

const router = express.Router();

// ========== CREATE TRANSACTION (with offline support) ==========
router.post('/transaction', async (req, res) => {
  try {
    const { items, total, paid_amount, payment_method, shift_id, cashier_id, device_id, offline } = req.body;
    
    if (!items || !total || !paid_amount || !shift_id || !cashier_id) 
      return res.status(400).json({ error: 'Missing required fields' });

    const txn_number = 'TXN-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);

    // Validate stock availability
    for (const item of items) {
      const stock = await pool.query(
        `SELECT qty_on_hand FROM stocks WHERE product_id = $1 LIMIT 1`,
        [item.product_id]
      );
      if (!stock.rows[0] || stock.rows[0].qty_on_hand < item.qty) {
        if (!offline) {
          return res.status(400).json({ 
            error: `Stock unavailable for product ${item.product_id}`,
            available: stock.rows[0]?.qty_on_hand || 0
          });
        }
        // In offline mode, still queue it but flag
      }
    }

    const txn = await pool.query(`
      INSERT INTO pos_transactions 
      (transaction_number, cashier_id, total, paid_amount, payment_method, status, created_at)
      VALUES ($1, $2, $3, $4, $5, 'COMPLETED', NOW())
      RETURNING id
    `, [txn_number, cashier_id, total, paid_amount, payment_method || 'CASH']);

    const txn_id = txn.rows[0].id;

    // Insert items
    for (const item of items) {
      await pool.query(`
        INSERT INTO pos_transaction_items 
        (transaction_id, product_id, qty, unit, price_per_unit, discount_pct, discount_amt)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [txn_id, item.product_id, item.qty, item.unit || 'PCS', item.price_per_unit, 
          item.discount_pct || 0, item.discount_amt || 0]);

      // Deduct stock
      await pool.query(`
        UPDATE stocks SET qty_on_hand = qty_on_hand - $1, last_updated = NOW()
        WHERE product_id = $2
      `, [item.qty, item.product_id]);
    }

    // If offline, add to sync queue
    if (offline) {
      await pool.query(`
        INSERT INTO pos_sync_queue (sync_type, local_record_id, payload, device_id, sync_status)
        VALUES ('TRANSACTION', $1, $2, $3, 'PENDING')
      `, [txn_id, JSON.stringify({ txn_number, items, total, paid_amount, payment_method }), device_id]);
    }

    res.status(201).json({ 
      transaction_id: txn_id, 
      transaction_number: txn_number,
      change: paid_amount - total,
      synced: !offline
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== REQUEST VOID (requires supervisor approval) ==========
router.post('/void-request', async (req, res) => {
  try {
    const { transaction_id, cashier_id, reason, notes } = req.body;
    
    if (!transaction_id || !cashier_id || !reason) 
      return res.status(400).json({ error: 'transaction_id, cashier_id, reason required' });

    const txn = await pool.query(`
      SELECT * FROM pos_transactions WHERE id = $1
    `, [transaction_id]);

    if (!txn.rows[0]) return res.status(404).json({ error: 'Transaction not found' });
    if (txn.rows[0].status === 'VOIDED') 
      return res.status(409).json({ error: 'Already voided' });

    // Check void frequency (fraud alert if >3 voids in 1 hour)
    const voidCount = await pool.query(`
      SELECT COUNT(*) as cnt FROM pos_transaction_voids
      WHERE cashier_id = $1 AND requested_at > now() - INTERVAL '1 hour' AND status IN ('APPROVED', 'PENDING')
    `, [cashier_id]);

    const count = parseInt(voidCount.rows[0].cnt);
    if (count >= 3) {
      await pool.query(`
        INSERT INTO pos_fraud_alerts 
        (alert_type, cashier_id, count, threshold, details, status)
        VALUES ('MULTIPLE_VOIDS', $1, $2, 3, $3, 'ACTIVE')
      `, [cashier_id, count + 1, JSON.stringify({ transaction_id, reason })]);
    }

    const voidReq = await pool.query(`
      INSERT INTO pos_transaction_voids 
      (transaction_id, cashier_id, reason, void_amount, notes, status)
      VALUES ($1, $2, $3, $4, $5, 'PENDING')
      RETURNING id
    `, [transaction_id, cashier_id, reason, txn.rows[0].total, notes]);

    res.status(201).json({ 
      void_request_id: voidReq.rows[0].id,
      transaction_id,
      void_amount: txn.rows[0].total,
      status: 'PENDING_SUPERVISOR_APPROVAL',
      alert_triggered: count >= 3
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== SUPERVISOR APPROVE/REJECT VOID ==========
router.post('/void-approve', async (req, res) => {
  try {
    const { void_request_id, approved, supervisor_id, notes } = req.body;
    
    if (!void_request_id || approved === undefined || !supervisor_id) 
      return res.status(400).json({ error: 'void_request_id, approved, supervisor_id required' });

    const voidReq = await pool.query(`
      SELECT * FROM pos_transaction_voids WHERE id = $1
    `, [void_request_id]);

    if (!voidReq.rows[0]) return res.status(404).json({ error: 'Void request not found' });
    if (voidReq.rows[0].status !== 'PENDING') 
      return res.status(409).json({ error: `Already ${voidReq.rows[0].status}` });

    const status = approved ? 'APPROVED' : 'REJECTED';
    
    // Update void request
    await pool.query(`
      UPDATE pos_transaction_voids 
      SET status = $1, approved_by = $2, approved_at = NOW(), notes = $3
      WHERE id = $4
    `, [status, supervisor_id, notes, void_request_id]);

    if (approved) {
      // Revert transaction
      const v = voidReq.rows[0];
      await pool.query(`
        UPDATE pos_transactions SET status = 'VOIDED' WHERE id = $1
      `, [v.transaction_id]);

      // Restore stock
      const items = await pool.query(`
        SELECT product_id, qty FROM pos_transaction_items WHERE transaction_id = $1
      `, [v.transaction_id]);

      for (const item of items.rows) {
        await pool.query(`
          UPDATE stocks SET qty_on_hand = qty_on_hand + $1 WHERE product_id = $2
        `, [item.qty, item.product_id]);
      }
    }

    res.json({ void_request_id, status, message: `Void ${status}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== REFUND (max 5 minutes, auto-approved for cashier) ==========
router.post('/refund', async (req, res) => {
  try {
    const { transaction_id, transaction_item_id, cashier_id, refund_amount, reason } = req.body;
    
    if (!transaction_id || !cashier_id || !refund_amount) 
      return res.status(400).json({ error: 'Missing required fields' });

    const txn = await pool.query(`
      SELECT created_at FROM pos_transactions WHERE id = $1
    `, [transaction_id]);

    if (!txn.rows[0]) return res.status(404).json({ error: 'Transaction not found' });

    const createdTime = new Date(txn.rows[0].created_at);
    const now = new Date();
    const diffMinutes = (now - createdTime) / (1000 * 60);

    if (diffMinutes > 5) {
      return res.status(403).json({ 
        error: 'Refund window expired (max 5 minutes)',
        transaction_age_minutes: diffMinutes.toFixed(1),
        requires_supervisor: true
      });
    }

    // Create refund record
    const refund = await pool.query(`
      INSERT INTO pos_refunds 
      (transaction_id, transaction_item_id, cashier_id, refund_amount, reason, status)
      VALUES ($1, $2, $3, $4, $5, 'COMPLETED')
      RETURNING id
    `, [transaction_id, transaction_item_id || null, cashier_id, refund_amount, reason]);

    // If item specified, restore stock
    if (transaction_item_id) {
      const item = await pool.query(`
        SELECT product_id, qty FROM pos_transaction_items WHERE id = $1
      `, [transaction_item_id]);

      if (item.rows[0]) {
        await pool.query(`
          UPDATE stocks SET qty_on_hand = qty_on_hand + $1 WHERE product_id = $2
        `, [item.rows[0].qty, item.rows[0].product_id]);
      }
    }

    res.status(201).json({
      refund_id: refund.rows[0].id,
      refund_amount,
      status: 'APPROVED',
      message: 'Refund processed'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== OFFLINE SYNC - Push queue ==========
router.post('/sync', async (req, res) => {
  try {
    const { device_id, batch_id } = req.body;
    if (!device_id) return res.status(400).json({ error: 'device_id required' });

    const queue = await pool.query(`
      SELECT * FROM pos_sync_queue 
      WHERE device_id = $1 AND sync_status IN ('PENDING', 'RETRY')
      ORDER BY created_at ASC
      LIMIT 50
    `, [device_id]);

    let synced = 0, failed = 0;

    for (const record of queue.rows) {
      try {
        // Process based on type
        if (record.sync_type === 'TRANSACTION') {
          const payload = record.payload;
          // Retry creating transaction
          await pool.query(`
            UPDATE pos_transactions SET sync_status = 'SYNCED', synced_at = NOW()
            WHERE id = $1
          `, [record.local_record_id]);
        }

        await pool.query(`
          UPDATE pos_sync_queue SET sync_status = 'SUCCESS', synced_at = NOW()
          WHERE id = $1
        `, [record.id]);
        synced++;
      } catch (e) {
        failed++;
        const retryCount = (record.retry_count || 0) + 1;
        const newStatus = retryCount < 3 ? 'RETRY' : 'FAILED';
        await pool.query(`
          UPDATE pos_sync_queue 
          SET sync_status = $1, retry_count = $2, last_error = $3
          WHERE id = $4
        `, [newStatus, retryCount, e.message, record.id]);
      }
    }

    res.json({ synced, failed, pending: queue.rows.length - synced - failed });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
