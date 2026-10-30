#!/usr/bin/env node
/**
 * Uji beban sederhana (tanpa dependency) untuk endpoint baca yang paling sering
 * dipakai kasir/admin. Menghasilkan throughput + latensi p50/p95/p99 + error.
 *
 * Contoh:
 *   node scripts/load-test.mjs --url http://localhost:4001/api --concurrency 20 --duration 20
 *   node scripts/load-test.mjs --user admin --pass admin123 --concurrency 50 --duration 30
 *
 * Catatan: rate limit default 600 req/menit/IP akan membuat hasil didominasi 429.
 * Untuk uji kapasitas, jalankan backend uji dengan RATE_LIMIT_PER_MIN tinggi.
 */

const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf('--'+name);
  return i >= 0 && args[i+1] ? args[i+1] : def;
};

const BASE = arg('url', 'http://localhost:4000/api').replace(/\/$/, '');
const CONC = Math.max(1, parseInt(arg('concurrency','20'),10));
const DURATION = Math.max(1, parseInt(arg('duration','15'),10)) * 1000;
const USER = arg('user','admin');
const PASS = arg('pass','admin123');

const ENDPOINTS = [
  { name:'health',            path:'/health',                          weight:1 },
  { name:'product-lookup',    path:'/pos/product-lookup?q=se',         weight:3 },
  { name:'invoices',          path:'/sales/invoices?limit=10',         weight:3 },
  { name:'dashboard',         path:'/dashboard/kpi',                 weight:2 },
  { name:'stock',             path:'/inventory/stocks?limit=20',       weight:2 },
];

const pick = () => {
  const total = ENDPOINTS.reduce((a,e)=>a+e.weight,0);
  let r = Math.random()*total;
  for(const e of ENDPOINTS){ r -= e.weight; if(r <= 0) return e; }
  return ENDPOINTS[0];
};

async function login(){
  const res = await fetch(BASE+'/auth/login', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  const j = await res.json().catch(()=>({}));
  if(!res.ok || !j.token) throw new Error('login gagal: '+res.status+' '+(j.error||''));
  return j.token;
}

function pct(arr, p){
  if(!arr.length) return 0;
  const i = Math.min(arr.length-1, Math.floor(arr.length * p));
  return Math.round(arr[i]*10)/10;
}

(async ()=>{
  console.log(`[load] target ${BASE} • ${CONC} worker • ${DURATION/1000}s`);
  const token = await login();
  console.log('[load] login ok, mulai membebani...');

  const latencies = [];
  const statuses = {};
  const perEndpoint = {};
  let done = 0;
  let stop = false;
  const started = Date.now();

  const worker = async () => {
    while(!stop && Date.now() - started < DURATION){
      const ep = pick();
      const t0 = performance.now();
      let status = 0;
      try{
        const res = await fetch(BASE+ep.path, { headers:{ Authorization:'Bearer '+token } });
        status = res.status;
        await res.arrayBuffer(); // pastikan body terbaca penuh
      }catch{
        status = -1;
      }
      const dt = performance.now() - t0;
      latencies.push(dt);
      statuses[status] = (statuses[status]||0)+1;
      const bucket = perEndpoint[ep.name] || (perEndpoint[ep.name] = { n:0, sum:0, max:0, err:0 });
      bucket.n++; bucket.sum += dt; bucket.max = Math.max(bucket.max, dt);
      if(status >= 400 || status === -1) bucket.err++;
      done++;
    }
  };

  await Promise.all(Array.from({ length: CONC }, worker));
  stop = true;

  const elapsed = (Date.now() - started) / 1000;
  const sorted = latencies.slice().sort((a,b)=>a-b);
  const ok = (statuses[200]||0);
  const errs = Object.entries(statuses).filter(([s])=>Number(s) >= 400 || Number(s) === -1)
    .reduce((a,[,v])=>a+v,0);

  console.log('\n=== HASIL UJI BEBAN ===');
  console.log(`durasi         : ${elapsed.toFixed(1)} s`);
  console.log(`request total  : ${done}`);
  console.log(`throughput     : ${(done/elapsed).toFixed(1)} req/s`);
  console.log(`sukses (200)   : ${ok}`);
  console.log(`gagal/4xx-5xx  : ${errs}`);
  console.log(`status         : ${JSON.stringify(statuses)}`);
  console.log(`latensi p50    : ${pct(sorted,0.50)} ms`);
  console.log(`latensi p95    : ${pct(sorted,0.95)} ms`);
  console.log(`latensi p99    : ${pct(sorted,0.99)} ms`);
  console.log(`latensi max    : ${Math.round(sorted[sorted.length-1]||0)} ms`);
  console.log('\nper endpoint (rata-rata / max / error):');
  for(const [name,b] of Object.entries(perEndpoint)){
    console.log(`  ${name.padEnd(16)} n=${String(b.n).padStart(5)}  avg=${(b.sum/b.n).toFixed(1)}ms  max=${b.max.toFixed(1)}ms  err=${b.err}`);
  }

  const verdict = errs === 0 && pct(sorted,0.95) < 500
    ? 'LULUS (0 error, p95 < 500 ms)'
    : errs === 0 ? 'LULUS dengan catatan (p95 >= 500 ms)' : 'PERIKSA (ada error)';
  console.log('\nkesimpulan     : ' + verdict);
  process.exit(errs === 0 ? 0 : 1);
})().catch(e=>{
  console.error('[load] gagal:', e.message);
  process.exit(2);
});
