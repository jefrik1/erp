import { useCallback, useEffect, useState } from 'react';
import { Lock, Unlock, RefreshCw, AlertTriangle, BookOpenCheck } from 'lucide-react';
import api from '../lib/api';
import {
  PosPageHeader, PosCard, PosCardBody, PosBadge, PosEmpty, PosSkeleton, PosError,
  PosTh, posTr, posTd, posInput, posBtnPrimary, posBtnSecondary,
} from '../components/PosUI';
import { useDialog } from '../components/DialogProvider';
import { useAuth } from '../store/auth';
import { canAccess } from '../config/access';

const nf = (n)=> new Intl.NumberFormat('id-ID').format(Math.round(Number(n)||0));
const rupiah = (n)=> 'Rp ' + nf(n);
const label = (p)=> {
  const [y,m] = String(p).split('-');
  return new Date(Number(y), Number(m)-1, 1).toLocaleDateString('id-ID',{month:'long',year:'numeric'});
};

export default function AccountingPeriods(){
  const dialog = useDialog();
  const roles = useAuth(s=>s.user)?.roles || [];
  const canReopen = canAccess(roles, ['direktur','super_admin']);

  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  const [busy,setBusy]=useState('');

  const load = useCallback(async ()=>{
    setLoading(true); setErr('');
    try{ const r=await api.get('/finance/periods'); setRows(Array.isArray(r.data)?r.data:[]); }
    catch(e){ setErr(e.response?.data?.error||e.message||'Gagal memuat periode'); }
    finally{ setLoading(false); }
  },[]);
  useEffect(()=>{ load(); },[load]);

  const close = async (p)=>{
    const ok = await dialog.confirm(`Tutup buku periode ${label(p.period)}? Setelah ditutup, jurnal baru untuk periode ini akan DITOLAK sampai dibuka kembali.`, { title:'Tutup buku', confirmText:'Ya, tutup' });
    if(!ok) return;
    setBusy(p.period);
    try{
      const r = await api.post(`/finance/periods/${p.period}/close`, { notes: 'Tutup buku dari UI' });
      await dialog.alert(r.data.message, { title:'Periode ditutup', tone:'success' });
      load();
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal menutup' }); }
    finally{ setBusy(''); }
  };
  const reopen = async (p)=>{
    const ok = await dialog.confirm(`Buka kembali periode ${label(p.period)}? Tindakan ini tercatat di audit dan hanya boleh untuk koreksi.`, { title:'Buka periode', confirmText:'Ya, buka' });
    if(!ok) return;
    setBusy(p.period);
    try{
      const r = await api.post(`/finance/periods/${p.period}/reopen`, { reason: 'Koreksi dari UI (Direktur)' });
      await dialog.alert(r.data.message, { title:'Periode dibuka', tone:'success' });
      load();
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal membuka' }); }
    finally{ setBusy(''); }
  };

  const closed = rows.filter(r=>r.status==='CLOSED').length;

  return (
    <div className="space-y-3">
      <PosPageHeader icon={BookOpenCheck} title="Tutup Buku (Periode Akuntansi)"
        subtitle="Kunci periode setelah laporan selesai — jurnal baru ditolak sampai periode dibuka kembali"
        badge={closed? closed+' periode tertutup' : null}
        actions={<button onClick={load} className={posBtnSecondary+' h-9 px-3 text-xs'}><RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang</button>}/>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900 flex gap-2">
        <AlertTriangle size={14} className="shrink-0 mt-0.5"/>
        <div>
          Menutup periode <b>tidak menghapus</b> data — hanya memblokir jurnal baru bertanggal periode itu
          (penjualan, pembayaran, opname, payroll, penyusutan). Pastikan <b>Trial Balance seimbang</b> dan laporan sudah diarsipkan.
          Membuka kembali hanya bisa dilakukan Direktur/Super Admin dan tercatat di audit.
        </div>
      </div>

      <PosCard>
        {loading ? <PosSkeleton rows={8} cols={5}/> : err ? <PosError message={err} onRetry={load}/> : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-surface-3 border-y border-line text-[11px] font-bold tracking-wider text-ink-2">
                <PosTh>PERIODE</PosTh><PosTh align="center">STATUS</PosTh><PosTh align="right">JURNAL</PosTh>
                <PosTh align="right">NILAI DEBIT</PosTh><PosTh align="center">DITUTUP</PosTh><PosTh align="center">AKSI</PosTh>
              </tr></thead>
              <tbody>
                {rows.map(r=>(
                  <tr key={r.period} className={posTr}>
                    <td className={posTd+' font-semibold'}>{label(r.period)} <span className="text-[10px] font-mono text-ink-3">{r.period}</span></td>
                    <td className={posTd+' text-center'}>
                      <PosBadge tone={r.status==='CLOSED'?'red':'emerald'}>{r.status}</PosBadge>
                    </td>
                    <td className={posTd+' text-center tabular-nums'}>{nf(r.journals)}</td>
                    <td className={posTd+' text-right tabular-nums'}>{rupiah(r.debit)}</td>
                    <td className={posTd+' text-center text-[11px] text-ink-3'}>{r.closed_at? String(r.closed_at).slice(0,10):'-'}</td>
                    <td className={posTd+' text-center whitespace-nowrap'}>
                      {r.status==='OPEN'
                        ? <button onClick={()=>close(r)} disabled={busy===r.period} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-navy text-white text-[11px] font-bold disabled:opacity-50"><Lock size={11}/> Tutup buku</button>
                        : (canReopen
                            ? <button onClick={()=>reopen(r)} disabled={busy===r.period} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border text-[11px] font-bold text-brand disabled:opacity-50"><Unlock size={11}/> Buka kembali</button>
                            : <span className="text-[11px] text-ink-3">Hanya Direktur</span>)}
                    </td>
                  </tr>
                ))}
                {!rows.length && <PosEmpty colSpan={6} text="Belum ada data periode"/>}
              </tbody>
            </table>
          </div>
        )}
      </PosCard>
    </div>
  );
}
