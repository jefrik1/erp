import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CreditCard, RefreshCw, ShieldOff, ShieldCheck, Handshake, Mail, Phone, AlertTriangle,
  CheckCircle2, XCircle, Send, Plus, X, Users, Wallet,
} from 'lucide-react';
import api from '../lib/api';
import {
  PosPageHeader, PosCard, PosCardBody, PosBadge, PosEmpty, PosSkeleton, PosError, PosStat,
  PosTh, posTr, posTd, posInput, posBtnPrimary, posBtnSecondary, PosSelect, PosChipRow, PosChip,
} from '../components/PosUI';
import { useDialog } from '../components/DialogProvider';
import { useAuth } from '../store/auth';
import { canAccess } from '../config/access';

const nf = (n)=> new Intl.NumberFormat('id-ID').format(Math.round(Number(n)||0));
const rupiah = (n)=> 'Rp ' + nf(n);
const tgl = (d)=> d ? String(d).slice(0,10).split('-').reverse().join('/') : '-';

export default function CreditControl(){
  const dialog = useDialog();
  const roles = useAuth(s=>s.user)?.roles || [];
  const isDirector = canAccess(roles, ['direktur','super_admin']);

  const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  const [ar,setAr]=useState([]);
  const [holds,setHolds]=useState([]);
  const [ptp,setPtp]=useState([]);
  const [dunning,setDunning]=useState([]);
  const [reminders,setReminders]=useState([]);
  const [tab,setTab]=useState('prioritas');

  // modal janji bayar
  const [ptpOpen,setPtpOpen]=useState(false);
  const [ptpInv,setPtpInv]=useState(''); const [ptpDate,setPtpDate]=useState(''); const [ptpAmt,setPtpAmt]=useState(''); const [ptpNote,setPtpNote]=useState(''); const [ptpBusy,setPtpBusy]=useState(false);
  // modal surat penagihan
  const [dunOpen,setDunOpen]=useState(false);
  const [dunInv,setDunInv]=useState(''); const [dunLevel,setDunLevel]=useState('1'); const [dunVia,setDunVia]=useState('WA'); const [dunContent,setDunContent]=useState(''); const [dunBusy,setDunBusy]=useState(false);
  // modal hold
  const [holdOpen,setHoldOpen]=useState(null); const [holdReason,setHoldReason]=useState(''); const [holdBusy,setHoldBusy]=useState(false);

  const load = useCallback(async ()=>{
    setLoading(true); setErr('');
    try{
      const [a,h,p,d,r] = await Promise.all([
        api.get('/finance/ar').catch(()=>({data:[]})),
        api.get('/credit/holds').catch(()=>({data:[]})),
        api.get('/credit/promises').catch(()=>({data:[]})),
        api.get('/credit/dunning').catch(()=>({data:[]})),
        api.get('/credit/reminders').catch(()=>({data:[]})),
      ]);
      setAr(Array.isArray(a.data)?a.data:[]);
      setHolds(Array.isArray(h.data)?h.data:[]);
      setPtp(Array.isArray(p.data)?p.data:[]);
      setDunning(Array.isArray(d.data)?d.data:[]);
      setReminders(Array.isArray(r.data)?r.data:[]);
    }catch(e){ setErr(e.response?.data?.error||e.message||'Gagal memuat data kolektibilitas'); }
    finally{ setLoading(false); }
  },[]);
  useEffect(()=>{ load(); },[load]);

  const open = useMemo(()=> (ar||[]).filter(a=> String(a.status||'').toUpperCase()!=='PAID' && Number(a.outstanding ?? (Number(a.total||0)-Number(a.paid_amount||0)))>0.5), [ar]);
  const overdue = useMemo(()=> open.filter(a=> parseInt(a.overdue_days||0) > 0), [open]);
  const totalOpen = useMemo(()=> open.reduce((s,a)=> s + Number(a.outstanding ?? (Number(a.total||0)-Number(a.paid_amount||0))),0), [open]);
  const totalOverdue = useMemo(()=> overdue.reduce((s,a)=> s + Number(a.outstanding ?? (Number(a.total||0)-Number(a.paid_amount||0))),0), [overdue]);
  const customers = useMemo(()=>{
    const map = new Map();
    for(const a of open){
      const k = a.customer_id;
      if(!k) continue;
      const cur = map.get(k) || { customer_id:k, name:a.customer_name, code:a.customer_code, outstanding:0, invoices:0, max_overdue:0 };
      cur.outstanding += Number(a.outstanding ?? (Number(a.total||0)-Number(a.paid_amount||0)));
      cur.invoices += 1;
      cur.max_overdue = Math.max(cur.max_overdue, parseInt(a.overdue_days||0));
      map.set(k, cur);
    }
    return [...map.values()].sort((a,b)=> b.outstanding - a.outstanding);
  }, [open]);
  const holdIds = useMemo(()=> new Set((holds||[]).map(h=>h.id)), [holds]);

  const doHold = async ()=>{
    if(!holdOpen) return;
    if(!holdReason.trim()) return dialog.alert('Isi alasan blokir supaya audit jelas.', { title:'Blokir pelanggan' });
    setHoldBusy(true);
    try{
      await api.post('/credit/hold', { customer_id: holdOpen.customer_id, reason: holdReason.trim() });
      setHoldOpen(null); setHoldReason('');
      await dialog.alert('Pelanggan diblokir. Sales tidak bisa membuat order baru sampai blokir dibuka Direktur.', { title:'HOLD aktif', tone:'success' });
      load();
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal memblokir' }); }
    finally{ setHoldBusy(false); }
  };
  const doUnhold = async (c)=>{
    const ok = await dialog.confirm(`Buka blokir ${c.name||c.customer_name}? Pastikan tunggakan sudah ada penyelesaian.`, { title:'Buka blokir', confirmText:'Ya, buka' });
    if(!ok) return;
    try{ await api.post('/credit/unhold', { customer_id: c.id }); load(); }
    catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal membuka blokir' }); }
  };
  const doPtp = async ()=>{
    const inv = open.find(a=>String(a.id)===String(ptpInv));
    if(!inv) return dialog.alert('Pilih invoice yang dijanjikan.', { title:'Janji bayar' });
    if(!ptpDate) return dialog.alert('Isi tanggal janji bayar.', { title:'Janji bayar' });
    setPtpBusy(true);
    try{
      await api.post('/credit/promises', {
        customer_id: inv.customer_id, invoice_id: inv.id, promise_date: ptpDate,
        amount: parseFloat(ptpAmt)||Number(inv.outstanding||0), notes: ptpNote||null,
      });
      setPtpOpen(false); setPtpInv(''); setPtpDate(''); setPtpAmt(''); setPtpNote('');
      await dialog.alert('Janji bayar dicatat. Tandai FULFILLED saat pelanggan membayar — invoice ikut terlunasi otomatis.', { title:'Tersimpan', tone:'success' });
      load();
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal menyimpan' }); }
    finally{ setPtpBusy(false); }
  };
  const setPtpStatus = async (row, status)=>{
    if(status==='FULFILLED'){
      const ok = await dialog.confirm(`Tandai janji ${row.customer_name} sebagai FULFILLED? Invoice ${row.invoice_number||''} akan dicatat lunas sebesar janji.`, { title:'Janji terpenuhi', confirmText:'Ya, lunasi' });
      if(!ok) return;
    }
    try{ const r = await api.patch('/credit/promises/'+row.id, { status }); await dialog.alert(r.data?.note||'Status diperbarui', { title:'Update janji bayar' }); load(); }
    catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal update' }); }
  };
  const doDunning = async ()=>{
    const inv = open.find(a=>String(a.id)===String(dunInv));
    if(!inv) return dialog.alert('Pilih invoice yang ditagih.', { title:'Surat penagihan' });
    setDunBusy(true);
    try{
      await api.post('/credit/dunning', {
        customer_id: inv.customer_id, invoice_id: inv.id, level: parseInt(dunLevel)||1,
        content: dunContent || `Penagihan level ${dunLevel} untuk ${inv.invoice_number} sebesar ${rupiah(inv.outstanding)}`,
        sent_via: dunVia,
      });
      setDunOpen(false); setDunInv(''); setDunContent('');
      await dialog.alert('Surat penagihan dicatat di riwayat.', { title:'Terkirim', tone:'success' });
      load();
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal mencatat' }); }
    finally{ setDunBusy(false); }
  };

  return (
    <div className="space-y-3">
      <PosPageHeader icon={CreditCard} title="Kolektibilitas & Penagihan"
        subtitle="Prioritas penagihan, blokir pelanggan menunggak, janji bayar, dan surat penagihan (dunning)"
        badge={holds.length? holds.length+' HOLD' : null}
        actions={<button onClick={load} className={posBtnSecondary+' h-9 px-4 text-xs'}><RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang</button>}/>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PosStat icon={Wallet} tone="bg-brand/10 text-brand" label="PIUTANG TERBUKA" value={rupiah(totalOpen)} sub={open.length+' invoice'}/>
        <PosStat icon={AlertTriangle} tone="bg-amber-50 text-amber-700" label="LEWAT JATUH TEMPO" value={rupiah(totalOverdue)} sub={overdue.length+' invoice'}/>
        <PosStat icon={ShieldOff} tone="bg-red-50 text-red-700" label="PELANGGAN HOLD" value={nf(holds.length)} sub="order diblokir"/>
        <PosStat icon={Handshake} tone="bg-emerald-50 text-emerald-700" label="JANJI BAYAR" value={nf((ptp||[]).filter(p=>String(p.status||'PENDING').toUpperCase()==='PENDING').length)} sub="menunggu realisasi"/>
      </div>

      <PosCard>
        <PosCardBody className="space-y-2">
          <PosChipRow>
            <PosChip active={tab==='prioritas'} onClick={()=>setTab('prioritas')}>Prioritas Penagihan</PosChip>
            <PosChip active={tab==='hold'} onClick={()=>setTab('hold')}>Pelanggan HOLD{holds.length? ' ('+holds.length+')':''}</PosChip>
            <PosChip active={tab==='ptp'} onClick={()=>setTab('ptp')}>Janji Bayar{ptp.length? ' ('+ptp.length+')':''}</PosChip>
            <PosChip active={tab==='dunning'} onClick={()=>setTab('dunning')}>Surat Penagihan{dunning.length? ' ('+dunning.length+')':''}</PosChip>
          </PosChipRow>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-2">
            <span className="px-2 py-0.5 rounded-full bg-white border font-bold">Reminder H-7 / H-3 / H-1 / H+ (jatuh tempo)</span>
            {reminders.length>0 && <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 font-bold text-amber-800">{reminders.length} invoice masuk jadwal pengingat</span>}
            <span className="ml-auto">Sumber: invoice AR + limit kredit pelanggan</span>
          </div>
        </PosCardBody>

        {loading ? <PosSkeleton rows={6} cols={5}/> : err ? <PosError message={err} onRetry={load}/> : (
          <>
            {tab==='prioritas' && (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-surface-3 border-y border-line text-[11px] font-bold tracking-wider text-ink-2">
                    <PosTh>PELANGGAN</PosTh><PosTh align="right">PIUTANG</PosTh><PosTh align="center">INVOICE</PosTh>
                    <PosTh align="center">OVERDUE</PosTh><PosTh align="center">STATUS</PosTh><PosTh align="center">AKSI</PosTh>
                  </tr></thead>
                  <tbody>
                    {customers.map(c=>{
                      const hold = holdIds.has(c.customer_id);
                      return (
                        <tr key={c.customer_id} className={posTr}>
                          <td className={posTd}>
                            <div className="font-bold text-ink">{c.name||'-'}</div>
                            <div className="text-[11px] font-mono text-ink-2">{c.code||''}</div>
                          </td>
                          <td className={posTd+' text-right font-bold tabular-nums'}>{rupiah(c.outstanding)}</td>
                          <td className={posTd+' text-center tabular-nums'}>{c.invoices}</td>
                          <td className={posTd+' text-center'}>
                            {c.max_overdue>0 ? <PosBadge tone="red">{c.max_overdue} hari</PosBadge> : <PosBadge tone="emerald">belum</PosBadge>}
                          </td>
                          <td className={posTd+' text-center'}>{hold? <PosBadge tone="red">HOLD</PosBadge> : <PosBadge tone="emerald">AKTIF</PosBadge>}</td>
                          <td className={posTd+' text-center whitespace-nowrap'}>
                            <button onClick={()=>{ setHoldOpen({customer_id:c.customer_id, name:c.name}); setHoldReason(''); }}
                              className="text-[11px] font-bold text-red-600 hover:underline mr-2">Blokir</button>
                            <button onClick={()=>{ setPtpOpen(true); setPtpInv(''); setPtpDate(new Date(Date.now()+7*86400000).toISOString().slice(0,10)); setPtpAmt(''); setPtpNote(''); }}
                              className="text-[11px] font-bold text-brand hover:underline">Janji</button>
                          </td>
                        </tr>
                      );
                    })}
                    {!customers.length && <PosEmpty colSpan={6} text="Tidak ada piutang terbuka" hint="Semua invoice sudah lunas."/>}
                  </tbody>
                </table>
              </div>
            )}

            {tab==='hold' && (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-surface-3 border-y border-line text-[11px] font-bold tracking-wider text-ink-2">
                    <PosTh>PELANGGAN</PosTh><PosTh>ALASAN BLOKIR</PosTh><PosTh align="center">AKSI</PosTh>
                  </tr></thead>
                  <tbody>
                    {(holds||[]).map(h=>(
                      <tr key={h.id} className={posTr}>
                        <td className={posTd}>
                          <div className="font-bold">{h.name}</div>
                          <div className="text-[11px] font-mono text-ink-2">{h.code||''} {h.phone? '• '+h.phone:''}</div>
                        </td>
                        <td className={posTd+' text-xs text-ink-2'}>{h.hold_reason||'-'}</td>
                        <td className={posTd+' text-center'}>
                          {isDirector
                            ? <button onClick={()=>doUnhold(h)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-600 text-white text-[11px] font-bold"><ShieldCheck size={11}/> Buka blokir</button>
                            : <span className="text-[11px] text-ink-3">Hanya Direktur</span>}
                        </td>
                      </tr>
                    ))}
                    {!holds.length && <PosEmpty colSpan={3} text="Tidak ada pelanggan diblokir"/>}
                  </tbody>
                </table>
              </div>
            )}

            {tab==='ptp' && (
              <>
                <PosCardBody className="flex justify-end">
                  <button onClick={()=>{ setPtpOpen(true); setPtpInv(''); setPtpDate(new Date(Date.now()+7*86400000).toISOString().slice(0,10)); setPtpAmt(''); setPtpNote(''); }} className={posBtnPrimary+' h-9 px-4 text-xs'}><Plus size={13}/> Catat Janji Bayar</button>
                </PosCardBody>
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-surface-3 border-y border-line text-[11px] font-bold tracking-wider text-ink-2">
                      <PosTh>PELANGGAN</PosTh><PosTh>INVOICE</PosTh><PosTh align="center">TANGGAL JANJI</PosTh>
                      <PosTh align="right">NOMINAL</PosTh><PosTh align="center">STATUS</PosTh><PosTh align="center">AKSI</PosTh>
                    </tr></thead>
                    <tbody>
                      {(ptp||[]).map(p=>{
                        const st = String(p.status||'PENDING').toUpperCase();
                        const late = st==='PENDING' && p.promise_date && String(p.promise_date).slice(0,10) < new Date().toISOString().slice(0,10);
                        return (
                          <tr key={p.id} className={posTr}>
                            <td className={posTd+' font-semibold'}>{p.customer_name||'-'}</td>
                            <td className={posTd+' font-mono text-[11px]'}>{p.invoice_number||'-'}</td>
                            <td className={posTd+' text-center text-xs'}>
                              {tgl(p.promise_date)} {late && <PosBadge tone="red">lewat</PosBadge>}
                            </td>
                            <td className={posTd+' text-right tabular-nums font-bold'}>{rupiah(p.amount)}</td>
                            <td className={posTd+' text-center'}>
                              <PosBadge tone={st==='FULFILLED'?'emerald':st==='BROKEN'?'red':'amber'}>{st}</PosBadge>
                            </td>
                            <td className={posTd+' text-center whitespace-nowrap'}>
                              {st==='PENDING' && (<>
                                <button onClick={()=>setPtpStatus(p,'FULFILLED')} className="text-[11px] font-bold text-emerald-700 hover:underline mr-2">Lunas</button>
                                <button onClick={()=>setPtpStatus(p,'BROKEN')} className="text-[11px] font-bold text-red-600 hover:underline">Ingkar</button>
                              </>)}
                              {st!=='PENDING' && <span className="text-[11px] text-ink-3">-</span>}
                            </td>
                          </tr>
                        );
                      })}
                      {!ptp.length && <PosEmpty colSpan={6} text="Belum ada janji bayar" hint="Catat komitmen pelanggan agar penagihan terukur."/>}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {tab==='dunning' && (
              <>
                <PosCardBody className="flex justify-end">
                  <button onClick={()=>{ setDunOpen(true); setDunInv(''); setDunLevel('1'); setDunVia('WA'); setDunContent(''); }} className={posBtnPrimary+' h-9 px-4 text-xs'}><Mail size={13}/> Buat Surat Penagihan</button>
                </PosCardBody>
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-surface-3 border-y border-line text-[11px] font-bold tracking-wider text-ink-2">
                      <PosTh>TANGGAL</PosTh><PosTh>PELANGGAN</PosTh><PosTh>INVOICE</PosTh>
                      <PosTh align="center">LEVEL</PosTh><PosTh align="center">VIA</PosTh><PosTh>ISI</PosTh>
                    </tr></thead>
                    <tbody>
                      {(dunning||[]).map(d=>(
                        <tr key={d.id} className={posTr}>
                          <td className={posTd+' text-xs whitespace-nowrap'}>{tgl(d.letter_date)}</td>
                          <td className={posTd+' font-semibold'}>{d.customer_name||'-'}</td>
                          <td className={posTd+' font-mono text-[11px]'}>{d.invoice_number||'-'}</td>
                          <td className={posTd+' text-center'}><PosBadge tone={Number(d.level)>=3?'red':Number(d.level)===2?'amber':'sky'}>L{d.level}</PosBadge></td>
                          <td className={posTd+' text-center text-[11px]'}>{d.sent_via||'-'}</td>
                          <td className={posTd+' text-[11px] text-ink-2'}>{d.content||'-'}</td>
                        </tr>
                      ))}
                      {!dunning.length && <PosEmpty colSpan={6} text="Belum ada surat penagihan"/>}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </PosCard>

      {/* Modal blokir pelanggan */}
      {holdOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm" onClick={()=>!holdBusy&&setHoldOpen(null)}/>
          <div className="relative z-10 w-full max-w-md bg-white rounded-2xl border border-line p-5 space-y-3">
            <div className="flex items-start justify-between">
              <h3 className="font-bold text-sm flex items-center gap-1.5"><ShieldOff size={15} className="text-red-600"/> Blokir Pelanggan</h3>
              <button onClick={()=>!holdBusy&&setHoldOpen(null)} className="h-7 w-7 grid place-items-center rounded-full border"><X size={13}/></button>
            </div>
            <p className="text-xs text-ink-2">Pelanggan <b>{holdOpen.name}</b> tidak bisa membuat order baru sampai blokir dibuka Direktur. Tindakan ini tercatat di audit.</p>
            <label className="block space-y-1"><span className="text-[11px] font-bold text-ink-2">Alasan</span>
              <input value={holdReason} onChange={e=>setHoldReason(e.target.value)} placeholder="mis. tunggakan 2 invoice > 60 hari" className={posInput}/>
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={()=>setHoldOpen(null)} disabled={holdBusy} className={posBtnSecondary+' h-9 px-4 text-xs'}>Batal</button>
              <button onClick={doHold} disabled={holdBusy} className="h-9 px-4 rounded-xl bg-red-600 text-white text-xs font-bold disabled:opacity-50">Blokir Sekarang</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal janji bayar */}
      {ptpOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm" onClick={()=>!ptpBusy&&setPtpOpen(false)}/>
          <div className="relative z-10 w-full max-w-md bg-white rounded-2xl border border-line p-5 space-y-3">
            <div className="flex items-start justify-between">
              <h3 className="font-bold text-sm flex items-center gap-1.5"><Handshake size={15} className="text-emerald-600"/> Catat Janji Bayar</h3>
              <button onClick={()=>!ptpBusy&&setPtpOpen(false)} className="h-7 w-7 grid place-items-center rounded-full border"><X size={13}/></button>
            </div>
            <label className="block space-y-1"><span className="text-[11px] font-bold text-ink-2">Invoice</span>
              <select value={ptpInv} onChange={e=>{ const v=e.target.value; setPtpInv(v); const inv=open.find(a=>String(a.id)===String(v)); if(inv) setPtpAmt(String(Math.round(Number(inv.outstanding||0)))); }} className={posInput}>
                <option value="">Pilih invoice terbuka...</option>
                {open.map(a=> <option key={a.id} value={a.id}>{a.invoice_number} • {a.customer_name} • {rupiah(a.outstanding)}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1"><span className="text-[11px] font-bold text-ink-2">Tanggal janji</span>
                <input type="date" value={ptpDate} onChange={e=>setPtpDate(e.target.value)} className={posInput}/>
              </label>
              <label className="block space-y-1"><span className="text-[11px] font-bold text-ink-2">Nominal</span>
                <input type="number" value={ptpAmt} onChange={e=>setPtpAmt(e.target.value)} className={posInput}/>
              </label>
            </div>
            <label className="block space-y-1"><span className="text-[11px] font-bold text-ink-2">Catatan</span>
              <input value={ptpNote} onChange={e=>setPtpNote(e.target.value)} placeholder="mis. transfer setelah termin proyek cair" className={posInput}/>
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={()=>setPtpOpen(false)} disabled={ptpBusy} className={posBtnSecondary+' h-9 px-4 text-xs'}>Batal</button>
              <button onClick={doPtp} disabled={ptpBusy} className={posBtnPrimary+' h-9 px-4 text-xs'}>{ptpBusy?'Menyimpan...':'Simpan'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal surat penagihan */}
      {dunOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm" onClick={()=>!dunBusy&&setDunOpen(false)}/>
          <div className="relative z-10 w-full max-w-md bg-white rounded-2xl border border-line p-5 space-y-3">
            <div className="flex items-start justify-between">
              <h3 className="font-bold text-sm flex items-center gap-1.5"><Mail size={15} className="text-brand"/> Surat Penagihan</h3>
              <button onClick={()=>!dunBusy&&setDunOpen(false)} className="h-7 w-7 grid place-items-center rounded-full border"><X size={13}/></button>
            </div>
            <label className="block space-y-1"><span className="text-[11px] font-bold text-ink-2">Invoice</span>
              <select value={dunInv} onChange={e=>{ setDunInv(e.target.value); const inv=open.find(a=>String(a.id)===String(e.target.value)); if(inv) setDunContent(`Penagihan untuk ${inv.invoice_number} (${inv.customer_name}) sebesar ${rupiah(inv.outstanding)}, jatuh tempo ${tgl(inv.due_date)}.`); }} className={posInput}>
                <option value="">Pilih invoice...</option>
                {open.map(a=> <option key={a.id} value={a.id}>{a.invoice_number} • {a.customer_name} • {rupiah(a.outstanding)}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1"><span className="text-[11px] font-bold text-ink-2">Level</span>
                <select value={dunLevel} onChange={e=>setDunLevel(e.target.value)} className={posInput}>
                  <option value="1">1 - Pengingat</option><option value="2">2 - Teguran</option><option value="3">3 - Peringatan akhir</option>
                </select>
              </label>
              <label className="block space-y-1"><span className="text-[11px] font-bold text-ink-2">Kirim via</span>
                <select value={dunVia} onChange={e=>setDunVia(e.target.value)} className={posInput}>
                  <option value="WA">WhatsApp</option><option value="EMAIL">Email</option><option value="SURAT">Surat</option>
                </select>
              </label>
            </div>
            <label className="block space-y-1"><span className="text-[11px] font-bold text-ink-2">Isi penagihan</span>
              <textarea value={dunContent} onChange={e=>setDunContent(e.target.value)} rows={3} className={posInput+' h-auto py-2'} placeholder="Isi pesan penagihan..."/>
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={()=>setDunOpen(false)} disabled={dunBusy} className={posBtnSecondary+' h-9 px-4 text-xs'}>Batal</button>
              <button onClick={doDunning} disabled={dunBusy} className={posBtnPrimary+' h-9 px-4 text-xs'}>{dunBusy?'Menyimpan...':<><Send size={13}/> Catat</>}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
