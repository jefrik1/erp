import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ReceiptText, Search, RefreshCw, X, CreditCard, Banknote, Wallet, FileText, Truck, ShoppingCart, Filter, Printer,
} from 'lucide-react';
import api from '../lib/api';
import {
  PosPageHeader, PosCard, PosCardBody, PosBadge, PosEmpty, PosSkeleton, PosError, PosStat,
  PosTh, posTr, posTd, posInput, posBtnPrimary, posBtnSecondary, posSelectWrap, posSearchWrap, PosSelect, PosChipRow, PosChip,
} from '../components/PosUI';

const nf = (n)=> new Intl.NumberFormat('id-ID').format(Math.round(Number(n)||0));
const rupiah = (n)=> 'Rp ' + nf(n);
const iso = (d)=> String(d||'').slice(0,10);
const tgl = (d)=> d ? new Date(String(d).slice(0,10)+'T00:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-';
const METHOD_TONE = { CASH:'emerald', TRANSFER:'sky', CARD:'purple', QRIS:'amber' };
const STATUS_TONE = { COMPLETED:'emerald', SHIPPED:'sky', PARTIAL:'amber', APPROVED:'sky', PENDING:'amber', CANCELLED:'red', PICKING:'purple' };
const PAGE_SIZE = 20;

function PayBadge({ method }){
  if(!method) return <span className="text-[11px] text-ink-3">-</span>;
  const list = String(method).split('+').map(s=>s.trim());
  return <span className="flex flex-wrap gap-1 justify-center">{list.map(m=>(
    <span key={m} className={'px-2 py-0.5 rounded-full border text-[10px] font-bold '+(m==='CASH'? 'bg-emerald-50 text-emerald-700 border-emerald-200' : m==='TRANSFER'? 'bg-sky-50 text-sky-700 border-sky-200' : m==='CARD'? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-amber-50 text-amber-700 border-amber-200')}>{m}</span>
  ))}</span>;
}

function OrderDetailModal({ id, onClose }){
  const [data,setData]=useState(null); const [err,setErr]=useState('');
  useEffect(()=>{
    if(!id) return;
    setData(null); setErr('');
    api.get('/sales/orders/'+id).then(r=>setData(r.data)).catch(e=>setErr(e.response?.data?.error||e.message));
  },[id]);
  if(!id) return null;
  const inv=data?.invoice;
  const paid=Number(inv?.paid_amount||0);
  const sisa=Math.max(0, Number(inv?.total||0) - paid);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm" onClick={onClose}/>
      <div role="dialog" className="relative z-10 w-full max-w-[720px] max-h-[92vh] flex flex-col bg-white rounded-2xl border border-line shadow-raised overflow-hidden">
        <div className="shrink-0 p-4 border-b bg-surface-2 flex justify-between items-start gap-2">
          <div>
            <div className="font-bold text-sm text-ink">{data?.so_number || ('Order #'+id)}</div>
            <div className="text-xs text-ink-2 mt-0.5">{data?.customer_name||'-'} • {tgl(data?.so_date)} • {data?.status||''}</div>
          </div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-full border bg-white"><X size={14}/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">{err}</div>}
          {!data && !err && <PosSkeleton rows={5} cols={4}/>}
          {data && (<>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="rounded-xl border border-line p-2.5"><div className="text-[10px] uppercase font-bold text-ink-3">Total</div><div className="font-bold">{rupiah(data.total)}</div></div>
              <div className="rounded-xl border border-line p-2.5"><div className="text-[10px] uppercase font-bold text-ink-3">Dibayar</div><div className="font-bold text-emerald-700">{rupiah(paid)}</div></div>
              <div className="rounded-xl border border-line p-2.5"><div className="text-[10px] uppercase font-bold text-ink-3">Sisa</div><div className={'font-bold '+(sisa>0.5?'text-amber-700':'text-emerald-700')}>{rupiah(sisa)}</div></div>
              <div className="rounded-xl border border-line p-2.5"><div className="text-[10px] uppercase font-bold text-ink-3">Invoice</div><div className="font-mono text-[11px] font-bold">{inv?.invoice_number||'-'}</div></div>
            </div>
            {inv?.id && (
              <a href={`/pos/receipt/${inv.id}`} target="_blank" rel="noreferrer"
                 className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-navy text-white text-[11px] font-bold">
                <Printer size={12}/> Cetak Struk
              </a>
            )}

            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-ink-2 mb-1">Item</div>
              <div className="rounded-xl border border-line overflow-hidden">
                <table className="w-full text-xs">
                  <thead><tr className="bg-surface-3 text-[10px] font-bold uppercase text-ink-2"><th className="p-2 text-left">Produk</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Harga</th><th className="p-2 text-right">Total</th></tr></thead>
                  <tbody>
                    {(data.details||[]).map((d,i)=>(
                      <tr key={i} className="border-t border-line">
                        <td className="p-2"><div className="font-semibold">{d.product_name}</div><div className="text-[10px] text-ink-3">{d.sku||'-'}</div></td>
                        <td className="p-2 text-right tabular-nums">{nf(d.qty)} {d.unit_code||''}</td>
                        <td className="p-2 text-right tabular-nums">{rupiah(d.unit_price)}</td>
                        <td className="p-2 text-right font-bold tabular-nums">{rupiah(Number(d.qty)*Number(d.unit_price))}</td>
                      </tr>
                    ))}
                    {!(data.details||[]).length && <tr><td colSpan={4} className="p-4 text-center text-ink-3">Tidak ada item</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-ink-2 mb-1">Pembayaran</div>
              <div className="rounded-xl border border-line overflow-hidden">
                <table className="w-full text-xs">
                  <thead><tr className="bg-surface-3 text-[10px] font-bold uppercase text-ink-2"><th className="p-2 text-left">No</th><th className="p-2 text-left">Metode</th><th className="p-2 text-left">Bank</th><th className="p-2 text-center">Tanggal</th><th className="p-2 text-right">Nominal</th></tr></thead>
                  <tbody>
                    {(data.payments||[]).map(p=>(
                      <tr key={p.id} className="border-t border-line">
                        <td className="p-2 font-mono text-[11px]">{p.payment_number}</td>
                        <td className="p-2"><PayBadge method={p.method}/></td>
                        <td className="p-2 text-[11px]">{p.bank_name? p.bank_name+' • '+p.account_no : '-'}</td>
                        <td className="p-2 text-center text-[11px]">{tgl(p.payment_date)}</td>
                        <td className="p-2 text-right font-bold tabular-nums">{rupiah(p.amount)}</td>
                      </tr>
                    ))}
                    {!(data.payments||[]).length && <tr><td colSpan={5} className="p-4 text-center text-ink-3">Belum ada pembayaran tercatat</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {(data.deliveries||[]).length>0 && (
              <div className="text-[11px] text-ink-2 flex flex-wrap items-center gap-1.5">
                <Truck size={12}/> Pengiriman:
                {data.deliveries.map(d=> <Link key={d.id} to={'/surat-jalan/'+d.id} className="font-mono font-bold text-brand hover:underline">{d.do_number}</Link>)}
              </div>
            )}
          </>)}
        </div>
        <div className="shrink-0 p-3 border-t bg-white flex justify-end gap-2">
          {data?.invoice_id && <Link to="/sales/invoices" className={posBtnSecondary+' h-9 px-4 text-xs'}>Buka Invoice</Link>}
          <button onClick={onClose} className={posBtnPrimary+' h-9 px-5 text-xs'}>Tutup</button>
        </div>
      </div>
    </div>
  );
}

export default function OrderHistory(){
  const [rows,setRows]=useState([]);
  const [summary,setSummary]=useState(null);
  const [scope,setScope]=useState('');
  const [total,setTotal]=useState(0);
  const [page,setPage]=useState(1);
  const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  const [q,setQ]=useState(''); const [appliedQ,setAppliedQ]=useState('');
  const [source,setSource]=useState('Semua');
  const [method,setMethod]=useState('Semua');
  const [status,setStatus]=useState('Semua');
  const [start,setStart]=useState(''); const [end,setEnd]=useState('');
  const [openId,setOpenId]=useState(null);

  const load = useCallback(async ()=>{
    setLoading(true); setErr('');
    try{
      const params = { limit:PAGE_SIZE, offset:(page-1)*PAGE_SIZE };
      if(appliedQ) params.search = appliedQ;
      if(source!=='Semua') params.source = source.toLowerCase();
      if(method!=='Semua') params.method = method;
      if(status!=='Semua') params.status = status;
      if(start) params.start = start;
      if(end) params.end = end;
      const r = await api.get('/sales/orders/history', { params });
      setRows(Array.isArray(r.data?.data)? r.data.data : []);
      setTotal(Number(r.data?.total)||0);
      setSummary(r.data?.summary||null);
      setScope(r.data?.scope||'');
    }catch(e){ setErr(e.response?.data?.error||e.message||'Gagal memuat riwayat order'); setRows([]); }
    finally{ setLoading(false); }
  },[page,appliedQ,source,method,status,start,end]);
  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{ setPage(1); },[appliedQ,source,method,status,start,end]);

  const totalPages = Math.max(1, Math.ceil(total/PAGE_SIZE));
  const methods = useMemo(()=> (summary?.by_method||[]), [summary]);

  return (
    <div className="space-y-3">
      <PosPageHeader icon={ReceiptText} title="Riwayat Order"
        subtitle={scope==='POS_MILIK_SAYA' ? 'Order POS yang Anda proses - lengkap dengan metode bayar, DP, dan sisa' : 'Semua order POS & Sales Order - metode bayar, DP, sisa, dan status dokumen'}
        badge={total? nf(total)+' order' : null}
        actions={<button onClick={load} className={posBtnSecondary+' h-9 px-4 text-xs'}><RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang</button>}/>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PosStat icon={ShoppingCart} tone="bg-brand/10 text-brand" label="ORDER" value={nf(total)} sub={(summary? (summary.jml_pos||0)+' POS • '+(summary.jml_so||0)+' SO' : '')}/>
        <PosStat icon={Wallet} tone="bg-sky-50 text-sky-700" label="NILAI ORDER" value={rupiah(summary?.total_nilai||0)} sub="sesuai filter"/>
        <PosStat icon={Banknote} tone="bg-emerald-50 text-emerald-700" label="TERBAYAR" value={rupiah(summary?.total_terbayar||0)} sub="akumulasi pembayaran"/>
        <PosStat icon={CreditCard} tone="bg-amber-50 text-amber-700" label="SISA TAGIH" value={rupiah((summary?.total_nilai||0)-(summary?.total_terbayar||0))} sub="belum dibayar"/>
      </div>

      <PosCard>
        <PosCardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className={posSearchWrap+' min-w-[220px] flex-1'}>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"/>
              <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&setAppliedQ(q)}
                placeholder="Cari no order / invoice / pelanggan lalu Enter..." className={posInput+' pl-9'}/>
            </div>
            <div className={posSelectWrap}>
              <PosSelect value={source} onChange={setSource}>
                <option value="Semua">Semua Sumber</option><option value="POS">POS</option><option value="SO">Sales Order</option>
              </PosSelect>
            </div>
            <div className={posSelectWrap}>
              <PosSelect value={method} onChange={setMethod}>
                <option value="Semua">Semua Metode</option><option value="CASH">CASH</option><option value="TRANSFER">TRANSFER</option><option value="CARD">CARD</option><option value="QRIS">QRIS</option>
              </PosSelect>
            </div>
            <div className={posSelectWrap}>
              <PosSelect value={status} onChange={setStatus}>
                <option value="Semua">Semua Status</option><option value="COMPLETED">COMPLETED</option><option value="SHIPPED">SHIPPED</option><option value="PARTIAL">PARTIAL</option><option value="APPROVED">APPROVED</option><option value="PICKING">PICKING</option><option value="PENDING">PENDING</option><option value="CANCELLED">CANCELLED</option>
              </PosSelect>
            </div>
            <input type="date" value={start} onChange={e=>setStart(e.target.value)} className={posInput+' sm:w-[150px]'} title="Dari tanggal"/>
            <input type="date" value={end} onChange={e=>setEnd(e.target.value)} className={posInput+' sm:w-[150px]'} title="Sampai tanggal"/>
            {(appliedQ||source!=='Semua'||method!=='Semua'||status!=='Semua'||start||end) && (
              <button onClick={()=>{ setQ(''); setAppliedQ(''); setSource('Semua'); setMethod('Semua'); setStatus('Semua'); setStart(''); setEnd(''); }} className="h-9 px-3 rounded-xl border border-line bg-white text-xs font-bold text-ink-2 hover:bg-surface-2 inline-flex items-center gap-1"><Filter size={12}/> Reset</button>
            )}
          </div>

          {methods.length>0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="font-bold text-ink-2">Metode bayar:</span>
              {methods.map(m=>(
                <span key={m.method} className="px-2 py-0.5 rounded-full bg-white border font-bold">{m.method} • {m.n}× • {rupiah(m.amount)}</span>
              ))}
            </div>
          )}
        </PosCardBody>

        {loading ? <PosSkeleton rows={6} cols={7}/> : err ? <PosError message={err} onRetry={load}/> : !rows.length ? (
          <PosEmpty text="Belum ada order pada filter ini" hint="Ubah filter tanggal/metode atau buat order baru di POS / Sales Order."/>
        ) : (
          <>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-surface-3 border-y border-line text-[11px] font-bold tracking-wider text-ink-2">
                  <PosTh>ORDER</PosTh><PosTh>PELANGGAN</PosTh><PosTh align="center">SUMBER</PosTh><PosTh align="center">METODE BAYAR</PosTh>
                  <PosTh align="right">TOTAL</PosTh><PosTh align="right">DIBAYAR</PosTh><PosTh align="right">SISA</PosTh><PosTh align="center">STATUS</PosTh><PosTh align="center">AKSI</PosTh>
                </tr></thead>
                <tbody>
                  {rows.map(r=>{
                    const paid=Number(r.paid_amount||0);
                    const sisa=Math.max(0, Number(r.total||0)-paid);
                    return (
                      <tr key={r.id} className={posTr+' cursor-pointer'} onClick={()=>setOpenId(r.id)}>
                        <td className={posTd}>
                          <div className="font-mono text-xs font-bold text-ink">{r.so_number}</div>
                          <div className="text-[10px] text-ink-3">{tgl(r.so_date)} • {r.invoice_number||'belum invoice'}</div>
                        </td>
                        <td className={posTd+' text-xs'}>
                          <div className="font-semibold">{r.customer_name}</div>
                          <div className="text-[10px] text-ink-3 font-mono">{r.customer_code||''}{r.created_by_name? ' • '+r.created_by_name:''}</div>
                        </td>
                        <td className={posTd+' text-center'}><PosBadge tone={r.source==='POS'? 'amber':'sky'}>{r.source}</PosBadge></td>
                        <td className={posTd+' text-center'}><PayBadge method={r.methods}/></td>
                        <td className={posTd+' text-right tabular-nums font-semibold'}>{rupiah(r.total)}</td>
                        <td className={posTd+' text-right tabular-nums text-emerald-700'}>{rupiah(paid)}</td>
                        <td className={posTd+' text-right tabular-nums '+(sisa>0.5?'text-amber-700 font-bold':'text-ink-3')}>{rupiah(sisa)}</td>
                        <td className={posTd+' text-center'}><PosBadge tone={STATUS_TONE[r.status]||'slate'}>{r.status}</PosBadge></td>
                        <td className={posTd+' text-center'}><button onClick={(e)=>{ e.stopPropagation(); setOpenId(r.id); }} className="text-[11px] font-bold text-brand hover:underline">Detail</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <PosCardBody className="flex items-center justify-between gap-2 text-xs text-ink-2">
              <span>Halaman {page} dari {totalPages} • {nf(total)} order</span>
              <div className="flex gap-1.5">
                <button disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))} className={posBtnSecondary+' h-8 px-3 text-xs disabled:opacity-40'}>Sebelumnya</button>
                <button disabled={page>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))} className={posBtnSecondary+' h-8 px-3 text-xs disabled:opacity-40'}>Berikutnya</button>
              </div>
            </PosCardBody>
          </>
        )}
      </PosCard>

      <OrderDetailModal id={openId} onClose={()=>setOpenId(null)}/>
    </div>
  );
}
