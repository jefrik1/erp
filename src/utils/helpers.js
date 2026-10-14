export function paginate(req){
  const page = Math.max(1, parseInt(req.query.page||'1'));
  const limit = Math.min(500, parseInt(req.query.limit||'10'));
  const offset = (page-1)*limit;
  return {page, limit, offset};
}
export function genNumber(prefix){
  const d=new Date();
  return prefix+'-'+d.getFullYear()+'-'+String(Math.floor(Math.random()*9000+1000));
}
export async function audit(pool, userId, action, entityType, entityId, oldVal, newVal, ip){
  try{
    await pool.query('INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, ip_address) VALUES ($1,$2,$3,$4,$5,$6,$7)',[userId, action, entityType, entityId, oldVal?JSON.stringify(oldVal):null, newVal?JSON.stringify(newVal):null, ip||'']);
  }catch(e){ console.error('audit fail',e.message); }
}
