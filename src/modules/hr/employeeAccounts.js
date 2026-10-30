import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { roleForPosition } from '../../config/employeeRoles.js';

// Role yang boleh diberikan lewat UI HR. Direktur/super_admin TIDAK pernah
// diberikan otomatis dari jabatan supaya akun baru tidak bisa naik hak akses.
export const ASSIGNABLE_ROLES = new Set([
  'employee','driver','hrd','finance','sales','warehouse','purchasing','auditor',
  'sales_trading','project_manager','site_engineer','buyer_admin',
  'POS_CASHIER','POS_SUPERVISOR','POS_MANAGER',
]);
// Role yang dikenal sistem (termasuk tingkat admin yang hanya boleh diberikan direktur).
export const KNOWN_ROLES = new Set([...ASSIGNABLE_ROLES,'direktur','super_admin']);
export const isAdminRole = (name)=> ['direktur','super_admin'].includes(String(name||'').toLowerCase());

export function normalizeRole(name){
  const raw=String(name||'').trim();
  if(!raw) return 'employee';
  const hit=[...KNOWN_ROLES].find(r=>r.toLowerCase()===raw.toLowerCase());
  return hit || 'employee';
}

export function roleForEmployee(employee, {isDriver=false}={}){
  if(isDriver) return 'driver';
  const mapped=roleForPosition(employee?.position);
  return normalizeRole(mapped);
}

// budi.santoso — huruf kecil, titik sebagai pemisah, fallback ke kode karyawan.
export function usernameFrom(name, employeeCode=''){
  const clean=(s)=>String(s||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'.').replace(/^\.+|\.+$/g,'');
  let base=clean(name);
  if(base.length<3) base=clean(employeeCode);
  return (base||'user').slice(0,40).replace(/\.+$/,'');
}

const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export function generatePassword(len=16){
  // Pastikan tiap kelas karakter ada, sisanya acak kriptografis.
  const pick=(set)=>set[crypto.randomInt(set.length)];
  const chars=[pick('ABCDEFGHJKLMNPQRSTUVWXYZ'),pick('abcdefghijkmnopqrstuvwxyz'),pick('23456789'),pick('!@#$%*-_+=?')];
  while(chars.length<len) chars.push(pick(ALPHABET));
  for(let i=chars.length-1;i>0;i--){ const j=crypto.randomInt(i+1); [chars[i],chars[j]]=[chars[j],chars[i]]; }
  return chars.join('');
}

export const hashPassword = (plain)=> bcrypt.hash(plain, 10);

export async function ensureRoleId(client, name){
  const role=normalizeRole(name);
  const found=await client.query('SELECT id FROM roles WHERE lower(name)=lower($1)',[role]);
  if(found.rows[0]) return { id: found.rows[0].id, name: role };
  const ins=await client.query(
    'INSERT INTO roles (name,description) VALUES ($1,$2) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id',
    [role, 'Karyawan - self-service: absen, cuti/izin, profil']);
  return { id: ins.rows[0].id, name: role };
}

export async function uniqueUsername(client, wanted){
  let candidate=wanted, n=1;
  for(;;){
    const hit=await client.query('SELECT 1 FROM users WHERE lower(username)=lower($1)',[candidate]);
    if(!hit.rows[0]) return candidate;
    n+=1; candidate=wanted+'.'+n;
    if(n>50) return wanted+'.'+crypto.randomInt(1000,9999);
  }
}

/**
 * Buat SATU akun untuk satu karyawan di dalam transaksi milik pemanggil.
 * Tidak pernah menyentuh akun yang sudah ada (password lama tidak direset).
 */
export async function createEmployeeAccount(client, employee, {
  username, password, role, email=null, isDriver=false,
}={}){
  if(!employee?.id) throw Object.assign(new Error('Karyawan tidak valid'),{status:400});
  const existing=await client.query('SELECT id FROM users WHERE employee_id=$1',[employee.id]);
  if(existing.rows[0]) return { created:false, userId:existing.rows[0].id };

  const plain = password || generatePassword();
  if(String(plain).length < 8) throw Object.assign(new Error('Password minimal 8 karakter'),{status:400});
  const uname = await uniqueUsername(client, username ? usernameFrom(username) : usernameFrom(employee.name, employee.employee_code));
  const mail = email || (uname+'@erp.local');   // users.email NOT NULL; placeholder internal
  const roleName = normalizeRole(role || roleForEmployee(employee,{isDriver}));
  const hash = await hashPassword(plain);
  const ins = await client.query(
    `INSERT INTO users (employee_id, username, email, password_hash, branch_id, is_active)
     VALUES ($1,$2,$3,$4,$5,true) RETURNING id`,
    [employee.id, uname, mail, hash, employee.branch_id || null]);
  const userId = ins.rows[0].id;
  const r = await ensureRoleId(client, roleName);
  await client.query('INSERT INTO user_roles (user_id,role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[userId, r.id]);
  return { created:true, userId, username: uname, role: r.name, password: plain };
}
