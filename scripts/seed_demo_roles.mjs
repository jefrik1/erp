// Seed akun demo per role: kasir, driver, hrd, purchasing, auditor (idempotent).
import bcrypt from 'bcryptjs';
import { pool } from '../src/config/db.js';

const DEMO = [
  { username:'kasir',      pass:'kasir123',      code:'EMP-101', name:'Siti Rahma',   position:'Kasir',            dept:'Penjualan', roles:['POS_CASHIER'] },
  { username:'driver',     pass:'driver123',     code:'EMP-102', name:'Budi Santoso', position:'Supir',            dept:'Logistik',  roles:['driver'], driverRow:true },
  { username:'hrd',        pass:'hrd123',        code:'EMP-103', name:'Dewi Lestari', position:'HRD Staff',        dept:'HRD',       roles:['hrd'] },
  { username:'purchasing', pass:'purchasing123', code:'EMP-104', name:'Andi Pratama', position:'Purchasing',       dept:'Pembelian', roles:['purchasing'] },
  { username:'auditor',    pass:'auditor123',    code:'EMP-105', name:'Rina Wijaya',  position:'Auditor Internal', dept:'Audit',     roles:['auditor'] },
];

for (const d of DEMO) {
  let emp = await pool.query('SELECT id FROM employees WHERE employee_code=$1',[d.code]);
  let empId = emp.rows[0]?.id;
  if (!empId) {
    const ins = await pool.query("INSERT INTO employees (employee_code,name,position,department,branch_id,join_date,basic_salary,is_active) VALUES ($1,$2,$3,$4,1,CURRENT_DATE,5000000,true) RETURNING id",[d.code,d.name,d.position,d.dept]);
    empId = ins.rows[0].id;
  }
  let u = await pool.query('SELECT id FROM users WHERE username=$1',[d.username]);
  let uid = u.rows[0]?.id;
  if (!uid) {
    const hash = await bcrypt.hash(d.pass, 10);
    const ins = await pool.query('INSERT INTO users (username,email,password_hash,branch_id,employee_id,is_active) VALUES ($1,$2,$3,1,$4,true) RETURNING id',[d.username, d.username+'@erp.local', hash, empId]);
    uid = ins.rows[0].id;
  } else {
    await pool.query('UPDATE users SET employee_id=COALESCE(employee_id,$1) WHERE id=$2',[empId, uid]);
  }
  for (const rn of d.roles) {
    const r = await pool.query('SELECT id FROM roles WHERE name=$1',[rn]);
    if (r.rows[0]) await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[uid, r.rows[0].id]);
    else console.log('  !! role tidak ada:', rn);
  }
  if (d.driverRow) {
    const dr = await pool.query('SELECT id FROM drivers WHERE employee_id=$1',[empId]);
    if (!dr.rows[0]) await pool.query("INSERT INTO drivers (employee_id, sim_number, sim_type, sim_expiry, is_active) VALUES ($1,$2,'B1', CURRENT_DATE + INTERVAL '2 year', true)",[empId, 'SIM-'+d.code]);
  }
  console.log('seeded:', d.username, '-> employee', empId);
}
console.log('SEED DONE');
process.exit(0);
