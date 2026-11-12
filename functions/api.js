// POST /api  { fn, args }  — same shape as the Apps Script web app, so the app needs no other change.
// Stage 1: `getShare` (the whole library, which was the slow call) is answered here from the D1 copy and cached at the edge for 60 s.
// Everything else is passed straight to Apps Script. If anything here fails, the call goes to Apps Script instead.
import cfg from '../site.config.json';
import { ERR_LINK, findShare, shareBody, bodyTtl, shareBlock, overlayFor } from './_lib/share.js';
import { loadLib, saveLib, readMeta, loadOverlay, saveOverlay } from './_lib/mirror.js';
import { makeRecord, checkPassword, PW_MIN, MAX_TRIES, LOGIN_LOCK_MS, failKey } from './_lib/auth.js';
import { cleanBasics, cleanWorld, cleanTrack, cleanLinks, cleanSr, normOverlay, overlayIsEmpty, patchRow } from './_lib/studio.js';

const appsUrl = env => (env && env.APPS_URL) || cfg.api;
const FRESH_MS = 5 * 60 * 1000;      // refresh the copy when it is older than this
const LOCK_MS = 90 * 1000;           // one refresh at a time
// Calls that change the library in Apps Script: after one succeeds, the copy here is refreshed within seconds instead of waiting for the next 5-minute refresh.
const LIB_WRITES = new Set(['saveTracklist', 'uploadCover', 'saveTrackDetails', 'updateVersion', 'registerUpload', 'setPreview', 'saveWorld', 'addExtra', 'addPhoto', 'deleteExtra', 'setAnimatedCover', 'saveLetter', 'saveUnlock', 'setVoiceNote',
  'createRelease', 'setDuration', 'saveLyrics', 'saveVideosMeta', 'saveArtistLinks', 'saveBio', 'addYoutubeSong', 'savePlaylist', 'deletePlaylist', 'uploadCleanCover', 'quickShare', 'createShare', 'setShareActive', 'deleteTrack', 'deleteVersion',
  'deleteRelease', 'addAudioNote', 'addYoutubePlaylistVideos', 'createReleaseFromYoutube', 'addCover', 'removeCover', 'setMainCover', 'updateExtra', 'refreshYoutubeTitles', 'setTrackCover', 'setReleaseBg']);
const json = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: { 'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store' } });

async function proxy(env, text) {
  const r = await fetch(appsUrl(env), { method: 'POST', body: text, headers: { 'content-type': 'text/plain;charset=utf-8' }, redirect: 'follow' });
  return new Response(await r.text(), { status: r.status, headers: { 'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store' } });
}

// Refresh the copy from Apps Script (its getLibrary, using the owner key kept as a secret here).
export async function syncMirror(env, force, gapMs) {
  if (!env.DB || !env.OWNER_KEY) throw new Error('Not set up (needs the DB binding and the OWNER_KEY secret).');
  const meta = await readMeta(env.DB);
  if (!force && meta && meta.lock && Date.now() - meta.lock < (gapMs || LOCK_MS)) return meta;
  if (meta) await env.DB.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES ('meta', ?)").bind(JSON.stringify(Object.assign({}, meta, { lock: Date.now() }))).run().catch(() => {});
  const r = await fetch(appsUrl(env), { method: 'POST', body: JSON.stringify({ fn: 'getLibrary', args: [env.OWNER_KEY] }), headers: { 'content-type': 'text/plain;charset=utf-8' }, redirect: 'follow' });
  const j = await r.json();
  if (!j.ok) throw new Error('Apps Script said: ' + j.error);
  const lib = j.result;
  if (!lib || !Array.isArray(lib.releases) || !lib.releases.length || !Array.isArray(lib.tracks) || !lib.tracks.length) throw new Error('The library looked empty; keeping the old copy.');
  // Not needed to answer fans, and not worth keeping: the birthday, comment counts, backup state.
  const saved = await saveLib(env.DB, lib, { source: 'apps-script-getLibrary', build: lib.build || '' });
  mem.lib = null;
  try { await forgetCached(lib); } catch (e) {}
  return saved;
}

const mem = { at: 0, lib: null, ov: null };   // kept for a minute inside a warm instance
async function library(ctx) {
  const { env } = ctx, now = Date.now();
  if (mem.lib && now - mem.at < 60000) return mem.lib;
  const lib = await loadLib(env.DB);
  const ov = normOverlay(await loadOverlay(env.DB));
  if (!lib) { if (env.OWNER_KEY) ctx.waitUntil(syncMirror(env).catch(() => {})); return null; }
  mem.lib = lib; mem.ov = ov; mem.at = now;
  ctx.waitUntil(readMeta(env.DB).then(m => { if (m && now - m.synced_at > FRESH_MS && env.OWNER_KEY) return syncMirror(env); }).catch(() => {}));
  return lib;
}

async function edgeShare(ctx, args) {
  const lib = await library(ctx);
  if (!lib) return null;                                   // not copied yet: Apps Script answers this one
  const now = new Date(), token = String(args[0] || '');
  const s = findShare(lib, token, now);
  if (!s) return { error: ERR_LINK };
  const cache = caches.default, key = new Request('https://edge.soulnicolas.invalid/gs1/' + encodeURIComponent(s.target_type) + '/' + encodeURIComponent(s.target_id || ''));
  let body, hit = await cache.match(key);
  if (hit) body = await hit.json();
  else {
    body = shareBody(s, lib, now, mem.ov);
    if (!overlayIsEmpty(mem.ov)) body.overlay = overlayFor(body, mem.ov);
    const ttl = bodyTtl(body, now, 60);
    ctx.waitUntil(cache.put(key, new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=' + ttl } })));
  }
  return Object.assign({}, body, { share: shareBlock(s) });
}

// ───────── Studio (owner only) ─────────
const isOwner = (env, key) => !!env.OWNER_KEY && String(key || '') === env.OWNER_KEY;
async function callApps(env, fn, args) {
  const r = await fetch(appsUrl(env), { method: 'POST', body: JSON.stringify({ fn, args }), headers: { 'content-type': 'text/plain;charset=utf-8' }, redirect: 'follow' });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'Apps Script refused the change.');
  return j.result;
}
async function forgetCached(lib) {   // drop this data centre's kept answers so the change shows at once
  const seen = {};
  (lib.shares || []).forEach(s => { seen[s.target_type + '/' + (s.target_id || '')] = 1; });
  await Promise.all(Object.keys(seen).map(k => { const [t, i] = k.split('/'); return caches.default.delete(new Request('https://edge.soulnicolas.invalid/gs1/' + encodeURIComponent(t) + '/' + encodeURIComponent(i || ''))); }));
}
async function keepLib(ctx, lib, ov) {
  const meta = await readMeta(ctx.env.DB);
  await saveLib(ctx.env.DB, lib, { synced_at: meta ? meta.synced_at : Date.now() });
  if (ov) await saveOverlay(ctx.env.DB, ov);
  mem.lib = lib; if (ov) mem.ov = ov; mem.at = Date.now();
  await forgetCached(lib);
}
async function ownerState(ctx) {
  const lib = await loadLib(ctx.env.DB);
  if (!lib) throw new Error('The copy of your data is not ready yet. Try again in a minute.');
  return { lib, ov: normOverlay(await loadOverlay(ctx.env.DB)) };
}
async function studio(ctx, fn, a) {
  const { env } = ctx;
  if (!env.DB) throw new Error('Studio needs the Cloudflare database.');
  if (!isOwner(env, a[0])) throw new Error('This link is missing its owner key. Open the app from your owner link.');
  const { lib, ov } = await ownerState(ctx);
  if (fn === 'studioGet') {
    return { releases: lib.releases, versions: lib.versions.map(v => ({ version_id: v.version_id, track_id: v.track_id, label: v.label, is_primary: v.is_primary, hidden: v.hidden })),
             tracks: lib.tracks.map(t => { const o = Object.assign({}, t); delete o.lyrics; delete o.track_cover_thumb; return o; }), overlay: ov };
  }
  if (fn === 'studioSaveRelease') {
    const rid = String(a[1] || ''), f = a[2] || {};
    if (!(lib.releases || []).some(r => r.release_id === rid)) throw new Error('Release not found.');
    let basics = null, world = null;
    if (f.basics) basics = cleanBasics(f.basics);
    if (f.world) world = cleanWorld(f.world);
    const cur = lib.releases.find(r => r.release_id === rid);
    if (basics) await callApps(env, 'saveTracklist', [env.OWNER_KEY, rid, basics.title != null ? basics.title : cur.title, [], basics.hidden != null ? basics.hidden : cur.hidden === true, basics.type || cur.type]);
    if (world) await callApps(env, 'saveWorld', [env.OWNER_KEY, rid, world]);
    if (basics) patchRow(lib, 'releases', 'release_id', rid, basics);
    if (world) patchRow(lib, 'releases', 'release_id', rid, world);
    if (f.unreleased != null) { ov.flags.releases[rid] = !!f.unreleased; }
    await keepLib(ctx, lib, f.unreleased != null ? ov : null);
    return true;
  }
  if (fn === 'studioSaveTrack') {
    const tid = String(a[1] || ''), f = a[2] || {};
    if (!(lib.tracks || []).some(t => t.track_id === tid)) throw new Error('Song not found.');
    const fields = cleanTrack(f.fields || {});
    const sr = f.sr != null ? cleanSr(f.sr) : null;
    if (Object.keys(fields).length) { await callApps(env, 'saveTrackDetails', [env.OWNER_KEY, tid, fields]); patchRow(lib, 'tracks', 'track_id', tid, fields); }
    if (sr != null) { if (sr) ov.sr[tid] = sr; else delete ov.sr[tid]; }
    if (f.unreleased != null) ov.flags.tracks[tid] = !!f.unreleased;
    await keepLib(ctx, lib, (sr != null || f.unreleased != null) ? ov : null);
    return true;
  }
  if (fn === 'studioSaveLinks') {
    const rid = String(a[1] || '');
    if (!(lib.releases || []).some(r => r.release_id === rid)) throw new Error('Release not found.');
    const c = cleanLinks(a[2] || {});
    if (c.links.length || c.first) ov.releases[rid] = c; else delete ov.releases[rid];
    await saveOverlay(env.DB, ov); mem.ov = ov; mem.at = Date.now(); await forgetCached(lib);
    return true;
  }
  throw new Error('Unknown action.');
}

// ───────── Owner password ─────────
async function kvGet(db, k) { try { const r = await db.prepare('SELECT v FROM kv WHERE k = ?').bind(k).first(); return r ? JSON.parse(r.v) : null; } catch (e) { return null; } }
async function kvSet(db, k, v) { await db.prepare('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)').run(); await db.prepare('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)').bind(k, JSON.stringify(v)).run(); }
async function setOwnerPassword(ctx, a) {
  const { env } = ctx;
  if (!env.DB) throw new Error('This needs the Cloudflare database.');
  if (!isOwner(env, a[0])) throw new Error('This link is missing its owner key. Open the app from your owner link.');
  const pw = String(a[1] || '');
  if (pw.length < PW_MIN) throw new Error('Use at least ' + PW_MIN + ' characters. A few random words works well.');
  if (pw.length > 200) throw new Error('That password is too long.');
  await kvSet(env.DB, 'owner_pw', await makeRecord(pw));
  return true;
}
async function ownerLogin(ctx, a) {
  const { env, request } = ctx;
  if (!env.DB || !env.OWNER_KEY) throw new Error('Login is not set up yet.');
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown', fk = failKey(ip), now = Date.now();
  const f = (await kvGet(env.DB, fk)) || { n: 0, until: 0 };
  if (f.until > now) throw new Error('Too many wrong tries. Try again in ' + Math.max(1, Math.ceil((f.until - now) / 60000)) + ' minutes.');
  const rec = await kvGet(env.DB, 'owner_pw');
  if (!rec) throw new Error('No owner password is set yet. Sign in once with your owner link, then set it in Settings.');
  const ok = await checkPassword(String(a[0] || '').slice(0, 200), rec);
  if (!ok) {
    f.n = (f.until && f.until <= now ? 0 : f.n) + 1;
    if (f.n >= MAX_TRIES) { f.until = now + LOGIN_LOCK_MS; f.n = 0; }
    await kvSet(env.DB, fk, f);
    await new Promise(r => setTimeout(r, 700));
    throw new Error('That password is not right.');
  }
  if (f.n || f.until) await kvSet(env.DB, fk, { n: 0, until: 0 });
  return { key: env.OWNER_KEY };
}

export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  const text = await request.text();
  let req; try { req = JSON.parse(text); } catch (e) { return json({ ok: false, error: 'Unknown action.' }); }
  const fn = req && req.fn, args = Array.isArray(req && req.args) ? req.args : [];
  try {
    if (fn === 'getShare' && env.DB) {
      const out = await edgeShare(ctx, args);
      if (out) return json({ ok: true, result: out });
    } else if (fn === 'setOwnerPassword' || fn === 'ownerLogin') {
      try { return json({ ok: true, result: fn === 'ownerLogin' ? await ownerLogin(ctx, args) : await setOwnerPassword(ctx, args) }); }
      catch (e) { return json({ ok: false, error: String((e && e.message) || e) }); }
    } else if (fn === 'getOverlay' && env.DB) {
      return json({ ok: true, result: normOverlay(await loadOverlay(env.DB)) });
    } else if (/^studio(Get|SaveRelease|SaveTrack|SaveLinks)$/.test(fn)) {
      try { return json({ ok: true, result: await studio(ctx, fn, args) }); }
      catch (e) { return json({ ok: false, error: String((e && e.message) || e) }); }
    } else if (fn === 'edgeStatus') {
      const m = env.DB ? await readMeta(env.DB) : null;
      return json({ ok: true, result: { db: !!env.DB, owner_key: !!env.OWNER_KEY, synced_at: m ? m.synced_at : null, age_s: m ? Math.round((Date.now() - m.synced_at) / 1000) : null, counts: m ? m.counts : null } });
    } else if (fn === 'edgeSync') {
      if (!env.OWNER_KEY || String(args[0] || '') !== env.OWNER_KEY) return json({ ok: false, error: 'Not allowed.' });
      const m = await syncMirror(env, true); mem.lib = null;
      return json({ ok: true, result: { synced_at: m.synced_at, counts: m.counts } });
    }
  } catch (e) {
    if (fn === 'edgeSync') return json({ ok: false, error: String((e && e.message) || e) });
    // anything else: fall through to Apps Script
  }
  try {
    const res = await proxy(env, text);
    if (LIB_WRITES.has(fn) && env.DB && env.OWNER_KEY) {
      const ok = await res.clone().json().then(j => j && j.ok === true).catch(() => false);
      if (ok) ctx.waitUntil(syncMirror(env, false, 8000).catch(() => {}));
    }
    return res;
  }
  catch (e) { return json({ ok: false, error: 'Could not reach Soul Vault. Check your internet connection.' }, 502); }
}
