/* ═════════ Playback diagnosis: find out why Drive audio won't play, and say so plainly ═════════ */
const FORMAT_MIME = { WAV: 'audio/wav', AIF: 'audio/aiff', AIFF: 'audio/aiff', FLAC: 'audio/flac', M4A: 'audio/mp4', MP3: 'audio/mpeg', OGG: 'audio/ogg' };
// Asks Drive for the first bytes itself, so we can read Drive's actual error reason.
function problemText(d, v) {
  const fmt = String((v && v.format) || '').toUpperCase(), mime = FORMAT_MIME[fmt];
  const cantFormat = mime && !audio.canPlayType(mime);
  if (!OWNER) {
    if (d.kind === 'format' && cantFormat) return `This song is a ${fmt} file, which this browser can't play. Try Safari, or check back soon.`;
    if (d.kind === 'offline' || d.kind === 'network') return 'Your connection dropped. Check your internet and try again.';
    return 'This song could not be loaded. Try again in a minute.';
  }
  switch (d.kind) {
    case 'referrer': return 'Your Drive API key has a website restriction that blocks this app (it runs on a googleusercontent.com address, not script.google.com). In Google Cloud › APIs & Services › Credentials, open the key and set Application restrictions to None. Keep API restrictions on Google Drive API.';
    case 'key-api-restricted': return "Your API key isn't allowed to use the Google Drive API. In Google Cloud › Credentials, open the key and add Google Drive API under API restrictions.";
    case 'api-off': return 'The Google Drive API is turned off for the project your key belongs to. In Google Cloud › APIs & Services › Library, open Google Drive API and click Enable.';
    case 'bad-key': return "The drive_api_key in your Settings tab isn't a valid key. Copy it again from Google Cloud › Credentials (no spaces).";
    case 'quota': return 'Google is temporarily limiting downloads of this file because it was played a lot in a short time. It usually clears within a day.';
    case 'private': return "Drive wouldn't share this file for playback even after the app re-opened it. Check that the file still exists and that you own it.";
    case 'format': return cantFormat
      ? `Drive sent the file, but this browser can't play ${fmt} files. The app tries to convert it to an MP3 automatically.`
      : `Drive sent the file, but the browser couldn't decode this one${fmt ? ' (' + fmt + ')' : ''}. It may use an unusual bit depth or be damaged.`;
    case 'offline': case 'network': return "Couldn't reach Drive. Check your internet and try again.";
    case 'no-api': return 'Drive sent back a web page instead of audio. Add a Drive API key in Settings (drive_api_key) to stream reliably.';
    default: return `Drive answered with an error (${d.status || 'unknown'}). Try again in a minute.`;
  }
}
// My Vault › Check playback setup: tests your key with a real file, in this browser.


/* ═════════ Steady scrolling + desktop arrows for sideways rows ═════════ */
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  /* The page only ever moves up and down: no sideways drift, no rubber-band bounce. */
  /* Root only: the browser applies it to the whole window, so pinned (sticky) bars keep working.
     The body uses clip, which trims sideways overflow without becoming a scroll container. */
  html { overflow-x: hidden; overscroll-behavior: none; }
  body { overflow-x: clip; max-width: 100%; touch-action: pan-y pinch-zoom; }
  #main, .wrap { overflow-x: clip; }
  /* Carousels still swipe sideways inside themselves without dragging the page along. */
  .xkind { display: inline-block; margin-left: 8px; padding: 1px 8px; border-radius: 999px; font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; vertical-align: middle; border: 1px solid currentColor; color: var(--dim); white-space: nowrap; }
  .xkind[data-k="draft"] { color: #e0b84a; } .xkind[data-k="audio-note"] { color: var(--green-hi); } .xkind[data-k="remix"] { color: var(--red-hi); } .xkind[data-k="cover"] { color: #8fb4ff; } .xkind[data-k="b-side"] { color: #d9d9e3; }
  .xfilter { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 12px; }
  .xfilter button { padding: 6px 12px; border-radius: 999px; border: 1px solid var(--line); font-size: 13px; font-weight: 700; color: var(--dim); }
  .xfilter button[aria-pressed="true"] { color: #0A0A0B; background: var(--text); border-color: var(--text); } .xfilter .n { opacity: .7; font-weight: 600; }
  .hrow, .ctrack, .sparts, .eranav, .seg, .songtabs { overscroll-behavior-x: contain; touch-action: pan-x pan-y; }
` }));
// (The ‹ › buttons on sideways rows now come from js/18-scroll-arrows.js, for every row and every device; this stays so older callers still work.)
function wireRows() {}


/* ═════════ Build 43: video order + types + playlist, compact Edit panels ═════════ */
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  .vtype { display: inline-block; margin-top: 4px; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 800;
            letter-spacing: .04em; background: rgba(255,255,255,.08); color: #DDD7D3; }
  .vtype.film { background: rgba(232,176,74,.16); color: #F2C879; }
  .vcard .vtype { align-self: flex-start; justify-self: start; width: max-content; }
  .vlist [aria-current="true"] .vtype { background: rgba(0,0,0,.4); color: #fff; }
  .vlist [aria-current="true"] .vtype.film { color: #FFE0A3; }
  .vplayall { margin-left: auto; }
  .vlist { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 6px; max-height: 32vh; overflow-y: auto; }
  .vlist button { width: 100%; display: grid; grid-template-columns: 26px 72px minmax(0,1fr); gap: 10px; align-items: center; text-align: left;
                  padding: 6px; border-radius: 12px; background: rgba(255,255,255,.04); }
  .vlist button[aria-current="true"] { background: rgba(8,122,59,.28); outline: 1px solid var(--green-hi); }
  .vlist .n { color: var(--dim); font-variant-numeric: tabular-nums; text-align: center; }
  .vlist img { width: 72px; aspect-ratio: 16/9; object-fit: cover; border-radius: 8px; }
  .vlist .t { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .epanels { display: grid; gap: 6px; margin: 12px 0 16px; }
  .epanel { border: 1px solid var(--line); border-radius: 16px; background: rgba(255,255,255,.025); }
  .epanel > summary { list-style: none; cursor: pointer; display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 2px 12px; align-items: center;
                      padding: 9px 14px; min-height: 48px; border-radius: 14px; }
  .epanel > summary::-webkit-details-marker { display: none; }
  .epanel > summary::after { content: ''; width: 10px; height: 10px; border-right: 2px solid var(--dim); border-bottom: 2px solid var(--dim);
                             transform: rotate(45deg); grid-row: 1 / span 2; grid-column: 2; margin-right: 4px; transition: transform .2s; }
  .epanel[open] > summary::after { transform: rotate(-135deg); }
  .epanel > summary:focus-visible { outline: 2px solid var(--green-hi); outline-offset: 2px; }
  .epanel .pt { font-weight: 800; font-size: 15px; }
  .epanel .ps { font-size: 13px; color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .epanel .pbody { display: grid; gap: 12px; padding: 4px 16px 16px; }
  .epanel .pbody > label { display: grid; gap: 6px; font-size: 13px; font-weight: 600; color: var(--dim); }
  .epanel .pbody .field { background: var(--raise); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; color: var(--text); font: inherit; font-weight: 400; font-size: 15px; }
  .epanel .chaped { margin: 0; border: 0; padding: 0; background: none; }
  .epanel .chaped h3 { display: none; }
  .vedrow { display: grid; grid-template-columns: 72px minmax(0,1fr) auto; gap: 10px; align-items: center; padding: 8px 4px; border-top: 1px solid var(--line); list-style: none; }
  .vedrow img { width: 72px; aspect-ratio: 16/9; object-fit: cover; border-radius: 8px; }
  .vedrow .vt { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .vedrow select { margin-top: 4px; padding: 6px 8px; min-height: 36px; }
  .vedlist { margin: 0; padding: 0; }
  .songshead { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-top: 6px; }
  .sopts { grid-column: 1 / -1; }
  .sopts > summary { list-style: none; cursor: pointer; display: inline-flex; gap: 8px; align-items: center; min-height: 36px; padding: 4px 12px;
                     border-radius: 999px; background: rgba(255,255,255,.06); font-size: 13px; font-weight: 700; color: var(--dim); }
  .sopts > summary::-webkit-details-marker { display: none; }
  .sopts > summary:focus-visible { outline: 2px solid var(--green-hi); outline-offset: 2px; }
  .sopts[open] > summary { color: var(--text); }
  .sopts .tag { font-size: 11px; font-weight: 800; padding: 2px 7px; border-radius: 999px; background: rgba(8,122,59,.3); color: #BDF3D5; }
  .sopts .tag.warn { background: rgba(210,16,52,.28); color: #FFC9D2; }
  .sopts .eopts { margin-top: 10px; }
` }));

/* ── videos: stored order + type, played as a playlist ── */
const vKey = v => (v.kind === 'track' ? 't:' + v.tid : 'x:' + v.xid);
function videosMeta(r) { try { const m = JSON.parse((r && r.videos_meta) || '{}'); return { order: m.order || [], types: m.types || {} }; } catch (e) { return { order: [], types: {} }; } }
function orderedVideos(r, ts) {
  const m = videosMeta(r), vs = eraVideos(r, ts).map(v => Object.assign(v, { key: vKey(v) }));
  vs.forEach(v => { v.type = VTYPE[m.types[v.key]] ? m.types[v.key] : 'music'; });
  const pos = k => { const i = m.order.indexOf(k); return i < 0 ? 1e6 : i; };
  return vs.map((v, i) => [v, i]).sort((a, b) => (pos(a[0].key) - pos(b[0].key)) || (a[1] - b[1])).map(x => x[0]);
}
const VTYPE = { music: 'Music video', film: 'Short film' };
function videosHeading(vs) {
  const kinds = [...new Set(vs.map(v => v.type))];
  if (kinds.length > 1) return '<b>Videos</b>';
  return { music: '<b>Music</b> videos', film: '<b>Short</b> films', live: '<b>Live</b> performances', trailer: '<b>Trailers</b>', bts: '<b>Behind</b> the scenes' }[kinds[0]];
}

/* ── Edit: compact panels ── */
function panel(id, title, sub, body, open) {
  return `<details class="epanel" data-panel="${id}"${open ? ' open' : ''}><summary><span class="pt">${title}</span><span class="ps">${esc(sub)}</span></summary><div class="pbody">${body}</div></details>`;
}
function videoEditor(r) {
  if (!S.vdraft) S.vdraft = orderedVideos(r, tracksOf(r.release_id, true)).map(v => ({ key: v.key, id: v.id, title: v.title, type: v.type }));
  return `<ol class="vedlist" id="vEditList">${S.vdraft.map((v, i) => `<li class="vedrow sortrow">
    ${vThumb(v)}
    <div style="min-width:0"><div class="vt">${i + 1}. ${esc(v.title)}</div>
      <select class="field" data-vtype="${i}" aria-label="Type of ${esc(v.title)}">
        ${Object.keys(VTYPE).map(k => `<option value="${k}"${v.type === k ? ' selected' : ''}>${VTYPE[k]}</option>`).join('')}</select></div>
    <button class="grip" type="button" data-grip="${i}" aria-label="Reorder video ${esc(v.title)}, position ${i + 1} of ${S.vdraft.length}. Drag, or use the up and down arrow keys." title="Drag to reorder">${I.grip}</button>
  </li>`).join('')}</ol>`;
}
function vMoveTo(from, to, byKey) {
  if (from !== to) { const [x] = S.vdraft.splice(from, 1); S.vdraft.splice(to, 0, x); }
  $('#vEditList').outerHTML = videoEditor(rel(S.releaseId));
  makeSortable($('#vEditList'), vMoveTo);
  if (byKey) { const g = $(`#vEditList [data-grip="${to}"]`); if (g) g.focus(); }
}
function videosMetaDraft() {
  if (!S.vdraft) return null;
  const types = {}; S.vdraft.forEach(v => { types[v.key] = v.type; });
  return JSON.stringify({ order: S.vdraft.map(v => v.key), types });
}
function songOptsTags(d) {
  const t = [];
  if (d.category !== 'Main') t.push(d.extraKind || (d.category === 'B-Side' ? 'B-Side' : 'Draft'));
  if (d.single) t.push('Single');
  if (d.hidden) t.push('<span class="tag warn">Hidden</span>');
  if (d.artist && d.artist.toLowerCase() !== relArtist(rel(S.releaseId)).toLowerCase()) t.push(esc(d.artist));
  return t.map(x => x.startsWith('<span') ? x : `<span class="tag">${x}</span>`).join('');
}


/* ═════════ Build 44: background fit, video types (incl. live), readable pickers, HEIC ═════════ */
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  /* dropdowns: dark background, light text (Windows/Chrome drew them white with light text) */
  select, .field, input[type=date], input[type=month], input[type=datetime-local] { color-scheme: dark; }
  select option, select optgroup { background: #1B1B1E; color: #F6F3EF; }
  select.field { background-color: var(--raise, #1B1B1E); color: var(--text, #F6F3EF); }
  #pagebg { background-color: #070707; }
  #pagebg::after { background: linear-gradient(180deg, rgba(8,8,9,calc(var(--bgd,.72) * .42)) 0%, rgba(8,8,9,calc(var(--bgd,.72) * .7)) 35%, rgba(8,8,9,var(--bgd,.72)) 100%) !important; }
  .bgctl { display: grid; gap: 10px; padding: 12px; border-radius: 12px; background: rgba(255,255,255,.03); border: 1px solid var(--line); }
  .bgctl .row { display: grid; grid-template-columns: 110px minmax(0,1fr) 44px; gap: 10px; align-items: center; font-size: 13px; font-weight: 600; color: var(--dim); }
  .bgctl input[type=range] { width: 100%; accent-color: var(--brass); min-height: 32px; }
  .bgctl .val { font-variant-numeric: tabular-nums; text-align: right; }
  .vtype.live { background: rgba(74,163,240,.18); color: #BFE0FF; }
  .vcard { position: relative; }
  .vcard .vedit { position: absolute; top: 8px; left: 8px; z-index: 3; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center;
                  background: rgba(12,12,13,.85); color: #fff; border: 1px solid var(--line); }
  .vcard .vedit svg { width: 16px; height: 16px; }
  .vtypes { display: grid; gap: 8px; margin: 12px 0; }
  .vtypes label { display: flex; gap: 10px; align-items: center; padding: 12px; border-radius: 12px; border: 1px solid var(--line); font-weight: 700; cursor: pointer; }
  .vtypes input { width: 18px; height: 18px; accent-color: var(--brass); }
  .vtypes label:has(input:checked) { border-color: var(--green-hi); background: rgba(8,122,59,.18); }
` }));

/* ── background: fit, position, darkness ── */
function bgStyleOf(r) {
  try { const m = JSON.parse((r && r.bg_style) || '{}'); return { fit: m.fit === 'contain' ? 'contain' : 'cover', x: m.x == null ? 50 : +m.x, y: m.y == null ? 50 : +m.y, dim: m.dim == null ? 72 : +m.dim }; }
  catch (e) { return { fit: 'cover', x: 50, y: 50, dim: 72 }; }
}
function paintBgStyle(st) {
  const el = $('#pagebg'); if (!el) return;
  el.style.backgroundSize = st.fit === 'contain' ? 'contain' : 'cover';
  el.style.backgroundPosition = `${st.x}% ${st.y}%`;
  el.style.setProperty('--bgd', String(st.dim / 100));
}
function bgControls(r) {
  if (!r.bg_file_id) return '';
  const st = S.bgDraft = bgStyleOf(r);
  const range = (k, label, min, max, unit) => `<div class="row"><label for="bg-${k}">${label}</label>
    <input type="range" id="bg-${k}" data-bgctl="${k}" min="${min}" max="${max}" value="${st[k]}"><span class="val" id="bgv-${k}">${st[k]}${unit}</span></div>`;
  return `<div class="bgctl"><div class="row"><label for="bg-fit">Fit</label>
      <select class="field" id="bg-fit" data-bgctl="fit"><option value="cover"${st.fit === 'cover' ? ' selected' : ''}>Fill the page (crops edges)</option>
        <option value="contain"${st.fit === 'contain' ? ' selected' : ''}>Show the whole picture</option></select><span></span></div>
    ${range('x', 'Left ↔ right', 0, 100, '%')}${range('y', 'Top ↕ bottom', 0, 100, '%')}${range('dim', 'Darkness', 0, 100, '%')}
    <p class="cs" style="margin:0">Changes preview live behind this page. Darker keeps text easier to read.</p></div>`;
}
function bgCtlInput(el) {
  const k = el.dataset.bgctl; if (!S.bgDraft) return;
  S.bgDraft[k] = k === 'fit' ? el.value : +el.value;
  const v = $('#bgv-' + k); if (v) v.textContent = el.value + '%';
  paintBgStyle(S.bgDraft);
}

/* ── video type editing from the card ── */
VTYPE.live = 'Live performance';

/* ── HEIC photos ── */
const isHeic = f => /image\/hei[cf]/i.test(f.type || '') || /\.(heic|heif)$/i.test(f.name || '');


/* ═════════ Build 45: photo sections + groups + credits, artist links, lyrics from a link, chapter details ═════════ */
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  .phgroup { margin: 18px 0 6px; }
  .phgroup h3 { margin: 0 0 10px; font-size: 13px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--dim); }
  .phcredits { margin-top: 16px; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--line); font-size: 13px; color: var(--dim); white-space: pre-line; }
  .phcredits b { display: block; color: var(--text); margin-bottom: 4px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
  .pcell.coverart .pthumb { outline: 2px solid rgba(201,162,39,.6); outline-offset: -2px; }
  .pedrow { display: grid; grid-template-columns: 64px minmax(0,1fr) auto; gap: 10px; align-items: center; padding: 8px 4px; border-top: 1px solid var(--line); list-style: none; }
  .pedrow img { width: 64px; height: 64px; object-fit: cover; border-radius: 8px; background: rgba(255,255,255,.06); }
  .pedrow .pf { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1.2fr); gap: 8px; }
  .pedrow .field { padding: 8px 10px; min-height: 40px; font-size: 14px; }
  .pedlist { margin: 0; padding: 0; }
  .alrow { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1.6fr) auto; gap: 8px; align-items: center; }
  .alrow .field { padding: 8px 10px; min-height: 40px; }
  a.alink { color: inherit; text-decoration: underline; text-decoration-color: rgba(52,194,122,.7); text-underline-offset: 3px; }
  a.alink:hover { color: var(--green-hi); }
  .lyfetch { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px; }
  .lyfetch .field { min-height: 40px; }
  .lylink { justify-self: start; min-height: 36px; font-size: 13px; }
  .chapdesc { margin: 2px 4px 8px; font-size: 14px; line-height: 1.55; color: rgba(246,243,239,.85); white-space: pre-line; }
  .chaptrail { margin: 0 4px 8px; min-height: 40px; }
  .chaprow { grid-template-columns: minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr) auto auto; }
  .chapmore { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0,2fr) minmax(0,1fr); gap: 8px; }
  .chapmore textarea { min-height: 64px; resize: vertical; }
  .chapsep { border: 0; border-top: 1px solid var(--line); margin: 4px 0; }
  @media (min-width: 0px) {
    .pedrow .pf, .chapmore { grid-template-columns: 1fr; }
    .alrow { grid-template-columns: 1fr auto; } .alrow .url { grid-column: 1 / 2; }
  }
` }));

/* ── photos: album covers + photoshoot groups + credits ── */
function photosMeta(r) {
  try { const m = JSON.parse((r && r.photos_meta) || '{}'); return { order: m.order || [], cat: m.cat || {}, group: m.group || {}, credits: m.credits || '' }; }
  catch (e) { return { order: [], cat: {}, group: {}, credits: '' }; }
}
function orderedPhotos(r) {
  const m = photosMeta(r), ps = extrasOf(r.release_id, 'photo').map((p, i) => ({ p, i }));
  const pos = id => { const k = m.order.indexOf(id); return k < 0 ? 1e6 : k; };
  return ps.sort((a, b) => (pos(a.p.extra_id) - pos(b.p.extra_id)) || (a.i - b.i))
    .map(x => Object.assign({}, x.p, { cat: ['cover', 'bts', 'social'].includes(m.cat[x.p.extra_id]) ? m.cat[x.p.extra_id] : 'shoot', group: m.group[x.p.extra_id] || '' }));
}
function photoEditor(r) {
  if (!S.pdraft) { const m = photosMeta(r); S.pdraft = { list: orderedPhotos(r).map(p => ({ id: p.extra_id, file: p.file_id, title: p.title || '', cat: p.cat, group: p.group })), credits: m.credits }; }
  const groups = [...new Set(S.pdraft.list.map(p => p.group).filter(Boolean))];
  return `<p class="cs" style="margin:0">Drag to reorder. Mark each photo as album cover art or part of a photoshoot, and give shoot photos a group name to keep them together.</p>
    <ol class="pedlist" id="pEditList">${S.pdraft.list.map((p, i) => `<li class="pedrow sortrow">
      <img data-photo-src="${esc(p.file)}" alt="">
      <div class="pf"><select class="field" data-pcat="${i}" aria-label="Section for photo ${i + 1}">
          ${[['shoot', 'Photoshoot'], ['cover', 'Album cover art'], ['bts', 'Behind the scenes'], ['social', 'Social media graphic']].map(([k, l]) => `<option value="${k}"${p.cat === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <input class="field" data-pgroup="${i}" list="phGroups" value="${esc(p.group)}" maxlength="80" placeholder="Group, e.g. Rooftop shoot" aria-label="Group for photo ${i + 1}"${p.cat === 'shoot' || p.cat === 'bts' ? '' : ' disabled'}></div>
      <button class="ib" type="button" data-del-photo="${esc(p.id)}" aria-label="Remove photo ${i + 1}">${I.trash}</button>
      <button class="grip" type="button" data-grip="${i}" aria-label="Reorder photo ${i + 1} of ${S.pdraft.list.length}. Drag, or use the up and down arrow keys." title="Drag to reorder">${I.grip}</button>
    </li>`).join('')}</ol><datalist id="phGroups">${groups.map(g => `<option value="${esc(g)}"></option>`).join('')}</datalist>
    <label>Photo credits (shown under the photos)<textarea class="field" id="phCredits" rows="3" maxlength="2000" placeholder="Photos: @chanel.shot&#10;Styling: Aisha">${esc(S.pdraft.credits)}</textarea></label>`;
}
function pMoveTo(from, to, byKey) {
  if (from !== to) { const [x] = S.pdraft.list.splice(from, 1); S.pdraft.list.splice(to, 0, x); }
  const panel = $('[data-panel="photos"] .pbody'); if (panel) panel.innerHTML = photoEditor(rel(S.releaseId));
  makeSortable($('#pEditList'), pMoveTo); loadPhotos();
  if (byKey) { const g = $(`#pEditList [data-grip="${to}"]`); if (g) g.focus(); }
}
function photosMetaDraft() {
  if (!S.pdraft) return null;
  const cat = {}, group = {};
  S.pdraft.list.forEach(p => { cat[p.id] = p.cat; if ((p.cat === 'shoot' || p.cat === 'bts') && p.group.trim()) group[p.id] = p.group.trim(); });
  return JSON.stringify({ order: S.pdraft.list.map(p => p.id), cat, group, credits: ($('#phCredits') || { value: S.pdraft.credits }).value });
}

/* ── artist links: names become clickable wherever they appear ── */
function artistUrl(name) {
  const m = S.lib.artist_links || {}, n = String(name || '').trim().toLowerCase();
  const k = Object.keys(m).find(x => x.toLowerCase() === n); return k ? m[k] : '';
}
function linkName(name) {
  const u = artistUrl(name); const e = esc(String(name || '').trim());
  return u && /^https?:\/\//i.test(u) ? `<a class="alink" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${e}</a>` : e;
}
// "Aziza, Khairro & DurtyHues" → each known name linked
function linkNames(list) { return String(list || '').split(/(\s*,\s*|\s+&\s+|\s+and\s+|\s+x\s+|\s+feat\.?\s+)/i).map((part, i) => i % 2 ? esc(part) : linkName(part)).join(''); }
// Plain text → safe HTML with known artist names linked. One pass over the ORIGINAL text, whole words only,
// each piece escaped on its own, so a link can never land inside another link, a URL, or an "&amp;".
function linkifyText(text) {
  text = String(text || '');
  const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi;
  if (URL_RE.test(text)) {   // web addresses become links; the text between them still gets artist links
    URL_RE.lastIndex = 0; let out = '', last = 0, mm;
    while ((mm = URL_RE.exec(text))) {
      out += linkifyText(text.slice(last, mm.index)) + `<a class="alink" href="${esc(mm[0])}" target="_blank" rel="noopener noreferrer">${esc(mm[0].replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>`;
      last = mm.index + mm[0].length;
    }
    return out + linkifyText(text.slice(last));
  }
  const m = S.lib.artist_links || {}, names = Object.keys(m).filter(n => n.trim() && /^https?:\/\//i.test(m[n])).sort((a, b) => b.length - a.length);
  if (!names.length) return esc(text);
  const reEsc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(' + names.map(reEsc).join('|') + ')', 'gi');
  const word = ch => !!ch && /[\p{L}\p{N}_]/u.test(ch);
  let out = '', last = 0, mm;
  while ((mm = re.exec(text))) {
    const a = mm.index, z = a + mm[0].length;
    if (word(text[a - 1]) || word(text[z])) { re.lastIndex = a + 1; continue; }   // part of a longer word
    const key = names.find(n => n.toLowerCase() === mm[0].toLowerCase());
    out += esc(text.slice(last, a)) + `<a class="alink" href="${esc(m[key])}" target="_blank" rel="noopener noreferrer">${esc(mm[0])}</a>`;
    last = z;
  }
  return out + esc(text.slice(last));
}
function artistLinksEditor() {
  if (!S.aldraft) S.aldraft = Object.entries(S.lib.artist_links || {}).map(([name, url]) => ({ name, url }));
  return `<p class="cs" style="margin:0">Add links for featured and other artists. Wherever their name appears (song artist, features, credits) it becomes clickable. These are shared across all your releases.</p>
    <div id="alList" style="display:grid;gap:8px">${S.aldraft.map((a, i) => `<div class="alrow">
      <input class="field" data-al-name="${i}" value="${esc(a.name)}" maxlength="120" placeholder="Artist name" aria-label="Artist name ${i + 1}">
      <input class="field url" data-al-url="${i}" value="${esc(a.url)}" maxlength="500" inputmode="url" placeholder="https://instagram.com/…" aria-label="Link for ${esc(a.name || 'artist ' + (i + 1))}">
      <button class="ib" type="button" data-al-del="${i}" aria-label="Remove link for ${esc(a.name || 'artist ' + (i + 1))}">${I.trash}</button></div>`).join('')}</div>
    <div><button class="pill soft" type="button" data-al-add>${I.plus}Add an artist link</button></div>`;
}
function alRender() { const p = $('[data-panel="artists"] .pbody'); if (p) p.innerHTML = artistLinksEditor(); }
function artistLinksDraft() {
  if (!S.aldraft) return null;
  const out = {}; S.aldraft.forEach(a => { const n = a.name.trim(), u = a.url.trim(); if (n && u) out[n] = u; });
  return JSON.stringify(out) === JSON.stringify(S.lib.artist_links || {}) ? null : out;
}

/* ── lyrics from a link ── */
function lyLinkToggle(i) {
  const box = $(`#lyf-${i}`); if (box) { box.remove(); return; }
  const btn = $(`[data-lylink="${i}"]`);
  btn.insertAdjacentHTML('afterend', `<div class="lyfetch" id="lyf-${i}"><input class="field" type="url" id="lyu-${i}" placeholder="https://genius.com/…" aria-label="Link to the lyrics page">
    <button class="pill main" type="button" data-lyfetch="${i}">Fill in</button></div>`);
  $(`#lyu-${i}`).focus();
}
async function lyFetch(i, btn) {
  const url = ($(`#lyu-${i}`) || {}).value || '', ta = $(`#ly-${i}`);
  if (!url.trim()) return toast('Paste the link to the lyrics page first');
  if (ta.value.trim() && !confirm('Replace the lyrics already in this box?')) return;
  btn.disabled = true; btn.textContent = 'Fetching…';
  try {
    ta.value = await run('fetchLyrics', BOOT.key, url.trim()); lyCount();
    $(`#lyf-${i}`).remove(); ta.focus(); toast('Filled in. Check them over, then Save lyrics.');
  } catch (e) { btn.disabled = false; btn.textContent = 'Fill in'; toast(e.message || 'Could not get lyrics from that page'); }
}

/* ── chapter description + trailer ── */
function chapMeta(r) { try { const m = JSON.parse((r && r.chapter_meta) || '{}'); return m && typeof m === 'object' ? m : {}; } catch (e) { return {}; } }


/* ═════════ Build 47: genres + companion B-sides ═════════ */
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  .gtags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; justify-content: inherit; }
  .gtag { padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 800; letter-spacing: .03em;
          background: rgba(255,255,255,.08); color: #E9E4E0; border: 1px solid rgba(255,255,255,.12); }
  .bsof { margin: 2px 0 6px; font-size: 14px; color: rgba(246,243,239,.8); }
  .bsof button { color: #fff; font-weight: 800; text-decoration: underline; text-decoration-color: rgba(52,194,122,.7); text-underline-offset: 3px; }
  .compnote { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 4px 0 10px; font-size: 13px; color: var(--dim); }
  .compnote .pill { min-height: 36px; font-size: 13px; }
  @media (min-width: 0px) { .hero .gtags { justify-content: center; } }
` }));
const genreList = g => String(g || '').split(',').map(x => x.trim()).filter(Boolean);
const songGenre = t => String(t.genre || '').trim() || String((rel(t.release_id) || {}).genre || '').trim();
function genreTags(g) { const l = genreList(g); return l.length ? `<div class="gtags" aria-label="Genre">${l.map(x => `<span class="gtag">${esc(x)}</span>`).join('')}</div>` : ''; }
function knownGenres() {
  const seen = new Map();
  S.lib.releases.concat(S.lib.tracks).forEach(x => genreList(x.genre).forEach(g => { if (!seen.has(g.toLowerCase())) seen.set(g.toLowerCase(), g); }));
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
function genreDatalist() { return `<datalist id="genreList">${knownGenres().map(g => `<option value="${esc(g)}"></option>`).join('')}</datalist>`; }

// Releases whose songs are the B-sides of relId (e.g. SHADOW WORK → soulSEARCHING), as this viewer can see them.
function companionsOf(relId) {
  return S.lib.releases.filter(x => x.bsides_of === relId && (OWNER || !x.locked) && tracksOf(x.release_id).length);
}
function companionTracks(relId) { return companionsOf(relId).flatMap(c => tracksOf(c.release_id)); }
function songListsFor(relId) {
  const L = songLists(tracksOf(relId)), extra = companionTracks(relId);
  if (extra.length) { L.bsides = L.bsides.concat(extra); L.extras = L.extras.concat(extra); }   // the songs of a companion (b-sides) release are extras here
  return L;
}
function bsidesPicker(r) {
  const hasCompanions = S.lib.releases.some(x => x.bsides_of === r.release_id);
  const options = S.lib.releases.filter(x => x.release_id !== r.release_id && !String(x.bsides_of || '').trim())
    .sort((a, b) => String(a.title).localeCompare(String(b.title)));
  return `<label>These songs are the B-sides of…
    <select class="field" id="wBsides"${hasCompanions ? ' disabled' : ''}><option value="">Nothing (a release of its own)</option>
      ${options.map(x => `<option value="${esc(x.release_id)}"${x.release_id === r.bsides_of ? ' selected' : ''}>${esc(x.title)}${x.year ? ' (' + esc(x.year) + ')' : ''}</option>`).join('')}</select>
    <span class="cs">${hasCompanions ? 'Other releases are B-sides of this one, so it can\'t be B-sides itself.' : 'Its songs also appear in that release\'s B-Sides tab. This release keeps its own page.'}</span></label>`;
}


/* ═════════ Build 48: text-safe catalog, instant start, resilient playback, more video types, playlists, Lore ═════════ */
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  .vtype.trailer { background: rgba(240,48,79,.18); color: #FFC4CE; }
  .vtype.bts { background: rgba(176,106,240,.18); color: #E3CCFF; }
  .vtype.plist { background: rgba(255,255,255,.12); color: #fff; margin-left: 6px; }
  .vthumb .plph { position: absolute; inset: 0; display: grid; place-items: center; background: linear-gradient(135deg, #2a1418, #10231a); color: #fff; font-weight: 800; letter-spacing: .08em; font-size: 12px; text-transform: uppercase; }
  .lore h2 { margin-top: 26px; }
  .lorestats { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 10px; margin: 8px 0 18px; }
  .lorestats .kpi b { font-size: 26px; }
  .lorebio textarea { width: 100%; min-height: 150px; line-height: 1.6; font: inherit; font-size: 15px; background: var(--raise); color: var(--text); border: 1px solid var(--line); border-radius: 12px; padding: 12px; }
  .lorebio .end { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
  .lorelist { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .lorelist li { padding: 10px 12px; border-radius: 12px; background: rgba(255,255,255,.03); border: 1px solid var(--line); }
  .lorelist li b { display: block; }
  .lorelist li .cs { font-size: 13px; }
  @media (min-width: 0px) { .lorestats { grid-template-columns: 1fr 1fr 1fr 1.55fr; gap: 6px; } .lorestats .kpi { min-width: 0; } .lorestats .kpi { padding: 10px 4px; text-align: center; } .lorestats .kpi b { font-size: 17px; white-space: nowrap; } .lorestats .kpi span { font-size: 10px; letter-spacing: .04em; } }
  .lorephotos .extra { display: none; } .lorephotos.all .extra { display: block; }
  .lormore { display: block; margin: -8px auto 20px; }
  .lorehi { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 6px; margin: 0 0 8px; }
  .lorehi .hi { padding: 10px; border-radius: 14px; background: linear-gradient(160deg, rgba(255,255,255,.08), rgba(255,255,255,.02)); border: 1px solid var(--line); display: grid; gap: 2px; align-content: start; min-width: 0; }
  .lorehi .hi b { font: 800 15px/1.2 var(--serif); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 2.4em; } .lorehi .hi .cs { font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; }
  .loreeras { display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x mandatory; scroll-padding: 0 16px; padding: 4px 16px 14px; margin: 0 -16px; scrollbar-width: none; }
  .loreeras::-webkit-scrollbar { display: none; }
  .loreera { flex: 0 0 148px; align-content: start; grid-auto-rows: min-content; scroll-snap-align: start; display: grid; gap: 3px; align-content: start; text-align: left; padding: 0; background: none; border: 0; color: inherit; cursor: pointer; }
  .loreera .lc { display: block; aspect-ratio: 1; border-radius: 12px; overflow: hidden; background: #1a1a1c; margin-bottom: 4px; }
  .loreera .lc img { display: block; width: 100%; height: 100%; object-fit: cover; } .loreera .lc img:not([src]) { visibility: hidden; }
  .loreera b { font: 700 14px/1.25 var(--serif); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 2.5em; } .loreera .cs { font-size: 12px; }
  .agechip { justify-self: start; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 99px; background: var(--raise); color: var(--dim); }
  .lorecats button i { font-style: normal; opacity: .6; margin-left: 2px; }
  .lchips { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 8px 0; }
  @media (min-width: 761px) { .lchips { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  .lchip { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 48px; padding: 8px 12px; border-radius: 14px; text-align: left; border: 1px solid var(--line); background: rgba(255,255,255,.04); color: inherit; font-weight: 600; font-size: 14px; line-height: 1.2; cursor: pointer; min-width: 0; overflow-wrap: anywhere; }
  .lchip i { flex: none; font-style: normal; font-size: 11px; margin-left: auto; padding: 1px 6px; border-radius: 99px; background: var(--raise); color: var(--dim); }
  .lchip[aria-expanded="true"] { background: var(--text); color: var(--bg); } .lchip[aria-expanded="true"] i { background: rgba(0,0,0,.12); color: inherit; }
  .lpdetail { padding: 12px 14px; border-radius: 14px; border: 1px solid var(--line); background: rgba(255,255,255,.04); display: grid; gap: 6px; }
  .lprel { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 14px; }
` }));

