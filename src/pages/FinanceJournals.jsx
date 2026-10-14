
import { useEffect, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import api from '../lib/api';
export default function FinanceJournals(){
  const [data,setData]=useState([]); const [coa,setCoa]=useState([]); const [show,setShow]=useState(false);
  const [form,setForm]=useState({description:'', details:[{account_id:'', debit:0, credit:0}]});
  const load=()=> api.get('/finance/journals').then(r=>setData(r.data?.data ?? r.data ?? [])).catch(()=>setData([]));
  useEffect(()=>{ load(); api.get('/finance/coa').then(r=>setCoa(r.data)); },[]);
  const submit=async(e)=>{
    e.preventDefault();
    const details=form.details.map(d=>({account_id: parseInt(d.account_id), debit:parseFloat(d.debit)||0, credit:parseFloat(d.credit)||0, description:d.description||''}));
    await api.post('/finance/journals',{ description: form.description, details });
    setShow(false); load();
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between gap-3 items-end"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white grid place-items-center shrink-0 shadow-sm"><FileText size={18} strokeWidth={2.2}/></div><div className="min-w-0 flex-1"><h1 className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A] leading-none">Jurnal Umum</h1><p className="text-xs text-[#64748B] mt-1">Auto dari SO/PO/Invoice • Closing lock • Audit trail</p></div></div><button onClick={()=>setShow(true)} className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-[#1E3A8A] active:scale-[0.98] transition">+ Jurnal Manual</button></div>
      <div className="space-y-3">
        {data.length===0 && <div className="bg-white rounded-[20px] border border-dashed p-8 text-center text-sm text-[#94A3B8]">Belum ada jurnal — buat Invoice atau Bayar AP/Hutang dulu, atau + Jurnal Manual</div>}
        {(Array.isArray(data)?data:[]).map(j=>(
          <div key={j.id} className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-4">
            <div className="flex flex-wrap justify-between gap-3 items-start"><div><div className="font-mono text-xs font-bold">{j.entry_number} • {j.entry_date?.slice(0,10)}</div><div className="text-sm mt-1">{j.description}</div></div><span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border">{j.posted?'POSTED':'DRAFT'}</span></div>
            <div className="mt-3 border rounded-xl overflow-hidden"><table className="w-full text-xs"><thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><th className="p-2 text-left">AKUN</th><th className="px-4 py-3.5 text-right">DEBIT</th><th className="px-4 py-3.5 text-right">KREDIT</th></tr></thead><tbody>{j.details?.map((d,i)=>(
              <tr key={i} className={"border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition "+(i%2===1?"bg-[#F8FAFC]/70":"bg-white")}><td className="px-4 py-3.5">{d.code} • {d.name}</td><td className="px-4 py-3.5 text-right">{d.debit>0? new Intl.NumberFormat('id-ID').format(d.debit):''}</td><td className="px-4 py-3.5 text-right">{d.credit>0? new Intl.NumberFormat('id-ID').format(d.credit):''}</td></tr>
            ))}</tbody></table></div>
            <div className="flex justify-end gap-4 text-xs font-bold mt-2"><span>Debit {new Intl.NumberFormat('id-ID').format(j.total_debit)}</span><span>Kredit {new Intl.NumberFormat('id-ID').format(j.total_credit)}</span></div>
          </div>
        ))}
      </div>
      {show && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"><form onSubmit={submit} className="bg-white rounded-2xl p-6 w-full max-w-2xl space-y-3 max-h-[90vh] overflow-auto">
        <h3 className="font-bold">Jurnal Manual</h3>
        <input value={form.description} onChange={e=>setForm({...form, description:e.target.value})} placeholder="Deskripsi jurnal" className="w-full h-[42px] pl-3 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"/>
        {form.details.map((d,i)=>(
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <select value={d.account_id} onChange={e=>{ const c=[...form.details]; c[i].account_id=e.target.value; setForm({...form, details:c}); }} className="col-span-5 h-9 border rounded-lg px-2 text-xs"><option value="">Pilih akun</option>{coa.map(a=> <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}</select>
            <input type="number" placeholder="Debit" value={d.debit} onChange={e=>{ const c=[...form.details]; c[i].debit=e.target.value; setForm({...form, details:c}); }} className="col-span-3 h-9 border rounded-lg px-2 text-right text-xs"/>
            <input type="number" placeholder="Kredit" value={d.credit} onChange={e=>{ const c=[...form.details]; c[i].credit=e.target.value; setForm({...form, details:c}); }} className="col-span-3 h-9 border rounded-lg px-2 text-right text-xs"/>
            <button type="button" onClick={()=> setForm({...form, details: form.details.filter((_,idx)=>idx!==i)})} className="col-span-1 text-red-600">✕</button>
          </div>
        ))}
        <button type="button" onClick={()=> setForm({...form, details:[...form.details, {account_id:'', debit:0, credit:0}]})} className="text-xs px-3 py-1 border rounded-full">+ Baris</button>
        <div className="flex justify-end gap-2"><button type="button" onClick={()=>setShow(false)} className="h-[42px] px-5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-semibold text-[#334155] hover:bg-[#F8FAFC] active:scale-[0.98] transition">Batal</button><button className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-[#1E3A8A] active:scale-[0.98] transition">Posting Jurnal</button></div>
      </form></div>}
    </div>
  )
}
