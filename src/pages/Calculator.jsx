import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { FileText, Calculator as CalculatorIcon, ArrowRight, Layers, Scan, Maximize2, CheckCircle2, Check, Info, Calendar, Package, Send, Eye, ListOrdered, ArrowUpRight } from 'lucide-react';
import { useDialog } from '../components/DialogProvider';

function rupiah(n){ return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n||0); }

const labelForSku = (sku='')=>{
  if(sku.startsWith('KRM')) return 'KERAMIK';
  if(sku.startsWith('CAT')) return 'CAT';
  if(sku.startsWith('BES')) return 'BAJA / BESI';
  if(sku.startsWith('BTB')||sku.startsWith('BTK')||sku.startsWith('BAT')) return 'BATA / BATAKO';
  if(sku.startsWith('SEM')) return 'SEMEN';
  if(sku.startsWith('PAS')) return 'PASIR';
  return 'BAHAN';
};

const tipeOptions = [
  { value:'keramik', label:'Keramik' },
  { value:'cat', label:'Cat' },
  { value:'baja', label:'Baja / Besi' },
  { value:'bata', label:'Bata Merah' },
  { value:'batako', label:'Batako' },
  { value:'plester', label:'Plester' },
  { value:'semua', label:'Semua Kebutuhan (Kombo)' },
];

const ukuranOptions = [
  { value:'0.36', label:'60×60', sub:'60×60 cm', tile:0.36 },
  { value:'0.16', label:'40×40', sub:'40×40 cm', tile:0.16 },
  { value:'0.09', label:'30×30', sub:'30×30 cm', tile:0.09 },
  { value:'0.64', label:'80×80', sub:'80×80 cm', tile:0.64 },
];

export default function Calculator(){
  const nav=useNavigate(); const dialog=useDialog();
  const [type,setType]=useState('keramik');
  const [form,setForm]=useState({length:6, width:8, height:10, waste_pct:10, tile_size:0.36});
  const [result,setResult]=useState(null); const [loading,setLoading]=useState(false);
  const [withQuotation,setWithQuotation]=useState(true);
  const [items,setItems]=useState([]);
  const [calcErr,setCalcErr]=useState('');

  const calc=async()=>{
    setLoading(true); setCalcErr('');
    try{
      const payload={
        type,
        ...form,
        waste_pct: parseFloat(form.waste_pct)||0,
        length: parseFloat(form.length)||0,
        width: parseFloat(form.width)||0,
        height: parseFloat(form.height)||0,
        tile_size: parseFloat(form.tile_size)||0.36
      };
      const r=await api.post('/calculator/estimate',payload);
      if(!r.data || (!r.data.items && r.data.estimate)) setCalcErr(r.data?.estimate||'Gagal hitung');
      setResult(r.data);
      const it=(r.data?.items||[]).map(x=>({
        ...x, checked:true,
        qty: Number(x.qty)||0,
        unit_price: Number(x.unit_price)||65000,
        product_id: x.product_id,
        stock_available: Number(x.stock_available)||0,
        stock_onhand: Number(x.stock_onhand)||0,
        options: Array.isArray(x.options)? x.options : [],
      }));
      setItems(it);
      if(withQuotation){
        const q=await api.post('/calculator/quotation',{...form, type, result:r.data});
        setResult(prev=>({...prev, quotation:q.data}));
      }
    }catch(e){ setCalcErr(e?.response?.data?.error||e.message||'Gagal hitung'); }
    finally{ setLoading(false); }
  };

  const grand = items.filter(x=>x.checked).reduce((a,b)=> a + b.qty*b.unit_price,0);
  const ppn = Math.round(grand*0.11);
  const total = grand + ppn;
  const canPOS = items.some(x=>x.checked && Number(x.qty)>0);

  const toPOS=async()=>{
    const picked = items.filter(x=>x.checked && Number(x.qty)>0).map(x=>({
      product_id: x.product_id, name: x.name || x.sku, sku: x.sku, qty: Number(x.qty), unit_price: Number(x.unit_price), fromCalc: true,
    }));
    if(!picked.length){ await dialog.alert('Centang minimal 1 bahan dengan Qty > 0, lalu Hitung dulu.', {title:'Pilih Bahan'}); return; }
    const missing = picked.filter(x=>!x.product_id);
    if(missing.length){ const ok=await dialog.confirm(missing.length+' bahan belum terhubung ke master produk. Tetap lanjut?', {title:'Produk Belum Terhubung', confirmText:'Tetap Lanjut', cancelText:'Batal'}); if(!ok) return; }
    try{
      const payload = JSON.stringify({ items: picked, note: `Dari Kalkulator ${type} ${form.length}x${form.width}m (${result?.area||0} m²)` });
      sessionStorage.setItem('pos_prefill', payload);
      localStorage.setItem('pos_prefill', payload);
    }catch(e){ console.error(e); }
    nav('/sales/pos');
    setTimeout(()=>{ if(window.location.pathname!=='/sales/pos') window.location.href='/sales/pos'; },400);
  };

  const changeVariant=(idx, newSku)=>{
    setItems(a=>a.map((x,i)=>{
      if(i!==idx) return x;
      const opt = (x.options||[]).find(o=>o.sku===newSku);
      if(!opt) return x;
      return {...x, sku: opt.sku, name: opt.name, product_id: opt.id, unit_price: Number(opt.selling_price), stock_available: Number(opt.stock_available), stock_onhand: Number(opt.stock_onhand)};
    }));
  };

  const displayArea = result?.area ?? result?.area_m2 ?? (parseFloat(form.length||0)*parseFloat(form.width||0) || 0);
  const hasResult = !!result;
  const tipeLabel = tipeOptions.find(o=>o.value===type)?.label || type;
  const ukuranLabel = ukuranOptions.find(o=> String(o.tile)===String(form.tile_size))?.sub || '60×60 cm';
  const typeKey = (type==='keramik60'? 'keramik': type);
  const hasItems = items.length>0;

  return (
    <div className="max-w-[1240px] mx-auto space-y-5 pb-6">
      {/* Header */}
      <div className="bg-white rounded-[16px] border border-[#E2E8F0] px-5 sm:px-6 py-5 flex gap-4 items-start shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="w-10 h-10 rounded-[12px] bg-[#1D4ED8] text-white grid place-items-center shrink-0 shadow-sm">
          <CalculatorIcon size={20} strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <h1 className="text-[18px] sm:text-[20px] font-bold tracking-tight text-[#0F172A] leading-none">Kalkulator Material — Bikin Customer Balik Lagi</h1>
          <p className="text-[13px] text-[#64748B] mt-1.5 leading-relaxed">Input luas • hitung semua bahan • tabel per bahan • pilih merek/tipe dari stok gudang • kirim ke POS tinggal bayar</p>
        </div>
      </div>

      {/* Section 1: Masukkan Parameter */}
      <div className="bg-white rounded-[16px] border border-[#E2E8F0] p-5 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex items-center gap-2.5 mb-5">
          <span className="w-7 h-7 rounded-full bg-[#1D4ED8] text-white grid place-items-center text-[13px] font-bold shrink-0">1</span>
          <h2 className="text-[15px] font-bold text-[#0F172A] tracking-tight">Masukkan Parameter</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Pilih Tipe Kebutuhan */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-[#475569] tracking-wide">Pilih Tipe Kebutuhan <span className="text-[#EF4444]">*</span></label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-[#EFF6FF] border border-[#DBEAFE] grid place-items-center text-[#1D4ED8]">
                <Layers size={14} strokeWidth={2} />
              </span>
              <select value={type} onChange={e=>setType(e.target.value)} className="w-full h-[44px] border border-[#E2E8F0] rounded-[10px] pl-11 pr-8 text-[13px] font-medium bg-white text-[#0F172A] outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/10 appearance-none">
                {tipeOptions.map(o=> <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B]">⌄</span>
            </div>
          </div>

          {/* Panjang */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-[#475569]">Panjang (m) <span className="text-[#EF4444]">*</span></label>
            <input type="number" value={form.length} onChange={e=>setForm({...form,length:e.target.value})} placeholder="6" className="w-full h-[44px] border border-[#E2E8F0] rounded-[10px] px-3 text-[13px] font-medium text-[#0F172A] outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/10 bg-white" />
          </div>

          {/* Lebar */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-[#475569]">Lebar (m) <span className="text-[#EF4444]">*</span></label>
            <input type="number" value={form.width} onChange={e=>setForm({...form,width:e.target.value})} placeholder="8" className="w-full h-[44px] border border-[#E2E8F0] rounded-[10px] px-3 text-[13px] font-medium text-[#0F172A] outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/10 bg-white" />
          </div>

          {/* Tinggi */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-[#475569]">Tinggi (m) <span className="text-[#EF4444]">*</span></label>
            <input type="number" value={form.height} onChange={e=>setForm({...form,height:e.target.value})} placeholder="10" className="w-full h-[44px] border border-[#E2E8F0] rounded-[10px] px-3 text-[13px] font-medium text-[#0F172A] outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/10 bg-white" />
          </div>

          {/* Ukuran */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-[#475569]">Ukuran (cm) <span className="text-[#EF4444]">*</span></label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-[#EFF6FF] border border-[#DBEAFE] grid place-items-center text-[#1D4ED8]">
                <Maximize2 size={14} strokeWidth={2} />
              </span>
              <select value={String(form.tile_size)} onChange={e=>setForm({...form,tile_size: parseFloat(e.target.value)})} className="w-full h-[44px] border border-[#E2E8F0] rounded-[10px] pl-11 pr-8 text-[13px] font-medium bg-white text-[#0F172A] outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/10 appearance-none">
                {ukuranOptions.map(o=> <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B]">⌄</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-6">
          <label className="flex items-center gap-2.5 text-[13px] font-medium text-[#334155] cursor-pointer select-none">
            <span className="relative inline-flex">
              <input type="checkbox" checked={withQuotation} onChange={e=>setWithQuotation(e.target.checked)} className="peer w-[18px] h-[18px] rounded-[4px] border border-[#CBD5E1] text-[#1D4ED8] accent-[#1D4ED8] checked:bg-[#1D4ED8] checked:border-[#1D4ED8]" />
            </span>
            Auto buat quotation (valid 14 hari)
          </label>
          <button onClick={calc} disabled={loading} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-[44px] px-6 bg-[#1D4ED8] hover:bg-[#1E40AF] active:bg-[#1E3A8A] text-white rounded-[12px] font-bold text-[13px] shadow-[0_4px_14px_rgba(29,78,216,0.25)] disabled:opacity-50 transition">
            <CalculatorIcon size={16} strokeWidth={2} />
            {loading?'Menghitung...':'Hitung Kebutuhan'}
            <ArrowRight size={16} strokeWidth={2.5} />
          </button>
        </div>

        {calcErr && <div className="mt-4 text-xs bg-red-50 border border-red-200 text-red-700 rounded-[10px] px-3 py-2.5">{calcErr}</div>}
      </div>

      {/* Section 2: Hasil Estimasi */}
      <div className="bg-white rounded-[16px] border border-[#E2E8F0] p-5 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex items-center gap-2.5 mb-5">
          <span className="w-7 h-7 rounded-full bg-[#1D4ED8] text-white grid place-items-center text-[13px] font-bold shrink-0">2</span>
          <h2 className="text-[15px] font-bold text-[#0F172A] tracking-tight">Hasil Estimasi</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left */}
          <div className="lg:col-span-8 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Total Kebutuhan Material */}
              <div className="rounded-[16px] border border-[#DBEAFE] bg-[#F0F7FF] p-4 sm:p-5">
                <div className="flex gap-3">
                  <span className="w-9 h-9 rounded-full bg-[#DBEAFE] text-[#1D4ED8] grid place-items-center shrink-0">
                    <Layers size={18} strokeWidth={2} />
                  </span>
                  <div>
                    <div className="text-[12px] font-medium text-[#475569]">Total Kebutuhan Material</div>
                    <div className="text-[32px] font-extrabold tracking-tight text-[#1D4ED8] leading-none mt-1">
                      {hasResult ? `${displayArea}` : '—'} <span className="text-[28px]">m²</span>
                    </div>
                    <span className={`mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${hasResult?'bg-[#DCFCE7] text-[#166534] border-[#BBF7D0]':'bg-white text-[#64748B] border-[#E2E8F0]'}`}>
                      <CheckCircle2 size={12} strokeWidth={2.5} className={hasResult?'text-[#16A34A]':'text-[#94A3B8]'} />
                      {hasResult ? 'Perhitungan berhasil' : 'Belum dihitung'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Estimasi Kebutuhan per Tipe */}
              <div className="rounded-[16px] border border-[#E2E8F0] bg-white p-4 sm:p-5">
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="w-8 h-8 rounded-[10px] bg-white border border-[#E2E8F0] grid place-items-center text-[#1D4ED8] shadow-sm">
                    <ListOrdered size={16} strokeWidth={2} />
                  </span>
                  <div className="text-[13px] font-bold text-[#0F172A]">Estimasi Kebutuhan per Tipe</div>
                </div>

                <div className="flex items-center justify-between py-2.5 border-b border-[#F1F5F9]">
                  <span className="flex items-center gap-2.5 text-[13px] font-semibold text-[#0F172A]">
                    <span className="w-7 h-7 rounded-full bg-[#FEE2E2] border border-[#FECACA] grid place-items-center text-[#DC2626] text-[12px]">⬢</span>
                    {tipeLabel}
                  </span>
                  <span className="text-[13px] font-bold text-[#0F172A]">{hasResult ? `${displayArea} m²` : '—'}</span>
                </div>

                <div className="space-y-2 mt-3 text-[12px]">
                  <div className="flex justify-between"><span className="text-[#64748B]">Tipe</span><span className="font-medium text-[#0F172A]">{tipeLabel}</span></div>
                  <div className="flex justify-between"><span className="text-[#64748B]">Ukuran</span><span className="font-medium text-[#0F172A]">{ukuranLabel}</span></div>
                  <div className="flex justify-between"><span className="text-[#64748B]">Estimasi Jumlah</span><span className="font-medium text-[#0F172A]">{hasResult ? `${displayArea} m²` : '—'}</span></div>
                </div>

                <button onClick={()=>{ const el=document.getElementById('detail-bahan'); if(el) el.scrollIntoView({behavior:'smooth', block:'start'}); }} className="mt-4 inline-flex items-center gap-1 text-[12px] font-bold text-[#1D4ED8] hover:text-[#1E40AF]">
                  Lihat detail per bahan <ArrowRight size={12} strokeWidth={2.5} />
                </button>
              </div>
            </div>

            {/* Area cards */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-[12px] border border-[#E2E8F0] bg-white p-4 flex gap-3">
                <span className="w-9 h-9 rounded-[10px] bg-[#EFF6FF] border border-[#DBEAFE] grid place-items-center text-[#1D4ED8] shrink-0">
                  <Scan size={16} strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-[#1D4ED8] tracking-wide">Area</div>
                  <div className="text-[16px] font-extrabold text-[#0F172A] tracking-tight">{hasResult? `${displayArea} m²` : '—'}</div>
                  <div className="text-[11px] text-[#64748B]">Panjang × Lebar ({form.length || 0} × {form.width || 0})</div>
                </div>
              </div>
              <div className="rounded-[12px] border border-[#E2E8F0] bg-white p-4 flex gap-3">
                <span className="w-9 h-9 rounded-[10px] bg-[#F0F9FF] border border-[#DBEAFE] grid place-items-center text-[#1D4ED8] shrink-0">
                  <Layers size={16} strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-[#1D4ED8] tracking-wide">Area M2</div>
                  <div className="text-[16px] font-extrabold text-[#0F172A] tracking-tight">{hasResult? `${displayArea} m²` : '—'}</div>
                  <div className="text-[11px] text-[#64748B]">Total luas yang dihitung</div>
                </div>
              </div>
            </div>

            {/* Disclaimer */}
            <div className="rounded-[10px] bg-[#F1F5F9] border border-[#E2E8F0] px-3.5 py-3 flex gap-2.5 items-start">
              <span className="w-5 h-5 rounded-full bg-[#1D4ED8] text-white grid place-items-center shrink-0 mt-0.5 text-[10px] font-bold">i</span>
              <p className="text-[11px] leading-relaxed text-[#64748B]">Perhitungan ini bersifat estimasi. Jumlah akhir dapat berbeda sesuai kondisi lapangan dan merek yang dipilih.</p>
            </div>
          </div>

          {/* Right: Quotation */}
          <div className="lg:col-span-4">
            <div className="rounded-[16px] border border-[#A7F3D0] bg-[#ECFDF5] p-5 h-full flex flex-col">
              <div className="flex gap-3">
                <span className="w-8 h-8 rounded-full bg-[#059669] text-white grid place-items-center shrink-0">
                  <Check size={16} strokeWidth={3} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold text-[#047857]">Quotation</div>
                  <div className="text-[18px] font-extrabold tracking-tight text-[#0F172A] mt-1 truncate">
                    {result?.quotation?.quotation_number || 'QUO-927839'}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#047857] bg-white/60 px-2 py-1 rounded-full">
                      <Calendar size={12} strokeWidth={2} /> Valid 14 hari
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#065F46] bg-[#D1FAE5] border border-[#A7F3D0] px-2.5 py-1 rounded-full">
                      <Check size={10} strokeWidth={3} /> Auto dari kalkulator material
                    </span>
                  </div>
                </div>
              </div>

              <div className="h-px bg-[#A7F3D0]/60 my-4" />

              <button type="button" onClick={toPOS} disabled={!canPOS} className={`w-full h-[44px] rounded-[12px] font-bold text-[13px] inline-flex items-center justify-center gap-2 transition ${canPOS?'bg-[#1D4ED8] hover:bg-[#1E40AF] text-white shadow-[0_4px_14px_rgba(29,78,216,0.25)] cursor-pointer':'bg-[#1D4ED8]/60 text-white/70 cursor-not-allowed'}`}>
                <Send size={16} strokeWidth={2} />
                Lanjut ke POS — tinggal bayar
                <ArrowRight size={16} strokeWidth={2.5} />
              </button>

              <div className="mt-3 flex items-center justify-center gap-3 text-[11px] text-[#64748B] font-medium">
                <span className="inline-flex items-center gap-1"><CalculatorIcon size={12} strokeWidth={2} /> {canPOS ? `${items.filter(x=>x.checked).length} bahan siap` : 'Hitung dulu'}</span>
                <span className="w-px h-3 bg-[#CBD5E1]" />
                <span className="inline-flex items-center gap-1"><span className="text-[#94A3B8]">⚡</span> untuk aktif</span>
              </div>

              {!hasResult && (
                <p className="mt-3 text-[11px] text-center text-[#059669]/70 leading-relaxed">Klik “Hitung Kebutuhan” untuk membuat quotation otomatis.</p>
              )}
              {hasResult && !canPOS && (
                <p className="mt-3 text-[11px] text-center text-amber-700 bg-amber-50 border border-amber-200 rounded-[8px] px-2 py-2">Centang minimal 1 bahan di detail bawah lalu lanjut ke POS.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Items detail table */}
      {hasItems && (
        <div id="detail-bahan" className="bg-white rounded-[16px] border border-[#E2E8F0] overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="px-5 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] bg-[#F8FAFC]">
            <div>
              <div className="text-[13px] font-bold text-[#0F172A]">Rincian bahan — tabel per bahan</div>
              <div className="text-[11px] text-[#64748B] mt-0.5">1 baris = 1 bahan • dropdown merek/tipe per baris • stok gudang live • centang ikut ke POS</div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={()=>setItems(items.map(x=>({...x, checked:true})))} className="h-8 px-3 bg-white border border-[#E2E8F0] rounded-full text-xs font-bold text-[#0F172A] hover:bg-[#F1F5F9]">Pilih semua</button>
              <button type="button" onClick={()=>setItems(items.map(x=>({...x, checked:false})))} className="h-8 px-3 bg-white border border-[#E2E8F0] rounded-full text-xs font-medium text-[#64748B] hover:bg-[#F1F5F9]">Hapus semua</button>
            </div>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]">
                <tr className="bg-[#F8FAFC] text-[11px] tracking-[.08em] font-bold text-[#64748B] border-b border-[#E2E8F0]">
                  <th className="w-10 px-3 py-3 text-center"><input type="checkbox" checked={items.every(x=>x.checked)} onChange={e=>setItems(items.map(x=>({...x, checked:e.target.checked})))} className="w-4 h-4 accent-[#1D4ED8] rounded" /></th>
                  <th className="text-left px-3 py-3">Bahan</th>
                  <th className="text-left px-3 py-3">Merek / Tipe</th>
                  <th className="text-center px-3 py-3">Stok Gudang</th>
                  <th className="text-center px-3 py-3">Qty</th>
                  <th className="text-right px-3 py-3">Harga / Satuan</th>
                  <th className="text-right px-3 py-3">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {items.map((it,idx)=>(
                  <tr key={idx} className={it.checked?'bg-white hover:bg-[#F8FAFC]':'bg-[#F8FAFC] opacity-60'}>
                    <td className="px-3 py-3 text-center"><input type="checkbox" checked={it.checked} onChange={e=>setItems(a=>a.map((x,i)=>i===idx?{...x, checked:e.target.checked}:x))} className="w-4 h-4 accent-[#1D4ED8]" /></td>
                    <td className="px-3 py-3 min-w-[160px]">
                      <div className="text-[10px] tracking-[.12em] font-bold text-[#64748B]">{labelForSku(it.sku)} • {it.unit}</div>
                      <div className="font-bold leading-tight text-[#0F172A] text-[13px]">{it.name}</div>
                      <div className="text-[11px] font-mono text-[#64748B]">{it.sku}{it.product_id?` • #${it.product_id}`:''}</div>
                      {it.qty > it.stock_available && it.checked && <div className="mt-1 text-[11px] px-2 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 inline-block">Qty melebihi stok</div>}
                    </td>
                    <td className="px-3 py-3 min-w-[280px]">
                      <select value={it.sku} onChange={e=>changeVariant(idx, e.target.value)} className="w-full h-9 border border-[#E2E8F0] rounded-[10px] px-2 text-[13px] bg-white outline-none focus:border-[#1D4ED8]">
                        {(it.options||[]).length ? it.options.map(o=>(
                          <option key={o.sku} value={o.sku}>{o.name} — {o.sku} • {rupiah(o.selling_price)} • stok {o.stock_available}</option>
                        )) : <option value={it.sku}>{it.name} — {it.sku}</option>}
                      </select>
                    </td>
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      <span className={`text-[11px] px-2.5 py-1 rounded-full border font-bold ${it.stock_available>0?'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-red-50 text-red-700 border-red-200'}`}>{it.stock_available}</span>
                      <div className="text-[11px] text-[#64748B] mt-1">on hand {it.stock_onhand}</div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <input type="number" value={it.qty} min={0} step={it.unit==='M3'?0.01:1} onChange={e=>setItems(a=>a.map((x,i)=>i===idx?{...x, qty: parseFloat(e.target.value)||0 }:x))} className="w-20 h-9 border border-[#E2E8F0] rounded-[10px] text-center text-[13px] outline-none focus:border-[#1D4ED8]" />
                      <div className="text-[11px] text-[#64748B] mt-1">{it.unit}</div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <input type="number" value={it.unit_price} onChange={e=>setItems(a=>a.map((x,i)=>i===idx?{...x, unit_price: parseFloat(e.target.value)||0 }:x))} className="w-28 h-9 border border-[#E2E8F0] rounded-[10px] text-right px-2 text-[13px] ml-auto outline-none focus:border-[#1D4ED8]" />
                      <div className="text-[11px] text-[#64748B] mt-1">/ {it.unit}</div>
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap font-extrabold text-[#0F172A]">{rupiah(it.qty*it.unit_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden grid grid-cols-1 gap-3 p-4 bg-[#F8FAFC]">
            {items.map((it,idx)=>(
              <div key={idx} className={"border rounded-[16px] p-4 flex flex-col gap-3 bg-white shadow-sm "+(it.checked?"":"opacity-60 bg-[#F8FAFC]")}>
                <div className="flex justify-between gap-2">
                  <span className="text-[11px] tracking-[.12em] font-bold text-[#64748B]">{labelForSku(it.sku)} • {it.unit}</span>
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={it.checked} onChange={e=>setItems(a=>a.map((x,i)=>i===idx?{...x, checked:e.target.checked}:x))} className="w-4 h-4 accent-[#1D4ED8]"/><span className="text-xs font-bold">{it.checked?'Dipilih':'Lewati'}</span></label>
                </div>
                <div className="font-bold text-sm text-[#0F172A]">{it.name}</div>
                <div className="text-[11px] font-mono text-[#64748B]">{it.sku}</div>
                <select value={it.sku} onChange={e=>changeVariant(idx, e.target.value)} className="w-full h-9 border border-[#E2E8F0] rounded-[10px] px-2 text-sm bg-white">
                  {(it.options||[]).length ? it.options.map(o=>(<option key={o.sku} value={o.sku}>{o.name} — {o.sku} • {rupiah(o.selling_price)} • stok {o.stock_available}</option>)) : <option value={it.sku}>{it.name}</option>}
                </select>
                <div className="flex gap-1.5"><span className={`text-[11px] px-2.5 py-1 rounded-full border font-bold ${it.stock_available>0?'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-red-50 text-red-700 border-red-200'}`}>Stok {it.stock_available}</span><span className="text-[11px] px-2.5 py-1 rounded-full bg-gray-100 border border-[#E2E8F0]">On hand {it.stock_onhand}</span></div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1"><span className="text-[11px] font-bold text-gray-600">Qty ({it.unit})</span><input type="number" value={it.qty} min={0} step={it.unit==='M3'?0.01:1} onChange={e=>setItems(a=>a.map((x,i)=>i===idx?{...x, qty: parseFloat(e.target.value)||0 }:x))} className="w-full h-9 border border-[#E2E8F0] rounded-[10px] text-center text-sm" /></label>
                  <label className="space-y-1"><span className="text-[11px] font-bold text-gray-600">Harga</span><input type="number" value={it.unit_price} onChange={e=>setItems(a=>a.map((x,i)=>i===idx?{...x, unit_price: parseFloat(e.target.value)||0 }:x))} className="w-full h-9 border border-[#E2E8F0] rounded-[10px] text-right px-2 text-sm" /></label>
                </div>
                <div className="flex justify-between border-t border-[#F1F5F9] pt-2"><span className="text-xs text-[#64748B]">Subtotal</span><span className="font-extrabold text-[#0F172A]">{rupiah(it.qty*it.unit_price)}</span></div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="bg-[#F8FAFC] border-t border-[#E2E8F0] p-4">
            <div className="max-w-sm ml-auto space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-[#64748B]">Subtotal dipilih</span><span className="font-bold text-[#0F172A]">{rupiah(grand)}</span></div>
              <div className="flex justify-between"><span className="text-[#64748B]">PPN 11%</span><span className="font-medium text-[#0F172A]">{rupiah(ppn)}</span></div>
              <div className="flex justify-between text-base font-extrabold border-t border-[#E2E8F0] pt-2"><span>Total</span><span>{rupiah(total)}</span></div>
              <div className="text-xs text-[#64748B]">{items.filter(x=>x.checked).length} bahan dipilih</div>
            </div>
            <button type="button" onClick={toPOS} disabled={!canPOS} className={`w-full mt-3 h-11 rounded-[12px] font-bold transition text-[13px] inline-flex items-center justify-center gap-2 ${canPOS?'bg-[#F59E0B] hover:bg-amber-500 text-white shadow':'bg-gray-200 text-[#64748B] cursor-not-allowed'}`}>Lanjut ke POS — tinggal bayar <ArrowRight size={16} /></button>
          </div>

          {/* Estimasi detail grid like old compact */}
          {hasResult && (
            <div className="px-5 sm:px-6 pb-5">
              <div className="grid grid-cols-2 gap-2 text-sm mt-4">
                {Object.entries(result).filter(([k])=> k!=='quotation' && k!=='items').map(([k,v])=> <div key={k} className="flex justify-between bg-[#F8FAFC] border border-[#E2E8F0] rounded-[10px] px-3 py-2.5"><span className="text-[#64748B] capitalize text-xs">{k.replace(/_/g,' ')}</span><span className="font-bold text-[#0F172A] text-xs">{String(v)}</span></div>)}
              </div>
              {result.catatan && <div className="mt-3 text-xs text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-[10px] px-3 py-2">{result.catatan}</div>}
            </div>
          )}
        </div>
      )}

      {/* Empty state hint when no items yet but has result with no items */}
      {hasResult && !hasItems && (
        <div className="bg-white rounded-[16px] border border-dashed border-[#CBD5E1] p-8 text-center">
          <div className="w-10 h-10 rounded-full bg-[#F1F5F9] text-[#64748B] grid place-items-center mx-auto"><Package size={18} /></div>
          <div className="text-sm font-bold text-[#0F172A] mt-3">Tidak ada bahan untuk tipe ini</div>
          <p className="text-xs text-[#64748B] mt-1">Coba ganti tipe kebutuhan lalu hitung lagi.</p>
        </div>
      )}
    </div>
  )
}
