/**
 * Antrian transaksi POS saat koneksi putus (IndexedDB, tanpa dependency).
 * Setiap entri membawa `client_ref` unik yang juga dikirim ke server, jadi
 * pengiriman ulang tidak membuat penjualan ganda (backend men-dedupe).
 */
const DB_NAME = 'erp-offline';
const STORE = 'pos-queue';
const VERSION = 1;

function openDB(){
  return new Promise((resolve, reject)=>{
    if(typeof indexedDB === 'undefined') return reject(new Error('IndexedDB tidak tersedia'));
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = ()=>{
      const db = req.result;
      if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath:'id' });
    };
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error);
  });
}

async function tx(mode, fn){
  const db = await openDB();
  return new Promise((resolve, reject)=>{
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let out;
    try{ out = fn(store); }catch(e){ reject(e); return; }
    t.oncomplete = ()=>resolve(out?.result ?? out);
    t.onerror = ()=>reject(t.error);
    t.onabort = ()=>reject(t.error);
  });
}

export function newClientRef(){
  if(typeof crypto !== 'undefined' && crypto.randomUUID) return 'POS-'+crypto.randomUUID();
  return 'POS-'+Date.now()+'-'+Math.random().toString(36).slice(2,10);
}

export async function enqueue(payload){
  const item = { id: payload.client_ref || newClientRef(), payload: { ...payload, client_ref: payload.client_ref || undefined }, at: new Date().toISOString(), tries: 0 };
  item.payload.client_ref = item.id;
  await tx('readwrite', (store)=>store.put(item));
  return item;
}

export async function listQueue(){
  const db = await openDB();
  return new Promise((resolve, reject)=>{
    const t = db.transaction(STORE, 'readonly');
    const req = t.objectStore(STORE).getAll();
    req.onsuccess = ()=>resolve((req.result||[]).sort((a,b)=> String(a.at).localeCompare(String(b.at))));
    req.onerror = ()=>reject(req.error);
  });
}

export async function removeItem(id){
  await tx('readwrite', (store)=>store.delete(id));
}

export async function queueCount(){
  try{ return (await listQueue()).length; }catch{ return 0; }
}

/**
 * Kirim semua antrian lewat `sender(payload)`.
 * Berhenti pada kegagalan jaringan pertama (biar urutan tetap).
 * @returns {{sent:number, failed:number, remaining:number}}
 */
export async function flushQueue(sender){
  const items = await listQueue();
  let sent = 0, failed = 0;
  for(const item of items){
    try{
      await sender(item.payload);
      await removeItem(item.id);
      sent++;
    }catch(e){
      failed++;
      // 4xx = data ditolak server (bukan masalah jaringan) → jangan ulang terus.
      if(e?.response && e.response.status >= 400 && e.response.status < 500){
        await tx('readwrite', (store)=>store.put({ ...item, tries:(item.tries||0)+1, lastError: e.response?.data?.error || 'ditolak server' }));
        continue;
      }
      break;
    }
  }
  return { sent, failed, remaining: (await listQueue()).length };
}
