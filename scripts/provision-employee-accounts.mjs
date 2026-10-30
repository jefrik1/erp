#!/usr/bin/env node
// Provision akun login untuk SEMUA karyawan & driver yang belum punya akun.
// Idempoten: akun yang sudah ada tidak pernah diubah / password-nya tidak direset.
// Password acak hanya ditulis ke file kredensial DI LUAR repo; tidak pernah di-print ke log.
//
// Pakai:
//   node scripts/provision-employee-accounts.mjs                 # buat akun yang belum ada
//   node scripts/provision-employee-accounts.mjs --dry-run       # hanya laporan
//   CREDENTIALS_OUT=/path/aman.csv node scripts/...              # lokasi file kredensial
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import dotenv from 'dotenv';
import pg from 'pg';
import { createEmployeeAccount, ensureRoleId, roleForEmployee, usernameFrom } from '../src/modules/hr/employeeAccounts.js';

dotenv.config();
const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const outArg = [...args].find(a=>a.startsWith('--out='));
const OUT_DIR = process.env.CREDENTIALS_DIR
  || path.join(os.homedir(), 'erp-credentials');
const OUT_FILE = outArg ? outArg.slice(6) : path.join(OUT_DIR, 'employee-credentials-'+new Date().toISOString().replace(/[:.]/g,'-')+'.csv');

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main(){
  const { rows: employees } = await pool.query(
    `SELECT e.*, d.id AS driver_id,
            (SELECT u.id FROM users u WHERE u.employee_id=e.id ORDER BY u.id LIMIT 1) AS user_id
       FROM employees e LEFT JOIN drivers d ON d.employee_id=e.id
      ORDER BY e.id`);
  const roleCheck = await pool.query("SELECT id FROM roles WHERE lower(name)='employee'");
  if(!roleCheck.rows[0] && !DRY){
    const c = await pool.connect();
    try{ await c.query('BEGIN'); await ensureRoleId(c,'employee'); await c.query('COMMIT'); }
    finally{ c.release(); }
  }

  const created = [];
  const roleAssigned = [];
  const skipped = [];

  for(const emp of employees){
    const isDriver = !!emp.driver_id || /^(driver|supir)$/i.test(String(emp.position||'').trim());
    const mappedRole = roleForEmployee(emp, { isDriver });
    if(emp.user_id){
      // Akun sudah ada: jangan sentuh password. Hanya lengkapi role yang belum ada.
      const has = await pool.query(
        `SELECT r.name FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1`,[emp.user_id]);
      if(!has.rows.length){
        if(!DRY){
          const c = await pool.connect();
          try{
            await c.query('BEGIN');
            const r = await ensureRoleId(c, mappedRole);
            await c.query('INSERT INTO user_roles (user_id,role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[emp.user_id,r.id]);
            await c.query('COMMIT');
          }catch(e){ await c.query('ROLLBACK').catch(()=>{}); throw e; }
          finally{ c.release(); }
        }
        roleAssigned.push({ employee_code: emp.employee_code, name: emp.name, role: mappedRole });
      }
      skipped.push({ employee_code: emp.employee_code, name: emp.name });
      continue;
    }

    if(DRY){
      created.push({ employee_code: emp.employee_code, name: emp.name, position: emp.position,
        username: usernameFrom(emp.name, emp.employee_code), role: mappedRole });
      continue;
    }

    const c = await pool.connect();
    try{
      await c.query('BEGIN');
      const acc = await createEmployeeAccount(c, emp, { role: mappedRole, isDriver });
      await c.query('COMMIT');
      created.push({ employee_code: emp.employee_code, name: emp.name, position: emp.position,
        username: acc.username, role: acc.role, password: acc.password });
    }catch(e){
      await c.query('ROLLBACK').catch(()=>{});
      throw new Error('Gagal membuat akun untuk '+emp.employee_code+': '+e.message);
    }finally{ c.release(); }
  }

  if(created.length && !DRY){
    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true, mode: 0o700 });
    const esc=(v)=>'"'+String(v ?? '').replace(/"/g,'""')+'"';
    const lines=[['employee_code','name','position','role','username','initial_password'].map(esc).join(',')];
    for(const r of created) lines.push([r.employee_code,r.name,r.position,r.role,r.username,r.password].map(esc).join(','));
    fs.writeFileSync(OUT_FILE, lines.join('\r\n')+'\r\n', { mode: 0o600 });
    try{ fs.chmodSync(OUT_FILE, 0o600); fs.chmodSync(path.dirname(OUT_FILE), 0o700); }catch(_e){}
  }

  console.log(JSON.stringify({
    dry_run: DRY,
    employees_total: employees.length,
    accounts_created: created.length,
    accounts_existing: skipped.length,
    roles_filled: roleAssigned.length,
    credentials_file: (created.length && !DRY) ? OUT_FILE : null,
  }, null, 2));
  if(roleAssigned.length) console.log('role dilengkapi:', roleAssigned.map(r=>r.employee_code+'→'+r.role).join(', '));
  await pool.end();
}

main().catch(async e=>{ console.error('PROVISION FAILED:', e.message); await pool.end().catch(()=>{}); process.exit(1); });
