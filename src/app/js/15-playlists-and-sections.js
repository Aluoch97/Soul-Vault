/* ── album name in now playing opens the release ── */
function npSubHtml(n) {
  const parts = [n.v.label !== 'Original' ? esc(n.v.label) : '', artistOf(n.t) ? linkName(artistOf(n.t)) : ''].filter(Boolean);
  parts.push(`<button class="nprel" data-np-rel="${esc(n.r.release_id)}" aria-label="Open ${esc(n.r.title)}">${esc(n.r.title)}</button>`);
  return parts.join(', ');
}

/* ── playlists ── */
const plOf = id => (S.lib.playlists || []).find(p => p.playlist_id === id);
const plTracks = p => (p.tracks || []).map(trk).filter(t => t && primaryOf(t) && (OWNER || !hidden(t)));
function mosaic(ts, cls) {
  const arts = [...new Set(ts.map(artFor).filter(Boolean))].slice(0, 4);
  if (arts.length < 4) return `<div class="mosaic one ${cls || ''}">${arts[0] ? `<img class="art" data-cover="${esc(arts[0])}" alt="">` : ''}</div>`;
  return `<div class="mosaic ${cls || ''}">${arts.map(a => `<img class="art" data-cover="${esc(a)}" alt="">`).join('')}</div>`;
}
function playlistsRow() {
  const ps = S.lib.playlists || [];
  if (!ps.length && !OWNER) return '';
  return `<h2 class="sh"><span><b>Playlists</b></span></h2><div class="hrow">
    ${ps.map(p => { const ts = plTracks(p); return `<button class="plcard" data-pl="${esc(p.playlist_id)}" aria-label="Playlist: ${esc(p.title)}, ${ts.length} songs">
      ${mosaic(ts)}<span class="nm">${esc(p.title)}</span><span class="cs">${songs(ts.length)}${OWNER ? ' · ' + (p.fans ? 'fan club' : 'private') : ''}</span></button>`; }).join('')}
    ${OWNER ? `<button class="plcard new" data-pl-new>${I.plus}<span>New playlist</span></button>` : ''}</div>`;
}
function plQueue(p) { return plTracks(p).map(t => primaryOf(t).version_id); }
function renderPlaylist(id) {
  const p = plOf(id); if (!p) return renderLibrary();
  clearPageBg(); S.view = 'playlist'; S.plId = id; renderChrome();
  const ts = plTracks(p), ed = OWNER && S.plEditing;
  if (ed && !S.pldraft) S.pldraft = { title: p.title, description: p.description, fans: p.fans, tracks: ts.map(t => t.track_id) };
  $('#main').innerHTML = `<div class="wrap">
    <button class="back" data-nav="library">${I.back}Music</button>
    <header class="plhead">${mosaic(ts)}<div><div class="kick">Playlist${OWNER ? ' · ' + (p.fans ? 'shared with the fan club' : 'private') : ''}</div>
      <h1>${esc(p.title)}</h1>${p.description ? `<p class="cs" style="margin:0 0 4px;white-space:pre-line">${esc(p.description)}</p>` : ''}
      <div class="cs">${songs(ts.length)}${fmtRuntime(runtimeOf(ts)) ? ' · ' + fmtRuntime(runtimeOf(ts)) : ''}</div>
      <div class="acts">${ts.length ? `<button class="pill main" data-pl-play>${I.play}Play</button><button class="pill soft" data-pl-shuffle>${I.shuffle || ''}Shuffle</button><button class="pill soft" data-pl-queue>${I.queue}Add to queue</button>` : ''}
        ${OWNER && !ed ? `<button class="pill soft" data-pl-edit>${I.edit}Edit</button>` : ''}</div></div></header>
    ${ed ? plEditor() : ts.length ? `<ol class="tracks">${ts.map((t, i) => trackRow(t, true).replace(/<span class="n">[^<]*<\/span>/, `<span class="n">${i + 1}</span>`)).join('')}</ol>`
         : `<div class="ins-empty">No songs yet. Use the ⋯ menu on any song and choose <b>Add to playlist</b>.</div>`}
  </div>`;
  loadCovers(); markPlaying();
  if (ed) makeSortable($('#plList'), plMoveTo);
  window.scrollTo(0, 0);
}
function plEditor() {
  const d = S.pldraft;
  return `<div class="pledit">
    <label>Name<input class="field" id="plTitle" maxlength="120" value="${esc(d.title)}"></label>
    <label>Description<textarea class="field" id="plDesc" rows="3" maxlength="1000">${esc(d.description)}</textarea></label>
    <label class="row2"><input type="checkbox" id="plFans"${d.fans ? ' checked' : ''}> Share with the fan club (fans only see songs they already have access to)</label>
  </div>
  <ol class="pllist" id="plList">${d.tracks.map((tid, i) => { const t = trk(tid); return t ? `<li class="plrow sortrow">
    <img class="art" data-cover="${esc(artFor(t))}" alt=""><div style="min-width:0"><div class="t">${esc(t.title)}</div><div class="cs">${esc((rel(t.release_id) || {}).title || '')}</div></div>
    <button class="ib" type="button" data-pl-rm="${i}" aria-label="Remove ${esc(t.title)} from the playlist">${I.trash}</button>
    <button class="grip" type="button" data-grip="${i}" aria-label="Reorder ${esc(t.title)}, position ${i + 1} of ${d.tracks.length}. Drag, or use the up and down arrow keys." title="Drag to reorder">${I.grip}</button></li>` : ''; }).join('')}</ol>
  <p class="err" id="plErr" hidden></p>
  <div class="editbar"><button class="pill soft" data-pl-delete>Delete playlist</button><span style="flex:1"></span>
    <button class="pill soft" data-pl-cancel>Cancel</button><button class="pill main" data-pl-save>Save</button></div>`;
}
function plMoveTo(from, to, byKey) {
  const d = S.pldraft; if (from !== to) { const [x] = d.tracks.splice(from, 1); d.tracks.splice(to, 0, x); }
  $('#plList').outerHTML = plEditor().match(/<ol class="pllist"[\s\S]*?<\/ol>/)[0];
  makeSortable($('#plList'), plMoveTo); loadCovers();
  if (byKey) { const g = $(`#plList [data-grip="${to}"]`); if (g) g.focus(); }
}
function plReadForm() { const d = S.pldraft; d.title = $('#plTitle').value; d.description = $('#plDesc').value; d.fans = $('#plFans').checked; return d; }
async function plSave(btn) {
  const d = plReadForm(); btn.disabled = true;
  try {
    const out = await run('savePlaylist', BOOT.key, { id: S.plId, title: d.title, description: d.description, tracks: d.tracks, fans: d.fans });
    Object.assign(plOf(S.plId), out); S.plEditing = false; S.pldraft = null; renderPlaylist(S.plId); toast('Playlist saved');
  } catch (e) { btn.disabled = false; const er = $('#plErr'); er.hidden = false; er.textContent = e.message || 'Could not save.'; }
}
async function plCreate(title, tids) {
  const out = await run('savePlaylist', BOOT.key, { title, tracks: tids || [], fans: false });
  (S.lib.playlists = S.lib.playlists || []).push(out); return out;
}
function openAddToPlaylist(tid) {
  const t = trk(tid), ps = S.lib.playlists || [];
  $('#modal').innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mTitle"><h2 id="mTitle">Add “${esc(t.title)}” to…</h2>
    ${ps.length ? `<ul class="plpick">${ps.map(p => { const has = (p.tracks || []).includes(tid); return `<li><button data-pl-add="${esc(p.playlist_id)}" data-tid="${esc(tid)}"${has ? ' disabled' : ''}>
      <span>${esc(p.title)}</span><span class="cs">${has ? 'already in it' : songs((p.tracks || []).length)}</span></button></li>`; }).join('')}</ul>` : '<p class="cs">No playlists yet. Start one:</p>'}
    <div class="plnew"><input class="field" id="plNewName" maxlength="120" placeholder="New playlist name" aria-label="New playlist name">
      <button class="pill main" data-pl-create="${esc(tid)}">Create + add</button></div>
    <p class="err" id="plErr" hidden></p><div class="end"><button class="pill soft" data-close>Done</button></div></div>`;
  $('#modal').hidden = false;
}
async function plAddTo(id, tid, btn) {
  const p = plOf(id); if (!p) return; btn.disabled = true;
  try { Object.assign(p, await run('savePlaylist', BOOT.key, { id, title: p.title, description: p.description, tracks: (p.tracks || []).concat([tid]), fans: p.fans }));
        closeModal(); toast(`Added to ${p.title}`); refreshPlaylistViews(); }
  catch (e) { btn.disabled = false; const er = $('#plErr'); er.hidden = false; er.textContent = e.message || 'Could not add.'; }
}


/* ═════════ Build 51: now playing controls (shuffle, repeat, volume), spotlight, compact player, video sections ═════════ */
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  /* now playing: compact, straight up-and-down only */
  #np { overflow-x: hidden; overscroll-behavior: contain; touch-action: pan-y; }
  #np .npmedia { max-width: min(320px, 78vw, 40vh); margin-left: auto; margin-right: auto; }
  #np .np-t { margin-top: 14px; } #np .np-s { margin: 4px 0 12px; }
  #np .npx { margin-top: 10px; }
  /* spotlight on the cover */
  #np #npArt { box-shadow: 0 0 0 1px rgba(255,236,196,.10), 0 26px 70px -12px rgba(255,210,140,.45), 0 0 120px -30px rgba(255,220,160,.55); }
  #np .npmedia::before { background: conic-gradient(from 180deg at 50% 0%, transparent 152deg, rgba(255,232,190,.20) 170deg, rgba(255,236,200,.34) 180deg, rgba(255,232,190,.20) 190deg, transparent 208deg) !important; filter: blur(8px); }
  #np .npmedia .spot { position: absolute; inset: 0; z-index: 2; pointer-events: none; border-radius: 14px;
    background: radial-gradient(ellipse 70% 45% at 50% 0%, rgba(255,240,210,.28), transparent 70%); mix-blend-mode: screen; }
  /* Apple-Music-style controls: shuffle · prev · play · next · repeat, then volume */
  .npctl { display: grid; grid-template-columns: 44px 1fr auto 1fr 44px; align-items: center; justify-items: center; gap: 4px; margin-top: 8px; }
  .npctl .tog { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; color: rgba(246,243,239,.6); position: relative; }
  .npctl .tog svg { width: 20px; height: 20px; }
  .npctl .tog[aria-pressed="true"] { color: var(--green-hi); }
  .npctl .tog[aria-pressed="true"]::after { content: ''; position: absolute; bottom: 5px; width: 4px; height: 4px; border-radius: 50%; background: currentColor; }
  .npctl .tog .one { position: absolute; font: 900 9px var(--sans); top: 11px; left: 50%; transform: translateX(-50%); }
  .npvol { display: grid; grid-template-columns: 18px minmax(0,1fr) 22px; gap: 10px; align-items: center; margin: 14px auto 0; max-width: 360px; color: rgba(246,243,239,.6); }
  .npvol svg { width: 18px; height: 18px; }
  .npvol input { width: 100%; accent-color: #fff; min-height: 28px; }
  /* videos grouped by type */
  .vsec + .vsec { margin-top: 22px; }
` }));

/* ── volume (iPhones reserve volume for the side buttons, so the slider hides there) ── */
const canSetVolume = (() => { try { const a = new Audio(); a.volume = 0.5; return Math.abs(a.volume - 0.5) < 0.01; } catch (e) { return false; } })();
function initVolume() {
  const box = $('.npvol'); if (!box) return;
  if (!canSetVolume) { box.hidden = true; return; }
  const v = ls.get('sv_volume', 1); audio.volume = v; const r = $('[data-vol]'); if (r) r.value = Math.round(v * 100);
}
/* ── shuffle + repeat ── */
S.repeat = 'off'; S.shuffle = false;
function syncModes() {
  const sh = $('[data-ctl="shuffle"]'), rp = $('[data-ctl="repeat"]');
  if (sh) sh.setAttribute('aria-pressed', String(S.shuffle));
  if (rp) { rp.setAttribute('aria-pressed', String(S.repeat !== 'off')); rp.setAttribute('aria-label', 'Repeat: ' + ({ off: 'off', all: 'all songs', one: 'this song' })[S.repeat]);
            const o = rp.querySelector('.one'); if (o) o.hidden = S.repeat !== 'one'; }
}
function toggleShuffle() {
  if (!S.queue || !S.queue.length) { S.shuffle = !S.shuffle; syncModes(); return; }
  const cur = S.queue[S.qi];
  if (!S.shuffle) {
    S.origQueue = S.queue.slice();
    const rest = S.queue.filter((_, i) => i !== S.qi);
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    S.queue = [cur].concat(rest); S.qi = 0; S.shuffle = true;
  } else {
    S.queue = (S.origQueue || S.queue).slice(); S.qi = Math.max(0, S.queue.indexOf(cur)); S.shuffle = false;
  }
  syncModes(); toast(S.shuffle ? 'Shuffle on' : 'Shuffle off');
}
function cycleRepeat() { S.repeat = { off: 'all', all: 'one', one: 'off' }[S.repeat]; syncModes(); toast({ off: 'Repeat off', all: 'Repeat all', one: 'Repeat this song' }[S.repeat]); }

/* ── videos: sections by type ── */
const VSECTION = { music: 'music', film: 'music', live: 'live', trailer: 'extras', bts: 'extras' };
const VSECTION_TITLE = { music: '<b>Music</b> videos', live: '<b>Live</b> performances', extras: '<b>Extras</b>: trailers and behind the scenes' };


/* ═════════ Build 53: public links, photo slideshow, album credits → song credits, clean covers ═════════ */
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  .qs { display: grid; gap: 8px; padding: 12px; border-radius: 14px; background: rgba(8,122,59,.14); border: 1px solid rgba(52,194,122,.35); margin-bottom: 4px; }
  .qs h3 { margin: 0; font-size: 15px; }
  .qs .qsbtns { display: flex; gap: 8px; flex-wrap: wrap; }
  .qsor { margin: 12px 0 2px; font-size: 13px; color: var(--dim); font-weight: 600; }
  /* photos: one thumbnail that opens the slideshow */
  .phstack { position: relative; display: block; width: min(200px, 48vw); aspect-ratio: 1; margin: 14px 12px 8px 4px; text-align: left; }
  .phstack .lay { position: absolute; inset: 0; border-radius: 14px; background: rgba(255,255,255,.07); border: 1px solid var(--line); }
  .phstack .l3 { transform: translate(-7px, -9px) rotate(-3.5deg); opacity: .55; } .phstack .l2 { transform: translate(8px, -6px) rotate(3deg); opacity: .8; }
  .phstack img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; border-radius: 14px; background: rgba(255,255,255,.06); box-shadow: 0 16px 30px -14px #000; }
  .phstack .cnt { position: absolute; left: 8px; bottom: 8px; display: inline-flex; gap: 6px; align-items: center; padding: 5px 11px; border-radius: 999px;
                  background: rgba(8,8,9,.82); color: #fff; font-size: 13px; font-weight: 800; }
  .phstack:hover img { filter: brightness(1.08); }
  /* the slideshow: big picture, caption, strip of every photo underneath */
  .slideshow { width: min(1100px, 100%); height: min(92vh, 100%); display: grid; grid-template-rows: auto minmax(0,1fr) auto auto auto; gap: 10px; }
  .ssbar { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .ssbar .acts { display: flex; gap: 6px; }
  .ssmain { position: relative; min-height: 0; display: grid; place-items: center; touch-action: pan-y; }
  .ssmain img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 6px; }
  .ssnav { position: absolute; top: 50%; transform: translateY(-50%); width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center;
           background: rgba(12,12,13,.72); color: #fff; border: 1px solid rgba(255,255,255,.14); z-index: 2; }
  .ssnav.prev { left: 6px; } .ssnav.next { right: 6px; } .ssnav.next svg { transform: scaleX(-1); }
  .sscap { text-align: center; font-size: 14px; font-weight: 700; min-height: 22px; }
  .ssstrip { display: flex; gap: 8px; overflow-x: auto; overscroll-behavior-x: contain; padding: 4px 2px 8px; scrollbar-width: thin; }
  .ssstrip button { flex: 0 0 auto; width: 72px; height: 72px; padding: 0; border-radius: 10px; overflow: hidden; border: 2px solid transparent; opacity: .68; background: rgba(255,255,255,.06); }
  .ssstrip button[aria-current="true"] { border-color: var(--green-hi); opacity: 1; }
  .ssstrip img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .sscred { font-size: 12px; color: var(--dim); text-align: center; max-height: 3.6em; overflow-y: auto; white-space: pre-line; }
  .sscred b { color: var(--text); text-transform: uppercase; letter-spacing: .08em; font-size: 11px; margin-right: 6px; }
  .ssbar .cs { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .modal .slideshow { background: rgba(0,0,0,.94); border-radius: 16px; padding: 12px; }
  @media (min-width: 0px) { .modal .slideshow { height: 100%; border-radius: 0; background: #000; padding: max(10px, env(safe-area-inset-top)) 8px calc(10px + env(safe-area-inset-bottom)); } .ssnav { width: 44px; height: 44px; } .ssstrip button { width: 60px; height: 60px; } }
` }));
if (!$('#cleanFile')) document.body.appendChild(Object.assign(document.createElement('input'), { type: 'file', id: 'cleanFile', accept: 'image/jpeg,image/png,image/webp', hidden: true }));

/* ── public links for every song and project ── */
S.qsCache = {};
function quickShareBox(type, id) {
  const can = !!navigator.share, a = `data-qs-type="${type}" data-qs-id="${esc(id)}"`;
  return `<div class="qs"><h3>Public link</h3>
    <p class="cs" style="margin:0">Anyone with this link can listen. It's the same link every time. Fans can listen but not download.</p>
    <input class="field" id="qsUrl" readonly aria-label="Public link" placeholder="Tap Copy link">
    <div class="qsbtns"><button class="pill main" data-qs="copy" ${a}>${I.link || ''}Copy link</button>${can ? `<button class="pill soft" data-qs="share" ${a}>${I.share}Share…</button>` : ''}</div></div>
    <p class="qsor">Or make a link just for one person, with a note or an expiry:</p>`;
}
async function copyText(text, box) {
  try { await navigator.clipboard.writeText(text); toast('Link copied'); return; } catch (e) {}
  try { if (box) { box.focus(); box.select(); if (document.execCommand('copy')) { toast('Link copied'); return; } } } catch (e) {}
  toast('Copy the link from the box');
}
async function quickLink(type, id, how, btn) {
  btn.disabled = true;
  try {
    const k = type + ':' + id;
    let q = S.qsCache[k];
    if (!q) {
      q = await run('quickShare', BOOT.key, type, id); S.qsCache[k] = q;
      if (q.created) (S.lib.shares = S.lib.shares || []).push({ token: q.token, target_type: type, target_id: id, label: 'Public link', allow_download: false, expires: '', active: true, plays: 0, fan_name: '', member_no: 0 });
    }
    const box = $('#qsUrl'); if (box) box.value = q.url;
    const name = type === 'release' ? rel(id).title : trk(id).title;
    if (how === 'share' && navigator.share) {
      try { await navigator.share({ title: name, text: `Listen to ${name}`, url: q.url }); }
      catch (e) { if (!e || e.name !== 'AbortError') await copyText(q.url, box); }
    } else await copyText(q.url, box);
  } catch (e) { toast(e.message || 'Could not make the link'); }
  btn.disabled = false;
}

/* ── photos: one thumbnail, a slideshow popup ── */
function slideItems(r) {
  const ps = orderedPhotos(r), out = [];
  const L = { cover: 'Album cover art', shoot: 'Photoshoot', bts: 'Behind the scenes', social: 'Social media graphic' };
  if (r.cover_file_id) out.push({ id: r.cover_file_id, label: 'Album cover', kind: 'cover' });
  if (r.clean_cover_file_id) out.push({ id: r.clean_cover_file_id, label: 'Clean version cover', kind: 'clean' });
  coversOf(r).forEach(c => out.push({ id: c.id, label: c.for === 'clean' ? 'Clean version cover (another)' : c.for === 'deluxe' ? 'Extras cover' : c.for === 'bsides' ? 'B-Sides cover' : String(c.for).slice(3) + ' cover', kind: 'xcover' }));
  const push = p => out.push({ id: p.file_id, label: L[p.cat], group: p.group || '', title: p.title || '', kind: 'photo', xid: p.extra_id });
  ps.filter(p => p.cat === 'cover').forEach(push);
  ['shoot', 'bts'].forEach(cat => {
    const names = []; ps.filter(p => p.cat === cat).forEach(p => { if (!names.includes(p.group || '')) names.push(p.group || ''); });
    names.forEach(g => ps.filter(p => p.cat === cat && (p.group || '') === g).forEach(push));
  });
  ps.filter(p => p.cat === 'social').forEach(push);
  return out;
}
const ssCaption = it => [it.label + (it.group ? ': ' + it.group : ''), it.title].filter(Boolean).join(' · ');
function photosSection(r) {
  const m = photosMeta(r), n = extrasOf(r.release_id, 'photo').length;
  if (!n && !r.clean_cover_file_id && !m.credits) return '';
  const items = slideItems(r), first = items.find(x => x.kind === 'photo') || items[0];
  return `<section id="era-photos" class="erasec"><h2 class="sh"><span><b>Photos</b> from the era</span></h2>
    ${first ? `<button class="phstack" data-photo="0" aria-label="Open the photo slideshow, ${items.length} ${items.length === 1 ? 'picture' : 'pictures'}">
      <span class="lay l3"></span><span class="lay l2"></span><img data-photo-src="${esc(first.id)}" alt="">
      <span class="cnt">${I.img || ''}${items.length} ${items.length === 1 ? 'photo' : 'photos'}</span></button>` : ''}
    ${m.credits ? `<div class="phcredits"><b>Photo credits</b>${linkifyText(m.credits)}</div>` : ''}</section>`;
}
function openPhoto(i) { openSlideshow(i); }
function ssThumb(img) {
  const id = img.dataset.ssSrc, k = id + '|240';
  if (S.covers[id]) { img.src = S.covers[id]; return; }
  photoP(id, 240);
  S.coverP[k].then(u => { if (u) img.src = u; }).catch(() => {});
}
function ssObserve() {
  const strip = $('#ssStrip'), imgs = [...strip.querySelectorAll('img[data-ss-src]')];
  if (S.ssObs) S.ssObs.disconnect();
  if (!('IntersectionObserver' in window)) { imgs.forEach(ssThumb); return; }
  S.ssObs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { S.ssObs.unobserve(e.target); ssThumb(e.target); } }), { root: strip, rootMargin: '0px 300px' });
  imgs.forEach(i => S.ssObs.observe(i));
}
function ssBig(it) {
  const k = it.id + '|1600';
  photoP(it.id, 1600);
  return S.coverP[k];
}
async function ssRemove() {
  const it = (S.ssItems || [])[S.ssAt]; if (!it || !it.xid) return;
  if (!confirm('Remove this photo from the release page?')) return;
  try {
    await run('deleteExtra', BOOT.key, it.xid); S.lib.extras = S.lib.extras.filter(x => x.extra_id !== it.xid);
    renderRelease(S.releaseId);
    if (!slideItems(rel(S.releaseId)).length) { closeModal(); toast('Removed'); return; }
    openSlideshow(Math.min(S.ssAt, slideItems(rel(S.releaseId)).length - 1)); toast('Removed');
  } catch (e) { toast('Could not remove'); }
}

/* ── album credits flow into each song's credits ── */
// "Produced by: Shake" → every song. "Produced by: Shake (1, 3-5)" or "(ARES, MRDR)" → only those songs.
// Features only show on songs you name. Bracketed notes that aren't song numbers or titles are ignored.
const creditRole = role => {
  role = String(role).toLowerCase();
  if (/\b(at|in)\b/.test(role)) return '';
  if (/produc|beat/.test(role)) return 'producer';
  if (/mix|master|engineer|recorded by|recording eng/.test(role)) return 'engineer';
  if (/feat|guest/.test(role)) return 'features';
  return '';
};
function splitTop(str) {
  const out = []; let cur = '', depth = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(') depth++; else if (ch === ')') depth = Math.max(0, depth - 1);
    if (!depth && (ch === ',' || ch === ';')) { out.push(cur); cur = ''; continue; }
    if (!depth && (str.startsWith(' & ', i) || str.startsWith(' and ', i))) { out.push(cur); cur = ''; i += str.startsWith(' & ', i) ? 2 : 4; continue; }
    cur += ch;
  }
  out.push(cur); return out.map(x => x.trim()).filter(Boolean);
}
function scopeTokens(str) {
  return String(str).split(',').map(x => x.trim()).filter(Boolean).map(tok => {
    let m;
    if ((m = /^(\d+)$/.exec(tok))) return { n: +m[1], raw: tok };
    if ((m = /^(\d+)\s*[-–]\s*(\d+)$/.exec(tok))) return { a: +m[1], b: +m[2] };
    return { title: tok.toLowerCase() };
  });
}
function parseAlbumCredits(text) {
  S.acMemo = S.acMemo || new Map();
  if (S.acMemo.has(text)) return S.acMemo.get(text);
  const ents = [];
  String(text || '').split('\n').forEach(line => {
    const m = /^\s*([^:]{2,40}):\s*(.+)$/.exec(line); if (!m) return;
    const field = creditRole(m[1]); if (!field) return;
    splitTop(m[2]).forEach(part => {
      const pm = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(part);
      const name = (pm ? pm[1] : part).trim();
      if (!name || name.length > 80 || /^https?:/i.test(name)) return;
      ents.push({ field, name, scope: pm ? scopeTokens(pm[2]) : null });
    });
  });
  S.acMemo.set(text, ents); return ents;
}
// true / false when the brackets name songs; null when they're just a note like "(co-producer)" or "(2019)"
function scopeApplies(sc, t, all) {
  const max = Math.max(0, ...all.map(x => Number(x.track_no) || 0));
  const bad = sc.some(x => x.title ? !all.some(s => String(s.title).trim().toLowerCase() === x.title)
                                   : x.n != null ? (x.n < 1 || x.n > max) : (x.a < 1 || x.a > max || x.b < x.a));
  if (bad || !sc.length) return null;
  return sc.some(x => x.n != null ? (Number(t.track_no) === x.n || numLabel(t) === String(x.raw))
                    : x.a != null ? (Number(t.track_no) >= x.a && Number(t.track_no) <= x.b)
                    : String(t.title).trim().toLowerCase() === x.title);
}
function albumCreditNames(t, k) {
  const r = rel(t.release_id); if (!r || !String(r.album_credits || '').trim()) return [];
  const all = S.lib.tracks.filter(x => x.release_id === t.release_id), out = [];
  parseAlbumCredits(r.album_credits).forEach(e => {
    if (e.field !== k) return;
    const v = e.scope ? scopeApplies(e.scope, t, all) : null;
    const apply = v === null ? k !== 'features' : v;
    if (apply && !out.some(n => n.toLowerCase() === e.name.toLowerCase())) out.push(e.name);
  });
  return out;
}
// What a song's credits show: its own entry plus anything from the album credits that applies to it.
function creditVal(t, k) {
  const own = String(t[k] || '').trim();
  if (k !== 'producer' && k !== 'engineer' && k !== 'features') return own;
  const have = new Set(splitNames(own).map(x => x.toLowerCase()));
  const add = albumCreditNames(t, k).filter(n => !have.has(n.toLowerCase()));
  return own ? (add.length ? own + ', ' + add.join(', ') : own) : add.join(', ');
}

/* ── clean covers ── */
const isCleanVer = v => !!v && /\bclean\b/i.test(String(v.label || ''));
function cleanCoverRow(r) {
  const has = !!r.clean_cover_file_id;
  return `<div class="cleanrow" id="cleanRow"><span class="lbl">Clean version cover (shows whenever a Clean version plays)</span>
    ${has ? `<img class="art" data-cover="${esc(r.clean_cover_file_id)}" alt="Current clean cover" style="width:64px;height:64px;border-radius:8px">` : ''}
    <button class="pill soft" type="button" data-clean-pick>${I.img}${has ? 'Change clean cover' : 'Upload clean cover'}</button>
    ${has ? '<button class="pill soft" type="button" data-clean-clear>Remove</button>' : ''}</div>`;
}
function afterCleanCover(r) {
  const row = $('#cleanRow'); if (row) row.outerHTML = cleanCoverRow(r);
  loadCovers();
  if (S.now && S.now.r.release_id === r.release_id) updateNowUI();
}
async function uploadCleanCoverFile(file) {
  const r = rel(S.releaseId);
  const data = await shrinkImage(file);
  let thumb = await shrinkImage(file, 320, 0.72); if (thumb.length > 44000) thumb = await shrinkImage(file, 240, 0.6);
  const out = await run('uploadCleanCover', BOOT.key, r.release_id, data, thumb);
  r.clean_cover_file_id = out.fileId; r.clean_cover_thumb = out.thumb || '';
  S.covers[out.fileId] = out.thumb || data; S.covers[out.fileId + '|f'] = data;
  S.coverP[out.fileId] = Promise.resolve(S.covers[out.fileId]); S.coverP[out.fileId + '|f'] = Promise.resolve(data);
  afterCleanCover(r);
}
$('#cleanFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  toast('Uploading clean cover…');
  try { await uploadCleanCoverFile(f); toast('Clean cover saved'); } catch (err) { toast(err.message || 'The clean cover did not upload.'); }
});
async function clearCleanCover() {
  const r = rel(S.releaseId);
  try { await run('uploadCleanCover', BOOT.key, r.release_id, '', ''); r.clean_cover_file_id = ''; r.clean_cover_thumb = ''; afterCleanCover(r); toast('Clean cover removed'); }
  catch (e) { toast(e.message || 'Could not remove it'); }
}
function albumHint(t, k) { const a = albumCreditNames(t, k); return a.length ? `<span class="cs">Also shows: ${esc(a.join(', '))} (from the album credits)</span>` : ''; }


/* ═════════ Build 55: video types + sections, removal everywhere, series chooser, Lore for fans ═════════ */
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  .vtype.skit { background: rgba(240,122,58,.18); color: #FFD3B8; } .vtype.reaction { background: rgba(255,214,90,.16); color: #FFE9A6; }
  .vtype.interview { background: rgba(74,163,240,.18); color: #C4E2FF; } .vtype.podcast { background: rgba(120,220,180,.16); color: #C2F3E0; }
  .pill.danger { color: #FFB8C2; background: rgba(210,16,52,.16); } .pill.main.danger { color: #fff; background: linear-gradient(135deg, #B8102C, #7A0A1E); }
  .pill.danger[disabled] { opacity: .45; }
  .dangerzone { display: grid; gap: 8px; margin-top: 8px; padding: 12px; border-radius: 14px; border: 1px solid rgba(210,16,52,.4); background: rgba(210,16,52,.07); }
  .dangerzone h3 { margin: 0; font-size: 14px; color: #FFB8C2; }
  .eopts > .pill.danger { justify-self: start; margin-top: 4px; }
  .vline .ib { width: 36px; height: 36px; }
  .pedrow { grid-template-columns: 64px minmax(0,1fr) auto auto; }
  /* series card opens a chooser */
  button.scard { text-align: left; font: inherit; color: inherit; cursor: pointer; width: auto; }
  button.scard:hover { border-color: rgba(255,255,255,.28); }
  .scard .serhint { font-size: 12px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--green-hi); }
  .serall { width: 100%; justify-content: center; margin: 4px 0 12px; min-height: 52px; }
  .serparts { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; max-height: 46vh; overflow-y: auto; }
  .serparts .sp { display: grid; grid-template-columns: 48px minmax(0,1fr) auto auto; gap: 8px; align-items: center; padding: 8px; border-radius: 14px; background: rgba(255,255,255,.04); }
  .serparts .sp .art { width: 48px; height: 48px; border-radius: 8px; }
  .serparts .st { font-weight: 800; overflow-wrap: anywhere; }
  .serparts .pill { min-height: 40px; padding: 0 12px; }
  @media (min-width: 0px) { .serparts .sp { grid-template-columns: 48px minmax(0,1fr); } .serparts .sp .pill { grid-column: span 1; } .serparts .sp .pill:nth-of-type(1) { grid-column: 1 / 2; } }
  .tabs .tabgap { min-width: 60px; padding: 4px; }
  .biotxt { white-space: pre-line; line-height: 1.7; font-size: 15px; margin: 0 0 8px; }
  .lyacts { display: flex; gap: 8px; flex-wrap: wrap; }
  /* Now playing: one centered column */
  #np .np-body { grid-template-columns: minmax(0, 520px); justify-content: center; text-align: center; gap: 6px; }
  #np .np-t, #np .np-s { text-align: center; }
  #np h4 { text-align: center; }
  #np .chips, #np .npx { justify-content: center; }
  #np .credits { text-align: left; max-width: 380px; margin-left: auto; margin-right: auto; }
  #np .upnext { max-width: 460px; margin-left: auto; margin-right: auto; text-align: left; }
  #np #npArt { width: 100%; max-width: 100%; height: auto; aspect-ratio: 1 / 1; }
  /* text that has to fit small screens */
  .row .tt { white-space: normal; overflow: visible; text-overflow: clip; overflow-wrap: anywhere; }
  .vcard .ct, .plcard .nm { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
  @media (max-width: 380px) {
    .home-h { gap: 8px; } .home-h .brand { font-size: 21px; } .hbtns { gap: 6px; }
    .hbtns .ib, .hbtns .avatar { width: 38px; height: 38px; }
  }
` }));

/* ── video types: more kinds, and each kind gets its own section ── */
Object.assign(VTYPE, { skit: 'Skit', reaction: 'Reaction', interview: 'Interview', podcast: 'Podcast' });
(() => { const copy = Object.assign({}, VTYPE); ['music', 'film', 'live', 'skit', 'reaction', 'interview', 'podcast', 'trailer', 'bts'].forEach(k => { delete VTYPE[k]; VTYPE[k] = copy[k]; }); })();
Object.assign(VSECTION, { music: 'music', film: 'film', live: 'live', skit: 'skit', reaction: 'reaction', interview: 'interview', podcast: 'podcast', trailer: 'extras', bts: 'extras' });
Object.assign(VSECTION_TITLE, { music: '<b>Music</b> videos', film: '<b>Short</b> films', live: '<b>Live</b> performances', skit: '<b>Skits</b>', reaction: '<b>Reactions</b>',
  interview: '<b>Interviews</b>', podcast: '<b>Podcasts</b>', extras: '<b>Extras</b>: trailers and behind the scenes' });
