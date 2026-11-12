// POST /api  { fn, args }  — same shape as the Apps Script web app, so the app needs no other change.
// Stage 1: `getShare` (the whole library, which was the slow call) is answered here from the D1 copy and cached at the edge for 60 s.
// Everything else is passed straight to Apps Script. If anything here fails, the call goes to Apps Script instead.
import cfg from '../site.config.json';
import { ERR_LINK, findShare, shareScope, shareBody, bodyTtl, shareBlock, overlayFor } from './_lib/share.js';
import { loadLib, saveLib, readMeta, loadOverlay, saveOverlay } from './_lib/mirror.js';
import { makeRecord, checkPassword, PW_MIN, MAX_TRIES, LOGIN_LOCK_MS, failKey } from './_lib/auth.js';
import { loadNative, saveNative, mergeNative, newRelease, newTrack, newVersion, relSlug, slug, MEDIA_BASE } from './_lib/native.js';
import * as OW from './_lib/owned.js';
import * as CT from './_lib/catalog.js';
import * as AC from './_lib/activity.js';
import * as FN from './_lib/fans.js';
import { RELEASE_TYPES, cleanBasics, cleanWorld, cleanTrack, cleanLinks, cleanSr, normOverlay, overlayIsEmpty, patchRow } from './_lib/studio.js';

const appsUrl = env => (env && env.APPS_URL) || cfg.api;
const FRESH_MS = 5 * 60 * 1000;      // refresh the copy when it is older than this
const LOCK_MS = 90 * 1000;           // one refresh at a time
// Calls that change the library in Apps Script: after one succeeds, the copy here is refreshed within seconds instead of waiting for the next 5-minute refresh.
const LIB_WRITES = new Set(['saveTracklist', 'uploadCover', 'saveTrackDetails', 'updateVersion', 'registerUpload', 'setPreview', 'saveWorld', 'addExtra', 'addPhoto', 'deleteExtra', 'setAnimatedCover', 'saveLetter', 'saveUnlock', 'setVoiceNote',
  'createRelease', 'setDuration', 'saveLyrics', 'saveVideosMeta', 'saveArtistLinks', 'saveBio', 'addYoutubeSong', 'savePlaylist', 'deletePlaylist', 'uploadCleanCover', 'quickShare', 'createShare', 'setShareActive', 'deleteTrack', 'deleteVersion',
  'deleteRelease', 'addAudioNote', 'addYoutubePlaylistVideos', 'createReleaseFromYoutube', 'addCover', 'removeCover', 'setMainCover', 'updateExtra', 'refreshYoutubeTitles', 'setTrackCover', 'setReleaseBg']);
const json = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: { 'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store' } });

const SIGNUP_API = 'https://script.google.com/macros/s/AKfycbx22pIcJuFLQyN9VIvp4LDy9gcmXnaxxfsIc47JPKgI7D7Bq-SufKQWRk3nzX4TOqw6/exec';
async function proxy(env, text, url) {
  const r = await fetch(url || appsUrl(env), { method: 'POST', body: text, headers: { 'content-type': 'text/plain;charset=utf-8' }, redirect: 'follow' });
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
  let lib = await loadLib(env.DB);
  const ov = normOverlay(await loadOverlay(env.DB));
  if (!lib) { if (env.OWNER_KEY) ctx.waitUntil(syncMirror(env).catch(() => {})); return null; }
  const own = await OW.loadOwned(env.DB);
  mem.lib = OW.applyOwned(mergeNative(lib, await loadNative(env.DB), ov), own); mem.ov = ov; mem.at = now;
  if (own.domains.activity) { const sh = await AC.loadShares(env.DB); if (sh) mem.lib.shares = sh; }   // share links live in the D1 table once "activity" is switched over
  lib = mem.lib;
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
  mem.lib = null; if (ov) mem.ov = ov;
  await forgetCached(lib);
}
async function ownerState(ctx) {
  const lib = await loadLib(ctx.env.DB);
  if (!lib) throw new Error('The copy of your data is not ready yet. Try again in a minute.');
  return { lib, ov: normOverlay(await loadOverlay(ctx.env.DB)), nat: await loadNative(ctx.env.DB) };
}
const EXTS = ['mp3', 'm4a', 'aac', 'ogg', 'wav'];
async function studio(ctx, fn, a) {
  const { env } = ctx;
  if (!env.DB) throw new Error('Studio needs the Cloudflare database.');
  if (!isOwner(env, a[0])) throw new Error('This link is missing its owner key. Open the app from your owner link.');
  const { lib, ov, nat } = await ownerState(ctx);
  const own = await OW.loadOwned(env.DB), cat = !!own.domains.catalog;
  const all = OW.applyOwned(mergeNative(lib, nat, ov), own);
  const store = cat ? own : nat;   // where releases, songs and versions made or edited here live (owned data once the catalog is switched over)
  const isNat = (name, key, id) => store[name].some(r => r[key] === id);
  const saveNat = async () => { if (cat) await OW.saveOwned(env.DB, own); else await saveNative(env.DB, nat); mem.lib = null; await forgetCached(all); };
  const relOf = id => all.releases.find(r => r.release_id === id);
  if (fn === 'studioGet') {
    return { releases: all.releases, versions: all.versions.map(v => ({ version_id: v.version_id, track_id: v.track_id, label: v.label, is_primary: v.is_primary, hidden: v.hidden })),
             tracks: all.tracks.map(t => { const o = Object.assign({}, t); delete o.lyrics; delete o.track_cover_thumb; return o; }), overlay: ov };
  }
  if (fn === 'studioSaveRelease') {
    const rid = String(a[1] || ''), f = a[2] || {};
    const cur = relOf(rid); if (!cur) throw new Error('Release not found.');
    const basics = f.basics ? cleanBasics(f.basics) : null, world = f.world ? cleanWorld(f.world) : null;
    if (isNat('releases', 'release_id', rid)) {   // made in the new backend: it lives only here
      if (basics) patchRow(store, 'releases', 'release_id', rid, basics);
      if (world) patchRow(store, 'releases', 'release_id', rid, world);
      if (f.unreleased != null) ov.flags.releases[rid] = !!f.unreleased;
      await saveNat(); if (f.unreleased != null) await saveOverlay(env.DB, ov); mem.ov = ov;
      return true;
    }
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
    if (!all.tracks.some(t => t.track_id === tid)) throw new Error('Song not found.');
    const fields = cleanTrack(f.fields || {});
    const sr = f.sr != null ? cleanSr(f.sr) : null;
    if (sr != null) { if (sr) ov.sr[tid] = sr; else delete ov.sr[tid]; }
    if (f.unreleased != null) ov.flags.tracks[tid] = !!f.unreleased;
    if (isNat('tracks', 'track_id', tid)) {
      if (Object.keys(fields).length) patchRow(store, 'tracks', 'track_id', tid, fields);
      await saveNat(); if (sr != null || f.unreleased != null) await saveOverlay(env.DB, ov); mem.ov = ov;
      return true;
    }
    if (Object.keys(fields).length) { await callApps(env, 'saveTrackDetails', [env.OWNER_KEY, tid, fields]); patchRow(lib, 'tracks', 'track_id', tid, fields); }
    await keepLib(ctx, lib, (sr != null || f.unreleased != null) ? ov : null);
    return true;
  }
  if (fn === 'studioSaveLinks') {
    const rid = String(a[1] || '');
    if (!relOf(rid)) throw new Error('Release not found.');
    const c = cleanLinks(a[2] || {});
    if (c.links.length || c.first) ov.releases[rid] = c; else delete ov.releases[rid];
    await saveOverlay(env.DB, ov); mem.ov = ov; mem.at = Date.now(); await forgetCached(all);
    return true;
  }
  // ───── uploads: songs, releases, covers, photos (the files go to /upload; these save what they are) ─────
  if (fn === 'studioPlanUpload') {
    const o = a[1] || {}, rid = String(o.relId || ''), ext = String(o.ext || '').toLowerCase();
    if (!relOf(rid)) throw new Error('Release not found.');
    if (EXTS.indexOf(ext) < 0) throw new Error('Use an MP3, M4A, AAC, OGG or WAV file.');
    let name;
    if (o.trackId) {
      const t = all.tracks.find(x => x.track_id === o.trackId && x.release_id === rid); if (!t) throw new Error('Song not found in this release.');
      name = String(t.track_no).padStart(2, '0') + '-' + slug(t.title) + '-' + slug(o.label || 'version');
    } else {
      const no = Math.max(0, ...all.tracks.filter(t => t.release_id === rid).map(t => Number(t.track_no) || 0)) + 1;
      if (!String(o.title || '').trim()) throw new Error('Give the song a title.');
      name = String(no).padStart(2, '0') + '-' + slug(o.title);
    }
    return { key: relSlug(rid) + '/' + name + '-' + Array.from(crypto.getRandomValues(new Uint8Array(2))).map(b => b.toString(16).padStart(2, '0')).join('') + '.' + ext };
  }
  if (fn === 'studioAddSong') {
    const o = a[1] || {}, rid = String(o.relId || ''), key = String(o.key || '');
    const cur = relOf(rid); if (!cur) throw new Error('Release not found.');
    if (!env.MEDIA) throw new Error('Uploads are not set up yet.');
    if (key.indexOf(relSlug(rid) + '/') !== 0 || /\.\./.test(key)) throw new Error('That file does not belong to this release.');
    const head = await env.MEDIA.head(key); if (!head) throw new Error('The upload did not arrive. Try again.');
    const ext = key.split('.').pop();
    let track = null, trackId = String(o.trackId || '');
    if (trackId) { if (!all.tracks.some(t => t.track_id === trackId && t.release_id === rid)) throw new Error('Song not found in this release.'); }
    else {
      const no = Math.max(0, ...all.tracks.filter(t => t.release_id === rid).map(t => Number(t.track_no) || 0)) + 1;
      track = newTrack(rid, no, String(o.title || '').trim().slice(0, 200)); trackId = track.track_id; store.tracks.push(track);
    }
    const primary = !!track || !!o.primary;
    const v = newVersion(trackId, String(o.label || 'Original').trim().slice(0, 60) || 'Original', primary, key, ext, head.size, o.seconds);
    if (primary && !track) { store.versions.forEach(x => { if (x.track_id === trackId) x.is_primary = false; }); if (!cat) { ov.primary[trackId] = v.version_id; await saveOverlay(env.DB, ov); mem.ov = ov; } }
    store.versions.push(v); await saveNat();
    return { track, version: v };
  }
  if (fn === 'studioNewRelease') {
    const o = a[1] || {}, title = String(o.title || '').trim().slice(0, 120);
    if (!title) throw new Error('A release needs a title.');
    if (RELEASE_TYPES.indexOf(o.type) < 0) throw new Error('Pick a release type from the list.');
    const coverId = String(o.coverId || ''); if (coverId && !/^[A-Za-z0-9_-]{6,80}$/.test(coverId)) throw new Error('Bad cover.');
    if (coverId && env.MEDIA && !(await env.MEDIA.head('img/' + coverId + '/1200'))) throw new Error('The cover did not arrive. Try again.');
    const r = newRelease({ title, type: o.type, year: String(o.year || '').replace(/\D/g, '').slice(0, 4), release_date: /^\d{4}-\d{2}-\d{2}$/.test(o.release_date || '') ? o.release_date : '', artist_name: String(o.artist_name || '').trim().slice(0, 80), coverId });
    store.releases.push(r); await saveNat();
    return r;
  }
  if (fn === 'studioSetCover') {
    const o = a[1] || {}, rid = String(o.relId || ''), coverId = String(o.coverId || '');
    if (!relOf(rid)) throw new Error('Release not found.');
    if (!/^[A-Za-z0-9_-]{6,80}$/.test(coverId)) throw new Error('Bad cover.');
    const kind = String(o.kind || 'cover');
    if (['cover', 'bg', 'clean', 'song'].indexOf(kind) < 0) throw new Error('Unknown picture type.');
    if (env.MEDIA && !(await env.MEDIA.head('img/' + coverId + '/' + (kind === 'bg' ? '1600' : '1200')))) throw new Error('The picture did not arrive. Try again.');
    if (kind !== 'cover') {   // page background, clean cover, song cover: stored on the row, so they need the catalog to be on Cloudflare
      if (!cat) throw new Error('Switch the catalog to Cloudflare first (Settings, then Move off the Sheet).');
      if (kind === 'song') { const tid = String(o.trackId || ''); if (!all.tracks.some(t => t.track_id === tid && t.release_id === rid)) throw new Error('Song not found in this release.'); patchRow(store, 'tracks', 'track_id', tid, { track_cover: coverId }); }
      else patchRow(store, 'releases', 'release_id', rid, kind === 'bg' ? { bg_file_id: coverId } : { clean_cover_file_id: coverId, clean_cover_thumb: '' });
      await saveNat(); return true;
    }
    if (isNat('releases', 'release_id', rid)) { patchRow(store, 'releases', 'release_id', rid, { cover_file_id: coverId }); await saveNat(); }
    else { ov.cover[rid] = coverId; await saveOverlay(env.DB, ov); mem.ov = ov; mem.lib = null; await forgetCached(all); }
    return true;
  }
  if (fn === 'studioAddPhoto') {
    const o = a[1] || {}, rid = String(o.relId || ''), fileId = String(o.fileId || '');
    if (!relOf(rid)) throw new Error('Release not found.');
    if (!/^[A-Za-z0-9_-]{6,80}$/.test(fileId)) throw new Error('Bad photo.');
    if (env.MEDIA && !(await env.MEDIA.head('img/' + fileId + '/1600'))) throw new Error('The photo did not arrive. Try again.');
    const x = { extra_id: 'ext_' + Array.from(crypto.getRandomValues(new Uint8Array(6))).map(b => b.toString(16).padStart(2, '0')).join(''), release_id: rid, kind: 'photo', url: '', title: String(o.caption || '').trim().slice(0, 200), description: '', image: '', site: '', file_id: fileId, created: new Date().toISOString(), native: true };
    if (own.domains.extras) { own.extras.push(x); await OW.saveOwned(env.DB, own); mem.lib = null; await forgetCached(all); } else { nat.extras.push(x); await saveNative(env.DB, nat); mem.lib = null; await forgetCached(all); }
    return x;
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

// ───────── Areas that Cloudflare owns instead of the Sheet (playlists, extras, letter/bio/links) ─────────
async function adoptDomain(ctx, a, on) {
  const { env } = ctx, name = String(a[1] || '');
  if (!env.DB) throw new Error('This needs the Cloudflare database.');
  if (!isOwner(env, a[0])) throw new Error('This link is missing its owner key. Open the app from your owner link.');
  if (OW.DOMAINS.indexOf(name) < 0) throw new Error('Unknown area.');
  const ow = await OW.loadOwned(env.DB);
  if (!on) { ow.domains[name] = false; await OW.saveOwned(env.DB, ow); mem.lib = null; const b = await loadLib(env.DB); if (b) await forgetCached(b); return { area: name, owned: false }; }   // back to the Sheet's copy
  if (ow.domains[name]) return { area: name, owned: true, already: true };
  await syncMirror(env, true);   // newest copy of the Sheet first, so nothing typed there a minute ago is lost
  const base = await loadLib(env.DB), ov = normOverlay(await loadOverlay(env.DB)), all = mergeNative(base, await loadNative(env.DB), ov);
  let count = 0;
  if (name === 'playlists') { ow.playlists = all.playlists || []; count = ow.playlists.length; }
  if (name === 'extras') { ow.extras = all.extras || []; count = ow.extras.length; }
  if (name === 'settings') { ow.letter = all.letter || null; ow.bio = all.artist_bio || ''; ow.artist_links = all.artist_links || {}; count = Object.keys(ow.artist_links).length + (ow.letter ? 1 : 0) + (ow.bio ? 1 : 0); }
  if (name === 'activity') { count = await AC.importShares(env.DB, all.shares || []); }   // share links, plays, comments and error reports move to real D1 tables
  if (name === 'catalog') {
    const cl = x => JSON.parse(JSON.stringify(x));
    ow.releases = all.releases.map(cl); ow.tracks = all.tracks.map(cl); ow.versions = all.versions.map(cl);
    ow.releases.forEach(r => { if (r.release_id in ov.flags.releases) r.unreleased = !!ov.flags.releases[r.release_id]; });   // Studio's unreleased flags become part of the rows
    ow.tracks.forEach(t => { if (t.track_id in ov.flags.tracks) t.unreleased = !!ov.flags.tracks[t.track_id]; });
    ow.birth_date = String((base && base.birth_date) || ''); count = ow.tracks.length;
  }
  ow.domains[name] = true; await OW.saveOwned(env.DB, ow); mem.lib = null; await forgetCached(all);
  return { area: name, owned: true, copied: count };
}
// Share links, plays, comments and error reports once "activity" is switched over. Returns undefined while they are still the Sheet's.
const SITE = String(cfg.siteUrl || 'https://' + cfg.domain).replace(/\/$/, '');
async function activityCall(ctx, fn, a) {
  const { env } = ctx, db = env.DB;
  const ow = await OW.loadOwned(db); if (!ow.domains.activity) return undefined;
  await AC.ensureTables(db);
  const lib = await library(ctx), owner = isOwner(env, a[0]);
  const need = () => { if (!owner) throw new Error('This link is missing its owner key. Open the app from your owner link.'); };
  const changed = async () => { mem.lib = null; await forgetCached(lib); };
  switch (fn) {
    case 'createShare': need(); { const r = await AC.createShare(db, a[1], SITE); await changed(); return r; }
    case 'setShareActive': need(); { const r = await AC.setShareActive(db, a[1], a[2]); await changed(); return r; }
    case 'quickShare': need(); { const r = await AC.quickShare(db, { targetType: a[1], targetId: a[2] }, SITE); await changed(); return r; }
    case 'recordPlay': return AC.recordPlay(db, lib, a[0]);
    case 'logListens': return AC.logListens(db, lib, owner, a[1], a[2], a[3]);
    case 'getInsights': need(); return AC.getInsights(db, lib, a[1], a[2]);
    case 'getComments': return AC.getComments(db, lib, owner, a[1], a[2]);
    case 'addComment': return AC.addComment(db, lib, owner, ow.ownerName, a[1], a[2], a[3], a[4], a[5]);   // (no e-mail alert yet)
    case 'resolveComment': need(); return AC.resolveComment(db, a[1], a[2]);
    case 'deleteComment': need(); return AC.deleteComment(db, a[1]);
    case 'logClientError': return AC.logClientError(db, a[0], a[1]);
    case 'errorSummary': need(); return AC.errorSummary(db);
  }
  return undefined;
}
// Returns undefined when this call is not ours to answer (the area is still the Sheet's), so it goes on to Apps Script.
async function ownedCall(ctx, fn, a) {
  const { env } = ctx, dom = OW.OWNED_FNS[fn];
  if (!env.DB) return undefined;
  const ow = await OW.loadOwned(env.DB);
  for (const d in OW.BLOCKED_AFTER) if (ow.domains[d] && OW.BLOCKED_AFTER[d].indexOf(fn) > -1) throw new Error("This isn't available yet in the new version of Soul Vault. Use Studio for photos, covers and songs.");
  if (!dom || !ow.domains[dom]) return undefined;
  const lib = await library(ctx), now = new Date().toISOString();
  const guard = () => { if (!isOwner(env, a[0])) throw new Error('This link is missing its owner key. Open the app from your owner link.'); };
  const save = async () => { await OW.saveOwned(env.DB, ow); mem.lib = null; await forgetCached(lib); };
  if (fn === 'getPlaylists') {
    if (isOwner(env, a[0])) return OW.playlistsAnswer(lib, ow, null);
    const sh = findShare(lib, String(a[1] || ''), new Date()); if (!sh) return { error: 'This link has expired or been turned off.' };
    return OW.playlistsAnswer(lib, ow, shareScope(sh, lib, new Date()));
  }
  guard();
  let out;
  if (fn === 'savePlaylist') out = OW.savePlaylist(a[1], ow, lib, now);
  else if (fn === 'deletePlaylist') out = OW.deletePlaylist(String(a[1] || ''), ow);
  else if (fn === 'addExtra') out = await OW.addExtra(String(a[1] || ''), a[2], ow, lib, now);
  else if (fn === 'updateExtra') out = OW.updateExtra(String(a[1] || ''), a[2], ow);
  else if (fn === 'deleteExtra') out = OW.deleteExtra(String(a[1] || ''), ow);
  else if (fn === 'saveLetter') out = OW.saveLetter(a[1], a[2], ow, now);
  else if (fn === 'saveBio') out = OW.saveBio(a[1], ow);
  else if (fn === 'saveArtistLinks') out = OW.saveArtistLinks(a[1], ow);
  else if (fn === 'saveTracklist') out = CT.saveTracklist(ow, a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8]);
  else if (fn === 'saveTrackDetails') out = CT.saveTrackDetails(ow, a[1], a[2]);
  else if (fn === 'saveWorld') {
    const f = a[2] || {};
    if (f.birth_date != null) { const b = String(f.birth_date).trim(); if (b && !/^\d{4}-\d{2}-\d{2}$/.test(b)) throw new Error('Birthday should be a real date.'); ow.birth_date = b; }
    out = CT.saveWorld(ow, a[1], f, ow.birth_date, ow.domains.playlists ? ow.playlists : lib.playlists);
  }
  else if (fn === 'saveLyrics') out = CT.saveLyrics(ow, a[1], a[2]);
  else if (fn === 'saveUnlock') out = CT.saveUnlock(ow, a[1], a[2]);
  else if (fn === 'saveVideosMeta') out = CT.saveVideosMeta(ow, a[1], a[2]);
  else if (fn === 'updateVersion') out = CT.updateVersion(ow, a[1], a[2]);
  else if (fn === 'setDuration') out = CT.setDuration(ow, a[1], a[2]);
  else if (fn === 'deleteTrack') out = CT.deleteTrack(ow, a[1]);
  else if (fn === 'deleteVersion') out = CT.deleteVersion(ow, a[1]);
  else if (fn === 'deleteRelease') out = CT.deleteRelease(ow, a[1], a[2]);
  await save();
  return out === undefined ? null : out;
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
    } else if (fn === 'adoptDomain' || fn === 'releaseDomain') {
      try { return json({ ok: true, result: await adoptDomain(ctx, args, fn === 'adoptDomain') }); }
      catch (e) { return json({ ok: false, error: String((e && e.message) || e) }); }
    } else if (env.DB && AC.ACTIVITY_FNS.indexOf(fn) > -1) {
      try { const r = await activityCall(ctx, fn, args); if (r !== undefined) return json({ ok: true, result: r }); }
      catch (e) { return json({ ok: false, error: String((e && e.message) || e) }); }
    } else if (env.DB && fn === 'joinSubmit') {
      try {
        const r = await FN.joinSubmit(env.DB, args[0], request.headers.get('cf-connecting-ip'));
        // The old Google list still sends the newsletter, so a new sign-up is also passed to it (best effort, never blocks the fan).
        if (r.added && ctx.waitUntil) ctx.waitUntil(proxy(env, JSON.stringify({ action: 'submit', data: args[0] }), env.SIGNUP_API || SIGNUP_API).catch(() => null));
        return json({ ok: true, result: r });
      } catch (e) { return json({ ok: false, error: String((e && e.message) || e) }); }
    } else if (env.DB && fn === 'getFans') {
      if (!env.OWNER_KEY || String(args[0] || '') !== env.OWNER_KEY) return json({ ok: false, error: 'Not allowed.' });
      return json({ ok: true, result: await FN.getFans(env.DB) });
    } else if (env.DB && (OW.OWNED_FNS[fn] || Object.values(OW.BLOCKED_AFTER).some(l => l.indexOf(fn) > -1))) {
      try { const r = await ownedCall(ctx, fn, args); if (r !== undefined) return json({ ok: true, result: r }); }
      catch (e) { return json({ ok: false, error: String((e && e.message) || e) }); }
    } else if (fn === 'setOwnerPassword' || fn === 'ownerLogin') {
      try { return json({ ok: true, result: fn === 'ownerLogin' ? await ownerLogin(ctx, args) : await setOwnerPassword(ctx, args) }); }
      catch (e) { return json({ ok: false, error: String((e && e.message) || e) }); }
    } else if (fn === 'getLibrary' && env.DB && args[0]) {
      const res = await proxy(env, text), j = await res.clone().json().catch(() => null);
      if (j && j.ok && j.result) { const ov = normOverlay(await loadOverlay(env.DB)); const own = await OW.loadOwned(env.DB); j.result = OW.applyOwned(mergeNative(j.result, await loadNative(env.DB), ov), own);
        if (own.domains.activity) { const sh = await AC.loadShares(env.DB); if (sh) j.result.shares = sh; j.result.commentCounts = await AC.commentCounts(env.DB); }
        return json(j); }
      return res;
    } else if (fn === 'getOverlay' && env.DB) {
      return json({ ok: true, result: normOverlay(await loadOverlay(env.DB)) });
    } else if (/^studio(Get|SaveRelease|SaveTrack|SaveLinks|PlanUpload|AddSong|NewRelease|SetCover|AddPhoto)$/.test(fn)) {
      try { return json({ ok: true, result: await studio(ctx, fn, args) }); }
      catch (e) { return json({ ok: false, error: String((e && e.message) || e) }); }
    } else if (fn === 'edgeStatus') {
      const m = env.DB ? await readMeta(env.DB) : null, own = env.DB ? await OW.loadOwned(env.DB) : null;
      return json({ ok: true, result: { db: !!env.DB, owner_key: !!env.OWNER_KEY, owned_areas: own ? own.domains : {}, synced_at: m ? m.synced_at : null, age_s: m ? Math.round((Date.now() - m.synced_at) / 1000) : null, counts: m ? m.counts : null } });
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
