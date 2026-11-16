/* ── Settings > Missing files > "Where your songs play from" (Nov 2026) ──
   Every song sorted by where its first-playing version really comes from (edge call missingWhere): Cloudflare, Google Drive, links, nothing.
   Songs that are not on Cloudflare get Upload file (an MP3, WAV, M4A... saved to Cloudflare) and Remove. openMissing (06) draws the page and calls loadWhere. ── */
// Settings > Missing files > "Where your songs play from": every song sorted by where its first-playing version really comes from (edge call missingWhere).
const WHERE_GROUPS = [
  ['drive', 'Still on Google Drive', 'Only the old Drive copy exists. They play, a little slower, and cannot be saved offline. Move them by replacing the audio in Studio.'],
  ['none', 'Nothing plays', 'No working file at all.'],
  ['link', 'YouTube / SoundCloud links', 'No audio file, just a link. They disappear if the link is taken down. Add your own file to keep a copy.'],
  ['cloudflare', 'On Cloudflare', 'Our own storage has the file. Drive is only a spare.']];
function whereHtml(res) {
  const t = res.totals, n = res.songs.length, mine = k => res.songs.filter(s => s.where === k);
  const chip = (k, label) => `<span class="mswchip ${k}"><b>${t[k]}</b> ${label}</span>`;
  const group = ([k, title, note]) => {
    const list = mine(k); if (!list.length) return '';
    const rels = {}; list.forEach(s => { (rels[s.release_id] = rels[s.release_id] || { title: s.release, songs: [] }).songs.push(s); });
    const body = Object.keys(rels).map(id => { const r = rels[id];
      return `<div class="mswrel"><div class="mswrelh"><b>${esc(r.title)}</b> <span class="cs">${r.songs.length} ${r.songs.length === 1 ? 'song' : 'songs'}</span>${k !== 'cloudflare' ? `<button type="button" class="linkish" data-ms-studio="${esc(id)}">Open in Studio</button>` : ''}</div>
        ${k === 'cloudflare' ? '' : `<ul class="mswsongs">${r.songs.map(s => `<li class="mswsong" data-ws="${esc(s.id)}"><div class="mswsongt"><label class="mswpick"><input type="checkbox" data-ws-pick="${esc(s.id)}" data-ws-title="${esc(s.title)}" aria-label="Select ${esc(s.title)}"></label>${s.no ? '#' + esc(s.no) + ' ' : ''}${esc(s.title)}${s.hidden ? ' <span class="cs">(hidden)</span>' : ''}${s.others.drive ? ` <span class="cs">+ ${s.others.drive} other ${s.others.drive === 1 ? 'version' : 'versions'} on Drive</span>` : ''}</div>
          <div class="cs msst" role="status"></div><div class="msbar" hidden style="height:4px;border-radius:4px;background:var(--raise);overflow:hidden"><i style="display:block;height:100%;width:0;background:var(--red)"></i></div>
          <div class="msbtns"><button type="button" class="pill main" data-ws-up="${esc(s.id)}">${I.up2}Upload file</button><button type="button" class="pill soft danger" data-ws-rm="${esc(s.id)}">${I.trash}Remove</button></div></li>`).join('')}</ul>`}</div>`; }).join('');
    const open = S.whereOpen && k in S.whereOpen ? S.whereOpen[k] : (k === 'drive' || k === 'none');   // (a group you opened or closed stays that way after an upload)
    return `<details class="mswgroup ${k}" data-k="${k}"${open ? ' open' : ''}><summary><b>${esc(title)}</b> <span class="mswn">${list.length}</span></summary><p class="cs">${esc(note)}</p>${body}</details>`;
  };
  const sub = t.drive + t.none === 0 ? 'Every song with a file plays from Cloudflare.' : `${t.drive + t.none} ${t.drive + t.none === 1 ? 'song needs' : 'songs need'} attention.`;
  return `<h3>Where your songs play from</h3><p class="cs">${n} songs checked just now. ${sub}</p>
    <div class="mswchips">${chip('cloudflare', 'on Cloudflare')}${chip('drive', 'on Google Drive')}${chip('link', 'links only')}${t.none ? chip('none', 'no file') : ''}</div>
    ${t.drive + t.none + t.link ? `<div class="stusel"><button type="button" class="pill soft" data-ws-selmode>Select songs</button><span class="cs">Tick several to remove them at once.</span></div>` : ''}
    ${WHERE_GROUPS.map(group).join('')}
    <div class="save stusticky stuselbar" id="wsSelBar" hidden><span><b id="wsSelN">0</b> selected</span><button type="button" class="pill soft" data-ws-selall>Select all</button><button type="button" class="pill soft danger" data-ws-delsel disabled>${I.trash}Remove selected…</button><button type="button" class="pill soft" data-ws-seldone>Done</button><span class="st" id="wsSelSt" role="status"></span></div>`;
}
async function loadWhere() {
  const box = () => $('#msWhere'); if (!box()) return;
  try {
    const res = await run('missingWhere', BOOT.key);
    if (box()) { box().innerHTML = whereHtml(res); box().classList.toggle('selmode', false); $$('#msWhere .mswgroup').forEach(d => d.addEventListener('toggle', () => { (S.whereOpen = S.whereOpen || {})[d.dataset.k] = d.open; })); wireWhereSelect(); }
  }
  catch (e) { if (box()) box().innerHTML = `<h3>Where your songs play from</h3><p class="cs">${esc((e && e.message) || 'Could not check the songs.')}</p>`; }
}
// Select songs: tick several (or all) and remove them together, one after another (the same deleteTrack as Studio).
function wireWhereSelect() {
  const box = $('#msWhere'), bar = $('#wsSelBar'), mode = $('[data-ws-selmode]'); if (!box || !bar || !mode) return;
  const picks = () => [...$$('#msWhere [data-ws-pick]')], ticked = () => picks().filter(c => c.checked).map(c => c.dataset.wsPick);
  const refresh = () => { const n = ticked().length; $('#wsSelN').textContent = n; $('[data-ws-delsel]').disabled = !n; $('[data-ws-selall]').textContent = n && n === picks().length ? 'Select none' : 'Select all'; };
  const setMode = on => { box.classList.toggle('selmode', on); bar.hidden = !on; mode.hidden = on; if (on) $$('#msWhere .mswgroup').forEach(d => { d.open = true; }); else picks().forEach(c => { c.checked = false; }); $('#wsSelSt').textContent = ''; refresh(); };
  mode.addEventListener('click', () => setMode(true));
  $('[data-ws-seldone]').addEventListener('click', () => setMode(false));
  $('[data-ws-selall]').addEventListener('click', () => { const all = ticked().length !== picks().length; picks().forEach(c => { c.checked = all; }); refresh(); });
  picks().forEach(c => c.addEventListener('change', refresh));
  $('[data-ws-delsel]').addEventListener('click', async e => {
    const ids = ticked(), btn = e.currentTarget; if (!ids.length) return;
    const names = picks().filter(c => c.checked).map(c => c.dataset.wsTitle).filter(Boolean);   // (from the page, so a song the app has not loaded is still named)
    if (!confirm(`Remove ${ids.length} ${ids.length === 1 ? 'song' : 'songs'} for good?\n\n${names.slice(0, 6).map(n => '• ' + n).join('\n')}${names.length > 6 ? '\n• and ' + (names.length - 6) + ' more' : ''}\n\nThis deletes the songs, their versions, their share links and their place in playlists. Audio files that are already stored are not deleted. The other songs are renumbered.`)) return;
    btn.disabled = true; const gone = []; let err = '';
    for (const tid of ids) {
      $('#wsSelSt').textContent = ids.length > 1 ? `Removing ${gone.length + 1} of ${ids.length}…` : 'Removing…';
      try { await run('deleteTrack', BOOT.key, tid); if (trk(tid)) dropSongLocal(tid); gone.push(tid); } catch (er) { err = (er && er.message) || 'Could not remove a song.'; break; }
    }
    toast(err ? `Removed ${gone.length} of ${ids.length}. Stopped: ${err}` : (ids.length === 1 ? 'Song removed' : ids.length + ' songs removed'));
    await loadWhere();
  });
}
// Upload a song's audio from here (an MP3, WAV, M4A... made into a 256 kbps MP3 first when needed) and keep it on Cloudflare.
// The song's first-playing version is replaced in place when the catalog is on Cloudflare (it keeps its name, share links and plays);
// otherwise, and for a link-only song, the file is added as the song's new first-playing version and the old one stays as another version.
async function putSongFile(f, tid, stat, bar) {
  const t = trk(tid); if (!t) throw new Error('Refresh the app and try again: that song is not loaded.');
  const first = primaryOf(t), isLink = first && /^(YOUTUBE|SOUNDCLOUD)$/i.test(String(first.format || ''));
  if (first && !isLink && EDGE_UPLOADS()) {
    const o = await replaceAudioOnEdge(f, first, t, stat, bar);
    if (o) { if (S.now && S.now.v.version_id === first.version_id) stopPlayback(); Object.assign(first, o); libCacheSet(S.lib); return 'replaced'; }
  }
  const out = await uploadSongToEdge(f, t.release_id, tid, t.title, 'Original', true, stat, bar);
  S.lib.versions.forEach(v => { if (v.track_id === tid) v.is_primary = false; });
  S.lib.versions.push(Object.assign({}, out.version, { is_primary: true })); libCacheSet(S.lib);
  return 'added';
}
const whereRow = tid => [...$$('#msWhere [data-ws]')].find(x => x.dataset.ws === tid);
async function putWhereFile(f, tid) {
  const row = whereRow(tid), t = trk(tid); if (!row) return;
  const st = row.querySelector('.msst'), bar = row.querySelector('.msbar'), fill = bar.firstElementChild, btns = row.querySelectorAll('button');
  if (!t) { st.textContent = 'Refresh the app and try again: that song is not loaded.'; return; }
  bar.hidden = false; btns.forEach(b => { b.disabled = true; });
  try {
    const how = await putSongFile(f, tid, x => { st.textContent = x; }, p => { fill.style.width = Math.round(p * 100) + '%'; });
    toast(how === 'replaced' ? `Saved. “${t.title}” now plays from Cloudflare.` : `Saved. “${t.title}” now plays your file from Cloudflare (the old copy is kept as another version).`);
    await loadWhere();
  } catch (er) { st.textContent = (er && er.message) || 'The upload did not finish.'; bar.hidden = true; btns.forEach(b => { b.disabled = false; }); }
}
async function dropWhereSong(tid) {
  const row = whereRow(tid), t = trk(tid); if (!row) return;
  const st = row.querySelector('.msst');
  if (!t) { st.textContent = 'Refresh the app and try again: that song is not loaded.'; return; }
  const r = rel(t.release_id) || {};
  if (!confirm(`Remove “${t.title}” from ${r.title || 'its release'} for good?\n\nThis deletes the song, its versions, its share links and its place in playlists. Audio files that are already stored are not deleted. The other songs are renumbered.`)) return;
  row.querySelectorAll('button').forEach(b => { b.disabled = true; }); st.textContent = 'Removing…';
  try { await run('deleteTrack', BOOT.key, tid); dropSongLocal(tid); toast('Song removed'); await loadWhere(); }
  catch (er) { st.textContent = (er && er.message) || 'Could not remove the song.'; row.querySelectorAll('button').forEach(b => { b.disabled = false; }); }
}
document.addEventListener('click', e => {   // "Open in Studio" next to a release in that list
  const b = e.target.closest && e.target.closest('[data-ms-studio]'); if (!b) return;
  e.preventDefault(); closeModal(); S.stuRel = b.dataset.msStudio; S.stuTab = 'songs'; renderStudio();
});
