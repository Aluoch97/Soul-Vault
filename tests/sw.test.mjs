// The service worker (saved copy of the app for fast opening and offline): what it keeps, what it never touches, and how it behaves offline.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/sw.template.js', import.meta.url), 'utf8').replace(/__VERSION__/g, 'T1').replace(/__APP__/g, '/app.js?v=T1');
const ORIGIN = 'https://soulnicolas.com';

function world({ online = true, files = {} } = {}) {
  const store = new Map(), handlers = {}, log = { fetched: [], skip: false, claimed: false };
  const mkCache = (name) => { if (!store.has(name)) store.set(name, new Map()); const m = store.get(name); const key = (r) => (typeof r === 'string' ? new URL(r, ORIGIN).href : r.url);
    return { put: async (r, res) => { m.set(key(r), res); }, match: async (r) => m.get(key(r)), keys: async () => [...m.keys()].map((u) => new Request(u)), delete: async (r) => m.delete(key(r)), add: async (r) => { const res = await ctx.fetch(r); if (!res.ok) throw new Error('bad'); m.set(key(r), res); } }; };
  const caches = { open: async (n) => mkCache(n), keys: async () => [...store.keys()], delete: async (n) => store.delete(n),
    match: async (r, o) => { const k = typeof r === 'string' ? new URL(r, ORIGIN).href : r.url; for (const [n, m] of store) { if (o && o.cacheName && o.cacheName !== n) continue; if (m.has(k)) return m.get(k); } return undefined; } };
  const state = { online, files };
  const ctx = vm.createContext({ self: { addEventListener: (t, f) => { handlers[t] = f; }, skipWaiting: () => { log.skip = true; }, clients: { claim: async () => { log.claimed = true; } }, location: { origin: ORIGIN } },
    location: { origin: ORIGIN }, caches, Request: class extends Request { constructor(i, o) { super(typeof i === 'string' ? new URL(i, ORIGIN).href : i, o); } }, Response, URL, Headers, Promise, setTimeout, clearTimeout, console,
    fetch: async (r) => { const url = typeof r === 'string' ? new URL(r, ORIGIN).href : r.url; log.fetched.push(url); if (!state.online) throw new TypeError('offline'); const f = state.files[new URL(url).pathname + new URL(url).search] || state.files[new URL(url).pathname]; return f ? new Response(f.body || 'x', { status: f.status || 200 }) : new Response('nope', { status: 404 }); } });
  vm.runInContext(SRC, ctx);
  const fire = async (type, ev) => { const waits = []; ev.waitUntil = (p) => waits.push(p); await handlers[type](ev); await Promise.all(waits); };
  const request = (url, o = {}) => { const r = new Request(url, { method: o.method || 'GET', headers: o.headers }); if (o.mode) Object.defineProperty(r, 'mode', { value: o.mode }); return r; };
  const go = async (url, o) => { let answer = null, handled = false; await handlers.fetch({ request: request(url, o), respondWith: (p) => { handled = true; answer = p; } }); return handled ? await answer : null; };
  return { ctx, state, store, log, fire, go, handlers };
}

test('kind: only the app pages, its saved files and cover pictures are handled; the API, uploads, songs, videos and other sites never are', () => {
  const { ctx } = world();
  const k = (url, o = {}) => ctx.kind(Object.assign(new Request(url, { method: o.method || 'GET', headers: o.headers }), o.mode ? {} : {}), ORIGIN);
  const kn = (url) => { const r = new Request(url); Object.defineProperty(r, 'mode', { value: 'navigate' }); return ctx.kind(r, ORIGIN); };
  for (const p of ['/', '/vault', '/vault/2025-rise-of-the-lost', '/video', '/video/music-videos', '/tour/road-to-100', '/press', '/lore', '/admin']) assert.equal(kn(ORIGIN + p), 'page', p);
  for (const p of ['/join', '/shows', '/privacy-policy', '/roadto100shows', '/privacy-policy.html', '/sitemap.xml', '/something-else']) assert.equal(kn(ORIGIN + p), 'bypass', p + ' is a separate page: always from the network');
  assert.equal(k(ORIGIN + '/app.js?v=T1'), 'shell'); assert.equal(k(ORIGIN + '/lame.js'), 'shell');
  for (const p of ['/fonts/a.woff2', '/icon-192.png', '/favicon-32.png', '/photos/x.jpg', '/press-img/y.jpg', '/home-covers/z.jpg', '/og-image.png', '/manifest.webmanifest']) assert.equal(k(ORIGIN + p), 'static', p);
  for (const p of ['/api', '/sw.js', '/upload?key=x', '/news', '/home-bg-hd.mp4', '/a/song.mp3', '/a/song.m4a', '/links.json']) assert.equal(k(ORIGIN + p), 'bypass', p);
  assert.equal(k(ORIGIN + '/api', { method: 'POST' }), 'bypass'); assert.equal(k(ORIGIN + '/photos/x.jpg', { headers: { range: 'bytes=0-9' } }), 'bypass', 'range requests are left alone');
  assert.equal(k('https://media.soulnicolas.com/img/abc/400'), 'image'); assert.equal(k('https://media.soulnicolas.com/rise/01-song.m4a'), 'bypass', 'songs are never kept');
  assert.equal(k('https://i.ytimg.com/vi/x/hqdefault.jpg'), 'bypass'); assert.equal(k('https://www.youtube.com/embed/x'), 'bypass');
});

test('install keeps the app files, tolerates one failing, and takes over; activate removes only older versions', async () => {
  const w = world({ files: { '/': { body: 'index' }, '/app.js': { body: 'js' }, '/manifest.webmanifest': { body: '{}' }, '/icon-192.png': { body: 'p' }, '/icon-512.png': { status: 404 } } });
  await w.fire('install', {}); assert.ok(w.log.skip, 'skipWaiting'); const names = [...w.store.keys()]; assert.deepEqual(names, ['sv-shell-T1']);
  assert.ok(w.log.fetched.includes(ORIGIN + '/app.js?v=T1') && w.log.fetched.includes(ORIGIN + '/'), 'the page and this version of the app are saved'); assert.ok(!w.store.get('sv-shell-T1').has(ORIGIN + '/icon-512.png'), 'a missing file does not stop the rest');
  await w.ctx.caches.open('sv-shell-OLD'); await w.ctx.caches.open('sv-img-v1'); await w.ctx.caches.open('someone-elses');
  await w.fire('activate', {}); assert.deepEqual([...w.store.keys()].sort(), ['someone-elses', 'sv-img-v1', 'sv-shell-T1'], 'older versions removed, covers and other caches kept'); assert.ok(w.log.claimed);
});

test('pages: the network first (so a new version shows at once), the saved copy when offline; separate pages never replace it', async () => {
  const w = world({ files: { '/': { body: 'INDEX-v1' }, '/vault': { body: 'INDEX-v1' }, '/privacy-policy': { body: 'PRIVACY' } } });
  let r = await w.go(ORIGIN + '/vault', { mode: 'navigate' }); assert.equal(await r.text(), 'INDEX-v1');
  w.state.files['/'] = { body: 'INDEX-v2' }; w.state.files['/vault'] = { body: 'INDEX-v2' };
  r = await w.go(ORIGIN + '/vault', { mode: 'navigate' }); assert.equal(await r.text(), 'INDEX-v2', 'online: always the newest page');
  assert.equal(await w.go(ORIGIN + '/privacy-policy', { mode: 'navigate' }), null, 'a separate page is left to the browser');
  w.state.online = false;
  r = await w.go(ORIGIN + '/lore', { mode: 'navigate' }); assert.equal(await r.text(), 'INDEX-v2', 'offline: the saved app opens on any app page, and it is the app, not the privacy page');
  const fresh = world({ online: false }); await assert.rejects(async () => { const x = await fresh.go(ORIGIN + '/vault', { mode: 'navigate' }); if (x === null) throw new Error('not handled'); return x; }, 'offline with nothing saved: a plain failure, not a made-up page');
});

test('files: the app file is saved per version; covers are kept (not opaque ones, at most 200); songs, the API and videos are never touched', async () => {
  const w = world({ files: { '/app.js': { body: 'JS' }, '/fonts/a.woff2': { body: 'F' }, '/img/c1/400': { body: 'IMG1' } } });
  w.state.files['/img/c1/400'] = { body: 'IMG1' };
  let r = await w.go(ORIGIN + '/app.js?v=T1'); assert.equal(await r.text(), 'JS'); const n = w.log.fetched.length;
  r = await w.go(ORIGIN + '/app.js?v=T1'); assert.equal(await r.text(), 'JS'); assert.equal(w.log.fetched.length, n, 'the second time it comes from the saved copy');
  r = await w.go('https://media.soulnicolas.com/img/c1/400'); assert.equal(await r.text(), 'IMG1'); w.state.online = false;
  r = await w.go('https://media.soulnicolas.com/img/c1/400'); assert.equal(await r.text(), 'IMG1', 'a saved cover still shows offline');
  for (const u of [ORIGIN + '/api', ORIGIN + '/a/song.mp3', ORIGIN + '/home-bg-hd.mp4', 'https://media.soulnicolas.com/x/01.m4a', 'https://www.googleapis.com/x']) assert.equal(await w.go(u), null, u + ' is not handled');
  const posted = await new Promise((res) => { world().handlers.fetch({ request: new Request(ORIGIN + '/api', { method: 'POST', body: '{}' }), respondWith: () => res(true) }); setTimeout(() => res(false), 50); }); assert.equal(posted, false, 'POST requests are not handled');
});
