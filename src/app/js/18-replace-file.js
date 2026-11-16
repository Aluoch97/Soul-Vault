/* ── Replace a song's audio file right on the release page (owner only, Nov 2026) ──
   Every song row has an upload button next to the ⋯ button. Tap it, pick an MP3, WAV, AIFF, FLAC, M4A... from your phone or computer, and the song's
   first-playing version is replaced and saved on Cloudflare (`putSongFile` in 18-missing-where.js: replaced in place when the catalog is on Cloudflare;
   otherwise, and for a link-only song, the file is added as the song's new first-playing version and the old one is kept as another version).
   A small sheet shows the progress. The older route (⋯ > Versions, files and covers > Replace file) still works for choosing a specific version. */
let replaceFor = null;
function replaceInput() {
  let i = $('#replaceFile');
  if (!i) {
    i = document.createElement('input'); i.type = 'file'; i.id = 'replaceFile'; i.accept = 'audio/*,.wav,.aif,.aiff,.flac,.mp3,.m4a,.aac,.ogg';
    i.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0'; i.tabIndex = -1; document.body.appendChild(i);
    i.addEventListener('change', onReplacePicked);
  }
  return i;
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-replace-song]'); if (!b || !OWNER) return;
  e.preventDefault(); e.stopPropagation();
  replaceFor = b.dataset.replaceSong; const inp = replaceInput(); inp.value = ''; inp.click();
});
async function onReplacePicked(e) {
  const f = e.target.files[0], tid = replaceFor, t = tid && trk(tid); if (!f || !t) return;
  const m = $('#modal'); m.className = 'modal';
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Replace the audio file"><h2>Replacing “${esc(t.title)}”</h2>
    <p class="cs" id="rpSt" role="status" aria-live="polite">Getting your file ready…</p>
    <div class="msbar" style="height:6px;border-radius:6px;background:var(--raise);overflow:hidden"><i id="rpFill" style="display:block;height:100%;width:0;background:var(--red)"></i></div>
    <div class="end"><button class="pill soft" data-close id="rpDone">Close</button></div></div>`;
  m.hidden = false;
  try {
    const how = await putSongFile(f, tid, x => { const s = $('#rpSt'); if (s) s.textContent = x; }, p => { const b = $('#rpFill'); if (b) b.style.width = Math.round(p * 100) + '%'; });
    const s = $('#rpSt'); if (s) s.textContent = how === 'replaced' ? `Done. “${t.title}” now plays your file from Cloudflare.` : `Done. “${t.title}” now plays your file from Cloudflare. The old copy is kept as another version.`;
    const bar = $('#rpFill'); if (bar) bar.style.width = '100%';
    toast('File saved'); if (S.view === 'release') renderRelease(S.releaseId);
  } catch (er) { const s = $('#rpSt'); if (s) s.textContent = (er && er.message) || 'The upload did not finish. Nothing was changed.'; }
}
