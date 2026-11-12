const VSEC_ORDER = ['music', 'film', 'live', 'skit', 'reaction', 'interview', 'podcast', 'extras'];
const VSEC_NAME = { music: 'music videos', film: 'short films', live: 'live performances', skit: 'skits', reaction: 'reactions', interview: 'interviews', podcast: 'podcasts', extras: 'extras' };
const VSHORT = { music: 'Video', film: 'Film', live: 'Live', skit: 'Skit', reaction: 'Reaction', interview: 'Interview', podcast: 'Podcast', trailer: 'Trailer', bts: 'BTS' };
function videosSection(r, ts) {
  const vs = orderedVideos(r, ts); if (!vs.length) return '';
  const secs = VSEC_ORDER.map(k => ({ k, items: vs.map((v, i) => [v, i]).filter(([v]) => VSECTION[v.type] === k) })).filter(x => x.items.length);
  const card = ([v, i]) => `<div class="vcard">${OWNER ? `<button class="vedit" data-vtype-edit="${i}" aria-label="Edit video type: ${esc(v.title)}">${I.edit}</button>` : ''}
      <button class="vthumb" data-vplay="${i}" aria-label="Play ${VTYPE[v.type].toLowerCase()}: ${esc(v.title)}${vs.length > 1 ? ', then the rest of this section' : ''}">
        ${v.id ? `<img src="https://i.ytimg.com/vi/${v.id}/hqdefault.jpg" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="plph" aria-hidden="true">Playlist</span>'}<span class="vplay" aria-hidden="true">${I.play}</span></button>
      ${v.id ? `<button class="ib vshare" data-share-out="video" data-vid="${esc(v.id)}" data-title="${esc(v.title)}" aria-label="Share ${esc(v.title)}">${I.share}</button>` : ''}<span class="ct">${esc(v.title)}</span>${v.list ? '<span class="vtype plist">Playlist</span>' : ''}<span class="vtype ${v.type}">${VTYPE[v.type]}</span>
      ${OWNER ? (v.xid ? `<button class="ib xdel" data-xdel="${esc(v.xid)}" aria-label="Remove ${esc(v.title)} from this release">${I.trash}</button>`
                       : `<button class="ib xdel" data-del-tvideo="${esc(v.tid)}" aria-label="Remove the video from ${esc(v.title)}">${I.trash}</button>`) : ''}</div>`;
  return `<section id="era-videos" class="erasec">${secs.map(sec => `<div class="vsec" data-vsec="${sec.k}">
    <h2 class="sh"><span>${VSECTION_TITLE[sec.k]}</span>${sec.items.length > 1 ? `<button class="pill soft vplayall" data-vplay="${sec.items[0][1]}" aria-label="Play all ${VSEC_NAME[sec.k]}">${I.play}Play all</button>` : ''}</h2>
    <div class="hrow">${sec.items.map(card).join('')}</div></div>`).join('')}</section>`;
}
// A label next to songs that have a video; tapping it opens the video
function videoLabel(t) {
  const ty = (videosMeta(rel(t.release_id)).types['t:' + t.track_id]) || 'music';
  return `<button class="vbadge" data-watch="${esc(t.track_id)}" aria-label="Watch the ${(VTYPE[ty] || 'video').toLowerCase()} for ${esc(t.title)}">${I.film}${VSHORT[ty] || 'Video'}</button>`;
}

/* ── removing things (everything you can add, you can now take away) ── */
function stopPlayback() {
  audio.pause(); S.lt = null; S.now = null; S.queue = []; S.qi = 0; S.ytSong = false;
  const m = $('#mini'); if (m) m.hidden = true;
  if ($('#np') && !$('#np').hidden) closeNp();
}
function dropSongLocal(tid) {
  const relId = (trk(tid) || {}).release_id, vids = new Set(S.lib.versions.filter(v => v.track_id === tid).map(v => v.version_id));
  if (S.now && S.now.t.track_id === tid) stopPlayback();
  S.queue = (S.queue || []).filter(v => !vids.has(v));
  S.lib.tracks = S.lib.tracks.filter(t => t.track_id !== tid); S.lib.versions = S.lib.versions.filter(v => v.track_id !== tid);
  (S.lib.shares || []).forEach(() => {}); S.lib.shares = (S.lib.shares || []).filter(s => !((s.target_type === 'track' && s.target_id === tid) || (s.target_type === 'version' && vids.has(s.target_id))));
  (S.lib.playlists || []).forEach(p => { p.tracks = (p.tracks || []).filter(x => x !== tid); });
  S.lib.tracks.filter(t => t.release_id === relId).sort((a, b) => (Number(a.track_no) || 0) - (Number(b.track_no) || 0)).forEach((t, k) => { t.track_no = k + 1; });
  libCacheSet(S.lib);
}
async function deleteSongUI(i) {
  const d = S.draft[i]; if (!d) return;
  const t = trk(d.track_id), nv = versionsOf(d.track_id, true).length;
  if (!confirm(`Delete “${t.title}” for good?\n\nThis removes the song${nv > 1 ? ' and its ' + nv + ' versions' : ''}, its comments, its share links, and its place in playlists. The audio files stay in your Drive.`)) return;
  try {
    await run('deleteTrack', BOOT.key, d.track_id);
    syncDraftChapters(); dropSongLocal(d.track_id);
    S.draft = S.draft.filter(x => x.track_id !== d.track_id); rebuildChaps();
    $('#editList').innerHTML = editRows(); chapRender(); toast('Song deleted');
  } catch (e) { toast(e.message || 'Could not delete the song'); }
}
async function deleteVersionUI(vid) {
  const v = ver(vid); if (!v) return; const t = trk(v.track_id);
  if (!confirm(`Delete the “${v.label}” version of “${t.title}”?\n\nIts comments and share links go too. The audio file stays in your Drive.`)) return;
  try {
    await run('deleteVersion', BOOT.key, vid);
    if (S.now && S.now.v.version_id === vid) stopPlayback();
    S.queue = (S.queue || []).filter(x => x !== vid);
    S.lib.versions = S.lib.versions.filter(x => x.version_id !== vid);
    S.lib.shares = (S.lib.shares || []).filter(s => !(s.target_type === 'version' && s.target_id === vid));
    const d = S.draft.find(x => x.track_id === t.track_id);
    if (d) { d.hiddenVersions = d.hiddenVersions.filter(x => x !== vid); if (d.primary === vid) d.primary = (versionsOf(d.track_id, true)[0] || {}).version_id; }
    libCacheSet(S.lib); $('#editList').innerHTML = editRows(); chapRender(); toast('Version deleted');
  } catch (e) { toast(e.message || 'Could not delete the version'); }
}
function openDeleteRelease() {
  const r = rel(S.releaseId), n = tracksOf(r.release_id, true).length;
  $('#modal').innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mTitle"><h2 id="mTitle">Delete “${esc(r.title)}”?</h2>
    <p>This removes the release page, its ${n} ${n === 1 ? 'song' : 'songs'}, every version, and all the comments, photos and videos on it, plus every share link for it. It can't be undone from the app.</p>
    <p class="cs">A backup copy of your Sheet is saved first. Audio and image files stay in your Drive.</p>
    <label>Type <b>${esc(r.title)}</b> to confirm<input class="field" id="delConfirm" autocomplete="off" autocapitalize="off"></label>
    <p class="err" id="delErr" hidden></p>
    <div class="end"><button class="pill soft" data-close>Cancel</button><button class="pill main danger" data-del-release-go disabled>Delete forever</button></div></div>`;
  $('#modal').hidden = false; $('#delConfirm').focus();
}
function dropReleaseLocal(id) {
  const tids = new Set(S.lib.tracks.filter(t => t.release_id === id).map(t => t.track_id));
  const vids = new Set(S.lib.versions.filter(v => tids.has(v.track_id)).map(v => v.version_id));
  if (S.now && tids.has(S.now.t.track_id)) stopPlayback();
  S.queue = (S.queue || []).filter(v => !vids.has(v));
  S.lib.releases = S.lib.releases.filter(r => r.release_id !== id);
  S.lib.tracks = S.lib.tracks.filter(t => !tids.has(t.track_id)); S.lib.versions = S.lib.versions.filter(v => !vids.has(v.version_id));
  S.lib.extras = (S.lib.extras || []).filter(x => x.release_id !== id);
  S.lib.shares = (S.lib.shares || []).filter(s => !((s.target_type === 'release' && s.target_id === id) || (s.target_type === 'track' && tids.has(s.target_id)) || (s.target_type === 'version' && vids.has(s.target_id))));
  S.lib.releases.forEach(r => { if (r.bsides_of === id) r.bsides_of = ''; });
  (S.lib.playlists || []).forEach(p => { p.tracks = (p.tracks || []).filter(t => !tids.has(t)); });
  libCacheSet(S.lib);
}
async function deleteReleaseGo(btn) {
  const r = rel(S.releaseId); btn.disabled = true; btn.textContent = 'Deleting…';
  try {
    const out = await run('deleteRelease', BOOT.key, r.release_id, $('#delConfirm').value);
    closeModal(); S.editing = false; S.pdraft = null; S.vdraft = null; S.chaps = null;
    dropReleaseLocal(r.release_id); renderLibrary();
    toast(`“${out.title}” deleted${out.backedUp ? '. A backup of your Sheet was saved first.' : '. (The backup could not be made, so check your backups.)'}`);
  } catch (e) { btn.disabled = false; btn.textContent = 'Delete forever'; const er = $('#delErr'); er.hidden = false; er.textContent = e.message || 'Could not delete it.'; }
}
async function removeTrackVideo(tid) {
  const t = trk(tid);
  if (!confirm(`Remove the video from “${t.title}”? The song stays.`)) return;
  try { await run('saveTrackDetails', BOOT.key, tid, { video_url: '' }); t.video_url = ''; libCacheSet(S.lib); renderRelease(S.releaseId); toast('Video removed'); }
  catch (e) { toast(e.message || 'Could not remove the video'); }
}
async function removePhotoEdit(id) {
  if (!confirm('Remove this photo from the release page? The file stays in your Drive.')) return;
  try {
    await run('deleteExtra', BOOT.key, id);
    S.lib.extras = S.lib.extras.filter(x => x.extra_id !== id);
    if (S.pdraft) S.pdraft.list = S.pdraft.list.filter(p => p.id !== id);
    const body = $('[data-panel="photos"] .pbody'); if (body) { body.innerHTML = S.pdraft.list.length ? photoEditor(rel(S.releaseId)) : '<p class="cs">No photos left.</p>'; if ($('#pEditList')) makeSortable($('#pEditList'), pMoveTo); loadPhotos(); }
    toast('Photo removed');
  } catch (e) { toast(e.message || 'Could not remove the photo'); }
}

/* ── a series asks: play it all, or one project ── */
function openSeriesChooser(name) {
  const parts = seriesParts(name); if (!parts.length) return;
  const can = p => OWNER || !p.locked, n = parts.filter(can).length;
  $('#modal').innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mTitle">
    <h2 id="mTitle">${esc(name)}</h2><p class="cs">${parts.length} parts. Play the whole series in order, or pick one project.</p>
    <button class="pill main serall" data-ser-all="${esc(name)}"${n ? '' : ' disabled'}>${I.play}Play the whole series</button>
    <ol class="serparts" aria-label="Projects in ${esc(name)}">${parts.map(p => `<li><div class="sp"><img class="art${sealedCov(p)}" data-cover="${esc(p.cover_file_id)}" alt="">
      <div style="min-width:0"><div class="st">${esc((partLabel(p) ? partLabel(p) + ': ' : '') + p.title)}</div><div class="cs">${esc(partSub(p))}</div></div>
      ${can(p) ? `<button class="pill soft" data-ser-play="${esc(p.release_id)}" aria-label="Play ${esc(p.title)}">${I.play}Play</button>` : ''}
      <button class="pill soft" data-ser-open="${esc(p.release_id)}" aria-label="${can(p) ? 'Open ' : 'See the countdown for '}${esc(p.title)}">${can(p) ? 'Open' : 'Countdown'}</button></div></li>`).join('')}</ol>
    <div class="end"><button class="pill soft" data-close>Cancel</button></div></div>`;
  $('#modal').hidden = false; loadCovers();
  const f = $('#modal .serall:not([disabled])') || $('#modal [data-close]'); f.focus();
}
function playSeriesAll(name) {
  const q = []; seriesParts(name).filter(p => OWNER || !p.locked).forEach(p => q.push(...releaseQueue(p.release_id)));
  if (!q.length) return toast('Nothing to play yet');
  closeModal(); playQueue(q, 0); toast(`Playing ${name}, in order`);
}


/* ═════════ Build 56: four-button bar, fast photos, playlists live on release pages ═════════ */
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  /* fan/mobile bar: four equal buttons that fill the width exactly */
  @media (min-width: 0px) {
    .tabs.four { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); align-items: center; justify-content: stretch; padding: 6px 2px calc(6px + env(safe-area-inset-bottom)); }
    .tabs.four button { min-width: 0; width: 100%; min-height: 52px; padding: 4px 2px; align-content: center; font-size: 11px; white-space: nowrap; }
    .tabs.four .homebtn { position: static; margin-top: 0; width: 100%; height: auto; min-width: 0; border-radius: 0; background: none; box-shadow: none; color: var(--text); place-items: initial; justify-items: center; align-content: center; }
    .tabs.four .homebtn[aria-current="page"] { color: var(--red-hi); }
    .tabs.four .homebtn span { position: static; width: auto; height: auto; overflow: visible; clip: auto; }
    .tabs.four .homebtn svg { box-sizing: content-box; width: 16px; height: 16px; padding: 6px; margin: -3px 0; border-radius: 50%; color: #fff;
                              background: linear-gradient(135deg, var(--red-hi), var(--red) 55%, var(--red-lo)); box-shadow: 0 6px 14px -6px rgba(210,16,52,.95); }
  }
  /* playlists shown on a release page */
  .plblock { margin: 8px 0 22px; }
  .plbh { display: grid; grid-template-columns: 96px minmax(0,1fr); gap: 14px; align-items: center; margin-bottom: 6px; }
  .plbh .plmini { padding: 0; border-radius: 12px; text-align: left; }
  .plbh .mosaic { width: 96px; }
  .plbt { font-weight: 800; font-size: 18px; overflow-wrap: anywhere; }
  .plba { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
  .plba .pill { min-height: 40px; }
  .plblock .seeall { display: inline-block; margin: 4px 0 0; }
  .plattach { display: grid; gap: 8px; }
  .plattach label { display: grid; grid-template-columns: 22px minmax(0,1fr); gap: 4px 10px; align-items: center; padding: 10px 12px; border-radius: 12px; background: rgba(255,255,255,.04); font-weight: 700; color: var(--text); }
  .plattach label .cs { grid-column: 2; font-weight: 400; }
  .plattach input { width: 18px; height: 18px; accent-color: var(--brass); }
` }));

/* ── photos: straight from Google Drive when the release is public; everything else goes the private (slower) way ── */
S.imgState = (typeof ls !== 'undefined' && ls.get('sv_imgstate', {})) || {}; S.imgPrep = {}; S.imgRetry = {}; S.imgForcedP = {};
const relPublic = r => !!r && !hidden(r) && !r.locked && !(r.unlock_at && new Date(r.unlock_at).getTime() > Date.now());
const photoDirectUrl = (id, w) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${w}`;
function preloadUrl(url) { return new Promise((res, rej) => { const i = new Image(); i.referrerPolicy = 'no-referrer'; i.onload = () => res(url); i.onerror = () => rej(new Error('img')); i.src = url; }); }
// Asks the server to open this release's pictures (it opens 25 at a time, so it may take a few rounds) and remembers which are animated.
function prepImages(relId, round) {
  if (S.imgPrep[relId]) return S.imgPrep[relId];
  return (S.imgPrep[relId] = run('prepareImages', BOOT.key, BOOT.token, relId).then(d => {
    d = d || {}; Object.assign(S.imgState, d.open || {}); ls.set('sv_imgstate', S.imgState);
    if (d.more && (round || 0) < 6) setTimeout(() => { delete S.imgPrep[relId]; prepImages(relId, (round || 0) + 1); }, 1200);
    return d;
  }).catch(() => ({})));
}
function photoP(id, size, relIdArg) {   // our own storage first; the old way (below) is the spare
  const k = id + '|' + size; if (S.coverP[k]) return S.coverP[k];
  return (S.coverP[k] = ourImage(id, size).then(u => u || (delete S.coverP[k], photoPOld(id, size, relIdArg))));
}
function photoPOld(id, size, relIdArg) {
  const k = id + '|' + size; if (S.coverP[k]) return S.coverP[k];
  const relId = relIdArg || S.releaseId, r = rel(relId);
  const slow = () => run('getCover', id, BOOT.key, BOOT.token, size);
  if (!r || !relPublic(r) || S.imgState[id] === 'anim') return (S.coverP[k] = slow());   // private release, or a GIF/AVIF: the safe way
  const w = size <= 240 ? 160 : size <= 600 ? 400 : 1600, url = photoDirectUrl(id, w);
  const go = async () => {
    try { return await preloadUrl(url); }
    catch (e) {   // it was closed again overnight: ask once, retry once, then fall back
      if (S.imgState[id] && !S.imgRetry[id]) { S.imgRetry[id] = 1; delete S.imgState[id]; delete S.imgPrep[relId]; const d = await prepImages(relId); if (d.open && d.open[id] && d.open[id] !== 'anim') { try { return await preloadUrl(url); } catch (e2) {} } }
      return slow();
    }
  };
  return (S.coverP[k] = S.imgState[id] ? go() : prepImages(relId).then(async () => {
    if (!S.imgState[id]) {   // added after the last check (or not opened yet): check again once, shared by everything that's waiting
      if (!S.imgForcedP[relId]) { delete S.imgPrep[relId]; S.imgForcedP[relId] = prepImages(relId).finally(() => setTimeout(() => { delete S.imgForcedP[relId]; }, 20000)); }
      await S.imgForcedP[relId];
    }
    return S.imgState[id] === 'anim' ? slow() : go();
  }));
}

/* ── playlists on release pages ── */
const plIdsOf = r => { const v = r && r.playlist_ids; if (Array.isArray(v)) return v; try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
const attachedPlaylists = r => plIdsOf(r).map(plOf).filter(Boolean);
function plBlock(p) {
  const ts = plTracks(p), id = esc(p.playlist_id);
  return `<div class="plblock" data-plblock="${id}" data-plctx="${id}">
    <div class="plbh"><button class="plmini" data-pl="${id}" aria-label="Open the playlist ${esc(p.title)}">${mosaic(ts)}</button>
      <div style="min-width:0"><div class="plbt">${esc(p.title)}</div><div class="cs">${songs(ts.length)}${OWNER ? ' · ' + (p.fans ? 'fan club' : 'private') : ''}</div>
        ${p.description ? `<div class="cs" style="white-space:pre-line">${esc(p.description)}</div>` : ''}
        <div class="plba">${ts.length ? `<button class="pill soft" data-pl-play-id="${id}">${I.play}Play</button>` : ''}<button class="pill soft" data-pl="${id}">Open</button></div></div></div>
    ${ts.length ? `<ol class="tracks">${ts.slice(0, 6).map((t, i) => trackRow(t, true).replace(/<span class="n">[^<]*<\/span>/, `<span class="n">${i + 1}</span>`)).join('')}</ol>
      ${ts.length > 6 ? `<button class="seeall" data-pl="${id}">See all ${ts.length} songs</button>` : ''}` : '<p class="cs">No songs in this playlist yet.</p>'}</div>`;
}
function playlistsSection(r) {
  const ps = attachedPlaylists(r); if (!ps.length) return '';
  return `<section id="era-playlists" class="erasec"><h2 class="sh"><span><b>Playlists</b></span></h2>${ps.map(plBlock).join('')}</section>`;
}
function plAttachEditor(r) {
  S.plattach = plIdsOf(r).filter(id => plOf(id));
  const ps = S.lib.playlists || [];
  if (!ps.length) return '<p class="cs" style="margin:0">No playlists yet. Make one from any song\'s ⋯ menu › <b>Add to playlist…</b>, then come back to show it here.</p>';
  return `<p class="cs" style="margin:0">Tick the playlists to show on this release's page. They stay in sync: when a playlist changes, this page changes with it.</p>
    <div class="plattach">${ps.map(p => `<label><input type="checkbox" data-plattach="${esc(p.playlist_id)}"${S.plattach.includes(p.playlist_id) ? ' checked' : ''}>
      <span>${esc(p.title)}</span><span class="cs">${songs((p.tracks || []).length)} · ${p.fans ? 'shared with the fan club' : "private: fans won't see it on this page until you share it"}</span></label>`).join('')}</div>`;
}
// Swap in fresh playlist data wherever it's on screen, keeping your place
function refreshPlaylistViews() {
  const y = window.scrollY;
  if (S.view === 'release' && !S.editing) {
    const r = rel(S.releaseId); if (!r) return;
    const html = playlistsSection(r), cur = $('#era-playlists');
    if (cur && html) { cur.outerHTML = html; loadCovers(); markPlaying(); }
    else if (cur || html) renderRelease(S.releaseId);   // a section appeared or went away
  } else if (S.view === 'playlist' && !S.plEditing) { if (plOf(S.plId)) renderPlaylist(S.plId); else renderLibrary(); }
  else if (S.view === 'library') renderLibrary(true);
  window.scrollTo(0, y);
}
async function syncCatalog() {
  const d = BOOT.token ? await run('getShare', BOOT.token) : await run('getLibrary', BOOT.key);
  if (!d || d.error) return;
  S.lib = normalizeLib(d); primeThumbs(); libCacheSet(d);
}
async function applyPlaylistUpdate(d) {
  const sig = JSON.stringify([(d.playlists || []).map(p => [p.playlist_id, p.title, p.description, p.tracks, p.fans]), d.attach || {}]);
  if (sig === S.plSig) return; S.plSig = sig;
  // a song we haven't downloaded yet? refresh the catalog first, then apply the playlist changes on top of it
  if ((d.playlists || []).some(p => (p.tracks || []).some(t => !trk(t)))) { try { await syncCatalog(); } catch (e) {} }
  S.lib.playlists = d.playlists || [];
  S.lib.releases.forEach(r => { const a = (d.attach || {})[r.release_id]; if (a) r.playlist_ids = JSON.stringify(a); else if (!r.locked) r.playlist_ids = ''; });
  refreshPlaylistViews();
}
async function pollPlaylists(force) {
  if (document.hidden || S.polling || S.editing) return;
  const watching = (S.view === 'release' && plIdsOf(rel(S.releaseId)).length) || S.view === 'playlist';
  if (!watching && !force) return;
  S.polling = true;
  try { const d = await run('getPlaylists', BOOT.key, BOOT.token); if (d && !d.error) await applyPlaylistUpdate(d); } catch (e) {} finally { S.polling = false; }
}
setInterval(() => pollPlaylists(), 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) pollPlaylists(); });


/* ═════════ Build 57: sturdier song rows, unreleased tags, audio notes, Compilation filter ═════════ */
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  /* song row: cover and title side by side; the title can never outgrow its column, in any browser */
  .row .thead { display: flex; gap: 10px; align-items: flex-start; min-width: 0; }
  .row .thead .tthumb { float: none; margin: 2px 0 0; flex: 0 0 38px; }
  .row .tname { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px; flex: 1 1 0; min-width: 0; }
  .row .tname .tt { display: block; flex: 0 1 auto; min-width: 0; max-width: 100%; text-align: left; white-space: normal; overflow: visible; text-overflow: clip; overflow-wrap: anywhere; word-break: break-word; }
  .row .tname .vbadge { margin-left: 0; }
  /* the section bar is solid behind the pills, so nothing shows through */
  .eranav { padding: 10px 4px 18px; margin-bottom: -8px; background: linear-gradient(var(--bg) calc(100% - 16px), transparent); }
  .unrel { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 800; letter-spacing: .04em;
           background: rgba(240,122,58,.18); color: #FFD3B8; border: 1px solid rgba(240,122,58,.4); white-space: nowrap; }
  .gtag.unrel { background: rgba(240,122,58,.18); color: #FFD3B8; border-color: rgba(240,122,58,.4); }
  .tag.unrelt { background: rgba(240,122,58,.22); color: #FFD3B8; }
  .notes { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .note { display: grid; grid-template-columns: minmax(0,1fr) auto auto; gap: 10px; align-items: start; padding: 12px; border-radius: 14px; background: rgba(255,255,255,.04); border: 1px solid var(--line); }
  .note .nt { font-weight: 800; overflow-wrap: anywhere; }
  .note .pill { min-height: 40px; }
  .notebox audio { width: 100%; margin-top: 8px; }
` }));
const isUnrel = x => !!x && (x.unreleased === true || String(x.unreleased) === 'true' || x.type === 'Unreleased');
const unrelTag = x => isUnrel(x) ? '<div class="gtags"><span class="gtag unrel">Unreleased</span></div>' : '';

/* ── audio notes: radio clips, behind-the-scenes voice notes ── */
function notesSection(r) {
  const ns = extrasOf(r.release_id, 'note'); if (!ns.length) return '';
  return `<section id="era-notes" class="erasec"><h2 class="sh"><span><b>Audio</b> notes</span></h2><ul class="notes">${ns.map(x => `<li class="note" data-note="${esc(x.extra_id)}">
    <div style="min-width:0"><div class="nt">${esc(x.title)}</div>${x.description ? `<div class="cs">${esc(x.description)}</div>` : ''}<div class="notebox"></div></div>
    <button class="pill soft" data-note-play="${esc(x.extra_id)}" aria-label="Play ${esc(x.title)}">${I.play}Play</button>
    ${OWNER ? `<button class="ib" data-xdel="${esc(x.extra_id)}" aria-label="Remove ${esc(x.title)} from this release">${I.trash}</button>` : ''}</li>`).join('')}</ul></section>`;
}
async function playNote(id, btn) {
  const x = (S.lib.extras || []).find(e => e.extra_id === id); if (!x) return;
  const box = btn.closest('.note').querySelector('.notebox'), cur = box.querySelector('audio');
  if (cur) { if (cur.paused) cur.play().catch(() => {}); else cur.pause(); return; }
  btn.disabled = true;
  try {
    const src = await sourceFor(x.file_id, false, false);
    const a = document.createElement('audio'); a.controls = true; a.preload = 'auto'; a.src = src.stream; a.setAttribute('aria-label', 'Audio note: ' + x.title);
    a.addEventListener('play', () => { audio.pause(); $$('.notebox audio').forEach(o => { if (o !== a) o.pause(); }); });
    box.appendChild(a); btn.hidden = true; a.play().catch(() => {});   // if the phone blocks autoplay, the player's own play button is right there
  } catch (e) { btn.disabled = false; toast(e.message || 'Could not play this note'); }
}
audio.addEventListener('play', () => $$('.notebox audio').forEach(a => a.pause()));
function openNoteUpload() {
  $('#modal').innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mTitle"><h2 id="mTitle">Add an audio note</h2>
    <p class="cs">A radio clip, a behind-the-scenes voice note, an interview snippet: any MP3, M4A or WAV. Fans who can see this release can play it.</p>
    <label>Audio file<input class="field" type="file" id="ntFile" accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac"></label>
    <label>Title<input class="field" id="ntTitle" maxlength="200" placeholder="e.g. Hot 97 radio clip"></label>
    <label>Short note (optional)<input class="field" id="ntDesc" maxlength="500" placeholder="Where or when it's from"></label>
    <div class="prog" id="ntProg" hidden><div class="bar"><i id="ntBar"></i></div><p class="cs" id="ntStat" role="status" aria-live="polite"></p></div>
    <p class="err" id="ntErr" hidden></p>
    <div class="end"><button class="pill soft" data-close>Cancel</button><button class="pill main" data-note-go>Upload</button></div></div>`;
  $('#modal').hidden = false; $('#ntFile').focus();
}
async function uploadNote(btn) {
  const f = $('#ntFile').files[0], err = $('#ntErr');
  if (!f) { err.hidden = false; err.textContent = 'Choose an audio file.'; return; }
  if (!/^audio\//.test(f.type) && !/\.(mp3|m4a|wav|aac|ogg|flac|aif|aiff|caf)$/i.test(f.name)) { err.hidden = false; err.textContent = "That doesn't look like an audio file. Use an MP3, M4A or WAV."; return; }
  btn.disabled = true; err.hidden = true; $('#ntProg').hidden = false; $('#ntStat').textContent = 'Uploading…';
  try {
    const ticket = await run('getUploadTicket', BOOT.key, S.releaseId);
    const id = await driveUpload(f, f.name, f.type || 'audio/mpeg', ticket, p => $('#ntBar').style.setProperty('--p', Math.round(p * 100)));
    const x = await run('addAudioNote', BOOT.key, S.releaseId, id, $('#ntTitle').value.trim(), $('#ntDesc').value.trim());
    (S.lib.extras = S.lib.extras || []).push(x); closeModal(); renderRelease(S.releaseId); toast('Audio note added');
    const sec = $('#era-notes'); if (sec) sec.scrollIntoView();
  } catch (e) { btn.disabled = false; $('#ntProg').hidden = true; err.hidden = false; err.textContent = e.message || 'The upload did not finish.'; }
}


/* ═════════ Build 58: YouTube playlists and releases, more covers ═════════ */
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  .morecov { display: grid; gap: 10px; padding: 12px; border-radius: 12px; background: rgba(255,255,255,.03); border: 1px solid var(--line); }
  .morecov .lbl { font-size: 13px; font-weight: 600; color: var(--dim); }
  .covlist { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .covlist li { display: grid; grid-template-columns: 48px minmax(0,1fr) auto auto; gap: 8px; align-items: center; padding: 8px; border-radius: 12px; background: rgba(255,255,255,.04); }
  .covlist .art { width: 48px; height: 48px; border-radius: 8px; object-fit: cover; }
  .covlist .cs { overflow-wrap: anywhere; }
  .covlist .pill { min-height: 40px; padding: 0 12px; }
  .covadd { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px; align-items: center; }
  .chapcover { width: 32px; height: 32px; border-radius: 6px; object-fit: cover; vertical-align: middle; margin-right: 8px; }
  .tabcover { display: flex; gap: 12px; align-items: center; margin: 2px 0 12px; }
  .tabcover .art { width: 64px; height: 64px; border-radius: 10px; object-fit: cover; }
  .covcycle { position: absolute; right: 10px; bottom: 10px; z-index: 3; min-height: 32px; padding: 5px 12px; border-radius: 999px; background: rgba(8,8,9,.85); color: #fff;
              font-size: 12px; font-weight: 800; border: 1px solid rgba(255,255,255,.2); }
  @media (min-width: 0px) { .covlist li { grid-template-columns: 48px minmax(0,1fr) auto; } .covlist li .pill { grid-column: 2; justify-self: start; } .covlist li .ib { grid-column: 3; grid-row: 1; } }
` }));
if (!$('#covFile')) document.body.appendChild(Object.assign(document.createElement('input'), { type: 'file', id: 'covFile', accept: 'image/jpeg,image/png,image/webp', hidden: true }));

/* ── covers: a clean version's extra covers, Drafts, B-Sides, and each chapter ── */
S.coverIdx = {}; S.xcov = {};
const coversOf = r => { const v = r && r.extra_covers; if (Array.isArray(v)) return v; try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a.filter(c => c && c.id && c.for) : []; } catch (e) { return []; } };
const coverList = (r, target) => { const more = coversOf(r).filter(c => c.for === target).map(c => c.id); return (target === 'clean' ? [r && r.clean_cover_file_id].concat(more) : more).filter(Boolean); };
const coverTargetLabel = t => t === 'clean' ? 'Clean version (another cover)' : t === 'deluxe' ? 'Drafts' : t === 'bsides' ? 'B-Sides' : String(t).startsWith('ch:') ? 'Chapter: ' + String(t).slice(3) : String(t);
function registerXCovers() { S.xcov = {}; (S.lib.releases || []).forEach(r => coversOf(r).forEach(c => { S.xcov[c.id] = r.release_id; })); }
// Which cover fits what's playing: the song's own, then the clean version's, then its chapter's, then Drafts / B-Sides, then the release cover
function artTarget(t, v) {
  if (t && t.track_cover) return { id: t.track_cover, target: '', n: 1, i: 0, rel: t.release_id };
  const r = (t && rel(t.release_id)) || {};
  const pick = target => { const l = coverList(r, target); if (!l.length) return null; const i = (S.coverIdx[r.release_id + '|' + target] || 0) % l.length; return { id: l[i], target, n: l.length, i, rel: r.release_id }; };
  let x = null;
  if (v && isCleanVer(v)) x = pick('clean');
  if (!x && t && String(t.chapter || '').trim()) x = pick('ch:' + String(t.chapter).trim());
  if (!x && t) x = t.category === 'Deluxe' ? pick('deluxe') : t.category === 'B-Side' ? pick('bsides') : null;
  return x || { id: r.cover_file_id || '', target: '', n: 1, i: 0, rel: r.release_id };
}
function syncCoverCycle() {
  const n = S.now, box = $('#np .npmedia'); if (!n || !box) return;
  const x = artTarget(n.t, n.v); let b = $('#covCycle');
  if (x.n > 1) {
    if (!b) { b = document.createElement('button'); b.id = 'covCycle'; b.type = 'button'; b.className = 'covcycle'; b.dataset.coverCycle = '1'; box.appendChild(b); }
    b.textContent = `${x.i + 1} / ${x.n}`; b.setAttribute('aria-label', `Cover ${x.i + 1} of ${x.n}. Tap for the next cover.`); b.hidden = false;
  } else if (b) b.hidden = true;
}
const __updateNow = updateNowUI;
updateNowUI = function () { __updateNow(); syncCoverCycle(); };
function cycleCover() {
  const n = S.now; if (!n) return; const x = artTarget(n.t, n.v); if (x.n < 2) return;
  S.coverIdx[x.rel + '|' + x.target] = (x.i + 1) % x.n; updateNowUI();
}
const chapCover = name => { const id = coverList(rel(S.releaseId), 'ch:' + name)[0]; return id ? `<img class="chapcover" data-cover="${esc(id)}" alt="">` : ''; };
function moreCoversEditor(r) {
  const list = coversOf(r), chapters = [...new Set(tracksOf(r.release_id, true).map(t => String(t.chapter || '').trim()).filter(Boolean))];
  const targets = [['clean', 'Clean version (another cover)'], ['deluxe', 'Drafts'], ['bsides', 'B-Sides']].concat(chapters.map(c => ['ch:' + c, 'Chapter: ' + c]));
  const first = c => coversOf(r).find(x => x.for === c.for) === c;
  return `<div class="morecov" id="moreCov"><span class="lbl">More covers: a second one for the clean version, Drafts, B-Sides, or a chapter. The first one for each is the main one.</span>
    ${list.length ? `<ul class="covlist">${list.map(c => `<li><img class="art" data-cover="${esc(c.id)}" alt=""><span class="cs">${esc(coverTargetLabel(c.for))}</span>
      ${c.for === 'clean' || !first(c) ? `<button class="pill soft" type="button" data-cov-main="${esc(c.id)}">Make main</button>` : '<span></span>'}
      <button class="ib" type="button" data-cov-del="${esc(c.id)}" aria-label="Remove this ${esc(coverTargetLabel(c.for))} cover">${I.trash}</button></li>`).join('')}</ul>` : ''}
    <div class="covadd"><select class="field" id="covTarget" aria-label="What is the new cover for?">${targets.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>
      <button class="pill soft" type="button" data-cov-pick>${I.img}Add a cover</button></div></div>`;
}
function afterCoversChange(r) {
  registerXCovers(); const el = $('#moreCov'); if (el) el.outerHTML = moreCoversEditor(r);
  loadCovers(); if (S.now && S.now.r.release_id === r.release_id) updateNowUI();
}
$('#covFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const r = rel(S.releaseId), target = ($('#covTarget') || {}).value || 'deluxe';
  toast('Uploading the cover…');
  try {
    const data = await shrinkImage(f), out = await run('addCover', BOOT.key, r.release_id, target, data);
    r.extra_covers = out.covers; S.covers[out.id] = data; S.coverP[out.id] = Promise.resolve(data);   // show it straight away
    afterCoversChange(r); toast('Cover added');
  } catch (err) { toast(err.message || 'The cover did not upload.'); }
});
async function makeMainCover(id) {
  const r = rel(S.releaseId);
  try { const out = await run('setMainCover', BOOT.key, r.release_id, id); r.extra_covers = out.covers; r.clean_cover_file_id = out.clean_cover_file_id; r.clean_cover_thumb = out.clean_cover_thumb; afterCleanCover(r); afterCoversChange(r); toast('Made the main cover'); }
  catch (e) { toast(e.message || 'Could not change it'); }
}
async function removeMoreCover(id) {
  if (!confirm('Remove this cover?')) return;
  const r = rel(S.releaseId);
  try { const out = await run('removeCover', BOOT.key, r.release_id, id); r.extra_covers = out.covers; S.coverIdx = {}; afterCoversChange(r); toast('Cover removed'); }
  catch (e) { toast(e.message || 'Could not remove it'); }
}

