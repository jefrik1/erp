import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileText, Search, RefreshCw, Ship, Info, Eye, Calculator,
  BookCheck, Trash2, Plus, X, Percent, Receipt,
} from 'lucide-react';
import api from '../lib/api';
import { useDialog } from '../components/DialogProvider';
import {
  PosPageHeader, PosCard, PosCardBody, PosChip, PosSelect, PosTh, PosPager, PosBadge,
  PosEmpty, PosSkeleton, PosError, PosStat, PosToolbar, PosChipRow, PosExportButtons,
  posInput, posBtnPrimary, posBtnSecondary, posBtnSm, posTr, posTd, posSearchWrap,
} from '../components/PosUI';

const PAGE_SIZE = 10;
const COST_TYPES = ['FREIGHT','INSURANCE','DUTY','TAX','CLEARANCE','TRUCKING','HANDLING','OTHER'];
const COST_LABEL = {
  FREIGHT:'Freight / Ongkos Angkut', INSURANCE:'Asuransi', DUTY:'Bea Masuk',
  TAX:'PPh 22 / Pajak', CLEARANCE:'Clearance / EMKL', TRUCKING:'Trucking Dalam Negeri',
  HANDLING:'Handling / Bongkar', OTHER:'Biaya Lain',
};
const METHOD_LABEL = { VALUE:'Nilai Barang', WEIGHT:'Berat / Qty', VOLUME:'Volume / Item' };
const STATUS_TONE = { DRAFT:'amber', CALCULATED:'sky', POSTED:'emerald' };

const rupiah = (n)=> 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(Number(n)||0));
const num = (v)=> parseFloat(v) || 0;
const fmtDate = (d)=> (d ? String(d).slice(0,10) : '-');

export default function LandedCosts(){
  const dialog = useDialog();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [status, setStatus] = useState('Semua');
  const [page, setPage] = useState(1);
  const [expBusy, setExpBusy] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [busy, setBusy] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [pos, setPos] = useState([]);
  const [grns, setGrns] = useState([]);
  const [form, setForm] = useState({
    po_id:'', grn_id:'', container_no:'', bl_number:'', pib_number:'',
    arrival_date:'', clearance_date:'', allocation_method:'VALUE', notes:'',
    details:[{ cost_type:'FREIGHT', description:'', amount:'', currency:'IDR', exchange_rate:1 }],
  });

  const load = useCallback(async ()=>{
    setLoading(true); setErr('');
    try{
      const r = await api.get('/landed-costs', { params:{ q:appliedQ, status } });
      setRows(Array.isArray(r.data) ? r.data : []);
    }catch(e){ setRows([]); setErr(e.response?.data?.error || e.message || 'Gagal memuat data'); }
    finally{ setLoading(false); }
  },[appliedQ,status]);

  const loadSummary = useCallback(async ()=>{
    try{ const r = await api.get('/landed-costs/summary'); setSummary(r.data||null); }catch(e){ setSummary(null); }
  },[]);

  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{ loadSummary(); },[loadSummary]);
  useEffect(()=>{ setPage(1); },[appliedQ,status]);

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total/PAGE_SIZE));
  const safePage = Math.min(Math.max(1,page), totalPages);
  const pageRows = rows.slice((safePage-1)*PAGE_SIZE, safePage*PAGE_SIZE);
  const grandTotal = useMemo(()=> rows.reduce((a,x)=> a + num(x.total_cost), 0), [rows]);

  /* ---------------------------------------------------------------- actions */
  const openCreate = async ()=>{
    setFormErr('');
    setForm({
      po_id:'', grn_id:'', container_no:'', bl_number:'', pib_number:'',
      arrival_date:'', clearance_date:'', allocation_method:'VALUE', notes:'',
      details:[{ cost_type:'FREIGHT', description:'', amount:'', currency:'IDR', exchange_rate:1 }],
    });
    setShow(true);
    try{
      const [p, g] = await Promise.all([
        api.get('/purchase/orders', { params:{ limit:100 } }).catch(()=>({ data:{ data:[] } })),
        api.get('/purchase/receipts').catch(()=>({ data:[] })),
      ]);
      setPos(Array.isArray(p.data?.data) ? p.data.data : (Array.isArray(p.data) ? p.data : []));
      setGrns(Array.isArray(g.data) ? g.data : (g.data?.data || []));
    }catch(e){ /* dropdown kosong tidak memblokir form */ }
  };

  const submit = async (e)=>{
    e.preventDefault();
    const lines = form.details.filter(d=> num(d.amount) !== 0);
    if (!form.po_id){ setFormErr('PO import wajib dipilih.'); return; }
    if (!lines.length){ setFormErr('Isi minimal satu komponen biaya dengan nilai > 0.'); return; }
    setSaving(true); setFormErr('');
    try{
      const r = await api.post('/landed-costs', {
        po_id: parseInt(form.po_id),
        grn_id: form.grn_id ? parseInt(form.grn_id) : null,
        container_no: form.container_no || null, bl_number: form.bl_number || null, pib_number: form.pib_number || null,
        arrival_date: form.arrival_date || null, clearance_date: form.clearance_date || null,
        allocation_method: form.allocation_method, notes: form.notes || null,
        details: lines.map(d=>({ cost_type:d.cost_type, description:d.description||COST_LABEL[d.cost_type],
          amount:num(d.amount), currency:d.currency||'IDR', exchange_rate:num(d.exchange_rate)||1 })),
      });
      setShow(false);
      await dialog.alert('Landed cost #'+r.data.id+' dibuat (status DRAFT).\nTotal biaya '+rupiah(r.data.total_cost)+'.\n\nLangkah berikutnya: tekan Kalkulasi untuk mengalokasikan ke item PO.', { title:'Landed Cost Dibuat' });
      load(); loadSummary();
    }catch(e){
      setFormErr(e.response?.data?.error || e.message || 'Gagal menyimpan');
    }finally{ setSaving(false); }
  };

  const openDetail = useCallback(async (row)=>{
    setDetailBusy(true); setDetail({ id: row.id });
    try{ const r = await api.get('/landed-costs/'+row.id); setDetail(r.data); }
    catch(e){ setDetail(null); await dialog.alert(e.response?.data?.error || e.message, { title:'Gagal memuat detail' }); }
    finally{ setDetailBusy(false); }
  },[dialog]);

  const calculate = async (row)=>{
    const ok = await dialog.confirm(
      'Hitung alokasi biaya LC #'+row.id+' ke item PO?\n\n'+
      'Biaya dibagi proporsional menurut metode '+(METHOD_LABEL[row.allocation_method]||row.allocation_method)+
      ', lalu ditambahkan ke nilai persediaan (avg cost) tiap produk.\n'+
      'Aman diulang: perhitungan lama dikembalikan dulu, tidak menumpuk.', { title:'Kalkulasi Alokasi' });
    if (!ok) return;
    setBusy('calc-'+row.id);
    try{
      const r = await api.post('/landed-costs/'+row.id+'/calculate');
      const d = r.data || {};
      const baris = (d.allocations||[]).slice(0,6)
        .map(a=>'• Produk #'+a.product_id+' → '+rupiah(a.extra)+' ('+rupiah(a.per_unit)+'/unit)').join('\n');
      await dialog.alert(
        'Alokasi selesai.\nTotal biaya: '+rupiah(d.totalCost)+'\nItem PO: '+((d.allocations||[]).length)+
        (d.reverted_rows ? '\nNilai persediaan dikembalikan dulu: '+d.reverted_rows+' baris' : '')+
        (baris ? '\n\n'+baris : '')+
        (d.catatan ? '\n\nCatatan: '+d.catatan : ''),
        { title:'Kalkulasi Selesai' });
      load(); loadSummary();
      if (detail && detail.id === row.id) openDetail(row);
    }catch(e){
      await dialog.alert(e.response?.data?.error || e.message, { title:'Gagal kalkulasi' });
    }finally{ setBusy(''); }
  };

  const post = async (row)=>{
    const ok = await dialog.confirm(
      'Posting jurnal untuk LC #'+row.id+'?\n\n'+
      'Debit Persediaan '+rupiah(row.total_cost)+', kredit Hutang Usaha (dan Hutang Pajak untuk bea masuk/PPh22).\n'+
      'Setelah diposting, nilai ini terkunci dan tidak bisa dihitung ulang.', { title:'Posting Jurnal' });
    if (!ok) return;
    setBusy('post-'+row.id);
    try{
      const r = await api.post('/landed-costs/'+row.id+'/post');
      await dialog.alert('Jurnal '+r.data.entry_number+' dibuat ('+r.data.detail_lines+' baris rincian).\n'+(r.data.catatan ? '\nCatatan: '+r.data.catatan : ''), { title:'Jurnal Terposting' });
      load(); loadSummary();
      if (detail && detail.id === row.id) openDetail(row);
    }catch(e){
      await dialog.alert(e.response?.data?.error || e.message, { title:'Gagal posting' });
    }finally{ setBusy(''); }
  };

  const remove = async (row)=>{
    const ok = await dialog.confirm('Hapus LC #'+row.id+'?\nAlokasi yang sudah masuk ke nilai persediaan akan dikembalikan.', { title:'Hapus Landed Cost' });
    if (!ok) return;
    try{
      const r = await api.delete('/landed-costs/'+row.id);
      await dialog.alert('LC #'+row.id+' dihapus.'+(r.data.restored ? '\nNilai persediaan dikembalikan: '+r.data.restored+' baris.' : ''), { title:'Terhapus' });
      load(); loadSummary();
    }catch(e){ await dialog.alert(e.response?.data?.error || e.message, { title:'Gagal hapus' }); }
  };

  const downloadExport = async (format, id)=>{
    setExpBusy(id ? 'd-'+id+'-'+format : format);
    try{
      const params = { format };
      if (id) params.id = id;
      const r = await api.get('/landed-costs/export', { params, responseType:'blob' });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url; a.download = (id ? 'landed-cost-'+id : 'daftar-landed-cost') + '.' + format;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }catch(e){ await dialog.alert(e.response?.data?.error || e.message || 'Gagal mengunduh laporan', { title:'Gagal export' }); }
    finally{ setExpBusy(''); }
  };

  /* ------------------------------------------------------------------ render */
  return (
    <div className="space-y-3">
      <PosPageHeader
        icon={FileText}
        title="Landed Cost & Import"
        subtitle="Harga barang impor sampai gudang: freight, asuransi, bea masuk, PPh22, clearance, trucking dialokasikan ke tiap item PO supaya HPP benar"
        badge={summary ? summary.total + ' dokumen' : null}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PosStat icon={Receipt} tone="bg-[#1E40AF]/10 text-[#1E40AF]" label="TOTAL BIAYA IMPOR" value={rupiah(summary?.total_cost)} sub={(summary?.total||0)+' dokumen landed cost'}/>
        <PosStat icon={Calculator} tone="bg-sky-50 text-sky-700" label="SIAP POSTING" value={rupiah(summary?.belum_posting)} sub={(summary?.calculated||0)+' sudah dikalkulasi'}/>
        <PosStat icon={BookCheck} tone="bg-emerald-50 text-emerald-700" label="SUDAH DIPOSTING" value={String(summary?.posted||0)+' dokumen'} sub="nilai persediaan terkunci"/>
        <PosStat icon={Percent} tone="bg-amber-50 text-amber-700" label="DRAFT" value={String(summary?.draft||0)+' dokumen'} sub="belum dikalkulasi"/>
      </div>

      {!!(summary?.by_type||[]).length && (
        <PosCard>
          <PosCardBody className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold tracking-widest text-[#64748B]">KOMPONEN BIAYA</span>
            {summary.by_type.map(t=>(
              <PosBadge key={t.cost_type} tone="slate" title={COST_LABEL[t.cost_type]||t.cost_type}>
                {t.cost_type} • {rupiah(t.amount)}
              </PosBadge>
            ))}
          </PosCardBody>
        </PosCard>
      )}

      <PosCard>
        <PosCardBody className="flex items-start gap-3">
          <span className="w-7 h-7 rounded-lg grid place-items-center bg-[#1E40AF]/10 text-[#1E40AF] shrink-0"><Info size={14}/></span>
          <div className="text-xs text-[#475569] leading-relaxed">
            <b className="text-[#0F172A]">Untuk apa?</b> Harga beli dari supplier bukan biaya sebenarnya barang sampai gudang. Biaya impor
            (freight, asuransi, bea masuk, PPh22, clearance, trucking) harus ikut masuk HPP - kalau tidak, margin penjualan terlihat
            lebih besar dari kenyataan. Alurnya: <b>1)</b> buat dokumen dari PO/GRN, <b>2)</b> Kalkulasi → biaya dibagi proporsional
            (VALUE / WEIGHT / VOLUME) dan menambah avg cost tiap produk, <b>3)</b> Posting jurnal (Debit Persediaan, Kredit Hutang Usaha/Hutang Pajak).
          </div>
        </PosCardBody>
      </PosCard>

      <PosCard>
        <PosCardBody className="space-y-3">
          <PosToolbar actions={<>
            <button onClick={()=>{ setAppliedQ(q); load(); loadSummary(); }} className={posBtnSecondary+' h-9 px-4 text-xs'}>
              <RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang
            </button>
            <PosExportButtons onExport={(f)=>downloadExport(f)} busyKey={expBusy} prefix="Daftar"/>
            <button onClick={openCreate} className={posBtnPrimary+' h-9 px-4 text-xs'}><Plus size={14}/> Landed Cost</button>
          </>}>
            <div className={posSearchWrap}>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"/>
              <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&setAppliedQ(q)}
                placeholder="Cari LC / PO / supplier / container / BL lalu Enter..." className={posInput+' pl-9'}/>
            </div>
          </PosToolbar>

          <PosChipRow label="STATUS">
            {['Semua','DRAFT','CALCULATED','POSTED'].map(s=>(
              <PosChip key={s} active={status===s} onClick={()=>setStatus(s)}>{s==='Semua'?'Semua':s}</PosChip>
            ))}
            <span className="ml-auto text-[11px] text-[#64748B]">Total baris: <b className="text-[#0F172A]">{rupiah(grandTotal)}</b></span>
          </PosChipRow>
        </PosCardBody>

        {loading ? <PosSkeleton rows={5} cols={6}/> : err ? <PosError message={err} onRetry={load}/> : (
          <>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]">
                  <PosTh>LC</PosTh><PosTh>PO / SUPPLIER</PosTh><PosTh>DOKUMEN</PosTh>
                  <PosTh align="center">KOMPONEN</PosTh><PosTh>METODE</PosTh>
                  <PosTh align="right">TOTAL BIAYA</PosTh><PosTh align="center">STATUS</PosTh><PosTh align="right">AKSI</PosTh>
                </tr></thead>
                <tbody>
                  {pageRows.map(l=>(
                    <tr key={l.id} className={posTr}>
                      <td className={posTd+' font-mono text-xs font-bold'}>#{l.id}</td>
                      <td className={posTd}>
                        <div className="font-bold text-[#0F172A]">{l.po_number||'-'}</div>
                        <div className="text-xs text-[#64748B]">{l.supplier_name||'-'}</div>
                      </td>
                      <td className={posTd+' text-xs text-[#64748B]'}>
                        <div>Container: <span className="font-mono text-[#334155]">{l.container_no||'-'}</span></div>
                        <div>BL: <span className="font-mono text-[#334155]">{l.bl_number||'-'}</span> • PIB: <span className="font-mono text-[#334155]">{l.pib_number||'-'}</span></div>
                      </td>
                      <td className={posTd+' text-center'}>{l.cost_lines||0} biaya</td>
                      <td className={posTd+' text-xs'}>{METHOD_LABEL[l.allocation_method]||l.allocation_method}</td>
                      <td className={posTd+' text-right font-bold tabular-nums'}>{rupiah(l.total_cost)}</td>
                      <td className={posTd+' text-center'}><PosBadge tone={STATUS_TONE[l.status]||'slate'}>{l.status}</PosBadge></td>
                      <td className={posTd}>
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <button onClick={()=>openDetail(l)} className={posBtnSm} title="Lihat rincian & alokasi"><Eye size={13}/> Detail</button>
                          {l.status!=='POSTED' && (
                            <button onClick={()=>calculate(l)} disabled={busy==='calc-'+l.id}
                              className={posBtnSm+' bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100 disabled:opacity-50'}>
                              <Calculator size={13}/> {l.status==='CALCULATED'?'Hitung Ulang':'Kalkulasi'}
                            </button>
                          )}
                          {l.status==='CALCULATED' && (
                            <button onClick={()=>post(l)} disabled={busy==='post-'+l.id}
                              className={posBtnSm+' bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50'}>
                              <BookCheck size={13}/> Posting
                            </button>
                          )}
                          {l.status!=='POSTED' && (
                            <button onClick={()=>remove(l)} className={posBtnSm+' bg-white border-red-200 text-red-600 hover:bg-red-50'} title="Hapus"><Trash2 size={13}/></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!pageRows.length && <PosEmpty colSpan={8} text="Belum ada landed cost"/>}
                </tbody>
              </table>
            </div>
            {total>0 && <PosCardBody><PosPager page={safePage} setPage={setPage} total={total} size={PAGE_SIZE} unit="dokumen"/></PosCardBody>}
          </>
        )}
      </PosCard>

      {detail && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <div className="bg-white rounded-[20px] w-full max-w-4xl max-h-[92vh] flex flex-col border shadow-xl overflow-hidden animate-pop">
            <div className="p-4 border-b flex items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-[16px] text-[#0F172A]">Landed Cost #{detail.id}</h3>
                <div className="text-xs text-[#64748B] mt-1 flex items-center gap-2 flex-wrap">
                  <span>{detail.po_number ? 'PO '+detail.po_number : 'PO -'}</span>
                  <span>•</span><span>{detail.supplier_name||'-'}</span>
                  <span>•</span><span>{METHOD_LABEL[detail.allocation_method]||detail.allocation_method}</span>
                  <PosBadge tone={STATUS_TONE[detail.status]||'slate'}>{detail.status}</PosBadge>
                </div>
              </div>
              <button onClick={()=>setDetail(null)} className="w-9 h-9 rounded-xl border border-[#E2E8F0] grid place-items-center text-[#64748B] hover:bg-[#F8FAFC]"><X size={16}/></button>
            </div>

            <div className="p-4 space-y-4 overflow-auto">
              {detailBusy ? <PosSkeleton rows={5} cols={4}/> : (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                    <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-2.5"><div className="text-[#64748B]">Container</div><div className="font-bold font-mono">{detail.container_no||'-'}</div></div>
                    <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-2.5"><div className="text-[#64748B]">BL / PIB</div><div className="font-bold font-mono">{detail.bl_number||'-'} / {detail.pib_number||'-'}</div></div>
                    <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-2.5"><div className="text-[#64748B]">Tiba / Clearance</div><div className="font-bold">{fmtDate(detail.arrival_date)} / {fmtDate(detail.clearance_date)}</div></div>
                    <div className="rounded-xl border border-[#1E40AF]/30 bg-[#1E40AF]/5 p-2.5"><div className="text-[#1E40AF]">Total Biaya Impor</div><div className="font-black text-[#0F172A]">{rupiah(detail.total_cost)}</div></div>
                  </div>

                  <div>
                    <div className="text-[11px] font-bold tracking-widest text-[#64748B] mb-2">KOMPONEN BIAYA ({(detail.details||[]).length})</div>
                    <div className="overflow-auto rounded-xl border border-[#E2E8F0]">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-[#F1F5F9] border-b border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]">
                          <PosTh>KOMPONEN</PosTh><PosTh>KETERANGAN</PosTh><PosTh align="center">VALUTA</PosTh>
                          <PosTh align="right">KURS</PosTh><PosTh align="right">JUMLAH</PosTh><PosTh align="right">IDR</PosTh>
                        </tr></thead>
                        <tbody>
                          {(detail.details||[]).map(d=>(
                            <tr key={d.id} className={posTr}>
                              <td className={posTd}><PosBadge tone="slate">{d.cost_type}</PosBadge></td>
                              <td className={posTd+' text-xs text-[#64748B]'}>{d.description||COST_LABEL[d.cost_type]||'-'}</td>
                              <td className={posTd+' text-center text-xs'}>{d.currency||'IDR'}</td>
                              <td className={posTd+' text-right tabular-nums'}>{num(d.exchange_rate)||1}</td>
                              <td className={posTd+' text-right tabular-nums'}>{new Intl.NumberFormat('id-ID').format(num(d.amount))}</td>
                              <td className={posTd+' text-right font-bold tabular-nums'}>{rupiah(d.amount_idr)}</td>
                            </tr>
                          ))}
                          {!(detail.details||[]).length && <PosEmpty colSpan={6} text="Belum ada komponen biaya"/>}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-bold tracking-widest text-[#64748B] mb-2">ALOKASI KE ITEM PO ({(detail.allocations||[]).length} item)</div>
                    <div className="overflow-auto rounded-xl border border-[#E2E8F0]">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-[#F1F5F9] border-b border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]">
                          <PosTh>PRODUK</PosTh><PosTh align="right">QTY</PosTh><PosTh align="right">DASAR</PosTh>
                          <PosTh align="right">PORSI</PosTh><PosTh align="right">TAMBAHAN</PosTh><PosTh align="right">PER UNIT</PosTh>
                          <PosTh align="right">AVG COST</PosTh>
                        </tr></thead>
                        <tbody>
                          {(detail.allocations||[]).map(a=>(
                            <tr key={a.id} className={posTr}>
                              <td className={posTd}>
                                <div className="font-bold text-[#0F172A]">{a.product_name || ('Produk #'+a.product_id)}</div>
                                <div className="text-xs text-[#94A3B8] font-mono">{a.sku||'-'}</div>
                              </td>
                              <td className={posTd+' text-right tabular-nums'}>{num(a.qty)}</td>
                              <td className={posTd+' text-right tabular-nums'}>{new Intl.NumberFormat('id-ID').format(num(a.base))}</td>
                              <td className={posTd+' text-right tabular-nums'}>{((num(a.share))*100).toFixed(2)}%</td>
                              <td className={posTd+' text-right font-bold tabular-nums'}>{rupiah(a.extra)}</td>
                              <td className={posTd+' text-right tabular-nums'}>{rupiah(a.per_unit)}</td>
                              <td className={posTd+' text-right text-xs text-[#64748B] tabular-nums'}>
                                {(a.avg_cost_before===null || a.avg_cost_before===undefined)
                                  ? 'tanpa baris stok'
                                  : rupiah(a.avg_cost_before)+' → '+rupiah(a.avg_cost_after ?? a.avg_cost_before)}
                              </td>
                            </tr>
                          ))}
                          {!(detail.allocations||[]).length && (
                            <PosEmpty colSpan={7} text="Belum dikalkulasi - tekan Kalkulasi untuk membagi biaya ke item PO"/>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="p-3 border-t flex flex-wrap items-center justify-end gap-2">
              <PosExportButtons onExport={(f)=>downloadExport(f, detail.id)}
                busyKey={expBusy.startsWith('d-'+detail.id+'-') ? expBusy.split('-')[2] : ''} prefix="Alokasi"/>
              {detail.status!=='POSTED' && (
                <button onClick={()=>calculate(detail)} className={posBtnSecondary+' h-9 px-4 text-xs'}><Calculator size={13}/> {detail.status==='CALCULATED'?'Hitung Ulang':'Kalkulasi'}</button>
              )}
              {detail.status==='CALCULATED' && (
                <button onClick={()=>post(detail)} className={posBtnPrimary+' h-9 px-4 text-xs'}><BookCheck size={14}/> Posting Jurnal</button>
              )}
              <button onClick={()=>setDetail(null)} className={posBtnSecondary+' h-9 px-4 text-xs'}>Tutup</button>
            </div>
          </div>
        </div>
      )}

      {show && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={submit} className="bg-white rounded-[20px] w-full max-w-3xl max-h-[92vh] flex flex-col border shadow-xl overflow-hidden animate-pop">
            <div className="p-4 border-b flex items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-[16px] text-[#0F172A]">Buat Landed Cost</h3>
                <div className="text-xs text-[#64748B] mt-0.5">Pilih PO impor, isi biaya sampai gudang, lalu hitung alokasi</div>
              </div>
              <button type="button" onClick={()=>setShow(false)} className="w-9 h-9 rounded-xl border border-[#E2E8F0] grid place-items-center text-[#64748B] hover:bg-[#F8FAFC]"><X size={16}/></button>
            </div>

            <div className="p-4 space-y-3 overflow-auto">
              {formErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{formErr}</div>}

              <div className="grid sm:grid-cols-2 gap-2">
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">PO IMPORT *</span>
                  <PosSelect size="md" value={form.po_id} onChange={v=>setForm({...form, po_id:v})}>
                    <option value="">Pilih PO</option>
                    {pos.map(p=> <option key={p.id} value={p.id}>{p.po_number} • {p.supplier_name||'-'}</option>)}
                  </PosSelect>
                </label>
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">GRN (OPSIONAL)</span>
                  <PosSelect size="md" value={form.grn_id} onChange={v=>setForm({...form, grn_id:v})}>
                    <option value="">Tanpa GRN</option>
                    {grns.map(g=> <option key={g.id} value={g.id}>{g.grn_number||('GRN #'+g.id)}</option>)}
                  </PosSelect>
                </label>
              </div>

              <div className="grid sm:grid-cols-3 gap-2">
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">CONTAINER</span>
                  <input value={form.container_no} onChange={e=>setForm({...form, container_no:e.target.value})} placeholder="MSKU1234567" className={posInput}/></label>
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">BL / B/L NO</span>
                  <input value={form.bl_number} onChange={e=>setForm({...form, bl_number:e.target.value})} placeholder="BL-..." className={posInput}/></label>
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">PIB / PEB</span>
                  <input value={form.pib_number} onChange={e=>setForm({...form, pib_number:e.target.value})} placeholder="PIB-..." className={posInput}/></label>
              </div>

              <div className="grid sm:grid-cols-3 gap-2">
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">TGL TIBA</span>
                  <input type="date" value={form.arrival_date} onChange={e=>setForm({...form, arrival_date:e.target.value})} className={posInput}/></label>
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">TGL CLEARANCE</span>
                  <input type="date" value={form.clearance_date} onChange={e=>setForm({...form, clearance_date:e.target.value})} className={posInput}/></label>
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">METODE ALOKASI</span>
                  <PosSelect size="md" value={form.allocation_method} onChange={v=>setForm({...form, allocation_method:v})}>
                    <option value="VALUE">VALUE - proporsional nilai barang</option>
                    <option value="WEIGHT">WEIGHT - proporsional berat/qty</option>
                    <option value="VOLUME">VOLUME - rata per item</option>
                  </PosSelect>
                </label>
              </div>

              <div className="rounded-[20px] border border-[#E2E8F0] overflow-hidden">
                <div className="bg-[#F8FAFC] px-3 py-2 flex items-center justify-between border-b border-[#E2E8F0]">
                  <span className="text-[11px] font-bold tracking-widest text-[#64748B]">KOMPONEN BIAYA</span>
                  <button type="button" onClick={()=>setForm({...form, details:[...form.details, { cost_type:'OTHER', description:'', amount:'', currency:'IDR', exchange_rate:1 }]})}
                    className={posBtnSm}><Plus size={13}/> Tambah Baris</button>
                </div>
                <div className="p-3 space-y-2">
                  {form.details.map((d,i)=>(
                    <div key={i} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-12 sm:col-span-3">
                        <span className="text-[10px] font-bold tracking-widest text-[#94A3B8]">JENIS</span>
                        <PosSelect size="md" value={d.cost_type} onChange={v=>{ const c=[...form.details]; c[i]={...c[i], cost_type:v}; setForm({...form, details:c}); }}>
                          {COST_TYPES.map(t=> <option key={t} value={t}>{t}</option>)}
                        </PosSelect>
                      </div>
                      <div className="col-span-12 sm:col-span-3">
                        <span className="text-[10px] font-bold tracking-widest text-[#94A3B8]">KETERANGAN</span>
                        <input value={d.description} onChange={e=>{ const c=[...form.details]; c[i]={...c[i], description:e.target.value}; setForm({...form, details:c}); }}
                          placeholder={COST_LABEL[d.cost_type]} className={posInput}/>
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <span className="text-[10px] font-bold tracking-widest text-[#94A3B8]">VALUTA</span>
                        <PosSelect size="md" value={d.currency} onChange={v=>{ const c=[...form.details]; c[i]={...c[i], currency:v}; setForm({...form, details:c}); }}>
                          <option value="IDR">IDR</option><option value="USD">USD</option><option value="SGD">SGD</option><option value="EUR">EUR</option>
                        </PosSelect>
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <span className="text-[10px] font-bold tracking-widest text-[#94A3B8]">KURS</span>
                        <input type="number" step="0.01" value={d.exchange_rate} onChange={e=>{ const c=[...form.details]; c[i]={...c[i], exchange_rate:e.target.value}; setForm({...form, details:c}); }}
                          className={posInput+' text-right tabular-nums'}/>
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <span className="text-[10px] font-bold tracking-widest text-[#94A3B8]">JUMLAH</span>
                        <input type="number" value={d.amount} onChange={e=>{ const c=[...form.details]; c[i]={...c[i], amount:e.target.value}; setForm({...form, details:c}); }}
                          placeholder="0" className={posInput+' text-right tabular-nums'}/>
                      </div>
                      <button type="button" onClick={()=>setForm({...form, details:form.details.filter((_,idx)=>idx!==i)})}
                        className="col-span-12 sm:col-span-1 h-9 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 grid place-items-center" title="Hapus baris">
                        <Trash2 size={14}/>
                      </button>
                      <div className="col-span-12 text-[11px] text-[#94A3B8] text-right">
                        = {rupiah(num(d.amount) * (num(d.exchange_rate)||1))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-3 py-2 bg-[#1E40AF]/5 border-t border-[#1E40AF]/20 flex items-center justify-between">
                  <span className="text-[11px] font-bold tracking-widest text-[#1E40AF]">TOTAL BIAYA IMPOR</span>
                  <span className="font-black text-[#0F172A]">{rupiah(form.details.reduce((a,d)=> a + num(d.amount)*(num(d.exchange_rate)||1), 0))}</span>
                </div>
              </div>

              <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">CATATAN</span>
                <input value={form.notes} onChange={e=>setForm({...form, notes:e.target.value})} placeholder="Dokumen: PIB, BL, packing list, COO..." className={posInput}/></label>
            </div>

            <div className="p-3 border-t flex justify-end gap-2">
              <button type="button" onClick={()=>setShow(false)} className={posBtnSecondary+' h-9 px-4 text-xs'}>Batal</button>
              <button disabled={saving} className={posBtnPrimary+' h-9 px-4 text-xs disabled:opacity-50'}>
                {saving ? <RefreshCw size={14} className="animate-spin"/> : <Ship size={14}/>} Simpan sebagai DRAFT
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
