import http from 'node:http';
function req(path, method='GET', body=null, headers={}){
  return new Promise((resolve,reject)=>{
    const data = body ? JSON.stringify(body) : null;
    const opts = {host:'localhost',port:4000,path,method, headers:{'Content-Type':'application/json', ...headers}};
    if(data) opts.headers['Content-Length']=Buffer.byteLength(data);
    const r = http.request(opts, resp=>{
      let d=''; resp.on('data',c=>d+=c); resp.on('end',()=>resolve({status:resp.statusCode, body:d}));
    });
    r.on('error',reject);
    if(data) r.write(data);
    r.end();
  });
}
const login = await req('/api/auth/login','POST',{username:'admin',password:'admin123'});
console.log('login', login.status, login.body.slice(0,600));
let token='';
try{ token=JSON.parse(login.body).token; }catch(e){ console.log('parse fail',e.message); }
if(token){
  const leads = await req('/api/crm/leads','GET',null,{Authorization:'Bearer '+token});
  console.log('leads', leads.status);
  console.log(leads.body.slice(0,6000));
  const pipeline = await req('/api/crm/pipeline','GET',null,{Authorization:'Bearer '+token});
  console.log('pipeline', pipeline.status, pipeline.body.slice(0,2000));
}
