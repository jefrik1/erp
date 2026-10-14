import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { pool } from './config/db.js';
import { auth } from './middleware/auth.js';
import authRoutes from './modules/auth/routes.js';
import dashboardRoutes from './modules/dashboard/routes.js';
import masterRoutes from './modules/master/routes.js';
import salesRoutes from './modules/sales/routes.js';
import purchaseRoutes from './modules/purchase/routes.js';
import inventoryRoutes from './modules/inventory/routes.js';
import financeRoutes from './modules/finance/routes.js';
import logisticsRoutes from './modules/logistics/routes.js';
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
import marketplaceRoutes from './modules/marketplace/routes.js';
import wasteRoutes from './modules/waste/routes.js';
import creditRoutes from './modules/credit/routes.js';
import approvalRoutes from './modules/approvals/routes.js';
import calcRoutes from './modules/calculator/routes.js';
import auditRoutes from './modules/audit/routes.js';
import steelRoutes from './modules/steel/routes.js';
import searchRoutes from './modules/search/routes.js';
import posRoutes from './modules/pos/routes.js';

dotenv.config();
const app = express();
app.use(helmet({crossOriginResourcePolicy:false}));
app.use(cors({origin:'*'}));
app.use(express.json({limit:'12mb'}));
app.use(express.urlencoded({extended:true, limit:'12mb'}));
app.use(morgan('dev'));

app.get('/api/health', (req,res)=>res.json({status:'ok', time:new Date().toISOString()}));
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', auth, dashboardRoutes);
app.use('/api/master', auth, masterRoutes);
app.use('/api/sales', auth, salesRoutes);
app.use('/api/purchase', auth, purchaseRoutes);
app.use('/api/inventory', auth, inventoryRoutes);
app.use('/api/finance', auth, financeRoutes);
app.use('/api/logistics', auth, logisticsRoutes);
app.use('/api/hr', auth, hrRoutes);
app.use('/api/crm', auth, crmRoutes);
app.use('/api/reports', auth, reportRoutes);
app.use('/api/consignments', auth, consignmentRoutes);
app.use('/api/projects', auth, projectRoutes);
app.use('/api/pricing', auth, pricingRoutes);
app.use('/api/returns', auth, returnRoutes);
app.use('/api/landed-costs', auth, landedCostRoutes);
app.use('/api/fleet', auth, fleetRoutes);
app.use('/api/loyalty', auth, loyaltyRoutes);
app.use('/api/budgets', auth, budgetRoutes);
app.use('/api/assets', auth, assetRoutes);
app.use('/api/marketplace', auth, marketplaceRoutes);
app.use('/api/waste', auth, wasteRoutes);
app.use('/api/credit', auth, creditRoutes);
app.use('/api/approvals', auth, approvalRoutes);
app.use('/api/calculator', auth, calcRoutes);
app.use('/api/audit', auth, auditRoutes);
app.use('/api/steel', auth, steelRoutes);
// POS: auth endpoints public, others require auth
import posAuthRoutes from './modules/pos/auth-routes.js';
app.use('/api/pos/auth', posAuthRoutes);
app.use('/api/pos', auth, posRoutes);
app.use('/api/search', auth, searchRoutes);

// seed password fix on boot
import bcrypt from 'bcryptjs';
async function ensureUsers(){
  try{
    const hash = await bcrypt.hash('admin123',10);
    const hash2 = await bcrypt.hash('finance123',10);
    const hash3 = await bcrypt.hash('sales123',10);
    const hash4 = await bcrypt.hash('gudang123',10);
    await pool.query("UPDATE users SET password_hash=$1 WHERE username='admin'",[hash]);
    await pool.query("UPDATE users SET password_hash=$1 WHERE username='finance'",[hash2]);
    await pool.query("UPDATE users SET password_hash=$1 WHERE username='sales'",[hash3]);
    await pool.query("UPDATE users SET password_hash=$1 WHERE username='gudang'",[hash4]);
    console.log('Passwords seeded');
  }catch(e){ console.error('seed pw err',e.message); }
}
async function runMigrations(){
  try{
    const fs = await import('fs');
    const path = await import('path');
    const dir = path.resolve('migrations');
    if(!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir).sort();
    // ponytail: 009_aging_rebuild must re-run to fix 404 seed; force rerun list
    const forceRerun = new Set(['009_aging_rebuild.sql']);
    for(const f of files){
      if(!f.endsWith('.sql')) continue;
      if(!forceRerun.has(f)){
        const chk = await pool.query("SELECT COUNT(*) FROM audit_logs WHERE entity_type='MIGRATION' AND new_value::text LIKE $1",['%'+f+'%']);
        if(parseInt(chk.rows[0].count)>0){
          console.log('migration '+f+' already applied');
          continue;
        }
      } else {
        console.log('migration '+f+' force rerun (AR rebuild)');
      }
      const sql = fs.readFileSync(path.join(dir,f),'utf8');
      console.log('Running migration '+f+' ('+sql.length+' chars)');
      await pool.query(sql);
      await pool.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,new_value) VALUES (1,'MIGRATE','MIGRATION',0,$1)",[JSON.stringify({file:f})]);
      console.log('Migration '+f+' done');
    }
  }catch(e){ console.error('migration err',e.message); }
}

app.use((err,req,res,next)=>{ console.error(err); res.status(500).json({error:err.message}); });
const BASE_PORT = parseInt(process.env.PORT || '4000',10);
function start(port, retries=4){
  const server = app.listen(port, async ()=>{
    console.log('ERP Backend running on '+port);
    if(port!==BASE_PORT) console.log(`PORT ${BASE_PORT} busy -> using ${port} (update vite proxy if needed)`);
    await runMigrations();
    await ensureUsers();
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
