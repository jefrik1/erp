const base = 'http://localhost:5174';
async function req(path, method='GET', body=null, headers={}){
  const url = base+path;
  const opts = { method, headers:{'Content-Type':'application/json', ...headers}};
  if(body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const txt = await r.text();
  return {status:r.status, body:txt};
}
console.log('health via nginx');
let r = await req('/api/health');
console.log(r.status, r.body.slice(0,400));
console.log('login via nginx');
let login = await req('/api/auth/login','POST',{username:'admin',password:'admin123'});
console.log(login.status, login.body.slice(0,800));
let t='';
try{ t=JSON.parse(login.body).token }catch(e){ console.log('no token parse',e.message)}
if(t){
  let leads = await req('/api/crm/leads','GET',null,{Authorization:'Bearer '+t});
  console.log('leads via nginx', leads.status);
  console.log(leads.body.slice(0,5000));
  let pipe = await req('/api/crm/pipeline','GET',null,{Authorization:'Bearer '+t});
  console.log('pipeline via nginx', pipe.status, pipe.body.slice(0,2000));
  let delivered = await req('/api/logistics/delivered-notes','GET',null,{Authorization:'Bearer '+t});
  console.log('delivered-notes via nginx', delivered.status, delivered.body.slice(0,2000));
  let deliveries = await req('/api/logistics/deliveries','GET',null,{Authorization:'Bearer '+t});
  console.log('deliveries via nginx', deliveries.status, delivered.body.slice(0,500));
}
