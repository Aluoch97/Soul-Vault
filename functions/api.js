// POST /api  { fn, args }  — same shape as the Apps Script web app, so the app needs no other change.
// Stage 1: `getShare` (the whole library, which was the slow call) is answered here from the D1 copy and cached at the edge for 60 s.
// Everything else is passed straight to Apps Script. If anything here fails, the call goes to Apps Script instead.
import cfg from '../site.config.json';
import { ERR_LINK, findShare, shareScope, shareBody, bodyTtl, shareBlock, overlayFor } from './_lib/share.js';
import { loadLib, saveLib, readMeta, loadOverlay, saveOverlay } from './_lib/mirror.js';
import { makeRecord, checkPassword, PW_MIN, MAX_TRIES, LOGIN_LOCK_MS, failKey } from './_lib/auth.js';
import { loadNative, saveNative, mergeNative, newRelease, newTrack, newVersion, newYoutubeVersion, newSoundcloudVersion, relSlug, slug, MEDIA_BASE, rid as rand } from './_lib/native.js';
import * as YT from './_lib/youtube.js';
import * as OW from './_lib/owned.js';
import * as CT from './_lib/catalog.js';
import * as AC from './_lib/activity.js';
import * as ST from './_lib/site.js';
import * as FN from './_lib/fans.js';
import * as MS from './_lib/missing.js';
import * as BK from './_lib/backup.js';
import { RELEASE_TYPES, cleanBasics, cleanWorld, cleanWorldPart, cleanTrack, cleanLinks, cleanSr, normOverlay, overlayIsEmpty, patchRow } from './_lib/studio.js';

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

// The Video tab's playlists (public; YouTube is the book of record). Each list answers alone: { key, name, id, videos } plus error when it could not be read.
const VIDEO_LISTS = [['originals', 'Originals', 'PLYYNnxWFsj19t22I4Qy6lke0ytPaFz3LK'], ['remixes', 'Remixes', 'PLYYNnxWFsj18iVfs3mLzki3VA2OesBnDV'], ['music', 'Music videos', 'PLYYNnxWFsj1_wIe3c0Lyj4EL9tMs9GQYU']];
async function videoLists(ctx) {
  const { env } = ctx, ck = new Request('https://edge.soulnicolas.invalid/videolists/1');
  try { const hit = await caches.default.match(ck); if (hit) return await hit.json(); } catch (e) { /* no cache here */ }
  let allOk = true;
  const lists = await Promise.all(VIDEO_LISTS.map(async ([key, name, id]) => {
    try {
      const r = await YT.source(env, 'https://www.youtube.com/playlist?list=' + id), videos = r.videos.map(v => ({ id: v.id, title: v.title }));
      try {   // upload date, views and likes (one call per 50 videos); if this part fails the list still works, only the sorting by them is missing
        for (let i = 0; i < videos.length; i += 50) {
          const d = await YT.api(env, 'videos', { part: 'snippet,statistics', id: videos.slice(i, i + 50).map(v => v.id).join(',') }), by = {};
          (d.items || []).forEach(it => { by[it.id] = it; });
          videos.slice(i, i + 50).forEach(v => { const it = by[v.id]; if (!it) return; v.at = String((it.snippet && it.snippet.publishedAt) || ''); const st = it.statistics || {}; v.views = st.viewCount != null ? Number(st.viewCount) : null; v.likes = st.likeCount != null ? Number(st.likeCount) : null; });
        }
      } catch (e) { /* no stats */ }
      return { key, name, id, videos };
    }
    catch (e) { allOk = false; return { key, name, id, videos: [], error: 'not-available' }; }
  }));
  const body = { lists };
  if (allOk) { try { ctx.waitUntil(caches.default.put(ck, new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=900' } }))); } catch (e) { /* fine */ } }
  return body;
}

// The first screen of Home: newest single and newest project (same rule as Vault.gs getHome), covers from our own storage.
// Returns null (so Apps Script answers) when a cover is not in R2 yet.
async function edgeHome(ctx, args) {
  const body = await edgeShare(ctx, args);
  if (!body) return null;
  if (body.error) return { error: body.error };
  if (!body.share || body.share.target_type !== 'all') return { picks: {} };
  const today = new Date().toISOString().slice(0, 10);
  const key = r => { const d = String(r.release_date || ''); return /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : String(r.year || 0) + '-00-00'; };
  const kind = r => ['Deluxe', 'B-Sides'].indexOf(r.type) > -1 || !r.type ? 'Album' : r.type;
  const list = (body.releases || []).filter(r => !r.locked && !r.hidden && !(r.unreleased === true || String(r.unreleased) === 'true') && key(r) <= today)
    .sort((a, b) => key(b).localeCompare(key(a)) || String(a.title).localeCompare(String(b.title)));
  const pick = async r => {
    if (!r) return null;
    if (!r.cover_file_id || !ctx.env.MEDIA) throw new Error('no cover');
    // covers copied from Drive have a 400 px size; covers uploaded in Studio only have 1200 (about 90 KB), which is fine too
    const size = (await ctx.env.MEDIA.head('img/' + r.cover_file_id + '/400')) ? '400' : (await ctx.env.MEDIA.head('img/' + r.cover_file_id + '/1200')) ? '1200' : '';
    if (!size) throw new Error('cover not in R2');
    return { release_id: r.release_id, title: r.title, cover_file_id: r.cover_file_id, src: MEDIA_BASE + 'img/' + r.cover_file_id + '/' + size, img: '', thumb: '' };
  };
  return { picks: { single: await pick(list.filter(r => kind(r) === 'Single')[0]), project: await pick(list.filter(r => kind(r) !== 'Single')[0]) } };
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
const NO_CATALOG = 'Switch the catalog to Cloudflare first (Settings, then Move off the Sheet).';
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
  // ───── missing files: the owner's to-do list of songs/versions that still need their audio uploaded ─────
  if (fn === 'missingList') return await MS.loadMissing(env.DB);
  if (fn === 'missingRemove') { const id = String(a[1] || ''); await MS.saveMissing(env.DB, (await MS.loadMissing(env.DB)).filter(x => x.id !== id)); return true; }
  if (fn === 'missingAdd') {   // put a version (or a whole song with no file) on the list
    const o = a[1] || {}, v = o.versionId ? all.versions.find(x => x.version_id === o.versionId) : null;
    const t = all.tracks.find(x => x.track_id === (v ? v.track_id : o.trackId)); if (!t) throw new Error('Song not found.');
    const r = relOf(t.release_id), list = await MS.loadMissing(env.DB), id = v ? v.version_id : t.track_id;
    if (list.some(x => x.id === id)) return true;
    list.push({ id, kind: v ? 'version' : 'song', relId: t.release_id, trackId: t.track_id, title: t.title, release: r ? r.title : '', label: v ? v.label : 'Original', no: Number(t.track_no) || 0,
      oldVersionIds: v ? [v.version_id] : all.versions.filter(x => x.track_id === t.track_id).map(x => x.version_id), unhide: !v && t.hidden === true });
    await MS.saveMissing(env.DB, list); return true;
  }
  if (fn === 'missingHide') {   // not needed after all (for example a duplicate master): hide the broken version for fans and take it off the list
    const id = String(a[1] || ''), list = await MS.loadMissing(env.DB), it = list.find(x => x.id === id); if (!it) throw new Error('That item is not on the list any more.');
    if (it.kind !== 'version') throw new Error('Only a version can be hidden from here. A song stays hidden until its file is uploaded.');
    if (cat) { own.versions.forEach(v => { if (v.version_id === id) v.hidden = true; }); await saveNat(); }
    else { ov.vhide[id] = true; await saveOverlay(env.DB, ov); mem.ov = ov; mem.lib = null; mem.at = Date.now(); await forgetCached(all); }
    await MS.saveMissing(env.DB, list.filter(x => x.id !== id));
    return true;
  }
  if (fn === 'missingResolve') {
    // The file was uploaded with studioPlanUpload + studioAddSong (new version on the same song). This hides the broken old version, shows the song if it was hidden, and ticks the item off.
    const id = String(a[1] || ''), newId = String(a[2] || '');
    const list = await MS.loadMissing(env.DB), it = list.find(x => x.id === id); if (!it) throw new Error('That item is not on the list any more.');
    if (!all.versions.some(v => v.version_id === newId && v.track_id === it.trackId)) throw new Error('The new file was not found on that song. Try the upload again.');
    const old = (it.oldVersionIds || []).filter(x => x !== newId);
    if (cat) {
      own.versions.forEach(v => { if (old.indexOf(v.version_id) > -1) v.hidden = true; });
      if (it.unhide) own.tracks.forEach(t => { if (t.track_id === it.trackId) t.hidden = false; });
      await saveNat();
    } else {
      old.forEach(x => { ov.vhide[x] = true; }); if (it.unhide) ov.show[it.trackId] = true;
      await saveOverlay(env.DB, ov); mem.ov = ov; mem.lib = null; mem.at = Date.now(); await forgetCached(all);
    }
    await MS.saveMissing(env.DB, list.filter(x => x.id !== id));
    return true;
  }
  if (fn === 'missingLink') {
    // The file is already in the library (added with "New release", from a YouTube link or a file). Move that version onto the missing song, hide the broken old version(s),
    // show the song if it was hidden, drop the now-empty song it came from, and tick the item off. Nothing is deleted from storage.
    const id = String(a[1] || ''), srcId = String(a[2] || '');
    const list = await MS.loadMissing(env.DB), it = list.find(x => x.id === id); if (!it) throw new Error('That item is not on the list any more.');
    const sv = all.versions.find(v => v.version_id === srcId); if (!sv) throw new Error('That song was not found.');
    if (sv.track_id === it.trackId) throw new Error('That file is already on this song.');
    if (list.some(x => x.id === srcId) || (it.oldVersionIds || []).indexOf(srcId) > -1) throw new Error('That one is also missing its file, so it cannot replace this one.');
    if (sv.native !== true) throw new Error('Only songs you added with New release (from a YouTube link or a file) can be linked this way. Songs that came from the old Sheet are left alone so one wrong tap cannot move them.');
    if (!isNat('versions', 'version_id', srcId)) throw new Error(NO_CATALOG);
    if (!all.tracks.some(t => t.track_id === it.trackId)) throw new Error('The missing song is not in the library any more.');
    const fromTrack = all.tracks.find(t => t.track_id === sv.track_id), fromRel = fromTrack ? relOf(fromTrack.release_id) : null;
    const srcTrackId = sv.track_id;                                       // (patchRow below can change the shared row, so remember where it came from)
    const primary = it.kind === 'song';                                  // a song with no working file gets this as its main version; an alternate version stays an alternate
    patchRow(store, 'versions', 'version_id', srcId, { track_id: it.trackId, label: it.kind === 'version' ? it.label : 'Original', is_primary: primary, hidden: false });
    const old = (it.oldVersionIds || []).filter(x => x !== srcId);
    if (primary) store.versions.forEach(v => { if (v.track_id === it.trackId && v.version_id !== srcId) v.is_primary = false; });
    let removedTrackId = '';
    if (fromTrack && fromTrack.native === true && !store.versions.some(v => v.track_id === srcTrackId) && isNat('tracks', 'track_id', srcTrackId)) { store.tracks = store.tracks.filter(t => t.track_id !== srcTrackId); removedTrackId = srcTrackId; }
    if (cat) {
      own.versions.forEach(v => { if (old.indexOf(v.version_id) > -1) v.hidden = true; });
      if (it.unhide) own.tracks.forEach(t => { if (t.track_id === it.trackId) t.hidden = false; });
      await saveNat();
    } else {
      old.forEach(x => { ov.vhide[x] = true; }); if (it.unhide) ov.show[it.trackId] = true;
      await saveNat(); await saveOverlay(env.DB, ov); mem.ov = ov; mem.lib = null; mem.at = Date.now(); await forgetCached(all);
    }
    await MS.saveMissing(env.DB, list.filter(x => x.id !== id));
    const moved = store.versions.find(v => v.version_id === srcId);
    const emptyRelease = !!fromTrack && !all.tracks.some(t => t.release_id === fromTrack.release_id && t.track_id !== fromTrack.track_id);
    return { version: moved, removedTrackId, hiddenVersionIds: old, unhide: !!it.unhide, fromRelease: fromRel ? fromRel.title : '', fromReleaseId: fromTrack ? fromTrack.release_id : '', fromReleaseEmpty: emptyRelease };
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
  if (fn === 'studioSaveBulk') {
    // Change the same fields on several releases. Only the fields sent are touched, each release keeps all its other values,
    // and a release that cannot be saved does not stop the others.
    const ids = (Array.isArray(a[1]) ? a[1] : []).map(String).slice(0, 200), ch = a[2] || {};
    if (!ids.length) throw new Error('Pick at least one release.');
    const bIn = {}; if (ch.type != null) bIn.type = ch.type; if (ch.hidden != null) bIn.hidden = !!ch.hidden;
    const basics = cleanBasics(bIn), world = cleanWorldPart(ch);
    if (!Object.keys(basics).length && !Object.keys(world).length && ch.unreleased == null) throw new Error('Pick at least one thing to change.');
    const saved = [], failed = []; let touched = false, flagged = false;
    for (const id of ids) {
      const cur = relOf(id); if (!cur) { failed.push({ id, title: id, error: 'Release not found.' }); continue; }
      try {
        if (isNat('releases', 'release_id', id)) {
          patchRow(store, 'releases', 'release_id', id, Object.assign({}, basics, world)); touched = true;
        } else {   // a release that still comes from the Sheet: the same path as the single-release form
          const fullWorld = cleanWorld(Object.assign({ world_tagline: cur.world_tagline, world_story: cur.world_story, world_color: cur.world_color, world_mood: cur.world_mood, album_credits: cur.album_credits,
            recorded_at: cur.recorded_at, artist_name: cur.artist_name, series_name: cur.series_name, series_part: String(cur.series_part || '').replace(/^'/, '') }, world));
          if (Object.keys(basics).length) { await callApps(env, 'saveTracklist', [env.OWNER_KEY, id, cur.title, [], basics.hidden != null ? basics.hidden : cur.hidden === true, basics.type || cur.type]); patchRow(lib, 'releases', 'release_id', id, basics); }
          if (Object.keys(world).length) { await callApps(env, 'saveWorld', [env.OWNER_KEY, id, Object.assign(fullWorld, world.genre != null ? { genre: world.genre } : {})]); patchRow(lib, 'releases', 'release_id', id, world); }
        }
        if (ch.unreleased != null) { ov.flags.releases[id] = !!ch.unreleased; flagged = true; }
        saved.push(id);
      } catch (e) { failed.push({ id, title: cur.title, error: String((e && e.message) || e) }); }
    }
    if (touched) await saveNat();
    if (flagged) { await saveOverlay(env.DB, ov); mem.ov = ov; mem.lib = null; mem.at = Date.now(); await forgetCached(all); }
    else if (!touched && saved.length) { await keepLib(ctx, lib, null); }
    return { saved, failed, applied: Object.assign({}, basics, world, ch.unreleased != null ? { unreleased: !!ch.unreleased } : {}) };
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
    if (o.kind === 'voice') {   // a voice memo about a song: it lives next to the release's songs, named voice-NN-<song>, and is attached with studioSetVoice
      if (!cat) throw new Error(NO_CATALOG);
      const t = all.tracks.find(x => x.track_id === o.trackId && x.release_id === rid); if (!t) throw new Error('Song not found in this release.');
      name = 'voice-' + String(t.track_no).padStart(2, '0') + '-' + slug(t.title);
    } else if (o.trackId) {
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
    const animated = o.animated === true;   // a GIF cover: the GIF itself is img/<id>/1200 and /1600, the grid uses the still sizes
    if (animated && kind !== 'cover') throw new Error('Only the main cover can be animated.');
    if (animated && !cat) throw new Error(NO_CATALOG);
    if (o.preflight === true) return true;   // "would this work?": lets the app check before it uploads anything
    const head = env.MEDIA ? await env.MEDIA.head('img/' + coverId + '/' + (kind === 'bg' ? '1600' : '1200')) : null;
    if (env.MEDIA && !head) throw new Error('The picture did not arrive. Try again.');
    if (animated && head && !/^image\/gif$/i.test((head.httpMetadata && head.httpMetadata.contentType) || '')) throw new Error('Animated covers need to be GIF files.');
    if (kind !== 'cover') {   // page background, clean cover, song cover: stored on the row, so they need the catalog to be on Cloudflare
      if (!cat) throw new Error(NO_CATALOG);
      if (kind === 'song') { const tid = String(o.trackId || ''); if (!all.tracks.some(t => t.track_id === tid && t.release_id === rid)) throw new Error('Song not found in this release.'); patchRow(store, 'tracks', 'track_id', tid, { track_cover: coverId }); }
      else patchRow(store, 'releases', 'release_id', rid, kind === 'bg' ? { bg_file_id: coverId } : { clean_cover_file_id: coverId, clean_cover_thumb: '' });
      await saveNat(); return true;
    }
    if (isNat('releases', 'release_id', rid)) {
      // an animated cover keeps a small inline still (a JPEG data address, under 45 KB) that shows at once while the GIF loads; any other cover clears the type and the still
      const thumb = animated && /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(String(o.thumb || '')) && String(o.thumb).length < 45000 ? String(o.thumb) : '';
      patchRow(store, 'releases', 'release_id', rid, { cover_file_id: coverId, cover_type: animated ? 'gif' : '', cover_thumb: thumb }); await saveNat();
      return animated ? { fileId: coverId, thumb } : true;
    }
    else { ov.cover[rid] = coverId; await saveOverlay(env.DB, ov); mem.ov = ov; mem.lib = null; await forgetCached(all); }
    return true;
  }
  // ───── YouTube: songs, whole releases and playlist videos from a link, and keeping their titles fresh (the key is the Cloudflare secret YOUTUBE_API_KEY) ─────
  const extrasStore = own.domains.extras ? own.extras : nat.extras;   // where videos added to release pages live
  // songs live in the owned data once the catalog is switched over (else in the native data), videos on release pages in the owned data once the extras are: save whichever hold something
  const saveAll = async () => { if (cat || own.domains.extras) await OW.saveOwned(env.DB, own); if (!cat || !own.domains.extras) await saveNative(env.DB, nat); mem.lib = null; await forgetCached(all); };
  const today10 = () => new Date().toISOString().slice(0, 10);
  if (fn === 'checkYoutube') return YT.check(env);
  if (fn === 'youtubeTitleStatus') return YT.status(YT.titleRows(store.tracks, extrasStore));
  if (fn === 'refreshYoutubeTitles') {
    const out = await YT.refresh(env, YT.titleRows(store.tracks, extrasStore), a[1] === true);
    if (out.checked) { await saveAll(); }
    return out;
  }
  if (fn === 'addYoutubeSong') {
    const o = a[1] || {}, url = String(o.url || '').trim(), vid = YT.ytId(url), relId = String(o.releaseId || '');
    if (!vid) throw new Error("That doesn't look like a YouTube video link.");
    if (!relOf(relId)) throw new Error('Release not found.');
    if (all.tracks.some(t => t.release_id === relId && YT.ytId(t.video_url) === vid && all.versions.some(v => v.track_id === t.track_id && v.format === 'YOUTUBE'))) throw new Error('That video is already a song in this release.');
    let title = String(o.title || '').trim().slice(0, 200), fromApi = false;
    if (!title && env.YOUTUBE_API_KEY) { try { title = String((((await YT.api(env, 'videos', { part: 'snippet', id: vid })).items || [])[0] || { snippet: {} }).snippet.title || '').trim().slice(0, 200); fromApi = !!title; } catch (e) { /* the title is a nicety: fall back below */ } }
    if (!title) title = (await YT.oembedTitle(vid)).slice(0, 200);   // no key needed (and not marked as refreshable, because only the key can refresh it)
    if (!title) title = 'YouTube song';
    const no = Math.max(0, ...all.tracks.filter(t => t.release_id === relId).map(t => Number(t.track_no) || 0)) + 1;
    const track = Object.assign(newTrack(relId, no, title), { video_url: 'https://youtu.be/' + vid }); if (fromApi) track.title_src = YT.srcTag();
    const version = newYoutubeVersion(track.track_id, vid, url);
    store.tracks.push(track); store.versions.push(version); await saveNat();
    return { track, version };
  }
  if (fn === 'addSoundcloudSong') {   // a song that plays through SoundCloud's own player (no audio file, no key needed)
    const o = a[1] || {}, relId = String(o.releaseId || ''), url = YT.scUrl(o.url);
    if (!url) throw new Error("Paste the link to ONE song from SoundCloud: open the song, tap Share, then Copy link (it looks like soundcloud.com/artist/song).");
    if (!relOf(relId)) throw new Error('Release not found.');
    if (all.tracks.some(t => t.release_id === relId && String(t.sc_url || '').toLowerCase() === url.toLowerCase())) throw new Error('That SoundCloud song is already in this release.');
    const info = await YT.scInfo(url);
    if (!info) throw new Error("SoundCloud couldn't find that song. If it's private, use its secret share link; otherwise check the link.");
    const title = (String(o.title || '').trim() || info.title || 'SoundCloud song').slice(0, 200);
    const no = Math.max(0, ...all.tracks.filter(t => t.release_id === relId).map(t => Number(t.track_no) || 0)) + 1;
    const track = Object.assign(newTrack(relId, no, title), { sc_url: url });
    const rel = relOf(relId); const plain = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();   // (SoundCloud names often drop accents)
    if (info.artist && plain(rel.artist_name || 'Nicólas Soul') !== plain(info.artist)) track.artist = info.artist.slice(0, 120);
    const version = newSoundcloudVersion(track.track_id, url);
    store.tracks.push(track); store.versions.push(version); await saveNat();
    return { track, version };
  }
  if (fn === 'createReleaseFromYoutube') {
    const o = a[1] || {}, src = await YT.source(env, o.url);
    const title = String(o.title || src.title || '').trim().slice(0, 120) || 'From YouTube';
    const type = RELEASE_TYPES.indexOf(o.type) > -1 ? o.type : (src.kind === 'video' ? 'Single' : 'Album');
    const year = Math.round(Number(o.year)) || new Date().getFullYear();
    let coverId = '';
    if (env.MEDIA && src.videos[0]) {   // the first video's picture becomes the cover (kept at every size the app asks for; YouTube's own picture, as it is)
      for (const u of ['https://i.ytimg.com/vi/' + src.videos[0].id + '/maxresdefault.jpg', 'https://i.ytimg.com/vi/' + src.videos[0].id + '/hqdefault.jpg']) {
        try {
          const res = await fetch(u); if (!res.ok) continue;
          const buf = await res.arrayBuffer(); if (buf.byteLength < 4000) continue;
          const id = 'c' + rand() + rand().slice(0, 4);
          for (const size of ['t', '160', '400', '1200', '1600']) await env.MEDIA.put('img/' + id + '/' + size, buf, { httpMetadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000, immutable' } });
          coverId = id; break;
        } catch (e) { /* no cover this time: the release is still made */ }
      }
    }
    const release = newRelease({ title, type, year: String(year), coverId });
    const tracks = [], versions = [], tag = YT.srcTag();
    src.videos.slice(0, 100).forEach((v, i) => {
      const t = Object.assign(newTrack(release.release_id, i + 1, String(v.title || 'YouTube song').slice(0, 200)), { video_url: 'https://youtu.be/' + v.id, title_src: tag });
      tracks.push(t); versions.push(newYoutubeVersion(t.track_id, v.id, o.url));
    });
    store.releases.push(release); tracks.forEach(t => store.tracks.push(t)); versions.forEach(v => store.versions.push(v)); await saveNat();
    return { release, tracks, versions, playlist: src.title, total: src.videos.length, truncated: src.videos.length > 100 };   // hidden from fans until you show it
  }
  if (fn === 'addYoutubePlaylistVideos') {
    const relId = String(a[1] || ''); if (!relOf(relId)) throw new Error('Release not found.');
    const src = await YT.source(env, a[2]);
    const have = {}; all.extras.filter(x => x.release_id === relId && x.kind === 'video').forEach(x => { const id = YT.ytId(x.url); if (id) have[id] = 1; });
    const added = []; let skipped = 0;
    src.videos.slice(0, 100).forEach(v => {
      if (have[v.id]) { skipped++; return; }
      have[v.id] = 1;
      added.push({ extra_id: 'ext_' + rand(), release_id: relId, kind: 'video', url: 'https://youtu.be/' + v.id, title: String(v.title || 'Video').slice(0, 200), title_src: YT.srcTag(), description: '',
                   image: 'https://i.ytimg.com/vi/' + v.id + '/hqdefault.jpg', site: 'YouTube', file_id: '', created: new Date().toISOString() });
    });
    if (added.length) { added.forEach(x => extrasStore.push(x)); if (own.domains.extras) await OW.saveOwned(env.DB, own); else await saveNative(env.DB, nat); mem.lib = null; await forgetCached(all); }
    return { added, skipped, total: src.videos.length, playlist: src.title, truncated: src.videos.length > 100 };
  }
  if (fn === 'studioReplaceAudio') {
    // Swap the audio file of a version (a new upload from studioPlanUpload) and keep everything else about it: its name, order, comments, share links and plays.
    const o = a[1] || {}, vid = String(o.versionId || ''), key = String(o.key || '');
    const v = all.versions.find(x => x.version_id === vid); if (!v) throw new Error('That version was not found. It may have been deleted.');
    const t = all.tracks.find(x => x.track_id === v.track_id), rid = t ? t.release_id : '';
    if (!cat) throw new Error(NO_CATALOG);
    if (o.preflight === true) return true;   // "would this work?": lets the app check before it uploads anything
    if (!env.MEDIA) throw new Error('Uploads are not set up yet.');
    if (key.indexOf(relSlug(rid) + '/') !== 0 || key.indexOf(relSlug(rid) + '/voice-') === 0 || /\.\./.test(key)) throw new Error('That file does not belong to this release.');
    const head = await env.MEDIA.head(key); if (!head) throw new Error('The upload did not arrive. Try again.');
    const nv = newVersion(v.track_id, v.label, v.is_primary, key, key.split('.').pop(), head.size, o.seconds);
    patchRow(store, 'versions', 'version_id', vid, { audio: nv.audio, format: nv.format, duration: nv.duration, size_mb: nv.size_mb, url: nv.url, preview: '', specs: '' });
    await saveNat();
    return store.versions.find(x => x.version_id === vid);
  }
  if (fn === 'studioSetVoice') {
    // Attach an uploaded voice memo to a song (key from studioPlanUpload with kind 'voice'), or remove it (key ''). The file itself is never deleted: uploads are permanent.
    const o = a[1] || {}, rid = String(o.relId || ''), tid = String(o.trackId || ''), key = String(o.key || '');
    if (!relOf(rid)) throw new Error('Release not found.');
    if (!all.tracks.some(t => t.track_id === tid && t.release_id === rid)) throw new Error('Song not found in this release.');
    if (!cat) throw new Error(NO_CATALOG);
    if (key) {
      if (!env.MEDIA) throw new Error('Uploads are not set up yet.');
      if (key.indexOf(relSlug(rid) + '/voice-') !== 0 || /\.\./.test(key)) throw new Error('That file is not a voice note for this release.');
      if (!(await env.MEDIA.head(key))) throw new Error('The upload did not arrive. Try again.');
    }
    patchRow(store, 'tracks', 'track_id', tid, { voice_note_id: key ? 'r2:' + key : '' });
    await saveNat();
    return { voice_note_id: key ? 'r2:' + key : '' };
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

// The YouTube tools run on Cloudflare once the catalog or the extras are switched over (the old script's versions are refused after that);
// before that the old script keeps doing it, so nothing changes until then.
async function youtubeOnEdge(env) { const own = await OW.loadOwned(env.DB); return !!(own.domains.catalog || own.domains.extras); }

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
    case 'deleteShare': need(); { const r = await AC.deleteShare(db, a[1], cfg.publicToken); await changed(); return r; }
    case 'setShareActive': need(); { const r = await AC.setShareActive(db, a[1], a[2]); await changed(); return r; }
    case 'quickShare': need(); { const r = await AC.quickShare(db, { targetType: a[1], targetId: a[2] }, SITE); await changed(); return r; }
    case 'recordPlay': return AC.recordPlay(db, lib, a[0]);
    case 'logListens': return AC.logListens(db, lib, owner, a[1], a[2], a[3]);
    case 'getInsights': need(); return AC.getInsights(db, lib, a[1], a[2]);
    case 'listeningNow': return AC.listeningNow(db, lib, owner, a[1], a[2], a[3], a[4]);    // fans send a small "still listening" note while a song plays
    case 'getLive': need(); return AC.getLive(db, lib, a[1]);
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
  if (env.DB && env.BACKUPS && fn !== 'edgeStatus') ctx.waitUntil(BK.maybeBackup(env).catch(() => {}));   // a daily backup, started by normal visits
  try {
    if (/^backup(Status|Now|Get)$/.test(fn)) {
      if (!isOwner(env, args[0])) return json({ ok: false, error: 'Not allowed.' });
      if (!env.BACKUPS || !env.DB) return json({ ok: false, error: 'Backups are not set up yet.' });
      if (fn === 'backupNow') return json({ ok: true, result: await BK.runBackup(env) });
      if (fn === 'backupGet') return json({ ok: true, result: await BK.dumpAll(env.DB) });
      return json({ ok: true, result: { last: await BK.lastBackup(env.DB), files: await BK.listBackups(env) } });
    }
    if (fn === 'getShare' && env.DB) {
      const out = await edgeShare(ctx, args);
      if (out) return json({ ok: true, result: out });
    } else if (fn === 'getVideoLists') {   // the Video tab: two YouTube playlists, read with our key, kept 15 minutes at the edge
      return json({ ok: true, result: await videoLists(ctx) });
    } else if (fn === 'getHome' && env.DB) {
      const out = await edgeHome(ctx, args);
      if (out) return json({ ok: true, result: out });
    } else if (fn === 'adoptDomain' || fn === 'releaseDomain') {
      try { return json({ ok: true, result: await adoptDomain(ctx, args, fn === 'adoptDomain') }); }
      catch (e) { return json({ ok: false, error: String((e && e.message) || e) }); }
    } else if (env.DB && ST.SITE_FNS.indexOf(fn) > -1) {   // website insights: any visitor's browser sends page views; only the owner reads them
      try {
        const owner = isOwner(env, args[0]), lib = (await library(ctx)) || {};
        if (fn === 'siteView') return json({ ok: true, result: await ST.recordView(env.DB, lib, { owner, token: args[1], deviceId: args[2], visitId: args[3], viewId: args[4], path: args[5], seconds: args[6], device: args[7], ref: args[8], cf: request.cf || {}, ua: request.headers.get('user-agent') }) });
        if (!owner) return json({ ok: false, error: 'This link is missing its owner key. Open the app from your owner link.' });
        return json({ ok: true, result: fn === 'getSiteLive' ? await ST.getSiteLive(env.DB, lib, !!args[1]) : await ST.getSiteInsights(env.DB, lib, args[1], !!args[2]) });
      } catch (e) { return json({ ok: false, error: String((e && e.message) || e) }); }
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
    } else if (env.DB && /^(addYoutubeSong|createReleaseFromYoutube|addYoutubePlaylistVideos|refreshYoutubeTitles|youtubeTitleStatus|checkYoutube)$/.test(fn) && await youtubeOnEdge(env)) {
      try { return json({ ok: true, result: await studio(ctx, fn, args) }); }
      catch (e) { return json({ ok: false, error: String((e && e.message) || e) }); }
    } else if (/^(studio(Get|SaveRelease|SaveBulk|SaveTrack|SaveLinks|PlanUpload|AddSong|NewRelease|SetCover|SetVoice|ReplaceAudio|AddPhoto)|missing(List|Resolve|Link|Hide|Remove|Add)|addSoundcloudSong)$/.test(fn)) {
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
