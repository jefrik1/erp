import { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';

const Ctx = createContext(null);
export function useDialog(){
  const v = useContext(Ctx);
  if(!v) throw new Error('DialogProvider belum dipasang');
  return v;
}

// Tema notifikasi mengikuti Stitch "Sistem Notifikasi": ikon semantik + warna
// bernyawa + pill status + CTA spesifik.
const TONE = {
  success: { icon: CheckCircle2, ring:'from-emerald-500 to-teal-400', soft:'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600', pill:'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300', dot:'bg-emerald-500', label:'Berhasil', btn:'bg-emerald-600 hover:bg-emerald-700' },
  warning: { icon: AlertTriangle, ring:'from-amber-500 to-orange-400', soft:'bg-amber-50 dark:bg-amber-950/40 text-amber-600', pill:'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300', dot:'bg-amber-500', label:'Perhatian', btn:'bg-amber-600 hover:bg-amber-700' },
  danger:  { icon: XCircle, ring:'from-rose-500 to-red-400', soft:'bg-rose-50 dark:bg-rose-950/40 text-rose-600', pill:'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300', dot:'bg-rose-500', label:'Gagal', btn:'bg-rose-600 hover:bg-rose-700' },
  info:    { icon: Info, ring:'from-[#316bf3] to-sky-400', soft:'bg-info-soft text-brand', pill:'bg-info-soft text-brand', dot:'bg-brand', label:'Informasi', btn:'bg-brand hover:bg-brand-strong' },
  confirm: { icon: Info, ring:'from-[#316bf3] to-sky-400', soft:'bg-info-soft text-brand', pill:'bg-info-soft text-brand', dot:'bg-brand', label:'Konfirmasi', btn:'bg-brand hover:bg-brand-strong' },
};

export function DialogProvider({ children }){
  const [dlg, setDlg] = useState(null);
  const [val, setVal] = useState('');

  const alert = useCallback((message, opts={})=>{
    return new Promise(res=>{
      setDlg({ type:'alert', title: opts.title || 'Info', tone: opts.tone || 'info', message: String(message), resolve: v=>{ setDlg(null); res(v); } });
    });
  },[]);

  const confirm = useCallback((message, opts={})=>{
    let msg = message, title = opts.title;
    if(typeof message === 'object' && message!==null && message.message){
      msg = message.message; title = message.title || title;
    }
    return new Promise(res=>{
      setDlg({ type:'confirm', title: title || 'Konfirmasi', tone: opts.tone || 'confirm', message: String(msg||''), resolve: v=>{ setDlg(null); res(!!v); }, confirmText: opts.confirmText, cancelText: opts.cancelText });
    });
  },[]);

  const prompt = useCallback((message, opts={})=>{
    return new Promise(res=>{
      setVal(opts.defaultValue || '');
      setDlg({
        type:'prompt', title: opts.title || 'Masukkan keterangan', tone: opts.tone || 'info', message: String(message||''),
        placeholder: opts.placeholder || '', required: opts.required !== false,
        confirmText: opts.confirmText, cancelText: opts.cancelText,
        resolve: v=>{ setDlg(null); res(v); }
      });
    });
  },[]);

  const close = useCallback(()=> setDlg(null),[]);
  const okPrompt = ()=>{ if(dlg?.required && !val.trim()) return; dlg?.resolve(val.trim()); };

  const t = TONE[dlg?.tone] || TONE.info;
  const Icon = t.icon;

  return (
    <Ctx.Provider value={{ alert, confirm, prompt, close }}>
      {children}
      <AnimatePresence>
        {dlg && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="absolute inset-0 bg-navy/60 backdrop-blur-sm"
              onClick={()=> dlg.type==='alert' ? dlg.resolve(true) : dlg.resolve(dlg.type==='prompt'? null : false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ type: 'spring', stiffness: 360, damping: 28 }}
              className="relative bg-surface rounded-2xl shadow-modal w-full max-w-[440px] max-h-[90vh] flex flex-col overflow-hidden border border-line"
              role="dialog" aria-modal="true" aria-labelledby="dlg-title"
            >
              <div className="relative px-6 pt-6 pb-4 overflow-y-auto overflow-x-hidden">
                <div className="pointer-events-none absolute -top-14 -right-14 w-36 h-36 rounded-full bg-surface-3 blur-2xl opacity-70"/>
                <div className="pointer-events-none absolute -bottom-16 -left-16 w-40 h-40 rounded-full bg-brand-soft blur-2xl opacity-60"/>

                <div className="relative mx-auto mb-3 w-14 h-14 grid place-items-center">
                  <div className={"absolute inset-0 rounded-2xl "+t.soft.split(' ')[0]+" opacity-40 animate-ping"}/>
                  <div className={"relative w-14 h-14 rounded-2xl bg-gradient-to-tr "+t.ring+" p-[1.5px] shadow-lg"}>
                    <div className={"w-full h-full rounded-[13px] flex items-center justify-center "+t.soft}>
                      <Icon size={24}/>
                    </div>
                  </div>
                </div>

                <div className="relative text-center">
                  <span className={"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold "+t.pill}>
                    <span className={"w-1.5 h-1.5 rounded-full "+t.dot}/>{t.label}
                  </span>
                  <h3 id="dlg-title" className="font-display text-headline-sm font-bold text-ink leading-tight break-words mt-1.5">{dlg.title}</h3>
                  {dlg.message && <p className="text-body-md text-ink-2 mt-2 leading-relaxed whitespace-pre-wrap break-words text-left">{dlg.message}</p>}
                </div>

                {dlg.type==='prompt' && (
                  <input autoFocus value={val} onChange={e=>setVal(e.target.value)} placeholder={dlg.placeholder}
                    onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); okPrompt(); } }}
                    className="mt-3 w-full h-10 px-3 bg-surface-2 border border-line rounded-xl text-body-md text-ink outline-none focus:bg-surface focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"/>
                )}
              </div>

              <div className="px-4 py-3 bg-surface-2 border-t border-line flex justify-end gap-2 shrink-0">
                {dlg.type==='alert' ? (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    autoFocus onClick={()=>dlg.resolve(true)}
                    className={"h-10 px-5 rounded-xl text-white text-label-md font-semibold shadow-sm transition-colors "+t.btn}
                  >
                    Mengerti
                  </motion.button>
                ) : (
                  <>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      type="button" onClick={()=> dlg.resolve(dlg.type==='prompt'? null : false)}
                      className="h-10 px-4 rounded-xl text-label-md font-semibold text-ink-2 hover:bg-surface-3 transition-colors"
                    >
                      {dlg.cancelText || 'Batal'}
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      autoFocus onClick={()=> dlg.type==='prompt'? okPrompt() : dlg.resolve(true)}
                      className={"h-10 px-5 rounded-xl text-white text-label-md font-semibold shadow-sm transition-colors "+t.btn}
                    >
                      {dlg.confirmText || 'Lanjutkan'}
                    </motion.button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}
