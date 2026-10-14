import express from 'express';
import { pool } from '../../config/db.js';
const router = express.Router();

// ========== MASTER BESI ==========
// GET: List master besi dengan spesifikasi
router.get('/products', async (req, res) => {
  try {
    const search = req.query.search || '';
    const type = req.query.type || '';
    let where = 'WHERE 1=1';
    const params = [];
    
    if (search) {
      params.push('%' + search + '%');
      where += ` AND (p.sku ILIKE $${params.length} OR p.name_id ILIKE $${params.length})`;
    }
    if (type) {
      params.push(type);
      where += ` AND ss.steel_type = $${params.length}`;
    }
    
    const data = await pool.query(`
      SELECT p.id, p.sku, p.name_id, ss.steel_type, ss.diameter_mm, ss.grade, ss.sni_mark, 
             ss.theoretical_weight_per_bar, ss.weight_per_meter_kg,
             (SELECT price_per_kg FROM steel_price_history 
              WHERE product_id = p.id AND price_type='SELL' 
              AND effective_from <= CURRENT_DATE 
              AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
              ORDER BY effective_from DESC LIMIT 1) as current_price_per_kg
      FROM products p
      LEFT JOIN product_steel_specs ss ON ss.product_id = p.id
      ${where}
      ORDER BY p.sku
      LIMIT 100
    `, params);
    
    res.json(data.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET: Detail produk besi (spek + konversi)
router.get('/products/:id', async (req, res) => {
  try {
    const prod = await pool.query(`
      SELECT p.*, ss.*, 
             (SELECT json_agg(json_build_object('from_unit', from_unit, 'to_unit', to_unit, 'factor', factor))
              FROM product_steel_conversions WHERE product_id = p.id) as conversions
      FROM products p
      LEFT JOIN product_steel_specs ss ON ss.product_id = p.id
      WHERE p.id = $1
    `, [req.params.id]);
    
    if (!prod.rows[0]) return res.status(404).json({ error: 'Produk tidak ditemukan' });
    res.json(prod.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST: Buat master besi baru
router.post('/products', async (req, res) => {
  try {
    const { sku, name_id, category_id, steel_type, diameter_mm, dimension_2_mm, grade, sni_mark, weight_per_meter_kg, mill_origin } = req.body;
    
    // Insert product
    const prod = await pool.query(`
      INSERT INTO products (category_id, sku, name_id, base_unit_id, is_active)
      SELECT $1, $2, $3, (SELECT id FROM units WHERE code='BTG'), true
      RETURNING id
    `, [category_id, sku, name_id]);
    
    const product_id = prod.rows[0].id;
    
    // Insert steel specs
    await pool.query(`
      INSERT INTO product_steel_specs 
      (product_id, steel_type, diameter_mm, dimension_2_mm, weight_per_meter_kg, grade, sni_mark, mill_origin)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [product_id, steel_type, diameter_mm, dimension_2_mm, weight_per_meter_kg, grade, sni_mark || false, mill_origin]);
    
    // Insert konversi dasar (batang ke kg)
    const berat_per_batang = (weight_per_meter_kg * 12).toFixed(3);
    await pool.query(`
      INSERT INTO product_steel_conversions (product_id, from_unit, to_unit, factor, is_primary)
      VALUES ($1, 'BTG', 'KG', $2, true)
    `, [product_id, berat_per_batang]);
    
    await pool.query(`
      INSERT INTO product_steel_conversions (product_id, from_unit, to_unit, factor, is_primary)
      VALUES ($1, 'KG', 'BTG', $2, false)
    `, [product_id, (1 / berat_per_batang).toFixed(6)]);
    
    res.status(201).json({ id: product_id, sku });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== HARGA DINAMIS ==========
// GET: Harga current produk besi
router.get('/prices/:product_id', async (req, res) => {
  try {
    const data = await pool.query(`
      SELECT * FROM steel_price_history
      WHERE product_id = $1 
      AND effective_from <= CURRENT_DATE 
      AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
      ORDER BY effective_from DESC
      LIMIT 5
    `, [req.params.product_id]);
    
    res.json(data.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST: Update/set harga baru
router.post('/prices', async (req, res) => {
  try {
    const { product_id, price_type, price_per_kg, price_per_bar, effective_from, effective_to } = req.body;
    
    // End previous price
    await pool.query(`
      UPDATE steel_price_history 
      SET effective_to = CURRENT_DATE - INTERVAL '1 day'
      WHERE product_id = $1 AND price_type = $2 AND effective_to IS NULL
    `, [product_id, price_type]);
    
    // Insert new price
    const ins = await pool.query(`
      INSERT INTO steel_price_history 
      (product_id, price_type, price_per_kg, price_per_bar, effective_from, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [product_id, price_type, price_per_kg, price_per_bar, effective_from || 'CURRENT_DATE', req.user?.id || 1]);
    
    res.status(201).json({ id: ins.rows[0].id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== REMNANT INVENTORY ==========
// GET: List remnant
router.get('/remnants', async (req, res) => {
  try {
    const status = req.query.status || 'AVAILABLE';
    const data = await pool.query(`
      SELECT r.*, p.sku, p.name_id, w.name as warehouse_name, w.code as warehouse_code
      FROM remnants r
      JOIN products p ON p.id = r.parent_product_id
      LEFT JOIN warehouses w ON w.id = r.warehouse_id
      WHERE r.status = $1
      ORDER BY r.created_date DESC
      LIMIT 100
    `, [status]);
    
    res.json(data.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST: Create remnant manual (kalau sisa proyek atau split)
router.post('/remnants', async (req, res) => {
  try {
    const { parent_product_id, length_mm, weight_kg, condition, warehouse_id, bin_id, source_type, notes } = req.body;
    
    const code = 'REM-' + Date.now();
    const ins = await pool.query(`
      INSERT INTO remnants 
      (remnant_code, parent_product_id, length_mm, weight_kg, condition, warehouse_id, bin_id, source_type, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, remnant_code
    `, [code, parent_product_id, length_mm, weight_kg, condition || 'NEW', warehouse_id, bin_id, source_type || 'SPLIT', notes]);
    
    // Log movement
    await pool.query(`
      INSERT INTO remnant_movements (remnant_id, movement_type, reference_type, qty_change, created_by)
      VALUES ($1, 'CREATED', 'MANUAL', $2, $3)
    `, [ins.rows[0].id, weight_kg, req.user?.id || 1]);
    
    res.status(201).json(ins.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH: Update remnant status (sell, scrap)
router.patch('/remnants/:id', async (req, res) => {
  try {
    const { status, notes } = req.body;
    
    await pool.query(`
      UPDATE remnants SET status = $1 WHERE id = $2
    `, [status, req.params.id]);
    
    await pool.query(`
      INSERT INTO remnant_movements (remnant_id, movement_type, created_by, notes)
      VALUES ($1, $2, $3, $4)
    `, [req.params.id, status, req.user?.id || 1, notes]);
    
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== UNIT CONVERSION HELPER ==========
// GET: Convert quantity antar satuan
router.get('/convert', async (req, res) => {
  try {
    const { product_id, from_unit, to_unit, qty } = req.query;
    
    const conv = await pool.query(`
      SELECT factor FROM product_steel_conversions
      WHERE product_id = $1 AND from_unit = $2 AND to_unit = $3
    `, [product_id, from_unit, to_unit]);
    
    if (!conv.rows[0]) {
      return res.status(404).json({ error: 'Konversi tidak ditemukan' });
    }
    
    const result = parseFloat(qty) * parseFloat(conv.rows[0].factor);
    res.json({ 
      from: { qty: parseFloat(qty), unit: from_unit },
      to: { qty: result.toFixed(3), unit: to_unit },
      factor: conv.rows[0].factor
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== CUTTING SERVICE (minimal v1) ==========
// POST: Create cutting order dari SO
router.post('/cutting-orders', async (req, res) => {
  try {
    const { so_id, so_detail_id, product_id, qty_source_bars, items } = req.body;
    // items: [{cut_length_mm, qty_pcs}, ...]
    
    const co_num = 'CO-' + Date.now();
    const cutting = await pool.query(`
      INSERT INTO cutting_orders 
      (cutting_number, so_id, so_detail_id, product_id, qty_source_bars, source_length_mm, status, created_by)
      VALUES ($1, $2, $3, $4, $5, 12000, 'PENDING', $6)
      RETURNING id
    `, [co_num, so_id, so_detail_id, product_id, qty_source_bars, req.user?.id || 1]);
    
    const co_id = cutting.rows[0].id;
    
    // Insert cutting items
    let total_cut = 0;
    for (let i = 0; i < items.length; i++) {
      await pool.query(`
        INSERT INTO cutting_order_items (cutting_order_id, cut_length_mm, qty_pcs, sequence_no)
        VALUES ($1, $2, $3, $4)
      `, [co_id, items[i].cut_length_mm, items[i].qty_pcs, i + 1]);
      total_cut += items[i].cut_length_mm * items[i].qty_pcs;
    }
    
    // Estimate remnant
    const total_source = 12000 * qty_source_bars;
    const remnant = total_source - total_cut;
    
    await pool.query(`
      UPDATE cutting_orders SET total_cut_length_mm = $1, total_remnant_length_mm = $2 WHERE id = $3
    `, [total_cut, remnant, co_id]);
    
    res.status(201).json({ id: co_id, cutting_number: co_num, total_cut, remnant });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET: List cutting orders
router.get('/cutting-orders', async (req, res) => {
  try {
    const status = req.query.status || 'PENDING';
    const data = await pool.query(`
      SELECT co.*, p.sku, p.name_id
      FROM cutting_orders co
      JOIN products p ON p.id = co.product_id
      WHERE co.status = $1
      ORDER BY co.created_at DESC
      LIMIT 50
    `, [status]);
    
    res.json(data.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
