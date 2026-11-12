// Share links, listening history, comments and error reports, as real D1 tables (ported from Vault.gs).
// One switch ("activity") moves all four off the Sheet; see adoptDomain in api.js.
import { shareScope, findShare } from './share.js';
const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const hex = n => Array.from(crypto.getRandomValues(new Uint8Array(n))).map(b => b.toString(16).padStart(2, '0')).join('');

export const ACTIVITY_FNS = ['createShare', 'setShareActive', 'deleteShare', 'quickShare', 'recordPlay', 'logListens', 'getInsights', 'getComments', 'addComment', 'resolveComment', 'deleteComment', 'logClientError', 'errorSummary'];
const DDL = [
  'CREATE TABLE IF NOT EXISTS shares (token TEXT PRIMARY KEY, target_type TEXT, target_id TEXT, label TEXT, allow_download INTEGER, expires TEXT, active INTEGER, plays INTEGER, created TEXT, fan_name TEXT, member_no INTEGER)',
  'CREATE TABLE IF NOT EXISTS listens (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, track_id TEXT, version_id TEXT, release_id TEXT, share_token TEXT, device_id TEXT, seconds INTEGER, pct INTEGER, outcome TEXT, device TEXT)',
  'CREATE INDEX IF NOT EXISTS ix_listens_at ON listens (at)', 'CREATE INDEX IF NOT EXISTS ix_listens_dev ON listens (share_token, device_id, at)',
  'CREATE TABLE IF NOT EXISTS comments (comment_id TEXT PRIMARY KEY, version_id TEXT, token TEXT, name TEXT, time_sec REAL, text TEXT, created TEXT, resolved INTEGER)',
  'CREATE INDEX IF NOT EXISTS ix_comments_v ON comments (version_id)',
  'CREATE TABLE IF NOT EXISTS errors (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, mode TEXT, message TEXT)'];
export const ensureTables = db => db.batch(DDL.map(s => db.prepare(s)));

// ── shares ──
const shareOut = r => ({ token: r.token, target_type: r.target_type, target_id: r.target_id, label: r.label || '', allow_download: !!r.allow_download, expires: r.expires || '', active: !!r.active,
  plays: Number(r.plays) || 0, created: r.created || '', fan_name: r.fan_name || '', member_no: Number(r.member_no) || 0 });
export async function loadShares(db) { try { return (await db.prepare('SELECT * FROM shares ORDER BY rowid').all()).results.map(shareOut); } catch (e) { return null; } }
export async function importShares(db, shares) {
  await ensureTables(db);
  await db.batch([db.prepare('DELETE FROM shares')].concat(shares.map(s => db.prepare('INSERT INTO shares (token, target_type, target_id, label, allow_download, expires, active, plays, created, fan_name, member_no) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(s.token, s.target_type, s.target_id, s.label || '', s.allow_download ? 1 : 0, s.expires || '', s.active ? 1 : 0, Number(s.plays) || 0, s.created || '', s.fan_name || '', Number(s.member_no) || 0))));
  return shares.length;
}
export async function createShare(db, o, siteUrl) {
  o = o || {};
  if (['release', 'track', 'version', 'all'].indexOf(o.targetType) < 0) throw new Error('Unknown share type.');
  const targetId = o.targetType === 'all' ? 'all' : String(o.targetId || '');
  const days = Number(o.expiresDays) || 0, expires = days ? new Date(Date.now() + days * 864e5).toISOString() : '';
  const fanName = o.targetType === 'all' ? cut(o.fanName, 40) : '';
  let memberNo = 0;
  if (fanName) { const r = await db.prepare('SELECT MAX(member_no) AS m FROM shares').first(); memberNo = (Number(r && r.m) || 0) + 1; }
  const token = hex(6), created = new Date().toISOString();
  await db.prepare('INSERT INTO shares (token, target_type, target_id, label, allow_download, expires, active, plays, created, fan_name, member_no) VALUES (?,?,?,?,?,?,1,0,?,?,?)')
    .bind(token, o.targetType, targetId, cut(o.label, 120), o.allowDownload ? 1 : 0, expires, created, fanName, memberNo).run();
  return { token, url: siteUrl + '/?s=' + token, expires, fan_name: fanName, member_no: memberNo };
}
export async function setShareActive(db, token, active) {
  const r = await db.prepare('UPDATE shares SET active = ? WHERE token = ?').bind(active ? 1 : 0, String(token || '')).run();
  if (!r.meta || !r.meta.changes) throw new Error('Share not found.'); return true;
}
export async function deleteShare(db, token, publicToken) {
  token = String(token || '');
  if (token && token === String(publicToken || '')) throw new Error('This is the link every visitor to the site uses, so it cannot be deleted. Turn off or delete the others.');
  const r = await db.prepare('DELETE FROM shares WHERE token = ?').bind(token).run();
  if (!r.meta || !r.meta.changes) throw new Error('Share not found.'); return true;   // plays and comments already recorded for it are kept
}
export async function quickShare(db, o, siteUrl) {
  if (o.targetType !== 'release' && o.targetType !== 'track') throw new Error('Unknown share type.');
  const ex = await db.prepare("SELECT token FROM shares WHERE target_type = ? AND target_id = ? AND label = 'Public link' AND active = 1 AND (expires = '' OR expires IS NULL)").bind(o.targetType, o.targetId).first();
  if (ex) return { token: ex.token, url: siteUrl + '/?s=' + ex.token, created: false };
  const made = await createShare(db, { targetType: o.targetType, targetId: o.targetId, label: 'Public link', allowDownload: false }, siteUrl);
  return { token: made.token, url: made.url, created: true };
}
export async function recordPlay(db, lib, token) {
  const s = findShare(lib, String(token || ''), new Date()); if (!s) return false;
  await db.prepare('UPDATE shares SET plays = plays + 1 WHERE token = ?').bind(s.token).run(); return true;
}

// ── listening history ──
const OUTCOMES = { complete: 1, partial: 1, skip: 1 }, MAX_DEV_HOUR = 120, MAX_LINK_HOUR = 3000, MAX_ROWS = 400000;
export async function logListens(db, lib, isOwner, token, deviceId, events) {
  let shareTok = 'owner', allowed = null;
  if (!isOwner) {
    const s = findShare(lib, String(token || ''), new Date()); if (!s) return 0;
    shareTok = s.token; allowed = new Set(shareScope(s, lib, new Date()).versions.map(v => v.version_id));
  }
  const vTrack = {}, tRel = {};
  (lib.versions || []).forEach(v => { vTrack[v.version_id] = v.track_id; }); (lib.tracks || []).forEach(t => { tRel[t.track_id] = t.release_id; });
  const dev = String(deviceId || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 40), now = Date.now(), since = now - 3600000;
  const usedDev = Number((await db.prepare('SELECT COUNT(*) AS n FROM listens WHERE share_token = ? AND device_id = ? AND at > ?').bind(shareTok, dev, since).first()).n) || 0;
  const usedTok = isOwner ? 0 : Number((await db.prepare('SELECT COUNT(*) AS n FROM listens WHERE share_token = ? AND at > ?').bind(shareTok, since).first()).n) || 0;
  const room = Math.min(MAX_DEV_HOUR - usedDev, (isOwner ? Infinity : MAX_LINK_HOUR) - usedTok);
  if (room <= 0) return 0;
  const total = Number((await db.prepare('SELECT COUNT(*) AS n FROM listens').first()).n) || 0; if (total > MAX_ROWS) return 0;
  const rows = [];
  (events || []).slice(0, 60).forEach(e => {
    if (!e || !vTrack[e.v] || (allowed && !allowed.has(e.v)) || !OUTCOMES[e.o]) return;
    const sec = Math.round(Number(e.s)), pct = Math.round(Number(e.p));
    if (!(sec >= 0 && sec <= 7200) || !(pct >= 0 && pct <= 100)) return;
    const ago = Math.min(7 * 86400, Math.max(0, Number(e.ago) || 0)), tid = vTrack[e.v];
    rows.push([now - ago * 1000, tid, e.v, tRel[tid] || '', shareTok, dev, sec, pct, e.o, e.d === 'phone' ? 'phone' : 'desktop']);
  });
  if (rows.length > room) rows.length = room;
  if (!rows.length) return 0;
  await db.batch(rows.map(r => db.prepare('INSERT INTO listens (at, track_id, version_id, release_id, share_token, device_id, seconds, pct, outcome, device) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(...r)));
  return rows.length;
}
const TZ = 'America/Los_Angeles';   // the same time zone the Sheet used for "per day"
const dayKey = ms => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
export async function getInsights(db, lib, days, includeOwner) {
  days = Number(days) || 0;
  const out = { days, totals: { plays: 0, skips: 0, listeners: 0, seconds: 0, finishRate: 0 }, perDay: [], songs: [], skipped: [], releases: [], links: [] };
  const since = days > 0 ? Date.now() - days * 864e5 : 0;
  const L = (await db.prepare('SELECT * FROM listens WHERE at >= ?').bind(since).all()).results.filter(x => includeOwner || x.share_token !== 'owner');
  if (!L.length) { const span0 = days > 0 ? Math.min(days, 31) : 30; for (let i = span0 - 1; i >= 0; i--) out.perDay.push({ d: dayKey(Date.now() - i * 864e5), n: 0 }); return out; }
  const T = {}, Rl = {}, Sh = {}; (lib.tracks || []).forEach(t => { T[t.track_id] = t; }); (lib.releases || []).forEach(r => { Rl[r.release_id] = r; }); (lib.shares || []).forEach(s => { Sh[s.token] = s; });
  const song = {}, relA = {}, link = {}, day = {}, devs = {}; let complete = 0;
  L.forEach(x => {
    const play = x.outcome !== 'skip', sg = song[x.track_id] = song[x.track_id] || { plays: 0, complete: 0, skips: 0 };
    if (play) { sg.plays++; out.totals.plays++; if (x.outcome === 'complete') { sg.complete++; complete++; } } else { sg.skips++; out.totals.skips++; }
    out.totals.seconds += Number(x.seconds) || 0; if (x.device_id) devs[x.device_id] = 1;
    if (play) relA[x.release_id] = (relA[x.release_id] || 0) + 1;
    const lk = link[x.share_token] = link[x.share_token] || { plays: 0, devs: {} }; if (play) lk.plays++; if (x.device_id) lk.devs[x.device_id] = 1;
    if (play) { const d = dayKey(x.at); day[d] = (day[d] || 0) + 1; }
  });
  out.totals.listeners = Object.keys(devs).length; out.totals.finishRate = out.totals.plays ? Math.round(complete / out.totals.plays * 100) : 0;
  const span = days > 0 ? Math.min(days, 31) : 30;
  for (let i = span - 1; i >= 0; i--) { const d = dayKey(Date.now() - i * 864e5); out.perDay.push({ d, n: day[d] || 0 }); }
  const name = tid => { const t = T[tid] || {}, r = Rl[t.release_id] || {}; return { title: t.title || '(removed song)', release: r.title || '' }; };
  out.songs = Object.keys(song).map(tid => { const g = song[tid], heard = g.plays + g.skips; return Object.assign(name(tid), { track_id: tid, plays: g.plays, finish: g.plays ? Math.round(g.complete / g.plays * 100) : 0, skip: heard ? Math.round(g.skips / heard * 100) : 0, heard }); }).sort((a, b) => b.plays - a.plays || b.finish - a.finish);
  out.skipped = out.songs.filter(x => x.heard >= 3 && x.skip > 0).sort((a, b) => b.skip - a.skip || b.heard - a.heard).slice(0, 8);
  out.songs = out.songs.filter(x => x.plays > 0).slice(0, 15);
  out.releases = Object.keys(relA).map(rid => ({ release_id: rid, title: (Rl[rid] || {}).title || '(removed release)', plays: relA[rid] })).sort((a, b) => b.plays - a.plays).slice(0, 10);
  out.links = Object.keys(link).map(tok => { const s = Sh[tok] || {}, lb = tok === 'owner' ? 'You' : (s.fan_name || s.label || (s.target_type === 'all' ? 'Fan club link' : 'Share link')); return { label: String(lb), plays: link[tok].plays, listeners: Object.keys(link[tok].devs).length, active: tok === 'owner' || s.active !== false }; }).sort((a, b) => b.plays - a.plays);
  return out;
}

// ── comments ──
const cOut = (c, owner) => ({ comment_id: c.comment_id, name: c.name, time_sec: Number(c.time_sec) || 0, text: c.text, created: c.created || '', resolved: !!c.resolved, via: owner ? c.token : undefined });
const canSee = (lib, token, versionId) => { const s = findShare(lib, String(token || ''), new Date()); return !!s && shareScope(s, lib, new Date()).versions.some(v => v.version_id === versionId); };
export async function getComments(db, lib, isOwner, token, versionId) {
  if (!isOwner && !canSee(lib, token, versionId)) return [];
  const rows = (await db.prepare('SELECT * FROM comments WHERE version_id = ? ORDER BY time_sec').bind(String(versionId || '')).all()).results;
  return rows.filter(c => isOwner || c.token === token || c.token === 'owner').map(c => cOut(c, isOwner));
}
export async function addComment(db, lib, isOwner, ownerName, token, versionId, timeSec, name, text) {
  text = cut(text, 1000); name = isOwner ? (ownerName || 'Nicólas Soul') : cut(name, 60);
  if (!text) throw new Error('Write a note first.'); if (!name) throw new Error('Add your name.');
  if (!isOwner && !canSee(lib, token, versionId)) throw new Error('This link can no longer comment on this song.');
  const tok = isOwner ? 'owner' : String(token);
  if (!isOwner && Number((await db.prepare('SELECT COUNT(*) AS n FROM comments WHERE token = ?').bind(tok).first()).n) >= 300) throw new Error('This link has reached its comment limit.');
  const row = { comment_id: 'cmt_' + hex(6), version_id: String(versionId), token: tok, name, time_sec: Math.max(0, Math.round((Number(timeSec) || 0) * 10) / 10), text, created: new Date().toISOString(), resolved: 0 };
  await db.prepare('INSERT INTO comments (comment_id, version_id, token, name, time_sec, text, created, resolved) VALUES (?,?,?,?,?,?,?,0)').bind(row.comment_id, row.version_id, row.token, row.name, row.time_sec, row.text, row.created).run();
  return cOut(row, isOwner);
}
export async function resolveComment(db, id, resolved) {
  const r = await db.prepare('UPDATE comments SET resolved = ? WHERE comment_id = ?').bind(resolved ? 1 : 0, String(id || '')).run();
  if (!r.meta || !r.meta.changes) throw new Error('Comment not found.'); return true;
}
export async function deleteComment(db, id) { await db.prepare('DELETE FROM comments WHERE comment_id = ?').bind(String(id || '')).run(); return true; }
export async function commentCounts(db) { const out = {}; try { (await db.prepare("SELECT token, COUNT(*) AS n FROM comments WHERE token != 'owner' GROUP BY token").all()).results.forEach(r => { out[r.token] = r.n; }); } catch (e) {} return out; }

// ── error reports ──
export async function logClientError(db, message, mode) {
  const msg = cut(message, 300), md = cut(mode, 10), now = Date.now();
  if (Number((await db.prepare('SELECT COUNT(*) AS n FROM errors WHERE at > ?').bind(now - 60000).first()).n) >= 30) return true;   // anyone can call this, so it is capped: 30 a minute
  await db.prepare('INSERT INTO errors (at, mode, message) VALUES (?,?,?)').bind(now, md, msg).run();
  await db.prepare('DELETE FROM errors WHERE id <= (SELECT MAX(id) FROM errors) - 2000').run();
  return true;
}
export async function errorSummary(db) {
  const since = Date.now() - 7 * 864e5, groups = {}; let total = 0, last = 0;
  (await db.prepare('SELECT * FROM errors WHERE at >= ?').bind(since).all()).results.forEach(r => {
    total++; if (r.at > last) last = r.at;
    const k = String(r.message).replace(/[0-9a-f]{8,}/gi, '#').replace(/\d+/g, '#').slice(0, 140), g = groups[k] || (groups[k] = { message: String(r.message).slice(0, 200), count: 0, last: 0, mode: r.mode }); g.count++; g.last = Math.max(g.last, r.at);
  });
  const top = Object.keys(groups).map(k => groups[k]).sort((a, b) => b.count - a.count).slice(0, 12).map(g => ({ message: g.message, count: g.count, last: new Date(g.last).toISOString(), mode: g.mode }));
  return { days: 7, total, last: last ? new Date(last).toISOString() : '', top };
}
