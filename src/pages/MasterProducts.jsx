
import { useEffect, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import api from '../lib/api';
function rupiah(n){ return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n||0); }
export default function MasterProducts(){
  const [data,setData]=useState([]); const [total,setTotal]=useState(0); const [q,setQ]=useState(''); const [cats,setCats]=useState([]);
  const [show,setShow]=useState(false); const [form,setForm]=useState({sku:'',barcode:'',name:'',category_id:1,base_unit_id:1,tax_id:1,min_stock:10,reorder_point:20});
  const load=()=> api.get('/master/products',{params:{search:q, limit:20}}).then(r=>{setData(r.data?.data ?? r.data ?? []); setTotal(r.data.total);});
  useEffect(()=>{ load(); api.get('/master/categories').then(r=>setCats(r.data)); },[]);
  const create=async(e)=>{
    e.preventDefault();
    await api.post('/master/products', form);
    setShow(false); load();
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between gap-3 items-end">
        <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white grid place-items-center shrink-0 shadow-sm"><FileText size={18} strokeWidth={2.2}/></div><div className="min-w-0 flex-1"><h1 className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A] leading-none">Master Produk</h1><p className="text-xs text-[#64748B] mt-1">SKU • Barcode • Multi-satuan • Reorder point • {total} produk aktif</p></div></div>
        <button onClick={()=>setShow(true)} className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-[#1E3A8A] active:scale-[0.98] transition">+ Tambah Produk</button>
      </div>
      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="p-3 sm:p-4 flex gap-2 border-b border-[#E2E8F0] bg-white">
          <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=> e.key==='Enter'&&load()} placeholder="Cari SKU / nama / barcode" className="w-full h-[42px] pl-9 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"/>
          <button onClick={load} className="h-[42px] px-5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-semibold text-[#334155] hover:bg-[#F8FAFC] active:scale-[0.98] transition">Cari</button>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><th className="text-left px-4 py-3 whitespace-nowrap">PRODUK</th><th className="text-left px-4 py-3 whitespace-nowrap">KATEGORI</th><th className="text-right px-4 py-3 whitespace-nowrap">STOK TERSEDIA</th><th className="text-right px-4 py-3 whitespace-nowrap">REORDER</th><th className="text-right px-4 py-3 whitespace-nowrap">HARGA</th><th className="text-left px-4 py-3 whitespace-nowrap"></th></tr></thead>
            <tbody>
              {(Array.isArray(data)?data:[]).map((p,idx)=>(
                <tr key={p.id} className={"border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition "+(idx%2===1?"bg-[#F8FAFC]/70":"bg-white")}>
                  <td className="px-4 py-3.5"><div className="font-semibold">{p.name}</div><div className="text-xs text-[#64748B]">{p.sku} • {p.barcode} • {p.unit_code}</div></td>
                  <td className="px-4 py-3.5"><span className="text-xs px-2 py-1 rounded-full bg-gray-100 border">{p.category_name}</span></td>
                  <td className="px-4 py-3.5 text-right"><span className={"font-bold "+(p.stock_available<=p.reorder_point?"text-red-600":"text-emerald-700")}>{p.stock_available}</span> <span className="text-xs text-[#64748B]">/ {p.stock_onhand} on hand</span></td>
                  <td className="px-4 py-3.5 text-right text-xs">{p.reorder_point}</td>
                  <td className="px-4 py-3.5 text-right font-semibold">{p.stock_available>0? '—': ''}</td>
                  <td className="px-4 py-3.5 text-right"><a href="#" className="text-[#1E40AF] text-xs font-bold">Detail</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {show && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"><form onSubmit={create} className="bg-white rounded-2xl p-6 w-full max-w-lg space-y-3">
        <h3 className="font-bold text-lg">Tambah Produk</h3>
        <input required placeholder="SKU" value={form.sku} onChange={e=>setForm({...form, sku:e.target.value})} className="w-full h-[42px] pl-3 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"/>
        <input placeholder="Barcode" value={form.barcode} onChange={e=>setForm({...form, barcode:e.target.value})} className="w-full h-[42px] pl-3 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"/>
        <input required placeholder="Nama produk" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} className="w-full h-[42px] pl-3 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"/>
        <div className="grid grid-cols-2 gap-2">
          <select value={form.category_id} onChange={e=>setForm({...form, category_id:e.target.value})} className="h-10 border rounded-xl px-2">{cats.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <input type="number" placeholder="Min stok" value={form.min_stock} onChange={e=>setForm({...form, min_stock:e.target.value})} className="h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF]"/>
        </div>
        <div className="flex gap-2 justify-end"><button type="button" onClick={()=>setShow(false)} className="h-[42px] px-5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-semibold text-[#334155] hover:bg-[#F8FAFC] active:scale-[0.98] transition">Batal</button><button className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-[#1E3A8A] active:scale-[0.98] transition">Simpan</button></div>
      </form></div>}
    </div>
  )
}
