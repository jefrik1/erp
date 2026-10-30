import { useCallback, useEffect, useState } from 'react';
import {
  Send, RefreshCw, MessageSquare, Mail, Smartphone, Plus, X, RotateCcw, Trash2, Info, FileText, Save,
} from 'lucide-react';
import api from '../lib/api';
import {
  PosPageHeader, PosCard, PosCardBody, PosBadge, PosEmpty, PosSkeleton, PosError, PosStat,
  PosTh, posTr, posTd, posInput, posBtnPrimary, posBtnSecondary, PosChipRow, PosChip, PosSelect,
} from '../components/PosUI';
import { useDialog } from '../components/DialogProvider';

const tgl = (v)=> v ? String(v).slice(0,16).replace('T',' ') : '-';
const TONE = { QUEUED:'amber', SENT:'emerald', FAILED:'red' };
const CH_ICON = { WA: MessageSquare, EMAIL: Mail, SMS: Smartphone };

export default function NotificationCenter(){
  const dialog = useDialog();
  const [status,setStatus]=useState(null);
  const [outbox,setOutbox]=useState([]);
  const [stats,setStats]=useState({});
  const [templates,setTemplates]=useState([]);
  const [tab,setTab]=useState('outbox');
  const [filter,setFilter]=useState('Semua');
  const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  const [busy,setBusy]=useState(false);
  const [compose,setCompose]=useState(false);
  const [form,setForm]=useState({ channel:'WA', recipient:'', subject:'', body:'' });
  const [tplEdit,setTplEdit]=useState(null);
  const [tplForm,setTplForm]=useState({ name:'', channel:'WA', subject:'', body:'' });

  const load = useCallback(async ()=>{
    setLoading(true); setErr('');
    try{
      const params = filter==='Semua'? {} : { status:filter };
      const [s,o,t] = await Promise.all([
        api.get('/notify/status'),
        api.get('/notify/outbox', { params }),
        api.get('/notify/templates'),
      ]);
      setStatus(s.data||null);
      setOutbox(Array.isArray(o.data?.data)? o.data.data : []);
      setStats(o.data?.stats||{});
      setTemplates(Array.isArray(t.data)? t.data : []);
    }catch(e){ setErr(e.response?.data?.error||e.message||'Gagal memuat pusat notifikasi'); }
    finally{ setLoading(false); }
  },[filter]);
  useEffect(()=>{ load(); },[load]);

  const sendOne = async (row)=>{
    try{ const r = await api.post(`/notify/outbox/${row.id}/send`); await dialog.alert(r.data?.result?.note || (r.data?.result?.ok? 'Pesan diproses.':'Gagal mengirim.'), { title:'Kirim pesan' }); load(); }
    catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal' }); }
  };
  const retry = async (row)=>{ try{ await api.post(`/notify/outbox/${row.id}/retry`); load(); }catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal' }); } };
  const del = async (row)=>{
    const ok = await dialog.confirm('Hapus pesan ini dari outbox?', { title:'Hapus', confirmText:'Ya, hapus' });
    if(!ok) return;
    try{ await api.delete('/notify/outbox/'+row.id); load(); }catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal' }); }
  };
  const sendPending = async ()=>{
    setBusy(true);
    try{
      const r = await api.post('/notify/outbox/send-pending', { limit:20 });
      await dialog.alert(`${r.data.sent} terkirim, ${r.data.failed} gagal dari ${r.data.processed} pesan.`, { title:'Kirim antrian', tone:'success' });
      load();
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal' }); }
    finally{ setBusy(false); }
  };
  const queueMessage = async ()=>{
    if(!form.recipient.trim()) return dialog.alert('Isi nomor/email tujuan.', { title:'Kirim pesan' });
    if(!form.body.trim()) return dialog.alert('Isi pesan dulu.', { title:'Kirim pesan' });
    setBusy(true);
    try{
      await api.post('/notify/outbox', form);
      setCompose(false); setForm({ channel:'WA', recipient:'', subject:'', body:'' });
      await dialog.alert('Pesan masuk antrian (QUEUED). Kirim lewat tombol "Kirim Antrian" atau per baris.', { title:'Tersimpan', tone:'success' });
      load();
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal' }); }
    finally{ setBusy(false); }
  };
  const saveTemplate = async ()=>{
    if(!tplEdit) return;
    try{
      await api.put('/notify/templates/'+tplEdit, { name:tplForm.name, channel:tplForm.channel, subject:tplForm.subject, body:tplForm.body });
      setTplEdit(null);
      await dialog.alert('Template diperbarui.', { title:'Tersimpan', tone:'success' });
      load();
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal' }); }
  };

  const consoleMode = status && (status.wa==='console' || status.email==='console');

  return (
    <div className="space-y-3">
      <PosPageHeader icon={Send} title="Pusat Notifikasi"
        subtitle="Antrian pesan keluar (WA/Email/SMS) + template — dipakai penagihan, order, dan approval"
        badge={stats.QUEUED? stats.QUEUED+' antri' : null}
        actions={<>
          <button onClick={load} className={posBtnSecondary+' h-9 px-3 text-xs'}><RefreshCw size={13} className={loading?'animate-spin':''}/> Muat</button>
          <button onClick={sendPending} disabled={busy || !stats.QUEUED} className={posBtnSecondary+' h-9 px-3 text-xs'}><Send size={12}/> Kirim Antrian</button>
          <button onClick={()=>setCompose(true)} className={posBtnPrimary+' h-9 px-3 text-xs'}><Plus size={13}/> Pesan Baru</button>
        </>}/>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PosStat icon={Send} tone="bg-amber-50 text-amber-700" label="ANTRIAN" value={String(stats.QUEUED||0)} sub="belum diproses"/>
        <PosStat icon={MessageSquare} tone="bg-emerald-50 text-emerald-700" label="TERKIRIM" value={String(stats.SENT||0)} sub="diproses provider"/>
        <PosStat icon={X} tone="bg-red-50 text-red-700" label="GAGAL" value={String(stats.FAILED||0)} sub="perlu retry"/>
        <PosStat icon={FileText} tone="bg-brand/10 text-brand" label="TEMPLATE" value={String(templates.length)} sub="aktif untuk pesan cepat"/>
      </div>

      {consoleMode && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900 flex gap-2">
          <Info size={14} className="shrink-0 mt-0.5"/>
          <div>
            <b>Mode console:</b> gateway WA/Email belum diset (<span className="font-mono">WA_GATEWAY_URL</span>, <span className="font-mono">SMTP_URL</span>).
            Pesan tetap tercatat di outbox dengan status SENT + provider <b>console</b>, tetapi <b>tidak benar-benar terkirim</b> ke penerima.
            Isi env tersebut di container untuk mengaktifkan pengiriman nyata.
          </div>
        </div>
      )}

      <PosCard>
        <PosCardBody className="flex flex-wrap items-center gap-2">
          <PosChipRow>
            <PosChip active={tab==='outbox'} onClick={()=>setTab('outbox')}>Outbox</PosChip>
            <PosChip active={tab==='templates'} onClick={()=>setTab('templates')}>Template</PosChip>
          </PosChipRow>
          {tab==='outbox' && (
            <div className="ml-auto flex gap-1.5">
              {['Semua','QUEUED','SENT','FAILED'].map(s=> <PosChip key={s} active={filter===s} onClick={()=>setFilter(s)}>{s}</PosChip>)}
            </div>
          )}
        </PosCardBody>

        {loading ? <PosSkeleton rows={6} cols={6}/> : err ? <PosError message={err} onRetry={load}/> : tab==='outbox' ? (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-surface-3 border-y border-line text-[11px] font-bold tracking-wider text-ink-2">
                <PosTh>TUJUAN</PosTh><PosTh align="center">CHANNEL</PosTh><PosTh>PESAN</PosTh><PosTh align="center">STATUS</PosTh>
                <PosTh align="center">WAKTU</PosTh><PosTh align="center">AKSI</PosTh>
              </tr></thead>
              <tbody>
                {outbox.map(o=>{
                  const Icon = CH_ICON[o.channel]||MessageSquare;
                  return (
                    <tr key={o.id} className={posTr}>
                      <td className={posTd}>
                        <div className="font-mono text-xs font-bold">{o.recipient}</div>
                        <div className="text-[10px] text-ink-3">{o.template_key||'manual'}{o.created_by_name? ' • '+o.created_by_name:''}</div>
                      </td>
                      <td className={posTd+' text-center'}><span className="inline-flex items-center gap-1 text-[11px] font-bold"><Icon size={12}/>{o.channel}</span></td>
                      <td className={posTd+' text-xs max-w-[380px]'}>
                        {o.subject && <div className="font-semibold">{o.subject}</div>}
                        <div className="text-ink-2 line-clamp-2">{o.body}</div>
                        {o.last_error && <div className="text-[10px] text-amber-700 mt-0.5">{String(o.last_error).slice(0,120)}</div>}
                      </td>
                      <td className={posTd+' text-center'}>
                        <PosBadge tone={TONE[o.status]||'slate'}>{o.status}</PosBadge>
                        {o.provider && <div className="text-[10px] text-ink-3 mt-0.5">{o.provider}</div>}
                      </td>
                      <td className={posTd+' text-center text-[10px] text-ink-3'}>{tgl(o.sent_at||o.created_at)}</td>
                      <td className={posTd+' text-center whitespace-nowrap'}>
                        {o.status==='QUEUED' && <button onClick={()=>sendOne(o)} className="text-[11px] font-bold text-brand hover:underline mr-2">Kirim</button>}
                        {o.status==='FAILED' && <button onClick={()=>retry(o)} className="text-[11px] font-bold text-amber-700 hover:underline mr-2 inline-flex items-center gap-0.5"><RotateCcw size={10}/> Retry</button>}
                        <button onClick={()=>del(o)} className="text-red-600 hover:underline"><Trash2 size={12}/></button>
                      </td>
                    </tr>
                  );
                })}
                {!outbox.length && <PosEmpty colSpan={6} text="Outbox kosong" hint="Pesan dari penagihan/order akan muncul di sini."/>}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-surface-3 border-y border-line text-[11px] font-bold tracking-wider text-ink-2">
                <PosTh>KEY</PosTh><PosTh>NAMA</PosTh><PosTh align="center">CHANNEL</PosTh><PosTh>SUBJEK</PosTh><PosTh align="center">AKSI</PosTh>
              </tr></thead>
              <tbody>
                {templates.map(t=>(
                  <tr key={t.key} className={posTr}>
                    <td className={posTd+' font-mono text-xs'}>{t.key}</td>
                    <td className={posTd+' text-xs font-semibold'}>{t.name}</td>
                    <td className={posTd+' text-center text-[11px]'}>{t.channel}</td>
                    <td className={posTd+' text-xs text-ink-2'}>{t.subject||'-'}</td>
                    <td className={posTd+' text-center'}>
                      <button onClick={()=>{ setTplEdit(t.key); setTplForm({ name:t.name||'', channel:t.channel||'WA', subject:t.subject||'', body:t.body||'' }); }}
                        className="text-[11px] font-bold text-brand hover:underline">Ubah</button>
                    </td>
                  </tr>
                ))}
                {!templates.length && <PosEmpty colSpan={5} text="Belum ada template"/>}
              </tbody>
            </table>
          </div>
        )}
      </PosCard>

      {compose && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm" onClick={()=>!busy&&setCompose(false)}/>
          <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl border border-line p-5 space-y-3">
            <div className="flex items-start justify-between">
              <h3 className="font-bold text-sm flex items-center gap-1.5"><Send size={15} className="text-brand"/> Pesan Baru</h3>
              <button onClick={()=>!busy&&setCompose(false)} className="h-7 w-7 grid place-items-center rounded-full border"><X size={13}/></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1"><span className="text-[11px] font-bold text-ink-2">Channel</span>
                <PosSelect value={form.channel} onChange={v=>setForm(f=>({...f,channel:v}))}>
                  <option value="WA">WhatsApp</option><option value="EMAIL">Email</option><option value="SMS">SMS</option>
                </PosSelect>
              </label>
              <label className="block space-y-1"><span className="text-[11px] font-bold text-ink-2">Tujuan</span>
                <input value={form.recipient} onChange={e=>setForm(f=>({...f,recipient:e.target.value}))} placeholder="0812... / email@domain" className={posInput}/>
              </label>
            </div>
            <label className="block space-y-1"><span className="text-[11px] font-bold text-ink-2">Subjek (opsional)</span>
              <input value={form.subject} onChange={e=>setForm(f=>({...f,subject:e.target.value}))} className={posInput}/>
            </label>
            <label className="block space-y-1"><span className="text-[11px] font-bold text-ink-2">Isi pesan</span>
              <textarea value={form.body} onChange={e=>setForm(f=>({...f,body:e.target.value}))} rows={4} className={posInput+' h-auto py-2'}/>
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={()=>setCompose(false)} disabled={busy} className={posBtnSecondary+' h-9 px-4 text-xs'}>Batal</button>
              <button onClick={queueMessage} disabled={busy} className={posBtnPrimary+' h-9 px-4 text-xs'}>{busy?'Menyimpan...':'Masukkan Antrian'}</button>
            </div>
          </div>
        </div>
      )}

      {tplEdit && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm" onClick={()=>setTplEdit(null)}/>
          <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl border border-line p-5 space-y-3">
            <div className="flex items-start justify-between">
              <h3 className="font-bold text-sm">Template <span className="font-mono text-xs text-ink-3">{tplEdit}</span></h3>
              <button onClick={()=>setTplEdit(null)} className="h-7 w-7 grid place-items-center rounded-full border"><X size={13}/></button>
            </div>
            <p className="text-[11px] text-ink-2">Pakai placeholder <span className="font-mono">{'{{nama}}'}</span>, mis. <span className="font-mono">{'{{customer}}'}</span>, <span className="font-mono">{'{{invoice}}'}</span>, <span className="font-mono">{'{{amount}}'}</span>.</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1"><span className="text-[11px] font-bold text-ink-2">Nama</span>
                <input value={tplForm.name} onChange={e=>setTplForm(f=>({...f,name:e.target.value}))} className={posInput}/>
              </label>
              <label className="block space-y-1"><span className="text-[11px] font-bold text-ink-2">Channel</span>
                <PosSelect value={tplForm.channel} onChange={v=>setTplForm(f=>({...f,channel:v}))}>
                  <option value="WA">WhatsApp</option><option value="EMAIL">Email</option><option value="SMS">SMS</option>
                </PosSelect>
              </label>
            </div>
            <label className="block space-y-1"><span className="text-[11px] font-bold text-ink-2">Subjek</span>
              <input value={tplForm.subject} onChange={e=>setTplForm(f=>({...f,subject:e.target.value}))} className={posInput}/>
            </label>
            <label className="block space-y-1"><span className="text-[11px] font-bold text-ink-2">Isi</span>
              <textarea value={tplForm.body} onChange={e=>setTplForm(f=>({...f,body:e.target.value}))} rows={4} className={posInput+' h-auto py-2'}/>
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={()=>setTplEdit(null)} className={posBtnSecondary+' h-9 px-4 text-xs'}>Batal</button>
              <button onClick={saveTemplate} className={posBtnPrimary+' h-9 px-4 text-xs'}><Save size={13}/> Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
