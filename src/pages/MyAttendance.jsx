import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Clock, CalendarCheck, LogIn, LogOut, RefreshCw, ChevronLeft, ChevronRight, AlarmClock, UserCircle,
  MapPin, X, CheckCircle2, Timer, ShieldCheck, Info, LocateFixed,
} from 'lucide-react';
import api from '../lib/api';
import { useDialog } from '../components/DialogProvider';
import { LOCATION } from '../config/location';
import {
  PosPageHeader, PosCard, PosCardBody, PosBadge, PosEmpty, PosSkeleton, PosError, PosStat,
  PosTh, posTr, posTd, posBtnPrimary, posBtnSecondary,
} from '../components/PosUI';

const iso = (d)=> String(d||'').slice(0,10);
const fmtDate = (d)=>{ const s=iso(d); if(!s) return '-'; const [y,m,dd]=s.split('-'); return dd+'/'+m+'/'+y; };
const fmtTime = (ts)=> ts? String(ts).slice(11,16) : '-';   // jam dinding WIB (disimpan apa adanya)
const fmtClock = (ts)=> ts? String(ts).slice(11,19).replace(/:/g,'.') : '-';
const fmtJam = (h)=> h==null? '-' : (Math.round(h*10)/10)+' jam';
const dateLong = (d)=>{ const s=iso(d); if(!s) return '-'; const dt=new Date(s+'T00:00:00'); return dt.toLocaleDateString('id-ID',{weekday:'long', day:'2-digit', month:'short', year:'numeric'}); };
const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

// Kebijakan default (sama dengan ATT_POLICY di backend). Nilai final tetap dari API.
const DEFAULT_POLICY = {
  office: { name: LOCATION.name, lat: LOCATION.lat, lng: LOCATION.lng },
  radius_m: 200, cutoff: '08:00', cutoff_label: '08:00 WIB',
};

function haversineM(lat1, lng1, lat2, lng2){
  const R=6371000, dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180;
  const s=Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return Math.round(R*2*Math.atan2(Math.sqrt(s), Math.sqrt(1-s)));
}
const hhmmToMin = (v)=>{ const [h,m]=String(v||'08:00').split(':').map(Number); return (h||0)*60+(m||0); };
const nowWibMinutes = ()=>{ const d=new Date(Date.now()+7*3600*1000); return d.getUTCHours()*60+d.getUTCMinutes(); };

/**
 * Notifikasi absensi - mengikuti desain Stitch "Notifikasi Absensi Modern":
 * kartu putih rounded, aksen gradien di atas, ikon status berdenyut, badge
 * "Informasi Kehadiran", kartu detail 3 baris (waktu, lokasi + status GPS,
 * status jam masuk), lalu aksi "Mengerti" + "Lihat Riwayat Bulan Ini".
 */
function AttendanceSuccessModal({ open, onClose, onHistory, kind, row, late, distance, policy }){
  if(!open || !row) return null;
  const isLate = !!late?.is_late;
  const lateMin = parseInt(late?.late_minutes||0);
  const isOut = kind==='checkout';
  const radius = policy?.radius_m || DEFAULT_POLICY.radius_m;
  const jamKerja = (()=>{
    if(!isOut) return null;
    const a=Date.parse(row.check_in), b=Date.parse(row.check_out);
    return (!isNaN(a)&&!isNaN(b)) ? Math.round(((b-a)/3600000)*10)/10 : null;
  })();
  const accent = isLate ? 'from-amber-500 via-orange-400 to-amber-300' : 'from-[#0051d5] via-indigo-500 to-emerald-500';
  const iconBg = isLate ? 'from-amber-500 to-orange-400' : 'from-emerald-600 to-teal-500';
  const halo = isLate ? 'bg-amber-50' : 'bg-emerald-50';
  const halo2 = isLate ? 'bg-amber-100/70' : 'bg-emerald-100/70';
  const dist = distance ?? row?.check_in_distance_m ?? null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm" onClick={onClose}/>
      <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-[420px] max-h-[92vh] flex flex-col bg-white rounded-3xl shadow-[0_24px_60px_-12px_rgba(15,23,42,0.35)] overflow-hidden border border-line animate-pop">
        <div className={'h-1.5 w-full bg-gradient-to-r '+accent}/>
        <button onClick={onClose} aria-label="Tutup" className="absolute top-4 right-4 text-ink-3 hover:text-ink p-2 rounded-full hover:bg-surface-2">
          <X size={18}/>
        </button>
        <div className="flex-1 overflow-y-auto px-6 pt-7 pb-4 sm:px-8 flex flex-col items-center text-center">
          <div className="relative mb-4 flex items-center justify-center">
            <div className={'absolute w-20 h-20 rounded-full animate-pulse-ring pointer-events-none '+halo}/>
            <div className={'absolute w-16 h-16 rounded-full pointer-events-none '+halo2}/>
            <div className={'relative w-16 h-16 rounded-full bg-gradient-to-tr flex items-center justify-center text-white shadow-lg '+iconBg}>
              {isLate ? <AlarmClock size={30}/> : isOut ? <LogOut size={28}/> : <CheckCircle2 size={30}/>}
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#eef6ff] border border-[#d9eaff] text-brand text-[11px] font-bold tracking-wide uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-brand animate-ping"/> Informasi Kehadiran
          </div>
          <h2 className="text-[22px] font-bold text-ink tracking-tight mt-2">
            {isOut ? 'Absensi Pulang Berhasil' : isLate ? 'Absensi Tercatat - Terlambat' : 'Absensi Berhasil'}
          </h2>
          <p className="text-sm text-ink-2 leading-relaxed mt-1">
            {isOut
              ? <>Check-out Anda sudah tersimpan{jamKerja!=null? ' • total '+fmtJam(jamKerja)+' hari ini':''}.</>
              : <>Check-in Anda sudah diverifikasi sistem.<br/><span className="text-ink font-semibold">{isLate? 'Absen tetap diterima, tercatat sebagai keterlambatan.' : 'Selamat bekerja dan semoga produktif!'}</span></>}
          </p>

          <div className="w-full mt-6 bg-[#f8fafc] border border-line rounded-2xl p-4 text-left divide-y divide-[#e7ecf7]">
            <div className="pb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-surface-3 text-brand flex items-center justify-center shrink-0"><Clock size={15}/></div>
                <div className="min-w-0">
                  <p className="text-[11px] text-ink-3 font-medium">Waktu Presensi</p>
                  <p className="text-[11px] font-semibold text-ink truncate">{dateLong(row.date)}</p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[15px] font-bold text-ink tracking-tight font-mono">{fmtClock(isOut? row.check_out : row.check_in)}</span>
                <span className="text-[10px] font-bold text-ink-3 uppercase ml-0.5">WIB</span>
              </div>
            </div>

            <div className="py-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-100/70 text-emerald-600 flex items-center justify-center shrink-0"><MapPin size={15}/></div>
                <div className="min-w-0">
                  <p className="text-[11px] text-ink-3 font-medium">Lokasi Kerja</p>
                  <p className="text-[11px] font-semibold text-ink truncate">{policy?.office?.name || DEFAULT_POLICY.office.name}</p>
                </div>
              </div>
              {dist!=null
                ? <span className={'inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold '+(dist<=radius? 'bg-emerald-100 text-emerald-800':'bg-red-100 text-red-700')}>{dist<=radius? 'GPS valid':'Di luar radius'} • {dist} m</span>
                : <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600">Diisi HR</span>}
            </div>

            <div className="pt-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 '+(isLate? 'bg-amber-100/70 text-amber-600':'bg-emerald-100/70 text-emerald-600')}>
                  {isOut ? <Timer size={15}/> : <ShieldCheck size={15}/>}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-ink-3 font-medium">{isOut? 'Durasi Kerja':'Status Jam Masuk'}</p>
                  <p className="text-[11px] font-semibold text-ink truncate">{isOut? (jamKerja!=null? fmtJam(jamKerja):'-') : 'Batas masuk '+(policy?.cutoff_label||DEFAULT_POLICY.cutoff_label)}</p>
                </div>
              </div>
              {isOut
                ? <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700">Pulang</span>
                : isLate
                  ? <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 border border-amber-200 text-amber-800">Terlambat {lateMin} menit</span>
                  : <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700">Tepat waktu</span>}
            </div>
          </div>

          {isLate && !isOut && (
            <div className="w-full mt-3 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-left flex items-start gap-1.5">
              <Info size={13} className="mt-0.5 shrink-0"/>
              <span>Keterlambatan ini otomatis tercatat dan muncul di akun HR/admin sebagai catatan absensi.</span>
            </div>
          )}
        </div>

        {/* Aksi selalu terlihat - konten di atasnya yang discroll */}
        <div className="shrink-0 px-6 sm:px-8 pt-3 pb-3 space-y-2 bg-white border-t border-line">
          <button onClick={onClose} className="w-full py-3 px-5 text-sm font-bold rounded-xl text-white bg-brand hover:bg-blue-800 active:scale-[0.99] transition-all flex items-center justify-center gap-2">
            Mengerti
          </button>
          <button onClick={onHistory} className="w-full py-2.5 px-4 text-sm font-semibold rounded-xl text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors">
            Lihat Riwayat Bulan Ini
          </button>
        </div>
        <div className="pb-2 pt-1 flex justify-center bg-[#f8fafc] border-t border-line">
          <span className="text-[11px] text-ink-3 flex items-center gap-1 font-medium">
            <CheckCircle2 size={12}/> Sistem HR Sumber Material • ID #ABS-{String(row.id||0).padStart(5,'0')}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function MyAttendance(){
  const dialog = useDialog();
  const [data,setData]=useState({month:'',today:'',today_row:null,data:[],summary:{hadir:0,terlambat:0,jam:0},policy:null});
  const [month,setMonth]=useState('');
  const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  const [busy,setBusy]=useState('');
  const [now,setNow]=useState(new Date());
  useEffect(()=>{ const iv=setInterval(()=>setNow(new Date()),1000); return ()=>clearInterval(iv); },[]);

  // ── Lokasi (geofence 200 m dari Gudang Pusat) ─────────────────────────────
  const policy = data.policy || DEFAULT_POLICY;
  const officeLat = policy.office?.lat ?? DEFAULT_POLICY.office.lat;
  const officeLng = policy.office?.lng ?? DEFAULT_POLICY.office.lng;
  const radiusM = policy.radius_m || DEFAULT_POLICY.radius_m;
  const [geo,setGeo]=useState({ status:'idle', lat:null, lng:null, accuracy:null, distance:null, error:'' });
  const locate = useCallback(()=>{
    if(!navigator.geolocation){ setGeo({status:'unsupported', lat:null,lng:null,accuracy:null,distance:null, error:'Browser tidak mendukung GPS'}); return; }
    setGeo(g=>({...g, status:'locating', error:''}));
    navigator.geolocation.getCurrentPosition(
      (pos)=>{
        const lat=pos.coords.latitude, lng=pos.coords.longitude;
        const distance=haversineM(officeLat, officeLng, lat, lng);
        setGeo({ status:'ok', lat, lng, accuracy: pos.coords.accuracy, distance, error:'' });
      },
      (e)=>{
        const msg = e.code===1 ? 'Izin lokasi ditolak. Aktifkan izin lokasi untuk browser ini.'
          : e.code===2 ? 'Lokasi tidak tersedia. Pastikan GPS/Location aktif.'
          : 'Gagal membaca lokasi (timeout). Coba lagi.';
        setGeo({ status:'error', lat:null,lng:null,accuracy:null,distance:null, error: msg });
      },
      { enableHighAccuracy:true, timeout:12000, maximumAge:0 }
    );
  },[officeLat, officeLng]);
  useEffect(()=>{ locate(); },[locate]);

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

  // ── Modal notifikasi (desain Stitch) ──────────────────────────────────────
  const [notif,setNotif]=useState(null); // { kind, row, late, distance }
  const scrollHistory = ()=> document.getElementById('att-history')?.scrollIntoView({behavior:'smooth', block:'start'});

  const act = async(kind)=>{
    setBusy(kind);
    try{
      // Ambil posisi terbaru tepat sebelum absen supaya jarak akurat.
      const position = await new Promise((resolve)=>{
        if(!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
          (pos)=> resolve({ lat:pos.coords.latitude, lng:pos.coords.longitude, accuracy:pos.coords.accuracy }),
          ()=> resolve(null),
          { enableHighAccuracy:true, timeout:12000, maximumAge:0 }
        );
      });
      if(!position){
        throw new Error('Lokasi GPS belum terbaca. Aktifkan izin lokasi di browser lalu coba lagi.');
      }
      const r = await api.post('/hr/attendance/'+kind, position);
      const d = r.data || {};
      const distance = (d.distance_m!=null) ? d.distance_m : haversineM(officeLat, officeLng, position.lat, position.lng);
      setGeo({ status:'ok', lat:position.lat, lng:position.lng, accuracy:position.accuracy, distance, error:'' });
      setNotif({ kind, row:d.row, late:d.late, distance });
      await load();
    }catch(e){
      const msg = e.response?.data?.error || e.message || 'Gagal menyimpan absensi';
      await dialog.alert(msg, { title:'Gagal absensi', tone:'danger' });
    }
    finally{ setBusy(''); }
  };

  const tr = data.today_row;
  const sisaMasuk = !tr;
  const bisaPulang = tr && tr.check_in && !tr.check_out;
  const selesai = tr && tr.check_out;
  const jamHariIni = selesai ? (()=>{ const a=Date.parse(tr.check_in), b=Date.parse(tr.check_out); return (!isNaN(a)&&!isNaN(b))? Math.round(((b-a)/3600000)*10)/10 : null; })() : null;

  const cutoffMin = hhmmToMin(policy.cutoff || '08:00');
  const menitSekarang = nowWibMinutes();
  const menitTelat = Math.max(0, menitSekarang - cutoffMin);
  const lewatBatas = menitTelat > 0;

  const geoOk = geo.status==='ok';
  const dalamRadius = geoOk && geo.distance!=null && geo.distance <= radiusM;
  const bisaAbsen = dalamRadius;
  const geoLabel = geo.status==='locating' ? 'Membaca lokasi...'
    : geoOk ? (dalamRadius? `GPS valid • ${geo.distance} m dari pusat` : `Di luar radius • ${geo.distance} m`)
    : (geo.status==='error' || geo.status==='unsupported') ? 'Lokasi tidak terbaca'
    : 'Menunggu lokasi';

  return (
    <div className="space-y-3">
      <PosPageHeader icon={Clock} title="Absensi Saya"
        subtitle={`Check-in/check-out sendiri di sini • jam WIB • batas masuk ${policy.cutoff_label||'08:00 WIB'} • radius ${radiusM} m dari ${policy.office?.name||'Gudang Pusat'}`}
        actions={<button onClick={load} className={posBtnSecondary+' h-9 px-4 text-xs'}><RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang</button>}/>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <PosCard className="lg:col-span-2">
          <PosCardBody>
            <div className="flex flex-wrap items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold tracking-wider text-ink-2">HARI INI - {fmtDate(data.today)}</div>
                <div className="text-[26px] font-bold text-ink tabular-nums leading-none mt-1">{now.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</div>
                <div className="text-xs text-ink-2 mt-1">waktu setempat (WIB)</div>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {sisaMasuk && <PosBadge tone="slate">Belum check-in</PosBadge>}
                  {bisaPulang && <PosBadge tone="sky">Sudah masuk {fmtTime(tr.check_in)}</PosBadge>}
                  {selesai && <PosBadge tone="emerald">Selesai {fmtTime(tr.check_in)} - {fmtTime(tr.check_out)} ({fmtJam(jamHariIni)})</PosBadge>}
                  {tr?.terlambat===true && <PosBadge tone="amber" title={`Check-in setelah ${policy.cutoff_label||'08:00 WIB'}`}>Terlambat{parseInt(tr.late_minutes||0)>0? ' '+tr.late_minutes+' mnt':''}</PosBadge>}
                  {tr?.check_in_distance_m!=null && <PosBadge tone="slate" title="Jarak check-in dari pusat">{tr.check_in_distance_m} m dari pusat</PosBadge>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={()=>act('checkin')} disabled={!!busy || !sisaMasuk || !bisaAbsen}
                  title={!bisaAbsen? `Absen hanya bisa di radius ${radiusM} m dari ${policy.office?.name||'Gudang Pusat'}`:'Check-in'}
                  className={posBtnPrimary+' h-11 px-5 text-sm disabled:opacity-40 disabled:cursor-not-allowed'}>
                  <LogIn size={16}/> {busy==='checkin'? 'Menyimpan...' : 'Check-in Masuk'}
                </button>
                <button onClick={()=>act('checkout')} disabled={!!busy || !bisaPulang || !bisaAbsen}
                  title={!bisaAbsen? `Absen hanya bisa di radius ${radiusM} m dari ${policy.office?.name||'Gudang Pusat'}`:'Check-out'}
                  className={posBtnSecondary+' h-11 px-5 text-sm disabled:opacity-40 disabled:cursor-not-allowed'}>
                  <LogOut size={16}/> {busy==='checkout'? 'Menyimpan...' : 'Check-out Pulang'}
                </button>
              </div>
            </div>

            {/* Status lokasi + aturan jam masuk */}
            <div className="mt-4 grid sm:grid-cols-2 gap-2">
              <button type="button" onClick={locate}
                className={'text-left rounded-xl border p-3 flex items-start gap-2 transition '+(dalamRadius? 'bg-emerald-50 border-emerald-200':geo.status==='locating'? 'bg-surface-2 border-line':'bg-amber-50 border-amber-200')}>
                <span className={'w-7 h-7 rounded-lg grid place-items-center shrink-0 '+(dalamRadius? 'bg-emerald-600 text-white':'bg-white border border-line text-ink-2')}>
                  {geo.status==='locating'? <RefreshCw size={13} className="animate-spin"/> : <LocateFixed size={14}/>}
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold text-ink">{geoLabel}</span>
                  <span className="block text-[11px] text-ink-2 leading-snug">
                    {geo.status==='error' || geo.status==='unsupported'
                      ? `${geo.error||'Aktifkan izin lokasi'} Klik untuk coba lagi.`
                      : dalamRadius
                        ? `Absen bisa dilakukan • pusat ${policy.office?.name||'Gudang Pusat'}`
                        : geoOk
                          ? `Maksimal ${radiusM} m dari ${policy.office?.name||'Gudang Pusat'}. Mendekat dulu.`
                          : 'Membaca titik GPS Anda…'}
                  </span>
                </span>
              </button>
              <div className={'rounded-xl border p-3 flex items-start gap-2 '+(lewatBatas && sisaMasuk? 'bg-amber-50 border-amber-200':'bg-surface-2 border-line')}>
                <span className={'w-7 h-7 rounded-lg grid place-items-center shrink-0 '+(lewatBatas && sisaMasuk? 'bg-amber-500 text-white':'bg-white border border-line text-ink-2')}>
                  <AlarmClock size={14}/>
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold text-ink">Batas masuk {policy.cutoff_label||'08:00 WIB'}</span>
                  <span className="block text-[11px] text-ink-2 leading-snug">
                    {lewatBatas
                      ? `Sudah lewat ${menitTelat} menit - tetap bisa absen, tercatat terlambat & masuk catatan HR/admin.`
                      : `Sisa ${Math.max(0,cutoffMin-menitSekarang)} menit lagi untuk absen tepat waktu.`}
                  </span>
                </span>
              </div>
            </div>
          </PosCardBody>
        </PosCard>

        <div className="grid grid-cols-2 gap-3">
          <PosStat icon={CalendarCheck} tone="bg-emerald-50 text-emerald-700" label="HADIR" value={data.summary?.hadir ?? 0} sub={'bulan '+monthLabel}/>
          <PosStat icon={AlarmClock} tone="bg-amber-50 text-amber-700" label="TERLAMBAT" value={data.summary?.terlambat ?? 0} sub={'lewat '+(policy.cutoff_label||'08:00')}/>
          <PosStat icon={Clock} tone="bg-brand/10 text-brand" label="TOTAL JAM" value={(data.summary?.jam ?? 0)+' jam'} sub="akumulasi bulan ini"/>
          <PosStat icon={UserCircle} tone="bg-surface-3 text-ink-2" label="RATA-RATA" value={(data.summary?.hadir? Math.round((data.summary.jam/data.summary.hadir)*10)/10 : 0)+' jam'} sub="per hari hadir"/>
        </div>
      </div>

      <div id="att-history">
      <PosCard>
        <PosCardBody className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold tracking-wider text-ink-2">RIWAYAT BULANAN</span>
          <div className="flex items-center gap-1.5 sm:ml-auto">
            <button onClick={()=>shiftMonth(-1)} className="w-8 h-8 rounded-xl border border-line bg-white grid place-items-center hover:bg-surface-2 text-ink-2" title="Bulan sebelumnya"><ChevronLeft size={15}/></button>
            <span className="text-sm font-semibold text-ink min-w-[120px] text-center">{monthLabel}</span>
            <button onClick={()=>shiftMonth(1)} className="w-8 h-8 rounded-xl border border-line bg-white grid place-items-center hover:bg-surface-2 text-ink-2" title="Bulan berikutnya"><ChevronRight size={15}/></button>
          </div>
        </PosCardBody>
        {loading ? <PosSkeleton rows={6} cols={5}/> : err ? <PosError message={err} onRetry={load}/> : !(data.data||[]).length ? <PosEmpty text="Belum ada absensi bulan ini - klik Check-in Masuk untuk mulai"/> : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-surface-3 border-y border-line text-[11px] font-bold tracking-wider text-ink-2">
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
                      {r.terlambat
                        ? <PosBadge tone="amber">Terlambat{parseInt(r.late_minutes||0)>0? ' '+r.late_minutes+' mnt':''}</PosBadge>
                        : <PosBadge tone="emerald">Hadir</PosBadge>}
                      {r.check_in_distance_m!=null && <div className="text-[10px] text-ink-3 mt-0.5">{r.check_in_distance_m} m dari pusat</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PosCard>
      </div>

      <AttendanceSuccessModal
        open={!!notif}
        kind={notif?.kind}
        row={notif?.row}
        late={notif?.late}
        distance={notif?.distance}
        policy={policy}
        onClose={()=>setNotif(null)}
        onHistory={()=>{ setNotif(null); setTimeout(scrollHistory, 150); }}
      />
    </div>
  );
}
