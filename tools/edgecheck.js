// node tools/edgecheck.js [baseUrl] [ownerKey]
// Asks the new /api and the real Apps Script the same question (the public link) and says whether the answers are the same.
// With an owner key it also asks the edge to refresh its copy first.
const cfg = require('../site.config.json');
const base = (process.argv[2] || 'http://localhost:8788').replace(/\/$/, ''), key = process.argv[3] || '';
const post = (url, fn, args) => fetch(url, { method: 'POST', body: JSON.stringify({ fn, args }), redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (edgecheck)' } }).then(r => r.json());
const same = (a, b, path, out) => {
  if (a === b) return;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') { out.push(path + ': ' + String(JSON.stringify(a)).slice(0, 80) + ' vs ' + String(JSON.stringify(b)).slice(0, 80)); return; }
  if (Array.isArray(a) !== Array.isArray(b)) { out.push(path + ': array vs object'); return; }
  if (Array.isArray(a) && a.length !== b.length) out.push(path + ': length ' + a.length + ' vs ' + b.length);
  new Set(Object.keys(a).concat(Object.keys(b))).forEach(k => same(a[k], b[k], path + '.' + k, out));
};
(async () => {
  console.log('status:', JSON.stringify((await post(base + '/api', 'edgeStatus', [])).result));
  if (key) console.log('sync:', JSON.stringify(await post(base + '/api', 'edgeSync', [key])));
  const t0 = Date.now(), e = await post(base + '/api', 'getShare', [cfg.publicToken]), t1 = Date.now();
  const e2 = await post(base + '/api', 'getShare', [cfg.publicToken]), t2 = Date.now();
  const g = await post(cfg.api, 'getShare', [cfg.publicToken]), t3 = Date.now();
  console.log(`edge: ${t1 - t0} ms first, ${t2 - t1} ms again | Apps Script: ${t3 - t2} ms`);
  const diffs = []; same(e.result, g.result, 'result', diffs);
  console.log(diffs.length ? 'DIFFERENT (' + diffs.length + '):\n  ' + diffs.slice(0, 25).join('\n  ') : 'SAME: the edge answer matches Apps Script exactly');
  const bad = await post(base + '/api', 'getShare', ['nope']);
  console.log('wrong link:', JSON.stringify(bad).slice(0, 120));
})().catch(e => { console.error('failed:', e.message); process.exit(1); });
