// Test setup for the Cloudflare backend (functions/). Nothing here touches the network or the real database:
//  - the D1 database is a real SQLite (node:sqlite), which is what D1 is underneath
//  - R2 buckets, the edge cache (caches.default) and Apps Script are small fakes
import { build } from 'esbuild';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
let bundlePath = null, n = 0;

/** A fresh copy of the backend modules (so the in-memory caches inside api.js start empty for every test). */
export async function freshBackend() {
  if (!bundlePath) {
    const dir = mkdtempSync(join(tmpdir(), 'sv-backend-'));
    bundlePath = join(dir, 'backend.mjs');
    await build({ entryPoints: [join(HERE, 'entry.mjs')], bundle: true, format: 'esm', platform: 'neutral', outfile: bundlePath, logLevel: 'silent', mainFields: ['module', 'main'] });
  }
  return import(pathToFileURL(bundlePath).href + '?n=' + (++n));
}

export function makeD1() {
  let chain = Promise.resolve();
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, params = []) => ({
    bind: (...p) => stmt(sql, p),
    async first() { return db.prepare(sql).get(...params) ?? null; },
    async all() { return { results: db.prepare(sql).all(...params).map(r => ({ ...r })) }; },
    async run() { const r = db.prepare(sql).run(...params); return { success: true, meta: { changes: Number(r.changes) } }; },
  });
  return {
    prepare: sql => stmt(sql),
    batch(list) {   // one at a time, like D1: two batches started together must not interleave
      const go = async () => {
        db.exec('BEGIN');
        try { const out = []; for (const s of list) out.push(await s.run()); db.exec('COMMIT'); return out; }
        catch (e) { db.exec('ROLLBACK'); throw e; }
      };
      const r = chain.then(go, go); chain = r.catch(() => {}); return r;
    },
    _raw: db,
  };
}

export function makeBucket() {
  const m = new Map();
  return {
    _m: m,
    async put(key, body, opts) {
      const buf = typeof body === 'string' ? Buffer.from(body) : body instanceof Uint8Array ? Buffer.from(body) : Buffer.from(await new Response(body).arrayBuffer());
      m.set(key, { buf, opts: opts || {} });
    },
    async head(key) { const o = m.get(key); return o ? { size: o.buf.length, httpMetadata: o.opts.httpMetadata } : null; },
    async delete(key) { m.delete(key); },
    async list({ prefix = '' } = {}) { return { objects: [...m.keys()].filter(k => k.startsWith(prefix)).map(k => ({ key: k, size: m.get(k).buf.length, uploaded: new Date() })) }; },
  };
}

function fakeEdgeCache() {
  const m = new Map();
  return {
    async match(req) { const r = m.get(req.url); return r ? r.clone() : undefined; },
    async put(req, res) { m.set(req.url, res); },
    async delete(req) { return m.delete(req.url); },
  };
}

// ---------------------------------------------------------------- a small library, like Apps Script's getLibrary answer
export const FUTURE = '2099-01-01T00:00:00.000Z';
export function fixtureLib() {
  const rel = (id, extra = {}) => Object.assign({ release_id: id, title: id, year: '2024', type: 'Album', cover_file_id: 'cover_' + id + '_xx', cover_thumb: '', hidden: false, unreleased: false, unlock_at: '', album_credits: '', bg_file_id: '' }, extra);
  const trk = (id, relId, no, extra = {}) => Object.assign({ track_id: id, release_id: relId, track_no: no, title: 'Song ' + id, hidden: false, lyrics: 'la la ' + id, category: 'Main', unreleased: false }, extra);
  const ver = (id, trackId, extra = {}) => Object.assign({ version_id: id, track_id: trackId, label: 'Original', is_primary: true, hidden: false, audio: 'drive:' + id, url: '' }, extra);
  return {
    releases: [
      rel('rel_pub', { title: 'Open Album', release_date: '2024-05-01', album_credits: 'public credits' }),
      rel('rel_hid', { title: 'Hidden Album', hidden: true }),
      rel('rel_seal', { title: 'Sealed Album', unlock_at: FUTURE, album_credits: 'secret credits', bg_file_id: 'bgsecret123' }),
      rel('rel_single', { title: 'A Single', type: 'Single', release_date: '2024-09-01' }),
    ],
    tracks: [trk('trk_a1', 'rel_pub', 1), trk('trk_a2', 'rel_pub', 2, { hidden: true }), trk('trk_h1', 'rel_hid', 1), trk('trk_s1', 'rel_seal', 1), trk('trk_sg', 'rel_single', 1, { is_single: true })],
    versions: [ver('ver_a1', 'trk_a1'), ver('ver_a1b', 'trk_a1', { is_primary: false, hidden: true }), ver('ver_a2', 'trk_a2'), ver('ver_h1', 'trk_h1'), ver('ver_s1', 'trk_s1'), ver('ver_sg', 'trk_sg')],
    shares: [
      { token: 'PUB', target_type: 'all', target_id: 'all', active: true, allow_download: false },
      { token: 'REL', target_type: 'release', target_id: 'rel_pub', active: true },
      { token: 'TRK', target_type: 'track', target_id: 'trk_a1', active: true },
      { token: 'VER', target_type: 'version', target_id: 'ver_a1', active: true },
      { token: 'OFF', target_type: 'all', target_id: 'all', active: false },
      { token: 'EXP', target_type: 'all', target_id: 'all', active: true, expires: '2020-01-01T00:00:00Z' },
      { token: 'FAN', target_type: 'all', target_id: 'all', active: true, allow_download: true, fan_name: 'Jo', member_no: 1 },
    ],
    letter: { title: 'Hello', body: 'A note' }, newsletter: '', artist_bio: 'The bio', stream_key: 'streamKEY', artist_links: {},
    playlists: [{ playlist_id: 'pl_1', title: 'Shared', tracks: ['trk_a1', 'trk_a2', 'trk_h1'], fans: true }, { playlist_id: 'pl_2', title: 'Private', tracks: ['trk_a1'], fans: false }],
    extras: [{ extra_id: 'ext_1', release_id: 'rel_pub', kind: 'link', url: 'https://x.example' }, { extra_id: 'ext_2', release_id: 'rel_hid', kind: 'link', url: 'https://y.example' }],
    birth_date: '1990-05-05',
  };
}

// ---------------------------------------------------------------- the whole fake world for one test
export const SAMPLE_FEED = '<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Nicólas Soul</title>' +
  '<entry><id>yt:video:abc123XYZ_-</id><title>SHOW 19 &amp; more | #ROADTO100SHOWS</title><link rel="alternate" href="https://www.youtube.com/watch?v=abc123XYZ_-"/></entry>' +
  '<entry><id>yt:video:old</id><title>Older one</title><link rel="alternate" href="https://www.youtube.com/watch?v=old"/></entry></feed>';
export const OWNER_KEY = 'owner-key-0123456789';
export const APPS_URL = 'https://apps.test/exec';

export async function harness({ lib = fixtureLib(), seed = true, bucket = true, failApps = [] } = {}) {
  const t = await freshBackend();
  const db = makeD1(), media = bucket ? makeBucket() : null;
  const env = { DB: db, OWNER_KEY, APPS_URL, SIGNUP_API: 'https://signup.test/exec', RESEND_API_KEY: 're_test', NEWSLETTER_SECRET: 'news-secret-for-tests', NEWSLETTER_CRON_TOKEN: 'cron-token-for-tests', BANDSINTOWN_APP_ID: 'bit-test' };
  if (media) env.MEDIA = media;
  const log = [];                    // every call that would have gone to Apps Script (or anywhere else)
  const saved = { fetch: globalThis.fetch, caches: globalThis.caches };
  globalThis.caches = { default: fakeEdgeCache() };
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url instanceof Request ? url.url : url);
    let body = null; try { body = init.body ? JSON.parse(init.body) : null; } catch (e) { /* not json */ }
    log.push({ url: u, body });
    const reply = o => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u === APPS_URL) {
      if (body && body.fn === 'getLibrary') return reply({ ok: true, result: JSON.parse(JSON.stringify(lib)) });
      if (body && failApps.includes(body.fn)) return reply({ ok: false, error: 'Apps Script said no' });
      return reply({ ok: true, result: true });
    }
    if (u.startsWith('https://signup.test')) return reply({ ok: true });
    if (u.startsWith('https://api.resend.com/emails')) {                  // a fake Resend: h.mail = every message accepted; h.mailFail = addresses it refuses; h.mailDown = it is down
      const m = JSON.parse(init.body);
      if (h.mailDown || h.mailFail.includes(m.to[0])) return new Response('refused', { status: h.mailDown ? 500 : 422 });
      h.mail.push(m); return reply({ id: 'mail_' + h.mail.length });
    }
    if (u.startsWith('https://www.youtube.com/feeds/videos.xml')) return h.feed == null ? new Response('no', { status: 500 }) : new Response(h.feed, { status: 200 });
    if (u.startsWith('https://rest.bandsintown.com/')) return h.shows == null ? new Response('no', { status: 500 }) : reply(h.shows);
    if (u.startsWith('https://docs.google.com/spreadsheets/')) return h.tracker == null ? new Response('no', { status: 403 }) : new Response(h.tracker, { status: 200 });
    if (u.startsWith('https://www.googleapis.com/youtube/v3/')) {       // a small fake YouTube: h.youtube = { videos: { id: title }, playlists: { id: { title, videos: [{ id, title }] } }, error: { status, reason } }
      const q = new URL(u), path = q.pathname.split('/').pop(), yt = h.youtube;
      h.ytCalls.push({ path, params: Object.fromEntries(q.searchParams) });
      if (yt.error) return new Response(JSON.stringify({ error: { message: yt.error.message || 'no', errors: [{ reason: yt.error.reason }] } }), { status: yt.error.status || 403, headers: { 'content-type': 'application/json' } });
      const ids = (q.searchParams.get('id') || '').split(',').filter(Boolean);
      if (path === 'videos') return reply({ items: ids.filter(i => i in yt.videos).map(i => { const st = (yt.stats || {})[i]; return { id: i, snippet: { title: yt.videos[i], channelTitle: 'Soul', publishedAt: st && st.at }, statistics: st ? { viewCount: st.views == null ? undefined : String(st.views), likeCount: st.likes == null ? undefined : String(st.likes) } : undefined }; }) });
      if (path === 'playlists') return reply({ items: ids.filter(i => i in yt.playlists).map(i => ({ id: i, snippet: { title: yt.playlists[i].title, channelTitle: 'Soul' } })) });
      if (path === 'playlistItems') { const pl = yt.playlists[q.searchParams.get('playlistId')]; return pl ? reply({ items: pl.videos.map(v => ({ snippet: { title: v.title, resourceId: { videoId: v.id } } })) }) : new Response(JSON.stringify({ error: { errors: [{ reason: 'playlistNotFound' }] } }), { status: 404 }); }
    }
    if (u.startsWith('https://www.youtube.com/oembed')) { const id = new URL(new URL(u).searchParams.get('url')).searchParams.get('v'); return id in h.youtube.videos && !h.youtube.noOembed ? reply({ title: h.youtube.videos[id] }) : new Response('no', { status: 404 }); }
    if (u.startsWith('https://i.ytimg.com/vi/')) return h.ytImages[u.split('/').pop()] === false ? new Response('no', { status: 404 }) : new Response(new Uint8Array(6000), { status: 200, headers: { 'content-type': 'image/jpeg' } });
    return new Response('not found', { status: 404 });
  };
  if (seed) await t.mirror.saveLib(db, lib, { synced_at: Date.now() });
  const pending = [];
  const h = {
    t, db, env, media, log, lib, youtube: { videos: {}, playlists: {} }, ytCalls: [], ytImages: {},
    mail: [], mailFail: [], mailDown: false, feed: SAMPLE_FEED, shows: [], tracker: null,
    ctx(request) { return { request, env, waitUntil: p => { pending.push(Promise.resolve(p).catch(() => {})); } }; },
    async settle() { await Promise.all(pending.splice(0)); },
    /** POST /api { fn, args } -> the parsed JSON answer */
    async call(fn, args = [], { ip = '203.0.113.7', ua = '', cf = null } = {}) {
      const request = new Request('https://soulnicolas.com/api', { method: 'POST', body: JSON.stringify({ fn, args }), headers: { 'CF-Connecting-IP': ip, ...(ua ? { 'User-Agent': ua } : {}) } });
      if (cf) Object.defineProperty(request, 'cf', { value: cf });
      const res = await t.onRequestPost(h.ctx(request));
      await h.settle();
      return res.json();
    },
    /** the owner's call: the owner key goes first, like the app sends it */
    owner(fn, ...args) { return h.call(fn, [OWNER_KEY, ...args]); },
    /** PUT /upload?key=...  -> { status, body } */
    async put(key, { ownerKey = OWNER_KEY, type = 'image/webp', bytes = new Uint8Array([1, 2, 3, 4]), length } = {}) {
      const headers = new Headers({ 'content-type': type });
      if (ownerKey != null) headers.set('x-owner-key', ownerKey);
      headers.set('content-length', String(length ?? bytes.length));
      const request = { url: 'https://soulnicolas.com/upload?key=' + encodeURIComponent(key), headers, body: new Blob([bytes]).stream() };
      const res = await t.onRequestPut({ request, env });
      return { status: res.status, body: await res.json() };
    },
    async kv(k) { const r = await db.prepare('SELECT v FROM kv WHERE k = ?').bind(k).first(); return r ? JSON.parse(r.v) : null; },
    appsCalls() { return log.filter(x => x.url === APPS_URL && x.body && x.body.fn !== 'getLibrary').map(x => x.body); },
    done() { globalThis.fetch = saved.fetch; globalThis.caches = saved.caches; },
  };
  return h;
}

/** run a test body with a fresh world, always restoring the globals */
export async function withWorld(opts, fn) {
  if (typeof opts === 'function') { fn = opts; opts = {}; }
  const h = await harness(opts);
  try { return await fn(h); } finally { h.done(); }
}
