import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, PenLine, CheckCircle2 } from 'lucide-react';

/**
 * Kanvas tanda tangan penerima (mouse + sentuhan).
 * onChange menerima dataURL PNG saat ada goresan, dan null setelah dihapus.
 */
export default function SignaturePad({ onChange, height=170, label='Tanda tangan penerima', hint='Minta penerima menandatangan di area ini' }){
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  const paintBase = useCallback(()=>{
    const c = canvasRef.current; if(!c) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0,0,c.width,c.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0,0,c.width,c.height);
    // garis dasar tipis supaya jelas area tanda tangan
    ctx.strokeStyle = '#e7ecf7';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(24, c.height-28); ctx.lineTo(c.width-24, c.height-28); ctx.stroke();
  },[]);

  useEffect(()=>{ paintBase(); },[paintBase]);

  const pos = (e)=>{
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    return { x:(e.clientX-r.left)*(c.width/r.width), y:(e.clientY-r.top)*(c.height/r.height) };
  };
  const start = (e)=>{
    e.preventDefault();
    const c = canvasRef.current; if(!c) return;
    drawing.current = true;
    const p = pos(e);
    const ctx = c.getContext('2d');
    ctx.beginPath(); ctx.moveTo(p.x,p.y);
    try{ c.setPointerCapture?.(e.pointerId); }catch{}
  };
  const move = (e)=>{
    if(!drawing.current) return;
    e.preventDefault();
    const c = canvasRef.current;
    const p = pos(e);
    const ctx = c.getContext('2d');
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0b1c30';
    ctx.lineTo(p.x,p.y); ctx.stroke();
    if(!hasInk){ setHasInk(true); }
  };
  const end = (e)=>{
    if(!drawing.current) return;
    drawing.current = false;
    try{ canvasRef.current?.releasePointerCapture?.(e.pointerId); }catch{}
    const c = canvasRef.current; if(!c) return;
    onChange?.(c.toDataURL('image/png'));
  };
  const clear = ()=>{
    paintBase();
    setHasInk(false);
    onChange?.(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-ink-2 uppercase">
          {hasInk ? <CheckCircle2 size={13} className="text-emerald-600"/> : <PenLine size={13}/>} {label}
        </div>
        <button type="button" onClick={clear} className="h-7 px-2.5 rounded-lg bg-white border border-line text-[11px] font-semibold text-ink-2 hover:bg-surface-2 inline-flex items-center gap-1">
          <Eraser size={12}/> Hapus
        </button>
      </div>
      <div className="rounded-xl border border-line bg-white overflow-hidden">
        <canvas
          ref={canvasRef} width={640} height={Math.round(height*640/560)}
          onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} onPointerCancel={end}
          className="w-full block touch-none cursor-crosshair"
          style={{height}}
          aria-label="Area tanda tangan penerima"
        />
      </div>
      <div className="text-[11px] text-ink-3">{hasInk ? 'Tanda tangan tersimpan di bukti terima.' : hint}</div>
    </div>
  );
}
