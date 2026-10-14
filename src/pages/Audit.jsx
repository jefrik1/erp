
import { useEffect, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import api from '../lib/api';
import { Badge } from '../components/Layout';
export default function Audit(){
  const [logs,setLogs]=useState([]); const [changes,setChanges]=useState([]); const [fraud,setFraud]=useState(null); const [seg,setSeg]=useState([]);
  const load=()=>{ api.get('/audit/logs').then(r=>setLogs(r.data)); api.get('/audit/data-changes').then(r=>setChanges(r.data)); api.get('/audit/fraud').then(r=>setFraud(r.data)); api.get('/audit/segregation').then(r=>setSeg(r.data)); };
  useEffect(()=>{load()},[]);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white grid place-items-center shrink-0 shadow-sm"><FileText size={18} strokeWidth={2.2}/></div><div><h1 className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A] leading-none">Audit Trail & GRC</h1></div></div>
      <p className="text-xs text-[#64748B]">Siapa ubah apa kapan dari IP mana • Segregation of duties • Fraud detection</p>
      {fraud && <div className="grid grid-cols-3 gap-3"><div className="bg-white rounded-xl border p-4 text-center"><div className="text-lg font-black text-red-600">{fraud.big_discount?.length||0}</div><div className="text-xs">Diskon besar &gt;20%</div></div><div className="bg-white rounded-xl border p-4 text-center"><div className="text-lg font-black text-amber-600">{fraud.night_transactions?.length||0}</div><div className="text-xs">Transaksi 00-05</div></div><div className="bg-white rounded-xl border p-4 text-center"><div className="text-lg font-black">{fraud.alerts||0}</div><div className="text-xs">Total alerts</div></div></div>}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-4"><h3 className="font-bold">Audit Logs (transaksi)</h3><div className="max-h-[300px] overflow-auto mt-3 space-y-1">{logs.slice(0,15).map(l=>(
          <div key={l.id} className="p-2 border rounded-lg bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><div className="font-bold">{l.action} {l.entity_type} #{l.entity_id} by {l.username||l.user_id} • {l.created_at?.slice(0,16)}</div><div className="text-[#64748B] truncate">{JSON.stringify(l.new_value||l.old_value||'').slice(0,120)}</div></div>
        ))}</div></div>
        <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-4"><h3 className="font-bold">Data Change Logs (master)</h3><div className="max-h-[300px] overflow-auto mt-3 space-y-1">{changes.slice(0,15).map(c=>(
          <div key={c.id} className="p-2 border rounded-lg bg-amber-50 text-xs"><div className="font-bold">{c.table_name} #{c.record_id} • {c.field_name} • by {c.changed_by_name||c.changed_by}</div><div><span className="line-through text-red-600">{String(c.old_value||'').slice(0,40)}</span> → <span className="text-emerald-700">{String(c.new_value||'').slice(0,40)}</span></div><div className="text-[#64748B]">{c.reason||''} • {c.changed_at?.slice(0,16)}</div></div>
        ))}{changes.length===0 && <div className="text-xs text-[#94A3B8]">Belum ada perubahan master tercatat</div>}</div></div>
      </div>
      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-4"><h3 className="font-bold">Segregation of Duties — Pelanggaran (buat & approve sendiri)</h3><div className="mt-3 text-xs">{seg.length? seg.map(s=> <div key={s.doc} className="p-2 border rounded-lg bg-red-50 border-red-200">{s.type} {s.doc} — creator {s.created_by} = approver {s.approved_by}</div>) : <span className="text-emerald-700">✓ Tidak ada pelanggaran</span>}</div></div>
    </div>
  )
}
