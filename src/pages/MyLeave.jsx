import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarCheck, CalendarDays, CheckCircle2, Clock, Info, RefreshCw, Send, X } from 'lucide-react';
import api from '../lib/api';
import { useDialog } from '../components/DialogProvider';
import {
  PosPageHeader, PosCard, PosCardBody, PosBadge, PosEmpty, PosSkeleton, PosError, PosStat,
  PosTh, posTr, posTd, posInput, posBtnPrimary, posBtnSecondary, posBtnSm,
} from '../components/PosUI';

const iso = (d)=> String(d||'').slice(0,10);
const fmt = (d)=>{ const s=iso(d); if(!s) return '-'; const [y,m,dd]=s.split('-'); return dd+'/'+m+'/'+y; };
const tone = (s)=> s==='APPROVED'?'emerald' : s==='REJECTED'?'red' : s==='CANCELLED'?'slate' : 'amber';
const hariAntara = (a,b)=>{ if(!a||!b) return 0; const d=(new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/86400000; return Number.isFinite(d) ? Math.round(d)+1 : 0; };
const tahunBerjalan = ()=> new Date(Date.now()+7*3600*1000).getFullYear();

export default function MyLeave(){
  const dialog = useDialog();
  const [rows,setRows]=useState([]); const [jatah,setJatah]=useState(null);
  const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  const [form,setForm]=useState({start_date:'', end_date:'', reason:''});
  const [saving,setSaving]=useState(false); const [formErr,setFormErr]=useState('');

  const load = useCallback(async()=>{
    setLoading(true); setErr('');
    try{
      const r = await api.get('/hr/leaves/mine');
      setRows((r.data?.data||[]).filter(x=> String(x.type).toUpperCase()==='CUTI'));
      setJatah(r.data?.jatah||null);
    }catch(e){ setErr(e.response?.data?.error||e.message||'Gagal memuat data cuti'); }
    finally{ setLoading(false); }
  },[]);
  useEffect(()=>{ load(); },[load]);

  const hari = useMemo(()=> hariAntara(form.start_date, form.end_date), [form.start_date, form.end_date]);
  const sisa = jatah ? (jatah.sisa_setelah_pending ?? jatah.sisa ?? 0) : 0;
  const kelebihan = hari > 0 && hari > sisa;
  const sisaSetelah = Math.max(0, sisa - hari);
  const pctTerpakai = jatah?.jatah ? Math.min(100, Math.round((jatah.terpakai/jatah.jatah)*100)) : 0;
  const pctMenunggu = jatah?.jatah ? Math.min(100 - pctTerpakai, Math.round((jatah.menunggu/jatah.jatah)*100)) : 0;

  const submit = async(e)=>{
    e.preventDefault(); setFormErr('');
    if(!form.start_date || !form.end_date){ setFormErr('Tanggal mulai dan tanggal selesai wajib diisi'); return; }
    if(form.end_date < form.start_date){ setFormErr('Tanggal selesai tidak boleh sebelum tanggal mulai'); return; }
    if(kelebihan){ setFormErr(`Sisa jatah cuti tidak cukup: butuh ${hari} hari, tersedia ${sisa} hari`); return; }
    if(!form.reason.trim()){ setFormErr('Alasan cuti wajib diisi'); return; }
    setSaving(true);
    try{
      await api.post('/hr/leaves/request', { type:'CUTI', ...form, reason: form.reason.trim() });
      setForm({ start_date:'', end_date:'', reason:'' });
      await dialog.alert(`Pengajuan cuti ${hari} hari terkirim. Menunggu persetujuan HRD / admin — jatah cuti dipotong setelah disetujui.`, { title:'Terkirim' });
      load();
    }catch(e2){ setFormErr(e2.response?.data?.error||e2.message||'Gagal mengirim pengajuan'); }
    finally{ setSaving(false); }
  };

  const cancel = async(r)=>{
    const ok = await dialog.confirm('Batalkan pengajuan cuti '+fmt(r.start_date)+' → '+fmt(r.end_date)+' ('+r.jumlah_hari+' hari)?', { title:'Batalkan Pengajuan' });
    if(!ok) return;
    try{ await api.post('/hr/leaves/'+r.id+'/cancel'); await dialog.alert('Pengajuan dibatalkan', { title:'Dibatalkan' }); load(); }
    catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal' }); }
  };

  const setTanggal = (key, val)=>{
    setForm(f=>{
      const next = { ...f, [key]: val };
      if(key==='start_date' && (!f.end_date || f.end_date < val)) next.end_date = val;
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <PosPageHeader icon={CalendarDays} title="Cuti Tahunan"
        subtitle="Ambil jatah cuti tahunan Anda. Pengajuan masuk antrean approval HRD / admin; jatah baru terpotong setelah disetujui."
        badge={jatah ? sisa+' hari tersedia' : null}
        actions={<button onClick={load} className={posBtnSecondary+' h-10 px-4 text-label-md'}><RefreshCw size={14} className={loading?'animate-spin':''}/> Muat Ulang</button>}/>

      {/* ------------------------------------------------- kartu jatah cuti */}
      <PosCard>
        <PosCardBody className="flex flex-col lg:flex-row lg:items-center gap-5">
          <div className="flex items-center gap-4 min-w-[220px]">
            <div className="w-14 h-14 rounded-2xl bg-brand-tint text-white grid place-items-center shrink-0"><CalendarCheck size={26}/></div>
            <div>
              <div className="text-label-sm uppercase tracking-wider text-ink-2 font-semibold">Sisa jatah cuti {jatah?.tahun||tahunBerjalan()}</div>
              <div className="font-display text-headline-xl font-bold text-ink num leading-none mt-1">
                {jatah ? jatah.sisa : '—'} <span className="text-headline-sm font-semibold text-ink-2">hari</span>
              </div>
              <div className="text-body-sm text-ink-3 mt-1">{jatah ? `dari ${jatah.jatah} hari / tahun` : 'memuat...'}</div>
            </div>
          </div>

          <div className="flex-1 min-w-[260px]">
            <div className="flex items-center justify-between text-label-sm text-ink-2 mb-1.5">
              <span>Terpakai {jatah?.terpakai ?? 0} hari{jatah?.menunggu ? ` · ${jatah.menunggu} hari menunggu` : ''}</span>
              <span className="num">{jatah ? jatah.jatah - jatah.sisa : 0}/{jatah?.jatah ?? 0}</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-surface-3 overflow-hidden flex">
              <div className="h-full bg-brand" style={{ width: pctTerpakai+'%' }} title={`Terpakai ${jatah?.terpakai??0} hari`}/>
              <div className="h-full bg-warning/70" style={{ width: pctMenunggu+'%' }} title={`Menunggu ${jatah?.menunggu??0} hari`}/>
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-label-sm text-ink-3">
              <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-brand"/>Disetujui</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-warning"/>Menunggu approval</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-surface-3"/>Tersedia</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 lg:w-[330px]">
            <div className="rounded-lg bg-surface-2 px-3 py-2">
              <div className="text-label-sm uppercase tracking-wider text-ink-3">Jatah</div>
              <div className="font-display text-headline-sm font-bold text-ink num">{jatah?.jatah ?? '—'}</div>
            </div>
            <div className="rounded-lg bg-surface-2 px-3 py-2">
              <div className="text-label-sm uppercase tracking-wider text-ink-3">Terpakai</div>
              <div className="font-display text-headline-sm font-bold text-ink num">{jatah?.terpakai ?? '—'}</div>
            </div>
            <div className="rounded-lg bg-success-soft px-3 py-2">
              <div className="text-label-sm uppercase tracking-wider text-success">Sisa</div>
              <div className="font-display text-headline-sm font-bold text-success num">{jatah?.sisa ?? '—'}</div>
            </div>
          </div>
        </PosCardBody>
      </PosCard>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* ------------------------------------------------------- form */}
        <div className="xl:col-span-5">
          <PosCard>
            <PosCardBody className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-tint text-white grid place-items-center shrink-0"><Send size={18}/></div>
                <div>
                  <h2 className="font-display text-headline-sm font-bold text-ink">Ambil cuti</h2>
                  <p className="text-body-sm text-ink-2 mt-0.5">Pilih rentang tanggal, sistem menghitung pemakaian jatah otomatis.</p>
                </div>
              </div>

              {formErr && <div className="rounded-lg bg-danger-soft text-[#93000a] text-body-sm px-3 py-2" role="alert">{formErr}</div>}

              <form onSubmit={submit} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="block text-label-md text-ink-2 mb-1.5">Mulai *</span>
                    <input type="date" value={form.start_date} onChange={e=>setTanggal('start_date', e.target.value)} className={posInput}/>
                  </label>
                  <label className="block">
                    <span className="block text-label-md text-ink-2 mb-1.5">Selesai *</span>
                    <input type="date" value={form.end_date} min={form.start_date} onChange={e=>setTanggal('end_date', e.target.value)} className={posInput}/>
                  </label>
                </div>

                <div className={"rounded-lg px-3 py-2.5 flex items-center justify-between "+(kelebihan?'bg-danger-soft':'bg-surface-2')}>
                  <div className="flex items-center gap-2">
                    {kelebihan ? <AlertTriangle size={16} className="text-danger"/> : <Clock size={16} className="text-ink-3"/>}
                    <span className="text-body-sm text-ink-2">Pemakaian</span>
                  </div>
                  <div className="text-right">
                    <div className={"font-display text-headline-sm font-bold num "+(kelebihan?'text-danger':'text-ink')}>{hari>0?hari:0} hari</div>
                    <div className="text-label-sm text-ink-3 num">{kelebihan ? `melebihi sisa ${sisa} hari` : `sisa setelah disetujui: ${sisaSetelah} hari`}</div>
                  </div>
                </div>

                <label className="block">
                  <span className="block text-label-md text-ink-2 mb-1.5">Alasan *</span>
                  <textarea value={form.reason} onChange={e=>setForm({...form, reason:e.target.value})} rows={3}
                    placeholder="Contoh: cuti keluarga, pulang kampung"
                    className={posInput+' h-auto py-2 resize-y'}/>
                </label>

                <div className="flex items-center gap-2 pt-1">
                  <button type="submit" disabled={saving || kelebihan || !form.start_date || !form.end_date} className={posBtnPrimary+' flex-1'}>
                    {saving ? <><RefreshCw size={14} className="animate-spin"/> Mengirim...</> : <><Send size={14}/> Ajukan cuti</>}
                  </button>
                  <button type="button" onClick={()=>{ setForm({start_date:'', end_date:'', reason:''}); setFormErr(''); }} className={posBtnSecondary}>Reset</button>
                </div>
              </form>
            </PosCardBody>
          </PosCard>

          <div className="mt-3 rounded-xl bg-surface-2 px-4 py-3 flex items-start gap-2.5">
            <Info size={16} className="text-info shrink-0 mt-0.5"/>
            <div className="text-body-sm text-ink-2 leading-relaxed">
              Pengajuan berstatus <b className="text-ink">PENDING</b> lebih dulu; jatah hanya berkurang saat <b className="text-ink">APPROVED</b>.
              Butuh izin singkat (beberapa jam) atau sakit? Gunakan <Link to="/izin" className="text-brand font-semibold hover:underline">Izin &amp; Sakit</Link>.
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------- riwayat */}
        <div className="xl:col-span-7">
          <PosCard>
            <PosCardBody className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CalendarDays size={16} className="text-ink-3"/>
                <h2 className="font-display text-headline-sm font-bold text-ink">Riwayat cuti</h2>
                <span className="text-label-sm px-2 py-0.5 rounded-full bg-surface-2 text-ink-2">{rows.length}</span>
              </div>
              <span className="text-label-sm text-ink-3">hari kalender</span>
            </PosCardBody>

            {loading ? <PosSkeleton rows={6} cols={5}/> : err ? <PosError message={err} onRetry={load}/> : !rows.length ? (
              <PosEmpty text="Belum ada pengajuan cuti" hint="Pengajuan pertama Anda akan muncul di sini setelah dikirim."/>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-left border-collapse">
                  <thead><tr className="bg-surface-2 text-ink-2 text-label-sm uppercase tracking-wider">
                    <PosTh>PERIODE</PosTh><PosTh align="center">HARI</PosTh><PosTh>ALASAN</PosTh>
                    <PosTh align="center">STATUS</PosTh><PosTh align="right">AKSI</PosTh>
                  </tr></thead>
                  <tbody>
                    {rows.map(r=>(
                      <tr key={r.id} className={posTr}>
                        <td className={posTd+' whitespace-nowrap num'}>{fmt(r.start_date)} → {fmt(r.end_date)}</td>
                        <td className={posTd+' text-center num font-semibold'}>{r.jumlah_hari}</td>
                        <td className={posTd+' text-body-sm text-ink-2'}><span className="line-clamp-2">{r.reason||'-'}</span></td>
                        <td className={posTd+' text-center'}>
                          <PosBadge tone={tone(r.status)}>{r.status}</PosBadge>
                          {r.approved_by_name && r.status!=='PENDING' && <div className="text-label-sm text-ink-3 mt-1 font-normal">oleh {r.approved_by_name}</div>}
                        </td>
                        <td className={posTd+' text-right'}>
                          {r.status==='PENDING'
                            ? <button onClick={()=>cancel(r)} className={posBtnSm+' text-danger hover:bg-danger-soft'}><X size={13}/> Batalkan</button>
                            : <span className="text-label-sm text-ink-3">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PosCard>
        </div>
      </div>
    </div>
  );
}
