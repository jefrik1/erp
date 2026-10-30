import { Component } from 'react';

/**
 * Error boundary global: kalau satu halaman crash (data aneh, chunk gagal,
 * bug render), pengguna melihat pesan + tombol pulih — bukan layar putih.
 * Catatan: error di event handler async tetap ditangani toast/dialog setempat.
 */
export default class ErrorBoundary extends Component {
  constructor(props){
    super(props);
    this.state = { error: null, info: '' };
  }
  static getDerivedStateFromError(error){
    return { error };
  }
  componentDidCatch(error, info){
    // Di produksi kirim ke monitoring (Sentry/Logtail). Untuk sekarang: console.
    console.error('[UI crash]', error, info?.componentStack);
    this.setState({ info: String(info?.componentStack||'').slice(0, 600) });
  }
  render(){
    const { error, info } = this.state;
    if(!error) return this.props.children;
    return (
      <div className="min-h-[70vh] grid place-items-center p-6">
        <div className="w-full max-w-lg bg-white rounded-2xl border border-line p-6 text-center shadow-card">
          <div className="h-12 w-12 rounded-full bg-red-50 border border-red-200 text-red-600 grid place-items-center mx-auto text-xl font-bold">!</div>
          <div className="mt-3 font-bold text-ink">Halaman gagal ditampilkan</div>
          <p className="mt-1 text-xs text-ink-2 leading-relaxed">
            Terjadi kesalahan saat memuat halaman ini. Data Anda tidak hilang — coba muat ulang.
            Kalau berulang, kirim pesan di bawah ke IT support.
          </p>
          <div className="mt-3 rounded-lg bg-[#f7f9fd] border border-line p-2 text-left text-[10px] font-mono text-ink-3 max-h-24 overflow-auto">
            {String(error?.message||error)}
            {info && <div className="mt-1 opacity-70">{info}</div>}
          </div>
          <div className="mt-4 flex justify-center gap-2">
            <button onClick={()=>{ this.setState({error:null, info:''}); window.location.reload(); }}
              className="h-9 px-4 rounded-xl bg-brand text-white text-xs font-bold hover:bg-brand-strong">Muat Ulang</button>
            <a href="/" className="h-9 px-4 rounded-xl border border-line bg-white text-xs font-bold text-ink-2 grid place-items-center hover:bg-surface-2">Ke Dashboard</a>
          </div>
        </div>
      </div>
    );
  }
}
