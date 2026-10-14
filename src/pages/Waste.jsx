
import { useEffect, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import api from '../lib/api';
import { Badge } from '../components/Layout';
import { useDialog } from '../components/DialogProvider';
export default function Waste(){
  const dialog=useDialog();
  const [data,setData]=useState([]); const [stats,setStats]=useState(null); const [show,setShow]=useState(false);
  const [products,setProducts]=useState([]); const [warehouses,setWarehouses]=useState([]);
  const [form,setForm]=useState({product_id:'', warehouse_id:1, qty:'', waste_type:'PECAH_GUDANG', reason:''});
  const load=()=>{ api.get('/waste').then(r=>setData(r.data)).catch(()=>setData([])); api.get('/waste/stats/summary').then(r=>setStats(r.data)); };
  useEffect(()=>{ load(); api.get('/master/products',{params:{limit:100}}).then(r=>setProducts(r.data?.data ?? r.data ?? [])).catch(()=>{}); api.get('/master/warehouses').then(r=>setWarehouses(r.data ?? [])).catch(()=>{}); },[]);
  const submit=async(e)=>{
    e.preventDefault();
    const r=await api.post('/waste',{product_id: parseInt(form.product_id), warehouse_id: parseInt(form.warehouse_id), qty: parseFloat(form.qty), waste_type:form.waste_type, reason:form.reason});
    await dialog.alert('Write-off '+new Intl.NumberFormat('id-ID').format(r.data.cost)+' • status '+r.data.status+'\n>500rb butuh Manager+Finance • >5jt Direktur', {title:'Write-off'}) ;
    setShow(false); load();
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between gap-3 items-end"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white grid place-items-center shrink-0 shadow-sm"><FileText size={18} strokeWidth={2.2}/></div><div className="min-w-0 flex-1"><h1 className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A] leading-none">Susut, Pecah & Waste</h1><p className="text-xs text-[#64748B] mt-1">Pecah gudang/kirim/bongkar • Susut alami • Reklasifikasi grade B • Approval berjenjang</p></div></div><button onClick={()=>setShow(true)} className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-[#1E3A8A] active:scale-[0.98] transition">+ Catat Susut</button></div>
      {stats && <div className="grid grid-cols-4 gap-2"><div className="bg-white rounded-xl border p-3 text-center"><div className="text-lg font-black">{stats.pending||0}</div><div className="text-xs">Pending</div></div>{stats.by_type?.slice(0,3).map(t=> <div key={t.waste_type} className="bg-white rounded-xl border p-3 text-center"><div className="text-xs font-bold">{t.waste_type}</div><div className="text-sm font-black">{new Intl.NumberFormat('id-ID',{notation:'compact'}).format(t.cost)}</div><div className="text-xs text-[#64748B]">{t.cnt} kejadian</div></div>)}</div>}
      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><th className="text-left px-4 py-3 whitespace-nowrap">TGL</th><th className="text-left px-4 py-3 whitespace-nowrap">PRODUK</th><th className="text-left px-4 py-3 whitespace-nowrap">GUDANG</th><th className="text-left px-4 py-3 whitespace-nowrap">JENIS</th><th className="text-right px-4 py-3 whitespace-nowrap">QTY</th><th className="text-right px-4 py-3 whitespace-nowrap">BIAYA</th><th className="text-left px-4 py-3 whitespace-nowrap">STATUS</th><th></th></tr></thead><tbody>{(Array.isArray(data)?data:[]).map((w,idx)=>(
          <tr key={w.id} className={"border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition "+(idx%2===1?"bg-[#F8FAFC]/70":"bg-white")}><td className="px-4 py-3.5 text-xs">{w.created_at?.slice(0,10)}</td><td className="px-4 py-3.5">{w.product_name} <span className="text-xs text-[#94A3B8]">{w.sku}</span></td><td className="px-4 py-3.5 text-xs text-center">{w.warehouse_name}</td><td className="px-4 py-3.5 text-xs"><Badge status={w.waste_type}/></td><td className="px-4 py-3.5 text-right">{w.qty}</td><td className="px-4 py-3.5 text-right font-bold">{new Intl.NumberFormat('id-ID').format(w.cost)}</td><td className="px-4 py-3.5 text-center"><Badge status={w.status}/></td><td className="px-4 py-3.5">{w.status==='PENDING' && <button onClick={async()=>{ await api.post('/waste/'+w.id+'/approve',{status:'APPROVED'}); load(); }} className="text-xs px-2 py-1 bg-emerald-600 text-white rounded-full">Approve</button>}</td></tr>
        ))}</tbody></table></div>
      </div>
      {show && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"><form onSubmit={submit} className="bg-white rounded-2xl p-6 w-full max-w-md space-y-3">
        <h3 className="font-bold">Catat Susut / Pecah</h3>
        <select required value={form.product_id} onChange={e=>setForm({...form,product_id:e.target.value})} className="w-full h-[42px] pl-3 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"><option value="">Pilih produk</option>{products.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select value={form.warehouse_id} onChange={e=>setForm({...form,warehouse_id:e.target.value})} className="w-full h-[42px] pl-3 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition">{warehouses.map(w=> <option key={w.id} value={w.id}>{w.code} • {w.name}</option>)}</select>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" required placeholder="Qty" value={form.qty} onChange={e=>setForm({...form,qty:e.target.value})} className="h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF]"/>
          <select value={form.waste_type} onChange={e=>setForm({...form,waste_type:e.target.value})} className="h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF]"><option value="PECAH_GUDANG">Pecah Gudang</option><option value="PECAH_KIRIM">Pecah Kirim</option><option value="PECAH_BONGKAR">Pecah Bongkar</option><option value="SUSUT_ALAMI">Susut Alami</option><option value="SALAH_HITUNG">Salah Hitung</option><option value="OTHER">Lain</option></select>
        </div>
        <textarea value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})} placeholder="Penyebab & tindak lanjut (klaim supplier/asuransi?)" className="w-full border rounded-xl p-3" rows={2}/>
        <div className="text-xs text-[#64748B]">&lt;500rb Supervisor • 500rb-5jt Manager+Gudang+Finance • &gt;5jt Direktur</div>
        <div className="flex justify-end gap-2"><button type="button" onClick={()=>setShow(false)} className="h-[42px] px-5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-semibold text-[#334155] hover:bg-[#F8FAFC] active:scale-[0.98] transition">Batal</button><button className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-[#1E3A8A] active:scale-[0.98] transition">Simpan</button></div>
      </form></div>}
    </div>
  )
}
