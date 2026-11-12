/* ── change cover ── */
function shrinkImage(file, max, quality) {
  max = max || 1600; quality = quality || 0.9;
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('That file could not be read as an image. Use a JPG or PNG.')); };
    img.src = url;
  });
}
async function changeCover(file) {
  const id = S.releaseId, r = rel(id), btn = $('[data-cover-change]');
  if (btn) { btn.classList.add('busy'); btn.querySelector('span').textContent = 'Uploading…'; }
  try {
    if (file.type === 'image/gif') {
      await uploadGifCover(file, id);
      if (S.view === 'release' && S.releaseId === id) renderRelease(id);
      if (S.now && S.now.r.release_id === id) updateNowUI();
      return;
    }
    const data = await shrinkImage(file);
    let thumb = await shrinkImage(file, 320, 0.72);
    if (thumb.length > 44000) thumb = await shrinkImage(file, 240, 0.6);
    const out = await run('uploadCover', BOOT.key, id, data, thumb);
    r.cover_file_id = out.fileId; r.cover_thumb = out.thumb || ''; r.cover_type = '';
    S.covers[out.fileId] = out.thumb || data; S.covers[out.fileId + '|f'] = data;
    S.coverP[out.fileId] = Promise.resolve(out.thumb || data); S.coverP[out.fileId + '|f'] = Promise.resolve(data);
    if (S.view === 'release' && S.releaseId === id) renderRelease(id);
    if (S.now && S.now.r.release_id === id) updateNowUI();
  } catch (e) {
    if (btn) { btn.classList.remove('busy'); btn.querySelector('span').innerHTML = I.img + 'Change cover'; }
    alert(e.message || 'The cover could not be uploaded.');
  }
}
$('#coverFile').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) changeCover(f); });

function trackRow(t, withRelease) {
  const vs = versionsOf(t.track_id), p = vs[0];
  const subH = [artistOf(t) ? linkName(artistOf(t)) : '', withRelease ? esc((rel(t.release_id) || {}).title || '') : ''].filter(Boolean).join(', ');
  return `<li class="row" data-track="${esc(t.track_id)}">
    <button class="idx" data-play="${esc(p.version_id)}" aria-label="Play ${esc(t.title)}">
      <span class="n">${esc(numLabel(t))}</span>${I.play}<span class="eq"><i></i><i></i><i></i></span>
    </button>
    <div style="min-width:0">
      <div class="thead">${t.track_cover ? `<img class="tthumb" data-cover="${esc(t.track_cover)}" alt="">` : ''}<div class="tname"><button class="tt" data-play="${esc(p.version_id)}" aria-label="Play ${esc(t.title)}">${esc(t.title)}</button>${isUnrel(t) ? '<span class="unrel">Unreleased</span>' : ''}${videoOf(t) ? videoLabel(t) : ''}</div></div>
      ${subH ? `<div class="ta">${subH}</div>` : ''}
      ${vs.length > 1 ? `<div class="chips">${vs.map(v => `<button class="chip${isExclusive(v) ? ' excl' : ''}" data-play="${esc(v.version_id)}"${isExclusive(v) ? ' title="Vault exclusive"' : ''}>${isExclusive(v) ? I.star : ''}${esc(v.label)}</button>`).join('')}</div>` : ''}
    </div>
    <span class="dur">${esc(p.duration || '')}</span>
    <div class="rowact"><button class="ib" data-more="${esc(t.track_id)}" aria-label="More options for ${esc(t.title)}">${I.more}</button></div>
  </li>`;
}

function markPlaying() {
  $$('.row.on, .chip.on').forEach(el => el.classList.remove('on'));
  document.body.classList.toggle('paused', audio.paused);
  if (!S.now) return;
  $$(`.row[data-track="${CSS.escape(S.now.t.track_id)}"]`).forEach(li => li.classList.add('on'));
  $$(`.chip[data-play="${CSS.escape(S.now.v.version_id)}"]`).forEach(c => c.classList.add('on'));
}

/* ── covers + tint ── */
function loadCovers() { $$('img[data-cover]').forEach(img => setCover(img, img.dataset.cover, false)); }
function setCover(img, id, full, done) {
  if (!id) { img.removeAttribute('src'); return; }
  const k = id + (full ? '|f' : '');
  if (!S.coverP[k]) S.coverP[k] = (S.xcov && S.xcov[id] ? photoP(id, full ? 1600 : 400, S.xcov[id]) : run('getCover', id, BOOT.key, BOOT.token, !!full)).then(u => (S.covers[k] = u));
  const small = S.covers[id];
  // show the new cover's thumbnail right away (also when the picture changes, e.g. Explicit ↔ Clean), then the full image
  if (full && small && (!img.src || img.dataset.cid !== id)) setImgSrc(img, small);
  if (full) img.dataset.cid = id;
  S.coverP[k].then(u => {
    if (!u) return;
    img.onload = done || null;
    setImgSrc(img, u);
    if (full && !S.covers[id]) S.covers[id] = u;
  }).catch(() => {});
}

function tintFrom(img) {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 24;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, 24, 24);
    const d = x.getImageData(0, 0, 24, 24).data;
    let r = 0, g = 0, b = 0, w = 0;
    for (let i = 0; i < d.length; i += 4) {
      const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
      const wt = 1 + (mx - mn) / 40;                    // favor colorful pixels over grey
      r += d[i] * wt; g += d[i + 1] * wt; b += d[i + 2] * wt; w += wt;
    }
    r /= w; g /= w; b /= w;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const f = lum ? Math.min(1.4, 72 / lum) : 1;         // settle every cover to a similar, text-safe darkness
    const hex = [r, g, b].map(v => Math.round(Math.min(255, v * f)).toString(16).padStart(2, '0')).join('');
    const head = $('#relhead'); if (head) head.style.setProperty('--tint', '#' + hex);
  } catch (e) {}
}

/* ── playback ── */
const audio = $('#audio');
const SILENT = 'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';
let unlocked = false;
function setToggle(playing) {
  $$('[data-ctl="toggle"]').forEach(b => { b.innerHTML = playing ? I.pause : I.play; b.setAttribute('aria-label', playing ? 'Pause' : 'Play'); });
}
// Explains why the browser could not play the current file.

function msg(t) { const m = $('#msg'); m.hidden = !t; m.textContent = t || ''; }

/* ── instant playback: ready a release's songs in the background, then play straight from Drive ── */
const directUrl = id => (id && S.pub && S.pub[id] && S.streamKey) ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&key=${encodeURIComponent(S.streamKey)}` : '';
function warmRelease(relId) {
  S.pub = S.pub || {}; S.warm = S.warm || {};
  if (!relId || S.warm[relId]) return;
  const r = rel(relId); if (!r || (!OWNER && r.locked)) return;
  S.warm[relId] = true;
  const vs = S.lib.versions.filter(x => { const t = trk(x.track_id); return t && t.release_id === relId; });
  if (vs.length && vs.every(x => x.url)) return;   // all on our own storage: nothing to ready in Drive
  run('prepareRelease', BOOT.key, BOOT.token, relId)
    .then(o => { (o.ready || []).forEach(id => (S.pub[id] = true)); if (o.key) S.streamKey = o.key; preloadNext(); })
    .catch(() => { delete S.warm[relId]; });
}
// Starts fetching the next song in the queue so skipping ahead is near-instant.
async function sourceFor(fid, allowDirect, force) {
  const own = !force && S.urlByFile && S.urlByFile[fid];   // our own storage first; Drive stays as the spare (force = the retry, and a copy that failed once is not tried again)
  if (own && !(S.badFile && S.badFile[fid])) return { stream: own, download: own, viaApi: false, direct: false, own: true };
  const d = allowDirect ? directUrl(fid) : '';
  if (d) return { stream: d, download: 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(fid), viaApi: true, direct: true };
  const src = await run('prepareAudio', fid, BOOT.key, BOOT.token, !!force);
  if (src.viaApi) { S.pub = S.pub || {}; S.pub[fid] = true; }
  return src;
}


// Now Playing wears the release page's own background (falls back to the blurred cover when it has none).
function paintNpBg(r) {
  const el = $('#npBg'), id = S.npRelBg;
  if (!el) return;
  if (!id) { el.classList.remove('rel'); el.style.backgroundSize = ''; el.style.backgroundPosition = ''; return; }
  el.classList.add('rel');
  const st = bgStyleOf(r); el.style.backgroundSize = st.fit; el.style.backgroundPosition = st.x + '% ' + st.y + '%';
  const k = id + '|1600';
  if (!S.coverP[k]) S.coverP[k] = run('getCover', id, BOOT.key, BOOT.token, 1600);
  S.coverP[k].then(u => { if (u && S.npRelBg === id) el.style.backgroundImage = `url("${u}")`; }).catch(() => {});
}
function updateNowUI() {
  const n = S.now; if (!n) return;
  const sub = [n.v.label !== 'Original' ? n.v.label : '', artistOf(n.t), n.r.title].filter(Boolean).join(', ');
  $('#mT').textContent = n.t.title; $('#mS').textContent = sub;
  $('#npT').textContent = n.t.title; $('#npS').innerHTML = npSubHtml(n);
  setCover($('#mArt'), artFor(n.t, n.v), false);
  const npArt = $('#npArt');
  const relBg = !(!OWNER && n.r.locked) && n.r.bg_file_id || '';
  S.npRelBg = relBg;
  setCover(npArt, artFor(n.t, n.v), true, () => { if (!S.npRelBg) $('#npBg').style.backgroundImage = `url("${npArt.src}")`; if (S.lyrMode) syncLyHead(); });
  paintNpBg(n.r);
  const vs = versionsOf(n.t.track_id);
  $('#npVers').innerHTML = vs.length > 1 ? `<h4>Versions</h4><div class="chips">${vs.map(v => `<button class="chip${isExclusive(v) ? ' excl' : ''}" data-play="${esc(v.version_id)}"${isExclusive(v) ? ' title="Vault exclusive"' : ''}>${isExclusive(v) ? I.star : ''}${esc(v.label)}</button>`).join('')}</div>` : '';
  const next = S.queue.slice(S.qi + 1, S.qi + 8).map((vid, k) => ({ v: ver(vid), qi: S.qi + 1 + k })).filter(x => x.v);
  $('#npNext').innerHTML = next.length ? `<h4>Up next</h4><ol class="upnext">${next.map(x => {
    const t = trk(x.v.track_id);
    return `<li><button data-qi="${x.qi}"><span class="n">${x.qi - S.qi}</span><span>${esc(t.title)}${x.v.label !== 'Original' ? ` <span class="d">(${esc(x.v.label)})</span>` : ''}</span><span class="d">${esc(x.v.duration || '')}</span></button></li>`;
  }).join('')}</ol>` : '';
  renderCredits();
  syncVideo();
  mediaSession(n);
  renderNpExtras(n);
  const dl = $('#npDl');
  dl.hidden = !n.dl; if (n.dl) { dl.href = n.dl; dl.innerHTML = I.dl + 'Download ' + esc(n.v.format || 'file'); }
  markPlaying();
}

// The cover for the lock screen, CarPlay and Bluetooth displays. The picture is turned into a blob address (phones read that more reliably than a data: address),
// sent with its real size, and set again once it has loaded, because it often arrives after the song starts.
function artBlob(u) {
  S.artB = S.artB || new Map();
  if (S.artB.has(u)) return S.artB.get(u);
  const p = fetch(u).then(r => r.blob()).then(b => new Promise(res => {
    const url = URL.createObjectURL(b), im = new Image();
    im.onload = () => res({ src: url, sizes: (im.naturalWidth || 512) + 'x' + (im.naturalHeight || 512), type: b.type || 'image/jpeg' });
    im.onerror = () => res(null); im.src = url;
  })).catch(() => null);
  S.artB.set(u, p); return p;
}
function mediaArt(n) {
  const k = artFor(n.t, n.v); if (!k) return Promise.resolve([]);
  const have = S.covers[k + '|f'] || S.covers[k];
  const src = S.coverP[k + '|f'] || (have ? Promise.resolve(have) : (S.coverP[k] = S.coverP[k] || run('getCover', k, BOOT.key, BOOT.token, false).then(u => (S.covers[k] = u))));   // the full-size cover when it is on its way
  return src.then(u => (u ? artBlob(u) : null)).then(a => (a ? [a] : []));
}
function mediaSession(n) {
  if (!('mediaSession' in navigator)) return;
  try {
    const meta = { title: n.t.title, artist: artistOf(n.t) || relArtist(n.r), album: n.r.title };
    navigator.mediaSession.metadata = new MediaMetadata(meta);
    mediaArt(n).then(art => { if (art.length && S.now === n) navigator.mediaSession.metadata = new MediaMetadata(Object.assign({}, meta, { artwork: art })); }).catch(() => {});
    navigator.mediaSession.setActionHandler('play', () => audio.play());
    navigator.mediaSession.setActionHandler('pause', () => audio.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => step(-1));
    navigator.mediaSession.setActionHandler('nexttrack', () => step(1));
    navigator.mediaSession.setActionHandler('seekto', d => { if (d.seekTime != null) audio.currentTime = d.seekTime; });
  } catch (e) {}
}

function step(dir) {
  if (!S.now) return;
  if (dir < 0 && audio.currentTime > 3) { audio.currentTime = 0; return; }
  const i = S.qi + dir;
  if (i >= 0 && i < S.queue.length) { S.qi = i; play(S.queue[i]); }
}


/* ── queue ── */
function shuffled(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function releaseQueue(relId) {
  const ts = tracksOf(relId), L = songListsFor(relId);
  let list = (S.view === 'release' && relId === S.releaseId && L[S.songTab] && L[S.songTab].length) ? L[S.songTab] : L.full;
  if (!list.length) list = ts;
  return list.map(t => primaryOf(t).version_id);
}
function playQueue(list, i) { if (!list.length) return; S.queue = list; S.qi = i; play(list[i]); }
// A tap on a song row or version chip: keep going through that song's release from there.
function playFromTap(vid, plId) {
  const v = ver(vid); if (!v) return;
  const pid = plId || (S.view === 'playlist' ? S.plId : '');
  if (pid && plOf(pid)) {   // in a playlist (its page, or its block on a release page), play it in playlist order
    const q = plQueue(plOf(pid)), i = q.findIndex(x => ver(x).track_id === v.track_id);
    if (i > -1) { q[i] = vid; playQueue(q, i); return; }
  }
  if (S.now && S.queue[S.qi] && ver(S.queue[S.qi]) && ver(S.queue[S.qi]).track_id === v.track_id) {
    S.queue[S.qi] = vid; play(vid); return;
  }
  const t = trk(v.track_id), list = releaseQueue(t.release_id);
  let i = list.findIndex(x => ver(x).track_id === t.track_id);
  if (i < 0) { list.unshift(vid); i = 0; } else list[i] = vid;
  playQueue(list, i);
}
function playNext(tid) {
  const vid = primaryOf(trk(tid)).version_id;
  if (!S.now) return playQueue([vid], 0);
  S.queue.splice(S.qi + 1, 0, vid); updateNowUI(); toast('Plays next');
}
// "Add to queue" on a release or playlist page: every song goes to the end of the Now Playing list.
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-queue-rel],[data-pl-queue]'); if (!b) return;
  const list = b.hasAttribute('data-queue-rel') ? releaseQueue(S.releaseId) : (plOf(S.plId) ? plQueue(plOf(S.plId)) : []);
  if (!list.length) return toast('Nothing to add');
  if (!S.now) { playQueue(list.slice(), 0); return toast('Playing'); }
  S.queue.push(...list); updateNowUI(); toast(list.length + (list.length === 1 ? ' song' : ' songs') + ' added to the queue');
});
function addToQueue(tid) {
  const vid = primaryOf(trk(tid)).version_id;
  if (!S.now) return playQueue([vid], 0);
  S.queue.push(vid); updateNowUI(); toast('Added to queue');
}
function shuffleUpNext() {
  const rest = S.queue.slice(S.qi + 1);
  if (rest.length < 2) return toast('Nothing to shuffle');
  S.queue = S.queue.slice(0, S.qi + 1).concat(shuffled(rest)); updateNowUI(); toast('Shuffled');
}

/* ── ⋯ menu ── */
function openMore(tid) {
  const t = trk(tid);
  $('#modal').innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mTitle">
    <h2 id="mTitle">${esc(t.title)}</h2>
    <ul class="sheetlist">
      <li><button data-sheet="next" data-id="${esc(tid)}">${I.next2}Play next</button></li>
      <li><button data-sheet="queue" data-id="${esc(tid)}">${I.queue}Add to queue</button></li>
      ${videoOf(t) ? `<li><button data-sheet="watch" data-id="${esc(tid)}">${I.film}Watch video</button></li>` : ''}
      <li><button ${OWNER ? `data-sheet="details"` : `data-song="${esc(tid)}"`} data-id="${esc(tid)}">${I.text || I.info}Lyrics, credits and more</button></li>
      ${t.voice_note_id ? `<li><button data-sheet="voice" data-id="${esc(tid)}">${I.mic}Voice note from Nicólas</button></li>` : ''}
      ${OWNER ? `<li><button data-sheet="addpl" data-id="${esc(tid)}">${I.plus}Add to playlist…</button></li>
                 <li><button data-sheet="manage" data-id="${esc(tid)}">${I.edit}Versions, files and covers</button></li>
                 <li><button data-share="track" data-id="${esc(tid)}">${I.share}Share this song</button></li>` : ''}
    </ul>
    <div class="end"><button class="pill soft" data-close>Close</button></div></div>`;
  $('#modal').hidden = false;
  $('#modal').querySelector('[data-sheet]').focus();
}

/* ── credits ── */
const CREDIT_FIELDS = [['features', 'Features'], ['producer', 'Producer'], ['engineer', 'Engineer'], ['bpm', 'BPM'], ['key', 'Key']];
function renderCredits() {
  const n = S.now; if (!n) return;
  const rows = CREDIT_FIELDS.filter(([k]) => creditVal(n.t, k));
  const notes = OWNER && String(n.t.notes || '').trim();
  $('#npCredits').innerHTML = (rows.length || notes) ? `<h4>Credits</h4><dl class="credits">${rows.map(([k, l]) => `<dt>${l}</dt><dd>${['features', 'producer', 'engineer'].includes(k) ? linkNames(creditVal(n.t, k)) : esc(creditVal(n.t, k))}</dd>`).join('')}
    ${notes ? `<dt>Notes</dt><dd>${esc(n.t.notes)}</dd>` : ''}</dl>` : '';
}
function openDetails(tid) {
  const t = trk(tid);
  if (!OWNER) {
    const rows = CREDIT_FIELDS.filter(([k]) => creditVal(t, k));
    $('#modal').innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mTitle"><h2 id="mTitle">${esc(t.title)}</h2>
      ${rows.length ? `<dl class="credits">${rows.map(([k, l]) => `<dt>${l}</dt><dd>${['features', 'producer', 'engineer'].includes(k) ? linkNames(creditVal(t, k)) : esc(creditVal(t, k))}</dd>`).join('')}</dl>` : '<p class="cs">No credits added yet.</p>'}
      <div class="end"><button class="pill soft" data-close>Close</button></div></div>`;
  } else {
    const f = (k, l, ph, cls) => `<label class="${cls || ''}">${esc(l)}<input class="field" data-cred="${k}" value="${esc(t[k] || '')}" maxlength="200" placeholder="${esc(ph || '')}">${albumHint(t, k)}</label>`;
    $('#modal').innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mTitle"><h2 id="mTitle">${esc(t.title)}</h2>
      <div class="dgrid">
        <label class="full">Song title<input class="field" data-cred="title" value="${esc(t.title || '')}" maxlength="200"></label>
        <label class="full">YouTube video link<input class="field" data-cred="video_url" value="${esc(t.video_url || '')}" maxlength="300" placeholder="https://youtu.be/..." inputmode="url"></label>
        ${f('artist', 'Song artist (if not ' + relArtist(rel(t.release_id)) + ')', relArtist(rel(t.release_id)), 'full')}
        ${f('features', 'Features', 'Aziza, Khairro', 'full')}${f('producer', 'Producer')}${f('engineer', 'Engineer')}${f('bpm', 'BPM', '92')}${f('key', 'Key', 'F minor')}
        <label class="full">Lyrics (fans can read these)<textarea class="field" data-cred="lyrics" rows="8" maxlength="20000">${esc(t.lyrics || '')}</textarea></label>
        <label class="full">Private notes (only you see these)<textarea class="field" data-cred="notes" maxlength="2000">${esc(t.notes || '')}</textarea></label>
      </div>
      <p class="err" id="dErr" hidden></p>
      <div class="end"><button class="pill soft" data-close>Cancel</button><button class="pill main" data-details-save="${esc(tid)}">Save</button></div></div>`;
  }
  $('#modal').hidden = false;
  const first = $('#modal').querySelector('input, textarea, button'); if (first) first.focus();
}

/* ── versions, files and covers (one place to edit them) ── */
function openManage(tid) {
  const t = trk(tid); if (!t) return;
  const vs = versionsOf(tid, true);
  $('#modal').innerHTML = `<div class="sheet wide" role="dialog" aria-modal="true" aria-labelledby="mTitle">
    <h2 id="mTitle">${esc(t.title)}</h2>
    <h4>Versions</h4>
    <ul class="mvers">${vs.map(v => `<li data-mv="${esc(v.version_id)}">
      <label>Version name<input class="field" data-mv-label maxlength="60" value="${esc(v.label)}"></label>
      <p class="cs">${esc([v.format, v.duration, v.is_primary ? 'plays first' : ''].filter(Boolean).join(' · '))}</p>
      <div class="end" style="justify-content:flex-start;flex-wrap:wrap;gap:8px">
        <button class="pill main" data-mv-save>Save name</button>
        <button class="pill soft" data-mv-replace>Replace file</button>
        ${v.is_primary ? '' : '<button class="pill soft" data-mv-first>Play this first</button>'}
        ${vs.length > 1 ? '<button class="pill soft" data-mv-del>' + I.trash + 'Delete</button>' : ''}
        <input type="file" data-mv-file accept=".wav,.aif,.aiff,.flac,.mp3,.m4a,audio/*" hidden></div>
      <div class="prog" data-mv-prog hidden><div class="bar"><i data-mv-bar></i></div><p class="cs" data-mv-stat></p></div></li>`).join('')}</ul>
    <div class="end" style="justify-content:flex-start"><button class="pill soft" data-mv-add>${I.plus}Add a version</button></div>
    <h4>Song cover</h4>
    <div class="end" style="justify-content:flex-start;flex-wrap:wrap;gap:8px"><button class="pill soft" data-mv-cover>${I.img}${t.track_cover ? 'Change song cover' : 'Add a song cover'}</button>
      ${t.track_cover ? `<button class="pill soft" data-mv-coverdel>Remove</button>` : ''}</div>
    <h4>Voice note</h4>
    <div class="end" style="justify-content:flex-start;flex-wrap:wrap;gap:8px"><button class="pill soft" data-mv-voice>${I.mic}${t.voice_note_id ? 'Replace voice note' : 'Add a voice note'}</button>
      ${t.voice_note_id ? `<button class="pill soft" data-mv-voicedel>Remove</button>` : ''}</div>
    <h4>Video</h4>
    <div class="end" style="justify-content:flex-start"><button class="pill soft" data-mv-video>${I.film}${videoOf(t) ? 'Edit video link' : 'Add a video link'}</button></div>
    <p class="err" id="mvErr" hidden></p>
    <div class="end"><button class="pill soft" data-close>Done</button></div></div>`;
  $('#modal').hidden = false;
  const m = $('#modal'), err = msg => { const e = $('#mvErr'); e.hidden = !msg; e.textContent = msg || ''; };
  m.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    const li = b.closest('[data-mv]'), vid = li && li.dataset.mv;
    if (b.hasAttribute('data-mv-save')) {
      const label = li.querySelector('[data-mv-label]').value.trim();
      if (!label) return err('Give the version a name.');
      b.disabled = true;
      try { const o = await run('updateVersion', BOOT.key, vid, { label }); applyVersion(o); toast('Name saved'); err(''); }
      catch (x) { err(x.message || 'Could not save.'); }
      b.disabled = false;
    } else if (b.hasAttribute('data-mv-replace')) li.querySelector('[data-mv-file]').click();
    else if (b.hasAttribute('data-mv-first')) {
      try { const o = await run('updateVersion', BOOT.key, vid, { primary: true }); applyVersion(o); openManage(tid); toast('Plays first now'); }
      catch (x) { err(x.message || 'Could not change it.'); }
    } else if (b.hasAttribute('data-mv-del')) {
      const v = ver(vid);
      if (!confirm(`Delete the “${v.label}” version of “${t.title}”?\n\nIts comments and share links go too. The audio file stays in your Drive.`)) return;
      try {
        await run('deleteVersion', BOOT.key, vid);
        if (S.now && S.now.v.version_id === vid) stopPlayback();
        S.queue = (S.queue || []).filter(x => x !== vid);
        const gone = S.lib.versions.find(x => x.version_id === vid);
        S.lib.versions = S.lib.versions.filter(x => x.version_id !== vid);
        const left = versionsOf(tid, true); if (gone && gone.is_primary && left[0]) left[0].is_primary = true;
        S.lib.shares = (S.lib.shares || []).filter(s => !(s.target_type === 'version' && s.target_id === vid));
        libCacheSet(S.lib); openManage(tid); toast('Version deleted');
        if (S.view === 'release') renderRelease(S.releaseId);
      } catch (x) { err(x.message || 'Could not delete the version.'); }
    }
    else if (b.hasAttribute('data-mv-add')) openUpload(t.release_id, tid);
    else if (b.hasAttribute('data-mv-cover')) { closeModal(); pickSongCover(tid); }
    else if (b.hasAttribute('data-mv-coverdel')) { closeModal(); removeSongCover(tid); }
    else if (b.hasAttribute('data-mv-voice')) openVoiceUpload(tid);
    else if (b.hasAttribute('data-mv-voicedel')) { closeModal(); removeVoice(tid); }
    else if (b.hasAttribute('data-mv-video')) openDetails(tid);
  };
  m.onchange = async e => {
    const inp = e.target.closest('[data-mv-file]'); if (!inp || !inp.files[0]) return;
    const li = inp.closest('[data-mv]'), vid = li.dataset.mv, file = inp.files[0];
    const prog = li.querySelector('[data-mv-prog]'), stat = li.querySelector('[data-mv-stat]'), bar = li.querySelector('[data-mv-bar]');
    prog.hidden = false; err('');
    li.querySelectorAll('button').forEach(x => (x.disabled = true));
    try {
      const duration = await audioDuration(file);
      stat.textContent = 'Connecting to Drive…';
      const ticket = await run('getUploadTicket', BOOT.key, t.release_id);
      stat.textContent = 'Uploading ' + file.name + '…';
      const fileId = await driveUpload(file, file.name, file.type || 'audio/wav', ticket, p => bar.style.setProperty('--p', Math.round(p * 90) + '%'));
      stat.textContent = 'Swapping it in…';
      const old = ver(vid), oldFid = old && old.audio;
      const o = await run('updateVersion', BOOT.key, vid, { fileId, duration });
      if (S.now && S.now.v.version_id === vid) stopPlayback();
      if (oldFid) { delete S.mem[oldFid]; if (S.rescues) delete S.rescues[oldFid]; }
      applyVersion(o); libCacheSet(S.lib); toast('File replaced'); openManage(tid);
    } catch (x) { prog.hidden = true; li.querySelectorAll('button').forEach(y => (y.disabled = false)); err(x.message || 'The upload did not finish.'); }
  };
}
// Puts a server-confirmed version row into the library and repaints what shows it.
function applyVersion(o) {
  if (!o) return;
  const v = ver(o.version_id); if (!v) return;
  if (o.is_primary) S.lib.versions.filter(x => x.track_id === o.track_id).forEach(x => (x.is_primary = false));
  Object.assign(v, o); libCacheSet(S.lib);
  if (S.view === 'release') renderRelease(S.releaseId);
  if (S.now) updateNowUI();
}
async function saveDetails(tid, btn) {
  const fields = {}; $$('[data-cred]').forEach(el => (fields[el.dataset.cred] = el.value.trim()));
  if ('title' in fields && !fields.title) { const err = $('#dErr'); err.hidden = false; err.textContent = 'A song needs a title.'; return; }
  if (fields.video_url && !ytId(fields.video_url)) {
    const err = $('#dErr'); err.hidden = false; err.textContent = "That doesn't look like a YouTube link. Use the link from YouTube's Share button.";
    return;
  }
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await run('saveTrackDetails', BOOT.key, tid, fields);
    Object.assign(trk(tid), fields); closeModal(); toast('Saved'); if (S.now) updateNowUI();
    if (S.view === 'release') renderRelease(S.releaseId);
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Save';
    const err = $('#dErr'); err.hidden = false; err.textContent = e.message || 'Could not save.';
  }
}

