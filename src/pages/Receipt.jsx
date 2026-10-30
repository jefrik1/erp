import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Printer, ArrowLeft } from 'lucide-react';
import api from '../lib/api';

const nf = (n)=> new Intl.NumberFormat('id-ID').format(Number(n)||0);
const rp = (n)=> 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(Number(n)||0));
const tgl = (v)=> v? new Date(String(v).slice(0,10)+'T00:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'2-digit',year:'numeric'}) : '-';

/**
 * Struk thermal 80mm — buka di tab baru lalu Ctrl+P / tombol Cetak.
 * Ukuran kolom 32 karakter agar pas printer 58–80mm.
 */
export default function Receipt(){
  const { id } = useParams();
  const navigate = useNavigate();
  const [inv,setInv]=useState(null); const [err,setErr]=useState('');
  const printed = useRef(false);

  useEffect(()=>{
    api.get('/sales/invoices/'+id)
      .then(r=>setInv(r.data))
      .catch(e=>setErr(e.response?.data?.error||e.message||'Gagal memuat invoice'));
  },[id]);

  if(err) return <div className="p-6 text-sm text-red-600">{err}</div>;
  if(!inv) return <div className="p-6 text-sm text-[#45464d]">Memuat struk…</div>;

  const items = inv.items||[];
  const payments = inv.payments||[];
  const totalDisc = Number(inv.discount)||0;

  return (
    <div className="min-h-screen bg-[#eef2f9] py-6 print:bg-white print:py-0">
      <style>{`
        @media print {
          @page { size: 80mm auto; margin: 3mm; }
          body { background:#fff !important; }
          .no-print { display:none !important; }
          #receipt { width:72mm; box-shadow:none !important; border:0 !important; margin:0 !important; padding:0 !important; }
          #receipt * { color:#000 !important; }
        }
      `}</style>

      <div className="no-print max-w-[340px] mx-auto mb-3 flex items-center justify-between">
        <button onClick={()=>navigate(-1)} className="inline-flex items-center gap-1 text-xs font-bold text-[#45464d]"><ArrowLeft size={14}/> Kembali</button>
        <button onClick={()=>window.print()} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#131b2e] text-white text-xs font-bold"><Printer size={14}/> Cetak Struk</button>
      </div>

      <div id="receipt" className="mx-auto w-[340px] bg-white border border-[#e7ecf7] rounded-xl p-4 font-mono text-[11px] leading-[1.5] text-black">
        <div className="text-center space-y-0.5">
          <div className="font-bold text-[13px] tracking-wide">PT SUMBER MATERIAL JAYA</div>
          <div>Jl. Raya Industri No. 88, Gresik</div>
          <div>Telp. 031-1234567 • NPWP 01.234.567.8-901.000</div>
        </div>
        <div className="my-2 border-t border-dashed border-black/40"/>
        <div className="flex justify-between"><span>No.</span><span className="font-bold">{inv.invoice_number}</span></div>
        <div className="flex justify-between"><span>Tanggal</span><span>{tgl(inv.invoice_date)}</span></div>
        <div className="flex justify-between"><span>Kasir</span><span>{(inv.cashier_name||inv.cashier_username||'-')}</span></div>
        <div className="flex justify-between"><span>Pelanggan</span><span className="text-right max-w-[60%] truncate">{inv.customer_name||'Umum'}</span></div>
        {inv.so_number && <div className="flex justify-between"><span>SO</span><span>{inv.so_number}</span></div>}
        <div className="my-2 border-t border-dashed border-black/40"/>

        <div className="space-y-1.5">
          {items.map(it=>(
            <div key={it.id}>
              <div className="font-semibold">{it.name}</div>
              <div className="flex justify-between">
                <span>{nf(it.qty)} {it.unit||''} × {nf(it.unit_price)}</span>
                <span>{nf(it.total)}</span>
              </div>
            </div>
          ))}
          {!items.length && <div className="text-center py-1">(tanpa rincian item)</div>}
        </div>

        <div className="my-2 border-t border-dashed border-black/40"/>
        <div className="flex justify-between"><span>Subtotal</span><span>{nf(inv.subtotal)}</span></div>
        {totalDisc>0 && <div className="flex justify-between"><span>Diskon{inv.discount_pct? ` (${inv.discount_pct}%)`:''}</span><span>-{nf(totalDisc)}</span></div>}
        <div className="flex justify-between"><span>PPN 11%</span><span>{nf(inv.tax)}</span></div>
        <div className="flex justify-between font-bold text-[13px] mt-1 pt-1 border-t border-black/60"><span>TOTAL</span><span>{rp(inv.total)}</span></div>
        <div className="flex justify-between"><span>Dibayar</span><span>{nf(inv.paid_amount)}</span></div>
        {Number(inv.outstanding)>0 && <div className="flex justify-between font-bold"><span>Sisa</span><span>{nf(inv.outstanding)}</span></div>}

        {payments.length>0 && <>
          <div className="my-2 border-t border-dashed border-black/40"/>
          <div className="font-bold">Pembayaran</div>
          {payments.map(p=>(
            <div key={p.id} className="flex justify-between">
              <span>{tgl(p.payment_date)} {p.method||''}</span><span>{nf(p.amount)}</span>
            </div>
          ))}
        </>}

        <div className="my-2 border-t border-dashed border-black/40"/>
        <div className="text-center space-y-0.5">
          <div>Terima kasih atas kepercayaan Anda</div>
          <div>Barang yang sudah dibeli tidak dapat ditukar</div>
          <div className="text-[10px] mt-1">{new Date().toLocaleString('id-ID')}</div>
        </div>
      </div>
    </div>
  );
}
