import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import api from '../lib/api';
import { Badge } from '../components/Layout';
import { useDialog } from '../components/DialogProvider';

export default function Approvals(){
  const nav=useNavigate(); const dialog=useDialog();
  const [data,setData]=useState([]); const [tab,setTab]=useState('PENDING');
  const [poPending,setPoPending]=useState([]);
  const load=()=> {
    api.get('/approvals',{params:{status:tab}}).then(r=>setData(r.data ?? [])).catch(()=>setData([]));
    api.get('/purchase/orders',{params:{status:'PENDING'}}).then(r=>{
      const v=r.data?.data ?? r.data ?? [];
      setPoPending(Array.isArray(v)?v:[]);
    }).catch(()=>setPoPending([]));
  };
  useEffect(()=>{load()},[tab]);

  const approvePO=async(po)=>{
    try{
      await api.post('/purchase/orders/'+po.id+'/approve');
      await dialog.alert(`${po.po_number} approved → lanjut buat GRN di Receipt`,{title:'Approved'});
      load();
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message,{title:'Gagal'}); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white grid place-items-center shrink-0 shadow-sm"><FileText size={18} strokeWidth={2.2}/></div><div><h1 className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A] leading-none">Approval</h1><p className="text-xs text-[#64748B] mt-1">PO PENDING (&gt;50jt) wajib approve di sini, baru lanjut GRN</p></div></div>

      <nav className="flex flex-wrap items-center gap-1 p-1 bg-[#F1F5F9] border rounded-full w-fit shadow-sm">
        {[
          {label:'PR',sub:'Request',to:'/purchase/requests'},
          {label:'RFQ',sub:'Quotation',to:'/purchase/rfqs'},
          {label:'PO',sub:'Order',to:'/purchase/orders'},
          {label:'Approval',sub:'Step 4',active:true,to:'/approvals'},
          {label:'GRN',sub:'Receipt',to:'/purchase/receipts'},
          {label:'3-way',sub:'Matching',to:'/purchase/receipts'},
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

      <div className="flex gap-2"><button onClick={()=>setTab('PENDING')} className={"h-8 px-3.5 rounded-full text-xs font-bold border whitespace-nowrap shrink-0 "+(tab==='PENDING'?"bg-[#1E40AF] text-white border-[#1E40AF]":"bg-white border-[#E2E8F0]")}>Pending</button><button onClick={()=>setTab('APPROVED')} className={"h-8 px-3.5 rounded-full text-xs font-bold border whitespace-nowrap shrink-0 "+(tab==='APPROVED'?"bg-emerald-600 text-white border-emerald-600":"bg-white border-[#E2E8F0]")}>Approved</button><button onClick={()=>setTab('REJECTED')} className={"h-8 px-3.5 rounded-full text-xs font-bold border whitespace-nowrap shrink-0 "+(tab==='REJECTED'?"bg-red-600 text-white border-red-600":"bg-white border-[#E2E8F0]")}>Rejected</button></div>

      <div className="space-y-2">
        {tab==='PENDING' && (
          <div className="bg-amber-50 border border-amber-200 rounded-[16px] p-3">
            <div className="text-xs font-black text-amber-800">PO perlu Approval — PENDING (&gt;Rp 50jt) • {poPending.length} item</div>
            <p className="text-[11px] text-amber-700 mt-0.5">Approve di sini → otomatis APPROVED → lanjut <b>Step 5 GRN</b> di Receipt. PO &lt;50jt auto APPROVED langsung, tidak lewat sini.</p>
            <div className="space-y-2 mt-3">{poPending.length===0 ? <div className="text-xs text-[#94A3B8] bg-white border rounded-xl p-3 text-center">Tidak ada PO PENDING — semua PO kecil (&lt;50jt) auto approved, atau sudah di-approve. Cek di PO / Receipt.</div> : poPending.map(po=>(
              <div key={po.id} className="bg-white rounded-xl border p-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                <div><div className="font-bold text-sm">{po.po_number} • {po.supplier_name}</div><div className="text-xs text-[#64748B]">{po.po_date?.slice(0,10)} • Rp {new Intl.NumberFormat('id-ID').format(po.total)}</div><div className="text-[11px] text-emerald-700 font-semibold">→ setelah approve: ke GRN untuk terima barang</div></div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={()=>approvePO(po)} className="px-4 py-1.5 bg-[#1E40AF] text-white rounded-full text-xs font-bold hover:bg-blue-800">Approve PO</button>
                  <button onClick={()=>nav('/purchase/orders')} className="px-3 py-1.5 bg-white border rounded-full text-xs">Lihat PO</button>
                </div>
              </div>
            ))}</div>
            {poPending.length>0 && <button onClick={()=>nav('/purchase/receipts')} className="mt-2 w-full h-9 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700">Ke Step 5 — GRN Receipt →</button>}
          </div>
        )}

        {(Array.isArray(data)?data:[]).map((a)=>(
          <div key={a.id} className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm p-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
            <div><div className="font-bold text-sm">{a.entity_type} #{a.entity_id}</div><div className="text-xs text-[#64748B]">Requester {a.requester_name} → Approver {a.approver_name} {a.delegated_name? '→ delegate '+a.delegated_name:''} • Level {a.level}</div><div className="text-xs text-[#94A3B8]">{a.requested_at?.slice(0,16)} {a.responded_at? '→ '+a.responded_at.slice(0,16):''} {a.notes? '• '+a.notes:''}</div></div>
            <div className="flex gap-1 items-center flex-wrap"><Badge status={a.status}/>{a.status==='PENDING' && <>
              <button onClick={async()=>{ await api.post('/approvals/'+a.id+'/approve'); load(); }} className="px-3 py-1 bg-emerald-600 text-white rounded-full text-xs font-bold">Approve</button>
              <button onClick={async()=>{ const n=prompt('Alasan reject'); await api.post('/approvals/'+a.id+'/reject',{notes:n}); load(); }} className="px-3 py-1 bg-red-600 text-white rounded-full text-xs font-bold">Reject</button>
              <button onClick={async()=>{ const to=prompt('Delegate ke user id'); if(!to) return; await api.post('/approvals/'+a.id+'/delegate',{delegated_to: parseInt(to)}); load(); }} className="px-3 py-1 bg-white border rounded-full text-xs">Delegate</button>
            </>}</div>
          </div>
        ))}
        {tab==='PENDING' && data.length===0 && poPending.length===0 && <div className="text-center py-6 text-[#94A3B8] text-sm">Tidak ada approval general — PO PENDING juga kosong.</div>}
        {tab!=='PENDING' && data.length===0 && <div className="text-center py-12 text-[#94A3B8] text-sm">Tidak ada approval {tab.toLowerCase()}</div>}
      </div>

      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm p-4">
        <h3 className="font-bold text-sm">Buat Request Test</h3>
        <form onSubmit={async e=>{ e.preventDefault(); const fd=new FormData(e.target); await api.post('/approvals/request',{entity_type:fd.get('entity_type'), entity_id: parseInt(fd.get('entity_id')), approver_id: parseInt(fd.get('approver_id'))}); load(); }} className="flex flex-wrap gap-2 mt-2">
          <select name="entity_type" className="h-9 px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs"><option value="SALES_ORDER">SALES_ORDER</option><option value="PURCHASE_ORDER">PURCHASE_ORDER</option></select>
          <input name="entity_id" placeholder="ID" className="w-20 h-9 border rounded-lg px-2 text-xs"/>
          <input name="approver_id" placeholder="Approver id" className="w-32 h-9 border rounded-lg px-2 text-xs"/>
          <button className="h-9 px-4 bg-[#1E40AF] text-white rounded-lg text-xs font-bold">Request</button>
        </form>
      </div>
    </div>
  )
}
