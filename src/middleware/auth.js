import jwt from 'jsonwebtoken';
export function auth(req,res,next){
  const h = req.headers.authorization;
  if(!h) return res.status(401).json({error:'No token'});
  const token = h.replace('Bearer ','');
  try{
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'erp_jwt_super_secret_2024');
    req.user = payload;
    next();
  }catch(e){ return res.status(401).json({error:'Invalid token'}); }
}
export function rbac(...allowed){
  const allow = allowed.map(r=>String(r).toLowerCase());
  return (req,res,next)=>{
    const roles = (req.user.roles || []).map(r=>String(r).toLowerCase());
    if(roles.includes('direktur') || roles.includes('super_admin')) return next();
    const ok = roles.some(r=> allow.includes(r));
    if(!ok) return res.status(403).json({error:'Forbidden'});
    next();
  }
}
