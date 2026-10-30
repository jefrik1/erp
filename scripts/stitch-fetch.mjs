#!/usr/bin/env node
/**
 * Alat bantu desain: ambil screen dari project Stitch memakai API key CADANGAN (STITCH_API_KEY_2).
 *   node scripts/stitch-fetch.mjs list
 *   node scripts/stitch-fetch.mjs get <screenId> <outputPath>
 * Project default: 13568048731228673785 ("Markdown UI Refinement").
 */
import fs from 'node:fs';
import path from 'node:path';

const KEY = process.env.STITCH_API_KEY_2 || process.env.STITCH_API_KEY;
const URL = 'https://stitch.googleapis.com/mcp';
const PROJECT = process.env.STITCH_PROJECT || '13568048731228673785';

async function call(name, args) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { 'X-Goog-Api-Key': KEY, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`${j.error.code}: ${j.error.message}`);
  const txt = j.result?.content?.[0]?.text;
  return txt ? JSON.parse(txt) : j.result;
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === 'list') {
    const d = await call('list_screens', { projectId: PROJECT });
    for (const s of d.screens || []) {
      const id = s.name.split('/').pop();
      console.log([id, s.deviceType || '-', `${s.width}x${s.height}`, s.htmlCode?.name ? 'HTML' : 'img ', s.title].join(' | '));
    }
  } else if (cmd === 'get') {
    const [id, out] = rest;
    if (!id || !out) throw new Error('usage: get <screenId> <outputPath>');
    const d = await call('get_screen', { name: `projects/${PROJECT}/screens/${id}` });
    const isHtml = !!d.htmlCode?.name;
    const file = d.htmlCode?.name || d.screenshot?.name;
    if (!file) throw new Error('screen tidak punya file html/screenshot');
    const r = await call('download_file', { name: file });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    if (isHtml) fs.writeFileSync(out, r.html || r.text || '', 'utf8');
    else fs.writeFileSync(out, Buffer.from(r.image || '', 'base64'));
    console.log(`saved ${out} (${isHtml ? 'html' : 'image'}, ${fs.statSync(out).size} bytes)`);
  } else {
    console.log('usage: node scripts/stitch-fetch.mjs list|get <id> <out>');
  }
} catch (e) {
  console.error('stitch:', e.message);
  process.exitCode = 1;
}
