// Backups of everything the site keeps in its Cloudflare database (D1), written as a gzip JSON file into a PRIVATE R2 bucket (binding BACKUPS = soulvault-backups).
// The derived copy of the Sheet ("p:*" chunks and "meta") is left out; it can be rebuilt. Everything else is included: owned catalog, native rows, overlay, share links,
// plays, comments, error log, fan list, the missing-files list and the owner password hash. So the bucket must stay private (it has no public address).
const SKIP = k => /^p:/.test(String(k)) || k === 'meta';
const KEEP = 30;                 // newest backups kept
const EVERY_MS = 23 * 3600e3;    // the site backs itself up when the newest one is older than this and someone visits
let checkedAt = 0;

export async function dumpAll(db) {
  const names = (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all()).results.map(r => r.name).filter(n => /^[a-z_]+$/.test(n));
  const tables = {};
  for (const n of names) {
    const rows = []; let last = 0;
    for (;;) {
      const page = (await db.prepare('SELECT rowid AS _rid, * FROM ' + n + ' WHERE rowid > ? ORDER BY rowid LIMIT 2000').bind(last).all()).results;
      if (!page.length) break;
      page.forEach(r => { const o = Object.assign({}, r); delete o._rid; rows.push(o); });
      last = page[page.length - 1]._rid; if (page.length < 2000) break;
    }
    tables[n] = n === 'kv' ? rows.filter(r => !SKIP(r.k)) : rows;
  }
  return { format: 1, at: Date.now(), tables };
}
const gzip = async text => new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());

export async function lastBackup(db) {
  try { const r = await db.prepare("SELECT v FROM kv WHERE k = 'last_backup'").first(); return r ? JSON.parse(r.v) : null; } catch (e) { return null; }
}
export async function runBackup(env) {
  const dump = await dumpAll(env.DB), body = await gzip(JSON.stringify(dump));
  const d = new Date(dump.at), p = n => String(n).padStart(2, '0');
  const key = 'db/soul-vault-' + d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + 'T' + p(d.getUTCHours()) + '-' + p(d.getUTCMinutes()) + '.json.gz';
  await env.BACKUPS.put(key, body, { httpMetadata: { contentType: 'application/gzip' } });
  const info = { at: dump.at, key, size: body.length, rows: Object.fromEntries(Object.entries(dump.tables).map(([k, v]) => [k, v.length])) };
  await env.DB.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES ('last_backup', ?)").bind(JSON.stringify(info)).run();
  const all = (await env.BACKUPS.list({ prefix: 'db/' })).objects.map(o => o.key).sort();   // names sort by date
  const old = all.slice(0, Math.max(0, all.length - KEEP)); for (const k of old) await env.BACKUPS.delete(k);
  return info;
}
export async function listBackups(env) { return (await env.BACKUPS.list({ prefix: 'db/' })).objects.map(o => ({ key: o.key, size: o.size, at: o.uploaded })).sort((a, b) => b.key.localeCompare(a.key)); }
// Called on normal visits: starts a backup in the background when the newest one is old. Checks at most every 10 minutes per server instance.
export async function maybeBackup(env) {
  if (!env.DB || !env.BACKUPS || Date.now() - checkedAt < 600e3) return; checkedAt = Date.now();
  try { const l = await lastBackup(env.DB); if (!l || Date.now() - l.at > EVERY_MS) await runBackup(env); }
  catch (e) { checkedAt = Date.now() - 540e3; }   // try again in about a minute
}
