
import { useEffect, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import api from '../lib/api';
import { Badge } from '../components/Layout';
export default function Consignments(){
  const [data,setData]=useState([]); const [stats,setStats]=useState(null); const [show,setShow]=useState(false);
  const [customers,setCustomers]=useState([]); const [products,setProducts]=useState([]);
  const [form,setForm]=useState({type:'OUT', partner_type:'CUSTOMER', partner_id:'', location_name:'', location_address:'', items:[]});
  const load=()=>{ api.get('/consignments').then(r=>{ setData(r.data?.data ?? r.data ?? []); }); api.get('/consignments/stats/summary').then(r=>setStats(r.data)).catch(()=>{}); };
  useEffect(()=>{ load(); api.get('/master/customers',{params:{limit:100}}).then(r=>setCustomers(r.data.data)); api.get('/master/products',{params:{limit:100}}).then(r=>setProducts(r.data.data)); },[]);
  const add=(p)=> setForm({...form, items:[...form.items, {product_id:p.id, name:p.name, qty:20, selling_price:65000}]});
  const submit=async(e)=>{
    e.preventDefault();
    await api.post('/consignments',{...form, partner_id: parseInt(form.partner_id)||null, items: form.items.map(i=>({product_id:i.product_id, qty_sent:i.qty, selling_price:i.selling_price}))});
    setShow(false); load();
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between gap-3 items-end"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white grid place-items-center shrink-0 shadow-sm"><FileText size={18} strokeWidth={2.2}/></div><div className="min-w-0 flex-1"><h1 className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A] leading-none">Konsinyasi In & Out</h1><p className="text-xs text-[#64748B] mt-1">Barang titipan di toko/proyek (OUT) & barang supplier di gudang kita (IN) — kepemilikan terpisah</p></div></div><button onClick={()=>setShow(true)} className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-[#1E3A8A] active:scale-[0.98] transition">+ Titipan</button></div>
      {stats && <div className="grid grid-cols-3 gap-3"><div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-4 text-center"><div className="text-2xl font-black">{stats.out_active}</div><div className="text-xs text-[#64748B]">OUT Aktif</div></div><div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-4 text-center"><div className="text-2xl font-black">{stats.in_active}</div><div className="text-xs text-[#64748B]">IN Aktif</div></div><div className="bg-amber-50 border border-amber-200 rounded-[20px] border border-[#E2E8F0] shadow-sm p-4 text-center"><div className="text-2xl font-black">{stats.long_pending?.length||0}</div><div className="text-xs text-amber-800">&gt;90 hari tidak laku</div></div></div>}
      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><th className="text-left px-4 py-3 whitespace-nowrap">NO</th><th className="text-left px-4 py-3 whitespace-nowrap">TIPE</th><th className="text-left px-4 py-3 whitespace-nowrap">LOKASI / PARTNER</th><th className="text-left px-4 py-3 whitespace-nowrap">TGL TITIP</th><th className="text-left px-4 py-3 whitespace-nowrap">ITEMS</th><th className="text-left px-4 py-3 whitespace-nowrap">STATUS</th></tr></thead><tbody>{(Array.isArray(data)?data:[]).map((c,idx)=>(
          <tr key={c.id} className={"border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition "+(idx%2===1?"bg-[#F8FAFC]/70":"bg-white")}><td className="px-4 py-3.5 font-mono text-xs font-bold">{c.consignment_number}</td><td className="px-4 py-3.5 text-center"><span className={"text-xs px-2 py-1 rounded-full border "+(c.type==='OUT'?"bg-teal-50 text-teal-700":"bg-sky-50 text-sky-700")}>{c.type}</span></td><td className="px-4 py-3.5"><div className="font-semibold text-xs">{c.location_name}</div><div className="text-xs text-[#64748B]">{c.partner_type} #{c.partner_id} • {c.location_address?.slice(0,40)}</div></td><td className="px-4 py-3.5 text-xs text-center">{c.start_date?.slice(0,10)}</td><td className="px-4 py-3.5 text-xs">{c.items?.map((it,i)=> <div key={i}>{it.product_name}: {it.qty_sent} (terjual {it.qty_sold})</div>)}</td><td className="px-4 py-3.5 text-center"><Badge status={c.status}/></td></tr>
        ))}</tbody></table></div>
      </div>
      {show && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"><form onSubmit={submit} className="bg-white rounded-2xl p-6 w-full max-w-2xl space-y-3 max-h-[90vh] overflow-auto">
        <h3 className="font-bold">Buat Titipan Konsinyasi</h3>
        <div className="grid grid-cols-2 gap-2">
          <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})} className="h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF]"><option value="OUT">KELUAR (kita titip di orang)</option><option value="IN">MASUK (supplier titip di kita)</option></select>
          <select value={form.partner_type} onChange={e=>setForm({...form,partner_type:e.target.value})} className="h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF]"><option value="CUSTOMER">Customer</option><option value="SUPPLIER">Supplier</option></select>
        </div>
        <select value={form.partner_id} onChange={e=>setForm({...form,partner_id:e.target.value})} className="w-full h-[42px] pl-3 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"><option value="">Pilih partner</option>{customers.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <input required placeholder="Lokasi titipan (nama toko / proyek)" value={form.location_name} onChange={e=>setForm({...form,location_name:e.target.value})} className="w-full h-[42px] pl-3 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"/>
        <input placeholder="Alamat lengkap" value={form.location_address} onChange={e=>setForm({...form,location_address:e.target.value})} className="w-full h-[42px] pl-3 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"/>
        <div className="border rounded-xl p-2 max-h-[160px] overflow-auto space-y-1">
          {products.slice(0,10).map(p=> <div key={p.id} className="flex justify-between items-center border rounded-lg p-2"><span className="text-sm">{p.name} <span className="text-xs text-[#64748B]">{p.sku}</span></span><button type="button" onClick={()=>add(p)} className="text-xs px-2 py-1 bg-[#1E40AF] text-white rounded-full">+</button></div>)}
        </div>
        {form.items.map((it,i)=>(
          <div key={i} className="flex gap-2 items-center"><span className="flex-1 text-sm">{it.name}</span><input type="number" value={it.qty} onChange={e=>{ const c=[...form.items]; c[i].qty=parseFloat(e.target.value); setForm({...form,items:c}); }} className="w-20 h-8 border rounded-lg text-center"/><input type="number" value={it.selling_price} onChange={e=>{ const c=[...form.items]; c[i].selling_price=parseFloat(e.target.value); setForm({...form,items:c}); }} className="w-28 h-8 border rounded-lg text-right"/><button type="button" onClick={()=> setForm({...form, items:form.items.filter((_,idx)=>idx!==i)})} className="text-red-600 text-xs">hapus</button></div>
        ))}
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2">Stok akan pindah dari Gudang Pusat ke lokasi konsinyasi (owned tapi tidak di gudang). Stock opname terpisah.</div>
        <div className="flex justify-end gap-2"><button type="button" onClick={()=>setShow(false)} className="h-[42px] px-5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-semibold text-[#334155] hover:bg-[#F8FAFC] active:scale-[0.98] transition">Batal</button><button className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-[#1E3A8A] active:scale-[0.98] transition">Simpan & Kirim</button></div>
      </form></div>}
    </div>
  )
}
