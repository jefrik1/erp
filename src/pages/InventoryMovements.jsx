import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Search, RefreshCw, ArrowDownCircle, ArrowUpCircle, Repeat, SlidersHorizontal } from 'lucide-react';
import api from '../lib/api';
import {
  PosPageHeader, PosCard, PosCardBody, PosChip, PosSelect, PosTh, PosPager,
  PosBadge, PosEmpty, PosSkeleton, PosError, PosStat, PosToolbar, PosChipRow, PosExportButtons,
  posInput, posBtnSecondary, posSearchWrap, posSelectWrap,
} from '../components/PosUI';

const PAGE_SIZE = 15;
const angka = (n)=> new Intl.NumberFormat('id-ID').format(Number(n)||0);
const fmtDateTime = (d)=> d ? String(d).slice(0,16).replace('T',' ') : '-';

const TYPE_TONE = { IN: 'emerald', OUT: 'red', TRF: 'sky', ADJ: 'amber' };
const TYPE_LABEL = { IN: 'Masuk', OUT: 'Keluar', TRF: 'Transfer', ADJ: 'Penyesuaian' };

export default function InventoryMovements(){
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);

  const [f, setF] = useState({ q:'', warehouse_id:'', movement_type:'', start:'', end:'' });
  const [applied, setApplied] = useState({ q:'', warehouse_id:'', movement_type:'', start:'', end:'' });
  const [page, setPage] = useState(1);
  const [presetKey, setPresetKey] = useState('all');

  const load = useCallback(async ()=>{
    setLoading(true); setErr('');
    try{
      const params = { limit: 500, offset: 0 };
      if (applied.q) params.search = applied.q;
      if (applied.warehouse_id) params.warehouse_id = applied.warehouse_id;
      if (applied.movement_type) params.movement_type = applied.movement_type;
      if (applied.start) params.start = applied.start;
      if (applied.end) params.end = applied.end;
      const r = await api.get('/inventory/movements', { params });
      const data = Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []);
      setRows(data);
      setTotal(Number(r.data?.total) || data.length);
    }catch(e){ setErr(e.response?.data?.error || e.message); setRows([]); setTotal(0); }
    finally{ setLoading(false); }
  },[applied]);

  useEffect(()=>{
    api.get('/master/warehouses').then(r=>setWarehouses(Array.isArray(r.data)?r.data:(r.data?.data||[]))).catch(()=>{});
    api.get('/master/products',{ params:{ limit: 200 } }).then(r=>setProducts(r.data?.data||r.data||[])).catch(()=>{});
  },[]);
  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{ setPage(1); },[applied]);

  const filtered = rows;   // filter tipe/gudang/tanggal sudah dikerjakan server
  const pageRows = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
  const totalIn = rows.reduce((a,m)=> a + (Number(m.qty_in)||0), 0);
  const totalOut = rows.reduce((a,m)=> a + (Number(m.qty_out)||0), 0);
  const totalAdj = rows.filter(m=> m.movement_type === 'ADJ').length;
  const totalTrf = rows.filter(m=> m.movement_type === 'TRF').length;

  const [expBusy, setExpBusy] = useState('');
  const downloadExport = async (format)=>{
    setExpBusy(format);
    try{
      const params = { dataset:'movements', format };
      if (applied.q) params.search = applied.q;
      if (applied.warehouse_id) params.warehouse_id = applied.warehouse_id;
      if (applied.movement_type) params.movement_type = applied.movement_type;
      if (applied.start) params.start = applied.start;
      if (applied.end) params.end = applied.end;
      const r = await api.get('/inventory/export', { params, responseType:'blob' });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url; a.download = 'kartu-stok.' + format;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }catch(e){ setErr(e.response?.data?.error || e.message || 'Gagal mengunduh laporan'); }
    finally{ setExpBusy(''); }
  };

  const preset = (k)=>{
    setPresetKey(k);
    const today = new Date();
    const iso = (d)=> d.toISOString().slice(0,10);
    if (k === 'today') setF(s=>({ ...s, start: iso(today), end: iso(today) }));
    else if (k === 'month'){ const a = new Date(today.getFullYear(), today.getMonth(), 1); setF(s=>({ ...s, start: iso(a), end: iso(today) })); }
    else if (k === 'year'){ setF(s=>({ ...s, start: `${today.getFullYear()}-01-01`, end: iso(today) })); }
    else setF(s=>({ ...s, start:'', end:'' }));
  };

  return (
    <div className="space-y-3">
      <PosPageHeader icon={BarChart3} title="Kartu Stok"
        subtitle="Audit trail pergerakan IN/OUT/TRF/ADJ • FIFO • Batch/Serial"
        badge={`${angka(total)} pergerakan`} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PosStat icon={ArrowDownCircle} tone="bg-emerald-50 text-emerald-700" label="TOTAL MASUK" value={angka(totalIn)} sub="qty_in pada filter ini" />
        <PosStat icon={ArrowUpCircle} tone="bg-red-50 text-red-700" label="TOTAL KELUAR" value={angka(totalOut)} sub="qty_out pada filter ini" />
        <PosStat icon={Repeat} tone="bg-sky-50 text-sky-700" label="TRANSFER" value={angka(totalTrf)} sub="mutasi antar gudang" />
        <PosStat icon={SlidersHorizontal} tone="bg-amber-50 text-amber-700" label="PENYESUAIAN" value={angka(totalAdj)} sub="koreksi opname" />
      </div>

      <PosCard>
        <PosCardBody className="space-y-3">
          <PosToolbar actions={<>
            <button onClick={()=>setApplied({...f})} className={posBtnSecondary+' h-9 px-4 text-xs'}>
              <RefreshCw size={13} className={loading?'animate-spin':''}/> Terapkan
            </button>
            <button onClick={()=>{ const reset={q:'',warehouse_id:'',movement_type:'',start:'',end:''}; setF(reset); setApplied(reset); setPresetKey('all'); }}
              className={posBtnSecondary+' h-9 px-4 text-xs'}>Reset</button>
            <PosExportButtons onExport={downloadExport} busyKey={expBusy} prefix="Kartu"/>
          </>}>
            <div className={posSearchWrap}>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"/>
              <input value={f.q} onChange={e=>setF({...f, q:e.target.value})} onKeyDown={e=>e.key==='Enter'&&setApplied({...f})}
                placeholder="Cari produk / SKU lalu Enter..." className={posInput+' pl-9'} />
            </div>
            <div className={posSelectWrap}>
              <PosSelect value={f.warehouse_id} onChange={v=>setF({...f, warehouse_id:v})}>
                <option value="">Semua Gudang</option>
                {warehouses.map(w=> <option key={w.id} value={String(w.id)}>{w.code} • {w.name}</option>)}
              </PosSelect>
            </div>
            <div className={posSelectWrap}>
              <PosSelect value={f.movement_type} onChange={v=>setF({...f, movement_type:v})}>
                <option value="">Semua Tipe</option>
                {Object.entries(TYPE_LABEL).map(([k,v])=> <option key={k} value={k}>{v} ({k})</option>)}
              </PosSelect>
            </div>
          </PosToolbar>

          <PosChipRow label="PERIODE">
            <PosChip active={presetKey==='all'} onClick={()=>preset('all')}>Semua</PosChip>
            <PosChip active={presetKey==='today'} onClick={()=>preset('today')}>Hari ini</PosChip>
            <PosChip active={presetKey==='month'} onClick={()=>preset('month')}>Bulan ini</PosChip>
            <PosChip active={presetKey==='year'} onClick={()=>preset('year')}>Tahun ini</PosChip>
            <span className="ml-auto flex items-center gap-1.5">
              <input type="date" value={f.start} onChange={e=>setF({...f, start:e.target.value})} className={posInput+' w-[150px]'}/>
              <span className="text-[11px] text-[#94A3B8]">s/d</span>
              <input type="date" value={f.end} onChange={e=>setF({...f, end:e.target.value})} className={posInput+' w-[150px]'}/>
            </span>
          </PosChipRow>

          {loading ? <PosSkeleton rows={8} cols={7}/> : err ? <PosError message={err} onRetry={load}/> : filtered.length===0 ? (
            <PosEmpty text="Belum ada pergerakan pada filter ini"/>
          ) : (
            <div className="overflow-auto rounded-xl border border-[#E2E8F0]">
              <table className="w-full text-sm">
                <thead><tr className="bg-[#F1F5F9] border-b border-[#E2E8F0]">
                  <PosTh>TANGGAL</PosTh><PosTh>PRODUK</PosTh><PosTh align="center">GUDANG</PosTh>
                  <PosTh align="center">TIPE</PosTh><PosTh>REFERENSI</PosTh>
                  <PosTh align="right">MASUK</PosTh><PosTh align="right">KELUAR</PosTh><PosTh align="right">SALDO</PosTh>
                </tr></thead>
                <tbody>
                  {pageRows.map(m=>(
                    <tr key={m.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition bg-white">
                      <td className="px-4 py-3.5 text-xs text-[#334155] whitespace-nowrap tabular-nums">{fmtDateTime(m.movement_date)}</td>
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-xs text-[#0F172A]">{m.product_name}</div>
                        <div className="text-[11px] text-[#64748B]">{m.sku}</div>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-center text-[#334155]">{m.warehouse_name || '-'}</td>
                      <td className="px-4 py-3.5 text-center">
                        <PosBadge tone={TYPE_TONE[m.movement_type]||'slate'} title={TYPE_LABEL[m.movement_type]||m.movement_type}>{m.movement_type}</PosBadge>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-[#64748B]">{m.reference_type ? `${m.reference_type} #${m.reference_id ?? '-'}` : '-'}</td>
                      <td className="px-4 py-3.5 text-right font-bold text-emerald-700 tabular-nums">{Number(m.qty_in) > 0 ? angka(m.qty_in) : ''}</td>
                      <td className="px-4 py-3.5 text-right font-bold text-red-600 tabular-nums">{Number(m.qty_out) > 0 ? angka(m.qty_out) : ''}</td>
                      <td className="px-4 py-3.5 text-right text-xs text-[#334155] tabular-nums">{m.balance_qty != null ? angka(m.balance_qty) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && !err && filtered.length > 0 && (
            <PosPager page={page} setPage={setPage} total={filtered.length} size={PAGE_SIZE} unit="pergerakan" />
          )}
        </PosCardBody>
      </PosCard>

      {products.length > 0 && (
        <PosCard>
          <PosCardBody>
            <div className="text-[11px] font-black tracking-widest text-[#64748B]">KARTU STOK PER PRODUK</div>
            <p className="text-xs text-[#64748B] mt-1">Pilih produk untuk menyaring pergerakannya - saldo kolom kanan adalah saldo berjalan setelah mutasi tersebut.</p>
            <div className="mt-2 flex flex-wrap gap-1.5 max-h-[130px] overflow-auto">
              {products.slice(0, 60).map(p=>(
                <PosChip key={p.id} active={false} onClick={()=>{ setF(s=>({ ...s, q: p.sku || p.name })); setApplied(s=>({ ...s, q: p.sku || p.name })); }}>
                  {p.sku || p.name}
                </PosChip>
              ))}
            </div>
          </PosCardBody>
        </PosCard>
      )}
    </div>
  );
}
