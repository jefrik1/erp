/**
 * Redis opsional (ioredis — dependency yang memang terpasang).
 * Kalau REDIS_URL kosong / Redis mati, semua fungsi jadi no-op (cache miss),
 * aplikasi tetap jalan tanpa error.
 */
import Redis from 'ioredis';

let client = null;
let disabled = false;

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

export function redisStatus(){
  const r = getRedis();
  return { configured: !!process.env.REDIS_URL, connected: !!r && r.status === 'ready', status: r?.status || 'off' };
}
