
import { useEffect, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import api from '../lib/api';
export default function FinanceCOA(){
  const [data,setData]=useState([]);
  useEffect(()=>{ api.get('/finance/coa').then(r=>setData(r.data)).catch(()=>setData([])); },[]);
  const typeColor={ ASSET:'bg-blue-50 text-blue-700', LIABILITY:'bg-amber-50 text-amber-700', EQUITY:'bg-purple-50 text-purple-700', REVENUE:'bg-emerald-50 text-emerald-700', EXPENSE:'bg-red-50 text-red-700'};
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white grid place-items-center shrink-0 shadow-sm"><FileText size={18} strokeWidth={2.2}/></div><div><h1 className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A] leading-none">Chart of Accounts (COA)</h1></div></div>
      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><th className="text-left px-4 py-3 whitespace-nowrap">KODE</th><th className="text-left px-4 py-3 whitespace-nowrap">NAMA AKUN</th><th className="text-left px-4 py-3 whitespace-nowrap">TIPE</th></tr></thead><tbody>{(Array.isArray(data)?data:[]).map((a,idx)=>(
        <tr key={a.id} className={"border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition "+(idx%2===1?"bg-[#F8FAFC]/70":"bg-white")}><td className="px-4 py-3.5 font-mono font-bold">{a.code}</td><td className="px-4 py-3.5 font-medium">{a.name}</td><td className="px-4 py-3.5 text-center"><span className={"text-xs px-2 py-1 rounded-full border "+(typeColor[a.type]||'bg-gray-100')}>{a.type}</span></td></tr>
      ))}</tbody></table></div>
    </div>
  )
}
