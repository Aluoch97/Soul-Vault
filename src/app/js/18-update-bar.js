/* "A new version is ready. Tap to update" (Nov 17, 2026, Nick). This page knows the version it is running (`APP_VERSION`, from its own /app.js?v=… address).
   When the app comes back to the screen, when the phone goes online and every 5 minutes it asks the network for the page (never the saved copy) and reads the
   version in its script address. If it differs, a small bar appears above the tab bar; the tap runs `refreshApp()` (forgets the saved copy, loads the newest).
   Only plain text, nothing from the network is shown. Not shown in a frame or with ?nosw=1. */
(function () {
  if (window.top !== window || !APP_VERSION || /[?&]nosw=1/.test(location.search)) return;
  let shownFor = '';
  async function newestVersion() {
    try {
      const r = await fetch('/', { cache: 'no-store' }); if (!r.ok) return '';
      return (/\/app\.js\?v=([^"'&\s]+)/.exec(await r.text()) || [])[1] || '';
    } catch (e) { return ''; }
  }
  async function check() {
    const v = await newestVersion();
    if (!v || v === APP_VERSION || v === shownFor || $('.updbar')) return;
    shownFor = v;
    const bar = document.createElement('div'); bar.className = 'updbar'; bar.setAttribute('role', 'status');
    bar.innerHTML = '<span>A new version is ready.</span><button type="button" class="updgo">Tap to update</button><button type="button" class="updx" aria-label="Not now">×</button>';
    bar.querySelector('.updgo').addEventListener('click', e => { e.target.disabled = true; e.target.textContent = 'Updating…'; refreshApp(); });
    bar.querySelector('.updx').addEventListener('click', () => bar.remove());
    document.body.appendChild(bar);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  window.addEventListener('online', check);
  setInterval(check, 5 * 60 * 1000);
  setTimeout(check, 20000);   // once soon after opening: an app left open or restored from an old saved copy
})();
