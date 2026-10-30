import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Printer, ArrowLeft, MapPin, Truck, User, Receipt, ShieldCheck, PackageCheck, Phone } from 'lucide-react';
import api from '../lib/api';
import { PosBadge, PosSkeleton, PosError, posBtnSecondary, posBtnPrimary } from '../components/PosUI';
import { LOCATION, LOCATION_COORDINATES } from '../config/location';
import OfficeConfirmModal from '../components/OfficeConfirmModal';
import { useAuth } from '../store/auth';
import { canAccess, R_OFFICE_CONFIRM } from '../config/access';

const nf = (n)=> new Intl.NumberFormat('id-ID').format(Number(n)||0);
const rupiah = (n)=> 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(Number(n)||0));
const tgl = (v)=> v ? new Date(v).toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' }) : '-';
const jam = (v)=> v ? new Date(v).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' }) : '-';
const TONE = (s)=> s==='DELIVERED'?'emerald' : s==='INVOICED'?'purple' : s==='CANCELLED'?'red' : 'sky';

function Field({ label, children, className='' }){
  return (
    <div className={className}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#76777d]">{label}</div>
      <div className="text-[12.5px] text-[#0b1c30] font-semibold leading-snug mt-0.5 break-words">{children}</div>
    </div>
  );
}

export default function SuratJalan(){
  const { id } = useParams();
  const [doc,setDoc] = useState(null);
  const [loading,setLoading] = useState(true);
  const [err,setErr] = useState('');
  const [msg,setMsg] = useState('');
  const [officeOpen,setOfficeOpen] = useState(false);
  const roles = useAuth(s=>s.user)?.roles || [];
  const canConfirmOffice = canAccess(roles, R_OFFICE_CONFIRM);

  const load = ()=>{
    setLoading(true); setErr('');
    api.get('/fleet/surat-jalan/'+id)
      .then(r=> setDoc(r.data))
      .catch(e=> setErr(e.response?.data?.error || e.message || 'Gagal memuat surat jalan'))
      .finally(()=> setLoading(false));
  };
  useEffect(()=>{ load(); },[id]);

  if(loading) return <div className="max-w-[880px] mx-auto"><div className="bg-white rounded-xl border border-[#e7ecf7]"><PosSkeleton rows={8} cols={4}/></div></div>;
  if(err) return <div className="max-w-[880px] mx-auto"><PosError message={err} onRetry={load}/></div>;
  if(!doc) return null;

  const items = doc.items || [];
  const totalQty = items.reduce((a,it)=> a + parseFloat(it.qty||0), 0);
  const delivered = ['DELIVERED','INVOICED'].includes(String(doc.status).toUpperCase());
  const claimed = !!doc.driver_name;

  return (
    <div className="max-w-[880px] mx-auto space-y-3">
      {/* aksi (tidak ikut tercetak) */}
      <div className="no-print flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <Link to="/driver" className={posBtnSecondary+' h-9 px-3 text-xs'}><ArrowLeft size={14}/> Kembali</Link>
          <div className="text-xs text-[#76777d]">Surat jalan elektronik - bisa dicetak / disimpan PDF</div>
        </div>
        <div className="flex items-center gap-2">
          <PosBadge tone={TONE(doc.status)}>{String(doc.status||'-').replace('_',' ')}</PosBadge>
          {!claimed && <PosBadge tone="amber">belum diklaim</PosBadge>}
          {delivered && !doc.office_confirmed_at && canConfirmOffice && (
            <button onClick={()=>setOfficeOpen(true)} className={posBtnSecondary+' h-9 px-3 text-xs'}><ShieldCheck size={14}/> Konfirmasi Gudang</button>
          )}
          <button onClick={()=>window.print()} className={posBtnPrimary+' h-9 px-4 text-xs'}><Printer size={14}/> Cetak / PDF</button>
        </div>
      </div>

      {/* dokumen */}
      <div id="surat-jalan" className="bg-white rounded-xl border border-[#e7ecf7] shadow-card overflow-hidden print:border-0 print:shadow-none print:rounded-none">
        <div className="p-6 sm:p-8 print:p-0">
          {/* kop */}
          <div className="flex items-start justify-between gap-4 pb-4 border-b-2 border-[#0b1c30]">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-[#0051d5] text-white grid place-items-center font-bold text-lg shrink-0">SM</div>
              <div className="min-w-0">
                <div className="font-display font-extrabold text-[15px] text-[#0b1c30] leading-tight">PT Sumber Material Jaya</div>
                <div className="text-[11px] text-[#45464d] leading-snug mt-0.5">Distributor material bangunan</div>
                <div className="text-[11px] text-[#76777d] flex items-center gap-1 mt-1"><MapPin size={11}/>{LOCATION.name} - <span className="font-mono">{LOCATION_COORDINATES}</span></div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] font-bold tracking-[0.18em] text-[#76777d]">DOKUMEN PENGIRIMAN</div>
              <div className="font-display font-extrabold text-xl text-[#0b1c30] leading-tight">SURAT JALAN</div>
              <div className="font-mono text-[12px] font-bold text-[#0051d5] mt-0.5">{doc.do_number}</div>
              <div className="text-[11px] text-[#45464d] mt-0.5">{tgl(doc.delivery_date)}</div>
            </div>
          </div>

          {/* meta */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 py-4 border-b border-[#e7ecf7]">
            <Field label="Kepada">
              <div className="flex items-center gap-1"><User size={12} className="text-[#76777d]"/>{doc.customer_name}</div>
              {doc.customer_code && <div className="text-[11px] font-normal text-[#76777d] font-mono">{doc.customer_code}</div>}
              {doc.customer_phone && <div className="text-[11px] font-normal text-[#45464d] flex items-center gap-1"><Phone size={10}/>{doc.customer_phone}</div>}
            </Field>
            <Field label="Kendaraan">
              <div className="flex items-center gap-1"><Truck size={12} className="text-[#76777d]"/>{doc.vehicle_plat || doc.vehicle_no || '-'}</div>
              <div className="text-[11px] font-normal text-[#76777d]">{doc.vehicle_type || ''}</div>
            </Field>
            <Field label="Pengemudi">
              <div>{doc.driver_name || <span className="text-[#b45309]">Belum diklaim</span>}</div>
              {doc.driver_phone && <div className="text-[11px] font-normal text-[#45464d]">{doc.driver_phone}</div>}
              {doc.trip_number && <div className="text-[11px] font-normal text-[#76777d] font-mono">{doc.trip_number}</div>}
            </Field>
            <Field label="Rute / Jarak">
              <div className="flex items-center gap-1"><MapPin size={12} className="text-[#76777d]"/>{doc.distance_km? nf(doc.distance_km)+' km' : 'jarak belum tersedia'}</div>
              <div className="text-[11px] font-normal text-[#76777d]">{doc.est_zone? 'Zona '+doc.est_zone : ''}{doc.est_weight_ton? ' - ± '+nf(doc.est_weight_ton*1000)+' kg' : ''}</div>
            </Field>
          </div>

          {/* alamat tujuan */}
          <div className="py-3 border-b border-[#e7ecf7]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#76777d]">Alamat pengiriman</div>
            <div className="text-[12.5px] text-[#0b1c30] leading-snug mt-0.5">{doc.address || 'Alamat belum diisi'}</div>
            {(doc.delivery_lat && doc.delivery_lng) &&
              <a className="no-print text-[11px] text-[#0051d5] hover:underline inline-flex items-center gap-1 mt-1"
                 href={`https://www.openstreetmap.org/?mlat=${doc.delivery_lat}&mlon=${doc.delivery_lng}#map=16/${doc.delivery_lat}/${doc.delivery_lng}`} target="_blank" rel="noreferrer">
                <MapPin size={11}/> Buka titik tujuan di peta
              </a>}
          </div>

          {/* item */}
          <table className="w-full mt-4 text-[12px]">
            <thead>
              <tr className="bg-[#e5eeff] text-[10px] font-bold uppercase tracking-wider text-[#45464d]">
                <th className="text-left px-2.5 py-2 w-8">No</th>
                <th className="text-left px-2.5 py-2">Barang</th>
                <th className="text-left px-2.5 py-2 w-24">SKU</th>
                <th className="text-right px-2.5 py-2 w-20">Qty</th>
                <th className="text-left px-2.5 py-2 w-16">Satuan</th>
              </tr>
            </thead>
            <tbody>
              {items.length===0 && <tr><td colSpan={5} className="px-2.5 py-6 text-center text-[#76777d]">Tidak ada item</td></tr>}
              {items.map((it,i)=>(
                <tr key={it.id || i} className="border-b border-[#e5eeff]">
                  <td className="px-2.5 py-2 text-[#76777d] tabular-nums">{i+1}</td>
                  <td className="px-2.5 py-2 font-semibold text-[#0b1c30]">{it.product_name}</td>
                  <td className="px-2.5 py-2 font-mono text-[11px] text-[#45464d]">{it.sku||'-'}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums font-bold">{nf(it.qty)}</td>
                  <td className="px-2.5 py-2 text-[#45464d]">{it.unit_code||'-'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="px-2.5 py-2 text-right text-[11px] font-bold uppercase tracking-wider text-[#45464d]">Total qty</td>
                <td className="px-2.5 py-2 text-right tabular-nums font-extrabold text-[#0b1c30]">{nf(totalQty)}</td>
                <td/>
              </tr>
            </tfoot>
          </table>

          {/* bukti serah terima */}
          {delivered && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 grid sm:grid-cols-2 gap-3 items-start">
              <div className="space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#007a55] flex items-center gap-1"><ShieldCheck size={12}/> Bukti serah terima</div>
                <div className="text-[12px] text-[#0b1c30]">Diterima oleh <b>{doc.received_by||'-'}</b></div>
                <div className="text-[11px] text-[#45464d]">{tgl(doc.delivered_at)} - {jam(doc.delivered_at)}</div>
                <div className="text-[11px] text-[#45464d] flex items-center gap-1">
                  <Receipt size={11}/> Invoice: {doc.invoice_number || <span className="text-[#76777d]">belum dibuat sales</span>}
                  {doc.invoice_handed ? <span className="ml-1 text-[10px] font-bold text-[#007a55]">(diserahkan)</span> : null}
                </div>
                {doc.pod_notes && <div className="text-[11px] text-[#45464d] italic">"{doc.pod_notes}"</div>}
              </div>
              <div className="flex items-center gap-2 justify-end">
                {doc.pod_photo_url && <img src={doc.pod_photo_url} alt="Foto bukti terima" className="h-20 rounded-lg border border-emerald-200 object-cover"/>}
                {doc.pod_signature_url && <img src={doc.pod_signature_url} alt="Tanda tangan penerima" className="h-20 rounded-lg border border-[#e7ecf7] bg-white object-contain px-2"/>}
              </div>
            </div>
          )}

          {/* status tanda tangan 3 pihak */}
          <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
            {[
              ['Pengirim/Gudang', !!doc.sender_signature_url],
              ['Pengemudi', !!doc.driver_signature_url],
              ['Penerima', !!doc.pod_signature_url],
              ['Konfirmasi kantor', !!doc.office_confirmed_at],
            ].map(([label, ok])=>(
              <span key={label} className={"inline-flex items-center gap-1 px-2 py-1 rounded-full border "+(ok? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200')}>
                {ok? <ShieldCheck size={10}/> : null}{label}: {ok? 'sudah' : 'belum'}
              </span>
            ))}
          </div>

          {/* tanda tangan 3 pihak: pengirim/gudang, pengemudi, penerima */}
          <div className="grid grid-cols-3 gap-4 mt-6">
            {[
              ['Pengirim / Gudang', doc.sender_signed_by || 'Gudang Pusat', doc.sender_signature_url, doc.sender_signed_at],
              ['Pengemudi', doc.driver_name || '-', doc.driver_signature_url, doc.driver_signed_at],
              ['Penerima', doc.received_by || '(nama & tanda tangan)', doc.pod_signature_url, doc.delivered_at],
            ].map(([label, name, sig, at])=>(
              <div key={label} className="text-center">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#76777d]">{label}</div>
                <div className="h-14 mt-1 grid place-items-center">
                  {sig? <img src={sig} alt={'ttd '+label} className="max-h-14 object-contain"/> : <span className="text-[10px] text-[#b0b1b6]">belum tanda tangan</span>}
                </div>
                <div className="border-t border-[#b0b1b6] pt-1 text-[11px] font-semibold text-[#0b1c30] truncate">{name}</div>
                <div className="text-[9px] text-[#76777d] h-3">{at? tgl(at)+' • '+jam(at) : ''}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-3 border-t border-[#e7ecf7] text-[10px] text-[#76777d] flex items-start justify-between gap-4">
            <span className="leading-snug max-w-[520px]">
              Barang telah diterima dalam kondisi baik dan jumlah sesuai. Dokumen ini dibuat otomatis oleh sistem ERP
              {doc.invoice_number? ' - referensi invoice '+doc.invoice_number : ''}.
            </span>
            <span className="font-mono shrink-0">{doc.do_number}</span>
          </div>
        </div>
      </div>

      <div className="no-print text-[11px] text-[#76777d] flex items-center gap-1.5">
        <PackageCheck size={12}/> Surat jalan muncul otomatis begitu pengiriman diklaim driver, dan bukti terima terisi setelah trip diselesaikan.
      </div>

      {msg && <div className="no-print bg-emerald-50 border border-emerald-200 text-emerald-700 p-3 rounded-xl text-sm">{msg}</div>}

      <OfficeConfirmModal
        open={officeOpen}
        delivery={doc ? { ...doc, id: doc.id, sender_signed: !!doc.sender_signature_url } : null}
        onClose={()=>setOfficeOpen(false)}
        onSuccess={({message})=>{ setMsg(message); setOfficeOpen(false); load(); }}
        onErr={setErr}
      />
    </div>
  );
}
