import express from 'express';
import { pool } from '../../config/db.js';
import { sendReport } from '../../lib/exporters.js';
const router=express.Router();
router.get('/', async(req,res)=>{
  const status=String(req.query.status||'PENDING').toUpperCase();
  const allowed=['PENDING','APPROVED','REJECTED','DELEGATED','CANCELLED'];
  const st=allowed.includes(status)? status : 'PENDING';
  const mine=req.query.mine==='true';
  if(mine){
    const r=await pool.query("SELECT ar.*, u1.username as requester_name, u2.username as approver_name, u3.username as delegated_name FROM approval_requests ar LEFT JOIN users u1 ON u1.id=ar.requester_id LEFT JOIN users u2 ON u2.id=ar.approver_id LEFT JOIN users u3 ON u3.id=ar.delegated_to WHERE ar.status=$1 AND ar.approver_id=$2 ORDER BY ar.id DESC LIMIT 50",[st, req.user.id]);
    return res.json(r.rows);
  }
  const r=await pool.query("SELECT ar.*, u1.username as requester_name, u2.username as approver_name, u3.username as delegated_name FROM approval_requests ar LEFT JOIN users u1 ON u1.id=ar.requester_id LEFT JOIN users u2 ON u2.id=ar.approver_id LEFT JOIN users u3 ON u3.id=ar.delegated_to WHERE ar.status=$1 ORDER BY ar.id DESC LIMIT 50",[st]);
  res.json(r.rows);
});
router.post('/request', async(req,res)=>{
  const {entity_type,entity_id,approver_id,level}=req.body;
  const ins=await pool.query('INSERT INTO approval_requests (entity_type,entity_id,requester_id,approver_id,level) VALUES ($1,$2,$3,$4,$5) RETURNING id',[entity_type,entity_id,req.user.id,approver_id||1,level||1]);
  // push notif mock
  res.json({id:ins.rows[0].id});
});
router.post('/:id/approve', async(req,res)=>{
  await pool.query("UPDATE approval_requests SET status='APPROVED', responded_at=NOW(), notes=$1 WHERE id=$2",[req.body.notes,req.params.id]);
  // auto update entity status
  const ar=await pool.query('SELECT * FROM approval_requests WHERE id=$1',[req.params.id]);
  if(ar.rows[0]) {
    const e=ar.rows[0];
    if(e.entity_type==='SALES_ORDER') await pool.query("UPDATE sales_orders SET status='APPROVED' WHERE id=$1",[e.entity_id]);
    if(e.entity_type==='PURCHASE_ORDER') await pool.query("UPDATE purchase_orders SET status='APPROVED' WHERE id=$1",[e.entity_id]);
    if(e.entity_type==='WASTE') await pool.query("UPDATE waste_logs SET status='APPROVED' WHERE id=$1",[e.entity_id]);
  }
  res.json({ok:true});
});
router.post('/:id/reject', async(req,res)=>{
  await pool.query("UPDATE approval_requests SET status='REJECTED', responded_at=NOW(), notes=$1 WHERE id=$2",[req.body.notes,req.params.id]);
  res.json({ok:true});
});
router.post('/:id/delegate', async(req,res)=>{
  await pool.query("UPDATE approval_requests SET status='DELEGATED', delegated_to=$1 WHERE id=$2",[req.body.delegated_to,req.params.id]);
  // create new delegated request
  const ar=await pool.query('SELECT * FROM approval_requests WHERE id=$1',[req.params.id]);
  await pool.query('INSERT INTO approval_requests (entity_type,entity_id,requester_id,approver_id,level,status) VALUES ($1,$2,$3,$4,$5,\'PENDING\')',[ar.rows[0].entity_type, ar.rows[0].entity_id, ar.rows[0].requester_id, req.body.delegated_to, ar.rows[0].level]);
  res.json({ok:true});
});

router.get('/export', async (req,res)=>{
  const format=String(req.query.format||'xlsx').toLowerCase();
  if(!['csv','xlsx','pdf'].includes(format)) return res.status(400).json({error:'Format tidak didukung: '+format});
  try{
    const st=String(req.query.status||'PENDING').toUpperCase();
    const r=await pool.query("SELECT ar.*, u1.username as requester_name, u2.username as approver_name FROM approval_requests ar LEFT JOIN users u1 ON u1.id=ar.requester_id LEFT JOIN users u2 ON u2.id=ar.approver_id WHERE ar.status=$1 ORDER BY ar.id DESC LIMIT 2000",[st]);
    const columns=[{label:'ID'},{label:'Tipe'},{label:'Entity'},{label:'Pemohon'},{label:'Approver'},{label:'Status'},{label:'Tanggal'}];
    const rows=r.rows.map(a=>[a.id, a.entity_type, a.entity_id, a.requester_name||'-', a.approver_name||'-', a.status, String(a.created_at||'').slice(0,19).replace('T',' ')]);
    return sendReport(res,{format,filename:'approval-'+st.toLowerCase(),payload:{title:'Daftar Approval',subtitle:`${rows.length} request status ${st}`,columns,rows,sheetName:'Approval'}});
  }catch(e){ res.status(500).json({error:e.message}); }
});

export default router;
