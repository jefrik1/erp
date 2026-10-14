import express from 'express';
import { pool } from '../../config/db.js';
const router = express.Router();

// Global search across SO, PO, Projects, Consignments
router.get('/', async (req, res) => {
  try {
    const q = req.query.q || '';
    if (q.length < 2) return res.json([]);

    const search = '%' + q + '%';
    const results = [];

    // Search Sales Orders
    try {
      const so = await pool.query(`
        SELECT 'SO' as type, id, so_number as number, customer_name as name, so_date as date, status
        FROM sales_orders 
        WHERE so_number ILIKE $1 OR CAST(id AS TEXT) ILIKE $1
        LIMIT 5
      `, [search]);
      results.push(...so.rows.map(r => ({ ...r, url: `/sales/orders/detail/${r.id}` })));
    } catch (e) { console.error('SO search error:', e.message); }

    // Search Purchase Orders
    try {
      const po = await pool.query(`
        SELECT 'PO' as type, id, po_number as number, supplier_name as name, po_date as date, status
        FROM purchase_orders 
        WHERE po_number ILIKE $1 OR CAST(id AS TEXT) ILIKE $1
        LIMIT 5
      `, [search]);
      results.push(...po.rows.map(r => ({ ...r, url: `/purchase/orders/${r.id}` })));
    } catch (e) { console.error('PO search error:', e.message); }

    // Search Projects
    try {
      const proj = await pool.query(`
        SELECT 'PROJECT' as type, id, project_code as number, project_name as name, start_date as date, status
        FROM projects 
        WHERE project_code ILIKE $1 OR project_name ILIKE $1
        LIMIT 5
      `, [search]);
      results.push(...proj.rows.map(r => ({ ...r, url: `/projects/${r.id}` })));
    } catch (e) { console.error('Project search error:', e.message); }

    // Search Consignments
    try {
      const cons = await pool.query(`
        SELECT 'CONSIGNMENT' as type, id, consignment_code as number, supplier_name as name, consignment_date as date, status
        FROM consignments 
        WHERE consignment_code ILIKE $1 OR supplier_name ILIKE $1
        LIMIT 5
      `, [search]);
      results.push(...cons.rows.map(r => ({ ...r, url: `/consignments/${r.id}` })));
    } catch (e) { console.error('Consignment search error:', e.message); }

    // Search Products
    try {
      const prod = await pool.query(`
        SELECT 'PRODUCT' as type, id, sku as number, name as name, NULL as date, NULL as status
        FROM products 
        WHERE sku ILIKE $1 OR name ILIKE $1
        LIMIT 5
      `, [search]);
      results.push(...prod.rows.map(r => ({ ...r, url: `/master/products` })));
    } catch (e) { console.error('Product search error:', e.message); }

    // Search Customers
    try {
      const cust = await pool.query(`
        SELECT 'CUSTOMER' as type, id, code as number, name as name, NULL as date, NULL as status
        FROM customers 
        WHERE code ILIKE $1 OR name ILIKE $1
        LIMIT 5
      `, [search]);
      results.push(...cust.rows.map(r => ({ ...r, url: `/master/customers` })));
    } catch (e) { console.error('Customer search error:', e.message); }

    res.json(results.slice(0, 15));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
