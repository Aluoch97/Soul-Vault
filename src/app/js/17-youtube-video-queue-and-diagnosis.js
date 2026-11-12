/* ── YouTube: every video of a playlist as its own video, a release from a link, and a setup check ── */
async function importPlaylist(btn) {
  const url = $('#xUrl').value.trim(), err = $('#xErr');
  if (!ytList(url)) { err.hidden = false; err.textContent = 'Paste a YouTube playlist link to add its videos one by one.'; return; }
  btn.disabled = true; btn.textContent = 'Reading the playlist…'; err.hidden = true;
  try {
    const out = await run('addYoutubePlaylistVideos', BOOT.key, S.releaseId, url);
    (S.lib.extras = S.lib.extras || []).push(...out.added); closeModal(); renderRelease(S.releaseId);
    toast(`Added ${out.added.length} video${out.added.length === 1 ? '' : 's'} from “${out.playlist}”` + (out.skipped ? ` (${out.skipped} were already here)` : '') + (out.truncated ? '. Only the first 100 were added.' : ''));
    const sec = $('#era-videos'); if (sec) sec.scrollIntoView();
  } catch (e) { btn.disabled = false; btn.textContent = 'Add each video separately'; err.hidden = false; err.textContent = e.message || 'Could not read that playlist.'; }
}
function openYoutubeRelease() {
  $('#modal').innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mTitle"><h2 id="mTitle">New release from YouTube</h2>
    <p class="cs">Paste a playlist (each video becomes a song) or a single video. The songs play through YouTube and the cover comes from the first video. You can change everything afterwards, and it stays hidden from fans until you show it.</p>
    <label>YouTube link<input class="field" id="yrUrl" type="url" inputmode="url" placeholder="https://www.youtube.com/playlist?list=…" maxlength="1000"></label>
    <label>Title (optional: the playlist's name is used)<input class="field" id="yrTitle" maxlength="120"></label>
    <div class="nrrow"><label>Type<select class="field" id="yrType"><option value="">Automatic (Single for one video, Album for a playlist)</option>${REL_TYPES.map(t => `<option>${t}</option>`).join('')}</select></label>
      <label>Year<input class="field" id="yrYear" type="number" inputmode="numeric" min="1990" max="2100" value="${new Date().getFullYear()}"></label></div>
    <p class="err" id="yrErr" hidden></p>
    <div class="end"><button class="pill soft" data-close>Cancel</button><button class="pill main" data-yr-go>Create release</button></div></div>`;
  $('#modal').hidden = false; $('#yrUrl').focus();
}
async function createFromYoutube(btn) {
  const url = $('#yrUrl').value.trim(), err = $('#yrErr');
  if (!ytId(url) && !ytList(url)) { err.hidden = false; err.textContent = "That doesn't look like a YouTube video or playlist link."; return; }
  btn.disabled = true; btn.textContent = 'Creating…'; err.hidden = true;
  try {
    const out = await run('createReleaseFromYoutube', BOOT.key, { url, title: $('#yrTitle').value.trim(), type: $('#yrType').value, year: $('#yrYear').value });
    const add = normalizeLib({ releases: [out.release], tracks: out.tracks, versions: out.versions, extras: [] });
    S.lib.releases.push(...add.releases); S.lib.tracks.push(...add.tracks); S.lib.versions.push(...add.versions);
    primeThumbs(); libCacheSet(S.lib); closeModal(); renderRelease(out.release.release_id);
    toast(`Created “${out.release.title}” with ${out.tracks.length} ${out.tracks.length === 1 ? 'song' : 'songs'}. It's hidden from fans until you show it.` + (out.truncated ? ' Only the first 100 videos were added.' : ''));
  } catch (e) { btn.disabled = false; btn.textContent = 'Create release'; err.hidden = false; err.textContent = e.message || 'Could not create it.'; }
}
async function checkYoutubeSetup(btn) {
  btn.disabled = true;
  try {
    const d = await run('checkYoutube', BOOT.key);
    $('#modal').innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mTitle"><h2 id="mTitle">${d.ok ? 'YouTube is connected' : "YouTube isn't ready yet"}</h2>
      <p>${d.ok ? 'Your API key can read YouTube, so adding whole playlists and starting releases from YouTube will work.' : esc(d.message)}</p>
      ${d.ok && d.shared ? '<p class="vqmsg"><b>One thing to fix:</b> it is using the same key your fans\' phones use to stream songs, so anyone could use up your YouTube allowance. Make a second key in Google Cloud limited to YouTube Data API v3, and put it in the Settings tab of your Sheet as <b>youtube_api_key</b>.</p>' : ''}<div class="end"><button class="pill main" data-close>OK</button></div></div>`;
    $('#modal').hidden = false; $('#modal [data-close]').focus();
  } catch (e) { toast(e.message || 'Could not check'); }
  btn.disabled = false;
}


/* ═════════ Build 59: a video plays exactly the one you picked ═════════ */
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  .vqmsg { margin: 10px 0; padding: 12px 14px; border-radius: 12px; background: rgba(210,16,52,.14); border: 1px solid rgba(210,16,52,.45); font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
  .vqacts { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  .vqacts .pill { min-height: 40px; }
  a.pill, a.pill:visited { color: var(--text); text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
` }));
/* The old way queued the rest of the section behind your video inside YouTube. If YouTube couldn't play the first one
   (embedding turned off, private), it silently skipped ahead to the next, so the wrong video played. Now one video loads at a time,
   the next one starts when it ends, and a video YouTube refuses is explained instead of skipped. */
function openVideoList(r, start) {
  const vs = orderedVideos(r, tracksOf(r.release_id)); if (!vs.length) return;
  start = Math.max(0, Math.min(vs.length - 1, start || 0));
  const sec = VSECTION[vs[start].type];
  const items = vs.map((v, i) => ({ v, i })).filter(x => VSECTION[x.v.type] === sec);
  S.vq = { rel: r.release_id, vs, items, pos: Math.max(0, items.findIndex(x => x.i === start)) };
  audio.pause();
  $('#modal').innerHTML = `<div class="sheet wide" role="dialog" aria-modal="true" aria-labelledby="mTitle">
    <h2 id="mTitle"></h2><div class="cs" id="vqSub"></div>
    <div class="npvid" id="vqFrame" style="margin-top:10px"></div>
    <div class="vqmsg" id="vqMsg" role="alert" hidden></div>
    ${items.length > 1 ? '<p class="cs" style="margin:10px 0 0">Plays on through this section: each video starts when the last one ends.</p>' : ''}
    ${vs.length > 1 ? `<ol class="vlist" aria-label="All the videos on this release">${vs.map((v, i) => `<li><button data-vplay="${i}">
      <span class="n">${i + 1}</span>${vThumb(v)}<span style="min-width:0"><span class="t">${esc(v.title)}</span><span class="vtype ${v.type}">${VTYPE[v.type]}</span></span></button></li>`).join('')}</ol>` : ''}
    <div class="end"><a class="pill soft" id="vqYt" href="https://www.youtube.com/" target="_blank" rel="noopener noreferrer">Watch on YouTube</a><button class="pill soft" data-close>Close</button></div></div>`;
  $('#modal').hidden = false; award('video'); vqLoad(S.vq.pos);
}
function vqUrl(v) { return 'https://www.youtube.com/' + (v.id ? 'watch?v=' + v.id + (v.list ? '&list=' + v.list : '') : 'playlist?list=' + v.list); }
function vqLoad(pos) {
  const q = S.vq, it = q && q.items[pos]; if (!it) return;
  q.pos = pos; const v = it.v;
  $('#mTitle').textContent = v.title;
  $('#vqSub').textContent = VTYPE[v.type] + (q.items.length > 1 ? ` · ${pos + 1} of ${q.items.length}` : '');
  const base = v.list ? `https://www.youtube-nocookie.com/embed/${v.id ? v.id + '?list=' + v.list + '&' : 'videoseries?list=' + v.list + '&'}autoplay=1&playsinline=1&rel=0&enablejsapi=1`
                      : `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1`;
  $('#vqFrame').innerHTML = `<iframe src="${base}" title="Video: ${esc(v.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
  const f = $('#vqFrame iframe'), hello = () => { try { f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'vq', channel: 'widget' }), '*'); } catch (x) {} };
  f.addEventListener('load', () => { hello(); setTimeout(hello, 800); });
  $('#vqMsg').hidden = true; $('#vqYt').href = vqUrl(v);
  $$('#modal .vlist [data-vplay]').forEach(b => { if (+b.dataset.vplay === it.i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
}
function vqNext() { const q = S.vq; if (q && q.pos + 1 < q.items.length) vqLoad(q.pos + 1); }
function vqError(code) {
  const q = S.vq, it = q && q.items[q.pos]; if (!it) return;
  const why = ({ 100: 'This video was removed, or it is private on YouTube.', 101: "The owner of this video doesn't allow it to be played outside YouTube.", 150: "The owner of this video doesn't allow it to be played outside YouTube." })[code] || "YouTube couldn't play this video here.";
  const tip = (code === 101 || code === 150) && OWNER ? ' In YouTube Studio, open the video and turn on “Allow embedding”.' : '';
  $('#vqMsg').innerHTML = `<b>${esc(it.v.title)}</b>: ${esc(why)}${esc(tip)}<div class="vqacts"><a class="pill soft" href="${esc(vqUrl(it.v))}" target="_blank" rel="noopener noreferrer">Watch on YouTube</a>${q.pos + 1 < q.items.length ? '<button class="pill main" data-vq-next>Next video</button>' : ''}</div>`;
  $('#vqFrame').innerHTML = ''; $('#vqMsg').hidden = false;
}
function vqMismatch(gotId, gotTitle) {
  const it = S.vq && S.vq.items[S.vq.pos]; if (!it) return;
  $('#vqMsg').innerHTML = `YouTube is showing ${gotTitle ? '“' + esc(gotTitle) + '”' : 'a different video'} instead of “${esc(it.v.title)}”.<div class="vqacts"><a class="pill soft" href="${esc(vqUrl(it.v))}" target="_blank" rel="noopener noreferrer">Open the right one on YouTube</a></div>`;
  $('#vqMsg').hidden = false;
}
window.addEventListener('message', e => {
  if (!S.vq) return;
  let host = ''; try { host = new URL(e.origin).hostname; } catch (x) { return; }
  if (!/(^|\.)youtube(-nocookie)?\.com$/.test(host)) return;
  const f = $('#vqFrame iframe'); if (!f || e.source !== f.contentWindow) return;   // only the player on screen
  let d; try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (x) { return; }
  if (!d) return;
  const it = S.vq.items[S.vq.pos]; if (!it) return;
  if (d.event === 'onError') return vqError(+d.info);
  const st = d.event === 'onStateChange' ? d.info : d.info && d.info.playerState;
  if (st === 0) return vqNext();
  const vd = d.info && d.info.videoData;
  if (vd && vd.video_id && !it.v.list && vd.video_id !== it.v.id) vqMismatch(vd.video_id, vd.title);   // a safety net: say so if YouTube plays something else
});
const __closeModal = closeModal;
closeModal = function () { S.vq = null; __closeModal.apply(this, arguments); };


/* ═════════ Build 60: edit a video's title and link, a bigger and tidier photo slideshow ═════════ */
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  /* the slideshow is a full-screen stage: the photo gets nearly all of the screen */
  .modal.ssmodal { padding: 0; place-items: stretch; background: #000; backdrop-filter: none; }
  .modal.ssmodal .slideshow { width: 100%; height: 100%; max-width: none; border-radius: 0; background: #000; padding: 0; gap: 0; display: grid; grid-template-rows: auto minmax(0,1fr) auto auto; }
  .slideshow .ssbar { padding: max(8px, env(safe-area-inset-top)) 10px 6px 16px; min-height: 48px; }
  .slideshow .ssmain { position: relative; display: block; min-height: 0; overflow: hidden; touch-action: pan-y pinch-zoom; }
  .slideshow .ssmain img { position: absolute; inset: 0; width: 100%; height: 100%; max-width: none; max-height: none; object-fit: contain; border-radius: 0; transition: filter .25s ease; }
  .slideshow .ssmain img.soft { filter: blur(6px); }
  .slideshow .sscap { position: absolute; left: 0; right: 0; bottom: 0; z-index: 2; min-height: 0; padding: 32px 16px 10px; text-align: center; font-size: 13px; font-weight: 700;
                      background: linear-gradient(transparent, rgba(0,0,0,.8)); pointer-events: none; }
  .slideshow .ssstrip { padding: 6px 8px calc(6px + env(safe-area-inset-bottom)); gap: 6px; background: #000; border-top: 1px solid rgba(255,255,255,.1); }
  .slideshow .ssstrip button { width: 64px; height: 64px; border-radius: 8px; }
  .slideshow .sscred { padding: 8px 16px; max-height: 24vh; overflow-y: auto; background: #0b0b0c; border-top: 1px solid var(--line); text-align: left; }
  .slideshow .sscredbtn { min-height: 36px; padding: 0 14px; font-size: 13px; }
  @media (min-width: 0px) { .slideshow .ssstrip button { width: 48px; height: 48px; } .slideshow .ssnav { width: 40px; height: 40px; } }
` }));

/* ── slideshow: compact, and quick to show something ── */
function openSlideshow(start) {
  const r = rel(S.releaseId), items = S.ssItems = slideItems(r), m = photosMeta(r);
  if (!items.length) return;
  S.ssAt = -1;
  $('#modal').classList.add('ssmodal');
  $('#modal').innerHTML = `<div class="slideshow" role="dialog" aria-modal="true" aria-label="Photo slideshow">
    <div class="ssbar"><span class="cs" id="ssCount"></span><span class="acts">
      ${m.credits ? `<button class="pill soft sscredbtn" type="button" data-ss-cred aria-expanded="false" aria-controls="ssCred">Credits</button>` : ''}
      <button class="ib" data-share-out="photo" aria-label="Share this photo">${I.share}</button>${OWNER ? `<button class="ib" data-ss-del aria-label="Remove this photo from the release page" hidden>${I.trash}</button>` : ''}<button class="ib" data-close aria-label="Close slideshow">${I.x}</button></span></div>
    <div class="ssmain"><img id="ssImg" alt="">
      <button class="ssnav prev" data-photo-step="-1" aria-label="Previous photo">${I.back}</button><button class="ssnav next" data-photo-step="1" aria-label="Next photo">${I.back}</button>
      <div class="sscap" id="ssCap" aria-live="polite"></div></div>
    ${m.credits ? `<div class="sscred" id="ssCred" hidden><b>Photo credits</b>${linkifyText(m.credits)}</div>` : ''}
    <div class="ssstrip" id="ssStrip" role="group" aria-label="All photos">${items.map((it, i) => `<button data-slide="${i}" aria-label="Photo ${i + 1} of ${items.length}: ${esc(ssCaption(it))}"><img data-ss-src="${esc(it.id)}" alt=""></button>`).join('')}</div></div>`;
  $('#modal').hidden = false;
  ssObserve();
  const main = $('.ssmain'); let x0 = null, multi = false;   // a two-finger pinch zooms; it never flips the photo
  main.addEventListener('touchstart', e => { multi = e.touches.length > 1; x0 = e.touches[0].clientX; }, { passive: true });
  main.addEventListener('touchmove', e => { if (e.touches.length > 1) multi = true; }, { passive: true });
  main.addEventListener('touchend', e => {
    if (x0 == null || e.touches.length) return;
    const dx = e.changedTouches[0].clientX - x0, was = multi; x0 = null; multi = false;
    if (!was && Math.abs(dx) > 50) showSlide(S.ssAt + (dx < 0 ? 1 : -1));
  }, { passive: true });
  showSlide(start || 0);
  $('#modal').querySelector('[data-close]').focus();
}
function showSlide(i) {
  const items = S.ssItems; if (!items || !items.length || !$('#ssImg')) return;
  i = (i + items.length) % items.length; if (i === S.ssAt) return; S.ssAt = i;
  const it = items[i], img = $('#ssImg');
  $('#ssCount').textContent = `${i + 1} / ${items.length}`;
  $('#ssCap').textContent = ssCaption(it); img.alt = ssCaption(it);
  const del = $('[data-ss-del]'); if (del) del.hidden = it.kind !== 'photo';
  $$('#ssStrip button').forEach((b, k) => { if (k === i) { b.setAttribute('aria-current', 'true'); const s = $('#ssStrip'); s.scrollLeft = b.offsetLeft - s.clientWidth / 2 + b.clientWidth / 2; } else b.removeAttribute('aria-current'); });
  // show what we already have right away (the small picture, enlarged and blurred), then swap in the sharp one
  const th = $(`#ssStrip button:nth-child(${i + 1}) img`), early = S.covers[it.id] || (th && th.getAttribute('src')) || '';
  if (early) img.src = early; else img.removeAttribute('src');
  img.classList.add('soft');
  ssBig(it).then(u => { if (S.ssAt === i) { if (u) img.src = u; img.classList.remove('soft'); } }).catch(() => { if (S.ssAt === i) img.classList.remove('soft'); });
  [i + 1, i - 1].forEach(k => { const n = items[(k + items.length) % items.length]; if (n && n !== it) ssBig(n).catch(() => {}); });
}
function toggleSsCredits(btn) {
  const c = $('#ssCred'); if (!c) return;
  c.hidden = !c.hidden; btn.setAttribute('aria-expanded', String(!c.hidden)); btn.textContent = c.hidden ? 'Credits' : 'Hide credits';
}
const __closeModal2 = closeModal;
closeModal = function () { $('#modal').classList.remove('ssmodal', 'lbmodal'); __closeModal2.apply(this, arguments); };

/* ── edit a video after it's added: title, link and type in one place ── */
function openVideoType(i) {
  const r = rel(S.releaseId), vs = orderedVideos(r, tracksOf(r.release_id)), v = vs[i]; if (!v) return;
  const x = v.xid ? (S.lib.extras || []).find(e => e.extra_id === v.xid) : null, t = v.tid ? trk(v.tid) : null;
  const url = x ? (x.url || '') : ((t && t.video_url) || '');
  $('#modal').innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mTitle"><h2 id="mTitle">Edit video</h2>
    ${x ? `<label>Title<input class="field" id="veTitle" maxlength="200" value="${esc(x.title || v.title)}"></label>`
        : `<label>Title<input class="field" id="veTitleRO" value="${esc(v.title)}" disabled><span class="cs">This video is named after its song. To rename it, rename the song in Edit.</span></label>`}
    <label>YouTube link<input class="field" id="veUrl" type="url" inputmode="url" maxlength="1000" value="${esc(url)}" placeholder="https://youtu.be/…"></label>
    <p class="cs" style="margin:0">What kind of video is this?</p>
    <div class="vtypes" role="radiogroup" aria-label="Video type">${Object.keys(VTYPE).map(k => `<label><input type="radio" name="vtype1" value="${k}"${v.type === k ? ' checked' : ''}>${VTYPE[k]}</label>`).join('')}</div>
    <p class="err" id="vtErr" hidden></p>
    <div class="end"><button class="pill soft" data-close>Cancel</button><button class="pill main" data-vtype-save="${i}">Save</button></div></div>`;
  $('#modal').hidden = false; (x ? $('#veTitle') : $('#veUrl')).focus();
}
async function saveVideoType(i, btn) {
  const r = rel(S.releaseId), vs = orderedVideos(r, tracksOf(r.release_id)), v = vs[i]; if (!v) return;
  const err = $('#vtErr'), fail = m => { err.hidden = false; err.textContent = m; };
  const t = ($('#modal input[name="vtype1"]:checked') || {}).value || 'music';
  const url = ($('#veUrl') || { value: '' }).value.trim(), title = $('#veTitle') ? $('#veTitle').value.trim() : '';
  const cur = v.xid ? (S.lib.extras || []).find(e => e.extra_id === v.xid) : null, tr = v.tid ? trk(v.tid) : null;
  if (!url) return fail('Paste the video link, or use the bin on the video to remove it.');
  if (!(v.xid ? (ytId(url) || ytList(url)) : ytId(url))) return fail(v.xid ? "That doesn't look like a YouTube video or playlist link." : "That doesn't look like a YouTube video link. A song's video needs a single video, not a playlist.");
  btn.disabled = true; err.hidden = true; let edited = false;
  try {
    if (cur && (url !== cur.url || (title && title !== cur.title))) { Object.assign(cur, await run('updateExtra', BOOT.key, v.xid, { title, url })); edited = true; }
    else if (tr && url !== (tr.video_url || '')) { await run('saveTrackDetails', BOOT.key, v.tid, { video_url: url }); tr.video_url = url; edited = true; }
    if (t !== v.type) {
      const types = {}; vs.forEach(x => { types[x.key] = x.key === v.key ? t : x.type; });
      r.videos_meta = await run('saveVideosMeta', BOOT.key, r.release_id, { order: vs.map(x => x.key), types });
    }
    libCacheSet(S.lib); closeModal(); renderRelease(r.release_id);
    toast(edited ? 'Video updated' : t !== v.type ? `Marked as ${VTYPE[t].toLowerCase()}` : 'Nothing changed');
  } catch (e) { btn.disabled = false; fail(e.message || 'Could not save.'); }
}


/* ═════════ Build 61: the playback check says which kind of "couldn't reach Drive" it is, and how fast Drive answered ═════════ */
const diagLimit = () => window.__diagLimit || 15000;
// Did Google answer at all? A no-CORS request is never blocked by CORS, so if it settles, something answered.
function googleAnswers(url) {
  return new Promise(res => {
    const c = new AbortController(), t = setTimeout(() => { c.abort(); res(false); }, Math.min(8000, diagLimit()));
    fetch(url, { mode: 'no-cors', credentials: 'omit', cache: 'no-store', signal: c.signal }).then(() => { clearTimeout(t); c.abort(); res(true); }).catch(() => { clearTimeout(t); res(false); });
  });
}
// Can the audio player itself load it? (This is what playing a song really does.)
function audioLoads(url) {
  return new Promise(res => {
    const a = new Audio(), t0 = performance.now(); a.preload = 'metadata'; a.muted = true;
    const finish = ok => { clearTimeout(t); const code = a.error ? a.error.code : 0; a.onloadedmetadata = a.onerror = null; a.removeAttribute('src'); res({ ok, ms: Math.round(performance.now() - t0), code }); };
    a.onloadedmetadata = () => finish(true); a.onerror = () => finish(false);
    const t = setTimeout(() => finish(false), Math.min(12000, diagLimit() + 2000)); a.src = url;
  });
}
async function diagnoseStream(url) {
  if (!/googleapis\.com\/drive/.test(String(url))) return { kind: 'no-api' };
  // A plain GET (no extra headers, so no CORS pre-check); cancelled as soon as Drive answers so a big file never downloads.
  const ctl = new AbortController(); let timedOut = false; const t0 = performance.now();
  const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, diagLimit());
  let res;
  try { res = await fetch(url, { credentials: 'omit', cache: 'no-store', signal: ctl.signal }); }
  catch (e) {
    clearTimeout(timer);
    if (navigator.onLine === false) return { kind: 'offline' };
    if (timedOut) return { kind: 'slow', ms: diagLimit() };
    if (!(await googleAnswers(url))) return { kind: 'blocked' };       // nothing answered at all
    const p = await audioLoads(url);                                   // something answered; can the player use it?
    return p.ok ? { kind: 'cors-only', ms: p.ms } : { kind: 'network', code: p.code };
  }
  clearTimeout(timer); const ms = Math.round(performance.now() - t0);
  if (res.ok) { ctl.abort(); return { kind: 'format', status: res.status, ms }; }
  let body = ''; try { body = (await res.text()).toLowerCase(); } catch (e) {}
  const has = re => re.test(body), out = k => ({ kind: k, status: res.status, ms });
  if (has(/referer|referrer|http_referrer/)) return out('referrer');
  if (has(/api_key_service_blocked|are blocked|not authorized to use this api/)) return out('key-api-restricted');
  if (has(/accessnotconfigured|service_disabled|has not been used in project|is disabled/)) return out('api-off');
  if (has(/api key not valid|keyinvalid|api_key_invalid/)) return out('bad-key');
  if (has(/downloadquotaexceeded|ratelimitexceeded|userratelimit|quota/)) return out('quota');
  if (res.status === 403 || res.status === 404) return out('private');
  return out('other');
}
const __problemText = problemText;
problemText = function (d, v) {
  if (!OWNER) {
    if (d.kind === 'blocked') return 'This song could not be loaded. Check your connection (turn off a VPN if you use one) and try again.';
    if (d.kind === 'slow') return 'Your connection is slow right now. Give it a moment and try again.';
    if (d.kind === 'cors-only') return 'That was just a hiccup. Tap play again.';
    if (d.kind === 'network') return 'This song could not be loaded. Try again in a minute.';
    return __problemText(d, v);
  }
  const secs = Math.max(1, Math.round((d.ms || 15000) / 1000));
  switch (d.kind) {
    case 'offline': return "Couldn't reach Drive: your phone says it's offline. Check your internet and try again.";
    case 'blocked': return "Couldn't reach Drive: this phone can't reach Google at all right now, so the request never got an answer. Try Wi-Fi instead of cellular (or the other way round), turn off any VPN, iCloud Private Relay or content blocker, and open the app in Safari or Chrome rather than from inside Instagram, Gmail or Messages.";
    case 'slow': return `Drive didn't answer within ${secs} second${secs === 1 ? '' : 's'}, which is why songs sit on “Loading…”. That's usually a weak or crowded connection.`;
    case 'cors-only': return `Good news: this phone can play from Drive (the audio loaded in ${d.ms} ms). The browser only blocked the extra test, so that isn't the problem. If a song still fails, send me the exact message.`;
    case 'network': return `Couldn't reach Drive: Google answered, but this song's audio wouldn't load (player error ${d.code || 'unknown'}). Try again.`;
    default: return __problemText(d, v);
  }
};
// My Vault › Check playback setup: tests your key with a real file, in this browser, and times how fast Drive answers.


/* ═════════ Build 62: when a song won't play, find out why from Google's side ═════════ */
async function whyNot(fid) {   // what Google sent the server for this exact file (owner only)
  if (!OWNER || !fid) return '';
  try { const p = await run('probeAudio', BOOT.key, fid); return p && p.summary ? p : ''; } catch (e) { return ''; }
}
async function showAudioProblem(url, v) {
  if (OWNER) msg('That song did not play. Checking why…');
  const d = await diagnoseStream(url || audio.src);
  if (S.now && v && S.now.v !== v) return;   // they've moved on to another song
  if (d.kind === 'cors-only' && S.hiccup !== v) {   // Drive answers fine now, so it was a hiccup: try the song again, once
    S.hiccup = v; setTimeout(() => { if (S.hiccup === v) S.hiccup = null; }, 20000);
    try { audio.load(); await audio.play(); msg(''); return; } catch (e) {}
  }
  const fid = (/\/files\/([^?\/]+)/.exec(String(url || audio.src)) || [])[1] || songFile(v);
  let probe = '';
  if (OWNER && v && ['network', 'format', 'other', 'private', 'cors-only'].includes(d.kind)) {
    S.lastFail = { fid, vid: v.version_id };
    probe = await whyNot(fid);
    if (S.now && v && S.now.v !== v) return;
  }
  const t = v && trk(v.track_id), name = t ? `“${t.title}”: ` : '';
  msg((OWNER ? name : '') + problemText(d, v) + (probe ? ' From Google\'s side: ' + probe.summary : ''));
  logErr(`Playback failed (${d.kind}${d.status ? ' ' + d.status : ''}${d.ms ? ', ' + d.ms + ' ms' : ''}${d.code ? ', player error ' + d.code : ''}${probe ? ', google: ' + probe.kind : ''}, audio error ${audio.error ? audio.error.code : 0}) for ${v ? v.version_id : '?'}`);
}
// My Vault › Check playback setup: tests your key with a real file, in this browser, and times how fast Drive answers.
// If a song has just failed, it tests that song.
async function checkPlayback(btn) {
  const cs = btn.querySelector('.cs'), say = t => { if (cs) cs.textContent = t; };
  const failed = S.lastFail && S.lib.versions.find(x => x.version_id === S.lastFail.vid);
  const v = failed || S.lib.versions.find(x => x.audio) || S.lib.versions.find(x => x.preview);
  if (!v) return toast('Upload a song first');
  btn.disabled = true; say('Checking…');
  try {
    const fid = failed ? S.lastFail.fid : songFile(v);
    const src = await run('prepareAudio', fid, BOOT.key, BOOT.token, true);
    if (!src.viaApi) { toast(problemText({ kind: 'no-api' }, v)); say('needs a key'); return; }
    const d = await diagnoseStream(src.stream);
    if (d.kind === 'cors-only') { toast(problemText(d, v)); say('works'); if (failed) S.lastFail = null; return; }
    const extra = async () => { const p = await whyNot(fid); return p ? ' From Google\'s side: ' + p.summary : ''; };
    const nm = failed ? `“${trk(v.track_id).title}”: ` : '';
    if (d.kind !== 'format') { alert(nm + problemText(d, v) + (['network', 'other', 'private'].includes(d.kind) ? await extra() : '')); say('problem found'); return; }
    const ok = await new Promise(res => {
      const a = new Audio(); a.preload = 'metadata'; a.muted = true;
      const t = setTimeout(() => res(false), 10000);
      a.onloadedmetadata = () => { clearTimeout(t); res(true); }; a.onerror = () => { clearTimeout(t); res(false); };
      a.src = src.stream;
    });
    if (ok) {
      const slow = d.ms > 1500; if (failed) S.lastFail = null;
      toast(`${nm}Playback setup looks good: Drive answered in ${d.ms} ms${slow ? ', which is slow. Your connection may be the limit.' : '.'}`);
      say(`all good (${d.ms} ms)`);
    } else { alert(nm + problemText({ kind: 'format' }, Object.assign({}, v, { format: failed ? ((v.preview === fid) ? 'MP3' : v.format) : (v.preview ? 'MP3' : v.format) })) + await extra()); say('problem found'); }
  } catch (e) { toast(e.message || 'The check could not run'); say('could not check'); }
  finally { btn.disabled = false; }
}


/* ═════════ Build 63: music that keeps playing ═════════
   A song is played from the WAV you uploaded. If that fails, the app climbs a ladder before giving up on it:
   retry → download the whole song into memory and play it from there → convert it to MP3 on the phone.
   If a song still can't be played the album moves on to the next one instead of stopping. The next song is
   fetched into memory ahead of time, and a stalled or dropped song is recovered from where it stopped. */
const songFile = v => (v && (v.audio || v.preview)) || '';   // an old MP3 copy is only ever a spare
const mimeOf = v => (v && v.url && !(S.badFile && S.badFile[songFile(v)])) ? 'audio/mp4' : (FORMAT_MIME[String((v && v.format) || 'WAV').toUpperCase()] || 'audio/wav');
S.failStreak = 0; S.skipped = []; S.mem = {}; S.memUrl = ''; S.pre = null; S.rescuing = false; S.rescues = {};
async function fetchBlob(url, mime, onProgress) {
  const res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const total = +res.headers.get('content-length') || 0;
  if (!res.body || !res.body.getReader) return new Blob([await res.arrayBuffer()], { type: mime });
  const rd = res.body.getReader(), parts = []; let got = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; if (onProgress && total) onProgress(got / total); }
  const blob = new Blob(parts, { type: mime });
  if (blob.size < 2000) throw new Error('empty');
  return blob;
}
function releaseMem() { if (S.memUrl) { try { URL.revokeObjectURL(S.memUrl); } catch (e) {} S.memUrl = ''; } }
async function memoryBlob(v, fid) {   // the whole song, in memory
  if (S.mem[fid]) return S.mem[fid];
  const name = (trk(v.track_id) || {}).title || 'this song';
  const src = await sourceFor(fid, true);
  const blob = await fetchBlob(src.stream, mimeOf(v), p => { if (S.now && S.now.v === v) msg(`Loading “${name}” to your phone… ${Math.round(p * 100)}%`); });
  const keys = Object.keys(S.mem); if (keys.length >= 2) delete S.mem[keys[0]];
  return (S.mem[fid] = blob);
}
async function playBlob(blob, resumeAt) {
  releaseMem(); const url = URL.createObjectURL(blob); S.memUrl = url; audio.src = url;
  if (resumeAt > 1) await new Promise(res => { const done = () => { audio.removeEventListener('loadedmetadata', done); try { audio.currentTime = resumeAt; } catch (e) {} res(); }; audio.addEventListener('loadedmetadata', done); setTimeout(done, 5000); });
  await audio.play();
}
// The ladder's last rungs. Returns true once the song is playing (or the user moved on).
async function rescue(v, fid, resumeAt) {
  S.rescuing = true;
  try {
    const name = (trk(v.track_id) || {}).title || 'this song';
    try { const blob = await memoryBlob(v, fid); if (!S.now || S.now.v !== v) return true; await playBlob(blob, resumeAt); S.failStreak = 0; msg(''); return true; }
    catch (e) { if (e && e.name === 'NotAllowedError') { msg('Tap play to start.'); setToggle(false); return true; } }
    if (!S.now || S.now.v !== v) return true;
    try {
      const blob = S.mem[fid] || await memoryBlob(v, fid);
      const mp3 = await toMp3(await blob.arrayBuffer(), p => { if (S.now && S.now.v === v) msg(`Making “${name}” playable on your phone… ${Math.round(p * 100)}%`); });
      if (!S.now || S.now.v !== v) return true;
      await playBlob(mp3.blob, resumeAt); S.failStreak = 0; msg(''); return true;
    } catch (e) { if (e && e.name === 'NotAllowedError') { msg('Tap play to start.'); setToggle(false); return true; } }
    return false;
  } finally { S.rescuing = false; }
}
// Why did it fail? (Owner: the reason, from this phone and from Google's side. Fans get nothing technical.) Always logged.
async function explainFailure(url, v, reason) {
  const d = url ? await diagnoseStream(url) : { kind: 'other' };
  const fid = (/\/files\/([^?\/]+)/.exec(String(url || '')) || [])[1] || songFile(v);
  let probe = '';
  if (OWNER && v && ['network', 'format', 'other', 'private'].includes(d.kind)) { S.lastFail = { fid, vid: v.version_id }; probe = await whyNot(fid); }
  logErr(`Song skipped (${d.kind}${d.status ? ' ' + d.status : ''}${d.ms ? ', ' + d.ms + ' ms' : ''}${d.code ? ', player error ' + d.code : ''}${probe ? ', google: ' + probe.kind : ''}${reason ? ', ' + String(reason).slice(0, 80) : ''}) for ${v ? v.version_id : '?'}`);
  if (!OWNER) return '';
  return (reason && !url ? reason : problemText(d, v)) + (probe ? " From Google's side: " + probe.summary : '');
}
// The song's audio file is gone from Drive (the server answers "No item with the given ID could be found"). That is not a connection problem:
// say so plainly, remember it for this visit, and go on to the next song that can play (the queue never stops on a missing file).
const isMissingFile = e => /No item with the given ID/i.test(String((e && e.message) || e || ''));
function songMissing(v) {
  if (!S.now || S.now.v !== v) return;
  S.gone = S.gone || {}; S.gone[v.version_id] = 1;
  const name = (trk(v.track_id) || {}).title || 'This song';
  logErr('Song file missing in Drive: ' + (trk(v.track_id) || {}).title + ' (' + v.version_id + ')');
  let next = -1; for (let i = S.qi + 1; i < S.queue.length; i++) if (!S.gone[S.queue[i]]) { next = i; break; }
  if (next > -1) { toast(`“${name}” isn't available right now. Moving on.`); msg(''); S.qi = next; play(S.queue[next]); return; }
  setToggle(false);
  msg(`“${name}” isn't available right now.`);
}
// A song that can't be played never stops the album: say so briefly and go to the next one.
function songFailed(v, url, reason) {
  if (!S.now || S.now.v !== v) return;
  S.failStreak++; S.skipped.push(v.version_id);
  const name = (trk(v.track_id) || {}).title || 'this song';
  explainFailure(url, v, reason).then(text => { if (OWNER && text) toast(`“${name}”: ${text}`); }).catch(() => {});
  if (S.qi < S.queue.length - 1 && S.failStreak < 3) { toast(`Couldn't play “${name}”. Moving on.`); msg(''); step(1); return; }
  setToggle(false);
  msg(S.failStreak >= 3 ? "Several songs in a row wouldn't load. Check your connection, then tap play to try again." : `“${name}” could not be played.`);
}
async function rescueFromError(v, at) {   // it was playing and died, or it stalled: carry on from where it stopped
  if (S.rescuing || !S.now || S.now.v !== v) return;
  S.rescues[v.version_id] = (S.rescues[v.version_id] || 0) + 1;
  if (S.rescues[v.version_id] > 2) return songFailed(v, audio.src);
  msg('Reconnecting…');
  if (!(await rescue(v, songFile(v), at))) songFailed(v, audio.src);
}
function onAudioError() {
  if (!audio.src || audio.src === SILENT || S.directTry || !S.now || S.rescuing || S.ytSong) return;
  rescueFromError(S.now.v, audio.currentTime || 0);
}
let stallTimer = null; const stallMs = () => window.__stallMs || 12000;
function clearWatchdog() { clearTimeout(stallTimer); stallTimer = null; }
audio.addEventListener('waiting', () => {
  if (audio.paused || !S.now || S.ytSong || S.rescuing || audio.src === SILENT) return;
  clearWatchdog(); const v = S.now.v;
  stallTimer = setTimeout(() => { if (S.now && S.now.v === v && !audio.paused && audio.readyState < 3 && !S.rescuing) rescueFromError(v, audio.currentTime || 0); }, stallMs());
});
['playing', 'pause', 'ended', 'emptied'].forEach(ev => audio.addEventListener(ev, clearWatchdog));
// The next song is fetched into memory shortly before this one ends, so the hand-over doesn't depend on the network.
const prefetchLead = () => window.__prefetchLead || 60;
async function startPrefetch(nv) {
  if (S.pre && S.pre.url) { try { URL.revokeObjectURL(S.pre.url); } catch (e) {} }
  const mine = S.pre = { vid: nv.version_id, url: '' };
  try {
    const src = await sourceFor(songFile(nv), true), blob = await fetchBlob(src.stream, mimeOf(nv));
    if (S.pre !== mine) return; mine.url = URL.createObjectURL(blob);
  } catch (e) { if (S.pre === mine) S.pre = null; }
}
function takePrefetched(vid) { const p = S.pre; if (p && p.vid === vid && p.url) { S.pre = null; return p; } return null; }
function prefetchCheck() {
  if (!S.now || !S.queue || S.ytSong || S.rescuing || audio.src === SILENT) return;
  if (navigator.connection && navigator.connection.saveData) return;
  const d = audio.duration; if (!isFinite(d) || d <= 0) return;
  if (d - (audio.currentTime || 0) > prefetchLead()) return;
  const nv = ver(S.queue[S.qi + 1]); if (!nv || isYtSong(nv) || !songFile(nv)) return;
  if (S.pre && S.pre.vid === nv.version_id) return;
  startPrefetch(nv);
}
audio.addEventListener('timeupdate', prefetchCheck);
function preloadNext() { prefetchCheck(); }

