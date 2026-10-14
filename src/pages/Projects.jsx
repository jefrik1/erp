
import { useEffect, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import api from '../lib/api';
import { Badge } from '../components/Layout';
function rupiah(n){ return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n||0); }
export default function Projects(){
  const [data,setData]=useState([]); const [show,setShow]=useState(false); const [customers,setCustomers]=useState([]);
  const [form,setForm]=useState({name:'', customer_id:'', contract_value:'', start_date:'', end_date:'', location:'', pic_name:'', retention_pct:5});
  const [detail,setDetail]=useState(null);
  const load=()=> api.get('/projects').then(r=>setData(r.data)).catch(()=>setData([]));
  useEffect(()=>{ load(); api.get('/master/customers',{params:{limit:100}}).then(r=>setCustomers(r.data.data)); },[]);
  const create=async(e)=>{
    e.preventDefault();
    const r=await api.post('/projects',{...form, customer_id: parseInt(form.customer_id)||null, contract_value: parseFloat(form.contract_value)||0, retention_pct: parseFloat(form.retention_pct)});
    setShow(false); load(); setDetail(null);
  };
  const open=async(id)=>{
    const r=await api.get('/projects/'+id);
    setDetail(r.data);
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between gap-3 items-end"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white grid place-items-center shrink-0 shadow-sm"><FileText size={18} strokeWidth={2.2}/></div><div className="min-w-0 flex-1"><h1 className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A] leading-none">Proyek & Tender</h1><p className="text-xs text-[#64748B] mt-1">Master proyek • Termin • RAB vs Realisasi • Dokumen • Harga khusus proyek</p></div></div><button onClick={()=>setShow(true)} className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-[#1E3A8A] active:scale-[0.98] transition">+ Proyek</button></div>
      <div className="grid md:grid-cols-3 gap-4">
        {(Array.isArray(data)?data:[]).map((p,idx)=>(
          <div key={p.id} onClick={()=>open(p.id)} className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-5 cursor-pointer hover:shadow-lg transition">
            <div className="flex flex-wrap justify-between gap-3 items-start"><span className="font-mono text-xs font-bold bg-gray-100 border px-2 py-1 rounded-full">{p.project_code}</span><Badge status={p.status}/></div>
            <div className="font-bold mt-3 leading-tight">{p.name}</div>
            <div className="text-xs text-[#64748B]">{p.customer_name} • {p.location?.slice(0,30)}</div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="bg-[#F1F5F9] border rounded-xl p-2"><div className="text-[#64748B]">Nilai Kontrak</div><div className="font-black">{rupiah(p.contract_value)}</div></div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-2"><div className="text-blue-700">Terbayar</div><div className="font-black">{rupiah(p.paid_amount||0)}</div></div>
            </div>
            <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-[#1E40AF]" style={{width: Math.min(100, (parseFloat(p.paid_amount||0)/parseFloat(p.contract_value||1)*100))+'%'}}/></div>
            <div className="text-xs text-[#64748B]">{p.start_date?.slice(0,10)} → {p.end_date?.slice(0,10)} • Retensi {p.retention_pct}%</div>
          </div>
        ))}
      </div>
      {detail && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"><div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-white border-b p-5 flex justify-between items-start">
          <div><div className="font-mono text-xs font-bold">{detail.project_code} <Badge status={detail.status}/></div><div className="font-black text-lg">{detail.name}</div><div className="text-xs text-[#64748B]">{detail.customer_name} • {detail.location}</div><div className="text-sm mt-1">Nilai {rupiah(detail.contract_value)} • {detail.start_date?.slice(0,10)} → {detail.end_date?.slice(0,10)} • PIC {detail.pic_name}</div></div>
          <button onClick={()=>setDetail(null)} className="px-3 py-1 border rounded-full">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="font-bold">Termin Pembayaran</div>
          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-xs"><thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><th className="px-4 py-3.5">TERMIN</th><th className="px-4 py-3.5">DESKRIPSI</th><th className="px-4 py-3.5 text-right">%</th><th className="px-4 py-3.5 text-right">NILAI</th><th className="px-4 py-3.5">DUE</th><th className="px-4 py-3.5">STATUS</th></tr></thead><tbody>
              {detail.terms?.map(t=>(
                <tr key={t.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition bg-white"><td className="p-2 text-center">{t.term_number}</td><td className="px-4 py-3.5">{t.description}</td><td className="px-4 py-3.5 text-right">{t.percentage}%</td><td className="p-2 text-right font-bold">{rupiah(t.amount)}</td><td className="p-2 text-center">{t.due_date?.slice(0,10)}</td><td className="p-2 text-center"><Badge status={t.status}/></td></tr>
              ))}
            </tbody></table>
          </div>
          <div className="font-bold">RAB vs Realisasi</div>
          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-xs"><thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><th className="p-2 text-left">PRODUK</th><th className="px-4 py-3.5 text-right">RENCANA</th><th className="px-4 py-3.5 text-right">REALISASI</th><th className="px-4 py-3.5 text-right">SELISIH</th></tr></thead><tbody>
              {detail.rab?.map(r=>(
                <tr key={r.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition bg-white"><td className="px-4 py-3.5">{r.product_name}</td><td className="px-4 py-3.5 text-right">{r.qty_planned} / {rupiah(r.amount_planned)}</td><td className="px-4 py-3.5 text-right">{r.qty_actual} / {rupiah(r.amount_actual)}</td><td className="px-4 py-3.5 text-right"><span className={(r.amount_actual>r.amount_planned? 'text-red-600':'text-emerald-600')}>{rupiah(r.amount_actual - r.amount_planned)}</span></td></tr>
              ))}
            </tbody></table>
          </div>
          <div className="font-bold">Harga Khusus Proyek</div>
          <div className="text-xs text-[#64748B]">{detail.prices?.length? detail.prices.map(p=> p.product_name+': '+rupiah(p.price)).join(' • ') : 'Belum ada harga khusus'}</div>
          <div className="font-bold">Dokumen</div>
          <div className="flex gap-2 flex-wrap text-xs">{detail.documents?.map(d=> <span key={d.id} className="px-2 py-1 bg-gray-100 border rounded-full">{d.doc_type}: {d.doc_number}</span>)} {(!detail.documents||!detail.documents.length) && <span className="text-[#94A3B8]">Belum ada dokumen</span>}</div>
        </div>
      </div></div>}
      {show && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"><form onSubmit={create} className="bg-white rounded-2xl p-6 w-full max-w-lg space-y-3">
        <h3 className="font-bold">Buat Proyek</h3>
        <input required placeholder="Nama proyek" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="w-full h-[42px] pl-3 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"/>
        <select value={form.customer_id} onChange={e=>setForm({...form,customer_id:e.target.value})} className="w-full h-[42px] pl-3 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"><option value="">Pilih customer (kontraktor)</option>{customers.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" placeholder="Nilai kontrak" value={form.contract_value} onChange={e=>setForm({...form,contract_value:e.target.value})} className="h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF]"/>
          <input type="number" placeholder="Retensi %" value={form.retention_pct} onChange={e=>setForm({...form,retention_pct:e.target.value})} className="h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF]"/>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})} className="h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF]"/>
          <input type="date" value={form.end_date} onChange={e=>setForm({...form,end_date:e.target.value})} className="h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF]"/>
        </div>
        <input placeholder="Lokasi" value={form.location} onChange={e=>setForm({...form,location:e.target.value})} className="w-full h-[42px] pl-3 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"/>
        <input placeholder="PIC proyek" value={form.pic_name} onChange={e=>setForm({...form,pic_name:e.target.value})} className="w-full h-[42px] pl-3 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"/>
        <div className="flex justify-end gap-2"><button type="button" onClick={()=>setShow(false)} className="h-[42px] px-5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-semibold text-[#334155] hover:bg-[#F8FAFC] active:scale-[0.98] transition">Batal</button><button className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-[#1E3A8A] active:scale-[0.98] transition">Simpan</button></div>
      </form></div>}
    </div>
  )
}
