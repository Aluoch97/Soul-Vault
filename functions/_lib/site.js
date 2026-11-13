// Website insights: who visits soulnicolas.com, which pages, for how long, on what device, from which city (a Wix-style breakdown).
// The app sends one small note per page view (a random id per browser, a random id per visit, the page, and the seconds spent on it, refreshed every
// ~15 s while the page is open). The city comes from Cloudflare's own request details; the IP address is never stored. Only the owner can read any of it.
import { findShare } from './share.js';

export const SITE_FNS = ['siteView', 'getSiteInsights', 'getSiteLive'];
const DDL = ['CREATE TABLE IF NOT EXISTS site_views (view_id TEXT PRIMARY KEY, at INTEGER, last INTEGER, visit_id TEXT, device_id TEXT, share_token TEXT, path TEXT, device TEXT, city TEXT, region TEXT, country TEXT, ref TEXT, seconds INTEGER)',
  'CREATE INDEX IF NOT EXISTS ix_site_at ON site_views (at)', 'CREATE INDEX IF NOT EXISTS ix_site_dev ON site_views (device_id, at)'];
const ready = new WeakSet();
export async function ensureSite(db) { if (ready.has(db)) return; await db.batch(DDL.map(s => db.prepare(s))); ready.add(db); }

const TZ = 'America/Chicago', LIVE_MS = 90000, MAX_ROWS = 600000, KEEP_MS = 400 * 864e5, MAX_VIEWS_HOUR = 300, MAX_SECONDS = 1800;
const dayKey = ms => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const id = v => String(v || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 40);
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|monitor|curl|wget|python-requests|facebookexternalhit|embedly/i;
const HOST = /^[a-z0-9]([a-z0-9.-]{0,58}[a-z0-9])?$/;

/** One page view (or the next "still here" note for the same view). Returns true even when it is deliberately ignored, so the page never retries. */
export async function recordView(db, lib, o) {
  await ensureSite(db);
  if (BOT.test(String(o.ua || ''))) return true;                                           // crawlers and headless browsers are not visitors
  const viewId = id(o.viewId), visitId = id(o.visitId), dev = id(o.deviceId), path = String(o.path || '').split(/[?#]/)[0].toLowerCase().slice(0, 120);
  if (!viewId || !visitId || !dev || !/^\/[a-z0-9\/_.-]*$/.test(path)) return false;
  let shareTok = 'public';
  if (o.owner) shareTok = 'owner';
  else if (o.token) { const s = findShare(lib, String(o.token), new Date()); if (s) shareTok = s.token; }
  const seconds = Math.min(MAX_SECONDS, Math.max(0, Math.round(Number(o.seconds) || 0))), now = Date.now();
  const cur = await db.prepare('SELECT seconds FROM site_views WHERE view_id = ?').bind(viewId).first();
  if (cur) { await db.prepare('UPDATE site_views SET last = ?, seconds = ? WHERE view_id = ?').bind(now, Math.max(Number(cur.seconds) || 0, seconds), viewId).run(); return true; }
  if (Number((await db.prepare('SELECT COUNT(*) AS n FROM site_views WHERE device_id = ? AND at > ?').bind(dev, now - 3600e3).first()).n) >= MAX_VIEWS_HOUR) return true;
  if (Number((await db.prepare('SELECT COUNT(*) AS n FROM site_views').first()).n) >= MAX_ROWS) return true;
  const cf = o.cf || {}, ref = String(o.ref || '').toLowerCase(), device = ['phone', 'tablet', 'desktop'].indexOf(o.device) > -1 ? o.device : 'desktop';
  await db.prepare('INSERT INTO site_views (view_id, at, last, visit_id, device_id, share_token, path, device, city, region, country, ref, seconds) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(viewId, now, now, visitId, dev, shareTok, path, device, cut(cf.city, 60), cut(cf.region, 60), /^[A-Za-z]{2}$/.test(cf.country || '') ? String(cf.country).toUpperCase() : '', HOST.test(ref) && ref.indexOf('soulnicolas.com') < 0 ? ref : '', seconds).run();
  if (Math.random() < 0.01) await db.prepare('DELETE FROM site_views WHERE at < ?').bind(now - KEEP_MS).run();   // forget visits after about 13 months
  return true;
}

/** A readable name for a page address. */
export function pageName(path, lib) {
  const p = String(path || '/').replace(/\/+$/, '') || '/', fixed = { '/': 'Home', '/vault': 'Music', '/tour': 'Tour', '/tour/road-to-100': 'Tour: Road to 100', '/press': 'Press', '/press/video': 'Press: Videos', '/lore': 'Lore', '/join': 'Join the Soul Tribe' };
  if (fixed[p]) return fixed[p];
  const m = /^\/vault\/(.+)$/.exec(p);
  if (m) { const r = (lib.releases || []).find(x => String(x.release_id).replace(/^rel_/, '').replace(/_/g, '-') === m[1]); return r ? r.title : 'Release: ' + m[1]; }
  return p;
}
export function sourceName(ref) {
  const r = String(ref || ''); if (!r) return 'Direct';
  if (/(^|\.)instagram\.com$/.test(r)) return 'Instagram'; if (/(^|\.)(google)\./.test(r)) return 'Google'; if (/(^|\.)(youtube\.com|youtu\.be)$/.test(r)) return 'YouTube';
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(r)) return 'Facebook'; if (/(^|\.)(t\.co|twitter\.com|x\.com)$/.test(r)) return 'X'; if (/(^|\.)tiktok\.com$/.test(r)) return 'TikTok';
  if (/(^|\.)(bing\.com|duckduckgo\.com)$/.test(r)) return 'Search'; if (/(^|\.)(spotify\.com|apple\.com|music\.apple\.com)$/.test(r)) return r.indexOf('spotify') > -1 ? 'Spotify' : 'Apple';
  return r.replace(/^www\./, '');
}

function headline(rows) {
  const dev = {}, visits = {}; let seconds = 0;
  rows.forEach(r => { dev[r.device_id] = 1; (visits[r.visit_id] = visits[r.visit_id] || 0); visits[r.visit_id] += Number(r.seconds) || 0; seconds += Number(r.seconds) || 0; });
  const nVisits = Object.keys(visits).length;
  return { visitors: Object.keys(dev).length, visits: nVisits, views: rows.length, avgVisit: nVisits ? Math.round(Object.values(visits).reduce((a, b) => a + b, 0) / nVisits) : 0, avgPage: rows.length ? Math.round(seconds / rows.length) : 0 };
}
export async function getSiteInsights(db, lib, days, includeOwner) {
  await ensureSite(db);
  days = Number(days) || 0;
  const keep = x => includeOwner || x.share_token !== 'owner', now = Date.now(), since = days > 0 ? now - days * 864e5 : 0, span = days > 0 ? Math.min(days, 31) : 30;
  const out = { days, totals: headline([]), prev: null, audience: { newVisitors: 0, returning: 0 }, perDay: [], pages: [], devices: { phone: 0, tablet: 0, desktop: 0 }, cities: [], sources: [] };
  const R = (await db.prepare('SELECT * FROM site_views WHERE at >= ?').bind(since).all()).results.filter(keep);
  if (days > 0) out.prev = headline((await db.prepare('SELECT * FROM site_views WHERE at >= ? AND at < ?').bind(since - days * 864e5, since).all()).results.filter(keep));
  const day = {}, dayDev = {}, page = {}, visitFirst = {}, city = {};
  R.forEach(r => {
    const d = dayKey(r.at); day[d] = (day[d] || 0) + 1; (dayDev[d] = dayDev[d] || {})[r.device_id] = 1;
    const p = page[r.path] = page[r.path] || { views: 0, devs: {}, seconds: 0 }; p.views++; p.devs[r.device_id] = 1; p.seconds += Number(r.seconds) || 0;
    if (!visitFirst[r.visit_id] || r.at < visitFirst[r.visit_id].at) visitFirst[r.visit_id] = r;
    const key = [r.city, r.region, r.country].join('|'), c = city[key] = city[key] || { city: r.city, region: r.region, country: r.country, devs: {} }; c.devs[r.device_id] = 1;
  });
  out.totals = headline(R);
  for (let i = span - 1; i >= 0; i--) { const d = dayKey(now - i * 864e5); out.perDay.push({ d, n: day[d] || 0, v: Object.keys(dayDev[d] || {}).length }); }
  out.pages = Object.keys(page).map(path => ({ path, page: pageName(path, lib), views: page[path].views, visitors: Object.keys(page[path].devs).length, avg: Math.round(page[path].seconds / page[path].views) })).sort((a, b) => b.views - a.views || b.visitors - a.visitors).slice(0, 15);
  const src = {};
  Object.values(visitFirst).forEach(r => { out.devices[r.device] = (out.devices[r.device] || 0) + 1; const n = sourceName(r.ref); src[n] = (src[n] || 0) + 1; });
  out.sources = Object.keys(src).map(name => ({ name, visits: src[name] })).sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name)).slice(0, 8);
  out.cities = Object.values(city).map(c => ({ city: c.city || '', region: c.region || '', country: c.country || '', visitors: Object.keys(c.devs).length })).sort((a, b) => b.visitors - a.visitors || String(a.city).localeCompare(String(b.city))).slice(0, 10);
  if (days > 0 && out.totals.visitors) {
    const first = {}; (await db.prepare("SELECT device_id, MIN(at) AS f FROM site_views GROUP BY device_id").all()).results.forEach(r => { first[r.device_id] = r.f; });
    const devs = {}; R.forEach(r => { devs[r.device_id] = 1; });
    Object.keys(devs).forEach(d => { if ((first[d] == null ? since : first[d]) >= since) out.audience.newVisitors++; else out.audience.returning++; });
  }
  return out;
}
/** Who is on the site right now (a "still here" note in the last 90 seconds). */
export async function getSiteLive(db, lib, includeOwner) {
  await ensureSite(db);
  const now = Date.now(), rows = (await db.prepare('SELECT * FROM site_views WHERE last >= ? ORDER BY last DESC, rowid DESC').bind(now - LIVE_MS).all()).results.filter(x => includeOwner || x.share_token !== 'owner');
  const seen = {}, list = [];
  rows.forEach(r => { if (seen[r.device_id]) return; seen[r.device_id] = 1; list.push({ page: pageName(r.path, lib), device: r.device, city: [r.city, r.region].filter(Boolean).join(', '), ago: Math.max(0, Math.round((now - r.last) / 1000)) }); });
  return { count: list.length, now: list.slice(0, 30) };
}
