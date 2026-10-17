import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, CalendarCheck, Clock, Plus, RefreshCw, X } from 'lucide-react';
import api from '../lib/api';
import { useDialog } from '../components/DialogProvider';
import {
  PosPageHeader, PosCard, PosCardBody, PosBadge, PosEmpty, PosSkeleton, PosError, PosStat,
  PosTh, posTr, posTd, posInput, posBtnPrimary, posBtnSecondary, posBtnSm,
} from '../components/PosUI';

const LEAVE_TYPE = { CUTI:'Cuti tahunan', SAKIT:'Sakit', IZIN:'Izin', DINAS:'Dinas luar', TANPA_BAYAR:'Tanpa upah' };
const iso = (d)=> String(d||'').slice(0,10);
const fmt = (d)=>{ const s=iso(d); if(!s) return '-'; const [y,m,dd]=s.split('-'); return dd+'/'+m+'/'+y; };
const tone = (s)=> s==='APPROVED'?'emerald' : s==='REJECTED'?'red' : s==='CANCELLED'?'slate' : 'amber';

export default function MyLeave(){
  const dialog = useDialog();
  const [rows,setRows]=useState([]); const [jatah,setJatah]=useState(null);
  const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  const [show,setShow]=useState(false);
  const [form,setForm]=useState({type:'CUTI', start_date:'', end_date:'', reason:''});
  const [saving,setSaving]=useState(false); const [formErr,setFormErr]=useState('');

  const load = useCallback(async()=>{
    setLoading(true); setErr('');
    try{
      const r = await api.get('/hr/leaves/mine');
      setRows(r.data?.data||[]); setJatah(r.data?.jatah||null);
    }catch(e){ setErr(e.response?.data?.error||e.message||'Gagal memuat data cuti'); }
    finally{ setLoading(false); }
  },[]);
  useEffect(()=>{ load(); },[load]);

  const submit = async(e)=>{
    e.preventDefault(); setFormErr('');
    if(!form.start_date || !form.end_date){ setFormErr('Tanggal mulai dan tanggal selesai wajib diisi'); return; }
    if(form.end_date < form.start_date){ setFormErr('Tanggal selesai tidak boleh sebelum tanggal mulai'); return; }
    setSaving(true);
    try{
      await api.post('/hr/leaves/request', form);
      setShow(false); setForm({type:'CUTI', start_date:'', end_date:'', reason:''});
      await dialog.alert('Pengajuan terkirim. Menunggu persetujuan HR / admin.', { title:'Terkirim' });
      load();
    }catch(e2){ setFormErr(e2.response?.data?.error||e2.message||'Gagal mengirim pengajuan'); }
    finally{ setSaving(false); }
  };

  const cancel = async(r)=>{
    const ok = await dialog.confirm('Batalkan pengajuan '+(LEAVE_TYPE[r.type]||r.type)+' '+fmt(r.start_date)+' s/d '+fmt(r.end_date)+'?', { title:'Batalkan Pengajuan' });
    if(!ok) return;
    try{ await api.post('/hr/leaves/'+r.id+'/cancel'); await dialog.alert('Pengajuan dibatalkan', { title:'Dibatalkan' }); load(); }
    catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal' }); }
  };

  return (
    <div className="space-y-3">
      <PosPageHeader icon={CalendarDays} title="Cuti & Izin Saya"
        subtitle="Ajukan cuti/izin di sini - HR atau admin yang menyetujui - riwayat dan sisa jatah tampil otomatis"
        actions={<>
          <button onClick={load} className={posBtnSecondary+' h-9 px-4 text-xs'}><RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang</button>
          <button onClick={()=>{ setFormErr(''); setShow(true); }} className={posBtnPrimary+' h-9 px-4 text-xs'}><Plus size={14}/> Ajukan</button>
        </>}/>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PosStat icon={CalendarCheck} tone="bg-emerald-50 text-emerald-700" label="JATAH CUTI TAHUNAN" value={jatah? jatah.jatah+' hari':'...'} sub={jatah? 'tahun '+jatah.tahun : ''}/>
        <PosStat icon={Clock} tone="bg-amber-50 text-amber-700" label="TERPAKAI" value={jatah? jatah.terpakai+' hari':'...'} sub="dari cuti yang disetujui"/>
        <PosStat icon={CalendarDays} tone="bg-[#1E40AF]/10 text-[#1E40AF]" label="SISA JATAH" value={jatah? jatah.sisa+' hari':'...'} sub="sisa tahun ini"/>
        <PosStat icon={Clock} tone="bg-[#F1F5F9] text-[#475569]" label="MENUNGGU" value={rows.filter(r=>r.status==='PENDING').length} sub="pengajuan PENDING"/>
      </div>

      <PosCard>
        {loading ? <PosSkeleton rows={5} cols={5}/> : err ? <PosError message={err} onRetry={load}/> : !rows.length ? <PosEmpty text="Belum ada pengajuan - klik Ajukan untuk mulai"/> : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]">
                <PosTh>TANGGAL</PosTh><PosTh>JENIS</PosTh><PosTh align="center">HARI</PosTh><PosTh>ALASAN</PosTh><PosTh align="center">STATUS</PosTh><PosTh align="right">AKSI</PosTh>
              </tr></thead>
              <tbody>
                {rows.map(r=>(
                  <tr key={r.id} className={posTr}>
                    <td className={posTd+' whitespace-nowrap'}>{fmt(r.start_date)} - {fmt(r.end_date)}</td>
                    <td className={posTd+' font-medium'}>{LEAVE_TYPE[r.type]||r.type}</td>
                    <td className={posTd+' text-center tabular-nums'}>{r.jumlah_hari}</td>
                    <td className={posTd+' text-xs text-[#64748B]'}>{r.reason||'-'}</td>
                    <td className={posTd+' text-center'}>
                      <PosBadge tone={tone(r.status)}>{r.status}</PosBadge>
                      {r.approved_by_name && r.status!=='PENDING' && <div className="text-[10px] text-[#94A3B8] mt-0.5">oleh {r.approved_by_name}</div>}
                    </td>
                    <td className={posTd+' text-right'}>
                      {r.status==='PENDING' && <button onClick={()=>cancel(r)} className={posBtnSm+' text-red-600 border-red-200 hover:bg-red-50'}><X size={13}/> Batalkan</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PosCard>

      {show && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={submit} className="bg-white rounded-[20px] p-5 w-full max-w-lg space-y-3 border shadow-xl animate-pop">
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="font-black text-[16px] text-[#0F172A]">Ajukan Cuti / Izin</h3><div className="text-xs text-[#64748B] mt-0.5">Pengajuan masuk sebagai PENDING dan menunggu keputusan HR / admin</div></div>
              <button type="button" onClick={()=>setShow(false)} aria-label="Tutup" className="w-9 h-9 rounded-xl border grid place-items-center hover:bg-[#F8FAFC]"><X size={16}/></button>
            </div>
            {formErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{formErr}</div>}
            <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">JENIS</span>
              <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})} className={posInput}>
                {Object.entries(LEAVE_TYPE).map(([k,v])=> <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">MULAI *</span><input type="date" value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})} className={posInput}/></label>
              <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">SELESAI *</span><input type="date" value={form.end_date} onChange={e=>setForm({...form,end_date:e.target.value})} className={posInput}/></label>
            </div>
            <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">ALASAN</span>
              <textarea value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})} rows={3} placeholder="Contoh: acara keluarga / sakit / keperluan dinas" className={posInput+' h-auto py-2'}/>
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={()=>setShow(false)} className={posBtnSecondary+' h-9 px-5 text-xs'}>Batal</button>
              <button disabled={saving} className={posBtnPrimary+' h-9 px-6 text-xs'}>{saving?'Mengirim...':'Kirim Pengajuan'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
