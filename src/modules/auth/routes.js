import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../../config/db.js';
import { auth } from '../../middleware/auth.js';
import { loginKey, loginLockRemaining, registerLoginFail, clearLoginFails, passwordProblem, LOCK_MINUTES } from '../../middleware/security.js';
import mfaRoutes from './mfa-routes.js';
const router = express.Router();
router.use('/mfa', mfaRoutes);

router.post('/login', async (req,res)=>{
  const { username, password } = req.body;
  if(!username||!password) return res.status(400).json({error:'Username & password required'});
  // Lockout: 5 kali gagal → tahan 15 menit (per username+IP), cegah brute force.
  const key = loginKey(req, username);
  const lockLeft = loginLockRemaining(key);
  if(lockLeft > 0){
    res.setHeader('Retry-After', String(lockLeft));
    return res.status(429).json({error:`Terlalu banyak percobaan gagal. Coba lagi dalam ${Math.ceil(lockLeft/60)} menit.`});
  }
  const u = await pool.query("SELECT u.*, b.name as branch_name, array_agg(r.name) as roles FROM users u LEFT JOIN branches b ON b.id=u.branch_id LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id WHERE u.username=$1 GROUP BY u.id, b.name",[username]);
  if(u.rows.length===0){
    const f = registerLoginFail(key);
    return res.status(401).json({error: f.locked? `Terlalu banyak percobaan gagal. Akun dikunci sementara ${Math.round(LOCK_MINUTES)} menit.` : 'User not found'});
  }
  const user = u.rows[0];
  if(!user.is_active) return res.status(403).json({error:'User disabled'});
  const ok = await bcrypt.compare(password, user.password_hash);
  if(!ok){
    const f = registerLoginFail(key);
    await pool.query("INSERT INTO audit_logs (user_id, action, entity_type, ip_address) VALUES ($1,'LOGIN_FAILED','AUTH',$2)",[user.id, String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'').slice(0,45)]).catch(()=>{});
    return res.status(401).json({error: f.locked? `Password salah ${f.count}× — akun dikunci sementara ${Math.round(LOCK_MINUTES)} menit.` : `Wrong password (sisa ${f.remaining} percobaan)`});
  }
  clearLoginFails(key);
  // MFA aktif → terbitkan token sementara (5 menit) untuk langkah verifikasi kode.
  if(user.mfa_enabled){
    const mfa_token = jwt.sign({ id:user.id, scope:'mfa' }, process.env.JWT_SECRET||'erp_jwt_super_secret_2024', { expiresIn:'5m' });
    return res.json({ mfa_required:true, mfa_token, username:user.username });
  }
  await pool.query('UPDATE users SET last_login=NOW() WHERE id=$1',[user.id]);
  await pool.query("INSERT INTO audit_logs (user_id, action, entity_type, ip_address) VALUES ($1,'LOGIN','AUTH',$2)",[user.id, String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'').slice(0,45)]).catch(()=>{});
  const roles = user.roles.filter(Boolean);
  const payload = { id:user.id, username:user.username, email:user.email, branch_id:user.branch_id, branch_name:user.branch_name, employee_id:user.employee_id, roles };
  const token = jwt.sign(payload, process.env.JWT_SECRET||'erp_jwt_super_secret_2024', {expiresIn:'8h'});
  const refresh = jwt.sign({id:user.id}, process.env.JWT_REFRESH_SECRET||'erp_refresh_secret_2024', {expiresIn:'7d'});
  res.json({ token, refresh, user: payload });
});

router.get('/me', async (req,res)=>{
  const h=req.headers.authorization;
  if(!h) return res.status(401).json({error:'No token'});
  try{
    const token=h.replace('Bearer ','');
    const p=jwt.verify(token, process.env.JWT_SECRET||'erp_jwt_super_secret_2024');
    res.json(p);
  }catch(e){ res.status(401).json({error:'Invalid'}); }
});

router.get('/users', auth, async (req,res)=>{
  const r=await pool.query("SELECT u.id,u.username,u.email,u.is_active,u.branch_id,b.name as branch_name, array_agg(r.name) as roles FROM users u LEFT JOIN branches b ON b.id=u.branch_id LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id GROUP BY u.id,b.name ORDER BY u.id");
  res.json(r.rows);
});

router.post('/users', auth, async (req,res)=>{
  const {username,email,password, branch_id, role_ids} = req.body;
  const hash = await bcrypt.hash(password||'password123',10);
  const ins = await pool.query('INSERT INTO users (username,email,password_hash,branch_id) VALUES ($1,$2,$3,$4) RETURNING id', [username,email,hash,branch_id||1]);
  const uid=ins.rows[0].id;
  if(role_ids && role_ids.length){
    for(const rid of role_ids) await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[uid,rid]);
  }
  res.json({id:uid});
});

router.get('/roles', auth, async (req,res)=>{
  const r=await pool.query('SELECT * FROM roles ORDER BY id');
  res.json(r.rows);
});


router.put('/users/:id', auth, async (req,res)=>{
  const id=parseInt(req.params.id);
  const {username,email,is_active,branch_id,role_ids}=req.body||{};
  try{
    if(username||email||is_active!==undefined||branch_id!==undefined){
      const sets=[]; const vals=[]; let i=1;
      if(username!==undefined){ sets.push('username=$'+i); vals.push(username); i++; }
      if(email!==undefined){ sets.push('email=$'+i); vals.push(email); i++; }
      if(is_active!==undefined){ sets.push('is_active=$'+i); vals.push(!!is_active); i++; }
      if(branch_id!==undefined){ sets.push('branch_id=$'+i); vals.push(parseInt(branch_id)||null); i++; }
      if(sets.length){ vals.push(id); await pool.query('UPDATE users SET '+sets.join(', ')+' WHERE id=$'+i, vals); }
    }
    if(Array.isArray(role_ids)){
      await pool.query('DELETE FROM user_roles WHERE user_id=$1',[id]);
      for(const rid of role_ids) await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[id, rid]);
    }
    if(req.body.password){
      const bcrypt=await import('bcryptjs');
      const hash=await bcrypt.default.hash(req.body.password,10);
      await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2',[hash,id]);
    }
    res.json({ok:true});
  }catch(e){ res.status(500).json({error:e.message}); }
});
router.delete('/users/:id', auth, async (req,res)=>{
  try{ await pool.query('UPDATE users SET is_active=false WHERE id=$1',[req.params.id]); res.json({ok:true}); }catch(e){ res.status(500).json({error:e.message}); }
});


// Ganti password sendiri (verifikasi password lama)
router.post('/change-password', auth, async (req,res)=>{
  const {old_password, new_password} = req.body||{};
  if(!old_password || !new_password) return res.status(400).json({error:'Password lama dan password baru wajib diisi'});
  const pwErr = passwordProblem(new_password);
  if(pwErr) return res.status(400).json({error: pwErr});
  if(String(old_password) === String(new_password)) return res.status(400).json({error:'Password baru tidak boleh sama dengan password lama'});
  try{
    const r = await pool.query('SELECT password_hash FROM users WHERE id=$1',[req.user.id]);
    if(!r.rows[0]) return res.status(404).json({error:'User tidak ditemukan'});
    const ok = await bcrypt.compare(old_password, r.rows[0].password_hash);
    if(!ok) return res.status(400).json({error:'Password lama salah'});
    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2',[hash, req.user.id]);
    res.json({ok:true});
  }catch(e){ res.status(500).json({error:e.message}); }
});

export default router;
