// A copy of the Apps Script library, kept in the D1 table `kv` as chunks of JSON (each chunk well under D1's row limit).
// Stage 1 of the move off Apps Script: reads come from this copy; Apps Script stays the place where things are edited, and the copy is refreshed from it.

const CHUNK = 200000;   // characters per row
const ARRAYS = ['releases', 'tracks', 'versions', 'shares', 'extras', 'playlists'];
const OBJECTS = ['letter', 'newsletter', 'artist_links', 'artist_bio', 'stream_key', 'birth_date'];   // birth_date is used only to work out ages; shareBody never sends it
export const DDL = 'CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)';

export async function readMeta(db) {
  try { const r = await db.prepare("SELECT v FROM kv WHERE k = 'meta'").first(); return r ? JSON.parse(r.v) : null; } catch (e) { return null; }
}

export async function loadLib(db) {
  let rows;
  try { rows = (await db.prepare("SELECT k, v FROM kv WHERE k LIKE 'p:%'").all()).results; } catch (e) { return null; }
  if (!rows || !rows.length) return null;
  const parts = {};
  rows.forEach(r => { const m = /^p:([a-z_]+):(\d+)$/.exec(r.k); if (m) (parts[m[1]] = parts[m[1]] || [])[+m[2]] = r.v; });
  const lib = {};
  ARRAYS.forEach(n => { lib[n] = JSON.parse((parts[n] || []).join('') || '[]'); });
  OBJECTS.forEach(n => { const t = (parts[n] || []).join(''); lib[n] = t ? JSON.parse(t) : null; });
  return lib;
}

export async function saveLib(db, lib, extraMeta) {
  const stmts = [db.prepare(DDL), db.prepare("DELETE FROM kv WHERE k LIKE 'p:%'")];
  const put = (name, json) => {
    for (let i = 0, n = 0; i < json.length || n === 0; i += CHUNK, n++) stmts.push(db.prepare('INSERT INTO kv (k, v) VALUES (?, ?)').bind('p:' + name + ':' + n, json.slice(i, i + CHUNK)));
  };
  const counts = {};
  ARRAYS.forEach(n => { const a = lib[n] || []; counts[n] = a.length; put(n, JSON.stringify(a)); });
  OBJECTS.forEach(n => put(n, JSON.stringify(lib[n] === undefined ? null : lib[n])));
  const meta = Object.assign({ synced_at: Date.now(), counts }, extraMeta || {});
  stmts.push(db.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES ('meta', ?)").bind(JSON.stringify(meta)));
  await db.batch(stmts);
  return meta;
}

export async function loadOverlay(db) {
  try { const r = await db.prepare("SELECT v FROM kv WHERE k = 'overlay'").first(); return r ? JSON.parse(r.v) : null; } catch (e) { return null; }
}
export async function saveOverlay(db, ov) {
  await db.prepare(DDL).run();
  await db.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES ('overlay', ?)").bind(JSON.stringify(ov)).run();
}
