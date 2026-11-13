// Soul Tribe fan list in D1 (replaces the Google "The Soul Tribe" sheet for sign-ups). Rules match the old form.
export const FAN_FNS = ['joinSubmit', 'getFans'];
const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const DDL = ['CREATE TABLE IF NOT EXISTS fans (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, first_name TEXT, last_name TEXT, email TEXT UNIQUE, consent INTEGER, city TEXT, birth_year TEXT, social TEXT, how_heard TEXT, favorite TEXT, source TEXT, ip_hash TEXT, news INTEGER DEFAULT 0)',
  'CREATE INDEX IF NOT EXISTS ix_fans_ip ON fans (ip_hash, at)'];
const checked = new WeakSet();
// `news` = gets the newsletter. It is its own column because the old Google list only e-mailed people who had ticked the box on the form
// (the 5 contacts imported by hand never got it), and unsubscribing must not erase what they agreed to. A table made before this column
// existed gets it once: everyone who signed up through the form (not the imported contacts) starts as subscribed, like the old list.
export async function ensureFans(db) {
  await db.batch(DDL.map(s => db.prepare(s)));
  if (checked.has(db)) return;
  const cols = (await db.prepare('PRAGMA table_info(fans)').all()).results.map(c => c.name);
  if (cols.indexOf('news') < 0) {
    await db.prepare('ALTER TABLE fans ADD COLUMN news INTEGER DEFAULT 0').run();
    await db.prepare("UPDATE fans SET news = 1 WHERE consent = 1 AND COALESCE(source, '') NOT LIKE 'Imported contact%'").run();
  }
  // Nick's decision (Nov 13, 2026): the contacts he imported by hand get the newsletter too. Done once, so a later unsubscribe sticks.
  await db.prepare('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)').run();
  if (!(await db.prepare("SELECT 1 AS x FROM kv WHERE k = 'news_imported_optin'").first())) {
    await db.prepare("UPDATE fans SET news = 1 WHERE consent = 1 AND COALESCE(source, '') LIKE 'Imported contact%'").run();
    await db.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES ('news_imported_optin', ?)").bind(JSON.stringify({ at: Date.now() })).run();
  }
  checked.add(db);
}
const sha = async s => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// returns { ok:true } | { duplicate:true } ; throws Error with a plain message for bad input
export async function joinSubmit(db, p, ip) {
  await ensureFans(db); p = p || {};
  if (cut(p.website, 200)) return { ok: true }; // hidden trap field: quietly pretend it worked
  const first = cut(p.firstName, 80), email = cut(p.email, 200).toLowerCase();
  if (!first) throw new Error('Need a first name to add you to the list.');
  if (!EMAIL.test(email)) throw new Error("That email doesn't look right.");
  if (p.emailConsent !== true) throw new Error('Check the box so I know it is okay to email you.');
  let by = cut(p.birthYear, 4); if (by && !(/^\d{4}$/.test(by) && +by >= 1900 && +by <= new Date().getUTCFullYear())) by = '';
  const h = await sha('fans|' + (ip || 'unknown')), now = Date.now();
  const recent = Number((await db.prepare('SELECT COUNT(*) AS n FROM fans WHERE ip_hash = ? AND at > ?').bind(h, now - 3600e3).first()).n) || 0;
  if (recent >= 10) throw new Error('Too many sign-ups from here. Try again later.');
  if (await db.prepare('SELECT 1 AS x FROM fans WHERE email = ?').bind(email).first()) return { duplicate: true };
  await db.prepare('INSERT INTO fans (at, first_name, last_name, email, consent, city, birth_year, social, how_heard, favorite, source, ip_hash, news) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)')
    .bind(now, first, cut(p.lastName, 80), email, 1, cut(p.city, 120), by, cut(p.social, 120), cut(p.howHeard, 80), cut(p.favoriteRelease, 120), cut(p.source, 200), h).run();
  return { ok: true, added: true };
}
export async function getFans(db) {
  await ensureFans(db);
  return (await db.prepare('SELECT at, first_name, last_name, email, consent, city, birth_year, social, how_heard, favorite, source FROM fans ORDER BY at DESC').all()).results;
}
export async function importFans(db, rows) { // rows: arrays [at, first, last, email, consent, city, birth, social, how, fav, source]
  await ensureFans(db); let n = 0;
  for (const r of rows) { const e = cut(r[3], 200).toLowerCase(); if (!EMAIL.test(e)) continue;
    const x = await db.prepare('INSERT OR IGNORE INTO fans (at, first_name, last_name, email, consent, city, birth_year, social, how_heard, favorite, source, ip_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(r[0], cut(r[1], 80), cut(r[2], 80), e, r[4] ? 1 : 0, cut(r[5], 120), cut(r[6], 4), cut(r[7], 120), cut(r[8], 80), cut(r[9], 120), cut(r[10], 200), '').run(); n += x.meta.changes || 0; }
  return n;
}
