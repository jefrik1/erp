const base4000='http://localhost:4000';
async function r(path,method='GET',body=null,headers={}){
  const url=base4000+path;
  const opts={method, headers:{'Content-Type':'application/json',...headers}};
  if(body) opts.body=JSON.stringify(body);
  const res=await fetch(url, opts);
  const txt=await res.text();
  return {status:res.status, body:txt.slice(0,6000), headers:Object.fromEntries(res.headers.entries())};
}
console.log('host health 4000');
let h=await r('/api/health');
console.log(h.status, h.body.slice(0,400));
let login=await r('/api/auth/login','POST',{username:'admin',password:'admin123'});
console.log('login host 4000', login.status, login.body.slice(0,800));
let t='';
try{ t=JSON.parse(login.body).token }catch{}
if(t){
  console.log('token ok', t.slice(0,20)+'...');
  let leads=await r('/api/crm/leads','GET',null,{Authorization:'Bearer '+t});
  console.log('leads host 4000', leads.status);
  console.log(leads.body.slice(0,3000));
  console.log('lead 500?', leads.status===500 ? leads.body : 'not 500');
  let pipe=await r('/api/crm/pipeline','GET',null,{Authorization:'Bearer '+t});
  console.log('pipeline host 4000', pipe.status, pipe.body.slice(0,2000));
} else console.log('no token');
