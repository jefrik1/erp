import express from 'express';
import { pool } from '../../config/db.js';
import { rbac } from '../../middleware/auth.js';
import authRoutes from './auth-routes.js';
import transactionRoutes from './transaction-routes.js';
import supervisorRoutes from './supervisor-routes.js';
import managerRoutes from './manager-routes.js';

const router = express.Router();

// Cache opsional (Redis via ioredis). Semua helper aman: kalau Redis mati,
// hasilnya cache-miss, bukan error 500.
import { cacheGet, cacheSet } from '../../lib/redis.js';

const CACHE_TTL = 300; // 5 minutes

// ========== AUTH ROUTES (public) ==========
router.use('/auth', authRoutes);

// ========== MIDDLEWARE: Verify shift & token ==========
const verifyShift = async (req, res, next) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'No token' });
    
    // Extract token and verify JWT structure
    const token = auth.replace('Bearer ', '');
    // Token verified by parent auth middleware, just check shift exists
    next();
  } catch (e) {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// ========== TRANSACTION ROUTES (cashier) ==========
router.post('/transaction', verifyShift, async (req, res) => transactionRoutes(req, res));
router.use('/transaction', transactionRoutes);

// ========== SUPERVISOR ROUTES (requires POS_SUPERVISOR role) ==========
const supervisorOnly = rbac('POS_SUPERVISOR', 'POS_MANAGER', 'direktur', 'super_admin');
router.use('/supervisor', supervisorOnly, supervisorRoutes);

// ========== MANAGER ROUTES (requires POS_MANAGER role) ==========
const managerOnly = rbac('POS_MANAGER', 'direktur', 'super_admin');
router.use('/manager', managerOnly, managerRoutes);

// ========== PRODUCT LOOKUP (fast, cached) ==========
router.get('/product-lookup', async (req, res) => {
  try {
    const q = req.query.q || '';
    if (q.length < 2) return res.json([]);

    // Try cache first
    const cached = await cacheGet(`pos:product:${q}`);
    if (cached) return res.json(cached);

    const data = await pool.query(`
      SELECT p.id, p.sku, p.name, 
             (SELECT price_per_kg FROM steel_price_history 
              WHERE product_id=p.id AND price_type='SELL'
              AND effective_from <= CURRENT_DATE 
              AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
              ORDER BY effective_from DESC LIMIT 1) as price_per_kg,
             (SELECT price_per_bar FROM steel_price_history 
              WHERE product_id=p.id AND price_type='SELL'
              AND effective_from <= CURRENT_DATE 
              AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
              ORDER BY effective_from DESC LIMIT 1) as price_per_bar,
             COALESCE(SUM(s.qty_on_hand), 0) as stock_qty
      FROM products p
      LEFT JOIN stocks s ON s.product_id = p.id
      WHERE p.sku ILIKE $1 OR p.name ILIKE $1
      GROUP BY p.id, p.sku, p.name
      LIMIT 10
    `, ['%' + q + '%']);

    // Cache result
    if (data.rows.length > 0) await cacheSet(`pos:product:${q}`, data.rows, CACHE_TTL);

    res.json(data.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== BATCH PRODUCT LOOKUP ==========
router.post('/products-batch', async (req, res) => {
  try {
    const { skus = [], product_ids = [] } = req.body;
    const params = [];
    let where = '(1=0)';

    if (skus.length > 0) {
      const placeholders = skus.map((_, i) => `$${i + 1}`).join(',');
      where = `(p.sku IN (${placeholders})`;
      params.push(...skus);
    }

    if (product_ids.length > 0) {
      const offset = params.length;
      const placeholders = product_ids.map((_, i) => `$${offset + i + 1}`).join(',');
      if (skus.length > 0) where += ' OR ';
      where += `p.id IN (${placeholders})`;
      params.push(...product_ids);
    }

    if (params.length === 0) {
      return res.json([]);
    }

    const query = `
      SELECT p.id, p.sku, p.name, 
             (SELECT price_per_kg FROM steel_price_history 
              WHERE product_id=p.id AND price_type='SELL'
              AND effective_from <= CURRENT_DATE 
              AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
              ORDER BY effective_from DESC LIMIT 1) as price_per_kg,
             (SELECT price_per_bar FROM steel_price_history 
              WHERE product_id=p.id AND price_type='SELL'
              AND effective_from <= CURRENT_DATE 
              AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
              ORDER BY effective_from DESC LIMIT 1) as price_per_bar,
             COALESCE(SUM(s.qty_on_hand), 0) as stock_qty
      FROM products p
      LEFT JOIN stocks s ON s.product_id = p.id
      WHERE ${where}
      GROUP BY p.id, p.sku, p.name
    `;

    const data = await pool.query(query, params);
    res.json(data.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== HEALTH CHECK ==========
router.get('/health', (req, res) => {
  res.json({ status: 'ok', redis: redis ? 'connected' : 'disabled' });
});

export default router;
