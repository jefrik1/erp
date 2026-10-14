
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Search } from 'lucide-react';
import api from '../lib/api';
import { Badge } from '../components/Layout';
import { useDialog } from '../components/DialogProvider';
function rupiah(n){ return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n||0); }
export default function PurchaseOrders(){
  const nav=useNavigate();
  const dialog=useDialog();
  const [data,setData]=useState([]); const [show,setShow]=useState(false);
  const [suppliers,setSuppliers]=useState([]); const [products,setProducts]=useState([]);
  const [form,setForm]=useState({supplier_id:'', expected_date:'', items:[]}); const [pick,setPick]=useState(null);
  const load=()=> api.get('/purchase/orders').then(r=>setData(r.data?.data ?? r.data ?? [])).catch(()=>setData([]));
  useEffect(()=>{ load(); api.get('/master/suppliers').then(r=>setSuppliers(r.data.data)); api.get('/master/products',{params:{limit:100}}).then(r=>setProducts(r.data.data)); },[]);
  const add=(p)=> setForm({...form, items:[...form.items, {product_id:p.id, name:p.name, qty:10, unit_cost:55000}]});
  const submit=async(e)=>{
    e.preventDefault();
    const r=await api.post('/purchase/orders',{ supplier_id: parseInt(form.supplier_id), expected_date: form.expected_date, items: form.items.map(i=>({product_id:i.product_id, qty:i.qty, unit_cost:i.unit_cost})) });
    await dialog.alert('PO '+r.data.po_number+' • status '+r.data.status+'\n>50jt butuh approval Direktur.', {title:'PO Dibuat'});
    setShow(false); load();
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between items-start gap-4"><div><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white grid place-items-center shrink-0 shadow-sm"><FileText size={18} strokeWidth={2.2}/></div><div><h1 className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A] leading-none">Purchase Order</h1></div></div><nav className="mt-2 flex flex-wrap items-center gap-1 p-1 bg-[#F1F5F9] border rounded-full w-fit max-w-full shadow-sm" aria-label="Alur Purchase Order">{[
        {label:'PR', sub:'Purchase Request', to:'/purchase/requests'},
        {label:'RFQ', sub:'Quotation', to:'/purchase/rfqs'},
        {label:'PO', sub:'Order', to:'/purchase/orders', active:true},
        {label:'Approval', sub:'Berjenjang', to:'/approvals'},
        {label:'GRN', sub:'Receipt', to:'/purchase/receipts'},
        {label:'3-way', sub:'Matching', to:'/purchase/receipts'},
      ].map((s,i,arr)=>(
        <span key={s.label} className="flex items-center gap-1">
          <button onClick={()=>nav(s.to)} title={s.sub+' — klik untuk buka'} className={"inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black tracking-wide border transition-all "+(s.active?"bg-[#1E40AF] text-white border-[#1E40AF] shadow-md":"bg-white text-gray-700 border-gray-200 hover:border-[#1E40AF]/30 hover:text-[#1E40AF] hover:bg-blue-50/70 hover:shadow-sm active:scale-[0.98]")}>
            <span className={"w-5 h-5 grid place-items-center rounded-full text-[10px] font-black "+(s.active?"bg-white/20 text-white":"bg-gray-900 text-white")}>{i+1}</span>
            <span className="hidden sm:inline">{s.label}</span><span className="sm:hidden">{s.label}</span>
            <span className={"hidden lg:inline text-[10px] font-semibold opacity-60 "+(s.active?"text-white":"text-[#64748B]")}>{s.sub}</span>
          </button>
          {i<arr.length-1 && <span className="w-5 h-5 grid place-items-center text-[#94A3B8]"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg></span>}
        </span>
      ))}</nav><p className="text-[11px] text-[#94A3B8] mt-1.5 ml-1">Klik step untuk lompat — posisi sekarang <b className="text-[#1E40AF]">PO</b></p></div><button onClick={()=>setShow(true)} className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-[#1E3A8A] active:scale-[0.98] transition">+ Buat PO</button></div>
      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden"><div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><th className="text-left px-4 py-3 whitespace-nowrap">PO</th><th className="text-left px-4 py-3 whitespace-nowrap">SUPPLIER</th><th className="text-left px-4 py-3 whitespace-nowrap">TGL</th><th className="text-right px-4 py-3 whitespace-nowrap">TOTAL</th><th className="text-left px-4 py-3 whitespace-nowrap">STATUS</th></tr></thead><tbody>{(Array.isArray(data)?data:[]).map((po,idx)=>(
        <tr key={po.id} className={"border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition "+(idx%2===1?"bg-[#F8FAFC]/70":"bg-white")}><td className="px-4 py-3.5 font-mono text-xs font-bold">{po.po_number}</td><td className="px-4 py-3.5 font-semibold">{po.supplier_name}</td><td className="px-4 py-3.5 text-xs text-center">{po.po_date?.slice(0,10)}</td><td className="px-4 py-3.5 text-right font-bold">{rupiah(po.total)}</td><td className="px-4 py-3.5 text-center"><Badge status={po.status}/></td></tr>
      ))}</tbody></table></div></div>
      {show && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"><form onSubmit={submit} className="bg-white rounded-2xl p-6 w-full max-w-2xl space-y-3 max-h-[90vh] overflow-auto">
        <h3 className="font-bold">Buat Purchase Order</h3>
        <select required value={form.supplier_id} onChange={e=>setForm({...form, supplier_id:e.target.value})} className="w-full h-[42px] pl-3 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"><option value="">Pilih supplier</option>{suppliers.map(s=> <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <input type="date" value={form.expected_date} onChange={e=>setForm({...form, expected_date:e.target.value})} className="w-full h-[42px] pl-3 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"/>
        <div className="border rounded-xl p-2 max-h-[180px] overflow-auto grid grid-cols-1 gap-1">
          {products.slice(0,10).map(p=> <div key={p.id} className="flex gap-2 items-center justify-between border rounded-lg p-2"><span className="text-sm font-medium">{p.name} <span className="text-xs text-[#64748B]">{p.sku}</span></span><button type="button" onClick={()=>add(p)} className="text-xs px-2 py-1 rounded-full bg-[#1E40AF] text-white">+ Tambah</button></div>)}
        </div>
        <div className="space-y-2">
          {form.items.map((it,i)=>(
            <div key={i} className="flex gap-2 items-center"><span className="flex-1 text-sm">{it.name}</span><input type="number" value={it.qty} onChange={e=>{ const c=[...form.items]; c[i].qty=parseFloat(e.target.value); setForm({...form, items:c}); }} className="w-20 h-8 border rounded-lg text-center"/><input type="number" value={it.unit_cost} onChange={e=>{ const c=[...form.items]; c[i].unit_cost=parseFloat(e.target.value); setForm({...form, items:c}); }} className="w-28 h-8 border rounded-lg text-right"/><button type="button" onClick={()=> setForm({...form, items: form.items.filter((_,idx)=>idx!==i)})} className="text-red-600 text-xs">hapus</button></div>
          ))}
        </div>
        <div className="flex justify-end gap-2"><button type="button" onClick={()=>setShow(false)} className="h-[42px] px-5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-semibold text-[#334155] hover:bg-[#F8FAFC] active:scale-[0.98] transition">Batal</button><button className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-[#1E3A8A] active:scale-[0.98] transition">Simpan PO</button></div>
      </form></div>}
    </div>
  )
}
