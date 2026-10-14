import express from 'express';
import { pool } from '../../config/db.js';
const router = express.Router();
router.get('/sales', async (req,res)=>{
  const {start, end, group_by} = req.query;
  let q;
  if(group_by==='product'){
    q=await pool.query("SELECT p.name, SUM(d.qty) as qty, SUM(d.total) as revenue FROM so_details d JOIN products p ON p.id=d.product_id JOIN sales_orders so ON so.id=d.so_id WHERE so.so_date BETWEEN $1 AND $2 GROUP BY p.name ORDER BY revenue DESC",[start||'2024-01-01', end||'2024-12-31']);
  } else if(group_by==='customer'){
    q=await pool.query("SELECT c.name, SUM(so.total) as total FROM sales_orders so JOIN customers c ON c.id=so.customer_id WHERE so.so_date BETWEEN $1 AND $2 GROUP BY c.name ORDER BY total DESC",[start||'2024-01-01', end||'2024-12-31']);
  } else {
    q=await pool.query("SELECT so_date as date, SUM(total) as total FROM sales_orders WHERE so_date BETWEEN $1 AND $2 GROUP BY so_date ORDER BY so_date",[start||'2024-01-01', end||'2024-12-31']);
  }
  res.json(q.rows);
});
router.get('/stock-card', async (req,res)=>{
  const pid=req.query.product_id;
  const r=await pool.query('SELECT m.*, w.name as wh FROM stock_movements m LEFT JOIN warehouses w ON w.id=m.warehouse_id WHERE m.product_id=$1 ORDER BY m.movement_date ASC',[pid]);
  res.json(r.rows);
});
router.get('/aging-ar', async (req,res)=>{
  const r=await pool.query("SELECT c.name, inv.invoice_number, inv.due_date, inv.outstanding, EXTRACT(DAY FROM CURRENT_DATE - inv.due_date) as days_overdue, CASE WHEN CURRENT_DATE - inv.due_date <= 0 THEN 'Current' WHEN CURRENT_DATE - inv.due_date <= 30 THEN '1-30' WHEN CURRENT_DATE - inv.due_date <= 60 THEN '31-60' ELSE '>60' END as bucket FROM invoices inv JOIN customers c ON c.id=inv.customer_id WHERE inv.status != 'PAID' ORDER BY inv.due_date");
  res.json(r.rows);
});
router.get('/margin', async (req,res)=>{
  const r=await pool.query("SELECT p.name, AVG(pu.selling_price) as price, AVG(s.avg_cost) as cost FROM products p LEFT JOIN product_units pu ON pu.product_id=p.id LEFT JOIN stocks s ON s.product_id=p.id GROUP BY p.name");
  res.json(r.rows.map(x=>({name:x.name, price:parseFloat(x.price||0), cost:parseFloat(x.cost||0), margin: parseFloat(x.price||0) - parseFloat(x.cost||0), pct: x.price? ((parseFloat(x.price)-parseFloat(x.cost))/parseFloat(x.price)*100).toFixed(1):0 })));
});
export default router;
