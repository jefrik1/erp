import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Truck, RefreshCw, Play, CheckCircle2, XCircle, MapPin, Gauge, Package, X,
  Hand, PackageCheck, FileText, Camera, ShieldCheck, AlertTriangle, ChevronRight, Receipt, PenLine, UserCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { LOCATION } from '../config/location';
import { useDialog } from '../components/DialogProvider';
import SignaturePad from '../components/SignaturePad';
import {
  PosPageHeader, PosCard, PosBadge, PosEmpty, PosSkeleton, PosError, PosStat,
  PosTh, posTr, posTd, posInput, posBtnPrimary, posBtnSecondary, posBtnSm,
} from '../components/PosUI';

const nf = (n)=> new Intl.NumberFormat('id-ID').format(Math.round(Number(n)||0));
const rupiah = (n)=> 'Rp ' + nf(n);
const d10 = (v)=> String(v||'').slice(0,10);
const tone = (s)=> s==='COMPLETED'?'emerald' : s==='CANCELLED'?'red' : s==='IN_PROGRESS'?'sky' : 'amber';
const SOURCE_TONE = { DO:'purple', SO:'sky', POS:'amber' };
const SOURCE_LABEL = { DO:'Surat Jalan', SO:'Sales Order', POS:'Order POS' };

// Jarak otomatis dari alamat tujuan. Koordinat (dari POS/SO/DO/peta) dipakai
// langsung; kalau belum ada, alamatnya di-geocode di server (cache Nominatim).
function kmFrom(lat, lng){
  const la=parseFloat(lat), lo=parseFloat(lng);
  if(!isFinite(la) || !isFinite(lo)) return null;
  const R=6371, dLat=(la-LOCATION.lat)*Math.PI/180, dLng=(lo-LOCATION.lng)*Math.PI/180;
  const s=Math.sin(dLat/2)**2 + Math.cos(LOCATION.lat*Math.PI/180)*Math.cos(la*Math.PI/180)*Math.sin(dLng/2)**2;
  const km=+(R*2*Math.atan2(Math.sqrt(s),Math.sqrt(1-s))).toFixed(2);
  return { km, lat:la, lng:lo, zone: km<=15?'Bekasi' : km<=40?'Jakarta' : 'Luar Kota' };
}
async function geocodeDist(address){
  const r = await api.get('/fleet/geocode',{ params:{ address } });
  if(!r.data?.found) return null;
  return { km:r.data.km, lat:r.data.lat, lng:r.data.lng, zone:r.data.zone, approx:!!r.data.approx, matched:r.data.matched||null };
}

const FOTO_MAX = 3*1024*1024;
const FOTO_MIME = ['image/jpeg','image/png','image/webp'];
function fileKeBase64(file){
  return new Promise((resolve,reject)=>{
    const fr = new FileReader();
    fr.onload = ()=> resolve(String(fr.result||''));
    fr.onerror = ()=> reject(new Error('Gagal membaca file'));
    fr.readAsDataURL(file);
  });
}

export default function DriverTrips(){
  const dialog = useDialog();
  const [trips,setTrips]=useState([]);
  const [vehicles,setVehicles]=useState([]);
  const [dos,setDos]=useState([]);
  const [claimable,setClaimable]=useState({data:[], counts:{}});
  const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  const [filter,setFilter]=useState('ALL');

  // klaim pengiriman
  const [claiming,setClaiming]=useState(null);
  const [claimForm,setClaimForm]=useState({vehicle_id:'', odometer_start:'', notes:'', driver_sig:'', sender_sig:'', sender_name:''});
  const [savingClaim,setSavingClaim]=useState(false); const [claimErr,setClaimErr]=useState('');
  // { km, zone, lat, lng, status: 'idle'|'loading'|'saved'|'auto'|'none' }
  const [claimGeo,setClaimGeo]=useState({ km:'', zone:'', lat:null, lng:null, status:'idle' });

  // trip manual (tanpa pengiriman)
  const [manualOpen,setManualOpen]=useState(false);
  const [startForm,setStartForm]=useState({vehicle_id:'', odometer_start:'', notes:''});
  const [starting,setStarting]=useState(false); const [startErr,setStartErr]=useState('');

  // penyelesaian trip + bukti serah terima
  const [completing,setCompleting]=useState(null);
  const [completeForm,setCompleteForm]=useState({
    odometer_end:'', fuel_liters:'', fuel_cost:'', notes:'',
    received_by:'', signature:'', driver_signature:'', photo:'', photoName:'', invoice_handed:false,
  });
  const [savingComplete,setSavingComplete]=useState(false); const [completeErr,setCompleteErr]=useState('');

  const load = useCallback(async()=>{
    setLoading(true); setErr('');
    try{
      const [t,v,d,c] = await Promise.all([
        api.get('/fleet/trips',{params:{mine:1}}),
        api.get('/fleet/vehicles'),
        api.get('/fleet/my-deliveries'),
        api.get('/fleet/claimable'),
      ]);
      setTrips(Array.isArray(t.data)? t.data: []);
      setVehicles(Array.isArray(v.data)? v.data: []);
      setDos(Array.isArray(d.data)? d.data: []);
      setClaimable(c.data && Array.isArray(c.data.data)? c.data : {data:[], counts:{}});
    }catch(e){ setErr(e.response?.data?.error||e.message||'Gagal memuat data trip'); }
    finally{ setLoading(false); }
  },[]);
  useEffect(()=>{ load(); },[load]);

  const aktif = useMemo(()=> trips.filter(t=>t.status==='IN_PROGRESS'),[trips]);
  const selesai = useMemo(()=> trips.filter(t=>t.status==='COMPLETED'),[trips]);
  const totalKm = useMemo(()=> selesai.reduce((a,t)=>a+(parseFloat(t.distance_km)||0),0),[selesai]);
  const available = useMemo(()=> vehicles.filter(v=>v.status==='AVAILABLE'),[vehicles]);
  // Armada yang sudah ditugaskan gudang ke DO ini ikut ditampilkan (statusnya
  // IN_TRANSIT karena DO, bukan karena trip lain) supaya driver bisa memakainya.
  const claimVehicles = useMemo(()=>{
    const base = vehicles.filter(v=>v.status==='AVAILABLE');
    const ownPlat = claiming?.source==='DO' ? claiming?.vehicle_no : null;
    const own = ownPlat ? vehicles.find(v=>v.plat_no===ownPlat) : null;
    if(own && !base.some(v=>v.id===own.id)) return [own, ...base];
    return base;
  },[vehicles, claiming]);
  const claimRows = useMemo(()=>{
    const rows = claimable.data||[];
    return filter==='ALL' ? rows : rows.filter(r=>r.source===filter);
  },[claimable,filter]);
  const counts = claimable.counts||{};

  const openClaim = (row)=>{
    setClaimErr('');
    setClaiming(row);
    const ownVeh = row.source==='DO' && row.vehicle_no ? vehicles.find(v=>v.plat_no===row.vehicle_no) : null;
    const first = ownVeh || available[0];
    setClaimForm({vehicle_id: first?.id? String(first.id):'', odometer_start:'', notes:'', driver_sig:'', sender_sig:'', sender_name:''});
    const own = parseFloat(row.distance_km||0);
    const fromCoords = (!own && row.delivery_lat!=null && row.delivery_lng!=null) ? kmFrom(row.delivery_lat, row.delivery_lng) : null;
    if(own){
      setClaimGeo({ km:String(own), zone: row.est_zone||'', lat: row.delivery_lat||null, lng: row.delivery_lng||null, status:'saved' });
    } else if(fromCoords){
      setClaimGeo({ km:String(fromCoords.km), zone:fromCoords.zone, lat:fromCoords.lat, lng:fromCoords.lng, status:'auto' });
    } else if(row.address && row.address !== 'Alamat belum diisi'){
      setClaimGeo({ km:'', zone:'', lat:null, lng:null, status:'loading' });
      geocodeDist(row.address)
        .then(d=> setClaimGeo(d? { km:String(d.km), zone:d.zone, lat:d.lat, lng:d.lng, status:'auto', approx:d.approx, matched:d.matched } : { km:'', zone:'', lat:null, lng:null, status:'none' }))
        .catch(()=> setClaimGeo({ km:'', zone:'', lat:null, lng:null, status:'none' }));
    } else {
      setClaimGeo({ km:'', zone:'', lat:null, lng:null, status:'none' });
    }
  };
  const submitClaim = async(e)=>{
    e.preventDefault(); setClaimErr('');
    if(!claimForm.vehicle_id){ setClaimErr('Pilih armada dulu'); return; }
    if(!claimForm.driver_sig){ setClaimErr('Tanda tangan pengemudi wajib — tanda tangani di area "Tanda tangan pengemudi"'); return; }
    if(claimForm.sender_sig && !claimForm.sender_name.trim()){ setClaimErr('Nama petugas gudang wajib diisi bila tanda tangan pengirim diisi'); return; }
    setSavingClaim(true);
    try{
      const r = await api.post('/fleet/claim',{
        source: claiming.source, id: claiming.id,
        vehicle_id: parseInt(claimForm.vehicle_id),
        odometer_start: claimForm.odometer_start? parseInt(claimForm.odometer_start): undefined,
        notes: claimForm.notes||undefined,
        distance_km: claimGeo.km? parseFloat(claimGeo.km): undefined,
        delivery_lat: claimGeo.lat??undefined, delivery_lng: claimGeo.lng??undefined,
        driver_signature_url: claimForm.driver_sig,
        sender_signature_url: claimForm.sender_sig||undefined,
        sender_signed_by: claimForm.sender_sig? claimForm.sender_name.trim(): undefined,
      });
      setClaiming(null);
      await dialog.alert(
        'Trip '+r.data.trip_number+' dimulai dengan '+r.data.plat_no+'.\nPengiriman '+(r.data.do_number||claiming.number)+(r.data.so_number? ' - '+r.data.so_number:'')+' sekarang menjadi tanggung jawab Anda.\n\nSurat jalan '+(r.data.do_number||'')+' sudah tersedia - buka dari kartu Trip Aktif.',
        { title:'Pengiriman Diklaim', tone:'success' }
      );
      load();
    }catch(e2){ setClaimErr(e2.response?.data?.error||e2.message||'Gagal klaim pengiriman'); }
    finally{ setSavingClaim(false); }
  };

  const mulai = async(e)=>{
    e.preventDefault(); setStartErr('');
    if(!startForm.vehicle_id){ setStartErr('Pilih kendaraan dulu'); return; }
    setStarting(true);
    try{
      const r = await api.post('/fleet/trips',{
        vehicle_id: parseInt(startForm.vehicle_id),
        odometer_start: startForm.odometer_start? parseInt(startForm.odometer_start): undefined,
        notes: startForm.notes||undefined,
      });
      setStartForm({vehicle_id:'', odometer_start:'', notes:''});
      setManualOpen(false);
      await dialog.alert('Trip '+r.data.trip_number+' dimulai. Hati-hati di jalan!', { title:'Trip Dimulai', tone:'success' });
      load();
    }catch(e2){ setStartErr(e2.response?.data?.error||e2.message||'Gagal memulai trip'); }
    finally{ setStarting(false); }
  };

  const openComplete = (t)=>{
    setCompleteErr('');
    setCompleting(t);
    setCompleteForm({
      odometer_end:'', fuel_liters:'', fuel_cost:'', notes:'',
      received_by:'', signature:'', driver_signature:'', photo:'', photoName:'', invoice_handed:false,
    });
  };
  const pilihFoto = async(e)=>{
    const f = e.target.files?.[0]; if(!f) return;
    setCompleteErr('');
    if(!FOTO_MIME.includes(f.type)){ setCompleteErr('Foto harus JPG, PNG, atau WEBP'); e.target.value=''; return; }
    if(f.size > FOTO_MAX){ setCompleteErr('Ukuran foto maksimal 3 MB'); e.target.value=''; return; }
    try{ const b64 = await fileKeBase64(f); setCompleteForm(s=>({...s, photo:b64, photoName:f.name})); }
    catch(err2){ setCompleteErr(err2.message); }
  };
  const selesaikan = async(e)=>{
    e.preventDefault(); setCompleteErr('');
    if(!completing) return;
    if(completing.do_id){
      if(!completeForm.received_by.trim()){ setCompleteErr('Nama penerima wajib diisi'); return; }
      if(!completeForm.signature){ setCompleteErr('Tanda tangan penerima wajib diisi'); return; }
      if(!completing.do_driver_signed && !completeForm.driver_signature){ setCompleteErr('Tanda tangan pengemudi wajib — tanda tangani di area "Tanda tangan pengemudi"'); return; }
      if(parseInt(completing.invoice_count||0)>0 && !completeForm.invoice_handed){
        setCompleteErr('Centang konfirmasi invoice sudah diserahkan ke penerima'); return;
      }
    }
    setSavingComplete(true);
    try{
      const r = await api.post('/fleet/trips/'+completing.id+'/complete',{
        odometer_end: completeForm.odometer_end? parseInt(completeForm.odometer_end): undefined,
        fuel_liters: completeForm.fuel_liters? parseFloat(completeForm.fuel_liters): undefined,
        fuel_cost: completeForm.fuel_cost? parseFloat(completeForm.fuel_cost): undefined,
        notes: completeForm.notes||undefined,
        received_by: completeForm.received_by.trim()||undefined,
        pod_signature_url: completeForm.signature||undefined,
        pod_photo_url: completeForm.photo||undefined,
        driver_signature_url: completeForm.driver_signature||undefined,
        invoice_handed: completeForm.invoice_handed,
      });
      const docs = r.data.documents;
      let msg = 'Trip selesai. Jarak '+nf(r.data.distance_km||0)+' km, biaya/km '+rupiah(r.data.cost_per_km||0)+'.';
      if(docs){
        msg += '\n\n'+docs.do_number+' - '+docs.do_status;
        if(docs.so_number) msg += '\n'+docs.so_number+' - '+docs.so_status+(docs.pending_invoices? ' (masih ada '+docs.pending_invoices+' invoice belum lunas)':'');
        if(docs.invoice_handed) msg += '\nInvoice diserahkan langsung ke penerima.';
      }
      setCompleting(null);
      await dialog.alert(msg, { title:'Pengiriman Selesai', tone:'success' });
      load();
    }catch(e2){ setCompleteErr(e2.response?.data?.error||e2.message||'Gagal menyelesaikan trip'); }
    finally{ setSavingComplete(false); }
  };

  const batalkan = async(t)=>{
    const ok = await dialog.confirm('Batalkan trip '+t.trip_number+'? Armada kembali AVAILABLE dan pengiriman dilepas untuk diklaim driver lain.', { title:'Batalkan Trip', tone:'danger', confirmText:'Ya, batalkan' });
    if(!ok) return;
    try{ await api.post('/fleet/trips/'+t.id+'/cancel'); await dialog.alert('Trip dibatalkan', { title:'Dibatalkan', tone:'info' }); load(); }
    catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal', tone:'danger' }); }
  };

  return (
    <div className="space-y-3">
      <PosPageHeader icon={Truck} title="Pengiriman Saya"
        subtitle="Klaim pengiriman dari DO, Sales Order, atau POS - selesaikan dengan tanda tangan penerima, foto, dan serah terima invoice"
        actions={<button onClick={load} className={posBtnSecondary+' h-9 px-4 text-xs'}><RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang</button>}/>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PosStat icon={Play} tone="bg-sky-50 text-sky-700" label="TRIP AKTIF" value={aktif.length} sub="sedang berjalan"/>
        <PosStat icon={Hand} tone="bg-[#f3efff] text-[#5b3fd6]" label="SIAP DIKLAIM" value={counts.total||0} sub="DO / SO / POS menunggu sopir"/>
        <PosStat icon={Package} tone="bg-amber-50 text-amber-700" label="PENGIRIMAN SAYA" value={dos.length} sub="DO aktif ditugaskan"/>
        <PosStat icon={CheckCircle2} tone="bg-emerald-50 text-emerald-700" label="TRIP SELESAI" value={selesai.length} sub={nf(totalKm)+' km total'}/>
      </div>

      {loading ? <PosCard><PosSkeleton rows={6} cols={4}/></PosCard> : err ? <PosCard><PosError message={err} onRetry={load}/></PosCard> : (
      <>
      <PosCard>
        <div className="p-4 border-b border-[#e7ecf7] flex flex-wrap items-center gap-2 justify-between">
          <div>
            <div className="font-bold text-sm text-[#0b1c30] flex items-center gap-1.5"><Hand size={15} className="text-[#0051d5]"/> Pengiriman Tersedia</div>
            <div className="text-[11px] text-[#76777d] mt-0.5">DO yang sudah diproses gudang, SO disetujui, dan order POS dengan alamat kirim</div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {[['ALL','SEMUA',counts.total],['DO','DO',counts.DO],['SO','SO',counts.SO],['POS','POS',counts.POS]].map(([key,label,n])=>(
              <button key={key} onClick={()=>setFilter(key)}
                className={"h-8 px-3 rounded-lg text-[11px] font-bold border transition "+(filter===key?"bg-[#0051d5] text-white border-[#0051d5]":"bg-white text-[#2b3445] border-[#e7ecf7] hover:bg-[#eff4ff]")}>
                {label} <span className={"ml-0.5 "+(filter===key?'text-white/70':'text-[#76777d]')}>{(n||0)}</span>
              </button>
            ))}
          </div>
        </div>
        {claimRows.length===0 ? (
          <PosEmpty text="Tidak ada pengiriman yang bisa diklaim" hint="Gudang belum memproses DO baru, atau semua pengiriman sudah diambil driver lain."/>
        ) : (
          <div className="divide-y divide-[#e7ecf7]">
            {claimRows.map(r=>(
              <div key={r.source+'-'+r.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-[#eff4ff]/60 transition">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className={"w-9 h-9 rounded-xl grid place-items-center shrink-0 "+(r.source==='POS'?"bg-amber-50 text-amber-700":r.source==='SO'?"bg-sky-50 text-sky-700":"bg-[#f3efff] text-[#5b3fd6]")}>
                    {r.source==='POS'? <Receipt size={16}/> : r.source==='SO'? <FileText size={16}/> : <Truck size={16}/>}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-[12px] font-bold text-[#0b1c30]">{r.number}</span>
                      <PosBadge tone={SOURCE_TONE[r.source]}>{r.source}</PosBadge>
                      {r.status && <span className="text-[10px] font-bold text-[#76777d] uppercase">{String(r.status).replace('_',' ')}</span>}
                    </div>
                    <div className="text-[13px] font-semibold text-[#2b3445] truncate mt-0.5">{r.customer_name||'-'}{r.customer_phone? <span className="font-normal text-[#76777d]"> - {r.customer_phone}</span>:null}</div>
                    <div className="text-[11px] text-[#45464d] flex items-center gap-1 mt-0.5"><MapPin size={11} className="shrink-0"/><span className="truncate">{r.address||'Alamat belum diisi'}</span></div>
                    <div className="text-[11px] text-[#76777d] mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>{nf(r.items_count)} jenis - {nf(r.total_qty)} qty</span>
                      {r.total? <span>Nilai {rupiah(r.total)}</span>:null}
                      {r.est_weight_ton? <span>+/- {nf(r.est_weight_ton*1000)} kg</span>:null}
                      {r.est_zone? <span>Zona {r.est_zone}</span>:null}
                    </div>
                  </div>
                </div>
                <button onClick={()=>openClaim(r)} className={posBtnPrimary+' h-9 px-4 text-xs shrink-0'}>
                  <Hand size={14}/> Klaim
                </button>
              </div>
            ))}
          </div>
        )}
      </PosCard>

      {aktif.length>0 && (
        <PosCard className="p-4 space-y-3">
          <div className="font-bold text-sm text-[#0b1c30]">Trip Aktif</div>
          <div className="grid md:grid-cols-2 gap-3">
            {aktif.map(t=>(
              <div key={t.id} className="border border-sky-200 bg-sky-50/50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <div className="font-mono text-xs font-bold text-[#0b1c30]">{t.trip_number}</div>
                    <div className="font-bold text-sm mt-0.5">{t.plat_no||'-'} <span className="font-medium text-[#45464d] text-xs">{t.vehicle_type||''}</span></div>
                  </div>
                  <PosBadge tone={tone(t.status)}>{t.status}</PosBadge>
                </div>
                {(t.do_number||t.customer_name) && <div className="text-xs text-[#2b3445] flex items-center gap-1"><MapPin size={12}/> {t.do_number||''} {t.customer_name? '- '+t.customer_name:''}</div>}
                <div className="text-xs text-[#45464d] flex items-center gap-3 flex-wrap">
                  <span className="flex items-center gap-1"><Gauge size={12}/> Odo awal {t.odometer_start??'-'}</span>
                  <span>{d10(t.departure_date)||''}</span>
                  {parseInt(t.invoice_count||0)>0 && <span className="flex items-center gap-1 text-[#0051d5]"><Receipt size={12}/> {t.invoice_number||'invoice'} siap diserahkan</span>}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {t.do_id && <Link to={'/surat-jalan/'+t.do_id} className={posBtnSm+' h-9'}><FileText size={13}/> Surat Jalan</Link>}
                  <button onClick={()=>openComplete(t)} className={posBtnPrimary+' h-9 px-4 text-xs bg-emerald-600 hover:bg-emerald-700'}><PackageCheck size={14}/> Selesaikan & Bukti Terima</button>
                  <button onClick={()=>batalkan(t)} className={posBtnSm+' text-red-600 border-red-200 hover:bg-red-50 h-9'}><XCircle size={13}/> Batalkan</button>
                </div>
              </div>
            ))}
          </div>
        </PosCard>
      )}

      <div className="grid lg:grid-cols-2 gap-3 items-start">
        <PosCard className="p-4 space-y-3">
          <button type="button" onClick={()=>setManualOpen(o=>!o)} className="w-full flex items-center justify-between gap-2 text-left">
            <div>
              <div className="font-bold text-sm text-[#0b1c30]">Trip Tanpa Pengiriman</div>
              <div className="text-[11px] text-[#76777d] mt-0.5">Untuk pindah gudang / tugas armada tanpa DO</div>
            </div>
            <ChevronRight size={16} className={"text-[#76777d] transition-transform "+(manualOpen?'rotate-90':'')}/>
          </button>
          {manualOpen && (
            <form onSubmit={mulai} className="space-y-3 pt-1">
              {startErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{startErr}</div>}
              <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">PILIH KENDARAAN *</span>
                <select value={startForm.vehicle_id} onChange={e=>setStartForm({...startForm,vehicle_id:e.target.value})} className={posInput}>
                  <option value="">Pilih armada yang AVAILABLE</option>
                  {available.map(v=> <option key={v.id} value={v.id}>{v.plat_no} - {v.type||'armada'}{v.capacity_ton? ' ('+v.capacity_ton+' ton)':''}</option>)}
                </select>
                {available.length===0 && <span className="text-[11px] text-amber-700">Tidak ada armada AVAILABLE - hubungi gudang/admin.</span>}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">ODOMETER AWAL</span><input type="number" min="0" value={startForm.odometer_start} onChange={e=>setStartForm({...startForm,odometer_start:e.target.value})} placeholder="45210" className={posInput}/></label>
                <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">CATATAN</span><input value={startForm.notes} onChange={e=>setStartForm({...startForm,notes:e.target.value})} placeholder="opsional" className={posInput}/></label>
              </div>
              <button disabled={starting || !available.length} className={posBtnPrimary+' h-10 px-5 text-sm w-full sm:w-auto'}><Play size={15}/> {starting?'Memulai...':'Mulai Trip'}</button>
            </form>
          )}
        </PosCard>

        <PosCard>
          <div className="p-4 border-b font-bold text-sm text-[#0b1c30]">Pengiriman Saya (DO aktif)</div>
          {!dos.length ? <PosEmpty text="Tidak ada pengiriman aktif yang ditugaskan"/> : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-[#e5eeff] border-y border-[#e7ecf7] text-[11px] font-bold tracking-wider text-[#45464d]">
                  <PosTh>DO</PosTh><PosTh>PELANGGAN</PosTh><PosTh>INVOICE</PosTh><PosTh align="center">STATUS</PosTh>
                </tr></thead>
                <tbody>
                  {dos.map(d=>(
                    <tr key={d.id} className={posTr}>
                      <td className={posTd+' font-mono text-xs font-bold'}>
                        <Link to={'/surat-jalan/'+d.id} className="text-[#0051d5] hover:underline">{d.do_number}</Link>
                        {d.received_by && <div className="text-[10px] font-normal text-[#007a55] mt-0.5">diterima {d.received_by}</div>}
                      </td>
                      <td className={posTd+' text-xs'}>{d.customer_name||'-'}{d.customer_phone? <div className="text-[11px] text-[#76777d]">{d.customer_phone}</div>:null}</td>
                      <td className={posTd+' text-xs'}>{d.invoice_number? <><div className="font-mono text-[11px] font-bold">{d.invoice_number}</div><div className="text-[10px] text-[#76777d]">{d.invoice_status} - {rupiah(d.invoice_total)}{parseFloat(d.invoice_paid||0)>0? ' - DP '+rupiah(d.invoice_paid):''}</div></> : <span className="text-[#76777d]">-</span>}</td>
                      <td className={posTd+' text-center'}><PosBadge tone={d.status==='IN_TRANSIT'?'sky':'emerald'}>{d.status}</PosBadge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PosCard>
      </div>

      <PosCard>
        <div className="p-4 border-b font-bold text-sm text-[#0b1c30]">Riwayat Trip</div>
        {!selesai.length ? <PosEmpty text="Belum ada trip selesai"/> : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-[#e5eeff] border-y border-[#e7ecf7] text-[11px] font-bold tracking-wider text-[#45464d]">
                <PosTh>TRIP</PosTh><PosTh>ARMADA</PosTh><PosTh>DO / PELANGGAN</PosTh><PosTh align="right">JARAK</PosTh><PosTh align="right">BBM</PosTh><PosTh align="right">BIAYA/KM</PosTh><PosTh align="center">BUKTI TERIMA</PosTh><PosTh>TANGGAL</PosTh>
              </tr></thead>
              <tbody>
                {selesai.slice(0,20).map(t=>(
                  <tr key={t.id} className={posTr}>
                    <td className={posTd+' font-mono text-xs'}>{t.trip_number}</td>
                    <td className={posTd+' text-xs font-bold'}>{t.plat_no||'-'}</td>
                    <td className={posTd+' text-xs'}>{t.do_id? <Link to={'/surat-jalan/'+t.do_id} className="font-mono font-bold text-[#0051d5] hover:underline">{t.do_number}</Link> : '-'}{t.customer_name? ' - '+t.customer_name:''}</td>
                    <td className={posTd+' text-right tabular-nums'}>{nf(t.distance_km||0)} km</td>
                    <td className={posTd+' text-right tabular-nums'}>{t.fuel_liters? nf(t.fuel_liters)+' L':'-'}</td>
                    <td className={posTd+' text-right tabular-nums'}>{rupiah(t.cost_per_km||0)}</td>
                    <td className={posTd+' text-center text-[11px]'}>
                      <div className="flex flex-col items-center gap-0.5">
                        {t.do_signature_url ? <span className="inline-flex items-center gap-1 text-[#007a55] font-bold"><ShieldCheck size={12}/> TTD</span> : <span className="text-[#76777d]">-</span>}
                        {t.do_invoice_handed ? <span className="text-[10px] text-[#0051d5] font-bold">invoice OK</span> : null}
                      </div>
                    </td>
                    <td className={posTd+' text-xs text-[#45464d]'}>{d10(t.arrival_date)||d10(t.departure_date)||'-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PosCard>
      </>
      )}

      {claiming && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={submitClaim} className="bg-white rounded-2xl p-5 w-full max-w-lg space-y-3 border shadow-raised animate-pop max-h-[92vh] overflow-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-[16px] text-[#0b1c30]">Klaim Pengiriman</h3>
                <div className="text-xs text-[#45464d] mt-0.5 font-mono">{claiming.number}</div>
              </div>
              <button type="button" onClick={()=>setClaiming(null)} aria-label="Tutup" className="w-9 h-9 rounded-xl border grid place-items-center hover:bg-[#eff4ff]"><X size={16}/></button>
            </div>

            <div className="rounded-xl border border-[#e7ecf7] bg-[#eff4ff] p-3 space-y-1">
              <div className="flex items-center gap-2">
                <PosBadge tone={SOURCE_TONE[claiming.source]}>{SOURCE_LABEL[claiming.source]}</PosBadge>
                <span className="text-xs font-semibold text-[#2b3445] truncate">{claiming.customer_name}</span>
              </div>
              <div className="text-[11px] text-[#45464d] flex items-start gap-1"><MapPin size={11} className="mt-0.5 shrink-0"/>{claiming.address||'Alamat belum diisi'}</div>
              <div className="text-[11px] text-[#76777d]">{nf(claiming.items_count)} jenis - {nf(claiming.total_qty)} qty{claiming.total? ' - '+rupiah(claiming.total):''}</div>
            </div>

            {claimErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-start gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0"/>{claimErr}</div>}

            <div className="rounded-xl border border-[#e7ecf7] p-3 bg-white space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold tracking-wider text-[#45464d] uppercase flex items-center gap-1.5"><MapPin size={12}/> Jarak rute</span>
                {claimGeo.status==='loading' && <span className="text-[11px] text-[#76777d]">menghitung dari alamat…</span>}
                {claimGeo.status==='auto' && !claimGeo.approx && <PosBadge tone="emerald">otomatis dari alamat</PosBadge>}
                {claimGeo.status==='auto' && claimGeo.approx && <PosBadge tone="amber">perkiraan dari kota</PosBadge>}
                {claimGeo.status==='saved' && <PosBadge tone="sky">dari data DO</PosBadge>}
                {claimGeo.status==='none' && <PosBadge tone="amber">isi manual</PosBadge>}
              </div>
              <div className="flex items-center gap-2">
                <input type="number" min="0" step="0.01" value={claimGeo.km}
                  onChange={e=>setClaimGeo(g=>({...g, km:e.target.value, status: g.status==='loading'?'none':'manual'}))}
                  placeholder="0" className={posInput+' max-w-[120px]'}/>
                <span className="text-xs text-[#45464d]">km</span>
                {claimGeo.zone && <span className="text-[11px] text-[#76777d]">• zona <b className="text-[#2b3445]">{claimGeo.zone}</b></span>}
              </div>
              <div className="text-[11px] text-[#76777d]">
                {claimGeo.status==='none'
                  ? 'Alamat belum dikenali peta OSM — isi jarak manual, atau perbaiki alamat pengiriman.'
                  : claimGeo.approx
                    ? 'Alamat belum detail, jadi jarak dihitung dari kota tujuan'+(claimGeo.matched? ' ('+claimGeo.matched+')':'')+'. Periksa dan ubah bila perlu.'
                    : 'Dihitung dari '+LOCATION.name+' ke alamat pengiriman (otomatis, bisa diubah bila perlu).'}
              </div>
            </div>

            <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">ARMADA *</span>
              <select value={claimForm.vehicle_id} onChange={e=>setClaimForm({...claimForm,vehicle_id:e.target.value})} className={posInput}>
                <option value="">Pilih armada AVAILABLE</option>
                {claimVehicles.map(v=> <option key={v.id} value={v.id}>{v.plat_no} - {v.type||'armada'}{v.capacity_ton? ' ('+v.capacity_ton+' ton)':''}{v.status!=='AVAILABLE'? ' • armada DO ini':''}</option>)}
              </select>
              {claimVehicles.length===0 && <span className="text-[11px] text-amber-700">Tidak ada armada AVAILABLE - hubungi gudang.</span>}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">ODOMETER AWAL</span><input type="number" min="0" value={claimForm.odometer_start} onChange={e=>setClaimForm({...claimForm,odometer_start:e.target.value})} placeholder="45210" className={posInput}/></label>
              <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">CATATAN</span><input value={claimForm.notes} onChange={e=>setClaimForm({...claimForm,notes:e.target.value})} placeholder="opsional" className={posInput}/></label>
            </div>
            <div className="rounded-xl border border-[#e7ecf7] p-3 bg-white space-y-3">
              <div className="text-[11px] font-bold tracking-wider text-[#45464d] uppercase flex items-center gap-1.5"><PenLine size={12} className="text-[#0051d5]"/> Serah terima muatan</div>
              <SignaturePad
                label="Tanda tangan pengemudi *"
                hint="Anda (pengemudi) menandatangani sebagai penerima muatan dari gudang"
                height={140}
                onChange={(v)=>setClaimForm(s=>({...s, driver_sig:v||''}))}
              />
              <label className="space-y-1 block">
                <span className="text-[11px] font-bold tracking-wider text-[#45464d]">NAMA PETUGAS GUDANG (opsional)</span>
                <input value={claimForm.sender_name} onChange={e=>setClaimForm({...claimForm,sender_name:e.target.value})}
                  placeholder="nama petugas yang menyerahkan barang" className={posInput}/>
              </label>
              <SignaturePad
                label="Tanda tangan pengirim / gudang (opsional)"
                hint="Diisi bila petugas gudang ikut menandatangani serah terima di perangkat ini"
                height={120}
                onChange={(v)=>setClaimForm(s=>({...s, sender_sig:v||''}))}
              />
              <div className="text-[11px] text-[#76777d]">Kedua tanda tangan tercetak di surat jalan kolom <b>Pengemudi</b> dan <b>Pengirim / Gudang</b>.</div>
            </div>
            <div className="text-[11px] text-[#45464d] bg-[#eff4ff] border border-[#e7ecf7] rounded-xl p-2.5">
              Setelah diklaim, pengiriman ini terkunci untuk Anda. Selesaikan trip dengan tanda tangan penerima dan serah terima invoice.
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={()=>setClaiming(null)} className={posBtnSecondary+' h-9 px-5 text-xs'}>Batal</button>
              <button disabled={savingClaim} className={posBtnPrimary+' h-9 px-6 text-xs'}>{savingClaim?'Mengklaim...':'Klaim & Mulai Trip'}</button>
            </div>
          </form>
        </div>
      )}

      {completing && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={selesaikan} className="bg-white rounded-2xl p-5 w-full max-w-xl space-y-3 border shadow-raised animate-pop max-h-[92vh] overflow-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-[16px] text-[#0b1c30]">Selesaikan Trip</h3>
                <div className="text-xs text-[#45464d] mt-0.5">{completing.trip_number} - {completing.plat_no}{completing.do_number? ' - '+completing.do_number:''}</div>
              </div>
              <button type="button" onClick={()=>setCompleting(null)} aria-label="Tutup" className="w-9 h-9 rounded-xl border grid place-items-center hover:bg-[#eff4ff]"><X size={16}/></button>
            </div>

            {completeErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-start gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0"/>{completeErr}</div>}

            {completing.do_id && (
              <div className="rounded-xl border border-[#e7ecf7] p-3 space-y-3 bg-[#fbfcff]">
                <div className="text-[11px] font-bold tracking-wider text-[#45464d] uppercase flex items-center gap-1.5"><PackageCheck size={13} className="text-emerald-600"/> Bukti Serah Terima</div>
                <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">NAMA PENERIMA *</span>
                  <input value={completeForm.received_by} onChange={e=>setCompleteForm({...completeForm,received_by:e.target.value})} placeholder="nama lengkap penerima di lokasi" className={posInput}/>
                </label>
                <SignaturePad onChange={(sig)=>setCompleteForm(s=>({...s, signature: sig||''}))}/>
                {!completing.do_driver_signed && (
                  <SignaturePad label="Tanda tangan pengemudi *" hint="Tanda tangan Anda sebagai pengemudi yang mengantar muatan" height={130}
                    onChange={(v)=>setCompleteForm(s=>({...s, driver_signature:v||''}))}/>
                )}
                {completing.do_driver_signed && (
                  <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-2 flex items-center gap-1.5"><ShieldCheck size={12}/> Tanda tangan pengemudi sudah tersimpan saat klaim.</div>
                )}
                <div>
                  <div className="text-[11px] font-bold tracking-wider text-[#45464d] uppercase flex items-center gap-1.5 mb-1"><Camera size={13}/> Foto Bukti (opsional)</div>
                  <div className="flex items-center gap-2">
                    <label className="h-9 px-3 rounded-lg bg-white border border-[#e7ecf7] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer hover:bg-[#eff4ff]">
                      <Camera size={13}/> {completeForm.photo? 'Ganti foto':'Pilih foto'}
                      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pilihFoto} className="hidden"/>
                    </label>
                    {completeForm.photoName && <span className="text-[11px] text-[#45464d] truncate">{completeForm.photoName}</span>}
                    {completeForm.photo && <button type="button" onClick={()=>setCompleteForm(s=>({...s,photo:'',photoName:''}))} className="text-[11px] font-bold text-red-600 hover:underline">hapus</button>}
                  </div>
                  {completeForm.photo && <img src={completeForm.photo} alt="Bukti terima" className="mt-2 h-24 rounded-lg border border-[#e7ecf7] object-cover"/>}
                  <div className="text-[11px] text-[#76777d] mt-1">JPG/PNG/WEBP, maks 3 MB.</div>
                </div>
                {parseInt(completing.invoice_count||0)>0 ? (
                  <label className="flex items-start gap-2 rounded-xl border border-[#e7ecf7] bg-white p-2.5 cursor-pointer">
                    <input type="checkbox" checked={completeForm.invoice_handed} onChange={e=>setCompleteForm({...completeForm,invoice_handed:e.target.checked})} className="mt-0.5 h-4 w-4 accent-[#0051d5]"/>
                    <span className="text-[12px] text-[#2b3445] leading-snug">
                      Invoice <b className="font-mono">{completing.invoice_number||''}</b> sudah diserahkan langsung ke penerima.
                      <span className="block text-[11px] text-[#76777d]">Wajib dicentang sebelum trip bisa diselesaikan.</span>
                    </span>
                  </label>
                ) : (
                  <div className="text-[11px] text-[#76777d]">Belum ada invoice untuk pengiriman ini - invoice dibuat sales setelah DO diterima.</div>
                )}
              </div>
            )}

            <div className="rounded-xl border border-[#e7ecf7] p-3 space-y-3">
              <div className="text-[11px] font-bold tracking-wider text-[#45464d] uppercase flex items-center gap-1.5"><Gauge size={13}/> Perjalanan</div>
              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">ODO AKHIR</span><input type="number" min="0" value={completeForm.odometer_end} onChange={e=>setCompleteForm({...completeForm,odometer_end:e.target.value})} className={posInput}/></label>
                <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">BBM (L)</span><input type="number" min="0" step="0.1" value={completeForm.fuel_liters} onChange={e=>setCompleteForm({...completeForm,fuel_liters:e.target.value})} className={posInput}/></label>
                <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">BIAYA BBM</span><input type="number" min="0" value={completeForm.fuel_cost} onChange={e=>setCompleteForm({...completeForm,fuel_cost:e.target.value})} className={posInput}/></label>
              </div>
              <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">CATATAN</span><input value={completeForm.notes} onChange={e=>setCompleteForm({...completeForm,notes:e.target.value})} placeholder="kendala / kondisi jalan / barang" className={posInput}/></label>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={()=>setCompleting(null)} className={posBtnSecondary+' h-9 px-5 text-xs'}>Batal</button>
              <button disabled={savingComplete} className={posBtnPrimary+' h-9 px-6 text-xs bg-emerald-600 hover:bg-emerald-700'}>{savingComplete?'Menyimpan...':'Selesaikan Trip'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
