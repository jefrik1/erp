import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, CalendarDays, CheckCircle2, Clock, FileImage, FileText, Info, Paperclip, RefreshCw, Send, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import api from '../lib/api';
import { useDialog } from '../components/DialogProvider';
import {
  PosPageHeader, PosCard, PosCardBody, PosBadge, PosChip, PosEmpty, PosSkeleton, PosError,
  PosStat, PosTh, posTr, posTd, posInput, posBtnPrimary, posBtnSecondary, posBtnSm,
} from '../components/PosUI';

const TYPE_LABEL = { IZIN:'Izin', SAKIT:'Sakit', CUTI:'Cuti', DINAS:'Dinas luar', TANPA_BAYAR:'Tanpa upah' };
const TYPE_TONE  = { IZIN:'sky', SAKIT:'red', CUTI:'emerald', DINAS:'purple', TANPA_BAYAR:'slate' };
const STATUS_TONE = { PENDING:'amber', APPROVED:'emerald', REJECTED:'red', CANCELLED:'slate' };
const iso = (d)=> String(d||'').slice(0,10);
const fmt = (d)=>{ const s=iso(d); if(!s) return '-'; const [y,m,dd]=s.split('-'); return dd+'/'+m+'/'+y; };
const jam = (t)=> t ? String(t).slice(0,5) : null;
const hariIni = ()=> new Date(Date.now()+7*3600*1000).toISOString().slice(0,10);

const FORM_AWAL = { type:'IZIN', start_date:hariIni(), end_date:hariIni(), start_time:'08:00', end_time:'12:00', reason:'' };
const MAX_SURAT = 4 * 1024 * 1024;
const MIME_OK = ['image/jpeg','image/png','image/webp','application/pdf'];
const fileKeBase64 = (file)=> new Promise((resolve,reject)=>{
  const fr = new FileReader();
  fr.onload = ()=> resolve(String(fr.result).split(',')[1] || '');
  fr.onerror = ()=> reject(new Error('Gagal membaca berkas'));
  fr.readAsDataURL(file);
});

export default function MyPermits(){
  const dialog = useDialog();
  const [rows,setRows]=useState([]); const [jatah,setJatah]=useState(null);
  const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  const [form,setForm]=useState(FORM_AWAL);
  const [saving,setSaving]=useState(false); const [formErr,setFormErr]=useState('');
  const [filter,setFilter]=useState('Semua');
  const [surat,setSurat]=useState(null);        // File surat dokter
  const [preview,setPreview]=useState('');      // object URL untuk gambar
  const [uploading,setUploading]=useState(false);

  const load = useCallback(async()=>{
    setLoading(true); setErr('');
    try{
      const r = await api.get('/hr/leaves/mine');
      setRows(r.data?.data||[]); setJatah(r.data?.jatah||null);
    }catch(e){ setErr(e.response?.data?.error||e.message||'Gagal memuat data izin'); }
    finally{ setLoading(false); }
  },[]);
  useEffect(()=>{ load(); },[load]);

  const izinRows = useMemo(()=> rows.filter(r=> ['IZIN','SAKIT','DINAS','TANPA_BAYAR'].includes(String(r.type).toUpperCase())), [rows]);
  const tampil = useMemo(()=> filter==='Semua' ? izinRows : izinRows.filter(r=> String(r.type).toUpperCase()===filter), [izinRows, filter]);

  const bulanIni = hariIni().slice(0,7);
  const stats = useMemo(()=>({
    pending: izinRows.filter(r=>r.status==='PENDING').length,
    disetujuiBulanIni: izinRows.filter(r=>r.status==='APPROVED' && iso(r.start_date).slice(0,7)===bulanIni).length,
    sakitBulanIni: izinRows.filter(r=>String(r.type).toUpperCase()==='SAKIT' && iso(r.start_date).slice(0,7)===bulanIni).length,
  }),[izinRows, bulanIni]);

  const pilihSurat = (file)=>{
    setFormErr('');
    if(!file) return;
    if(!MIME_OK.includes(file.type)){ setFormErr('Surat dokter harus JPG, PNG, WEBP, atau PDF'); return; }
    if(file.size > MAX_SURAT){ setFormErr('Ukuran surat dokter maksimal 4 MB'); return; }
    if(preview) URL.revokeObjectURL(preview);
    setSurat(file);
    setPreview(file.type.startsWith('image/') ? URL.createObjectURL(file) : '');
  };
  const hapusSurat = ()=>{
    if(preview) URL.revokeObjectURL(preview);
    setSurat(null); setPreview('');
  };
  const bukaLampiran = async(row)=>{
    try{
      const r = await api.get('/hr/leaves/'+row.id+'/attachment', { responseType:'blob' });
      const url = URL.createObjectURL(new Blob([r.data], { type:r.headers?.['content-type']||'application/octet-stream' }));
      window.open(url, '_blank', 'noopener');
      setTimeout(()=>URL.revokeObjectURL(url), 60000);
    }catch(e){ await dialog.alert(e.response?.data?.error||'Lampiran tidak bisa dibuka', { title:'Gagal' }); }
  };

  const satuHari = form.start_date === form.end_date;
  const perluJam = satuHari && form.type==='IZIN';

  const submit = async(e)=>{
    e.preventDefault(); setFormErr('');
    if(!form.start_date || !form.end_date){ setFormErr('Tanggal mulai dan tanggal selesai wajib diisi'); return; }
    if(form.end_date < form.start_date){ setFormErr('Tanggal selesai tidak boleh sebelum tanggal mulai'); return; }
    if(!form.reason.trim()){ setFormErr('Alasan wajib diisi — tuliskan keperluan izin secara singkat'); return; }
    if(perluJam && (!form.start_time || !form.end_time)){ setFormErr('Izin satu hari wajib mengisi jam mulai dan jam selesai'); return; }
    setSaving(true);
    try{
      const body = {
        type: form.type,
        start_date: form.start_date,
        end_date: form.end_date,
        start_time: perluJam ? form.start_time : null,
        end_time: perluJam ? form.end_time : null,
        reason: form.reason.trim(),
      };
      if(surat){
        setUploading(true);
        const data = await fileKeBase64(surat);
        const up = await api.post('/hr/leaves/attachment', { name:surat.name, mime:surat.type, data });
        body.attachment = up.data;
        setUploading(false);
      }
      await api.post('/hr/leaves/request', body);
      hapusSurat();
      setForm({ ...FORM_AWAL, type: form.type });
      await dialog.alert('Pengajuan izin terkirim dan masuk antrean approval HRD / admin.', { title:'Terkirim' });
      load();
    }catch(e2){ setFormErr(e2.response?.data?.error||e2.message||'Gagal mengirim pengajuan'); }
    finally{ setSaving(false); setUploading(false); }
  };

  const cancel = async(r)=>{
    const ok = await dialog.confirm('Batalkan pengajuan '+(TYPE_LABEL[r.type]||r.type)+' tanggal '+fmt(r.start_date)+'?', { title:'Batalkan Pengajuan' });
    if(!ok) return;
    try{ await api.post('/hr/leaves/'+r.id+'/cancel'); await dialog.alert('Pengajuan dibatalkan', { title:'Dibatalkan' }); load(); }
    catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal' }); }
  };

  return (
    <div className="space-y-4">
      <PosPageHeader icon={CalendarClock} title="Izin & Sakit"
        subtitle="Ajukan izin tidak masuk, sakit, atau keperluan mendadak. Pengajuan langsung masuk antrean approval HRD / admin."
        badge={stats.pending ? stats.pending+' menunggu' : null}
        actions={<button onClick={load} className={posBtnSecondary+' h-10 px-4 text-label-md'}><RefreshCw size={14} className={loading?'animate-spin':''}/> Muat Ulang</button>}/>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PosStat icon={CalendarDays} tone="bg-surface-2 text-ink-2" label="Jatah cuti" value={jatah? jatah.jatah+' hari':'...'} sub={jatah? 'tahun '+jatah.tahun : 'memuat...'}/>
        <PosStat icon={CheckCircle2} tone="bg-success-soft text-success" label="Sisa cuti" value={jatah? jatah.sisa+' hari':'...'} sub={(jatah?jatah.terpakai:0)+' hari terpakai'}/>
        <PosStat icon={Clock} tone="bg-warning-soft text-warning" label="Menunggu approval" value={stats.pending} sub="izin & sakit pending"/>
        <PosStat icon={ShieldCheck} tone="bg-info-soft text-info" label="Disetujui bulan ini" value={stats.disetujuiBulanIni} sub={"termasuk "+stats.sakitBulanIni+" sakit"}/>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* ---------------------------------------------------------- form */}
        <div className="xl:col-span-5">
          <PosCard>
            <PosCardBody className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-tint text-white grid place-items-center shrink-0"><Send size={18}/></div>
                <div>
                  <h2 className="font-display text-headline-sm font-bold text-ink">Ajukan izin</h2>
                  <p className="text-body-sm text-ink-2 mt-0.5">Isi data di bawah, lalu kirim untuk disetujui HRD / admin.</p>
                </div>
              </div>

              {formErr && <div className="rounded-lg bg-danger-soft text-[#93000a] text-body-sm px-3 py-2" role="alert">{formErr}</div>}

              <form onSubmit={submit} className="space-y-3">
                <div>
                  <span className="block text-label-md text-ink-2 mb-1.5">Jenis pengajuan *</span>
                  <div className="grid grid-cols-2 gap-2">
                    {[['IZIN','Izin keperluan'],['SAKIT','Sakit']].map(([k,label])=>(
                      <button key={k} type="button" onClick={()=>setForm({...form, type:k})}
                        className={"h-10 rounded-lg text-label-md transition-colors "+(form.type===k
                          ? "bg-navy text-white shadow-sm"
                          : "bg-surface-2 text-ink-2 hover:bg-surface-3")}>{label}</button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="block text-label-md text-ink-2 mb-1.5">Mulai *</span>
                    <input type="date" value={form.start_date} onChange={e=>setForm({...form, start_date:e.target.value, end_date: e.target.value > form.end_date ? e.target.value : form.end_date})} className={posInput}/>
                  </label>
                  <label className="block">
                    <span className="block text-label-md text-ink-2 mb-1.5">Selesai *</span>
                    <input type="date" value={form.end_date} min={form.start_date} onChange={e=>setForm({...form, end_date:e.target.value})} className={posInput}/>
                  </label>
                </div>

                {perluJam && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="block text-label-md text-ink-2 mb-1.5">Jam mulai *</span>
                      <input type="time" value={form.start_time} onChange={e=>setForm({...form, start_time:e.target.value})} className={posInput}/>
                    </label>
                    <label className="block">
                      <span className="block text-label-md text-ink-2 mb-1.5">Jam selesai *</span>
                      <input type="time" value={form.end_time} onChange={e=>setForm({...form, end_time:e.target.value})} className={posInput}/>
                    </label>
                  </div>
                )}

                <label className="block">
                  <span className="block text-label-md text-ink-2 mb-1.5">Alasan *</span>
                  <textarea value={form.reason} onChange={e=>setForm({...form, reason:e.target.value})} rows={3}
                    placeholder={form.type==='SAKIT' ? 'Contoh: demam, surat dokter menyusul' : 'Contoh: mengurus dokumen keluarga'}
                    className={posInput+' h-auto py-2 resize-y'}/>
                </label>

                {form.type==='SAKIT' && (
                  <div>
                    <span className="block text-label-md text-ink-2 mb-1.5">Foto surat dokter</span>
                    {!surat ? (
                      <label className="flex items-center gap-3 rounded-lg border border-dashed border-line-strong bg-surface-2 hover:bg-surface-3 px-3 py-3 cursor-pointer transition-colors">
                        <span className="w-9 h-9 rounded-lg bg-surface grid place-items-center text-brand shrink-0"><Upload size={16}/></span>
                        <span className="min-w-0">
                          <span className="block text-label-md text-ink">Unggah surat dokter</span>
                          <span className="block text-label-sm text-ink-3 font-normal">JPG / PNG / WEBP / PDF, maks 4 MB</span>
                        </span>
                        <input type="file" className="hidden" accept="image/jpeg,image/png,image/webp,application/pdf"
                          onChange={e=>{ pilihSurat(e.target.files?.[0]); e.target.value=''; }}/>
                      </label>
                    ) : (
                      <div className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2">
                        {preview
                          ? <img src={preview} alt="Pratinjau surat dokter" className="w-12 h-12 rounded-lg object-cover shrink-0 border border-line"/>
                          : <span className="w-12 h-12 rounded-lg bg-surface grid place-items-center text-danger shrink-0 border border-line"><FileImage size={18}/></span>}
                        <span className="flex-1 min-w-0">
                          <span className="block text-label-md text-ink truncate">{surat.name}</span>
                          <span className="block text-label-sm text-ink-3 font-normal num">{(surat.size/1024/1024).toFixed(2)} MB · siap dikirim</span>
                        </span>
                        <button type="button" onClick={()=>document.getElementById('surat-input')?.click()} className={posBtnSm}>Ganti</button>
                        <button type="button" onClick={hapusSurat} aria-label="Hapus surat" className={posBtnSm+' text-danger hover:bg-danger-soft'}><Trash2 size={13}/></button>
                        <input id="surat-input" type="file" className="hidden" accept="image/jpeg,image/png,image/webp,application/pdf"
                          onChange={e=>{ pilihSurat(e.target.files?.[0]); e.target.value=''; }}/>
                      </div>
                    )}
                    <p className="text-label-sm text-ink-3 mt-1.5">Disarankan melampirkan surat dokter agar HRD lebih cepat menyetujui.</p>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button type="submit" disabled={saving || uploading} className={posBtnPrimary+' flex-1'}>
                    {saving ? <><RefreshCw size={14} className="animate-spin"/> {uploading?'Mengunggah surat...':'Mengirim...'}</> : <><Send size={14}/> Kirim pengajuan</>}
                  </button>
                  <button type="button" onClick={()=>{ setForm(FORM_AWAL); setFormErr(''); }} className={posBtnSecondary}>Reset</button>
                </div>
              </form>
            </PosCardBody>
          </PosCard>

          <div className="mt-3 rounded-xl bg-surface-2 px-4 py-3 flex items-start gap-2.5">
            <Info size={16} className="text-info shrink-0 mt-0.5"/>
            <div className="text-body-sm text-ink-2 leading-relaxed">
              Alur: <b className="text-ink">Diajukan</b> → <b className="text-ink">Verifikasi HRD/admin</b> → <b className="text-ink">Disetujui</b>.
              Izin yang disetujui tidak memotong jatah cuti tahunan.
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------- riwayat */}
        <div className="xl:col-span-7">
          <PosCard>
            <PosCardBody className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-ink-3"/>
                <h2 className="font-display text-headline-sm font-bold text-ink">Riwayat izin</h2>
                <span className="text-label-sm px-2 py-0.5 rounded-full bg-surface-2 text-ink-2">{izinRows.length}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {['Semua','IZIN','SAKIT'].map(f=> <PosChip key={f} active={filter===f} onClick={()=>setFilter(f)}>{f==='Semua'?'Semua':TYPE_LABEL[f]}</PosChip>)}
              </div>
            </PosCardBody>

            {loading ? <PosSkeleton rows={6} cols={5}/> : err ? <PosError message={err} onRetry={load}/> : !tampil.length ? (
              <PosEmpty text={filter==='Semua' ? 'Belum ada pengajuan izin' : 'Tidak ada pengajuan '+TYPE_LABEL[filter].toLowerCase()}
                hint={filter==='Semua' ? 'Pengajuan pertama Anda akan muncul di sini setelah dikirim.' : 'Coba pilih filter Semua.'}/>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-left border-collapse">
                  <thead><tr className="bg-surface-2 text-ink-2 text-label-sm uppercase tracking-wider">
                    <PosTh>TANGGAL</PosTh><PosTh align="center">JENIS</PosTh><PosTh align="center">JAM</PosTh>
                    <PosTh>ALASAN</PosTh><PosTh align="center">STATUS</PosTh><PosTh align="right">AKSI</PosTh>
                  </tr></thead>
                  <tbody>
                    {tampil.map(r=>{
                      const t = String(r.type).toUpperCase();
                      return (
                        <tr key={r.id} className={posTr}>
                          <td className={posTd+' whitespace-nowrap num'}>{fmt(r.start_date)}{iso(r.end_date)!==iso(r.start_date) && <> – {fmt(r.end_date)}</>}</td>
                          <td className={posTd+' text-center'}><PosBadge tone={TYPE_TONE[t]||'slate'}>{TYPE_LABEL[t]||t}</PosBadge></td>
                          <td className={posTd+' text-center text-body-sm text-ink-2 num'}>
                            {jam(r.start_time) ? jam(r.start_time)+'–'+jam(r.end_time) : (r.jumlah_hari>1 ? r.jumlah_hari+' hari' : '—')}
                          </td>
                          <td className={posTd+' text-body-sm text-ink-2'}><span className="line-clamp-2">{r.reason||'-'}</span></td>
                          <td className={posTd+' text-center'}>
                            <PosBadge tone={STATUS_TONE[r.status]||'slate'}>{r.status}</PosBadge>
                            {r.approved_by_name && r.status!=='PENDING' && <div className="text-label-sm text-ink-3 mt-1 font-normal">oleh {r.approved_by_name}</div>}
                          </td>
                          <td className={posTd+' text-right'}>
                            <div className="flex items-center justify-end gap-1.5">
                              {r.has_attachment && (
                                <button onClick={()=>bukaLampiran(r)} title={r.attachment_name||'Surat dokter'} className={posBtnSm+' text-info hover:bg-info-soft'}><Paperclip size={13}/> Surat</button>
                              )}
                              {r.status==='PENDING'
                                ? <button onClick={()=>cancel(r)} className={posBtnSm+' text-danger hover:bg-danger-soft'}><X size={13}/> Batalkan</button>
                                : (!r.has_attachment && <span className="text-label-sm text-ink-3">—</span>)}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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
