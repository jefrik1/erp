
import { useEffect, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import api from '../lib/api';
import { Badge } from '../components/Layout';
import { useDialog } from '../components/DialogProvider';
export default function LandedCosts(){
  const dialog=useDialog();
  const [data,setData]=useState([]); const [show,setShow]=useState(false); const [pos,setPos]=useState([]); const [grns,setGrns]=useState([]);
  const [form,setForm]=useState({po_id:'', grn_id:'', container_no:'', bl_number:'', pib_number:'', allocation_method:'VALUE', details:[{cost_type:'FREIGHT', amount:15000000, currency:'IDR'}]});
  const load=()=> api.get('/landed-costs').then(r=>setData(r.data)).catch(()=>setData([]));
  useEffect(()=>{ load(); api.get('/purchase/orders').then(r=>setPos(r.data.data)); api.get('/purchase/receipts').then(r=>setGrns(r.data)); },[]);
  const submit=async(e)=>{
    e.preventDefault();
    const r=await api.post('/landed-costs',{po_id: parseInt(form.po_id), grn_id: parseInt(form.grn_id)||null, container_no:form.container_no, bl_number:form.bl_number, pib_number:form.pib_number, allocation_method:form.allocation_method, details: form.details.map(d=>({cost_type:d.cost_type, description:d.cost_type, amount: parseFloat(d.amount), currency:d.currency, exchange_rate:1, amount_idr: parseFloat(d.amount)}))});
    await dialog.alert('Landed cost dibuat — total '+new Intl.NumberFormat('id-ID').format(r.data.total_cost), {title:'Landed Cost'});
    setShow(false); load();
  };
  const calc=async(id)=>{
    const r=await api.post('/landed-costs/'+id+'/calculate');
    await dialog.alert('Alokasi: '+r.data.allocations.length+' items • total '+new Intl.NumberFormat('id-ID').format(r.data.totalCost)+' • per unit update avg_cost', {title:'Kalkulasi'});
    load();
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between gap-3 items-end"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white grid place-items-center shrink-0 shadow-sm"><FileText size={18} strokeWidth={2.2}/></div><div className="min-w-0 flex-1"><h1 className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A] leading-none">Landed Cost & Import</h1><p className="text-xs text-[#64748B] mt-1">Freight • Asuransi • Bea masuk • PPh22 • Clearance • Trucking — alokasi proporsional VALUE/WEIGHT/VOLUME</p></div></div><button onClick={()=>setShow(true)} className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-[#1E3A8A] active:scale-[0.98] transition">+ Landed Cost</button></div>
      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><th className="text-left px-4 py-3 whitespace-nowrap">LC</th><th className="text-left px-4 py-3 whitespace-nowrap">PO</th><th className="text-left px-4 py-3 whitespace-nowrap">CONTAINER</th><th className="text-right px-4 py-3 whitespace-nowrap">TOTAL</th><th className="text-left px-4 py-3 whitespace-nowrap">METODE</th><th className="text-left px-4 py-3 whitespace-nowrap">STATUS</th><th></th></tr></thead><tbody>{(Array.isArray(data)?data:[]).map((l,idx)=>(
          <tr key={l.id} className={"border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition "+(idx%2===1?"bg-[#F8FAFC]/70":"bg-white")}><td className="px-4 py-3.5 font-mono text-xs font-bold"># {l.id}</td><td className="px-4 py-3.5">{l.po_number}</td><td className="px-4 py-3.5 text-xs">{l.container_no||'-'} • BL {l.bl_number||'-'}</td><td className="px-4 py-3.5 text-right font-bold">{new Intl.NumberFormat('id-ID').format(l.total_cost)}</td><td className="px-4 py-3.5 text-center text-xs">{l.allocation_method}</td><td className="px-4 py-3.5 text-center"><Badge status={l.status}/></td><td className="px-4 py-3.5">{l.status!=='CALCULATED' && <button onClick={()=>calc(l.id)} className="text-xs px-2 py-1 bg-amber-500 text-white rounded-full">Kalkulasi</button>}</td></tr>
        ))}{data.length===0 && <tr><td colSpan={7} className="p-6 text-center text-[#94A3B8]">Belum ada landed cost</td></tr>}</tbody></table></div>
      </div>
      {show && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"><form onSubmit={submit} className="bg-white rounded-2xl p-6 w-full max-w-lg space-y-3 max-h-[90vh] overflow-auto">
        <h3 className="font-bold">Buat Landed Cost</h3>
        <select required value={form.po_id} onChange={e=>setForm({...form,po_id:e.target.value})} className="w-full h-[42px] pl-3 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"><option value="">Pilih PO import</option>{pos.map(p=> <option key={p.id} value={p.id}>{p.po_number} • {p.supplier_name}</option>)}</select>
        <select value={form.grn_id} onChange={e=>setForm({...form,grn_id:e.target.value})} className="w-full h-[42px] pl-3 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"><option value="">Pilih GRN (opsional)</option>{grns.map(g=> <option key={g.id} value={g.id}>{g.grn_number}</option>)}</select>
        <div className="grid grid-cols-3 gap-2">
          <input placeholder="Container No" value={form.container_no} onChange={e=>setForm({...form,container_no:e.target.value})} className="h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF]"/>
          <input placeholder="BL No" value={form.bl_number} onChange={e=>setForm({...form,bl_number:e.target.value})} className="h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF]"/>
          <input placeholder="PIB No" value={form.pib_number} onChange={e=>setForm({...form,pib_number:e.target.value})} className="h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF]"/>
        </div>
        <select value={form.allocation_method} onChange={e=>setForm({...form,allocation_method:e.target.value})} className="w-full h-[42px] pl-3 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"><option value="VALUE">Alokasi by Nilai</option><option value="WEIGHT">By Berat</option><option value="VOLUME">By Volume</option></select>
        {form.details.map((d,i)=>(
          <div key={i} className="flex gap-2 items-center"><select value={d.cost_type} onChange={e=>{ const c=[...form.details]; c[i].cost_type=e.target.value; setForm({...form,details:c}); }} className="h-8 border rounded-lg px-2 text-xs"><option>FREIGHT</option><option>INSURANCE</option><option>DUTY</option><option>TAX</option><option>CLEARANCE</option><option>TRUCKING</option><option>HANDLING</option><option>OTHER</option></select><input type="number" value={d.amount} onChange={e=>{ const c=[...form.details]; c[i].amount=e.target.value; setForm({...form,details:c}); }} className="flex-1 h-8 border rounded-lg px-2 text-right"/><button type="button" onClick={()=> setForm({...form, details:form.details.filter((_,idx)=>idx!==i)})} className="text-red-600 text-xs">✕</button></div>
        ))}
        <button type="button" onClick={()=> setForm({...form, details:[...form.details, {cost_type:'OTHER', amount:0, currency:'IDR'}]})} className="text-xs px-3 py-1 border rounded-full">+ Biaya</button>
        <div className="text-xs text-[#64748B]">Dokumen: PIB, BL, packing list, COO • Kurs USD dicatat jika perlu.</div>
        <div className="flex justify-end gap-2"><button type="button" onClick={()=>setShow(false)} className="h-[42px] px-5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-semibold text-[#334155] hover:bg-[#F8FAFC] active:scale-[0.98] transition">Batal</button><button className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-[#1E3A8A] active:scale-[0.98] transition">Simpan</button></div>
      </form></div>}
    </div>
  )
}
