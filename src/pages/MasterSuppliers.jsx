
import { useEffect, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import api from '../lib/api';
export default function MasterSuppliers(){
  const [data,setData]=useState([]);
  useEffect(()=>{ api.get('/master/suppliers').then(r=>setData(r.data?.data ?? r.data ?? [])).catch(()=>setData([])); },[]);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white grid place-items-center shrink-0 shadow-sm"><FileText size={18} strokeWidth={2.2}/></div><div><h1 className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A] leading-none">Supplier</h1></div></div>
      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden">
        <table className="w-full text-sm"><thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><th className="text-left px-4 py-3 whitespace-nowrap">SUPPLIER</th><th className="text-left px-4 py-3 whitespace-nowrap">RATING</th><th className="text-left px-4 py-3 whitespace-nowrap">TERMIN</th><th className="text-left px-4 py-3 whitespace-nowrap">STATUS</th></tr></thead><tbody>{(Array.isArray(data)?data:[]).map((s,idx)=>(
          <tr key={s.id} className={"border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition "+(idx%2===1?"bg-[#F8FAFC]/70":"bg-white")}><td className="px-4 py-3.5"><div className="font-semibold">{s.name}</div><div className="text-xs text-[#64748B]">{s.code} • {s.phone}</div></td><td className="px-4 py-3.5 text-center">⭐ {s.rating}</td><td className="px-4 py-3.5 text-center">{s.payment_term_days} hari</td><td className="px-4 py-3.5"><span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">Aktif</span></td></tr>
        ))}</tbody></table>
      </div>
    </div>
  )
}
