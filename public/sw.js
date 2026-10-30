/* Service worker ERP SMJ — app shell offline.
   - API: network-only (data keuangan tidak boleh basi/tersimpan lama).
   - Aset ber-hash (Vite): cache-first.
   - Navigasi: network-first, fallback ke cache, lalu /offline.html.
*/
const VERSION = 'erp-v1';
const SHELL = ['/', '/index.html', '/offline.html', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL).catch(()=>{})).then(()=>self.skipWaiting()));
});

self.addEventListener('activate', (e)=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch', (e)=>{
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return;
  if(url.pathname.startsWith('/api/')) return; // jangan pernah cache API

  if(req.mode === 'navigate'){
    e.respondWith(
      fetch(req).then(res=>{
        const copy = res.clone();
        caches.open(VERSION).then(c=>c.put(req, copy)).catch(()=>{});
        return res;
      }).catch(async ()=>{
        const cached = await caches.match(req);
        return cached || caches.match('/offline.html') || new Response('Offline', {status:503});
      })
    );
    return;
  }

  if(/\/assets\/.*\.(js|css|woff2?|png|jpg|svg)$/.test(url.pathname)){
    e.respondWith(
      caches.match(req).then(hit=> hit || fetch(req).then(res=>{
        const copy = res.clone();
        caches.open(VERSION).then(c=>c.put(req, copy)).catch(()=>{});
        return res;
      }))
    );
  }
});
