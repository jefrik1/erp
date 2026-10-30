import { useCallback, useEffect, useState } from 'react';
import { Workflow, Plus, Save, Trash2, RefreshCw, Info } from 'lucide-react';
import api from '../lib/api';
import {
  PosPageHeader, PosCard, PosCardBody, PosBadge, PosEmpty, PosSkeleton, PosError,
  PosTh, posTr, posTd, posInput, posBtnPrimary, posBtnSecondary, PosSelect,
} from '../components/PosUI';
import { useDialog } from '../components/DialogProvider';

const MODULES = ['SALES_ORDER','PURCHASE_ORDER','WASTE','RETURN'];
const METRICS = ['DISCOUNT_PCT','VALUE','QTY'];

export default function ApprovalRules(){
  const dialog = useDialog();
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  const [draft,setDraft]=useState({});
  const [form,setForm]=useState({ module:'SALES_ORDER', metric:'DISCOUNT_PCT', threshold:'10', approver_roles:'direktur', notes:'' });
  const [busy,setBusy]=useState(false);

  const load = useCallback(async ()=>{
    setLoading(true); setErr('');
    try{ const r=await api.get('/approval-rules'); setRows(Array.isArray(r.data)?r.data:[]); }
    catch(e){ setErr(e.response?.data?.error||e.message||'Gagal memuat aturan'); }
    finally{ setLoading(false); }
  },[]);
  useEffect(()=>{ load(); },[load]);

  const save = async (row)=>{
    const val = draft[row.id];
    if(val==null || val==='') return;
    setBusy(true);
    try{ await api.put('/approval-rules/'+row.id, { threshold: Number(val) }); setDraft(p=>{const n={...p}; delete n[row.id]; return n;}); load(); }
    catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal menyimpan' }); }
    finally{ setBusy(false); }
  };
  const toggle = async (row)=>{
    try{ await api.put('/approval-rules/'+row.id, { active: !row.active }); load(); }
    catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal' }); }
  };
  const del = async (row)=>{
    const ok = await dialog.confirm(`Hapus aturan ${row.module}/${row.metric}?`, { title:'Hapus aturan', confirmText:'Ya, hapus' });
    if(!ok) return;
    try{ await api.delete('/approval-rules/'+row.id); load(); }
    catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal' }); }
  };
  const add = async ()=>{
    setBusy(true);
    try{ await api.post('/approval-rules', { ...form, threshold: Number(form.threshold)||0 }); load(); }
    catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal menambah' }); }
    finally{ setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <PosPageHeader icon={Workflow} title="Approval Matrix"
        subtitle="Ambang batas yang memicu persetujuan otomatis (diskon SO, nilai PO)"
        actions={<button onClick={load} className={posBtnSecondary+' h-9 px-3 text-xs'}><RefreshCw size={13} className={loading?'animate-spin':''}/> Muat</button>}/>

      <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-[11px] text-sky-900 flex gap-2">
        <Info size={14} className="shrink-0 mt-0.5"/>
        <div>
          Diskon SO di atas <b>DISCOUNT_PCT</b> atau nilai PO di atas <b>VALUE</b> otomatis berstatus PENDING
          dan masuk antrian <b>Approval</b> ke role yang dipilih. Approval yang disetujui mengubah dokumen menjadi APPROVED.
        </div>
      </div>

      <PosCard>
        <PosCardBody className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-end">
          <label className="block space-y-1"><span className="text-[11px] font-bold text-[#45464d]">Modul</span>
            <PosSelect value={form.module} onChange={v=>setForm(f=>({...f,module:v}))}>{MODULES.map(m=> <option key={m} value={m}>{m}</option>)}</PosSelect>
          </label>
          <label className="block space-y-1"><span className="text-[11px] font-bold text-[#45464d]">Metrik</span>
            <PosSelect value={form.metric} onChange={v=>setForm(f=>({...f,metric:v}))}>{METRICS.map(m=> <option key={m} value={m}>{m}</option>)}</PosSelect>
          </label>
          <label className="block space-y-1"><span className="text-[11px] font-bold text-[#45464d]">Ambang</span>
            <input type="number" value={form.threshold} onChange={e=>setForm(f=>({...f,threshold:e.target.value}))} className={posInput+' h-9 text-xs'}/>
          </label>
          <label className="block space-y-1"><span className="text-[11px] font-bold text-[#45464d]">Approver</span>
            <input value={form.approver_roles} onChange={e=>setForm(f=>({...f,approver_roles:e.target.value}))} className={posInput+' h-9 text-xs'} placeholder="direktur,finance"/>
          </label>
          <label className="block space-y-1 sm:col-span-1"><span className="text-[11px] font-bold text-[#45464d]">Catatan</span>
            <input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} className={posInput+' h-9 text-xs'}/>
          </label>
          <button onClick={add} disabled={busy} className={posBtnPrimary+' h-9 px-3 text-xs'}><Plus size={13}/> Tambah</button>
        </PosCardBody>

        {loading ? <PosSkeleton rows={4} cols={5}/> : err ? <PosError message={err} onRetry={load}/> : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-[#e5eeff] border-y border-[#e7ecf7] text-[11px] font-bold tracking-wider text-[#45464d]">
                <PosTh>MODUL</PosTh><PosTh>METRIK</PosTh><PosTh align="right">AMBANG</PosTh><PosTh>APPROVER</PosTh>
                <PosTh align="center">AKTIF</PosTh><PosTh>CATATAN</PosTh><PosTh align="center">AKSI</PosTh>
              </tr></thead>
              <tbody>
                {rows.map(r=>(
                  <tr key={r.id} className={posTr}>
                    <td className={posTd+' font-mono text-xs'}>{r.module}</td>
                    <td className={posTd+' font-mono text-xs'}>{r.metric}</td>
                    <td className={posTd+' text-right'}>
                      <div className="flex items-center justify-end gap-1">
                        <input type="number" value={draft[r.id] ?? r.threshold} onChange={e=>setDraft(p=>({...p,[r.id]:e.target.value}))} className={posInput+' h-8 w-24 text-xs text-right'}/>
                        {draft[r.id]!=null && <button onClick={()=>save(r)} className="text-emerald-700"><Save size={13}/></button>}
                      </div>
                    </td>
                    <td className={posTd+' text-xs'}>{r.approver_roles}</td>
                    <td className={posTd+' text-center'}>
                      <button onClick={()=>toggle(r)}><PosBadge tone={r.active?'emerald':'slate'}>{r.active?'AKTIF':'MATI'}</PosBadge></button>
                    </td>
                    <td className={posTd+' text-[11px] text-[#45464d]'}>{r.notes||'-'}</td>
                    <td className={posTd+' text-center'}><button onClick={()=>del(r)} className="text-red-600 hover:underline"><Trash2 size={13}/></button></td>
                  </tr>
                ))}
                {!rows.length && <PosEmpty colSpan={7} text="Belum ada aturan"/>}
              </tbody>
            </table>
          </div>
        )}
      </PosCard>
    </div>
  );
}
