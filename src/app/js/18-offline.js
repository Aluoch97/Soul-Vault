/* ── installable + works offline: the service worker keeps a saved copy of the app ──
   Pages and pictures open with no connection; songs and videos still need one. To switch it off for a device: open the site with ?nosw=1. */
function registerSw() {
  if (!('serviceWorker' in navigator) || location.protocol !== 'https:' || (navigator.webdriver && !window.__allowSw)) return;
  if (/[?&]nosw=1/.test(location.search)) {   // emergency switch: forget the saved copy
    navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
    if (window.caches) caches.keys().then(ks => ks.forEach(k => caches.delete(k))).catch(() => {});
    return;
  }
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
window.addEventListener('load', () => setTimeout(registerSw, 2500));   // after the page is up, so it never slows the first visit
window.addEventListener('offline', () => toast("You're offline. Saved pages still open; songs and videos need a connection."));
window.addEventListener('online', () => toast('Back online'));
// "Refresh": an app saved to the home screen has no reload button. This forgets the saved copy and loads the newest version.
// The version this page is running, read from its own script address (/app.js?v=<build>-<fingerprint>). Shown in the Home footer and Settings so you can always tell which one you have.
const APP_VERSION = (/[?&]v=([^&"]+)/.exec(((document.querySelector('script[src*="/app.js"]') || {}).src) || '') || [])[1] || '';
// The short number for people ("1.1"): the newest heading in CHANGELOG.md, put in by build.js. Empty on a copy built without it.
const APP_RELEASE = '__SV_RELEASE__';
async function refreshApp() {
  toast('Refreshing…');
  try { if ('serviceWorker' in navigator) await Promise.all((await navigator.serviceWorker.getRegistrations()).map(r => r.update())); } catch (e) { /* carry on */ }   // update, never unregister: unregistering would switch off phone notifications
  try { if (window.caches) await Promise.all((await caches.keys()).map(k => caches.delete(k))); } catch (e) { /* carry on */ }
  // Ask the network for fresh copies of the page and the code (skipping the browser's saved ones), then reload on an address nothing has saved (?r=<time>, removed again on load).
  try { const code = (document.querySelector('script[src*="/app.js"]') || {}).src; await Promise.all([fetch('/', { cache: 'reload' }), code ? fetch(code, { cache: 'reload' }) : null]); } catch (e) { /* offline: the reload below says so */ }
  try { const u = new URL(location.href); u.searchParams.set('r', String(Date.now())); location.replace(u.toString()); } catch (e) { location.reload(); }
}
try { const u = new URL(location.href); if (u.searchParams.has('r')) { u.searchParams.delete('r'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } } catch (e) { /* leave the address alone */ }
document.addEventListener('click', e => { const t = e.target.closest && e.target.closest('[data-refresh]'); if (t) { e.preventDefault(); refreshApp(); } });
