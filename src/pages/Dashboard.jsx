
import { useEffect, useState } from 'react';
import api from '../lib/api';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { ArrowUpRight, AlertTriangle, Wallet, Package, Clock, TrendingUp, FileText } from 'lucide-react';

function rupiah(n){ return new Intl.NumberFormat('id-ID',{style:'currency', currency:'IDR', maximumFractionDigits:0}).format(n||0); }

export default function Dashboard(){
  const [kpi,setKpi]=useState(null); const [trend,setTrend]=useState([]); const [topP,setTopP]=useState([]); const [topC,setTopC]=useState([]); const [profit,setProfit]=useState([]); const [notif,setNotif]=useState(null);
  const now=new Date(); const months=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const monthYear=`${months[now.getMonth()]} ${now.getFullYear()}`;
  useEffect(()=>{
    api.get('/dashboard/kpi').then(r=>setKpi(r.data));
    api.get('/dashboard/sales-trend').then(r=>setTrend(r.data));
    api.get('/dashboard/top-products').then(r=>setTopP(r.data));
    api.get('/dashboard/top-customers').then(r=>setTopC(r.data));
    api.get('/dashboard/profit-margin').then(r=>setProfit(r.data));
    api.get('/dashboard/notifications').then(r=>setNotif(r.data));
  },[]);
  if(!kpi) return <div className="p-8 text-[#94A3B8]">Memuat dashboard...</div>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white grid place-items-center shrink-0 shadow-sm"><FileText size={18} strokeWidth={2.2}/></div><div><h1 className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A] leading-none">Dashboard</h1><p className="text-xs text-[#64748B] mt-1">Ringkasan operasional real-time • Refresh 5 menit • Role-based view</p></div></div>
        <div className="flex gap-2"><span className="text-xs px-3 py-1.5 rounded-full bg-white border border-[#E2E8F0]">Periode: {monthYear}</span><span className="text-xs px-3 py-1.5 rounded-full bg-[#1E40AF] text-white">Cabang: Semua</span></div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-3 bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-5">
          <div className="flex flex-wrap justify-between gap-3 items-start"><div className="text-xs font-bold tracking-widest text-[#94A3B8]">PENJUALAN HARI INI</div><div className="w-8 h-8 rounded-xl bg-blue-50 grid place-items-center text-[#1E40AF]"><TrendingUp size={16}/></div></div>
          <div className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A]">{rupiah(kpi.penjualan_hari_ini)}</div>
          <div className="text-xs text-emerald-600 mt-1 flex items-center gap-1"><ArrowUpRight size={12}/>+12% vs kemarin</div>
          <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-[#1E40AF] w-[68%]"/></div>
        </div>
        <div className="col-span-12 lg:col-span-3 bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-5">
          <div className="flex justify-between"><div className="text-xs font-bold tracking-widest text-[#94A3B8]">STOK KRITIS</div><div className="w-8 h-8 rounded-xl bg-amber-50 grid place-items-center text-amber-600"><AlertTriangle size={16}/></div></div>
          <div className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A]">{kpi.stok_kritis} <span className="text-sm font-medium text-[#64748B]">SKU</span></div>
          <div className="text-xs text-amber-600">Reorder point tercapai • Auto-PR aktif</div>
          <button onClick={()=>location.href='/inventory/stocks'} className="mt-3 text-xs font-semibold text-[#1E40AF]">Lihat stok →</button>
        </div>
        <div className="col-span-12 lg:col-span-3 bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-5">
          <div className="flex justify-between"><div className="text-xs font-bold tracking-widest text-[#94A3B8]">PIUTANG JATUH TEMPO</div><div className="w-8 h-8 rounded-xl bg-red-50 grid place-items-center text-red-600"><Clock size={16}/></div></div>
          <div className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A]">{rupiah(kpi.piutang_jatuh_tempo.amount)}</div>
          <div className="text-xs text-red-600">{kpi.piutang_jatuh_tempo.count} invoice • Reminder H-7/H-1/H+1</div>
        </div>
        <div className="col-span-12 lg:col-span-3 bg-[#0F172A] rounded-[20px] border border-[#0F172A] shadow-sm p-5 text-white">
          <div className="text-xs font-bold tracking-widest text-white/60">CASH POSITION</div>
          <div className="text-[22px] font-black mt-2 text-white">{rupiah(kpi.cash_position)}</div>
          <div className="text-xs text-white/60 mt-1 flex items-center gap-2"><Wallet size={12}/>BCA + Mandiri • Rekonsiliasi bank</div>
          <div className="mt-3 flex gap-2 text-xs"><span className="px-2 py-1 rounded-full bg-white/10">PO Overdue: {kpi.po_overdue}</span></div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-8 bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-5">
          <div className="flex justify-between items-center"><h3 className="font-bold">Tren Penjualan (14 hari)</h3><span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Live</span></div>
          <div className="h-[240px] mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}><XAxis dataKey="date" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}} tickFormatter={v=> (v/1e6)+'jt'}/><Tooltip formatter={v=>[rupiah(v),'Total']}/><Area type="monotone" dataKey="total" stroke="#1E40AF" fill="#DBEAFE" strokeWidth={2.5}/></AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="col-span-12 lg:col-span-4 bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-5">
          <h3 className="font-bold">Margin Laba (minggu ini)</h3>
          <div className="h-[240px] mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={profit}><XAxis dataKey="date" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/><Tooltip/><Bar dataKey="revenue" fill="#1E40AF" radius={[6,6,0,0]}/><Bar dataKey="profit" fill="#F59E0B" radius={[6,6,0,0]}/></BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-3 text-xs justify-center"><span className="flex items-center gap-1"><span className="w-3 h-3 bg-[#1E40AF] rounded"/>Revenue</span><span className="flex items-center gap-1"><span className="w-3 h-3 bg-[#F59E0B] rounded"/>Profit 22%</span></div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-4 bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-5">
          <h3 className="font-bold">Top Produk (revenue)</h3>
          <div className="mt-3 space-y-3">
            {topP.map((p,i)=>(
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-gray-100 grid place-items-center font-bold text-xs">{i+1}</div>
                <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{p.name}</div><div className="text-xs text-[#64748B]">{p.qty} unit terjual</div></div>
                <div className="text-sm font-bold">{rupiah(p.revenue)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="col-span-12 lg:col-span-4 bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-5">
          <h3 className="font-bold">Top Customer</h3>
          <div className="mt-3 space-y-3">
            {topC.map((c,i)=>(
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#1E40AF]/10 grid place-items-center text-[#1E40AF] font-bold text-xs">{c.name[0]}</div>
                <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{c.name}</div><div className="w-full h-1.5 bg-gray-100 rounded-full mt-1"><div className="h-full bg-[#1E40AF] rounded-full" style={{width: 70 - i*10 +'%'}}/></div></div>
                <div className="text-sm font-bold">{rupiah(c.total)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="col-span-12 lg:col-span-4 bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-5">
          <h3 className="font-bold">Notifikasi & Quick Action</h3>
          <div className="mt-3 space-y-2 text-sm">
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200"><b>Stok kritis:</b> {notif?.lowStock?.length||0} SKU di bawah reorder point</div>
            <div className="p-3 rounded-xl bg-red-50 border border-red-200"><b>Invoice overdue:</b> {notif?.overdueInvoices?.length||0} invoice lewat jatuh tempo</div>
            <div className="p-3 rounded-xl bg-sky-50 border border-sky-200"><b>PO overdue:</b> {notif?.poOverdue?.length||0} PO terlambat terima</div>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <a href="/sales/orders" className="text-center py-2 rounded-xl bg-[#1E40AF] text-white text-xs font-bold">Buat SO</a>
              <a href="/purchase/orders" className="text-center py-2 rounded-xl bg-white border text-xs font-bold">Buat PO</a>
              <a href="/inventory/stocks" className="text-center py-2 rounded-xl bg-[#F59E0B] text-white text-xs font-bold">Opname</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
