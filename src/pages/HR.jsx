
import { useEffect, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import api from '../lib/api';
export default function HR(){
  const [emps,setEmps]=useState([]); const [payrolls,setPayrolls]=useState([]);
  const load=()=>{ api.get('/hr/employees').then(r=>setEmps(r.data.data)); api.get('/hr/payrolls').then(r=>setPayrolls(r.data)); };
  useEffect(()=>{load()},[]);
  const gen=async()=>{
    const period=prompt('Periode YYYY-MM', new Date().toISOString().slice(0,7));
    if(!period) return;
    await api.post('/hr/payrolls/generate',{period});
    load();
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between gap-3 items-end"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white grid place-items-center shrink-0 shadow-sm"><FileText size={18} strokeWidth={2.2}/></div><div className="min-w-0 flex-1"><h1 className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A] leading-none">HR & Payroll</h1><p className="text-xs text-[#64748B] mt-1">Absensi • Cuti • Lembur • BPJS • PPh21 • Slip gaji email</p></div></div><button onClick={gen} className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-[#1E3A8A] active:scale-[0.98] transition">Generate Payroll</button></div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden"><div className="p-4 font-bold border-b">Karyawan</div><div className="overflow-auto max-h-[380px]"><table className="w-full text-xs"><thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><th className="p-2 text-left">KODE</th><th className="p-2 text-left">NAMA</th><th className="px-4 py-3.5">JABATAN</th><th className="px-4 py-3.5 text-right">GAJI POKOK</th></tr></thead><tbody>{emps.map(e=>(
          <tr key={e.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition bg-white"><td className="p-2 font-mono">{e.employee_code}</td><td className="p-2 font-semibold">{e.name}</td><td className="p-2 text-center">{e.position}</td><td className="px-4 py-3.5 text-right">{new Intl.NumberFormat('id-ID').format(e.basic_salary)}</td></tr>
        ))}</tbody></table></div></div>
        <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden"><div className="p-4 font-bold border-b">Payroll</div><div className="overflow-auto max-h-[380px]"><table className="w-full text-xs"><thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><th className="px-4 py-3.5">PERIODE</th><th className="p-2 text-left">KARYAWAN</th><th className="px-4 py-3.5 text-right">NETT</th><th className="px-4 py-3.5">STATUS</th></tr></thead><tbody>{payrolls.map(p=>(
          <tr key={p.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition bg-white"><td className="p-2 text-center">{p.period}</td><td className="px-4 py-3.5">{p.name}</td><td className="p-2 text-right font-bold">{new Intl.NumberFormat('id-ID').format(p.net_salary)}</td><td className="p-2 text-center"><span className="px-2 py-1 rounded-full bg-amber-100 text-amber-800 text-xs">{p.status}</span></td></tr>
        ))}</tbody></table></div></div>
      </div>
    </div>
  )
}
