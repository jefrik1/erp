import { useEffect, useRef, useState } from 'react';
const ORIGIN = { lat: -6.8392646, lng: 111.9838451 };
function haversine(a,b,c,d){
  const R=6371, dLat=(c-a)*Math.PI/180, dLng=(d-b)*Math.PI/180;
  const s=Math.sin(dLat/2)**2 + Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(s),Math.sqrt(1-s));
}
function localityFrom(j){
  if(!j) return '';
  const a=j.address||{};
  // prioritas: city/town/village/hamlet → county → state
  const loc = a.city || a.town || a.village || a.municipality || a.hamlet || a.county || a.state_district || a.state || '';
  if(loc) return loc;
  const d=j.display_name||'';
  return d.split(',')[0]?.trim()||d.slice(0,28);
}
export default function AddressMapPicker({ valueLat, valueLng, valueAddress, onPick, compact=false }){
  const mapRef=useRef(null);
  const markerRef=useRef(null);
  const lineRef=useRef(null);
  const mapObjRef=useRef(null);
  const [q,setQ]=useState(valueAddress||'');
  const [searching,setSearching]=useState(false);
  const [pos,setPos]=useState(valueLat && valueLng ? {lat:parseFloat(valueLat),lng:parseFloat(valueLng)} : {lat: ORIGIN.lat+0.015, lng: ORIGIN.lng+0.015});
  const [addr,setAddr]=useState(valueAddress||'');
  const [originName,setOriginName]=useState('');
  const [destLoc,setDestLoc]=useState('');
  const dist = +haversine(ORIGIN.lat, ORIGIN.lng, pos.lat, pos.lng).toFixed(2);
  const zone = dist<=15 ? 'Bekasi' : dist<=40 ? 'Jakarta' : 'Luar Kota';

  useEffect(()=>{ if(valueAddress) setQ(valueAddress); },[valueAddress]);

  // nama Pusat aktual dari lat/lng — bukan hardcode Bekasi
  useEffect(()=>{
    let cancelled=false;
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${ORIGIN.lat}&lon=${ORIGIN.lng}&addressdetails=1&zoom=10`,{headers:{'Accept-Language':'id'}})
      .then(r=>r.json()).then(j=>{ if(cancelled) return; setOriginName(localityFrom(j)); })
      .catch(()=>{});
    return ()=>{ cancelled=true; };
  },[]);

  // dest locality awal (jika sudah ada alamat) + saat pos berubah via reverse
  useEffect(()=>{
    if(!pos.lat||!pos.lng) return;
    // jika addr sudah mengandung, coba extract cepat, tapi tetap reverse untuk akurasi
    let cancelled=false;
    const t=setTimeout(()=>{
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.lat}&lon=${pos.lng}&addressdetails=1&zoom=14`,{headers:{'Accept-Language':'id'}})
        .then(r=>r.json()).then(j=>{ if(cancelled) return; const loc=localityFrom(j); if(loc) setDestLoc(loc); if(j.display_name && !addr) { setAddr(j.display_name); setQ(j.display_name); } })
        .catch(()=>{});
    },400);
    return ()=>{ cancelled=true; clearTimeout(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[pos.lat, pos.lng]);

  useEffect(()=>{
    let cancelled=false;
    let m=null;
    (async()=>{
      if(!mapRef.current || mapRef.current._leaflet_id) return;
      const L = await import('leaflet');
      await import('leaflet/dist/leaflet.css');

      const originIcon = L.divIcon({
        className: '',
        html: `<div style="position:relative;width:42px;height:48px;filter:drop-shadow(0 6px 12px rgba(30,64,175,.35))">
          <div style="width:38px;height:38px;background:#1E40AF;border:3px solid #fff;border-radius:14px;display:grid;place-items:center;color:#fff;font-size:15px">🏭</div>
          <div style="position:absolute;left:50%;transform:translateX(-50%);bottom:-2px;background:#0F172A;color:#fff;font:800 9px/1 system-ui;letter-spacing:.08em;padding:3px 7px;border-radius:999px;border:1.5px solid #fff;white-space:nowrap">PUSAT</div>
          <div style="position:absolute;left:50%;transform:translateX(-50%);bottom:-6px;width:8px;height:8px;background:#0F172A;border-left:1.5px solid #fff;border-bottom:1.5px solid #fff;rotate:45deg"></div>
        </div>`,
        iconSize: [42,48],
        iconAnchor: [21,44],
      });
      const destIcon = L.divIcon({
        className: '',
        html: `<div style="position:relative;width:44px;height:54px;filter:drop-shadow(0 8px 16px rgba(220,38,38,.4))">
          <div style="width:40px;height:40px;background:linear-gradient(135deg,#EF4444,#DC2626);border:3px solid #fff;border-radius:999px;display:grid;place-items:center;color:#fff;font-size:17px;">📍</div>
          <div style="position:absolute;left:50%;transform:translateX(-50%);bottom:10px;width:12px;height:12px;background:#DC2626;rotate:45deg;border-right:2px solid #fff;border-bottom:2px solid #fff"></div>
          <div style="position:absolute;left:50%;transform:translateX(-50%);bottom:-3px;background:#DC2626;color:#fff;font:800 8px/1 system-ui;letter-spacing:.06em;padding:2px 6px;border-radius:999px;border:1.5px solid #fff">TUJUAN</div>
        </div>`,
        iconSize: [44,54],
        iconAnchor: [22,46],
      });

      if(cancelled || !mapRef.current) return;
      m = L.map(mapRef.current, { zoomControl:false, attributionControl:true }).setView([pos.lat, pos.lng], 13);
      mapObjRef.current=m;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ attribution:'&copy; OSM • klik/drag pin', maxZoom:19 }).addTo(m);
      L.control.zoom({ position:'bottomright' }).addTo(m);
      L.control.scale({ metric:true, imperial:false, position:'bottomleft' }).addTo(m);

      const om = L.marker([ORIGIN.lat, ORIGIN.lng], { icon: originIcon, zIndexOffset: 800, keyboard:false }).addTo(m);
      // popup akan di-update setelah originName ke-load
      const updateOriginPopup=()=>{
        const label = originName || `${ORIGIN.lat.toFixed(4)}, ${ORIGIN.lng.toFixed(4)}`;
        om.bindPopup(`<div style="font:700 12px system-ui;color:#0F172A">🏭 Gudang Pusat — ${label}</div><div style="font:11px system-ui;color:#64748B">${ORIGIN.lat.toFixed(6)}, ${ORIGIN.lng.toFixed(6)}</div>`, { closeButton:false, offset:[0,-8] });
      };
      updateOriginPopup();
      // re-bind saat nama ke-load
      const iv=setInterval(()=>{ if(originName){ updateOriginPopup(); clearInterval(iv); } }, 600);

      const dm = L.marker([pos.lat, pos.lng], { icon: destIcon, draggable:true, zIndexOffset: 1000 }).addTo(m);
      markerRef.current=dm;

      const line = L.polyline([[ORIGIN.lat,ORIGIN.lng],[pos.lat,pos.lng]], { color:'#2563EB', weight:3, opacity:.85, dashArray:'8 8', lineCap:'round' }).addTo(m);
      lineRef.current=line;

      const updateLine = (lat,lng)=>{
        line.setLatLngs([[ORIGIN.lat,ORIGIN.lng],[lat,lng]]);
        const d=haversine(ORIGIN.lat,ORIGIN.lng,lat,lng);
        // label garis pakai locality tujuan jika ada, bukan hardcode Bekasi
        const loc = destLoc || (d<=15 ? 'Dekat Pusat' : d<=40 ? 'Menengah' : 'Jauh');
        line.unbindTooltip();
        line.bindTooltip(`${d.toFixed(2)} km • ${loc}`, { sticky:true, direction:'top', offset:[0,-6], className:'!bg-[#0F172A] !text-white !border-0 !rounded-full !px-2 !py-1 !text-[11px] !font-bold' });
        try{ const mid=[(ORIGIN.lat+lat)/2, (ORIGIN.lng+lng)/2]; line.openTooltip(mid); setTimeout(()=>line.closeTooltip(),1600); }catch{}
      };
      updateLine(pos.lat,pos.lng);

      dm.on('dragend', async()=>{
        const p=dm.getLatLng(); setPos({lat:p.lat,lng:p.lng}); updateLine(p.lat,p.lng);
        try{
          const r=await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${p.lat}&lon=${p.lng}&addressdetails=1&zoom=14`,{headers:{'Accept-Language':'id'}}).then(x=>x.json());
          const a=r.display_name||''; const loc=localityFrom(r);
          setAddr(a); setQ(a); if(loc) setDestLoc(loc);
          updateLine(p.lat,p.lng);
        }catch{}
      });
      m.on('click', async(e)=>{
        const p=e.latlng; dm.setLatLng(p); setPos({lat:p.lat,lng:p.lng}); updateLine(p.lat,p.lng);
        try{
          const r=await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${p.lat}&lon=${p.lng}&addressdetails=1&zoom=14`,{headers:{'Accept-Language':'id'}}).then(x=>x.json());
          const a=r.display_name||''; const loc=localityFrom(r);
          setAddr(a); setQ(a); if(loc) setDestLoc(loc);
          updateLine(p.lat,p.lng);
        }catch{}
      });

      try{
        const b=L.latLngBounds([ORIGIN.lat,ORIGIN.lng],[pos.lat,pos.lng]).pad(0.35);
        m.fitBounds(b, { animate:true, padding:[24,24] });
      }catch{}
      setTimeout(()=>m.invalidateSize(),180);
      setTimeout(()=>om.openPopup(),700);
    })();
    return ()=>{ cancelled=true; if(m){ try{m.remove();}catch{} } mapObjRef.current=null; markerRef.current=null; lineRef.current=null; };
    // eslint-disable-next-line
  },[]);

  useEffect(()=>{
    if(markerRef.current) markerRef.current.setLatLng([pos.lat,pos.lng]);
    if(lineRef.current) lineRef.current.setLatLngs([[ORIGIN.lat,ORIGIN.lng],[pos.lat,pos.lng]]);
    if(mapObjRef.current){ try{ mapObjRef.current.panTo([pos.lat,pos.lng], { animate:true, duration:0.4 }); }catch{} }
  },[pos.lat,pos.lng]);

  const doSearch=async()=>{
    if(!q.trim()) return;
    setSearching(true);
    try{
      const r=await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=1`,{headers:{'Accept-Language':'id'}}).then(x=>x.json());
      if(r[0]){
        const lat=parseFloat(r[0].lat), lon=parseFloat(r[0].lon);
        setPos({lat, lng:lon}); setAddr(r[0].display_name||q);
        const loc=localityFrom(r[0]); if(loc) setDestLoc(loc);
      }
    }catch{}
    finally{ setSearching(false); }
  };
  const confirm=()=>{
    const d=+haversine(ORIGIN.lat, ORIGIN.lng, pos.lat, pos.lng).toFixed(2);
    onPick?.({lat:pos.lat, lng:pos.lng, address: addr||q, distance_km:d});
  };

  // header label: Pusat = nama aktual, Tujuan = nama aktual — bukan "Bekasi" hardcode
  const pusatLabel = originName ? `Pusat • ${originName}` : `Pusat ${ORIGIN.lat.toFixed(4)},${ORIGIN.lng.toFixed(4)}`;
  const tujuanLabel = destLoc ? `${destLoc}` : zone;
  // warna badge ikut jarak tapi teks ikut locality
  const badgeCls = dist>40 ? "bg-amber-500 text-white border-amber-600" : dist>15 ? "bg-sky-600 text-white border-sky-700" : "bg-emerald-600 text-white border-emerald-700";

  return (
    <div className={"border border-[#E2E8F0] rounded-2xl overflow-hidden bg-white shadow-sm flex flex-col "+(compact?'':'')}>
      <div className="px-3 py-2 bg-white border-b border-[#E2E8F0] flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-widest text-[#0F172A] shrink-0"><span className="w-5 h-5 rounded-full bg-[#1E40AF] text-white grid place-items-center text-[10px]">◉</span> PETA PENGIRIMAN</span>
        <span className="flex-1 min-w-0 hidden sm:block text-[11px] text-[#94A3B8] truncate">klik / drag pin merah • OSM</span>
        <span className="ml-auto flex items-center gap-1.5 shrink-0">
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-[#0F172A] text-white font-bold truncate max-w-[120px]" title={`${ORIGIN.lat}, ${ORIGIN.lng}`}>{pusatLabel}</span>
          <span className={"text-[11px] px-2.5 py-1 rounded-full font-black border truncate max-w-[130px] "+badgeCls}>{dist} km • {tujuanLabel}</span>
        </span>
      </div>

      <div className="p-2 flex gap-2 bg-[#F8FAFC] border-b border-[#E2E8F0]">
        <div className="flex-1 relative min-w-0">
          <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&(e.preventDefault(),doSearch())} placeholder="Cari alamat — ex: Jenu Tuban" className="w-full h-9 pl-3 pr-8 bg-white border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10"/>
          {q && <button type="button" onClick={()=>setQ('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 grid place-items-center rounded-full hover:bg-[#F1F5F9] text-[#94A3B8] text-xs">✕</button>}
        </div>
        <button type="button" onClick={doSearch} disabled={searching} className="h-9 px-4 rounded-xl bg-[#0F172A] text-white text-xs font-bold hover:bg-black disabled:opacity-50 shrink-0">{searching?'…':'Cari'}</button>
      </div>

      <div className="relative bg-[#EFF6FF]">
        <div ref={mapRef} className={"w-full "+(compact?'h-[220px]':'h-[300px]')} />
        <div className="absolute left-2 top-2 bg-white border border-[#E2E8F0] rounded-full px-2.5 py-1 shadow flex items-center gap-2 text-[11px] font-bold">
          <span className="w-2.5 h-2.5 rounded-full bg-[#1E40AF] border border-white"></span> {originName||'Pusat'}
          <span className="w-px h-3 bg-[#E2E8F0]"></span>
          <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626] border border-white"></span> {destLoc||'Tujuan'}
          <span className="text-[#64748B] font-normal">• {dist} km</span>
        </div>
        <div className="absolute right-2 top-2 bg-[#0F172A]/90 backdrop-blur text-white rounded-full px-2.5 py-1 text-[10px] font-mono shadow">
          {pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}
        </div>
      </div>

      {addr && <div className="mx-2 mt-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2"><div className="text-xs font-bold text-[#0F172A] line-clamp-2 leading-tight">📍 {addr}</div><div className="text-[11px] text-[#64748B] mt-0.5">{dist} km dari {originName||'pusat'} → {destLoc||zone} • zona tarif auto</div></div>}

      <div className="p-2 flex items-center gap-2 bg-white border-t border-[#E2E8F0]">
        <span className="flex-1 text-[11px] text-[#64748B] hidden sm:block">Drag pin merah atau klik peta</span>
        <button type="button" onClick={confirm} className="flex-1 sm:flex-none h-9 px-5 rounded-xl bg-[#1E40AF] text-white text-xs font-black hover:bg-[#1E3A8A] shadow-sm">Pakai alamat & jarak ini ✓</button>
      </div>
    </div>
  )
}
export { ORIGIN, haversine };
