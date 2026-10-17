import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, CalendarCheck, LogIn, LogOut, RefreshCw, ChevronLeft, ChevronRight, AlarmClock, UserCircle } from 'lucide-react';
import api from '../lib/api';
import { useDialog } from '../components/DialogProvider';
import {
  PosPageHeader, PosCard, PosCardBody, PosBadge, PosEmpty, PosSkeleton, PosError, PosStat,
  PosTh, posTr, posTd, posBtnPrimary, posBtnSecondary,
} from '../components/PosUI';

const iso = (d)=> String(d||'').slice(0,10);
const fmtDate = (d)=>{ const s=iso(d); if(!s) return '-'; const [y,m,dd]=s.split('-'); return dd+'/'+m+'/'+y; };
const fmtTime = (ts)=> ts? String(ts).slice(11,16) : '-';   // jam dinding WIB (disimpan apa adanya)
const fmtJam = (h)=> h==null? '-' : (Math.round(h*10)/10)+' jam';
const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

export default function MyAttendance(){
  const dialog = useDialog();
  const [data,setData]=useState({month:'',today:'',today_row:null,data:[],summary:{hadir:0,terlambat:0,jam:0}});
  const [month,setMonth]=useState('');
  const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  const [busy,setBusy]=useState('');
  const [now,setNow]=useState(new Date());
  useEffect(()=>{ const iv=setInterval(()=>setNow(new Date()),1000); return ()=>clearInterval(iv); },[]);

  const load = useCallback(async()=>{
    setLoading(true); setErr('');
    try{
      const r = await api.get('/hr/attendance/mine', {params: month? {month}: {}});
      setData(r.data||{});
      if(!month && r.data?.month) setMonth(r.data.month);
    }catch(e){ setErr(e.response?.data?.error||e.message||'Gagal memuat absensi'); }
    finally{ setLoading(false); }
  },[month]);
  useEffect(()=>{ load(); },[load]);

  const shiftMonth = (delta)=>{
    const m = month || data.month; if(!m) return;
    const [y,mm] = m.split('-').map(Number);
    const d = new Date(y, mm-1+delta, 1);
    setMonth(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));
  };
  const monthLabel = useMemo(()=>{ const m = month||data.month; if(!m) return '-'; const [y,mm]=m.split('-').map(Number); return MONTHS[mm-1]+' '+y; },[month,data.month]);

  const act = async(kind)=>{
    setBusy(kind);
    try{
      await api.post('/hr/attendance/'+kind, {});
      await dialog.alert(kind==='checkin'? 'Check-in tercatat. Selamat bekerja.' : 'Check-out tercatat. Terima kasih atas kerja hari ini.', { title:'Absensi' });
      await load();
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message||'Gagal menyimpan absensi', { title:'Gagal' }); }
    finally{ setBusy(''); }
  };

  const tr = data.today_row;
  const sisaMasuk = !tr;
  const bisaPulang = tr && tr.check_in && !tr.check_out;
  const selesai = tr && tr.check_out;
  const jamHariIni = selesai ? (()=>{ const a=Date.parse(tr.check_in), b=Date.parse(tr.check_out); return (!isNaN(a)&&!isNaN(b))? Math.round(((b-a)/3600000)*10)/10 : null; })() : null;

  return (
    <div className="space-y-3">
      <PosPageHeader icon={Clock} title="Absensi Saya"
        subtitle="Check-in dan check-out sendiri di sini - jam mengikuti WIB - rekap bulanan otomatis"
        actions={<button onClick={load} className={posBtnSecondary+' h-9 px-4 text-xs'}><RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang</button>}/>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <PosCard className="lg:col-span-2">
          <PosCardBody>
            <div className="flex flex-wrap items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold tracking-widest text-[#64748B]">HARI INI - {fmtDate(data.today)}</div>
                <div className="text-[26px] font-black text-[#0F172A] tabular-nums leading-none mt-1">{now.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</div>
                <div className="text-xs text-[#64748B] mt-1">waktu setempat (WIB)</div>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {sisaMasuk && <PosBadge tone="slate">Belum check-in</PosBadge>}
                  {bisaPulang && <PosBadge tone="sky">Sudah masuk {fmtTime(tr.check_in)}</PosBadge>}
                  {selesai && <PosBadge tone="emerald">Selesai {fmtTime(tr.check_in)} - {fmtTime(tr.check_out)} ({fmtJam(jamHariIni)})</PosBadge>}
                  {tr?.terlambat===true && <PosBadge tone="amber" title="Check-in setelah 08:00">Terlambat</PosBadge>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={()=>act('checkin')} disabled={!!busy || !sisaMasuk}
                  className={posBtnPrimary+' h-11 px-5 text-sm disabled:opacity-40 disabled:cursor-not-allowed'}>
                  <LogIn size={16}/> {busy==='checkin'? 'Menyimpan...' : 'Check-in Masuk'}
                </button>
                <button onClick={()=>act('checkout')} disabled={!!busy || !bisaPulang}
                  className={posBtnSecondary+' h-11 px-5 text-sm disabled:opacity-40 disabled:cursor-not-allowed'}>
                  <LogOut size={16}/> {busy==='checkout'? 'Menyimpan...' : 'Check-out Pulang'}
                </button>
              </div>
            </div>
          </PosCardBody>
        </PosCard>

        <div className="grid grid-cols-2 gap-3">
          <PosStat icon={CalendarCheck} tone="bg-emerald-50 text-emerald-700" label="HADIR" value={data.summary?.hadir ?? 0} sub={'bulan '+monthLabel}/>
          <PosStat icon={AlarmClock} tone="bg-amber-50 text-amber-700" label="TERLAMBAT" value={data.summary?.terlambat ?? 0} sub="check-in lewat 08:00"/>
          <PosStat icon={Clock} tone="bg-[#1E40AF]/10 text-[#1E40AF]" label="TOTAL JAM" value={(data.summary?.jam ?? 0)+' jam'} sub="akumulasi bulan ini"/>
          <PosStat icon={UserCircle} tone="bg-[#F1F5F9] text-[#475569]" label="RATA-RATA" value={(data.summary?.hadir? Math.round((data.summary.jam/data.summary.hadir)*10)/10 : 0)+' jam'} sub="per hari hadir"/>
        </div>
      </div>

      <PosCard>
        <PosCardBody className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold tracking-widest text-[#64748B]">RIWAYAT BULANAN</span>
          <div className="flex items-center gap-1.5 sm:ml-auto">
            <button onClick={()=>shiftMonth(-1)} className="w-8 h-8 rounded-xl border border-[#E2E8F0] bg-white grid place-items-center hover:bg-[#F8FAFC] text-[#334155]" title="Bulan sebelumnya"><ChevronLeft size={15}/></button>
            <span className="text-sm font-semibold text-[#0F172A] min-w-[120px] text-center">{monthLabel}</span>
            <button onClick={()=>shiftMonth(1)} className="w-8 h-8 rounded-xl border border-[#E2E8F0] bg-white grid place-items-center hover:bg-[#F8FAFC] text-[#334155]" title="Bulan berikutnya"><ChevronRight size={15}/></button>
          </div>
        </PosCardBody>
        {loading ? <PosSkeleton rows={6} cols={5}/> : err ? <PosError message={err} onRetry={load}/> : !(data.data||[]).length ? <PosEmpty text="Belum ada absensi bulan ini - klik Check-in Masuk untuk mulai"/> : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]">
                <PosTh>TANGGAL</PosTh><PosTh align="center">MASUK</PosTh><PosTh align="center">PULANG</PosTh><PosTh align="center">JAM KERJA</PosTh><PosTh align="center">STATUS</PosTh>
              </tr></thead>
              <tbody>
                {(data.data||[]).map(r=>(
                  <tr key={r.id} className={posTr}>
                    <td className={posTd+' whitespace-nowrap font-medium'}>{fmtDate(r.date)}</td>
                    <td className={posTd+' text-center tabular-nums'}>{fmtTime(r.check_in)}</td>
                    <td className={posTd+' text-center tabular-nums'}>{fmtTime(r.check_out)}</td>
                    <td className={posTd+' text-center tabular-nums'}>{fmtJam(r.jam_kerja)}</td>
                    <td className={posTd+' text-center'}>
                      {r.terlambat ? <PosBadge tone="amber">Terlambat</PosBadge> : <PosBadge tone="emerald">Hadir</PosBadge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PosCard>
    </div>
  );
}
