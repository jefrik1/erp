import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  PackagePlus, PackageMinus, ClipboardCheck, Search, RefreshCw, Plus, Trash2, X,
  Info, Warehouse, Calendar, FileText, AlertTriangle, Eye, Boxes,
} from 'lucide-react';
import api from '../lib/api';
import { useDialog } from '../components/DialogProvider';
import {
  PosPageHeader, PosCard, PosCardBody, PosChip, PosSelect, PosTh, PosPager, PosBadge,
  PosEmpty, PosSkeleton, PosError, PosStat, PosToolbar, PosChipRow, PosExportButtons,
  posInput, posBtnPrimary, posBtnSecondary, posBtnSm, posTr, posTd, posSearchWrap, posSelectWrap,
} from '../components/PosUI';

const PAGE_SIZE = 10;
const nf = (n)=> new Intl.NumberFormat('id-ID').format(Number(n)||0);
const rupiah = (n)=> 'Rp ' + nf(Math.round(Number(n)||0));
const num = (v)=> parseFloat(v) || 0;

const MODES = [
  { key:'IN',  label:'Tambah Stok', icon:PackagePlus, tone:'emerald',
    help:'Stok bertambah. Isi harga satuan supaya nilai persediaan ikut benar. Pakai ini untuk stok awal, barang datang tanpa PO, retur dari customer, atau hibah.' },
  { key:'OUT', label:'Kurangi Stok', icon:PackageMinus, tone:'red',
    help:'Stok berkurang tanpa penjualan: barang rusak, susut, hilang, dipakai internal, atau koreksi. Untuk penjualan, pakai POS/Sales Order - bukan di sini.' },
  { key:'SET', label:'Opname Fisik', icon:ClipboardCheck, tone:'sky',
    help:'Isi JUMLAH NYATA hasil hitung di gudang (bukan selisih). Sistem menyesuaikan stok ke angka itu, berapa pun selisihnya.' },
];
const REASON_LABEL = {
  STOK_AWAL:'Stok awal', PEMBELIAN_TANPA_PO:'Pembelian tanpa PO', RETUR_CUSTOMER:'Retur dari customer',
  HIBAH:'Hibah / sumbangan', BARANG_TEMUAN:'Barang temuan', KOREKSI_OPNAME:'Koreksi hasil opname', LAINNYA:'Lain-lain',
  SUSUT:'Susut / menyusut', RUSAK:'Rusak / pecah', PEMAKAIAN_INTERNAL:'Dipakai internal', SAMPLE:'Sample / promosi',
  OPNAME_FISIK:'Hasil hitung fisik',
};
const TYPE_TONE = { IN:'emerald', OUT:'red', SET:'sky' };
const TYPE_LABEL = { IN:'Tambah', OUT:'Kurangi', SET:'Opname' };

export default function StockIn(){
  const dialog = useDialog();
  const [searchParams] = useSearchParams();
  const presetProduct = searchParams.get('product_id');
  const [mode, setMode] = useState('IN');
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [stockMap, setStockMap] = useState({});        // product_id -> qty di gudang terpilih
  const [rows, setRows] = useState([]);
  const [history, setHistory] = useState([]);
  const [histTotal, setHistTotal] = useState(0);
  const [loadingHist, setLoadingHist] = useState(true);
  const [histErr, setHistErr] = useState('');
  const [typeFilter, setTypeFilter] = useState('Semua');
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [page, setPage] = useState(1);
  const [expBusy, setExpBusy] = useState('');
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailBusy, setDetailBusy] = useState(false);

  const [head, setHead] = useState({ warehouse_id:'', adjustment_date:'', reference_no:'', reason:'STOK_AWAL', note:'' });

  const modeDef = MODES.find(m=> m.key===mode);

  /* ------------------------------------------------------------- loading */
  useEffect(()=>{
    (async ()=>{
      try{
        const [w, p] = await Promise.all([
          api.get('/master/warehouses').catch(()=>({ data:[] })),
          api.get('/master/products', { params:{ limit:500 } }).catch(()=>({ data:{ data:[] } })),
        ]);
        const wl = Array.isArray(w.data) ? w.data : (w.data?.data || []);
        setWarehouses(wl);
        setProducts(Array.isArray(p.data?.data) ? p.data.data : (Array.isArray(p.data) ? p.data : []));
        if (wl[0]) setHead(h=>({ ...h, warehouse_id:String(wl[0].id) }));
      }catch(e){ /* dropdown kosong tidak memblokir */ }
    })();
  },[]);

  const loadStockMap = useCallback(async (warehouseId)=>{
    if (!warehouseId){ setStockMap({}); return; }
    try{
      const r = await api.get('/inventory/stocks', { params:{ warehouse_id:warehouseId, limit:3000 } });
      const list = r.data?.data || [];
      const map = {};
      list.forEach(s=>{ map[s.product_id] = (map[s.product_id]||0) + num(s.qty_on_hand); });
      setStockMap(map);
    }catch(e){ setStockMap({}); }
  },[]);

  useEffect(()=>{ loadStockMap(head.warehouse_id); },[head.warehouse_id, loadStockMap]);

  // datang dari halaman Stok dengan ?product_id=... → langsung siapkan satu baris
  const [presetDone, setPresetDone] = useState(false);
  useEffect(()=>{
    if (presetDone || !presetProduct) return;
    setRows([{ key:Date.now(), product_id:String(presetProduct), qty:'', unit_cost:'', batch_no:'', expired_date:'' }]);
    setPresetDone(true);
  },[presetProduct, presetDone]);

  const loadHistory = useCallback(async ()=>{
    setLoadingHist(true); setHistErr('');
    try{
      const params = { q:appliedQ, limit:PAGE_SIZE, offset:(page-1)*PAGE_SIZE };
      if (typeFilter!=='Semua') params.type = typeFilter;
      const r = await api.get('/inventory/adjustments', { params });
      setHistory(Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data)? r.data : []));
      setHistTotal(r.data?.total ?? (Array.isArray(r.data)? r.data.length : 0));
    }catch(e){ setHistory([]); setHistTotal(0); setHistErr(e.response?.data?.error || e.message || 'Gagal memuat riwayat'); }
    finally{ setLoadingHist(false); }
  },[appliedQ,typeFilter,page]);

  useEffect(()=>{ loadHistory(); },[loadHistory]);
  useEffect(()=>{ setPage(1); },[appliedQ,typeFilter]);
  useEffect(()=>{ setHead(h=>({ ...h, reason: mode==='IN'?'STOK_AWAL': mode==='OUT'?'RUSAK':'OPNAME_FISIK' })); },[mode]);

  /* -------------------------------------------------------------- derived */
  const reasonOptions = mode==='IN'
    ? ['STOK_AWAL','PEMBELIAN_TANPA_PO','RETUR_CUSTOMER','HIBAH','BARANG_TEMUAN','KOREKSI_OPNAME','LAINNYA']
    : mode==='OUT'
      ? ['RUSAK','SUSUT','KOREKSI_OPNAME','PEMAKAIAN_INTERNAL','SAMPLE','LAINNYA']
      : ['OPNAME_FISIK'];

  const totalNilai = rows.reduce((a,r)=> a + (mode==='OUT' ? 0 : num(r.qty)*num(r.unit_cost)), 0);
  const totalQty = rows.reduce((a,r)=> a + num(r.qty), 0);
  const preview = (r)=>{
    const before = num(stockMap[r.product_id]) || 0;
    if (!r.product_id || !num(r.qty)) return { before, after: before, delta: 0 };
    const after = mode==='IN' ? before + num(r.qty) : mode==='OUT' ? before - num(r.qty) : num(r.qty);
    return { before, after, delta: after - before };
  };

  /* -------------------------------------------------------------- actions */
  const addRow = (productId)=>{
    setRows(rs=> [...rs, { key:Date.now()+Math.random(), product_id: productId? String(productId):'', qty:'', unit_cost:'', batch_no:'', expired_date:'' }]);
  };
  const updRow = (key, patch)=> setRows(rs=> rs.map(r=> r.key===key ? { ...r, ...patch } : r));
  const delRow = (key)=> setRows(rs=> rs.filter(r=> r.key!==key));

  const submit = async (e)=>{
    e.preventDefault();
    setFormErr('');
    const items = rows.filter(r=> r.product_id && num(r.qty) > 0)
      .map(r=>({ product_id:parseInt(r.product_id), qty:num(r.qty), unit_cost:num(r.unit_cost), batch_no:r.batch_no||null, expired_date:r.expired_date||null }));
    if (!head.warehouse_id){ setFormErr('Gudang wajib dipilih.'); return; }
    if (!items.length){ setFormErr('Tambahkan minimal satu produk dengan jumlah > 0.'); return; }
    if (mode==='OUT'){
      const kurang = rows.filter(r=> r.product_id && num(r.qty) > num(stockMap[r.product_id]||0));
      if (kurang.length){
        const nama = kurang.map(r=> products.find(p=> String(p.id)===String(r.product_id))?.name || ('#'+r.product_id)).join(', ');
        setFormErr('Jumlah keluar melebihi stok di gudang ini untuk: '+nama);
        return;
      }
    }
    setSaving(true);
    try{
      const r = await api.post('/inventory/adjustments', {
        warehouse_id: parseInt(head.warehouse_id), type: mode, reason: head.reason,
        adjustment_date: head.adjustment_date || null, reference_no: head.reference_no || null,
        note: head.note || null, items });
      const d = r.data || {};
      const lines = (d.items||[]).slice(0,8)
        .map(i=>{ const nm = products.find(p=> p.id===i.product_id)?.name || ('Produk #'+i.product_id);
          return '• '+nm+': '+nf(i.qty_before)+' → '+nf(i.qty_after); }).join('\n');
      await dialog.alert(
        'Dokumen '+(d.adjustment_number||'')+' tersimpan.\n'+
        (mode==='IN' ? 'Stok bertambah '+nf(totalQty)+' unit' : mode==='OUT' ? 'Stok berkurang '+nf(totalQty)+' unit' : 'Stok disesuaikan ke hasil hitung fisik')+
        (mode!=='OUT' && totalNilai>0 ? '\nNilai: '+rupiah(totalNilai) : '')+
        (lines ? '\n\n'+lines : ''),
        { title:'Stok Diperbarui' });
      setRows([]);
      setHead(h=>({ ...h, reference_no:'', note:'' }));
      loadStockMap(head.warehouse_id); loadHistory();
    }catch(e){
      setFormErr(e.response?.data?.error || e.message || 'Gagal menyimpan');
    }finally{ setSaving(false); }
  };

  const openDetail = async (row)=>{
    setDetailBusy(true); setDetail({ id:row.id });
    try{ const r = await api.get('/inventory/adjustments/'+row.id); setDetail(r.data); }
    catch(e){ setDetail(null); await dialog.alert(e.response?.data?.error || e.message, { title:'Gagal memuat detail' }); }
    finally{ setDetailBusy(false); }
  };

  const downloadExport = async (format)=>{
    setExpBusy(format);
    try{
      const params = { dataset:'adjustments', format };
      if (appliedQ) params.q = appliedQ;
      if (typeFilter!=='Semua') params.type = typeFilter;
      const r = await api.get('/inventory/export', { params, responseType:'blob' });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url; a.download = 'penyesuaian-stok.' + format;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }catch(e){ await dialog.alert(e.response?.data?.error || e.message || 'Gagal mengunduh laporan', { title:'Gagal export' }); }
    finally{ setExpBusy(''); }
  };

  const whName = useMemo(()=> warehouses.find(w=> String(w.id)===String(head.warehouse_id))?.name || '-', [warehouses, head.warehouse_id]);

  /* --------------------------------------------------------------- render */
  return (
    <div className="space-y-3">
      <PosPageHeader
        icon={PackagePlus}
        title="Penambahan Stok"
        subtitle="Input stok manual: tambah, kurangi, atau samakan dengan hasil hitung fisik - tanpa harus bikin Purchase Order dulu"
        badge={whName}
      />

      {/* pilih jenis */}
      <div className="grid sm:grid-cols-3 gap-3">
        {MODES.map(m=>{
          const Icon = m.icon;
          const active = mode===m.key;
          return (
            <button key={m.key} onClick={()=>setMode(m.key)}
              className={'text-left rounded-xl border p-4 transition shadow-card '+(active
                ? 'border-[#0051d5] bg-[#0051d5]/5 ring-2 ring-[#0051d5]/20'
                : 'border-[#e7ecf7] bg-white hover:bg-[#eff4ff]')}>
              <div className="flex items-center gap-2">
                <span className={'w-8 h-8 rounded-xl grid place-items-center '+(m.tone==='emerald'?'bg-emerald-50 text-emerald-700':m.tone==='red'?'bg-red-50 text-red-700':'bg-sky-50 text-sky-700')}>
                  <Icon size={15}/>
                </span>
                <span className="font-bold text-[14px] text-[#0b1c30]">{m.label}</span>
                {active && <PosBadge tone={TYPE_TONE[m.key]}>dipilih</PosBadge>}
              </div>
              <div className="text-[11px] text-[#45464d] mt-2 leading-relaxed">{m.help}</div>
            </button>
          );
        })}
      </div>

      {/* form */}
      <PosCard>
        <form onSubmit={submit}>
          <PosCardBody className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="w-7 h-7 rounded-lg grid place-items-center bg-[#0051d5]/10 text-[#0051d5] shrink-0"><Info size={14}/></span>
              <div className="text-xs text-[#45464d] leading-relaxed">
                <b className="text-[#0b1c30]">{modeDef.label}</b> - {modeDef.help}
                {mode==='IN' && ' Stok juga bisa masuk lewat <b>Goods Receipt</b> kalau barangnya datang dari Purchase Order.'}
              </div>
            </div>

            {formErr && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5"/> <span>{formErr}</span>
              </div>
            )}

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">GUDANG *</span>
                <PosSelect size="md" value={head.warehouse_id} onChange={v=>setHead({...head, warehouse_id:v})}>
                  <option value="">Pilih gudang</option>
                  {warehouses.map(w=> <option key={w.id} value={w.id}>{w.code} • {w.name}</option>)}
                </PosSelect></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">TANGGAL</span>
                <input type="date" value={head.adjustment_date} onChange={e=>setHead({...head, adjustment_date:e.target.value})} className={posInput}/></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">ALASAN *</span>
                <PosSelect size="md" value={head.reason} onChange={v=>setHead({...head, reason:v})}>
                  {reasonOptions.map(r=> <option key={r} value={r}>{REASON_LABEL[r]||r}</option>)}
                </PosSelect></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">NO. REFERENSI</span>
                <input value={head.reference_no} onChange={e=>setHead({...head, reference_no:e.target.value})}
                  placeholder="mis. nota supplier / berita acara" className={posInput}/></label>
            </div>

            <div className="rounded-xl border border-[#e7ecf7] overflow-hidden">
              <div className="bg-[#eff4ff] px-3 py-2 border-b border-[#e7ecf7] flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold tracking-wider text-[#45464d]">DAFTAR PRODUK</span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#76777d]">{mode==='SET' ? 'isi jumlah nyata hasil hitung' : mode==='OUT' ? 'jumlah yang keluar' : 'jumlah yang masuk'}</span>
                  <button type="button" onClick={()=>addRow('')} className={posBtnSm}><Plus size={13}/> Baris</button>
                </div>
              </div>

              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-[#e5eeff] border-b border-[#e7ecf7] text-[11px] font-bold tracking-wider text-[#45464d]">
                    <PosTh>PRODUK</PosTh><PosTh align="center">STOK SEKARANG</PosTh>
                    <PosTh align="right">{mode==='SET'?'JUMLAH NYATA':'JUMLAH'}</PosTh>
                    {mode!=='OUT' && <PosTh align="right">HARGA SATUAN</PosTh>}
                    <PosTh align="center">STOK JADI</PosTh>
                    {mode==='IN' && <PosTh>BATCH / KADALUARSA</PosTh>}
                    <PosTh align="right"></PosTh>
                  </tr></thead>
                  <tbody>
                    {rows.map(r=>{
                      const pv = preview(r);
                      const kurang = mode!=='IN' && num(r.qty)>0 && pv.after < 0;
                      return (
                        <tr key={r.key} className={posTr}>
                          <td className={posTd}>
                            <PosSelect size="md" value={r.product_id} onChange={v=>updRow(r.key, { product_id:v })}>
                              <option value="">Pilih produk</option>
                              {products.map(p=> <option key={p.id} value={p.id}>{p.name}{p.sku?(' • '+p.sku):''}</option>)}
                            </PosSelect>
                          </td>
                          <td className={posTd+' text-center tabular-nums text-[#45464d]'}>
                            {r.product_id ? nf(pv.before) : '-'}
                          </td>
                          <td className={posTd}>
                            <input type="number" value={r.qty} onChange={e=>updRow(r.key, { qty:e.target.value })}
                              placeholder="0" className={posInput+' w-[110px] ml-auto text-right tabular-nums'}/>
                          </td>
                          {mode!=='OUT' && (
                            <td className={posTd}>
                              <input type="number" value={r.unit_cost} onChange={e=>updRow(r.key, { unit_cost:e.target.value })}
                                placeholder="0" className={posInput+' w-[150px] ml-auto text-right tabular-nums'}/>
                            </td>
                          )}
                          <td className={posTd+' text-center'}>
                            {r.product_id && num(r.qty)>0
                              ? <PosBadge tone={kurang?'red':(pv.delta===0?'slate':'emerald')}>
                                  {nf(pv.before)} → {nf(pv.after)} {pv.delta!==0 && '('+(pv.delta>0?'+':'')+nf(pv.delta)+')'}
                                </PosBadge>
                              : <span className="text-xs text-[#76777d]">-</span>}
                          </td>
                          {mode==='IN' && (
                            <td className={posTd}>
                              <div className="flex items-center gap-1.5">
                                <input value={r.batch_no} onChange={e=>updRow(r.key, { batch_no:e.target.value })} placeholder="Batch" className={posInput+' w-[110px]'}/>
                                <input type="date" value={r.expired_date} onChange={e=>updRow(r.key, { expired_date:e.target.value })} className={posInput+' w-[140px]'}/>
                              </div>
                            </td>
                          )}
                          <td className={posTd+' text-right'}>
                            <button type="button" onClick={()=>delRow(r.key)} className="w-9 h-9 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 grid place-items-center ml-auto"><Trash2 size={14}/></button>
                          </td>
                        </tr>
                      );
                    })}
                    {!rows.length && (
                      <tr><td colSpan={mode==='IN'?7:5}>
                        <div className="py-8 text-center">
                          <div className="w-12 h-12 rounded-xl bg-[#e5eeff] text-[#45464d] grid place-items-center mx-auto"><Boxes size={20}/></div>
                          <div className="mt-3 text-sm font-bold text-[#0b1c30]">Belum ada produk di daftar</div>
                          <div className="text-xs text-[#76777d] mt-1">Klik "Baris" untuk mulai menambah produk.</div>
                          <button type="button" onClick={()=>addRow('')} className={posBtnPrimary+' h-9 px-4 text-xs mt-3'}><Plus size={14}/> Tambah Baris</button>
                        </div>
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {!!rows.length && (
                <div className="px-3 py-2 bg-[#0051d5]/5 border-t border-[#0051d5]/20 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-bold tracking-wider text-[#0051d5]">
                    {rows.length} BARIS • TOTAL {nf(totalQty)} UNIT
                  </span>
                  {mode!=='OUT' && <span className="font-bold text-[#0b1c30]">Nilai: {rupiah(totalNilai)}</span>}
                </div>
              )}
            </div>

            <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-wider text-[#45464d]">CATATAN</span>
              <input value={head.note} onChange={e=>setHead({...head, note:e.target.value})}
                placeholder="mis. hasil hitung gudang 16 Okt, ditemani kepala gudang" className={posInput}/></label>
          </PosCardBody>

          <div className="p-3 border-t flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] text-[#45464d]">
              {mode==='IN' ? 'Stok bertambah + harga rata-rata ikut dihitung ulang bila harga satuan diisi.'
               : mode==='OUT' ? 'Stok berkurang, harga rata-rata tidak berubah.'
               : 'Stok disamakan dengan jumlah nyata yang Anda isi.'}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={()=>{ setRows([]); setFormErr(''); }} className={posBtnSecondary+' h-9 px-4 text-xs'}>Kosongkan</button>
              <button disabled={saving || !rows.length} className={posBtnPrimary+' h-9 px-4 text-xs disabled:opacity-50'}>
                {saving ? <RefreshCw size={14} className="animate-spin"/> : <PackagePlus size={14}/>} Simpan &amp; Perbarui Stok
              </button>
            </div>
          </div>
        </form>
      </PosCard>

      {/* riwayat */}
      <PosCard>
        <PosCardBody className="space-y-3">
          <PosToolbar actions={<>
            <button onClick={loadHistory} className={posBtnSecondary+' h-9 px-4 text-xs'}>
              <RefreshCw size={13} className={loadingHist?'animate-spin':''}/> Muat Ulang
            </button>
            <PosExportButtons onExport={downloadExport} busyKey={expBusy} prefix="Riwayat"/>
          </>}>
            <div className={posSearchWrap}>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#76777d]"/>
              <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&setAppliedQ(q)}
                placeholder="Cari no dokumen / catatan lalu Enter..." className={posInput+' pl-9'}/>
            </div>
          </PosToolbar>

          <PosChipRow label="JENIS">
            {['Semua','IN','OUT','SET'].map(t=>(
              <PosChip key={t} active={typeFilter===t} onClick={()=>setTypeFilter(t)}>
                {t==='Semua'?'Semua':TYPE_LABEL[t]}
              </PosChip>
            ))}
            <span className="ml-auto text-[11px] text-[#45464d]">{histTotal} dokumen</span>
          </PosChipRow>
        </PosCardBody>

        {loadingHist ? <PosSkeleton rows={5} cols={6}/> : histErr ? <PosError message={histErr} onRetry={loadHistory}/> : (
          <>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-[#e5eeff] border-y border-[#e7ecf7] text-[11px] font-bold tracking-wider text-[#45464d]">
                  <PosTh>NO DOKUMEN</PosTh><PosTh>TANGGAL</PosTh><PosTh align="center">JENIS</PosTh>
                  <PosTh>ALASAN</PosTh><PosTh>GUDANG</PosTh><PosTh align="right">ITEM</PosTh>
                  <PosTh align="right">QTY</PosTh><PosTh align="right">NILAI</PosTh><PosTh align="right">AKSI</PosTh>
                </tr></thead>
                <tbody>
                  {history.map(a=>(
                    <tr key={a.id} className={posTr}>
                      <td className={posTd+' font-mono text-xs font-bold'}>{a.adjustment_number}</td>
                      <td className={posTd+' text-xs whitespace-nowrap'}>{String(a.adjustment_date||'').slice(0,10)}</td>
                      <td className={posTd+' text-center'}><PosBadge tone={TYPE_TONE[a.type]||'slate'}>{TYPE_LABEL[a.type]||a.type}</PosBadge></td>
                      <td className={posTd+' text-xs'}>{REASON_LABEL[a.reason]||a.reason}</td>
                      <td className={posTd+' text-xs'}>{a.warehouse_code||'-'}</td>
                      <td className={posTd+' text-right tabular-nums'}>{a.item_count||0}</td>
                      <td className={posTd+' text-right font-bold tabular-nums'}>{nf(a.total_qty)}</td>
                      <td className={posTd+' text-right tabular-nums'}>{rupiah(a.total_value)}</td>
                      <td className={posTd}>
                        <div className="flex justify-end">
                          <button onClick={()=>openDetail(a)} className={posBtnSm}><Eye size={13}/> Detail</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!history.length && <PosEmpty colSpan={9} text="Belum ada penambahan/pengurangan stok manual"/>}
                </tbody>
              </table>
            </div>
            {histTotal>0 && <PosCardBody><PosPager page={page} setPage={setPage} total={histTotal} size={PAGE_SIZE} unit="dokumen"/></PosCardBody>}
          </>
        )}
      </PosCard>

      {/* detail modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[92vh] flex flex-col border shadow-raised overflow-hidden animate-pop">
            <div className="p-4 border-b flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-[16px] text-[#0b1c30]">{detail.adjustment_number||('Dokumen #'+detail.id)}</h3>
                <div className="text-xs text-[#45464d] mt-1 flex items-center gap-2 flex-wrap">
                  <PosBadge tone={TYPE_TONE[detail.type]||'slate'}>{TYPE_LABEL[detail.type]||detail.type}</PosBadge>
                  <span>{REASON_LABEL[detail.reason]||detail.reason}</span>
                  <span>•</span><span>{detail.warehouse_code||'-'} {detail.warehouse_name||''}</span>
                  <span>•</span><span>{String(detail.adjustment_date||'').slice(0,10)}</span>
                </div>
              </div>
              <button onClick={()=>setDetail(null)} className="w-9 h-9 rounded-xl border border-[#e7ecf7] grid place-items-center text-[#45464d] hover:bg-[#eff4ff]"><X size={16}/></button>
            </div>
            <div className="p-4 overflow-auto">
              {detailBusy ? <PosSkeleton rows={4} cols={4}/> : (
                <div className="overflow-auto rounded-xl border border-[#e7ecf7]">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#e5eeff] border-b border-[#e7ecf7] text-[11px] font-bold tracking-wider text-[#45464d]">
                      <PosTh>PRODUK</PosTh><PosTh align="center">SEBELUM</PosTh><PosTh align="center">DIMASUKKAN</PosTh>
                      <PosTh align="center">SESUDAH</PosTh><PosTh align="right">HARGA</PosTh><PosTh align="right">NILAI</PosTh>
                    </tr></thead>
                    <tbody>
                      {(detail.items||[]).map(i=>(
                        <tr key={i.id} className={posTr}>
                          <td className={posTd}>
                            <div className="font-bold text-[#0b1c30]">{i.product_name||('Produk #'+i.product_id)}</div>
                            <div className="text-xs text-[#76777d] font-mono">{i.sku||'-'}{i.batch_no?(' • batch '+i.batch_no):''}</div>
                          </td>
                          <td className={posTd+' text-center tabular-nums'}>{nf(i.qty_before)}</td>
                          <td className={posTd+' text-center font-bold tabular-nums'}>{nf(i.qty)}</td>
                          <td className={posTd+' text-center tabular-nums'}>{nf(i.qty_after)}</td>
                          <td className={posTd+' text-right tabular-nums'}>{rupiah(i.unit_cost)}</td>
                          <td className={posTd+' text-right font-bold tabular-nums'}>{rupiah(num(i.qty)*num(i.unit_cost))}</td>
                        </tr>
                      ))}
                      {!(detail.items||[]).length && <PosEmpty colSpan={6} text="Tidak ada item"/>}
                    </tbody>
                  </table>
                </div>
              )}
              {detail.note && <div className="mt-3 text-xs text-[#45464d] bg-[#eff4ff] border border-[#e7ecf7] rounded-xl p-3">Catatan: {detail.note}</div>}
              {detail.reference_no && <div className="mt-2 text-xs text-[#45464d]">Referensi: <span className="font-mono">{detail.reference_no}</span></div>}
            </div>
            <div className="p-3 border-t flex justify-end">
              <button onClick={()=>setDetail(null)} className={posBtnSecondary+' h-9 px-4 text-xs'}>Tutup</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
