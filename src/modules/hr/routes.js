import express from 'express';
import { pool } from '../../config/db.js';
import { rbac } from '../../middleware/auth.js';
import { paginate } from '../../utils/helpers.js';
import { sendReport } from '../../lib/exporters.js';
const router = express.Router();

const num = (v)=> parseFloat(v ?? 0) || 0;
const iso = (d)=> d ? String(d).slice(0, 10) : null;
const today = ()=> new Date(Date.now() + 7*3600*1000).toISOString().slice(0, 10); // WIB

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
              (SELECT COUNT(*)::int FROM leaves l WHERE l.employee_id=e.id AND l.status='PENDING') AS cuti_pending
         FROM employees e LEFT JOIN branches b ON b.id=e.branch_id
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
    res.json({ ...r.rows[0], basic_salary:num(r.rows[0].basic_salary),
      hadir_bulan_ini: hadir.rows[0].n, attendance:att.rows, payrolls:pay.rows, leaves:lv.rows });
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.post('/employees', rbac('hrd','direktur','super_admin'), async (req,res)=>{
  const {employee_code,name,position,department,branch_id,join_date,basic_salary,phone,npwp,bpjs_number,leave_quota}=req.body||{};
  if(!name || !employee_code) return res.status(400).json({error:'Kode dan nama karyawan wajib diisi'});
  try{
    const dup=await pool.query('SELECT id FROM employees WHERE employee_code=$1',[employee_code]);
    if(dup.rows[0]) return res.status(409).json({error:'Kode karyawan '+employee_code+' sudah dipakai'});
    const r=await pool.query(
      `INSERT INTO employees (employee_code,name,position,department,branch_id,join_date,basic_salary,phone,npwp,bpjs_number,leave_quota)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [employee_code, name, position||null, department||null, branch_id||null, join_date||null,
       num(basic_salary), phone||null, npwp||null, bpjs_number||null, leave_quota!==undefined? parseInt(leave_quota)||0 : 12]);
    res.json({ ok:true, id:r.rows[0].id });
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.put('/employees/:id', rbac('hrd','direktur','super_admin'), async (req,res)=>{
  const f=['employee_code','name','position','department','branch_id','join_date','basic_salary','phone','npwp','bpjs_number','is_active','leave_quota'];
  const sets=[]; const vals=[]; let i=1;
  try{
    for(const k of f) if(req.body[k]!==undefined){ sets.push(k+'=$'+i); vals.push(k==='basic_salary'? num(req.body[k]) : (k==='leave_quota'? (parseInt(req.body[k])||0) : req.body[k])); i++; }
    if(!sets.length) return res.status(400).json({error:'Tidak ada perubahan'});
    vals.push(req.params.id);
    await pool.query('UPDATE employees SET '+sets.join(',')+' WHERE id=$'+i, vals);
    res.json({ ok:true });
  }catch(e){ res.status(500).json({error:e.message}); }
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
              CASE WHEN a.check_in IS NOT NULL AND a.check_in::time > TIME '08:00' THEN true ELSE false END AS terlambat,
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
              COUNT(*) FILTER (WHERE a.check_in IS NOT NULL AND a.check_in::time > TIME '08:00')::int AS terlambat,
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

// Check-in: HRD/direktur boleh untuk karyawan mana pun (employee_id),
// role lain otomatis untuk dirinya sendiri. Waktu disimpan sebagai jam dinding WIB.
router.post('/attendance/checkin', async (req,res)=>{
  const body=req.body||{};
  try{
    const roles=(req.user?.roles||[]).map(r=>String(r).toLowerCase());
    const privileged = roles.includes('direktur')||roles.includes('super_admin')||roles.includes('hrd');
    let empId = (privileged && body.employee_id)? parseInt(body.employee_id) : null;
    if(!empId) empId = await myEmployeeId(req.user);
    if(!empId) return res.status(400).json({error:'Akun Anda belum tertaut ke data karyawan. Hubungi HR.'});
    const d=today();
    await pool.query(
      `INSERT INTO attendances (employee_id, date, check_in, status) VALUES ($1,$2,(NOW() AT TIME ZONE 'Asia/Jakarta'),'PRESENT')
       ON CONFLICT (employee_id,date) DO UPDATE SET check_in = COALESCE(attendances.check_in, (NOW() AT TIME ZONE 'Asia/Jakarta')), status='PRESENT'`,
      [empId, d]);
    const r=await pool.query('SELECT * FROM attendances WHERE employee_id=$1 AND date=$2',[empId,d]);
    res.json({ ok:true, row:r.rows[0] });
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.post('/attendance/checkout', async (req,res)=>{
  const body=req.body||{};
  try{
    const roles=(req.user?.roles||[]).map(r=>String(r).toLowerCase());
    const privileged = roles.includes('direktur')||roles.includes('super_admin')||roles.includes('hrd');
    let empId = (privileged && body.employee_id)? parseInt(body.employee_id) : null;
    if(!empId) empId = await myEmployeeId(req.user);
    if(!empId) return res.status(400).json({error:'Akun Anda belum tertaut ke data karyawan. Hubungi HR.'});
    const d=today();
    const r=await pool.query("UPDATE attendances SET check_out=(NOW() AT TIME ZONE 'Asia/Jakarta') WHERE employee_id=$1 AND date=$2 RETURNING *",[empId,d]);
    if(!r.rows[0]) return res.status(400).json({error:'Belum ada check-in hari ini'});
    res.json({ ok:true, row:r.rows[0] });
  }catch(e){ res.status(500).json({error:e.message}); }
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
      const bpjs_emp=basic*0.02;
      const bpjs_comp=basic*0.04;
      const pph21=basic*0.05;
      const net=basic+allowances-bpjs_emp-pph21;
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

// --------------------------------------------------------------- CUTI / IZIN
router.get('/leaves', rbac('hrd','direktur','super_admin'), async (req,res)=>{
  const {limit,offset}=paginate(req);
  const {status,search,start,end}=req.query;
  let where='WHERE 1=1'; const p=[];
  if(status && status!=='Semua'){ p.push(status); where+=' AND l.status=$'+p.length; }
  if(start){ p.push(start); where+=' AND l.start_date >= $'+p.length; }
  if(end){ p.push(end); where+=' AND l.start_date <= $'+p.length; }
  if(search){ p.push('%'+search+'%'); where+=' AND (e.name ILIKE $'+p.length+' OR e.employee_code ILIKE $'+p.length+')'; }
  try{
    const cnt=await pool.query('SELECT COUNT(*) FROM leaves l JOIN employees e ON e.id=l.employee_id '+where,p);
    const data=await pool.query(
      `SELECT l.*, e.name, e.employee_code, e.position, u.username AS approved_by_name,
              (l.end_date - l.start_date + 1) AS jumlah_hari
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
  try{
    const r=await pool.query('UPDATE leaves SET status=$1, approved_by=$2 WHERE id=$3 RETURNING *',
      [st, st==='PENDING'? null : (req.user?.id||null), req.params.id]);
    if(!r.rows[0]) return res.status(404).json({error:'Pengajuan tidak ditemukan'});
    res.json({ ok:true, row:r.rows[0] });
  }catch(e){ res.status(500).json({error:e.message}); }
});


// Absensi saya bulan ini + status hari ini
router.get('/attendance/mine', async (req,res)=>{
  try{
    const empId = await myEmployeeId(req.user);
    if(!empId) return res.status(400).json({error:'Akun Anda belum tertaut ke data karyawan. Hubungi HR.'});
    const month = /^\d{4}-\d{2}$/.test(String(req.query.month||'')) ? req.query.month : new Date(Date.now()+7*3600*1000).toISOString().slice(0,7);
    const rows = await pool.query(
      `SELECT a.*,
              CASE WHEN a.check_in IS NOT NULL AND a.check_in::time > TIME '08:00' THEN true ELSE false END AS terlambat,
              CASE WHEN a.check_in IS NOT NULL AND a.check_out IS NOT NULL
                   THEN EXTRACT(EPOCH FROM (a.check_out - a.check_in))/3600 ELSE NULL END AS jam_kerja
       FROM attendances a WHERE a.employee_id=$1 AND to_char(a.date,'YYYY-MM')=$2 ORDER BY a.date DESC`,[empId, month]);
    const t = today();
    const todayRow = await pool.query('SELECT * FROM attendances WHERE employee_id=$1 AND date=$2',[empId, t]);
    const sum = rows.rows.reduce((acc,r)=>{ acc.hadir++; if(r.terlambat) acc.terlambat++; if(r.jam_kerja) acc.jam += parseFloat(r.jam_kerja); return acc; },{hadir:0,terlambat:0,jam:0});
    res.json({ month, today:t, today_row: todayRow.rows[0]||null, data:rows.rows, summary:{ hadir:sum.hadir, terlambat:sum.terlambat, jam:Math.round(sum.jam*10)/10 } });
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
router.get('/leaves/mine', async (req,res)=>{
  try{
    const empId = await myEmployeeId(req.user);
    if(!empId) return res.status(400).json({error:'Akun Anda belum tertaut ke data karyawan. Hubungi HR.'});
    const r = await pool.query(`SELECT l.*, (l.end_date - l.start_date + 1) AS jumlah_hari, u.username AS approved_by_name
      FROM leaves l LEFT JOIN users u ON u.id=l.approved_by LEFT JOIN employees e ON e.id=l.employee_id
      WHERE l.employee_id=$1 ORDER BY l.id DESC LIMIT 50`,[empId]);
    const year = new Date(Date.now() + 7*3600*1000).getFullYear(); // WIB
    const used = await pool.query("SELECT COALESCE(SUM(end_date - start_date + 1),0) AS days FROM leaves WHERE employee_id=$1 AND status='APPROVED' AND type='CUTI' AND EXTRACT(YEAR FROM start_date)=$2",[empId, year]);
    const q = await pool.query('SELECT COALESCE(leave_quota,12)::int AS q FROM employees WHERE id=$1',[empId]);
    const jatahTahunan = q.rows[0]?.q ?? JATAH_CUTI_TAHUNAN;
    const terpakai = parseInt(used.rows[0].days)||0;
    res.json({ data:r.rows, jatah:{ tahun:year, jatah:jatahTahunan, terpakai, sisa:Math.max(0, jatahTahunan-terpakai) } });
  }catch(e){ res.status(500).json({error:e.message}); }
});
router.post('/leaves/request', async (req,res)=>{
  const {type,start_date,end_date,reason}=req.body||{};
  if(!start_date||!end_date) return res.status(400).json({error:'Tanggal mulai dan tanggal selesai wajib diisi'});
  if(new Date(end_date) < new Date(start_date)) return res.status(400).json({error:'Tanggal selesai tidak boleh sebelum tanggal mulai'});
  try{
    const empId = await myEmployeeId(req.user);
    if(!empId) return res.status(400).json({error:'Akun Anda belum tertaut ke data karyawan. Hubungi HR.'});
    const r = await pool.query("INSERT INTO leaves (employee_id, type, start_date, end_date, reason, status) VALUES ($1,$2,$3,$4,$5,'PENDING') RETURNING id",[empId, type||'CUTI', start_date, end_date, reason||null]);
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

export default router;
