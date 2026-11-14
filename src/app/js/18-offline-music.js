/* ── Save music for offline listening ──
   Songs that live in our own storage (media.soulnicolas.com) can be saved inside the app (the browser's Cache Storage, not a file that can be exported).
   A saved song plays from that copy, so it also starts at once and uses no data. Songs that only exist on Google Drive or as a YouTube/SoundCloud link cannot be saved.
   Honest limits: a phone may clear saved music when it runs low on space (iPhones can clear it after a few weeks of not opening the app), and a technical person can still copy it out of their own browser. */
const OFF_CACHE = 'sv-music-v1';
const offSupported = () => typeof caches !== 'undefined' && !!window.fetch && !!URL.createObjectURL;
// The saved-music address of a version, or '' when it cannot be saved (no file of ours behind it).
const offUrlOf = v => { const f = v && (v.audio || v.preview); return (f && ((S.urlByFile || {})[f] || v.url)) || ''; };
const offOkUrl = u => /^https:\/\/media\.soulnicolas\.com\//.test(String(u || ''));
async function offOpen() { return caches.open(OFF_CACHE); }
async function offHas(url) { try { return !!(url && offSupported() && await (await offOpen()).match(url)); } catch (e) { return false; } }
// What playback uses: the saved copy as a local address (so seeking works), or '' to stream as usual. The last few are kept; older ones are released.
async function offSource(url) {
  try {
    if (!offOkUrl(url) || !offSupported()) return '';
    const hit = await (await offOpen()).match(url); if (!hit) return '';
    const blob = await hit.blob(), obj = URL.createObjectURL(blob);
    S.offUrls = (S.offUrls || []).concat(obj); while (S.offUrls.length > 3) URL.revokeObjectURL(S.offUrls.shift());
    return obj;
  } catch (e) { return ''; }
}
// The versions to save for a release ('rel:<id>') or a playlist ('pl:<id>'): one main version per song that has a file of ours.
function offTargets(spec) {
  const [kind, id] = String(spec || '').split(':');
  let ts = [];
  if (kind === 'rel') ts = tracksOf(id).filter(t => !hidden(t) || OWNER);
  else if (kind === 'pl') { const p = plOf(id); ts = p ? plTracks(p) : []; }
  const seen = new Set();
  return ts.map(t => { const pv = primaryOf(t); return pv && { t, v: pv, url: offUrlOf(pv) }; }).filter(x => x && offOkUrl(x.url) && !seen.has(x.url) && seen.add(x.url));
}
async function offSave(items, onStep) {
  if (!offSupported()) throw new Error("This browser can't save music for offline listening.");
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* only a request */ }
  const cache = await offOpen(); let done = 0;
  for (const it of items) {
    if (!(await cache.match(it.url))) {
      let res; try { res = await fetch(it.url, { mode: 'cors', credentials: 'omit' }); } catch (e) { throw new Error('The connection dropped. Saved ' + done + ' of ' + items.length + '; tap Save offline again to finish.'); }
      if (!res.ok) throw new Error('"' + (it.t.title || 'A song') + '" could not be downloaded (' + res.status + ').');
      try { await cache.put(it.url, res); } catch (e) { throw new Error("There isn't enough room on this device for more saved music. Remove some in Offline music (Home footer), then try again."); }
    }
    done++; if (onStep) onStep(done, items.length);
  }
  return done;
}
async function offRemove(items) { const c = await offOpen(); for (const it of items) await c.delete(it.url); }
async function offStats() {
  const c = await offOpen(), ks = await c.keys(); let bytes = 0;
  for (const k of ks) { const r = await c.match(k); const n = r && Number(r.headers.get('content-length')); if (n) bytes += n; else if (r) bytes += (await r.clone().blob()).size; }
  return { count: ks.length, bytes };
}
const offMB = b => (b / 1048576 >= 100 ? Math.round(b / 1048576) : (b / 1048576).toFixed(1)) + ' MB';

// The Save offline button on a release or playlist page: shows what is saved, saves everything, or removes it.
async function offPaintButtons() {
  for (const b of $$('[data-off]')) {
    const items = offTargets(b.dataset.off);
    if (!offSupported() || !items.length) { b.hidden = true; continue; }
    b.hidden = false;
    let have = 0; for (const it of items) if (await offHas(it.url)) have++;
    if (!b.isConnected || b.dataset.busy) continue;
    const all = have === items.length;
    b.dataset.state = all ? 'saved' : 'none';
    b.innerHTML = all ? `${I.check}<span>Saved offline</span>` : `${I.dl}<span>${have ? 'Finish saving (' + have + '/' + items.length + ')' : 'Save offline'}</span>`;
    b.setAttribute('aria-label', all ? 'Saved for offline listening. Tap to remove.' : 'Save these songs for offline listening');
  }
}
document.addEventListener('click', async e => {
  const b = e.target.closest && e.target.closest('[data-off]'); if (!b) return;
  e.preventDefault(); if (b.dataset.busy) return;
  const items = offTargets(b.dataset.off); if (!items.length) return;
  b.dataset.busy = '1';
  try {
    if (b.dataset.state === 'saved') { await offRemove(items); toast('Removed from offline music'); }
    else if (!navigator.onLine) toast("You're offline. Save songs while you have a connection.");
    else {
      b.innerHTML = `<span>Saving 0/${items.length}…</span>`;
      await offSave(items, (d, n) => { b.innerHTML = `<span>Saving ${d}/${n}…</span>`; });
      toast(items.length === 1 ? 'Saved for offline listening' : `Saved ${items.length} songs for offline listening`);
    }
  } catch (er) { toast((er && er.message) || 'Could not save.'); }
  delete b.dataset.busy; offPaintButtons();
});
// Home footer: how much is saved, and a way to clear it.
async function openOfflineMusic() {
  const m = $('#modal'); m.className = 'modal';
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Offline music"><h2>Offline music</h2><p class="cs" id="offInfo">Checking…</p>
    <p class="cs">Save a release or a playlist with its <b>Save offline</b> button. Saved songs play without a connection and use no data. They stay inside this app, and your phone can clear them if it runs low on space.</p>
    <div class="end"><button class="pill soft" id="offClear" hidden>Remove all saved music</button><button class="pill soft" data-close>Close</button></div></div>`;
  m.hidden = false;
  try {
    const s = offSupported() ? await offStats() : null;
    $('#offInfo').textContent = !s ? "This browser can't save music for offline listening." : s.count ? `${s.count} ${s.count === 1 ? 'song' : 'songs'} saved on this device (${offMB(s.bytes)}).` : 'Nothing saved yet.';
    $('#offClear').hidden = !s || !s.count;
    $('#offClear').addEventListener('click', async () => { await caches.delete(OFF_CACHE); toast('Offline music removed'); closeModal(); offPaintButtons(); });
  } catch (e) { $('#offInfo').textContent = 'Could not check what is saved.'; }
}
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-offline-music]')) { e.preventDefault(); openOfflineMusic(); } });
window.addEventListener('online', () => offPaintButtons());
