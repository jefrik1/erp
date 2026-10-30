import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from 'recharts';
import {
  ArrowUpRight, ArrowDownRight, TrendingUp, AlertTriangle, Wallet, Clock, FileText, RefreshCw,
  PackageSearch, ShoppingCart, Users, Truck, CalendarCheck, Plane, Boxes, Receipt,
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

// Role yang boleh melihat angka penjualan — samakan dengan SALES_VIEWERS di
// src/modules/dashboard/routes.js. Backend mengembalikan 403 untuk role lain.
const SALES_ROLES = ['direktur','super_admin','sales','sales_trading','pos_cashier','pos_supervisor','pos_manager'];
const FIN_ROLES   = ['direktur','super_admin','finance','auditor'];

/** Ambil beberapa endpoint sekaligus. Endpoint yang ditolak (403) tidak
 *  menjatuhkan seluruh board — kartu lain tetap tampil. */
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[key]);
  useEffect(()=>{ load(); const iv=setInterval(load, 5*60*1000); return ()=>clearInterval(iv); },[load]);
  return { res, loading, err, at, reload:load };
}

function Head({ icon, title, subtitle, at, loading, onRefresh, children }){
  const sub = subtitle + (at? ' - diperbarui '+at.toLocaleTimeString('id-ID')+' - auto-refresh 5 menit' : '');
  return (
    <PosPageHeader icon={icon} title={title} subtitle={sub} actions={<>
      {children}
      <button onClick={onRefresh} className={posBtnSecondary+' h-9 px-4 text-xs'}>
        <RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang
      </button>
    </>}/>
  );
}

function Shell({ children, loading, err, onRetry }){
  if(loading && !children) return <PosCard><PosSkeleton rows={8} cols={4}/></PosCard>;
  if(err) return <PosCard><PosError message={err} onRetry={onRetry}/></PosCard>;
  return children;
}

function Quick({ items }){
  return (
    <PosCard className="p-5">
      <h3 className="font-display text-headline-sm font-bold text-ink">Aksi Cepat</h3>
      <div className="mt-3 space-y-2">
        {items.map(([to,label,primary])=>(
          <Link key={to+label} to={to}
            className={primary
              ? 'block p-3 rounded-xl bg-brand text-white text-sm font-bold text-center hover:bg-brand-strong transition'
              : 'block p-3 rounded-xl bg-surface-2 border border-line hover:border-brand/40 transition text-sm font-semibold'}>
            {label}
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
        <div className="text-sm font-semibold truncate">{title}</div>
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
      <Head icon={TrendingUp} title="Dashboard" subtitle="Ringkasan operasional & penjualan" at={at} loading={loading} onRefresh={reload}>
        <span className="text-xs px-3 py-1.5 rounded-full bg-white border border-line">Periode: {months[now.getMonth()]} {now.getFullYear()}</span>
      </Head>

      {loading && !kpi ? <PosCard><PosSkeleton rows={10} cols={4}/></PosCard>
      : err ? <PosCard><PosError message={err} onRetry={reload}/></PosCard>
      : (
      <>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-6 xl:col-span-3">
            <PosStat label="Penjualan hari ini" value={rupiah(k.penjualan_hari_ini)} icon={TrendingUp} tone="bg-surface-3 text-brand"
              sub={<div className={'text-xs mt-1 flex items-center gap-1 '+(growth>=0?'text-emerald-600':'text-red-600')}>
                {growth===null||growth===undefined
                  ? <span className="text-ink-3">Belum ada pembanding kemarin</span>
                  : <>{growth>=0?<ArrowUpRight size={12}/>:<ArrowDownRight size={12}/>}{growth>=0?'+':''}{growth}% vs kemarin</>}
              </div>}/>
          </div>
          <div className="col-span-12 md:col-span-6 xl:col-span-3">
            <PosStat label="Stok kritis" value={nf(k.stok_kritis)} icon={AlertTriangle} tone="bg-warning-soft text-warning"
              sub={<Link to="/inventory/stocks" className="text-xs mt-1 inline-block text-brand hover:underline">SKU di bawah reorder point →</Link>}/>
          </div>
          <div className="col-span-12 md:col-span-6 xl:col-span-3">
            <PosStat label="Piutang jatuh tempo" value={rupiah(piutang.amount)} icon={Wallet} tone="bg-danger-soft text-danger"
              sub={<span className="text-xs mt-1 block text-ink-3">{nf(piutang.count)} invoice lewat jatuh tempo</span>}/>
          </div>
          <div className="col-span-12 md:col-span-6 xl:col-span-3">
            <PosStat label="PO terlambat terima" value={nf(k.po_overdue)} icon={Clock} tone="bg-info-soft text-info"
              sub={<span className="text-xs mt-1 block text-ink-3">Kas di bank {rupiah(k.cash_position)}</span>}/>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4">
          <div className={'col-span-12 '+(canFinance?'xl:col-span-7':'xl:col-span-12')}>
            <PosCard className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-headline-sm font-bold text-ink">Tren Penjualan</h3>
                  <p className="text-xs text-ink-3 mt-0.5">14 hari terakhir</p>
                </div>
                <span className="num text-sm font-bold text-ink">{rupiah(trendData.reduce((a,x)=>a+Number(x.total||0),0))}</span>
              </div>
              <div className="h-[220px] mt-4">
                {trendData.length===0 ? <div className="h-full grid place-items-center text-sm text-ink-3">Belum ada data penjualan</div> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData}>
                      <defs><linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0051d5" stopOpacity={0.22}/><stop offset="100%" stopColor="#0051d5" stopOpacity={0}/>
                      </linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5eeff" vertical={false}/>
                      <XAxis dataKey="date" tick={{fontSize:11, fill:'#76777d'}} tickFormatter={tickD} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fontSize:11, fill:'#76777d'}} tickFormatter={v=>(v/1e6).toFixed(0)+'jt'} axisLine={false} tickLine={false} width={46}/>
                      <Tooltip contentStyle={{borderRadius:12, border:'1px solid #e7ecf7', boxShadow:'0 8px 24px rgba(11,28,48,.12)', fontSize:12}} formatter={v=>[rupiah(v),'Penjualan']} labelFormatter={v=>'Tanggal '+v}/>
                      <Area type="monotone" dataKey="total" stroke="#0051d5" strokeWidth={2} fill="url(#salesFill)"/>
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </PosCard>
          </div>

          {canFinance && (
            <div className="col-span-12 xl:col-span-5">
              <PosCard className="p-5">
                <h3 className="font-display text-headline-sm font-bold text-ink">Revenue vs Profit</h3>
                <p className="text-xs text-ink-3 mt-0.5">Profit = estimasi pakai avg cost stok saat ini</p>
                <div className="h-[175px] mt-4">
                  {profitData.length===0 ? <div className="h-full grid place-items-center text-sm text-ink-3">Belum ada data</div> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={profitData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5eeff" vertical={false}/>
                        <XAxis dataKey="date" tick={{fontSize:11, fill:'#76777d'}} tickFormatter={tickD} axisLine={false} tickLine={false}/>
                        <YAxis tick={{fontSize:11, fill:'#76777d'}} tickFormatter={v=>(v/1e6).toFixed(0)+'jt'} axisLine={false} tickLine={false} width={44}/>
                        <Tooltip contentStyle={{borderRadius:12, border:'1px solid #e7ecf7', boxShadow:'0 8px 24px rgba(11,28,48,.12)', fontSize:12}} formatter={(v,n)=>[rupiah(v), n==='revenue'?'Revenue':'Profit']} labelFormatter={v=>'Tanggal '+v}/>
                        <Bar dataKey="revenue" fill="#0051d5" radius={[6,6,0,0]}/>
                        <Bar dataKey="profit" fill="#b45309" radius={[6,6,0,0]}/>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="flex gap-3 text-xs justify-center items-center mt-2">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-brand rounded"/>Revenue</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-[#b45309] rounded"/>Profit</span>
                </div>
              </PosCard>
            </div>
          )}
        </div>

        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-4">
            <PosCard className="p-5">
              <h3 className="font-display text-headline-sm font-bold text-ink">Top Produk</h3>
              <div className="mt-3 space-y-3">
                {(topP||[]).length===0 && <div className="text-sm text-ink-3 py-4 text-center">Belum ada penjualan</div>}
                {(topP||[]).map((p,i)=>(
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-surface-3 grid place-items-center font-bold text-xs">{i+1}</div>
                    <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{p.name}</div><div className="text-xs text-ink-2 tabular-nums">{nf(p.qty)} unit terjual</div></div>
                    <div className="text-sm font-bold tabular-nums">{rupiah(p.revenue)}</div>
                  </div>
                ))}
              </div>
            </PosCard>
          </div>
          <div className="col-span-12 lg:col-span-4">
            <PosCard className="p-5">
              <h3 className="font-display text-headline-sm font-bold text-ink">Top Customer</h3>
              <div className="mt-3 space-y-3">
                {(topC||[]).length===0 && <div className="text-sm text-ink-3 py-4 text-center">Belum ada data</div>}
                {(topC||[]).map((c,i)=>(
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-brand/10 grid place-items-center text-brand font-bold text-xs">{String(c.name||'?')[0]}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{c.name}</div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full mt-1"><div className="h-full bg-brand rounded-full" style={{width: Math.round((Number(c.total||0)/maxCust)*100)+'%'}}/></div>
                    </div>
                    <div className="text-sm font-bold tabular-nums">{rupiah(c.total)}</div>
                  </div>
                ))}
              </div>
            </PosCard>
          </div>
          <div className="col-span-12 lg:col-span-4">
            <PosCard className="p-5">
              <h3 className="font-display text-headline-sm font-bold text-ink">Notifikasi & Aksi Cepat</h3>
              <div className="mt-3 space-y-2 text-sm">
                {can('inventory') && <Link to="/inventory/stocks" className="block p-3 rounded-xl bg-amber-50 border border-amber-200 hover:border-amber-300 transition"><b>Stok kritis:</b> {counts.lowStock??0} SKU di bawah reorder point</Link>}
                {can('invoices') && <Link to="/sales/invoices" className="block p-3 rounded-xl bg-red-50 border border-red-200 hover:border-red-300 transition"><b>Invoice overdue:</b> {counts.overdueInvoices??0} invoice lewat jatuh tempo</Link>}
                {can('purchase') && <Link to="/purchase/orders" className="block p-3 rounded-xl bg-sky-50 border border-sky-200 hover:border-sky-300 transition"><b>PO overdue:</b> {counts.poOverdue??0} PO terlambat terima</Link>}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4">
                {can('pos') && <Link to="/sales/pos" className="text-center py-2 rounded-xl bg-brand text-white text-xs font-bold hover:bg-brand-strong transition">Buka POS</Link>}
                {can('salesOrders') && <Link to="/sales/orders/new" className="text-center py-2 rounded-xl bg-white border text-xs font-bold hover:bg-surface-2 transition">Buat SO</Link>}
                {can('purchase') && <Link to="/purchase/orders" className="text-center py-2 rounded-xl bg-white border text-xs font-bold hover:bg-surface-2 transition">Buat PO</Link>}
                {can('inventory') && <Link to="/inventory/stock-in" className="text-center py-2 rounded-xl bg-[#b45309] text-white text-xs font-bold hover:bg-amber-600 transition">Input Stok</Link>}
              </div>
            </PosCard>
          </div>
        </div>
      </>
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
      <>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="Piutang (AR)" value={rupiah(arTotal)} icon={Receipt} tone="bg-surface-3 text-brand" sub={<span className="text-xs mt-1 block text-ink-3">{arRows.length} invoice terbuka</span>}/></div>
          <div className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="Utang (AP)" value={rupiah(apTotal)} icon={Wallet} tone="bg-warning-soft text-warning" sub={<span className="text-xs mt-1 block text-ink-3">{apRows.length} tagihan terbuka</span>}/></div>
          <div className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="Lewat jatuh tempo" value={nf(overdue.length)} icon={AlertTriangle} tone="bg-danger-soft text-danger" sub={<span className="text-xs mt-1 block text-ink-3">Invoice perlu penagihan</span>}/></div>
          <div className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="Stok kritis" value={nf(counts.lowStock)} icon={Boxes} tone="bg-surface-2 text-ink-2" sub={<span className="text-xs mt-1 block text-ink-3">Dampak nilai persediaan</span>}/></div>
        </div>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-8">
            <PosCard className="p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-headline-sm font-bold text-ink">Piutang Perlu Perhatian</h3>
                <Link to="/finance/arap" className="text-xs font-semibold text-brand hover:underline">Buka AR/AP →</Link>
              </div>
              <div className="mt-2 divide-y divide-line">
                {arRows.length===0 && <div className="py-6 text-center text-sm text-ink-3">Tidak ada piutang terbuka</div>}
                {[...arRows].sort((a,b)=>Number(b.outstanding||0)-Number(a.outstanding||0)).slice(0,6).map((r,i)=>(
                  <Row key={i} title={r.customer_name||r.invoice_number} sub={(r.invoice_number||'')+' · jatuh tempo '+tgl(r.due_date)}
                    right={<>{Number(r.overdue_days||0)>0 && <PosBadge tone="red">{r.overdue_days} hari</PosBadge>}
                      <div className="text-sm font-bold tabular-nums">{rupiah(r.outstanding)}</div></>}/>
                ))}
              </div>
            </PosCard>
          </div>
          <div className="col-span-12 lg:col-span-4">
            <Quick items={[['/finance/arap','AR / AP & penagihan',true],['/finance/journals','Jurnal umum'],['/finance/coa','Chart of Accounts'],['/budgets','Budget tahunan']]}/>
          </div>
        </div>
      </>
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
      <>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="SKU stok kritis" value={nf(counts.lowStock ?? kritis.length)} icon={AlertTriangle} tone="bg-warning-soft text-warning" sub={<span className="text-xs mt-1 block text-ink-3">Di bawah reorder point</span>}/></div>
          <div className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="PO siap diterima" value={nf(poRows.length)} icon={Truck} tone="bg-info-soft text-info" sub={<Link to="/purchase/receipts" className="text-xs mt-1 inline-block text-brand hover:underline">Buat goods receipt →</Link>}/></div>
          <div className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="PO terlambat terima" value={nf(counts.poOverdue)} icon={Clock} tone="bg-danger-soft text-danger" sub={<span className="text-xs mt-1 block text-ink-3">Lewat tanggal perkiraan</span>}/></div>
          <div className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="SKU dipantau" value={nf(stocks?.total ?? rows.length)} icon={PackageSearch} tone="bg-surface-3 text-brand" sub={<Link to="/inventory/stocks" className="text-xs mt-1 inline-block text-brand hover:underline">Lihat semua stok →</Link>}/></div>
        </div>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-8">
            <PosCard className="p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-headline-sm font-bold text-ink">Stok Terendah</h3>
                <span className="text-xs text-ink-3">urut qty tersedia</span>
              </div>
              <div className="mt-2 divide-y divide-line">
                {rows.length===0 && <div className="py-6 text-center text-sm text-ink-3">Belum ada data stok</div>}
                {rows.slice(0,8).map((r,i)=>{
                  const isLow = Number(r.qty_available) <= Number(r.reorder_point||0);
                  return (
                    <Row key={i} title={r.product_name} sub={(r.sku||'')+' · '+r.warehouse_name+' · min '+nf(r.reorder_point)}
                      right={<>
                        {isLow && <PosBadge tone="amber">kritis</PosBadge>}
                        <div className={'text-sm font-bold tabular-nums '+(isLow?'text-[#b45309]':'text-ink')}>{nf(r.qty_available)}</div>
                      </>}/>
                  );
                })}
              </div>
            </PosCard>
          </div>
          <div className="col-span-12 lg:col-span-4">
            <Quick items={[['/inventory/stock-in','Penambahan stok',true],['/inventory/transfers','Transfer gudang'],['/inventory/movements','Kartu stok'],['/logistics','Surat jalan & logistik']]}/>
          </div>
        </div>
      </>
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
      <>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="PO menunggu" value={nf(by('PENDING'))} icon={Clock} tone="bg-warning-soft text-warning" sub={<span className="text-xs mt-1 block text-ink-3">Perlu approval / proses</span>}/></div>
          <div className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="PO disetujui" value={nf(by('APPROVED'))} icon={CalendarCheck} tone="bg-info-soft text-info" sub={<span className="text-xs mt-1 block text-ink-3">Siap diterima gudang</span>}/></div>
          <div className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="PO terlambat" value={nf(counts.poOverdue)} icon={AlertTriangle} tone="bg-danger-soft text-danger" sub={<span className="text-xs mt-1 block text-ink-3">Lewat tanggal terima</span>}/></div>
          <div className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="Stok kritis" value={nf(counts.lowStock)} icon={Boxes} tone="bg-surface-2 text-ink-2" sub={<Link to="/inventory/stocks" className="text-xs mt-1 inline-block text-brand hover:underline">Dasar pengadaan →</Link>}/></div>
        </div>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-8">
            <PosCard className="p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-headline-sm font-bold text-ink">Purchase Order Terbaru</h3>
                <Link to="/purchase/orders" className="text-xs font-semibold text-brand hover:underline">Semua PO →</Link>
              </div>
              <div className="mt-2 divide-y divide-line">
                {rows.length===0 && <div className="py-6 text-center text-sm text-ink-3">Belum ada PO</div>}
                {rows.slice(0,8).map((r,i)=>(
                  <Row key={i} title={r.po_number||r.supplier_name} sub={(r.supplier_name||'')+' · '+(r.po_date?tgl(r.po_date):'-')+' · '+(r.expected_date?('terima '+tgl(r.expected_date)):'tanpa tanggal')}
                    right={<>
                      <PosBadge tone={tone(r.status)}>{String(r.status||'—').toUpperCase()}</PosBadge>
                      <div className="text-sm font-bold tabular-nums">{rupiah(r.total)}</div>
                    </>}/>
                ))}
              </div>
            </PosCard>
          </div>
          <div className="col-span-12 lg:col-span-4">
            <Quick items={[['/purchase/orders','Buat PO',true],['/purchase/requests','Permintaan pembelian (PR)'],['/purchase/rfqs','RFQ ke pemasok'],['/purchase/receipts','Penerimaan barang'],['/master/suppliers','Master pemasok']]}/>
          </div>
        </div>
      </>
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
      <>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="Karyawan aktif" value={nf(sum?.aktif)} icon={Users} tone="bg-surface-3 text-brand" sub={<span className="text-xs mt-1 block text-ink-3">dari {nf(sum?.total)} total</span>}/></div>
          <div className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="Hadir hari ini" value={nf(att?.hadir)} icon={CalendarCheck} tone="bg-success-soft text-success" sub={<span className="text-xs mt-1 block text-ink-3">{nf(att?.terlambat)} terlambat</span>}/></div>
          <div className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="Belum check-in" value={nf(att?.belum_checkin)} icon={Clock} tone="bg-warning-soft text-warning" sub={<span className="text-xs mt-1 block text-ink-3">dari {nf(att?.total_aktif)} karyawan aktif</span>}/></div>
          <div className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="Pengajuan menunggu" value={nf(leaves?.total ?? rows.length)} icon={Plane} tone="bg-[#f3efff] text-[#5b3fd6]" sub={<Link to="/approvals" className="text-xs mt-1 inline-block text-brand hover:underline">Buka approval →</Link>}/></div>
        </div>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-8">
            <PosCard className="p-5">
              <div className="flex items-center justify-between">
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
          </div>
          <div className="col-span-12 lg:col-span-4">
            <Quick items={[['/hr','Karyawan & HR',true],['/approvals','Approval cuti & izin'],['/pengumuman','Tulis pengumuman'],['/absen','Rekap absensi']]}/>
          </div>
        </div>
      </>
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
      <>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="Trip berjalan" value={nf(aktif.length)} icon={Truck} tone="bg-warning-soft text-warning" sub={<Link to="/driver" className="text-xs mt-1 inline-block text-brand hover:underline">Kelola trip →</Link>}/></div>
          <div className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="Siap diklaim" value={nf(claimCount)} icon={PackageSearch} tone="bg-[#f3efff] text-[#5b3fd6]" sub={<Link to="/driver" className="text-xs mt-1 inline-block text-brand hover:underline">DO / SO / POS menunggu sopir →</Link>}/></div>
          <div className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="Trip selesai" value={nf(selesai)} icon={CalendarCheck} tone="bg-success-soft text-success" sub={<span className="text-xs mt-1 block text-ink-3">{nf(rencana.length)} trip direncanakan</span>}/></div>
          <div className="col-span-12 md:col-span-6 xl:col-span-3"><PosStat label="Absen hari ini" value={todayRow?.check_in? 'Sudah':'Belum'} icon={Clock} tone="bg-surface-3 text-brand"
            sub={<Link to="/absen" className="text-xs mt-1 inline-block text-brand hover:underline">{todayRow?.check_in? ('masuk '+String(todayRow.check_in).slice(11,16)) : 'Check-in sekarang →'}</Link>}/></div>
        </div>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-8">
            <PosCard className="p-5">
              <div className="flex items-center justify-between">
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
          </div>
          <div className="col-span-12 lg:col-span-4">
            <PosCard className="p-5">
              <h3 className="font-display text-headline-sm font-bold text-ink">Self-service</h3>
              <div className="mt-3 space-y-2">
                <div className="p-3 rounded-xl bg-surface-2 border border-line">
                  <div className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold">Sisa cuti {quota?.tahun||''}</div>
                  <div className="text-xl font-bold num mt-0.5">{nf(quota?.sisa)} <span className="text-xs font-normal text-ink-3">dari {nf(quota?.jatah)} hari</span></div>
                </div>
                <div className="p-3 rounded-xl bg-surface-2 border border-line">
                  <div className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold">Surat jalan aktif</div>
                  <div className="text-xl font-bold num mt-0.5">{nf(delsArr.length)} <span className="text-xs font-normal text-ink-3">dokumen</span></div>
                </div>
                {[['/absen','Absen masuk / pulang'],['/cuti','Ajukan cuti'],['/izin','Ajukan izin / sakit'],['/pengumuman','Pengumuman']].map(([to,label])=>(
                  <Link key={to} to={to} className="block p-3 rounded-xl bg-white border border-line hover:border-brand/40 transition text-sm font-semibold">{label}</Link>
                ))}
              </div>
            </PosCard>
          </div>
        </div>
      </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════ SELF-SERVICE (karyawan tanpa menu ops) */
function SelfBoard({ user }){
  const { res, loading, err, at, reload } = useBoard(['/hr/me','/hr/leaves/quota','/hr/attendance/mine','/dashboard/my-notifications']);
  const [me, quota, att, notif] = res || [];
  const todayRow = att?.today_row || null;
  const items = Array.isArray(notif)? notif : (notif?.items||[]);

  return (
    <div className="space-y-4">
      <Head icon={FileText} title="Beranda Saya" subtitle="Kehadiran, cuti, dan informasi untuk Anda" at={at} loading={loading} onRefresh={reload}/>
      {loading ? <PosCard><PosSkeleton rows={8} cols={4}/></PosCard> : err ? <PosCard><PosError message={err} onRetry={reload}/></PosCard> : (
      <>
        <PosCard className="p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-brand/10 text-brand grid place-items-center font-bold">{(me?.name||user?.username||'?').slice(0,2).toUpperCase()}</div>
            <div className="min-w-0">
              <div className="font-display text-headline-sm font-bold text-ink truncate">{me?.name || user?.username}</div>
              <div className="text-xs text-ink-3 truncate">{me?.position||'—'}{me?.employee_code? ' · '+me.employee_code:''}{me?.department? ' · '+me.department:''}</div>
            </div>
          </div>
        </PosCard>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-4"><PosStat label="Absen hari ini" value={todayRow?.check_in? 'Sudah masuk':'Belum'} icon={Clock} tone="bg-surface-3 text-brand"
            sub={<Link to="/absen" className="text-xs mt-1 inline-block text-brand hover:underline">{todayRow?.check_in? ('pulang: '+(todayRow.check_out? String(todayRow.check_out).slice(11,16):'belum')) : 'Check-in →'}</Link>}/></div>
          <div className="col-span-12 md:col-span-4"><PosStat label={'Sisa cuti '+(quota?.tahun||'')} value={nf(quota?.sisa)} icon={Plane} tone="bg-success-soft text-success" sub={<span className="text-xs mt-1 block text-ink-3">jatah {nf(quota?.jatah)} · pending {nf(quota?.menunggu)}</span>}/></div>
          <div className="col-span-12 md:col-span-4"><PosStat label="Hadir bulan ini" value={nf(att?.summary?.hadir)} icon={CalendarCheck} tone="bg-surface-2 text-ink-2" sub={<span className="text-xs mt-1 block text-ink-3">{nf(att?.summary?.terlambat)} terlambat · {nf(att?.summary?.jam)} jam kerja</span>}/></div>
        </div>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-8">
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
          </div>
          <div className="col-span-12 lg:col-span-4">
            <Quick items={[['/absen','Absen masuk / pulang',true],['/cuti','Ajukan cuti'],['/izin','Izin & sakit'],['/pengumuman','Pengumuman'],['/profil','Profil & password']]}/>
          </div>
        </div>
      </>
      )}
    </div>
  );
}

/** Penjualan hanya untuk admin, kasir, sales. Role lain dapat board-nya sendiri. */
function boardFor(roles){
  const r = low(roles);
  if(r.length===0) return 'self';
  if(r.some(x=>SALES_ROLES.includes(x))) return 'sales';
  if(r.some(x=>['finance','auditor'].includes(x))) return 'finance';
  if(r.includes('warehouse')) return 'warehouse';
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
