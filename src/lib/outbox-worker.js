import { pool } from '../config/db.js';
import { sendOutbound } from './message-provider.js';

/**
 * Worker antrian notifikasi multi-instance safe:
 * Menggunakan transaksi atomik dengan FOR UPDATE SKIP LOCKED sehingga beberapa
 * replica backend yang berjalan bersamaan tidak akan memproses atau mengirim pesan ganda.
 * Matikan dengan env OUTBOX_WORKER=0.
 */
let timer = null;
let running = false;

async function tick(){
  if(running) return;
  running = true;
  const client = await pool.connect();
  try{
    await client.query('BEGIN');
    const claim = await client.query(`
      SELECT id, channel, recipient, subject, body
        FROM notification_outbox
       WHERE status='QUEUED' AND (scheduled_at IS NULL OR scheduled_at <= NOW())
       ORDER BY id
       LIMIT 20
       FOR UPDATE SKIP LOCKED
    `);

    if(claim.rows.length === 0){
      await client.query('COMMIT');
      return;
    }

    const ids = claim.rows.map(r => r.id);
    await client.query(`
      UPDATE notification_outbox
         SET status = 'PROCESSING', attempts = COALESCE(attempts, 0) + 1
       WHERE id = ANY($1)
    `, [ids]);
    await client.query('COMMIT');

    for(const m of claim.rows){
      const out = await sendOutbound({ channel:m.channel, to:m.recipient, subject:m.subject, body:m.body });
      await pool.query(`UPDATE notification_outbox
          SET status=$1, provider=$2, last_error=$3, sent_at=$4
        WHERE id=$5`,
        [out.ok ? 'SENT' : 'FAILED', out.provider || null,
         out.ok ? (out.note || out.response || null) : (out.error || 'gagal'),
         out.ok ? new Date() : null, m.id]);
    }
    console.log(`[outbox] ${claim.rows.length} pesan diproses`);
  }catch(e){
    try{ await client.query('ROLLBACK'); }catch{}
    console.warn('[outbox] error:', e.message);
  }finally{
    client.release();
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
