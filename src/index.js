import express from 'express';
import path from 'node:path';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { pool } from './config/db.js';
import { auth, rbac } from './middleware/auth.js';
import { createRateLimiter, corsOrigins, originAllowed } from './middleware/security.js';
import { MODULE_ROLES } from './config/access.js';
import authRoutes from './modules/auth/routes.js';
import dashboardRoutes from './modules/dashboard/routes.js';
import masterRoutes from './modules/master/routes.js';
import salesRoutes from './modules/sales/routes.js';
import purchaseRoutes from './modules/purchase/routes.js';
import inventoryRoutes from './modules/inventory/routes.js';
import financeRoutes from './modules/finance/routes.js';
import logisticsRoutes from './modules/logistics/routes.js';
import scaleRoutes from './modules/logistics/scale-routes.js';
import hrRoutes from './modules/hr/routes.js';
import crmRoutes from './modules/crm/routes.js';
import reportRoutes from './modules/reporting/routes.js';
import consignmentRoutes from './modules/consignment/routes.js';
import projectRoutes from './modules/projects/routes.js';
import pricingRoutes from './modules/pricing/routes.js';
import returnRoutes from './modules/returns/routes.js';
import landedCostRoutes from './modules/landedcost/routes.js';
import fleetRoutes from './modules/fleet/routes.js';
import loyaltyRoutes from './modules/loyalty/routes.js';
import budgetRoutes from './modules/budget/routes.js';
import assetRoutes from './modules/assets/routes.js';
import wasteRoutes from './modules/waste/routes.js';
import creditRoutes from './modules/credit/routes.js';
import approvalRoutes from './modules/approvals/routes.js';
import calcRoutes from './modules/calculator/routes.js';
import auditRoutes from './modules/audit/routes.js';
import steelRoutes from './modules/steel/routes.js';
import searchRoutes from './modules/search/routes.js';
import posRoutes from './modules/pos/routes.js';
import posShiftRoutes from './modules/pos/shift-routes.js';
import announcementsRoutes from './modules/announcements/routes.js';
import opnameRoutes from './modules/inventory/opname-routes.js';
import taxRoutes from './modules/tax/routes.js';
import notifyRoutes from './modules/notify/routes.js';
import publicRoutes from './modules/public/routes.js';
import projectTermRoutes from './modules/projects/terms-routes.js';
import periodRoutes from './modules/finance/period-routes.js';
import reconRoutes from './modules/finance/recon-routes.js';
import reconCenterRoutes from './modules/finance/recon-center-routes.js';
import reorderRoutes from './modules/inventory/reorder-routes.js';
import approvalRuleRoutes from './modules/approvals/rules-routes.js';
import errorsRoutes from './modules/errors/routes.js';
import { errorCapture } from './middleware/error-capture.js';
import { startOutboxWorker } from './lib/outbox-worker.js';
import { logError, recentErrors, errorStats } from './lib/error-log.js';
import { redisStatus } from './lib/redis.js';
import { openApiSpec, swaggerHtml } from './lib/swagger.js';

dotenv.config();
const app = express();
// Di belakang nginx/load balancer: IP asli ada di X-Forwarded-For (rate limit & audit).
if(process.env.TRUST_PROXY !== '0') app.set('trust proxy', 1);

// Cegah boot produksi dengan secret default (kalau tidak, token bisa dipalsukan siapa pun).
if(process.env.NODE_ENV === 'production'){
  const weak = [];
  if(!process.env.JWT_SECRET || process.env.JWT_SECRET === 'erp_jwt_super_secret_2024') weak.push('JWT_SECRET');
  if(!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET === 'erp_refresh_secret_2024') weak.push('JWT_REFRESH_SECRET');
  if(weak.length){
    console.error('[FATAL] Secret default terdeteksi: '+weak.join(', ')+'. Set nilai acak (>=32 char) di environment sebelum produksi.');
    process.exit(1);
  }
}

app.use(helmet({crossOriginResourcePolicy:false}));
app.use(cors({
  origin(origin, cb){
    if(originAllowed(origin, corsOrigins())) return cb(null, true);
    console.warn('[cors] origin ditolak:', origin);
    return cb(null, false);
  },
  credentials: true,
}));
// Rate limit: global per IP, plus batas ketat untuk login.
app.use('/api', errorCapture);
app.use('/api', createRateLimiter({ name:'api', windowMs:60_000, max: parseInt(process.env.RATE_LIMIT_PER_MIN||'600',10) }));
app.use('/api/auth/login', createRateLimiter({ name:'login', windowMs:15*60_000, max: parseInt(process.env.LOGIN_RATE_MAX||'20',10) }));
app.use(express.json({limit:'12mb'}));
app.use(express.urlencoded({extended:true, limit:'12mb'}));
app.use(morgan(process.env.NODE_ENV==='production' ? 'combined' : 'dev'));

// Foto katalog produk: dipublikasikan lewat /api/media/products supaya bisa dipakai <img src>
// dan tetap melewati proxy /api (nginx & vite). Lampiran surat dokter TIDAK di sini —
// itu hanya bisa dibaca lewat endpoint ber-auth /api/hr/leaves/:id/attachment.
app.use('/api/media/products', express.static(path.resolve('uploads','products'), { maxAge:'7d', immutable:true, fallthrough:true }));

// Dokumentasi OpenAPI & Swagger UI interaktif
app.get('/api/docs/spec.json', (req, res) => res.json(openApiSpec));
app.get('/api/docs', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(swaggerHtml());
});


// ---------- AUDIT TRAIL: catat semua aksi tulis yang sukses ke audit_logs ----------
const AUDIT_REDACT = ['password','old_password','new_password','password_hash'];
app.use((req,res,next)=>{
  if(!['POST','PUT','PATCH','DELETE'].includes(req.method)) return next();
  // originalUrl di-capture SEKARANG: req.path sudah termutasi (relatif) saat event finish
  const fullPath = String(req.originalUrl||req.url||'').split('?')[0];
  if(fullPath === '/api/auth/login') return next(); // login dicatat eksplisit di handler
  res.on('finish', ()=>{
    try{
      if(res.statusCode < 200 || res.statusCode >= 300) return;
      const parts = fullPath.split('/').filter(Boolean);   // ['api','sales','orders','5']
      const entity = parts[1] || 'unknown';
      const numSeg = parts.find(p=>/^\d+$/.test(p));
      const body = {...(req.body||{})};
      for(const k of Object.keys(body)) if(AUDIT_REDACT.includes(k)) body[k]='[REDACTED]';
      let payload = JSON.stringify(body);
      if(payload.length>2000) payload = payload.slice(0,2000)+'...';
      pool.query('INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value, ip_address) VALUES ($1,$2,$3,$4,$5::jsonb,$6)',
        [req.user?.id||null, req.method, entity, numSeg? parseInt(numSeg): null, payload,
         String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'').slice(0,45)]).catch(()=>{});
    }catch(_e){}
  });
  next();
});

// ── Metrics ringan untuk monitoring (tanpa dependency) ──────────────────────
const METRICS = { started: Date.now(), requests: 0, errors: 0, byStatus: {}, latency: [] };
app.use((req,res,next)=>{
  if(!req.path.startsWith('/api')) return next();
  const t0 = process.hrtime.bigint();
  METRICS.requests += 1;
  res.on('finish', ()=>{
    const ms = Number(process.hrtime.bigint()-t0)/1e6;
    METRICS.byStatus[res.statusCode] = (METRICS.byStatus[res.statusCode]||0) + 1;
    if(res.statusCode >= 500) METRICS.errors += 1;
    METRICS.latency.push(ms);
    if(METRICS.latency.length > 500) METRICS.latency.shift();
  });
  next();
});
app.get('/api/metrics/prometheus', (req, res) => {
  const l = [...METRICS.latency].sort((a,b)=>a-b);
  const pct = (p)=> l.length? Math.round(l[Math.min(l.length-1, Math.floor(l.length*p/100))]*10)/10 : 0;
  const mem = process.memoryUsage();
  const uptime = Math.round(process.uptime());

  let out = '';
  out += '# HELP erp_uptime_seconds Total application uptime in seconds\n';
  out += '# TYPE erp_uptime_seconds gauge\n';
  out += `erp_uptime_seconds ${uptime}\n\n`;

  out += '# HELP erp_http_requests_total Total HTTP requests handled\n';
  out += '# TYPE erp_http_requests_total counter\n';
  out += `erp_http_requests_total ${METRICS.requests}\n\n`;

  out += '# HELP erp_http_errors_5xx_total Total HTTP 5xx errors\n';
  out += '# TYPE erp_http_errors_5xx_total counter\n';
  out += `erp_http_errors_5xx_total ${METRICS.errors}\n\n`;

  out += '# HELP erp_http_requests_by_status HTTP requests grouped by status code\n';
  out += '# TYPE erp_http_requests_by_status counter\n';
  for (const [st, count] of Object.entries(METRICS.byStatus)) {
    out += `erp_http_requests_by_status{status="${st}"} ${count}\n`;
  }
  out += '\n';

  out += '# HELP erp_http_latency_ms HTTP latency percentiles in milliseconds\n';
  out += '# TYPE erp_http_latency_ms gauge\n';
  out += `erp_http_latency_ms{quantile="0.5"} ${pct(50)}\n`;
  out += `erp_http_latency_ms{quantile="0.95"} ${pct(95)}\n`;
  out += `erp_http_latency_ms{quantile="0.99"} ${pct(99)}\n\n`;

  out += '# HELP erp_memory_bytes Process memory metrics\n';
  out += '# TYPE erp_memory_bytes gauge\n';
  out += `erp_memory_bytes{type="rss"} ${mem.rss}\n`;
  out += `erp_memory_bytes{type="heapTotal"} ${mem.heapTotal}\n`;
  out += `erp_memory_bytes{type="heapUsed"} ${mem.heapUsed}\n`;

  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(out);
});

app.get('/api/metrics', auth, rbac('direktur','super_admin','auditor'), (req,res)=>{
  const l = [...METRICS.latency].sort((a,b)=>a-b);
  const pct = (p)=> l.length? Math.round(l[Math.min(l.length-1, Math.floor(l.length*p/100))]*10)/10 : 0;
  res.json({
    uptime_s: Math.round(process.uptime()),
    started_at: new Date(METRICS.started).toISOString(),
    requests: METRICS.requests,
    errors_5xx: METRICS.errors,
    by_status: METRICS.byStatus,
    latency_ms: { p50: pct(50), p95: pct(95), p99: pct(99), samples: l.length },
    memory_mb: Math.round(process.memoryUsage().rss/1048576),
  });
});

app.get('/api/metrics/errors', auth, rbac('direktur','super_admin','auditor'), (req,res)=>{
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit||'30',10)||30));
  res.json({ stats: errorStats(), recent: recentErrors(limit),
    log_dir: 'logs/', webhook: !!process.env.ERROR_WEBHOOK_URL });
});

// Health check untuk monitoring/uptime probe: mengecek DB & Redis.
// 200 = siap dipakai, 503 = DB tidak bisa dihubungi (jangan kirim traffic).
app.get('/api/health', async (req,res)=>{
  const started = Date.now();
  let dbOk = false;
  let dbMs = 0;
  try{
    await pool.query('SELECT 1');
    dbOk = true;
    dbMs = Date.now() - started;
  }catch(_e){}

  const redis = redisStatus();
  const allOk = dbOk && (!redis.configured || redis.connected);

  const payload = {
    status: allOk ? 'ok' : 'degraded',
    time: new Date().toISOString(),
    uptime_s: Math.round(process.uptime()),
    checks: {
      database: dbOk ? { status: 'ok', latency_ms: dbMs } : { status: 'down', error: 'database unreachable' },
      redis,
    },
    version: process.env.APP_VERSION || '1.0.0',
    env: process.env.NODE_ENV || 'development',
  };
  res.status(dbOk ? 200 : 503).json(payload);
});
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', auth, dashboardRoutes);
app.use('/api/master', auth, masterRoutes);
app.use('/api/sales', auth, rbac(...MODULE_ROLES.sales), salesRoutes);
app.use('/api/purchase', auth, rbac(...MODULE_ROLES.purchase), purchaseRoutes);
app.use('/api/inventory/opname', auth, rbac(...MODULE_ROLES.inventory), opnameRoutes);
app.use('/api/inventory/reorder', auth, rbac(...MODULE_ROLES.inventory), reorderRoutes);
app.use('/api/inventory', auth, rbac(...MODULE_ROLES.inventory), inventoryRoutes);
app.use('/api/finance/periods', auth, rbac(...MODULE_ROLES.finance), periodRoutes);
app.use('/api/finance/recon-center', auth, rbac(...MODULE_ROLES.finance), reconCenterRoutes);
app.use('/api/finance/recon', auth, rbac(...MODULE_ROLES.finance), reconRoutes);
app.use('/api/finance', auth, rbac(...MODULE_ROLES.finance), financeRoutes);
app.use('/api/logistics/scale', auth, rbac(...MODULE_ROLES.logistics), scaleRoutes);
app.use('/api/logistics', auth, rbac(...MODULE_ROLES.logistics), logisticsRoutes);
app.use('/api/hr', auth, hrRoutes);
app.use('/api/crm', auth, rbac(...MODULE_ROLES.crm), crmRoutes);
app.use('/api/reports', auth, rbac(...MODULE_ROLES.reporting), reportRoutes);
app.use('/api/consignments', auth, rbac(...MODULE_ROLES.consignment), consignmentRoutes);
app.use('/api/projects', auth, rbac(...MODULE_ROLES.projects), projectRoutes);
app.use('/api/pricing', auth, rbac(...MODULE_ROLES.pricing), pricingRoutes);
app.use('/api/returns', auth, rbac(...MODULE_ROLES.returns), returnRoutes);
app.use('/api/landed-costs', auth, rbac(...MODULE_ROLES.landedcost), landedCostRoutes);
app.use('/api/fleet', auth, fleetRoutes);
app.use('/api/loyalty', auth, rbac(...MODULE_ROLES.loyalty), loyaltyRoutes);
app.use('/api/budgets', auth, rbac(...MODULE_ROLES.budget), budgetRoutes);
app.use('/api/assets', auth, rbac(...MODULE_ROLES.assets), assetRoutes);
app.use('/api/waste', auth, rbac(...MODULE_ROLES.waste), wasteRoutes);
app.use('/api/credit', auth, rbac(...MODULE_ROLES.credit), creditRoutes);
app.use('/api/approvals', auth, approvalRoutes);
app.use('/api/calculator', auth, calcRoutes);
app.use('/api/audit', auth, rbac(...MODULE_ROLES.audit), auditRoutes);
app.use('/api/steel', auth, steelRoutes);
// POS: auth endpoints public, others require auth
import posAuthRoutes from './modules/pos/auth-routes.js';
app.use('/api/pos/auth', posAuthRoutes);
app.use('/api/announcements', auth, announcementsRoutes);
app.use('/api/pos/shift', auth, posShiftRoutes);
app.use('/api/pos', auth, posRoutes);
app.use('/api/search', auth, searchRoutes);
// Modul baru: pajak, pusat notifikasi, termin proyek, dan portal publik (tanpa auth).
app.use('/api/tax', auth, rbac(...MODULE_ROLES.tax), taxRoutes);
app.use('/api/notify', auth, rbac(...MODULE_ROLES.notify), notifyRoutes);
app.use('/api/project-terms', auth, rbac(...MODULE_ROLES.projects), projectTermRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/approval-rules', auth, rbac('direktur','super_admin','finance','purchasing'), approvalRuleRoutes);
app.use('/api/errors', auth, rbac('direktur','super_admin','auditor'), errorsRoutes);

// seed password fix on boot — HANYA untuk hash yang belum valid (instalasi baru).
// Password yang sudah diubah user TIDAK boleh direset setiap restart.
import bcrypt from 'bcryptjs';
async function ensureUsers(){
  // JANGAN pernah menyemai password demo di produksi.
  if(process.env.NODE_ENV === 'production' && process.env.SEED_DEMO_USERS !== '1') return;
  try{
    const seeds = [['admin','admin123'],['finance','finance123'],['sales','sales123'],['gudang','gudang123']];
    for(const [username, plain] of seeds){
      const cur = await pool.query("SELECT password_hash FROM users WHERE username=$1",[username]);
      const hash = cur.rows[0]?.password_hash || '';
      if(/^\$2[aby]\$/.test(hash)) continue;      // sudah punya hash bcrypt: jangan disentuh
      await pool.query("UPDATE users SET password_hash=$1 WHERE username=$2",[await bcrypt.hash(plain,10), username]);
    }
  }catch(e){ console.error('seed pw err',e.message); }
}
async function runMigrations(){
  // Advisory lock: dua container backend yang boot bersamaan tidak boleh menjalankan
  // migrasi yang sama secara paralel.
  let lockClient = null;
  try{
    lockClient = await pool.connect();
    await lockClient.query('SELECT pg_advisory_lock(948271)');
    const fs = await import('fs');
    const path = await import('path');
    const dir = path.resolve('migrations');
    if(!fs.existsSync(dir)) return;
    await lockClient.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);
    // Backfill dari audit_logs lama jika tabel baru dibuat
    const migCount = await lockClient.query("SELECT COUNT(*) FROM schema_migrations");
    if(parseInt(migCount.rows[0].count, 10) === 0){
      await lockClient.query(`
        INSERT INTO schema_migrations (version, applied_at)
        SELECT DISTINCT substring(new_value::text from '"file":"([^"]+)"'), created_at
          FROM audit_logs
         WHERE entity_type='MIGRATION' AND new_value IS NOT NULL
        ON CONFLICT DO NOTHING
      `).catch(()=>{});
    }

    const files = fs.readdirSync(dir).sort();
    // ponytail: 009_aging_rebuild must re-run to fix 404 seed; force rerun list
    const forceRerun = new Set(['009_aging_rebuild.sql']);
    for(const f of files){
      if(!f.endsWith('.sql')) continue;
      if(!forceRerun.has(f)){
        const chk = await lockClient.query("SELECT 1 FROM schema_migrations WHERE version=$1", [f]);
        if(chk.rows.length > 0){
          console.log('migration '+f+' already applied');
          continue;
        }
      } else {
        console.log('migration '+f+' force rerun (AR rebuild)');
      }
      const sql = fs.readFileSync(path.join(dir,f),'utf8');
      console.log('Running migration '+f+' ('+sql.length+' chars)');
      await lockClient.query(sql);
      await lockClient.query("INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO UPDATE SET applied_at=NOW()", [f]);
      await lockClient.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,new_value) VALUES (1,'MIGRATE','MIGRATION',0,$1)",[JSON.stringify({file:f})]);
      console.log('Migration '+f+' done');
    }
  }catch(e){ console.error('migration err',e.message); }
  finally{
    if(lockClient){
      try{ await lockClient.query('SELECT pg_advisory_unlock(948271)'); }catch{}
      lockClient.release();
    }
  }
}

// ---------------------------------------------------------------- hardening
// Express 4 tidak meneruskan rejection dari handler async ke error middleware;
// satu request dengan :id bukan angka (mis. /returns/sales/undefined) cukup untuk
// mematikan seluruh proses (Node >= 15 keluar saat unhandledRejection).
// Bungkus semua handler agar error diteruskan ke error middleware di bawah,
// bukan menjadi unhandledRejection.
function hardenHandlers(route){
  for (const l of (route.stack || [])){
    const h = l.handle;
    if (typeof h !== 'function' || h.__safe || h.length >= 4) continue;   // 4 arg = error middleware
    const wrapped = function(req,res,next){
      try { const r = h(req,res,next); if (r && typeof r.then === 'function') r.catch(next); }
      catch(e){ next(e); }
    };
    wrapped.__safe = true;
    l.handle = wrapped;
  }
}
function harden(target){
  if (!target || !target.stack) return;
  for (const layer of target.stack){
    if (layer.route){ hardenHandlers(layer.route); continue; }   // layer rute: handler ada di layer.route.stack
    const h = layer.handle;
    if (!h) continue;
    if (h.stack){ harden(h); continue; }                         // Router bersarang
    if (typeof h !== 'function' || h.__safe || h.length >= 4) continue;
    const wrapped = function(req,res,next){
      try { const r = h(req,res,next); if (r && typeof r.then === 'function') r.catch(next); }
      catch(e){ next(e); }
    };
    wrapped.__safe = true;
    layer.handle = wrapped;
  }
}
harden(app._router);
process.on('unhandledRejection', (e)=>{
  logError(e, { source:'unhandledRejection', status:500 });
});
process.on('uncaughtException', (e)=>{
  logError(e, { source:'uncaughtException', status:500 });
  // Setelah exception tak tertangkap, state proses tidak bisa dipercaya.
  // Docker akan me-restart container (restart: unless-stopped).
  setTimeout(()=>process.exit(1), 200);
});

// Graceful shutdown: Docker mengirim SIGTERM saat restart/deploy.
// Tutup listener dulu (berhenti terima request baru), lalu pool DB.
let httpServer = null;
function shutdown(signal){
  console.log(`[shutdown] ${signal} diterima — menutup koneksi...`);
  let closed = false;
  const finish = async (code=0)=>{
    if(closed) return; closed = true;
    try{ await pool.end(); }catch{}
    console.log('[shutdown] selesai');
    process.exit(code);
  };
  if(httpServer){
    httpServer.close(()=> finish(0));
    setTimeout(()=>{ console.warn('[shutdown] timeout, keluar paksa'); finish(0); }, 10_000).unref();
  } else finish(0);
}
process.on('SIGTERM', ()=>shutdown('SIGTERM'));
process.on('SIGINT', ()=>shutdown('SIGINT'));

app.use((err,req,res,next)=>{
  // Body parser error (JSON rusak / payload terlalu besar) → 400, bukan 500.
  const status = err.status || err.statusCode || (err.type === 'entity.too.large' ? 413 : 500);
  req._errorLogged = true;
  logError(err, { req, status });
  if(res.headersSent) return next(err);
  res.status(status).json({ error: status >= 500 ? 'Terjadi kesalahan pada server' : (err.message || 'Permintaan tidak valid') });
});
const BASE_PORT = parseInt(process.env.PORT || '4000',10);
function start(port, retries=4){
  const server = app.listen(port, async ()=>{
    httpServer = server;
    console.log('ERP Backend running on '+port);
    if(port!==BASE_PORT) console.log(`PORT ${BASE_PORT} busy -> using ${port} (update vite proxy if needed)`);
    await runMigrations();
    await ensureUsers();
    startOutboxWorker(60_000);
    try{ const r=await pool.query('SELECT COUNT(*) FROM products'); console.log('DB products count',r.rows[0].count);}catch(e){ console.error('DB error',e.message);}
  });
  server.on('error', err=>{
    if(err.code==='EADDRINUSE' && retries>0){
      console.warn(`Port ${port} in use (EADDRINUSE) -> retry ${port+1} (${retries} left)`);
      setTimeout(()=> start(port+1, retries-1), 700);
    } else {
      console.error('listen failed', err.message);
      if(err.code==='EADDRINUSE') console.error('Fix: taskkill /F /IM node.exe  -> netstat -ano | findstr :4000');
      process.exit(1);
    }
  });
}
start(BASE_PORT);
