import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RotateCcw, Search, RefreshCw, Plus, X, Eye, CheckCircle2, Truck, ShieldAlert,
  FileWarning, PackageX, Banknote, ClipboardList,
} from 'lucide-react';
import api from '../lib/api';
import { useDialog } from '../components/DialogProvider';
import {
  PosPageHeader, PosCard, PosCardBody, PosChip, PosSelect, PosTh, PosPager, PosBadge,
  PosEmpty, PosSkeleton, PosError, PosStat, PosToolbar, PosChipRow, PosExportButtons,
  posInput, posBtnPrimary, posBtnSecondary, posBtnSm, posTr, posTd, posSearchWrap,
} from '../components/PosUI';

const PAGE_SIZE = 10;
const REASON_LABEL = { DAMAGED:'Rusak', WRONG_ITEM:'Salah Kirim', EXCESS:'Kelebihan', QUALITY:'Kualitas', OTHER:'Lain-lain' };
const SETTLE_LABEL = { CREDIT_NOTE:'Nota Kredit', REFUND:'Refund', EXCHANGE:'Tukar Barang' };
const REASON_TONE = { DAMAGED:'red', WRONG_ITEM:'amber', EXCESS:'sky', QUALITY:'amber', OTHER:'slate' };
const CLAIM_TONE = { SUBMITTED:'sky', APPROVED:'emerald', PARTIAL:'amber', PAID:'emerald', REJECTED:'red', OPEN:'sky' };
const CLAIM_TYPE_LABEL = { SUPPLIER:'Supplier', EXPEDITION:'Ekspedisi', CUSTOMER:'Customer' };

const nf = (n)=> new Intl.NumberFormat('id-ID').format(Number(n)||0);
const rupiah = (n)=> 'Rp ' + nf(Math.round(Number(n)||0));
const num = (v)=> parseFloat(v) || 0;

export default function Returns(){
  const dialog = useDialog();
  const [tab, setTab] = useState('sales');           // sales | purchase | claims
  const [sales, setSales] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [claims, setClaims] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [status, setStatus] = useState('Semua');
  const [page, setPage] = useState(1);
  const [expBusy, setExpBusy] = useState('');
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  const [detail, setDetail] = useState(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [modal, setModal] = useState('');            // sales | purchase | claim | settle
  const [settleRow, setSettleRow] = useState(null);

  // form retur penjualan: item diambil dari invoice, qty retur diisi user
  const [sForm, setSForm] = useState({ invoice_id:'', customer_id:'', reason:'DAMAGED', settlement_type:'CREDIT_NOTE', notes:'', items:[] });
  const [pForm, setPForm] = useState({ supplier_id:'', reason:'DAMAGED', notes:'', items:[{ product_id:'', qty:'', unit_cost:'' }] });
  const [cForm, setCForm] = useState({ claim_type:'SUPPLIER', reference_type:'SALES_RETURN', reference_id:'', amount_claimed:'', notes:'' });
  const [sSettle, setSSettle] = useState({ amount_settled:'', status:'PAID' });

  /* --------------------------------------------------------------- loading */
  const load = useCallback(async ()=>{
    setLoading(true); setErr('');
    try{
      const params = { q:appliedQ };
      if (status!=='Semua') params.status = status;
      const [s, p, c] = await Promise.all([
        api.get('/returns/sales', { params }).catch(()=>({ data:[] })),
        api.get('/returns/purchase', { params:{ q:appliedQ } }).catch(()=>({ data:[] })),
        api.get('/returns/claims', { params:{ q:appliedQ, status } }).catch(()=>({ data:[] })),
      ]);
      setSales(Array.isArray(s.data)? s.data : []);
      setPurchases(Array.isArray(p.data)? p.data : []);
      setClaims(Array.isArray(c.data)? c.data : []);
    }catch(e){ setErr(e.response?.data?.error || e.message || 'Gagal memuat data retur'); }
    finally{ setLoading(false); }
  },[appliedQ,status]);

  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{ setPage(1); },[appliedQ,status,tab]);

  useEffect(()=>{
    (async ()=>{
      try{
        const [inv, sup, prd] = await Promise.all([
          api.get('/sales/invoices', { params:{ limit:100 } }).catch(()=>({ data:{ data:[] } })),
          api.get('/master/suppliers', { params:{ limit:200 } }).catch(()=>({ data:{ data:[] } })),
          api.get('/master/products', { params:{ limit:200 } }).catch(()=>({ data:{ data:[] } })),
        ]);
        setInvoices(Array.isArray(inv.data?.data)? inv.data.data : (Array.isArray(inv.data)? inv.data : []));
        setSuppliers(Array.isArray(sup.data?.data)? sup.data.data : (Array.isArray(sup.data)? sup.data : []));
        setProducts(Array.isArray(prd.data?.data)? prd.data.data : (Array.isArray(prd.data)? prd.data : []));
      }catch(e){ /* dropdown opsional */ }
    })();
  },[]);

  /* --------------------------------------------------------------- derived */
  const rows = tab==='sales' ? sales : tab==='purchase' ? purchases : claims;
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total/PAGE_SIZE));
  const safePage = Math.min(Math.max(1,page), totalPages);
  const pageRows = rows.slice((safePage-1)*PAGE_SIZE, safePage*PAGE_SIZE);

  const nilaiReturJual = sales.reduce((a,r)=> a + num(r.total), 0);
  const nilaiReturBeli = purchases.reduce((a,r)=> a + num(r.total), 0);
  const klaimDiajukan = claims.reduce((a,c)=> a + num(c.amount_claimed), 0);
  const klaimSelesai = claims.reduce((a,c)=> a + num(c.amount_settled), 0);
  const openClaims = claims.filter(c=> !['PAID','REJECTED'].includes(String(c.status||'').toUpperCase())).length;

  /* --------------------------------------------------------------- actions */
  const openSalesModal = ()=>{
    setFormErr('');
    setSForm({ invoice_id:'', customer_id:'', reason:'DAMAGED', settlement_type:'CREDIT_NOTE', notes:'', items:[] });
    setModal('sales');
  };

  const pickInvoice = async (invoiceId)=>{
    setSForm(f=>({ ...f, invoice_id:invoiceId, items:[] }));
    if (!invoiceId) return;
    const inv = invoices.find(i=> String(i.id)===String(invoiceId));
    if (inv) setSForm(f=>({ ...f, invoice_id:invoiceId, customer_id: inv.customer_id ? String(inv.customer_id) : f.customer_id }));
    try{
      const r = await api.get('/returns/invoice/'+invoiceId);
      const items = (r.data?.items||[]).map(it=>({
        product_id: it.product_id, name: it.product_name || ('Produk #'+it.product_id),
        sku: it.sku||'', max_qty: num(it.qty), qty:'', unit_price: num(it.unit_price), condition:'QUARANTINE',
      }));
      setSForm(f=>({ ...f, invoice_id:invoiceId, customer_id: r.data?.invoice?.customer_id ? String(r.data.invoice.customer_id) : f.customer_id, items }));
      if (!items.length) setFormErr('Invoice ini belum punya rincian item (SO kosong) - isi item secara manual di bawah.');
    }catch(e){
      setFormErr(e.response?.data?.error || 'Gagal memuat item invoice');
    }
  };

  const submitSales = async (e)=>{
    e.preventDefault();
    const items = sForm.items.filter(it=> num(it.qty) > 0)
      .map(it=>({ product_id:it.product_id, qty:num(it.qty), unit_price:num(it.unit_price), condition:it.condition||'QUARANTINE' }));
    if (!items.length){ setFormErr('Isi qty retur minimal satu item (qty > 0).'); return; }
    setSaving(true); setFormErr('');
    try{
      const r = await api.post('/returns/sales', {
        invoice_id: sForm.invoice_id? parseInt(sForm.invoice_id) : null,
        customer_id: sForm.customer_id? parseInt(sForm.customer_id) : null,
        reason: sForm.reason, settlement_type: sForm.settlement_type, notes: sForm.notes||null, items });
      setModal('');
      await dialog.alert('Retur '+r.data.return_number+' dibuat.\nTotal '+rupiah(r.data.total)+
        (sForm.settlement_type==='CREDIT_NOTE' ? '\nNota kredit: piutang invoice ikut berkurang.' : '')+
        '\nBarang masuk gudang karantina.', { title:'Retur Tersimpan' });
      load();
    }catch(e){ setFormErr(e.response?.data?.error || e.message || 'Gagal menyimpan retur'); }
    finally{ setSaving(false); }
  };

  const submitPurchase = async (e)=>{
    e.preventDefault();
    const items = pForm.items.filter(it=> it.product_id && num(it.qty)>0)
      .map(it=>({ product_id:parseInt(it.product_id), qty:num(it.qty), unit_cost:num(it.unit_cost) }));
    if (!pForm.supplier_id){ setFormErr('Supplier wajib dipilih.'); return; }
    if (!items.length){ setFormErr('Isi minimal satu item retur (produk + qty).'); return; }
    setSaving(true); setFormErr('');
    try{
      const r = await api.post('/returns/purchase', {
        supplier_id: parseInt(pForm.supplier_id), reason: pForm.reason, notes:pForm.notes||null, items });
      setModal('');
      await dialog.alert('Retur pembelian '+r.data.return_number+' dibuat.\nTotal '+rupiah(r.data.total), { title:'Retur Pembelian' });
      load();
    }catch(e){ setFormErr(e.response?.data?.error || e.message || 'Gagal menyimpan retur pembelian'); }
    finally{ setSaving(false); }
  };

  const submitClaim = async (e)=>{
    e.preventDefault();
    if (!num(cForm.amount_claimed)){ setFormErr('Nilai klaim wajib diisi.'); return; }
    setSaving(true); setFormErr('');
    try{
      const r = await api.post('/returns/claims', {
        claim_type:cForm.claim_type, reference_type:cForm.reference_type||null,
        reference_id:cForm.reference_id? parseInt(cForm.reference_id) : null,
        amount_claimed:num(cForm.amount_claimed), notes:cForm.notes||null });
      setModal('');
      await dialog.alert('Klaim '+r.data.claim_number+' diajukan.', { title:'Klaim Dibuat' });
      load();
    }catch(e){ setFormErr(e.response?.data?.error || e.message || 'Gagal membuat klaim'); }
    finally{ setSaving(false); }
  };

  const openSettle = (row)=>{
    setFormErr('');
    setSSettle({ amount_settled: String(Math.round(num(row.amount_claimed) - num(row.amount_settled)) || num(row.amount_claimed)), status:'PAID' });
    setSettleRow(row); setModal('settle');
  };

  const submitSettle = async (e)=>{
    e.preventDefault();
    if (!num(sSettle.amount_settled)){ setFormErr('Nilai penyelesaian wajib diisi.'); return; }
    setSaving(true); setFormErr('');
    try{
      await api.post('/returns/claims/'+settleRow.id+'/settle', { amount_settled:num(sSettle.amount_settled), status:sSettle.status });
      setModal(''); setSettleRow(null);
      await dialog.alert('Klaim '+settleRow.claim_number+' diselesaikan ('+rupiah(sSettle.amount_settled)+').', { title:'Klaim Selesai' });
      load();
    }catch(e){ setFormErr(e.response?.data?.error || e.message || 'Gagal menyelesaikan klaim'); }
    finally{ setSaving(false); }
  };

  const approve = async (row)=>{
    const ok = await dialog.confirm('Setujui retur '+row.return_number+'?\nStok karantina akan ditetapkan sebagai retur sah.', { title:'Approve Retur' });
    if (!ok) return;
    try{
      await api.post('/returns/sales/'+row.id+'/approve');
      await dialog.alert('Retur '+row.return_number+' disetujui.', { title:'Disetujui' });
      load();
    }catch(e){ await dialog.alert(e.response?.data?.error || e.message, { title:'Gagal approve' }); }
  };

  const openDetail = useCallback(async (row)=>{
    setDetailBusy(true); setDetail({ id: row.id });
    try{ const r = await api.get('/returns/sales/'+row.id); setDetail(r.data); }
    catch(e){ setDetail(null); await dialog.alert(e.response?.data?.error || e.message, { title:'Gagal memuat detail' }); }
    finally{ setDetailBusy(false); }
  },[dialog]);

  const downloadExport = async (format)=>{
    setExpBusy(format);
    try{
      const dataset = tab==='sales' ? 'sales' : tab==='purchase' ? 'purchase' : 'claims';
      const r = await api.get('/returns/export', { params:{ format, dataset, q:appliedQ, status }, responseType:'blob' });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url; a.download = dataset + '-retur.' + format;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }catch(e){ await dialog.alert(e.response?.data?.error || e.message || 'Gagal mengunduh laporan', { title:'Gagal export' }); }
    finally{ setExpBusy(''); }
  };

  const tabTotalQty = useMemo(()=> sales.reduce((a,r)=> a + num(r.total_qty), 0), [sales]);

  /* ---------------------------------------------------------------- render */
  return (
    <div className="space-y-3">
      <PosPageHeader
        icon={RotateCcw}
        title="Retur & Klaim"
        subtitle="Retur penjualan & pembelian, klaim supplier/ekspedisi, settlement nota kredit / refund / tukar barang"
        badge={openClaims ? openClaims + ' klaim berjalan' : null}
        actions={<>
          <PosExportButtons onExport={downloadExport} busyKey={expBusy} prefix={tab==='claims'?'Klaim':'Retur'}/>
          {tab==='sales' && <button onClick={openSalesModal} className={posBtnPrimary+' h-9 px-4 text-xs'}><Plus size={14}/> Retur Penjualan</button>}
          {tab==='purchase' && <button onClick={()=>{ setFormErr(''); setPForm({ supplier_id:'', reason:'DAMAGED', notes:'', items:[{ product_id:'', qty:'', unit_cost:'' }] }); setModal('purchase'); }} className={posBtnPrimary+' h-9 px-4 text-xs'}><Plus size={14}/> Retur Pembelian</button>}
          {tab==='claims' && <button onClick={()=>{ setFormErr(''); setCForm({ claim_type:'SUPPLIER', reference_type:'SALES_RETURN', reference_id:'', amount_claimed:'', notes:'' }); setModal('claim'); }} className={posBtnPrimary+' h-9 px-4 text-xs'}><Plus size={14}/> Klaim</button>}
        </>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PosStat icon={PackageX} tone="bg-red-50 text-red-700" label="RETUR PENJUALAN" value={rupiah(nilaiReturJual)} sub={sales.length+' dokumen • '+nf(tabTotalQty)+' qty'}/>
        <PosStat icon={Truck} tone="bg-sky-50 text-sky-700" label="RETUR PEMBELIAN" value={rupiah(nilaiReturBeli)} sub={purchases.length+' dokumen ke supplier'}/>
        <PosStat icon={FileWarning} tone="bg-amber-50 text-amber-700" label="KLAIM DIAJUKAN" value={rupiah(klaimDiajukan)} sub={claims.length+' klaim'}/>
        <PosStat icon={Banknote} tone="bg-emerald-50 text-emerald-700" label="KLAIM SELESAI" value={rupiah(klaimSelesai)} sub={openClaims+' masih berjalan'}/>
      </div>

      <PosCard>
        <PosCardBody className="space-y-3">
          <PosToolbar actions={<>
            <button onClick={()=>{ setAppliedQ(q); load(); }} className={posBtnSecondary+' h-9 px-4 text-xs'}>
              <RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang
            </button>
          </>}>
            <div className={posSearchWrap}>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"/>
              <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&setAppliedQ(q)}
                placeholder="Cari no retur / customer / supplier / klaim lalu Enter..." className={posInput+' pl-9'}/>
            </div>
          </PosToolbar>

          <PosChipRow label="LIHAT">
            <PosChip active={tab==='sales'} onClick={()=>setTab('sales')}>Retur Penjualan</PosChip>
            <PosChip active={tab==='purchase'} onClick={()=>setTab('purchase')}>Retur Pembelian</PosChip>
            <PosChip active={tab==='claims'} onClick={()=>setTab('claims')}>Klaim</PosChip>
            <span className="text-[11px] font-bold tracking-widest text-[#64748B] ml-3">STATUS</span>
            {(tab==='claims' ? ['Semua','SUBMITTED','APPROVED','PARTIAL','PAID','REJECTED'] : ['Semua','DRAFT','APPROVED','SETTLED']).map(s=>(
              <PosChip key={s} active={status===s} onClick={()=>setStatus(s)}>{s==='Semua'?'Semua':s}</PosChip>
            ))}
          </PosChipRow>
        </PosCardBody>

        {loading ? <PosSkeleton rows={6} cols={6}/> : err ? <PosError message={err} onRetry={load}/> : (
          <>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                {tab==='sales' && (
                  <>
                    <thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]">
                      <PosTh>NO RETUR</PosTh><PosTh>CUSTOMER</PosTh><PosTh>INVOICE</PosTh><PosTh align="center">ALASAN</PosTh>
                      <PosTh align="center">SETTLEMENT</PosTh><PosTh align="right">ITEM</PosTh><PosTh align="right">TOTAL</PosTh>
                      <PosTh align="center">STATUS</PosTh><PosTh align="right">AKSI</PosTh>
                    </tr></thead>
                    <tbody>
                      {pageRows.map(r=>(
                        <tr key={r.id} className={posTr}>
                          <td className={posTd+' font-mono text-xs font-bold'}>{r.return_number}</td>
                          <td className={posTd+' font-bold text-[#0F172A]'}>{r.customer_name||'-'}</td>
                          <td className={posTd+' font-mono text-xs text-[#64748B]'}>{r.invoice_number||'-'}</td>
                          <td className={posTd+' text-center'}><PosBadge tone={REASON_TONE[r.reason]||'slate'}>{REASON_LABEL[r.reason]||r.reason||'-'}</PosBadge></td>
                          <td className={posTd+' text-center text-xs'}>{SETTLE_LABEL[r.settlement_type]||r.settlement_type||'-'}</td>
                          <td className={posTd+' text-right tabular-nums'}>{r.item_count||0} <span className="text-xs text-[#94A3B8]">({nf(r.total_qty)})</span></td>
                          <td className={posTd+' text-right font-bold tabular-nums'}>{rupiah(r.total)}</td>
                          <td className={posTd+' text-center'}><PosBadge tone={r.status==='APPROVED'?'emerald':'amber'}>{r.status||'DRAFT'}</PosBadge></td>
                          <td className={posTd}>
                            <div className="flex justify-end gap-1.5">
                              <button onClick={()=>openDetail(r)} className={posBtnSm}><Eye size={13}/> Detail</button>
                              {String(r.status||'').toUpperCase()!=='APPROVED' && (
                                <button onClick={()=>approve(r)} className={posBtnSm+' bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'}><CheckCircle2 size={13}/> Approve</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!pageRows.length && <PosEmpty colSpan={9} text="Belum ada retur penjualan"/>}
                    </tbody>
                  </>
                )}

                {tab==='purchase' && (
                  <>
                    <thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]">
                      <PosTh>NO RETUR</PosTh><PosTh>TANGGAL</PosTh><PosTh>SUPPLIER</PosTh>
                      <PosTh align="center">ALASAN</PosTh><PosTh align="right">TOTAL</PosTh><PosTh align="center">STATUS</PosTh>
                    </tr></thead>
                    <tbody>
                      {pageRows.map(r=>(
                        <tr key={r.id} className={posTr}>
                          <td className={posTd+' font-mono text-xs font-bold'}>{r.return_number}</td>
                          <td className={posTd+' text-xs'}>{String(r.return_date||'').slice(0,10)||'-'}</td>
                          <td className={posTd+' font-bold text-[#0F172A]'}>{r.supplier_name||'-'}</td>
                          <td className={posTd+' text-center'}><PosBadge tone={REASON_TONE[r.reason]||'slate'}>{REASON_LABEL[r.reason]||r.reason||'-'}</PosBadge></td>
                          <td className={posTd+' text-right font-bold tabular-nums'}>{rupiah(r.total)}</td>
                          <td className={posTd+' text-center'}><PosBadge tone={CLAIM_TONE[r.status]||'slate'}>{r.status||'-'}</PosBadge></td>
                        </tr>
                      ))}
                      {!pageRows.length && <PosEmpty colSpan={6} text="Belum ada retur pembelian"/>}
                    </tbody>
                  </>
                )}

                {tab==='claims' && (
                  <>
                    <thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]">
                      <PosTh>NO KLAIM</PosTh><PosTh align="center">TIPE</PosTh><PosTh>REFERENSI</PosTh>
                      <PosTh align="right">DIAJUKAN</PosTh><PosTh align="right">DISELESAIKAN</PosTh>
                      <PosTh align="right">SISA</PosTh><PosTh align="center">STATUS</PosTh><PosTh align="right">AKSI</PosTh>
                    </tr></thead>
                    <tbody>
                      {pageRows.map(c=>{
                        const sisa = num(c.amount_claimed) - num(c.amount_settled);
                        const done = ['PAID','REJECTED'].includes(String(c.status||'').toUpperCase());
                        return (
                          <tr key={c.id} className={posTr}>
                            <td className={posTd+' font-mono text-xs font-bold'}>{c.claim_number}</td>
                            <td className={posTd+' text-center'}><PosBadge tone="slate">{CLAIM_TYPE_LABEL[c.claim_type]||c.claim_type||'-'}</PosBadge></td>
                            <td className={posTd+' text-xs text-[#64748B]'}>{c.reference_type? `${c.reference_type} #${c.reference_id ?? '-'}` : '-'}</td>
                            <td className={posTd+' text-right tabular-nums'}>{rupiah(c.amount_claimed)}</td>
                            <td className={posTd+' text-right tabular-nums text-emerald-700'}>{rupiah(c.amount_settled)}</td>
                            <td className={posTd+' text-right tabular-nums '+((sisa>0)?'text-amber-700':'text-[#64748B]')}>{rupiah(sisa)}</td>
                            <td className={posTd+' text-center'}><PosBadge tone={CLAIM_TONE[c.status]||'slate'}>{c.status||'-'}</PosBadge></td>
                            <td className={posTd}>
                              <div className="flex justify-end">
                                {!done
                                  ? <button onClick={()=>openSettle(c)} className={posBtnSm+' bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'}><Banknote size={13}/> Selesaikan</button>
                                  : <span className="text-xs text-[#94A3B8]">selesai</span>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {!pageRows.length && <PosEmpty colSpan={8} text="Belum ada klaim"/>}
                    </tbody>
                  </>
                )}
              </table>
            </div>
            {total>0 && <PosCardBody><PosPager page={safePage} setPage={setPage} total={total} size={PAGE_SIZE} unit="dokumen"/></PosCardBody>}
          </>
        )}
      </PosCard>

      {/* ------------------------------------------------------- detail retur */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <div className="bg-white rounded-[20px] w-full max-w-3xl max-h-[92vh] flex flex-col border shadow-xl overflow-hidden animate-pop">
            <div className="p-4 border-b flex items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-[16px] text-[#0F172A]">Retur {detail.return_number||('#'+detail.id)}</h3>
                <div className="text-xs text-[#64748B] mt-1 flex items-center gap-2 flex-wrap">
                  <span>{detail.name||'-'}</span><span>•</span>
                  <span>{REASON_LABEL[detail.reason]||detail.reason||'-'}</span><span>•</span>
                  <span>{SETTLE_LABEL[detail.settlement_type]||detail.settlement_type||'-'}</span>
                  <PosBadge tone={detail.status==='APPROVED'?'emerald':'amber'}>{detail.status||'DRAFT'}</PosBadge>
                </div>
              </div>
              <button onClick={()=>setDetail(null)} className="w-9 h-9 rounded-xl border border-[#E2E8F0] grid place-items-center text-[#64748B] hover:bg-[#F8FAFC]"><X size={16}/></button>
            </div>
            <div className="p-4 space-y-4 overflow-auto">
              {detailBusy ? <PosSkeleton rows={4} cols={4}/> : (
                <>
                  <div className="overflow-auto rounded-xl border border-[#E2E8F0]">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-[#F1F5F9] border-b border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]">
                        <PosTh>PRODUK</PosTh><PosTh align="right">QTY</PosTh><PosTh align="right">HARGA</PosTh>
                        <PosTh align="right">TOTAL</PosTh><PosTh align="center">KONDISI</PosTh>
                      </tr></thead>
                      <tbody>
                        {(detail.items||[]).map(it=>(
                          <tr key={it.id} className={posTr}>
                            <td className={posTd+' font-bold text-[#0F172A]'}>{it.name||('-')}</td>
                            <td className={posTd+' text-right tabular-nums'}>{nf(it.qty)}</td>
                            <td className={posTd+' text-right tabular-nums'}>{rupiah(it.unit_price)}</td>
                            <td className={posTd+' text-right font-bold tabular-nums'}>{rupiah(it.total)}</td>
                            <td className={posTd+' text-center'}><PosBadge tone={it.condition==='GOOD'?'emerald':it.condition==='DAMAGED'?'red':'amber'}>{it.condition||'-'}</PosBadge></td>
                          </tr>
                        ))}
                        {!(detail.items||[]).length && <PosEmpty colSpan={5} text="Tidak ada item"/>}
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold tracking-widest text-[#64748B] mb-2">KLAIM TERKAIT ({(detail.claims||[]).length})</div>
                    {(detail.claims||[]).length ? (
                      <div className="space-y-2">
                        {detail.claims.map(c=>(
                          <div key={c.id} className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-bold text-[#0F172A]">{c.claim_number} <span className="text-xs font-normal text-[#64748B]">• {CLAIM_TYPE_LABEL[c.claim_type]||c.claim_type}</span></div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm tabular-nums">{rupiah(c.amount_claimed)}</span>
                              <PosBadge tone={CLAIM_TONE[c.status]||'slate'}>{c.status}</PosBadge>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        Belum ada klaim untuk retur ini. Kalau barang rusak karena supplier/ekspedisi, buat klaim di tab <b>Klaim</b>.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="p-3 border-t flex justify-end gap-2">
              {String(detail.status||'').toUpperCase()!=='APPROVED' && (
                <button onClick={()=>{ approve(detail); setDetail(null); }} className={posBtnPrimary+' h-9 px-4 text-xs'}><CheckCircle2 size={14}/> Approve Retur</button>
              )}
              <button onClick={()=>setDetail(null)} className={posBtnSecondary+' h-9 px-4 text-xs'}>Tutup</button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------- modal retur jual */}
      {modal==='sales' && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={submitSales} className="bg-white rounded-[20px] w-full max-w-3xl max-h-[92vh] flex flex-col border shadow-xl overflow-hidden animate-pop">
            <div className="p-4 border-b flex items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-[16px] text-[#0F172A]">Retur Penjualan</h3>
                <div className="text-xs text-[#64748B] mt-0.5">Pilih invoice → item otomatis muncul → isi qty yang diretur</div>
              </div>
              <button type="button" onClick={()=>setModal('')} className="w-9 h-9 rounded-xl border border-[#E2E8F0] grid place-items-center text-[#64748B] hover:bg-[#F8FAFC]"><X size={16}/></button>
            </div>
            <div className="p-4 space-y-3 overflow-auto">
              {formErr && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{formErr}</div>}
              <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">INVOICE</span>
                <PosSelect size="md" value={sForm.invoice_id} onChange={pickInvoice}>
                  <option value="">Pilih invoice (opsional)</option>
                  {invoices.map(i=> <option key={i.id} value={i.id}>{i.invoice_number} • {i.customer_name||'-'} • {rupiah(i.total)}</option>)}
                </PosSelect></label>
              <div className="grid sm:grid-cols-3 gap-2">
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">CUSTOMER</span>
                  <PosSelect size="md" value={sForm.customer_id} onChange={v=>setSForm({...sForm, customer_id:v})}>
                    <option value="">Tanpa customer</option>
                    {invoices.filter(i=>i.customer_id).map(i=> <option key={'c'+i.id} value={i.customer_id}>{i.customer_name}</option>)}
                  </PosSelect></label>
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">ALASAN</span>
                  <PosSelect size="md" value={sForm.reason} onChange={v=>setSForm({...sForm, reason:v})}>
                    {Object.entries(REASON_LABEL).map(([k,v])=> <option key={k} value={k}>{v}</option>)}
                  </PosSelect></label>
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">SETTLEMENT</span>
                  <PosSelect size="md" value={sForm.settlement_type} onChange={v=>setSForm({...sForm, settlement_type:v})}>
                    {Object.entries(SETTLE_LABEL).map(([k,v])=> <option key={k} value={k}>{v}</option>)}
                  </PosSelect></label>
              </div>

              <div className="rounded-[20px] border border-[#E2E8F0] overflow-hidden">
                <div className="bg-[#F8FAFC] px-3 py-2 border-b border-[#E2E8F0] flex items-center justify-between">
                  <span className="text-[11px] font-bold tracking-widest text-[#64748B]">ITEM DIRETUR</span>
                  <span className="text-[11px] text-[#94A3B8]">kosongkan qty kalau item tidak diretur</span>
                </div>
                <div className="divide-y divide-[#F1F5F9]">
                  {sForm.items.map((it,i)=>(
                    <div key={i} className="p-3 flex flex-wrap items-center gap-2">
                      <div className="flex-1 min-w-[180px]">
                        <div className="text-sm font-bold text-[#0F172A]">{it.name}</div>
                        <div className="text-[11px] text-[#94A3B8]">dipesan {nf(it.max_qty)} • harga {rupiah(it.unit_price)} {it.sku?('• '+it.sku):''}</div>
                      </div>
                      <input type="number" value={it.qty} placeholder="0" max={it.max_qty||undefined}
                        onChange={e=>{ const c=[...sForm.items]; c[i]={...c[i], qty:e.target.value}; setSForm({...sForm, items:c}); }}
                        className={posInput+' w-[90px] text-right tabular-nums'}/>
                      <PosSelect size="md" value={it.condition} onChange={v=>{ const c=[...sForm.items]; c[i]={...c[i], condition:v}; setSForm({...sForm, items:c}); }}>
                        <option value="QUARANTINE">Karantina</option>
                        <option value="GOOD">Baik (masuk stok)</option>
                        <option value="DAMAGED">Rusak (buang)</option>
                      </PosSelect>
                      <div className="w-[110px] text-right text-sm font-bold tabular-nums">{rupiah(num(it.qty)*num(it.unit_price))}</div>
                    </div>
                  ))}
                  {!sForm.items.length && <div className="p-4 text-center text-xs text-[#94A3B8]">Pilih invoice untuk memuat item otomatis.</div>}
                </div>
                <div className="px-3 py-2 bg-[#1E40AF]/5 border-t border-[#1E40AF]/20 flex items-center justify-between">
                  <span className="text-[11px] font-bold tracking-widest text-[#1E40AF]">TOTAL RETUR</span>
                  <span className="font-black text-[#0F172A]">{rupiah(sForm.items.reduce((a,it)=> a + num(it.qty)*num(it.unit_price), 0))}</span>
                </div>
              </div>

              <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">CATATAN</span>
                <input value={sForm.notes} onChange={e=>setSForm({...sForm, notes:e.target.value})} placeholder="mis. 2 sak sobek saat bongkar" className={posInput}/></label>
              <div className="text-[11px] text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-2">
                Barang masuk gudang karantina. Nota kredit otomatis memotong piutang invoice.
              </div>
            </div>
            <div className="p-3 border-t flex justify-end gap-2">
              <button type="button" onClick={()=>setModal('')} className={posBtnSecondary+' h-9 px-4 text-xs'}>Batal</button>
              <button disabled={saving} className={posBtnPrimary+' h-9 px-4 text-xs disabled:opacity-50'}>
                {saving ? <RefreshCw size={14} className="animate-spin"/> : <RotateCcw size={14}/>} Simpan Retur
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ---------------------------------------------- modal retur pembelian */}
      {modal==='purchase' && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={submitPurchase} className="bg-white rounded-[20px] w-full max-w-2xl max-h-[92vh] flex flex-col border shadow-xl overflow-hidden animate-pop">
            <div className="p-4 border-b flex items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-[16px] text-[#0F172A]">Retur Pembelian</h3>
                <div className="text-xs text-[#64748B] mt-0.5">Kirim balik barang rusak/salah ke supplier, hitung nilai retur dari harga beli</div>
              </div>
              <button type="button" onClick={()=>setModal('')} className="w-9 h-9 rounded-xl border border-[#E2E8F0] grid place-items-center text-[#64748B] hover:bg-[#F8FAFC]"><X size={16}/></button>
            </div>
            <div className="p-4 space-y-3 overflow-auto">
              {formErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{formErr}</div>}
              <div className="grid sm:grid-cols-2 gap-2">
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">SUPPLIER *</span>
                  <PosSelect size="md" value={pForm.supplier_id} onChange={v=>setPForm({...pForm, supplier_id:v})}>
                    <option value="">Pilih supplier</option>
                    {suppliers.map(s=> <option key={s.id} value={s.id}>{s.name}</option>)}
                  </PosSelect></label>
                <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">ALASAN</span>
                  <PosSelect size="md" value={pForm.reason} onChange={v=>setPForm({...pForm, reason:v})}>
                    {Object.entries(REASON_LABEL).map(([k,v])=> <option key={k} value={k}>{v}</option>)}
                  </PosSelect></label>
              </div>

              <div className="rounded-[20px] border border-[#E2E8F0] overflow-hidden">
                <div className="bg-[#F8FAFC] px-3 py-2 border-b border-[#E2E8F0] flex items-center justify-between">
                  <span className="text-[11px] font-bold tracking-widest text-[#64748B]">ITEM RETUR</span>
                  <button type="button" onClick={()=>setPForm({...pForm, items:[...pForm.items, { product_id:'', qty:'', unit_cost:'' }]})} className={posBtnSm}><Plus size={13}/> Baris</button>
                </div>
                <div className="p-3 space-y-2">
                  {pForm.items.map((it,i)=>(
                    <div key={i} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-12 sm:col-span-6">
                        <span className="text-[10px] font-bold tracking-widest text-[#94A3B8]">PRODUK</span>
                        <PosSelect size="md" value={it.product_id} onChange={v=>{ const c=[...pForm.items]; c[i]={...c[i], product_id:v}; setPForm({...pForm, items:c}); }}>
                          <option value="">Pilih produk</option>
                          {products.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}
                        </PosSelect>
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <span className="text-[10px] font-bold tracking-widest text-[#94A3B8]">QTY</span>
                        <input type="number" value={it.qty} onChange={e=>{ const c=[...pForm.items]; c[i]={...c[i], qty:e.target.value}; setPForm({...pForm, items:c}); }} className={posInput+' text-right tabular-nums'}/>
                      </div>
                      <div className="col-span-4 sm:col-span-3">
                        <span className="text-[10px] font-bold tracking-widest text-[#94A3B8]">HARGA BELI</span>
                        <input type="number" value={it.unit_cost} onChange={e=>{ const c=[...pForm.items]; c[i]={...c[i], unit_cost:e.target.value}; setPForm({...pForm, items:c}); }} className={posInput+' text-right tabular-nums'}/>
                      </div>
                      <button type="button" onClick={()=>setPForm({...pForm, items:pForm.items.filter((_,idx)=>idx!==i)})}
                        className="col-span-4 sm:col-span-1 h-9 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 grid place-items-center"><X size={14}/></button>
                    </div>
                  ))}
                </div>
                <div className="px-3 py-2 bg-[#1E40AF]/5 border-t border-[#1E40AF]/20 flex items-center justify-between">
                  <span className="text-[11px] font-bold tracking-widest text-[#1E40AF]">TOTAL RETUR</span>
                  <span className="font-black text-[#0F172A]">{rupiah(pForm.items.reduce((a,it)=> a + num(it.qty)*num(it.unit_cost), 0))}</span>
                </div>
              </div>

              <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">CATATAN</span>
                <input value={pForm.notes} onChange={e=>setPForm({...pForm, notes:e.target.value})} placeholder="mis. 3 sak rusak dari supplier" className={posInput}/></label>
            </div>
            <div className="p-3 border-t flex justify-end gap-2">
              <button type="button" onClick={()=>setModal('')} className={posBtnSecondary+' h-9 px-4 text-xs'}>Batal</button>
              <button disabled={saving} className={posBtnPrimary+' h-9 px-4 text-xs disabled:opacity-50'}>
                {saving ? <RefreshCw size={14} className="animate-spin"/> : <Truck size={14}/>} Simpan Retur
              </button>
            </div>
          </form>
        </div>
      )}

      {/* -------------------------------------------------------- modal klaim */}
      {modal==='claim' && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={submitClaim} className="bg-white rounded-[20px] p-5 w-full max-w-lg space-y-3 border shadow-xl animate-pop">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-[16px] text-[#0F172A]">Klaim Baru</h3>
                <div className="text-xs text-[#64748B] mt-0.5">Klaim ganti rugi ke supplier / ekspedisi atas barang rusak atau hilang</div>
              </div>
              <button type="button" onClick={()=>setModal('')} className="w-9 h-9 rounded-xl border border-[#E2E8F0] grid place-items-center text-[#64748B] hover:bg-[#F8FAFC]"><X size={16}/></button>
            </div>
            {formErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{formErr}</div>}
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">TIPE KLAIM</span>
                <PosSelect size="md" value={cForm.claim_type} onChange={v=>setCForm({...cForm, claim_type:v})}>
                  {Object.entries(CLAIM_TYPE_LABEL).map(([k,v])=> <option key={k} value={k}>{v}</option>)}
                </PosSelect></label>
              <label className="space-y-1"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">SUMBER DOKUMEN</span>
                <PosSelect size="md" value={cForm.reference_type} onChange={v=>setCForm({...cForm, reference_type:v})}>
                  <option value="SALES_RETURN">Retur Penjualan</option>
                  <option value="PURCHASE_RETURN">Retur Pembelian</option>
                  <option value="DELIVERY">Delivery Order</option>
                  <option value="MANUAL">Manual</option>
                </PosSelect></label>
            </div>
            {cForm.reference_type==='SALES_RETURN' && (
              <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">RETUR TERKAIT</span>
                <PosSelect size="md" value={cForm.reference_id} onChange={v=>setCForm({...cForm, reference_id:v})}>
                  <option value="">Tanpa dokumen</option>
                  {sales.map(s=> <option key={s.id} value={s.id}>{s.return_number} • {s.customer_name||'-'}</option>)}
                </PosSelect></label>
            )}
            <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">NILAI KLAIM Rp *</span>
              <input type="number" value={cForm.amount_claimed} onChange={e=>setCForm({...cForm, amount_claimed:e.target.value})} className={posInput+' text-right tabular-nums'}/></label>
            <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">CATATAN</span>
              <input value={cForm.notes} onChange={e=>setCForm({...cForm, notes:e.target.value})} placeholder="mis. 2 sak sobek, ekspedisi setuju ganti" className={posInput}/></label>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={()=>setModal('')} className={posBtnSecondary+' h-9 px-4 text-xs'}>Batal</button>
              <button disabled={saving} className={posBtnPrimary+' h-9 px-4 text-xs disabled:opacity-50'}>
                {saving ? <RefreshCw size={14} className="animate-spin"/> : <ShieldAlert size={14}/>} Ajukan Klaim
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ----------------------------------------------------- modal settle */}
      {modal==='settle' && settleRow && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={submitSettle} className="bg-white rounded-[20px] p-5 w-full max-w-md space-y-3 border shadow-xl animate-pop">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-[16px] text-[#0F172A]">Selesaikan Klaim</h3>
                <div className="text-xs text-[#64748B] mt-0.5">{settleRow.claim_number} • diajukan {rupiah(settleRow.amount_claimed)}</div>
              </div>
              <button type="button" onClick={()=>{ setModal(''); setSettleRow(null); }} className="w-9 h-9 rounded-xl border border-[#E2E8F0] grid place-items-center text-[#64748B] hover:bg-[#F8FAFC]"><X size={16}/></button>
            </div>
            {formErr && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{formErr}</div>}
            <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">NILAI DISELESAIKAN Rp *</span>
              <input type="number" value={sSettle.amount_settled} onChange={e=>setSSettle({...sSettle, amount_settled:e.target.value})} className={posInput+' text-right tabular-nums'}/></label>
            <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">STATUS</span>
              <PosSelect size="md" value={sSettle.status} onChange={v=>setSSettle({...sSettle, status:v})}>
                <option value="PAID">PAID - dibayar penuh</option>
                <option value="PARTIAL">PARTIAL - dibayar sebagian</option>
                <option value="REJECTED">REJECTED - ditolak</option>
              </PosSelect></label>
            <div className="text-[11px] text-[#64748B]">Sisa klaim: <b className="text-[#0F172A]">{rupiah(num(settleRow.amount_claimed)-num(settleRow.amount_settled))}</b></div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={()=>{ setModal(''); setSettleRow(null); }} className={posBtnSecondary+' h-9 px-4 text-xs'}>Batal</button>
              <button disabled={saving} className={posBtnPrimary+' h-9 px-4 text-xs disabled:opacity-50'}>
                {saving ? <RefreshCw size={14} className="animate-spin"/> : <Banknote size={14}/>} Simpan
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
