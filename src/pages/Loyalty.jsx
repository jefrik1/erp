
import { useEffect, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import api from '../lib/api';
export default function Loyalty(){
  const [tiers,setTiers]=useState([]); const [points,setPoints]=useState([]); const [tx,setTx]=useState([]);
  const [show,setShow]=useState(false); const [form,setForm]=useState({customer_id:'', points:1000, reference_type:'MANUAL', description:''});
  const [customers,setCustomers]=useState([]);
  const load=()=>{ api.get('/loyalty/tiers').then(r=>setTiers(r.data)); api.get('/loyalty/points').then(r=>setPoints(Array.isArray(r.data)?r.data:[])); api.get('/loyalty/transactions').then(r=>setTx(r.data)); };
  useEffect(()=>{ load(); api.get('/master/customers',{params:{limit:100}}).then(r=>setCustomers(r.data.data)); },[]);
  const earn=async(e)=>{
    e.preventDefault();
    await api.post('/loyalty/earn',{customer_id: parseInt(form.customer_id), points: parseInt(form.points), reference_type:form.reference_type, description:form.description});
    setShow(false); load();
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between gap-3 items-end"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white grid place-items-center shrink-0 shadow-sm"><FileText size={18} strokeWidth={2.2}/></div><div className="min-w-0 flex-1"><h1 className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A] leading-none">Loyalty & Membership</h1><p className="text-xs text-[#64748B] mt-1">Poin per transaksi • Tier Silver/Gold/Platinum • Kupon • Referral</p></div></div><button onClick={()=>setShow(true)} className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-[#1E3A8A] active:scale-[0.98] transition">+ Poin Manual</button></div>
      <div className="grid md:grid-cols-3 gap-4">{tiers.map(t=>(
        <div key={t.id} className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-5"><div className="font-black">{t.name}</div><div className="text-xs text-[#64748B]">Min spend {new Intl.NumberFormat('id-ID').format(t.min_spend)} • Diskon {t.discount_pct}%</div><div className="text-xs mt-2 bg-[#F1F5F9] border rounded-lg p-2">{JSON.stringify(t.benefits).slice(0,80)}</div></div>
      ))}</div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-4"><h3 className="font-bold">Saldo Poin</h3><div className="mt-3 space-y-2 max-h-[300px] overflow-auto">{points.map(p=>(
          <div key={p.customer_id} className="flex justify-between items-center p-3 border rounded-xl bg-[#F1F5F9]"><div><div className="font-bold text-sm">{p.name}</div><div className="text-xs text-[#64748B]">Lifetime {p.lifetime_points}</div></div><div className="text-right"><div className="font-black text-[#F59E0B]">{p.points_balance} poin</div></div></div>
        ))}</div></div>
        <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-4"><h3 className="font-bold">Transaksi Poin Terbaru</h3><div className="overflow-auto max-h-[300px] mt-3"><table className="w-full text-xs"><thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><th className="px-4 py-3.5">TGL</th><th className="px-4 py-3.5">CUSTOMER</th><th className="px-4 py-3.5">TIPE</th><th className="px-4 py-3.5 text-right">POIN</th></tr></thead><tbody>{tx.map(t=>(
          <tr key={t.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition bg-white"><td className="px-4 py-3.5">{t.transaction_date?.slice(0,10)}</td><td className="px-4 py-3.5">{t.name||t.customer_id}</td><td className="px-4 py-3.5"><span className={"px-2 py-1 rounded-full text-xs "+(t.transaction_type==='EARN'?"bg-emerald-50 text-emerald-700":t.transaction_type==='REDEEM'?"bg-red-50 text-red-700":"bg-gray-100")}>{t.transaction_type}</span></td><td className="p-2 text-right font-bold">{t.points}</td></tr>
        ))}</tbody></table></div></div>
      </div>
      {show && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"><form onSubmit={earn} className="bg-white rounded-2xl p-6 w-full max-w-md space-y-3">
        <h3 className="font-bold">Tambah Poin</h3>
        <select required value={form.customer_id} onChange={e=>setForm({...form,customer_id:e.target.value})} className="w-full h-[42px] pl-3 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"><option value="">Pilih customer</option>{customers.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <input type="number" value={form.points} onChange={e=>setForm({...form,points:e.target.value})} className="w-full h-[42px] pl-3 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition" placeholder="Poin"/>
        <input value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Keterangan" className="w-full h-[42px] pl-3 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"/>
        <div className="flex justify-end gap-2"><button type="button" onClick={()=>setShow(false)} className="h-[42px] px-5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-semibold text-[#334155] hover:bg-[#F8FAFC] active:scale-[0.98] transition">Batal</button><button className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-[#1E3A8A] active:scale-[0.98] transition">Simpan</button></div>
      </form></div>}
    </div>
  )
}
