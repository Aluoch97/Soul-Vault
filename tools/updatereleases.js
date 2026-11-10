// Refreshes releases.json (the list of public releases used for the sitemap and the crawler text). Run: node tools/updatereleases.js
// Reads the PUBLIC link only (site.config.json). Skips sealed releases and releases with nothing playable. Commit the result.
const fs = require('fs'), path = require('path');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'site.config.json'), 'utf8'));
const slug = id => String(id || '').replace(/^rel_/, '').replace(/_/g, '-');   // same rule as relSlug() in src/App.html
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
  fs.writeFileSync(path.join(__dirname, '..', 'releases.json'), '[\n' + list.map(x => ' ' + JSON.stringify(x)).join(',\n') + '\n]\n');
  console.log(list.length + ' releases written to releases.json (' + d.releases.filter(x => x.locked).length + ' sealed skipped)');
})().catch(e => { console.error(e.message); process.exit(1); });
