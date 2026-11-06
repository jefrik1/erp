import express from 'express';
import { pool } from '../../config/db.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { rbac } from '../../middleware/auth.js';
import { paginate } from '../../utils/helpers.js';
import { sendReport } from '../../lib/exporters.js';
import { postJournal, ensureCoa, withTx } from '../../lib/journal.js';
import { createEmployeeAccount, ensureRoleId, normalizeRole, isAdminRole, roleForEmployee, usernameFrom } from './employeeAccounts.js';
import { hitungBpjsTK, hitungBpjsKesehatan, hitungPph21, hitungGajiNet } from './payroll-engine.js';
const router = express.Router();

const num = (v)=> parseFloat(v ?? 0) || 0;
const iso = (d)=> d ? String(d).slice(0, 10) : null;
const today = ()=> new Date(Date.now() + 7*3600*1000).toISOString().slice(0, 10); // WIB

// ── Kebijakan absensi (sementara) ──────────────────────────────────────────
// 1) Batas masuk 08:00 WIB. Lewat dari itu TETAP boleh absen, tapi dicatat
//    "terlambat N menit" dan muncul sebagai catatan untuk HR/admin.
// 2) Geofence 200 m dari titik Gudang Pusat (pin peta yang sama dengan
//    src/config/location.js dan ORIGIN surat jalan).
const ATT_POLICY = Object.freeze({
  office: { name: 'Gudang Pusat', lat: -6.8392646, lng: 111.9838451 },
  radius_m: 200,
  cutoff: '08:00',
  cutoff_label: '08:00 WIB',
  timezone: 'WIB',
});

function haversineM(lat1, lng1, lat2, lng2){
  const R=6371000, dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180;
  const s=Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return Math.round(R*2*Math.atan2(Math.sqrt(s), Math.sqrt(1-s)));
}
// Jam dinding WIB "HH:MM:SS" - sumber yang sama dengan (NOW() AT TIME ZONE 'Asia/Jakarta').
function wibClock(){ return new Date(Date.now() + 7*3600*1000).toISOString().slice(11,19); }
function lateInfo(clock){
  const [h,m]=String(clock).split(':').map(Number);
  const [ch,cm]=ATT_POLICY.cutoff.split(':').map(Number);
  const minutes = (h*60+m) - (ch*60+cm);
  return minutes>0 ? { is_late:true, late_minutes:minutes } : { is_late:false, late_minutes:0 };
}

// Kolom geofence + catatan keterlambatan (idempotent, aman dijalankan berulang).
let attColsEnsured=false;
async function ensureAttendanceCols(){
  if(attColsEnsured) return;
  try{
    await pool.query(`ALTER TABLE attendances ADD COLUMN IF NOT EXISTS check_in_lat DECIMAL(10,7)`).catch(()=>{});
    await pool.query(`ALTER TABLE attendances ADD COLUMN IF NOT EXISTS check_in_lng DECIMAL(10,7)`).catch(()=>{});
    await pool.query(`ALTER TABLE attendances ADD COLUMN IF NOT EXISTS check_in_distance_m INT`).catch(()=>{});
    await pool.query(`ALTER TABLE attendances ADD COLUMN IF NOT EXISTS check_in_accuracy_m INT`).catch(()=>{});
    await pool.query(`ALTER TABLE attendances ADD COLUMN IF NOT EXISTS check_out_lat DECIMAL(10,7)`).catch(()=>{});
    await pool.query(`ALTER TABLE attendances ADD COLUMN IF NOT EXISTS check_out_lng DECIMAL(10,7)`).catch(()=>{});
    await pool.query(`ALTER TABLE attendances ADD COLUMN IF NOT EXISTS check_out_distance_m INT`).catch(()=>{});
    await pool.query(`ALTER TABLE attendances ADD COLUMN IF NOT EXISTS is_late BOOLEAN DEFAULT false`).catch(()=>{});
    await pool.query(`ALTER TABLE attendances ADD COLUMN IF NOT EXISTS late_minutes INT DEFAULT 0`).catch(()=>{});
    await pool.query(`ALTER TABLE attendances ADD COLUMN IF NOT EXISTS note TEXT`).catch(()=>{});
    // Backfill data lama: tandai terlambat dari jam check-in yang sudah tersimpan.
    // (Kolom baru punya DEFAULT false, jadi baris lama tidak NULL - cek juga yang
    //  is_late=false tapi jam masuknya lewat 08:00.)
    await pool.query(`UPDATE attendances
        SET is_late = (check_in::time > TIME '08:00'),
            late_minutes = GREATEST(0, (EXTRACT(EPOCH FROM (check_in::time - TIME '08:00'))/60)::int)
      WHERE check_in IS NOT NULL
        AND (is_late IS NULL OR (is_late = false AND check_in::time > TIME '08:00'))`).catch(()=>{});
    attColsEnsured=true;
  }catch(e){ console.error('[ensure attendance cols]', e.message); }
}


// ------------------------------------------------------------------- KARYAWAN
router.get('/employees', rbac('hrd','direktur','super_admin'), async (req,res)=>{
  const {limit,offset}=paginate(req);
  const {search,department,is_active}=req.query;
  let where='WHERE 1=1'; const p=[];
  if(search){ p.push('%'+search+'%'); where+=' AND (e.name ILIKE $'+p.length+' OR e.employee_code ILIKE $'+p.length+' OR e.position ILIKE $'+p.length+')'; }
  if(department && department!=='Semua'){ p.push(department); where+=' AND e.department=$'+p.length; }
  if(is_active==='true' || is_active==='false'){ p.push(is_active==='true'); where+=' AND e.is_active=$'+p.length; }
  try{
    const cnt=await pool.query('SELECT COUNT(*) FROM employees e '+where,p);
    const data=await pool.query(
      `SELECT e.*, b.name AS branch_name,
              (SELECT COUNT(*)::int FROM attendances a WHERE a.employee_id=e.id AND a.date >= CURRENT_DATE - INTERVAL '30 days') AS hadir_30,
              (SELECT COUNT(*)::int FROM leaves l WHERE l.employee_id=e.id AND l.status='PENDING') AS cuti_pending,
              ac.user_id, ac.username, ac.account_active, ac.roles
         FROM employees e LEFT JOIN branches b ON b.id=e.branch_id
         LEFT JOIN LATERAL (
           SELECT u.id AS user_id, u.username, u.is_active AS account_active,
                  COALESCE((SELECT array_agg(DISTINCT r.name) FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id),'{}') AS roles
             FROM users u WHERE u.employee_id=e.id ORDER BY u.id LIMIT 1
         ) ac ON true
         ${where} ORDER BY e.is_active DESC, e.name LIMIT $${p.length+1} OFFSET $${p.length+2}`, [...p,limit,offset]);
    res.json({ data:data.rows.map(x=>({ ...x, basic_salary:num(x.basic_salary) })), total:parseInt(cnt.rows[0].count) });
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.get('/employees/summary', rbac('hrd','direktur','super_admin'), async (_req,res)=>{
  try{
    const r=await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE is_active)::int AS aktif,
              COALESCE(SUM(basic_salary) FILTER (WHERE is_active),0)::float AS total_gaji,
              COALESCE(AVG(basic_salary) FILTER (WHERE is_active),0)::float AS rata_gaji
         FROM employees`);
    const dep=await pool.query('SELECT COALESCE(department,\'-\') AS department, COUNT(*)::int AS n FROM employees WHERE is_active GROUP BY 1 ORDER BY n DESC');
    res.json({ ...r.rows[0], per_department: dep.rows });
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.get('/employees/:id', rbac('hrd','direktur','super_admin'), async (req,res)=>{
  try{
    const r=await pool.query('SELECT e.*, b.name AS branch_name FROM employees e LEFT JOIN branches b ON b.id=e.branch_id WHERE e.id=$1',[req.params.id]);
    if(!r.rows[0]) return res.status(404).json({error:'Karyawan tidak ditemukan'});
    const att=await pool.query('SELECT * FROM attendances WHERE employee_id=$1 ORDER BY date DESC LIMIT 30',[req.params.id]);
    const pay=await pool.query('SELECT * FROM payrolls WHERE employee_id=$1 ORDER BY period DESC LIMIT 12',[req.params.id]);
    const lv=await pool.query('SELECT * FROM leaves WHERE employee_id=$1 ORDER BY id DESC LIMIT 10',[req.params.id]);
    const hadir=await pool.query("SELECT COUNT(*)::int AS n FROM attendances WHERE employee_id=$1 AND date >= date_trunc('month', CURRENT_DATE)",[req.params.id]);
    const acc=await pool.query(
      `SELECT u.id AS user_id, u.username, u.email, u.is_active AS account_active, u.last_login,
              COALESCE((SELECT array_agg(DISTINCT r.name) FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id),'{}') AS roles
         FROM users u WHERE u.employee_id=$1 ORDER BY u.id LIMIT 1`,[req.params.id]);
    res.json({ ...r.rows[0], basic_salary:num(r.rows[0].basic_salary),
      account: acc.rows[0] || null,
      hadir_bulan_ini: hadir.rows[0].n, attendance:att.rows, payrolls:pay.rows, leaves:lv.rows });
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.post('/employees', rbac('hrd','direktur','super_admin'), async (req,res)=>{
  const {employee_code,name,position,department,branch_id,join_date,basic_salary,phone,npwp,bpjs_number,leave_quota,
         create_account, username, password, email, role_name}=req.body||{};
  if(!name || !employee_code) return res.status(400).json({error:'Kode dan nama karyawan wajib diisi'});
  const withAccount = create_account !== false;
  const wantedRole = normalizeRole(role_name || roleForEmployee({position}));
  if(withAccount && isAdminRole(wantedRole) && !(req.user.roles||[]).some(r=>['direktur','super_admin'].includes(String(r).toLowerCase())))
    return res.status(403).json({error:'Role '+wantedRole+' hanya bisa diberikan direktur'});
  if(withAccount && password && String(password).length<8) return res.status(400).json({error:'Password minimal 8 karakter'});

  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const r=await client.query(
      `INSERT INTO employees (employee_code,name,position,department,branch_id,join_date,basic_salary,phone,npwp,bpjs_number,leave_quota)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [employee_code, name, position||null, department||null, branch_id||null, join_date||null,
       num(basic_salary), phone||null, npwp||null, bpjs_number||null, leave_quota!==undefined? parseInt(leave_quota)||0 : 12]);
    const employee=r.rows[0];
    let account=null;
    if(withAccount){
      account = await createEmployeeAccount(client, employee, { username, password, email, role:wantedRole });
      if(!account.created) throw Object.assign(new Error('Karyawan ini sudah punya akun'),{status:409});
    }
    await client.query('COMMIT');
    res.json({ ok:true, id:employee.id,
      account: account && { username:account.username, role:account.role,
        initial_password: password ? null : account.password } });
  }catch(e){
    await client.query('ROLLBACK').catch(()=>{});
    if(e.code==='23505') return res.status(409).json({error:'Kode karyawan atau username sudah dipakai'});
    res.status(e.status||500).json({error:e.message});
  }finally{ client.release(); }
});

// Buat akun untuk karyawan lama yang belum punya akun (idempoten: 409 kalau sudah ada).
router.post('/employees/:id/account', rbac('hrd','direktur','super_admin'), async (req,res)=>{
  const {username, password, email, role_name}=req.body||{};
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const emp=await client.query('SELECT * FROM employees WHERE id=$1',[req.params.id]);
    if(!emp.rows[0]){ await client.query('ROLLBACK'); return res.status(404).json({error:'Karyawan tidak ditemukan'}); }
    const isDriver=(await client.query('SELECT 1 FROM drivers WHERE employee_id=$1 LIMIT 1',[emp.rows[0].id])).rows.length>0;
    const wantedRole = normalizeRole(role_name || roleForEmployee(emp.rows[0], {isDriver}));
    if(isAdminRole(wantedRole) && !(req.user.roles||[]).some(r=>['direktur','super_admin'].includes(String(r).toLowerCase()))){
      await client.query('ROLLBACK');
      return res.status(403).json({error:'Role '+wantedRole+' hanya bisa diberikan direktur'});
    }
    const account = await createEmployeeAccount(client, emp.rows[0], { username, password, email, role:wantedRole, isDriver });
    if(!account.created){ await client.query('ROLLBACK'); return res.status(409).json({error:'Karyawan ini sudah punya akun'}); }
    await client.query('COMMIT');
    res.json({ ok:true, username:account.username, role:account.role,
      initial_password: password ? null : account.password });
  }catch(e){
    await client.query('ROLLBACK').catch(()=>{});
    if(e.code==='23505') return res.status(409).json({error:'Username sudah dipakai'});
    res.status(e.status||500).json({error:e.message});
  }finally{ client.release(); }
});

router.put('/employees/:id', rbac('hrd','direktur','super_admin'), async (req,res)=>{
  const f=['employee_code','name','position','department','branch_id','join_date','basic_salary','phone','npwp','bpjs_number','is_active','leave_quota'];
  const sets=[]; const vals=[]; let i=1;
  const {account_username, account_is_active, role_name}=req.body||{};
  const wantsAccount = account_username!==undefined || account_is_active!==undefined || role_name!==undefined;
  const actorAdmin = (req.user.roles||[]).some(r=>['direktur','super_admin'].includes(String(r).toLowerCase()));
  if(role_name!==undefined && isAdminRole(role_name) && !actorAdmin)
    return res.status(403).json({error:'Role '+role_name+' hanya bisa diberikan direktur'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    for(const k of f) if(req.body[k]!==undefined){ sets.push(k+'=$'+i); vals.push(k==='basic_salary'? num(req.body[k]) : (k==='leave_quota'? (parseInt(req.body[k])||0) : req.body[k])); i++; }
    if(sets.length){
      vals.push(req.params.id);
      await client.query('UPDATE employees SET '+sets.join(',')+' WHERE id=$'+i, vals);
    }
    if(wantsAccount){
      const u=await client.query('SELECT id FROM users WHERE employee_id=$1 ORDER BY id LIMIT 1',[req.params.id]);
      if(!u.rows[0]){ await client.query('ROLLBACK'); return res.status(400).json({error:'Karyawan ini belum punya akun - buat akun dulu'}); }
      const uid=u.rows[0].id;
      if(account_username!==undefined){
        const uname=usernameFrom(account_username||'');
        if(!uname) { await client.query('ROLLBACK'); return res.status(400).json({error:'Username tidak valid'}); }
        await client.query('UPDATE users SET username=$1, updated_at=NOW() WHERE id=$2',[uname,uid]);
      }
      if(account_is_active!==undefined) await client.query('UPDATE users SET is_active=$1, updated_at=NOW() WHERE id=$2',[!!account_is_active,uid]);
      if(role_name!==undefined){
        const r=await ensureRoleId(client, role_name);
        await client.query('DELETE FROM user_roles WHERE user_id=$1',[uid]);
        await client.query('INSERT INTO user_roles (user_id,role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[uid,r.id]);
      }
    }
    if(!sets.length && !wantsAccount){ await client.query('ROLLBACK'); return res.status(400).json({error:'Tidak ada perubahan'}); }
    await client.query('COMMIT');
    res.json({ ok:true });
  }catch(e){
    await client.query('ROLLBACK').catch(()=>{});
    if(e.code==='23505') return res.status(409).json({error:'Kode karyawan atau username sudah dipakai'});
    res.status(500).json({error:e.message});
  }finally{ client.release(); }
});

// ------------------------------------------------------------------- ABSENSI
router.get('/attendance', rbac('hrd','direktur','super_admin'), async (req,res)=>{
  const {limit,offset}=paginate(req);
  const {date,search,status,start,end}=req.query;
  let where='WHERE 1=1'; const p=[];
  if(date){ p.push(date); where+=' AND a.date=$'+p.length; }
  if(start){ p.push(start); where+=' AND a.date >= $'+p.length; }
  if(end){ p.push(end); where+=' AND a.date <= $'+p.length; }
  if(status && status!=='Semua'){ p.push(status); where+=' AND a.status=$'+p.length; }
  if(search){ p.push('%'+search+'%'); where+=' AND (e.name ILIKE $'+p.length+' OR e.employee_code ILIKE $'+p.length+')'; }
  try{
    const cnt=await pool.query('SELECT COUNT(*) FROM attendances a JOIN employees e ON e.id=a.employee_id '+where,p);
    const data=await pool.query(
      `SELECT a.*, e.name, e.employee_code, e.position, e.department,
              CASE WHEN a.check_in IS NOT NULL AND (COALESCE(a.is_late,false) OR a.check_in::time > TIME '08:00') THEN true ELSE false END AS terlambat,
              CASE WHEN a.check_in IS NOT NULL AND a.check_out IS NOT NULL
                   THEN EXTRACT(EPOCH FROM (a.check_out - a.check_in))/3600 ELSE NULL END AS jam_kerja
         FROM attendances a JOIN employees e ON e.id=a.employee_id
         ${where} ORDER BY a.date DESC, e.name LIMIT $${p.length+1} OFFSET $${p.length+2}`, [...p,limit,offset]);
    res.json({ data:data.rows, total:parseInt(cnt.rows[0].count) });
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.get('/attendance/summary', rbac('hrd','direktur','super_admin'), async (req,res)=>{
  const d = req.query.date || today();
  try{
    const r=await pool.query(
      `SELECT COUNT(*)::int AS tercatat,
              COUNT(*) FILTER (WHERE a.check_in IS NOT NULL)::int AS hadir,
              COUNT(*) FILTER (WHERE a.check_in IS NOT NULL AND (COALESCE(a.is_late,false) OR a.check_in::time > TIME '08:00'))::int AS terlambat,
              COUNT(*) FILTER (WHERE a.check_out IS NOT NULL)::int AS sudah_pulang,
              COUNT(*) FILTER (WHERE a.status='ABSENT')::int AS alpha
         FROM attendances a WHERE a.date=$1`, [d]);
    const aktif=await pool.query('SELECT COUNT(*)::int AS n FROM employees WHERE is_active');
    const belum=await pool.query(
      `SELECT e.id, e.employee_code, e.name, e.position FROM employees e
        WHERE e.is_active AND NOT EXISTS (SELECT 1 FROM attendances a WHERE a.employee_id=e.id AND a.date=$1)
        ORDER BY e.name`, [d]);
    res.json({ date:d, total_aktif: aktif.rows[0].n, belum_checkin: belum.rows.length, belum_checkin_list: belum.rows, ...r.rows[0] });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// Laporan keterlambatan (HR & admin): rekap per karyawan + detail harian.
// Sumber sama dengan absensi: batas masuk ATT_POLICY.cutoff (08:00 WIB).
router.get('/attendance/late-report', rbac('hrd','direktur','super_admin'), async (req,res)=>{
  await ensureAttendanceCols();
  const month = /^\d{4}-\d{2}$/.test(String(req.query.month||'')) ? req.query.month : new Date(Date.now()+7*3600*1000).toISOString().slice(0,7);
  const search = String(req.query.search||'').trim();
  const like = '%'+search+'%';
  try{
    const rows = await pool.query(`
      SELECT e.id AS employee_id, e.employee_code, e.name, e.position, e.department,
             COUNT(*)::int AS days_late,
             COALESCE(SUM(a.late_minutes),0)::int AS total_minutes,
             COALESCE(ROUND(AVG(a.late_minutes)),0)::int AS avg_minutes,
             MAX(a.date) AS last_date
        FROM attendances a JOIN employees e ON e.id=a.employee_id
       WHERE to_char(a.date,'YYYY-MM')=$1 AND a.check_in IS NOT NULL
         AND (COALESCE(a.is_late,false) OR a.check_in::time > TIME '08:00')
         AND ($2='' OR e.name ILIKE $3 OR e.employee_code ILIKE $3)
       GROUP BY e.id, e.employee_code, e.name, e.position, e.department
       ORDER BY total_minutes DESC, days_late DESC, e.name`,[month, search, like]);
    const details = await pool.query(`
      SELECT a.id, a.date, a.check_in, a.check_out, a.late_minutes, a.check_in_distance_m, a.note,
             e.id AS employee_id, e.name, e.employee_code
        FROM attendances a JOIN employees e ON e.id=a.employee_id
       WHERE to_char(a.date,'YYYY-MM')=$1 AND a.check_in IS NOT NULL
         AND (COALESCE(a.is_late,false) OR a.check_in::time > TIME '08:00')
         AND ($2='' OR e.name ILIKE $3 OR e.employee_code ILIKE $3)
       ORDER BY a.date DESC, a.late_minutes DESC LIMIT 300`,[month, search, like]);
    const summary = rows.rows.reduce((acc,r)=>{ acc.employees++; acc.days+=r.days_late; acc.minutes+=r.total_minutes; return acc; },{employees:0,days:0,minutes:0});
    summary.avg_minutes = summary.days ? Math.round(summary.minutes/summary.days) : 0;
    res.json({ month, cutoff: ATT_POLICY.cutoff, cutoff_label: ATT_POLICY.cutoff_label, summary, rows: rows.rows, details: details.rows });
  }catch(e){ console.error('[late-report]',e); res.status(500).json({error:e.message}); }
});

// Kebijakan absensi untuk UI (titik pusat, radius, batas jam masuk).
router.get('/attendance/policy', async (req,res)=>{
  res.json({ ...ATT_POLICY, today: today(), now: wibClock() });
});

// Check-in: HRD/direktur boleh untuk karyawan mana pun (employee_id),
// role lain otomatis untuk dirinya sendiri. Waktu disimpan sebagai jam dinding WIB.
// Geofence 200 m dari Gudang Pusat; lewat 08:00 tetap boleh, dicatat terlambat.
router.post('/attendance/checkin', async (req,res)=>{
  await ensureAttendanceCols();
  const body=req.body||{};
  try{
    const roles=(req.user?.roles||[]).map(r=>String(r).toLowerCase());
    const privileged = roles.includes('direktur')||roles.includes('super_admin')||roles.includes('hrd');
    const selfId = await myEmployeeId(req.user);
    const targetId = (privileged && body.employee_id)? parseInt(body.employee_id) : null;
    const forOther = !!(targetId && selfId && targetId!==selfId);
    // HR/admin mengisikan absensi manual dari kantor (tanpa GPS browser).
    const manual = !!(privileged && body.manual===true);
    const empId = targetId || selfId;
    if(!empId) return res.status(400).json({error:'Akun Anda belum tertaut ke data karyawan. Hubungi HR.'});
    const d=today();

    // Sudah check-in hari ini? Jangan timpa jam masuk pertama.
    const ex=await pool.query('SELECT * FROM attendances WHERE employee_id=$1 AND date=$2',[empId,d]);
    if(ex.rows[0]?.check_in){
      return res.json({ ok:true, already:true, row:ex.rows[0], policy:ATT_POLICY,
        late:{ is_late:!!ex.rows[0].is_late, late_minutes: parseInt(ex.rows[0].late_minutes||0) },
        distance_m: ex.rows[0].check_in_distance_m ?? null });
    }

    // ── Geofence 200 m (karyawan sendiri wajib GPS; HR yang mengisikan untuk
    //    karyawan lain dikecualikan karena dilakukan dari kantor) ─────────────
    let lat=null, lng=null, distM=null, accM=null;
    if(!forOther && !manual){
      lat=parseFloat(body.lat); lng=parseFloat(body.lng);
      if(!isFinite(lat) || !isFinite(lng)){
        return res.status(400).json({error:'Lokasi GPS belum terbaca. Aktifkan izin lokasi di browser lalu coba lagi.'});
      }
      accM = isFinite(parseFloat(body.accuracy)) ? Math.round(parseFloat(body.accuracy)) : null;
      distM = haversineM(ATT_POLICY.office.lat, ATT_POLICY.office.lng, lat, lng);
      if(distM > ATT_POLICY.radius_m){
        return res.status(400).json({
          error:`Anda ${distM} m dari ${ATT_POLICY.office.name} - maksimal ${ATT_POLICY.radius_m} m untuk absen. Mendekat dulu ke area gudang.`,
          distance_m: distM, radius_m: ATT_POLICY.radius_m, office: ATT_POLICY.office,
        });
      }
    }

    // ── Keterlambatan: batas 08:00, tetap boleh absen ────────────────────────
    const clock = wibClock();
    const late = lateInfo(clock);
    const note = [
      late.is_late ? `Terlambat ${late.late_minutes} menit (batas ${ATT_POLICY.cutoff_label})` : null,
      (forOther || manual) ? 'Diisi HR/admin untuk karyawan' : null,
    ].filter(Boolean).join(' • ') || null;

    const ins=await pool.query(
      `INSERT INTO attendances (employee_id, date, check_in, status, check_in_lat, check_in_lng, check_in_distance_m, check_in_accuracy_m, is_late, late_minutes, note)
       VALUES ($1,$2,(NOW() AT TIME ZONE 'Asia/Jakarta'),'PRESENT',$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (employee_id,date) DO UPDATE SET
         check_in = COALESCE(attendances.check_in, EXCLUDED.check_in),
         status='PRESENT',
         check_in_lat=COALESCE(attendances.check_in_lat, EXCLUDED.check_in_lat),
         check_in_lng=COALESCE(attendances.check_in_lng, EXCLUDED.check_in_lng),
         check_in_distance_m=COALESCE(attendances.check_in_distance_m, EXCLUDED.check_in_distance_m),
         check_in_accuracy_m=COALESCE(attendances.check_in_accuracy_m, EXCLUDED.check_in_accuracy_m),
         is_late=COALESCE(attendances.is_late, EXCLUDED.is_late),
         late_minutes=COALESCE(attendances.late_minutes, EXCLUDED.late_minutes),
         note=COALESCE(attendances.note, EXCLUDED.note)
       RETURNING *`,
      [empId, d, lat, lng, distM, accM, late.is_late, late.late_minutes, note]);
    res.json({ ok:true, row:ins.rows[0], policy:ATT_POLICY, late, distance_m: distM, clock });
  }catch(e){ console.error('[checkin]',e); res.status(500).json({error:e.message}); }
});

router.post('/attendance/checkout', async (req,res)=>{
  await ensureAttendanceCols();
  const body=req.body||{};
  try{
    const roles=(req.user?.roles||[]).map(r=>String(r).toLowerCase());
    const privileged = roles.includes('direktur')||roles.includes('super_admin')||roles.includes('hrd');
    const selfId = await myEmployeeId(req.user);
    const targetId = (privileged && body.employee_id)? parseInt(body.employee_id) : null;
    const forOther = !!(targetId && selfId && targetId!==selfId);
    const manual = !!(privileged && body.manual===true);
    const empId = targetId || selfId;
    if(!empId) return res.status(400).json({error:'Akun Anda belum tertaut ke data karyawan. Hubungi HR.'});
    const d=today();

    let lat=null, lng=null, distM=null, accM=null;
    if(!forOther && !manual){
      lat=parseFloat(body.lat); lng=parseFloat(body.lng);
      if(!isFinite(lat) || !isFinite(lng)){
        return res.status(400).json({error:'Lokasi GPS belum terbaca. Aktifkan izin lokasi di browser lalu coba lagi.'});
      }
      accM = isFinite(parseFloat(body.accuracy)) ? Math.round(parseFloat(body.accuracy)) : null;
      distM = haversineM(ATT_POLICY.office.lat, ATT_POLICY.office.lng, lat, lng);
      if(distM > ATT_POLICY.radius_m){
        return res.status(400).json({
          error:`Anda ${distM} m dari ${ATT_POLICY.office.name} - maksimal ${ATT_POLICY.radius_m} m untuk absen. Mendekat dulu ke area gudang.`,
          distance_m: distM, radius_m: ATT_POLICY.radius_m, office: ATT_POLICY.office,
        });
      }
    }

    const r=await pool.query(
      `UPDATE attendances SET check_out=(NOW() AT TIME ZONE 'Asia/Jakarta'),
          check_out_lat=$3, check_out_lng=$4, check_out_distance_m=$5
        WHERE employee_id=$1 AND date=$2 RETURNING *`,[empId,d,lat,lng,distM]);
    if(!r.rows[0]) return res.status(400).json({error:'Belum ada check-in hari ini'});
    res.json({ ok:true, row:r.rows[0], policy:ATT_POLICY, distance_m: distM, clock: wibClock() });
  }catch(e){ console.error('[checkout]',e); res.status(500).json({error:e.message}); }
});

// ------------------------------------------------------------------- PAYROLL
router.get('/payrolls', rbac('hrd','direktur','super_admin'), async (req,res)=>{
  const {limit,offset}=paginate(req);
  const {period,status,search}=req.query;
  let where='WHERE 1=1'; const p=[];
  if(period && period!=='Semua'){ p.push(period); where+=' AND p.period=$'+p.length; }
  if(status && status!=='Semua'){ p.push(status); where+=' AND p.status=$'+p.length; }
  if(search){ p.push('%'+search+'%'); where+=' AND (e.name ILIKE $'+p.length+' OR e.employee_code ILIKE $'+p.length+')'; }
  try{
    const cnt=await pool.query('SELECT COUNT(*) FROM payrolls p JOIN employees e ON e.id=p.employee_id '+where,p);
    const data=await pool.query(
      `SELECT p.*, e.name, e.employee_code, e.position, e.department FROM payrolls p JOIN employees e ON e.id=p.employee_id
       ${where} ORDER BY p.period DESC, e.name LIMIT $${p.length+1} OFFSET $${p.length+2}`, [...p,limit,offset]);
    const tot=await pool.query(
      `SELECT COALESCE(SUM(p.basic_salary),0)::float AS basic, COALESCE(SUM(p.allowances),0)::float AS tunjangan,
              COALESCE(SUM(p.bpjs_employee),0)::float AS bpjs, COALESCE(SUM(p.pph21),0)::float AS pph,
              COALESCE(SUM(p.net_salary),0)::float AS net FROM payrolls p JOIN employees e ON e.id=p.employee_id ${where}`, p);
    res.json({ data:data.rows, total:parseInt(cnt.rows[0].count), totals:tot.rows[0] });
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.get('/payrolls/periods', rbac('hrd','direktur','super_admin'), async (_req,res)=>{
  try{
    const r=await pool.query(
      `SELECT period, COUNT(*)::int AS jumlah, COALESCE(SUM(net_salary),0)::float AS total_net,
              COUNT(*) FILTER (WHERE status='PAID')::int AS dibayar
         FROM payrolls GROUP BY period ORDER BY period DESC LIMIT 24`);
    res.json(r.rows);
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.post('/payrolls/generate', rbac('hrd','direktur','super_admin'), async (req,res)=>{
  const {period} = req.body||{};
  if(!/^\d{4}-\d{2}$/.test(String(period||''))) return res.status(400).json({error:'Periode wajib format YYYY-MM (mis. 2026-10)'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const emps=await client.query('SELECT * FROM employees WHERE is_active=true');
    if(!emps.rows.length) return res.status(400).json({error:'Belum ada karyawan aktif'});
    let dibuat=0, dilewati=0;
    for(const e of emps.rows){
      const ada=await client.query('SELECT id, status FROM payrolls WHERE employee_id=$1 AND period=$2',[e.id, period]);
      if(ada.rows[0] && ada.rows[0].status==='PAID'){ dilewati++; continue; }
      const basic=num(e.basic_salary);
      const allowances=basic*0.1;
      const bpjsTK = hitungBpjsTK({ basicSalary: basic });
      const bpjsKes = hitungBpjsKesehatan({ basicSalary: basic });
      const bpjs = { ...bpjsTK, ...bpjsKes };
      const pph = hitungPph21({ grossSalary: basic + allowances, ptkpStatus: 'TK/0' });
      const resGaji = hitungGajiNet({ basicSalary: basic, allowances, bpjs, pph21: pph });
      const bpjs_emp = (bpjs.jht_emp || 0) + (bpjs.jp_emp || 0) + (bpjs.bpjs_kes_emp || 0);
      const bpjs_comp = (bpjs.jht_company || 0) + (bpjs.jp_company || 0) + (bpjs.jkk || 0) + (bpjs.jkm || 0) + (bpjs.bpjs_kes_company || 0);
      const pph21 = pph.pph21_monthly;
      const net = resGaji.netSalary;
      await client.query(
        `INSERT INTO payrolls (employee_id, period, basic_salary, allowances, bpjs_employee, bpjs_company, pph21, net_salary, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'DRAFT')
         ON CONFLICT (employee_id, period) DO UPDATE SET basic_salary=$3, allowances=$4, bpjs_employee=$5, bpjs_company=$6, pph21=$7, net_salary=$8`,
        [e.id, period, basic, allowances, bpjs_emp, bpjs_comp, pph21, net]);
      dibuat++;
    }
    await client.query('COMMIT');
    const total=await pool.query('SELECT COALESCE(SUM(net_salary),0)::float AS net FROM payrolls WHERE period=$1',[period]);
    res.json({ ok:true, period, diproses:dibuat, dilewati, total_net: total.rows[0].net });
  }catch(e){
    await client.query('ROLLBACK').catch(()=>{});
    res.status(500).json({error:'Gagal generate payroll: '+e.message});
  }finally{ client.release(); }
});

router.post('/payrolls/:id/status', rbac('hrd','direktur','super_admin'), async (req,res)=>{
  const st=String(req.body?.status||'').toUpperCase();
  if(!['DRAFT','APPROVED','PAID'].includes(st)) return res.status(400).json({error:'Status harus DRAFT, APPROVED, atau PAID'});
  try{
    const r=await pool.query('UPDATE payrolls SET status=$1 WHERE id=$2 RETURNING *',[st, req.params.id]);
    if(!r.rows[0]) return res.status(404).json({error:'Payroll tidak ditemukan'});
    res.json({ ok:true, row:r.rows[0] });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// Slip gaji karyawan lengkap (bisa diakses HRD/direktur/super_admin atau karyawan bersangkutan)
router.get('/payrolls/:id/slip', rbac('hrd','direktur','super_admin'), async (req,res)=>{
  try{
    const r = await pool.query(
      `SELECT p.*, e.name AS employee_name, e.employee_code, e.position, e.department,
              e.npwp, e.bpjs_number, b.name AS branch_name, c.name AS company_name
         FROM payrolls p
         JOIN employees e ON e.id = p.employee_id
         LEFT JOIN branches b ON b.id = e.branch_id
         LEFT JOIN companies c ON c.id = b.company_id
        WHERE p.id = $1`, [req.params.id]);
    const row = r.rows[0];
    if(!row) return res.status(404).json({error:'Payroll tidak ditemukan'});

    const roles = (req.user?.roles||[]).map(x=>String(x).toLowerCase());
    const isHrOrAdmin = roles.some(x=>['hrd','direktur','super_admin'].includes(x));
    if(!isHrOrAdmin && req.user?.employee_id !== row.employee_id){
      return res.status(403).json({error:'Tidak berhak mengakses slip gaji ini'});
    }

    const basic = num(row.basic_salary);
    const allowances = num(row.allowances);
    const overtime = num(row.overtime);
    const deductions = num(row.deductions);
    const bpjsTK = hitungBpjsTK({ basicSalary: basic });
    const bpjsKes = hitungBpjsKesehatan({ basicSalary: basic });
    const bpjs = { ...bpjsTK, ...bpjsKes };
    const pph = { pph21_monthly: num(row.pph21) };
    const slipCalc = hitungGajiNet({ basicSalary: basic, allowances, overtime, deductions, bpjs, pph21: pph });

    res.json({
      ok: true,
      slip: {
        ...row,
        detail: slipCalc.slip
      }
    });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// --------------------------------------------------------------- CUTI / IZIN
router.get('/leaves', rbac('hrd','direktur','super_admin'), async (req,res)=>{
  const {limit,offset}=paginate(req);
  const {status,search,start,end,type}=req.query;
  let where='WHERE 1=1'; const p=[];
  if(status && status!=='Semua'){ p.push(status); where+=' AND l.status=$'+p.length; }
  if(type && type!=='Semua'){ p.push(String(type).toUpperCase()); where+=' AND l.type=$'+p.length; }
  if(start){ p.push(start); where+=' AND l.start_date >= $'+p.length; }
  if(end){ p.push(end); where+=' AND l.start_date <= $'+p.length; }
  if(search){ p.push('%'+search+'%'); where+=' AND (e.name ILIKE $'+p.length+' OR e.employee_code ILIKE $'+p.length+')'; }
  try{
    const cnt=await pool.query('SELECT COUNT(*) FROM leaves l JOIN employees e ON e.id=l.employee_id '+where,p);
    const data=await pool.query(
      `SELECT l.*, e.name, e.employee_code, e.position, u.username AS approved_by_name,
              (l.end_date - l.start_date + 1) AS jumlah_hari,
              (l.attachment_path IS NOT NULL) AS has_attachment,
              l.attachment_name,
              CASE WHEN l.start_time IS NOT NULL AND l.end_time IS NOT NULL
                   THEN ROUND(EXTRACT(EPOCH FROM (l.end_time - l.start_time))/3600.0, 2) END AS durasi_jam
         FROM leaves l JOIN employees e ON e.id=l.employee_id LEFT JOIN users u ON u.id=l.approved_by
         ${where} ORDER BY l.id DESC LIMIT $${p.length+1} OFFSET $${p.length+2}`, [...p,limit,offset]);
    res.json({ data:data.rows, total:parseInt(cnt.rows[0].count) });
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.post('/leaves', rbac('hrd','direktur','super_admin'), async (req,res)=>{
  const {employee_id,type,start_date,end_date,reason}=req.body||{};
  if(!employee_id || !start_date || !end_date) return res.status(400).json({error:'Karyawan, tanggal mulai, dan tanggal selesai wajib diisi'});
  if(new Date(end_date) < new Date(start_date)) return res.status(400).json({error:'Tanggal selesai tidak boleh sebelum tanggal mulai'});
  try{
    const r=await pool.query(
      `INSERT INTO leaves (employee_id, type, start_date, end_date, reason, status)
       VALUES ($1,$2,$3,$4,$5,'PENDING') RETURNING id`,
      [employee_id, type||'CUTI', start_date, end_date, reason||null]);
    res.json({ ok:true, id:r.rows[0].id });
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.post('/leaves/:id/decision', rbac('hrd','direktur','super_admin'), async (req,res)=>{
  const st=String(req.body?.status||'').toUpperCase();
  if(!['APPROVED','REJECTED','PENDING'].includes(st)) return res.status(400).json({error:'Status harus APPROVED, REJECTED, atau PENDING'});
  const note = req.body?.note || req.body?.reason || null;
  try{
    const cur = await pool.query('SELECT * FROM leaves WHERE id=$1',[req.params.id]);
    if(!cur.rows[0]) return res.status(404).json({error:'Pengajuan tidak ditemukan'});
    const row = cur.rows[0];
    if(row.status!=='PENDING' && st!=='PENDING') return res.status(400).json({error:'Pengajuan ini sudah diproses sebelumnya'});
    if(st==='APPROVED' && row.type==='CUTI'){
      const hari = hitungHari(row.start_date, row.end_date);
      const k = await cutiRingkasan(row.employee_id, new Date(row.start_date).getFullYear());
      const tersedia = k.jatah - k.terpakai - (k.menunggu - hari);
      if(hari > tersedia) return res.status(400).json({error:`Jatah cuti karyawan tidak cukup (butuh ${hari} hari, tersedia ${Math.max(0,tersedia)} hari)`});
    }
    const r=await pool.query(
      `UPDATE leaves SET status=$1::text, approved_by=$2, decision_note=$3,
              decided_at=CASE WHEN $1::text='PENDING' THEN NULL ELSE NOW() END
        WHERE id=$4 RETURNING *`,
      [st, st==='PENDING'? null : (req.user?.id||null), note, req.params.id]);
    if(!r.rows[0]) return res.status(404).json({error:'Pengajuan tidak ditemukan'});
    res.json({ ok:true, row:r.rows[0] });
  }catch(e){ res.status(500).json({error:e.message}); }
});


// Absensi saya bulan ini + status hari ini + kebijakan (cutoff 08:00, radius 200 m)
router.get('/attendance/mine', async (req,res)=>{
  try{
    await ensureAttendanceCols();
    const empId = await myEmployeeId(req.user);
    if(!empId) return res.status(400).json({error:'Akun Anda belum tertaut ke data karyawan. Hubungi HR.'});
    const month = /^\d{4}-\d{2}$/.test(String(req.query.month||'')) ? req.query.month : new Date(Date.now()+7*3600*1000).toISOString().slice(0,7);
    const rows = await pool.query(
      `SELECT a.*,
              CASE WHEN a.check_in IS NOT NULL AND (COALESCE(a.is_late,false) OR a.check_in::time > TIME '08:00') THEN true ELSE false END AS terlambat,
              CASE WHEN a.check_in IS NOT NULL AND a.check_out IS NOT NULL
                   THEN EXTRACT(EPOCH FROM (a.check_out - a.check_in))/3600 ELSE NULL END AS jam_kerja
       FROM attendances a WHERE a.employee_id=$1 AND to_char(a.date,'YYYY-MM')=$2 ORDER BY a.date DESC`,[empId, month]);
    const t = today();
    const todayRow = await pool.query('SELECT * FROM attendances WHERE employee_id=$1 AND date=$2',[empId, t]);
    const sum = rows.rows.reduce((acc,r)=>{ acc.hadir++; if(r.terlambat) acc.terlambat++; if(r.jam_kerja) acc.jam += parseFloat(r.jam_kerja); return acc; },{hadir:0,terlambat:0,jam:0});
    res.json({ month, today:t, today_row: todayRow.rows[0]||null, data:rows.rows,
      summary:{ hadir:sum.hadir, terlambat:sum.terlambat, jam:Math.round(sum.jam*10)/10 },
      policy:{ ...ATT_POLICY, now: wibClock() } });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// Profil saya (data karyawan + akun + sisa cuti)
router.get('/me', async (req,res)=>{
  try{
    const r = await pool.query(
      `SELECT e.id AS employee_id, e.employee_code, e.name, e.position, e.department, e.join_date, e.phone, e.npwp, e.bpjs_number,
              COALESCE(e.leave_quota,12)::int AS leave_quota,
              u.username, u.email, u.branch_id, b.name AS branch_name
       FROM users u LEFT JOIN employees e ON e.id=u.employee_id LEFT JOIN branches b ON b.id=u.branch_id
       WHERE u.id=$1`,[req.user.id]);
    if(!r.rows[0]) return res.status(404).json({error:'User tidak ditemukan'});
    const year = new Date(Date.now()+7*3600*1000).getFullYear();
    const used = await pool.query("SELECT COALESCE(SUM(end_date-start_date+1),0)::int AS d FROM leaves WHERE employee_id=$1 AND status='APPROVED' AND type='CUTI' AND EXTRACT(YEAR FROM start_date)=$2",[r.rows[0].employee_id, year]);
    res.json({ ...r.rows[0], roles:req.user.roles||[], cuti_terpakai:used.rows[0].d, cuti_tahun:year });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// ------------------------------ SELF-SERVICE (semua karyawan yang login)
async function myEmployeeId(user){
  const r = await pool.query('SELECT employee_id FROM users WHERE id=$1',[user.id]);
  return r.rows[0]?.employee_id || null;
}
const JATAH_CUTI_TAHUNAN = 12;
// --------------------------------------------------- lampiran surat dokter
const UPLOAD_ROOT = path.resolve('uploads');
const MIME_EXT = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'application/pdf':'pdf' };
const MAX_LAMPIRAN = 4 * 1024 * 1024;   // 4 MB

function simpanLampiran(meta){
  return String(meta?.path||'');
}
function lampiranValid(p){
  return /^leaves\/\d{4}-\d{2}\/[a-f0-9]{24}\.(jpg|png|webp|pdf)$/.test(String(p||''));
}
// ------------------------------------------------- ringkasan jatah cuti
// Hari dihitung kalender (end - start + 1), sama dengan cara rekap lama.
async function cutiRingkasan(empId, year){
  const q = await pool.query('SELECT COALESCE(leave_quota,12)::int AS jatah FROM employees WHERE id=$1',[empId]);
  const jatah = q.rows[0]?.jatah ?? JATAH_CUTI_TAHUNAN;
  const agg = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN status='APPROVED' THEN (end_date-start_date+1) ELSE 0 END),0)::int AS terpakai,
       COALESCE(SUM(CASE WHEN status='PENDING'  THEN (end_date-start_date+1) ELSE 0 END),0)::int AS menunggu
     FROM leaves WHERE employee_id=$1 AND type='CUTI' AND EXTRACT(YEAR FROM start_date)=$2`,[empId, year]);
  const terpakai = agg.rows[0]?.terpakai || 0;
  const menunggu = agg.rows[0]?.menunggu || 0;
  return { tahun: year, jatah, terpakai, menunggu,
           sisa: Math.max(0, jatah - terpakai),
           sisa_setelah_pending: Math.max(0, jatah - terpakai - menunggu) };
}
const hitungHari = (a,b)=> Math.round((new Date(b) - new Date(a)) / 86400000) + 1;

router.get('/leaves/mine', async (req,res)=>{
  try{
    const empId = await myEmployeeId(req.user);
    if(!empId) return res.status(400).json({error:'Akun Anda belum tertaut ke data karyawan. Hubungi HR.'});
    const typeFilter = String(req.query.type||'').toUpperCase();
    const params = [empId];
    let where = 'l.employee_id=$1';
    if(LEAVE_TYPES.includes(typeFilter)){ params.push(typeFilter); where += ' AND l.type=$2'; }
    const r = await pool.query(`SELECT l.*, (l.end_date - l.start_date + 1) AS jumlah_hari,
        (l.attachment_path IS NOT NULL) AS has_attachment, u.username AS approved_by_name,
        CASE WHEN l.start_time IS NOT NULL AND l.end_time IS NOT NULL
             THEN ROUND(EXTRACT(EPOCH FROM (l.end_time - l.start_time))/3600.0, 2) END AS durasi_jam
      FROM leaves l LEFT JOIN users u ON u.id=l.approved_by LEFT JOIN employees e ON e.id=l.employee_id
      WHERE ${where} ORDER BY l.id DESC LIMIT 50`, params);
    const year = new Date(Date.now() + 7*3600*1000).getFullYear(); // WIB
    res.json({ data:r.rows, jatah: await cutiRingkasan(empId, year) });
  }catch(e){ res.status(500).json({error:e.message}); }
});
const LEAVE_TYPES = ['CUTI','IZIN','SAKIT','DINAS','TANPA_BAYAR'];
// Unggah foto surat dokter (base64 JSON — tidak perlu dependency multer).
router.post('/leaves/attachment', async (req,res)=>{
  const { name, mime, data } = req.body||{};
  if(!data) return res.status(400).json({error:'Berkas kosong'});
  const ext = MIME_EXT[String(mime||'').toLowerCase()];
  if(!ext) return res.status(400).json({error:'Format harus JPG, PNG, WEBP, atau PDF'});
  try{
    const buf = Buffer.from(String(data).replace(/^data:[^;]+;base64,/,''), 'base64');
    if(!buf.length) return res.status(400).json({error:'Berkas tidak terbaca'});
    if(buf.length > MAX_LAMPIRAN) return res.status(400).json({error:'Ukuran maksimal 4 MB'});
    const bulan = new Date(Date.now()+7*3600*1000).toISOString().slice(0,7);
    const dir = path.join(UPLOAD_ROOT,'leaves',bulan);
    await fs.mkdir(dir,{ recursive:true });
    const fname = crypto.randomBytes(12).toString('hex')+'.'+ext;
    await fs.writeFile(path.join(dir,fname), buf);
    res.json({ path:'leaves/'+bulan+'/'+fname, name:String(name||('surat-dokter.'+ext)).slice(0,120), mime, size:buf.length });
  }catch(e){ res.status(500).json({error:'Gagal menyimpan lampiran: '+e.message}); }
});

// Baca lampiran — hanya pemilik pengajuan atau HRD/direktur/super_admin.
router.get('/leaves/:id/attachment', async (req,res)=>{
  try{
    const r = await pool.query('SELECT id, employee_id, attachment_path, attachment_name, attachment_mime FROM leaves WHERE id=$1',[req.params.id]);
    const row = r.rows[0];
    if(!row || !row.attachment_path) return res.status(404).json({error:'Pengajuan ini tidak punya lampiran'});
    const roles = (req.user?.roles||[]).map(x=>String(x).toLowerCase());
    const bolehRole = roles.some(x=>['hrd','direktur','super_admin'].includes(x));
    const empId = await myEmployeeId(req.user);
    if(!bolehRole && empId !== row.employee_id) return res.status(403).json({error:'Tidak berhak melihat lampiran ini'});
    const abs = path.join(UPLOAD_ROOT, row.attachment_path);
    if(!abs.startsWith(UPLOAD_ROOT)) return res.status(400).end();
    await fs.access(abs);
    res.setHeader('Content-Type', row.attachment_mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline; filename="'+String(row.attachment_name||'surat').replace(/"/g,'')+'"');
    res.setHeader('Cache-Control','private, max-age=60');
    res.sendFile(abs);
  }catch(e){
    if(e.code==='ENOENT') return res.status(404).json({error:'Berkas lampiran tidak ditemukan di server'});
    res.status(500).json({error:e.message});
  }
});

router.get('/leaves/quota', async (req,res)=>{
  try{
    const empId = await myEmployeeId(req.user);
    if(!empId) return res.status(400).json({error:'Akun Anda belum tertaut ke data karyawan. Hubungi HR.'});
    const year = /^\d{4}$/.test(String(req.query.year||'')) ? parseInt(req.query.year) : new Date(Date.now()+7*3600*1000).getFullYear();
    res.json(await cutiRingkasan(empId, year));
  }catch(e){ res.status(500).json({error:e.message}); }
});
router.post('/leaves/request', async (req,res)=>{
  const type = String(req.body?.type||'CUTI').toUpperCase();
  const {start_date,end_date,reason}=req.body||{};
  const start_time = req.body?.start_time || null;
  const end_time = req.body?.end_time || null;
  if(!LEAVE_TYPES.includes(type)) return res.status(400).json({error:'Jenis pengajuan tidak dikenal'});
  if(!start_date||!end_date) return res.status(400).json({error:'Tanggal mulai dan tanggal selesai wajib diisi'});
  if(new Date(end_date) < new Date(start_date)) return res.status(400).json({error:'Tanggal selesai tidak boleh sebelum tanggal mulai'});
  if(!String(reason||'').trim()){
    const label = type==='CUTI' ? 'cuti' : type==='SAKIT' ? 'sakit' : type==='IZIN' ? 'izin' : 'pengajuan';
    return res.status(400).json({error:'Alasan wajib diisi untuk '+label});
  }
  if(start_time && end_time && String(end_time) <= String(start_time)) return res.status(400).json({error:'Jam selesai harus setelah jam mulai'});
  if(type==='IZIN' && String(start_date)===String(end_date) && (!start_time || !end_time)) return res.status(400).json({error:'Izin satu hari wajib mengisi jam mulai dan jam selesai'});
  try{
    const empId = await myEmployeeId(req.user);
    if(!empId) return res.status(400).json({error:'Akun Anda belum tertaut ke data karyawan. Hubungi HR.'});
    if(type==='CUTI'){
      const hari = hitungHari(start_date, end_date);
      const k = await cutiRingkasan(empId, new Date(start_date).getFullYear());
      if(hari > k.sisa_setelah_pending){
        return res.status(400).json({error:
          `Sisa jatah cuti tidak cukup: butuh ${hari} hari, tersedia ${k.sisa_setelah_pending} hari`+
          (k.menunggu>0 ? ` (${k.menunggu} hari masih menunggu approval)` : '')});
      }
    }
    const dup = await pool.query(
      `SELECT 1 FROM leaves
        WHERE employee_id=$1 AND status IN ('PENDING','APPROVED')
          AND daterange(start_date,end_date,'[]') && daterange($2::date,$3::date,'[]')
        LIMIT 1`,[empId,start_date,end_date]);
    if(dup.rows.length) return res.status(400).json({error:'Sudah ada pengajuan pada tanggal tersebut (menunggu atau disetujui)'});
    const att = req.body?.attachment || null;
    if(att && !lampiranValid(att.path)) return res.status(400).json({error:'Lampiran tidak valid, unggah ulang'});
    const r = await pool.query(
      `INSERT INTO leaves (employee_id, type, start_date, end_date, start_time, end_time, reason, status,
                           attachment_path, attachment_name, attachment_mime, attachment_size)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING',$8,$9,$10,$11) RETURNING id`,
      [empId, type, start_date, end_date, start_time, end_time, reason||null,
       att? simpanLampiran(att): null, att? String(att.name||'').slice(0,160): null,
       att? String(att.mime||'').slice(0,80): null, att? parseInt(att.size)||null: null]);
    res.json({ok:true, id:r.rows[0].id});
  }catch(e){ res.status(500).json({error:e.message}); }
});
router.post('/leaves/:id/cancel', async (req,res)=>{
  try{
    const empId = await myEmployeeId(req.user);
    if(!empId) return res.status(400).json({error:'Akun Anda belum tertaut ke data karyawan.'});
    const r = await pool.query("UPDATE leaves SET status='CANCELLED' WHERE id=$1 AND employee_id=$2 AND status='PENDING' RETURNING id",[req.params.id, empId]);
    if(!r.rows[0]) return res.status(400).json({error:'Hanya pengajuan PENDING milik sendiri yang bisa dibatalkan'});
    res.json({ok:true});
  }catch(e){ res.status(500).json({error:e.message}); }
});

// ------------------------------------------------------------------- EXPORT
router.get('/export', rbac('hrd','direktur','super_admin'), async (req,res)=>{
  const format=String(req.query.format||'xlsx').toLowerCase();
  if(!['csv','xlsx','pdf'].includes(format)) return res.status(400).json({error:`Format tidak didukung: ${format}`});
  const dataset=String(req.query.dataset||'employees');
  const money=(n)=>new Intl.NumberFormat('id-ID').format(num(n));
  try{
    if(dataset==='attendance'){
      const {date,start,end,status}=req.query;
      let where='WHERE 1=1'; const p=[];
      if(date){ p.push(date); where+=' AND a.date=$'+p.length; }
      if(start){ p.push(start); where+=' AND a.date >= $'+p.length; }
      if(end){ p.push(end); where+=' AND a.date <= $'+p.length; }
      if(status && status!=='Semua'){ p.push(status); where+=' AND a.status=$'+p.length; }
      const r=await pool.query(
        `SELECT a.*, e.name, e.employee_code, e.position, e.department FROM attendances a JOIN employees e ON e.id=a.employee_id
         ${where} ORDER BY a.date DESC, e.name LIMIT 5000`, p);
      const columns=[{label:'Tanggal'},{label:'Kode'},{label:'Nama'},{label:'Jabatan'},{label:'Departemen'},
        {label:'Jam Masuk'},{label:'Jam Pulang'},{label:'Status'},{label:'Terlambat'},{label:'Jam Kerja',numeric:true}];
      const rows=r.rows.map(a=>{
        const ci=a.check_in? new Date(a.check_in) : null;
        const co=a.check_out? new Date(a.check_out) : null;
        const late=ci && (ci.getHours()>8 || (ci.getHours()===8 && ci.getMinutes()>0));
        const jam = ci&&co ? (co-ci)/3600000 : 0;
        return [iso(a.date), a.employee_code, a.name, a.position||'-', a.department||'-',
          ci? ci.toTimeString().slice(0,5):'-', co? co.toTimeString().slice(0,5):'-', a.status||'-', late?'YA':'-', jam];
      });
      const totals=columns.map((c,i)=>c.total?rows.reduce((s,x)=>s+num(x[i]),0):'');
      return sendReport(res,{format,filename:'absensi-karyawan',
        payload:{title:'Absensi Karyawan',subtitle:`${rows.length} baris${date?'  |  '+date:''}${start||end?'  |  '+(start||'awal')+' s/d '+(end||'sekarang'):''}`,columns,rows,totals,sheetName:'Absensi'}});
    }
    if(dataset==='payrolls'){
      const period=req.query.period;
      const r=await pool.query(
        `SELECT p.*, e.name, e.employee_code, e.position, e.department FROM payrolls p JOIN employees e ON e.id=p.employee_id
         ${period&&period!=='Semua'?'WHERE p.period=$1':''} ORDER BY p.period DESC, e.name LIMIT 5000`, period&&period!=='Semua'?[period]:[]);
      const columns=[{label:'Periode'},{label:'Kode'},{label:'Nama'},{label:'Jabatan'},{label:'Gaji Pokok',numeric:true,total:true},
        {label:'Tunjangan',numeric:true,total:true},{label:'BPJS Karyawan',numeric:true,total:true},{label:'PPh21',numeric:true,total:true},
        {label:'Gaji Bersih',numeric:true,total:true},{label:'Status'}];
      const rows=r.rows.map(p=>[p.period, p.employee_code, p.name, p.position||'-', num(p.basic_salary), num(p.allowances),
        num(p.bpjs_employee), num(p.pph21), num(p.net_salary), p.status||'-']);
      const totals=columns.map((c,i)=>c.total?rows.reduce((s,x)=>s+num(x[i]),0):'');
      return sendReport(res,{format,filename:'payroll',
        payload:{title:'Payroll Karyawan',subtitle:`${rows.length} baris${period&&period!=='Semua'?'  |  Periode '+period:''}  |  Total bersih ${money(totals[8]||0)}`,columns,rows,totals,sheetName:'Payroll'}});
    }
    if(dataset==='leaves'){
      const r=await pool.query(
        `SELECT l.*, e.name, e.employee_code, e.position FROM leaves l JOIN employees e ON e.id=l.employee_id ORDER BY l.id DESC LIMIT 5000`);
      const columns=[{label:'Kode'},{label:'Nama'},{label:'Jabatan'},{label:'Jenis'},{label:'Mulai'},{label:'Selesai'},
        {label:'Hari',numeric:true,total:true},{label:'Alasan'},{label:'Status'}];
      const rows=r.rows.map(l=>[l.employee_code, l.name, l.position||'-', l.type||'-', iso(l.start_date), iso(l.end_date),
        Math.max(1, Math.round((new Date(l.end_date)-new Date(l.start_date))/86400000)+1), l.reason||'-', l.status||'-']);
      const totals=columns.map((c,i)=>c.total?rows.reduce((s,x)=>s+num(x[i]),0):'');
      return sendReport(res,{format,filename:'cuti-izin',
        payload:{title:'Pengajuan Cuti & Izin',subtitle:`${rows.length} pengajuan`,columns,rows,totals,sheetName:'Cuti'}});
    }
    const {department,is_active}=req.query;
    let where='WHERE 1=1'; const p=[];
    if(department && department!=='Semua'){ p.push(department); where+=' AND e.department=$'+p.length; }
    if(is_active==='true'||is_active==='false'){ p.push(is_active==='true'); where+=' AND e.is_active=$'+p.length; }
    const r=await pool.query(
      `SELECT e.*, b.name AS branch_name FROM employees e LEFT JOIN branches b ON b.id=e.branch_id ${where} ORDER BY e.name`, p);
    const columns=[{label:'Kode'},{label:'Nama'},{label:'Jabatan'},{label:'Departemen'},{label:'Cabang'},
      {label:'Tgl Masuk'},{label:'Gaji Pokok',numeric:true,total:true},{label:'Telepon'},{label:'NPWP'},{label:'Status'}];
    const rows=r.rows.map(e=>[e.employee_code, e.name, e.position||'-', e.department||'-', e.branch_name||'-',
      iso(e.join_date)||'-', num(e.basic_salary), e.phone||'-', e.npwp||'-', e.is_active?'AKTIF':'NONAKTIF']);
    const totals=columns.map((c,i)=>c.total?rows.reduce((s,x)=>s+num(x[i]),0):'');
    return sendReport(res,{format,filename:'data-karyawan',
      payload:{title:'Data Karyawan',subtitle:`${rows.length} karyawan  |  Total gaji pokok ${money(totals[6]||0)}`,columns,rows,totals,sheetName:'Karyawan'}});
  }catch(e){
    console.error('hr export error',e);
    res.status(500).json({error:'Gagal membuat laporan: '+e.message});
  }
});

// ─────────────────────── PAYROLL → JURNAL (Beban Gaji, BPJS, PPh21) ───────────────────────
// Dipakai tombol "Posting Jurnal" di tab Payroll. Sekali posting per periode:
// Dr Beban Gaji (gross + BPJS perusahaan)
// Cr Hutang PPh21, Cr Hutang BPJS, Cr Hutang Gaji (atau Bank bila pay_now).
let payrollEnsured = false;
async function ensurePayrollJournal(){
  if(payrollEnsured) return;
  await pool.query(`ALTER TABLE payrolls ADD COLUMN IF NOT EXISTS journal_id INT`).catch(()=>{});
  await pool.query(`ALTER TABLE payrolls ADD COLUMN IF NOT EXISTS posted_at TIMESTAMP`).catch(()=>{});
  await ensureCoa([
    { code:'6-1000', name:'Beban Gaji', type:'EXPENSE' },
    { code:'2-1200', name:'Hutang BPJS', type:'LIABILITY' },
    { code:'2-1300', name:'Hutang Gaji', type:'LIABILITY' },
    { code:'2-1210', name:'Hutang PPh 21', type:'LIABILITY' },
  ]);
  payrollEnsured = true;
}

async function postPayrollPeriod(period, { payNow=false, createdBy }){
  await ensurePayrollJournal();
  const rows = await pool.query(`SELECT p.*, e.name AS employee_name FROM payrolls p JOIN employees e ON e.id=p.employee_id
    WHERE p.period=$1 AND p.journal_id IS NULL`, [period]);
  if(!rows.rows.length) return { posted:0, message:`Semua payroll periode ${period} sudah diposting.` };
  let gross=0, bpjs=0, pph=0, net=0;
  for(const p of rows.rows){
    const g = Number(p.basic_salary||0)+Number(p.allowances||0)+Number(p.overtime||0);
    const b = Number(p.bpjs_employee||0)+Number(p.bpjs_company||0);
    gross += g + Number(p.bpjs_company||0);
    bpjs += b;
    pph += Number(p.pph21||0);
    net += Number(p.net_salary||0) || (g - Number(p.bpjs_employee||0) - Number(p.pph21||0));
  }
  const creditTarget = Math.round((gross - pph - bpjs) * 100) / 100;
  const journalId = await withTx(async (c)=> postJournal({
    date: `${period}-01`,
    refType:'PAYROLL', refId:null, description:`Gaji periode ${period} (${rows.rows.length} karyawan)`,
    lines:[
      { code:'6-1000', debit:gross, description:'Beban gaji & BPJS perusahaan' },
      ...(pph>0.5 ? [{ code:'2-1210', credit:pph, description:'PPh 21 dipotong' }] : []),
      ...(bpjs>0.5 ? [{ code:'2-1200', credit:bpjs, description:'BPJS karyawan + perusahaan' }] : []),
      payNow
        ? { code:'1-1020', credit:creditTarget, description:'Gaji dibayar via bank' }
        : { code:'2-1300', credit:creditTarget, description:'Hutang gaji' },
    ], createdBy, client:c,
  }));
  await pool.query(`UPDATE payrolls SET journal_id=$1, posted_at=NOW(), status=CASE WHEN $2 THEN 'PAID' ELSE status END WHERE period=$3 AND journal_id IS NULL`,
    [journalId, payNow, period]);
  return { posted: rows.rows.length, journal_id: journalId, gross, bpjs, pph, net_paid: creditTarget, pay_now: payNow };
}

router.post('/payrolls/post-journal', rbac('hrd','direktur','super_admin'), async (req,res)=>{
  const period = String(req.body?.period||'').trim();
  if(!/^\d{4}-\d{2}$/.test(period)) return res.status(400).json({error:'Period wajib format YYYY-MM'});
  try{
    const out = await postPayrollPeriod(period, { payNow: !!req.body?.pay_now, createdBy: req.user.id });
    res.json({ ok:true, period, ...out, message: out.posted? `Jurnal gaji ${period} diposting untuk ${out.posted} karyawan.` : out.message });
  }catch(e){ console.error('[payroll journal]',e); res.status(500).json({error:e.message}); }
});

router.post('/payrolls/:id/post-journal', rbac('hrd','direktur','super_admin'), async (req,res)=>{
  try{
    const p = await pool.query('SELECT period FROM payrolls WHERE id=$1',[req.params.id]);
    if(!p.rows[0]) return res.status(404).json({error:'Payroll tidak ditemukan'});
    const out = await postPayrollPeriod(p.rows[0].period, { payNow: !!req.body?.pay_now, createdBy: req.user.id });
    res.json({ ok:true, ...out });
  }catch(e){ res.status(500).json({error:e.message}); }
});

export default router;
