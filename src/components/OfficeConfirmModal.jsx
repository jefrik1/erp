import { useEffect, useState } from 'react';
import { ShieldCheck, CheckCircle2, X } from 'lucide-react';
import api from '../lib/api';
import SignaturePad from './SignaturePad';

/**
 * Konfirmasi Pengirim/Gudang/Kantor untuk sebuah DO.
 * Wajib sebelum invoice DO boleh dilunasi dan sebelum SO bisa COMPLETED.
 * Kalau gudang sudah menandatangani saat DO dibuat, tanda tangan itu dipakai
 * ulang (kantor cukup konfirmasi) — tidak perlu tanda tangan dua kali.
 *
 * Dipakai di: Logistik (tabel DO), Surat Jalan, dan Detail Sales Order.
 */
export default function OfficeConfirmModal({ open, onClose, delivery, onSuccess, onErr }){
  const [name,setName]=useState('');
  const [sig,setSig]=useState('');
  const [submitting,setSubmitting]=useState(false);
  useEffect(()=>{
    if(open){ setName(delivery?.sender_signed_by||''); setSig(''); }
  },[open, delivery?.id]);
  if(!open||!delivery) return null;
  const sudahTtd = !!(delivery.sender_signed || delivery.sender_signature_url);
  const submit=async()=>{
    if(!name.trim()) return onErr('Nama petugas gudang/pengirim wajib diisi');
    if(!sudahTtd && !sig) return onErr('Tanda tangan Pengirim/Gudang wajib');
    setSubmitting(true);
    try{
      const r=await api.post('/sales/deliveries/'+delivery.id+'/confirm-office',{ sender_signature_url: sig||undefined, sender_signed_by: name.trim() });
      onSuccess({
        message:'Konfirmasi Pengirim/Gudang untuk '+(delivery.do_number||('DO #'+delivery.id))+' tersimpan. Invoice DO ini sekarang bisa dilunasi, dan SO bisa COMPLETED setelah semua lunas.',
        delivery:{ ...delivery, office_confirmed_at:new Date().toISOString(), sender_signed:true, sender_signed_by:r.data?.sender_signed_by||name.trim() },
        sender_signed_by: r.data?.sender_signed_by||name.trim(),
      });
      onClose();
    }catch(e){ onErr(e.response?.data?.error||e.message); }
    finally{ setSubmitting(false); }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-3 sm:p-4 bg-black/40 overflow-auto">
      <div className="bg-white rounded-xl w-full max-w-[560px] shadow-raised border border-[#e7ecf7] overflow-hidden max-h-[92vh] flex flex-col animate-pop">
        <div className="p-4 border-b flex justify-between gap-3 bg-[#eff4ff]">
          <div>
            <div className="text-sm font-bold text-[#0b1c30] flex items-center gap-1.5"><ShieldCheck size={16} className="text-[#0051d5]"/> Konfirmasi Pengirim / Gudang</div>
            <div className="text-xs text-[#45464d] mt-1">{[delivery.do_number, delivery.customer_name, delivery.vehicle_no].filter(Boolean).join(' • ') || '-'}</div>
          </div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-full border bg-white shrink-0"><X size={14}/></button>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-3">
          <div className="text-xs text-[#45464d] bg-[#eff4ff] border border-[#e7ecf7] rounded-xl p-3 leading-relaxed">
            Barang sudah diterima penerima. Konfirmasi ini menandai gudang/kantor sudah menutup pengiriman —
            tanpa konfirmasi ini invoice DO tidak bisa dilunasi dan SO tidak bisa <b>COMPLETED</b>.
          </div>
          {sudahTtd && (
            <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-start gap-2">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0"/>
              <span>Tanda tangan pengirim sudah tersimpan{delivery.sender_signed_by? ' atas nama '+delivery.sender_signed_by:''} — tidak perlu tanda tangan ulang.</span>
            </div>
          )}
          <label className="space-y-1 block">
            <span className="text-[11px] font-bold tracking-wider text-[#45464d] uppercase">Nama petugas gudang / pengirim *</span>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="nama lengkap petugas"
              className="w-full h-[42px] px-3 bg-[#eff4ff] border border-[#e7ecf7] rounded-xl text-sm outline-none focus:bg-white focus:border-[#0051d5]"/>
          </label>
          {!sudahTtd && (
            <SignaturePad label="Tanda tangan pengirim" hint="Petugas gudang menandatangani sebagai pengirim barang" height={150}
              onChange={(v)=>setSig(v||'')}/>
          )}
        </div>
        <div className="p-3 border-t bg-white flex justify-end gap-2 sticky bottom-0">
          <button onClick={onClose} className="h-10 px-5 rounded-xl border bg-white text-sm font-semibold">Batal</button>
          <button disabled={submitting} onClick={submit} className="h-10 px-5 rounded-xl bg-[#0051d5] text-white text-sm font-bold disabled:opacity-50 hover:bg-blue-800">{submitting?'Menyimpan...':'Konfirmasi Gudang'}</button>
        </div>
      </div>
    </div>
  );
}
