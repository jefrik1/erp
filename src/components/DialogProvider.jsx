import { createContext, useContext, useState, useCallback } from 'react'

const Ctx = createContext(null)
export function useDialog(){
  const v = useContext(Ctx)
  if(!v) throw new Error('DialogProvider belum dipasang')
  return v
}

export function DialogProvider({ children }){
  const [dlg, setDlg] = useState(null) // {type,title,message,resolve}
  const alert = useCallback((message, opts={})=>{
    return new Promise(res=>{
      setDlg({ type:'alert', title: opts.title || 'Info', message: String(message), resolve: v=>{ setDlg(null); res(v) } })
    })
  },[])
  const confirm = useCallback((message, opts={})=>{
    // support confirm('text') or confirm({message, title})
    let msg = message, title = opts.title
    if(typeof message === 'object' && message!==null && message.message){
      msg = message.message; title = message.title || title
    }
    if(opts.confirmText) {} // ignore
    return new Promise(res=>{
      setDlg({ type:'confirm', title: title || 'Konfirmasi', message: String(msg||''), resolve: v=>{ setDlg(null); res(!!v) }, confirmText: opts.confirmText, cancelText: opts.cancelText })
    })
  },[])
  const close = useCallback(()=> setDlg(null),[])

  return (
    <Ctx.Provider value={{ alert, confirm, close }}>
      {children}
      {dlg && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={()=> dlg.type==='alert' ? dlg.resolve(true) : dlg.resolve(false)} />
          <div className="relative bg-white rounded-[20px] shadow-2xl w-full max-w-[440px] max-h-[90vh] flex flex-col border border-[#E2E8F0] animate-pop overflow-hidden">
            <div className="px-6 pt-5 pb-4 overflow-auto">
              <div className={"w-10 h-10 rounded-full grid place-items-center mb-3 "+(dlg.type==='confirm'?"bg-[#1E40AF]/10 text-[#1E40AF]":"bg-amber-100 text-amber-700")}>
                {dlg.type==='confirm' ? '?' : '!'}
              </div>
              <h3 className="text-[16px] font-black text-[#0F172A] leading-tight break-words">{dlg.title}</h3>
              <p className="text-[13px] text-[#475569] mt-2 leading-relaxed whitespace-pre-wrap break-words">{dlg.message}</p>
            </div>
            <div className="px-4 py-3 bg-[#F8FAFC] border-t border-[#E2E8F0] flex justify-end gap-2 shrink-0">
              {dlg.type==='confirm' ? (
                <>
                  <button onClick={()=>dlg.resolve(false)} className="h-10 px-5 rounded-xl border bg-white text-sm font-semibold text-[#334155] hover:bg-[#F1F5F9]">{dlg.cancelText||'Batal'}</button>
                  <button autoFocus onClick={()=>dlg.resolve(true)} className="h-10 px-6 rounded-xl bg-[#1E40AF] text-white text-sm font-bold hover:bg-[#1E3A8A] shadow">{dlg.confirmText||'Ya, Lanjutkan'}</button>
                </>
              ) : (
                <button autoFocus onClick={()=>dlg.resolve(true)} className="h-10 px-6 rounded-xl bg-[#1E40AF] text-white text-sm font-bold hover:bg-[#1E3A8A] shadow">OK</button>
              )}
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}
