
import { useEffect, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import api from '../lib/api';
import { Badge } from '../components/Layout';
export default function Returns(){
  const [sales,setSales]=useState([]); const [claims,setClaims]=useState([]); const [tab,setTab]=useState('sales');
  const [show,setShow]=useState(false); const [invoices,setInvoices]=useState([]); const [customers,setCustomers]=useState([]); const [products,setProducts]=useState([]);
  const [form,setForm]=useState({invoice_id:'', customer_id:'', reason:'DAMAGED', settlement_type:'CREDIT_NOTE', items:[]});
  const load=()=>{ api.get('/returns/sales').then(r=>setSales(r.data)); api.get('/returns/claims').then(r=>setClaims(r.data)); };
  useEffect(()=>{ load(); api.get('/sales/invoices').then(r=>setInvoices(r.data.data)); api.get('/master/customers',{params:{limit:100}}).then(r=>setCustomers(r.data.data)); api.get('/master/products',{params:{limit:100}}).then(r=>setProducts(r.data.data)); },[]);
  const add=(p)=> setForm({...form, items:[...form.items, {product_id:p.id, name:p.name, qty:1, unit_price:65000, condition:'QUARANTINE'}]});
  const submit=async(e)=>{
    e.preventDefault();
    await api.post('/returns/sales',{invoice_id: parseInt(form.invoice_id)||null, customer_id: parseInt(form.customer_id)||null, reason:form.reason, settlement_type:form.settlement_type, items: form.items.map(i=>({product_id:i.product_id, qty:i.qty, unit_price:i.unit_price, condition:i.condition}))});
    setShow(false); load();
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between gap-3 items-end"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white grid place-items-center shrink-0 shadow-sm"><FileText size={18} strokeWidth={2.2}/></div><div className="min-w-0 flex-1"><h1 className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A] leading-none">Retur & Klaim Berjenjang</h1><p className="text-xs text-[#64748B] mt-1">Retur penjualan/pembelian • Klaim supplier/ekspedisi • Settlement ganti barang / nota kredit</p></div></div><button onClick={()=>setShow(true)} className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-[#1E3A8A] active:scale-[0.98] transition">+ Retur Penjualan</button></div>
      <div className="flex gap-2"><button onClick={()=>setTab('sales')} className={"px-4 py-2 rounded-full text-xs font-bold border "+(tab==='sales'?"bg-[#1E40AF] text-white":"bg-white")}>Penjualan</button><button onClick={()=>setTab('claims')} className={"px-4 py-2 rounded-full text-xs font-bold border "+(tab==='claims'?"bg-[#1E40AF] text-white":"bg-white")}>Klaim</button></div>
      {tab==='sales' ? (
        <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden"><div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><th className="text-left px-4 py-3 whitespace-nowrap">NO RETUR</th><th className="text-left px-4 py-3 whitespace-nowrap">CUSTOMER</th><th className="text-left px-4 py-3 whitespace-nowrap">ALASAN</th><th className="text-left px-4 py-3 whitespace-nowrap">SETTLEMENT</th><th className="text-right px-4 py-3 whitespace-nowrap">TOTAL</th><th className="text-left px-4 py-3 whitespace-nowrap">STATUS</th></tr></thead><tbody>{sales.map(r=>(
          <tr key={r.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition bg-white"><td className="px-4 py-3.5 font-mono text-xs font-bold">{r.return_number}</td><td className="px-4 py-3.5">{r.customer_name}</td><td className="px-4 py-3.5"><Badge status={r.reason}/></td><td className="px-4 py-3.5 text-xs">{r.settlement_type}</td><td className="px-4 py-3.5 text-right font-bold">{new Intl.NumberFormat('id-ID').format(r.total)}</td><td className="px-4 py-3.5 text-center"><Badge status={r.status}/></td></tr>
        ))} {sales.length===0 && <tr><td colSpan={6} className="p-6 text-center text-[#94A3B8]">Belum ada retur</td></tr>}</tbody></table></div></div>
      ) : (
        <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden"><div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><th className="text-left px-4 py-3 whitespace-nowrap">KLAIM</th><th className="text-left px-4 py-3 whitespace-nowrap">TIPE</th><th className="text-left px-4 py-3 whitespace-nowrap">REF</th><th className="text-right px-4 py-3 whitespace-nowrap">KLAIM</th><th className="text-right px-4 py-3 whitespace-nowrap">SETTLED</th><th className="text-left px-4 py-3 whitespace-nowrap">STATUS</th></tr></thead><tbody>{claims.map(c=>(
          <tr key={c.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition bg-white"><td className="px-4 py-3.5 font-mono text-xs font-bold">{c.claim_number}</td><td className="px-4 py-3.5"><Badge status={c.claim_type}/></td><td className="px-4 py-3.5 text-xs">{c.reference_type} #{c.reference_id}</td><td className="px-4 py-3.5 text-right">{new Intl.NumberFormat('id-ID').format(c.amount_claimed)}</td><td className="px-4 py-3.5 text-right text-emerald-700">{new Intl.NumberFormat('id-ID').format(c.amount_settled||0)}</td><td className="px-4 py-3.5 text-center"><Badge status={c.status}/></td></tr>
        ))}</tbody></table></div></div>
      )}
      {show && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"><form onSubmit={submit} className="bg-white rounded-2xl p-6 w-full max-w-2xl space-y-3 max-h-[90vh] overflow-auto">
        <h3 className="font-bold">Retur Penjualan</h3>
        <div className="grid grid-cols-2 gap-2">
          <select value={form.invoice_id} onChange={e=>setForm({...form,invoice_id:e.target.value})} className="h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF]"><option value="">Pilih invoice</option>{invoices.map(i=> <option key={i.id} value={i.id}>{i.invoice_number} • {i.customer_name}</option>)}</select>
          <select value={form.customer_id} onChange={e=>setForm({...form,customer_id:e.target.value})} className="h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF]"><option value="">Pilih customer</option>{customers.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})} className="h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF]"><option value="DAMAGED">Rusak</option><option value="WRONG_ITEM">Salah kirim</option><option value="EXCESS">Kelebihan</option><option value="QUALITY">Kualitas</option><option value="OTHER">Lain</option></select>
          <select value={form.settlement_type} onChange={e=>setForm({...form,settlement_type:e.target.value})} className="h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF]"><option value="CREDIT_NOTE">Nota Kredit (potong piutang)</option><option value="REFUND">Refund</option><option value="EXCHANGE">Tukar barang</option></select>
        </div>
        <div className="border rounded-xl p-2 max-h-[160px] overflow-auto space-y-1">
          {products.slice(0,10).map(p=> <div key={p.id} className="flex justify-between items-center border rounded-lg p-2"><span className="text-sm">{p.name}</span><button type="button" onClick={()=>add(p)} className="text-xs px-2 py-1 bg-[#1E40AF] text-white rounded-full">+</button></div>)}
        </div>
        {form.items.map((it,i)=>(
          <div key={i} className="flex gap-2 items-center"><span className="flex-1 text-sm">{it.name}</span><input type="number" value={it.qty} onChange={e=>{ const c=[...form.items]; c[i].qty=parseFloat(e.target.value); setForm({...form,items:c}); }} className="w-20 h-8 border rounded-lg text-center"/><select value={it.condition} onChange={e=>{ const c=[...form.items]; c[i].condition=e.target.value; setForm({...form,items:c}); }} className="h-8 border rounded-lg px-2 text-xs"><option value="QUARANTINE">Karantina</option><option value="GOOD">Baik</option><option value="DAMAGED">Rusak</option></select><button type="button" onClick={()=> setForm({...form, items:form.items.filter((_,idx)=>idx!==i)})} className="text-red-600 text-xs">hapus</button></div>
        ))}
        <div className="text-xs text-[#64748B]">Barang masuk gudang karantina. Jika DAMAGED bisa klaim supplier/ekspedisi di tab Klaim.</div>
        <div className="flex justify-end gap-2"><button type="button" onClick={()=>setShow(false)} className="h-[42px] px-5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-semibold text-[#334155] hover:bg-[#F8FAFC] active:scale-[0.98] transition">Batal</button><button className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-[#1E3A8A] active:scale-[0.98] transition">Simpan Retur</button></div>
      </form></div>}
    </div>
  )
}
