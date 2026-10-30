import { pool } from '../config/db.js';
import { sendOutbound } from './message-provider.js';

/**
 * Worker antrian notifikasi: setiap menit mengirim pesan QUEUED yang sudah jatuh
 * tempo. Tanpa worker, pesan hanya menumpuk sampai user klik "Kirim Antrian".
 * Matikan dengan env OUTBOX_WORKER=0.
 */
let timer = null;
let running = false;

async function tick(){
  if(running) return;
  running = true;
  try{
    const due = await pool.query(`
      SELECT * FROM notification_outbox
       WHERE status='QUEUED' AND (scheduled_at IS NULL OR scheduled_at <= NOW())
       ORDER BY id LIMIT 20`);
    for(const m of due.rows){
      const out = await sendOutbound({ channel:m.channel, to:m.recipient, subject:m.subject, body:m.body });
      await pool.query(`UPDATE notification_outbox
          SET status=$1, attempts=COALESCE(attempts,0)+1, provider=$2, last_error=$3, sent_at=$4
        WHERE id=$5`,
        [out.ok? 'SENT':'FAILED', out.provider||null,
         out.ok? (out.note||out.response||null) : (out.error||'gagal'),
         out.ok? new Date() : null, m.id]);
    }
    if(due.rows.length) console.log(`[outbox] ${due.rows.length} pesan diproses`);
  }catch(e){
    console.warn('[outbox] error:', e.message);
  }finally{
    running = false;
  }
}

export function startOutboxWorker(intervalMs = 60_000){
  if(process.env.OUTBOX_WORKER === '0') return;
  if(timer) return;
  timer = setInterval(tick, intervalMs);
  if(timer.unref) timer.unref();
  const first = setTimeout(tick, 8_000);
  if(first.unref) first.unref();
  console.log(`[outbox] worker aktif (setiap ${Math.round(intervalMs/1000)} detik)`);
}

export function stopOutboxWorker(){
  if(timer){ clearInterval(timer); timer = null; }
}
