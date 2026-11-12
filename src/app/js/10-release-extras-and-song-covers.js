/* ═════════ Release pages as eras ═════════ */
const extrasOf = (rid, kind) => (S.lib.extras || []).filter(x => x.release_id === rid && (!kind || x.kind === kind));
const safeHref = u => /^https?:\/\//i.test(String(u || '')) ? String(u) : '#';
const delBtn = id => `<button class="ib xdel" data-xdel="${esc(id)}" aria-label="Remove this item">${I.trash}</button>`;
function creditLines(txt) {
  return String(txt || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const i = l.indexOf(':'); return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : ['', l];
  });
}
function eraVideos(r, ts) {
  const v = ts.filter(t => videoOf(t)).map(t => ({ kind: 'track', id: videoOf(t), title: t.title, tid: t.track_id }));
  ts.forEach(t => { const id = srVideo(t); if (id && id !== videoOf(t)) v.push({ kind: 'extra', id, list: '', title: t.title + ' (Slowed + Reverb)', xid: 'sr_' + t.track_id }); });
  extrasOf(r.release_id, 'video').forEach(x => { const id = ytId(x.url), list = ytList(x.url); if (id || list) v.push({ kind: 'extra', id, list, title: x.title || (list ? 'Playlist' : 'Video'), xid: x.extra_id }); });
  return v;
}
function eraNav(r, ts) {
  const items = [['songs', 'Songs', true], ['videos', 'Videos', eraVideos(r, ts).length > 0], ['playlists', 'Playlists', attachedPlaylists(r).length > 0], ['notes', 'Audio', extrasOf(r.release_id, 'note').length > 0],
    ['about', 'About', !!(String(r.world_story || '').trim() || String(r.world_mood || '').trim() || String(r.album_credits || '').trim())],
    ['photos', 'Photos', extrasOf(r.release_id, 'photo').length > 0], ['reviews', 'Reviews', extrasOf(r.release_id, 'review').length > 0],
    ['apps', 'Apps', extrasOf(r.release_id, 'app').length > 0]].filter(x => x[2]);
  if (items.length < 2 && !OWNER) return '';
  return `<nav class="eranav" aria-label="Sections of ${esc(r.title)}">${items.map(([id, l]) => `<button data-era="${id}">${l}</button>`).join('')}
    ${OWNER ? `<button class="add" data-era-add>${I.plus}Add to this era</button>` : ''}</nav>`;
}
// Long one-word titles (like #ROADTO100SHOWS) shrink to fit one line instead of breaking mid-word.
function fitTitle() {
  const h = $('.hero h1'); if (!h) return;
  h.style.fontSize = ''; h.classList.remove('squeeze');
  let size = parseFloat(getComputedStyle(h).fontSize);
  const words = h.textContent.split(/\s+/);
  const tooWide = () => words.length === 1 && h.scrollWidth > h.clientWidth + 1;
  while (tooWide() && size > 22) { size -= 1; h.style.fontSize = size + 'px'; }
  if (h.scrollWidth > h.clientWidth + 1) h.classList.add('squeeze');
}
window.addEventListener('resize', () => { if (S.view === 'release') fitTitle(); });

function songsSection(ts) {
  const L = songListsFor(S.releaseId), comps = companionsOf(S.releaseId);
  const tabs = [['full', 'Full project', L.full], ['deluxe', 'Drafts', L.deluxe], ['singles', 'Singles', L.singles], ['bsides', 'B-Sides', L.bsides]].filter(x => x[2].length);
  if (!L[S.songTab] || !L[S.songTab].length) S.songTab = tabs.length ? tabs[0][0] : 'full';
  const cur = L[S.songTab] || [];
  let html = S.songTab === 'bsides' && comps.length ? `<div class="compnote">Includes the songs from ${comps.map(c => `<button class="pill soft" data-rel="${esc(c.release_id)}">${esc(c.title)} →</button>`).join('')}</div>` : '';
  const tabCov = (S.songTab === 'deluxe' || S.songTab === 'bsides') ? coverList(rel(S.releaseId), S.songTab)[0] : '';
  if (tabCov) html += `<div class="tabcover"><img class="art" data-cover="${esc(tabCov)}" alt=""><span class="cs">${S.songTab === 'deluxe' ? 'Drafts' : 'B-Sides'} cover</span></div>`;
  const useChapters = S.songTab === 'full' || S.songTab === 'deluxe';
  let chapN = 0;
  (useChapters ? chapterGroups(cur) : [{ name: '', items: cur }]).forEach(g => {
    const rows = `<ol class="tracks">${g.items.map(t => trackRow(t, t.release_id !== S.releaseId)).join('')}</ol>`;
    if (!g.name) { html += rows; return; }
    const rt = fmtRuntime(runtimeOf(g.items));
    const cc = chapColors(rel(S.releaseId))[g.name] || CHAP_PALETTE[chapN % CHAP_PALETTE.length]; chapN++;   // same default as the editor
    html += `<section class="chap" aria-label="${esc(g.name)}"${chapStyle(cc)}><h3 class="chapter"><span>${chapCover(g.name)}${esc(g.name)}</span><span class="chapmeta">${songs(g.items.length)}${rt ? ' · ' + rt : ''}</span></h3>
      ${(() => { const cm = chapMeta(rel(S.releaseId))[g.name] || {}, tid = cm.trailer ? ytId(cm.trailer) : '';
        return (cm.desc ? `<p class="chapdesc">${esc(cm.desc)}</p>` : '') + (tid ? `<button class="pill soft chaptrail" data-xvideo="${esc(tid)}" data-xtitle="${esc(g.name)}: trailer">${I.play}Watch the ${esc(g.name)} trailer</button>` : ''); })()}
      ${rows}<div class="chapend" aria-hidden="true">End of ${esc(g.name)}</div></section>`;
  });
  const bar = tabs.length > 1 ? `<div class="songtabs" role="group" aria-label="Show songs from">${tabs.map(([k, l, a]) =>
    `<button data-songtab="${k}" aria-pressed="${k === S.songTab}">${l} <span class="n">${a.length}</span></button>`).join('')}</div>` : '';
  return `<section id="era-songs" class="erasec">${bar}${html.replace('<ol class="tracks"></ol>', '')}</section>`;
}
function aboutSection(r) {
  const story = String(r.world_story || '').trim(), moods = String(r.world_mood || '').split(',').map(x => x.trim()).filter(Boolean), cr = creditLines(r.album_credits);
  if (!story && !moods.length && !cr.length) {
    return OWNER ? `<section id="era-about" class="erasec"><button class="letter empty" data-world-edit>${I.edit}<span>Add a description, mood words and album credits for this era.</span></button></section>` : '';
  }
  const long = story.length > 600;
  return `<section id="era-about" class="erasec about"><h2 class="sh"><span><b>About</b> ${esc(r.title)}</span>${OWNER ? '<button class="seeall" data-world-edit>Edit</button>' : ''}</h2>
    ${moods.length ? `<div class="wmoods">${moods.map(m => `<i>${esc(m)}</i>`).join('')}</div>` : ''}
    ${story ? `<div class="story${long ? '' : ' open'}" id="story">${paras(story)}</div>${long ? '<button class="seeall" data-story="1">Read more</button>' : ''}` : ''}
    ${cr.length ? `<h3 class="subh">Album credits</h3><dl class="credits">${cr.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${linkifyText(v)}</dd>`).join('')}</dl>` : ''}
  </section>`;
}
function linkCards(r, kind, heading) {
  const xs = extrasOf(r.release_id, kind); if (!xs.length) return '';
  return `<section id="era-${kind}s" class="erasec"><h2 class="sh"><span>${heading}</span></h2>
    <div class="lcards">${xs.map(x => `<div class="lcwrap"><a class="lcard" href="${esc(safeHref(x.url))}" target="_blank" rel="noopener noreferrer">
      ${x.image ? `<img src="${esc(x.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-i="${esc((x.site || '?').charAt(0).toUpperCase())}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'lph',textContent:this.dataset.i}))">` : `<span class="lph" aria-hidden="true">${esc((x.site || '?').charAt(0).toUpperCase())}</span>`}
      <span class="ltext"><span class="lsite">${esc(x.site || '')}</span><strong>${esc(x.title || x.url)}</strong>${x.description ? `<span class="ldesc">${esc(x.description)}</span>` : ''}</span></a>
      ${OWNER ? delBtn(x.extra_id) : ''}</div>`).join('')}</div></section>`;
}
function loadPhoto(img) {
  photoP(img.dataset.photoSrc, 600).then(u => { if (u) img.src = u; }).catch(() => {});
}
// Photos load as they come into view, so a big gallery doesn't fire every request at once.
function loadPhotos() {
  const imgs = [...$$('img[data-photo-src]')];
  if (!('IntersectionObserver' in window)) { imgs.forEach(loadPhoto); return; }
  if (S.photoObs) S.photoObs.disconnect();
  S.photoObs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { S.photoObs.unobserve(e.target); loadPhoto(e.target); } }), { rootMargin: '400px 0px' });
  imgs.forEach(i => S.photoObs.observe(i));
}
function openXVideo(id, title) {
  audio.pause();
  $('#modal').innerHTML = `<div class="sheet wide" role="dialog" aria-modal="true" aria-labelledby="mTitle"><h2 id="mTitle">${esc(title)}</h2>
    <div class="npvid"><iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0&modestbranding=1" title="Video: ${esc(title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>
    <div class="end"><button class="pill soft" data-close>Close</button></div></div>`;
  $('#modal').hidden = false; award('video');
}

/* song page: tap a title */
function openSong(tid) {
  const t = trk(tid), r = rel(t.release_id), vs = versionsOf(tid), p = vs[0];
  const rows = CREDIT_FIELDS.filter(([k]) => creditVal(t, k)), ly = plainLyrics(t.lyrics);
  $('#modal').innerHTML = `<div class="sheet wide song" role="dialog" aria-modal="true" aria-labelledby="mTitle">
    <div class="shead"><img class="art" id="songArt" alt="">
      <div style="min-width:0"><div class="kind">${esc(r.title)}${numLabel(t) ? ', track ' + esc(numLabel(t)) : ''}</div><h2 id="mTitle">${esc(t.title)}</h2>
      <div class="cs">by ${linkName(artistOf(t) || relArtist(r))}</div>${unrelTag(t)}${genreTags(songGenre(t))}
      ${vs.some(isExclusive) ? `<span class="exbadge">${I.star}Exclusive</span>` : ''}</div></div>
    <div class="acts"><button class="pill main" data-song-play="${esc(p.version_id)}">${I.play}Play</button>
      ${videoOf(t) ? `<button class="pill soft" data-song-watch="${esc(tid)}">${I.film}Watch video</button>` : ''}
      ${t.voice_note_id ? `<button class="pill soft" data-song-voice="${esc(tid)}">${I.mic}Voice note</button>` : ''}
      ${OWNER ? `<button class="pill soft" data-song-edit="${esc(tid)}">${I.edit}Edit</button>
                 <button class="pill soft" data-song-cover="${esc(tid)}">${I.img}Song cover</button>
                 ${t.track_cover ? `<button class="pill soft" data-song-cover-del="${esc(tid)}">Remove song cover</button>` : ''}` : ''}</div>
    ${vs.length > 1 ? `<h4>Versions</h4><div class="chips">${vs.map(v => `<button class="chip${isExclusive(v) ? ' excl' : ''}" data-song-play="${esc(v.version_id)}">${isExclusive(v) ? I.star : ''}${esc(v.label)}</button>`).join('')}</div>` : ''}
    <h4>Lyrics</h4>${ly ? `<div class="lyrics">${esc(ly)}</div>` : '<p class="cs">No lyrics yet.</p>'}
    <h4>Credits</h4>${rows.length ? `<dl class="credits">${rows.map(([k, l]) => `<dt>${l}</dt><dd>${['features', 'producer', 'engineer'].includes(k) ? linkNames(creditVal(t, k)) : esc(creditVal(t, k))}</dd>`).join('')}</dl>` : '<p class="cs">No credits yet.</p>'}
    ${OWNER && String(t.notes || '').trim() ? `<h4>Private notes</h4><p class="cs">${esc(t.notes)}</p>` : ''}
    <div class="end"><button class="pill soft" data-close>Close</button></div></div>`;
  setCover($('#songArt'), artFor(t), false);
  $('#modal').hidden = false; $('#modal').querySelector('[data-song-play]').focus();
  if (ly) award('lyrics');
}

/* owner: add to this era */
function openEraAdd() {
  $('#modal').innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mTitle"><h2 id="mTitle">Add to this era</h2>
    <ul class="sheetlist">
      <li><button data-xadd="review">${I.text}Review or article link</button></li>
      <li><button data-xadd="video">${I.film}Video or whole playlist (YouTube)</button></li>
      <li><button data-xadd="app">${I.globe}App or experience link</button></li>
      <li><button data-xadd="photo">${I.img}Photos from the era</button></li>
      <li><button data-xadd="note">${I.wave}Audio note (radio clip, behind-the-scenes note)</button></li>
      <li><button data-world-edit>${I.edit}Description, mood and album credits</button></li>
    </ul><div class="end"><button class="pill soft" data-close>Close</button></div></div>`;
  $('#modal').hidden = false; $('#modal').querySelector('[data-xadd]').focus();
}
function openExtraForm(kind) {
  if (kind === 'photo') return openPhotoUpload();
  if (kind === 'note') return openNoteUpload();
  const label = { review: 'Review or article', video: 'YouTube video or playlist', app: 'App or experience' }[kind];
  $('#modal').innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mTitle"><h2 id="mTitle">Add a ${label.toLowerCase()}</h2>
    <label>Link<input class="field" id="xUrl" type="url" inputmode="url" placeholder="https://" maxlength="1000"></label>
    ${kind === 'video' ? '<p class="cs" style="margin:0">Paste one video, or a whole playlist. A playlist becomes one card that plays every video in it, and follows along when you add to it on YouTube. To get every video as its own card (so each can have its own type), use “Add each video separately”.</p>' : ''}
    <label>Title (optional: filled in from the link)<input class="field" id="xTitle" maxlength="200"></label>
    ${kind === 'app' ? '<label>Short description (optional)<input class="field" id="xDesc" maxlength="300"></label>' : ''}
    <p class="err" id="xErr" hidden></p>
    <div class="end"><button class="pill soft" data-close>Cancel</button>${kind === 'video' ? '<button class="pill soft" data-xeach hidden>Add each video separately</button>' : ''}<button class="pill main" data-xsave="${kind}">Add</button></div></div>`;
  $('#modal').hidden = false; $('#xUrl').focus();
}
async function saveExtra(kind, btn) {
  const url = $('#xUrl').value.trim(), err = $('#xErr');
  if (!/^https?:\/\//i.test(url)) { err.hidden = false; err.textContent = 'Paste a full link that starts with https://'; return; }
  if (kind === 'video' && !ytId(url) && !ytList(url)) { err.hidden = false; err.textContent = "That doesn't look like a YouTube video or playlist link."; return; }
  btn.disabled = true; btn.textContent = 'Getting the preview…';
  try {
    const x = await run('addExtra', BOOT.key, S.releaseId, { kind, url, title: $('#xTitle').value.trim(), description: $('#xDesc') ? $('#xDesc').value.trim() : '' });
    (S.lib.extras = S.lib.extras || []).push(x); closeModal(); toast('Added'); renderRelease(S.releaseId);
    const sec = $('#era-' + (kind === 'video' ? 'videos' : kind + 's')); if (sec) sec.scrollIntoView();
  } catch (e) { btn.disabled = false; btn.textContent = 'Add'; err.hidden = false; err.textContent = e.message || 'Could not add that link.'; }
}
async function removeExtra(id) {
  if (!confirm('Remove this from the release page?')) return;
  try { await run('deleteExtra', BOOT.key, id); S.lib.extras = S.lib.extras.filter(x => x.extra_id !== id); renderRelease(S.releaseId); toast('Removed'); }
  catch (e) { toast('Could not remove'); }
}
function openPhotoUpload() {
  $('#modal').innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mTitle"><h2 id="mTitle">Photos from the era</h2>
    <p class="cs">Pick one or many. Large photos are resized to 2400px so they load quickly; GIFs stay animated.</p>
    <label>Photos (JPG, PNG, WebP, GIF or HEIC)<input class="field" type="file" id="phFiles" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif" multiple></label>
    <div class="prog" id="phProg" hidden><div class="bar"><i id="phBar"></i></div><p class="cs" id="phStat" role="status" aria-live="polite"></p></div>
    <p class="err" id="phErr" hidden></p>
    <div class="end"><button class="pill soft" data-close>Cancel</button><button class="pill main" data-ph-go>Upload</button></div></div>`;
  $('#modal').hidden = false; $('#phFiles').focus();
}
async function uploadPhotos(btn) {
  const files = [...$('#phFiles').files].filter(f => /^image\//.test(f.type) || isHeic(f)), err = $('#phErr');
  if (!files.length) { err.hidden = false; err.textContent = 'Choose at least one photo.'; return; }
  btn.disabled = true; $('#phProg').hidden = false; S.photoBusy = true;
  let done = 0; const failed = [];
  for (const f of files) {
    $('#phStat').textContent = `Uploading ${done + failed.length + 1} of ${files.length}…`;
    try {
      let blob = f, name = f.name;
      if (f.type !== 'image/gif') {
        try {
          const d = await shrinkImage(f, 2400, 0.88);   // Safari can read HEIC and turns it into a JPG here
          blob = await (await fetch(d)).blob(); name = f.name.replace(/\.[^.]+$/, '') + '.jpg';
        } catch (e) {
          if (!isHeic(f)) throw e;   // other browsers can't read HEIC: upload the original, Drive makes the previews
          blob = f; name = f.name;
        }
      }
      const ticket = await run('getUploadTicket', BOOT.key, S.releaseId);
      const id = await driveUpload(blob, name, blob.type || (isHeic(f) && blob === f ? 'image/heic' : 'image/jpeg'), ticket, p => $('#phBar').style.setProperty('--p', Math.round((done + failed.length + p) / files.length * 100) + '%'));
      const x = await run('addPhoto', BOOT.key, S.releaseId, id, '');
      (S.lib.extras = S.lib.extras || []).push(x); done++;
    } catch (e) { failed.push(f.name); }
  }
  S.photoBusy = false;
  closeModal(); renderRelease(S.releaseId);
  toast(failed.length ? `${done} added, ${failed.length} failed` : `${done} photo${done === 1 ? '' : 's'} added`);
  const sec = $('#era-photos'); if (sec) sec.scrollIntoView();
}

/* GIF covers keep their animation: uploaded as-is, with a still first frame for the grid */
async function uploadGifCover(file, relId) {
  if (file.size > 15 * 1048576) throw new Error('That GIF is over 15 MB. Export a smaller one (under 8 MB loads fast on phones).');
  let thumb = await shrinkImage(file, 320, 0.72); if (thumb.length > 44000) thumb = await shrinkImage(file, 240, 0.6);
  const ticket = await run('getUploadTicket', BOOT.key, relId);
  const id = await driveUpload(file, 'Soul Vault cover (animated).gif', 'image/gif', ticket);
  const out = await run('setAnimatedCover', BOOT.key, relId, id, thumb);
  const r = rel(relId);
  r.cover_file_id = id; r.cover_type = 'gif'; r.cover_thumb = out.thumb || '';
  S.covers[id] = out.thumb || thumb; S.coverP[id] = Promise.resolve(S.covers[id]); delete S.coverP[id + '|f'];
  return id;
}


/* ═════════ Build 31: ages, song covers, chapters, page backgrounds, synced lyrics ═════════ */
// These styles ship with the app code (not the page Google writes), keeping that page small.
const B31_CSS = `
  .ages { display: flex; align-items: center; justify-content: inherit; gap: 6px; margin-top: 4px; font-size: 13px; color: rgba(246,243,239,.75); }
  .ages svg { width: 15px; height: 15px; color: var(--green-hi); flex: none; }
  .agerow { grid-template-columns: 1fr 1fr 1fr; }
  .agerow input[type=month], .agerow input[type=date] { color-scheme: dark; }
  .reldetails .note { font-size: 12px; color: var(--dim); font-weight: 500; }
  .bgrow { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .bgrow .lbl { font-size: 13px; font-weight: 600; color: var(--dim); flex-basis: 100%; }
  .cleanrow { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .cleanrow .lbl { font-size: 13px; font-weight: 600; color: var(--dim); flex-basis: 100%; }
  .tthumb { width: 38px; height: 38px; border-radius: 7px; object-fit: cover; float: left; margin: 2px 10px 0 0; background: rgba(255,255,255,.06); }
  .chap { margin: 8px 0 10px; border: 1px solid rgba(52,194,122,.35); border-radius: 18px; padding: 6px 10px 8px;
          background: linear-gradient(180deg, rgba(8,122,59,.14), rgba(8,122,59,.03)); }
  .chap > .chapter { margin: 4px 4px 2px; }
  .chap .chapmeta { font: 600 12px var(--sans); letter-spacing: 0; text-transform: none; color: var(--dim); margin-left: auto; }
  .chap .chapend { margin: 6px 4px 2px; font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: rgba(52,194,122,.7);
                   display: flex; align-items: center; gap: 10px; }
  .chap .chapend::before { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, transparent, rgba(52,194,122,.45)); }
  .chaped { display: grid; gap: 10px; margin: 6px 0 16px; padding: 14px; border-radius: 16px; border: 1px solid var(--line); background: rgba(255,255,255,.03); }
  .chaped h3 { margin: 0; font-size: 15px; }
  .chaprow { display: grid; grid-template-columns: minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr) auto auto; gap: 8px; align-items: end; }
  .chapcolor input { width: 48px; height: 40px; padding: 2px; border-radius: 10px; border: 1px solid var(--line); background: var(--raise); cursor: pointer; }
  .chap .chapter { color: var(--chap-text, var(--green-hi)); }
  .chap .chapend { color: var(--chap-text, rgba(52,194,122,.7)); }
  .chap .chapend::before { background: linear-gradient(90deg, transparent, var(--chap-line, rgba(52,194,122,.45))); }
  .chaprow label { display: grid; gap: 4px; font-size: 12px; font-weight: 600; color: var(--dim); }
  .chaprow .field { padding: 8px 10px; min-height: 40px; font-weight: 500; }
  .chaprow .ib { width: 40px; height: 40px; }
  #pagebg { position: fixed; inset: 0; z-index: -1; background: center / cover no-repeat; opacity: 0; transition: opacity .5s; pointer-events: none; }
  #pagebg.on { opacity: 1; }
  #pagebg::after { content: ''; position: absolute; inset: 0;
                   background: linear-gradient(180deg, rgba(8,8,9,.3) 0%, rgba(8,8,9,.5) 35%, rgba(8,8,9,.72) 100%); }
  body.has-bg .relhead h1, body.has-bg .relhead .byline, body.has-bg .relmeta, body.has-bg .tagline { text-shadow: 0 2px 14px rgba(0,0,0,.6); }
  /* the dark base stays on <html> (behind the picture); <body> turns see-through so the picture shows */
  html:has(body.has-bg) { background: #070707; }
  body.has-bg { background: transparent !important; }
  body.has-bg .relhead { background: linear-gradient(180deg, rgba(0,0,0,.15), transparent) !important; }
  body.has-bg .eranav { background: none; }
  body.has-bg .eranav button { background: rgba(12,12,13,.72); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
  body.has-bg .chip:not(.on) { background: rgba(12,12,13,.55); color: #EDE8E4; }
  .npmode .lybtn { }
  .nplyr { width: 100%; aspect-ratio: 1; max-height: 58vh; overflow-y: auto; scrollbar-width: none; border-radius: 14px; padding: 30% 6px;
           mask-image: linear-gradient(transparent, #000 18%, #000 82%, transparent); -webkit-mask-image: linear-gradient(transparent, #000 18%, #000 82%, transparent); }
  .nplyr::-webkit-scrollbar { display: none; }
  .nplyr .ly { display: block; width: 100%; text-align: left; margin: 0 0 14px; padding: 2px 4px; font: 800 clamp(20px, 5.4vw, 28px)/1.25 var(--serif);
               color: rgba(246,243,239,.32); transition: color .25s, transform .25s; transform-origin: left center; background: none; }
  .nplyr .ly.on { color: #fff; transform: scale(1.02); }
  .nplyr .ly.gap { height: 10px; margin: 0; }
  .nplyr.plain .ly { color: rgba(246,243,239,.85); font-size: clamp(18px, 4.6vw, 22px); font-weight: 700; }
  .lynote { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: center; margin-top: 8px; font-size: 12px; color: var(--dim); }
  .syncui { display: grid; gap: 14px; align-content: center; width: 100%; aspect-ratio: 1; max-height: 58vh; text-align: center; }
  .syncui .cur { font: 800 clamp(22px, 6vw, 30px)/1.25 var(--serif); }
  .syncui .nxt { color: var(--dim); font-weight: 600; }
  /* Apple Music-style lyrics: small song header on top, big lines, the current one bright, the rest soft */
  .lyhead { display: none; align-items: center; gap: 12px; padding: 4px 2px 10px; width: 100%; }
  #np.lyrmode .lyhead { display: flex; }
  #np.lyrmode .np-t, #np.lyrmode .np-s, #np.lyrmode .exclt { display: none; }
  .lyhead img { width: 56px; height: 56px; border-radius: 8px; object-fit: cover; background: #222; flex: none; }
  .lyhead b { display: block; font: 800 17px/1.2 var(--serif); } .lyhead span { font-size: 14px; color: rgba(255,255,255,.6); }
  #np.lyrmode .nplyr { aspect-ratio: auto; max-height: none; height: 52vh; border-radius: 0; padding: 20vh 4px; }
  #np.lyrmode .nplyr .ly { font: 800 clamp(28px, 8vw, 38px)/1.18 var(--serif); color: rgba(255,255,255,.34); filter: blur(.5px); margin: 0 0 18px; transform: none; }
  #np.lyrmode .nplyr .ly.on { color: #fff; filter: none; }
  #np.lyrmode .nplyr.plain .ly { font-size: clamp(22px, 6vw, 28px); color: rgba(255,255,255,.85); filter: none; }
  .syncui .prog { font-size: 12px; color: var(--dim); font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
  .syncui .tap { min-height: 64px; font-size: 18px; justify-content: center; }
  .syncui .row3 { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
  @media (min-width: 0px) {
    .agerow { grid-template-columns: 1fr 1fr; }
    .agerow label:last-child { grid-column: 1 / -1; }
    .chaprow { grid-template-columns: 1fr 1fr auto auto; }
    .chaprow label:first-child { grid-column: 1 / -1; }
    .ages { justify-content: center; }
  }
`;
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: B31_CSS }));
if (!$('#pagebg')) document.body.prepend(Object.assign(document.createElement('div'), { id: 'pagebg' }));
if (!$('#songCoverFile')) document.body.appendChild(Object.assign(document.createElement('input'), { type: 'file', id: 'songCoverFile', accept: 'image/jpeg,image/png,image/webp,image/gif', hidden: true }));
if (!$('#bgFile')) document.body.appendChild(Object.assign(document.createElement('input'), { type: 'file', id: 'bgFile', accept: 'image/jpeg,image/png,image/webp,image/gif,image/avif,.avif', hidden: true }));
I.cake = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21h16v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2z"/><path d="M4 16c2 1 4 1 6 0s4-1 6 0 4 1 4 0"/><path d="M12 7v4M12 3.5c-.8.9-.8 1.8 0 2.5.8-.7.8-1.6 0-2.5z"/></svg>';

/* ── ages ── */
function ageOn(b, y, m, d) { let a = y - b[0]; if (m < b[1] || (m === b[1] && d < b[2])) a--; return a; }
// You see ages worked out live from your birthday; fans receive only the ages the server computed.
function agesOf(r) {
  if (!OWNER) return { made: r.age_made || '', released: r.age_released || '' };
  const out = { made: '', released: '' }, bd = String(S.lib.birth_date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bd)) return out;
  const B = bd.split('-').map(Number), from = r.made_from || r.made_to, to = r.made_to || r.made_from;
  if (from) {
    const f = from.split('-').map(Number), t = to.split('-').map(Number), last = new Date(t[0], t[1], 0).getDate();
    const a1 = ageOn(B, f[0], f[1], 1), a2 = ageOn(B, t[0], t[1], last);
    if (a1 >= 0 && a2 >= 0) out.made = a1 === a2 ? String(a1) : a1 + '–' + a2;
  }
  const rd = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(r.release_date || ''));
  if (rd) { const a = ageOn(B, +rd[1], +rd[2], +rd[3]); if (a >= 0) out.released = String(a); }
  return out;
}
function agesLine(r) {
  const a = agesOf(r); const parts = [];
  if (a.made) parts.push(`Made at ${a.made}`);
  if (a.released) parts.push(`${parts.length ? 'released' : 'Released'} at ${a.released}`);
  return parts.length ? `<div class="ages">${I.cake}<span>${esc(parts.join(' · '))}</span></div>` : '';
}

/* ── song covers ── */
const artFor = (t, v) => artTarget(t, v).id;   // see artTarget: song cover, clean version, chapter, Drafts / B-Sides, release
function primeTrackThumbs() {
  (S.lib.tracks || []).forEach(t => {
    if (t.track_cover && t.track_cover_thumb && !S.covers[t.track_cover]) {
      S.covers[t.track_cover] = t.track_cover_thumb; S.coverP[t.track_cover] = Promise.resolve(t.track_cover_thumb);
    }
  });
}
function pickSongCover(tid) { S.coverFor = tid; $('#songCoverFile').click(); }
async function uploadSongCover(file, tid) {
  const t = trk(tid), r = rel(t.release_id);
  if (file.size > 15 * 1048576) throw new Error('That image is over 15 MB.');
  let thumb = await shrinkImage(file, 240, 0.7); if (thumb.length > 29000) thumb = await shrinkImage(file, 180, 0.6);
  const ticket = await run('getUploadTicket', BOOT.key, r.release_id);
  let blob = file, name = `Song cover - ${t.title}.gif`, type = 'image/gif';
  if (file.type !== 'image/gif') { blob = await (await fetch(await shrinkImage(file, 1600, 0.88))).blob(); name = `Song cover - ${t.title}.jpg`; type = 'image/jpeg'; }
  const id = await driveUpload(blob, name, type, ticket);
  const out = await run('setTrackCover', BOOT.key, tid, id, thumb);
  t.track_cover = id; t.track_cover_thumb = out.thumb || '';
  S.covers[id] = out.thumb || thumb; S.coverP[id] = Promise.resolve(S.covers[id]);
}
async function removeSongCover(tid) {
  if (!confirm('Remove this song\'s own cover? It will use the release cover again.')) return;
  try { await run('setTrackCover', BOOT.key, tid, '', ''); const t = trk(tid); t.track_cover = ''; t.track_cover_thumb = ''; afterSongCover(tid); toast('Song cover removed'); }
  catch (e) { toast('Could not remove the song cover'); }
}
function afterSongCover(tid) {
  if (S.view === 'release' && !S.editing) renderRelease(S.releaseId);
  if (S.now && S.now.t.track_id === tid) updateNowUI();
  if ($('#modal .song')) openSong(tid);
}

