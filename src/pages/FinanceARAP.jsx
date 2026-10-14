import { useEffect, useState, useMemo } from 'react';
import { FileText, Scale } from 'lucide-react';
import api from '../lib/api';
import { useDialog } from '../components/DialogProvider';
import FileDescriptionIcon from '../icons/hover/file-description-icon';
import WalletIcon from '../icons/hover/wallet-icon';
import ChartLineIcon from '../icons/hover/chart-line-icon';
import TriangleAlertIcon from '../icons/hover/triangle-alert-icon';
import ExternalLinkIcon from '../icons/hover/external-link-icon';
import ArrowNarrowRightIcon from '../icons/hover/arrow-narrow-right-icon';
import RefreshIcon from '../icons/hover/refresh-icon';
function rupiah(n){ return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n||0); }
export default function FinanceARAP(){
  const [ar,setAr]=useState([]); const [ap,setAp]=useState([]); const [cash,setCash]=useState([]); const [pl,setPl]=useState(null); const [tb,setTb]=useState([]);
  const dialog=useDialog();
  const [payOpen,setPayOpen]=useState(null);
  const [payAmt,setPayAmt]=useState(''); const [payBank,setPayBank]=useState('');
  const [dueOpen,setDueOpen]=useState(null); const [dueVal,setDueVal]=useState('');
  const openDue=(a)=>{ setDueOpen(a); setDueVal(String(a.due_date||'').slice(0,10)); };
  const saveDue=async()=>{
    if(!dueOpen || !dueVal) return;
    try{ await api.patch(`/finance/ar/${dueOpen.id}/due-date`,{due_date: dueVal}); setDueOpen(null); load(); }
    catch(e){ await dialog.alert(e.response?.data?.error||e.message,{title:'Gagal ubah jatuh tempo'}); }
  };
  const load=()=>{
    api.get('/finance/ar').then(r=>{
      const d=Array.isArray(r.data)?r.data:(Array.isArray(r.data?.data)?r.data.data:[]);
      setAr(d);
    }).catch(()=>setAr([]));
    api.get('/finance/ap').then(r=>setAp(Array.isArray(r.data)?r.data:[])).catch(()=>setAp([]));
    api.get('/finance/cash').then(r=>setCash(Array.isArray(r.data)?r.data:[])).catch(()=>setCash([]));
    api.get('/finance/profit-loss').then(r=>setPl(r.data)).catch(()=>{});
    api.get('/finance/trial-balance').then(r=>setTb(Array.isArray(r.data)?r.data:[])).catch(()=>setTb([]));
  };
  useEffect(()=>{ load(); },[]);
  // ponytail: AR POS/DO/SO only — no dummy seed/clear; data from POST /pos & POST /sales/invoices (DO)
  const doPay=async()=>{
    const a=ap.find(x=> String(x.id)===String(payOpen?.id) && x.source===payOpen?.source) || payOpen;
    const payload = a.source==='PURCHASE' ? {purchase_invoice_id:a.id, amount: parseFloat(payAmt)||a.total, bank_account_id: payBank? parseInt(payBank): undefined} : {po_id:a.po_id||a.id, amount: parseFloat(payAmt)||a.total, bank_account_id: payBank? parseInt(payBank): undefined};
    try{
      const r=await api.post('/finance/ap/pay', payload);
      await dialog.alert(`Bayar ${r.data.payment_number} • ${rupiah(r.data.amount)} berhasil. Saldo bank & jurnal terupdate.`,{title:'Pembayaran OK'});
      setPayOpen(null); load();
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message,{title:'Gagal bayar'}); }
  };
  const tbTotals = useMemo(()=>{
    let d=0,c=0; for(const a of tb){ d+=parseFloat(a.debit||0); c+=parseFloat(a.credit||0); } return {d,c, balanced: Math.abs(d-c)<0.5 && (d>0||c>0)};
  },[tb]);
  const arTotal = useMemo(()=> ar.reduce((s,a)=> s + parseFloat((a.outstanding ?? (a.total - (a.paid_amount||0))) || 0),0),[ar]);
  const arPartial = useMemo(()=> ar.filter(a=> String(a.status).toUpperCase()==='PARTIAL'),[ar]);
  const [arFilter,setArFilter]=useState('all');
  const arShown = arFilter==='partial' ? arPartial : ar;
  const arShownTotal = useMemo(()=> arShown.reduce((s,a)=> s + parseFloat((a.outstanding ?? (a.total - (a.paid_amount||0))) || 0),0),[arShown]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white grid place-items-center shrink-0 shadow-sm"><div className="text-white [&_svg]:!stroke-white"><FileDescriptionIcon size={18} /></div></div><div><h1 className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0F172A] leading-none">Finance • AR / AP / Cash / Laporan</h1><p className="text-xs text-[#64748B] mt-1">AR = tagih customer • AP = bayar supplier (3-way) • Cash = saldo bank • Trial Balance = cek keseimbangan debit-kredit sebelum tutup buku</p></div></div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-5">
          <h3 className="font-black text-sm flex items-center gap-1.5"><WalletIcon size={16} /> Cash & Bank <span className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#F1F5F9] border">{cash.length} rekening</span></h3>
          <p className="text-[11px] text-[#64748B] mt-1">Saldo real bank. Bayar AP → saldo berkurang + jurnal <b>Dr Hutang / Cr Kas</b>.</p>
          <div className="mt-3 space-y-2">{(Array.isArray(cash)?cash:[]).map(c=>(
            <div key={c.id} className="flex justify-between items-center p-3 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0]"><div><div className="font-bold text-sm">{c.bank_name} • {c.account_no}</div><div className="text-xs text-[#64748B]">{c.account_name}</div></div><div className="font-black text-sm text-[#0F172A]">{rupiah(c.balance)}</div></div>
          ))}{cash.length===0 && <div className="text-xs text-[#94A3B8] py-4 text-center border border-dashed rounded-xl">Belum ada bank</div>}</div>
        </div>
        <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-5 lg:col-span-2">
          <h3 className="font-black text-sm flex items-center gap-1.5"><ChartLineIcon size={16} /> Laba Rugi (ringkas) <span className="ml-auto text-[11px] text-[#94A3B8] font-normal">Sumber: invoices</span></h3>
          <p className="text-[11px] text-[#64748B] mt-1">Pendapatan dari invoice penjualan • HPP & Opex estimasi • Laba bersih realtime.</p>
          {pl ? <div className="mt-3 space-y-2 text-sm"><div className="flex justify-between py-1"><span className="text-[#64748B]">Pendapatan (Revenue)</span><span className="font-bold">{rupiah(pl.revenue)}</span></div><div className="flex justify-between py-1"><span className="text-[#64748B]">HPP (≈75%)</span><span className="font-mono">-{rupiah(pl.cogs)}</span></div><div className="flex justify-between font-bold border-t border-[#E2E8F0] pt-2 mt-1"><span>Laba Kotor</span><span className="text-emerald-700">{rupiah(pl.gross_profit)}</span></div><div className="flex justify-between py-1"><span className="text-[#64748B]">Beban Operasional (≈8%)</span><span className="font-mono">-{rupiah(pl.opex)}</span></div><div className="flex justify-between font-black text-[15px] bg-[#0F172A] text-white rounded-xl p-3 mt-2"><span>Laba Bersih</span><span>{rupiah(pl.net_profit)}</span></div></div> : <div className="text-xs text-[#94A3B8] py-6 text-center">Memuat...</div>}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Aging tetap tampil — hapus hanya DB via clearAR; ponytail: UI tidak di-hide */}
        <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b bg-[#F8FAFC]">
            <div className="flex items-center gap-2 flex-wrap"><span className="font-black text-sm flex items-center gap-1"><FileDescriptionIcon size={16}/> Aging Piutang (AR)</span><span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-bold">SENT / PARTIAL</span><span className="text-[10px] px-2 py-1 rounded-full bg-white border text-[#64748B] font-bold">{ar.length} tertagih • {arPartial.length} PARTIAL</span><span className="text-[10px] px-2 py-1 rounded-full bg-slate-50 border font-mono text-[#64748B]">POS / DO / SO</span><button onClick={load} className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-white border hover:bg-[#F8FAFC] font-bold"><RefreshIcon size={12}/> Refresh</button><a href="/sales/invoices" className="ml-auto text-[11px] text-[#2563EB] font-bold flex items-center gap-1 hover:underline">Lihat Invoice <ExternalLinkIcon size={12}/></a></div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-full bg-[#0F172A] text-white font-black">{ar.length} belum lunas</span>
              <span className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 font-bold">{arPartial.length} PARTIAL</span>
              <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 font-bold">Sisa {rupiah(arTotal)}</span>
              {arPartial.length>0 && <button onClick={()=>setArFilter(arFilter==='partial'?'all':'partial')} className={"ml-auto h-7 px-3 rounded-full border text-[11px] font-bold "+(arFilter==='partial'?"bg-amber-500 text-white border-amber-500":"bg-white text-[#334155] hover:bg-[#F8FAFC]")}>{arFilter==='partial'?'Tampilkan SEMUA':'Hanya PARTIAL'}</button>}
            </div>
            {arShown.length>0 && arFilter==='partial' && <div className="mt-1 text-[11px] text-amber-700">Menampilkan <b>{arShown.length} PARTIAL</b> • total sisa {rupiah(arShownTotal)}</div>}
          </div>
          <div className="overflow-auto max-h-[360px]">
            <table className="w-full text-xs"><thead className="sticky top-0 bg-[#F1F5F9]"><tr className="border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><th className="p-2.5 text-left">INVOICE</th><th className="p-2.5 text-left">CUSTOMER</th><th className="p-2.5 text-right">SISA TAGIH</th><th className="p-2.5 text-center">JATUH TEMPO</th></tr></thead><tbody>
            {(Array.isArray(arShown)?arShown:[]).map(a=>{
              const outstanding= parseFloat(a.outstanding ?? (parseFloat(a.total||0)-parseFloat(a.paid_amount||0)));
              const overdue= parseInt(a.overdue_days||0);
              const isPartial = String(a.status).toUpperCase()==='PARTIAL';
              const isSent = String(a.status).toUpperCase()==='SENT';
              const canEditDue = isPartial || isSent || String(a.status).toUpperCase()==='OVERDUE';
              const isPos = !!a.is_pos;
              return (
              <tr key={a.id} className={"border-b hover:bg-[#F8FAFC] "+(isPartial?"bg-amber-50/40":"bg-white")}><td className="p-2.5"><div className="flex items-center gap-1 flex-wrap"><span className="font-mono font-bold text-[#0F172A]">{a.invoice_number}</span>{isPos && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] font-bold">POS</span>}{isPartial && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500 text-white font-bold">PARTIAL</span>}</div><div className="text-[11px] text-[#64748B]">{a.status} • {String(a.due_date||'').slice(0,10)} {a.so_number?`• ${a.so_number}`:''} {a.discount_pct?`• Disc ${a.discount_pct}%`:''} {a.voucher_code?`• ${a.voucher_code}`:''}</div></td><td className="p-2.5"><div className="font-semibold">{a.customer_name}</div><div className="text-[11px] text-[#64748B] font-mono">{a.customer_code||''}</div></td><td className="p-2.5 text-right"><div className="font-black text-[#0F172A]">{rupiah(outstanding)}</div><div className="text-[11px] text-[#94A3B8]">Total {rupiah(a.total)} • Bayar {rupiah(a.paid_amount)}</div></td><td className="p-2.5 text-center"><div className="flex flex-col items-center gap-1"><span className={"inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold border "+(overdue>0?"bg-red-50 text-red-700 border-red-200":overdue>= -7?"bg-amber-50 text-amber-700 border-amber-200":"bg-emerald-50 text-emerald-700 border-emerald-200")}>{overdue>0? overdue+' hari overdue': overdue===0? 'Jatuh tempo hari ini' : Math.abs(overdue)+' hari lagi'}</span>{canEditDue && <button onClick={()=>openDue(a)} className="text-[10px] px-2 py-0.5 rounded-full bg-white border font-bold text-[#2563EB] hover:bg-[#F1F5F9]">Atur jatuh tempo</button>}</div></td></tr>
            )})}
            {arShown.length===0 && ar.length===0 && <tr><td colSpan={4} className="p-8 text-center"><div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 grid place-items-center mx-auto text-emerald-600"><FileText size={18}/></div><div className="text-sm font-bold mt-2">Tidak ada piutang tertunda</div><div className="text-xs text-[#64748B] mt-1">Semua invoice sudah <b>PAID</b> atau belum ada invoice SENT/PARTIAL.<br/>Buat invoice di <a href="/sales/invoices" className="text-[#2563EB] underline">Sales → Invoice</a> lalu piutang muncul di sini.</div><div className="text-[11px] text-[#94A3B8] mt-2">Tip: invoice <b>PARTIAL</b> dari POS (DP) maupun tambah Invoice (DO + DP) sama-sama masuk aging.</div></td></tr>}
            {arShown.length===0 && ar.length>0 && <tr><td colSpan={4} className="p-6 text-center text-xs text-[#94A3B8]">Tidak ada data untuk filter ini • <button onClick={()=>setArFilter('all')} className="text-[#2563EB] underline">tampilkan semua</button></td></tr>}
            </tbody></table>
          </div>
        </div>

        {/* AP */}
        <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b bg-[#F8FAFC]">
            <div className="flex items-center gap-2"><span className="font-black text-sm">Hutang Usaha (AP)</span><span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 border border-sky-200 font-bold">3-way result</span><span className="ml-auto text-[11px] text-[#64748B]">MATCHED → Bayar • HOLD blokir</span></div>
            <p className="text-[11px] text-[#64748B] mt-1 leading-relaxed">Fungsi: <b>daftar hutang ke supplier</b> hasil 3-way matching (PO ↔ GRN ↔ Invoice). <b>MATCHED/APPROVED/RECEIVED</b> = siap bayar → potong bank + jurnal. <b>HOLD</b> = harga/qty beda, fix di Penerimaan.</p>
          </div>
          <div className="overflow-auto max-h-[360px]"><table className="w-full text-xs"><thead className="sticky top-0 bg-[#F1F5F9]"><tr className="border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><th className="p-2.5 text-left">DOKUMEN</th><th className="p-2.5">SUPPLIER</th><th className="p-2.5 text-right">TOTAL</th><th className="p-2.5 text-center">STATUS</th><th className="p-2.5 text-center">AKSI</th></tr></thead><tbody>{(Array.isArray(ap)?ap:[]).map(a=>(
            <tr key={a.source+'-'+a.id} className="border-b bg-white hover:bg-[#F8FAFC]"><td className="p-2.5 font-mono"><span className="font-bold text-[#0F172A]">{a.doc_number}</span><div className="text-[11px] text-[#94A3B8]">{a.source==='PURCHASE'? a.doc_number : a.po_number} {a.due_date? '• '+String(a.due_date).slice(0,10):''}</div></td><td className="p-2.5 text-center">{a.supplier_name}</td><td className="p-2.5 text-right font-bold">{rupiah(a.total)}</td><td className="p-2.5 text-center"><span className={"px-2.5 py-1 rounded-full text-[11px] font-bold border whitespace-nowrap "+(a.status==='MATCHED'?"bg-emerald-50 text-emerald-700 border-emerald-200":a.status==='HOLD'?"bg-red-50 text-red-700 border-red-200":a.status==='APPROVED'?"bg-sky-50 text-sky-700 border-sky-200":"bg-amber-50 text-amber-700 border-amber-200")}>{a.status}</span></td><td className="p-2.5 text-center">
              {a.status==='HOLD' ? <div className="flex flex-col items-center gap-1"><span className="text-[10px] text-red-600 font-bold">Qty/harga ≠ diterima</span><div className="flex gap-1"><a href="/purchase/receipts" className="px-2 py-1 bg-white border rounded-full text-[11px] font-bold hover:bg-[#F8FAFC]">3-Way</a><button onClick={async()=>{
                if(a.source!=='PURCHASE'){ await dialog.alert('HOLD di PO tanpa invoice — buat/benarkan GRN qty di Penerimaan.',{title:'HOLD PO'}); return; }
                const ok=await dialog.confirm('Approve selisih? Bayar akan sesuai barang DITERIMA (total invoice sekarang), bukan qty PO. Selisih dicatat variance. Lanjutkan?',{title:'Approve HOLD — bayar sesuai diterima', confirmText:'Ya, approve'});
                if(!ok) return;
                try{
                  const r=await api.post(`/purchase/invoices/${a.id}/approve`);
                  await dialog.alert(r.data.note||'Invoice di-approve — sekarang bisa Bayar sesuai diterima.',{title:'Approved'});
                  load();
                }catch(e){ await dialog.alert(e.response?.data?.error||e.message,{title:'Gagal'}); }
              }} className="px-2 py-1 bg-amber-500 text-white rounded-full text-[11px] font-bold hover:bg-amber-600">Approve selisih</button></div></div> : <button onClick={()=>{ setPayOpen(a); setPayAmt(String(a.total)); setPayBank(String(cash[0]?.id||'')); }} className="px-3 py-1.5 bg-[#1E40AF] text-white rounded-full text-xs font-bold hover:bg-blue-800">Bayar {rupiah(a.total)}</button>}
            </td></tr>
          ))}{ap.length===0 && <tr><td colSpan={5} className="p-6 text-center text-[#94A3B8]">Tidak ada AP — buat GRN + Invoice MATCHED dulu di Receipt</td></tr>}</tbody></table></div>

        </div>
      </div>

      {/* Trial Balance */}
      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-[#F8FAFC] flex flex-wrap gap-3 items-start">
          <div className="flex-1 min-w-[220px]">
            <div className="font-black text-sm flex items-center gap-1.5"><Scale size={16} className="text-[#0F172A]"/> Trial Balance <span className="text-[10px] px-2 py-0.5 rounded-full bg-white border font-bold tracking-widest text-[#64748B]">NERACA SALDO</span> <a href="/finance/journals" className="ml-auto inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#0F172A] text-white text-xs font-bold hover:bg-black">Lihat Jurnal <ArrowNarrowRightIcon size={12}/></a></div>
            <p className="text-[11px] text-[#64748B] mt-1 leading-relaxed">Fungsi: <b>cek keseimbangan akuntansi</b> — jumlah <b>DEBIT harus = KREDIT</b>. Sumber: <b>jurnal</b> (penjualan, bayar hutang, dll). Jika tidak balance, jangan tutup buku. Di screenshot: Kas & Bank di <b>KREDIT 943.500</b> vs Hutang di <b>DEBIT 943.500</b> = jurnal Bayar AP (Dr Hutang / Cr Kas) — sudah balance.</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <span className={"inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black border "+(tbTotals.balanced?"bg-emerald-50 text-emerald-700 border-emerald-200":"bg-amber-50 text-amber-700 border-amber-200")}>{tbTotals.balanced?'✓ Seimbang':'⚠ Tidak seimbang'} <span className="font-mono text-[11px]">{rupiah(tbTotals.d)} / {rupiah(tbTotals.c)}</span></span>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#F1F5F9] sticky top-0"><tr className="border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]"><th className="p-2.5 text-left">KODE</th><th className="p-2.5 text-left">AKUN</th><th className="p-2.5 text-left">TIPE</th><th className="p-2.5 text-right">DEBIT</th><th className="p-2.5 text-right">KREDIT</th><th className="p-2.5 text-right">SALDO</th></tr></thead>
            <tbody>
              {(Array.isArray(tb)?tb:[]).map(a=>{
                const d=parseFloat(a.debit||0), c=parseFloat(a.credit||0);
                const saldo=d-c;
                const typeColor=a.type==='ASSET'?'bg-emerald-50 text-emerald-700 border-emerald-200':a.type==='LIABILITY'?'bg-amber-50 text-amber-700 border-amber-200':a.type==='EQUITY'?'bg-sky-50 text-sky-700 border-sky-200':a.type==='REVENUE'?'bg-violet-50 text-violet-700 border-violet-200':'bg-slate-50 text-slate-700 border-slate-200';
                return (
                <tr key={a.code} className="border-b bg-white hover:bg-[#F8FAFC]"><td className="p-2.5 font-mono font-black text-[#0F172A]">{a.code}</td><td className="p-2.5 font-semibold">{a.name}</td><td className="p-2.5"><span className={"text-[10px] px-1.5 py-0.5 rounded-full border font-bold "+typeColor}>{a.type||'-'}</span></td><td className="p-2.5 text-right font-mono">{d>0? rupiah(d):<span className="text-[#CBD5E1]">—</span>}</td><td className="p-2.5 text-right font-mono">{c>0? rupiah(c):<span className="text-[#CBD5E1]">—</span>}</td><td className={"p-2.5 text-right font-black font-mono "+(saldo>0?"text-[#0F172A]":saldo<0?"text-red-600":"text-[#94A3B8]")}>{saldo!==0? (saldo>0? 'D '+rupiah(saldo):'K '+rupiah(Math.abs(saldo))): '0'}</td></tr>
              )})}
              {tb.length===0 && <tr><td colSpan={6} className="p-8 text-center text-[#94A3B8]">Belum ada jurnal</td></tr>}
            </tbody>
            {tb.length>0 && <tfoot className="bg-[#0F172A] text-white font-black"><tr><td colSpan={3} className="p-2.5 text-right tracking-widest text-[11px]">TOTAL</td><td className="p-2.5 text-right font-mono">{rupiah(tbTotals.d)}</td><td className="p-2.5 text-right font-mono">{rupiah(tbTotals.c)}</td><td className={"p-2.5 text-right font-mono "+(tbTotals.balanced?"text-emerald-300":"text-amber-300")}>{tbTotals.balanced?'✓ BALANCE':'SELISIH '+rupiah(Math.abs(tbTotals.d-tbTotals.c))}</td></tr></tfoot>}
          </table>
        </div>
        <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-200 text-[11px] leading-relaxed text-amber-800 flex gap-2"><TriangleAlertIcon size={14} className="shrink-0 mt-0.5"/> <span><b>Cara baca:</b> 1-1000 Kas & Bank = uang di bank • 2-1000 Hutang = hutang supplier. Saat bayar, jurnal <b>Dr Hutang 943.500 / Cr Kas 943.500</b> → dua sisi muncul di tabel. Jika DEBIT ≠ KREDIT, cek jurnal belum posted / salah input.</span></div>
      </div>

      {payOpen && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50" onClick={()=>setPayOpen(null)}><div onClick={e=>e.stopPropagation()} className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3">
        <h3 className="font-black">Bayar Hutang — {payOpen.doc_number} • {payOpen.supplier_name}</h3>
        <p className="text-xs text-[#64748B]">MATCHED → boleh bayar. HOLD terblokir. Bayar → potong saldo Bank + jurnal.</p>
        <label className="block space-y-1"><span className="text-[11px] font-bold text-[#64748B]">Nominal</span><input type="number" value={payAmt} onChange={e=>setPayAmt(e.target.value)} className="w-full h-10 px-3 border rounded-xl text-sm"/></label>
        <label className="block space-y-1"><span className="text-[11px] font-bold text-[#64748B]">Bank</span><select value={payBank} onChange={e=>setPayBank(e.target.value)} className="w-full h-10 px-3 border rounded-xl text-sm">{cash.map(c=> <option key={c.id} value={c.id}>{c.bank_name} • {c.account_no} — {rupiah(c.balance)}</option>)}</select></label>
        <div className="flex justify-end gap-2"><button onClick={()=>setPayOpen(null)} className="h-10 px-5 bg-white border rounded-xl text-sm font-semibold">Batal</button><button onClick={doPay} className="h-10 px-6 bg-[#1E40AF] text-white rounded-xl text-sm font-bold">Konfirmasi Bayar</button></div>
      </div></div>}
      {dueOpen && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50" onClick={()=>setDueOpen(null)}><div onClick={e=>e.stopPropagation()} className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3">
        <h3 className="font-black">Atur Jatuh Tempo — {dueOpen.invoice_number}</h3>
        <p className="text-xs text-[#64748B]">Hanya <b>SENT / PARTIAL / OVERDUE</b> • {dueOpen.customer_name} • Sisa {rupiah(dueOpen.outstanding||0)}</p>
        <label className="block space-y-1"><span className="text-[11px] font-bold text-[#64748B]">Jatuh Tempo</span><input type="date" value={dueVal} onChange={e=>setDueVal(e.target.value)} className="w-full h-10 px-3 border rounded-xl text-sm"/></label>
        <div className="flex justify-end gap-2"><button onClick={()=>setDueOpen(null)} className="h-10 px-5 bg-white border rounded-xl text-sm font-semibold">Batal</button><button onClick={saveDue} className="h-10 px-6 bg-[#1E40AF] text-white rounded-xl text-sm font-bold">Simpan</button></div>
      </div></div>}
    </div>
  )
}
