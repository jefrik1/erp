import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShieldAlert, Search, RefreshCw, Eye, X, AlertTriangle, History, Scale, Gauge,
  UserCheck, Clock, Percent, Banknote, PackageX, FileWarning, CheckCircle2, Database,
} from 'lucide-react';
import api from '../lib/api';
import { useDialog } from '../components/DialogProvider';
import {
  PosPageHeader, PosCard, PosCardBody, PosChip, PosSelect, PosTh, PosPager, PosBadge,
  PosEmpty, PosSkeleton, PosError, PosStat, PosToolbar, PosChipRow, PosExportButtons,
  posInput, posBtnPrimary, posBtnSecondary, posBtnSm, posTr, posTd, posSearchWrap, posSelectWrap,
} from '../components/PosUI';

const PAGE_SIZE = 15;
const nf = (n)=> new Intl.NumberFormat('id-ID').format(Number(n)||0);
const rupiah = (n)=> 'Rp ' + nf(Math.round(Number(n)||0));
const num = (v)=> parseFloat(v) || 0;
const stamp = (t)=> t ? String(t).slice(0,19).replace('T',' ') : '-';

const ACTION_LABEL = {
  CREATE:'Buat data', UPDATE:'Ubah data', DELETE:'Hapus data', APPROVE:'Setujui', REJECT:'Tolak',
  LOGIN:'Login', LOGOUT:'Logout', MIGRATE:'Migrasi sistem', MERGE:'Gabung data',
};
const ENTITY_LABEL = {
  SO:'Sales Order', PO:'Purchase Order', GRN:'Goods Receipt', INVOICE:'Invoice', PRODUCT:'Produk',
  CUSTOMER:'Pelanggan', SUPPLIER:'Supplier', STOCK_ADJUST:'Penyesuaian Stok', STOCK_IN:'Penambahan Stok',
  STOCK_OUT:'Pengurangan Stok', STOCK_SET:'Opname Stok', STOCK_DUPLICATE:'Perawatan Stok',
  MIGRATION:'Migrasi', SALES_RETURN:'Retur Penjualan', USER:'Pengguna', PRICE:'Harga',
};
const ACTION_TONE = { CREATE:'emerald', UPDATE:'sky', DELETE:'red', APPROVE:'emerald', REJECT:'red', LOGIN:'slate', MIGRATE:'amber', MERGE:'amber' };

export default function Audit(){
  const dialog = useDialog();
  const [tab, setTab] = useState('logs');            // logs | changes | fraud | segregation
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [page, setPage] = useState(1);
  const [expBusy, setExpBusy] = useState('');
  const [detail, setDetail] = useState(null);

  const [logs, setLogs] = useState([]);
  const [logTotal, setLogTotal] = useState(0);
  const [summary, setSummary] = useState(null);
  const [entityFilter, setEntityFilter] = useState('Semua');
  const [actionFilter, setActionFilter] = useState('Semua');
  const [userFilter, setUserFilter] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  const [changes, setChanges] = useState([]);
  const [changeTotal, setChangeTotal] = useState(0);
  const [changeTables, setChangeTables] = useState([]);
  const [tableFilter, setTableFilter] = useState('Semua');

  const [fraud, setFraud] = useState(null);
  const [thresholds, setThresholds] = useState({ diskon:20, qty:1000, jam:5, nilai:50000000 });

  const [seg, setSeg] = useState(null);

  /* ------------------------------------------------------------------ load */
  const loadLogs = useCallback(async ()=>{
    const params = { limit:PAGE_SIZE, offset:(page-1)*PAGE_SIZE };
    if (appliedQ) params.q = appliedQ;
    if (entityFilter!=='Semua') params.entity_type = entityFilter;
    if (actionFilter!=='Semua') params.action = actionFilter;
    if (userFilter) params.user = userFilter;
    if (start) params.start = start;
    if (end) params.end = end;
    const r = await api.get('/audit/logs', { params });
    setLogs(Array.isArray(r.data?.data)? r.data.data : (Array.isArray(r.data)? r.data : []));
    setLogTotal(Number(r.data?.total)||0);
  },[appliedQ,entityFilter,actionFilter,userFilter,start,end,page]);

  const loadChanges = useCallback(async ()=>{
    const params = { limit:PAGE_SIZE, offset:(page-1)*PAGE_SIZE };
    if (appliedQ) params.q = appliedQ;
    if (tableFilter!=='Semua') params.table_name = tableFilter;
    if (start) params.start = start;
    if (end) params.end = end;
    const r = await api.get('/audit/data-changes', { params });
    setChanges(Array.isArray(r.data?.data)? r.data.data : []);
    setChangeTotal(Number(r.data?.total)||0);
    setChangeTables(Array.isArray(r.data?.tables)? r.data.tables : []);
  },[appliedQ,tableFilter,start,end,page]);

  const loadFraud = useCallback(async ()=>{
    const r = await api.get('/audit/fraud', { params:{ diskon:thresholds.diskon/100, qty:thresholds.qty, jam:thresholds.jam, nilai:thresholds.nilai } });
    setFraud(r.data||null);
  },[thresholds]);

  const loadSeg = useCallback(async ()=>{
    const r = await api.get('/audit/segregation');
    setSeg(r.data||null);
  },[]);

  const load = useCallback(async ()=>{
    setLoading(true); setErr('');
    try{
      if (tab==='logs') await loadLogs();
      else if (tab==='changes') await loadChanges();
      else if (tab==='fraud') await loadFraud();
      else await loadSeg();
    }catch(e){ setErr(e.response?.data?.error || e.message || 'Gagal memuat data audit'); }
    finally{ setLoading(false); }
  },[tab,loadLogs,loadChanges,loadFraud,loadSeg]);

  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{ setPage(1); },[appliedQ,tab,entityFilter,actionFilter,userFilter,start,end,tableFilter]);

  useEffect(()=>{
    const params = {};
    if (start) params.start = start;
    if (end) params.end = end;
    api.get('/audit/logs/summary', { params }).then(r=>setSummary(r.data||null)).catch(()=>setSummary(null));
  },[start,end]);

  /* --------------------------------------------------------------- actions */
  const downloadExport = async (format)=>{
    setExpBusy(format);
    try{
      const params = { dataset: tab==='changes'?'changes':tab==='fraud'?'fraud':tab==='segregation'?'segregation':'logs', format };
      if (tab==='logs'){
        if (appliedQ) params.q = appliedQ;
        if (entityFilter!=='Semua') params.entity_type = entityFilter;
        if (actionFilter!=='Semua') params.action = actionFilter;
        if (userFilter) params.user = userFilter;
      }
      if (tab==='changes' && tableFilter!=='Semua') params.table_name = tableFilter;
      if (start) params.start = start;
      if (end) params.end = end;
      const r = await api.get('/audit/export', { params, responseType:'blob' });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url; a.download = params.dataset + '.audit.' + format;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }catch(e){ await dialog.alert(e.response?.data?.error || e.message || 'Gagal mengunduh laporan', { title:'Gagal export' }); }
    finally{ setExpBusy(''); }
  };

  const totalPages = Math.max(1, Math.ceil((tab==='logs'?logTotal:changeTotal)/PAGE_SIZE));
  const safePage = Math.min(Math.max(1,page), totalPages);
  const alerts = tab==='fraud' ? (fraud?.alerts||0) : tab==='segregation' ? (seg?.alerts||0) : 0;

  const FraudSection = ({ icon:Icon, title, hint, rows, columns, render, tone='amber' }) => (
    <div className="rounded-xl border border-line overflow-hidden">
      <div className="bg-surface-2 px-3 py-2 border-b border-line flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={'w-7 h-7 rounded-lg grid place-items-center '+(tone==='red'?'bg-red-50 text-red-700':'bg-amber-50 text-amber-700')}><Icon size={14}/></span>
          <div>
            <div className="text-sm font-bold text-ink">{title}</div>
            <div className="text-[11px] text-ink-2">{hint}</div>
          </div>
        </div>
        <PosBadge tone={rows?.length? (tone==='red'?'red':'amber') : 'emerald'}>{rows?.length||0} temuan</PosBadge>
      </div>
      {rows?.length ? (
        <div className="overflow-auto max-h-[260px]">
          <table className="w-full text-sm">
            <thead><tr className="bg-white border-b border-line text-[11px] font-bold tracking-wider text-ink-2">
              {columns.map((c,i)=> <PosTh key={i} align={c.align||'left'}>{c.label}</PosTh>)}
            </tr></thead>
            <tbody>
              {rows.map((r,i)=> <tr key={i} className={posTr}>{render(r)}</tr>)}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-3 py-4 text-center text-xs text-emerald-700 bg-emerald-50/40 flex items-center justify-center gap-2">
          <CheckCircle2 size={14}/> Tidak ada temuan pada pola ini
        </div>
      )}
    </div>
  );

  /* ---------------------------------------------------------------- render */
  return (
    <div className="space-y-3">
      <PosPageHeader icon={ShieldAlert} title="Audit & GRC"
        subtitle="Jejak semua perubahan data, riwayat ubah nilai, deteksi transaksi tidak wajar, dan pelanggaran segregasi tugas"
        badge={summary ? summary.total+' aktivitas tercatat' : null}
        actions={<PosExportButtons onExport={downloadExport} busyKey={expBusy} prefix={tab==='fraud'?'Temuan':tab==='segregation'?'Segregasi':'Audit'}/>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PosStat icon={History} tone="bg-brand/10 text-brand" label="TOTAL AKTIVITAS" value={summary? nf(summary.total):'-'} sub={start||end? 'periode terpilih' : 'semua waktu'}/>
        <PosStat icon={Clock} tone="bg-emerald-50 text-emerald-700" label="AKTIVITAS HARI INI" value={summary? nf(summary.today):'-'} sub="sejak 00:00"/>
        <PosStat icon={UserCheck} tone="bg-sky-50 text-sky-700" label="PENGGUNA TERLIBAT" value={summary? nf(summary.users):'-'} sub={(summary?.by_user||[])[0]? 'terbanyak: '+summary.by_user[0].username : ''}/>
        <PosStat icon={AlertTriangle} tone={alerts? 'bg-red-50 text-red-700':'bg-emerald-50 text-emerald-700'} label="TEMUAN (TAB INI)" value={nf(alerts)} sub={tab==='fraud'? 'pola transaksi tidak wajar' : tab==='segregation'? 'pelanggaran pemisahan tugas' : 'lihat tab Deteksi & Segregasi'}/>
      </div>

      <PosCard>
        <PosCardBody className="space-y-3">
          <PosToolbar actions={<>
            <button onClick={load} className={posBtnSecondary+' h-9 px-4 text-xs'}>
              <RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang
            </button>
            {tab==='fraud' && <button onClick={loadFraud} className={posBtnPrimary+' h-9 px-4 text-xs'}><Gauge size={14}/> Jalankan Ulang</button>}
          </>}>
            {(tab==='logs' || tab==='changes') && (
              <div className={posSearchWrap}>
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"/>
                <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&setAppliedQ(q)}
                  placeholder={tab==='logs'? 'Cari pengguna / jenis data / nilai lalu Enter...' : 'Cari tabel / kolom / nilai lalu Enter...'}
                  className={posInput+' pl-9'}/>
              </div>
            )}
            {tab==='logs' && (
              <>
                <div className={posSelectWrap}>
                  <PosSelect value={entityFilter} onChange={setEntityFilter}>
                    <option value="Semua">Semua Jenis Data</option>
                    {Object.entries(ENTITY_LABEL).map(([k,v])=> <option key={k} value={k}>{v}</option>)}
                  </PosSelect>
                </div>
                <div className={posSelectWrap}>
                  <PosSelect value={userFilter} onChange={setUserFilter}>
                    <option value="">Semua Pengguna</option>
                    {(summary?.by_user||[]).filter(u=> u.username && u.username!=='(sistem)').map(u=> <option key={u.username} value={u.username}>{u.username} ({u.n})</option>)}
                  </PosSelect>
                </div>
              </>
            )}
            {tab==='changes' && (
              <div className={posSelectWrap}>
                <PosSelect value={tableFilter} onChange={setTableFilter}>
                  <option value="Semua">Semua Tabel</option>
                  {changeTables.map(t=> <option key={t} value={t}>{t}</option>)}
                </PosSelect>
              </div>
            )}
            {(tab==='logs' || tab==='changes') && (
              <>
                <input type="date" value={start} onChange={e=>setStart(e.target.value)} className={posInput+' sm:w-[150px]'}/>
                <span className="text-[11px] text-ink-3 self-center">s/d</span>
                <input type="date" value={end} onChange={e=>setEnd(e.target.value)} className={posInput+' sm:w-[150px]'}/>
              </>
            )}
          </PosToolbar>

          <PosChipRow label="LIHAT">
            <PosChip active={tab==='logs'} onClick={()=>setTab('logs')}>Jejak Audit</PosChip>
            <PosChip active={tab==='changes'} onClick={()=>setTab('changes')}>Perubahan Data</PosChip>
            <PosChip active={tab==='fraud'} onClick={()=>setTab('fraud')}>Deteksi Tidak Wajar</PosChip>
            <PosChip active={tab==='segregation'} onClick={()=>setTab('segregation')}>Segregasi Tugas</PosChip>
            {tab==='logs' && <>
              <span className="text-[11px] font-bold tracking-wider text-ink-2 ml-3">AKSI</span>
              {['Semua','CREATE','UPDATE','DELETE','APPROVE','MIGRATE'].map(a=>(
                <PosChip key={a} active={actionFilter===a} onClick={()=>setActionFilter(a)}>{a==='Semua'?'Semua':(ACTION_LABEL[a]||a)}</PosChip>
              ))}
            </>}
          </PosChipRow>
        </PosCardBody>

        {loading ? <PosSkeleton rows={6} cols={6}/> : err ? <PosError message={err} onRetry={load}/> : (<>
          {/* ------------------------------------------------- jejak audit */}
          {tab==='logs' && (<>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-surface-3 border-y border-line text-[11px] font-bold tracking-wider text-ink-2">
                  <PosTh>WAKTU</PosTh><PosTh>PENGGUNA</PosTh><PosTh align="center">AKSI</PosTh>
                  <PosTh>JENIS DATA</PosTh><PosTh align="center">ID</PosTh><PosTh>RINGKASAN NILAI</PosTh>
                  <PosTh align="right">AKSI</PosTh>
                </tr></thead>
                <tbody>
                  {logs.map(l=>(
                    <tr key={l.id} className={posTr}>
                      <td className={posTd+' text-xs whitespace-nowrap font-mono'}>{stamp(l.created_at)}</td>
                      <td className={posTd+' font-bold text-ink'}>{l.username||'(sistem)'}</td>
                      <td className={posTd+' text-center'}><PosBadge tone={ACTION_TONE[l.action]||'slate'}>{ACTION_LABEL[l.action]||l.action}</PosBadge></td>
                      <td className={posTd+' text-xs'}>{ENTITY_LABEL[l.entity_type]||l.entity_type}</td>
                      <td className={posTd+' text-center text-xs tabular-nums'}>{l.entity_id}</td>
                      <td className={posTd+' text-xs text-ink-2 font-mono max-w-[280px] truncate'}>
                        {l.new_value? JSON.stringify(l.new_value).slice(0,70) : '-'}
                      </td>
                      <td className={posTd}>
                        <div className="flex justify-end">
                          <button onClick={()=>setDetail(l)} className={posBtnSm}><Eye size={13}/> Detail</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!logs.length && <PosEmpty colSpan={7} text="Belum ada aktivitas pada filter ini"/>}
                </tbody>
              </table>
            </div>
            {logTotal>0 && <PosCardBody><PosPager page={safePage} setPage={setPage} total={logTotal} size={PAGE_SIZE} unit="aktivitas"/></PosCardBody>}
          </>)}

          {/* ---------------------------------------------- perubahan data */}
          {tab==='changes' && (<>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-surface-3 border-y border-line text-[11px] font-bold tracking-wider text-ink-2">
                  <PosTh>WAKTU</PosTh><PosTh>TABEL / RECORD</PosTh><PosTh>KOLOM</PosTh>
                  <PosTh>NILAI LAMA</PosTh><PosTh>NILAI BARU</PosTh><PosTh>OLEH</PosTh><PosTh>ALASAN</PosTh>
                </tr></thead>
                <tbody>
                  {changes.map(c=>(
                    <tr key={c.id} className={posTr}>
                      <td className={posTd+' text-xs whitespace-nowrap font-mono'}>{stamp(c.changed_at)}</td>
                      <td className={posTd+' text-xs'}>{c.table_name} <span className="text-ink-3">#{c.record_id}</span></td>
                      <td className={posTd+' text-xs font-mono'}>{c.field_name}</td>
                      <td className={posTd+' text-xs text-red-600 line-through'}>{c.old_value||'-'}</td>
                      <td className={posTd+' text-xs text-emerald-700 font-bold'}>{c.new_value||'-'}</td>
                      <td className={posTd+' text-xs'}>{c.changed_by_name||'-'}</td>
                      <td className={posTd+' text-xs text-ink-2'}>{c.reason||'-'}</td>
                    </tr>
                  ))}
                  {!changes.length && <PosEmpty colSpan={7} text="Belum ada perubahan nilai tercatat"/>}
                </tbody>
              </table>
            </div>
            {changeTotal>0 && <PosCardBody><PosPager page={safePage} setPage={setPage} total={changeTotal} size={PAGE_SIZE} unit="perubahan"/></PosCardBody>}
          </>)}

          {/* --------------------------------------------------- fraud */}
          {tab==='fraud' && fraud && (
            <PosCardBody className="space-y-3">
              <div className="rounded-xl border border-line bg-surface-2 p-3">
                <div className="text-[11px] font-bold tracking-wider text-ink-2 mb-2">AMBANG BATAS PEMERIKSAAN</div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-ink-3">DISKON LEBIH DARI (%)</span>
                    <input type="number" value={thresholds.diskon} onChange={e=>setThresholds({...thresholds, diskon:e.target.value})} className={posInput+' text-right tabular-nums'}/></label>
                  <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-ink-3">QTY BESAR LEBIH DARI</span>
                    <input type="number" value={thresholds.qty} onChange={e=>setThresholds({...thresholds, qty:e.target.value})} className={posInput+' text-right tabular-nums'}/></label>
                  <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-ink-3">TRANSAKSI MALAM SEBELUM JAM</span>
                    <input type="number" value={thresholds.jam} onChange={e=>setThresholds({...thresholds, jam:e.target.value})} className={posInput+' text-right tabular-nums'}/></label>
                  <label className="space-y-1"><span className="text-[11px] font-bold tracking-wider text-ink-3">NILAI ORDER BESAR Rp</span>
                    <input type="number" value={thresholds.nilai} onChange={e=>setThresholds({...thresholds, nilai:e.target.value})} className={posInput+' text-right tabular-nums'}/></label>
                </div>
                <div className="text-[11px] text-ink-2 mt-2">Ubah angkanya lalu tekan <b>Jalankan Ulang</b> untuk menyesuaikan kebijakan pemeriksaan toko.</div>
              </div>

              <FraudSection icon={Percent} title="Diskon tidak wajar" tone="red"
                hint={'Diskon lebih dari '+thresholds.diskon+'% dari nilai order'} rows={fraud.big_discount}
                columns={[{label:'Dokumen'},{label:'Nilai',align:'right'},{label:'Diskon',align:'right'},{label:'%',align:'right'},{label:'Oleh'},{label:'Waktu'}]}
                render={r=>(<>
                  <td className={posTd+' font-mono text-xs'}>{r.so_number}</td>
                  <td className={posTd+' text-right tabular-nums'}>{rupiah(r.total)}</td>
                  <td className={posTd+' text-right tabular-nums text-red-600'}>{rupiah(r.discount)}</td>
                  <td className={posTd+' text-right font-bold tabular-nums'}>{num(r.persen).toFixed(1)}%</td>
                  <td className={posTd+' text-xs'}>{r.username||'-'}</td>
                  <td className={posTd+' text-xs'}>{stamp(r.created_at)}</td>
                </>)}/>

              <FraudSection icon={Clock} title="Transaksi jam tidak wajar"
                hint={'Dibuat sebelum jam '+thresholds.jam+':00'} rows={fraud.night_transactions}
                columns={[{label:'Dokumen'},{label:'Nilai',align:'right'},{label:'Oleh'},{label:'Waktu'}]}
                render={r=>(<>
                  <td className={posTd+' font-mono text-xs'}>{r.so_number}</td>
                  <td className={posTd+' text-right tabular-nums'}>{rupiah(r.total)}</td>
                  <td className={posTd+' text-xs'}>{r.username||'-'}</td>
                  <td className={posTd+' text-xs'}>{stamp(r.created_at)}</td>
                </>)}/>

              <FraudSection icon={PackageX} title="Jumlah item tidak wajar"
                hint={'Qty satu baris lebih dari '+nf(thresholds.qty)} rows={fraud.big_qty}
                columns={[{label:'Dokumen'},{label:'Produk'},{label:'Qty',align:'right'},{label:'Oleh'}]}
                render={r=>(<>
                  <td className={posTd+' font-mono text-xs'}>{r.so_number}</td>
                  <td className={posTd}>{r.product_name}</td>
                  <td className={posTd+' text-right font-bold tabular-nums'}>{nf(r.qty)}</td>
                  <td className={posTd+' text-xs'}>{r.username||'-'}</td>
                </>)}/>

              <FraudSection icon={Banknote} title="Order bernilai besar"
                hint={'Nilai order di atas '+rupiah(thresholds.nilai)} rows={fraud.big_order}
                columns={[{label:'Dokumen'},{label:'Nilai',align:'right'},{label:'Oleh'},{label:'Waktu'}]}
                render={r=>(<>
                  <td className={posTd+' font-mono text-xs'}>{r.so_number}</td>
                  <td className={posTd+' text-right font-bold tabular-nums'}>{rupiah(r.total)}</td>
                  <td className={posTd+' text-xs'}>{r.username||'-'}</td>
                  <td className={posTd+' text-xs'}>{stamp(r.created_at)}</td>
                </>)}/>

              <FraudSection icon={FileWarning} title="Harga di bawah floor price" tone="red"
                hint="Harga jual di bawah batas bawah yang ditetapkan Pricing Engine" rows={fraud.below_floor}
                columns={[{label:'Dokumen'},{label:'Produk'},{label:'Harga',align:'right'},{label:'Floor',align:'right'},{label:'Oleh'}]}
                render={r=>(<>
                  <td className={posTd+' font-mono text-xs'}>{r.so_number}</td>
                  <td className={posTd}>{r.product_name}</td>
                  <td className={posTd+' text-right tabular-nums text-red-600'}>{rupiah(r.unit_price)}</td>
                  <td className={posTd+' text-right tabular-nums'}>{rupiah(r.floor_price)}</td>
                  <td className={posTd+' text-xs'}>{r.username||'-'}</td>
                </>)}/>

              <FraudSection icon={Database} title="Penyesuaian stok besar"
                hint="Opname / koreksi stok bernilai > Rp 5 juta atau qty > 1.000" rows={fraud.big_adjustment}
                columns={[{label:'Dokumen'},{label:'Jenis'},{label:'Alasan'},{label:'Nilai',align:'right'},{label:'Gudang'},{label:'Tanggal'}]}
                render={r=>(<>
                  <td className={posTd+' font-mono text-xs'}>{r.adjustment_number}</td>
                  <td className={posTd+' text-xs'}>{r.type}</td>
                  <td className={posTd+' text-xs'}>{r.reason}</td>
                  <td className={posTd+' text-right font-bold tabular-nums'}>{rupiah(r.total_value)}</td>
                  <td className={posTd+' text-xs'}>{r.warehouse_code||'-'}</td>
                  <td className={posTd+' text-xs'}>{String(r.adjustment_date||'').slice(0,10)}</td>
                </>)}/>

              <FraudSection icon={UserCheck} title="Dibuat & disetujui orang yang sama" tone="red"
                hint="Satu dokumen sebaiknya dibuat dan disetujui orang berbeda" rows={fraud.self_approve}
                columns={[{label:'Jenis'},{label:'Dokumen'},{label:'Pembuat'},{label:'Penyetuju'}]}
                render={r=>(<>
                  <td className={posTd+' text-xs'}>{r.type}</td>
                  <td className={posTd+' font-mono text-xs'}>{r.doc}</td>
                  <td className={posTd+' text-xs'}>user #{r.created_by}</td>
                  <td className={posTd+' text-xs text-red-600'}>user #{r.approved_by}</td>
                </>)}/>
            </PosCardBody>
          )}

          {/* ---------------------------------------------- segregasi tugas */}
          {tab==='segregation' && seg && (
            <PosCardBody className="space-y-3">
              <div className="rounded-xl border border-line bg-surface-2 p-3 text-xs text-ink-2 flex items-start gap-2">
                <Scale size={14} className="text-brand shrink-0 mt-0.5"/>
                <div><b className="text-ink">Kenapa ini penting?</b> Pemisahan tugas (segregation of duties) mencegah satu orang
                membuat sekaligus menyetujui dokumen, atau membuat barang masuk tanpa dasar pembelian - celah klasik penggelapan.</div>
              </div>

              <FraudSection icon={UserCheck} title="Dokumen dibuat & disetujui orang yang sama" tone="red"
                hint="Sales Order dan Purchase Order dengan pembuat = penyetuju" rows={seg.self_approve}
                columns={[{label:'Jenis'},{label:'Dokumen'},{label:'Nilai',align:'right'},{label:'Orang'},{label:'Tanggal'}]}
                render={r=>(<>
                  <td className={posTd+' text-xs'}>{r.jenis}</td>
                  <td className={posTd+' font-mono text-xs'}>{r.dokumen}</td>
                  <td className={posTd+' text-right tabular-nums'}>{rupiah(r.nilai)}</td>
                  <td className={posTd+' text-xs'}>{r.orang||'-'}</td>
                  <td className={posTd+' text-xs'}>{stamp(r.tanggal)}</td>
                </>)}/>

              <FraudSection icon={PackageX} title="Barang masuk tanpa Purchase Order" tone="red"
                hint="Goods Receipt tanpa PO - barang datang tanpa dasar pembelian" rows={seg.grn_tanpa_po}
                columns={[{label:'No GRN'},{label:'Tanggal'},{label:'PO'}]}
                render={r=>(<>
                  <td className={posTd+' font-mono text-xs'}>{r.grn_number}</td>
                  <td className={posTd+' text-xs'}>{String(r.receipt_date||'').slice(0,10)}</td>
                  <td className={posTd+' text-xs'}>{r.po_number}</td>
                </>)}/>

              <FraudSection icon={Clock} title="PO lama belum diterima"
                hint="PO berstatus APPROVED/PARTIAL lebih dari 30 hari tanpa penerimaan" rows={seg.po_tanpa_penerimaan}
                columns={[{label:'No PO'},{label:'Supplier'},{label:'Nilai',align:'right'},{label:'Status'},{label:'Umur',align:'right'}]}
                render={r=>(<>
                  <td className={posTd+' font-mono text-xs'}>{r.po_number}</td>
                  <td className={posTd+' text-xs'}>{r.supplier_name||'-'}</td>
                  <td className={posTd+' text-right tabular-nums'}>{rupiah(r.total)}</td>
                  <td className={posTd+' text-center'}><PosBadge tone="amber">{r.status}</PosBadge></td>
                  <td className={posTd+' text-right tabular-nums'}>{r.umur_hari} hari</td>
                </>)}/>
            </PosCardBody>
          )}
        </>)}
      </PosCard>

      {/* detail modal jejak audit */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col border shadow-raised overflow-hidden animate-pop">
            <div className="p-4 border-b flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-[16px] text-ink">Detail Aktivitas</h3>
                <div className="text-xs text-ink-2 mt-1 flex items-center gap-2 flex-wrap">
                  <span className="font-mono">{stamp(detail.created_at)}</span><span>•</span>
                  <span>{detail.username||'(sistem)'}</span><span>•</span>
                  <PosBadge tone={ACTION_TONE[detail.action]||'slate'}>{ACTION_LABEL[detail.action]||detail.action}</PosBadge>
                  <span>{ENTITY_LABEL[detail.entity_type]||detail.entity_type} #{detail.entity_id}</span>
                </div>
              </div>
              <button onClick={()=>setDetail(null)} className="w-9 h-9 rounded-xl border border-line grid place-items-center text-ink-2 hover:bg-surface-2"><X size={16}/></button>
            </div>
            <div className="p-4 space-y-3 overflow-auto text-xs">
              {detail.ip_address && <div className="text-ink-2">IP: <span className="font-mono">{detail.ip_address}</span></div>}
              <div>
                <div className="text-[11px] font-bold tracking-wider text-ink-2 mb-1">NILAI SEBELUM</div>
                <pre className="bg-surface-2 border border-line rounded-xl p-3 overflow-auto text-[11px] text-red-700">
{detail.old_value? JSON.stringify(detail.old_value, null, 2) : '(tidak ada / data baru)'}
                </pre>
              </div>
              <div>
                <div className="text-[11px] font-bold tracking-wider text-ink-2 mb-1">NILAI SESUDAH</div>
                <pre className="bg-surface-2 border border-line rounded-xl p-3 overflow-auto text-[11px] text-emerald-700">
{detail.new_value? JSON.stringify(detail.new_value, null, 2) : '(kosong)'}
                </pre>
              </div>
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
