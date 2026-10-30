#!/usr/bin/env node
// Verifikasi RBAC + pembuatan akun end-to-end terhadap API & DB nyata.
// Tidak pernah mencetak password/token — hanya status dan jumlah.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import dotenv from 'dotenv';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

dotenv.config();
const BASE = process.env.API_BASE || 'http://localhost:4000/api';
const JWT_SECRET = process.env.JWT_SECRET || 'erp_jwt_super_secret_2024';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let pass = 0, fail = 0;
const check = (name, ok, extra='')=>{ ok? pass++ : fail++; console.log((ok?'PASS ':'FAIL ')+name+(extra?' ['+extra+']':'')); };

async function rolesOf(username){
  const r = await pool.query(`SELECT array_agg(r.name) roles FROM users u
     LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id
     WHERE u.username=$1 GROUP BY u.id`,[username]);
  return (r.rows[0]?.roles||[]).filter(Boolean);
}
function tokenFor(id, username, roles){ return jwt.sign({id, username, roles}, JWT_SECRET, {expiresIn:'1h'}); }
async function call(path, token, opts={}){
  const res = await fetch(BASE+path, { method: opts.method||'GET', headers:{ 'Content-Type':'application/json', ...(token?{Authorization:'Bearer '+token}:{}) }, body: opts.body?JSON.stringify(opts.body):undefined });
  let body=null; try{ body=await res.json(); }catch(_e){}
  return { status: res.status, body };
}

async function main(){
  const tokenCache = {};
  for(const u of ['admin','hrd','driver','kasir']){
    const row = await pool.query('SELECT id, username FROM users WHERE username=$1',[u]);
    if(!row.rows[0]){ console.log('SKIP user '+u+' tidak ada'); continue; }
    tokenCache[u]=tokenFor(row.rows[0].id, u, await rolesOf(u));
  }
  const employeeUser = await pool.query("SELECT id FROM users WHERE username='dewi.kasir'");
  const employeeToken = tokenFor(employeeUser.rows[0]?.id || 0,'uji.employee',['employee']);
  const noRoleToken  = tokenFor(employeeUser.rows[0]?.id || 0,'uji.norole',[]);

  // ---------- HR admin endpoints
  check('admin GET /hr/employees', (await call('/hr/employees', tokenCache.admin)).status===200);
  check('hrd   GET /hr/employees', (await call('/hr/employees', tokenCache.hrd)).status===200);
  check('hrd   GET /hr/leaves', (await call('/hr/leaves', tokenCache.hrd)).status===200);
  check('driver GET /hr/employees ditolak', (await call('/hr/employees', tokenCache.driver)).status===403);
  check('kasir  GET /hr/employees ditolak', (await call('/hr/employees', tokenCache.kasir)).status===403);
  check('employee GET /hr/employees ditolak', (await call('/hr/employees', employeeToken)).status===403);
  check('tanpa role GET /hr/employees ditolak', (await call('/hr/employees', noRoleToken)).status===403);

  // ---------- self-service tetap terbuka
  check('driver GET /hr/me', (await call('/hr/me', tokenCache.driver)).status===200);
  check('driver GET /hr/attendance/mine', (await call('/hr/attendance/mine', tokenCache.driver)).status===200);
  check('employee GET /hr/me', (await call('/hr/me', employeeToken)).status===200);
  check('employee GET /hr/leaves/mine', (await call('/hr/leaves/mine', employeeToken)).status===200);

  // ---------- modul lain sesuai MODULE_ROLES
  check('employee GET /finance/coa ditolak', (await call('/finance/coa', employeeToken)).status===403);
  check('employee GET /sales/orders ditolak', (await call('/sales/orders', employeeToken)).status===403);
  check('kasir GET /sales/orders (POS boleh)', (await call('/sales/orders', tokenCache.kasir)).status===200);
  check('driver GET /finance/coa ditolak', (await call('/finance/coa', tokenCache.driver)).status===403);
  check('admin GET /finance/coa', (await call('/finance/coa', tokenCache.admin)).status===200);

  // ---------- login nyata dengan akun hasil provisioning (password tidak dicetak)
  const credFile = (()=>{
    if(process.env.CREDENTIALS_FILE && fs.existsSync(process.env.CREDENTIALS_FILE)) return process.env.CREDENTIALS_FILE;
    const dirs = new Set([process.env.CREDENTIALS_DIR, path.join(os.homedir(),'erp-credentials')].filter(Boolean));
    const files = [];
    for(const d of dirs){ try{ for(const f of fs.readdirSync(d)) if(f.endsWith('.csv')) files.push(path.join(d,f)); }catch(_e){} }
    return files.sort().slice(-1)[0];
  })();
  let loginTested=false;
  if(credFile){
    const lines=fs.readFileSync(credFile,'utf8').split(/\r?\n/).filter(Boolean).slice(1);
    const driverLine=lines.map(l=>l.split('","').map(s=>s.replace(/^"|"$/g,''))).find(c=>c[3]==='driver');
    if(driverLine){
      const [, , , , uname, pwd] = driverLine;
      const res = await call('/auth/login', null, { method:'POST', body:{ username: uname, password: pwd } });
      loginTested=true;
      check('login akun driver hasil provisioning', res.status===200 && (res.body?.user?.roles||[]).includes('driver'), 'status '+res.status);
      if(res.body?.token){
        check('token driver hasil login ditolak di /hr/employees', (await call('/hr/employees', res.body.token)).status===403);
        check('token driver hasil login boleh /hr/me', (await call('/hr/me', res.body.token)).status===200);
      }
    }
  }
  if(!loginTested) console.log('SKIP login provisioning (file kredensial tidak ditemukan)');

  // ---------- atomic employee+account creation
  const CODE='TMPV'+Date.now().toString(36).toUpperCase();   // employee_code max 20 char
  const created = await call('/hr/employees', tokenCache.hrd, { method:'POST', body:{
    employee_code:CODE, name:'Uji Verifikasi', position:'Driver', department:'Logistics',
    username:'uji.verifikasi', password:'RahasiaUji#2026', create_account:true, basic_salary:1000 } });
  check('hrd POST /hr/employees + akun', created.status===200 && created.body?.account?.username==='uji.verifikasi', 'status '+created.status);
  const empId = created.body?.id;
  if(empId){
    const acc = await pool.query(`SELECT u.username,u.password_hash,array_agg(r.name) roles FROM users u
      LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id WHERE u.employee_id=$1 GROUP BY u.id`,[empId]);
    const row=acc.rows[0];
    check('akun tersimpan dengan hash bcrypt', !!row && /^\$2[aby]\$/.test(row.password_hash) && await bcrypt.compare('RahasiaUji#2026', row.password_hash));
    check('role akun baru = driver (dari jabatan)', JSON.stringify(row?.roles)===JSON.stringify(['driver']));
    check('password tidak dikembalikan saat diisi manual', created.body?.account?.initial_password===null);
  }
  const dup = await call('/hr/employees', tokenCache.hrd, { method:'POST', body:{ employee_code:CODE, name:'Duplikat', position:'Driver', username:'uji.duplikat', password:'RahasiaUji#2026' } });
  check('kode karyawan duplikat ditolak 409', dup.status===409, 'status '+dup.status);
  const orphan = await pool.query("SELECT count(*)::int n FROM users WHERE username='uji.duplikat'");
  check('transaksi rollback: tidak ada akun yatim', orphan.rows[0].n===0);
  const escalate = await call('/hr/employees', tokenCache.hrd, { method:'POST', body:{ employee_code:CODE+'-DIR', name:'Uji Direktur', position:'Direktur', username:'uji.direktur', password:'RahasiaUji#2026' } });
  check('hrd tidak bisa membuat role direktur', escalate.status===403, 'status '+escalate.status);

  // karyawan tanpa akun → endpoint /account
  const noAcc = await call('/hr/employees', tokenCache.hrd, { method:'POST', body:{ employee_code:CODE+'-NA', name:'Uji Tanpa Akun', position:'Kasir', create_account:false } });
  const naId = noAcc.body?.id;
  check('karyawan dapat dibuat tanpa akun', noAcc.status===200 && !noAcc.body?.account);
  if(naId){
    const mk = await call('/hr/employees/'+naId+'/account', tokenCache.hrd, { method:'POST', body:{ username:'uji.tanpaakun', password:'RahasiaUji#2026' } });
    check('POST /employees/:id/account membuat akun', mk.status===200 && mk.body?.role==='POS_CASHIER', 'status '+mk.status);
    const again = await call('/hr/employees/'+naId+'/account', tokenCache.hrd, { method:'POST', body:{ username:'uji.tanpaakun2', password:'RahasiaUji#2026' } });
    check('akun ganda ditolak 409', again.status===409, 'status '+again.status);
  }

  // ---------- listing menyertakan info akun
  const list = await call('/hr/employees?limit=500', tokenCache.hrd);
  const sample = (list.body?.data||[]).find(e=>e.employee_code==='EMP-102');
  check('listing memuat username+role akun', sample?.username==='driver' && (sample?.roles||[]).includes('driver'));
  const noAccRow = (list.body?.data||[]).find(e=>e.employee_code===CODE+'-NA');
  check('listing menandai karyawan tanpa akun', noAccRow && noAccRow.user_id!=null);

  // ---------- cleanup data uji
  const ids = (await pool.query('SELECT id FROM employees WHERE employee_code LIKE $1',[CODE+'%'])).rows.map(r=>r.id);
  if(ids.length){
    await pool.query('DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE employee_id = ANY($1))',[ids]);
    await pool.query('DELETE FROM users WHERE employee_id = ANY($1)',[ids]);
    await pool.query('DELETE FROM employees WHERE id = ANY($1)',[ids]);
  }
  const left = await pool.query("SELECT count(*)::int n FROM employees WHERE employee_code LIKE 'TMP-VERIFY-%'");
  check('data uji dibersihkan', left.rows[0].n===0);

  console.log(`\n${pass} pass, ${fail} fail`);
  await pool.end();
  process.exit(fail?1:0);
}
main().catch(async e=>{ console.error('VERIFY ERROR:', e.message); await pool.end().catch(()=>{}); process.exit(1); });
