
import { useEffect, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import api from '../lib/api';
export default function Pricing(){
  const [lists,setLists]=useState([]); const [items,setItems]=useState([]); const [sel,setSel]=useState('');
  const [customerPrices,setCustomerPrices]=useState([]); const [promos,setPromos]=useState([]);
  const [products,setProducts]=useState([]); const [customers,setCustomers]=useState([]);
  const [check,setCheck]=useState({customer_id:'', project_id:'', product_id:'', qty:10, result:null});
  const [projects,setProjects]=useState([]);
  const loadLists=()=> api.get('/pricing/lists').then(r=>{ setLists(r.data); if(r.data.length&&!sel) setSel(r.data[0].id); });
  useEffect(()=>{ loadLists(); api.get('/pricing/customer-prices').then(r=>setCustomerPrices(r.data)); api.get('/pricing/promotions').then(r=>setPromos(r.data)); api.get('/master/products',{params:{limit:100}}).then(r=>setProducts(r.data.data)); api.get('/master/customers',{params:{limit:100}}).then(r=>setCustomers(r.data.data)); api.get('/projects').then(r=>setProjects(r.data)).catch(()=>{}); },[]);
  useEffect(()=>{ if(sel) api.get('/pricing/lists/'+sel+'/items').then(r=>setItems(r.data)); },[sel]);
  const doCheck=async()=>{
    const r=await api.post('/pricing/check',{ customer_id: parseInt(check.customer_id)||null, project_id: parseInt(check.project_id)||null, product_id: parseInt(check.product_id), qty: parseFloat(check.qty)});
    setCheck({...check, result:r.data});
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white grid place-items-center shrink-0 shadow-sm"><FileText size={18} strokeWidth={2.2}/></div><div><h1 className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A] leading-none">Pricing Engine Bertingkat</h1></div></div>
      <p className="text-xs text-[#64748B]">Tier retail/grosir/kontraktor/proyek • Override per customer • Floor price • Diskon qty • Promo bundling</p>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-4">
          <h3 className="font-bold">Price Lists</h3>
          <div className="mt-3 space-y-1">{lists.map(l=> <button key={l.id} onClick={()=>setSel(l.id)} className={"w-full text-left px-3 py-2 rounded-xl border text-sm "+(sel===l.id?"bg-[#1E40AF] text-white":"bg-[#F1F5F9]")}><span className="font-bold">{l.code}</span> • {l.name} <span className="text-xs opacity-70">({l.type})</span></button>)}</div>
          <div className="mt-3 text-xs text-[#64748B]">Matrix: baris produk, kolom tier. Harga kompetitor bisa input manual.</div>
        </div>
        <div className="lg:col-span-2 bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-4">
          <h3 className="font-bold">Items — {lists.find(l=>l.id===sel)?.name||''}</h3>
          <div className="overflow-auto max-h-[300px] mt-3"><table className="w-full text-xs"><thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><th className="p-2 text-left">PRODUK</th><th className="px-4 py-3.5 text-right">MIN QTY</th><th className="px-4 py-3.5 text-right">HARGA</th></tr></thead><tbody>{items.map(it=>(
            <tr key={it.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition bg-white"><td className="px-4 py-3.5">{it.product_name} <span className="text-[#94A3B8]">{it.sku}</span></td><td className="px-4 py-3.5 text-right">{it.min_qty}</td><td className="p-2 text-right font-bold">{new Intl.NumberFormat('id-ID').format(it.price)}</td></tr>
          ))}{items.length===0 && <tr><td colSpan={3} className="p-4 text-center text-[#94A3B8]">Pilih price list</td></tr>}</tbody></table></div>
        </div>
      </div>
      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-4">
        <h3 className="font-bold">Cek Harga (priority: proyek &gt; customer &gt; pricelist &gt; base)</h3>
        <div className="grid md:grid-cols-5 gap-2 mt-3">
          <select value={check.customer_id} onChange={e=>setCheck({...check,customer_id:e.target.value})} className="h-10 border rounded-xl px-2 text-sm"><option value="">Pilih customer</option>{customers.map(c=> <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}</select>
          <select value={check.project_id} onChange={e=>setCheck({...check,project_id:e.target.value})} className="h-10 border rounded-xl px-2 text-sm"><option value="">Tanpa proyek</option>{projects.map(p=> <option key={p.id} value={p.id}>{p.project_code} {p.name}</option>)}</select>
          <select value={check.product_id} onChange={e=>setCheck({...check,product_id:e.target.value})} className="h-10 border rounded-xl px-2 text-sm"><option value="">Pilih produk</option>{products.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <input type="number" value={check.qty} onChange={e=>setCheck({...check,qty:e.target.value})} className="h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF]" placeholder="Qty"/>
          <button onClick={doCheck} className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-[#1E3A8A] active:scale-[0.98] transition">Cek Harga</button>
        </div>
        {check.result && <div className={"mt-3 p-3 rounded-xl border "+(check.result.below_floor?"bg-red-50 border-red-200":"bg-emerald-50 border-emerald-200")}>
          <div className="text-sm"><b>Harga: Rp {new Intl.NumberFormat('id-ID').format(check.result.price)}</b> • sumber {check.result.source} • floor {new Intl.NumberFormat('id-ID').format(check.result.floor_price)}</div>
          {check.result.below_floor && <div className="text-xs text-red-700 mt-1">⚠️ Di bawah floor price — butuh approval Sales Manager + Direktur</div>}
          {check.result.warning && <div className="text-xs text-amber-700">{check.result.warning}</div>}
        </div>}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-4">
          <h3 className="font-bold">Override per Customer</h3>
          <div className="max-h-[260px] overflow-auto mt-3"><table className="w-full text-xs"><thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><th className="p-2 text-left">CUSTOMER</th><th className="px-4 py-3.5">PRODUK</th><th className="px-4 py-3.5 text-right">HARGA KHUSUS</th></tr></thead><tbody>{customerPrices.map(cp=>(
            <tr key={cp.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition bg-white"><td className="px-4 py-3.5">{cp.customer_name}</td><td className="px-4 py-3.5">{cp.product_name}</td><td className="p-2 text-right font-bold">{new Intl.NumberFormat('id-ID').format(cp.price)}</td></tr>
          ))}</tbody></table></div>
        </div>
        <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-4">
          <h3 className="font-bold">Promo & Bundling</h3>
          <div className="space-y-2 mt-3">{promos.map(pr=>(
            <div key={pr.id} className="p-3 border rounded-xl bg-[#F1F5F9]"><div className="font-bold text-sm">{pr.code} • {pr.name}</div><div className="text-xs text-[#64748B]">{pr.type} • {pr.start_date?.slice(0,10)} → {pr.end_date?.slice(0,10)} • {pr.is_active?'Aktif':'Nonaktif'}</div></div>
          ))}{promos.length===0 && <div className="text-xs text-[#94A3B8]">Belum ada promo. Contoh: semen+pasir gratis ongkir.</div>}</div>
        </div>
      </div>
    </div>
  )
}
