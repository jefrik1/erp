/**
 * Hardening dengan dukungan Redis terdistribusi dan in-memory fallback.
 * - createRateLimiter: pembatas request per IP (Redis cluster-safe, fallback in-memory).
 * - Login lockout: 5 kali gagal → tahan 15 menit (per username+IP).
 * - corsOrigins: whitelist origin dari env ALLOWED_ORIGINS.
 */
import { getRedis } from '../lib/redis.js';

const now = () => Date.now();

export function createRateLimiter({ windowMs = 60_000, max = 120, name = 'rl', keyFn } = {}){
  // RATE_LIMIT_DISABLED=1 hanya dihormati di luar produksi. Dipakai test otomatis
  // dan verifikasi UI lokal: tanpa ini, 40+ login berturut-turut memicu 429 dan
  // membuat test flaky (temuan INF-5/INF-7). Di produksi flag ini diabaikan.
  const disabled = process.env.RATE_LIMIT_DISABLED === '1' && process.env.NODE_ENV !== 'production';
  const hits = new Map(); // in-memory fallback: key -> { count, reset }
  const timer = setInterval(()=>{
    const t = now();
    for(const [k,v] of hits) if(v.reset <= t) hits.delete(k);
  }, Math.max(30_000, Math.floor(windowMs/2)));
  if(timer.unref) timer.unref();

  return async function rateLimiter(req, res, next){
    if(disabled) return next();
    // Jangan batasi preflight CORS & health check.
    if(req.method === 'OPTIONS' || req.path === '/api/health') return next();
    const key = name + '|' + (keyFn ? keyFn(req) : (req.ip || req.socket?.remoteAddress || 'unknown'));
    const t = now();

    const redis = getRedis();
    if(redis && redis.status === 'ready'){
      try{
        const rKey = `rl:${name}:${key}`;
        const count = await redis.incr(rKey);
        if(count === 1){
          await redis.pexpire(rKey, windowMs);
        }
        const pttl = await redis.pttl(rKey);
        const retrySec = Math.max(1, Math.ceil((pttl > 0 ? pttl : windowMs) / 1000));
        res.setHeader('X-RateLimit-Limit', String(max));
        res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - count)));
        if(count > max){
          res.setHeader('Retry-After', String(retrySec));
          return res.status(429).json({ error: `Terlalu banyak permintaan. Coba lagi dalam ${retrySec} detik.` });
        }
        return next();
      }catch(_e){
        // fallback in-memory jika redis mengalami kendala
      }
    }

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
const fails = new Map(); // in-memory fallback: key -> { count, until }

export function loginKey(req, username){
  const ip = String(req.headers['x-forwarded-for'] || req.ip || req.socket?.remoteAddress || '').split(',')[0].trim();
  return `${String(username||'').toLowerCase()}|${ip}`;
}

export async function loginLockRemaining(key){
  const redis = getRedis();
  if(redis && redis.status === 'ready'){
    try{
      const ttl = await redis.ttl(`lockout:${key}`);
      return ttl > 0 ? ttl : 0;
    }catch(_e){}
  }
  const rec = fails.get(key);
  if(!rec) return 0;
  // until=0 berarti baru gagal beberapa kali (belum terkunci) — JANGAN dihapus,
  // kalau dihapus hitungan gagal akan selalu reset dan lockout tidak pernah aktif.
  if(rec.until > 0 && rec.until <= now()){ fails.delete(key); return 0; }
  return rec.until > 0 ? Math.ceil((rec.until - now())/1000) : 0;
}

export async function registerLoginFail(key){
  const redis = getRedis();
  if(redis && redis.status === 'ready'){
    try{
      const failKey = `fails:${key}`;
      const count = await redis.incr(failKey);
      if(count === 1) await redis.expire(failKey, LOCK_MINUTES * 60);
      const isLocked = count >= MAX_FAILS;
      if(isLocked){
        await redis.set(`lockout:${key}`, '1', 'EX', LOCK_MINUTES * 60);
      }
      return { count, remaining: Math.max(0, MAX_FAILS - count), locked: isLocked };
    }catch(_e){}
  }
  const rec = fails.get(key) || { count: 0, until: 0 };
  rec.count += 1;
  if(rec.count >= MAX_FAILS) rec.until = now() + LOCK_MS;
  fails.set(key, rec);
  return { count: rec.count, remaining: Math.max(0, MAX_FAILS - rec.count), locked: rec.count >= MAX_FAILS };
}

export async function clearLoginFails(key){
  const redis = getRedis();
  if(redis && redis.status === 'ready'){
    try{
      await redis.del(`fails:${key}`, `lockout:${key}`);
    }catch(_e){}
  }
  fails.delete(key);
}

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
