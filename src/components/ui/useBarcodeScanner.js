import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Pendengar barcode/QR scanner HID (USB/Bluetooth) tanpa dependency.
 *
 * Scanner HID mengetik sangat cepat (interval antar karakter < 35 ms) lalu menekan Enter.
 * Hook ini mendeteksi ledakan ketikan itu di mana pun di halaman, tanpa perlu fokus ke
 * sebuah input, dan mengabaikan ketikan manusia di dalam <input>/<textarea>/[contenteditable].
 *
 * @param {object} p
 * @param {(code:string)=>void} p.onScan  dipanggil dengan kode hasil scan
 * @param {number} [p.minLength=4]        panjang minimum kode
 * @param {number} [p.maxInterKeyMs=35]   jeda maksimum antar karakter agar dianggap scanner
 * @param {boolean} [p.enabled=true]
 * @returns {{lastScan:string|null, scanCount:number, simulate:(code:string)=>void}}
 */
export function useBarcodeScanner({ onScan, minLength = 4, maxInterKeyMs = 35, enabled = true } = {}) {
  const buf = useRef('');
  const last = useRef(0);
  const cb = useRef(onScan);
  const [lastScan, setLastScan] = useState(null);
  const [scanCount, setScanCount] = useState(0);

  useEffect(() => { cb.current = onScan; }, [onScan]);

  const emit = useCallback((code) => {
    const clean = String(code || '').trim();
    if (clean.length < minLength) return;
    setLastScan(clean);
    setScanCount((n) => n + 1);
    try { cb.current?.(clean); } catch (e) { console.error('[barcode]', e); }
  }, [minLength]);

  useEffect(() => {
    if (!enabled) return;
    const isTypingTarget = (el) => {
      if (!el) return false;
      const tag = (el.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      return el.isContentEditable === true;
    };

    const onKeyDown = (e) => {
      // Jangan ganggu shortcut browser/OS
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const now = Date.now();
      const gap = now - last.current;
      last.current = now;

      if (e.key === 'Enter') {
        const code = buf.current;
        buf.current = '';
        // Scanner selalu menutup dengan Enter; panjang minimum mencegah Enter biasa ikut terpicu.
        if (code.length >= minLength && gap <= maxInterKeyMs * 4) {
          e.preventDefault();
          emit(code);
        }
        return;
      }
      if (e.key === 'Escape') { buf.current = ''; return; }
      if (e.key.length !== 1) return;

      if (gap > maxInterKeyMs) buf.current = '';
      // Ketikan manusia yang lambat tidak akan pernah menumpuk jadi kode utuh.
      if (isTypingTarget(document.activeElement) && gap > maxInterKeyMs) return;
      buf.current += e.key;
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled, emit, maxInterKeyMs, minLength]);

  return { lastScan, scanCount, simulate: emit };
}

export default useBarcodeScanner;
