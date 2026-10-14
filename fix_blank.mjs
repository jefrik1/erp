import fs from 'fs'
import path from 'path'
const dir='src/pages'
const fixes = {
  'InventoryTransfers.jsx': [
    [`api.get().then(r=>setWarehouses`, `api.get('/master/warehouses').then(r=>setWarehouses`],
  ],
  'Waste.jsx': [
    [`api.get().then(r=>setWarehouses`, `api.get('/master/warehouses').then(r=>setWarehouses`],
  ],
}
for(const [file, reps] of Object.entries(fixes)){
  const p=path.join(dir,file)
  if(!fs.existsSync(p)) continue
  let c=fs.readFileSync(p,'utf8')
  let orig=c
  for(const [a,b] of reps) c=c.split(a).join(b)
  if(c!==orig){ fs.writeFileSync(p,c); console.log('fixed',file)}
}
// juga general: ensure all r.data handling safe + map guard already done
// ensure FinanceJournals inner map uses i not idx mismatch - it's correct
// verify no leftover api.get() with empty url
for(const f of fs.readdirSync(dir).filter(x=>x.endsWith('.jsx'))){
  const c=fs.readFileSync(path.join(dir,f),'utf8')
  if(c.includes('api.get()') || c.includes("api.get('')") ){
    console.log('STILL BROKEN',f)
    console.log(c.match(/api\.get\([^)]*\)/g)?.join(' | '))
  }
}
console.log('scan done')
