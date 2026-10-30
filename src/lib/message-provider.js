/**
 * Provider pesan keluar (WhatsApp / Email / SMS).
 *
 * Mode:
 * - "http"    : WA_GATEWAY_URL diset → pesan benar-benar dikirim ke gateway
 *               (Fonnte/Wablas/WA Business API/custom). Body: { to, message, subject }.
 * - "console" : gateway belum dikonfigurasi → pesan TIDAK dikirim, hanya dicatat
 *               di outbox dengan catatan jujur "console mode". Tidak ada klaim palsu
 *               bahwa pesan terkirim.
 *
 * Untuk email: SMTP_URL (opsional) → kalau kosong, juga console mode.
 */
export function providerStatus(){
  return {
    wa: !!process.env.WA_GATEWAY_URL ? 'http' : 'console',
    email: !!process.env.SMTP_URL ? 'smtp' : 'console',
    sms: !!process.env.SMS_GATEWAY_URL ? 'http' : 'console',
  };
}

export async function sendOutbound({ channel, to, subject, body }){
  const ch = String(channel||'WA').toUpperCase();
  const status = providerStatus();
  if(!to) return { ok:false, provider:'none', error:'Nomor/alamat tujuan kosong' };

  if(ch==='WA' || ch==='SMS'){
    const url = ch==='WA' ? process.env.WA_GATEWAY_URL : process.env.SMS_GATEWAY_URL;
    const token = ch==='WA' ? process.env.WA_GATEWAY_TOKEN : process.env.SMS_GATEWAY_TOKEN;
    if(!url) return { ok:true, provider:'console', note:`Gateway ${ch} belum diset (${ch==='WA'?'WA_GATEWAY_URL':'SMS_GATEWAY_URL'}) — pesan hanya dicatat di outbox, TIDAK terkirim.` };
    try{
      const r = await fetch(url, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', ...(token? { Authorization:'Bearer '+token } : {}) },
        body: JSON.stringify({ to, message: body, subject }),
        signal: AbortSignal.timeout(15000),
      });
      const text = (await r.text()).slice(0,400);
      if(!r.ok) return { ok:false, provider:'http', error:`Gateway HTTP ${r.status}: ${text}` };
      return { ok:true, provider:'http', response:text };
    }catch(e){ return { ok:false, provider:'http', error:e.message }; }
  }

  if(ch==='EMAIL'){
    if(!process.env.SMTP_URL) return { ok:true, provider:'console', note:'SMTP_URL belum diset — email hanya dicatat di outbox, TIDAK terkirim.' };
    // Kirim lewat relay HTTP sederhana (mis. Mailgun/SES proxy) supaya tidak menambah dependency SMTP.
    try{
      const r = await fetch(process.env.SMTP_URL, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', ...(process.env.SMTP_TOKEN? { Authorization:'Bearer '+process.env.SMTP_TOKEN } : {}) },
        body: JSON.stringify({ to, subject, text: body }),
        signal: AbortSignal.timeout(15000),
      });
      const text = (await r.text()).slice(0,400);
      if(!r.ok) return { ok:false, provider:'http', error:`Email HTTP ${r.status}: ${text}` };
      return { ok:true, provider:'http', response:text };
    }catch(e){ return { ok:false, provider:'http', error:e.message }; }
  }

  return { ok:false, provider:'none', error:'Channel tidak dikenal: '+channel, status };
}

/** Render template: ganti {{nama}} dengan nilai dari vars. */
export function renderTemplate(text, vars){
  return String(text||'').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_,k)=> {
    const v = vars?.[k];
    return v==null ? '' : String(v);
  });
}
