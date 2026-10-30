import { useCallback, useEffect, useState } from 'react';
import { Landmark, RefreshCw, Upload, CheckCircle2, XCircle, Link2, Ban, Wand2 } from 'lucide-react';
import api from '../lib/api';
import {
  PosPageHeader, PosCard, PosCardBody, PosBadge, PosEmpty, PosSkeleton, PosError, PosStat,
  PosTh, posTr, posTd, posInput, posBtnPrimary, posBtnSecondary, PosSelect,
} from '../components/PosUI';
import { useDialog } from '../components/DialogProvider';

const nf = (n)=> new Intl.NumberFormat('id-ID').format(Math.round(Number(n)||0));
const rupiah = (n)=> 'Rp ' + nf(n);
const tgl = (v)=> v ? String(v).slice(0,10).split('-').reverse().join('/') : '-';
const thisPeriod = ()=> new Date(Date.now()+7*3600*1000).toISOString().slice(0,7);

export default function BankRecon(){
  const dialog = useDialog();
  const [accounts,setAccounts]=useState([]);
  const [accountId,setAccountId]=useState('');
  const [period,setPeriod]=useState(thisPeriod());
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(false); const [err,setErr]=useState('');
  const [busy,setBusy]=useState(false);
  const [importOpen,setImportOpen]=useState(false);
  const [csv,setCsv]=useState('');

  const loadAccounts = useCallback(async ()=>{
    try{
      const r = await api.get('/finance/cash');
      const list = (Array.isArray(r.data)? r.data:[]).filter(c=>String(c.kind||'BANK').toUpperCase()!=='CASH');
      setAccounts(list);
      if(!accountId && list[0]) setAccountId(String(list[0].id));
    }catch{}
  },[]);
  useEffect(()=>{ loadAccounts(); },[]);

  const load = useCallback(async ()=>{
    if(!accountId) return;
    setLoading(true); setErr('');
    try{ const r=await api.get('/finance/recon',{params:{account_id:accountId, period}}); setData(r.data); }
    catch(e){ setErr(e.response?.data?.error||e.message||'Gagal memuat rekonsiliasi'); }
    finally{ setLoading(false); }
  },[accountId,period]);
  useEffect(()=>{ load(); },[load]);

  const importCsv = async ()=>{
    // format: tanggal,deskripsi,nominal,ref (nominal negatif = uang keluar)
    const rows = csv.split('\n').map(l=>l.trim()).filter(Boolean).map(l=>{
      const [date, description, amount, ref] = l.split(/[,;\t]/).map(s=>s.trim());
      return { date, description, amount: Number(String(amount||'').replace(/[^0-9.-]/g,'')), ref };
    }).filter(r=>r.date && isFinite(r.amount) && r.amount!==0);
    if(!rows.length) return dialog.alert('Tidak ada baris valid. Format: tanggal,deskripsi,nominal,ref', { title:'Impor mutasi' });
    setBusy(true);
    try{
      const r = await api.post('/finance/recon/import', { account_id: parseInt(accountId), rows });
      setImportOpen(false); setCsv('');
      await dialog.alert(r.data.message, { title:'Impor selesai', tone:'success' });
      load();
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal impor' }); }
    finally{ setBusy(false); }
  };

  const auto = async ()=>{
    setBusy(true);
    try{ const r=await api.post('/finance/recon/auto',{account_id:parseInt(accountId)}); await dialog.alert(`${r.data.matched} baris otomatis cocok.`, { title:'Auto-match', tone:'success' }); load(); }
    catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal' }); }
    finally{ setBusy(false); }
  };

  const matchLine = async (line)=>{
    try{
      const r = await api.get('/finance/recon/candidates/'+line.id);
      const cands = r.data.candidates||[];
      if(!cands.length) return dialog.alert('Tidak ada pembayaran yang belum dicocokkan. Catat pembayaran dulu di AR/AP.', { title:'Kandidat' });
      const pick = cands[0];
      const ok = await dialog.confirm(`Cocokkan baris ${rupiah(line.amount)} (${tgl(line.line_date)}) dengan pembayaran ${pick.payment_number} — ${rupiah(pick.amount)} (${tgl(pick.payment_date)})?`, { title:'Cocokkan', confirmText:'Ya, cocokkan' });
      if(!ok) return;
      await api.post(`/finance/recon/${line.id}/match`, { payment_id: pick.id });
      load();
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal mencocokkan' }); }
  };
  const unmatch = async (line)=>{ try{ await api.post(`/finance/recon/${line.id}/unmatch`); load(); }catch(e){ await dialog.alert(e.response?.data?.error||e.message,{title:'Gagal'}); } };
  const ignore = async (line)=>{ try{ await api.post(`/finance/recon/${line.id}/ignore`,{notes:'Diabaikan dari UI'}); load(); }catch(e){ await dialog.alert(e.response?.data?.error||e.message,{title:'Gagal'}); } };

  const s = data?.summary || {};

  return (
    <div className="space-y-3">
      <PosPageHeader icon={Landmark} title="Rekonsiliasi Bank"
        subtitle="Impor mutasi rekening → cocokkan otomatis dengan pembayaran → sisa dicocokkan manual"
        badge={s.unmatched? s.unmatched+' belum cocok' : null}
        actions={<>
          <button onClick={load} className={posBtnSecondary+' h-9 px-3 text-xs'}><RefreshCw size={13} className={loading?'animate-spin':''}/> Muat</button>
          <button onClick={auto} disabled={busy||!accountId} className={posBtnSecondary+' h-9 px-3 text-xs'}><Wand2 size={13}/> Auto-match</button>
          <button onClick={()=>setImportOpen(true)} disabled={!accountId} className={posBtnPrimary+' h-9 px-3 text-xs'}><Upload size={13}/> Impor Mutasi</button>
        </>}/>

      <PosCard>
        <PosCardBody className="flex flex-wrap items-center gap-2">
          <div className="min-w-[220px]">
            <PosSelect value={accountId} onChange={setAccountId}>
              {accounts.map(a=> <option key={a.id} value={a.id}>{a.bank_name} • {a.account_no} — {rupiah(a.balance)}</option>)}
            </PosSelect>
          </div>
          <input type="month" value={period} onChange={e=>setPeriod(e.target.value||thisPeriod())} className={posInput+' h-9 w-[150px] text-xs'}/>
          <span className="text-[11px] text-ink-3">Format impor: <span className="font-mono">tanggal,deskripsi,nominal,ref</span> — nominal negatif = uang keluar.</span>
        </PosCardBody>
      </PosCard>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PosStat icon={Landmark} tone="bg-brand/10 text-brand" label="BARIS MUTASI" value={String(s.total||0)} sub={data?.period||period}/>
        <PosStat icon={CheckCircle2} tone="bg-emerald-50 text-emerald-700" label="COCOK" value={String(s.matched||0)} sub={rupiah(s.matched_value||0)}/>
        <PosStat icon={XCircle} tone="bg-amber-50 text-amber-700" label="BELUM COCOK" value={String(s.unmatched||0)} sub={rupiah(s.unmatched_value||0)}/>
        <PosStat icon={Ban} tone="bg-slate-100 text-slate-700" label="DIABAIKAN" value={String(s.ignored||0)} sub="biaya admin / bukan transaksi"/>
      </div>

      <PosCard>
        {loading ? <PosSkeleton rows={6} cols={6}/> : err ? <PosError message={err} onRetry={load}/> : !(data?.lines||[]).length ? (
          <PosEmpty text="Belum ada mutasi untuk periode ini" hint='Klik "Impor Mutasi" dan tempel baris CSV dari rekening koran.'/>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-surface-3 border-y border-line text-[11px] font-bold tracking-wider text-ink-2">
                <PosTh>TANGGAL</PosTh><PosTh>DESKRIPSI</PosTh><PosTh align="right">NOMINAL</PosTh>
                <PosTh align="center">STATUS</PosTh><PosTh>COCOK DENGAN</PosTh><PosTh align="center">AKSI</PosTh>
              </tr></thead>
              <tbody>
                {(data?.lines||[]).map(l=>(
                  <tr key={l.id} className={posTr}>
                    <td className={posTd+' text-xs whitespace-nowrap'}>{tgl(l.line_date)}</td>
                    <td className={posTd+' text-xs'}>{l.description||'-'}{l.ref? <span className="block text-[10px] font-mono text-ink-3">{l.ref}</span>:null}</td>
                    <td className={'p-3 text-right tabular-nums font-semibold '+(Number(l.amount)<0?'text-red-600':'text-emerald-700')}>{rupiah(l.amount)}</td>
                    <td className={posTd+' text-center'}><PosBadge tone={l.status==='MATCHED'?'emerald':l.status==='IGNORED'?'slate':'amber'}>{l.status}</PosBadge></td>
                    <td className={posTd+' text-[11px]'}>{l.payment_number? <span className="font-mono">{l.payment_number}</span> : '-'}{l.payment_date? <span className="block text-[10px] text-ink-3">{tgl(l.payment_date)}</span>:null}</td>
                    <td className={posTd+' text-center whitespace-nowrap'}>
                      {l.status==='MATCHED'
                        ? <button onClick={()=>unmatch(l)} className="text-[11px] font-bold text-amber-700 hover:underline">Lepas</button>
                        : l.status==='IGNORED'
                          ? <button onClick={()=>unmatch(l)} className="text-[11px] font-bold text-brand hover:underline">Batalkan</button>
                          : <>
                              <button onClick={()=>matchLine(l)} className="text-[11px] font-bold text-brand hover:underline mr-2 inline-flex items-center gap-0.5"><Link2 size={10}/> Cocokkan</button>
                              <button onClick={()=>ignore(l)} className="text-[11px] font-bold text-ink-3 hover:underline">Abaikan</button>
                            </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PosCard>

      {importOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm" onClick={()=>!busy&&setImportOpen(false)}/>
          <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl border border-line p-5 space-y-3">
            <div className="font-bold text-sm">Impor Mutasi Rekening</div>
            <p className="text-[11px] text-ink-2">Tempel data dari rekening koran/CSV. Satu baris per transaksi: <span className="font-mono">tanggal,deskripsi,nominal,ref</span>. Contoh: <span className="font-mono">2026-10-30,TRF MASUK,1500000,INV-001</span></p>
            <textarea value={csv} onChange={e=>setCsv(e.target.value)} rows={8} className={posInput+' h-auto py-2 font-mono text-[11px]'} placeholder="2026-10-30,TRF MASUK,1500000,INV-001&#10;2026-10-30,BIAYA ADMIN,-6500,ADM"/>
            <div className="flex justify-end gap-2">
              <button onClick={()=>setImportOpen(false)} disabled={busy} className={posBtnSecondary+' h-9 px-4 text-xs'}>Batal</button>
              <button onClick={importCsv} disabled={busy} className={posBtnPrimary+' h-9 px-4 text-xs'}>{busy?'Mengimpor...':'Impor'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
