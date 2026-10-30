import { useCallback, useEffect, useRef, useState } from 'react';
import { Printer } from 'lucide-react';

/**
 * Tombol cetak struk thermal 80 mm.
 *
 * Mode (disimpan di localStorage `pos.printMode`):
 *  - 'browser' : dialog cetak bawaan + CSS @page 80mm (default, selalu tersedia)
 *  - 'rawbt'   : skema rawbt:… untuk tablet Android dengan aplikasi RawBT
 *  - 'usb'     : ESC/POS langsung lewat WebUSB (printer thermal USB, tanpa dialog)
 *
 * Props:
 *  - text: string  isi struk (plain text, satu baris per \n)
 *  - label, className, disabled
 */
const MODE_KEY = 'pos.printMode';
const MODES = [
  { key: 'browser', label: 'Dialog browser' },
  { key: 'rawbt', label: 'RawBT (Android)' },
  { key: 'usb', label: 'WebUSB (ESC/POS)' },
];

function escposBytes(text) {
  const enc = new TextEncoder();
  const init = new Uint8Array([0x1b, 0x40]);                 // ESC @ (reset)
  const body = enc.encode(String(text || '').replace(/\r/g, ''));
  const feed = new Uint8Array([0x0a, 0x0a, 0x0a]);           // 3 baris kosong
  const cut = new Uint8Array([0x1d, 0x56, 0x00]);            // GS V 0 (potong)
  const out = new Uint8Array(init.length + body.length + feed.length + cut.length);
  out.set(init, 0);
  out.set(body, init.length);
  out.set(feed, init.length + body.length);
  out.set(cut, init.length + body.length + feed.length);
  return out;
}

export default function ThermalPrintButton({ text = '', label = 'Cetak Struk', className = '', disabled = false, onDone }) {
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem(MODE_KEY) || 'browser'; } catch { return 'browser'; }
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const deviceRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(MODE_KEY, mode); } catch { /* storage penuh / private mode */ }
  }, [mode]);

  // F9 = cetak cepat (sesuai spesifikasi UI)
  const doPrint = useCallback(async () => {
    if (disabled) return;
    setBusy(true); setMsg('');
    try {
      if (mode === 'rawbt') {
        const url = 'rawbt:' + encodeURIComponent(String(text || ''));
        window.location.href = url;
        setMsg('Dikirim ke RawBT');
      } else if (mode === 'usb') {
        if (!('usb' in navigator)) throw new Error('Browser tidak mendukung WebUSB — pakai dialog browser.');
        let device = deviceRef.current;
        if (!device) {
          device = await navigator.usb.requestDevice({ filters: [{ classCode: 7 }] });
          deviceRef.current = device;
        }
        if (!device.opened) await device.open();
        if (device.configuration === null) await device.selectConfiguration(1);
        const iface = device.configuration.interfaces.find((i) => i.alternate.endpoints.some((e) => e.direction === 'out'));
        if (!iface) throw new Error('Printer tidak punya endpoint output.');
        if (!iface.claimed) await device.claimInterface(iface.interfaceNumber);
        const ep = iface.alternate.endpoints.find((e) => e.direction === 'out');
        await device.transferOut(ep.endpointNumber, escposBytes(text));
        setMsg('Terkirim ke printer USB');
      } else {
        window.print();
      }
      onDone?.();
    } catch (e) {
      setMsg(e.message || 'Gagal mencetak');
    } finally { setBusy(false); }
  }, [disabled, mode, onDone, text]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F9') { e.preventDefault(); doPrint(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doPrint]);

  return (
    <span className="inline-flex items-center gap-1.5">
      <button type="button" onClick={doPrint} disabled={disabled || busy}
        className={className || 'h-9 px-3 rounded-xl bg-brand text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-60'}>
        <Printer size={13} /> {busy ? 'Mencetak…' : label}
      </button>
      <select value={mode} onChange={(e) => setMode(e.target.value)} title="Mode cetak thermal"
        className="h-9 px-2 rounded-xl border border-line bg-white text-[11px] font-semibold text-ink-2">
        {MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
      </select>
      {msg && <span className="text-[10px] text-ink-3 max-w-[160px] truncate" title={msg}>{msg}</span>}
    </span>
  );
}
