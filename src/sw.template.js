// Soul Vault service worker. A saved copy of the app, so it opens fast and still opens when there is no connection.
// It NEVER touches the API, uploads, songs or videos (those always go to the network), and it asks the network first for pages,
// so a new version of the site shows up at once. Built by build.js, which fills in the version and the app address below.
const VERSION = '__VERSION__', SHELL = 'sv-shell-' + VERSION, IMG = 'sv-img-v1', IMG_MAX = 200;
const PRECACHE = ['/', '__APP__', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/favicon-32.png'];
const AUDIO_VIDEO = /\.(mp3|m4a|aac|ogg|wav|mp4|webm)$/i;
// What to do with a request: 'bypass' (not ours), 'page', 'shell', 'static' or 'image'.
function kind(req, origin) {
  if (req.method !== 'GET') return 'bypass';
  if (req.headers && req.headers.get && req.headers.get('range')) return 'bypass';
  const u = new URL(req.url);
  if (u.origin === origin) {
    if (u.pathname === '/api' || u.pathname === '/sw.js' || u.pathname.indexOf('/upload') === 0 || u.pathname === '/news' || AUDIO_VIDEO.test(u.pathname)) return 'bypass';
    if (req.mode === 'navigate') return /^\/(vault|video|tour|press|lore|admin)?(\/|$)/.test(u.pathname) && !/\.[a-z0-9]+$/i.test(u.pathname) ? 'page' : 'bypass';   // only the app's own pages; /join, /shows, /privacy-policy and the tracker are separate pages and go to the network
    if (u.pathname === '/app.js' || u.pathname === '/lame.js') return 'shell';
    if (/^\/(fonts\/|icon|favicon|apple-touch|photos\/|press-img\/|home-covers\/|og-image)/.test(u.pathname) || u.pathname === '/manifest.webmanifest') return 'static';
    return 'bypass';
  }
  if (u.hostname === 'media.soulnicolas.com' && u.pathname.indexOf('/img/') === 0 && !AUDIO_VIDEO.test(u.pathname)) return 'image';
  return 'bypass';
}
const okToKeep = res => !!res && res.ok && res.type !== 'opaque';
async function put(cacheName, req, res) { try { if (okToKeep(res)) await (await caches.open(cacheName)).put(req, res.clone()); } catch (e) { /* storage full: carry on without keeping it */ } return res; }
async function networkFirstPage(req) {
  try {
    const res = await Promise.race([fetch(req), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 6000))]);
    if (res && res.ok) put(SHELL, '/', res);   // every page is the same app, so one saved copy under "/" serves them all
    return res;
  } catch (e) {
    const hit = await caches.match('/', { cacheName: SHELL }) || await caches.match('/');
    if (hit) return hit;
    throw e;
  }
}
async function cacheFirst(cacheName, req) { const hit = await caches.match(req, { cacheName }); if (hit) return hit; return put(cacheName, req, await fetch(req)); }
async function staleWhileRevalidate(cacheName, req) {
  const hit = await caches.match(req, { cacheName }), fresh = fetch(req).then(res => put(cacheName, req, res)).catch(() => null);
  return hit || (await fresh) || Response.error();
}
async function trimImages() { try { const c = await caches.open(IMG), ks = await c.keys(); for (let i = 0; i < ks.length - IMG_MAX; i++) await c.delete(ks[i]); } catch (e) { /* ignore */ } }
self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => Promise.all(PRECACHE.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.indexOf('sv-shell-') === 0 && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'clear') e.waitUntil(caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k))))); });
self.addEventListener('fetch', e => {
  let k = 'bypass'; try { k = kind(e.request, self.location.origin); } catch (x) { k = 'bypass'; }
  if (k === 'bypass') return;   // the browser handles it as if there were no service worker
  const req = e.request;
  e.respondWith((k === 'page' ? networkFirstPage(req) : k === 'shell' ? cacheFirst(SHELL, req) : k === 'static' ? staleWhileRevalidate(SHELL, req) : cacheFirst(IMG, req).then(r => { trimImages(); return r; }))
    .catch(() => fetch(req)));
});
