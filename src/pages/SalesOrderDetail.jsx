import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { FileText, Check, Truck, ShieldCheck } from 'lucide-react';
import api from '../lib/api';
import { PosPageHeader } from '../components/PosUI';
import { useDialog } from '../components/DialogProvider';
import OfficeConfirmModal from '../components/OfficeConfirmModal';
import { useAuth } from '../store/auth';
import { canAccess, R_OFFICE_CONFIRM } from '../config/access';

const Badge=({status})=>{
  const colors={DRAFT:'bg-gray-100 text-gray-800',PENDING:'bg-amber-100 text-amber-800',APPROVED:'bg-blue-100 text-blue-800',PICKING:'bg-purple-100 text-purple-800',SHIPPED:'bg-sky-100 text-sky-800 border-sky-200',PARTIAL:'bg-orange-100 text-orange-800',COMPLETED:'bg-emerald-100 text-emerald-800',PAID:'bg-green-100 text-green-800',CANCELLED:'bg-red-100 text-red-800'};
  return <span className={`px-2 py-1 rounded text-xs font-semibold border ${colors[status]||'bg-gray-100'}`}>{status}</span>;
};

const rupiah=(val)=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(val||0);

// workflow navigasi langsung ke halaman
const WF = [
  {k:'Quotation', to:'/approvals'},
  {k:'SO', to:'/sales/orders'},
  {k:'Approval', to:'/approvals'},
  {k:'Picking', to:'/sales/orders?status=PICKING'},
  {k:'DO', to:'/logistics'},
  {k:'Invoice', to:'/sales/invoices'},
];

function workflowIndex(status){
  if(status==='PENDING') return 2;
  if(status==='APPROVED') return 2;
  if(status==='PICKING') return 3;
  if(status==='SHIPPED' || status==='PARTIAL') return 4; // SHIPPED menggantikan PARTIAL sebelum COMPLETED
  if(status==='COMPLETED') return 5;
  return 1;
}

export default function SalesOrderDetail(){
  const {id}=useParams();
  const navigate=useNavigate();
  const dialog=useDialog();
  const [order,setOrder]=useState(null);
  const [trackBusy,setTrackBusy]=useState(false);
  const [items,setItems]=useState([]);
  const [invoice,setInvoice]=useState(null);
  const [deliveries,setDeliveries]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [completing,setCompleting]=useState(false);
  const [actioning,setActioning]=useState('');
  const [msg,setMsg]=useState('');
  const [officeOpen,setOfficeOpen]=useState(false);
  const [officeTarget,setOfficeTarget]=useState(null);
  const roles = useAuth(s=>s.user)?.roles || [];
  const canConfirmOffice = canAccess(roles, R_OFFICE_CONFIRM);

  const fetchOrder=async()=>{
    try{
      setError(''); setLoading(true);
      const resp=await api.get(`/sales/orders/${id}`);
      setOrder(resp.data);
      setItems(resp.data?.details||[]);
      setInvoice(resp.data?.invoice||null);
      setDeliveries(resp.data?.deliveries||[]);
    }catch(e){
      const m=e.response?.data?.error||e.response?.data?.message||e.message||'Gagal load SO';
      setError(m);
      console.error('[SO detail fetch]', e.response?.data || e.message);
    }finally{
      setLoading(false);
    }
  };

  useEffect(()=>{ fetchOrder(); },[id]);

  const postAction=async(url, label)=>{
    setActioning(label); setError(''); setMsg('');
    try{
      await api.post(url);
      setMsg(label+' berhasil');
      await fetchOrder();
    }catch(e){ setError(e.response?.data?.error || e.message); }
    finally{ setActioning(''); }
  };

  // Link lacak publik untuk pelanggan (tanpa login) — token acak per order.
  const shareTrack = async ()=>{
    if(!order) return;
    setTrackBusy(true);
    try{
      const r = await api.post(`/sales/orders/${order.id}/track-link`, {});
      const url = window.location.origin + r.data.path;
      try{ await navigator.clipboard.writeText(url); }catch{}
      await dialog.alert(`Link lacak siap dibagikan (sudah dicoba disalin ke clipboard):\n\n${url}\n\nPelanggan bisa membuka tanpa login. Cabut akses kapan saja dari halaman ini.`, { title:'Link lacak pelanggan', tone:'success' });
      setOrder(o=> o? {...o, track_token:r.data.token} : o);
    }catch(e){ await dialog.alert(e.response?.data?.error||e.message, { title:'Gagal membuat link' }); }
    finally{ setTrackBusy(false); }
  };

  const handleComplete=async()=>{
    setMsg(''); setError('');
    const ok=await dialog.confirm('Validasi pembayaran lunas - tandai SO sebagai COMPLETED?', {title:'Tandai Selesai', confirmText:'Ya, Complete', cancelText:'Batal'});
    if(!ok) return;
    setCompleting(true);
    try{
      await api.post(`/sales/orders/${id}/complete`);
      setMsg('SO ditandai COMPLETED');
      await fetchOrder();
    }catch(e){
      setError(e.response?.data?.error || e.message);
    }finally{ setCompleting(false); }
  };

  if(loading) return <div className="p-6"><div className="animate-pulse">Loading...</div></div>;
  if(loading && !order) return <div className="p-6"><div className="animate-pulse rounded-xl bg-gray-100 h-40"/><p className="text-xs text-[#45464d] mt-2">Memuat SO #{id}...</p></div>;
  if(error && !order) return <div className="p-6"><div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl"><b>Gagal load SO #{id}</b><div className="text-sm mt-1 break-all">{error}</div><button onClick={()=>{ setError(''); fetchOrder(); }} className="mt-3 h-9 px-4 bg-red-600 text-white rounded-xl text-sm font-bold">Coba lagi</button><button onClick={()=>navigate('/sales/orders')} className="mt-3 ml-2 h-9 px-4 bg-white border rounded-xl text-sm">← Kembali ke daftar</button></div></div>;
  if(!order) return <div className="p-6">Pesanan tidak ditemukan <button onClick={()=>navigate('/sales/orders')} className="ml-2 text-blue-600 underline">← Daftar SO</button></div>;

  const total=Number(order.total||0);
  const paid=invoice ? Number(invoice.paid_amount||0) : 0;
  const sisa=Math.max(0, total - paid);
  const isPaid = sisa <= 0.5 || invoice?.status==='PAID';
  const isCompleted = order.status==='COMPLETED';
  const showCompleteBtn = !isCompleted && isPaid && invoice;
  const activeIdx = workflowIndex(order.status);
  const unconfirmedDO = (deliveries||[]).filter(d=>d.status!=='CANCELLED' && !d.office_confirmed_at);

  return(
    <div className="p-6 max-w-4xl">
      <div className="mb-4">
        <PosPageHeader icon={FileText} title={order.so_number} subtitle={(order.customer_name||'')+(order.so_date? ' - '+String(order.so_date).slice(0,10):'')} badge={order.status} onBack={()=>navigate(-1)}/>
      </div>

      {/* klikable workflow navigasi ke halaman */}
      <div className="bg-white rounded-xl border border-[#e7ecf7] shadow-card overflow-hidden p-3 mb-4">
        <div className="text-xs font-bold text-[#45464d] mb-2">Workflow - klik untuk navigasi</div>
        <div className="flex flex-wrap gap-1.5">
          {WF.map((w,i)=>{
            const active = i===activeIdx;
            const done = i < activeIdx;
            return (
              <button key={w.k} onClick={()=>navigate(w.to)} className={`px-3 py-1.5 rounded-full border text-xs font-bold flex items-center gap-1.5 ${active?'bg-[#0051d5] text-white border-[#0051d5]':done?'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-white hover:bg-[#eff4ff]'}`}>
                <span className={`w-5 h-5 rounded-full grid place-items-center text-[11px] ${active?'bg-white text-[#0051d5]':done?'bg-emerald-600 text-white':'bg-gray-100'}`}>{done? <Check size={11}/> : i+1}</span>
                {w.k}
              </button>
            );
          })}
        </div>
        <div className="text-xs text-[#76777d] mt-2">Quotation→SO→Approval (approve PENDING) → Picking (APPROVED→PICKING) → DO (buat delivery) → Invoice (bayar sisa)</div>
      </div>

      {msg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-3 rounded-xl text-sm mb-4">{msg}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm mb-4">{error}</div>}

      {/* Tanda tangan pengiriman + konfirmasi Pengirim/Gudang/Kantor (gate invoice & COMPLETED) */}
      {deliveries.length>0 && (
        <div className="bg-white rounded-xl border border-[#e7ecf7] shadow-card overflow-hidden p-4 mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="text-sm font-bold flex items-center gap-1.5"><Truck size={15} className="text-[#0051d5]"/> Pengiriman &amp; Tanda Tangan</div>
            <span className={'text-[11px] font-bold px-2 py-1 rounded-full border '+(unconfirmedDO.length? 'bg-amber-50 text-amber-800 border-amber-200':'bg-emerald-50 text-emerald-700 border-emerald-200')}>
              {unconfirmedDO.length? unconfirmedDO.length+' DO belum dikonfirmasi gudang' : 'semua DO sudah dikonfirmasi gudang'}
            </span>
          </div>
          <div className="space-y-2">
            {deliveries.map(d=>(
              <div key={d.id} className="rounded-xl border border-[#e7ecf7] p-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link to={'/surat-jalan/'+d.id} className="font-mono text-xs font-bold text-[#0051d5] hover:underline">{d.do_number}</Link>
                    <Badge status={d.status}/>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1 text-[10px] font-bold">
                    {[['Pengirim/Gudang', d.sender_signed],['Pengemudi', d.driver_signed],['Penerima', d.pod_signed],['Kantor', !!d.office_confirmed_at]].map(([label,ok])=>(
                      <span key={label} className={'px-2 py-0.5 rounded-full border '+(ok? 'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-amber-50 text-amber-800 border-amber-200')}>{label}: {ok? 'sudah':'belum'}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!d.office_confirmed_at && d.status!=='CANCELLED' && (
                    canConfirmOffice
                      ? <button onClick={()=>{ setOfficeTarget(d); setOfficeOpen(true); }} className="h-8 px-3 rounded-lg bg-amber-500 text-white text-xs font-bold inline-flex items-center gap-1 hover:bg-amber-600"><ShieldCheck size={12}/> Konfirmasi Gudang</button>
                      : <span className="text-[11px] text-[#76777d]">minta gudang/kantor konfirmasi</span>
                  )}
                  {d.office_confirmed_at && <span className="text-[11px] font-bold text-emerald-700 inline-flex items-center gap-1"><ShieldCheck size={12}/> Gudang OK</span>}
                  <Link to={'/surat-jalan/'+d.id} className="h-8 px-3 rounded-lg border border-[#e7ecf7] bg-white text-xs font-semibold grid place-items-center">Surat Jalan</Link>
                </div>
              </div>
            ))}
          </div>
          {unconfirmedDO.length>0 && (
            <div className="mt-2 text-[11px] text-[#45464d] leading-relaxed">
              <b>Konfirmasi kantor</b> = tanda tangan kolom <b>Pengirim/Gudang</b> setelah barang diterima. Tanpa konfirmasi ini
              invoice DO tidak bisa dilunasi dan SO tidak bisa <b>COMPLETED</b>. Kalau gudang sudah tanda tangan saat DO dibuat,
              konfirmasi cukup satu klik (tanda tangan dipakai ulang).
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#e7ecf7] shadow-card overflow-hidden p-6 mb-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs text-[#45464d]">TANGGAL & JAM PEMBELIAN</p>
            <p className="text-lg font-semibold">{order.so_date?.slice(0,10)} {order.created_at ? new Date(order.created_at).toLocaleTimeString('id-ID') : ''}</p>
          </div>
          <div>
            <p className="text-xs text-[#45464d]">STATUS</p>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge status={order.status}/>
              {!isCompleted && !isPaid && invoice && <span className="text-xs text-amber-600 font-semibold">• Menunggu pelunasan</span>}
              {isCompleted && <span className="text-xs text-emerald-600 font-semibold">• Lunas & selesai</span>}
              {order.status==='PICKING' && <span className="text-xs text-purple-600 font-semibold">• Sedang picking</span>}
            </div>
          </div>
          <div>
            <p className="text-xs text-[#45464d]">PELANGGAN</p>
            <p className="font-semibold">{order.customer_name}</p>
            <p className="text-xs text-gray-600">{order.customer_code} {order.customer_phone ? '• '+order.customer_phone : ''}</p>
          </div>
          <div>
            <p className="text-xs text-[#45464d]">ALAMAT PENGIRIMAN</p>
            <p className="text-sm">{order.delivery_address||'Tidak ada (pickup)'}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-[#45464d]">CATATAN</p>
            <p className="text-sm bg-[#e5eeff] p-2 rounded">{order.notes || '-'}</p>
          </div>
        </div>
        {/* action bar sesuai status */}
        <div className="mt-4 flex flex-wrap gap-2">
          {order.status==='PENDING' && (
            <>
              <button disabled={actioning} onClick={()=>postAction(`/sales/orders/${id}/approve`,'Approve')} className="h-9 px-5 bg-emerald-600 text-white rounded-xl text-sm font-bold disabled:opacity-50">{actioning==='Approve'?'Memproses...':'Approve, lanjut PICKING'}</button>
              <button disabled={actioning} onClick={()=>postAction(`/sales/orders/${id}/cancel`,'Cancel')} className="h-9 px-4 bg-white border rounded-xl text-sm">Cancel</button>
              <Link to="/approvals" className="h-9 px-4 bg-white border rounded-xl grid place-items-center text-sm">Ke Approval</Link>
            </>
          )}
          {order.status==='APPROVED' && (
            <>
              <button disabled={actioning} onClick={()=>postAction(`/sales/orders/${id}/picking`,'Picking')} className="h-9 px-5 bg-purple-600 text-white rounded-xl text-sm font-bold disabled:opacity-50">{actioning==='Picking'?'...':'📦 Mulai Picking'}</button>
              <Link to="/logistics" className="h-9 px-4 bg-sky-600 text-white rounded-xl grid place-items-center text-sm">Buat DO → Logistik</Link>
              <Link to="/sales/invoices" className="h-9 px-4 bg-white border rounded-xl grid place-items-center text-sm">Invoice</Link>
            </>
          )}
          {(order.status==='PICKING' || order.status==='SHIPPED') && (
            <>
              <Link to="/logistics" className="h-9 px-5 bg-sky-600 text-white rounded-xl grid place-items-center text-sm font-bold">Buat DO di Logistik</Link>
              <span className="text-xs text-[#45464d]">{order.status==='PICKING'?'Picking selesai → buat DO, status jadi SHIPPED':'Sedang dikirim - POD di Logistik → DELIVERED → Invoice'}</span>
            </>
          )}
          {(order.status==='SHIPPED' || order.status==='PARTIAL') && invoice && !isPaid && (
            <Link to="/sales/invoices" className="h-9 px-5 bg-[#0051d5] text-white rounded-xl grid place-items-center text-sm font-bold">Bayar Sisa {rupiah(sisa)} → Invoice</Link>
          )}
          {/* Bagikan link lacak publik (tanpa login) ke pelanggan */}
          <button onClick={shareTrack} disabled={trackBusy} className="h-9 px-4 bg-white border rounded-xl text-sm font-bold disabled:opacity-50">
            {trackBusy? 'Menyiapkan...' : order.track_token? 'Salin Link Lacak' : 'Bagikan Link Lacak'}
          </button>
          {showCompleteBtn && (
            <button onClick={handleComplete} disabled={completing || unconfirmedDO.length>0} title={unconfirmedDO.length? 'Konfirmasi Pengirim/Gudang untuk DO: '+unconfirmedDO.map(d=>d.do_number).join(', '):'Tandai SO COMPLETED'} className="h-9 px-5 bg-emerald-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed">{unconfirmedDO.length ? 'Konfirmasi gudang dulu' : completing ? 'Memproses...' : 'Validasi & Tandai Selesai'}</button>
          )}
          {!showCompleteBtn && !isCompleted && invoice && !isPaid && (
            <div className="text-xs bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2 rounded-xl">Belum lunas - sisa {rupiah(sisa)}. Lunasi di Invoice → tombol Bayar.</div>
          )}
          {isCompleted && <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl">Pesanan lunas & selesai.</span>}
          {deliveries.length>0 && <span className="text-xs bg-sky-50 border border-sky-200 text-sky-700 px-3 py-2 rounded-xl">DO: {deliveries.map(d=>d.do_number).join(', ')}</span>}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#e7ecf7] shadow-card overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead><tr className="bg-[#e5eeff] border-y border-[#e7ecf7] text-[11px] font-bold tracking-wider text-[#45464d]">
              <th className="text-left px-4 py-3 whitespace-nowrap">PRODUK</th>
              <th className="text-right px-4 py-3 whitespace-nowrap">QTY</th>
              <th className="text-right px-4 py-3 whitespace-nowrap">HARGA SATUAN</th>
              <th className="text-right px-4 py-3 whitespace-nowrap">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it,i)=>(
              <tr key={i} className="border-b border-[#e5eeff] hover:bg-[#eff4ff] transition bg-white">
                <td className="px-4 py-3.5">
                  <div className="font-semibold">{it.product_name}</div>
                  <div className="text-xs text-[#45464d]">{it.sku}</div>
                </td>
                <td className="px-4 py-3.5 text-right">{it.qty}</td>
                <td className="px-4 py-3.5 text-right">{rupiah(it.unit_price)}</td>
                <td className="px-4 py-3.5 text-right font-bold">{rupiah(it.qty*it.unit_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border border-[#e7ecf7] shadow-card overflow-hidden p-6">
        <div className="flex justify-end">
          <div className="w-64">
            <div className="flex justify-between pb-2 border-b mb-2">
              <span>Subtotal:</span>
              <span>{rupiah(order.subtotal)}</span>
            </div>
            <div className="flex justify-between pb-2 border-b mb-2">
              <span>Diskon:</span>
              <span>{rupiah(order.discount)}</span>
            </div>
            <div className="flex justify-between pb-2 border-b mb-2">
              <span>PPN 11%:</span>
              <span>{rupiah(order.tax)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold pt-2">
              <span>TOTAL:</span>
              <span>{rupiah(order.total)}</span>
            </div>
            {invoice && (
              <>
                <div className="flex justify-between text-sm pt-3 mt-3 border-t">
                  <span className="text-gray-600">DP / Terbayar:</span>
                  <span className="font-bold text-emerald-600">{rupiah(paid)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Sisa:</span>
                  <span className={`font-bold ${sisa>0.5?'text-amber-600':'text-emerald-600'}`}>{rupiah(sisa)}</span>
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-[#45464d]">Status Bayar:</span>
                  <span className={isPaid?'text-emerald-600 font-bold':'text-amber-600 font-bold'}>{invoice.status} {isPaid ? '• LUNAS' : '• BELUM LUNAS'}</span>
                </div>
                <div className="text-xs text-[#45464d]">Invoice: {invoice.invoice_number}</div>
              </>
            )}
            {!invoice && <div className="text-xs text-[#76777d] mt-3">Belum ada invoice untuk SO ini</div>}
          </div>
        </div>
      </div>

      <OfficeConfirmModal
        open={officeOpen}
        delivery={officeTarget}
        onClose={()=>setOfficeOpen(false)}
        onSuccess={({message})=>{ setMsg(message); setOfficeOpen(false); fetchOrder(); }}
        onErr={setError}
      />
    </div>
  );
}
