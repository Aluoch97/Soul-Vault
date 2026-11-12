// Refreshes releases.json (the list of public releases used for the sitemap and the crawler text) and the baked Home covers (home.json + public/home-covers/). Run: node tools/updatereleases.js
// Reads the PUBLIC link only (site.config.json). Skips sealed releases and releases with nothing playable. Commit the result.
const fs = require('fs'), path = require('path');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'site.config.json'), 'utf8'));
const slug = id => String(id || '').replace(/^rel_/, '').replace(/_/g, '-');   // same rule as relSlug() in src/app/js/02-init-routing-chrome.js
// The two Home covers (newest single and project) are saved as files in public/home-covers/ and listed in home.json, so Home can draw them at once.
async function bakeHome() {
  const r = await fetch(cfg.api, { method: 'POST', body: JSON.stringify({ fn: 'getHome', args: [cfg.publicToken] }), redirect: 'follow' });
  const j = JSON.parse(await r.text());
  if (!j.ok || !j.result || !j.result.picks) { console.log('getHome not available (backend older than build 67?); home.json left as it is'); return; }
  const dir = path.join(__dirname, '..', 'public', 'home-covers'), out = {};
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  for (const slot of ['single', 'project']) {
    const p = j.result.picks[slot], m = p && /^data:image\/(jpeg|png);base64,(.+)$/.exec(p.img || '');
    if (!m) continue;
    const buf = Buffer.from(m[2], 'base64'), ext = m[1] === 'png' ? 'png' : 'jpg';
    const name = p.release_id.replace(/[^A-Za-z0-9_-]/g, '') + '-' + require('crypto').createHash('sha1').update(buf).digest('hex').slice(0, 8) + '.' + ext;
    fs.writeFileSync(path.join(dir, name), buf);
    out[slot] = { release_id: p.release_id, title: p.title, cover_file_id: p.cover_file_id, src: '/home-covers/' + name };
  }
  fs.writeFileSync(path.join(__dirname, '..', 'home.json'), JSON.stringify(out, null, 1) + '\n');
  console.log('home covers baked: ' + Object.keys(out).map(k => k + ' = ' + out[k].title).join(', '));
}
(async () => {
  const r = await fetch(cfg.api, { method: 'POST', body: JSON.stringify({ fn: 'getShare', args: [cfg.publicToken] }), redirect: 'follow' });
  const d = (JSON.parse(await r.text()).result) || {};
  if (!d.releases || !d.releases.length) throw new Error('No releases came back: ' + JSON.stringify(d).slice(0, 120));
  const playable = {}; (d.versions || []).forEach(v => { if (!v.hidden) playable[v.track_id] = true; });
  const withSongs = {}; (d.tracks || []).forEach(t => { if (playable[t.track_id]) withSongs[t.release_id] = true; });
  const key = x => (/^\d{4}-\d{2}-\d{2}/.test(String(x.release_date || '')) ? String(x.release_date).slice(0, 10) : String(x.year || 0) + '-00-00');
  const list = d.releases.filter(x => !x.locked && withSongs[x.release_id])
    .sort((a, b) => key(b).localeCompare(key(a)) || String(a.title).localeCompare(String(b.title)))
    .map(x => [String(x.title).trim(), slug(x.release_id)]);
  await bakeHome();
  fs.writeFileSync(path.join(__dirname, '..', 'releases.json'), '[\n' + list.map(x => ' ' + JSON.stringify(x)).join(',\n') + '\n]\n');
  console.log(list.length + ' releases written to releases.json (' + d.releases.filter(x => x.locked).length + ' sealed skipped)');
})().catch(e => { console.error(e.message); process.exit(1); });
