import { useEffect, useState, useMemo } from 'react';
import { FileText, Scale, Check, AlertTriangle, Wallet, LineChart, ExternalLink, ArrowRight, RefreshCw, X, ArrowRightLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { PosPageHeader } from '../components/PosUI';
import { useDialog } from '../components/DialogProvider';
import { useAuth } from '../store/auth';
import { canAccess } from '../config/access';
function rupiah(n){ return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n||0); }
export default function FinanceARAP(){
  const [ar,setAr]=useState([]); const [ap,setAp]=useState([]); const [cash,setCash]=useState([]); const [pl,setPl]=useState(null); const [tb,setTb]=useState([]);
  const [cashMoves,setCashMoves]=useState([]);
  const [depositOpen,setDepositOpen]=useState(false);
  const [depAmount,setDepAmount]=useState(''); const [depBank,setDepBank]=useState(''); const [depNotes,setDepNotes]=useState(''); const [depBusy,setDepBusy]=useState(false);
  const roles = useAuth(s=>s.user)?.roles || [];
  const canDeposit = canAccess(roles, ['finance','direktur','super_admin']);
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
    api.get('/finance/cash/movements').then(r=>setCashMoves(Array.isArray(r.data?.data)?r.data.data:[])).catch(()=>setCashMoves([]));
    api.get('/finance/profit-loss').then(r=>setPl(r.data)).catch(()=>{});
    api.get('/finance/trial-balance').then(r=>setTb(Array.isArray(r.data)?r.data:[])).catch(()=>setTb([]));
  };
  useEffect(()=>{ load(); },[]);
  // ponytail: AR POS/DO/SO only - no dummy seed/clear; data from POST /pos & POST /sales/invoices (DO)
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

  // Kas tunai vs rekening bank (kolom kind dari /finance/cash)
  const cashAcc = useMemo(()=> (cash||[]).find(c=> String(c.kind||'BANK').toUpperCase()==='CASH') || null, [cash]);
  const banks = useMemo(()=> (cash||[]).filter(c=> String(c.kind||'BANK').toUpperCase()!=='CASH'), [cash]);
  const saldoKas = Number(cashAcc?.balance||0);

  const doDeposit = async ()=>{
    const amt = parseFloat(depAmount)||0;
    if(amt<=0) return dialog.alert('Nominal setor harus lebih dari 0', { title:'Setor Kas' });
    if(!depBank) return dialog.alert('Pilih rekening bank tujuan', { title:'Setor Kas' });
    setDepBusy(true);
    try{
      const r = await api.post('/finance/cash/deposit', { amount: amt, bank_account_id: parseInt(depBank), notes: depNotes||null });
      setDepositOpen(false);
      await dialog.alert(`Setor ${rupiah(r.data.amount)} ke ${r.data.bank} berhasil. Saldo Kas Tunai sekarang ${rupiah(r.data.cash_balance)}.`, { title:'Setor Kas OK', tone:'success' });
      load();
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal setor kas' }); }
    finally{ setDepBusy(false); }
  };

  return (
    <div className="space-y-4">
      <PosPageHeader icon={FileText} title="Finance • AR / AP / Cash / Laporan" subtitle="AR = tagih customer • AP = bayar supplier (3-way) • Cash = saldo bank • Trial Balance = cek keseimbangan debit-kredit sebelum tutup buku"/>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-line shadow-card overflow-hidden p-5">
          <h3 className="font-bold text-sm flex items-center gap-1.5"><Wallet size={16}/> Cash & Bank <span className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full bg-surface-3 border">{(cash||[]).length} rekening</span></h3>
          <p className="text-[11px] text-ink-2 mt-1">Uang tutup shift masuk ke <b>Kas Tunai</b> dulu, lalu disetor ke bank. Bayar AP → saldo bank berkurang + jurnal <b>Dr Hutang / Cr Kas</b>.</p>

          {/* Kas Tunai */}
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1"><Wallet size={11}/> Kas Tunai</div>
                <div className="text-lg font-bold text-ink tabular-nums">{rupiah(cashAcc?.balance||0)}</div>
                <div className="text-[11px] text-emerald-800">{cashAcc? (cashAcc.account_name||'Kas Kasir') : 'belum ada akun kas'}</div>
              </div>
              {canDeposit && cashAcc && (
                <button onClick={()=>{ setDepAmount(String(Math.floor(Number(cashAcc.balance)||0))); setDepBank(String(banks[0]?.id||'')); setDepNotes(''); setDepositOpen(true); }}
                  className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 shrink-0">Setor ke Bank</button>
              )}
            </div>
            {!cashAcc && <div className="text-[11px] text-amber-800 mt-1">Akun kas belum dibuat - buka ulang halaman ini.</div>}
          </div>

          {/* Bank */}
          <div className="mt-3 space-y-2">
            {banks.map(c=>(
              <div key={c.id} className="flex justify-between items-center p-3 bg-surface-2 rounded-xl border border-line"><div><div className="font-bold text-sm">{c.bank_name} • {c.account_no}</div><div className="text-xs text-ink-2">{c.account_name}</div></div><div className="font-bold text-sm text-ink tabular-nums">{rupiah(c.balance)}</div></div>
            ))}
            {banks.length===0 && <div className="text-xs text-ink-3 py-3 text-center border border-dashed rounded-xl">Belum ada rekening bank</div>}
          </div>

          {/* Mutasi kas terakhir */}
          {cashMoves.length>0 && (
            <div className="mt-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-ink-3 mb-1">Mutasi Kas Terakhir</div>
              <div className="space-y-1">
                {cashMoves.slice(0,5).map(m=>(
                  <div key={m.id} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="truncate text-ink-2">{m.source==='SHIFT_CLOSE'? 'Tutup shift' : m.source==='DEPOSIT_TO_BANK'? 'Setor ke bank' : m.source} {m.notes? '• '+m.notes : ''}</span>
                    <span className={'font-bold tabular-nums shrink-0 '+(m.direction==='IN'? 'text-emerald-700':'text-amber-700')}>{m.direction==='IN'? '+':'-'}{rupiah(m.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl border border-line shadow-card overflow-hidden p-5 lg:col-span-2">
          <h3 className="font-bold text-sm flex items-center gap-1.5"><LineChart size={16}/> Laba Rugi (ringkas) <span className="ml-auto text-[11px] text-ink-3 font-normal">Sumber: invoices</span></h3>
          <p className="text-[11px] text-ink-2 mt-1">Pendapatan dari invoice penjualan. HPP = estimasi avg cost stok saat ini, beban operasional dari jurnal akun EXPENSE.</p>
          {pl ? <div className="mt-3 space-y-2 text-sm"><div className="flex justify-between py-1"><span className="text-ink-2">Pendapatan (Revenue)</span><span className="font-bold">{rupiah(pl.revenue)}</span></div><div className="flex justify-between py-1"><span className="text-ink-2">HPP (estimasi avg cost)</span><span className="font-mono">-{rupiah(pl.cogs)}</span></div><div className="flex justify-between font-bold border-t border-line pt-2 mt-1"><span>Laba Kotor</span><span className="text-emerald-700">{rupiah(pl.gross_profit)}</span></div><div className="flex justify-between py-1"><span className="text-ink-2">Beban Operasional (dari jurnal)</span><span className="font-mono">-{rupiah(pl.opex)}</span></div><div className="flex justify-between font-bold text-[15px] bg-navy text-white rounded-xl p-3 mt-2"><span>Laba Bersih</span><span>{rupiah(pl.net_profit)}</span></div></div> : <div className="text-xs text-ink-3 py-6 text-center">Memuat...</div>}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Aging tetap tampil - hapus hanya DB via clearAR; ponytail: UI tidak di-hide */}
        <div className="bg-white rounded-xl border border-line shadow-card overflow-hidden flex flex-col">
          <div className="p-4 border-b bg-surface-2">
            <div className="flex items-center gap-2 flex-wrap"><span className="font-bold text-sm flex items-center gap-1"><FileText size={16}/> Aging Piutang (AR)</span><span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-bold">SENT / PARTIAL</span><span className="text-[11px] px-2 py-1 rounded-full bg-white border text-ink-2 font-bold">{ar.length} tertagih • {arPartial.length} PARTIAL</span><span className="text-[11px] px-2 py-1 rounded-full bg-slate-50 border font-mono text-ink-2">POS / DO / SO</span><button onClick={load} className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-white border hover:bg-surface-2 font-bold"><RefreshCw size={12}/> Refresh</button><Link to="/sales/invoices" className="ml-auto text-[11px] text-brand font-bold flex items-center gap-1 hover:underline">Lihat Invoice <ExternalLink size={12}/></Link></div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-full bg-navy text-white font-bold">{ar.length} belum lunas</span>
              <span className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 font-bold">{arPartial.length} PARTIAL</span>
              <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 font-bold">Sisa {rupiah(arTotal)}</span>
              {arPartial.length>0 && <button onClick={()=>setArFilter(arFilter==='partial'?'all':'partial')} className={"ml-auto h-7 px-3 rounded-full border text-[11px] font-bold "+(arFilter==='partial'?"bg-amber-500 text-white border-amber-500":"bg-white text-ink-2 hover:bg-surface-2")}>{arFilter==='partial'?'Tampilkan SEMUA':'Hanya PARTIAL'}</button>}
            </div>
            {arShown.length>0 && arFilter==='partial' && <div className="mt-1 text-[11px] text-amber-700">Menampilkan <b>{arShown.length} PARTIAL</b> • total sisa {rupiah(arShownTotal)}</div>}
          </div>
          <div className="overflow-auto max-h-[360px]">
            <table className="w-full text-xs"><thead className="sticky top-0 bg-surface-3"><tr className="border-y border-line text-[11px] font-bold tracking-wider text-ink-2"><th className="p-2.5 text-left">INVOICE</th><th className="p-2.5 text-left">CUSTOMER</th><th className="p-2.5 text-right">SISA TAGIH</th><th className="p-2.5 text-center">JATUH TEMPO</th></tr></thead><tbody>
            {(Array.isArray(arShown)?arShown:[]).map(a=>{
              const outstanding= parseFloat(a.outstanding ?? (parseFloat(a.total||0)-parseFloat(a.paid_amount||0)));
              const overdue= parseInt(a.overdue_days||0);
              const isPartial = String(a.status).toUpperCase()==='PARTIAL';
              const isSent = String(a.status).toUpperCase()==='SENT';
              const canEditDue = isPartial || isSent || String(a.status).toUpperCase()==='OVERDUE';
              const isPos = !!a.is_pos;
              return (
              <tr key={a.id} className={"border-b hover:bg-surface-2 "+(isPartial?"bg-amber-50/40":"bg-white")}><td className="p-2.5"><div className="flex items-center gap-1 flex-wrap"><span className="font-mono font-bold text-ink">{a.invoice_number}</span>{isPos && <span className="text-[9px] px-1.5 py-0.5 rounded bg-warning-soft text-[#7a4f01] border border-[#ffd8a8] font-bold">POS</span>}{isPartial && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500 text-white font-bold">PARTIAL</span>}</div><div className="text-[11px] text-ink-2">{a.status} • {String(a.due_date||'').slice(0,10)} {a.so_number?`• ${a.so_number}`:''} {a.discount_pct?`• Disc ${a.discount_pct}%`:''} {a.voucher_code?`• ${a.voucher_code}`:''}</div></td><td className="p-2.5"><div className="font-semibold">{a.customer_name}</div><div className="text-[11px] text-ink-2 font-mono">{a.customer_code||''}</div></td><td className="p-2.5 text-right"><div className="font-bold text-ink">{rupiah(outstanding)}</div><div className="text-[11px] text-ink-3">Total {rupiah(a.total)} • Bayar {rupiah(a.paid_amount)}</div></td><td className="p-2.5 text-center"><div className="flex flex-col items-center gap-1"><span className={"inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold border "+(overdue>0?"bg-red-50 text-red-700 border-red-200":overdue>= -7?"bg-amber-50 text-amber-700 border-amber-200":"bg-emerald-50 text-emerald-700 border-emerald-200")}>{overdue>0? overdue+' hari overdue': overdue===0? 'Jatuh tempo hari ini' : Math.abs(overdue)+' hari lagi'}</span>{canEditDue && <button onClick={()=>openDue(a)} className="text-[11px] px-2 py-0.5 rounded-full bg-white border font-bold text-brand hover:bg-surface-3">Atur jatuh tempo</button>}</div></td></tr>
            )})}
            {arShown.length===0 && ar.length===0 && <tr><td colSpan={4} className="p-8 text-center"><div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 grid place-items-center mx-auto text-emerald-600"><FileText size={18}/></div><div className="text-sm font-bold mt-2">Tidak ada piutang tertunda</div><div className="text-xs text-ink-2 mt-1">Semua invoice sudah <b>PAID</b> atau belum ada invoice SENT/PARTIAL.<br/>Buat invoice di <Link to="/sales/invoices" className="text-brand underline">Sales / Invoice</Link> lalu piutang muncul di sini.</div><div className="text-[11px] text-ink-3 mt-2">Tip: invoice <b>PARTIAL</b> dari POS (DP) maupun tambah Invoice (DO + DP) sama-sama masuk aging.</div></td></tr>}
            {arShown.length===0 && ar.length>0 && <tr><td colSpan={4} className="p-6 text-center text-xs text-ink-3">Tidak ada data untuk filter ini • <button onClick={()=>setArFilter('all')} className="text-brand underline">tampilkan semua</button></td></tr>}
            </tbody></table>
          </div>
        </div>

        {/* AP */}
        <div className="bg-white rounded-xl border border-line shadow-card overflow-hidden flex flex-col">
          <div className="p-4 border-b bg-surface-2">
            <div className="flex items-center gap-2"><span className="font-bold text-sm">Hutang Usaha (AP)</span><span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 border border-sky-200 font-bold">3-way result</span><span className="ml-auto text-[11px] text-ink-2">MATCHED → Bayar • HOLD blokir</span></div>
            <p className="text-[11px] text-ink-2 mt-1 leading-relaxed">Fungsi: <b>daftar hutang ke supplier</b> hasil 3-way matching (PO ↔ GRN ↔ Invoice). <b>MATCHED/APPROVED/RECEIVED</b> = siap bayar → potong bank + jurnal. <b>HOLD</b> = harga/qty beda, fix di Penerimaan.</p>
          </div>
          <div className="overflow-auto max-h-[360px]"><table className="w-full text-xs"><thead className="sticky top-0 bg-surface-3"><tr className="border-y border-line text-[11px] font-bold tracking-wider text-ink-2"><th className="p-2.5 text-left">DOKUMEN</th><th className="p-2.5">SUPPLIER</th><th className="p-2.5 text-right">TOTAL</th><th className="p-2.5 text-center">STATUS</th><th className="p-2.5 text-center">AKSI</th></tr></thead><tbody>{(Array.isArray(ap)?ap:[]).map(a=>(
            <tr key={a.source+'-'+a.id} className="border-b bg-white hover:bg-surface-2"><td className="p-2.5 font-mono"><span className="font-bold text-ink">{a.doc_number}</span><div className="text-[11px] text-ink-3">{a.source==='PURCHASE'? a.doc_number : a.po_number} {a.due_date? '• '+String(a.due_date).slice(0,10):''}</div></td><td className="p-2.5 text-center">{a.supplier_name}</td><td className="p-2.5 text-right font-bold">{rupiah(a.total)}</td><td className="p-2.5 text-center"><span className={"px-2.5 py-1 rounded-full text-[11px] font-bold border whitespace-nowrap "+(a.status==='MATCHED'?"bg-emerald-50 text-emerald-700 border-emerald-200":a.status==='HOLD'?"bg-red-50 text-red-700 border-red-200":a.status==='APPROVED'?"bg-sky-50 text-sky-700 border-sky-200":"bg-amber-50 text-amber-700 border-amber-200")}>{a.status}</span></td><td className="p-2.5 text-center">
              {a.status==='HOLD' ? <div className="flex flex-col items-center gap-1"><span className="text-[11px] text-red-600 font-bold">Qty/harga ≠ diterima</span><div className="flex gap-1"><Link to="/purchase/receipts" className="px-2 py-1 bg-white border rounded-full text-[11px] font-bold hover:bg-surface-2">3-Way</Link><button onClick={async()=>{
                if(a.source!=='PURCHASE'){ await dialog.alert('HOLD di PO tanpa invoice - buat/benarkan GRN qty di Penerimaan.',{title:'HOLD PO'}); return; }
                const ok=await dialog.confirm('Approve selisih? Bayar akan sesuai barang DITERIMA (total invoice sekarang), bukan qty PO. Selisih dicatat variance. Lanjutkan?',{title:'Approve HOLD - bayar sesuai diterima', confirmText:'Ya, approve'});
                if(!ok) return;
                try{
                  const r=await api.post(`/purchase/invoices/${a.id}/approve`);
                  await dialog.alert(r.data.note||'Invoice di-approve - sekarang bisa Bayar sesuai diterima.',{title:'Approved'});
                  load();
                }catch(e){ await dialog.alert(e.response?.data?.error||e.message,{title:'Gagal'}); }
              }} className="px-2 py-1 bg-amber-500 text-white rounded-full text-[11px] font-bold hover:bg-amber-600">Approve selisih</button></div></div> : <button onClick={()=>{ setPayOpen(a); setPayAmt(String(a.total)); setPayBank(String(cash[0]?.id||'')); }} className="px-3 py-1.5 bg-brand text-white rounded-full text-xs font-bold hover:bg-blue-800">Bayar {rupiah(a.total)}</button>}
            </td></tr>
          ))}{ap.length===0 && <tr><td colSpan={5} className="p-6 text-center text-ink-3">Tidak ada AP - buat GRN + Invoice MATCHED dulu di Receipt</td></tr>}</tbody></table></div>

        </div>
      </div>

      {/* Trial Balance */}
      <div className="bg-white rounded-xl border border-line shadow-card overflow-hidden">
        <div className="p-4 border-b bg-surface-2 flex flex-wrap gap-3 items-start">
          <div className="flex-1 min-w-[220px]">
            <div className="font-bold text-sm flex items-center gap-1.5"><Scale size={16} className="text-ink"/> Trial Balance <span className="text-[11px] px-2 py-0.5 rounded-full bg-white border font-bold tracking-wider text-ink-2">NERACA SALDO</span> <Link to="/finance/journals" className="ml-auto inline-flex items-center gap-1 px-3 py-1 rounded-full bg-navy text-white text-xs font-bold hover:bg-black">Lihat Jurnal <ArrowRight size={12}/></Link></div>
            <p className="text-[11px] text-ink-2 mt-1 leading-relaxed">Fungsi: <b>cek keseimbangan akuntansi</b> - jumlah <b>DEBIT harus = KREDIT</b>. Sumber: <b>jurnal</b> (penjualan, bayar hutang, dll). Jika tidak balance, jangan tutup buku. Di screenshot: Kas & Bank di <b>KREDIT 943.500</b> vs Hutang di <b>DEBIT 943.500</b> = jurnal Bayar AP (Dr Hutang / Cr Kas) - sudah balance.</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <span className={"inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border "+(tbTotals.balanced?"bg-emerald-50 text-emerald-700 border-emerald-200":"bg-amber-50 text-amber-700 border-amber-200")}>{tbTotals.balanced? <><Check size={13}/> Seimbang</> : <><AlertTriangle size={13}/> Tidak seimbang</>} <span className="font-mono text-[11px]">{rupiah(tbTotals.d)} / {rupiah(tbTotals.c)}</span></span>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface-3 sticky top-0"><tr className="border-y border-line text-[11px] font-bold tracking-wider text-ink-2"><th className="p-2.5 text-left">KODE</th><th className="p-2.5 text-left">AKUN</th><th className="p-2.5 text-left">TIPE</th><th className="p-2.5 text-right">DEBIT</th><th className="p-2.5 text-right">KREDIT</th><th className="p-2.5 text-right">SALDO</th></tr></thead>
            <tbody>
              {(Array.isArray(tb)?tb:[]).map(a=>{
                const d=parseFloat(a.debit||0), c=parseFloat(a.credit||0);
                const saldo=d-c;
                const typeColor=a.type==='ASSET'?'bg-emerald-50 text-emerald-700 border-emerald-200':a.type==='LIABILITY'?'bg-amber-50 text-amber-700 border-amber-200':a.type==='EQUITY'?'bg-sky-50 text-sky-700 border-sky-200':a.type==='REVENUE'?'bg-violet-50 text-violet-700 border-violet-200':'bg-slate-50 text-slate-700 border-slate-200';
                return (
                <tr key={a.code} className="border-b bg-white hover:bg-surface-2"><td className="p-2.5 font-mono font-bold text-ink">{a.code}</td><td className="p-2.5 font-semibold">{a.name}</td><td className="p-2.5"><span className={"text-[11px] px-1.5 py-0.5 rounded-full border font-bold "+typeColor}>{a.type||'-'}</span></td><td className="p-2.5 text-right font-mono">{d>0? rupiah(d):<span className="text-[#cbdbf5]">-</span>}</td><td className="p-2.5 text-right font-mono">{c>0? rupiah(c):<span className="text-[#cbdbf5]">-</span>}</td><td className={"p-2.5 text-right font-bold font-mono "+(saldo>0?"text-ink":saldo<0?"text-red-600":"text-ink-3")}>{saldo!==0? (saldo>0? 'D '+rupiah(saldo):'K '+rupiah(Math.abs(saldo))): '0'}</td></tr>
              )})}
              {tb.length===0 && <tr><td colSpan={6} className="p-8 text-center text-ink-3">Belum ada jurnal</td></tr>}
            </tbody>
            {tb.length>0 && <tfoot className="bg-navy text-white font-bold"><tr><td colSpan={3} className="p-2.5 text-right tracking-wider text-[11px]">TOTAL</td><td className="p-2.5 text-right font-mono">{rupiah(tbTotals.d)}</td><td className="p-2.5 text-right font-mono">{rupiah(tbTotals.c)}</td><td className={"p-2.5 text-right font-mono "+(tbTotals.balanced?"text-emerald-300":"text-amber-300")}>{tbTotals.balanced?'BALANCE':'SELISIH '+rupiah(Math.abs(tbTotals.d-tbTotals.c))}</td></tr></tfoot>}
          </table>
        </div>
        <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-200 text-[11px] leading-relaxed text-amber-800 flex gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5"/> <span><b>Cara baca:</b> 1-1000 Kas & Bank = uang di bank • 2-1000 Hutang = hutang supplier. Saat bayar, jurnal <b>Dr Hutang 943.500 / Cr Kas 943.500</b> → dua sisi muncul di tabel. Jika DEBIT ≠ KREDIT, cek jurnal belum posted / salah input.</span></div>
      </div>

      {payOpen && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50" onClick={()=>setPayOpen(null)}><div onClick={e=>e.stopPropagation()} className="bg-white rounded-xl w-full max-w-md p-5 space-y-3 animate-pop">
        <h3 className="font-bold">Bayar Hutang - {payOpen.doc_number} • {payOpen.supplier_name}</h3>
        <p className="text-xs text-ink-2">MATCHED → boleh bayar. HOLD terblokir. Bayar → potong saldo Bank + jurnal.</p>
        <label className="block space-y-1"><span className="text-[11px] font-bold text-ink-2">Nominal</span><input type="number" value={payAmt} onChange={e=>setPayAmt(e.target.value)} className="w-full h-10 px-3 border rounded-xl text-sm"/></label>
        <label className="block space-y-1"><span className="text-[11px] font-bold text-ink-2">Bank</span><select value={payBank} onChange={e=>setPayBank(e.target.value)} className="w-full h-10 px-3 border rounded-xl text-sm">{banks.map(c=> <option key={c.id} value={c.id}>{c.bank_name} • {c.account_no} - {rupiah(c.balance)}</option>)}</select></label>
        <div className="flex justify-end gap-2"><button onClick={()=>setPayOpen(null)} className="h-10 px-5 bg-white border rounded-xl text-sm font-semibold">Batal</button><button onClick={doPay} className="h-10 px-6 bg-brand text-white rounded-xl text-sm font-bold">Konfirmasi Bayar</button></div>
      </div></div>}
      {dueOpen && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50" onClick={()=>setDueOpen(null)}><div onClick={e=>e.stopPropagation()} className="bg-white rounded-xl w-full max-w-md p-5 space-y-3 animate-pop">
        <h3 className="font-bold">Atur Jatuh Tempo - {dueOpen.invoice_number}</h3>
        <p className="text-xs text-ink-2">Hanya <b>SENT / PARTIAL / OVERDUE</b> • {dueOpen.customer_name} • Sisa {rupiah(dueOpen.outstanding||0)}</p>
        <label className="block space-y-1"><span className="text-[11px] font-bold text-ink-2">Jatuh Tempo</span><input type="date" value={dueVal} onChange={e=>setDueVal(e.target.value)} className="w-full h-10 px-3 border rounded-xl text-sm"/></label>
        <div className="flex justify-end gap-2"><button onClick={()=>setDueOpen(null)} className="h-10 px-5 bg-white border rounded-xl text-sm font-semibold">Batal</button><button onClick={saveDue} className="h-10 px-6 bg-brand text-white rounded-xl text-sm font-bold">Simpan</button></div>
      </div></div>}
      {depositOpen && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50" onClick={()=>!depBusy&&setDepositOpen(false)}><div onClick={e=>e.stopPropagation()} className="bg-white rounded-xl w-full max-w-md p-5 space-y-3 animate-pop">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-bold flex items-center gap-1.5"><ArrowRightLeft size={16}/> Setor Kas Tunai ke Bank</h3>
            <p className="text-xs text-ink-2 mt-1">Saldo Kas Tunai sekarang <b>{rupiah(saldoKas)}</b>. Setelah disetor: kas berkurang, bank bertambah, jurnal <b>Dr Bank / Cr Kas Tunai</b>.</p>
          </div>
          <button onClick={()=>!depBusy&&setDepositOpen(false)} className="h-7 w-7 grid place-items-center rounded-full border shrink-0"><X size={13}/></button>
        </div>
        <label className="block space-y-1"><span className="text-[11px] font-bold text-ink-2">Nominal setor</span>
          <input type="number" value={depAmount} onChange={e=>setDepAmount(e.target.value)} max={saldoKas} className="w-full h-10 px-3 border rounded-xl text-sm font-bold tabular-nums"/>
          <span className="text-[11px] text-ink-3">Maksimal {rupiah(saldoKas)}</span>
        </label>
        <label className="block space-y-1"><span className="text-[11px] font-bold text-ink-2">Rekening bank tujuan</span>
          <select value={depBank} onChange={e=>setDepBank(e.target.value)} className="w-full h-10 px-3 border rounded-xl text-sm">
            {banks.length===0 && <option value="">Belum ada rekening bank</option>}
            {banks.map(c=> <option key={c.id} value={c.id}>{c.bank_name} • {c.account_no} - {rupiah(c.balance)}</option>)}
          </select>
        </label>
        <label className="block space-y-1"><span className="text-[11px] font-bold text-ink-2">Catatan (opsional)</span>
          <input value={depNotes} onChange={e=>setDepNotes(e.target.value)} placeholder="mis. setoran harian 30 Okt" className="w-full h-10 px-3 border rounded-xl text-sm"/>
        </label>
        <div className="flex justify-end gap-2">
          <button onClick={()=>setDepositOpen(false)} disabled={depBusy} className="h-10 px-5 bg-white border rounded-xl text-sm font-semibold disabled:opacity-50">Batal</button>
          <button onClick={doDeposit} disabled={depBusy || !banks.length} className="h-10 px-6 bg-emerald-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 inline-flex items-center gap-1.5">{depBusy? <RefreshCw size={14} className="animate-spin"/>: <ArrowRightLeft size={14}/>} Setor Sekarang</button>
        </div>
      </div></div>}
    </div>
  )
}
