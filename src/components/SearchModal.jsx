import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Search, X, ArrowRight, Loader2 } from 'lucide-react';

const TYPE_TONE = {
  SO: 'bg-info-soft text-info',
  PO: 'bg-surface-2 text-ink-2',
  PROJECT: 'bg-warning-soft text-warning',
  CONSIGNMENT: 'bg-success-soft text-success',
  PRODUCT: 'bg-surface-2 text-ink-2',
  CUSTOMER: 'bg-success-soft text-success',
};

export default function SearchModal({ open, onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) { setQuery(''); setResults([]); setTimeout(()=>inputRef.current?.focus(), 10); }
  }, [open]);

  // ESC global (dulu hanya jalan saat input fokus)
  useEffect(() => {
    if (!open) return;
    const h = (e)=>{ if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        const resp = await api.get('/search', { params: { q: query } });
        setResults(Array.isArray(resp.data) ? resp.data : []);
      } catch (e) {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (result) => {
    onClose();
    if (result.url) navigate(result.url);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-navy/50 backdrop-blur-sm flex items-start justify-center pt-24 px-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-[600px] max-h-[520px] flex flex-col overflow-hidden animate-pop"
        onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Pencarian global">
        <div className="px-4 py-3 flex items-center gap-3 border-b border-line">
          <Search size={20} className="text-ink-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari Sales Order, PO, proyek, produk, pelanggan..."
            className="flex-1 bg-transparent outline-none text-body-md text-ink placeholder:text-ink-3"
          />
          {loading && <Loader2 size={16} className="text-brand animate-spin"/>}
          <button onClick={onClose} aria-label="Tutup" className="p-1.5 rounded-lg text-ink-3 hover:text-ink hover:bg-surface-2 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!loading && !query && (
            <div className="px-4 py-10 text-center">
              <div className="text-label-lg text-ink">Mulai mengetik untuk mencari</div>
              <div className="text-body-sm text-ink-3 mt-1">Nomor dokumen, nama produk, atau pelanggan</div>
            </div>
          )}

          {!loading && query && results.length === 0 && (
            <div className="px-4 py-10 text-center">
              <div className="text-label-lg text-ink">Tidak ada hasil untuk &quot;{query}&quot;</div>
              <div className="text-body-sm text-ink-3 mt-1">Coba kata kunci lain atau periksa ejaan</div>
            </div>
          )}

          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => handleSelect(r)}
              className="w-full px-4 py-3 hover:bg-surface-2 text-left flex items-center gap-3 transition-colors group border-b border-line/60 last:border-0"
            >
              <span className={`px-2 py-1 rounded-md text-label-sm ${TYPE_TONE[r.type] || 'bg-surface-2 text-ink-2'}`}>
                {r.type}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-label-lg text-ink truncate">{r.number}</span>
                <span className="block text-body-sm text-ink-3 truncate font-normal">{r.name}</span>
              </span>
              {r.status && <span className="text-label-sm text-ink-3">{r.status}</span>}
              <ArrowRight size={16} className="text-line-strong group-hover:text-brand transition-colors"/>
            </button>
          ))}
        </div>

        <div className="px-4 py-2.5 bg-surface-2 flex items-center justify-between">
          <span className="text-label-sm text-ink-3 font-normal">
            <kbd className="px-1.5 py-1 bg-surface rounded mono shadow-sm">ESC</kbd> tutup
          </span>
          <span className="text-label-sm text-ink-3 font-normal">Pencarian global</span>
        </div>
      </div>
    </div>
  );
}
