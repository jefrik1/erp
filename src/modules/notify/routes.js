import express from 'express';
import { pool } from '../../config/db.js';
import { sendOutbound, renderTemplate, providerStatus } from '../../lib/message-provider.js';

const router = express.Router();

/* ─────────────────────────────────────────────────────────────────────────────
   PUSAT NOTIFIKASI — outbox pesan keluar (WA/Email/SMS) + template.
   Semua pesan masuk antrian dulu (QUEUED), lalu dikirim satu-satu / massal.
   Status jujur: kalau gateway belum diset, pesan ditandai SENT dengan
   provider='console' + catatan bahwa pesan TIDAK benar-benar terkirim.
   ───────────────────────────────────────────────────────────────────────────── */

let ensured = false;
async function ensureTables(){
  if(ensured) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS notification_outbox (
    id SERIAL PRIMARY KEY,
    channel VARCHAR(10) NOT NULL DEFAULT 'WA',
    recipient VARCHAR(120),
    subject VARCHAR(200),
    body TEXT,
    template_key VARCHAR(60),
    ref_type VARCHAR(30),
    ref_id INT,
    status VARCHAR(15) NOT NULL DEFAULT 'QUEUED',
    attempts INT DEFAULT 0,
    provider VARCHAR(20),
    last_error TEXT,
    scheduled_at TIMESTAMP,
    sent_at TIMESTAMP,
    created_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
  )`).catch(()=>{});
  await pool.query(`CREATE TABLE IF NOT EXISTS notification_templates (
    key VARCHAR(60) PRIMARY KEY,
    name VARCHAR(120),
    channel VARCHAR(10) DEFAULT 'WA',
    subject VARCHAR(200),
    body TEXT,
    active BOOLEAN DEFAULT true,
    updated_at TIMESTAMP DEFAULT NOW()
  )`).catch(()=>{});
  const seed = [
    ['ar_reminder','Pengingat piutang','WA','Pengingat Invoice {{invoice}}','Halo {{customer}}, invoice {{invoice}} sebesar Rp {{amount}} jatuh tempo {{due_date}}. Mohon segera diselesaikan. Terima kasih — PT Sumber Material Jaya'],
    ['so_created','SO dibuat','WA','Order {{so}} diterima','Terima kasih {{customer}}, pesanan {{so}} sudah kami terima dan sedang diproses.'],
    ['do_shipped','Barang dikirim','WA','Pengiriman {{do}}','{{customer}}, pesanan {{so}} sedang dikirim dengan {{vehicle}}. Surat jalan: {{do}}.'],
    ['invoice_paid','Pembayaran diterima','WA','Pembayaran diterima','Terima kasih {{customer}}, pembayaran invoice {{invoice}} sebesar Rp {{amount}} sudah kami terima.'],
    ['approval_pending','Approval menunggu','EMAIL','Approval menunggu: {{title}}','Ada pengajuan {{title}} dari {{requester}} yang menunggu persetujuan Anda.'],
    ['attendance_late','Keterlambatan','EMAIL','Rekap keterlambatan {{period}}','Terdapat {{count}} kejadian keterlambatan pada {{period}}. Buka HR → Keterlambatan untuk detail.'],
  ];
  for(const [key,name,ch,subj,body] of seed){
    await pool.query(`INSERT INTO notification_templates (key,name,channel,subject,body) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (key) DO NOTHING`, [key,name,ch,subj,body]).catch(()=>{});
  }
  ensured = true;
}

// GET /notify/status → provider yang aktif (jujur: console = belum kirim beneran)
router.get('/status', async (req,res)=> res.json({ ...providerStatus(), note:'console = pesan hanya dicatat di outbox, belum terkirim ke penerima.' }));

// GET /notify/outbox?status=&channel=&limit=
router.get('/outbox', async (req,res)=>{
  await ensureTables();
  try{
    const { status, channel } = req.query;
    const limit = Math.min(parseInt(req.query.limit||'100')||100, 300);
    let where='WHERE 1=1'; const p=[];
    if(status && status!=='Semua'){ p.push(status); where+=` AND o.status=$${p.length}`; }
    if(channel && channel!=='Semua'){ p.push(channel); where+=` AND o.channel=$${p.length}`; }
    const r = await pool.query(`SELECT o.*, u.username AS created_by_name FROM notification_outbox o
      LEFT JOIN users u ON u.id=o.created_by ${where} ORDER BY o.id DESC LIMIT ${limit}`, p);
    const stats = await pool.query(`SELECT status, COUNT(*)::int AS n FROM notification_outbox GROUP BY status`);
    res.json({ data:r.rows, stats: stats.rows.reduce((a,x)=>({...a,[x.status]:x.n}),{}) });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// POST /notify/outbox { channel, recipient, subject, body, template_key?, ref_type?, ref_id?, scheduled_at? }
router.post('/outbox', async (req,res)=>{
  await ensureTables();
  const channel = String(req.body?.channel||'WA').toUpperCase();
  const recipient = String(req.body?.recipient||'').trim();
  const body = String(req.body?.body||'').trim();
  if(!recipient) return res.status(400).json({error:'Tujuan (nomor/email) wajib diisi'});
  if(!body) return res.status(400).json({error:'Isi pesan wajib diisi'});
  try{
    const r = await pool.query(`INSERT INTO notification_outbox (channel, recipient, subject, body, template_key, ref_type, ref_id, status, scheduled_at, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'QUEUED',$8,$9) RETURNING *`,
      [channel, recipient, req.body?.subject||null, body, req.body?.template_key||null, req.body?.ref_type||null, req.body?.ref_id||null, req.body?.scheduled_at||null, req.user.id]);
    res.json({ ok:true, data:r.rows[0] });
  }catch(e){ res.status(500).json({error:e.message}); }
});

async function sendOne(id){
  const r = await pool.query('SELECT * FROM notification_outbox WHERE id=$1',[id]);
  const msg = r.rows[0];
  if(!msg) throw new Error('Pesan tidak ditemukan');
  if(msg.status==='SENT') return { ok:true, skipped:true, note:'Sudah terkirim sebelumnya' };
  const out = await sendOutbound({ channel:msg.channel, to:msg.recipient, subject:msg.subject, body:msg.body });
  await pool.query(`UPDATE notification_outbox SET status=$1, attempts=COALESCE(attempts,0)+1, provider=$2, last_error=$3, sent_at=$4 WHERE id=$5`,
    [out.ok? 'SENT':'FAILED', out.provider||null, out.ok? (out.note||out.response||null) : (out.error||'gagal'), out.ok? new Date() : null, id]);
  return { ...out, id };
}

// POST /notify/outbox/:id/send
router.post('/outbox/:id/send', async (req,res)=>{
  await ensureTables();
  try{ res.json({ ok:true, result: await sendOne(req.params.id) }); }
  catch(e){ res.status(500).json({error:e.message}); }
});

// POST /notify/outbox/send-pending  { limit? }
router.post('/outbox/send-pending', async (req,res)=>{
  await ensureTables();
  const limit = Math.min(parseInt(req.body?.limit||'20')||20, 50);
  try{
    const q = await pool.query(`SELECT id FROM notification_outbox WHERE status='QUEUED' AND (scheduled_at IS NULL OR scheduled_at <= NOW()) ORDER BY id LIMIT ${limit}`);
    const results = [];
    for(const row of q.rows) results.push(await sendOne(row.id));
    res.json({ ok:true, processed: results.length, sent: results.filter(r=>r.ok).length, failed: results.filter(r=>!r.ok).length, results });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// POST /notify/outbox/:id/retry
router.post('/outbox/:id/retry', async (req,res)=>{
  await ensureTables();
  try{
    await pool.query(`UPDATE notification_outbox SET status='QUEUED', last_error=NULL WHERE id=$1`,[req.params.id]);
    res.json({ ok:true, result: await sendOne(req.params.id) });
  }catch(e){ res.status(500).json({error:e.message}); }
});

router.delete('/outbox/:id', async (req,res)=>{
  await ensureTables();
  try{ await pool.query('DELETE FROM notification_outbox WHERE id=$1',[req.params.id]); res.json({ ok:true }); }
  catch(e){ res.status(500).json({error:e.message}); }
});

// Templates
router.get('/templates', async (req,res)=>{
  await ensureTables();
  try{ const r = await pool.query('SELECT * FROM notification_templates ORDER BY key'); res.json(r.rows); }
  catch(e){ res.status(500).json({error:e.message}); }
});

router.put('/templates/:key', async (req,res)=>{
  await ensureTables();
  const { name, channel, subject, body, active } = req.body||{};
  try{
    const r = await pool.query(`UPDATE notification_templates SET name=COALESCE($2,name), channel=COALESCE($3,channel),
        subject=COALESCE($4,subject), body=COALESCE($5,body), active=COALESCE($6,active), updated_at=NOW()
      WHERE key=$1 RETURNING *`, [req.params.key, name||null, channel||null, subject||null, body||null, active==null? null : !!active]);
    if(!r.rows[0]) return res.status(404).json({error:'Template tidak ditemukan'});
    res.json({ ok:true, data:r.rows[0] });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// POST /notify/templates/:key/queue { to, vars, ref_type?, ref_id? }
router.post('/templates/:key/queue', async (req,res)=>{
  await ensureTables();
  const to = String(req.body?.to||'').trim();
  if(!to) return res.status(400).json({error:'Tujuan wajib diisi'});
  try{
    const t = await pool.query('SELECT * FROM notification_templates WHERE key=$1 AND active=true',[req.params.key]);
    if(!t.rows[0]) return res.status(404).json({error:'Template tidak aktif / tidak ditemukan'});
    const tpl = t.rows[0];
    const body = renderTemplate(tpl.body, req.body?.vars||{});
    const subject = tpl.subject ? renderTemplate(tpl.subject, req.body?.vars||{}) : null;
    const r = await pool.query(`INSERT INTO notification_outbox (channel, recipient, subject, body, template_key, ref_type, ref_id, status, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'QUEUED',$8) RETURNING *`,
      [tpl.channel, to, subject, body, tpl.key, req.body?.ref_type||null, req.body?.ref_id||null, req.user.id]);
    res.json({ ok:true, data:r.rows[0] });
  }catch(e){ res.status(500).json({error:e.message}); }
});

export default router;
