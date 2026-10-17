import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { ArrowUpRight, ArrowDownRight, AlertTriangle, Wallet, Clock, TrendingUp, FileText, RefreshCw } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../store/auth';
import { PosPageHeader, PosCard, PosSkeleton, PosError, posBtnSecondary } from '../components/PosUI';

const nf = (n)=> new Intl.NumberFormat('id-ID').format(Math.round(Number(n)||0));
const rupiah = (n)=> 'Rp ' + nf(n);
const d10 = (v)=> String(v||'').slice(0,10);
const tickD = (v)=> String(v).slice(8,10)+'/'+String(v).slice(5,7);
const FIN_ROLES = ['direktur','finance','super_admin','admin','auditor'];

export default function Dashboard(){
  const { user } = useAuth();
  const myRoles = (user?.roles||[]).map(r=>String(r).toLowerCase());
  const canFinance = myRoles.length===0 || myRoles.some(r=>FIN_ROLES.includes(r));

  const [kpi,setKpi]=useState(null); const [trend,setTrend]=useState([]); const [topP,setTopP]=useState([]);
  const [topC,setTopC]=useState([]); const [profit,setProfit]=useState([]); const [notif,setNotif]=useState(null);
  const [loading,setLoading]=useState(true); const [err,setErr]=useState(''); const [updatedAt,setUpdatedAt]=useState(null);

  const now=new Date();
  const months=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const monthYear=`${months[now.getMonth()]} ${now.getFullYear()}`;

  const load=useCallback(async()=>{
    setErr('');
    try{
      const [k,t,p,c,pr,n]=await Promise.all([
        api.get('/dashboard/kpi'),
        api.get('/dashboard/sales-trend'),
        api.get('/dashboard/top-products'),
        api.get('/dashboard/top-customers'),
        api.get('/dashboard/profit-margin'),
        api.get('/dashboard/notifications'),
      ]);
      setKpi(k.data);
      setTrend((t.data||[]).map(x=>({...x, date:d10(x.date)})));
      setTopP(p.data||[]);
      setTopC(c.data||[]);
      setProfit((pr.data||[]).map(x=>({...x, date:d10(x.date)})));
      setNotif(n.data||null);
      setUpdatedAt(new Date());
    }catch(e){ setErr(e.response?.data?.error||e.message||'Gagal memuat dashboard'); }
    finally{ setLoading(false); }
  },[]);
  useEffect(()=>{ load(); const iv=setInterval(load, 5*60*1000); return ()=>clearInterval(iv); },[load]);

  const marginPct=useMemo(()=>{
    const rev=profit.reduce((a,x)=>a+Number(x.revenue||0),0);
    const pft=profit.reduce((a,x)=>a+Number(x.profit||0),0);
    return rev>0 ? Math.round((pft/rev)*1000)/10 : null;
  },[profit]);
  const maxCust=useMemo(()=>Math.max(1,...topC.map(c=>Number(c.total||0))),[topC]);
  const counts=notif?.counts||{};

  if(loading && !kpi) return (
    <div className="space-y-3">
      <PosPageHeader icon={FileText} title="Dashboard" subtitle="Memuat ringkasan operasional..."/>
      <PosCard><PosSkeleton rows={10} cols={4}/></PosCard>
    </div>
  );
  if(err && !kpi) return (
    <div className="space-y-3">
      <PosPageHeader icon={FileText} title="Dashboard"/>
      <PosCard><PosError message={err} onRetry={load}/></PosCard>
    </div>
  );

  const growth=kpi?.growth_pct;
  const sub='Ringkasan operasional'+(updatedAt? ' - diperbarui '+updatedAt.toLocaleTimeString('id-ID') : '')+' - auto-refresh tiap 5 menit';

  return (
    <div className="space-y-3">
      <PosPageHeader icon={FileText} title="Dashboard" subtitle={sub} actions={<>
        <span className="text-xs px-3 py-1.5 rounded-full bg-white border border-[#E2E8F0]">Periode: {monthYear}</span>
        <button onClick={load} className={posBtnSecondary+' h-9 px-4 text-xs'}><RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang</button>
      </>}/>

      <div className="grid grid-cols-12 gap-4">
        <div className={'col-span-12 '+(canFinance?'lg:col-span-3':'lg:col-span-6')}>
          <PosCard className="p-5 h-full">
            <div className="flex flex-wrap justify-between gap-3 items-start">
              <div className="text-xs font-bold tracking-widest text-[#94A3B8]">PENJUALAN HARI INI</div>
              <div className="w-8 h-8 rounded-xl bg-blue-50 grid place-items-center text-[#1E40AF]"><TrendingUp size={16}/></div>
            </div>
            <div className="text-[20px] font-black tracking-tight text-[#0F172A] mt-2 tabular-nums">{rupiah(kpi.penjualan_hari_ini)}</div>
            {growth===null ? (
              <div className="text-xs text-[#94A3B8] mt-1">Belum ada pembanding kemarin</div>
            ) : (
              <div className={'text-xs mt-1 flex items-center gap-1 '+(growth>=0?'text-emerald-600':'text-red-600')}>
                {growth>=0? <ArrowUpRight size={12}/> : <ArrowDownRight size={12}/>}{growth>=0?'+':''}{growth}% vs kemarin
              </div>
            )}
            <div className="text-xs text-[#64748B] mt-1 tabular-nums">Kemarin: {rupiah(kpi.penjualan_kemarin)}</div>
          </PosCard>
        </div>

        <div className={'col-span-12 '+(canFinance?'lg:col-span-3':'lg:col-span-6')}>
          <PosCard className="p-5 h-full">
            <div className="flex justify-between">
              <div className="text-xs font-bold tracking-widest text-[#94A3B8]">STOK KRITIS</div>
              <div className="w-8 h-8 rounded-xl bg-amber-50 grid place-items-center text-amber-600"><AlertTriangle size={16}/></div>
            </div>
            <div className="text-[20px] font-black tracking-tight text-[#0F172A] mt-2 tabular-nums">{kpi.stok_kritis} <span className="text-sm font-medium text-[#64748B]">SKU</span></div>
            <div className="text-xs text-amber-600 mt-1">Di bawah reorder point</div>
            <Link to="/inventory/stocks" className="mt-2 inline-block text-xs font-semibold text-[#1E40AF] hover:underline">Lihat stok</Link>
          </PosCard>
        </div>

        {canFinance && (
          <div className="col-span-12 lg:col-span-3">
            <PosCard className="p-5 h-full">
              <div className="flex justify-between">
                <div className="text-xs font-bold tracking-widest text-[#94A3B8]">PIUTANG JATUH TEMPO</div>
                <div className="w-8 h-8 rounded-xl bg-red-50 grid place-items-center text-red-600"><Clock size={16}/></div>
              </div>
              <div className="text-[20px] font-black tracking-tight text-[#0F172A] mt-2 tabular-nums">{rupiah(kpi.piutang_jatuh_tempo.amount)}</div>
              <div className="text-xs text-red-600 mt-1">{kpi.piutang_jatuh_tempo.count} invoice lewat jatuh tempo</div>
              <Link to="/finance/arap" className="mt-2 inline-block text-xs font-semibold text-[#1E40AF] hover:underline">Lihat AR</Link>
            </PosCard>
          </div>
        )}

        {canFinance && (
          <div className="col-span-12 lg:col-span-3">
            <div className="bg-[#0F172A] rounded-[20px] border border-[#0F172A] shadow-sm p-5 text-white h-full">
              <div className="text-xs font-bold tracking-widest text-white/60">CASH POSITION</div>
              <div className="text-[22px] font-black mt-2 text-white tabular-nums">{rupiah(kpi.cash_position)}</div>
              <div className="text-xs text-white/60 mt-1 flex items-center gap-2"><Wallet size={12}/>{(kpi.bank_names||[]).join(' + ')||'Belum ada rekening'}</div>
              <div className="mt-3 flex gap-2 text-xs"><span className="px-2 py-1 rounded-full bg-white/10">PO overdue: {kpi.po_overdue}</span></div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-8">
          <PosCard className="p-5">
            <h3 className="font-bold">Tren Penjualan (14 hari)</h3>
            <div className="h-[240px] mt-4">
              {trend.length===0 ? <div className="h-full grid place-items-center text-sm text-[#94A3B8]">Belum ada data penjualan</div> : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend}>
                    <XAxis dataKey="date" tick={{fontSize:11}} tickFormatter={tickD}/>
                    <YAxis tick={{fontSize:11}} tickFormatter={v=>(v/1e6).toFixed(0)+'jt'}/>
                    <Tooltip formatter={v=>[rupiah(v),'Total']} labelFormatter={v=>'Tanggal '+v}/>
                    <Area type="monotone" dataKey="total" stroke="#1E40AF" fill="#DBEAFE" strokeWidth={2.5}/>
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </PosCard>
        </div>
        <div className="col-span-12 lg:col-span-4">
          <PosCard className="p-5">
            <div className="flex justify-between items-center">
              <h3 className="font-bold">Margin Laba (7 hari)</h3>
              {marginPct!==null && <span className="text-xs px-2 py-1 rounded-full bg-[#F1F5F9] border text-[#475569] font-bold tabular-nums">margin {marginPct}%</span>}
            </div>
            <div className="h-[240px] mt-4">
              {profit.length===0 ? <div className="h-full grid place-items-center text-sm text-[#94A3B8]">Belum ada data</div> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={profit}>
                    <XAxis dataKey="date" tick={{fontSize:10}} tickFormatter={tickD}/>
                    <YAxis tick={{fontSize:10}} tickFormatter={v=>(v/1e6).toFixed(0)+'jt'}/>
                    <Tooltip formatter={(v,n)=>[rupiah(v), n==='revenue'?'Revenue':'Profit']} labelFormatter={v=>'Tanggal '+v}/>
                    <Bar dataKey="revenue" fill="#1E40AF" radius={[6,6,0,0]}/>
                    <Bar dataKey="profit" fill="#F59E0B" radius={[6,6,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="flex gap-3 text-xs justify-center items-center">
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-[#1E40AF] rounded"/>Revenue</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-[#F59E0B] rounded"/>Profit</span>
            </div>
            <div className="text-[11px] text-[#94A3B8] text-center mt-1">Profit = estimasi pakai avg cost stok saat ini</div>
          </PosCard>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-4">
          <PosCard className="p-5">
            <h3 className="font-bold">Top Produk (revenue)</h3>
            <div className="mt-3 space-y-3">
              {topP.length===0 && <div className="text-sm text-[#94A3B8] py-4 text-center">Belum ada penjualan</div>}
              {topP.map((p,i)=>(
                <div key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#F1F5F9] grid place-items-center font-bold text-xs">{i+1}</div>
                  <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{p.name}</div><div className="text-xs text-[#64748B] tabular-nums">{nf(p.qty)} unit terjual</div></div>
                  <div className="text-sm font-bold tabular-nums">{rupiah(p.revenue)}</div>
                </div>
              ))}
            </div>
          </PosCard>
        </div>
        <div className="col-span-12 lg:col-span-4">
          <PosCard className="p-5">
            <h3 className="font-bold">Top Customer</h3>
            <div className="mt-3 space-y-3">
              {topC.length===0 && <div className="text-sm text-[#94A3B8] py-4 text-center">Belum ada data</div>}
              {topC.map((c,i)=>(
                <div key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#1E40AF]/10 grid place-items-center text-[#1E40AF] font-bold text-xs">{String(c.name||'?')[0]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{c.name}</div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full mt-1"><div className="h-full bg-[#1E40AF] rounded-full" style={{width: Math.round((Number(c.total||0)/maxCust)*100)+'%'}}/></div>
                  </div>
                  <div className="text-sm font-bold tabular-nums">{rupiah(c.total)}</div>
                </div>
              ))}
            </div>
          </PosCard>
        </div>
        <div className="col-span-12 lg:col-span-4">
          <PosCard className="p-5">
            <h3 className="font-bold">Notifikasi & Aksi Cepat</h3>
            <div className="mt-3 space-y-2 text-sm">
              <Link to="/inventory/stocks" className="block p-3 rounded-xl bg-amber-50 border border-amber-200 hover:border-amber-300 transition"><b>Stok kritis:</b> {counts.lowStock??0} SKU di bawah reorder point</Link>
              <Link to="/sales/invoices" className="block p-3 rounded-xl bg-red-50 border border-red-200 hover:border-red-300 transition"><b>Invoice overdue:</b> {counts.overdueInvoices??0} invoice lewat jatuh tempo</Link>
              <Link to="/purchase/orders" className="block p-3 rounded-xl bg-sky-50 border border-sky-200 hover:border-sky-300 transition"><b>PO overdue:</b> {counts.poOverdue??0} PO terlambat terima</Link>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4">
              <Link to="/sales/orders/new" className="text-center py-2 rounded-xl bg-[#1E40AF] text-white text-xs font-bold hover:bg-[#1E3A8A] transition">Buat SO</Link>
              <Link to="/purchase/orders" className="text-center py-2 rounded-xl bg-white border text-xs font-bold hover:bg-[#F8FAFC] transition">Buat PO</Link>
              <Link to="/inventory/stock-in" className="text-center py-2 rounded-xl bg-[#F59E0B] text-white text-xs font-bold hover:bg-amber-600 transition">Input Stok</Link>
            </div>
          </PosCard>
        </div>
      </div>
    </div>
  );
}
