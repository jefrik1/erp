import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Search, X } from 'lucide-react';

const TYPE_TONE = {
  SO: 'bg-sky-50 text-sky-700 border-sky-200',
  PO: 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]',
  PROJECT: 'bg-amber-50 text-amber-700 border-amber-200',
  CONSIGNMENT: 'bg-teal-50 text-teal-700 border-teal-200',
  PRODUCT: 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]',
  CUSTOMER: 'bg-emerald-50 text-emerald-700 border-emerald-200',
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
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-start justify-center pt-20 px-4" onClick={onClose}>
      <div className="bg-white rounded-[20px] shadow-2xl w-full max-w-[600px] max-h-[500px] flex flex-col animate-pop overflow-hidden" onClick={e=>e.stopPropagation()}>
        <div className="p-4 border-b flex items-center gap-2">
          <Search size={20} className="text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari Sales Order, PO, Project, Konsinyasi, Produk..."
            className="flex-1 outline-none text-sm"
          />
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y">
          {loading && (
            <div className="p-8 text-center text-gray-400 text-sm">Mencari...</div>
          )}

          {!loading && !query && (
            <div className="p-8 text-center text-gray-400 text-sm">Ketik untuk mencari</div>
          )}

          {!loading && query && results.length === 0 && (
            <div className="p-8 text-center text-gray-400 text-sm">Tidak ada hasil</div>
          )}

          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => handleSelect(r)}
              className="w-full px-4 py-3 hover:bg-gray-50 text-left flex items-center gap-3 transition"
            >
              <div className={`px-2 py-1 rounded-full border text-xs font-bold ${TYPE_TONE[r.type] || 'bg-gray-100 border-gray-200'}`}>
                {r.type}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{r.number}</div>
                <div className="text-xs text-gray-500 truncate">{r.name}</div>
              </div>
              {r.status && <div className="text-xs text-gray-400">{r.status}</div>}
            </button>
          ))}
        </div>

        <div className="p-3 border-t bg-gray-50 text-xs text-gray-500">
          Tekan <kbd className="px-2 py-1 bg-white border rounded">ESC</kbd> untuk tutup
        </div>
      </div>
    </div>
  );
}
