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
        ${k === 'cloudflare' ? '' : `<ul class="mswsongs">${r.songs.map(s => `<li class="mswsong" data-ws="${esc(s.id)}"><div class="mswsongt">${s.no ? '#' + esc(s.no) + ' ' : ''}${esc(s.title)}${s.hidden ? ' <span class="cs">(hidden)</span>' : ''}${s.others.drive ? ` <span class="cs">+ ${s.others.drive} other ${s.others.drive === 1 ? 'version' : 'versions'} on Drive</span>` : ''}</div>
          <div class="cs msst" role="status"></div><div class="msbar" hidden style="height:4px;border-radius:4px;background:var(--raise);overflow:hidden"><i style="display:block;height:100%;width:0;background:var(--red)"></i></div>
          <div class="msbtns"><button type="button" class="pill main" data-ws-up="${esc(s.id)}">${I.up2}Upload file</button><button type="button" class="pill soft danger" data-ws-rm="${esc(s.id)}">${I.trash}Remove</button></div></li>`).join('')}</ul>`}</div>`; }).join('');
    const open = S.whereOpen && k in S.whereOpen ? S.whereOpen[k] : (k === 'drive' || k === 'none');   // (a group you opened or closed stays that way after an upload)
    return `<details class="mswgroup ${k}" data-k="${k}"${open ? ' open' : ''}><summary><b>${esc(title)}</b> <span class="mswn">${list.length}</span></summary><p class="cs">${esc(note)}</p>${body}</details>`;
  };
  const sub = t.drive + t.none === 0 ? 'Every song with a file plays from Cloudflare.' : `${t.drive + t.none} ${t.drive + t.none === 1 ? 'song needs' : 'songs need'} attention.`;
  return `<h3>Where your songs play from</h3><p class="cs">${n} songs checked just now. ${sub}</p>
    <div class="mswchips">${chip('cloudflare', 'on Cloudflare')}${chip('drive', 'on Google Drive')}${chip('link', 'links only')}${t.none ? chip('none', 'no file') : ''}</div>
    ${WHERE_GROUPS.map(group).join('')}`;
}
async function loadWhere() {
  const box = () => $('#msWhere'); if (!box()) return;
  try {
    const res = await run('missingWhere', BOOT.key);
    if (box()) { box().innerHTML = whereHtml(res); $$('#msWhere .mswgroup').forEach(d => d.addEventListener('toggle', () => { (S.whereOpen = S.whereOpen || {})[d.dataset.k] = d.open; })); }
  }
  catch (e) { if (box()) box().innerHTML = `<h3>Where your songs play from</h3><p class="cs">${esc((e && e.message) || 'Could not check the songs.')}</p>`; }
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
