import express from 'express';
import { pool } from '../../config/db.js';
import { rbac } from '../../middleware/auth.js';
const router = express.Router();

// Baca: semua yang login (pengumuman aktif, belum kedaluwarsa).
router.get('/', async (req,res)=>{
  try{
    const r = await pool.query(
      `SELECT a.*, u.username AS created_by_name
       FROM announcements a LEFT JOIN users u ON u.id = a.created_by
       WHERE a.is_active = true AND (a.expires_at IS NULL OR a.expires_at >= CURRENT_DATE)
       ORDER BY a.id DESC LIMIT 50`);
    res.json(r.rows);
  }catch(e){ res.status(500).json({error:e.message}); }
});

// Kelola: HRD / direktur / super_admin.
const ADMIN = rbac('hrd','direktur','super_admin');

router.post('/', ADMIN, async (req,res)=>{
  const { title, body, category, expires_at } = req.body||{};
  if(!title || !body) return res.status(400).json({error:'Judul dan isi pengumuman wajib diisi'});
  try{
    const r = await pool.query(
      `INSERT INTO announcements (title, body, category, expires_at, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [title, body, category||'UMUM', expires_at||null, req.user?.id||null]);
    res.json({ ok:true, id:r.rows[0].id });
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.put('/:id', ADMIN, async (req,res)=>{
  const { title, body, category, expires_at, is_active } = req.body||{};
  try{
    const sets=[]; const vals=[]; let i=1;
    if(title!==undefined){ sets.push('title=$'+i); vals.push(title); i++; }
    if(body!==undefined){ sets.push('body=$'+i); vals.push(body); i++; }
    if(category!==undefined){ sets.push('category=$'+i); vals.push(category); i++; }
    if(expires_at!==undefined){ sets.push('expires_at=$'+i); vals.push(expires_at||null); i++; }
    if(is_active!==undefined){ sets.push('is_active=$'+i); vals.push(!!is_active); i++; }
    if(!sets.length) return res.status(400).json({error:'Tidak ada perubahan'});
    vals.push(req.params.id);
    await pool.query('UPDATE announcements SET '+sets.join(',')+' WHERE id=$'+i, vals);
    res.json({ ok:true });
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.delete('/:id', ADMIN, async (req,res)=>{
  try{ await pool.query('UPDATE announcements SET is_active=false WHERE id=$1',[req.params.id]); res.json({ ok:true }); }
  catch(e){ res.status(500).json({error:e.message}); }
});

export default router;
