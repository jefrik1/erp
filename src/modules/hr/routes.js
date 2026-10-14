import express from 'express';
import { pool } from '../../config/db.js';
import { paginate } from '../../utils/helpers.js';
const router = express.Router();
router.get('/employees', async (req,res)=>{
  const {limit,offset}=paginate(req);
  const s=req.query.search||'';
  let where='WHERE 1=1'; const p=[];
  if(s){ p.push('%'+s+'%'); where+=' AND (name ILIKE $'+p.length+' OR employee_code ILIKE $'+p.length+')'; }
  const cnt=await pool.query('SELECT COUNT(*) FROM employees '+where,p);
  const data=await pool.query('SELECT e.*, b.name as branch_name FROM employees e LEFT JOIN branches b ON b.id=e.branch_id '+where+' ORDER BY e.id DESC LIMIT $'+(p.length+1)+' OFFSET $'+(p.length+2), [...p,limit,offset]);
  res.json({data:data.rows, total:parseInt(cnt.rows[0].count)});
});
router.post('/employees', async (req,res)=>{
  const {employee_code,name,position,department,branch_id,join_date,basic_salary,phone}=req.body;
  const r=await pool.query('INSERT INTO employees (employee_code,name,position,department,branch_id,join_date,basic_salary,phone) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[employee_code,name,position,department,branch_id,join_date,basic_salary,phone]);
  res.json(r.rows[0]);
});
router.get('/attendance', async (req,res)=>{
  const r=await pool.query('SELECT a.*, e.name FROM attendances a JOIN employees e ON e.id=a.employee_id ORDER BY a.date DESC LIMIT 50');
  res.json(r.rows);
});
router.post('/attendance/checkin', async (req,res)=>{
  const {employee_id} = req.body;
  const today=new Date().toISOString().slice(0,10);
  await pool.query("INSERT INTO attendances (employee_id, date, check_in, status) VALUES ($1,$2,NOW(),'PRESENT') ON CONFLICT (employee_id,date) DO UPDATE SET check_in=NOW()",[employee_id, today]);
  res.json({ok:true});
});
router.get('/payrolls', async (req,res)=>{
  const r=await pool.query('SELECT p.*, e.name FROM payrolls p JOIN employees e ON e.id=p.employee_id ORDER BY p.period DESC LIMIT 50');
  res.json(r.rows);
});
router.post('/payrolls/generate', async (req,res)=>{
  const {period} = req.body;
  const emps=await pool.query('SELECT * FROM employees WHERE is_active=true');
  for(const e of emps.rows){
    const basic=parseFloat(e.basic_salary);
    const allowances=basic*0.1;
    const bpjs_emp=basic*0.02;
    const bpjs_comp=basic*0.04;
    const pph21=basic*0.05;
    const net=basic+allowances - bpjs_emp - pph21;
    await pool.query("INSERT INTO payrolls (employee_id, period, basic_salary, allowances, bpjs_employee, bpjs_company, pph21, net_salary, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'DRAFT') ON CONFLICT (employee_id, period) DO UPDATE SET net_salary=$8",[e.id, period, basic, allowances, bpjs_emp, bpjs_comp, pph21, net]);
  }
  res.json({ok:true, period});
});
router.get('/leaves', async (req,res)=>{ const r=await pool.query('SELECT l.*, e.name FROM leaves l JOIN employees e ON e.id=l.employee_id ORDER BY l.id DESC LIMIT 50'); res.json(r.rows); });
router.post('/leaves', async (req,res)=>{
  const {employee_id, type, start_date, end_date, reason}=req.body;
  const r=await pool.query('INSERT INTO leaves (employee_id, type, start_date, end_date, reason) VALUES ($1,$2,$3,$4,$5) RETURNING id',[employee_id, type, start_date, end_date, reason]);
  res.json(r.rows[0]);
});
export default router;
