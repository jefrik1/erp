
import { useEffect, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import api from '../lib/api';
export default function MasterCustomers(){
  const [data,setData]=useState([]); const [q,setQ]=useState('');
  const load=()=> api.get('/master/customers',{params:{search:q}}).then(r=>setData(r.data?.data ?? r.data ?? [])).catch(()=>setData([]));
  useEffect(()=>{load()},[]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between gap-3 items-end"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white grid place-items-center shrink-0 shadow-sm"><FileText size={18} strokeWidth={2.2}/></div><div className="min-w-0 flex-1"><h1 className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A] leading-none">Pelanggan</h1><p className="text-xs text-[#64748B] mt-1">B2B kontraktor / toko & B2C • Limit kredit • Termin • Price list</p></div></div></div>
      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="p-3 sm:p-4 flex gap-2 border-b border-[#E2E8F0] bg-white"><div className="flex-1 relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" /><input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=> e.key==='Enter'&&load()} placeholder="Cari pelanggan / kode / telepon..." className="w-full h-[42px] pl-9 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"/></div><button onClick={load} className="hidden sm:inline-flex h-[42px] px-5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-semibold text-[#334155] hover:bg-[#F8FAFC] active:scale-[0.98] transition shrink-0">Cari</button></div>
        <div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><th className="text-left px-4 py-3 whitespace-nowrap">PELANGGAN</th><th className="text-left px-4 py-3 whitespace-nowrap">TIPE</th><th className="text-right px-4 py-3 whitespace-nowrap">LIMIT</th><th className="text-center px-4 py-3 whitespace-nowrap">TERMIN</th><th className="text-left px-4 py-3 whitespace-nowrap">STATUS</th></tr></thead><tbody>{(Array.isArray(data)?data:[]).map((c,idx)=>(
          <tr key={c.id} className={"border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition "+(idx%2===1?"bg-[#F8FAFC]/70":"bg-white")}><td className="px-4 py-3.5"><div className="font-semibold">{c.name}</div><div className="text-xs text-[#64748B]">{c.code} • {c.phone}</div></td><td className="px-4 py-3.5 text-center"><span className="text-xs px-2 py-1 rounded-full bg-blue-50 border text-blue-700">{c.type}</span></td><td className="px-4 py-3.5 text-right font-semibold">{new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(c.credit_limit)}</td><td className="px-4 py-3.5 text-center">{c.payment_term_days} hari</td><td className="px-4 py-3.5"><span className={"text-xs px-2 py-1 rounded-full "+(c.is_active?"bg-emerald-50 text-emerald-700":"bg-red-50 text-red-700")}>{c.is_active?'Aktif':'Nonaktif'}</span></td></tr>
        ))}</tbody></table></div>
      </div>
    </div>
  )
}
