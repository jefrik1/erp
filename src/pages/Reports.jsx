
import { useEffect, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import api from '../lib/api';
export default function Reports(){
  const [sales,setSales]=useState([]); const [aging,setAging]=useState([]); const [margin,setMargin]=useState([]);
  useEffect(()=>{
    api.get('/reports/sales',{params:{start:'2024-01-01', end:'2024-12-31', group_by:'product'}}).then(r=>setSales(r.data));
    api.get('/reports/aging-ar').then(r=>setAging(r.data));
    api.get('/reports/margin').then(r=>setMargin(r.data));
  },[]);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white grid place-items-center shrink-0 shadow-sm"><FileText size={18} strokeWidth={2.2}/></div><div><h1 className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A] leading-none">Reporting & BI</h1></div></div>
      <p className="text-xs text-[#64748B]">Report builder • Scheduled email • Export PDF/Excel/CSV • Drill-down • YoY/MoM</p>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-4"><h3 className="font-bold">Penjualan per Produk</h3><div className="mt-3 space-y-2 max-h-[300px] overflow-auto">{sales.map(s=>(
          <div key={s.name} className="flex justify-between items-center p-2 bg-[#F1F5F9] rounded-xl border"><span className="text-sm font-semibold">{s.name}</span><span className="text-sm font-black">{new Intl.NumberFormat('id-ID').format(s.revenue)}</span></div>
        ))}</div></div>
        <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-4"><h3 className="font-bold">Analisa Margin per Produk</h3><div className="overflow-auto max-h-[300px]"><table className="w-full text-xs"><thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><th className="p-2 text-left">PRODUK</th><th className="px-4 py-3.5 text-right">HARGA</th><th className="px-4 py-3.5 text-right">COST</th><th className="px-4 py-3.5 text-right">MARGIN</th></tr></thead><tbody>{margin.map(m=>(
          <tr key={m.name} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition bg-white"><td className="px-4 py-3.5">{m.name}</td><td className="px-4 py-3.5 text-right">{new Intl.NumberFormat('id-ID').format(m.price)}</td><td className="px-4 py-3.5 text-right">{new Intl.NumberFormat('id-ID').format(m.cost)}</td><td className="px-4 py-3.5 text-right"><span className={"px-2 py-1 rounded-full "+(m.pct>30?"bg-emerald-50 text-emerald-700":m.pct>15?"bg-amber-50 text-amber-700":"bg-red-50 text-red-700")}>{m.pct}%</span></td></tr>
        ))}</tbody></table></div></div>
      </div>
      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden"><div className="p-4 font-bold border-b">Aging Piutang — Drill-down</div><div className="overflow-auto"><table className="w-full text-xs"><thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><th className="p-2 text-left">CUSTOMER</th><th className="px-4 py-3.5">INVOICE</th><th className="px-4 py-3.5">JATUH TEMPO</th><th className="px-4 py-3.5 text-right">OUTSTANDING</th><th className="px-4 py-3.5">BUCKET</th></tr></thead><tbody>{aging.map(a=>(
        <tr key={a.invoice_number} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition bg-white"><td className="p-2 font-semibold">{a.name}</td><td className="p-2 font-mono">{a.invoice_number}</td><td className="p-2 text-center">{a.due_date?.slice(0,10)}</td><td className="p-2 text-right font-bold">{new Intl.NumberFormat('id-ID').format(a.outstanding)}</td><td className="p-2 text-center"><span className={"px-2 py-1 rounded-full border "+(a.bucket==='Current'?"bg-emerald-50 text-emerald-700":a.bucket==='1-30'?"bg-amber-50 text-amber-700":"bg-red-50 text-red-700")}>{a.bucket}</span></td></tr>
      ))}</tbody></table></div></div>
      <div className="bg-[#0F172A] rounded-2xl p-5 text-white"><h3 className="font-bold">Export Laporan Wajib PRD</h3><div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-3 text-xs">
        {['Laporan Penjualan','Laporan Pembelian','Kartu Stok','Aging Piutang & Hutang','Laba Rugi / Cabang','Analisa Margin','Komisi Sales','Absensi & Payroll'].map(t=>(
          <div key={t} className="bg-white/10 border border-white/10 rounded-xl p-3 flex justify-between items-center"><span>{t}</span><span className="px-2 py-1 bg-white text-[#0F172A] rounded-full font-bold">Excel</span></div>
        ))}
      </div></div>
    </div>
  )
}
