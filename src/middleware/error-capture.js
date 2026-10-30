import { logError } from '../lib/error-log.js';

/**
 * Menangkap respons 5xx yang dibuat langsung oleh route (res.status(500).json({error}))
 * — bukan hanya error yang dilempar ke error handler Express.
 * Tanpa ini, banyak kegagalan query DB tidak pernah tercatat.
 */
export function errorCapture(req, res, next){
  const origJson = res.json.bind(res);
  res.json = (body)=>{
    try{
      if(res.statusCode >= 500 && !req._errorLogged){
        req._errorLogged = true;
        const msg = (body && (body.error || body.message)) || `HTTP ${res.statusCode}`;
        logError(new Error(String(msg).slice(0, 800)), {
          req,
          status: res.statusCode,
          source: 'http',
          extra: { route: req.baseUrl ? req.baseUrl + req.path : req.path },
        });
      }
    }catch{}
    return origJson(body);
  };
  next();
}

export default errorCapture;
