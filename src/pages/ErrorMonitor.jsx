import { useCallback, useEffect, useState } from 'react';
import { Bug, RefreshCw, CheckCircle2, AlertTriangle, Search, Activity, ExternalLink } from 'lucide-react';
import api from '../lib/api';
import {
  PosPageHeader, PosCard, PosCardBody, PosBadge, PosEmpty, PosSkeleton, PosError, PosStat,
  PosTh, posTr, posTd, posInput, posBtnSecondary, PosChipRow, PosChip,
} from '../components/PosUI';
import { useDialog } from '../components/DialogProvider';

const nf = (n)=> new Intl.NumberFormat('id-ID').format(Number(n)||0);
const waktu = (v)=> v ? String(v).replace('T',' ').slice(0,19) : '-';

export default function ErrorMonitor(){
  const dialog = useDialog();
  const [status,setStatus]=useState('open');
  const [search,setSearch]=useState('');
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  const [open,setOpen]=useState(null);

  const load = useCallback(async ()=>{
    setLoading(true); setErr('');
    try{ const r=await api.get('/errors',{ params:{ status, search: search||undefined } }); setData(r.data); }
    catch(e){ setErr(e.response?.data?.error||e.message||'Gagal memuat log error'); }
    finally{ setLoading(false); }
  },[status,search]);
  useEffect(()=>{ load(); },[load]);

  const resolve = async (row)=>{
    try{ await api.post(`/errors/${row.id}/resolve`); load(); }
    catch(e){ await dialog.alert(e.response?.data?.error||e.message,{title:'Gagal'}); }
  };
  const resolveAll = async ()=>{
    const ok = await dialog.confirm('Tandai SEMUA error terbuka sebagai selesai? Pastikan penyebabnya sudah diperbaiki — error yang muncul lagi akan otomatis terbuka kembali.', { title:'Selesaikan semua', confirmText:'Ya, tandai selesai' });
    if(!ok) return;
    try{ const r=await api.post('/errors/resolve-all',{}); await dialog.alert(`${r.data.resolved} error ditandai selesai.`,{title:'Selesai'}); load(); }
    catch(e){ await dialog.alert(e.response?.data?.error||e.message,{title:'Gagal'}); }
  };

  const s = data?.summary || {};

  return (
    <div className="space-y-3">
      <PosPageHeader icon={Bug} title="Log Error & Monitoring"
        subtitle="Error server (5xx) tersimpan permanen, dikelompokkan per kemunculan, dan bisa ditandai selesai"
        badge={s.open_count? s.open_count+' terbuka' : 'tidak ada error'}
        actions={<>
          <button onClick={load} className={posBtnSecondary+' h-9 px-3 text-xs'}><RefreshCw size={13} className={loading?'animate-spin':''}/> Muat</button>
          {status==='open' && Number(s.open_count)>0 && <button onClick={resolveAll} className={posBtnSecondary+' h-9 px-3 text-xs'}><CheckCircle2 size={13}/> Selesaikan semua</button>}
        </>}/>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PosStat icon={AlertTriangle} tone="bg-red-50 text-red-700" label="ERROR TERBUKA" value={String(s.open_count||0)} sub={`${nf(s.open_hits)} kejadian`}/>
        <PosStat icon={CheckCircle2} tone="bg-emerald-50 text-emerald-700" label="SUDAH SELESAI" value={String(s.resolved_count||0)} sub="tersimpan di DB"/>
        <PosStat icon={Activity} tone="bg-sky-50 text-sky-700" label="1 JAM TERAKHIR" value={String(data?.stats?.last_1h||0)} sub="dari memori proses"/>
        <PosStat icon={Bug} tone="bg-slate-100 text-slate-700" label="TERAKHIR" value={s.last_seen? waktu(s.last_seen).slice(5,16) : '-'} sub={s.last_seen? waktu(s.last_seen).slice(0,10):'belum ada'}/>
      </div>

      <PosCard>
        <PosCardBody className="flex flex-wrap items-center gap-2">
          <PosChipRow>
            <PosChip active={status==='open'} onClick={()=>setStatus('open')}>Terbuka</PosChip>
            <PosChip active={status==='resolved'} onClick={()=>setStatus('resolved')}>Selesai</PosChip>
          </PosChipRow>
          <div className="ml-auto relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3"/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari pesan / path…" className={posInput+' h-9 w-[240px] pl-7 text-xs'}/>
          </div>
        </PosCardBody>

        {loading ? <PosSkeleton rows={6} cols={6}/> : err ? <PosError message={err} onRetry={load}/> : !(data?.items||[]).length ? (
          <PosEmpty text={status==='open'? 'Tidak ada error terbuka 🎉' : 'Belum ada error yang diselesaikan'}
            hint={status==='open'? 'Error 5xx otomatis muncul di sini. Uptime check & webhook alert diatur lewat scripts/uptime-monitor.sh.' : ''}/>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-surface-3 border-y border-line text-[11px] font-bold tracking-wider text-ink-2">
                <PosTh align="center">KODE</PosTh><PosTh>PESAN</PosTh><PosTh>PATH</PosTh>
                <PosTh align="center">KEJADIAN</PosTh><PosTh align="center">TERAKHIR</PosTh><PosTh align="center">AKSI</PosTh>
              </tr></thead>
              <tbody>
                {(data?.items||[]).map(row=>(
                  <tr key={row.id} className={posTr+' cursor-pointer'} onClick={()=>setOpen(open===row.id? null: row.id)}>
                    <td className={posTd+' text-center'}><PosBadge tone={row.status>=500?'red':'slate'}>{row.status}</PosBadge></td>
                    <td className={posTd}>
                      <div className="text-xs font-semibold line-clamp-2">{row.message}</div>
                      <div className="text-[10px] text-ink-3">{row.source} • {row.username||'anon'}</div>
                      {open===row.id && row.stack && (
                        <pre className="mt-1.5 max-h-40 overflow-auto bg-navy text-[10px] text-emerald-200 rounded-lg p-2 whitespace-pre-wrap">{row.stack}</pre>
                      )}
                    </td>
                    <td className={posTd+' font-mono text-[11px]'}>{row.method} {(row.path||'').split('?')[0]}</td>
                    <td className={posTd+' text-center tabular-nums font-bold'}>{nf(row.count)}</td>
                    <td className={posTd+' text-center text-[11px] text-ink-3 whitespace-nowrap'}>{waktu(row.last_seen)}</td>
                    <td className={posTd+' text-center'}>
                      {!row.resolved
                        ? <button onClick={(e)=>{e.stopPropagation(); resolve(row);}} className="text-[11px] font-bold text-emerald-700 hover:underline">Selesaikan</button>
                        : <span className="text-[11px] text-ink-3">{waktu(row.resolved_at)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PosCard>

      <div className="text-[11px] text-ink-3 px-1 flex flex-wrap items-center gap-1.5">
        <ExternalLink size={11}/>
        Detail teknis: <span className="font-mono">GET /api/metrics</span> (p95/p99, 5xx, uptime) •
        log file: <span className="font-mono">logs/errors-YYYY-MM-DD.log</span> •
        alert: set <span className="font-mono">ERROR_WEBHOOK_URL</span> (Slack/WA gateway)
      </div>
    </div>
  );
}
