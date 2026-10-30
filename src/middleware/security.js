/**
 * Hardening ringan tanpa dependency tambahan.
 * - createRateLimiter: pembatas request per IP (in-memory, sliding window sederhana).
 * - Login lockout: 5 kali gagal → tahan 15 menit (per username+IP).
 * - corsOrigins: whitelist origin dari env ALLOWED_ORIGINS.
 *
 * Catatan: in-memory = per proses. Kalau nanti di-scale ke beberapa instance,
 * ganti Map dengan Redis (ioredis sudah ada di dependency).
 */

const now = () => Date.now();

export function createRateLimiter({ windowMs = 60_000, max = 120, name = 'rl', keyFn } = {}){
  const hits = new Map(); // key -> { count, reset }
  const timer = setInterval(()=>{
    const t = now();
    for(const [k,v] of hits) if(v.reset <= t) hits.delete(k);
  }, Math.max(30_000, Math.floor(windowMs/2)));
  if(timer.unref) timer.unref();

  return function rateLimiter(req, res, next){
    // Jangan batasi preflight CORS & health check.
    if(req.method === 'OPTIONS' || req.path === '/api/health') return next();
    const key = name + '|' + (keyFn ? keyFn(req) : (req.ip || req.socket?.remoteAddress || 'unknown'));
    const t = now();
    let rec = hits.get(key);
    if(!rec || rec.reset <= t){ rec = { count: 0, reset: t + windowMs }; hits.set(key, rec); }
    rec.count += 1;
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - rec.count)));
    if(rec.count > max){
      const retry = Math.max(1, Math.ceil((rec.reset - t)/1000));
      res.setHeader('Retry-After', String(retry));
      return res.status(429).json({ error: `Terlalu banyak permintaan. Coba lagi dalam ${retry} detik.` });
    }
    next();
  };
}

/* ── Login lockout ─────────────────────────────────────────────────────────── */
const MAX_FAILS = parseInt(process.env.LOGIN_MAX_FAILS || '5', 10);
export const LOCK_MINUTES = parseInt(process.env.LOGIN_LOCK_MINUTES || '15', 10);
const LOCK_MS = LOCK_MINUTES * 60_000;
const fails = new Map(); // key -> { count, until }

export function loginKey(req, username){
  const ip = String(req.headers['x-forwarded-for'] || req.ip || req.socket?.remoteAddress || '').split(',')[0].trim();
  return `${String(username||'').toLowerCase()}|${ip}`;
}

export function loginLockRemaining(key){
  const rec = fails.get(key);
  if(!rec) return 0;
  // until=0 berarti baru gagal beberapa kali (belum terkunci) — JANGAN dihapus,
  // kalau dihapus hitungan gagal akan selalu reset dan lockout tidak pernah aktif.
  if(rec.until > 0 && rec.until <= now()){ fails.delete(key); return 0; }
  return rec.until > 0 ? Math.ceil((rec.until - now())/1000) : 0;
}

export function registerLoginFail(key){
  const rec = fails.get(key) || { count: 0, until: 0 };
  rec.count += 1;
  if(rec.count >= MAX_FAILS) rec.until = now() + LOCK_MS;
  fails.set(key, rec);
  return { count: rec.count, remaining: Math.max(0, MAX_FAILS - rec.count), locked: rec.count >= MAX_FAILS };
}

export function clearLoginFails(key){ fails.delete(key); }

/* ── CORS ──────────────────────────────────────────────────────────────────── */
export function corsOrigins(){
  const raw = String(process.env.ALLOWED_ORIGINS || '').trim();
  if(raw) return raw.split(',').map(s=>s.trim()).filter(Boolean);
  // Default aman untuk pengembangan lokal (Vite dev + preview + nginx lokal).
  return ['http://localhost:5173','http://127.0.0.1:5173','http://localhost:5174','http://127.0.0.1:5174','http://localhost'];
}

export function originAllowed(origin, list){
  if(!origin) return true;                    // curl / server-to-server / same-origin
  try{
    const u = new URL(origin);
    if(list.includes(origin)) return true;
    // izinkan host yang sama walau port berbeda hanya bila didaftarkan eksplisit
    return list.some(o => { try{ const x=new URL(o); return x.hostname===u.hostname && x.port===u.port; }catch{ return false; } });
  }catch{ return false; }
}

/* ── Password policy ───────────────────────────────────────────────────────── */
export function passwordProblem(pw){
  const s = String(pw||'');
  if(s.length < 8) return 'Password minimal 8 karakter';
  if(!/[A-Za-z]/.test(s)) return 'Password harus mengandung huruf';
  if(!/[0-9]/.test(s)) return 'Password harus mengandung angka';
  if(/^(password|12345678|qwerty12|admin123|kasir123)$/i.test(s)) return 'Password terlalu mudah ditebak';
  return null;
}
