import express from 'express';
import { listErrors, resolveError, errorSummary, recentErrors, errorStats } from '../../lib/error-log.js';

const router = express.Router();

// GET /errors?status=open|resolved&search=&limit=
router.get('/', async (req,res)=>{
  try{
    const resolved = String(req.query.status||'open').toLowerCase() === 'resolved';
    const [summary, items] = await Promise.all([
      errorSummary(),
      listErrors({ resolved, limit: req.query.limit, search: req.query.search||'' }),
    ]);
    res.json({ summary, status: resolved? 'resolved':'open', items, in_memory: recentErrors(20), stats: errorStats() });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// POST /errors/:id/resolve
router.post('/:id/resolve', async (req,res)=>{
  try{
    const row = await resolveError(req.params.id, req.user.id);
    if(!row) return res.status(404).json({error:'Error tidak ditemukan'});
    res.json({ ok:true, ...row });
  }catch(e){ res.status(500).json({error:e.message}); }
});

// POST /errors/resolve-all  { search? }
router.post('/resolve-all', async (req,res)=>{
  try{
    const open = await listErrors({ resolved:false, limit:500, search:req.body?.search||'' });
    let n = 0;
    for(const row of open){ await resolveError(row.id, req.user.id); n++; }
    res.json({ ok:true, resolved:n });
  }catch(e){ res.status(500).json({error:e.message}); }
});

export default router;
