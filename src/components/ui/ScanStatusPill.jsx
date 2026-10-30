import { useEffect, useState } from 'react';

/** Pil status kecil di toolbar: menampilkan kode terakhir yang ter-scan, lalu memudar. */
export function ScanStatusPill({ code, className = '' }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!code) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 2500);
    return () => clearTimeout(t);
  }, [code]);
  if (!code || !show) return null;
  return (
    <span className={'inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-800 ' + className}>
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
      Scan: {code}
    </span>
  );
}

export default ScanStatusPill;
