/**
 * Error tracking ringan tanpa SDK:
 *  - simpan JSON line ke logs/errors-YYYY-MM-DD.log (mudah di-grep / dikirim ke Loki)
 *  - simpan 100 error terakhir di memori → GET /api/metrics/errors
 *  - opsional kirim ke ERROR_WEBHOOK_URL (Slack/Discord/Telegram gateway) dengan dedupe 60 detik
 *
 * Tidak menggantikan Sentry, tapi cukup untuk tahu ada 500 di produksi
 * tanpa menambah dependency.
 */
import fs from 'fs';
import path from 'path';

const LOG_DIR = path.resolve('logs');
const MAX_MEMORY = 100;
const DEDUPE_MS = 60_000;

const memory = [];
const lastSent = new Map();

function ensureDir(){
  try{ if(!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive:true }); }catch{}
}

function dayFile(d = new Date()){
  const s = d.toISOString().slice(0,10);
  return path.join(LOG_DIR, `errors-${s}.log`);
}

function writeLine(obj){
  ensureDir();
  try{ fs.appendFileSync(dayFile(), JSON.stringify(obj) + '\n'); }catch(e){ console.warn('[error-log] gagal tulis file:', e.message); }
}

async function notifyWebhook(payload){
  const url = process.env.ERROR_WEBHOOK_URL;
  if(!url) return;
  const key = (payload.message||'').slice(0,120) + '|' + (payload.path||'');
  const now = Date.now();
  if(lastSent.get(key) && now - lastSent.get(key) < DEDUPE_MS) return;
  lastSent.set(key, now);
  if(lastSent.size > 200) lastSent.clear();

  const text = [
    `🔴 *${payload.status || 500}* ${payload.method || ''} ${payload.path || ''}`,
    payload.message ? `> ${String(payload.message).slice(0,500)}` : '',
    payload.user ? `user: ${payload.user}` : '',
    payload.request_id ? `req: ${payload.request_id}` : '',
  ].filter(Boolean).join('\n');

  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), 3000);
  try{
    await fetch(url, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ text, content: text, ...payload }),
      signal: ctrl.signal,
    });
  }catch(e){
    console.warn('[error-log] webhook gagal:', e.message);
  }finally{
    clearTimeout(t);
  }
}

/**
 * Catat error. Dipanggil dari error handler Express & proses global.
 * @param {Error|string} err
 * @param {object} ctx { req, status, source, extra }
 */
export function logError(err, ctx = {}){
  const req = ctx.req;
  const entry = {
    at: new Date().toISOString(),
    status: ctx.status || 500,
    source: ctx.source || (req ? 'http' : 'process'),
    method: req?.method,
    path: req?.originalUrl || req?.url,
    message: err?.message || String(err),
    stack: (err?.stack || '').split('\n').slice(0, 8).join('\n'),
    user: req?.user?.username || req?.user?.id || null,
    ip: req?.ip || null,
    request_id: req?.requestId || req?.headers?.['x-request-id'] || null,
    extra: ctx.extra || null,
  };

  memory.push(entry);
  if(memory.length > MAX_MEMORY) memory.shift();
  writeLine(entry);

  // Jangan spam console untuk 4xx yang memang kesalahan client.
  if(entry.status >= 500 || entry.source === 'process'){
    console.error(`[error] ${entry.status} ${entry.method || ''} ${entry.path || ''} — ${entry.message}`);
  }

  void notifyWebhook(entry);
  void persistError(entry);
  return entry;
}

/* ── Penyimpanan permanen di PostgreSQL (grup per fingerprint) ─────────────── */
let tableReady = false;
async function ensureTable(){
  if(tableReady) return;
  const { pool } = await import('../config/db.js');
  await pool.query(`CREATE TABLE IF NOT EXISTS error_logs (
    id SERIAL PRIMARY KEY,
    fingerprint VARCHAR(64) NOT NULL UNIQUE,
    status INT,
    source VARCHAR(30),
    method VARCHAR(10),
    path TEXT,
    message TEXT,
    stack TEXT,
    username VARCHAR(60),
    ip VARCHAR(60),
    count INT NOT NULL DEFAULT 1,
    first_seen TIMESTAMP NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMP NOT NULL DEFAULT NOW(),
    resolved BOOLEAN NOT NULL DEFAULT false,
    resolved_by INT,
    resolved_at TIMESTAMP
  )`).catch(()=>{});
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_error_logs_open ON error_logs(resolved, last_seen DESC)`).catch(()=>{});
  tableReady = true;
}

async function persistError(entry){
  // 4xx bukan bug server — tidak perlu masuk daftar error yang harus dibereskan.
  if((entry.status || 500) < 500 && entry.source === 'http') return;
  try{
    await ensureTable();
    const { pool } = await import('../config/db.js');
    const crypto = await import('crypto');
    const fp = crypto.createHash('sha1')
      .update([entry.source, entry.status, entry.method, (entry.path||'').split('?')[0], entry.message].join('|'))
      .digest('hex');
    await pool.query(`INSERT INTO error_logs (fingerprint, status, source, method, path, message, stack, username, ip)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (fingerprint) DO UPDATE SET
        count = error_logs.count + 1,
        last_seen = NOW(),
        stack = EXCLUDED.stack,
        username = EXCLUDED.username,
        resolved = false,
        resolved_at = NULL`,
      [fp, entry.status, entry.source, entry.method, entry.path, entry.message, entry.stack, entry.user, entry.ip]);
  }catch(e){
    // Jangan pernah melempar dari jalur pencatatan error.
    console.warn('[error-log] gagal simpan ke DB:', e.message);
  }
}

export async function listErrors({ resolved=false, limit=100, search='' } = {}){
  await ensureTable();
  const { pool } = await import('../config/db.js');
  const params = [!!resolved];
  let where = 'WHERE resolved=$1';
  if(search){ params.push('%'+search+'%'); where += ` AND (message ILIKE $${params.length} OR path ILIKE $${params.length})`; }
  params.push(Math.min(500, Math.max(1, Number(limit)||100)));
  const r = await pool.query(`SELECT id, fingerprint, status, source, method, path, message, stack, username,
      count, first_seen, last_seen, resolved, resolved_at
      FROM error_logs ${where} ORDER BY last_seen DESC LIMIT $${params.length}`, params);
  return r.rows;
}

export async function resolveError(id, userId){
  await ensureTable();
  const { pool } = await import('../config/db.js');
  const r = await pool.query(`UPDATE error_logs SET resolved=true, resolved_by=$2, resolved_at=NOW()
    WHERE id=$1 RETURNING id, resolved`, [id, userId]);
  return r.rows[0] || null;
}

export async function errorSummary(){
  try{
    await ensureTable();
    const { pool } = await import('../config/db.js');
    const r = await pool.query(`SELECT
        COUNT(*) FILTER (WHERE NOT resolved) AS open_count,
        COUNT(*) FILTER (WHERE resolved) AS resolved_count,
        COALESCE(SUM(count) FILTER (WHERE NOT resolved),0) AS open_hits,
        MAX(last_seen) FILTER (WHERE NOT resolved) AS last_seen
      FROM error_logs`);
    return r.rows[0];
  }catch(e){
    return { open_count:0, resolved_count:0, open_hits:0, last_seen:null, error:e.message };
  }
}

export function recentErrors(limit = 50){
  return memory.slice(-Math.min(limit, MAX_MEMORY)).reverse();
}

export function errorStats(){
  const now = Date.now();
  const last1h = memory.filter(e => now - new Date(e.at).getTime() < 3600_000);
  const byPath = {};
  for(const e of last1h){
    const k = `${e.method || ''} ${(e.path||'').split('?')[0]}`;
    byPath[k] = (byPath[k] || 0) + 1;
  }
  return {
    total_in_memory: memory.length,
    last_1h: last1h.length,
    top_paths: Object.entries(byPath).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([path,count])=>({path,count})),
    last_error_at: memory.length ? memory[memory.length-1].at : null,
  };
}
