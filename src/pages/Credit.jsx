import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import api from '../lib/api';
import { Badge } from '../components/Layout';
import { useDialog } from '../components/DialogProvider';
export default function Credit(){
  const dialog=useDialog();
  const [holds,setHolds]=useState([]); const [promises,setPromises]=useState([]); const [reminders,setReminders]=useState([]);
  const [check,setCheck]=useState({customer_id:'', result:null}); const [customers,setCustomers]=useState([]);
  const [invoices,setInvoices]=useState([]);
  const [newP,setNewP]=useState({customer_id:'', invoice_id:'', promise_date:'', amount:''});
  const load=()=>{ api.get('/credit/holds').then(r=>setHolds(r.data)).catch(()=>{}); api.get('/credit/promises').then(r=>setPromises(r.data)).catch(()=>{}); api.get('/credit/reminders').then(r=>setReminders(r.data)).catch(()=>{}); };
  useEffect(()=>{ load(); api.get('/master/customers',{params:{limit:100}}).then(r=>setCustomers(r.data.data||r.data)).catch(()=>{}); api.get('/sales/invoices',{params:{limit:50, page:1}}).then(r=>setInvoices(r.data.data||r.data||[])).catch(()=>{}); },[]);
  const doCheck=async()=>{ if(!check.customer_id) return; const r=await api.get('/credit/check/'+check.customer_id); setCheck({...check, result:r.data}); };
  const doHold=async()=>{ if(!check.customer_id) return; const reason=prompt('Alasan HOLD?')||'Over limit'; try{ await api.post('/credit/hold',{customer_id:parseInt(check.customer_id), reason}); await dialog.alert('Customer di-HOLD',{title:'Sukses'}); load(); doCheck(); }catch(e){ await dialog.alert(e.response?.data?.error||e.message,{title:'Gagal'}); } };
  const doUnhold=async(id)=>{ const ok=await dialog.confirm('Buka blokir? Hanya Direktur',{title:'Buka Blokir'}); if(!ok) return; try{ await api.post('/credit/unhold',{customer_id:id}); load(); }catch(e){ await dialog.alert(e.response?.data?.error||e.message,{title:'Gagal'}); } };
  const setPromiseStatus=async(id,status)=>{ await api.patch('/credit/promises/'+id,{status}); load(); };
  const sendWa=async(invNo)=>{ await api.post('/credit/reminders/send',{invoice_number: invNo}); await dialog.alert('WA terkirim (mock) '+invNo,{title:'Terkirim'}); load(); };
  const createPromise=async()=>{ if(!newP.customer_id||!newP.promise_date||!newP.amount) return dialog.alert('Customer, tanggal janji, nominal wajib',{title:'Lengkapi'}); await api.post('/credit/promises',{customer_id:parseInt(newP.customer_id), invoice_id: newP.invoice_id? parseInt(newP.invoice_id): null, promise_date: newP.promise_date, amount: parseFloat(newP.amount), notes:''}); setNewP({customer_id:'',invoice_id:'',promise_date:'',amount:''}); load(); };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white grid place-items-center shrink-0 shadow-sm"><FileText size={18} strokeWidth={2.2}/></div><div><h1 className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A] leading-none">Kontrol Piutang Ketat</h1></div></div>
      <p className="text-xs text-[#64748B]">Credit limit • Hold (hanya Direktur buka) • Promise to pay • Dunning letter • Reminder WA H-7/H-3/H-1/H+1/H+7 — klik tombol untuk aksi.</p>
      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-4">
        <h3 className="font-bold">Cek Blokir Customer</h3>
        <div className="flex gap-2 mt-3">
          <select value={check.customer_id} onChange={e=>setCheck({...check, customer_id:e.target.value})} className="flex-1 h-10 border rounded-xl px-3 text-sm"><option value="">Pilih customer</option>{customers.map(c=> <option key={c.id} value={c.id}>{c.name} • limit {new Intl.NumberFormat('id-ID').format(c.credit_limit||0)}</option>)}</select>
          <button onClick={doCheck} className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl text-sm font-bold shadow-sm hover:bg-[#1E3A8A]">Cek</button>
        </div>
        {check.result && <div className={"mt-3 p-3 rounded-xl border "+(check.result.blocked?"bg-red-50 border-red-200":"bg-emerald-50 border-emerald-200")}>
          <div className="text-sm">Limit {new Intl.NumberFormat('id-ID').format(check.result.credit_limit)} • Outstanding {new Intl.NumberFormat('id-ID').format(check.result.outstanding)} • Usage {check.result.usage_pct}% {check.result.is_hold && <Badge status="ON_HOLD"/>}</div>
          {check.result.warning && <div className="text-xs text-red-700 mt-1">{check.result.warning}</div>}
          {!check.result.blocked && <div className="text-xs text-emerald-700">✓ Aman untuk jual</div>}
          {check.result.blocked && !check.result.is_hold && <button onClick={doHold} className="mt-2 text-xs px-3 py-1.5 bg-red-600 text-white rounded-full font-bold">Hold Customer</button>}
        </div>}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-4"><h3 className="font-bold">Customer di-HOLD</h3><div className="mt-3 space-y-2 max-h-[260px] overflow-auto">{holds.map(h=>(
          <div key={h.id} className="p-3 border rounded-xl bg-red-50 border-red-200"><div className="font-bold text-sm">{h.name}</div><div className="text-xs text-red-700">{h.hold_reason||'—'}</div><button onClick={()=>doUnhold(h.id)} className="mt-2 text-xs px-3 py-1 bg-white border rounded-full font-bold hover:bg-[#F8FAFC]">Buka Blokir (Direktur)</button></div>
        ))}{holds.length===0 && <div className="text-xs text-[#94A3B8]">Tidak ada hold — customer melebihi limit otomatis butuh approval.</div>}</div></div>
        <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-4"><h3 className="font-bold">Promise to Pay</h3>
          <div className="flex flex-wrap gap-2 mt-3">
            <select value={newP.customer_id} onChange={e=>setNewP({...newP,customer_id:e.target.value})} className="h-9 border rounded-xl px-2 text-xs flex-1 min-w-[120px]"><option value="">Customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <select value={newP.invoice_id} onChange={e=>setNewP({...newP,invoice_id:e.target.value})} className="h-9 border rounded-xl px-2 text-xs flex-1 min-w-[120px]"><option value="">Invoice (opsional)</option>{invoices.map(iv=><option key={iv.id} value={iv.id}>{iv.invoice_number} • {iv.status}</option>)}</select>
            <input type="date" value={newP.promise_date} onChange={e=>setNewP({...newP,promise_date:e.target.value})} className="h-9 border rounded-xl px-2 text-xs"/>
            <input type="number" placeholder="Nominal" value={newP.amount} onChange={e=>setNewP({...newP,amount:e.target.value})} className="h-9 border rounded-xl px-2 text-xs w-[120px]"/>
            <button onClick={createPromise} className="h-9 px-4 bg-[#0F172A] text-white rounded-xl text-xs font-bold">+ Janji</button>
          </div>
          <div className="max-h-[260px] overflow-auto mt-3"><table className="w-full text-xs"><thead><tr className="bg-[#F1F5F9] border-y text-[11px] font-bold tracking-widest text-[#64748B]"><th className="px-2 py-2 text-left">CUSTOMER</th><th className="px-2 py-2">JANJI</th><th className="px-2 py-2 text-right">NILAI</th><th className="px-2 py-2">STATUS</th><th className="px-2 py-2">AKSI</th></tr></thead><tbody>{promises.map(p=>(
          <tr key={p.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] bg-white"><td className="px-2 py-2">{p.customer_name}</td><td className="px-2 py-2 text-center">{String(p.promise_date||'').slice(0,10)}</td><td className="px-2 py-2 text-right font-bold">{new Intl.NumberFormat('id-ID').format(p.amount||0)}</td><td className="px-2 py-2 text-center"><Badge status={p.status}/></td><td className="px-2 py-2 text-center flex gap-1 justify-center">{String(p.status).toUpperCase()==='PENDING' && <><button onClick={()=>setPromiseStatus(p.id,'FULFILLED')} className="text-[10px] px-2 py-1 bg-emerald-600 text-white rounded-full font-bold">Lunas</button><button onClick={()=>setPromiseStatus(p.id,'BROKEN')} className="text-[10px] px-2 py-1 bg-red-600 text-white rounded-full font-bold">Gagal</button></>}</td></tr>
        ))}{promises.length===0 && <tr><td colSpan={5} className="text-center py-4 text-[#94A3B8]">Belum ada janji</td></tr>}</tbody></table></div></div>
      </div>
      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-4"><h3 className="font-bold">Reminder WA Otomatis — Preview</h3><p className="text-[11px] text-[#94A3B8]">H-7/H-3/H-1/H+1/H+7 dari due_date Aging • Klik Kirim WA untuk dunning level 1</p><div className="mt-3 space-y-1 text-xs">{reminders.map((r,i)=> <div key={i} className="flex justify-between items-center p-2 bg-[#F1F5F9] border rounded-lg"><span className="truncate pr-2">{r.customer_name} • {r.invoice_number} • {String(r.due_date||'').slice(0,10)} ({r.diff} hari)</span><span className="flex items-center gap-2 shrink-0"><span className="px-2 py-1 bg-emerald-600 text-white rounded-full text-[10px] font-bold">{r.template}</span><button onClick={()=>sendWa(r.invoice_number)} className="px-2 py-1 bg-[#0F172A] text-white rounded-full text-[10px] font-bold">Kirim WA</button></span></div>)}{reminders.length===0 && <div className="text-[#94A3B8]">Tidak ada reminder hari ini — aging belum masuk window H-7/3/1.</div>}</div></div>
    </div>
  )
}
