import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PackageSearch, CheckCircle2, Circle, Truck, Receipt, ArrowLeft, AlertTriangle, MapPin } from 'lucide-react';
import api from '../lib/api';

const rupiah = (n)=> 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(Number(n)||0));
const tgl = (v)=> v ? new Date(String(v).slice(0,10)+'T00:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'}) : '-';

export default function PublicTrack(){
  const { token } = useParams();
  const [data,setData]=useState(null);
  const [err,setErr]=useState('');
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    let alive=true;
    setLoading(true); setErr('');
    api.get('/public/track/'+token)
      .then(r=>{ if(alive) setData(r.data); })
      .catch(e=>{ if(alive) setErr(e.response?.status===404 ? 'Link tidak ditemukan atau sudah dinonaktifkan.' : (e.response?.data?.error||'Gagal memuat pesanan.')); })
      .finally(()=>{ if(alive) setLoading(false); });
    return ()=>{ alive=false; };
  },[token]);

  const doneCount = (data?.timeline||[]).filter(t=>t.done).length;

  return (
    <div className="min-h-screen bg-[#f7f9fd] text-[#0b1c30]">
      <header className="bg-white border-b border-[#e7ecf7]">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-[#0b1c30] text-white grid place-items-center font-bold text-sm">SM</div>
          <div>
            <div className="font-bold text-sm leading-tight">Lacak Pesanan</div>
            <div className="text-[11px] text-[#76777d] leading-tight">PT Sumber Material Jaya</div>
          </div>
          <Link to="/panduan" className="ml-auto text-[11px] font-bold text-[#0051d5] hover:underline">Panduan</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-4">
        {loading && <div className="bg-white rounded-2xl border border-[#e7ecf7] p-10 text-center text-sm text-[#76777d]">Memuat status pesanan…</div>}

        {!loading && err && (
          <div className="bg-white rounded-2xl border border-[#e7ecf7] p-10 text-center">
            <div className="h-12 w-12 rounded-full bg-amber-50 border border-amber-200 text-amber-700 grid place-items-center mx-auto"><AlertTriangle size={22}/></div>
            <div className="font-bold mt-3">Tidak bisa menampilkan pesanan</div>
            <div className="text-xs text-[#45464d] mt-1 max-w-md mx-auto">{err}</div>
            <div className="text-[11px] text-[#76777d] mt-3">Minta link terbaru ke sales/CS kami bila tautan sudah kedaluwarsa.</div>
          </div>
        )}

        {!loading && data && (
          <>
            <div className="rounded-2xl bg-gradient-to-br from-[#0b1c30] via-[#12305c] to-[#0051d5] text-white p-6">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider bg-white/15 px-2.5 py-1 rounded-full">
                <PackageSearch size={12}/> Status Pesanan
              </div>
              <div className="mt-3 font-mono text-lg font-bold">{data.order?.so_number}</div>
              <div className="text-xs text-white/80 mt-1">
                {data.order?.customer} • pesanan {tgl(data.order?.date)} • status <b>{data.order?.status}</b>
              </div>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-xl bg-white/10 border border-white/15 p-3">
                  <div className="text-[10px] uppercase font-bold text-white/70">Nilai pesanan</div>
                  <div className="font-bold text-sm">{data.total_fmt}</div>
                </div>
                <div className="rounded-xl bg-white/10 border border-white/15 p-3">
                  <div className="text-[10px] uppercase font-bold text-white/70">Invoice</div>
                  <div className="font-bold text-sm">{data.invoice?.number || 'belum terbit'}</div>
                </div>
                <div className="rounded-xl bg-white/10 border border-white/15 p-3">
                  <div className="text-[10px] uppercase font-bold text-white/70">Sisa tagihan</div>
                  <div className="font-bold text-sm">{data.sisa_fmt || 'Rp 0'}</div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#e7ecf7] p-5">
              <div className="flex items-center justify-between">
                <div className="font-bold text-sm">Perjalanan pesanan</div>
                <div className="text-[11px] text-[#76777d]">{doneCount}/{data.timeline?.length||0} tahap</div>
              </div>
              <ol className="mt-4 space-y-3">
                {(data.timeline||[]).map((t,i)=>{
                  const last = i === (data.timeline.length-1);
                  return (
                    <li key={t.key} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className={'h-6 w-6 rounded-full grid place-items-center shrink-0 '+(t.done? 'bg-emerald-500 text-white':'bg-[#eef2fa] text-[#9aa4b5] border border-[#e7ecf7]')}>
                          {t.done? <CheckCircle2 size={13}/> : <Circle size={11}/>}
                        </span>
                        {!last && <span className={'w-px flex-1 my-1 '+(t.done? 'bg-emerald-200':'bg-[#e7ecf7]')}/>}
                      </div>
                      <div className="pb-1">
                        <div className={'text-xs font-bold '+(t.done? 'text-[#0b1c30]':'text-[#76777d]')}>{t.label}</div>
                        <div className="text-[11px] text-[#76777d]">{t.at ? tgl(t.at) : (t.done? 'selesai':'menunggu')}</div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>

            {(data.deliveries||[]).length>0 && (
              <div className="bg-white rounded-2xl border border-[#e7ecf7] p-5">
                <div className="font-bold text-sm flex items-center gap-1.5"><Truck size={15}/> Pengiriman</div>
                <div className="mt-3 space-y-2">
                  {data.deliveries.map(d=>(
                    <div key={d.do_number} className="flex items-center justify-between gap-2 rounded-xl border border-[#e7ecf7] bg-[#f7f9fd] px-3 py-2">
                      <div>
                        <div className="font-mono text-xs font-bold">{d.do_number}</div>
                        <div className="text-[11px] text-[#76777d] flex items-center gap-1"><MapPin size={10}/>{d.vehicle||'armada'} • {tgl(d.date)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] font-bold">{d.status}</div>
                        <div className={'text-[10px] '+(d.received? 'text-emerald-600':'text-[#76777d]')}>{d.received? 'sudah diterima':'belum diterima'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.invoice && (
              <div className="bg-white rounded-2xl border border-[#e7ecf7] p-5">
                <div className="font-bold text-sm flex items-center gap-1.5"><Receipt size={15}/> Invoice</div>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div><div className="text-[10px] uppercase font-bold text-[#76777d]">Nomor</div><div className="font-mono font-bold">{data.invoice.number}</div></div>
                  <div><div className="text-[10px] uppercase font-bold text-[#76777d]">Status</div><div className="font-bold">{data.invoice.status}</div></div>
                  <div><div className="text-[10px] uppercase font-bold text-[#76777d]">Jatuh tempo</div><div className="font-bold">{tgl(data.invoice.due_date)}</div></div>
                  <div><div className="text-[10px] uppercase font-bold text-[#76777d]">Terbayar</div><div className="font-bold">{rupiah(data.invoice.paid)}</div></div>
                </div>
              </div>
            )}

            <div className="text-center text-[11px] text-[#76777d] py-4">
              Halaman ini diperbarui otomatis dari sistem kami. Untuk perubahan alamat atau jadwal, hubungi sales Anda.
              <div className="mt-2"><Link to="/login" className="text-[#0051d5] font-bold hover:underline inline-flex items-center gap-1"><ArrowLeft size={11}/> Masuk ERP</Link></div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
