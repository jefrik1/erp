import { useEffect, useState } from 'react';
import { Search, MoreVertical, Percent, Ticket, CreditCard, X, Receipt } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { PosPageHeader } from '../components/PosUI';
import { Badge } from '../components/Layout';

function rupiah(n){ return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n||0); }
const LIMIT=20;

function DoInvoiceModal({ open, onClose, onSuccess, onErr }){
  const [dos,setDos]=useState([]); const [sel,setSel]=useState(''); const [loading,setLoading]=useState(false); const [fetching,setFetching]=useState(false);
  const [discPct,setDiscPct]=useState(0); const [voucher,setVoucher]=useState(''); const [dpPct,setDpPct]=useState(0);
  useEffect(()=>{
    if(!open) return;
    setSel(''); setDiscPct(0); setVoucher(''); setDpPct(0);
    setFetching(true);
    api.get('/logistics/deliveries').then(r=>{
      const all=Array.isArray(r.data)?r.data:[];
      setDos(all.filter(d=>d.status==='DELIVERED'));
    }).catch(()=>setDos([])).finally(()=>setFetching(false));
  },[open]);
  const submit=async()=>{
    if(!sel) return onErr('Pilih DO DELIVERED terlebih dahulu');
    setLoading(true);
    try{
      const r=await api.post('/sales/invoices',{do_id: parseInt(sel), discount_percent: discPct, voucher_code: voucher||undefined, dp_percent: dpPct});
      const d=r.data;
      onSuccess(`Invoice ${d.invoice_number} dibuat - Total ${new Intl.NumberFormat('id-ID').format(d.total)}${d.discount?` Disc ${new Intl.NumberFormat('id-ID').format(d.discount)}`:''}${d.dp_amount?` DP ${d.dp_percent}%`:''} • ${d.status}`);
      onClose();
    }catch(e){ onErr(e.response?.data?.error||e.message); }
    finally{ setLoading(false); }
  };
  if(!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40">
      <div className="bg-white rounded-[20px] w-full max-w-[480px] shadow-xl border border-[#E2E8F0] overflow-hidden max-h-[92vh] flex flex-col animate-pop">
        <div className="p-4 border-b bg-[#F8FAFC] flex justify-between gap-2 shrink-0">
          <div><div className="text-sm font-black text-[#0F172A]">Buat Invoice dari DO</div><div className="text-xs text-[#64748B]">DELIVERED → INVOICED • Diskon % + Voucher + DP % seperti POS</div></div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-full border bg-white shrink-0"><X size={14}/></button>
        </div>
        <div className="p-4 space-y-3 overflow-auto">
          {fetching ? <div className="text-xs text-[#94A3B8] p-3 text-center">Memuat DO DELIVERED...</div> : (
            <>
              <label className="space-y-1 block"><span className="text-[11px] font-bold tracking-widest text-[#64748B]">PILIH DO - DELIVERED *</span>
                <select value={sel} onChange={e=>setSel(e.target.value)} className="w-full h-[42px] px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm">
                  <option value="">- Pilih DO -</option>
                  {dos.map(d=> <option key={d.id} value={d.id}>{d.do_number} • {d.customer_name} • {d.so_number} • {d.vehicle_no||'-'}</option>)}
                </select>
              </label>
              {dos.length===0 && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2.5">Tidak ada DO DELIVERED - selesaikan POD di Logistik dulu.</div>}
              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1"><span className="text-[11px] font-bold text-[#64748B] flex items-center gap-1"><Percent size={12}/> Diskon %</span>
                  <select value={discPct} onChange={e=>setDiscPct(parseInt(e.target.value)||0)} className="w-full h-9 px-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm">
                    <option value={0}>0%</option><option value={5}>5%</option><option value={10}>10%</option><option value={15}>15%</option><option value={20}>20%</option>
                  </select>
                </label>
                <label className="space-y-1"><span className="text-[11px] font-bold text-[#64748B] flex items-center gap-1"><Ticket size={12}/> Voucher</span>
                  <input value={voucher} onChange={e=>setVoucher(e.target.value.toUpperCase())} placeholder="VOUCHER10" list="v-list-inv" className="w-full h-9 px-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm uppercase"/>
                  <datalist id="v-list-inv"><option value="VOUCHER10"/><option value="VOUCHER50"/><option value="HEMAT20"/><option value="DISKON10K"/><option value="DISKON50K"/></datalist>
                </label>
                <label className="space-y-1"><span className="text-[11px] font-bold text-[#64748B] flex items-center gap-1"><CreditCard size={12}/> DP %</span>
                  <select value={dpPct} onChange={e=>setDpPct(parseInt(e.target.value)||0)} className="w-full h-9 px-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm">
                    <option value={0}>0% Lunas</option><option value={10}>10%</option><option value={20}>20%</option><option value={30}>30%</option><option value={50}>50%</option>
                  </select>
                </label>
              </div>
              <div className="text-[11px] text-[#64748B] bg-[#F8FAFC] border rounded-xl p-2">Voucher: VOUCHER10=10rb, VOUCHER50=50rb, HEMAT20=20rb dst. Diskon % + voucher dijumlah, PPN 11% dihitung setelah diskon. DP % → invoice jadi PARTIAL.</div>
            </>
          )}
        </div>
        <div className="p-3 border-t bg-white flex justify-end gap-2 shrink-0"><button onClick={onClose} className="h-10 px-5 rounded-xl border bg-white text-sm font-semibold">Batal</button><button disabled={!sel||loading||fetching} onClick={submit} className="h-10 px-5 rounded-xl bg-[#1E40AF] text-white text-sm font-bold disabled:opacity-50 hover:bg-[#1E3A8A]">{loading?'Membuat...':'Buat Invoice'}</button></div>
      </div>
    </div>
  )
}

export default function SalesInvoices(){
  const [data,setData]=useState([]); const [total,setTotal]=useState(0); const [page,setPage]=useState(1);
  const [source,setSource]=useState(''); const [q,setQ]=useState(''); const [search,setSearch]=useState('');
  const [err,setErr]=useState(''); const [ok,setOk]=useState(''); const [payOpen,setPayOpen]=useState(false);
  const [payInv,setPayInv]=useState(null); const [payMethod,setPayMethod]=useState('TRANSFER'); const [paying,setPaying]=useState(false);
  const [loading,setLoading]=useState(false);
  const [doPickOpen,setDoPickOpen]=useState(false);
  const load=async()=>{
    setLoading(true);
    try{
      const r=await api.get('/sales/invoices',{params:{source:source||undefined, search:search||undefined, limit:LIMIT, page}});
      setData(r.data.data||[]); setTotal(r.data.total||0);
    }catch(e){ setErr(e.response?.data?.error || e.message); }
    finally{ setLoading(false); }
  };
  useEffect(()=>{ load(); },[source,search,page]);
  useEffect(()=>{ setPage(1); },[source,search]);
  const pages=Math.max(1,Math.ceil(total/LIMIT));
  const sisaOf=(inv)=> Math.max(0, Number(inv.total)-Number(inv.paid_amount));
  const isPaidInv=(inv)=> inv.status==='PAID' || sisaOf(inv)<=0.5;
  const openPay=(inv)=>{ setErr(''); setOk(''); setPayInv(inv); setPayMethod('TRANSFER'); setPayOpen(true); };
  const closePay=()=>{ if(paying) return; setPayOpen(false); setPayInv(null); };
  const confirmPay=async()=>{
    if(!payInv) return;
    const sisa=sisaOf(payInv);
    setPaying(true); setErr('');
    try{
      await api.post('/sales/invoices/'+payInv.id+'/pay',{amount: sisa, method: payMethod});
      setOk(`Pembayaran ${rupiah(sisa)} lunas - ${payInv.invoice_number} → PAID`);
      setPayOpen(false); setPayInv(null);
      load();
    }catch(e){ setErr(e.response?.data?.error || e.message); }
    finally{ setPaying(false); }
  };
  const handleKirimWA = async (inv)=>{
    let itemsText='(detail barang tidak tersedia)', addr=inv.delivery_address||'-', notes=inv.notes||'-', soNum=inv.so_number||inv.invoice_number;
    try{
      if(inv.so_id){
        const r=await api.get('/sales/orders/'+inv.so_id);
        itemsText=r.data.details?.map(d=>`• ${d.product_name} (${d.qty} x Rp ${new Intl.NumberFormat('id-ID').format(d.unit_price)})`).join('\n')||itemsText;
        addr=r.data.delivery_address||addr; notes=r.data.notes||notes; soNum=r.data.so_number||soNum;
      }
    }catch{}
    const sisa=sisaOf(inv);
    const phone=(inv.customer_phone||'').replace(/^0/,'62').replace(/[^0-9]/g,'');
    const doLine = inv.do_number ? `\nDO: ${inv.do_number}` : '';
    const msg=`Pesanan #${soNum}${doLine}\nTanggal: ${inv.invoice_date?.slice(0,10)}\nPelanggan: ${inv.customer_name}\nAlamat Pengiriman:\n${addr}\n\n📦 BARANG YANG DIPESAN:\n${itemsText}\n\n📝 CATATAN:\n${notes}\n\n💰 RINGKASAN PEMBAYARAN:\nTotal: ${rupiah(inv.total)}\nDP/Terbayar: ${rupiah(inv.paid_amount)}\nSisa: ${rupiah(sisa)}\nStatus: ${inv.status}\n\nTerima kasih! 🙏`;
    const url = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url,'_blank');
  };

  return (
    <div className="space-y-3">
      <PosPageHeader icon={Receipt} title="Invoice (AR)" subtitle={`${total||0} invoice • halaman ${page}/${pages} • DO status DELIVERED bisa di-Invoice DO`}/>

      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="p-3 sm:p-4">
          <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
            <div className="flex-1 relative min-w-0">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <input
                value={q}
                onChange={e=>setQ(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&(setSearch(q),setPage(1))}
                placeholder="Cari invoice / pelanggan / DO / kode..."
                className="w-full h-[42px] pl-9 pr-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[13px] placeholder:text-[#94A3B8] outline-none focus:bg-white focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/10 transition"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button onClick={()=>{setSearch(q); setPage(1);}} className="h-[42px] px-5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-semibold text-[#334155] hover:bg-[#F8FAFC]">Cari</button>
              {search && <button onClick={()=>{setQ(''); setSearch('');}} className="h-[42px] w-[42px] grid place-items-center bg-white border border-[#E2E8F0] rounded-xl text-[#64748B] hover:bg-[#F8FAFC] shrink-0"><X size={14}/></button>}
              <button onClick={()=>setSource('')} className={"h-[42px] px-5 rounded-xl text-xs font-bold border whitespace-nowrap "+(source===''?"bg-[#1E40AF] text-white border-[#1E40AF] shadow":"bg-white text-[#334155] border-[#E2E8F0] hover:bg-[#F8FAFC]")}>SEMUA</button>
              <button onClick={()=>setSource(source==='pos'?'':'pos')} className={"h-[42px] px-5 rounded-xl text-xs font-bold border whitespace-nowrap "+(source==='pos'?"bg-[#1E40AF] text-white border-[#1E40AF] shadow":"bg-white text-[#334155] border-[#E2E8F0] hover:bg-[#F8FAFC]")}>POS saja</button>
              <button onClick={()=>{setErr(''); setOk(''); setDoPickOpen(true);}} className="h-[42px] px-4 bg-amber-500 text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-amber-600 whitespace-nowrap">+ Invoice DO</button>
              <Link to="/sales/orders/new" className="h-[42px] px-5 bg-[#1E40AF] text-white rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold shadow-sm hover:bg-[#1E3A8A] whitespace-nowrap">
                <span className="text-lg leading-none -mt-0.5">+</span> Buat Invoice
              </Link>
            </div>
          </div>
        </div>

        {err && <div className="mx-3 sm:mx-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-xl text-sm">{err}</div>}
        {ok && <div className="mx-3 sm:mx-4 bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2.5 rounded-xl text-sm">{ok}</div>}

        <div className="mt-3 border-t border-[#E2E8F0] overflow-hidden">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F1F5F9] border-b border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]">
                  <th className="text-left px-4 py-3 whitespace-nowrap">INVOICE / DO</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">PELANGGAN</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">TGL</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">JATUH TEMPO</th>
                  <th className="text-right px-4 py-3 whitespace-nowrap">TOTAL</th>
                  <th className="text-right px-4 py-3 whitespace-nowrap">DP / TERBAYAR</th>
                  <th className="text-right px-4 py-3 whitespace-nowrap">SISA</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">STATUS</th>
                  <th className="text-right px-4 py-3 whitespace-nowrap">AKSI</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={9} className="p-8 text-center text-sm text-[#94A3B8]">Memuat...</td></tr>}
                {!loading && data.length===0 && <tr><td colSpan={9} className="p-8 text-center text-sm text-[#94A3B8]">Tidak ada invoice {source==='pos'?'POS':''} {search?`untuk "${search}"`:''}</td></tr>}
                {!loading && data.map((inv,idx)=>{ const sisa=sisaOf(inv); const isPaid=isPaidInv(inv); return (
                  <tr key={inv.id} className={"border-b border-[#F1F5F9] transition hover:bg-[#F8FAFC] "+(idx%2===1?"bg-[#F8FAFC]/70":"bg-white")}>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[13px] font-bold text-[#0F172A] tracking-tight leading-none">{inv.invoice_number}</span>
                        {inv.is_pos && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] leading-none">POS</span>}
                      </div>
                      <div className="text-[11px] text-[#94A3B8] font-mono leading-none mt-1">{inv.so_number||''}</div>
                      {inv.do_number && <div className="mt-1.5 flex flex-col gap-1 items-start"><span className="inline-flex items-center whitespace-nowrap text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono leading-none">{inv.do_number}</span><span className="inline-flex items-center whitespace-nowrap text-[10px] px-2 py-0.5 rounded-full bg-indigo-600 text-white font-bold leading-none">DO INVOICED</span></div>}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="font-semibold text-[13px] text-[#0F172A] leading-none truncate max-w-[180px]">{inv.customer_name}</div>
                      <div className="text-[11px] text-[#64748B] font-mono mt-1">{inv.customer_code||''}</div>
                    </td>
                    <td className="px-4 py-3 align-middle text-[13px] text-[#334155] whitespace-nowrap">{inv.invoice_date?.slice(0,10)}</td>
                    <td className="px-4 py-3 align-middle text-[13px] text-[#334155] whitespace-nowrap">{inv.due_date?.slice(0,10)}</td>
                    <td className="px-4 py-3 align-middle text-right font-bold text-[13px] text-[#0F172A] whitespace-nowrap">{rupiah(inv.total)}</td>
                    <td className="px-4 py-3 align-middle text-right text-[13px] text-[#64748B] whitespace-nowrap">{rupiah(inv.paid_amount)}</td>
                    <td className={"px-4 py-3 align-middle text-right font-bold text-[13px] whitespace-nowrap "+(sisa<=0.5?"text-[#059669]":"text-[#D97706]")}>{rupiah(sisa)}</td>
                    <td className="px-4 py-3 align-middle">
                      {isPaid ? <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border bg-[#DCFCE7] text-[#0F7A43] border-[#BBF7D0] tracking-wide">PAID</span>
                      : <Badge status={inv.status==='PARTIAL' ? 'PARTIAL' : inv.status} />}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center justify-end gap-2">
                        {!isPaid ? (
                          <button onClick={()=>openPay(inv)} className="h-7 px-3.5 rounded-full bg-[#1E40AF] text-white text-xs font-bold hover:bg-[#1E3A8A] whitespace-nowrap">Bayar</button>
                        ) : (
                          <button onClick={()=>handleKirimWA(inv)} className="h-7 px-3.5 rounded-full bg-[#059669] text-white text-xs font-bold hover:bg-[#047857] whitespace-nowrap">Kirim WA</button>
                        )}
                        <button onClick={()=>handleKirimWA(inv)} aria-label="Lainnya" className="w-7 h-7 grid place-items-center rounded-full hover:bg-[#F1F5F9] text-[#94A3B8] hover:text-[#334155] transition"><MoreVertical size={14} /></button>
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-[#F8FAFC] border-t border-[#E2E8F0] text-xs">
            <div className="text-[#64748B]">{data.length?`Menampilkan ${(page-1)*LIMIT+1}-${(page-1)*LIMIT+data.length} dari ${total}`:`0 dari ${total}`}</div>
            <div className="flex items-center gap-1">
              <button disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))} className="h-8 px-3 bg-white border border-[#E2E8F0] rounded-lg text-xs font-bold disabled:opacity-40 hover:bg-[#F8FAFC]">‹ Prev</button>
              <span className="h-8 px-3 grid place-items-center text-xs font-bold text-[#334155]">{page} / {pages}</span>
              <button disabled={page>=pages} onClick={()=>setPage(p=>p+1)} className="h-8 px-3 bg-white border border-[#E2E8F0] rounded-lg text-xs font-bold disabled:opacity-40 hover:bg-[#F8FAFC]">Next ›</button>
            </div>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-[#94A3B8]">Alur DO: <span className="px-1.5 py-0.5 rounded bg-sky-50 border text-sky-700 font-bold">IN_TRANSIT</span> → <span className="px-1.5 py-0.5 rounded bg-emerald-50 border text-emerald-700 font-bold">DELIVERED</span> (POD) → <span className="px-1.5 py-0.5 rounded bg-indigo-50 border text-indigo-700 font-bold">INVOICED</span> (Invoice DO). SO otomatis <b>COMPLETED</b> saat semua DO DELIVERED/INVOICED. Badge <span className="px-1.5 py-0.5 rounded bg-[#FEF3C7] border border-[#FDE68A] text-[11px] font-bold text-[#92400E]">POS</span> = dari kasir.</p>

      <DoInvoiceModal open={doPickOpen} onClose={()=>setDoPickOpen(false)} onSuccess={(m)=>{setOk(m); load();}} onErr={setErr}/>

      {payOpen && payInv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closePay} />
          <div className="relative bg-white rounded-[20px] shadow-2xl w-full max-w-md overflow-hidden animate-pop">
            <div className="px-6 pt-6 pb-4">
              <div className="w-12 h-12 rounded-full bg-[#1E40AF]/10 grid place-items-center mb-3">💳</div>
              <h3 className="text-lg font-black text-[#0F172A]">Konfirmasi Pembayaran</h3>
              <p className="text-sm text-[#64748B] mt-1">Invoice <span className="font-mono font-bold text-[#0F172A]">{payInv.invoice_number}</span> • {payInv.customer_name} {payInv.do_number?`• ${payInv.do_number}`:''}</p>
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 mt-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-[#64748B]">Total</span><span className="font-bold text-[#0F172A]">{rupiah(payInv.total)}</span></div>
                <div className="flex justify-between"><span className="text-[#64748B]">Sudah bayar</span><span className="text-[#059669] font-semibold">{rupiah(payInv.paid_amount)}</span></div>
                <div className="flex justify-between border-t border-[#E2E8F0] pt-2 text-base"><span className="font-bold text-[#0F172A]">Sisa yang akan dibayar</span><span className="font-black text-[#1E40AF]">{rupiah(sisaOf(payInv))}</span></div>
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">Pembayaran harus melunasi sisa penuh (tidak bisa partial).</div>
              </div>
              <label className="block mt-4 text-xs font-bold text-[#475569]">Metode pembayaran</label>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                {['TRANSFER','CASH','QRIS'].map(m=>(
                  <button key={m} onClick={()=>setPayMethod(m)} className={`h-10 rounded-xl border text-xs font-bold transition ${payMethod===m?'bg-[#1E40AF] text-white border-[#1E40AF]':'bg-white hover:bg-[#F8FAFC] text-[#334155] border-[#E2E8F0]'}`}>{m}</button>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 bg-[#F8FAFC] border-t border-[#E2E8F0] flex justify-end gap-2">
              <button onClick={closePay} disabled={paying} className="h-10 px-5 rounded-xl border bg-white text-sm font-semibold disabled:opacity-50">Batal</button>
              <button onClick={confirmPay} disabled={paying} className="h-10 px-6 rounded-xl bg-[#1E40AF] text-white text-sm font-bold disabled:opacity-50">{paying?'Memproses...':`Bayar ${rupiah(sisaOf(payInv))}`}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
