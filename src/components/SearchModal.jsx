import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
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
    if (open) { setQuery(''); setResults([]); setTimeout(()=>inputRef.current?.focus(), 15); }
  }, [open]);

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
    }, 280);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (result) => {
    onClose();
    if (result.url) navigate(result.url);
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center pt-20 px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="absolute inset-0 bg-navy/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="relative bg-surface rounded-2xl shadow-modal w-full max-w-[620px] max-h-[540px] flex flex-col overflow-hidden border border-line"
            role="dialog" aria-modal="true" aria-label="Pencarian global"
            onClick={e=>e.stopPropagation()}
          >
            <div className="px-4 py-3.5 flex items-center gap-3 border-b border-line bg-surface">
              <Search size={20} className="text-brand shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari Sales Order, PO, proyek, produk, pelanggan..."
                className="flex-1 bg-transparent outline-none text-body-md text-ink placeholder:text-ink-3 font-medium"
              />
              {loading && <Loader2 size={16} className="text-brand animate-spin"/>}
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={onClose} aria-label="Tutup"
                className="p-1.5 rounded-lg text-ink-3 hover:text-ink hover:bg-surface-2 transition-colors"
              >
                <X size={18} />
              </motion.button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {!loading && !query && (
                <div className="px-4 py-12 text-center">
                  <div className="text-label-lg font-semibold text-ink">Mulai mengetik untuk mencari</div>
                  <div className="text-body-sm text-ink-3 mt-1">Nomor dokumen, nama produk, atau pelanggan</div>
                </div>
              )}

              {!loading && query && results.length === 0 && (
                <div className="px-4 py-12 text-center">
                  <div className="text-label-lg font-semibold text-ink">Tidak ada hasil untuk &quot;{query}&quot;</div>
                  <div className="text-body-sm text-ink-3 mt-1">Coba kata kunci lain atau periksa ejaan</div>
                </div>
              )}

              {results.map((r, i) => (
                <button
                  key={i}
                  onClick={() => handleSelect(r)}
                  className="w-full px-4 py-3 hover:bg-surface-2 text-left flex items-center gap-3 transition-colors group border-b border-line/60 last:border-0"
                >
                  <span className={`px-2.5 py-1 rounded-md text-label-sm font-semibold ${TYPE_TONE[r.type] || 'bg-surface-2 text-ink-2'}`}>
                    {r.type}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-label-lg font-bold text-ink truncate">{r.number}</span>
                    <span className="block text-body-sm text-ink-3 truncate font-normal">{r.name}</span>
                  </span>
                  {r.status && <span className="text-label-sm text-ink-3 font-medium">{r.status}</span>}
                  <ArrowRight size={16} className="text-line-strong group-hover:text-brand group-hover:translate-x-0.5 transition-all"/>
                </button>
              ))}
            </div>

            <div className="px-4 py-2.5 bg-surface-2 border-t border-line flex items-center justify-between">
              <span className="text-label-sm text-ink-3 font-normal">
                <kbd className="px-1.5 py-0.5 bg-surface border border-line rounded text-[11px] mono shadow-sm">ESC</kbd> tutup · <kbd className="px-1.5 py-0.5 bg-surface border border-line rounded text-[11px] mono shadow-sm">Ctrl K</kbd> buka
              </span>
              <span className="text-label-sm text-ink-3 font-medium">Enterprise Search</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
