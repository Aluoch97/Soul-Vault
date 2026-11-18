// Automatic phone notifications (Nov 17, 2026, Nick: "I hate that it's manual"). Two switches in Settings > Notify fans:
//   New music  : a release goes LIVE (public: not hidden, not sealed, not marked Unreleased, and its release date has arrived).
//   New shows  : a new UPCOMING show appears in the Road to 100 sheet (Completed = FALSE) or on Bandsintown.
// There is no timer. Normal visits to the site run a quick check (at most every 10 minutes per data centre), so nothing costs anything while nobody visits,
// and the first fan of the day starts the day's check. It only sends between 9 AM and 9 PM Central, shares the 3-a-day limit with the manual sends (pushSend),
// and every item is "claimed" in the table `push_auto_seen` before it is sent, so two data centres can never announce the same thing twice.
// Turning a switch ON first records what already exists WITHOUT sending, so old releases and old shows are never announced.
import { pushSend, ensurePush } from './push.js';

const DDL = ['CREATE TABLE IF NOT EXISTS push_auto_seen (kind TEXT NOT NULL, key TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (kind, key))'];
const TZ = 'America/Chicago';
export const QUIET_START = 9, QUIET_END = 21;   // sends only from 9:00 up to (not including) 21:00 Central
const kvTable = db => db.prepare('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)').run();
export const ensureAuto = async db => { await ensurePush(db); await db.batch(DDL.map(s => db.prepare(s))); await kvTable(db); };

export const centralToday = now => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
export const centralHour = now => Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(now));
const prettyDate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[2] - 1] + ' ' + +m[3] : ''; };

export async function getAutoSettings(db) {
  await ensureAuto(db);
  const r = await db.prepare("SELECT v FROM kv WHERE k = 'push_auto'").first();
  let s = {}; try { s = (r && JSON.parse(r.v)) || {}; } catch (e) { s = {}; }
  return { releases: s.releases === true, shows: s.shows === true };
}
/** Items that exist right now, from the live data: releases = [{ key: release_id, title, slug }], shows = [{ key: 'YYYY-MM-DD', date, venue, city }]. */
const claim = async (db, kind, key, now) => Number(((await db.prepare('INSERT OR IGNORE INTO push_auto_seen (kind, key, at) VALUES (?,?,?)').bind(kind, key, now).run()).meta || {}).changes) || 0;
const unclaim = (db, kind, key) => db.prepare('DELETE FROM push_auto_seen WHERE kind = ? AND key = ?').bind(kind, key).run();

/** Owner flips the switches. A switch that goes from off to on first records everything that exists now (no notifications for old things). */
export async function setAutoSettings(db, want, data, now = Date.now()) {
  await ensureAuto(db); want = want || {};
  const cur = await getAutoSettings(db), next = { releases: want.releases === true, shows: want.shows === true };
  if (next.releases && !cur.releases) for (const r of data.releases) await claim(db, 'release', r.key, now);
  if (next.shows && !cur.shows) for (const s of data.shows) await claim(db, 'show', s.key, now);
  await db.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES ('push_auto', ?)").bind(JSON.stringify(next)).run();
  return next;
}

/** One check. `data` = { releases, shows } (see above). Returns what happened, for the tests and the logs. */
export async function runAuto(db, env, data, { now = Date.now(), fetchFn = fetch } = {}) {
  const set = await getAutoSettings(db), out = { sent: [], skipped: '' };
  if (!set.releases && !set.shows) { out.skipped = 'off'; return out; }
  const hour = centralHour(new Date(now)); if (hour < QUIET_START || hour >= QUIET_END) { out.skipped = 'quiet hours'; return out; }
  const batches = [];
  if (set.releases) {
    const fresh = []; for (const r of data.releases) if (await claim(db, 'release', r.key, now)) fresh.push(r);
    if (fresh.length) batches.push({ kind: 'release', items: fresh, msg: fresh.length === 1
      ? { title: 'New music from Nicólas Soul', body: fresh[0].title + ' is out now', url: '/vault/' + fresh[0].slug }
      : { title: 'New music from Nicólas Soul', body: fresh.length + ' new releases are out now', url: '/vault' } });
  }
  if (set.shows) {
    const fresh = []; for (const s of data.shows) if (await claim(db, 'show', s.key, now)) fresh.push(s);
    fresh.sort((a, b) => a.date.localeCompare(b.date));
    if (fresh.length) batches.push({ kind: 'show', items: fresh, msg: fresh.length === 1
      ? { title: 'New show announced', body: [prettyDate(fresh[0].date), fresh[0].venue, fresh[0].city].filter(Boolean).join(' · '), url: '/tour' }
      : { title: 'New shows announced', body: fresh.length + ' new shows, starting ' + prettyDate(fresh[0].date) + ' at ' + fresh[0].venue, url: '/tour' } });
  }
  for (const b of batches) {
    try {
      const r = await pushSend(db, env, b.msg, { fetchFn, now });
      out.sent.push({ kind: b.kind, count: b.items.length, phones: r.sent });
      if (r.sent === 0 && r.failed > 0) for (const i of b.items) await unclaim(db, b.kind, i.key);   // nothing reached a phone: try again next time
    } catch (e) {
      const m = String((e && e.message) || e);
      if (/Nobody has turned on/.test(m)) { out.sent.push({ kind: b.kind, count: b.items.length, phones: 0 }); continue; }   // nobody to tell: counted as seen
      for (const i of b.items) await unclaim(db, b.kind, i.key);   // the daily limit or a keys problem: keep them for the next check
      out.skipped = m.slice(0, 120);
    }
  }
  return out;
}
