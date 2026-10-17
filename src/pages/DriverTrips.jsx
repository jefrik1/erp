import { useCallback, useEffect, useMemo, useState } from 'react';
import { Truck, RefreshCw, Play, CheckCircle2, XCircle, MapPin, Gauge, Fuel, Package, X } from 'lucide-react';
import api from '../lib/api';
import { useDialog } from '../components/DialogProvider';
import {
  PosPageHeader, PosCard, PosCardBody, PosBadge, PosEmpty, PosSkeleton, PosError, PosStat,
  PosTh, posTr, posTd, posInput, posBtnPrimary, posBtnSecondary, posBtnSm,
} from '../components/PosUI';

const nf = (n)=> new Intl.NumberFormat('id-ID').format(Math.round(Number(n)||0));
const rupiah = (n)=> 'Rp ' + nf(n);
const d10 = (v)=> String(v||'').slice(0,10);
const tone = (s)=> s==='COMPLETED'?'emerald' : s==='CANCELLED'?'red' : s==='IN_PROGRESS'?'sky' : 'amber';

export default function DriverTrips(){
  const dialog = useDialog();
  const [trips,setTrips]=useState([]);
  const [vehicles,setVehicles]=useState([]);
  const [dos,setDos]=useState([]);
  const [loading,setLoading]=useState(true); const [err,setErr]=useState('');

  const [startForm,setStartForm]=useState({vehicle_id:'', do_id:'', odometer_start:'', notes:''});
  const [starting,setStarting]=useState(false); const [startErr,setStartErr]=useState('');

  const [completing,setCompleting]=useState(null);
  const [completeForm,setCompleteForm]=useState({odometer_end:'', fuel_liters:'', fuel_cost:'', notes:''});
  const [savingComplete,setSavingComplete]=useState(false);

  const load = useCallback(async()=>{
    setLoading(true); setErr('');
    try{
      const [t,v,d] = await Promise.all([
        api.get('/fleet/trips',{params:{mine:1}}),
        api.get('/fleet/vehicles'),
        api.get('/fleet/my-deliveries'),
      ]);
      setTrips(Array.isArray(t.data)? t.data: []);
      setVehicles(Array.isArray(v.data)? v.data: []);
      setDos(Array.isArray(d.data)? d.data: []);
    }catch(e){ setErr(e.response?.data?.error||e.message||'Gagal memuat data trip'); }
    finally{ setLoading(false); }
  },[]);
  useEffect(()=>{ load(); },[load]);

  const aktif = useMemo(()=> trips.filter(t=>t.status==='IN_PROGRESS'),[trips]);
  const selesai = useMemo(()=> trips.filter(t=>t.status==='COMPLETED'),[trips]);
  const totalKm = useMemo(()=> selesai.reduce((a,t)=>a+(parseFloat(t.distance_km)||0),0),[selesai]);
  const available = useMemo(()=> vehicles.filter(v=>v.status==='AVAILABLE'),[vehicles]);

  const mulai = async(e)=>{
    e.preventDefault(); setStartErr('');
    if(!startForm.vehicle_id){ setStartErr('Pilih kendaraan dulu'); return; }
    setStarting(true);
    try{
      const r = await api.post('/fleet/trips', {
        vehicle_id: parseInt(startForm.vehicle_id),
        do_id: startForm.do_id? parseInt(startForm.do_id): undefined,
        odometer_start: startForm.odometer_start? parseInt(startForm.odometer_start): undefined,
        notes: startForm.notes||undefined,
      });
      setStartForm({vehicle_id:'', do_id:'', odometer_start:'', notes:''});
      await dialog.alert('Trip '+r.data.trip_number+' dimulai. Hati-hati di jalan!', { title:'Trip Dimulai' });
      load();
    }catch(e2){ setStartErr(e2.response?.data?.error||e2.message||'Gagal memulai trip'); }
    finally{ setStarting(false); }
  };

  const selesaikan = async(e)=>{
    e.preventDefault();
    if(!completing) return;
    setSavingComplete(true);
    try{
      const r = await api.post('/fleet/trips/'+completing.id+'/complete', {
        odometer_end: completeForm.odometer_end? parseInt(completeForm.odometer_end): undefined,
        fuel_liters: completeForm.fuel_liters? parseFloat(completeForm.fuel_liters): undefined,
        fuel_cost: completeForm.fuel_cost? parseFloat(completeForm.fuel_cost): undefined,
        notes: completeForm.notes||undefined,
      });
      setCompleting(null); setCompleteForm({odometer_end:'', fuel_liters:'', fuel_cost:'', notes:''});
      await dialog.alert('Trip selesai. Jarak '+nf(r.data.distance_km||0)+' km, biaya/km '+rupiah(r.data.cost_per_km||0)+'.', { title:'Trip Selesai' });
      load();
    }catch(e2){ await dialog.alert(e2.response?.data?.error||e2.message||'Gagal menyelesaikan trip', { title:'Gagal' }); }
    finally{ setSavingComplete(false); }
  };

  const batalkan = async(t)=>{
    const ok = await dialog.confirm('Batalkan trip '+t.trip_number+'? Armada akan kembali AVAILABLE.', { title:'Batalkan Trip' });
    if(!ok) return;
    try{ await api.post('/fleet/trips/'+t.id+'/cancel'); await dialog.alert('Trip dibatalkan', { title:'Dibatalkan' }); load(); }
    catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal' }); }
  };

  return (
    <div className="space-y-3">
      <PosPageHeader icon={Truck} title="Trip Saya"
        subtitle="Pengiriman & trip yang ditugaskan ke Anda - pilih kendaraan saat mulai trip, isi odometer & BBM saat selesai"
        actions={<button onClick={load} className={posBtnSecondary+' h-9 px-4 text-xs'}><RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang</button>}/>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PosStat icon={Play} tone="bg-sky-50 text-sky-700" label="TRIP AKTIF" value={aktif.length} sub="sedang berjalan"/>
        <PosStat icon={Package} tone="bg-amber-50 text-amber-700" label="PENGIRIMAN SAYA" value={dos.length} sub="DO aktif ditugaskan"/>
        <PosStat icon={CheckCircle2} tone="bg-emerald-50 text-emerald-700" label="TRIP SELESAI" value={selesai.length} sub="total tercatat"/>
        <PosStat icon={Gauge} tone="bg-[#1E40AF]/10 text-[#1E40AF]" label="TOTAL JARAK" value={nf(totalKm)+' km'} sub="dari trip selesai"/>
      </div>

      {loading ? <PosCard><PosSkeleton rows={6} cols={4}/></PosCard> : err ? <PosCard><PosError message={err} onRetry={load}/></PosCard> : (
      <>
      {aktif.length>0 && (
        <PosCard className="p-4 space-y-3">
          <div className="font-bold text-sm text-[#0F172A]">Trip Aktif</div>
          <div className="grid md:grid-cols-2 gap-3">
            {aktif.map(t=>(
              <div key={t.id} className="border border-sky-200 bg-sky-50/50 rounded-[16px] p-4 space-y-2">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <div className="font-mono text-xs font-bold text-[#0F172A]">{t.trip_number}</div>
                    <div className="font-black text-sm mt-0.5">{t.plat_no||'-'} <span className="font-medium text-[#64748B] text-xs">{t.vehicle_type||''}</span></div>
                  </div>
                  <PosBadge tone={tone(t.status)}>{t.status}</PosBadge>
                </div>
                {(t.do_number||t.customer_name) && <div className="text-xs text-[#334155] flex items-center gap-1"><MapPin size={12}/> {t.do_number||''} {t.customer_name? '- '+t.customer_name:''}</div>}
                <div className="text-xs text-[#64748B] flex items-center gap-3">
                  <span className="flex items-center gap-1"><Gauge size={12}/> Odo awal {t.odometer_start??'-'}</span>
                  <span>{d10(t.departure_date)||''}</span>
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={()=>{ setCompleting(t); setCompleteForm({odometer_end:'', fuel_liters:'', fuel_cost:'', notes:''}); }} className={posBtnPrimary+' h-9 px-4 text-xs bg-emerald-600 hover:bg-emerald-700'}><CheckCircle2 size={14}/> Selesaikan</button>
                  <button onClick={()=>batalkan(t)} className={posBtnSm+' text-red-600 border-red-200 hover:bg-red-50 h-9'}><XCircle size={13}/> Batalkan</button>
                </div>
              </div>
            ))}
          </div>
        </PosCard>
      )}

      <div className="grid lg:grid-cols-2 gap-3 items-start">
        <PosCard className="p-4 space-y-3">
          <div className="font-bold text-sm text-[#0F172A]">Mulai Trip Baru</div>
          {startErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{startErr}</div>}
          <form onSubmit={mulai} className="space-y-3">
            <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">PILIH KENDARAAN *</span>
              <select value={startForm.vehicle_id} onChange={e=>setStartForm({...startForm,vehicle_id:e.target.value})} className={posInput}>
                <option value="">Pilih armada yang AVAILABLE</option>
                {available.map(v=> <option key={v.id} value={v.id}>{v.plat_no} - {v.type||'armada'}{v.capacity_ton? ' ('+v.capacity_ton+' ton)':''}</option>)}
              </select>
              {available.length===0 && <span className="text-[11px] text-amber-700">Tidak ada armada AVAILABLE - hubungi gudang/admin.</span>}
            </label>
            <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">PENGIRIMAN (opsional)</span>
              <select value={startForm.do_id} onChange={e=>setStartForm({...startForm,do_id:e.target.value})} className={posInput}>
                <option value="">Tanpa DO</option>
                {dos.map(d=> <option key={d.id} value={d.id}>{d.do_number} - {d.customer_name||''}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">ODOMETER AWAL</span><input type="number" min="0" value={startForm.odometer_start} onChange={e=>setStartForm({...startForm,odometer_start:e.target.value})} placeholder="contoh: 45210" className={posInput}/></label>
              <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">CATATAN</span><input value={startForm.notes} onChange={e=>setStartForm({...startForm,notes:e.target.value})} placeholder="opsional" className={posInput}/></label>
            </div>
            <button disabled={starting || !available.length} className={posBtnPrimary+' h-10 px-5 text-sm w-full sm:w-auto'}><Play size={15}/> {starting?'Memulai...':'Mulai Trip'}</button>
          </form>
        </PosCard>

        <PosCard>
          <div className="p-4 border-b font-bold text-sm text-[#0F172A]">Pengiriman Saya (DO aktif)</div>
          {!dos.length ? <PosEmpty text="Tidak ada pengiriman aktif yang ditugaskan"/> : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]">
                  <PosTh>DO</PosTh><PosTh>PELANGGAN</PosTh><PosTh>ALAMAT</PosTh><PosTh align="center">STATUS</PosTh>
                </tr></thead>
                <tbody>
                  {dos.map(d=>(
                    <tr key={d.id} className={posTr}>
                      <td className={posTd+' font-mono text-xs font-bold'}>{d.do_number}</td>
                      <td className={posTd+' text-xs'}>{d.customer_name||'-'}{d.customer_phone? <div className="text-[10px] text-[#94A3B8]">{d.customer_phone}</div>:null}</td>
                      <td className={posTd+' text-xs text-[#64748B] max-w-[220px]'}><span className="line-clamp-2">{d.shipping_address||'-'}</span></td>
                      <td className={posTd+' text-center'}><PosBadge tone={d.status==='IN_TRANSIT'?'sky':'amber'}>{d.status}</PosBadge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PosCard>
      </div>

      <PosCard>
        <div className="p-4 border-b font-bold text-sm text-[#0F172A]">Riwayat Trip</div>
        {!selesai.length ? <PosEmpty text="Belum ada trip selesai"/> : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]">
                <PosTh>TRIP</PosTh><PosTh>ARMADA</PosTh><PosTh>DO / PELANGGAN</PosTh><PosTh align="right">JARAK</PosTh><PosTh align="right">BBM</PosTh><PosTh align="right">BIAYA/KM</PosTh><PosTh>TANGGAL</PosTh>
              </tr></thead>
              <tbody>
                {selesai.slice(0,20).map(t=>(
                  <tr key={t.id} className={posTr}>
                    <td className={posTd+' font-mono text-xs'}>{t.trip_number}</td>
                    <td className={posTd+' text-xs font-bold'}>{t.plat_no||'-'}</td>
                    <td className={posTd+' text-xs'}>{t.do_number||'-'}{t.customer_name? ' - '+t.customer_name:''}</td>
                    <td className={posTd+' text-right tabular-nums'}>{nf(t.distance_km||0)} km</td>
                    <td className={posTd+' text-right tabular-nums'}>{t.fuel_liters? nf(t.fuel_liters)+' L':'-'}</td>
                    <td className={posTd+' text-right tabular-nums'}>{rupiah(t.cost_per_km||0)}</td>
                    <td className={posTd+' text-xs text-[#64748B]'}>{d10(t.arrival_date)||d10(t.departure_date)||'-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PosCard>
      </>
      )}

      {completing && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={selesaikan} className="bg-white rounded-[20px] p-5 w-full max-w-md space-y-3 border shadow-xl animate-pop">
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="font-black text-[16px] text-[#0F172A]">Selesaikan Trip</h3><div className="text-xs text-[#64748B] mt-0.5">{completing.trip_number} - {completing.plat_no}</div></div>
              <button type="button" onClick={()=>setCompleting(null)} aria-label="Tutup" className="w-9 h-9 rounded-xl border grid place-items-center hover:bg-[#F8FAFC]"><X size={16}/></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">ODOMETER AKHIR</span><input type="number" min="0" value={completeForm.odometer_end} onChange={e=>setCompleteForm({...completeForm,odometer_end:e.target.value})} className={posInput}/></label>
              <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">BBM (LITER)</span><input type="number" min="0" step="0.1" value={completeForm.fuel_liters} onChange={e=>setCompleteForm({...completeForm,fuel_liters:e.target.value})} className={posInput}/></label>
            </div>
            <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">BIAYA BBM (Rp)</span><input type="number" min="0" value={completeForm.fuel_cost} onChange={e=>setCompleteForm({...completeForm,fuel_cost:e.target.value})} className={posInput}/></label>
            <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">CATATAN</span><input value={completeForm.notes} onChange={e=>setCompleteForm({...completeForm,notes:e.target.value})} placeholder="kendala / kondisi jalan" className={posInput}/></label>
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
