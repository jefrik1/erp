import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import api from '../lib/api';
import { useDialog } from '../components/DialogProvider';
export default function RFQs(){
  const nav=useNavigate(); const dialog=useDialog();
  const [data,setData]=useState([]); const [suppliers,setSuppliers]=useState([]);
  const [sel,setSel]=useState(null); const [qs,setQs]=useState([]);
  const [add,setAdd]=useState({supplier_id:'',unit_price:'',lead_days:3});
  const load=()=> api.get('/purchase/rfqs').then(r=>setData(r.data?.data ?? r.data ?? [])).catch(()=>setData([]));
  const loadDetail=async(id)=>{
    const r=await api.get('/purchase/rfqs/'+id); setSel(r.data); setQs(r.data.quotations||[]);
  };
  useEffect(()=>{ load(); api.get('/master/suppliers').then(r=>setSuppliers(r.data.data)); },[]);
  const createRfq=async()=>{
    const r=await api.post('/purchase/rfqs',{}); await dialog.alert('RFQ '+r.data.rfq_number,{title:'RFQ Dibuat'}); load();
  };
  const addQuote=async(e)=>{
    e.preventDefault();
    await api.post('/purchase/rfqs/'+sel.id+'/quotations',{supplier_id:parseInt(add.supplier_id),unit_price:parseFloat(add.unit_price),lead_days:parseInt(add.lead_days)});
    await dialog.alert('Penawaran ditambahkan',{title:'Sukses'}); loadDetail(sel.id); load();
  };
  const selectWinner=async(qid)=>{
    try{
      const r=await api.post('/purchase/rfqs/'+sel.id+'/select-winner',{quotation_id:qid});
      await dialog.alert('Winner dipilih → PO '+r.data.po_number+' ('+r.data.status+')',{title:'Sukses'});
      nav('/purchase/orders');
    }catch(err){ await dialog.alert(err.response?.data?.error||err.message,{title:'Gagal'}); }
  };
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white grid place-items-center"><FileText size={18}/></div><h1 className="text-[20px] font-black text-[#0F172A]">RFQ — Quotation</h1></div>
          <nav className="mt-2 flex flex-wrap items-center gap-1 p-1 bg-[#F1F5F9] border rounded-full w-fit shadow-sm">
            {[
              {label:'PR',sub:'Purchase Request',to:'/purchase/requests'},
              {label:'RFQ',sub:'Quotation',to:'/purchase/rfqs',active:true},
              {label:'PO',sub:'Order',to:'/purchase/orders'},
              {label:'Approval',sub:'Berjenjang',to:'/approvals'},
              {label:'GRN',sub:'Receipt',to:'/purchase/receipts'},
              {label:'3-way',sub:'Matching',to:'/purchase/receipts'},
            ].map((s,i,arr)=>(
              <span key={s.label} className="flex items-center gap-1">
                <button onClick={()=>nav(s.to)} className={"inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black border "+(s.active?"bg-[#1E40AF] text-white border-[#1E40AF]":"bg-white text-gray-700 border-gray-200")}>
                  <span className={"w-5 h-5 grid place-items-center rounded-full text-[10px] font-black "+(s.active?"bg-white/20 text-white":"bg-gray-900 text-white")}>{i+1}</span>
                  {s.label} <span className="hidden lg:inline text-[10px] opacity-60 font-semibold">{s.sub}</span>
                </button>
                {i<arr.length-1 && <span className="text-[#94A3B8]">›</span>}
              </span>
            ))}
          </nav>
        </div>
        <button onClick={createRfq} className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl text-sm font-bold">+ Buat RFQ</button>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-[20px] border shadow-sm overflow-hidden">
          <div className="overflow-auto"><table className="w-full text-sm">
            <thead><tr className="bg-[#F1F5F9] border-y text-[11px] font-bold tracking-widest text-[#64748B]"><th className="text-left px-4 py-3">RFQ</th><th className="text-left px-4 py-3">PR / PRODUK</th><th className="text-left px-4 py-3">STATUS</th><th/></tr></thead>
            <tbody>{data.map(r=>(
              <tr key={r.id} className={"border-b hover:bg-[#F8FAFC] cursor-pointer "+(sel?.id===r.id?"bg-blue-50":"")} onClick={()=>loadDetail(r.id)}>
                <td className="px-4 py-3 font-mono text-xs font-bold">{r.rfq_number}</td>
                <td className="px-4 py-3 text-xs">{r.pr_number||'—'} • {r.product_name||'—'} {r.pr_qty?`x${r.pr_qty}`:''}</td>
                <td className="px-4 py-3"><span className="text-xs px-2 py-1 rounded-full border bg-white font-bold">{r.status}</span></td>
                <td className="px-4 py-3 text-right"><button className="text-xs text-[#1E40AF] font-bold">Lihat</button></td>
              </tr>
            ))}{data.length===0 && <tr><td colSpan={4} className="p-6 text-center text-sm text-[#94A3B8]">Belum ada RFQ — buat dari PR atau + Buat RFQ</td></tr>}</tbody>
          </table></div>
        </div>

        <div className="bg-white rounded-[20px] border shadow-sm p-4 space-y-3">
          {!sel ? <div className="text-sm text-[#94A3B8] p-6 text-center">Pilih RFQ di kiri untuk kelola penawaran</div> : (
            <>
              <div className="flex justify-between items-start"><div><div className="font-black">{sel.rfq_number} — {sel.status}</div><div className="text-xs text-[#64748B]">{sel.pr_number?`PR ${sel.pr_number} • `:''}{sel.product_name} • qty {sel.pr_qty}</div></div><span className={"text-xs px-2 py-1 rounded-full border font-bold "+(sel.status==='OPEN'?"bg-emerald-50 border-emerald-200 text-emerald-700":sel.status==='SELECTED'?"bg-blue-50 border-blue-200":"bg-gray-100")}>{sel.status}</span></div>

              {sel.status==='OPEN' && (
                <form onSubmit={addQuote} className="border rounded-xl p-3 space-y-2 bg-[#F8FAFC]">
                  <div className="text-xs font-bold">+ Tambah Penawaran Supplier</div>
                  <div className="grid grid-cols-3 gap-2">
                    <select required value={add.supplier_id} onChange={e=>setAdd({...add,supplier_id:e.target.value})} className="h-9 border rounded-lg px-2 text-sm"><option value="">Supplier</option>{suppliers.map(s=> <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                    <input required type="number" value={add.unit_price} onChange={e=>setAdd({...add,unit_price:e.target.value})} className="h-9 border rounded-lg px-2 text-sm" placeholder="Harga / unit"/>
                    <input type="number" value={add.lead_days} onChange={e=>setAdd({...add,lead_days:e.target.value})} className="h-9 border rounded-lg px-2 text-sm" placeholder="Lead days"/>
                  </div>
                  <button className="h-9 px-4 bg-[#0F172A] text-white rounded-full text-xs font-bold">Tambah</button>
                </form>
              )}

              <div className="space-y-2">
                {qs.map(q=>(
                  <div key={q.id} className={"flex justify-between items-center p-3 border rounded-xl "+(q.is_winner?"bg-blue-50 border-blue-200":"bg-white")}>
                    <div><div className="font-bold text-sm">{q.supplier_name} {q.is_winner && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-[#1E40AF] text-white">WINNER</span>}</div><div className="text-xs text-[#64748B]">Rp {new Intl.NumberFormat('id-ID').format(q.unit_price)} • {q.lead_days||'-'} hari</div></div>
                    {sel.status==='OPEN' && !q.is_winner && <button onClick={()=>selectWinner(q.id)} className="h-8 px-3 bg-[#1E40AF] text-white rounded-full text-xs font-bold">Pilih Winner → PO</button>}
                  </div>
                ))}
                {qs.length===0 && <div className="text-xs text-[#94A3B8] text-center py-4">Belum ada penawaran — tambah di atas lalu bandingkan harga terendah</div>}
              </div>

              {sel.status==='SELECTED' && <div className="text-xs bg-blue-50 border border-blue-200 rounded-xl p-3 text-[#1E40AF] font-semibold">Winner sudah dipilih — PO otomatis terbuat. Lihat di <button onClick={()=>nav('/purchase/orders')} className="underline">Purchase Orders</button></div>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
