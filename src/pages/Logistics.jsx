import { useEffect, useState, useRef } from 'react';
import { FileText, Truck, CheckCircle2, PackageCheck, Camera, PenLine, Receipt, MapPin, X, ShieldCheck, UserCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { PosPageHeader } from '../components/PosUI';
import { useDialog } from '../components/DialogProvider';
import AddressMapPicker from '../components/AddressMapPicker';
import SignaturePad from '../components/SignaturePad';
import OfficeConfirmModal from '../components/OfficeConfirmModal';

// POD modal - foto bukti + tanda tangan di canvas
function PodModal({ open, onClose, delivery, onSuccess, onErr }){
  const [receivedBy,setReceivedBy]=useState('');
  const [notes,setNotes]=useState('');
  const [photoUrl,setPhotoUrl]=useState('');
  const [photoPreview,setPhotoPreview]=useState('');
  const [submitting,setSubmitting]=useState(false);
  const canvasRef=useRef(null);
  const drawing=useRef(false);
  const hasStroke=useRef(false);
  useEffect(()=>{
    if(open){ setReceivedBy(''); setNotes(''); setPhotoUrl(''); setPhotoPreview(''); hasStroke.current=false; setTimeout(()=>clearSig(), 50); }
  },[open, delivery?.id]);
  const clearSig=()=>{ const c=canvasRef.current; if(!c) return; const ctx=c.getContext('2d'); ctx.clearRect(0,0,c.width,c.height); ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height); hasStroke.current=false; };
  const getPos=(e)=>{ const c=canvasRef.current; const rect=c.getBoundingClientRect(); const t=e.touches?e.touches[0]:e; return { x:(t.clientX-rect.left)*(c.width/rect.width), y:(t.clientY-rect.top)*(c.height/rect.height) }; };
  const start=(e)=>{ drawing.current=true; hasStroke.current=true; const p=getPos(e); const ctx=canvasRef.current.getContext('2d'); ctx.beginPath(); ctx.moveTo(p.x,p.y); e.preventDefault(); };
  const move=(e)=>{ if(!drawing.current) return; const p=getPos(e); const ctx=canvasRef.current.getContext('2d'); ctx.lineWidth=2.2; ctx.lineCap='round'; ctx.strokeStyle='#0b1c30'; ctx.lineTo(p.x,p.y); ctx.stroke(); e.preventDefault(); };
  const end=()=>{ drawing.current=false; };
  const onFile=(e)=>{ const f=e.target.files?.[0]; if(!f) return; if(f.size>5*1024*1024){ onErr('Foto maksimal 5MB'); return; } const reader=new FileReader(); reader.onload=()=>{ const d=String(reader.result); setPhotoUrl(d); setPhotoPreview(d); }; reader.readAsDataURL(f); };
  const submit=async()=>{
    if(!receivedBy.trim()) return onErr('Nama penerima wajib');
    let sigData=''; if(hasStroke.current) sigData=canvasRef.current.toDataURL('image/png');
    if(!photoUrl && !sigData) return onErr('Foto bukti atau tanda tangan wajib salah satu');
    setSubmitting(true);
    try{
      const r=await api.post('/logistics/deliveries/'+delivery.id+'/pod',{ received_by: receivedBy.trim(), pod_photo_url: photoUrl||null, pod_signature_url: sigData||null, pod_notes: notes||null });
      onSuccess({ message:'POD '+delivery.do_number+' diterima oleh '+receivedBy.trim() + (r.data?.so_completed ? ' - SO '+ (r.data.delivery?.so_number||delivery.so_number) +' otomatis COMPLETED' : ''), receivedBy: receivedBy.trim(), notes, delivery: r.data?.delivery || delivery, so_completed: r.data?.so_completed });
      onClose();
    }catch(e){ onErr(e.response?.data?.error||e.message); }
    finally{ setSubmitting(false); }
  };
  if(!open||!delivery) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-3 sm:p-4 bg-black/40 overflow-auto">
      <div className="bg-white rounded-xl w-full max-w-[640px] shadow-raised border border-[#e7ecf7] overflow-hidden max-h-[92vh] flex flex-col animate-pop">
        <div className="p-4 border-b flex justify-between gap-3 bg-[#eff4ff]">
          <div><div className="text-sm font-bold text-[#0b1c30] flex items-center gap-1.5"><PackageCheck size={16} className="text-emerald-600"/> Konfirmasi Penerimaan - {delivery.do_number}</div><div className="text-xs text-[#45464d] mt-1">{delivery.customer_name} • {delivery.so_number} • {delivery.vehicle_no||'-'}</div></div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-full border bg-white"><X size={14}/></button>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">DITERIMA OLEH *</span><input value={receivedBy} onChange={e=>setReceivedBy(e.target.value)} placeholder="Nama penerima / pembeli" className="w-full h-[42px] px-3 bg-[#eff4ff] border border-[#e7ecf7] rounded-xl text-sm outline-none focus:bg-white focus:border-[#0051d5]"/></label>
            <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">CATATAN (opsional)</span><input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Cat: pecah 1 sak / sesuai..." className="w-full h-[42px] px-3 bg-[#eff4ff] border border-[#e7ecf7] rounded-xl text-sm outline-none focus:bg-white focus:border-[#0051d5]"/></label>
          </div>
          <div className="border rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-[#e5eeff] border-b flex items-center gap-1.5 text-xs font-bold text-[#2b3445]"><Camera size={14}/> Foto bukti pengiriman (POD)</div>
            <div className="p-3 space-y-2">
              <input type="file" accept="image/*" capture="environment" onChange={onFile} className="w-full text-xs file:h-8 file:px-3 file:rounded-full file:border file:bg-white file:text-xs file:font-bold"/>
              {photoPreview ? <img src={photoPreview} alt="preview" className="w-full max-h-[220px] object-contain rounded-xl border bg-[#eff4ff]"/> : <div className="h-[96px] grid place-items-center rounded-xl border border-dashed text-xs text-[#76777d] bg-[#eff4ff]">Belum ada foto - ambil foto DO di lokasi / upload bukti</div>}
              <div className="text-[11px] text-[#45464d]">Maks 5MB • akan disimpan sebagai base64 pod_photo_url (limit 12MB JSON).</div>
            </div>
          </div>
          <div className="border rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-[#e5eeff] border-b flex items-center justify-between"><span className="flex items-center gap-1.5 text-xs font-bold text-[#2b3445]"><PenLine size={14}/> Tanda tangan penerima</span><button type="button" onClick={clearSig} className="h-7 px-3 rounded-full border bg-white text-xs font-bold">Hapus</button></div>
            <div className="p-3 bg-white"><canvas ref={canvasRef} width={600} height={180} onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end} onTouchStart={start} onTouchMove={move} onTouchEnd={end} className="w-full h-[140px] border border-[#e7ecf7] rounded-xl bg-white touch-none cursor-crosshair"/><div className="text-[11px] text-[#45464d] mt-1">Coret di area putih • jadi pod_signature_url PNG base64</div></div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs leading-relaxed text-amber-800"><b>Template konfirmasi:</b> “Barang pada DO {delivery.do_number} telah diterima oleh <b>{receivedBy||'___'}</b> pada {new Date().toLocaleString('id-ID')}{notes? ' - '+notes:''}.” - DO jadi <b>DELIVERED</b> + armada AVAILABLE + masuk Catatan Terkirim. SO tetap <b>SHIPPED</b> sampai Invoice <b>PAID</b> lunas baru jadi <b>COMPLETED</b>. Lanjut <b>Invoice DO</b>.</div>
        </div>
        <div className="p-3 border-t bg-white flex justify-end gap-2 sticky bottom-0"><button onClick={onClose} className="h-10 px-5 rounded-xl border bg-white text-sm font-semibold">Batal</button><button disabled={submitting} onClick={submit} className="h-10 px-5 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50 hover:bg-emerald-700">{submitting?'Menyimpan...':'Konfirmasi Diterima'}</button></div>
      </div>
    </div>
  )
}

// Helpers estimasi selaras backend Plan B (ton 0.05/qty, zona Bekasi/Jakarta/Luar) + per-armada 2 kolom Dalam/Luar
function tarifForZone(z){ if(z==='Jakarta') return {flat:250000, perTon:180000}; if(z==='Luar Kota') return {flat:600000, perTon:350000}; return {flat:150000, perTon:120000}; }
function zoneFromKm(km, override){ if(override) return override; if(km==null||km===''||isNaN(Number(km))) return 'Bekasi'; const n=Number(km); if(n<=15) return 'Bekasi'; if(n<=40) return 'Jakarta'; return 'Luar Kota'; }
function rupiahShort(n){ return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n||0); }
function estForVehicle(wt, v){
  const dFlat=parseFloat(v.tarif_dalam_flat ?? 150000), dPer=parseFloat(v.tarif_dalam_per_ton ?? 120000);
  const lFlat=parseFloat(v.tarif_luar_flat ?? 600000), lPer=parseFloat(v.tarif_luar_per_ton ?? 350000);
  return { dalam: Math.round((isFinite(dFlat)?dFlat:150000) + wt*(isFinite(dPer)?dPer:120000)), luar: Math.round((isFinite(lFlat)?lFlat:600000) + wt*(isFinite(lPer)?lPer:350000)) };
}

// Modal pilih armada AVAILABLE - Plan B: estimasi + pickup kecil prioritas + map OSM auto jarak
function ArmadaPickModal({ open, onClose, onPick, so, onAlert }){
  const [vehicles,setVehicles]=useState([]);
  const [selected,setSelected]=useState('');
  const [loading,setLoading]=useState(false);
  const [distance,setDistance]=useState('');
  const [zone,setZone]=useState('');
  const [totalQty,setTotalQty]=useState(0);
  const [estLoading,setEstLoading]=useState(false);
  const [mapPos,setMapPos]=useState(null); // {lat,lng,address}
  const [showMap,setShowMap]=useState(false);
  // Tanda tangan Pengirim/Gudang: wajib sebelum barang keluar gudang.
  const [senderName,setSenderName]=useState('');
  const [senderSig,setSenderSig]=useState('');
  useEffect(()=>{
    if(open){
      setSelected(''); setDistance(''); setZone(''); setMapPos(null); setShowMap(false);
      setSenderName(''); setSenderSig('');
      setTotalQty(0); setEstLoading(true);
      api.get('/logistics/vehicles').then(r=>{
        const all=Array.isArray(r.data)?r.data:[];
        const av=all.filter(v=>v.status==='AVAILABLE').sort((a,b)=> parseFloat(a.capacity_ton||99)-parseFloat(b.capacity_ton||99) || parseFloat(a.capacity_volume_m3||99)-parseFloat(b.capacity_volume_m3||99));
        setVehicles(av);
      }).catch(()=>setVehicles([]));
      if(so?.id){
        api.get('/sales/orders/'+so.id).then(r=>{
          const det=r.data?.details||[]; const qty=det.reduce((s,d)=> s+(parseFloat(d.qty)||0),0); setTotalQty(qty);
          const la=r.data?.delivery_lat, lo=r.data?.delivery_lng, ad=r.data?.delivery_address;
          if(la!=null && lo!=null){ const lat=parseFloat(la), lng=parseFloat(lo); if(isFinite(lat)&&isFinite(lng)){ setMapPos({lat,lng,address:ad||''}); if(r.data?.distance_km==null){ const R=6371, dLat=(lat+6.8392646)*Math.PI/180, dLng=(lng-111.9838451)*Math.PI/180; const s=Math.sin(dLat/2)**2+Math.cos(-6.8392646*Math.PI/180)*Math.cos(lat*Math.PI/180)*Math.sin(dLng/2)**2; const d=(R*2*Math.atan2(Math.sqrt(s),Math.sqrt(1-s))).toFixed(1); if(isFinite(parseFloat(d))) setDistance(String(d)); } } }
          else if(r.data?.delivery_lat!=null) {} // already handled
        }).catch(()=>{}).finally(()=>setEstLoading(false));
      } else setEstLoading(false);
    }
  },[open, so?.id]);
  if(!open) return null;
  const wt = +(totalQty*0.05).toFixed(2); const vol=wt;
  const effZone = zone || zoneFromKm(distance, null);
  const tarif=tarifForZone(effZone);
  const estCost = Math.round(tarif.flat + wt*tarif.perTon);
  const pick=async()=>{
    if(!selected){ onAlert && onAlert('Pilih armada dahulu'); return; }
    if(!senderName.trim()){ onAlert && onAlert('Nama petugas gudang/pengirim wajib diisi'); return; }
    if(!senderSig){ onAlert && onAlert('Tanda tangan Pengirim/Gudang wajib — pengirim menandatangani sebelum barang keluar gudang'); return; }
    setLoading(true);
    try{ await onPick(selected, {distance_km: distance? parseFloat(distance): null, est_zone: zone || null, delivery_lat: mapPos?.lat ?? null, delivery_lng: mapPos?.lng ?? null, delivery_address: mapPos?.address ?? null, sender_signature_url: senderSig, sender_signed_by: senderName.trim()}); onClose(); }catch(e){
      const msg=e.response?.data?.error||e.message||'Gagal buat DO';
      onAlert && onAlert(msg);
    }
    finally{ setLoading(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl w-full max-w-[560px] max-h-[94vh] flex flex-col overflow-hidden shadow-modal border border-[#e7ecf7] animate-pop">
        <div className="px-4 py-3 border-b bg-[#eff4ff] flex justify-between items-center gap-2 shrink-0">
          <h3 className="font-bold text-sm flex items-center gap-2 truncate"><Truck size={16} className="text-[#0051d5] shrink-0"/> Pilih Armada - <span className="font-mono">{so?.so_number}</span></h3>
          <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-full border bg-white shrink-0"><X size={14}/></button>
        </div>
        <div className="flex-1 overflow-auto p-3 space-y-3">
          <div className="bg-[#eff4ff] border border-[#e7ecf7] rounded-xl p-3 space-y-2">
            <div className="flex flex-wrap gap-1.5 text-xs">
              <span className="px-2.5 py-1 rounded-full bg-white border font-bold">Qty {totalQty||'-'} {estLoading?'…':''}</span>
              <span className="px-2.5 py-1 rounded-full bg-white border">≈ {wt} ton • {vol} m³ <span className="text-[#76777d]">· 0.05/qty</span></span>
              <span className="px-2.5 py-1 rounded-full bg-white border font-bold">{effZone} • {rupiahShort(estCost)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">JARAK (km)</span><input type="number" step="0.1" inputMode="decimal" placeholder="cth 12 (Bekasi) 28 (Jakarta)" value={distance} onChange={e=>setDistance(e.target.value)} className="w-full h-[42px] px-3 bg-white border border-[#e7ecf7] rounded-xl text-sm outline-none focus:border-[#0051d5] focus:ring-2 focus:ring-[#0051d5]/10"/></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">ZONA (opsional)</span>
                <select value={zone} onChange={e=>setZone(e.target.value)} className="w-full h-[42px] px-3 bg-white border border-[#e7ecf7] rounded-xl text-sm">
                  <option value="">Auto dari jarak (≤15 Bekasi • ≤40 Jakarta • &gt;40 Luar)</option>
                  <option value="Bekasi">Bekasi - flat 150rb + 120rb/ton</option>
                  <option value="Jakarta">Jakarta - flat 250rb + 180rb/ton</option>
                  <option value="Luar Kota">Luar Kota - flat 600rb + 350rb/ton</option>
                </select>
              </label>
            </div>
            <button type="button" onClick={()=>setShowMap(v=>!v)} className={"w-full h-9 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 "+(showMap?'bg-[#0051d5] text-white border-[#0051d5]':'bg-white hover:bg-[#eff4ff]') }><MapPin size={14}/>{showMap?'Tutup Peta':'Pilih alamat di Peta (auto jarak)'} {mapPos && <span className="px-2 py-0.5 rounded-full bg-white text-[#0051d5] text-[11px]">{(+((Math.sqrt((mapPos.lat+6.8392646)**2+(mapPos.lng-111.9838451)**2)*111)).toFixed(1)||distance)+' km'}</span>}</button>
            {showMap && <div className="rounded-xl overflow-hidden border border-[#e7ecf7]"><AddressMapPicker valueLat={mapPos?.lat} valueLng={mapPos?.lng} valueAddress={mapPos?.address||so?.delivery_address||''} onPick={({lat,lng,address,distance_km})=>{ setMapPos({lat,lng,address}); setDistance(String(distance_km)); setShowMap(false); }} compact /></div>}
            {mapPos?.address && <div className="text-[11px] text-[#2b3445] bg-white border rounded-xl p-2 leading-relaxed"><b>Alamat pin:</b> {mapPos.address}<br/><span className="text-[#45464d]">{mapPos.lat.toFixed(6)}, {mapPos.lng.toFixed(6)} • {distance} km dari pusat</span></div>}
            <div className="text-[11px] text-[#45464d] leading-relaxed">Rumus: <b>est = flat zona + {wt} ton × tarif/ton</b> ⇒ Bekasi Rp 150rb+120rb/ton • Jakarta Rp 250rb+180rb/ton • Luar Rp 600rb+350rb/ton. Zona auto dari jarak jika tidak dipilih.</div>
          </div>
          <p className="text-xs text-[#45464d] px-1">Hanya <b>AVAILABLE</b>, diurut <b>muatan kecil → besar</b> (pickup prioritas). IN_TRANSIT terkunci sampai POD.</p>
          {vehicles.length===0 ? <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">Tidak ada armada AVAILABLE - selesaikan POD untuk membebaskan armada.</div> : (
            <div className="space-y-1.5">
              {vehicles.filter(v=>{ const vArea=(v.area||'DALAM_KOTA')==='LUAR_KOTA'; if(zone==='Luar Kota') return vArea; if(distance && parseFloat(distance)<5) return !vArea; if(distance && parseFloat(distance)>5) return vArea; return true; }).map(v=>{
                const cap=parseFloat(v.capacity_ton||0); const capV=parseFloat(v.capacity_volume_m3||0);
                const sisaTon=+(cap - wt).toFixed(2); const sisaVol=+(capV - vol).toFixed(2);
                const pass = wt<=cap+0.01 && vol<=capV+0.01;
                const sel=selected===v.plat_no;
                const estV=estForVehicle(wt, v);
                const areaBadge = (v.area||'DALAM_KOTA')==='LUAR_KOTA' ? 'Luar Kota' : 'Dalam Kota';
                const areaCls = (v.area||'DALAM_KOTA')==='LUAR_KOTA' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-sky-50 text-sky-700 border-sky-200';
                return (
                  <button key={v.id} type="button" onClick={()=>setSelected(v.plat_no)} className={"w-full text-left p-3 rounded-xl border flex justify-between items-center gap-3 transition "+(sel?'bg-[#0051d5] text-white border-[#0051d5] shadow':'bg-white hover:bg-[#eff4ff] '+(pass?'border-emerald-200':'border-red-200 bg-red-50/60'))}>
                    <div className="min-w-0 flex-1">
                      <div className={"font-mono font-bold text-sm flex items-center gap-1.5 flex-wrap "+(sel?'text-white':'text-[#0b1c30]')}>{v.plat_no} • {v.type} <span className={"text-[11px] px-1.5 py-0.5 rounded-full border font-bold "+(sel?'bg-white text-[#0051d5] border-white': areaCls)}>{areaBadge}</span><span className={"ml-1 text-[11px] px-1.5 py-0.5 rounded-full border "+(sel?'bg-white text-[#0051d5] border-white': pass?'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-red-100 text-red-700 border-red-200')}>{pass? 'muat':'overload'}</span></div>
                      <div className={"text-xs "+(sel?'text-white/80':'text-[#45464d]')}>{cap} ton • {capV} m³ • {v.driver_name||'no driver'} • sisa {sisaTon} ton / {sisaVol} m³</div>
                      <div className={"text-[11px] font-bold flex flex-wrap gap-1 mt-1 "+(sel?'text-white/90':'text-[#2b3445]')}><span className={"px-1.5 py-0.5 rounded-full border text-[11px] "+(sel?'bg-white/20 border-white/30 text-white':'bg-emerald-50 border-emerald-200')}>Dalam {rupiahShort(estV.dalam)}</span><span className={"px-1.5 py-0.5 rounded-full border text-[11px] "+(sel?'bg-white/20 border-white/30 text-white':'bg-amber-50 border-amber-200')}>Luar {rupiahShort(estV.luar)}</span></div>
                    </div>
                    <span className={"w-6 h-6 rounded-full border-2 grid place-items-center shrink-0 "+(sel?'bg-white border-white':'bg-white border-[#e7ecf7]')}>{sel&&<span className="w-2.5 h-2.5 rounded-full bg-[#0051d5]"/>}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Tanda tangan Pengirim / Gudang - wajib sebelum barang keluar gudang */}
          <div className="rounded-xl border border-[#e7ecf7] bg-white p-3 space-y-2">
            <div className="text-[11px] font-bold tracking-wider text-[#45464d] uppercase flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-[#0051d5]"/> Tanda tangan Pengirim / Gudang
            </div>
            <label className="space-y-1 block">
              <span className="text-[11px] font-bold tracking-wider text-[#45464d]">NAMA PETUGAS GUDANG *</span>
              <input value={senderName} onChange={e=>setSenderName(e.target.value)} placeholder="nama petugas yang menyerahkan barang"
                className="w-full h-[42px] px-3 bg-white border border-[#e7ecf7] rounded-xl text-sm outline-none focus:border-[#0051d5] focus:ring-2 focus:ring-[#0051d5]/10"/>
            </label>
            <SignaturePad
              key={'sender-sig-'+String(so?.id||'')}
              label="Tanda tangan pengirim"
              hint="Petugas gudang menandatangani di sini sebagai pengirim barang"
              height={140}
              onChange={(sig)=>setSenderSig(sig||'')}
            />
            <div className="text-[11px] text-[#76777d]">Tanda tangan ini tercetak di surat jalan kolom <b>Pengirim / Gudang</b>.</div>
          </div>
        </div>
        <div className="px-3 py-3 border-t bg-white flex justify-end gap-2 shrink-0"><button onClick={onClose} className="h-10 px-5 rounded-xl border bg-white text-sm">Batal</button><button disabled={!selected||loading} onClick={pick} className="h-10 px-5 rounded-xl bg-[#0051d5] text-white text-sm font-bold disabled:opacity-50 hover:bg-blue-800">{loading?'Memproses...':'Kirim dengan Armada Ini'}</button></div>
        <div className="px-3 pb-3 text-[11px] text-[#76777d] text-center shrink-0">Pickup 2 Ton prioritas qty kecil - hemat zona. Data DO simpan jarak+est, trip selisih aktual.</div>
      </div>
    </div>
  )
}

export default function Logistics(){
  const dialog=useDialog();
  const [dos,setDos]=useState([]); const [veh,setVeh]=useState([]); const [stats,setStats]=useState(null);
  const [picking,setPicking]=useState([]); const [warehouses,setWarehouses]=useState([]);
  const [creating,setCreating]=useState(null); const [msg,setMsg]=useState(''); const [err,setErr]=useState('');
  const [loadingPicking,setLoadingPicking]=useState(false);
  const [podOpen,setPodOpen]=useState(false); const [podTarget,setPodTarget]=useState(null);
  const [officeOpen,setOfficeOpen]=useState(false); const [officeTarget,setOfficeTarget]=useState(null);
  const [highlightId,setHighlightId]=useState(null);
  const [pickOpen,setPickOpen]=useState(false); const [pickSo,setPickSo]=useState(null);
  const [deliveredNotes,setDeliveredNotes]=useState([]); const [loadingDelivered,setLoadingDelivered]=useState(false);
  const [invoicingId,setInvoicingId]=useState(null);

  const loadAll=async(silent)=>{
    if(!silent) { setErr(''); }
    try{
      const [a,b,c]=await Promise.all([
        api.get('/logistics/deliveries').catch(()=>({data:[]})),
        api.get('/logistics/vehicles').catch(()=>({data:[]})),
        api.get('/logistics/fleet-stats').catch(()=>({data:null})),
      ]);
      if(Array.isArray(a.data)) setDos(a.data);
      if(Array.isArray(b.data)) setVeh(b.data);
      if(c.data) setStats(c.data);
    }catch(e){ if(!silent) setErr(e.response?.data?.error||e.message); }
  };
  const loadPicking=async(silent)=>{
    if(!silent) setLoadingPicking(true);
    try{ const r=await api.get('/sales/orders',{params:{status:'PICKING', limit:50}}); const v=r.data?.data ?? r.data ?? []; if(Array.isArray(v)) setPicking(v); }catch{ if(!silent) setPicking([]); }
    finally{ if(!silent) setLoadingPicking(false); }
  };
  const loadDelivered=async(silent)=>{
    if(!silent) setLoadingDelivered(true);
    try{ const r=await api.get('/logistics/delivered-notes'); const v=r.data?.data ?? r.data ?? []; if(Array.isArray(v)) setDeliveredNotes(v); }catch{ if(!silent) setDeliveredNotes([]); }
    finally{ if(!silent) setLoadingDelivered(false); }
  };
  useEffect(()=>{
    loadAll(); loadPicking(); loadDelivered();
    api.get('/master/warehouses').then(r=>setWarehouses(Array.isArray(r.data)?r.data:(r.data?.data??[]))).catch(()=>{});
    const iv=setInterval(()=>{ loadAll(true); loadPicking(true); loadDelivered(true); }, 8000);
    const onVis=()=>{ if(document.visibilityState==='visible'){ loadAll(true); loadPicking(true); loadDelivered(true); } };
    const onFocus=()=>{ loadAll(true); loadPicking(true); loadDelivered(true); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    return ()=>{ clearInterval(iv); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onFocus); };
  },[]);

  const requestCreateDo=(so)=>{ setPickSo(so); setPickOpen(true); };
  const doCreateWithVehicle=async(platNo, extra)=>{
    const so=pickSo; if(!so) return;
    setCreating(so.id); setErr(''); setMsg('');
    try{
      const det=await api.get('/sales/orders/'+so.id);
      const items=(det.data?.details||[]).map(d=>({product_id:d.product_id, qty:d.qty}));
      if(!items.length) throw new Error('SO tidak punya item');
      const warehouse_id=warehouses[0]?.id || 1;
      const r=await api.post('/sales/deliveries',{so_id:so.id, warehouse_id, delivery_date: new Date().toISOString().slice(0,10), vehicle_no: platNo, items, distance_km: extra?.distance_km ?? null, est_zone: extra?.est_zone ?? null, delivery_lat: extra?.delivery_lat ?? null, delivery_lng: extra?.delivery_lng ?? null, delivery_address: extra?.delivery_address ?? null, sender_signature_url: extra?.sender_signature_url || undefined, sender_signed_by: extra?.sender_signed_by || undefined});
      const newDoNumber=r.data.do_number||'DO #'+r.data.id;
      const optimistic={ id: r.data.id, do_number: newDoNumber, customer_name: so.customer_name, so_number: so.so_number, vehicle_no: r.data.vehicle_no||platNo, driver_name: null, status: 'IN_TRANSIT', sender_signed: !!extra?.sender_signature_url, sender_signed_by: extra?.sender_signed_by||null, driver_signed: false, office_confirmed_at: null };
      setDos(prev=>[optimistic, ...prev.filter(x=>x.id!==optimistic.id)]);
      setPicking(prev=>prev.filter(s=>s.id!==so.id));
      setVeh(prev=>prev.map(v=>v.plat_no===(r.data.vehicle_no||platNo)?{...v, status:'IN_TRANSIT'}:v));
      setStats(s=>s?{...s, available: Math.max(0, s.available-1), in_transit: (s.in_transit||0)+1}:s);
      setHighlightId(r.data.id);
      setMsg('DO '+newDoNumber+' - sedang dikirim dengan '+(r.data.vehicle_no||platNo)+'. Armada sekarang TIDAK TERSEDIA sampai POD.');
      api.get('/logistics/deliveries').then(x=>{ if(Array.isArray(x.data)) setDos(x.data); }).catch(()=>{});
      api.get('/logistics/vehicles').then(x=>{ if(Array.isArray(x.data)) setVeh(x.data); }).catch(()=>{});
      api.get('/logistics/fleet-stats').then(x=>{ if(x.data) setStats(x.data); }).catch(()=>{});
      api.get('/sales/orders',{params:{status:'PICKING', limit:50}}).then(x=>{ const v=x.data?.data??x.data??[]; if(Array.isArray(v)) setPicking(v); }).catch(()=>{});
      setTimeout(()=>setHighlightId(null),2800);
      setTimeout(()=>document.getElementById('do-table')?.scrollIntoView({behavior:'smooth', block:'start'}),200);
    }catch(e){
      setErr('Gagal buat DO: '+(e.response?.data?.error||e.message));
      throw e;
    }finally{ setCreating(null); }
  };

  const openPod=(d)=>{ setPodTarget(d); setPodOpen(true); };
  const openOffice=(d)=>{ setOfficeTarget(d); setOfficeOpen(true); };
  const afterOffice=({message, delivery, sender_signed_by})=>{
    setMsg(message);
    setDos(prev=>prev.map(x=>x.id===delivery.id?{...x, office_confirmed_at: delivery.office_confirmed_at, sender_signed:true, sender_signed_by}:x));
    setDeliveredNotes(prev=>prev.map(x=>x.id===delivery.id?{...x}:x));
    api.get('/logistics/deliveries').then(r=>{ if(Array.isArray(r.data)) setDos(r.data); }).catch(()=>{});
  };
  const afterPod=({message, receivedBy: rb, delivery, so_completed})=>{
    setMsg(message);
    const plat = podTarget?.vehicle_no || delivery?.vehicle_no;
    const rid = podTarget?.id || delivery?.id;
    setDos(prev=>prev.map(x=>x.id===rid?{...x, status:'DELIVERED', received_by: rb, delivered_at: new Date().toISOString() }:x));
    if(plat) setVeh(prev=>prev.map(v=>v.plat_no===plat?{...v, status:'AVAILABLE'}:v));
    setStats(s=>s?{...s, available: (s.available||0)+1, delivered: (s.delivered||0)+1, in_transit: Math.max(0,(s.in_transit||1)-1)}:s);
    const dn={ id: rid, do_number: podTarget?.do_number || delivery?.do_number, delivered_at: new Date().toISOString(), received_by: rb, status:'DELIVERED', customer_name: podTarget?.customer_name || delivery?.customer_name, so_number: podTarget?.so_number || delivery?.so_number, vehicle_no: plat };
    setDeliveredNotes(prev=>[dn, ...prev.filter(x=>x.id!==rid)]);
    api.get('/logistics/deliveries').then(r=>{ if(Array.isArray(r.data)) setDos(r.data); }).catch(()=>{});
    api.get('/logistics/vehicles').then(r=>{ if(Array.isArray(r.data)) setVeh(r.data); }).catch(()=>{});
    api.get('/logistics/fleet-stats').then(r=>{ if(r.data) setStats(r.data); }).catch(()=>{});
    api.get('/logistics/delivered-notes').then(r=>{
      const v=r.data?.data ?? r.data ?? [];
      if(Array.isArray(v) && v.length) setDeliveredNotes(v);
    }).catch(()=>{});
    setTimeout(()=>document.getElementById('delivered-notes')?.scrollIntoView({behavior:'smooth', block:'start'}),200);
  };

  const createInvoiceForDo=async(d)=>{
    setInvoicingId(d.id); setErr(''); setMsg('');
    try{
      const r=await api.post('/sales/invoices',{do_id: d.id});
      setDos(prev=>prev.map(x=>x.id===d.id?{...x, status:'INVOICED'}:x));
      setDeliveredNotes(prev=>prev.map(x=>x.id===d.id?{...x, status:'INVOICED'}:x));
      setStats(s=>s?{...s, invoiced:(s.invoiced||0)+1}:s);
      setMsg('Invoice '+r.data.invoice_number+' dibuat dari '+d.do_number+' - DO sekarang INVOICED • SO tetap SHIPPED sampai lunas (PAID). Lihat di Invoice (AR).');
      api.get('/logistics/deliveries').then(x=>{ if(Array.isArray(x.data)) setDos(x.data); }).catch(()=>{});
      api.get('/logistics/delivered-notes').then(x=>{ const v=x.data?.data ?? x.data ?? []; if(Array.isArray(v)) setDeliveredNotes(v); }).catch(()=>{});
      api.get('/logistics/fleet-stats').then(x=>{ if(x.data) setStats(x.data); }).catch(()=>{});
    }catch(e){ setErr(e.response?.data?.error||e.message); }
    finally{ setInvoicingId(null); }
  };

  const rupiah=(n)=> new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n||0);
  const inTransitCount = dos.filter(d=>d.status==='IN_TRANSIT').length;
  const deliveredCount = dos.filter(d=>d.status==='DELIVERED').length;
  const invoicedCount = dos.filter(d=>d.status==='INVOICED').length;
  const terkirimCount = deliveredCount + invoicedCount;

  return (
    <div className="space-y-3">
      <PosPageHeader icon={FileText} title="Logistik & Delivery" subtitle={<>PICKING → IN_TRANSIT (armada terkunci) → <b>DELIVERED</b> (POD foto+TTD) → <b>SHIPPED</b> → <b>INVOICED</b> → <b>COMPLETED</b> hanya saat PAID • Auto-live.</>}/>
      {msg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-3 rounded-xl text-sm">{msg}</div>}
      {err && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm flex justify-between gap-2"><span className="break-all">{err}</span><button onClick={()=>setErr('')} className="font-bold"><X size={14}/></button></div>}
      {stats && <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-[#e7ecf7] shadow-card overflow-hidden p-4 text-center"><div className="text-2xl font-bold">{stats.total}</div><div className="text-xs text-[#45464d]">Total Armada</div></div>
        <div className="bg-[#0051d5] rounded-xl shadow-card p-4 text-center text-white"><div className="text-2xl font-bold">{stats.available}</div><div className="text-xs text-white/70">Available</div></div>
        <div className="bg-amber-500 rounded-xl shadow-card p-4 text-center text-white"><div className="text-2xl font-bold">{stats.in_transit}</div><div className="text-xs">Sedang Dikirim</div></div>
        <div className="bg-indigo-600 rounded-xl shadow-card p-4 text-center text-white"><div className="text-2xl font-bold">{stats.invoiced ?? invoicedCount}</div><div className="text-xs text-white/80">Invoiced</div></div>
      </div>}

      <div className="bg-white rounded-xl border border-[#e7ecf7] shadow-card p-3 flex flex-wrap gap-1.5 items-center text-xs">
        <span className="font-bold text-[#0b1c30] mr-1">Aliran:</span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-purple-50 text-purple-700 border-purple-200 font-bold"><Truck size={12}/> PICKING</span>
        <span className="text-[#76777d]">›</span>
        <span className={"inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border font-bold "+(inTransitCount?"bg-sky-50 text-sky-700 border-sky-200":"bg-gray-50 text-gray-600")}><Truck size={12}/> Sedang Dikirim <span className="bg-white px-1.5 py-0.5 rounded-full text-[11px] border">{inTransitCount}</span></span>
        <span className="text-[#76777d]">›</span>
        <span className={"inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border font-bold "+(deliveredCount?"bg-emerald-50 text-emerald-700 border-emerald-200":"bg-gray-50 text-gray-600")}><CheckCircle2 size={12}/> Diterima <span className="bg-white px-1.5 py-0.5 rounded-full text-[11px] border">{deliveredCount}</span></span>
        <span className="text-[#76777d]">›</span>
        <span className={"inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border font-bold "+(invoicedCount?"bg-indigo-50 text-indigo-700 border-indigo-200":"bg-gray-50 text-gray-600")}><Receipt size={12}/> Invoiced <span className="bg-white px-1.5 py-0.5 rounded-full text-[11px] border">{invoicedCount}</span></span>
        <span className="ml-auto text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full">● Live - auto 8 detik & saat kembali ke tab</span>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-[#e7ecf7] shadow-card overflow-hidden">
            <div className="p-4 flex justify-between items-center border-b gap-2"><div className="min-w-0"><div className="font-bold text-sm flex items-center gap-2"><Truck size={14} className="text-[#0051d5]"/> Siap Kirim - SO PICKING → Buat DO</div><div className="text-xs text-[#45464d]">Klik Buat DO → pilih armada AVAILABLE → DO IN_TRANSIT tanpa refresh. SO jadi SHIPPED.</div></div><button onClick={()=>loadPicking()} className="h-8 px-3 bg-white border border-[#e7ecf7] rounded-full text-xs font-bold hover:bg-[#eff4ff] shrink-0">Refresh</button></div>
            <div className="overflow-auto"><table className="w-full text-xs"><thead><tr className="bg-[#e5eeff] border-y border-[#e7ecf7] text-[11px] font-bold tracking-wider text-[#45464d]"><th className="p-2 text-left">SO</th><th className="px-4 py-3.5 text-left">CUSTOMER</th><th className="px-4 py-3.5 text-right">TOTAL</th><th className="px-4 py-3.5 text-center">AKSI</th></tr></thead><tbody>
              {loadingPicking && <tr><td colSpan={4} className="p-6 text-center text-[#76777d]">Memuat PICKING...</td></tr>}
              {!loadingPicking && picking.length===0 && <tr><td colSpan={4} className="p-6 text-center text-xs text-[#76777d]">Tidak ada SO PICKING - APPROVED lalu <b>Mulai Picking</b> di detail SO. Data baru akan muncul otomatis.</td></tr>}
              {!loadingPicking && picking.map(s=>(
                <tr key={s.id} className="border-b border-[#e5eeff] hover:bg-[#eff4ff] transition bg-white"><td className="p-2 font-mono font-bold text-xs">{s.so_number} <span className="ml-1 text-[11px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200">PICKING</span></td><td className="px-4 py-3.5"><div className="font-semibold text-xs">{s.customer_name}</div><div className="text-xs text-[#45464d] font-mono">{s.customer_code}</div></td><td className="px-4 py-3.5 text-right font-bold">{rupiah(s.total)}</td><td className="px-4 py-3.5 text-center"><button disabled={creating===s.id} onClick={()=>requestCreateDo(s)} className="h-7 px-3 bg-[#0051d5] text-white rounded-full text-xs font-bold disabled:opacity-50 hover:bg-blue-800">{creating===s.id?'Memproses...':'Buat DO'}</button><Link to={"/sales/orders/detail/"+s.id} className="ml-2 text-xs text-[#0051d5] hover:underline">Lihat</Link></td></tr>
              ))}
            </tbody></table></div>
          </div>

          <div id="do-table" className="bg-white rounded-xl border border-[#e7ecf7] shadow-card overflow-hidden"><div className="p-4 font-bold border-b flex justify-between items-center gap-2"><span>Delivery Order - Tracking</span><span className="text-xs font-normal text-[#45464d]">{dos.length} DO • {inTransitCount} kirim • {deliveredCount} diterima • {invoicedCount} invoiced • auto-live</span></div><div className="overflow-auto"><table className="w-full text-xs"><thead><tr className="bg-[#e5eeff] border-y border-[#e7ecf7] text-[11px] font-bold tracking-wider text-[#45464d]"><th className="p-2 text-left">DO</th><th className="px-4 py-3.5">CUSTOMER</th><th className="px-4 py-3.5">SO</th><th className="px-4 py-3.5">SOPIR</th><th className="px-4 py-3.5 text-center">TTD</th><th className="px-4 py-3.5">STATUS DO</th><th className="px-4 py-3.5 text-right">AKSI</th></tr></thead><tbody>
            {(Array.isArray(dos)?dos:[]).map(d=>(
              <tr key={d.id} className={"border-b border-[#e5eeff] hover:bg-[#eff4ff] transition "+(highlightId===d.id?"bg-sky-50 ring-1 ring-sky-200":"bg-white")}><td className="p-2 font-mono font-bold align-top"><Link to={'/surat-jalan/'+d.id} className="text-[#0051d5] hover:underline" title="Buka surat jalan">{d.do_number}</Link>{(d.est_cost||d.est_cost_dalam||d.est_cost_luar)? <div className="text-[11px] font-normal text-[#45464d] flex flex-wrap gap-1 mt-1">{d.est_zone? <span>{d.est_zone} • {d.est_weight_ton||'-'}t • {d.distance_km? d.distance_km+'km':''}</span>:null}{d.est_cost_dalam? <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 font-bold">Dalam {new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(d.est_cost_dalam)}</span>:null}{d.est_cost_luar? <span className="px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 font-bold">Luar {new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(d.est_cost_luar)}</span>: d.est_cost? <span className="px-1.5 py-0.5 rounded-full bg-[#eff4ff] border font-bold">{new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(d.est_cost)}</span>:null}</div>: d.distance_km? <div className="text-[11px] text-[#45464d]">{d.distance_km}km</div>:null}</td><td className="px-4 py-3.5 align-top">{d.customer_name}</td><td className="px-4 py-3.5 font-mono text-xs align-top">{d.so_number}</td><td className="px-4 py-3.5 align-top">{d.driver_name||d.vehicle_no||'-'}</td><td className="px-4 py-3.5 align-top"><div className="flex flex-col gap-1 text-[10px] font-bold leading-tight">{d.sender_signed? <span className="inline-flex items-center gap-1 text-emerald-700"><ShieldCheck size={11}/> Gudang</span> : <span className="text-amber-700">Gudang -</span>}{d.driver_signed? <span className="inline-flex items-center gap-1 text-emerald-700"><PenLine size={11}/> Driver</span> : <span className="text-[#76777d]">Driver -</span>}{d.pod_signed? <span className="inline-flex items-center gap-1 text-emerald-700"><UserCheck size={11}/> Penerima</span> : null}{d.office_confirmed_at? <span className="inline-flex items-center gap-1 text-[#0051d5]"><CheckCircle2 size={11}/> Kantor</span> : null}</div></td><td className="px-4 py-3.5 align-middle">
                <span className={"inline-flex items-center justify-center text-center leading-tight px-3 py-1 rounded-full border text-[11px] font-bold whitespace-nowrap "+(d.status==='INVOICED'?"bg-indigo-50 text-indigo-700 border-indigo-200":d.status==='DELIVERED'?"bg-emerald-50 text-emerald-700 border-emerald-200":d.status==='IN_TRANSIT'?"bg-sky-50 text-sky-700 border-sky-200":"bg-gray-100 text-gray-600")}>{d.status==='IN_TRANSIT'?'SEDANG DIKIRIM':d.status}</span>
                {d.status==='DELIVERED' && <div className="text-[11px] text-emerald-700">Diterima{d.received_by?' • '+d.received_by:''}</div>}
                {d.status==='INVOICED' && <div className="text-[11px] text-indigo-600">Sudah di-Invoice</div>}
              </td><td className="px-4 py-3.5 text-right whitespace-nowrap">
                {d.status==='IN_TRANSIT' && <button onClick={()=>openPod(d)} className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-full font-bold hover:bg-emerald-700">Konfirmasi Diterima</button>}
                {d.status==='DELIVERED' && !d.office_confirmed_at && <button onClick={()=>openOffice(d)} className="text-xs px-3 py-1.5 bg-amber-500 text-white rounded-full font-bold hover:bg-amber-600 mr-1"><ShieldCheck size={12} className="inline -mt-0.5"/> Konfirmasi Gudang</button>}
                {d.status==='DELIVERED' && d.office_confirmed_at && <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold mr-1"><CheckCircle2 size={12}/> Gudang OK</span>}
                {d.status==='DELIVERED' && <button disabled={invoicingId===d.id} onClick={()=>createInvoiceForDo(d)} className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-full font-bold hover:bg-indigo-700 disabled:opacity-50">{invoicingId===d.id?'Membuat Invoice...':'Invoice DO'}</button>}
                {d.status==='INVOICED' && <span className="inline-flex items-center gap-1 text-xs text-indigo-700 font-bold"><Receipt size={12}/> Invoiced</span>}
                {d.status==='DELIVERED' && <div className="text-[11px] text-[#76777d] mt-1">SO masih SHIPPED</div>}
              </td></tr>
            ))}
            {dos.length===0 && <tr><td colSpan={7} className="p-6 text-center text-xs text-[#76777d]">Belum ada DO - buat dari SO PICKING di atas.</td></tr>}
          </tbody></table></div></div>

          <div id="delivered-notes" className="bg-white rounded-xl border border-[#e7ecf7] shadow-card overflow-hidden"><div className="p-4 font-bold border-b flex justify-between items-center gap-2"><span className="flex items-center gap-1.5"><PackageCheck size={16} className="text-emerald-600"/> Catatan Pesanan Terkirim</span><button onClick={()=>loadDelivered()} className="h-7 px-3 bg-white border border-[#e7ecf7] rounded-full text-xs font-bold">Refresh</button></div><div className="overflow-auto"><table className="w-full text-xs"><thead><tr className="bg-[#e5eeff] border-y border-[#e7ecf7] text-[11px] font-bold tracking-wider text-[#45464d]"><th className="p-2 text-left">DO</th><th className="px-4 py-3.5">CUSTOMER</th><th className="px-4 py-3.5">TGL TERKIRIM</th><th className="px-4 py-3.5">PENERIMA</th><th className="px-4 py-3.5">ARMADA</th><th className="px-4 py-3.5">STATUS DO</th></tr></thead><tbody>
            {loadingDelivered && <tr><td colSpan={6} className="p-6 text-center text-[#76777d]">Memuat...</td></tr>}
            {!loadingDelivered && deliveredNotes.length===0 && <tr><td colSpan={6} className="p-6 text-center text-xs text-[#76777d]">Belum ada pesanan terkirim - konfirmasi POD akan masuk ke sini langsung tanpa refresh. Setelah itu klik Invoice DO.</td></tr>}
            {!loadingDelivered && deliveredNotes.map(r=>(
              <tr key={r.id} className="border-b border-[#e5eeff] bg-white"><td className="p-2 font-mono font-bold text-xs">{r.do_number}</td><td className="px-4 py-3.5">{r.customer_name}<div className="text-xs text-[#45464d] font-mono">{r.so_number}</div></td><td className="px-4 py-3.5 text-xs">{r.delivered_at ? new Date(r.delivered_at).toLocaleString('id-ID') : '-'}</td><td className="px-4 py-3.5 font-semibold">{r.received_by||'-'}</td><td className="px-4 py-3.5 font-mono text-xs">{r.vehicle_no||'-'}</td><td className="px-4 py-3.5"><span className={"px-2 py-0.5 rounded-full border text-[11px] font-bold "+(r.status==='INVOICED'?"bg-indigo-50 text-indigo-700 border-indigo-200":"bg-emerald-50 text-emerald-700 border-emerald-200")}>{r.status}</span></td></tr>
            ))}
          </tbody></table></div><div className="px-4 py-2 bg-[#eff4ff] border-t text-[11px] text-[#45464d]">Setelah <b>Konfirmasi Diterima</b> → DELIVERED (SO tetap SHIPPED). Lalu <b>Invoice DO</b> → INVOICED → lunasi di Invoice sampai <b>PAID</b> baru SO jadi <b>COMPLETED</b>.</div></div>
        </div>
        <div className="bg-white rounded-xl border border-[#e7ecf7] shadow-card overflow-hidden p-4"><h3 className="font-bold flex items-center gap-1.5"><Truck size={14}/> Armada</h3><div className="text-xs text-[#45464d] mb-2">Pilih AVAILABLE saat Buat DO • IN_TRANSIT saat dikirim • AVAILABLE lagi setelah DELIVERED</div><div className="mt-3 space-y-2">{(Array.isArray(veh)?veh:[]).map(v=>(
          <div key={v.id} className={"flex justify-between items-center p-3 border rounded-xl "+(v.status==='AVAILABLE'?"bg-emerald-50/70 border-emerald-200":"bg-amber-50 border-amber-200") }><div><div className="font-bold text-sm">{v.plat_no} • {v.type}</div><div className="text-xs text-[#45464d]">{v.driver_name||'-'} • {v.capacity_ton} ton</div></div><span className={"text-xs px-2 py-1 rounded-full font-bold border "+(v.status==='AVAILABLE'?"bg-emerald-600 text-white border-emerald-600":"bg-amber-500 text-white border-amber-500")}>{v.status}</span></div>
        ))}{veh.length===0 && <div className="text-xs text-[#76777d] text-center py-6">Tidak ada armada</div>}</div></div>
      </div>

      <ArmadaPickModal open={pickOpen} so={pickSo} onClose={()=>setPickOpen(false)} onPick={doCreateWithVehicle} onAlert={(m)=>dialog.alert(m,{title:'Pilih Armada'})}/>
      <PodModal open={podOpen} delivery={podTarget} onClose={()=>setPodOpen(false)} onSuccess={afterPod} onErr={setErr}/>
      <OfficeConfirmModal open={officeOpen} delivery={officeTarget} onClose={()=>setOfficeOpen(false)} onSuccess={afterOffice} onErr={setErr}/>
    </div>
  )
}
