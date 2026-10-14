
import { useEffect, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import api from '../lib/api';
export default function Assets(){
  const [data,setData]=useState([]); const [show,setShow]=useState(false); const [dep,setDep]=useState(null);
  const [form,setForm]=useState({asset_code:'', name:'', category:'BANGUNAN', acquisition_date:'', acquisition_cost:'', useful_life_years:5});
  const load=()=> api.get('/assets').then(r=>setData(r.data)).catch(()=>setData([]));
  useEffect(()=>{load()},[]);
  const create=async(e)=>{
    e.preventDefault();
    await api.post('/assets',{...form, acquisition_cost: parseFloat(form.acquisition_cost), useful_life_years: parseInt(form.useful_life_years)});
    setShow(false); load();
  };
  const openDep=async(id)=>{
    const r=await api.get('/assets/'+id+'/depreciation');
    setDep(r.data);
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between gap-3 items-end"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white grid place-items-center shrink-0 shadow-sm"><FileText size={18} strokeWidth={2.2}/></div><div className="min-w-0 flex-1"><h1 className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A] leading-none">Aset Tetap & Maintenance</h1><p className="text-xs text-[#64748B] mt-1">Depresiasi PSAK straight/declining • Pemeliharaan • Disposal gain/loss</p></div></div><button onClick={()=>setShow(true)} className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-[#1E3A8A] active:scale-[0.98] transition">+ Aset</button></div>
      <div className="grid md:grid-cols-3 gap-4">{(Array.isArray(data)?data:[]).map((a,idx)=>(
        <div key={a.id} className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-5">
          <div className="font-mono text-xs font-bold bg-gray-100 border px-2 py-1 rounded-full inline-block">{a.asset_code}</div>
          <div className="font-bold mt-2">{a.name}</div>
          <div className="text-xs text-[#64748B]">{a.category} • {a.location||'-'} • Perolehan {a.acquisition_date?.slice(0,10)}</div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="bg-[#F1F5F9] border rounded-xl p-2"><div className="text-[#64748B]">Harga Perolehan</div><div className="font-black">{new Intl.NumberFormat('id-ID').format(a.acquisition_cost)}</div></div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-2"><div className="text-blue-700">Nilai Buku</div><div className="font-black">{new Intl.NumberFormat('id-ID').format(a.book_value||a.acquisition_cost)}</div></div>
          </div>
          <div className="text-xs mt-2">Umur {a.useful_life_years} th • {a.depreciation_method} • {a.status}</div>
          <button onClick={()=>openDep(a.id)} className="mt-3 text-xs px-3 py-1 bg-[#1E40AF] text-white rounded-full">Depresiasi</button>
        </div>
      ))}</div>
      {dep && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"><div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="flex justify-between"><h3 className="font-bold">Jadwal Depresiasi — {dep.asset.name}</h3><button onClick={()=>setDep(null)} className="px-3 py-1 border rounded-full">✕</button></div>
        <div className="text-xs text-[#64748B]">Monthly: {new Intl.NumberFormat('id-ID').format(dep.monthly)} • Metode {dep.asset.depreciation_method}</div>
        <div className="overflow-auto mt-3"><table className="w-full text-xs"><thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><th className="px-4 py-3.5">TAHUN</th><th className="px-4 py-3.5 text-right">DEPRESIASI</th><th className="px-4 py-3.5 text-right">AKUMULASI</th><th className="px-4 py-3.5 text-right">NILAI BUKU</th></tr></thead><tbody>{dep.schedule.map(s=>(
          <tr key={s.year} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition bg-white"><td className="p-2 text-center">{s.year}</td><td className="px-4 py-3.5 text-right">{new Intl.NumberFormat('id-ID').format(s.depreciation)}</td><td className="px-4 py-3.5 text-right">{new Intl.NumberFormat('id-ID').format(s.accumulated)}</td><td className="p-2 text-right font-bold">{new Intl.NumberFormat('id-ID').format(s.book_value)}</td></tr>
        ))}</tbody></table></div>
      </div></div>}
      {show && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"><form onSubmit={create} className="bg-white rounded-2xl p-6 w-full max-w-md space-y-3">
        <h3 className="font-bold">Tambah Aset</h3>
        <input required placeholder="Kode aset" value={form.asset_code} onChange={e=>setForm({...form,asset_code:e.target.value})} className="w-full h-[42px] pl-3 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"/>
        <input required placeholder="Nama aset" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="w-full h-[42px] pl-3 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"/>
        <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} className="w-full h-[42px] pl-3 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"><option>BANGUNAN</option><option>KENDARAAN</option><option>ALAT</option><option>KANTOR</option></select>
        <input type="date" value={form.acquisition_date} onChange={e=>setForm({...form,acquisition_date:e.target.value})} className="w-full h-[42px] pl-3 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"/>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" placeholder="Harga perolehan" value={form.acquisition_cost} onChange={e=>setForm({...form,acquisition_cost:e.target.value})} className="h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF]"/>
          <input type="number" placeholder="Umur (tahun)" value={form.useful_life_years} onChange={e=>setForm({...form,useful_life_years:e.target.value})} className="h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF]"/>
        </div>
        <div className="flex justify-end gap-2"><button type="button" onClick={()=>setShow(false)} className="h-[42px] px-5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-semibold text-[#334155] hover:bg-[#F8FAFC] active:scale-[0.98] transition">Batal</button><button className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-[#1E3A8A] active:scale-[0.98] transition">Simpan</button></div>
      </form></div>}
    </div>
  )
}
