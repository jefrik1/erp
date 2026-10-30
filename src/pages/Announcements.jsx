import { useCallback, useEffect, useMemo, useState } from 'react';
import { Megaphone, Plus, Pencil, Trash2, RefreshCw, X, CalendarDays, User } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../store/auth';
import { useDialog } from '../components/DialogProvider';
import {
  PosPageHeader, PosCard, PosCardBody, PosBadge, PosEmpty, PosSkeleton, PosError,
  PosSelect, posInput, posBtnPrimary, posBtnSecondary,
} from '../components/PosUI';

const CATS = { UMUM:'slate', INFO:'sky', KEBIJAKAN:'amber', EVENT:'teal', URGENT:'red' };
const fmtDate = (ts)=>{ if(!ts) return '-'; const d = new Date(ts); return isNaN(d)? '-' : d.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}); };
const EMPTY = { title:'', category:'UMUM', body:'', expires_at:'' };

export default function Announcements(){
  const dialog = useDialog();
  const user = useAuth(s=>s.user);
  const myRoles = useMemo(()=> (user?.roles||[]).map(r=>String(r).toLowerCase()), [user]);
  const canManage = myRoles.some(r=>['hrd','direktur','super_admin'].includes(r));

  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  const [show,setShow]=useState(false); const [editId,setEditId]=useState(null);
  const [form,setForm]=useState(EMPTY);
  const [saving,setSaving]=useState(false); const [formErr,setFormErr]=useState('');

  const load = useCallback(async()=>{
    setLoading(true); setErr('');
    try{ const r = await api.get('/announcements'); setRows(Array.isArray(r.data)? r.data : []); }
    catch(e){ setErr(e.response?.data?.error||e.message||'Gagal memuat pengumuman'); }
    finally{ setLoading(false); }
  },[]);
  useEffect(()=>{ load(); },[load]);

  const openCreate = ()=>{ setEditId(null); setForm(EMPTY); setFormErr(''); setShow(true); };
  const openEdit = (a)=>{ setEditId(a.id); setForm({ title:a.title||'', category:a.category||'UMUM', body:a.body||'', expires_at: a.expires_at? String(a.expires_at).slice(0,10):'' }); setFormErr(''); setShow(true); };

  const submit = async(e)=>{
    e.preventDefault(); setFormErr('');
    if(!form.title.trim() || !form.body.trim()){ setFormErr('Judul dan isi pengumuman wajib diisi'); return; }
    setSaving(true);
    try{
      const payload = { title:form.title.trim(), body:form.body.trim(), category:form.category, expires_at: form.expires_at||null };
      if(editId) await api.put('/announcements/'+editId, payload);
      else await api.post('/announcements', payload);
      setShow(false); setForm(EMPTY); setEditId(null);
      await load();
    }catch(e2){ setFormErr(e2.response?.data?.error||e2.message||'Gagal menyimpan pengumuman'); }
    finally{ setSaving(false); }
  };

  const remove = async(a)=>{
    const ok = await dialog.confirm('Nonaktifkan pengumuman "'+a.title+'"? Pengumuman tidak akan tampil lagi bagi karyawan.', { title:'Nonaktifkan Pengumuman' });
    if(!ok) return;
    try{ await api.delete('/announcements/'+a.id); await load(); }
    catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal' }); }
  };

  return (
    <div className="space-y-3">
      <PosPageHeader icon={Megaphone} title="Pengumuman"
        subtitle="Info internal dari HRD dan manajemen untuk seluruh karyawan"
        actions={<>
          <button onClick={load} className={posBtnSecondary+' h-9 px-4 text-xs'}><RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang</button>
          {canManage && <button onClick={openCreate} className={posBtnPrimary+' h-9 px-4 text-xs'}><Plus size={14}/> Tulis Pengumuman</button>}
        </>}/>

      {loading ? <PosCard><PosSkeleton rows={5} cols={2}/></PosCard>
       : err ? <PosCard><PosError message={err} onRetry={load}/></PosCard>
       : !rows.length ? <PosCard><PosEmpty text="Belum ada pengumuman aktif"/></PosCard>
       : (
        <div className="space-y-3">
          {rows.map(a=>(
            <PosCard key={a.id}>
              <PosCardBody>
                <div className="flex items-start gap-3">
                  <span className="w-9 h-9 rounded-xl bg-[#0051d5]/10 text-[#0051d5] grid place-items-center shrink-0"><Megaphone size={16}/></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[15px] font-bold text-[#0b1c30] leading-snug">{a.title}</h2>
                      <PosBadge tone={CATS[a.category]||'slate'}>{a.category||'UMUM'}</PosBadge>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-[11px] text-[#76777d]">
                      <span className="inline-flex items-center gap-1"><CalendarDays size={11}/> {fmtDate(a.created_at)}</span>
                      {a.created_by_name && <span className="inline-flex items-center gap-1"><User size={11}/> {a.created_by_name}</span>}
                      {a.expires_at && <span>berlaku s/d {fmtDate(a.expires_at)}</span>}
                    </div>
                    <p className="text-sm text-[#2b3445] mt-2 whitespace-pre-line leading-relaxed">{a.body}</p>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={()=>openEdit(a)} className="h-8 px-2.5 rounded-lg border border-[#e7ecf7] bg-white text-xs font-semibold text-[#2b3445] hover:bg-[#eff4ff] inline-flex items-center gap-1"><Pencil size={12}/> Edit</button>
                      <button onClick={()=>remove(a)} className="h-8 px-2.5 rounded-lg border border-red-200 bg-white text-xs font-semibold text-red-600 hover:bg-red-50 inline-flex items-center gap-1"><Trash2 size={12}/> Nonaktifkan</button>
                    </div>
                  )}
                </div>
              </PosCardBody>
            </PosCard>
          ))}
        </div>
      )}

      {show && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#131b2e]/60 backdrop-blur-sm" onClick={()=>setShow(false)}/>
          <form onSubmit={submit} className="relative bg-white rounded-xl shadow-modal w-full max-w-[560px] overflow-hidden animate-pop">
            <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] tracking-[.14em] font-bold text-[#45464d]">{editId? 'UBAH PENGUMUMAN' : 'PENGUMUMAN BARU'}</div>
                <h2 className="text-[18px] font-bold text-[#0b1c30] mt-1">{editId? 'Perbarui informasi' : 'Tulis untuk seluruh karyawan'}</h2>
              </div>
              <button type="button" onClick={()=>setShow(false)} className="shrink-0 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 grid place-items-center text-gray-500"><X size={16}/></button>
            </div>
            <div className="px-6 pb-2 space-y-3">
              <label className="block space-y-1.5"><span className="text-[11px] font-bold tracking-wide text-[#45464d]">JUDUL</span>
                <input value={form.title} onChange={e=>setForm({...form, title:e.target.value})} className={posInput} placeholder="Contoh: Libur nasional 25 Oktober"/></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1.5"><span className="text-[11px] font-bold tracking-wide text-[#45464d]">KATEGORI</span>
                  <PosSelect value={form.category} onChange={v=>setForm({...form, category:v})} size="md">
                    {Object.keys(CATS).map(c=><option key={c} value={c}>{c}</option>)}
                  </PosSelect></label>
                <label className="block space-y-1.5"><span className="text-[11px] font-bold tracking-wide text-[#45464d]">BERLAKU SAMPAI (OPSIONAL)</span>
                  <input type="date" value={form.expires_at} onChange={e=>setForm({...form, expires_at:e.target.value})} className={posInput}/></label>
              </div>
              <label className="block space-y-1.5"><span className="text-[11px] font-bold tracking-wide text-[#45464d]">ISI</span>
                <textarea value={form.body} onChange={e=>setForm({...form, body:e.target.value})} rows={5} className={posInput+' h-auto py-2.5'} placeholder="Tulis isi pengumuman..."/></label>
              {formErr && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{formErr}</div>}
            </div>
            <div className="px-6 py-4 bg-[#eff4ff] border-t border-[#e7ecf7] flex items-center justify-end gap-2">
              <button type="button" onClick={()=>setShow(false)} className={posBtnSecondary+' h-10 px-4 text-sm'}>Batal</button>
              <button type="submit" disabled={saving} className={posBtnPrimary+' h-10 px-4 text-sm disabled:opacity-50'}>{saving? 'Menyimpan...' : (editId? 'Simpan Perubahan' : 'Terbitkan')}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
