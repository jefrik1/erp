import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../../config/db.js';
const router = express.Router();

router.post('/login', async (req,res)=>{
  const { username, password } = req.body;
  if(!username||!password) return res.status(400).json({error:'Username & password required'});
  const u = await pool.query("SELECT u.*, array_agg(r.name) as roles FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id WHERE u.username=$1 GROUP BY u.id",[username]);
  if(u.rows.length===0) return res.status(401).json({error:'User not found'});
  const user = u.rows[0];
  if(!user.is_active) return res.status(403).json({error:'User disabled'});
  const ok = await bcrypt.compare(password, user.password_hash);
  if(!ok) return res.status(401).json({error:'Wrong password'});
  await pool.query('UPDATE users SET last_login=NOW() WHERE id=$1',[user.id]);
  const roles = user.roles.filter(Boolean);
  const payload = { id:user.id, username:user.username, email:user.email, branch_id:user.branch_id, roles };
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

router.get('/users', async (req,res)=>{
  const r=await pool.query("SELECT u.id,u.username,u.email,u.is_active,u.branch_id,b.name as branch_name, array_agg(r.name) as roles FROM users u LEFT JOIN branches b ON b.id=u.branch_id LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id GROUP BY u.id,b.name ORDER BY u.id");
  res.json(r.rows);
});

router.post('/users', async (req,res)=>{
  const {username,email,password, branch_id, role_ids} = req.body;
  const hash = await bcrypt.hash(password||'password123',10);
  const ins = await pool.query('INSERT INTO users (username,email,password_hash,branch_id) VALUES ($1,$2,$3,$4) RETURNING id', [username,email,hash,branch_id||1]);
  const uid=ins.rows[0].id;
  if(role_ids && role_ids.length){
    for(const rid of role_ids) await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[uid,rid]);
  }
  res.json({id:uid});
});

router.get('/roles', async (req,res)=>{
  const r=await pool.query('SELECT * FROM roles ORDER BY id');
  res.json(r.rows);
});

export default router;
