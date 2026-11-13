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
