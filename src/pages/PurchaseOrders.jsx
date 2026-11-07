
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Search, Plus, Trash2, Printer } from 'lucide-react';
import api from '../lib/api';
import { Badge } from '../components/Layout';
import { useDialog } from '../components/DialogProvider';
import { PosPageHeader, PosSkeleton, PosError, PosEmpty, posBtnPrimary } from '../components/PosUI';
import PurchaseReceiptModal from '../components/PurchaseReceiptModal';
function rupiah(n){ return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n||0); }
export default function PurchaseOrders(){
  const nav=useNavigate();
  const dialog=useDialog();
  const [data,setData]=useState([]); const [show,setShow]=useState(false);
  const [suppliers,setSuppliers]=useState([]); const [products,setProducts]=useState([]);
  const [form,setForm]=useState({supplier_id:'', expected_date:'', items:[]}); const [pick,setPick]=useState(null);
  const [err,setErr]=useState(''); const [loading,setLoading]=useState(true);
  const [poReceiptModal, setPoReceiptModal]=useState({open:false, id:null, data:null});
  const load=async()=>{ setErr(''); try{ const r=await api.get('/purchase/orders'); setData(r.data?.data ?? r.data ?? []); }catch(e){ setErr(e.response?.data?.error||e.message||'Gagal memuat PO'); } finally{ setLoading(false); } };
  useEffect(()=>{ load(); api.get('/master/suppliers').then(r=>setSuppliers(r.data.data)); api.get('/master/products',{params:{limit:100}}).then(r=>setProducts(r.data.data)); },[]);
  const add=(p)=> setForm(f=>({...f, items:[...f.items, {product_id:p.id, name:p.name, qty:1, unit_cost:''}]}));
  const submit=async(e)=>{
    e.preventDefault();
    if(!form.supplier_id){ await dialog.alert('Pilih supplier dulu',{title:'Lengkapi'}); return; }
    if(!form.items.length){ await dialog.alert('Tambahkan minimal 1 produk',{title:'Lengkapi'}); return; }
    for(const it of form.items){
      if(!(parseFloat(it.qty)>0)){ await dialog.alert('Qty "'+it.name+'" harus lebih dari 0',{title:'Qty Salah'}); return; }
      if(!(parseFloat(it.unit_cost)>0)){ await dialog.alert('Harga beli "'+it.name+'" wajib diisi (lebih dari 0)',{title:'Harga Kosong'}); return; }
    }
    try{
      const r=await api.post('/purchase/orders',{ supplier_id: parseInt(form.supplier_id), expected_date: form.expected_date||null, items: form.items.map(i=>({product_id:i.product_id, qty:parseFloat(i.qty), unit_cost:parseFloat(i.unit_cost)})) });
      await dialog.alert('PO '+r.data.po_number+' dibuat, status '+r.data.status+(r.data.status==='PENDING'?' (perlu approval Direktur karena di atas 50jt)':''), {title:'PO Dibuat'});
      setShow(false); setForm({supplier_id:'', expected_date:'', items:[]}); load();
    }catch(e2){ await dialog.alert(e2.response?.data?.error||e2.message||'Gagal membuat PO',{title:'Gagal'}); }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between items-start gap-4"><div><PosPageHeader icon={FileText} title="Purchase Order"/><nav className="mt-2 flex flex-wrap items-center gap-1 p-1 bg-surface-3 border rounded-full w-fit max-w-full shadow-card" aria-label="Alur Purchase Order">{[
        {label:'PR', sub:'Purchase Request', to:'/purchase/requests'},
        {label:'RFQ', sub:'Quotation', to:'/purchase/rfqs'},
        {label:'PO', sub:'Order', to:'/purchase/orders', active:true},
        {label:'Approval', sub:'Berjenjang', to:'/approvals'},
        {label:'GRN', sub:'Receipt', to:'/purchase/receipts'},
        {label:'3-way', sub:'Matching', to:'/purchase/receipts'},
      ].map((s,i,arr)=>(
        <span key={s.label} className="flex items-center gap-1">
          <button onClick={()=>nav(s.to)} title={s.sub+' - klik untuk buka'} className={"inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold tracking-wide border transition-all "+(s.active?"bg-brand text-white border-brand shadow-raised":"bg-white text-gray-700 border-gray-200 hover:border-brand/30 hover:text-brand hover:bg-blue-50/70 hover:shadow-card active:scale-[0.98]")}>
            <span className={"w-5 h-5 grid place-items-center rounded-full text-[11px] font-bold "+(s.active?"bg-white/20 text-white":"bg-gray-900 text-white")}>{i+1}</span>
            <span className="hidden sm:inline">{s.label}</span><span className="sm:hidden">{s.label}</span>
            <span className={"hidden lg:inline text-[11px] font-semibold opacity-60 "+(s.active?"text-white":"text-ink-2")}>{s.sub}</span>
          </button>
          {i<arr.length-1 && <span className="w-5 h-5 grid place-items-center text-ink-3"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg></span>}
        </span>
      ))}</nav><p className="text-[11px] text-ink-3 mt-1.5 ml-1">Klik step untuk lompat - posisi sekarang <b className="text-brand">PO</b></p></div><button onClick={()=>setShow(true)} className={posBtnPrimary}><Plus size={15}/> Buat PO</button></div>
      <div className="bg-white rounded-xl border border-line shadow-card overflow-hidden"><div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="bg-surface-3 border-y border-line text-[11px] font-bold tracking-wider text-ink-2"><th className="text-left px-4 py-3 whitespace-nowrap">PO</th><th className="text-left px-4 py-3 whitespace-nowrap">SUPPLIER</th><th className="text-left px-4 py-3 whitespace-nowrap">TGL</th><th className="text-right px-4 py-3 whitespace-nowrap">TOTAL</th><th className="text-left px-4 py-3 whitespace-nowrap">STATUS</th><th className="text-right px-4 py-3 whitespace-nowrap">AKSI</th></tr></thead><tbody>{loading && <tr><td colSpan={6} className="p-0"><PosSkeleton rows={5} cols={4}/></td></tr>}{err && !loading && <tr><td colSpan={6} className="p-0"><PosError message={err} onRetry={load}/></td></tr>}{!loading && !err && (Array.isArray(data)?data:[]).length===0 && <tr><td colSpan={6} className="p-0"><PosEmpty text="Belum ada Purchase Order"/></td></tr>}{(Array.isArray(data)?data:[]).map((po,idx)=>(
        <tr key={po.id} className={"border-b border-line hover:bg-surface-2 transition "+(idx%2===1?"bg-surface-2/70":"bg-white")}><td className="px-4 py-3.5 font-mono text-xs font-bold">{po.po_number}</td><td className="px-4 py-3.5 font-semibold">{po.supplier_name}</td><td className="px-4 py-3.5 text-xs text-center">{po.po_date?.slice(0,10)}</td><td className="px-4 py-3.5 text-right font-bold">{rupiah(po.total)}</td><td className="px-4 py-3.5 text-center"><Badge status={po.status}/></td><td className="px-4 py-3.5 text-right whitespace-nowrap"><button type="button" onClick={()=>setPoReceiptModal({open:true, id:po.id, data:po})} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand/10 hover:bg-brand/20 text-brand text-xs font-bold transition active:scale-95 shadow-xs" title="Cetak Bukti Pembelian PO"><Printer size={13}/> Cetak PO</button></td></tr>
      ))}</tbody></table></div></div>
      {show && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"><form onSubmit={submit} className="bg-white rounded-xl p-6 w-full max-w-2xl space-y-3 max-h-[90vh] overflow-auto animate-pop">
        <h3 className="font-bold">Buat Purchase Order</h3>
        <select required value={form.supplier_id} onChange={e=>setForm({...form, supplier_id:e.target.value})} className="w-full h-[42px] pl-3 pr-3 bg-surface-2 border border-line rounded-xl text-[13px] placeholder:text-ink-3 outline-none focus:bg-white focus:border-brand focus:ring-2 focus:ring-[#0051d5]/10 transition"><option value="">Pilih supplier</option>{suppliers.map(s=> <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <input type="date" value={form.expected_date} onChange={e=>setForm({...form, expected_date:e.target.value})} className="w-full h-[42px] pl-3 pr-3 bg-surface-2 border border-line rounded-xl text-[13px] placeholder:text-ink-3 outline-none focus:bg-white focus:border-brand focus:ring-2 focus:ring-[#0051d5]/10 transition"/>
        <div className="border rounded-xl p-2 max-h-[180px] overflow-auto grid grid-cols-1 gap-1">
          {products.slice(0,10).map(p=> <div key={p.id} className="flex gap-2 items-center justify-between border rounded-lg p-2"><span className="text-sm font-medium">{p.name} <span className="text-xs text-ink-2">{p.sku}</span></span><button type="button" onClick={()=>add(p)} className="text-xs px-2 py-1 rounded-full bg-brand text-white">+ Tambah</button></div>)}
        </div>
        <div className="space-y-2">
          {form.items.map((it,i)=>(
            <div key={i} className="flex gap-2 items-center"><span className="flex-1 text-sm">{it.name}</span><input type="number" min="1" value={it.qty} onChange={e=>{ const c=[...form.items]; c[i]={...c[i], qty:e.target.value}; setForm({...form, items:c}); }} placeholder="Qty" className="w-20 h-8 border rounded-lg text-center"/><input type="number" min="0" value={it.unit_cost} onChange={e=>{ const c=[...form.items]; c[i]={...c[i], unit_cost:e.target.value}; setForm({...form, items:c}); }} placeholder="Harga beli" className="w-28 h-8 border rounded-lg text-right"/><button type="button" onClick={()=> setForm({...form, items: form.items.filter((_,idx)=>idx!==i)})} aria-label="Hapus item" className="w-7 h-7 grid place-items-center rounded-full text-red-600 hover:bg-red-50"><Trash2 size={14}/></button></div>
          ))}
        </div>
        <div className="flex justify-end gap-2"><button type="button" onClick={()=>setShow(false)} className="h-[42px] px-5 bg-white border border-line rounded-xl text-sm font-semibold text-ink-2 hover:bg-surface-2 active:scale-[0.98] transition">Batal</button><button className={posBtnPrimary}>Simpan PO</button></div>
      </form></div>}
      <PurchaseReceiptModal
        isOpen={poReceiptModal.open}
        onClose={() => setPoReceiptModal({ open: false, id: null, data: null })}
        receiptId={poReceiptModal.id}
        preloadedData={poReceiptModal.data}
        type="PO"
      />
    </div>
  )
}
