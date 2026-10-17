import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Check, X } from 'lucide-react';
import api from '../lib/api';
import { PosPageHeader } from '../components/PosUI';
import { useDialog } from '../components/DialogProvider';
function rupiah(n){ return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n||0)}

export default function PurchaseReceipts(){
  const nav=useNavigate(); const dialog=useDialog();
  const [data,setData]=useState([]); const [pos,setPos]=useState([]); const [show,setShow]=useState(false);
  const [form,setForm]=useState({po_id:'', warehouse_id:1, items:[]});
  const [detail,setDetail]=useState(null);
  const [poInfo,setPoInfo]=useState(null);
  // 3-way
  const [three,setThree]=useState([]); const [pinv,setPinv]=useState([]);
  const [showInv,setShowInv]=useState(false);
  const [invForm,setInvForm]=useState({po_id:'', invoice_date:'', due_date:'', items:[], notes:''});
  const [invDetail,setInvDetail]=useState(null);
  const [invPos,setInvPos]=useState([]);

  const load=()=>{
    api.get('/purchase/receipts').then(r=>setData(Array.isArray(r.data)?r.data:[])).catch(()=>setData([]));
    Promise.all([
      api.get('/purchase/orders',{params:{status:'APPROVED'}}).catch(()=>({data:{data:[]}})),
      api.get('/purchase/orders',{params:{status:'PARTIAL'}}).catch(()=>({data:{data:[]}})),
      api.get('/purchase/orders',{params:{status:'RECEIVED'}}).catch(()=>({data:{data:[]}})),
    ]).then(([a,b,c])=>{
      const av=a.data?.data ?? a.data ?? []; const bv=b.data?.data ?? b.data ?? []; const cv=c.data?.data ?? c.data ?? [];
      setPos([...av,...bv]);
      setInvPos([...av,...bv,...cv]);
      // fallback jika semua kosong (belum filter) coba ambil semua PO
      if([...av,...bv,...cv].length===0){
        api.get('/purchase/orders').then(r=>{ const v=r.data?.data ?? r.data ?? []; if(Array.isArray(v)&&v.length) setInvPos(v); }).catch(()=>{});
      }
    });
    api.get('/purchase/three-way').then(r=>{
      const v=Array.isArray(r.data)?r.data:r.data??[];
      setThree(v);
      if(v.length) setInvPos(prev=> prev.length? prev : v);
    }).catch(()=>setThree([]));
    api.get('/purchase/invoices').then(r=>setPinv(Array.isArray(r.data)?r.data:[])).catch(()=>setPinv([]));
  };
  useEffect(()=>{ load(); },[]);

  const loadPo=async(id)=>{
    const r=await api.get('/purchase/orders/'+id);
    setPoInfo(r.data);
    setForm({po_id:id, warehouse_id:1, items: r.data.details.map(d=>({product_id:d.product_id, product_name:d.product_name, sku:d.sku, qty_ordered:Number(d.qty), qty_received: Math.max(0, Number(d.qty)-Number(d.qty_received||0)), qty_already:Number(d.qty_received||0), unit_cost:Number(d.unit_cost)}))});
  };
  const openForPo=(id)=>{ setShow(true); loadPo(id); };

  const submit=async(e)=>{
    e.preventDefault();
    if(!form.po_id) return dialog.alert('Pilih PO dulu',{title:'Pilih PO'});
    const items=form.items.map(it=>({product_id:it.product_id, qty_received: parseFloat(it.qty_received)||0, qty_ordered:it.qty_ordered, unit_cost:it.unit_cost})).filter(it=>it.qty_received>0);
    if(items.length===0) return dialog.alert('Isi qty terima >0 minimal 1 produk',{title:'Qty kosong'});
    for(const it of items){ const line=form.items.find(x=>x.product_id===it.product_id); if(it.qty_received > line.qty_ordered - line.qty_already) return dialog.alert(`Qty terima ${it.product_name||'#'+it.product_id} melebihi sisa (${line.qty_ordered - line.qty_already})`,{title:'Qty berlebih'}); }
    try{
      await api.post('/purchase/receipts', {po_id: parseInt(form.po_id), warehouse_id:1, items});
      await dialog.alert('GRN berhasil • stok & kartu stok terupdate',{title:'GRN COMPLETED'});
      setShow(false); setPoInfo(null); load();
    }catch(err){ await dialog.alert(err.response?.data?.error||err.message,{title:'Gagal GRN'}); }
  };

  // invoice helpers
  const loadPoForInv=async(id)=>{
    try{
      const r=await api.get('/purchase/orders/'+id);
      const details=r.data.details||[];
      if(!details.length){
        await dialog.alert('PO '+r.data.po_number+' tidak punya rincian produk - tidak bisa dibuat invoice. Buat PO baru via PR→RFQ→winner (atau PO manual dengan items).',{title:'PO kosong'});
        return;
      }
      setInvForm({po_id:id, invoice_date:new Date().toISOString().slice(0,10), due_date:'', notes:'', items: details.map(d=>({product_id:d.product_id, product_name:d.product_name, sku:d.sku, qty:Number(d.qty), unit_cost:Number(d.unit_cost)}))});
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message,{title:'Gagal load PO'}); }
  };
  const submitInv=async(e)=>{
    e.preventDefault();
    if(!invForm.po_id) return dialog.alert('Pilih PO dulu - klik dropdown di atas',{title:'Pilih PO'});
    if(!invForm.items.length) return dialog.alert('Pilih PO dulu agar produk ter-load. Jika dropdown kosong: RESTART backend (route 3-way baru) lalu refresh.',{title:'Belum pilih PO'});
    const items=invForm.items.map(it=>({product_id:it.product_id, qty:parseFloat(it.qty)||0, unit_cost:parseFloat(it.unit_cost)||0})).filter(it=>it.qty>0 && it.unit_cost>0);
    if(!items.length) return dialog.alert('Isi qty >0 dan harga >0 per baris. Jika 0 semua akan dianggap kosong.',{title:'Lengkapi qty & harga'});
    try{
      const r=await api.post('/purchase/invoices',{po_id:parseInt(invForm.po_id), invoice_date:invForm.invoice_date||null, due_date:invForm.due_date||null, notes:invForm.notes||null, items});
      await dialog.alert(`${r.data.inv_number} • ${r.data.status} - ${r.data.note}`,{title: r.data.status==='MATCHED'?'MATCHED siap bayar':'HOLD cek selisih'});
      setShowInv(false); load();
    }catch(err){ await dialog.alert(err.response?.data?.error||err.message,{title:'Gagal Invoice'}); }
  };
  const openInvDetail=async(id)=>{
    const r=await api.get('/purchase/invoices/'+id);
    setInvDetail(r.data);
  };

  const matchBadge=(m)=>{
    if(m==='MATCHED') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if(m==='HOLD') return 'bg-red-50 text-red-700 border-red-200';
    if(m==='WAIT_GRN') return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-sky-50 text-sky-700 border-sky-200';
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between gap-3 items-start">
        <div>
          <PosPageHeader icon={FileText} title="Goods Receipt (GRN) + 3-Way" subtitle="Step 5 GRN → Step 6 3-way PO-GRN-Invoice → HOLD/MATCHED → AP"/>
          <nav className="mt-2 flex flex-wrap items-center gap-1 p-1 bg-[#F1F5F9] border rounded-full w-fit shadow-sm">
            {[
              {label:'PR',sub:'Request',to:'/purchase/requests'},
              {label:'RFQ',sub:'Quotation',to:'/purchase/rfqs'},
              {label:'PO',sub:'Order',to:'/purchase/orders'},
              {label:'Approval',sub:'Step 4',to:'/approvals'},
              {label:'GRN',sub:'Receipt',active:true,to:'/purchase/receipts'},
              {label:'3-way',sub:'Matching',active:true,to:'/purchase/receipts'},
            ].map((s,i,arr)=>(
              <span key={s.label} className="flex items-center gap-1">
                <button onClick={()=>nav(s.to)} className={"inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black border "+(s.active?"bg-[#1E40AF] text-white border-[#1E40AF]":"bg-white text-gray-700 border-gray-200 hover:border-[#1E40AF]/30")}>
                  <span className={"w-5 h-5 grid place-items-center rounded-full text-[10px] font-black "+(s.active?"bg-white/20 text-white":"bg-gray-900 text-white")}>{i+1}</span>
                  {s.label} <span className="hidden lg:inline text-[10px] opacity-60 font-semibold">{s.sub}</span>
                </button>
                {i<arr.length-1 && <span className="text-[#94A3B8]">›</span>}
              </span>
            ))}
          </nav>
        </div>
        <div className="flex gap-2">
          <button onClick={()=>{ setPoInfo(null); setForm({po_id:'',warehouse_id:1,items:[]}); setShow(true); }} className="h-[42px] px-4 bg-[#1E40AF] text-white rounded-xl text-sm font-bold hover:bg-[#1E3A8A]">+ Terima Barang</button>
          <button onClick={()=>{ setInvForm({po_id:'',invoice_date:new Date().toISOString().slice(0,10),due_date:'',notes:'',items:[]}); setShowInv(true); }} className="h-[42px] px-4 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700">+ Invoice Supplier</button>
        </div>
      </div>

      {/* PO siap terima */}
      <div className="bg-[#EFF6FF] border border-[#DBEAFE] rounded-[20px] p-3">
        <div className="flex justify-between items-center">
          <div><div className="text-xs font-black text-[#1E40AF]">PO Siap Diterima - APPROVED / PARTIAL • {pos.length} PO</div><div className="text-[11px] text-[#64748B]">Terima barang dulu → GRN → baru bisa 3-way. PO PENDING harus approve di Approval.</div></div>
          <button onClick={()=>nav('/purchase/orders')} className="hidden sm:inline-flex h-7 px-3 bg-white border rounded-full text-xs font-semibold">Lihat PO</button>
        </div>
        <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {pos.length===0 ? <div className="col-span-full bg-white border rounded-xl p-4 text-center text-xs text-[#94A3B8]">Tidak ada PO siap terima. Buat PR → RFQ → winner → PO APPROVED dulu.</div> :
            pos.map(p=>(
              <div key={p.id} className="bg-white rounded-xl border p-3 flex flex-col gap-2">
                <div><div className="font-bold text-sm">{p.po_number}</div><div className="text-xs text-[#64748B]">{p.supplier_name} • {rupiah(p.total)}</div><div className="text-[11px]"><span className={"px-2 py-0.5 rounded-full border text-[11px] font-bold "+(p.status==='PARTIAL'?"bg-amber-50 text-amber-700 border-amber-200":"bg-emerald-50 text-emerald-700 border-emerald-200")}>{p.status}</span> <span className="text-[#94A3B8]">{p.po_date?.slice(0,10)}</span></div></div>
                <div className="flex gap-1"><button onClick={()=>openForPo(p.id)} className="flex-1 h-8 rounded-full bg-[#1E40AF] text-white text-xs font-bold hover:bg-blue-800">Terima → GRN</button><button onClick={()=>{ setInvForm({po_id:'',invoice_date:new Date().toISOString().slice(0,10),due_date:'',notes:'',items:[]}); setShowInv(true); setTimeout(()=>loadPoForInv(p.id),0); }} className="h-8 px-3 rounded-full border bg-white text-xs font-bold">+ Invoice</button></div>
              </div>
            ))
          }
        </div>
      </div>

      {/* History GRN */}
      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-[#F8FAFC] flex justify-between items-center"><span className="text-xs font-black tracking-widest text-[#64748B]">RIWAYAT GRN • {data.length}</span><span className="text-[11px] text-[#94A3B8]">klik baris detail</span></div>
        <div className="overflow-auto"><table className="w-full text-sm">
          <thead><tr className="bg-[#F1F5F9] border-y text-[11px] font-bold tracking-widest text-[#64748B]"><th className="text-left px-4 py-3">GRN</th><th className="text-left px-4 py-3">PO</th><th className="text-left px-4 py-3">GUDANG</th><th className="text-left px-4 py-3">TGL</th><th className="text-left px-4 py-3">STATUS</th></tr></thead>
          <tbody>{(Array.isArray(data)?data:[]).map((g,idx)=>(
            <tr key={g.id} onClick={()=>setDetail(g)} className={"border-b hover:bg-[#EFF6FF] cursor-pointer "+(idx%2===1?"bg-[#F8FAFC]/70":"bg-white")}><td className="px-4 py-3.5 font-mono text-xs font-bold">{g.grn_number}</td><td className="px-4 py-3.5">{g.po_number}</td><td className="px-4 py-3.5">{g.warehouse_name||'Gudang Pusat Bekasi'}</td><td className="px-4 py-3.5 text-xs">{g.receipt_date?.slice(0,10)}</td><td className="px-4 py-3.5"><span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border font-bold">{g.status}</span></td></tr>
          ))}{data.length===0 && <tr><td colSpan={5} className="p-8 text-center text-sm text-[#94A3B8]">Belum ada GRN</td></tr>}</tbody>
        </table></div>
      </div>

      {/* Step 6 - 3-Way Matching */}
      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-[#0F172A] text-white flex flex-wrap justify-between items-center gap-2">
          <div><div className="text-xs font-black tracking-widest">STEP 6 - 3-WAY MATCHING • PO ↔ GRN ↔ INVOICE</div><div className="text-[11px] opacity-70">Cocok qty+harga → MATCHED boleh bayar (AP). Tidak cocok → HOLD blokir.</div></div>
          <button onClick={()=>{ setInvForm({po_id:'',invoice_date:new Date().toISOString().slice(0,10),due_date:'',notes:'',items:[]}); setShowInv(true); }} className="h-8 px-4 bg-emerald-500 text-white rounded-full text-xs font-bold hover:bg-emerald-600">+ Input Invoice Supplier</button>
        </div>
        <div className="overflow-auto"><table className="w-full text-xs">
          <thead><tr className="bg-[#F1F5F9] border-y text-[11px] font-bold tracking-widest text-[#64748B]"><th className="text-left px-3 py-2">PO</th><th className="text-left px-3 py-2">SUPPLIER</th><th className="text-right px-3 py-2">PO QTY</th><th className="text-right px-3 py-2">GRN QTY</th><th className="text-right px-3 py-2">INV TOTAL</th><th className="text-left px-3 py-2">MATCH</th><th className="text-left px-3 py-2">CATATAN</th><th className="text-right px-3 py-2">AKSI</th></tr></thead>
          <tbody>{three.map(r=>(
            <tr key={r.id} className="border-b hover:bg-[#F8FAFC]">
              <td className="px-3 py-2 font-mono font-bold">{r.po_number}<div className="text-[11px] text-[#94A3B8] font-normal">{r.po_status}</div></td>
              <td className="px-3 py-2">{r.supplier_name}</td>
              <td className="px-3 py-2 text-right">{r.po_qty}</td>
              <td className="px-3 py-2 text-right">{r.grn_qty} <span className="text-[#94A3B8]">/{r.grn_count} GRN</span></td>
              <td className="px-3 py-2 text-right">{r.inv_count>0? rupiah(r.inv_total):'-'} <span className="text-[#94A3B8]">{r.inv_count? `${r.inv_count} inv`:''}</span></td>
              <td className="px-3 py-2"><span className={"px-2 py-1 rounded-full border text-[11px] font-black whitespace-nowrap "+matchBadge(r.match)}>{r.match}</span></td>
              <td className="px-3 py-2 max-w-[220px] truncate text-[#64748B]">{r.note}</td>
              <td className="px-3 py-2 text-right">
                {r.match==='WAIT_GRN' && <button onClick={()=>openForPo(r.id)} className="text-xs px-3 py-1 rounded-full bg-[#1E40AF] text-white font-bold">GRN dulu</button>}
                {r.match==='WAIT_INVOICE' && <button onClick={()=>{ setShowInv(true); loadPoForInv(r.id); }} className="text-xs px-3 py-1 rounded-full bg-emerald-600 text-white font-bold">+ Invoice</button>}
                {r.match==='HOLD' && <button onClick={()=>nav('/finance/arap')} className="text-xs px-3 py-1 rounded-full border bg-white">Lihat HOLD</button>}
                {r.match==='MATCHED' && <button onClick={()=>nav('/finance/arap')} className="text-xs px-3 py-1 rounded-full bg-emerald-600 text-white font-bold">Bayar di Finance</button>}
              </td>
            </tr>
          ))}{three.length===0 && <tr><td colSpan={8} className="p-8 text-center text-[#94A3B8]">Belum ada PO untuk 3-way - buat PO dulu</td></tr>}</tbody>
        </table></div>
        <div className="px-4 py-2 bg-[#F8FAFC] border-t text-[11px] text-[#64748B]">Invoice HOLD muncul di <button onClick={()=>nav('/finance/arap')} className="underline font-bold text-[#1E40AF]">Finance AP</button> • MATCHED auto jadi hutang siap dibayar. Klik baris GRN di atas untuk detail stok.</div>
      </div>

      {/* Invoices supplier */}
      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-[#F8FAFC] flex justify-between items-center"><span className="text-xs font-black tracking-widest text-[#64748B]">INVOICE SUPPLIER (PINV) • {pinv.length}</span><span className="text-[11px] text-[#94A3B8]">klik untuk cek per-item match</span></div>
        <div className="overflow-auto"><table className="w-full text-sm">
          <thead><tr className="bg-[#F1F5F9] border-y text-[11px] font-bold tracking-widest text-[#64748B]"><th className="text-left px-4 py-3">INV</th><th className="text-left px-4 py-3">PO</th><th className="text-left px-4 py-3">SUPPLIER</th><th className="text-right px-4 py-3">TOTAL</th><th className="text-left px-4 py-3">STATUS</th><th className="text-left px-4 py-3">TGL</th></tr></thead>
          <tbody>{pinv.map(p=>(
            <tr key={p.id} onClick={()=>openInvDetail(p.id)} className="border-b hover:bg-[#EFF6FF] cursor-pointer"><td className="px-4 py-3 font-mono text-xs font-bold">{p.inv_number}</td><td className="px-4 py-3">{p.po_number}</td><td className="px-4 py-3">{p.supplier_name}</td><td className="px-4 py-3 text-right font-bold">{rupiah(p.total)}</td><td className="px-4 py-3"><span className={"text-xs px-2 py-1 rounded-full border font-bold "+(p.status==='MATCHED'?"bg-emerald-50 text-emerald-700 border-emerald-200":p.status==='APPROVED'?"bg-sky-50 text-sky-700 border-sky-200":"bg-red-50 text-red-700 border-red-200")}>{p.status}</span></td><td className="px-4 py-3 text-xs">{p.invoice_date?.slice(0,10)}</td></tr>
          ))}{pinv.length===0 && <tr><td colSpan={6} className="p-8 text-center text-[#94A3B8] text-sm">Belum ada Invoice supplier - klik + Invoice Supplier di atas (isi qty & harga dari PO/GRN, sistem auto HOLD jika beda)</td></tr>}</tbody>
        </table></div>
      </div>

      {detail && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50" onClick={()=>setDetail(null)}>
          <div onClick={e=>e.stopPropagation()} className="bg-white rounded-[20px] w-full max-w-lg p-5 space-y-3 animate-pop">
            <div className="flex justify-between items-start"><h3 className="font-black">{detail.grn_number}</h3><button onClick={()=>setDetail(null)} className="w-8 h-8 grid place-items-center rounded-full border"><X size={14}/></button></div>
            <div className="text-xs text-[#64748B]">{detail.po_number} • {detail.warehouse_name} • {detail.receipt_date?.slice(0,10)} • <span className="font-bold text-emerald-700">{detail.status}</span></div>
            <div className="flex justify-end gap-2"><button onClick={()=>setDetail(null)} className="h-9 px-4 bg-white border rounded-xl text-xs font-semibold">Tutup</button><button onClick={()=>{ setDetail(null); nav('/inventory/stocks'); }} className="h-9 px-4 bg-[#1E40AF] text-white rounded-xl text-xs font-bold">Cek Stok</button></div>
          </div>
        </div>
      )}

      {invDetail && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50 overflow-auto" onClick={()=>setInvDetail(null)}>
          <div onClick={e=>e.stopPropagation()} className="bg-white rounded-[20px] w-full max-w-2xl p-5 space-y-3 max-h-[90vh] overflow-auto animate-pop">
            <div className="flex justify-between items-start"><div><h3 className="font-black">{invDetail.inv_number} • {invDetail.po_number}</h3><p className="text-xs text-[#64748B]">{invDetail.supplier_name} • {invDetail.invoice_date?.slice(0,10)} • <span className={"px-2 py-0.5 rounded-full border text-xs font-bold "+(invDetail.status==='MATCHED'?"bg-emerald-50 text-emerald-700":invDetail.status==='HOLD'?"bg-red-50 text-red-700":"bg-white")}>{invDetail.status}</span> {invDetail.allMatch? <span className="inline-flex items-center gap-1"><Check size={12}/> semua item cocok</span> : <span className="inline-flex items-center gap-1"><X size={12}/> ada beda</span>}</p></div><button onClick={()=>setInvDetail(null)} aria-label="Tutup" className="w-8 h-8 grid place-items-center rounded-full border shrink-0 hover:bg-[#F8FAFC]"><X size={15}/></button></div>
            <div className="border rounded-xl overflow-hidden">
              <div className="grid grid-cols-[1.4fr_0.5fr_0.6fr_0.5fr_0.4fr] gap-2 px-3 py-2 bg-[#F1F5F9] text-[10px] font-bold tracking-widest text-[#64748B]"><span>PRODUK</span><span className="text-right">PO</span><span className="text-right">GRN</span><span className="text-right">INV</span><span className="text-center">MATCH</span></div>
              {(invDetail.items||[]).map((it,i)=>(
                <div key={i} className={"grid grid-cols-[1.4fr_0.5fr_0.6fr_0.5fr_0.4fr] gap-2 px-3 py-2 border-t text-xs "+(it.rowMatch?"":"bg-red-50/50")}><span>{it.product_name||'Prod #'+it.product_id} <div className="text-[11px] text-[#94A3B8]">@ {rupiah(it.unit_cost)} vs PO {rupiah(it.po_unit_cost)}</div></span><span className="text-right">{it.po_qty}</span><span className="text-right">{it.grn_qty}</span><span className="text-right font-bold">{it.qty} x {rupiah(it.unit_cost)}</span><span className="text-center">{it.rowMatch? <Check size={13} className="mx-auto"/> : <X size={13} className="mx-auto"/>}</span></div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <button onClick={()=>setInvDetail(null)} className="h-9 px-4 bg-white border rounded-xl text-xs font-semibold">Tutup</button>
              {invDetail.status==='HOLD' && <button onClick={async()=>{ await api.post('/purchase/invoices/'+invDetail.id+'/approve'); setInvDetail(null); load(); }} className="h-9 px-4 bg-emerald-600 text-white rounded-xl text-xs font-bold">Force Approve (bayar)</button>}
              {invDetail.status==='MATCHED' && <button onClick={async()=>{ await api.post('/purchase/invoices/'+invDetail.id+'/hold'); setInvDetail(null); load(); }} className="h-9 px-4 bg-white border rounded-xl text-xs">Set HOLD</button>}
              <button onClick={()=>{ setInvDetail(null); nav('/finance/arap'); }} className="h-9 px-4 bg-[#1E40AF] text-white rounded-xl text-xs font-bold">Ke Finance AP</button>
            </div>
          </div>
        </div>
      )}

      {show && <div className="fixed inset-0 bg-black/40 grid place-items-center p-3 z-50 overflow-auto">
        <form onSubmit={submit} className="bg-white rounded-[20px] w-full max-w-2xl shadow-xl border flex flex-col max-h-[92vh] animate-pop">
          <div className="p-5 border-b flex justify-between items-start gap-3"><div><h3 className="font-black text-[15px]">Terima Barang (GRN)</h3><p className="text-xs text-[#64748B]">Pilih PO APPROVED → isi qty diterima (≤ sisa)</p></div><button type="button" onClick={()=>setShow(false)} className="w-8 h-8 grid place-items-center rounded-full border"><X size={14}/></button></div>
          <div className="flex-1 overflow-auto p-4 space-y-3">
            <label className="block space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">PO * - hanya APPROVED/PARTIAL</span>
              <select value={form.po_id} onChange={e=>loadPo(e.target.value)} className="w-full h-[42px] px-3 bg-white border border-[#E2E8F0] rounded-xl text-sm outline-none focus:border-[#1E40AF]">
                <option value="">Pilih PO</option>{pos.map(p=> <option key={p.id} value={p.id}>{p.po_number} • {p.supplier_name} • {p.status} • {rupiah(p.total)}</option>)}
              </select>
            </label>
            {poInfo && <div className="bg-[#F8FAFC] border rounded-xl p-3 text-xs"><div className="font-bold">{poInfo.po_number} • {poInfo.supplier_name}</div><div className="text-[#64748B]">{poInfo.po_date?.slice(0,10)} • status {poInfo.status}</div></div>}
            {form.items.length>0 ? (
              <div className="border rounded-xl overflow-hidden">
                <div className="grid grid-cols-[1.5fr_0.7fr_0.7fr_0.6fr] gap-2 px-3 py-2 bg-[#F1F5F9] text-[10px] font-bold tracking-widest text-[#64748B]"><span>PRODUK</span><span className="text-right">SISA</span><span className="text-center">TERIMA *</span><span className="text-right">HARGA</span></div>
                {form.items.map((it,i)=>(
                  <div key={i} className="grid grid-cols-[1.5fr_0.7fr_0.7fr_0.6fr] gap-2 px-3 py-2 border-t items-center">
                    <span className="text-sm truncate">{it.product_name||'Prod #'+it.product_id} <span className="text-xs text-[#94A3B8]">{it.sku||''}</span><div className="text-[11px] text-[#94A3B8]">Dipesan {it.qty_ordered} • sudah {it.qty_already}</div></span>
                    <span className="text-right font-bold">{it.qty_ordered - it.qty_already}</span>
                    <input type="number" min={0} max={it.qty_ordered - it.qty_already} step={1} value={it.qty_received} onChange={e=>{ let v=e.target.value; if(v===''){ const c=[...form.items]; c[i].qty_received=''; setForm({...form, items:c}); return;} let n=parseFloat(v); if(isNaN(n)) n=0; if(n<0) n=0; if(n > it.qty_ordered - it.qty_already) n=it.qty_ordered - it.qty_already; const c=[...form.items]; c[i].qty_received=n; setForm({...form, items:c}); }} className="w-full h-8 border rounded-lg text-center text-sm outline-none focus:border-[#1E40AF]" placeholder="0"/>
                    <span className="text-right text-xs">{rupiah(it.unit_cost)}</span>
                  </div>
                ))}
              </div>
            ) : <div className="text-xs text-[#94A3B8] border-2 border-dashed rounded-xl p-6 text-center">Pilih PO di atas untuk load produk & sisa qty</div>}
          </div>
          <div className="p-4 border-t bg-white flex justify-end gap-2 sticky bottom-0"><button type="button" onClick={()=>setShow(false)} className="h-10 px-5 rounded-xl border bg-white text-sm font-semibold">Batal</button><button className="h-10 px-6 rounded-xl bg-[#1E40AF] text-white text-sm font-bold hover:bg-blue-800">Simpan GRN</button></div>
        </form>
      </div>}

      {showInv && <div className="fixed inset-0 bg-black/40 grid place-items-center p-3 z-50 overflow-auto">
        <form onSubmit={submitInv} className="bg-white rounded-[20px] w-full max-w-2xl shadow-xl border flex flex-col max-h-[92vh] animate-pop">
          <div className="p-5 border-b flex justify-between items-start gap-3"><div><h3 className="font-black text-[15px]">Invoice Supplier - 3-Way</h3><p className="text-xs text-[#64748B]">Isi qty & harga tagihan. Sistem cek vs PO & GRN → HOLD jika beda, MATCHED jika cocok.</p></div><button type="button" onClick={()=>setShowInv(false)} className="w-8 h-8 grid place-items-center rounded-full border"><X size={14}/></button></div>
          <div className="flex-1 overflow-auto p-4 space-y-3">
            <label className="block space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">PO * - pilih PO (RECEIVED/PARTIAL/APPROVED → jika belum GRN akan HOLD)</span>
              <select value={invForm.po_id} onChange={e=>loadPoForInv(e.target.value)} className="w-full h-[42px] px-3 bg-white border border-[#E2E8F0] rounded-xl text-sm outline-none focus:border-[#1E40AF]">
                <option value="">Pilih PO</option>{(invPos.length?invPos:three).map(p=> <option key={p.id} value={p.id}>{p.po_number} • {p.supplier_name} • {rupiah(p.total ?? p.po_total)} • {p.match ?? p.status}</option>)}
              </select>
              <div className="text-[11px] text-[#64748B]">Kosong? Pastikan ada PO APPROVED dan sudah GRN di atas, atau RESTART backend (tabel PO baru ter-create). PO belum GRN → invoice HOLD (WAIT_GRN).</div>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold text-[#64748B]">Tgl Invoice</span><input type="date" value={invForm.invoice_date} onChange={e=>setInvForm({...invForm, invoice_date:e.target.value})} className="w-full h-9 px-3 border rounded-xl text-sm"/></label>
              <label className="space-y-1"><span className="text-[11px] font-bold text-[#64748B]">Jatuh Tempo</span><input type="date" value={invForm.due_date} onChange={e=>setInvForm({...invForm, due_date:e.target.value})} className="w-full h-9 px-3 border rounded-xl text-sm"/></label>
            </div>
            {invForm.items.length>0 ? (
              <div className="border rounded-xl overflow-hidden">
                <div className="grid grid-cols-[1.4fr_0.5fr_0.7fr] gap-2 px-3 py-2 bg-[#F1F5F9] text-[10px] font-bold tracking-widest text-[#64748B]"><span>PRODUK</span><span className="text-center">QTY *</span><span className="text-right">HARGA *</span></div>
                {invForm.items.map((it,i)=>(
                  <div key={i} className="grid grid-cols-[1.4fr_0.5fr_0.7fr] gap-2 px-3 py-2 border-t items-center">
                    <span className="text-sm truncate">{it.product_name||'Prod #'+it.product_id} <span className="text-xs text-[#94A3B8]">{it.sku||''}</span></span>
                    <input type="number" min={0} step={1} value={it.qty} onChange={e=>{ const c=[...invForm.items]; c[i].qty=e.target.value===''?'':Math.max(0,parseFloat(e.target.value)||0); setInvForm({...invForm, items:c}); }} className="w-full h-8 border rounded-lg text-center text-sm"/>
                    <input type="number" min={0} step={1000} value={it.unit_cost} onChange={e=>{ const c=[...invForm.items]; c[i].unit_cost=e.target.value===''?'':Math.max(0,parseFloat(e.target.value)||0); setInvForm({...invForm, items:c}); }} className="w-full h-8 border rounded-lg text-right text-sm pr-2"/>
                  </div>
                ))}
                <div className="px-3 py-2 bg-[#F8FAFC] border-t text-right text-xs font-bold">Subtotal {rupiah(invForm.items.reduce((a,b)=>a+(parseFloat(b.qty)||0)*(parseFloat(b.unit_cost)||0),0))} + PPN 11% = {rupiah(invForm.items.reduce((a,b)=>a+(parseFloat(b.qty)||0)*(parseFloat(b.unit_cost)||0),0)*1.11)}</div>
              </div>
            ) : <div className="text-xs text-[#94A3B8] border-2 border-dashed rounded-xl p-6 text-center">Pilih PO untuk load produk</div>}
            <label className="block space-y-1"><span className="text-[11px] font-bold text-[#64748B]">Catatan</span><input value={invForm.notes} onChange={e=>setInvForm({...invForm, notes:e.target.value})} placeholder="No invoice supplier / keterangan" className="w-full h-9 px-3 border rounded-xl text-sm"/></label>
            <div className="text-[11px] bg-amber-50 border border-amber-200 rounded-xl p-2 text-[#92400E]">Jika qty/harga beda vs PO/GRN → status jadi <b>HOLD</b> (blokir bayar, cek di Finance). Cocok semua → <b>MATCHED</b> siap jadi hutang AP.</div>
          </div>
          <div className="p-4 border-t bg-white flex justify-end gap-2 sticky bottom-0"><button type="button" onClick={()=>setShowInv(false)} className="h-10 px-5 rounded-xl border bg-white text-sm font-semibold">Batal</button><button className="h-10 px-6 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700">Simpan Invoice (auto 3-way)</button></div>
        </form>
      </div>}
    </div>
  )
}
