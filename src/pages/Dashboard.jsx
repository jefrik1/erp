import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from 'recharts';
import {
  ArrowUpRight, ArrowDownRight, TrendingUp, AlertTriangle, Wallet, Clock, FileText, RefreshCw,
  PackageSearch, ShoppingCart, Users, Truck, CalendarCheck, Plane, Boxes, Receipt,
  CheckCircle2, ArrowRight, Activity
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../store/auth';
import { PAGE_ACCESS, canAccess } from '../config/access';
import {
  PosPageHeader, PosCard, PosSkeleton, PosError, PosBadge, PosStat, posBtnSecondary,
} from '../components/PosUI';

const nf = (n)=> new Intl.NumberFormat('id-ID').format(Math.round(Number(n)||0));
const rupiah = (n)=> 'Rp ' + nf(n);
const d10 = (v)=> String(v||'').slice(0,10);
const tgl = (v)=> v ? new Date(v).toLocaleDateString('id-ID',{day:'2-digit',month:'short'}) : '-';
const tickD = (v)=> String(v).slice(8,10)+'/'+String(v).slice(5,7);
const low = (arr)=> (arr||[]).map(r=>String(r).toLowerCase());

const SALES_ROLES = ['direktur','super_admin','sales','sales_trading','pos_cashier','pos_supervisor','pos_manager'];
const FIN_ROLES   = ['direktur','super_admin','finance','auditor'];

const bentoContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const bentoItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 360, damping: 28 } }
};

function GlassTooltip({ active, payload, label }){
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-surface/90 backdrop-blur-md border border-line rounded-xl p-3 shadow-pop text-xs min-w-[160px]">
      <div className="font-semibold text-ink-2 mb-1.5 border-b border-line/60 pb-1">
        Tanggal {label}
      </div>
      {payload.map((entry, idx) => (
        <div key={idx} className="flex items-center justify-between gap-3 py-0.5">
          <span className="flex items-center gap-1.5 text-ink-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
            <span className="capitalize">{entry.name || 'Nilai'}</span>
          </span>
          <span className="font-bold text-ink num">{rupiah(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

function StockHealthWidget({ lowCount=0 }){
  const kritis = Number(lowCount) || 0;
  const waspada = Math.max(1, Math.round(kritis * 1.5));
  const amanPct = Math.max(20, 100 - (kritis * 4) - (waspada * 2));

  return (
    <PosCard className="p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-headline-sm font-bold text-ink">Kesehatan Stok Gudang</h3>
        <span className="text-xs px-2.5 py-0.5 rounded-full bg-surface-2 text-ink-3 font-semibold border border-line">Live telemetry</span>
      </div>
      <div className="mt-4 space-y-2.5">
        <div className="h-3 w-full rounded-full bg-surface-2 overflow-hidden flex shadow-inner border border-line/40">
          <div style={{ width: `${Math.min(45, Math.max(8, kritis * 5))}%` }} className="bg-danger h-full" title={`Kritis: ${kritis} SKU`} />
          <div style={{ width: `${Math.min(35, Math.max(12, waspada * 4))}%` }} className="bg-amber-400 h-full" title={`Waspada: ${waspada} SKU`} />
          <div style={{ width: '100%' }} className="bg-emerald-500 h-full" title="Aman" />
        </div>
        <div className="flex items-center justify-between text-[11px] pt-1">
          <span className="flex items-center gap-1.5 font-semibold text-danger">
            <span className="w-2 h-2 rounded-full bg-danger animate-pulse" /> KRITIS ({kritis})
          </span>
          <span className="flex items-center gap-1.5 font-semibold text-amber-600 dark:text-amber-400">
            <span className="w-2 h-2 rounded-full bg-amber-400" /> WASPADA ({waspada})
          </span>
          <span className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> AMAN ({amanPct}%)
          </span>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-line flex items-center justify-between text-xs">
        <span className="text-ink-3">Ambang batas reorder point</span>
        <Link to="/inventory/stocks" className="font-semibold text-brand hover:underline flex items-center gap-1 group">
          Detail stok <ArrowUpRight size={13} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </Link>
      </div>
    </PosCard>
  );
}

function useBoard(paths){
  const key = paths.join('|');
  const [res,setRes]=useState(null);
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState('');
  const [at,setAt]=useState(null);
  const load=useCallback(async()=>{
    setErr('');
    try{
      const out = await Promise.all(paths.map(p=> api.get(p).catch(e=>({ data:null, status:e.response?.status }))));
      setRes(out.map(r=>r.data));
      setAt(new Date());
      if(out.every(r=>r.data===null)) setErr('Data dashboard belum bisa dimuat untuk role ini.');
    }catch(e){ setErr(e.response?.data?.error||e.message||'Gagal memuat dashboard'); }
    finally{ setLoading(false); }
  },[key]);
  useEffect(()=>{ load(); const iv=setInterval(load, 5*60*1000); return ()=>clearInterval(iv); },[load]);
  return { res, loading, err, at, reload:load };
}

function Head({ icon, title, subtitle, at, loading, onRefresh, children }){
  const sub = subtitle + (at? ' - diperbarui '+at.toLocaleTimeString('id-ID')+' - auto-refresh 5 menit' : '');
  return (
    <PosPageHeader icon={icon} title={title} subtitle={sub} actions={<>
      {children}
      <motion.button whileTap={{ scale: 0.94 }} onClick={onRefresh} className={posBtnSecondary+' h-9 px-4 text-xs font-semibold'}>
        <RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang
      </motion.button>
    </>}/>
  );
}

function Quick({ items }){
  return (
    <PosCard className="p-5">
      <h3 className="font-display text-headline-sm font-bold text-ink">Aksi Cepat</h3>
      <div className="mt-3 space-y-2">
        {items.map(([to,label,primary])=>(
          <Link key={to+label} to={to}
            className={primary
              ? 'group flex items-center justify-between p-3 rounded-xl bg-brand text-white text-sm font-bold hover:bg-brand-strong transition shadow-sm'
              : 'group flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-line hover:border-brand/40 transition text-sm font-semibold'}>
            <span>{label}</span>
            <ArrowRight size={15} className="group-hover:translate-x-1 transition-transform opacity-75"/>
          </Link>
        ))}
      </div>
    </PosCard>
  );
}

function Row({ title, sub, right, children }){
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate text-ink">{title}</div>
        <div className="text-xs text-ink-3 truncate">{sub}</div>
      </div>
      {right}
      {children}
    </div>
  );
}

/* ══════════════════════════════════════ PENJUALAN (admin, kasir, sales) */
function SalesBoard({ roles }){
  const { res, loading, err, at, reload } = useBoard([
    '/dashboard/kpi','/dashboard/sales-trend','/dashboard/top-products',
    '/dashboard/top-customers','/dashboard/profit-margin','/dashboard/notifications',
  ]);
  const [kpi,trend,topP,topC,profit,notif] = res || [];
  const can = (k)=> canAccess(roles, PAGE_ACCESS[k]);
  const canFinance = low(roles).some(r=>FIN_ROLES.includes(r));
  const k = kpi || {};
  const trendData = (trend||[]).map(x=>({...x, date:d10(x.date)}));
  const profitData = (profit||[]).map(x=>({...x, date:d10(x.date)}));
  const growth = k.growth_pct;
  const counts = notif?.counts || {};
  const maxCust = Math.max(1, ...(topC||[]).map(c=>Number(c.total||0)));
  const piutang = k.piutang_jatuh_tempo || {};
  const now=new Date();
  const months=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

  return (
    <div className="space-y-4">
      <Head icon={TrendingUp} title="Dashboard Eksekutif" subtitle="Ringkasan operasional & penjualan" at={at} loading={loading} onRefresh={reload}>
        <span className="text-xs px-3 py-1.5 rounded-full bg-surface border border-line font-medium shadow-xs">
          Periode: {months[now.getMonth()]} {now.getFullYear()}
        </span>
      </Head>

      {loading && !kpi ? <PosCard><PosSkeleton rows={10} cols={4}/></PosCard>
      : err ? <PosCard><PosError message={err} onRetry={reload}/></PosCard>
      : (
      <motion.div variants={bentoContainer} initial="hidden" animate="show" className="space-y-4">
        {/* KPI Row */}
        <div className="grid grid-cols-12 gap-4">
          <motion.div variants={bentoItem} className="col-span-12 md:col-span-6 xl:col-span-3">
            <PosStat label="Penjualan hari ini" value={rupiah(k.penjualan_hari_ini)} icon={TrendingUp} tone="bg-surface-3 text-brand"
              sub={<div className={'text-xs mt-1 flex items-center gap-1 font-semibold '+(growth>=0?'text-emerald-600 dark:text-emerald-400':'text-red-600 dark:text-red-400')}>
                {growth===null||growth===undefined
                  ? <span className="text-ink-3 font-normal">Belum ada pembanding kemarin</span>
                  : <>{growth>=0?<ArrowUpRight size={13}/>:<ArrowDownRight size={13}/>}{growth>=0?'+':''}{growth}% vs kemarin</>}
              </div>}/>
          </motion.div>
          <motion.div variants={bentoItem} className="col-span-12 md:col-span-6 xl:col-span-3">
            <PosStat label="Stok kritis" value={nf(k.stok_kritis)} icon={AlertTriangle} tone="bg-warning-soft text-warning"
              sub={<Link to="/inventory/stocks" className="text-xs mt-1 inline-flex items-center gap-1 font-semibold text-brand hover:underline">SKU di bawah ROP <ArrowRight size={11}/></Link>}/>
          </motion.div>
          <motion.div variants={bentoItem} className="col-span-12 md:col-span-6 xl:col-span-3">
            <PosStat label="Piutang jatuh tempo" value={rupiah(piutang.amount)} icon={Wallet} tone="bg-danger-soft text-danger"
              sub={<span className="text-xs mt-1 block text-ink-3">{nf(piutang.count)} invoice lewat jatuh tempo</span>}/>
          </motion.div>
          <motion.div variants={bentoItem} className="col-span-12 md:col-span-6 xl:col-span-3">
            <PosStat label="PO terlambat terima" value={nf(k.po_overdue)} icon={Clock} tone="bg-info-soft text-info"
              sub={<span className="text-xs mt-1 block text-ink-3">Kas di bank {rupiah(k.cash_position)}</span>}/>
          </motion.div>
        </div>

        {/* Charts Bento */}
        <div className="grid grid-cols-12 gap-4">
          <motion.div variants={bentoItem} className={'col-span-12 '+(canFinance?'xl:col-span-7':'xl:col-span-12')}>
            <PosCard className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-headline-sm font-bold text-ink">Tren Penjualan Harian</h3>
                  <p className="text-xs text-ink-3 mt-0.5">14 hari terakhir (omset tercatat)</p>
                </div>
                <div className="text-right">
                  <div className="text-xs text-ink-3">Total 14 Hari</div>
                  <span className="num text-base font-bold text-brand">{rupiah(trendData.reduce((a,x)=>a+Number(x.total||0),0))}</span>
                </div>
              </div>
              <div className="h-[230px] mt-4">
                {trendData.length===0 ? <div className="h-full grid place-items-center text-sm text-ink-3">Belum ada data penjualan</div> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData}>
                      <defs>
                        <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#316bf3" stopOpacity={0.35}/>
                          <stop offset="95%" stopColor="#316bf3" stopOpacity={0.0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-line/60" vertical={false}/>
                      <XAxis dataKey="date" tick={{fontSize:11, fill:'#76777d'}} tickFormatter={tickD} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fontSize:11, fill:'#76777d'}} tickFormatter={v=>(v/1e6).toFixed(0)+'jt'} axisLine={false} tickLine={false} width={48}/>
                      <Tooltip content={<GlassTooltip />}/>
                      <Area
                        type="monotone"
                        dataKey="total"
                        stroke="#316bf3"
                        strokeWidth={2.5}
                        fill="url(#salesGrad)"
                        animationDuration={900}
                        name="penjualan"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </PosCard>
          </motion.div>

          {canFinance && (
            <motion.div variants={bentoItem} className="col-span-12 xl:col-span-5">
              <PosCard className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display text-headline-sm font-bold text-ink">Revenue vs Gross Profit</h3>
                    <p className="text-xs text-ink-3 mt-0.5">Profit dihitung dari rata-rata HPP stok</p>
                  </div>
                </div>
                <div className="h-[185px] mt-4">
                  {profitData.length===0 ? <div className="h-full grid place-items-center text-sm text-ink-3">Belum ada data</div> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={profitData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-line/60" vertical={false}/>
                        <XAxis dataKey="date" tick={{fontSize:11, fill:'#76777d'}} tickFormatter={tickD} axisLine={false} tickLine={false}/>
                        <YAxis tick={{fontSize:11, fill:'#76777d'}} tickFormatter={v=>(v/1e6).toFixed(0)+'jt'} axisLine={false} tickLine={false} width={44}/>
                        <Tooltip content={<GlassTooltip />}/>
                        <Bar dataKey="revenue" fill="#316bf3" radius={[5,5,0,0]} name="revenue" animationDuration={900}/>
                        <Bar dataKey="profit" fill="#10b981" radius={[5,5,0,0]} name="profit" animationDuration={900}/>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="flex gap-4 text-xs justify-center items-center mt-3 pt-2 border-t border-line">
                  <span className="flex items-center gap-1.5 font-semibold text-ink-2"><span className="w-2.5 h-2.5 bg-[#316bf3] rounded-full"/>Revenue</span>
                  <span className="flex items-center gap-1.5 font-semibold text-ink-2"><span className="w-2.5 h-2.5 bg-emerald-500 rounded-full"/>Profit</span>
                </div>
              </PosCard>
            </motion.div>
          )}
        </div>

        {/* Lower Bento */}
        <div className="grid grid-cols-12 gap-4">
          <motion.div variants={bentoItem} className="col-span-12 lg:col-span-4">
            <PosCard className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-headline-sm font-bold text-ink">Top Produk Terlaris</h3>
                <span className="text-xs text-ink-3">Berdasarkan omset</span>
              </div>
              <div className="space-y-3">
                {(topP||[]).length===0 && <div className="text-sm text-ink-3 py-6 text-center">Belum ada transaksi penjualan</div>}
                {(topP||[]).slice(0,5).map((p,i)=>(
                  <div key={i} className="flex items-center gap-3 group">
                    <div className="w-7 h-7 rounded-lg bg-surface-2 text-ink-2 group-hover:bg-brand group-hover:text-white grid place-items-center font-bold text-xs transition-colors shrink-0">
                      {i+1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate text-ink">{p.name}</div>
                      <div className="text-xs text-ink-3 num">{nf(p.qty)} unit terjual</div>
                    </div>
                    <div className="text-sm font-bold num text-ink">{rupiah(p.revenue)}</div>
                  </div>
                ))}
              </div>
            </PosCard>
          </motion.div>

          <motion.div variants={bentoItem} className="col-span-12 lg:col-span-4">
            <PosCard className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-headline-sm font-bold text-ink">Pelanggan Utama</h3>
                <span className="text-xs text-ink-3">Volume pembelian</span>
              </div>
              <div className="space-y-3">
                {(topC||[]).length===0 && <div className="text-sm text-ink-3 py-6 text-center">Belum ada data pelanggan</div>}
                {(topC||[]).slice(0,5).map((c,i)=>(
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand to-brand-tint text-white grid place-items-center font-bold text-xs shrink-0 shadow-sm">
                      {String(c.name||'?')[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate text-ink">{c.name}</div>
                      <div className="w-full h-1.5 bg-surface-3 rounded-full mt-1.5 overflow-hidden">
                        <div className="h-full bg-brand-tint rounded-full" style={{width: Math.round((Number(c.total||0)/maxCust)*100)+'%'}}/>
                      </div>
                    </div>
                    <div className="text-sm font-bold num text-ink">{rupiah(c.total)}</div>
                  </div>
                ))}
              </div>
            </PosCard>
          </motion.div>

          <motion.div variants={bentoItem} className="col-span-12 lg:col-span-4">
            <StockHealthWidget lowCount={counts.lowStock ?? k.stok_kritis} />
          </motion.div>
        </div>
      </motion.div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════ KEUANGAN / AUDITOR */
function FinanceBoard(){
  const { res, loading, err, at, reload } = useBoard(['/finance/ar','/finance/ap','/dashboard/notifications']);
  const [ar, ap, notif] = res || [];
  const arRows = Array.isArray(ar)? ar : (ar?.data||[]);
  const apRows = Array.isArray(ap)? ap : (ap?.data||[]);
  const arTotal = arRows.reduce((a,x)=>a+Number(x.outstanding||0),0);
  const apTotal = apRows.reduce((a,x)=>a+Number(x.outstanding||0),0);
  const overdue = arRows.filter(x=>Number(x.overdue_days||0)>0);
  const counts = notif?.counts||{};

  return (
    <div className="space-y-4">
      <Head icon={Wallet} title="Dashboard Keuangan" subtitle="Piutang, utang, dan kewajiban jatuh tempo" at={at} loading={loading} onRefresh={reload}/>
      {loading ? <PosCard><PosSkeleton rows={8} cols={4}/></PosCard> : err ? <PosCard><PosError message={err} onRetry={reload}/></PosCard> : (
      <motion.div variants={bentoContainer} initial="hidden" animate="show" className="space-y-4">
        <div className="grid grid-cols-12 gap-4">
          <motion.div variants={bentoItem} className="col-span-12 md:col-span-6 xl:col-span-3">
            <PosStat label="Piutang (AR)" value={rupiah(arTotal)} icon={Receipt} tone="bg-surface-3 text-brand" sub={<span className="text-xs mt-1 block text-ink-3">{arRows.length} invoice terbuka</span>}/>
          </motion.div>
          <motion.div variants={bentoItem} className="col-span-12 md:col-span-6 xl:col-span-3">
            <PosStat label="Utang (AP)" value={rupiah(apTotal)} icon={Wallet} tone="bg-warning-soft text-warning" sub={<span className="text-xs mt-1 block text-ink-3">{apRows.length} tagihan terbuka</span>}/>
          </motion.div>
          <motion.div variants={bentoItem} className="col-span-12 md:col-span-6 xl:col-span-3">
            <PosStat label="Lewat jatuh tempo" value={nf(overdue.length)} icon={AlertTriangle} tone="bg-danger-soft text-danger" sub={<span className="text-xs mt-1 block text-ink-3">Invoice perlu penagihan</span>}/>
          </motion.div>
          <motion.div variants={bentoItem} className="col-span-12 md:col-span-6 xl:col-span-3">
            <PosStat label="Stok kritis" value={nf(counts.lowStock)} icon={Boxes} tone="bg-surface-2 text-ink-2" sub={<span className="text-xs mt-1 block text-ink-3">Dampak nilai persediaan</span>}/>
          </motion.div>
        </div>
        <div className="grid grid-cols-12 gap-4">
          <motion.div variants={bentoItem} className="col-span-12 lg:col-span-8">
            <PosCard className="p-5">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h3 className="font-display text-headline-sm font-bold text-ink">Piutang Perlu Perhatian</h3>
                <Link to="/finance/arap" className="text-xs font-semibold text-brand hover:underline flex items-center gap-1 group">
                  Buka AR/AP <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform"/>
                </Link>
              </div>
              <div className="mt-2 divide-y divide-line">
                {arRows.length===0 && <div className="py-6 text-center text-sm text-ink-3">Tidak ada piutang terbuka</div>}
                {[...arRows].sort((a,b)=>Number(b.outstanding||0)-Number(a.outstanding||0)).slice(0,6).map((r,i)=>(
                  <Row key={i} title={r.customer_name||r.invoice_number} sub={(r.invoice_number||'')+' · jatuh tempo '+tgl(r.due_date)}
                    right={<>{Number(r.overdue_days||0)>0 && <PosBadge tone="red">{r.overdue_days} hari</PosBadge>}
                      <div className="text-sm font-bold num">{rupiah(r.outstanding)}</div></>}/>
                ))}
              </div>
            </PosCard>
          </motion.div>
          <motion.div variants={bentoItem} className="col-span-12 lg:col-span-4">
            <Quick items={[['/finance/arap','AR / AP & penagihan',true],['/finance/journals','Jurnal umum'],['/finance/coa','Chart of Accounts'],['/budgets','Budget tahunan']]}/>
          </motion.div>
        </div>
      </motion.div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════ GUDANG */
function WarehouseBoard(){
  const { res, loading, err, at, reload } = useBoard(['/inventory/stocks?limit=60','/dashboard/notifications','/purchase/orders?limit=5&status=APPROVED']);
  const [stocks, notif, po] = res || [];
  const rows = stocks?.data || [];
  const kritis = rows.filter(r=>Number(r.qty_available) <= Number(r.reorder_point||0));
  const counts = notif?.counts||{};
  const poRows = po?.data || [];

  return (
    <div className="space-y-4">
      <Head icon={Boxes} title="Dashboard Gudang" subtitle="Stok, penerimaan, dan pergerakan barang" at={at} loading={loading} onRefresh={reload}/>
      {loading ? <PosCard><PosSkeleton rows={8} cols={4}/></PosCard> : err ? <PosCard><PosError message={err} onRetry={reload}/></PosCard> : (
      <motion.div variants={bentoContainer} initial="hidden" animate="show" className="space-y-4">
        <div className="grid grid-cols-12 gap-4">
          <motion.div variants={bentoItem} className="col-span-12 md:col-span-6 xl:col-span-3">
            <PosStat label="SKU stok kritis" value={nf(counts.lowStock ?? kritis.length)} icon={AlertTriangle} tone="bg-warning-soft text-warning" sub={<span className="text-xs mt-1 block text-ink-3">Di bawah reorder point</span>}/>
          </motion.div>
          <motion.div variants={bentoItem} className="col-span-12 md:col-span-6 xl:col-span-3">
            <PosStat label="PO siap diterima" value={nf(poRows.length)} icon={Truck} tone="bg-info-soft text-info" sub={<Link to="/purchase/receipts" className="text-xs mt-1 inline-block text-brand hover:underline">Buat goods receipt →</Link>}/>
          </motion.div>
          <motion.div variants={bentoItem} className="col-span-12 md:col-span-6 xl:col-span-3">
            <PosStat label="PO terlambat terima" value={nf(counts.poOverdue)} icon={Clock} tone="bg-danger-soft text-danger" sub={<span className="text-xs mt-1 block text-ink-3">Lewat tanggal perkiraan</span>}/>
          </motion.div>
          <motion.div variants={bentoItem} className="col-span-12 md:col-span-6 xl:col-span-3">
            <PosStat label="SKU dipantau" value={nf(stocks?.total ?? rows.length)} icon={PackageSearch} tone="bg-surface-3 text-brand" sub={<Link to="/inventory/stocks" className="text-xs mt-1 inline-block text-brand hover:underline">Lihat semua stok →</Link>}/>
          </motion.div>
        </div>
        <div className="grid grid-cols-12 gap-4">
          <motion.div variants={bentoItem} className="col-span-12 lg:col-span-8">
            <PosCard className="p-5">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h3 className="font-display text-headline-sm font-bold text-ink">Prioritas Reorder Stok</h3>
                <span className="text-xs text-ink-3">Urutan stok kritis terendah</span>
              </div>
              <div className="mt-2 divide-y divide-line">
                {rows.length===0 && <div className="py-6 text-center text-sm text-ink-3">Belum ada data stok</div>}
                {rows.slice(0,8).map((r,i)=>{
                  const isLow = Number(r.qty_available) <= Number(r.reorder_point||0);
                  return (
                    <Row key={i} title={r.product_name} sub={(r.sku||'')+' · '+r.warehouse_name+' · min '+nf(r.reorder_point)}
                      right={<>
                        {isLow && <PosBadge tone="amber">kritis</PosBadge>}
                        <div className={'text-sm font-bold num '+(isLow?'text-[#b45309] dark:text-amber-400':'text-ink')}>{nf(r.qty_available)}</div>
                      </>}/>
                  );
                })}
              </div>
            </PosCard>
          </motion.div>
          <motion.div variants={bentoItem} className="col-span-12 lg:col-span-4">
            <Quick items={[['/inventory/stock-in','Penambahan stok',true],['/inventory/transfers','Transfer gudang'],['/inventory/movements','Kartu stok'],['/logistics','Surat jalan & logistik']]}/>
          </motion.div>
        </div>
      </motion.div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════ PEMBELIAN */
function PurchasingBoard(){
  const { res, loading, err, at, reload } = useBoard(['/purchase/orders?limit=8','/dashboard/notifications']);
  const [po, notif] = res || [];
  const rows = po?.data || [];
  const counts = notif?.counts||{};
  const by = (s)=> rows.filter(r=>String(r.status||'').toUpperCase()===s).length;
  const tone = (s)=> ({PENDING:'amber',APPROVED:'sky',RECEIVED:'emerald',PARTIAL:'purple',CANCELLED:'red'}[String(s||'').toUpperCase()]||'slate');

  return (
    <div className="space-y-4">
      <Head icon={ShoppingCart} title="Dashboard Pembelian" subtitle="Purchase order, RFQ, dan pemasok" at={at} loading={loading} onRefresh={reload}/>
      {loading ? <PosCard><PosSkeleton rows={8} cols={4}/></PosCard> : err ? <PosCard><PosError message={err} onRetry={reload}/></PosCard> : (
      <motion.div variants={bentoContainer} initial="hidden" animate="show" className="space-y-4">
        <div className="grid grid-cols-12 gap-4">
          <motion.div variants={bentoItem} className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="PO menunggu" value={nf(by('PENDING'))} icon={Clock} tone="bg-warning-soft text-warning" sub={<span className="text-xs mt-1 block text-ink-3">Perlu approval / proses</span>}/></motion.div>
          <motion.div variants={bentoItem} className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="PO disetujui" value={nf(by('APPROVED'))} icon={CalendarCheck} tone="bg-info-soft text-info" sub={<span className="text-xs mt-1 block text-ink-3">Siap diterima gudang</span>}/></motion.div>
          <motion.div variants={bentoItem} className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="PO terlambat" value={nf(counts.poOverdue)} icon={AlertTriangle} tone="bg-danger-soft text-danger" sub={<span className="text-xs mt-1 block text-ink-3">Lewat tanggal terima</span>}/></motion.div>
          <motion.div variants={bentoItem} className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="Stok kritis" value={nf(counts.lowStock)} icon={Boxes} tone="bg-surface-2 text-ink-2" sub={<Link to="/inventory/stocks" className="text-xs mt-1 inline-block text-brand hover:underline">Dasar pengadaan →</Link>}/></motion.div>
        </div>
        <div className="grid grid-cols-12 gap-4">
          <motion.div variants={bentoItem} className="col-span-12 lg:col-span-8">
            <PosCard className="p-5">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h3 className="font-display text-headline-sm font-bold text-ink">Purchase Order Terbaru</h3>
                <Link to="/purchase/orders" className="text-xs font-semibold text-brand hover:underline">Semua PO →</Link>
              </div>
              <div className="mt-2 divide-y divide-line">
                {rows.length===0 && <div className="py-6 text-center text-sm text-ink-3">Belum ada PO</div>}
                {rows.slice(0,8).map((r,i)=>(
                  <Row key={i} title={r.po_number||r.supplier_name} sub={(r.supplier_name||'')+' · '+(r.po_date?tgl(r.po_date):'-')+' · '+(r.expected_date?('terima '+tgl(r.expected_date)):'tanpa tanggal')}
                    right={<>
                      <PosBadge tone={tone(r.status)}>{String(r.status||'—').toUpperCase()}</PosBadge>
                      <div className="text-sm font-bold num">{rupiah(r.total)}</div>
                    </>}/>
                ))}
              </div>
            </PosCard>
          </motion.div>
          <motion.div variants={bentoItem} className="col-span-12 lg:col-span-4">
            <Quick items={[['/purchase/orders','Buat PO',true],['/purchase/requests','Permintaan pembelian (PR)'],['/purchase/rfqs','RFQ ke pemasok'],['/purchase/receipts','Penerimaan barang'],['/master/suppliers','Master pemasok']]}/>
          </motion.div>
        </div>
      </motion.div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════ HRD */
function HrBoard(){
  const today=new Date().toISOString().slice(0,10);
  const { res, loading, err, at, reload } = useBoard(['/hr/employees/summary','/hr/attendance/summary?date='+today,'/hr/leaves?status=PENDING&limit=6']);
  const [sum, att, leaves] = res || [];
  const rows = leaves?.data || [];
  const tone = (s)=> ({PENDING:'amber',APPROVED:'emerald',REJECTED:'red'}[String(s||'').toUpperCase()]||'slate');

  return (
    <div className="space-y-4">
      <Head icon={Users} title="Dashboard HR" subtitle="Karyawan, kehadiran, dan approval" at={at} loading={loading} onRefresh={reload}/>
      {loading ? <PosCard><PosSkeleton rows={8} cols={4}/></PosCard> : err ? <PosCard><PosError message={err} onRetry={reload}/></PosCard> : (
      <motion.div variants={bentoContainer} initial="hidden" animate="show" className="space-y-4">
        <div className="grid grid-cols-12 gap-4">
          <motion.div variants={bentoItem} className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="Karyawan aktif" value={nf(sum?.aktif)} icon={Users} tone="bg-surface-3 text-brand" sub={<span className="text-xs mt-1 block text-ink-3">dari {nf(sum?.total)} total</span>}/></motion.div>
          <motion.div variants={bentoItem} className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="Hadir hari ini" value={nf(att?.hadir)} icon={CalendarCheck} tone="bg-success-soft text-success" sub={<span className="text-xs mt-1 block text-ink-3">{nf(att?.terlambat)} terlambat</span>}/></motion.div>
          <motion.div variants={bentoItem} className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="Belum check-in" value={nf(att?.belum_checkin)} icon={Clock} tone="bg-warning-soft text-warning" sub={<span className="text-xs mt-1 block text-ink-3">dari {nf(att?.total_aktif)} karyawan</span>}/></motion.div>
          <motion.div variants={bentoItem} className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="Pengajuan cuti" value={nf(leaves?.total ?? rows.length)} icon={Plane} tone="bg-[#f3efff] text-[#5b3fd6]" sub={<Link to="/approvals" className="text-xs mt-1 inline-block text-brand hover:underline">Buka approval →</Link>}/></motion.div>
        </div>
        <div className="grid grid-cols-12 gap-4">
          <motion.div variants={bentoItem} className="col-span-12 lg:col-span-8">
            <PosCard className="p-5">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h3 className="font-display text-headline-sm font-bold text-ink">Menunggu Persetujuan</h3>
                <Link to="/approvals" className="text-xs font-semibold text-brand hover:underline">Semua pengajuan →</Link>
              </div>
              <div className="mt-2 divide-y divide-line">
                {rows.length===0 && <div className="py-6 text-center text-sm text-ink-3">Tidak ada pengajuan menunggu</div>}
                {rows.map((r,i)=>(
                  <Row key={i} title={r.employee_name||r.name} sub={String(r.type||'').toUpperCase()+' · '+tgl(r.start_date)+' – '+tgl(r.end_date)}
                    right={<PosBadge tone={tone(r.status)}>{String(r.status||'—').toUpperCase()}</PosBadge>}/>
                ))}
              </div>
            </PosCard>
          </motion.div>
          <motion.div variants={bentoItem} className="col-span-12 lg:col-span-4">
            <Quick items={[['/hr','Karyawan & HR',true],['/approvals','Approval cuti & izin'],['/pengumuman','Tulis pengumuman'],['/absen','Rekap absensi']]}/>
          </motion.div>
        </div>
      </motion.div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════ DRIVER */
function DriverBoard(){
  const { res, loading, err, at, reload } = useBoard(['/fleet/trips?mine=1','/fleet/my-deliveries','/fleet/claimable','/hr/attendance/mine','/hr/leaves/quota']);
  const [trips, dels, claim, att, quota] = res || [];
  const tripsArr = Array.isArray(trips)? trips : (trips?.data||[]);
  const delsArr = Array.isArray(dels)? dels : (dels?.data||[]);
  const claimCount = parseInt(claim?.counts?.total||0);
  const aktif = tripsArr.filter(t=>String(t.status).toUpperCase()==='IN_PROGRESS');
  const rencana = tripsArr.filter(t=>String(t.status).toUpperCase()==='PLANNED');
  const selesai = tripsArr.filter(t=>String(t.status).toUpperCase()==='COMPLETED').length;
  const todayRow = att?.today_row || null;
  const tone = (s)=> ({PLANNED:'sky',IN_PROGRESS:'amber',COMPLETED:'emerald',CANCELLED:'red'}[String(s||'').toUpperCase()]||'slate');

  return (
    <div className="space-y-4">
      <Head icon={Truck} title="Dashboard Driver" subtitle="Trip dan surat jalan Anda" at={at} loading={loading} onRefresh={reload}/>
      {loading ? <PosCard><PosSkeleton rows={8} cols={4}/></PosCard> : err ? <PosCard><PosError message={err} onRetry={reload}/></PosCard> : (
      <motion.div variants={bentoContainer} initial="hidden" animate="show" className="space-y-4">
        <div className="grid grid-cols-12 gap-4">
          <motion.div variants={bentoItem} className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="Trip berjalan" value={nf(aktif.length)} icon={Truck} tone="bg-warning-soft text-warning" sub={<Link to="/driver" className="text-xs mt-1 inline-block text-brand hover:underline">Kelola trip →</Link>}/></motion.div>
          <motion.div variants={bentoItem} className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="Siap diklaim" value={nf(claimCount)} icon={PackageSearch} tone="bg-[#f3efff] text-[#5b3fd6]" sub={<Link to="/driver" className="text-xs mt-1 inline-block text-brand hover:underline">DO / SO / POS menunggu sopir →</Link>}/></motion.div>
          <motion.div variants={bentoItem} className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="Trip selesai" value={nf(selesai)} icon={CalendarCheck} tone="bg-success-soft text-success" sub={<span className="text-xs mt-1 block text-ink-3">{nf(rencana.length)} trip direncanakan</span>}/></motion.div>
          <motion.div variants={bentoItem} className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="Absen hari ini" value={todayRow?.check_in? 'Sudah':'Belum'} icon={Clock} tone="bg-surface-3 text-brand"
            sub={<Link to="/absen" className="text-xs mt-1 inline-block text-brand hover:underline">{todayRow?.check_in? ('masuk '+String(todayRow.check_in).slice(11,16)) : 'Check-in sekarang →'}</Link>}/></motion.div>
        </div>
        <div className="grid grid-cols-12 gap-4">
          <motion.div variants={bentoItem} className="col-span-12 lg:col-span-8">
            <PosCard className="p-5">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h3 className="font-display text-headline-sm font-bold text-ink">Trip Saya</h3>
                <Link to="/driver" className="text-xs font-semibold text-brand hover:underline">Semua trip →</Link>
              </div>
              <div className="mt-2 divide-y divide-line">
                {tripsArr.length===0 && <div className="py-6 text-center text-sm text-ink-3">Belum ada trip untuk Anda</div>}
                {tripsArr.slice(0,6).map((t,i)=>(
                  <Row key={i} title={(t.trip_number||'TRIP')+' · '+(t.plat_no||'-')} sub={(t.route||'rute belum diisi')+(t.do_number? ' · DO '+t.do_number : ' · tanpa DO')}
                    right={<PosBadge tone={tone(t.status)}>{String(t.status||'—').replace('_',' ')}</PosBadge>}/>
                ))}
              </div>
            </PosCard>
          </motion.div>
          <motion.div variants={bentoItem} className="col-span-12 lg:col-span-4">
            <PosCard className="p-5">
              <h3 className="font-display text-headline-sm font-bold text-ink">Self-service</h3>
              <div className="mt-3 space-y-2">
                <div className="p-3 rounded-xl bg-surface-2 border border-line">
                  <div className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold">Sisa cuti {quota?.tahun||''}</div>
                  <div className="text-xl font-bold num mt-0.5 text-ink">{nf(quota?.sisa)} <span className="text-xs font-normal text-ink-3">dari {nf(quota?.jatah)} hari</span></div>
                </div>
                <div className="p-3 rounded-xl bg-surface-2 border border-line">
                  <div className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold">Surat jalan aktif</div>
                  <div className="text-xl font-bold num mt-0.5 text-ink">{nf(delsArr.length)} <span className="text-xs font-normal text-ink-3">dokumen</span></div>
                </div>
                {[['/absen','Absen masuk / pulang'],['/cuti','Ajukan cuti'],['/izin','Ajukan izin / sakit'],['/pengumuman','Pengumuman']].map(([to,label])=>(
                  <Link key={to} to={to} className="block p-3 rounded-xl bg-surface border border-line hover:border-brand/40 transition text-sm font-semibold">{label}</Link>
                ))}
              </div>
            </PosCard>
          </motion.div>
        </div>
      </motion.div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════ SELF-SERVICE */
function SelfBoard({ user }){
  const { res, loading, err, at, reload } = useBoard(['/hr/me','/hr/leaves/quota','/hr/attendance/mine','/dashboard/my-notifications']);
  const [me, quota, att, notif] = res || [];
  const todayRow = att?.today_row || null;
  const items = Array.isArray(notif)? notif : (notif?.items||[]);

  return (
    <div className="space-y-4">
      <Head icon={FileText} title="Beranda Saya" subtitle="Kehadiran, cuti, dan informasi untuk Anda" at={at} loading={loading} onRefresh={reload}/>
      {loading ? <PosCard><PosSkeleton rows={8} cols={4}/></PosCard> : err ? <PosCard><PosError message={err} onRetry={reload}/></PosCard> : (
      <motion.div variants={bentoContainer} initial="hidden" animate="show" className="space-y-4">
        <motion.div variants={bentoItem}>
          <PosCard className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand to-brand-tint text-white grid place-items-center font-bold text-lg shadow-sm">
                {(me?.name||user?.username||'?').slice(0,2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="font-display text-headline-sm font-bold text-ink truncate">{me?.name || user?.username}</div>
                <div className="text-xs text-ink-3 truncate font-medium">{me?.position||'—'}{me?.employee_code? ' · '+me.employee_code:''}{me?.department? ' · '+me.department:''}</div>
              </div>
            </div>
          </PosCard>
        </motion.div>
        <div className="grid grid-cols-12 gap-4">
          <motion.div variants={bentoItem} className="col-span-12 md:col-span-4"><PosStat label="Absen hari ini" value={todayRow?.check_in? 'Sudah masuk':'Belum'} icon={Clock} tone="bg-surface-3 text-brand"
            sub={<Link to="/absen" className="text-xs mt-1 inline-block text-brand hover:underline">{todayRow?.check_in? ('pulang: '+(todayRow.check_out? String(todayRow.check_out).slice(11,16):'belum')) : 'Check-in →'}</Link>}/></motion.div>
          <motion.div variants={bentoItem} className="col-span-12 md:col-span-4"><PosStat label={'Sisa cuti '+(quota?.tahun||'')} value={nf(quota?.sisa)} icon={Plane} tone="bg-success-soft text-success" sub={<span className="text-xs mt-1 block text-ink-3">jatah {nf(quota?.jatah)} · pending {nf(quota?.menunggu)}</span>}/></motion.div>
          <motion.div variants={bentoItem} className="col-span-12 md:col-span-4"><PosStat label="Hadir bulan ini" value={nf(att?.summary?.hadir)} icon={CalendarCheck} tone="bg-surface-2 text-ink-2" sub={<span className="text-xs mt-1 block text-ink-3">{nf(att?.summary?.terlambat)} terlambat · {nf(att?.summary?.jam)} jam kerja</span>}/></motion.div>
        </div>
        <div className="grid grid-cols-12 gap-4">
          <motion.div variants={bentoItem} className="col-span-12 lg:col-span-8">
            <PosCard className="p-5">
              <h3 className="font-display text-headline-sm font-bold text-ink">Perlu Perhatian</h3>
              <div className="mt-3 space-y-2 text-sm">
                {items.length===0 && <div className="py-6 text-center text-sm text-ink-3">Tidak ada notifikasi</div>}
                {items.slice(0,6).map((n,i)=>(
                  <Link key={i} to={n.to||'/profil'} className="block p-3 rounded-xl bg-surface-2 border border-line hover:border-brand/40 transition">
                    {n.label} {n.count? <b className="num">({n.count})</b> : null}
                  </Link>
                ))}
              </div>
            </PosCard>
          </motion.div>
          <motion.div variants={bentoItem} className="col-span-12 lg:col-span-4">
            <Quick items={[['/absen','Absen masuk / pulang',true],['/cuti','Ajukan cuti'],['/izin','Izin & sakit'],['/pengumuman','Pengumuman'],['/profil','Profil & password']]}/>
          </motion.div>
        </div>
      </motion.div>
      )}
    </div>
  );
}

function boardFor(roles){
  const r = low(roles);
  if(r.length===0) return 'self';
  if(r.some(x=>SALES_ROLES.includes(x))) return 'sales';
  if(r.some(x=>['finance','auditor'].includes(x))) return 'finance';
  if(r.includes('warehouse') || r.includes('gudang')) return 'warehouse';
  if(r.some(x=>['purchasing','buyer_admin'].includes(x))) return 'purchasing';
  if(r.includes('hrd')) return 'hr';
  if(r.includes('driver')) return 'driver';
  return 'self';
}

export default function Dashboard(){
  const { user } = useAuth();
  const roles = user?.roles || [];
  const board = boardFor(roles);
  if(board==='sales') return <SalesBoard roles={roles}/>;
  if(board==='finance') return <FinanceBoard/>;
  if(board==='warehouse') return <WarehouseBoard/>;
  if(board==='purchasing') return <PurchasingBoard/>;
  if(board==='hr') return <HrBoard/>;
  if(board==='driver') return <DriverBoard/>;
  return <SelfBoard user={user}/>;
}
