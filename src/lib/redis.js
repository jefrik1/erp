/**
 * Redis opsional (ioredis — dependency yang memang terpasang).
 * Kalau REDIS_URL kosong / Redis mati, semua fungsi jadi no-op (cache miss),
 * aplikasi tetap jalan tanpa error.
 */
import Redis from 'ioredis';

let client = null;
let disabled = false;
const memRevoked = new Map();

export function getRedis(){
  if(disabled) return null;
  if(client) return client;
  const url = process.env.REDIS_URL;
  if(!url) return null;
  try{
    client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times)=> times > 3 ? null : 400,
    });
    client.on('error', (e)=>{ console.warn('[redis]', e.message); });
    client.connect().catch(()=>{ disabled = true; client = null; });
    return client;
  }catch(e){
    console.warn('[redis] init gagal:', e.message);
    disabled = true;
    return null;
  }
}

export async function cacheGet(key){
  const r = getRedis(); if(!r) return null;
  try{ const v = await r.get(key); return v ? JSON.parse(v) : null; }catch{ return null; }
}

export async function cacheSet(key, val, ttlSeconds=30){
  const r = getRedis(); if(!r) return;
  try{ await r.set(key, JSON.stringify(val), 'EX', Math.max(1, ttlSeconds)); }catch{}
}

export async function cacheDel(key){
  const r = getRedis(); if(!r) return;
  try{ await r.del(key); }catch{}
}

export async function revokeToken(jti, ttlSeconds = 8 * 3600){
  if(!jti) return;
  memRevoked.set(jti, Date.now() + ttlSeconds * 1000);
  const r = getRedis();
  if(!r) return;
  try{ await r.set(`revoked_jwt:${jti}`, '1', 'EX', Math.max(60, ttlSeconds)); }catch{}
}

export async function isTokenRevoked(jti){
  if(!jti) return false;
  if(memRevoked.has(jti)){
    if(Date.now() > memRevoked.get(jti)){
      memRevoked.delete(jti);
    } else {
      return true;
    }
  }
  const r = getRedis();
  if(!r) return false;
  try{ const v = await r.get(`revoked_jwt:${jti}`); return v === '1'; }catch{ return false; }
}

export function redisStatus(){
  const r = getRedis();
  return { configured: !!process.env.REDIS_URL, connected: !!r && r.status === 'ready', status: r?.status || 'off' };
}
