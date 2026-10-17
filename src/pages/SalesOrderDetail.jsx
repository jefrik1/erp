import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { FileText, Check } from 'lucide-react';
import api from '../lib/api';
import { PosPageHeader } from '../components/PosUI';
import { useDialog } from '../components/DialogProvider';

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
  const [items,setItems]=useState([]);
  const [invoice,setInvoice]=useState(null);
  const [deliveries,setDeliveries]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [completing,setCompleting]=useState(false);
  const [actioning,setActioning]=useState('');
  const [msg,setMsg]=useState('');

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
  if(loading && !order) return <div className="p-6"><div className="animate-pulse rounded-xl bg-gray-100 h-40"/><p className="text-xs text-[#64748B] mt-2">Memuat SO #{id}...</p></div>;
  if(error && !order) return <div className="p-6"><div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl"><b>Gagal load SO #{id}</b><div className="text-sm mt-1 break-all">{error}</div><button onClick={()=>{ setError(''); fetchOrder(); }} className="mt-3 h-9 px-4 bg-red-600 text-white rounded-xl text-sm font-bold">Coba lagi</button><button onClick={()=>navigate('/sales/orders')} className="mt-3 ml-2 h-9 px-4 bg-white border rounded-xl text-sm">← Kembali ke daftar</button></div></div>;
  if(!order) return <div className="p-6">Pesanan tidak ditemukan <button onClick={()=>navigate('/sales/orders')} className="ml-2 text-blue-600 underline">← Daftar SO</button></div>;

  const total=Number(order.total||0);
  const paid=invoice ? Number(invoice.paid_amount||0) : 0;
  const sisa=Math.max(0, total - paid);
  const isPaid = sisa <= 0.5 || invoice?.status==='PAID';
  const isCompleted = order.status==='COMPLETED';
  const showCompleteBtn = !isCompleted && isPaid && invoice;
  const activeIdx = workflowIndex(order.status);

  return(
    <div className="p-6 max-w-4xl">
      <div className="mb-4">
        <PosPageHeader icon={FileText} title={order.so_number} subtitle={(order.customer_name||'')+(order.so_date? ' - '+String(order.so_date).slice(0,10):'')} badge={order.status} onBack={()=>navigate(-1)}/>
      </div>

      {/* klikable workflow navigasi ke halaman */}
      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-3 mb-4">
        <div className="text-xs font-bold text-[#64748B] mb-2">Workflow - klik untuk navigasi</div>
        <div className="flex flex-wrap gap-1.5">
          {WF.map((w,i)=>{
            const active = i===activeIdx;
            const done = i < activeIdx;
            return (
              <button key={w.k} onClick={()=>navigate(w.to)} className={`px-3 py-1.5 rounded-full border text-xs font-bold flex items-center gap-1.5 ${active?'bg-[#1E40AF] text-white border-[#1E40AF]':done?'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-white hover:bg-[#F8FAFC]'}`}>
                <span className={`w-5 h-5 rounded-full grid place-items-center text-[10px] ${active?'bg-white text-[#1E40AF]':done?'bg-emerald-600 text-white':'bg-gray-100'}`}>{done? <Check size={11}/> : i+1}</span>
                {w.k}
              </button>
            );
          })}
        </div>
        <div className="text-xs text-[#94A3B8] mt-2">Quotation→SO→Approval (approve PENDING) → Picking (APPROVED→PICKING) → DO (buat delivery) → Invoice (bayar sisa)</div>
      </div>

      {msg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-3 rounded-xl text-sm mb-4">{msg}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm mb-4">{error}</div>}

      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-6 mb-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs text-[#64748B]">TANGGAL & JAM PEMBELIAN</p>
            <p className="text-lg font-semibold">{order.so_date?.slice(0,10)} {order.created_at ? new Date(order.created_at).toLocaleTimeString('id-ID') : ''}</p>
          </div>
          <div>
            <p className="text-xs text-[#64748B]">STATUS</p>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge status={order.status}/>
              {!isCompleted && !isPaid && invoice && <span className="text-xs text-amber-600 font-semibold">• Menunggu pelunasan</span>}
              {isCompleted && <span className="text-xs text-emerald-600 font-semibold">• Lunas & selesai</span>}
              {order.status==='PICKING' && <span className="text-xs text-purple-600 font-semibold">• Sedang picking</span>}
            </div>
          </div>
          <div>
            <p className="text-xs text-[#64748B]">PELANGGAN</p>
            <p className="font-semibold">{order.customer_name}</p>
            <p className="text-xs text-gray-600">{order.customer_code} {order.customer_phone ? '• '+order.customer_phone : ''}</p>
          </div>
          <div>
            <p className="text-xs text-[#64748B]">ALAMAT PENGIRIMAN</p>
            <p className="text-sm">{order.delivery_address||'Tidak ada (pickup)'}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-[#64748B]">CATATAN</p>
            <p className="text-sm bg-[#F1F5F9] p-2 rounded">{order.notes || '-'}</p>
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
              <span className="text-xs text-[#64748B]">{order.status==='PICKING'?'Picking selesai → buat DO, status jadi SHIPPED':'Sedang dikirim - POD di Logistik → DELIVERED → Invoice'}</span>
            </>
          )}
          {(order.status==='SHIPPED' || order.status==='PARTIAL') && invoice && !isPaid && (
            <Link to="/sales/invoices" className="h-9 px-5 bg-[#1E40AF] text-white rounded-xl grid place-items-center text-sm font-bold">Bayar Sisa {rupiah(sisa)} → Invoice</Link>
          )}
          {showCompleteBtn && (
            <button onClick={handleComplete} disabled={completing} className="h-9 px-5 bg-emerald-600 text-white rounded-xl text-sm font-bold disabled:opacity-50">{completing ? 'Memproses...' : 'Validasi & Tandai Selesai'}</button>
          )}
          {!showCompleteBtn && !isCompleted && invoice && !isPaid && (
            <div className="text-xs bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2 rounded-xl">Belum lunas - sisa {rupiah(sisa)}. Lunasi di Invoice → tombol Bayar.</div>
          )}
          {isCompleted && <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl">Pesanan lunas & selesai.</span>}
          {deliveries.length>0 && <span className="text-xs bg-sky-50 border border-sky-200 text-sky-700 px-3 py-2 rounded-xl">DO: {deliveries.map(d=>d.do_number).join(', ')}</span>}
        </div>
      </div>

      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead><tr className="bg-[#F1F5F9] border-y border-[#E2E8F0] text-[11px] font-bold tracking-widest text-[#64748B]">
              <th className="text-left px-4 py-3 whitespace-nowrap">PRODUK</th>
              <th className="text-right px-4 py-3 whitespace-nowrap">QTY</th>
              <th className="text-right px-4 py-3 whitespace-nowrap">HARGA SATUAN</th>
              <th className="text-right px-4 py-3 whitespace-nowrap">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it,i)=>(
              <tr key={i} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition bg-white">
                <td className="px-4 py-3.5">
                  <div className="font-semibold">{it.product_name}</div>
                  <div className="text-xs text-[#64748B]">{it.sku}</div>
                </td>
                <td className="px-4 py-3.5 text-right">{it.qty}</td>
                <td className="px-4 py-3.5 text-right">{rupiah(it.unit_price)}</td>
                <td className="px-4 py-3.5 text-right font-bold">{rupiah(it.qty*it.unit_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm overflow-hidden p-6">
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
                  <span className={`font-black ${sisa>0.5?'text-amber-600':'text-emerald-600'}`}>{rupiah(sisa)}</span>
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-[#64748B]">Status Bayar:</span>
                  <span className={isPaid?'text-emerald-600 font-bold':'text-amber-600 font-bold'}>{invoice.status} {isPaid ? '• LUNAS' : '• BELUM LUNAS'}</span>
                </div>
                <div className="text-xs text-[#64748B]">Invoice: {invoice.invoice_number}</div>
              </>
            )}
            {!invoice && <div className="text-xs text-[#94A3B8] mt-3">Belum ada invoice untuk SO ini</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
