import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, RefreshCw, MapPin, Package, Truck, CheckCircle2, ArrowRight, Printer } from 'lucide-react';
import api from '../lib/api';
import {
  PosPageHeader, PosCard, PosBadge, PosEmpty, PosSkeleton, PosError, PosStat,
  posBtnSecondary, posBtnSm,
} from '../components/PosUI';

const nf = (n)=> new Intl.NumberFormat('id-ID').format(Math.round(Number(n)||0));
const tgl = (v)=> v ? new Date(v).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-';
const TONE = (s)=> s==='DELIVERED'?'emerald' : s==='INVOICED'?'purple' : s==='CANCELLED'?'red' : 'sky';

export default function SuratJalanList(){
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState('');
  const [q,setQ]=useState('');

  const load = useCallback(async()=>{
    setLoading(true); setErr('');
    try{
      const r = await api.get('/fleet/surat-jalan');
      setRows(Array.isArray(r.data)? r.data : []);
    }catch(e){ setErr(e.response?.data?.error||e.message||'Gagal memuat surat jalan'); }
    finally{ setLoading(false); }
  },[]);
  useEffect(()=>{ load(); },[load]);

  const list = useMemo(()=>{
    const key=q.trim().toLowerCase();
    if(!key) return rows;
    return rows.filter(r=> [r.do_number,r.customer_name,r.so_number,r.address].filter(Boolean).some(v=>String(v).toLowerCase().includes(key)));
  },[rows,q]);

  const menunggu = rows.filter(r=>String(r.status).toUpperCase()==='IN_TRANSIT').length;
  const terkirim = rows.filter(r=>['DELIVERED','INVOICED'].includes(String(r.status).toUpperCase())).length;

  return (
    <div className="space-y-3">
      <PosPageHeader icon={FileText} title="Surat Jalan"
        subtitle="Dokumen pengiriman yang muncul setelah pengiriman diklaim driver - siap dicetak / disimpan PDF"
        actions={<button onClick={load} className={posBtnSecondary+' h-9 px-4 text-xs'}><RefreshCw size={13} className={loading?'animate-spin':''}/> Muat Ulang</button>}/>

      <div className="grid grid-cols-3 gap-3">
        <PosStat icon={Package} tone="bg-surface-3 text-brand" label="TOTAL SURAT JALAN" value={nf(rows.length)} sub="semua pengiriman"/>
        <PosStat icon={Truck} tone="bg-sky-50 text-sky-700" label="DI JALAN" value={nf(menunggu)} sub="belum selesai"/>
        <PosStat icon={CheckCircle2} tone="bg-emerald-50 text-emerald-700" label="TERKIRIM" value={nf(terkirim)} sub="sudah ada bukti terima"/>
      </div>

      <PosCard>
        <div className="p-3 sm:p-4 border-b border-line flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
          <div className="text-sm font-bold text-ink">Daftar Surat Jalan</div>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Cari no. DO / pelanggan / SO..."
            className="h-9 px-3 bg-surface-2 border border-line rounded-lg text-xs w-full sm:w-72 outline-none focus:bg-white focus:border-brand"/>
        </div>

        {loading ? <PosSkeleton rows={6} cols={4}/> : err ? <PosError message={err} onRetry={load}/> : list.length===0 ? (
          <PosEmpty text={q? 'Tidak ada surat jalan yang cocok' : 'Belum ada surat jalan'}
            hint={q? 'Coba kata kunci lain.' : 'Klaim pengiriman dulu di halaman Trip Saya — surat jalan otomatis muncul di sini.'}/>
        ) : (
          <div className="divide-y divide-[#e7ecf7]">
            {list.map(r=>(
              <div key={r.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-surface-2/60 transition group">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-surface-3 text-brand grid place-items-center shrink-0"><FileText size={16}/></div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Link to={'/surat-jalan/'+r.id} className="font-mono text-[12.5px] font-bold text-ink group-hover:text-brand">{r.do_number}</Link>
                      <PosBadge tone={TONE(r.status)}>{String(r.status||'-').replace('_',' ')}</PosBadge>
                      {r.invoice_handed && <PosBadge tone="emerald">invoice diserahkan</PosBadge>}
                    </div>
                    <div className="text-[13px] font-semibold text-ink-2 truncate mt-0.5">{r.customer_name||'-'}{r.so_number? <span className="font-normal text-ink-3 font-mono"> · {r.so_number}</span>:null}</div>
                    <div className="text-[11px] text-ink-2 flex items-center gap-1 mt-0.5"><MapPin size={11} className="shrink-0"/><span className="truncate">{r.address||'Alamat belum diisi'}</span></div>
                    <div className="text-[11px] text-ink-3 mt-1 flex flex-wrap gap-x-3">
                      <span>{nf(r.items_count)} jenis · {nf(r.total_qty)} qty</span>
                      <span>{r.distance_km? nf(r.distance_km)+' km' : 'jarak -'}</span>
                      <span>{r.vehicle_no||'-'}</span>
                      {r.driver_name? <span>Sopir: {r.driver_name}</span>:null}
                      {r.received_by? <span className="text-[#007a55]">Diterima {r.received_by}</span>:null}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-ink-3 hidden sm:block">{tgl(r.delivery_date)}</span>
                  <Link to={'/surat-jalan/'+r.id} className={posBtnSm+' h-9'}><Printer size={13}/> Buka <ArrowRight size={12}/></Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </PosCard>

      <div className="text-[11px] text-ink-3 flex items-center gap-1.5">
        <FileText size={12}/> Surat jalan dibuat otomatis dari DO. Jarak dihitung dari alamat tujuan (POS/SO/DO), bukan input manual.
      </div>
    </div>
  );
}
