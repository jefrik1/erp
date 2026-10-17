import { useEffect, useState, useMemo } from 'react';
import { FileText, Search, Truck, Wrench, Plus, AlertTriangle, Calendar, Fuel, Gauge, MapPin, X, Pencil, History, BarChart3, Ban } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { PosPageHeader } from '../components/PosUI';
import { Badge } from '../components/Layout';
import { useDialog } from '../components/DialogProvider';

function rupiah(n){ return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n||0); }
function compact(n){ return new Intl.NumberFormat('id-ID',{notation:'compact'}).format(n||0); }
function daysLeft(dateStr){
  if(!dateStr) return null;
  const d=new Date(dateStr); const t=new Date(); d.setHours(0,0,0,0); t.setHours(0,0,0,0);
  return Math.ceil((d - t)/86400000);
}
function kirBadge(dateStr){
  const d=daysLeft(dateStr);
  if(d===null) return null;
  if(d < 0) return {label:`KIR HABIS ${Math.abs(d)} hari`, cls:'bg-red-600 text-white border-red-700', dot:'●'};
  if(d <= 7) return {label:`KIR ${d} hari lagi`, cls:'bg-red-50 text-red-700 border-red-200', dot:'●'};
  if(d <= 30) return {label:`KIR ${d} hari`, cls:'bg-amber-50 text-amber-800 border-amber-200', dot:'●'};
  return {label:`KIR ${d} hari`, cls:'bg-emerald-50 text-emerald-700 border-emerald-200', dot:'●'};
}
function taxBadge(dateStr){
  const d=daysLeft(dateStr);
  if(d===null) return null;
  if(d < 0) return {label:`Pajak HABIS`, cls:'bg-red-600 text-white border-red-700'};
  if(d <= 14) return {label:`Pajak ${d} hari`, cls:'bg-amber-50 text-amber-800 border-amber-200'};
  return {label:`Pajak ${d} hari`, cls:'bg-white text-[#64748B] border-[#E2E8F0]'};
}

const OWNERSHIP_LABEL={OWNED:'Milik', RENTED:'Sewa', THIRD_PARTY:'Vendor'};

export default function Fleet(){
  const dialog=useDialog();
  const [vehicles,setVehicles]=useState([]);
  const [trips,setTrips]=useState([]);
  const [stats,setStats]=useState(null);
  const [maint,setMaint]=useState([]);
  const [employees,setEmployees]=useState([]);
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState('');
  const [msg,setMsg]=useState('');

  const [tab,setTab]=useState('armada'); // armada | trip | maintenance | analitik
  const [qArmada,setQArmada]=useState('');
  const [searchArmada,setSearchArmada]=useState('');
  const [statusArmada,setStatusArmada]=useState(''); // '', AVAILABLE, IN_TRANSIT, MAINTENANCE
  const [ownFilter,setOwnFilter]=useState('');
  const [areaFilter,setAreaFilter]=useState(''); // '', DALAM_KOTA, LUAR_KOTA

  const [qTrip,setQTrip]=useState('');
  const [searchTrip,setSearchTrip]=useState('');
  const [tripStatusFilter,setTripStatusFilter]=useState('');

  const [showVehicle,setShowVehicle]=useState(false);
  const [editingVehicle,setEditingVehicle]=useState(null);
  const [vehicleForm,setVehicleForm]=useState({plat_no:'', type:'Colt Diesel 8 Ton', brand:'Mitsubishi', model:'', year:'', capacity_ton:'8', capacity_volume_m3:'20', ownership:'OWNED', kir_expiry:'', tax_expiry:'', driver_id:'', photo_url:'', area:'DALAM_KOTA', tarif_dalam_flat:'150000', tarif_dalam_per_ton:'120000', tarif_luar_flat:'600000', tarif_luar_per_ton:'350000'});

  const [showTrip,setShowTrip]=useState(false);
  const [tripForm,setTripForm]=useState({vehicle_id:'', driver_id:'', do_id:'', route:'', distance_km:'', fuel_cost:'', toll_cost:'', other_cost:'', fuel_liters:'', odometer_start:'', notes:''});

  const [showMaint,setShowMaint]=useState(false);
  const [maintForm,setMaintForm]=useState({vehicle_id:'', service_date:'', next_service_date:'', cost:'', workshop:'', description:''});

  const [completeId,setCompleteId]=useState(null);
  const [completeForm,setCompleteForm]=useState({odometer_end:'', fuel_liters:'', fuel_cost:'', notes:''});
  const [historyOpen,setHistoryOpen]=useState(false);
  const [historyData,setHistoryData]=useState(null);
  const [historyLoading,setHistoryLoading]=useState(false);

  const load=async()=>{
    setLoading(true);
    try{
      const [v,t,s,m,e]=await Promise.all([
        api.get('/fleet/vehicles').then(r=>r.data).catch(()=>[]),
        api.get('/fleet/trips').then(r=>r.data).catch(()=>[]),
        api.get('/fleet/stats').then(r=>r.data).catch(()=>null),
        api.get('/fleet/maintenance').then(r=>r.data).catch(()=>[]),
        api.get('/fleet/employees').then(r=>r.data).catch(()=>[]),
      ]);
      if(Array.isArray(v)) setVehicles(v);
      if(Array.isArray(t)) setTrips(t);
      if(s) setStats(s);
      if(Array.isArray(m)) setMaint(m);
      if(Array.isArray(e)) setEmployees(e);
    }catch(e){ setErr(e.response?.data?.error||e.message); }
    finally{ setLoading(false); }
  };
  useEffect(()=>{ load(); },[]);

  // filters
  const filteredVehicles=useMemo(()=>{
    let arr=[...vehicles];
    if(searchArmada){
      const q=searchArmada.toLowerCase();
      arr=arr.filter(v=> (v.plat_no||'').toLowerCase().includes(q) || (v.type||'').toLowerCase().includes(q) || (v.driver_name||'').toLowerCase().includes(q) || (v.brand||'').toLowerCase().includes(q));
    }
    if(statusArmada) arr=arr.filter(v=> v.status===statusArmada);
    if(ownFilter) arr=arr.filter(v=> v.ownership===ownFilter);
    if(areaFilter) arr=arr.filter(v=> (v.area||'DALAM_KOTA')===areaFilter);
    return arr;
  },[vehicles, searchArmada, statusArmada, ownFilter, areaFilter]);

  const filteredTrips=useMemo(()=>{
    let arr=[...trips];
    if(searchTrip){
      const q=searchTrip.toLowerCase();
      arr=arr.filter(t=> (t.trip_number||'').toLowerCase().includes(q) || (t.plat_no||'').toLowerCase().includes(q) || (t.route||'').toLowerCase().includes(q) || (t.do_number||'').toLowerCase().includes(q));
    }
    if(tripStatusFilter) arr=arr.filter(t=> t.status===tripStatusFilter);
    return arr;
  },[trips, searchTrip, tripStatusFilter]);

  const utilization = stats && stats.total ? Math.round((stats.in_transit||0)/stats.total*100) : 0;

  const openAddVehicle=()=>{
    setEditingVehicle(null);
    setVehicleForm({plat_no:'', type:'Colt Diesel 8 Ton', brand:'Mitsubishi', model:'', year:'', capacity_ton:'8', capacity_volume_m3:'20', ownership:'OWNED', kir_expiry:'', tax_expiry:'', driver_id:'', photo_url:'', area:'DALAM_KOTA', tarif_dalam_flat:'150000', tarif_dalam_per_ton:'120000', tarif_luar_flat:'600000', tarif_luar_per_ton:'350000', acquisition_date:'', acquisition_cost:'', residual_value:'0', useful_life_years:'8'});
    setShowVehicle(true);
  };
  const openEditVehicle=(v)=>{
    setEditingVehicle(v);
    setVehicleForm({
      plat_no: v.plat_no||'', type: v.type||'', brand: v.brand||'', model: v.model||'', year: v.year||'',
      capacity_ton: String(v.capacity_ton||''), capacity_volume_m3: String(v.capacity_volume_m3||''),
      ownership: v.ownership||'OWNED', kir_expiry: v.kir_expiry? String(v.kir_expiry).slice(0,10):'', tax_expiry: v.tax_expiry? String(v.tax_expiry).slice(0,10):'',
      driver_id: v.driver_id? String(v.driver_id):'', photo_url: v.photo_url||'',
      area: v.area||'DALAM_KOTA', tarif_dalam_flat: String(v.tarif_dalam_flat ?? 150000), tarif_dalam_per_ton: String(v.tarif_dalam_per_ton ?? 120000), tarif_luar_flat: String(v.tarif_luar_flat ?? 600000), tarif_luar_per_ton: String(v.tarif_luar_per_ton ?? 350000),
      acquisition_date: v.acquisition_date? String(v.acquisition_date).slice(0,10):'',
      acquisition_cost: v.acquisition_cost!=null? String(v.acquisition_cost):'',
      residual_value: v.residual_value!=null? String(v.residual_value):'0',
      useful_life_years: v.useful_life_years!=null? String(v.useful_life_years):'8'
    });
    setShowVehicle(true);
  };
  const submitVehicle=async(e)=>{
    e.preventDefault();
    try{
      if(editingVehicle){
        await api.put('/fleet/vehicles/'+editingVehicle.id, {
          plat_no: vehicleForm.plat_no.trim().toUpperCase(),
          type: vehicleForm.type, brand: vehicleForm.brand, model: vehicleForm.model||null,
          year: vehicleForm.year?parseInt(vehicleForm.year):null,
          capacity_ton: parseFloat(vehicleForm.capacity_ton)||8,
          capacity_volume_m3: parseFloat(vehicleForm.capacity_volume_m3)||20,
          ownership: vehicleForm.ownership,
          kir_expiry: vehicleForm.kir_expiry||null, tax_expiry: vehicleForm.tax_expiry||null,
          driver_id: vehicleForm.driver_id?parseInt(vehicleForm.driver_id):null,
          photo_url: vehicleForm.photo_url||null,
          area: vehicleForm.area||'DALAM_KOTA',
          tarif_dalam_flat: parseFloat(vehicleForm.tarif_dalam_flat)||150000,
          tarif_dalam_per_ton: parseFloat(vehicleForm.tarif_dalam_per_ton)||120000,
          tarif_luar_flat: parseFloat(vehicleForm.tarif_luar_flat)||600000,
          tarif_luar_per_ton: parseFloat(vehicleForm.tarif_luar_per_ton)||350000,
          acquisition_date: vehicleForm.acquisition_date||null,
          acquisition_cost: vehicleForm.acquisition_cost!==''? parseFloat(vehicleForm.acquisition_cost)||0 : null,
          residual_value: vehicleForm.residual_value!==''? parseFloat(vehicleForm.residual_value)||0 : null,
          useful_life_years: vehicleForm.useful_life_years!==''? parseInt(vehicleForm.useful_life_years)||8 : null
        });
        setMsg('Armada '+vehicleForm.plat_no+' diperbarui');
      }else{
        await api.post('/fleet/vehicles',{
          plat_no: vehicleForm.plat_no.trim().toUpperCase(),
          type: vehicleForm.type, brand: vehicleForm.brand, model: vehicleForm.model||null,
          year: vehicleForm.year?parseInt(vehicleForm.year):null,
          capacity_ton: parseFloat(vehicleForm.capacity_ton)||8,
          capacity_volume_m3: parseFloat(vehicleForm.capacity_volume_m3)||20,
          ownership: vehicleForm.ownership,
          kir_expiry: vehicleForm.kir_expiry||null, tax_expiry: vehicleForm.tax_expiry||null,
          driver_id: vehicleForm.driver_id?parseInt(vehicleForm.driver_id):null,
          photo_url: vehicleForm.photo_url||null,
          area: vehicleForm.area||'DALAM_KOTA',
          tarif_dalam_flat: parseFloat(vehicleForm.tarif_dalam_flat)||150000,
          tarif_dalam_per_ton: parseFloat(vehicleForm.tarif_dalam_per_ton)||120000,
          tarif_luar_flat: parseFloat(vehicleForm.tarif_luar_flat)||600000,
          tarif_luar_per_ton: parseFloat(vehicleForm.tarif_luar_per_ton)||350000,
          acquisition_date: vehicleForm.acquisition_date||null,
          acquisition_cost: parseFloat(vehicleForm.acquisition_cost)||0,
          residual_value: parseFloat(vehicleForm.residual_value)||0,
          useful_life_years: parseInt(vehicleForm.useful_life_years)||8
        });
        setMsg('Armada '+vehicleForm.plat_no+' ditambahkan');
      }
      setShowVehicle(false); load();
      setTimeout(()=>setMsg(''),3000);
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message, {title:'Gagal simpan armada'}); }
  };

  const submitTrip=async(e)=>{
    e.preventDefault();
    try{
      await api.post('/fleet/trips',{
        vehicle_id: parseInt(tripForm.vehicle_id),
        driver_id: tripForm.driver_id?parseInt(tripForm.driver_id):null,
        do_id: tripForm.do_id?parseInt(tripForm.do_id):null,
        route:tripForm.route||null,
        distance_km: parseFloat(tripForm.distance_km)||0,
        fuel_cost: parseFloat(tripForm.fuel_cost)||0,
        toll_cost: parseFloat(tripForm.toll_cost)||0,
        other_cost: parseFloat(tripForm.other_cost)||0,
        fuel_liters: tripForm.fuel_liters?parseFloat(tripForm.fuel_liters):null,
        odometer_start: tripForm.odometer_start?parseInt(tripForm.odometer_start):null,
        notes: tripForm.notes||null
      });
      setShowTrip(false);
      setTripForm({vehicle_id:'', driver_id:'', do_id:'', route:'', distance_km:'', fuel_cost:'', toll_cost:'', other_cost:'', fuel_liters:'', odometer_start:'', notes:''});
      setMsg('Trip dibuat - armada jadi IN_TRANSIT');
      load();
      setTimeout(()=>setMsg(''),3000);
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message, {title:'Gagal buat trip'}); }
  };

  const submitComplete=async(e)=>{
    e.preventDefault();
    if(!completeId) return;
    try{
      const r=await api.post('/fleet/trips/'+completeId+'/complete',{
        odometer_end: completeForm.odometer_end?parseInt(completeForm.odometer_end):null,
        fuel_liters: completeForm.fuel_liters?parseFloat(completeForm.fuel_liters):null,
        fuel_cost: completeForm.fuel_cost?parseFloat(completeForm.fuel_cost):null,
        notes: completeForm.notes||null
      });
      setCompleteId(null);
      const cpk=r.data.cost_per_km? ` • Rp ${Math.round(r.data.cost_per_km).toLocaleString('id-ID')}/km`: '';
      const kml=r.data.km_per_l? ` • ${r.data.km_per_l.toFixed(1)} km/l`: '';
      setMsg(`Trip selesai ${r.data.distance_km||''} km${cpk}${kml} - armada AVAILABLE`);
      load();
      setTimeout(()=>setMsg(''),4000);
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message, {title:'Gagal selesaikan trip'}); }
  };
  const cancelTrip=async(id)=>{
    const ok=await dialog.confirm('Batalkan trip ini? Armada akan kembali AVAILABLE.', {title:'Batalkan Trip'});
    if(!ok) return;
    try{ await api.post('/fleet/trips/'+id+'/cancel'); setMsg('Trip dibatalkan'); load(); }catch(e){ await dialog.alert(e.response?.data?.error||e.message); }
  };
  const openHistory=async(v)=>{
    setHistoryLoading(true); setHistoryData(null); setHistoryOpen(true);
    try{
      const r=await api.get('/fleet/vehicles/'+v.id+'/history');
      setHistoryData(r.data);
    }catch(e){ setHistoryData({error:e.response?.data?.error||e.message}); }
    finally{ setHistoryLoading(false); }
  };
  const submitMaint=async(e)=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    try{
      await api.post('/fleet/maintenance',{
        vehicle_id: parseInt(fd.get('vehicle_id')),
        service_date: fd.get('service_date')||new Date().toISOString().slice(0,10),
        next_service_date: fd.get('next_service_date')||null,
        cost: parseFloat(fd.get('cost'))||0,
        workshop: fd.get('workshop')||null,
        description: fd.get('description')||null,
        maintenance_type: fd.get('maintenance_type')||'PREVENTIVE'
      });
      setShowMaint(false); load(); setMsg('Servis dicatat');
      setTimeout(()=>setMsg(''),2500);
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message); }
  };

  return (
    <div className="space-y-3">
      {/* Header POS */}
      <PosPageHeader icon={FileText} title="Armada & Trip" subtitle="Kelola armada toko bangunan • KIR/Pajak/SIM guard • Kapasitas vs muatan • Biaya/km • Preventive servis" actions={<>
        <button onClick={openAddVehicle} className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl inline-flex items-center gap-1.5 text-sm font-bold shadow-sm hover:bg-[#1E3A8A] active:scale-[0.98] transition"><Plus size={16}/> Armada</button>
        <button onClick={()=>setShowTrip(true)} className="h-[42px] px-5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-bold text-[#334155] hover:bg-[#F8FAFC]">+ Trip</button>
      </>}/>

      {msg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-3 rounded-xl text-sm flex justify-between gap-2"><span>{msg}</span><button onClick={()=>setMsg('')} className="font-bold"><X size={14}/></button></div>}
      {err && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm flex justify-between gap-2"><span className="break-all">{err}</span><button onClick={()=>setErr('')} className="font-bold"><X size={14}/></button></div>}

      {/* Stats POS 6-col with KIR/Pajak/SIM + area breakdown */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <div className="bg-white rounded-[20px] border border-[#E2E8F0] p-3 text-center shadow-sm">
            <div className="text-[11px] font-bold tracking-widest text-[#64748B]">ARMADA</div>
            <div className="text-xl font-black text-[#0F172A]">{stats.total}</div>
            <div className="text-[11px] text-[#64748B]">{stats.available} available • {stats.in_transit} jalan ({utilization}%)</div>
            <div className="mt-1 h-1.5 bg-[#F1F5F9] rounded-full overflow-hidden"><div className="h-full bg-[#1E40AF]" style={{width: utilization+'%'}}/></div>
            <div className="mt-1 flex justify-center gap-1 flex-wrap text-[10px] font-bold">
              {(stats.by_area||[]).map(a=> <span key={a.area} className={"px-1.5 py-0.5 rounded-full border "+(a.area==='LUAR_KOTA'?'bg-amber-50 text-amber-800 border-amber-200':'bg-sky-50 text-sky-700 border-sky-200')}>{a.area==='LUAR_KOTA'?'Luar Kota':'Dalam Kota'} {a.cnt}</span>)}
            </div>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-[20px] p-3 text-center">
            <div className="text-[11px] font-bold tracking-widest text-emerald-700">AVAILABLE</div>
            <div className="text-xl font-black text-emerald-700">{stats.available}</div>
            <div className="text-[11px] text-emerald-700/70">Siap jalan</div>
          </div>
          <div className="bg-sky-50 border border-sky-200 rounded-[20px] p-3 text-center">
            <div className="text-[11px] font-bold tracking-widest text-sky-700">IN_TRANSIT</div>
            <div className="text-xl font-black text-sky-700">{stats.in_transit ?? stats.in_transit}</div>
            <div className="text-[11px] text-sky-700/70">Sedang kirim</div>
          </div>
          <div className={"rounded-[20px] border p-3 text-center "+( (stats.kir_overdue||0)>0 ? 'bg-red-50 border-red-200':'bg-white border-[#E2E8F0]')}>
            <div className="text-[11px] font-bold tracking-widest flex items-center justify-center gap-1" style={{color:(stats.kir_overdue||0)>0?'#B91C1C':'#64748B'}}><AlertTriangle size={12}/> KIR</div>
            <div className={"text-xl font-black "+((stats.kir_overdue||0)>0?'text-red-600':'text-[#0F172A]')}>{stats.kir_overdue||0} <span className="text-xs font-bold text-[#94A3B8]">habis</span></div>
            <div className="text-[11px] text-[#64748B]">{stats.kir_soon||0} &lt;30 hari</div>
          </div>
          <div className="bg-white rounded-[20px] border border-[#E2E8F0] p-3 text-center shadow-sm">
            <div className="text-[11px] font-bold tracking-widest text-[#64748B]">BIAYA 30H</div>
            <div className="text-[15px] font-black text-[#0F172A]">{compact(stats.cost_30||0)}</div>
            <div className="text-[11px] text-[#64748B]">{stats.trips_30||0} trip • {compact(stats.km_30||0)} km</div>
            {stats.avg_cost_per_km ? <div className="text-[11px] font-bold text-[#1E40AF]">Rp {Math.round(stats.avg_cost_per_km).toLocaleString('id-ID')}/km</div> : null}
            <div className="mt-1.5 flex flex-col gap-1 text-[10px] font-bold">
              <span className={"px-1.5 py-0.5 rounded-full border "+((stats.variance_dalam_30||0)>0?'bg-red-50 text-red-700 border-red-200':(stats.variance_dalam_30||0)<0?'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0]')}>Dalam {compact(stats.est_dalam_30||0)} • {(stats.variance_dalam_30>0?'+':'')+compact(stats.variance_dalam_30||0)}</span>
              <span className={"px-1.5 py-0.5 rounded-full border "+((stats.variance_luar_30||0)>0?'bg-red-50 text-red-700 border-red-200':(stats.variance_luar_30||0)<0?'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0]')}>Luar {compact(stats.est_luar_30||0)} • {(stats.variance_luar_30>0?'+':'')+compact(stats.variance_luar_30||0)}</span>
            </div>
          </div>
          <div className={"rounded-[20px] border p-3 text-center "+( (stats.tax_overdue||0)+(stats.sim_overdue||0)>0 ? 'bg-amber-50 border-amber-200':'bg-white border-[#E2E8F0]')}>
            <div className="text-[11px] font-bold tracking-widest text-[#64748B]">PAJAK • SIM</div>
            <div className="text-sm font-black text-[#0F172A]">{stats.tax_overdue||0} pajak • {stats.sim_overdue||0} SIM habis</div>
            <div className="text-[11px] text-[#64748B]">Perlu perpanjang</div>
          </div>
        </div>
      )}

      {/* Tabs POS pill */}
      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm p-2 flex flex-wrap gap-1.5">
        {[
          {id:'armada', label:'Armada', count: vehicles.length, icon: Truck},
          {id:'trip', label:'Trip', count: trips.length, icon: MapPin},
          {id:'maintenance', label:'Maintenance', count: maint.length, icon: Wrench},
          {id:'analitik', label:'Analitik', count: '₽', icon: BarChart3},
        ].map(t=>{
          const active=tab===t.id;
          return (
            <button key={t.id} onClick={()=>setTab(t.id)} className={"inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold border transition "+(active?'bg-[#1E40AF] text-white border-[#1E40AF] shadow':'bg-white text-[#334155] border-[#E2E8F0] hover:bg-[#F8FAFC]')}>
              <t.icon size={14}/> {t.label}
              <span className={"min-w-[22px] h-5 px-1.5 grid place-items-center rounded-full text-[11px] font-bold "+(active?'bg-white text-[#1E40AF]':'bg-[#F1F5F9] text-[#64748B]')}>{t.count}</span>
            </button>
          )
        })}
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden lg:inline text-xs text-[#64748B]">{tab==='armada'? filteredVehicles.length+' unit': tab==='trip'? filteredTrips.length+' trip': ''}</span>
          {tab==='armada' && <button onClick={openAddVehicle} className="lg:hidden h-8 px-3 bg-[#1E40AF] text-white rounded-full text-xs font-bold">+ Armada</button>}
          {tab==='trip' && <button onClick={()=>setShowTrip(true)} className="lg:hidden h-8 px-3 bg-[#1E40AF] text-white rounded-full text-xs font-bold">+ Trip</button>}
        </div>
      </div>

      {/* ARMADA TAB */}
      {tab==='armada' && (
        <div className="space-y-3">
          {/* Search + filter POS */}
          <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm p-3 sm:p-4 space-y-3">
            <div className="flex flex-col lg:flex-row gap-3">
              <div className="flex-1 relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"/>
                <input value={qArmada} onChange={e=>setQArmada(e.target.value)} onKeyDown={e=>e.key==='Enter'&&setSearchArmada(qArmada)} placeholder="Cari plat / tipe / driver / brand..." className="w-full h-[42px] pl-9 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"/>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={()=>{setSearchArmada(qArmada);}} className="h-[42px] px-5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-semibold text-[#334155] hover:bg-[#F8FAFC]">Cari</button>
                {searchArmada && <button onClick={()=>{setQArmada(''); setSearchArmada('');}} className="h-[42px] w-[42px] grid place-items-center bg-white border rounded-xl"><X size={14}/></button>}
                <select value={statusArmada} onChange={e=>setStatusArmada(e.target.value)} className="h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs font-bold">
                  <option value="">Semua status</option><option value="AVAILABLE">AVAILABLE</option><option value="IN_TRANSIT">IN_TRANSIT</option><option value="MAINTENANCE">MAINTENANCE</option>
                </select>
                <select value={ownFilter} onChange={e=>setOwnFilter(e.target.value)} className="h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs font-bold">
                  <option value="">Semua kepemilikan</option><option value="OWNED">Milik</option><option value="RENTED">Sewa</option><option value="THIRD_PARTY">Vendor</option>
                </select>
                <select value={areaFilter} onChange={e=>setAreaFilter(e.target.value)} className="h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs font-bold">
                  <option value="">Semua area</option><option value="DALAM_KOTA">Dalam Kota</option><option value="LUAR_KOTA">Luar Kota</option>
                </select>
              </div>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {[
                {id:'', label:'Semua'},
                {id:'AVAILABLE', label:'Available'},
                {id:'IN_TRANSIT', label:'Sedang Kirim'},
                {id:'MAINTENANCE', label:'Maintenance'},
              ].map(f=>(
                <button key={f.id} onClick={()=>setStatusArmada(f.id)} className={"px-3.5 py-1.5 rounded-full text-xs font-bold border "+(statusArmada===f.id?'bg-[#1E40AF] text-white border-[#1E40AF]':'bg-white text-[#334155] border-[#E2E8F0]')}>{f.label}</button>
              ))}
              <span className="h-5 w-px bg-[#E2E8F0] self-center mx-1"/>
              {[
                {id:'', label:'Semua Area'},
                {id:'DALAM_KOTA', label:'Dalam Kota'},
                {id:'LUAR_KOTA', label:'Luar Kota'},
              ].map(f=>(
                <button key={'area-'+f.id} onClick={()=>setAreaFilter(f.id)} className={"px-3.5 py-1.5 rounded-full text-xs font-bold border "+(areaFilter===f.id?'bg-[#0F172A] text-white border-[#0F172A]':'bg-white text-[#334155] border-[#E2E8F0]')}>{f.label}</button>
              ))}
              <span className="ml-auto text-xs text-[#94A3B8] hidden sm:inline">{filteredVehicles.length} unit • kapasitas total {filteredVehicles.reduce((s,v)=>s+parseFloat(v.capacity_ton||0),0).toFixed(1)} ton</span>
            </div>
          </div>

          {/* Grid Armada cards */}
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredVehicles.map(v=>{
              const k=kirBadge(v.kir_expiry);
              const tx=taxBadge(v.tax_expiry);
              const simDays=daysLeft(v.sim_expiry);
              const simWarn = simDays!==null && simDays<0 ? {label:'SIM HABIS', cls:'bg-red-600 text-white'} : simDays!==null && simDays<=7 ? {label:`SIM ${simDays} hari`, cls:'bg-red-50 text-red-700 border-red-200'} : simDays!==null && simDays<=30 ? {label:`SIM ${simDays} hari`, cls:'bg-amber-50 text-amber-800'} : null;
              const isTransit=v.status==='IN_TRANSIT';
              return (
                <div key={v.id} className={"bg-white rounded-[20px] border shadow-sm overflow-hidden flex flex-col "+(isTransit?'border-sky-200 ring-1 ring-sky-100':'border-[#E2E8F0]')}>
                  <div className={"h-1.5 "+(isTransit?'bg-sky-500': v.status==='MAINTENANCE'?'bg-amber-400':'bg-emerald-500')}/>
                  <div className="p-4 space-y-2.5 flex-1">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <div className="font-mono font-black text-sm text-[#0F172A] tracking-tight flex items-center gap-1.5 flex-wrap">{v.plat_no}<span className={"px-1.5 py-0.5 rounded-full text-[10px] font-bold border tracking-wide "+( (v.area||'DALAM_KOTA')==='LUAR_KOTA' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-sky-50 text-sky-700 border-sky-200')}>{(v.area||'DALAM_KOTA')==='LUAR_KOTA'?'Luar Kota':'Dalam Kota'}</span></div>
                        <div className="text-xs text-[#334155] font-semibold">{v.type} • {v.brand||'-'} {v.model? '· '+v.model:''} {v.year? '· '+v.year:''}</div>
                        <div className="text-[11px] text-[#64748B]">{v.capacity_weight_kg? (v.capacity_weight_kg/1000)+' ton' : (v.capacity_ton||'-')+' ton'} • {v.capacity_volume_m3||'-'} m³ • <span className="font-bold">{OWNERSHIP_LABEL[v.ownership]||v.ownership}</span> • {v.driver_name||'-'} {v.driver_phone? '· '+v.driver_phone:''}</div>
                        <div className="text-[11px] text-[#64748B]">Tarif Dalam {new Intl.NumberFormat('id-ID').format(v.tarif_dalam_flat??150000)}+{new Intl.NumberFormat('id-ID').format(v.tarif_dalam_per_ton??120000)}/ton • Luar {new Intl.NumberFormat('id-ID').format(v.tarif_luar_flat??600000)}+{new Intl.NumberFormat('id-ID').format(v.tarif_luar_per_ton??350000)}/ton</div>
                      </div>
                      <span className={"shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold border "+(v.status==='AVAILABLE'?'bg-emerald-50 text-emerald-700 border-emerald-200': v.status==='IN_TRANSIT'?'bg-sky-50 text-sky-700 border-sky-200':'bg-amber-50 text-amber-700 border-amber-200')}>{v.status}</span>
                    </div>

                    {isTransit && v.active_do_number && (
                      <div className="flex items-center gap-1.5 text-xs font-bold text-sky-700 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2">
                        <Truck size={14}/> IN_TRANSIT • <Link to="/logistics" className="underline underline-offset-2">{v.active_do_number}</Link> <span className="font-normal text-sky-700/70">klik Logistik</span>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1.5">
                      {k && <span className={"inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border "+k.cls}>{k.dot} {k.label} {v.kir_expiry? '· '+String(v.kir_expiry).slice(0,10):''}</span>}
                      {!k && v.kir_expiry && <span className="px-2.5 py-1 rounded-full text-[11px] font-bold border bg-white text-[#64748B]">KIR {String(v.kir_expiry).slice(0,10)}</span>}
                      {!k && !v.kir_expiry && <span className="px-2.5 py-1 rounded-full text-[11px] text-[#94A3B8] border border-dashed">KIR -</span>}
                      {tx && <span className={"px-2.5 py-1 rounded-full text-[11px] font-bold border "+tx.cls}>{tx.label}</span>}
                      {!tx && v.tax_expiry && <span className="px-2.5 py-1 rounded-full text-[11px] border bg-white text-[#64748B]">Pajak {String(v.tax_expiry).slice(0,10)}</span>}
                      {!tx && !v.tax_expiry && <span className="px-2.5 py-1 rounded-full text-[11px] text-[#94A3B8] border border-dashed">Pajak -</span>}
                      {simWarn && <span className={"px-2.5 py-1 rounded-full text-[11px] font-bold border "+simWarn.cls}>{simWarn.label}</span>}
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-2">
                        <div className="text-[10px] font-bold tracking-widest text-[#94A3B8]">TRIP 30H</div>
                        <div className="text-sm font-black">{v.trips_30 ?? 0}</div>
                        <div className="text-[11px] text-[#64748B]">{v.km_30? compact(v.km_30)+' km':''}</div>
                      </div>
                      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-2">
                        <div className="text-[10px] font-bold tracking-widest text-[#94A3B8]">BIAYA 30H</div>
                        <div className="text-xs font-black">{compact(v.cost_30||0)}</div>
                        <div className="text-[11px] text-[#64748B]">{v.cost_30 && v.km_30 ? 'Rp '+Math.round(v.cost_30/(v.km_30||1)).toLocaleString('id-ID')+'/km':''}</div>
                        {(v.est_dalam_30||v.est_luar_30)? <>
                          <div className={"text-[10px] font-bold px-1 py-0.5 rounded-full border mt-1 "+((v.variance_dalam_30||0)>0?'bg-red-50 text-red-700 border-red-200':(v.variance_dalam_30||0)<0?'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-white text-[#64748B] border-[#E2E8F0]')}>Dalam Est {compact(v.est_dalam_30)} • {(v.variance_dalam_30>0?'+':'')+compact(v.variance_dalam_30||0)}</div>
                          <div className={"text-[10px] font-bold px-1 py-0.5 rounded-full border mt-0.5 "+((v.variance_luar_30||0)>0?'bg-red-50 text-red-700 border-red-200':(v.variance_luar_30||0)<0?'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-white text-[#64748B] border-[#E2E8F0]')}>Luar Est {compact(v.est_luar_30)} • {(v.variance_luar_30>0?'+':'')+compact(v.variance_luar_30||0)}</div>
                        </> : v.est_30? <div className={"text-[10px] font-bold px-1 py-0.5 rounded-full border mt-1 "+((v.variance_30||0)>0?'bg-red-50 text-red-700 border-red-200':(v.variance_30||0)<0?'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-white')}>Est {compact(v.est_30)} • {(v.variance_30>0?'+':'')+compact(v.variance_30||0)}</div>:null}
                      </div>
                      <div className={"border rounded-xl p-2 "+(v.next_service_date && daysLeft(v.next_service_date)!==null && daysLeft(v.next_service_date)<=7 ? 'bg-amber-50 border-amber-200':'bg-[#F8FAFC] border-[#E2E8F0]')}>
                        <div className="text-[10px] font-bold tracking-widest text-[#94A3B8]">SERVIS</div>
                        <div className="text-[11px] font-bold">{v.next_service_date? String(v.next_service_date).slice(0,10):'-'}</div>
                        <div className="text-[11px]">{v.next_service_date && daysLeft(v.next_service_date)!==null ? (daysLeft(v.next_service_date)<0? 'Terlambat '+Math.abs(daysLeft(v.next_service_date))+' hari' : daysLeft(v.next_service_date)<=7 ? `Jatuh tempo ${daysLeft(v.next_service_date)} hari` : `${daysLeft(v.next_service_date)} hari lagi`) : (v.last_service_date? 'Last '+String(v.last_service_date).slice(0,10):'Belum')}</div>
                      </div>
                    </div>

                    {v.recent_dos && v.recent_dos.length>0 && (
                      <div className="text-[11px] text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-2">
                        <div className="font-bold text-[#334155] mb-1">DO terakhir:</div>
                        <div className="space-y-1">
                          {v.recent_dos.slice(0,3).map(d=>(
                            <div key={d.id} className="flex justify-between gap-2"><span className="font-mono font-bold text-[#0F172A]">{d.do_number}</span><span className={"px-1.5 py-0.5 rounded-full border text-[10px] font-bold "+(d.status==='IN_TRANSIT'?'bg-sky-50 text-sky-700':d.status==='DELIVERED'?'bg-emerald-50 text-emerald-700':'bg-white')}>{d.status}</span></div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-3 bg-[#F8FAFC] border-t border-[#E2E8F0] flex gap-1.5">
                    <button onClick={()=>openEditVehicle(v)} className="flex-1 h-8 inline-flex items-center justify-center gap-1 bg-white border border-[#E2E8F0] rounded-full text-xs font-bold hover:bg-[#F1F5F9]"><Pencil size={12}/> Edit</button>
                    <button onClick={()=>openHistory(v)} className="flex-1 h-8 inline-flex items-center justify-center gap-1 bg-white border border-[#E2E8F0] rounded-full text-xs font-bold hover:bg-[#F1F5F9]"><History size={12}/> History</button>
                    <button onClick={()=>{setTab('trip'); setSearchTrip(v.plat_no); setQTrip(v.plat_no);}} className="flex-1 h-8 inline-flex items-center justify-center gap-1 bg-[#1E40AF] text-white rounded-full text-xs font-bold hover:bg-[#1E3A8A]"><MapPin size={12}/> Trip</button>
                  </div>
                </div>
              )
            })}
          </div>
          {filteredVehicles.length===0 && <div className="bg-white rounded-[20px] border border-[#E2E8F0] p-10 text-center text-sm text-[#94A3B8]">{loading?'Memuat...':'Tidak ada armada - tambah dengan + Armada'}</div>}
        </div>
      )}

      {/* TRIP TAB */}
      {tab==='trip' && (
        <div className="space-y-3">
          <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm p-3 sm:p-4 space-y-3">
            <div className="flex flex-col lg:flex-row gap-3">
              <div className="flex-1 relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"/>
                <input value={qTrip} onChange={e=>setQTrip(e.target.value)} onKeyDown={e=>e.key==='Enter'&&setSearchTrip(qTrip)} placeholder="Cari TRIP / plat / rute / DO..." className="w-full h-[42px] pl-9 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"/>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={()=>setSearchTrip(qTrip)} className="h-[42px] px-5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-semibold">Cari</button>
                {searchTrip && <button onClick={()=>{setQTrip(''); setSearchTrip('');}} className="h-[42px] w-[42px] grid place-items-center bg-white border rounded-xl"><X size={14}/></button>}
                <select value={tripStatusFilter} onChange={e=>setTripStatusFilter(e.target.value)} className="h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs font-bold">
                  <option value="">Semua status</option><option value="IN_PROGRESS">IN_PROGRESS</option><option value="COMPLETED">COMPLETED</option><option value="CANCELLED">CANCELLED</option>
                </select>
                <button onClick={()=>setShowTrip(true)} className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl text-sm font-bold shadow-sm">+ Trip</button>
              </div>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {['','IN_PROGRESS','COMPLETED'].map(s=>(
                <button key={s} onClick={()=>setTripStatusFilter(s)} className={"px-3.5 py-1.5 rounded-full text-xs font-bold border "+(tripStatusFilter===s?'bg-[#1E40AF] text-white border-[#1E40AF]':'bg-white text-[#334155] border-[#E2E8F0]')}>{s||'Semua'}</button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {filteredTrips.map(t=>{
              const cost=parseFloat(t.fuel_cost||0)+parseFloat(t.toll_cost||0)+parseFloat(t.other_cost||0);
              const dist=parseFloat(t.distance_km||0);
              const isActive=t.status==='IN_PROGRESS';
              return (
                <div key={t.id} className={"bg-white rounded-[20px] border shadow-sm p-4 flex flex-col sm:flex-row gap-3 "+(isActive?'border-sky-200':'border-[#E2E8F0]')}>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-black bg-[#F1F5F9] border px-2 py-1 rounded-full">{t.trip_number}</span>
                      <Badge status={t.status}/>
                      <span className="text-xs font-bold text-[#0F172A]">{t.plat_no||'-'} • {t.vehicle_type||''}</span>
                      <span className="text-xs text-[#64748B]">kap {t.capacity_ton||'-'} ton</span>
                    </div>
                    <div className="text-xs text-[#334155] flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1"><MapPin size={12} className="text-[#94A3B8]"/> {t.route||'-'}</span>
                      <span className="inline-flex items-center gap-1"><Gauge size={12}/> {dist} km {t.odometer_start? `• odo ${t.odometer_start}→${t.odometer_end||'?'}`:''}</span>
                      <span className="inline-flex items-center gap-1"><Fuel size={12}/> {t.fuel_liters? t.fuel_liters+' L':''} {t.km_per_liter? `• ${t.km_per_liter.toFixed(1)} km/L`:''}</span>
                    </div>
                    <div className="text-xs text-[#64748B]">{t.driver_name||'driver #'+t.driver_id} {t.driver_phone? '• '+t.driver_phone:''} • DO {t.do_number||'-'} {t.customer_name? '• '+t.customer_name:''} • {t.departure_date? String(t.departure_date).slice(0,16).replace('T',' '):''} {t.arrival_date? '→ '+String(t.arrival_date).slice(0,16).replace('T',' '):''}</div>
                    <div className="text-xs flex flex-wrap gap-1.5 items-center"><span className="font-bold">{rupiah(cost)}</span> <span className="text-[#94A3B8]">BBM {rupiah(t.fuel_cost)} • Tol {rupiah(t.toll_cost)} • Lain {rupiah(t.other_cost)}</span> {t.cost_per_km? <span className="px-2 py-0.5 rounded-full bg-[#F1F5F9] border text-[11px] font-bold">Rp {Math.round(t.cost_per_km).toLocaleString('id-ID')}/km</span>:null} <span className={"px-1.5 py-0.5 rounded-full text-[10px] font-bold border "+( (t.vehicle_area||'DALAM_KOTA')==='LUAR_KOTA'?'bg-amber-50 text-amber-800 border-amber-200':'bg-sky-50 text-sky-700 border-sky-200')}>{(t.vehicle_area||'DALAM_KOTA')==='LUAR_KOTA'?'Luar Kota':'Dalam Kota'}</span>{t.do_est_cost? <span className={"px-2 py-0.5 rounded-full border text-[11px] font-bold "+( (t.variance_cost||0)>0 ? 'bg-red-50 text-red-700 border-red-200' : (t.variance_cost||0)<0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-[#64748B]')}>Est {rupiah(t.do_est_cost)} • Selisih {t.variance_cost>0?'+':''}{rupiah(t.variance_cost)} {t.variance_pct? `(${t.variance_pct>0?'+':''}${t.variance_pct.toFixed(1)}%)`:''}</span>:null} {t.do_est_cost_dalam? <span className={"px-2 py-0.5 rounded-full border text-[11px] font-bold "+( (t.variance_dalam||0)>0 ? 'bg-red-50 text-red-700 border-red-200' : (t.variance_dalam||0)<0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white')}>Dalam {rupiah(t.do_est_cost_dalam)} {(t.variance_dalam||0)>0?'+':''}{rupiah(t.variance_dalam||0)} {t.variance_dalam_pct? `(${t.variance_dalam_pct>0?'+':''}${t.variance_dalam_pct.toFixed(1)}%)`:''}</span>:null} {t.do_est_cost_luar? <span className={"px-2 py-0.5 rounded-full border text-[11px] font-bold "+( (t.variance_luar||0)>0 ? 'bg-red-50 text-red-700 border-red-200' : (t.variance_luar||0)<0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white')}>Luar {rupiah(t.do_est_cost_luar)} {(t.variance_luar||0)>0?'+':''}{rupiah(t.variance_luar||0)} {t.variance_luar_pct? `(${t.variance_luar_pct>0?'+':''}${t.variance_luar_pct.toFixed(1)}%)`:''}</span>:null} {t.do_est_zone? <span className="px-2 py-0.5 rounded-full bg-[#F8FAFC] border text-[11px]">DO {t.do_est_zone}{t.do_est_weight? ` • ${t.do_est_weight}t`:''}{t.do_distance_km? ` • ${t.do_distance_km}km`:''}</span>:null}</div>
                    {t.variance_km!=null && <div className="text-[11px] text-[#64748B]">Jarak aktual {dist}km vs est {t.do_distance_km}km → {t.variance_km>0?'+':''}{t.variance_km}km</div>}
                    {t.notes && <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">{t.notes}</div>}
                  </div>
                  <div className="flex sm:flex-col gap-2 shrink-0">
                    {isActive && <>
                      <button onClick={()=>{setCompleteId(t.id); setCompleteForm({odometer_end:'', fuel_liters:'', fuel_cost:'', notes:''});}} className="h-9 px-4 bg-emerald-600 text-white rounded-full text-xs font-bold hover:bg-emerald-700">Selesai</button>
                      <button onClick={()=>cancelTrip(t.id)} className="h-9 px-4 bg-white border border-[#E2E8F0] rounded-full text-xs font-bold hover:bg-[#F8FAFC]"><Ban size={12} className="inline mr-1"/> Batal</button>
                    </>}
                    {!isActive && <span className="text-xs text-[#94A3B8] px-3 py-2">{t.status}</span>}
                  </div>
                </div>
              )
            })}
            {filteredTrips.length===0 && <div className="bg-white rounded-[20px] border border-[#E2E8F0] p-10 text-center text-sm text-[#94A3B8]">{loading?'Memuat...':'Belum ada trip - klik + Trip'}</div>}
          </div>
        </div>
      )}

      {/* MAINTENANCE TAB */}
      {tab==='maintenance' && (
        <div className="space-y-3">
          <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm p-4 flex justify-between items-center">
            <h3 className="font-black text-sm flex items-center gap-2"><Wrench size={16} className="text-[#1E40AF]"/> Servis & Preventive</h3>
            <button onClick={()=>setShowMaint(true)} className="h-8 px-4 bg-[#1E40AF] text-white rounded-full text-xs font-bold">+ Servis</button>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-[20px] p-3 text-xs leading-relaxed">
            <b>Preventive:</b> cek <b>next_service_date</b> tiap armada. Jika <b className="text-red-600">Terlambat</b> atau &lt;7 hari jangan jalan jauh. Atur <b>Jatuh tempo</b> saat catat servis.
          </div>
          <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden">
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><th className="px-4 py-3.5 text-left">TGL SERVIS</th><th className="px-4 py-3.5">PLAT</th><th className="px-4 py-3.5">TIPE</th><th className="px-4 py-3.5">JATUH TEMPO</th><th className="px-4 py-3.5">BENGKEL</th><th className="px-4 py-3.5 text-right">BIAYA</th><th className="px-4 py-3.5">STATUS</th></tr></thead>
                <tbody>
                  {(Array.isArray(maint)?maint:[]).map(m=>{
                    const dl=daysLeft(m.next_service_date);
                    const jatuh = !m.next_service_date ? '-' : dl===null? String(m.next_service_date).slice(0,10) : dl<0? `Terlambat ${Math.abs(dl)} hari` : dl<=7? `Jatuh tempo ${dl} hari` : `${dl} hari lagi`;
                    const jatuhCls = dl!==null && dl<0? 'bg-red-50 text-red-700 border-red-200' : dl!==null && dl<=7? 'bg-amber-50 text-amber-800 border-amber-200':'bg-white text-[#64748B] border-[#E2E8F0]';
                    return (
                      <tr key={m.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] bg-white">
                        <td className="px-4 py-3.5 whitespace-nowrap">{String(m.service_date).slice(0,10)}</td>
                        <td className="px-4 py-3.5 font-mono font-bold">{m.plat_no}</td>
                        <td className="px-4 py-3.5">{m.maintenance_type}</td>
                        <td className="px-4 py-3.5"><span className={"px-2 py-1 rounded-full border text-[11px] font-bold "+jatuhCls}>{m.next_service_date? String(m.next_service_date).slice(0,10):'-'} • {jatuh}</span></td>
                        <td className="px-4 py-3.5">{m.workshop||'-'}</td>
                        <td className="px-4 py-3.5 text-right font-bold">{new Intl.NumberFormat('id-ID').format(m.cost)}</td>
                        <td className="px-4 py-3.5"><span className={"px-2 py-0.5 rounded-full border text-[11px] font-bold "+(dl!==null && dl<0?'bg-red-600 text-white border-red-600': dl!==null && dl<=7?'bg-amber-100 text-amber-800':'bg-emerald-50 text-emerald-700')}>{dl!==null && dl<0? 'OVERDUE': dl!==null && dl<=7? 'SOON':'OK'}</span></td>
                      </tr>
                    )
                  })}
                  {maint.length===0 && <tr><td colSpan={7} className="p-8 text-center text-sm text-[#94A3B8]">Belum ada data servis</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Upcoming servis per armada */}
          <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm p-4">
            <h4 className="font-bold text-sm mb-3 flex items-center gap-1.5"><Calendar size={14}/> Jadwal servis upcoming (next_service_date)</h4>
            <div className="space-y-2">
              {vehicles.filter(v=>v.next_service_date).sort((a,b)=> new Date(a.next_service_date)-new Date(b.next_service_date)).slice(0,6).map(v=>{
                const dl=daysLeft(v.next_service_date);
                return (
                  <div key={v.id} className={"flex justify-between items-center p-3 rounded-xl border "+(dl!==null && dl<0?'bg-red-50 border-red-200': dl!==null && dl<=7?'bg-amber-50 border-amber-200':'bg-[#F8FAFC] border-[#E2E8F0]')}>
                    <div><div className="font-mono font-bold text-sm">{v.plat_no} • {v.type}</div><div className="text-xs text-[#64748B]">Next: {String(v.next_service_date).slice(0,10)} • Last: {v.last_service_date? String(v.last_service_date).slice(0,10):'-'}</div></div>
                    <span className={"px-2.5 py-1 rounded-full text-xs font-bold border "+(dl!==null && dl<0?'bg-red-600 text-white': dl!==null && dl<=7?'bg-amber-500 text-white':'bg-white')}>{dl!==null && dl<0? `Terlambat ${Math.abs(dl)} hari`: dl===0? 'Hari ini' : `${dl} hari lagi`}</span>
                  </div>
                )
              })}
              {vehicles.filter(v=>v.next_service_date).length===0 && <div className="text-xs text-[#94A3B8] text-center py-4">Belum ada jadwal - catat servis dengan next_service_date</div>}
            </div>
          </div>
        </div>
      )}

      {/* ANALITIK TAB */}
      {tab==='analitik' && (
        <div className="space-y-3">
          <div className="grid lg:grid-cols-3 gap-3">
            <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm p-4">
              <h4 className="font-bold text-sm flex items-center gap-1.5"><BarChart3 size={14}/> Utilisasi Armada</h4>
              <div className="mt-3">
                <div className="flex justify-between text-xs font-bold"><span>IN_TRANSIT / Total</span><span>{stats?.in_transit||0} / {stats?.total||0} • {utilization}%</span></div>
                <div className="mt-2 h-3 bg-[#F1F5F9] rounded-full overflow-hidden flex">
                  <div className="h-full bg-sky-500" style={{width: utilization+'%'}}/>
                  <div className="h-full bg-emerald-400" style={{width: (100-utilization)+'%'}}/>
                </div>
                <div className="flex gap-2 mt-2 text-[11px]">
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-500"/> Jalan</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400"/> Available</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {stats?.by_ownership?.map(o=>(
                    <div key={o.ownership} className="bg-[#F8FAFC] border rounded-xl p-2"><div className="text-[10px] tracking-widest font-bold text-[#94A3B8]">{OWNERSHIP_LABEL[o.ownership]||o.ownership}</div><div className="font-black">{o.cnt}</div></div>
                  ))}
                </div>
              </div>
            </div>
            <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm p-4">
              <h4 className="font-bold text-sm">Biaya 30 hari - Est vs Aktual</h4>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between"><span>Aktual (trip)</span><span className="font-black">{rupiah(stats?.cost_30||0)}</span></div>
                <div className="flex justify-between"><span>Est total</span><span className="font-bold">{rupiah(stats?.est_30||0)}</span></div>
                <div className={"flex justify-between px-2 py-1 rounded-lg border font-bold "+( (stats?.variance_30||0)>0 ? 'bg-red-50 text-red-700 border-red-200' : (stats?.variance_30||0)<0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0]')}><span>Selisih total</span><span>{(stats?.variance_30||0)>0?'+':''}{rupiah(stats?.variance_30||0)} {stats?.variance_pct? `(${stats.variance_pct>0?'+':''}${stats.variance_pct.toFixed(1)}%)`:''}</span></div>
                <div className="grid grid-cols-2 gap-1.5 mt-2">
                  <div className={"rounded-xl border p-2 text-center "+((stats?.variance_dalam_30||0)>0?'bg-red-50 border-red-200':(stats?.variance_dalam_30||0)<0?'bg-emerald-50 border-emerald-200':'bg-[#F8FAFC] border-[#E2E8F0]')}><div className="text-[10px] font-bold tracking-widest text-[#64748B]">DALAM KOTA</div><div className="font-black">{rupiah(stats?.est_dalam_30||0)}</div><div className={"text-[11px] font-bold "+((stats?.variance_dalam_30||0)>0?'text-red-700':(stats?.variance_dalam_30||0)<0?'text-emerald-700':'text-[#64748B]')}>{(stats?.variance_dalam_30||0)>0?'+':''}{rupiah(stats?.variance_dalam_30||0)} {stats?.variance_dalam_pct? `(${stats.variance_dalam_pct>0?'+':''}${stats.variance_dalam_pct.toFixed(1)}%)`:''}</div><div className="text-[10px] text-[#64748B]">per-armada Dalam</div></div>
                  <div className={"rounded-xl border p-2 text-center "+((stats?.variance_luar_30||0)>0?'bg-red-50 border-red-200':(stats?.variance_luar_30||0)<0?'bg-emerald-50 border-emerald-200':'bg-[#F8FAFC] border-[#E2E8F0]')}><div className="text-[10px] font-bold tracking-widest text-[#64748B]">LUAR KOTA</div><div className="font-black">{rupiah(stats?.est_luar_30||0)}</div><div className={"text-[11px] font-bold "+((stats?.variance_luar_30||0)>0?'text-red-700':(stats?.variance_luar_30||0)<0?'text-emerald-700':'text-[#64748B]')}>{(stats?.variance_luar_30||0)>0?'+':''}{rupiah(stats?.variance_luar_30||0)} {stats?.variance_luar_pct? `(${stats.variance_luar_pct>0?'+':''}${stats.variance_luar_pct.toFixed(1)}%)`:''}</div><div className="text-[10px] text-[#64748B]">per-armada Luar</div></div>
                </div>
                {(stats?.cost_by_area||[]).length>0 && <div className="grid grid-cols-2 gap-1.5"><div className="rounded-xl border bg-white p-2 text-center"><div className="text-[10px] font-bold tracking-widest text-[#64748B]">BIAYA Dalam 30h</div><div className="font-bold">{rupiah((stats.cost_by_area||[]).find(x=>x.area==='DALAM_KOTA')?.cost||0)}</div><div className="text-[11px] text-[#64748B]">{(stats.cost_by_area||[]).find(x=>x.area==='DALAM_KOTA')?.trips||0} trip • {Math.round((stats.cost_by_area||[]).find(x=>x.area==='DALAM_KOTA')?.km||0)} km</div></div><div className="rounded-xl border bg-white p-2 text-center"><div className="text-[10px] font-bold tracking-widest text-[#64748B]">BIAYA Luar 30h</div><div className="font-bold">{rupiah((stats.cost_by_area||[]).find(x=>x.area==='LUAR_KOTA')?.cost||0)}</div><div className="text-[11px] text-[#64748B]">{(stats.cost_by_area||[]).find(x=>x.area==='LUAR_KOTA')?.trips||0} trip • {Math.round((stats.cost_by_area||[]).find(x=>x.area==='LUAR_KOTA')?.km||0)} km</div></div></div>}
                <div className="flex justify-between"><span>Total km</span><span className="font-bold">{(stats?.km_30||0).toLocaleString('id-ID')} km</span></div>
                <div className="flex justify-between"><span>Total liter</span><span className="font-bold">{(stats?.liters_30||0).toLocaleString('id-ID')} L</span></div>
                <div className="flex justify-between border-t pt-2 mt-2"><span>Rp / km (avg)</span><span className="font-black text-[#1E40AF]">Rp {Math.round(stats?.avg_cost_per_km||0).toLocaleString('id-ID')}/km</span></div>
                <div className="flex justify-between"><span>km / liter</span><span className="font-bold">{stats?.km_30 && stats?.liters_30? (stats.km_30/stats.liters_30).toFixed(1):'-'} km/L</span></div>
                <div className="text-[11px] text-[#64748B] mt-2">Kolom Dalam/Luar pakai <b>tarif per-armada</b> (edit di Armada) - hijau hemat vs est kolom tsb, merah boros.</div>
              </div>
            </div>
            <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm p-4">
              <h4 className="font-bold text-sm">Top boros 30h (biaya)</h4>
              <div className="mt-3 space-y-2">
                {(stats?.top_cost||[]).map(r=>{
                  const max=Math.max(...(stats.top_cost.map(x=>parseFloat(x.cost)||0)),1);
                  const w=Math.round(parseFloat(r.cost)/max*100);
                  return (
                    <div key={r.plat_no}><div className="flex justify-between text-xs"><span className="font-mono font-bold">{r.plat_no}</span><span className="font-bold">{compact(r.cost)} • {r.trips} trip • {Math.round(r.km||0)} km</span></div><div className="h-2 bg-[#F1F5F9] rounded-full overflow-hidden mt-1"><div className="h-full bg-[#1E40AF]" style={{width:w+'%'}}/></div></div>
                  )
                })}
                {(!stats?.top_cost||stats.top_cost.length===0) && <div className="text-xs text-[#94A3B8] py-4 text-center">Belum ada trip 30 hari</div>}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm p-4">
            <h4 className="font-bold text-sm">Biaya per armada (30 hari)</h4>
            <div className="mt-3 space-y-2 max-h-[320px] overflow-auto">
              {vehicles.map(v=>{
                const cost=v.cost_30||0; const km=v.km_30||0;
                const maxCost=Math.max(...vehicles.map(x=>x.cost_30||0),1);
                const w=Math.round(cost/maxCost*100);
                return (
                  <div key={v.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#F8FAFC] border border-transparent hover:border-[#E2E8F0]">
                    <div className="w-[110px] shrink-0"><div className="font-mono font-bold text-xs">{v.plat_no}</div><div className="text-[11px] text-[#64748B]">{v.type}</div></div>
                    <div className="flex-1">
                      <div className="h-2 bg-[#F1F5F9] rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{width:w+'%'}}/></div>
                      <div className="text-[11px] text-[#64748B] mt-0.5">{v.trips_30||0} trip • {km? km+' km':''} {cost && km? `• Rp ${Math.round(cost/km).toLocaleString('id-ID')}/km`:''}</div>
                    </div>
                    <div className="text-xs font-black w-[90px] text-right">{compact(cost)}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Floating quick on mobile */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-2 lg:hidden">
        <button onClick={openAddVehicle} className="w-12 h-12 rounded-full bg-[#1E40AF] text-white shadow-xl grid place-items-center"><Truck size={20}/></button>
      </div>

      {/* Modal Armada */}
      {showVehicle && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50 overflow-auto">
          <form onSubmit={submitVehicle} className="bg-white rounded-[20px] w-full max-w-[560px] shadow-xl border border-[#E2E8F0] overflow-hidden max-h-[92vh] flex flex-col animate-pop">
            <div className="p-4 border-b flex justify-between items-center bg-[#F8FAFC]"><h3 className="font-black text-sm flex items-center gap-2"><Truck size={16} className="text-[#1E40AF]"/> {editingVehicle? 'Edit Armada - '+editingVehicle.plat_no : 'Tambah Armada'}</h3><button type="button" onClick={()=>setShowVehicle(false)} className="w-8 h-8 grid place-items-center rounded-full border bg-white"><X size={14}/></button></div>
            <div className="flex-1 overflow-auto p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">PLAT *</span><input required value={vehicleForm.plat_no} onChange={e=>setVehicleForm({...vehicleForm, plat_no:e.target.value})} placeholder="B 9004 JKT" className="w-full h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF]"/></label>
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">TIPE *</span>
                  <select value={vehicleForm.type} onChange={e=>setVehicleForm({...vehicleForm, type:e.target.value})} className="w-full h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm">
                    <option>Pickup 2 Ton</option><option>Colt Diesel 8 Ton</option><option>Truk Tronton 20 Ton</option><option>Engkel</option><option>Double Engkel</option><option>Tronton</option>
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">BRAND</span><input value={vehicleForm.brand} onChange={e=>setVehicleForm({...vehicleForm, brand:e.target.value})} className="w-full h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm"/></label>
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">MODEL</span><input value={vehicleForm.model} onChange={e=>setVehicleForm({...vehicleForm, model:e.target.value})} placeholder="FE 74" className="w-full h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm"/></label>
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">TAHUN</span><input type="number" value={vehicleForm.year} onChange={e=>setVehicleForm({...vehicleForm, year:e.target.value})} placeholder="2022" className="w-full h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm"/></label>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">TON</span><input type="number" step="0.1" value={vehicleForm.capacity_ton} onChange={e=>setVehicleForm({...vehicleForm, capacity_ton:e.target.value})} className="w-full h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm"/></label>
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">M³</span><input type="number" step="0.1" value={vehicleForm.capacity_volume_m3} onChange={e=>setVehicleForm({...vehicleForm, capacity_volume_m3:e.target.value})} className="w-full h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm"/></label>
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">KEPEMILIKAN</span>
                  <select value={vehicleForm.ownership} onChange={e=>setVehicleForm({...vehicleForm, ownership:e.target.value})} className="w-full h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm">
                    <option value="OWNED">Milik</option><option value="RENTED">Sewa</option><option value="THIRD_PARTY">Vendor</option>
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">KIR HABIS</span><input type="date" value={vehicleForm.kir_expiry} onChange={e=>setVehicleForm({...vehicleForm, kir_expiry:e.target.value})} className="w-full h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm"/></label>
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">PAJAK STNK HABIS</span><input type="date" value={vehicleForm.tax_expiry} onChange={e=>setVehicleForm({...vehicleForm, tax_expiry:e.target.value})} className="w-full h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm"/></label>
              </div>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">DRIVER</span>
                <select value={vehicleForm.driver_id} onChange={e=>setVehicleForm({...vehicleForm, driver_id:e.target.value})} className="w-full h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm">
                  <option value="">- Tanpa driver -</option>
                  {employees.map(emp=> <option key={emp.id} value={emp.id}>{emp.name} • {emp.employee_code} • {emp.position}</option>)}
                </select>
              </label>
              <div className="rounded-[20px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 space-y-3">
                <div className="flex items-center justify-between"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">JENIS ARMADA</span><span className="text-[11px] text-[#94A3B8]">2 kolom tarif terpisah</span></div>
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">AREA *</span>
                  <select value={vehicleForm.area} onChange={e=>setVehicleForm({...vehicleForm, area:e.target.value})} className="w-full h-[42px] px-3 bg-white border border-[#E2E8F0] rounded-xl text-sm font-bold">
                    <option value="DALAM_KOTA">Dalam Kota - Bekasi/Jakarta (≤40km)</option>
                    <option value="LUAR_KOTA">Luar Kota - &gt;40 km</option>
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-emerald-700">DALAM FLAT Rp</span><input type="number" value={vehicleForm.tarif_dalam_flat} onChange={e=>setVehicleForm({...vehicleForm, tarif_dalam_flat:e.target.value})} placeholder="150000" className="w-full h-[42px] px-3 bg-white border border-[#E2E8F0] rounded-xl text-sm outline-none focus:border-[#1E40AF]"/></label>
                  <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-emerald-700">DALAM /TON Rp</span><input type="number" value={vehicleForm.tarif_dalam_per_ton} onChange={e=>setVehicleForm({...vehicleForm, tarif_dalam_per_ton:e.target.value})} placeholder="120000" className="w-full h-[42px] px-3 bg-white border border-[#E2E8F0] rounded-xl text-sm outline-none focus:border-[#1E40AF]"/></label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-amber-700">LUAR FLAT Rp</span><input type="number" value={vehicleForm.tarif_luar_flat} onChange={e=>setVehicleForm({...vehicleForm, tarif_luar_flat:e.target.value})} placeholder="600000" className="w-full h-[42px] px-3 bg-white border border-[#E2E8F0] rounded-xl text-sm outline-none focus:border-[#1E40AF]"/></label>
                  <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-amber-700">LUAR /TON Rp</span><input type="number" value={vehicleForm.tarif_luar_per_ton} onChange={e=>setVehicleForm({...vehicleForm, tarif_luar_per_ton:e.target.value})} placeholder="350000" className="w-full h-[42px] px-3 bg-white border border-[#E2E8F0] rounded-xl text-sm outline-none focus:border-[#1E40AF]"/></label>
                </div>
                <div className="text-[11px] text-[#64748B] leading-relaxed">Dalam = flat zona Bekasi/Jakarta + ton×tarif Dalam. Luar = flat Luar Kota + ton×tarif Luar. <b>2 kolom sendiri</b> per armada - DO pakai tarif armada terpilih, Analitik bandingkan kolom terpisah.</div>
              </div>
              <div className="rounded-[20px] border border-sky-200 bg-sky-50 p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold tracking-widest text-sky-800">NILAI ASET TETAP</span>
                  <span className="text-[11px] text-sky-700">{vehicleForm.ownership==='OWNED' ? 'Masuk Aset Tetap (depresiasi aktif)' : 'Sewa/Vendor - tidak masuk Aset Tetap'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-sky-800">TGL PEROLEHAN</span>
                    <input type="date" value={vehicleForm.acquisition_date} onChange={e=>setVehicleForm({...vehicleForm, acquisition_date:e.target.value})} className="w-full h-[42px] px-3 bg-white border border-[#E2E8F0] rounded-xl text-sm"/></label>
                  <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-sky-800">HARGA PEROLEHAN Rp</span>
                    <input type="number" value={vehicleForm.acquisition_cost} onChange={e=>setVehicleForm({...vehicleForm, acquisition_cost:e.target.value})} placeholder="mis. 350000000" className="w-full h-[42px] px-3 bg-white border border-[#E2E8F0] rounded-xl text-sm"/></label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-sky-800">UMUR EKONOMIS (TH)</span>
                    <input type="number" value={vehicleForm.useful_life_years} onChange={e=>setVehicleForm({...vehicleForm, useful_life_years:e.target.value})} placeholder="8" className="w-full h-[42px] px-3 bg-white border border-[#E2E8F0] rounded-xl text-sm"/></label>
                  <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-sky-800">NILAI RESIDU Rp</span>
                    <input type="number" value={vehicleForm.residual_value} onChange={e=>setVehicleForm({...vehicleForm, residual_value:e.target.value})} placeholder="0" className="w-full h-[42px] px-3 bg-white border border-[#E2E8F0] rounded-xl text-sm"/></label>
                </div>
                <div className="text-[11px] text-sky-800 leading-relaxed">Depresiasi garis lurus = (harga perolehan − residu) ÷ (umur × 12) per bulan. Harga perolehan yang diisi di sini <b>langsung dipakai</b> baris asetnya; kalau armada sudah punya baris aset, angkanya ikut diperbarui.</div>
              </div>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">FOTO URL (opsional)</span><input value={vehicleForm.photo_url} onChange={e=>setVehicleForm({...vehicleForm, photo_url:e.target.value})} placeholder="https://..." className="w-full h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm"/></label>
              <div className="text-[11px] text-[#64748B] bg-amber-50 border border-amber-200 rounded-xl p-2">KIR & Pajak akan jadi <b>guard</b> saat buat Trip - jika habis, backend block (tilang). Isi tanggal dengan benar.</div>
            </div>
            <div className="p-3 border-t bg-white flex justify-end gap-2 sticky bottom-0"><button type="button" onClick={()=>setShowVehicle(false)} className="h-10 px-5 rounded-xl border bg-white text-sm font-semibold">Batal</button><button className="h-10 px-5 rounded-xl bg-[#1E40AF] text-white text-sm font-bold hover:bg-[#1E3A8A]">{editingVehicle? 'Simpan':'Tambah Armada'}</button></div>
          </form>
        </div>
      )}

      {/* Modal Trip */}
      {showTrip && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50 overflow-auto">
          <form onSubmit={submitTrip} className="bg-white rounded-[20px] w-full max-w-[560px] shadow-xl border border-[#E2E8F0] overflow-hidden max-h-[92vh] flex flex-col animate-pop">
            <div className="p-4 border-b flex justify-between items-center bg-[#F8FAFC]"><h3 className="font-black text-sm flex items-center gap-2"><MapPin size={16} className="text-[#1E40AF]"/> Buat Trip</h3><button type="button" onClick={()=>setShowTrip(false)} className="w-8 h-8 grid place-items-center rounded-full border bg-white"><X size={14}/></button></div>
            <div className="flex-1 overflow-auto p-4 space-y-3">
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">ARMADA *</span>
                <select required value={tripForm.vehicle_id} onChange={e=>setTripForm({...tripForm,vehicle_id:e.target.value})} className="w-full h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm">
                  <option value="">- Pilih armada AVAILABLE -</option>
                  {vehicles.filter(v=>v.status==='AVAILABLE').map(v=>{
                    const k=kirBadge(v.kir_expiry); const tax=taxBadge(v.tax_expiry);
                    const block = (k && k.label.includes('HABIS')) || (tax && tax.label.includes('HABIS'));
                    return <option key={v.id} value={v.id} disabled={!!block}>{v.plat_no} • {v.type} • {v.capacity_ton} ton {k? '• '+k.label:''} {block?' - BLOCK':''}</option>
                  })}
                </select>
              </label>
              {vehicles.filter(v=>v.status==='AVAILABLE').length===0 && <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2">Tidak ada armada AVAILABLE - selesaikan trip/DO aktif dulu.</div>}
              <label className="space-y-1.5"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">RUTE</span><input placeholder="Bekasi → Jakarta • 42 km" value={tripForm.route} onChange={e=>setTripForm({...tripForm,route:e.target.value})} className="w-full h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"/></label>
              <div className="rounded-[20px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 space-y-3">
                <div className="text-[11px] font-bold tracking-widest text-[#64748B]">JARAK & BBM</div>
                <div className="grid grid-cols-3 gap-3">
                  <label className="space-y-1.5"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">Jarak km</span><input type="number" step="0.1" inputMode="decimal" placeholder="42" value={tripForm.distance_km} onChange={e=>setTripForm({...tripForm,distance_km:e.target.value})} className="w-full h-[42px] px-3 bg-white border border-[#E2E8F0] rounded-xl text-sm outline-none focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"/></label>
                  <label className="space-y-1.5"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">Odo awal</span><input type="number" inputMode="numeric" placeholder="120500" value={tripForm.odometer_start} onChange={e=>setTripForm({...tripForm,odometer_start:e.target.value})} className="w-full h-[42px] px-3 bg-white border border-[#E2E8F0] rounded-xl text-sm outline-none focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"/></label>
                  <label className="space-y-1.5"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">Liter BBM</span><input type="number" step="0.1" inputMode="decimal" placeholder="18.5" value={tripForm.fuel_liters} onChange={e=>setTripForm({...tripForm,fuel_liters:e.target.value})} className="w-full h-[42px] px-3 bg-white border border-[#E2E8F0] rounded-xl text-sm outline-none focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"/></label>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <label className="space-y-1.5"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">BBM Rp</span><input type="number" inputMode="numeric" placeholder="250.000" value={tripForm.fuel_cost} onChange={e=>setTripForm({...tripForm,fuel_cost:e.target.value})} className="w-full h-[42px] px-3 bg-white border border-[#E2E8F0] rounded-xl text-sm outline-none focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"/></label>
                  <label className="space-y-1.5"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">Tol Rp</span><input type="number" inputMode="numeric" placeholder="50.000" value={tripForm.toll_cost} onChange={e=>setTripForm({...tripForm,toll_cost:e.target.value})} className="w-full h-[42px] px-3 bg-white border border-[#E2E8F0] rounded-xl text-sm outline-none focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"/></label>
                  <label className="space-y-1.5"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">Lain Rp</span><input type="number" inputMode="numeric" placeholder="0" value={tripForm.other_cost} onChange={e=>setTripForm({...tripForm,other_cost:e.target.value})} className="w-full h-[42px] px-3 bg-white border border-[#E2E8F0] rounded-xl text-sm outline-none focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"/></label>
                </div>
              </div>
              <label className="space-y-1.5"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">CATATAN</span><input value={tripForm.notes} onChange={e=>setTripForm({...tripForm,notes:e.target.value})} placeholder="Muatan semen 100 sak / antar proyek..." className="w-full h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"/></label>
              <div className="text-[11px] text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-2">Guard aktif: KIR/Pajak habis → block, SIM habis → block, overload ton/m³ → block. Isi odo awal untuk hitung jarak otomatis saat Selesai. Biaya/km & km/L dihitung di detail trip.</div>
            </div>
            <div className="p-3 border-t bg-white flex justify-end gap-2 sticky bottom-0"><button type="button" onClick={()=>setShowTrip(false)} className="h-10 px-5 rounded-xl border bg-white text-sm font-semibold">Batal</button><button className="h-10 px-5 rounded-xl bg-[#1E40AF] text-white text-sm font-bold hover:bg-[#1E3A8A]">Simpan Trip</button></div>
          </form>
        </div>
      )}

      {/* Complete Trip modal */}
      {completeId && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={submitComplete} className="bg-white rounded-[20px] w-full max-w-[420px] p-5 space-y-3 border shadow-xl animate-pop">
            <h3 className="font-black text-sm flex items-center gap-2"><Gauge size={16} className="text-emerald-600"/> Selesaikan Trip - catat odo akhir</h3>
            <p className="text-xs text-[#64748B]">Isi odometer akhir untuk hitung jarak otomatis. Armada akan AVAILABLE kembali.</p>
            <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">ODOMETER AKHIR</span><input required type="number" value={completeForm.odometer_end} onChange={e=>setCompleteForm({...completeForm, odometer_end:e.target.value})} placeholder="120542" className="w-full h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm"/></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold text-[#64748B]">Liter BBM aktual</span><input type="number" step="0.1" value={completeForm.fuel_liters} onChange={e=>setCompleteForm({...completeForm, fuel_liters:e.target.value})} placeholder="19.2" className="w-full h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm"/></label>
              <label className="space-y-1"><span className="text-[11px] font-bold text-[#64748B]">BBM Rp (koreksi)</span><input type="number" value={completeForm.fuel_cost} onChange={e=>setCompleteForm({...completeForm, fuel_cost:e.target.value})} placeholder="260000" className="w-full h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm"/></label>
            </div>
            <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">CATATAN</span><input value={completeForm.notes} onChange={e=>setCompleteForm({...completeForm, notes:e.target.value})} placeholder="Sampai lokasi, macet 1 jam..." className="w-full h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm"/></label>
            <div className="flex justify-end gap-2"><button type="button" onClick={()=>setCompleteId(null)} className="h-10 px-5 rounded-xl border bg-white text-sm font-semibold">Batal</button><button className="h-10 px-5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700">Selesai</button></div>
          </form>
        </div>
      )}

      {/* History modal */}
      {historyOpen && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50 overflow-auto">
          <div className="bg-white rounded-[20px] w-full max-w-[640px] shadow-xl border border-[#E2E8F0] overflow-hidden max-h-[85vh] flex flex-col animate-pop">
            <div className="p-4 border-b flex justify-between items-center bg-[#F8FAFC]"><h3 className="font-black text-sm">History Armada</h3><button onClick={()=>setHistoryOpen(false)} className="w-8 h-8 grid place-items-center rounded-full border bg-white"><X size={14}/></button></div>
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {historyLoading && <div className="text-sm text-[#94A3B8] text-center py-8">Memuat...</div>}
              {historyData?.error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{historyData.error}</div>}
              {historyData && !historyLoading && !historyData.error && (
                <>
                  <div className="text-xs font-bold text-[#334155]">Plat {historyData.plat_no} - {historyData.deliveries?.length||0} DO • {historyData.trips?.length||0} trip • {historyData.maintenance?.length||0} servis</div>
                  <div>
                    <div className="text-[11px] font-bold tracking-widest text-[#64748B] mb-2">DELIVERY (10 terakhir)</div>
                    <div className="space-y-1">
                      {(historyData.deliveries||[]).slice(0,10).map(d=>(
                        <div key={d.id} className="flex justify-between items-center p-2 border rounded-xl bg-[#F8FAFC] text-xs"><span className="font-mono font-bold">{d.do_number}</span><span>{d.customer_name||''}</span><span className={"px-2 py-0.5 rounded-full border text-[11px] font-bold "+(d.status==='IN_TRANSIT'?'bg-sky-50 text-sky-700':'bg-white')}>{d.status}</span></div>
                      ))}
                      {(historyData.deliveries||[]).length===0 && <div className="text-xs text-[#94A3B8]">Belum ada DO</div>}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold tracking-widest text-[#64748B] mb-2">TRIP</div>
                    <div className="space-y-1">
                      {(historyData.trips||[]).slice(0,10).map(t=>(
                        <div key={t.id} className="flex justify-between p-2 border rounded-xl text-xs"><span className="font-mono font-bold">{t.trip_number}</span><span>{t.route||'-'} • {t.distance_km} km</span><span className="font-bold">{rupiah(parseFloat(t.fuel_cost||0)+parseFloat(t.toll_cost||0))}</span></div>
                      ))}
                      {(historyData.trips||[]).length===0 && <div className="text-xs text-[#94A3B8]">Belum ada trip</div>}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold tracking-widest text-[#64748B] mb-2">MAINTENANCE</div>
                    <div className="space-y-1">
                      {(historyData.maintenance||[]).slice(0,10).map(m=>(
                        <div key={m.id} className="flex justify-between p-2 border rounded-xl text-xs"><span>{String(m.service_date).slice(0,10)} • {m.maintenance_type}</span><span>{m.workshop||'-'}</span><span className="font-bold">{new Intl.NumberFormat('id-ID').format(m.cost)}</span></div>
                      ))}
                      {(historyData.maintenance||[]).length===0 && <div className="text-xs text-[#94A3B8]">Belum ada servis</div>}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Maintenance modal */}
      {showMaint && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={submitMaint} className="bg-white rounded-[20px] p-6 w-full max-w-md space-y-3 border shadow-xl animate-pop">
            <h3 className="font-black text-sm">Catat Servis</h3>
            <select name="vehicle_id" required className="w-full h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm"><option value="">Pilih armada</option>{vehicles.map(v=> <option key={v.id} value={v.id}>{v.plat_no} • {v.type}</option>)}</select>
            <select name="maintenance_type" className="w-full h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm"><option value="PREVENTIVE">PREVENTIVE</option><option value="CORRECTIVE">CORRECTIVE</option><option value="EMERGENCY">EMERGENCY</option></select>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold text-[#64748B]">Tgl servis</span><input type="date" name="service_date" defaultValue={new Date().toISOString().slice(0,10)} className="w-full h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm"/></label>
              <label className="space-y-1"><span className="text-[11px] font-bold text-[#64748B]">Jatuh tempo</span><input type="date" name="next_service_date" className="w-full h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm"/></label>
            </div>
            <input name="cost" type="number" placeholder="Biaya" className="w-full h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm"/>
            <input name="workshop" placeholder="Bengkel" className="w-full h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm"/>
            <input name="description" placeholder="Deskripsi (ganti oli, kampas...)" className="w-full h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm"/>
            <div className="flex justify-end gap-2"><button type="button" onClick={()=>setShowMaint(false)} className="h-10 px-5 rounded-xl border bg-white text-sm font-semibold">Batal</button><button className="h-10 px-5 rounded-xl bg-[#1E40AF] text-white text-sm font-bold">Simpan</button></div>
          </form>
        </div>
      )}

    </div>
  )
}
