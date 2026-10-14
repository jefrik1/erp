import { useState, useEffect, useRef } from 'react';
import api from '../lib/api';
import { Search, X } from 'lucide-react';

export default function SearchModal({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        const resp = await api.get('/search', {
          params: { q: query },
        });
        setResults(resp.data);
      } catch (e) {
        console.error('Search error:', e.message);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (result) => {
    if (result.url) window.location.href = result.url;
    onClose();
  };

  const typeColor = {
    SO: 'bg-blue-50 text-blue-700',
    PO: 'bg-purple-50 text-purple-700',
    PROJECT: 'bg-amber-50 text-amber-700',
    CONSIGNMENT: 'bg-green-50 text-green-700',
    PRODUCT: 'bg-gray-50 text-gray-700',
    CUSTOMER: 'bg-pink-50 text-pink-700'
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-20">
      <div className="bg-white rounded-2xl shadow-2xl w-[600px] max-h-[500px] flex flex-col">
        <div className="p-4 border-b flex items-center gap-2">
          <Search size={20} className="text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari Sales Order, PO, Project, Konsinyasi, Produk..."
            className="flex-1 outline-none text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
            }}
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
              <div className={`px-2 py-1 rounded text-xs font-bold ${typeColor[r.type] || 'bg-gray-100'}`}>
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
