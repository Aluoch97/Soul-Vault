/* ── comments ── */
async function loadComments(vid, force) {
  if (!force && S.comments[vid]) return renderComments();
  if (!S.comments[vid]) renderComments();
  try { S.comments[vid] = await run('getComments', BOOT.key, BOOT.token, vid); }
  catch (e) { S.comments[vid] = []; }
  if (S.now && S.now.v.version_id === vid) renderComments();
}
function renderComments() {
  if (!$('#npComments')) return;   // comments are not part of the app any more
  const n = S.now; if (!n) return;
  const list = S.comments[n.v.version_id];
  const box = $('#npComments');
  if (!list) { box.innerHTML = '<h4>Comments</h4><p class="cs">Loading comments…</p>'; return; }
  box.innerHTML = `<h4>Comments</h4>
    <button class="pill soft" data-comment-add>${I.chat}Comment at&nbsp;<span data-cur>${fmt(audio.currentTime)}</span></button>
    <div id="cForm"></div>
    ${list.length ? `<ol class="clist">${list.map(c => `<li class="${c.resolved ? 'done' : ''}">
      <button class="when" data-seek-to="${c.time_sec}" aria-label="Jump to ${fmt(c.time_sec)}">${fmt(c.time_sec)}</button>
      <div style="min-width:0"><div class="who">${esc(c.name)}${OWNER && c.via && c.via !== 'owner' ? ' · ' + esc(linkName(c.via)) : ''}</div><p>${esc(c.text)}</p></div>
      ${OWNER ? `<div class="cact"><button class="ib" data-resolve="${esc(c.comment_id)}" aria-label="${c.resolved ? 'Reopen' : 'Mark resolved'}">${I.check}</button>
                <button class="ib" data-cdel="${esc(c.comment_id)}" aria-label="Delete comment">${I.trash}</button></div>` : '<span></span>'}
    </li>`).join('')}</ol>` : '<p class="cs">No comments on this version yet.</p>'}`;
  renderMarks();
}
function linkName(token) { const s = (S.lib.shares || []).find(x => x.token === token); return s ? (s.label || 'share link') : 'share link'; }
function renderMarks() {
  const n = S.now, list = n && S.comments[n.v.version_id], d = audio.duration;
  $('#npMarks').innerHTML = (list && d) ? list.filter(c => !c.resolved).map(c => `<i style="left:${Math.min(100, c.time_sec / d * 100)}%"></i>`).join('') : '';
}
function openCommentForm() {
  const at = audio.currentTime || 0;
  const needName = !OWNER;
  $('#cForm').innerHTML = `<div class="cform" data-at="${at}">
    ${needName ? `<input id="cName" maxlength="60" placeholder="Your name" value="${esc(ls.get('sv_name', ''))}" aria-label="Your name">` : ''}
    <textarea id="cText" maxlength="1000" placeholder="Note at ${fmt(at)}" aria-label="Comment at ${fmt(at)}"></textarea>
    <p class="err" id="cErr" hidden></p>
    ${OWNER ? '' : '<p class="cs cnote">Your name and note are visible to Nicólas Soul and to anyone else using this same link. <a class="plink" href="https://www.soulnicolas.com/privacy-policy" target="_blank" rel="noopener">Privacy policy</a></p>'}
    <div class="end"><button class="pill soft" data-comment-cancel>Cancel</button><button class="pill main" data-comment-post>Post</button></div></div>`;
  ($('#cName') && !$('#cName').value ? $('#cName') : $('#cText')).focus();
}
async function postComment(btn) {
  const form = $('.cform'), at = +form.dataset.at, text = $('#cText').value.trim();
  const name = $('#cName') ? $('#cName').value.trim() : '';
  const err = $('#cErr');
  if (!text) { err.hidden = false; err.textContent = 'Write a note first.'; return; }
  if ($('#cName') && !name) { err.hidden = false; err.textContent = 'Add your name so they know who it is from.'; return; }
  btn.disabled = true; btn.textContent = 'Posting…';
  if (name) ls.set('sv_name', name);
  try {
    const c = await run('addComment', BOOT.key, BOOT.token, S.now.v.version_id, at, name, text);
    (S.comments[S.now.v.version_id] = S.comments[S.now.v.version_id] || []).push(c);
    S.comments[S.now.v.version_id].sort((a, b) => a.time_sec - b.time_sec);
    renderComments(); toast('Comment posted'); award('comment');
  } catch (e) { btn.disabled = false; btn.textContent = 'Post'; err.hidden = false; err.textContent = e.message || 'Could not post.'; }
}
async function resolveComment(id) {
  const list = S.comments[S.now.v.version_id], c = list.find(x => x.comment_id === id);
  c.resolved = !c.resolved; renderComments();
  try { await run('resolveComment', BOOT.key, id, c.resolved); } catch (e) { c.resolved = !c.resolved; renderComments(); toast('Could not update'); }
}
async function deleteComment(id) {
  if (!confirm('Delete this comment?')) return;
  const vid = S.now.v.version_id;
  try { await run('deleteComment', BOOT.key, id); S.comments[vid] = S.comments[vid].filter(c => c.comment_id !== id); renderComments(); }
  catch (e) { toast('Could not delete'); }
}

/* ── uploads ── */
function jobShow(t, p, n) { $('#job').hidden = false; $('#jobT').textContent = t; $('#jobN').textContent = n || ''; $('#jobBar').style.setProperty('--p', Math.round((p || 0) * 100) + '%'); }
function jobHide() { $('#job').hidden = true; }

async function driveUpload(blob, name, mime, ticket, onProg) {
  const init = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + ticket.token, 'Content-Type': 'application/json; charset=UTF-8',
               'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(blob.size) },
    body: JSON.stringify({ name: name, parents: [ticket.folderId] })
  });
  if (!init.ok) throw new Error('Drive refused the upload (' + init.status + '). Reload the page and try again.');
  const loc = init.headers.get('Location');
  if (!loc) throw new Error('Drive did not return an upload address.');
  const CH = 8 * 1024 * 1024;
  let off = 0, tries = 0;
  while (off < blob.size) {
    const end = Math.min(off + CH, blob.size);
    let r;
    try { r = await fetch(loc, { method: 'PUT', headers: { 'Content-Range': `bytes ${off}-${end - 1}/${blob.size}` }, body: blob.slice(off, end) }); }
    catch (e) { if (++tries > 3) throw new Error('The connection dropped during upload.'); await new Promise(z => setTimeout(z, 1500 * tries)); continue; }
    if (r.status === 308) {
      const range = r.headers.get('Range');
      off = range ? +range.split('-')[1] + 1 : end; tries = 0;
      onProg && onProg(off / blob.size);
    } else if (r.ok) {
      onProg && onProg(1);
      return (await r.json()).id;
    } else if (r.status >= 500 && ++tries <= 3) {
      await new Promise(z => setTimeout(z, 1500 * tries));
    } else {
      throw new Error('Upload failed (' + r.status + ').');
    }
  }
  throw new Error('Upload ended without a file.');
}

let lameP = null;
// Decodes any browser-readable audio and returns a 160 kbps MP3 blob.
async function toMp3(arrayBuffer, onProg, kbps) {
  const lame = await loadLame();
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  let buf;
  try { buf = await ctx.decodeAudioData(arrayBuffer); }
  catch (e) { throw new Error('This browser could not read that audio file.'); }
  finally { try { ctx.close(); } catch (e) {} }
  const ch = Math.min(2, buf.numberOfChannels), L = buf.getChannelData(0), R = ch > 1 ? buf.getChannelData(1) : null;
  const enc = new lame.Mp3Encoder(ch, buf.sampleRate, kbps || 160), out = [], block = 1152;
  const l16 = new Int16Array(block), r16 = new Int16Array(block);
  const fill = (src, dst, i, n) => { for (let k = 0; k < n; k++) { let x = src[i + k]; x = x < -1 ? -1 : x > 1 ? 1 : x; dst[k] = x < 0 ? x * 0x8000 : x * 0x7FFF; } };
  for (let i = 0, b = 0; i < L.length; i += block, b++) {
    const n = Math.min(block, L.length - i);
    fill(L, l16, i, n); if (R) fill(R, r16, i, n);
    const d = R ? enc.encodeBuffer(l16.subarray(0, n), r16.subarray(0, n)) : enc.encodeBuffer(l16.subarray(0, n));
    if (d.length) out.push(new Uint8Array(d));
    if (b % 300 === 0) { onProg && onProg(i / L.length); await new Promise(z => setTimeout(z, 0)); }
  }
  const f = enc.flush(); if (f.length) out.push(new Uint8Array(f));
  return { blob: new Blob(out, { type: 'audio/mpeg' }), duration: buf.duration };
}

const LOSSLESS = /\.(wav|aiff?|flac)$/i;
function openUpload(relId, tid) {
  const t = tid && trk(tid), r = rel(relId);
  $('#modal').innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mTitle">
    <h2 id="mTitle">${t ? 'New version of ' + esc(t.title) : 'Add a song to ' + esc(r.title)}</h2>
    <label>Audio file<input class="field" type="file" id="uFile" accept=".wav,.aif,.aiff,.flac,.mp3,.m4a,audio/*"></label>
    ${t ? `<label>Version name<input class="field" id="uLabel" maxlength="60" placeholder="Mix v4"></label>`
        : `<label>Song title<input class="field" id="uTitle" maxlength="200" placeholder="Song title"></label>`}
    ${t ? `<label class="row2"><input type="checkbox" id="uPrimary" checked> Make this the version that plays first</label>` : ''}
    <div class="prog" id="uProg" hidden><div class="bar"><i id="uBar"></i></div><p class="cs" id="uStat"></p></div>
    <p class="err" id="uErr" hidden></p>
    <div class="end"><button class="pill soft" data-close>Cancel</button><button class="pill main" data-upload-go="${esc(relId)}" data-track="${esc(tid || '')}">Upload</button></div>
    ${t ? '' : `<div class="ytadd"><label>Or add it from a YouTube link (plays through the video)<input class="field" id="uYt" type="url" inputmode="url" placeholder="https://youtu.be/…"></label>
      <div class="end" style="margin:0"><button class="pill soft" data-yt-add="${esc(relId)}">${I.play}Add from YouTube</button></div></div>
    <div class="ytadd"><label>Or add it from a SoundCloud link (plays in SoundCloud's player)<input class="field" id="uSc" type="url" inputmode="url" placeholder="https://soundcloud.com/artist/song"></label>
      <div class="end" style="margin:0"><button class="pill soft" data-sc-add="${esc(relId)}">${I.play}Add from SoundCloud</button></div></div>`}</div>`;
  $('#modal').hidden = false;
  $('#uFile').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const base = f.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
    if ($('#uTitle') && !$('#uTitle').value) $('#uTitle').value = base;
    if ($('#uLabel') && !$('#uLabel').value) $('#uLabel').value = base.length <= 40 ? base : '';
  });
  $('#uFile').focus();
}
async function doUpload(btn) {
  const relId = btn.dataset.uploadGo, tid = btn.dataset.track || null;
  const file = $('#uFile').files[0], err = $('#uErr');
  const bail = m => { err.hidden = false; err.textContent = m; btn.disabled = false; btn.textContent = 'Upload'; };
  if (!file) return bail('Choose an audio file first.');
  const title = $('#uTitle') ? $('#uTitle').value.trim() : '';
  const label = $('#uLabel') ? ($('#uLabel').value.trim() || 'New version') : 'Original';
  if ($('#uTitle') && !title) return bail('Give the song a title.');
  btn.disabled = true; btn.textContent = 'Working…'; err.hidden = true; $('#uProg').hidden = false;
  const stat = t => ($('#uStat').textContent = t), bar = p => $('#uBar').style.setProperty('--p', Math.round(p * 100) + '%');
  try {
    let out;
    if (EDGE_UPLOADS()) out = await uploadSongToEdge(file, relId, tid, title, label, tid ? $('#uPrimary').checked : true, stat, bar);   // straight to our own storage
    else {
    const preview = null; const duration = await audioDuration(file);
    stat('Connecting to Drive…');
    const ticket = await run('getUploadTicket', BOOT.key, relId);
    stat('Uploading ' + file.name + '…');
    const base = preview ? 0.3 : 0, span = preview ? 0.6 : 0.9;
    const fileId = await driveUpload(file, file.name, file.type || 'audio/wav', ticket, p => bar(base + p * span));
    let previewId = '';
    if (preview) {
      stat('Uploading the preview…');
      previewId = await driveUpload(preview, file.name.replace(/\.[^.]+$/, '') + ' (preview).mp3', 'audio/mpeg', ticket, p => bar(0.9 + p * 0.05));
    }
    stat('Adding it to your library…');
    out = await run('registerUpload', BOOT.key, { releaseId: relId, trackId: tid, title, label, fileId, previewId, duration,
      primary: tid ? $('#uPrimary').checked : true });
    }
    bar(1);
    if (out.track) S.lib.tracks.push(out.track);
    if (out.version.is_primary) S.lib.versions.filter(v => v.track_id === out.version.track_id).forEach(v => (v.is_primary = false));
    S.lib.versions.push(out.version);
    if (out.version.url) (S.urlByFile = S.urlByFile || {})[out.version.audio] = out.version.url;   // plays from our own storage
    closeModal(); toast(tid ? 'Version added' : 'Song added');
    if (S.view === 'release') renderRelease(relId);
  } catch (e) { $('#uProg').hidden = true; bail(e.message || 'The upload did not finish.'); }
}

/* ── previews for existing songs ── */

// Now Playing is "open" when it is on screen. A YouTube or SoundCloud song's player lives inside it, so closing it PARKS it instead (kept on the page, invisible, still playing).
const npOpen = () => { const n = $('#np'); return !!n && !n.hidden && !n.classList.contains('parked'); };
function openNp() {
  const np = $('#np'); np.hidden = false; np.classList.remove('parked'); np.classList.add('opening');
  setTimeout(() => np.classList.remove('opening'), 400);
  np.querySelector('[data-ctl="close"]').focus();
  document.body.style.overflow = 'hidden';
}
/* ── videos: Song | Video switch in now playing ── */
function setMode(mode) {
  const n = S.now, id = n && videoOf(n.t, n.v);
  const wantVideo = mode === 'video' && !!id;
  S.videoMode = wantVideo;
  if (wantVideo && S.lyrMode) { S.lyrMode = false; S.sync = null; $('#npLyr').hidden = true; $('#lyNote').hidden = true; }
  if (wantVideo) award('video');
  $$('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === (wantVideo ? 'video' : 'song'))));
  const box = $('#npVid');
  if (wantVideo) {
    const start = Math.floor(audio.currentTime || 0);
    audio.pause();
    box.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1${start > 3 && !S.ytSong ? '&start=' + start : ''}"
      title="Video: ${esc(n.t.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
    box.dataset.vid = id;
    box.hidden = false; $('#npArt').hidden = true;
  } else {
    box.innerHTML = ''; box.dataset.vid = ''; box.hidden = true; $('#npArt').hidden = !!S.lyrMode;
  }
}
// Keeps the switch and player in step when the song changes.
function syncVideo() {
  const id = S.now && videoOf(S.now.t, S.now.v);
  $('#npMode').hidden = !id;
  if (!id && S.videoMode) setMode('song');
  else if (id && S.videoMode && $('#npVid').dataset.vid !== id) setMode('video');
}
function watchVideo(tid) {
  const t = trk(tid); if (!t || !videoOf(t)) return;
  S.videoMode = true;
  playFromTap(primaryOf(t).version_id);
  openNp();
  setMode('video');
}

function closeNp() {
  S.sync = null;
  if (S.videoMode && !S.ytSong) setMode('song');
  const link = S.ytSong || S.scSong;   // these play inside Now Playing's page, so keep it on the page (parked) and the song keeps playing
  if (link) $('#np').classList.add('parked'); else $('#np').hidden = true;
  document.body.style.overflow = ''; $('#openNp').focus(); }
// Really close it: nothing is playing in it any more.
function hideNpFully() { const np = $('#np'); if (!np) return; np.classList.remove('parked'); np.hidden = true; document.body.style.overflow = ''; }

// Swipe down on the now-playing screen to close it.
(() => {
  const np = $('#np'); let y0 = null;
  np.addEventListener('touchstart', e => { y0 = np.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  np.addEventListener('touchend', e => {
    if (y0 != null && e.changedTouches[0].clientY - y0 > 110) closeNp();
    y0 = null;
  }, { passive: true });
})();

// Keep keyboard focus inside whichever overlay is open.
function trapFocus(e) {
  const box = !$('#modal').hidden ? $('#modal') : (npOpen() ? $('#np') : null);
  if (!box || e.key !== 'Tab') return;
  const f = [...box.querySelectorAll('button, a[href], input, select')].filter(el => !el.hidden && el.offsetParent);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

// Send unexpected page errors to the Apps Script log (Executions) so problems are visible.
window.addEventListener('error', e => { if (!S.lib) empty('Soul Vault hit an error while starting: ' + (e.message || e), true); });
window.addEventListener('error', e => { try { logErr(String(e.message || e)); } catch (x) {} });
window.addEventListener('unhandledrejection', e => { try { logErr(String((e.reason && e.reason.message) || e.reason)); } catch (x) {} });

audio.addEventListener('play', () => { setToggle(true); markPlaying(); });
audio.addEventListener('pause', () => { setToggle(false); markPlaying(); });
audio.addEventListener('timeupdate', () => {
  const pct = audio.duration ? audio.currentTime / audio.duration : 0;
  if (S.now && !S.now.heard && audio.src !== SILENT && audio.duration && audio.currentTime > Math.min(30, audio.duration * 0.5)) { S.now.heard = true; markHeard(S.now.t); }
  $$('[data-cur]').forEach(e => e.textContent = fmt(audio.currentTime));
  $$('[data-dur]').forEach(e => e.textContent = fmt(audio.duration));
  $$('[data-seek]').forEach(e => { if (document.activeElement !== e) e.value = Math.round(pct * 1000); e.style.setProperty('--p', (pct * 100) + '%'); });
  $('.mprog').style.setProperty('--p', (pct * 100) + '%');
});
audio.addEventListener('loadedmetadata', renderMarks);
audio.addEventListener('timeupdate', () => { updateLyr(false); saveResume(false); listenTick(); });
audio.addEventListener('playing', () => { if (!S.lt || !S.now || S.lt.v !== S.now.v.version_id) listenStart(); else S.lt.last = audio.currentTime; });
audio.addEventListener('seeking', () => { if (S.lt) S.lt.last = null; });
audio.addEventListener('waiting', () => {
  clearTimeout(S.stallT); const n = S.now; if (!n) return;
  S.stallT = setTimeout(async () => {
    if (S.now !== n || audio.paused || audio.readyState >= 3 || (n.stalls = (n.stalls || 0) + 1) > 2) return;
    const at = audio.currentTime, fid = songFile(n.v);
    try { delete S.pub[fid]; const src = await sourceFor(fid, false, !(S.urlByFile && S.urlByFile[fid] && !(S.badFile && S.badFile[fid]))); if (S.now !== n) return;
      S.resumeAt = { vid: n.v.version_id, t: at }; audio.src = src.stream; await audio.play(); } catch (e) {}
  }, 9000);
});
audio.addEventListener('playing', () => clearTimeout(S.stallT));
audio.addEventListener('seeked', () => { if (S.lt) S.lt.last = null; });
audio.addEventListener('pause', () => saveResume(true));
window.addEventListener('pagehide', () => { saveResume(true); flushOnLeave(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) flushListens(); });
audio.addEventListener('loadedmetadata', () => {
  const ra = S.resumeAt; if (!ra || !S.now || S.now.v.version_id !== ra.vid) return;
  S.resumeAt = null; if (ra.t > 0 && ra.t < audio.duration - 5) audio.currentTime = ra.t;
});
audio.addEventListener('loadedmetadata', () => {
  const n = S.now; if (!n || audio.src === SILENT || !isFinite(audio.duration) || audio.duration < 2) return;
  if (String(n.v.duration || '').trim()) return;
  n.v.duration = fmt(audio.duration);
  if (S.view === 'release' && S.releaseId === n.r.release_id && !S.editing) {
    const d = $(`.row[data-track="${CSS.escape(n.t.track_id)}"] .dur`); if (d) d.textContent = n.v.duration;
    const head = $('#relhead .relmeta'); if (head) head.outerHTML = metaLine(n.r, tracksOf(n.r.release_id)).split('</div>')[0] + '</div>';
  }
  if (OWNER) run('setDuration', BOOT.key, n.v.version_id, audio.duration).catch(() => {});
});
audio.addEventListener('ended', () => {
  if (audio.src === SILENT) return;
  listenEnd(true);
  if (S.repeat === 'one' && S.now) { audio.currentTime = 0; audio.play().catch(() => {}); return; }
  if (S.repeat === 'all' && S.qi >= S.queue.length - 1 && S.queue.length) { playQueue(S.queue, 0); return; }
  // last song of the queue: if this release continues in a series, hand off to the next part
  if (S.qi >= S.queue.length - 1 && maybeSeriesTransition()) return;
  step(1);
});
audio.addEventListener('error', onAudioError);
$$('[data-seek]').forEach(e => e.addEventListener('input', () => {
  if (audio.duration) audio.currentTime = e.value / 1000 * audio.duration;
  e.style.setProperty('--p', (e.value / 10) + '%');
}));

/* ── share links ── */
function targetOf(s) {
  if (s.target_type === 'all') return { name: 'Fan club: the whole vault', r: null, club: true };
  if (s.target_type === 'release') { const r = rel(s.target_id); return { name: r ? r.title : 'Release', r }; }
  const tid = s.target_type === 'track' ? s.target_id : ((S.lib.versions.find(v => v.version_id === s.target_id) || {}).track_id);
  const t = trk(tid);
  return { name: t ? t.title : 'Song', r: t ? rel(t.release_id) : null };
}

function renderShares() {
  clearPageBg();
  S.view = 'shares'; renderChrome();
  const rows = S.lib.shares.slice().reverse();
  $('#main').innerHTML = `<div class="wrap"><button class="back" data-nav="vault">${I.back}Settings</button><h1 class="page-h"><b>Share</b> links</h1>
    <div class="clubcta"><div><strong>Fan club</strong><span class="cs">One link that opens your whole vault: every release that isn't hidden, videos, worlds and comments. Make one for everyone, or one per fan so you can switch people off individually.</span></div>
      <button class="pill main" data-share="all" data-id="all">${I.star}New fan club link</button></div>` + (rows.length ? `<div class="links">${rows.map(s => {
    const tg = targetOf(s);
    return `<div class="link">
      ${tg.club ? `<span class="art clubart" aria-hidden="true">${I.star}</span>` : `<img class="art" data-cover="${esc(tg.r ? tg.r.cover_file_id : '')}" alt="">`}
      <div style="min-width:0"><strong>${esc(s.label || s.fan_name || 'Unnamed link')}</strong><span class="cs">${esc(tg.name)}${s.member_no ? ', member #' + pad3(s.member_no) + (s.fan_name ? ' (' + esc(s.fan_name) + ')' : '') : ''}</span>
        <span class="lmeta">${s.plays} ${s.plays === 1 ? 'play' : 'plays'}, ${s.expires ? 'ends ' + esc(fmtDate(s.expires)) : 'no end date'}</span></div>
      <span class="cs plays">${s.plays} ${s.plays === 1 ? 'play' : 'plays'}</span>
      <span class="cs ends">${s.expires ? 'Ends ' + esc(fmtDate(s.expires)) : 'No end date'}</span>
      <div class="lctl" style="display:flex;gap:12px;align-items:center">
        <label class="tog"><input type="checkbox" data-active="${esc(s.token)}" ${s.active ? 'checked' : ''} aria-label="Link for ${esc(s.label || tg.name)} is on"><span></span></label>
        <button class="pill soft" data-copy="${esc(S.lib.base + '?s=' + s.token)}">Copy link</button>
        <button class="pill soft" data-delshare="${esc(s.token)}" aria-label="Delete the link ${esc(s.label || tg.name)}">Delete</button>
      </div>
    </div>`;
  }).join('')}</div></div>` : `<p class="status" style="padding-left:0">No share links yet. Open a release and choose Share, or use the share button next to a song.</p></div>`);
  loadCovers();
  window.scrollTo(0, 0);
}

function openShare(type, id) {
  const name = type === 'all' ? 'the fan club' : type === 'release' ? rel(id).title : trk(id).title;
  $('#modal').innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mTitle">
      <h2 id="mTitle">Share ${esc(name)}</h2>
      ${type === 'release' || type === 'track' ? quickShareBox(type, id) : ''}
      <label>Who is it for?<input class="field" id="mLabel" type="text" maxlength="120" placeholder="${type === 'all' ? 'Everyone, or one fan\'s name' : 'Shake, mix notes'}"></label>
      ${type === 'all' ? `<label>Greeting name (optional)<input class="field" id="mFan" maxlength="40" placeholder="Aisha"></label>
        <p class="cs cnote">Adds "Karibu, Aisha" to their Home and gives this link the next member number. Leave empty for a shared link.</p>` : ''}
      <label>Link works for
        <select class="field" id="mExp"><option value="0">Until I turn it off</option><option value="7">7 days</option><option value="30">30 days</option></select>
      </label>
      <p class="err" id="mErr" hidden></p>
      <div class="end"><button class="pill soft" data-close>Cancel</button><button class="pill main" id="mGo">Create link</button></div>
    </div>`;
  $('#modal').hidden = false;
  $('#mLabel').focus();
  $('#mGo').addEventListener('click', async () => {
    const go = $('#mGo'); go.disabled = true; go.textContent = 'Creating…';
    const label = $('#mLabel').value.trim(), allow = false;   // downloads are for the owner link only
    try {
      const fanName = $('#mFan') ? $('#mFan').value.trim() : '';
      const r = await run('createShare', BOOT.key, { targetType: type, targetId: id, label, allowDownload: allow, expiresDays: +$('#mExp').value, fanName });
      S.lib.shares.push({ token: r.token, target_type: type, target_id: id, label, allow_download: allow, expires: r.expires, active: true, plays: 0,
                          fan_name: r.fan_name || '', member_no: r.member_no || 0 });
      if (S.view === 'shares') renderShares();   // show the new link in the list right away
      $('.sheet').innerHTML = `
        <h2>Link created</h2>
        <input class="field" id="mUrl" readonly value="${esc(r.url)}">
        <div class="end"><button class="pill soft" data-close>Done</button><button class="pill main" data-copy="${esc(r.url)}">Copy link</button></div>`;
      $('#mUrl').select();
    } catch (e) {
      go.disabled = false; go.textContent = 'Create link';
      const err = $('#mErr'); err.hidden = false; err.textContent = e.message || 'The link could not be created.';
    }
  });
}
function closeModal() {
  if ((S.nr && S.nr.busy) || S.photoBusy) { toast('Upload in progress. Keep this open until it finishes.'); return; }
  if ($('.lyrall') && lyChanged().length && !confirm("Discard the lyrics you haven't saved?")) return;
  $('#modal').hidden = true; $('#modal').innerHTML = '';
}

async function copy(text, btn) {
  try { await navigator.clipboard.writeText(text); }
  catch (e) { const i = document.createElement('input'); i.value = text; document.body.appendChild(i); i.select(); document.execCommand('copy'); i.remove(); }
  const old = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = old), 1600);
}


