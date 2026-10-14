
import { useEffect, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import api from '../lib/api';
export default function InventoryTransfers(){
  const [data,setData]=useState([]); const [warehouses,setWarehouses]=useState([]); const [products,setProducts]=useState([]);
  const [show,setShow]=useState(false); const [form,setForm]=useState({from_warehouse_id:1,to_warehouse_id:3, items:[]});
  const load=()=> api.get('/inventory/transfers').then(r=>setData(r.data)).catch(()=>setData([]));
  useEffect(()=>{ load(); api.get('/master/warehouses').then(r=>setWarehouses(r.data ?? [])).catch(()=>{}); api.get('/master/products',{params:{limit:50}}).then(r=>setProducts(r.data?.data ?? r.data ?? [])).catch(()=>{}); },[]);
  const submit=async(e)=>{
    e.preventDefault();
    await api.post('/inventory/transfers',{from_warehouse_id: parseInt(form.from_warehouse_id), to_warehouse_id: parseInt(form.to_warehouse_id), items: form.items});
    setShow(false); load();
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between gap-3 items-end"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white grid place-items-center shrink-0 shadow-sm"><FileText size={18} strokeWidth={2.2}/></div><div className="min-w-0 flex-1"><h1 className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A] leading-none">Transfer Stok Antar Gudang</h1><p className="text-xs text-[#64748B] mt-1">Transit • In-transit • Received</p></div></div><button onClick={()=>setShow(true)} className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-[#1E3A8A] active:scale-[0.98] transition">+ Transfer</button></div>
      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><th className="text-left px-4 py-3 whitespace-nowrap">NO TRANSFER</th><th className="text-left px-4 py-3 whitespace-nowrap">DARI</th><th className="text-left px-4 py-3 whitespace-nowrap">KE</th><th className="text-left px-4 py-3 whitespace-nowrap">TGL</th><th className="text-left px-4 py-3 whitespace-nowrap">STATUS</th></tr></thead><tbody>{(Array.isArray(data)?data:[]).map((t,idx)=>(
        <tr key={t.id} className={"border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition "+(idx%2===1?"bg-[#F8FAFC]/70":"bg-white")}><td className="px-4 py-3.5 font-mono text-xs font-bold">{t.transfer_number}</td><td className="px-4 py-3.5 text-xs">{t.from_name}</td><td className="px-4 py-3.5 text-xs">{t.to_name}</td><td className="px-4 py-3.5 text-xs">{t.transfer_date?.slice(0,10)}</td><td className="px-4 py-3.5"><span className="text-xs px-2 py-1 rounded-full bg-sky-50 text-sky-700 border">{t.status}</span></td></tr>
      ))}</tbody></table></div>
      {show && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"><form onSubmit={submit} className="bg-white rounded-2xl p-6 w-full max-w-lg space-y-3">
        <h3 className="font-bold">Transfer Stok</h3>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">Dari<select value={form.from_warehouse_id} onChange={e=>setForm({...form, from_warehouse_id:e.target.value})} className="w-full h-10 border rounded-xl px-2">{warehouses.map(w=> <option key={w.id} value={w.id}>{w.code}</option>)}</select></label>
          <label className="text-sm">Ke<select value={form.to_warehouse_id} onChange={e=>setForm({...form, to_warehouse_id:e.target.value})} className="w-full h-10 border rounded-xl px-2">{warehouses.map(w=> <option key={w.id} value={w.id}>{w.code}</option>)}</select></label>
        </div>
        <div className="border rounded-xl p-2 max-h-[200px] overflow-auto space-y-1">
          {products.slice(0,8).map(p=> <div key={p.id} className="flex justify-between items-center border rounded-lg p-2"><span className="text-sm">{p.name}</span><button type="button" onClick={()=>setForm({...form, items:[...form.items,{product_id:p.id, name:p.name, qty:5}]})} className="text-xs px-2 py-1 bg-[#1E40AF] text-white rounded-full">add</button></div>)}
        </div>
        {form.items.map((it,i)=>(
          <div key={i} className="flex gap-2 items-center"><span className="flex-1 text-sm">{it.name}</span><input type="number" value={it.qty} onChange={e=>{ const c=[...form.items]; c[i].qty=parseFloat(e.target.value); setForm({...form, items:c}); }} className="w-20 h-8 border rounded-lg text-center"/><button type="button" onClick={()=>setForm({...form, items:form.items.filter((_,idx)=>idx!==i)})} className="text-red-600 text-xs">hapus</button></div>
        ))}
        <div className="flex justify-end gap-2"><button type="button" onClick={()=>setShow(false)} className="h-[42px] px-5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-semibold text-[#334155] hover:bg-[#F8FAFC] active:scale-[0.98] transition">Batal</button><button className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-[#1E3A8A] active:scale-[0.98] transition">Kirim Transfer</button></div>
      </form></div>}
    </div>
  )
}
