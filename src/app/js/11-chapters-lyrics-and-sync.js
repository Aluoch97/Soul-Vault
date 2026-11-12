/* ── chapters: named ranges of songs ── */
// New style: every song in a chapter carries its name. Older data only marked the first song; both are read here.
/* ── chapter colors ── */
const CHAP_PALETTE = ['#34C27A', '#F0304F', '#E8B04A', '#4AA3F0', '#B06AF0', '#F07A3A'];
function chapColors(r) { try { const m = JSON.parse((r && r.chapter_colors) || '{}'); return m && typeof m === 'object' ? m : {}; } catch (e) { return {}; } }
function hexRgb(h) { const n = parseInt(String(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function relLum([r, g, b]) { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
// The chapter name must stay readable on the dark page (4.5:1): lighten the chosen color only as much as needed.
function readableOnDark(hex) {
  let [r, g, b] = hexRgb(hex); const bg = relLum([20, 20, 22]);
  for (let k = 0; k < 20 && (relLum([r, g, b]) + 0.05) / (bg + 0.05) < 4.5; k++) { r += (255 - r) * 0.15; g += (255 - g) * 0.15; b += (255 - b) * 0.15; }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}
const rgba = (hex, a) => { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; };
function chapStyle(color) {
  if (!/^#[0-9a-f]{6}$/i.test(color || '')) return '';
  return ` style="border-color:${rgba(color, .55)};background:linear-gradient(180deg, ${rgba(color, .16)}, ${rgba(color, .03)});--chap-text:${readableOnDark(color)};--chap-line:${rgba(color, .5)}"`;
}

function chapterGroups(list, relId) {
  const names = list.map(t => String(t.chapter || '').trim());
  const counts = {}; names.forEach(n => { if (n) counts[n] = (counts[n] || 0) + 1; });
  const r = rel(relId || (list[0] && (list[0].release_id || trk(list[0].track_id).release_id)));
  const legacy = !(r && String(r.chapter_mode) === '2') && names.some(Boolean) && !Object.values(counts).some(c => c > 1);
  const groups = []; let cur = null;
  list.forEach((t, i) => {
    const n = names[i];
    if (legacy) {
      if (n) { cur = { name: n, items: [] }; groups.push(cur); }
      if (cur) cur.items.push(t); else groups.push({ name: '', items: [t] });
      return;
    }
    if (n && cur && cur.name === n) { cur.items.push(t); return; }
    cur = n ? { name: n, items: [t] } : null;
    groups.push(cur || { name: '', items: [t] });
  });
  return groups;
}
function chaptersFromDraft() {
  const list = (S.draft || []).map(d => ({ track_id: d.track_id, chapter: d.chapter }));
  const saved = chapColors(rel(S.releaseId)), smeta = chapMeta(rel(S.releaseId));
  return chapterGroups(list).filter(g => g.name).map((g, i) => ({ name: g.name, from: g.items[0].track_id, to: g.items[g.items.length - 1].track_id,
    color: saved[g.name] || CHAP_PALETTE[i % CHAP_PALETTE.length], desc: (smeta[g.name] || {}).desc || '', trailer: (smeta[g.name] || {}).trailer || '' }));
}
function chapEditor() {
  if (!S.chaps) S.chaps = chaptersFromDraft();
  const opts = sel => S.draft.map((d, i) => `<option value="${esc(d.track_id)}"${d.track_id === sel ? ' selected' : ''}>${i + 1}. ${esc(d.title)}</option>`).join('');
  return `<div class="chaped" id="chapEd"><h3>Chapters</h3>
    <p class="cs" style="margin:0">Give each chapter a name and pick the song it starts on and the song it ends on. Songs outside every chapter stay unboxed.</p>
    ${S.chaps.map((c, i) => `<div class="chaprow">
      <label>Chapter name<input class="field" data-chap-name="${i}" value="${esc(c.name)}" maxlength="80" placeholder="Chapter ${i + 1}: Departure"></label>
      <label>Starts on<select class="field" data-chap-from="${i}">${opts(c.from)}</select></label>
      <label>Ends on<select class="field" data-chap-to="${i}">${opts(c.to)}</select></label>
      <label class="chapcolor">Color<input type="color" data-chap-color="${i}" value="${esc(c.color || CHAP_PALETTE[i % CHAP_PALETTE.length])}" aria-label="Color for ${esc(c.name || 'chapter ' + (i + 1))}"></label>
      <button class="ib" type="button" data-chap-del="${i}" aria-label="Remove chapter ${esc(c.name || String(i + 1))}">${I.trash}</button>
      <div class="chapmore"><label>Description (optional)<textarea class="field" data-chap-desc="${i}" maxlength="1200" placeholder="What this chapter is about">${esc(c.desc || '')}</textarea></label>
        <label>Trailer link (YouTube, optional)<input class="field" data-chap-trailer="${i}" value="${esc(c.trailer || '')}" maxlength="300" inputmode="url" placeholder="https://youtu.be/…"></label></div>
    </div><hr class="chapsep">`).join('')}
    <div><button class="pill soft" type="button" data-chap-add>${I.plus}Add a chapter</button></div>
    <p class="err" id="chapErr" hidden></p></div>`;
}
function chapRender() { const el = $('#chapEd'); if (el) el.outerHTML = chapEditor(); }
function chapAdd() {
  S.chaps = S.chaps || [];
  const used = new Set(); S.chaps.forEach(c => { const a = S.draft.findIndex(d => d.track_id === c.from), b = S.draft.findIndex(d => d.track_id === c.to); for (let k = a; k <= b; k++) used.add(k); });
  const start = S.draft.findIndex((d, i) => !used.has(i));
  if (start < 0) { toast('Every song is already in a chapter. Shorten a chapter first, then add another.'); return; }
  let end = start; while (end + 1 < S.draft.length && !used.has(end + 1)) end++;
  S.chaps.push({ name: `Chapter ${S.chaps.length + 1}`, from: S.draft[start].track_id, to: S.draft[end].track_id, color: CHAP_PALETTE[S.chaps.length % CHAP_PALETTE.length] });
  chapRender();
}
// Turns the chapter rows into each song's chapter name; returns an error message if ranges don't make sense.
function applyChapters() {
  if (!S.chaps) return '';
  const idx = id => S.draft.findIndex(d => d.track_id === id);
  const taken = {};
  for (let i = 0; i < S.chaps.length; i++) {
    const c = S.chaps[i], name = String(c.name || '').trim() || `Chapter ${i + 1}`;
    let a = idx(c.from), b = idx(c.to);
    if (a < 0 || b < 0) return `Chapter "${name}" points at a song that's no longer here.`;
    if (a > b) { [a, b] = [b, a]; [c.from, c.to] = [c.to, c.from]; }   // songs were reordered: same stretch, flipped ends
    for (let k = a; k <= b; k++) { if (taken[k]) return `Chapters "${taken[k]}" and "${name}" overlap on song ${k + 1}.`; taken[k] = name; }
  }
  S.draft.forEach((d, k) => { d.chapter = taken[k] || ''; });
  return '';
}

/* ── page background ── */
function applyPageBg(r) {
  const el = $('#pagebg'), id = r && !(!OWNER && r.locked) ? r.bg_file_id : '';
  if (!id) { clearPageBg(); return; }
  document.body.classList.add('has-bg');
  const k = id + '|1600';
  if (!S.coverP[k]) S.coverP[k] = run('getCover', id, BOOT.key, BOOT.token, 1600);
  S.bgFor = id;
  paintBgStyle(bgStyleOf(r));
  S.coverP[k].then(u => { if (u && S.bgFor === id) { el.style.backgroundImage = `url("${u}")`; el.classList.add('on'); } }).catch(() => {});
}
function clearPageBg() { S.bgFor = ''; const el = $('#pagebg'); if (el) { el.classList.remove('on'); } document.body.classList.remove('has-bg'); }
async function uploadPageBg(file) {
  const r = rel(S.releaseId);
  if (file.size > 20 * 1048576) throw new Error('That image is over 20 MB.');
  const ticket = await run('getUploadTicket', BOOT.key, r.release_id);
  let blob = file, name = 'Page background.gif', type = 'image/gif';
  // AVIFs upload untouched: smaller than JPEG, full quality, animation kept
  const avif = file.type === 'image/avif' || /\.avif$/i.test(file.name || '');
  if (avif) { name = 'Page background.avif'; type = 'image/avif'; }
  else if (file.type !== 'image/gif') { blob = await (await fetch(await shrinkImage(file, 2400, 0.85))).blob(); name = 'Page background.jpg'; type = 'image/jpeg'; }
  const id = await driveUpload(blob, name, type, ticket);
  r.bg_file_id = await run('setReleaseBg', BOOT.key, r.release_id, id);
  applyPageBg(r);
}
function bgRow(r) {
  return `<div class="bgrow"><span class="lbl">Page background (JPG, PNG, WebP, GIF or AVIF behind the whole release page)</span>
    <button class="pill soft" type="button" data-bg-pick>${I.img}${r.bg_file_id ? 'Change background' : 'Upload background'}</button>
    ${r.bg_file_id ? '<button class="pill soft" type="button" data-bg-clear>Remove</button>' : ''}</div>`;
}

/* ── upload pickers (attached once their inputs exist) ── */
$('#songCoverFile').addEventListener('change', async e => {
  const f = e.target.files[0], tid = S.coverFor; e.target.value = ''; if (!f || !tid) return;
  toast('Uploading song cover…');
  try { await uploadSongCover(f, tid); afterSongCover(tid); toast('Song cover saved'); }
  catch (err) { toast(err.message || 'The song cover did not upload.'); }
});
$('#bgFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  toast('Uploading background…');
  try { await uploadPageBg(f); const row = $('.bgrow'); if (row) { const c = $('.bgctl'); if (c) c.remove(); row.outerHTML = bgRow(rel(S.releaseId)) + bgControls(rel(S.releaseId)); } toast('Background saved'); }
  catch (err) { toast(err.message || 'The background did not upload.'); }
});

/* ── synced lyrics ── */
const LRC_TAG = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
function parseLRC(text) {
  const out = [];
  String(text || '').split('\n').forEach(line => {
    const tags = [...line.matchAll(LRC_TAG)], words = line.replace(LRC_TAG, '').trim();
    tags.forEach(m => out.push({ t: +m[1] * 60 + +m[2] + (m[3] ? +('0.' + m[3].padStart(2, '0').slice(0, 3)) : 0), text: words }));
  });
  return out.sort((a, b) => a.t - b.t);
}
const isSynced = text => parseLRC(text).length >= 2;
// Lyrics as fans read them anywhere else: timestamps and [ar:]/[ti:] tags removed.
function plainLyrics(text) {
  return String(text || '').split('\n').filter(l => !/^\s*\[[a-z]+:[^\]]*\]\s*$/i.test(l)).map(l => l.replace(LRC_TAG, '').trimEnd()).join('\n').trim();
}
const fmtLrc = s => { const m = Math.floor(s / 60), r = s - m * 60; return `[${String(m).padStart(2, '0')}:${r.toFixed(2).padStart(5, '0')}]`; };
// The small song header shown above Apple Music-style lyrics (cover, title, artist).
function syncLyHead() {
  const h = $('#lyHead'), a = $('#npArt'); if (!h || !S.now) return;
  h.innerHTML = `<img alt="" src="${esc((a && (a.currentSrc || a.src)) || '')}"><div><b>${esc(S.now.t.title)}</b><span>${esc(($('#npS') && $('#npS').textContent) || '')}</span></div>`;
}
function setLyrMode(on) {
  const n = S.now, has = n && String(n.t.lyrics || '').trim();
  S.lyrMode = !!(on && has); S.sync = S.lyrMode ? S.sync : null;
  if (S.lyrMode && S.videoMode) setMode('song');
  $('#npLyr').hidden = !S.lyrMode;
  $('#np').classList.toggle('lyrmode', S.lyrMode); if (S.lyrMode) syncLyHead();
  $('#npArt').hidden = S.lyrMode || S.videoMode;
  const b = $('[data-np-lyrics]'); if (b) b.setAttribute('aria-pressed', String(S.lyrMode));
  if (S.lyrMode) { renderLyr(); award('lyrics'); }
}
function renderLyr() {
  const n = S.now, box = $('#npLyr'); if (!n || !box) return;
  if (S.sync) return renderSync();
  const raw = String(n.t.lyrics || ''), synced = isSynced(raw);
  S.lyrLines = synced ? parseLRC(raw) : null; S.lyrAt = -1;
  const lines = synced ? S.lyrLines : plainLyrics(raw).split('\n').map(text => ({ text }));
  box.className = 'nplyr' + (synced ? '' : ' plain');
  box.innerHTML = lines.map((l, i) => l.text ? (synced ? `<button class="ly" data-lt="${l.t}" data-li="${i}">${esc(l.text)}</button>` : `<p class="ly">${esc(l.text)}</p>`)
                                            : '<span class="ly gap" aria-hidden="true"></span>').join('');
  const note = $('#lyNote');
  note.innerHTML = synced ? '' : `<span>These lyrics aren't synced yet, so they scroll with the song.</span>${OWNER ? '<button class="pill soft" data-sync-start>Sync lyrics</button>' : ''}`;
  note.hidden = synced;
  updateLyr(true);
}
function updateLyr(force) {
  if (!S.lyrMode || S.sync) return;
  const box = $('#npLyr'); if (!box || box.hidden) return;
  if (!S.lyrLines) {   // unsynced: follow the song's progress
    if (audio.duration) box.scrollTop = (audio.currentTime / audio.duration) * (box.scrollHeight - box.clientHeight);
    return;
  }
  const t = audio.currentTime + 0.15; let i = -1;
  for (let k = 0; k < S.lyrLines.length; k++) { if (S.lyrLines[k].t <= t) i = k; else break; }
  if (i === S.lyrAt && !force) return;
  S.lyrAt = i;
  box.querySelectorAll('.ly.on').forEach(el => el.classList.remove('on'));
  const el = box.querySelector(`[data-li="${i}"]`);
  if (el) { el.classList.add('on'); box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2, behavior: force ? 'auto' : 'smooth' }); }
}
function startSync() {
  const n = S.now; if (!n) return;
  const lines = plainLyrics(n.t.lyrics).split('\n').map(s => s.trim()).filter(Boolean);
  if (lines.length < 2) return toast('Add at least two lines of lyrics first');
  S.sync = { tid: n.t.track_id, lines, times: [] };
  audio.currentTime = 0; audio.play().catch(() => {});
  renderSync();
}
function renderSync() {
  const s = S.sync, box = $('#npLyr'); if (!s || !box) return;
  const i = s.times.length, done = i >= s.lines.length;
  box.className = 'syncui';
  box.innerHTML = done
    ? `<div class="prog">All ${s.lines.length} lines timed</div><div class="cur">Save these timings?</div>
       <div class="row3"><button class="pill main" data-sync-save>Save synced lyrics</button><button class="pill soft" data-sync-undo>Undo last</button><button class="pill soft" data-sync-cancel>Cancel</button></div>`
    : `<div class="prog">Line ${i + 1} of ${s.lines.length} · tap the moment it starts</div>
       <div class="cur" aria-live="polite">${esc(s.lines[i])}</div><div class="nxt">${esc(s.lines[i + 1] || '')}</div>
       <button class="pill main tap" data-sync-tap>Tap: this line starts now</button>
       <div class="row3">${i ? '<button class="pill soft" data-sync-undo>Undo last</button>' : ''}<button class="pill soft" data-sync-cancel>Cancel</button></div>`;
  $('#lyNote').hidden = true;
  const b = box.querySelector(done ? '[data-sync-save]' : '[data-sync-tap]'); if (b) b.focus();
}
function syncTap() { const s = S.sync; if (!s || s.times.length >= s.lines.length) return; s.times.push(audio.currentTime); renderSync(); }
function syncUndo() { const s = S.sync; if (!s || !s.times.length) return; s.times.pop(); audio.currentTime = Math.max(0, (s.times[s.times.length - 1] || 0)); renderSync(); }
async function syncSave(btn) {
  const s = S.sync; if (!s) return;
  const lrc = s.lines.map((l, k) => fmtLrc(s.times[k]) + l).join('\n');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await run('saveLyrics', BOOT.key, trk(s.tid).release_id, [{ track_id: s.tid, lyrics: lrc }]);
    trk(s.tid).lyrics = lrc; S.sync = null; toast('Synced lyrics saved'); renderLyr();
  } catch (e) { btn.disabled = false; btn.textContent = 'Save synced lyrics'; toast(e.message || 'Could not save'); }
}


/* ═════════ Drag to reorder (mouse, touch and keyboard) ═════════ */
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  .grip { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 12px; color: var(--dim); cursor: grab;
          touch-action: none; background: rgba(255,255,255,.05); }
  .grip:hover { color: var(--text); background: rgba(255,255,255,.1); }
  .grip:active { cursor: grabbing; }
  .grip svg { width: 20px; height: 20px; }
  .grip:focus-visible { outline: 2px solid var(--green-hi); outline-offset: 2px; }
  .sortrow.dragging { position: relative; z-index: 6; background: #1c1c1f !important; border-radius: 14px;
                      box-shadow: 0 18px 40px -10px #000, 0 0 0 1px rgba(52,194,122,.55); }
  .sortrow.dragging .grip { color: var(--green-hi); cursor: grabbing; }
  body.sorting, body.sorting * { user-select: none !important; -webkit-user-select: none !important; cursor: grabbing !important; }
` }));
I.grip = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>';

// Makes the rows of a list draggable by their [data-grip] handle. onDrop(from, to) updates the data and re-renders.
function makeSortable(list, onDrop) {
  if (!list || list._sortable) return;
  list._sortable = true;
  list.addEventListener('keydown', e => {
    const h = e.target.closest && e.target.closest('[data-grip]'); if (!h) return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const rows = [...list.querySelectorAll('.sortrow')], i = rows.indexOf(h.closest('.sortrow'));
    const j = i + (e.key === 'ArrowUp' ? -1 : 1);
    if (j >= 0 && j < rows.length) onDrop(i, j, true);
  });
  list.addEventListener('pointerdown', e => {
    const h = e.target.closest('[data-grip]'); if (!h || h.disabled || (e.button != null && e.button !== 0)) return;
    e.preventDefault();
    const row = h.closest('.sortrow'), rows = () => [...list.querySelectorAll('.sortrow')];
    const from = rows().indexOf(row);
    let startPage = e.clientY + window.scrollY, lastY = e.clientY, raf = 0;
    try { h.setPointerCapture(e.pointerId); } catch (x) {}
    row.classList.add('dragging'); document.body.classList.add('sorting');
    const place = () => {
      let dy = lastY + window.scrollY - startPage;
      row.style.transform = `translateY(${dy}px)`;
      const rs = rows(), i = rs.indexOf(row), prev = rs[i - 1], next = rs[i + 1];
      const naturalTop = row.getBoundingClientRect().top - dy;
      let moved = false;
      // Swap when the dragged row's leading edge passes the neighbour's middle (not the fingertip), so tall rows
      // don't need a long drag. The neighbour is moved, never the held row (moving it makes browsers drop the drag).
      const me = row.getBoundingClientRect();
      if (next && dy > 0 && me.bottom > next.getBoundingClientRect().top + next.offsetHeight / 2) { list.insertBefore(next, row); moved = true; }
      else if (prev && dy < 0 && me.top < prev.getBoundingClientRect().top + prev.offsetHeight / 2) { list.insertBefore(prev, row.nextSibling); moved = true; }
      if (moved) {   // keep the row under the finger after it jumps a slot
        row.style.transform = `translateY(${dy}px)`;
        const newTop = row.getBoundingClientRect().top - dy;
        startPage += newTop - naturalTop;
        dy = lastY + window.scrollY - startPage;
        row.style.transform = `translateY(${dy}px)`;
      }
    };
    const startY = e.clientY;
    const edge = () => {   // scroll the page when dragging near the top or bottom edge, only after moving toward it
      const bottomUi = 170;   // the phone layout (tab bar + mini player) is used at every width
      const v = lastY < 90 && lastY < startY - 8 ? -14 : lastY > innerHeight - bottomUi && lastY > startY + 8 ? 14 : 0;
      if (v) { window.scrollBy(0, v); place(); }
      raf = requestAnimationFrame(edge);
    };
    raf = requestAnimationFrame(edge);
    const onMove = ev => { if (ev.pointerId !== e.pointerId) return; ev.preventDefault(); lastY = ev.clientY; place(); };
    const end = ev => {
      if (ev && ev.pointerId != null && ev.pointerId !== e.pointerId) return;
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end);
      row.style.transform = ''; row.classList.remove('dragging'); document.body.classList.remove('sorting');
      const to = rows().indexOf(row);
      onDrop(from, to, false);
    };
    // listen on the whole window so the drag can't lose the pointer
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
  });
}
// Chapters follow their songs: before a move, every song takes its chapter from the panel; after it, the moved song
// joins the chapter it was dropped into (or the one above it at an edge), and the panel is rebuilt from the songs.
function syncDraftChapters() {
  if (!S.chaps) return;
  const idx = id => S.draft.findIndex(d => d.track_id === id);
  S.draft.forEach(d => (d.chapter = ''));
  S.chaps.forEach((c, i) => {
    let a = idx(c.from), b = idx(c.to); if (a < 0 || b < 0) return;
    if (a > b) [a, b] = [b, a];
    const name = String(c.name || '').trim() || `Chapter ${i + 1}`;
    for (let k = a; k <= b; k++) if (!S.draft[k].chapter) S.draft[k].chapter = name;
  });
}
function rebuildChaps() {
  if (!S.chaps) return;
  const colorOf = {}, extraOf = {}; S.chaps.forEach(c => { if (c.name) { colorOf[String(c.name).trim()] = c.color; extraOf[String(c.name).trim()] = { desc: c.desc || '', trailer: c.trailer || '' }; } });
  const out = [];
  S.draft.forEach(d => {
    const n = d.chapter, last = out[out.length - 1];
    if (!n) return;
    if (last && last.name === n && S.draft[S.draft.findIndex(x => x.track_id === last.to) + 1] === d) { last.to = d.track_id; return; }
    out.push(Object.assign({ name: n, from: d.track_id, to: d.track_id, color: colorOf[n] || CHAP_PALETTE[out.length % CHAP_PALETTE.length] }, extraOf[n] || { desc: '', trailer: '' }));
  });
  S.chaps = out;
}
function moveDraftTo(from, to, byKey) {
  if (from !== to) {
    syncDraftChapters();
    const [x] = S.draft.splice(from, 1); S.draft.splice(to, 0, x);
    if (S.chaps) {
      const prev = S.draft[to - 1], next = S.draft[to + 1];
      x.chapter = prev && next && prev.chapter && prev.chapter === next.chapter ? prev.chapter   // dropped inside a chapter
        : prev && prev.chapter ? prev.chapter                                                     // at a chapter's end: extend it
        : !prev && next && next.chapter && x.chapter === next.chapter ? next.chapter : '';        // top of the list
      rebuildChaps();
    }
  }
  $('#editList').innerHTML = editRows(from !== to ? to : undefined);
  chapRender();
  if (byKey) { const g = $(`#editList [data-grip="${to}"]`); if (g) g.focus(); }
}
function nrMoveTo(from, to, byKey) {
  const f = S.nr.files;
  if (from !== to) { const [x] = f.splice(from, 1); f.splice(to, 0, x); }
  nrRender(from !== to ? to : undefined);
  if (byKey) { const g = $(`#nrList [data-grip="${to}"]`); if (g) g.focus(); }
}


/* ═════════ Series: releases linked as a trilogy, saga, or series ═════════ */
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  .seriespanel { margin: 16px 0 6px; padding: 14px 14px 12px; border-radius: 18px; border: 1px solid rgba(240,48,79,.35);
                 background: linear-gradient(135deg, rgba(210,16,52,.14), rgba(8,122,59,.08)); }
  .seriespanel .shd { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: baseline; margin-bottom: 10px; }
  .stag { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: var(--red-hi); }
  .stag svg { width: 15px; height: 15px; }
  .stitle { font: 400 18px var(--serif); } .stitle b { font-weight: 800; }
  .sparts { list-style: none; margin: 0; padding: 0 0 4px; display: flex; gap: 10px; overflow-x: auto; scrollbar-width: none; }
  .sparts::-webkit-scrollbar { display: none; }
  .sparts > li { flex: 0 0 116px; width: 116px; }   /* the width belongs on the list item, or a loaded cover stretches the tile to the picture's size */
  .spart { flex: 0 0 116px; display: grid; gap: 3px; text-align: left; padding: 6px; border-radius: 14px; background: rgba(0,0,0,.25); border: 1px solid transparent; }
  .spart:hover { background: rgba(0,0,0,.4); }
  .spart.cur { border-color: var(--green-hi); background: rgba(8,122,59,.25); }
  .spart .sart { position: relative; display: block; }
  .spart .art { width: 100%; aspect-ratio: 1; border-radius: 10px; }
  .spart .sart .lock { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(0,0,0,.45); border-radius: 10px; color: #fff; }
  .spart .sart .lock svg { width: 24px; height: 24px; }
  .spart .sp { font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--green-hi); }
  .spart .st { font-weight: 700; font-size: 13px; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .spart .cs { font-size: 11px; }
  .spart .hid { font-size: 10px; font-weight: 800; color: var(--dim); text-transform: uppercase; letter-spacing: .06em; }
  .snav { display: flex; justify-content: space-between; gap: 10px; margin-top: 10px; }
  .snav .pill { min-height: 40px; max-width: 48%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .snav .next { margin-left: auto; }
  .slide .sr { background: rgba(210,16,52,.85); }
  .scard { flex: 0 0 300px; display: grid; gap: 10px; padding: 14px; border-radius: 20px; border: 1px solid var(--line);
           background: linear-gradient(135deg, rgba(210,16,52,.16), rgba(0,0,0,.2) 60%, rgba(8,122,59,.14)); scroll-snap-align: start; }
  .scard .fan { position: relative; height: 120px; }
  .scard .fan .art { position: absolute; top: 0; width: 110px; height: 110px; border-radius: 12px; box-shadow: 0 12px 24px -10px #000; border: 2px solid #0B0B0C; }
  .scard .nm { font: 800 19px/1.15 var(--serif); }
  .scard .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .scard .chip { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .seriesrow { grid-template-columns: 1fr 160px; }
  @media (min-width: 0px) { .scard { flex-basis: 84%; } .spart { flex-basis: 104px; } }
` }));
I.layers = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/><path d="M3 17.5l9 5 9-5" opacity=".6"/></svg>';

