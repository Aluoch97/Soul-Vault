/* ── every name/title is text (Sheets turns "1995" into a number) ── */
function normalizeLib(lib) {
  if (lib.overlay) { const prev = S.links || {}; S.links = Object.assign({}, prev, lib.overlay); S.links.releases = mergeRelLinks(prev.releases, lib.overlay.releases); S.links.sr = Object.assign({}, prev.sr || {}, lib.overlay.sr || {}); }   // Studio's links per release win; other releases keep the ones from /links.json
  applyFlags(lib);
  const str = (o, keys) => o && keys.forEach(k => { if (o[k] != null && typeof o[k] !== 'string') o[k] = String(o[k]); });
  (lib.releases || []).forEach(r => str(r, ['title', 'artist_name', 'world_tagline', 'world_story', 'recorded_at', 'series_name', 'series_part', 'genre', 'album_credits', 'world_mood']));
  (lib.tracks || []).forEach(t => str(t, ['title', 'artist', 'features', 'producer', 'engineer', 'chapter', 'number_label', 'genre', 'lyrics', 'notes', 'key', 'bpm']));
  (lib.versions || []).forEach(v => str(v, ['label', 'duration']));
  S.urlByFile = {}; (lib.versions || []).forEach(v => { if (v.url) { if (v.audio) S.urlByFile[v.audio] = v.url; if (v.preview) S.urlByFile[v.preview] = v.url; } });   // songs with a streaming copy on our own storage
  (lib.extras || []).forEach(x => str(x, ['title', 'url']));
  return lib;
}

/* ── instant start: show the last catalog right away, then refresh ── */
const libCacheKey = () => 'sv_lib_cache:' + (BOOT.token ? 'share:' + BOOT.token : 'owner');
function libCacheGet() {
  try { const c = JSON.parse(localStorage.getItem(libCacheKey()) || 'null'); return c && Date.now() - c.at < 14 * 864e5 ? c.lib : null; } catch (e) { return null; }
}
function libCacheSet(lib) {
  try { const s = JSON.stringify({ at: Date.now(), lib }); if (s.length < 3500000) localStorage.setItem(libCacheKey(), s); } catch (e) {}
}
function libCacheClear() { try { localStorage.removeItem(libCacheKey()); } catch (e) {} }
// After fresh data arrives, redraw whatever is on screen without losing your place.
function refreshView() {
  const y = window.scrollY;
  if (S.view === 'library') renderLibrary(true);
  else if (S.view === 'home') { if ($('#tribe.open')) fillHomeLatest(); else renderHome(); }   // never wipe a sign-up form that is being filled in
  else if (S.view === 'tour' || S.view === 'press' || S.view === 'video') { /* static pages: nothing to refresh */ }
  else if (S.view === 'release' && !S.editing && rel(S.releaseId)) renderRelease(S.releaseId);
  else if (S.view === 'vault') renderVault();
  else if (S.view === 'lore') renderLore();
  else if (S.view === 'playlist' && !S.plEditing) renderPlaylist(S.plId);
  window.scrollTo(0, y);
}

/* ── video types + playlists ── */
Object.assign(VTYPE, { trailer: 'Trailer', bts: 'Behind the scenes' });
const ytList = u => { const m = /[?&]list=([A-Za-z0-9_-]{10,64})/.exec(String(u || '')); return m ? m[1] : ''; };
function vThumb(v) {
  return v.id ? `<img src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" alt="" loading="lazy" referrerpolicy="no-referrer">`
              : `<span class="plph" aria-hidden="true">Playlist</span>`;
}

/* ── Lore: everything the catalog knows, compiled ── */
const splitNames = s => String(s || '').split(/\s*(?:,|&|\/|;|\band\b|\bfeat\.?\b|\bx\b)\s*/i).map(x => x.trim()).filter(x => x && x.length < 80);
function creditsFrom(text, re) {
  const out = [];
  String(text || '').split('\n').forEach(line => { const m = /^\s*([^:]{2,40}):\s*(.+)$/.exec(line); if (m && re.test(m[1])) out.push(...splitNames(m[2])); });
  return out;
}
// Reads a release's free-text album credits (any layout) and returns who produced, engineered, featured, and where it was recorded.
const foldName = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
function scanCredits(text, titles) {
  const out = { producers: [], engineers: [], features: [], places: [], photographers: [] };
  const tl = new Set([].concat(...(titles || []).map(t => [foldName(t), foldName(String(t).replace(/\([^)]*\)|\[[^\]]*\]/g, ''))])));
  const put = (k, name) => { name = cleanCreditName(name); if (name && !out[k].some(n => foldName(n).replace(/^the /, '') === foldName(name).replace(/^the /, ''))) out[k].push(name); };
  const cleanCreditName = n => {
    n = String(n || '').replace(/https?:\/\/\S+|www\.\S+/gi, '').replace(/\bfor\s+NuRenaissance.*$/i, '').replace(/\([^)]*\)/g, '').replace(/^["'“”‘’\s\-•*]+|^\d+[.)]\s+|["“”\s.:;]+$/g, '').trim();
    if (n.length < 2 || n.length > 60 || /^\d+$/.test(n) || /^(the|all|songs?|tracks?|and|n\/a|tbd)$/i.test(n)) return '';
    return n;
  };
  const names = s => String(s || '').replace(/https?:\/\/\S+|www\.\S+/gi, '').replace(/\([^)]*\)/g, ' ').split(/\s*(?:,|&|\+|;|\band\b)\s*/i).map(x => x.trim()).filter(Boolean);
  const roleOf = s => [/produc/i.test(s) && 'producers', /\b(mix|master|engineer|record)/i.test(s) && 'engineers', /featur/i.test(s) && 'features', /photo/i.test(s) && 'photographers'].filter(Boolean);
  let sect = '', got = 0;
  String(text || '').split('\n').forEach(raw => {
    const line = raw.replace(/^[\s•*]+/, '').trim();
    if (!line) { if (got) { sect = ''; got = 0; } return; }
    if (/^https?:|^www\./i.test(line)) return;
    const head = /^(producers?|production|engineers?|mixing|mastering|featured artists?|features?|photograph\w*)\s*:?\s*$/i.exec(line);
    if (head) { sect = roleOf(head[1])[0] || ''; got = 0; return; }
    let m;
    if ((m = /^recorded\s+(?:at|in)\s+(.+)$/i.exec(line))) { put('places', m[1].replace(/^(the\s+)+/i, 'The ')); return; }
    if ((m = /^(.*?)\bby\b\s*:?\s*(.+)$/i.exec(line)) && !/^\d+\.\s*["“]/.test(line)) {   // "Written, Produced, & Mixed by Name", "Mixing by A & B", "Tracks 1-5 produced by X."
      const kind = roleOf(m[1]);
      if (kind.length) { names(m[2]).forEach(n => kind.forEach(k => put(k, n))); return; }
      if (/\b(written|demo|additional|vocals|directed|cover)\b/i.test(m[1])) return;
    }
    if ((m = /^([^:]{2,40}):\s*(.+)$/.exec(line))) {   // "Produced by: X" / "Cover photo: X"
      const kind = roleOf(m[1]); if (kind.length) { names(m[2]).forEach(n => kind.forEach(k => put(k, n))); return; }
    }
    if ((m = /^(.+?)\s*[-–]\s+(.+)$/.exec(line))) {   // "Name - producer", "Name - featured artist", "Name - instagram url"
      const rest = m[2];
      if (/^(https?:|www\.|instagram|@)/i.test(rest)) { if (sect) { put(sect, m[1]); got++; } return; }
      const kind = roleOf(rest); if (kind.length) { kind.forEach(k => put(k, m[1])); return; }
    }
    if (sect) {   // list items under a "Producers" style heading
      const item = line.replace(/^(\d+[.)]|-|–)\s*/, '');
      const pm = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(item);
      let name = item;
      if (pm && tl.has(foldName(pm[1]))) name = pm[2];   // "Song Title (Producer)"
      else if (pm) name = pm[1];                          // "Producer (song, song)"
      names(name).forEach(n => put(sect, n)); got++;
    }
  });
  return out;
}
// Photo credits are often just a name ("Julia Schaffer"), or "Photos by X".
function scanPhotoCredits(text) {
  const out = [];
  String(text || '').split('\n').forEach(raw => {
    let l = raw.replace(/^[\s•*\-]+/, '').trim(); if (!l || /https?:|www\./i.test(l)) return;
    const m = /^(?:[^:]{2,40}:|(?:photos?|photography|photographed|shot|captured)(?:\s+\w+)?\s+by)\s*(.+)$/i.exec(l);
    (m ? m[1] : l).split(/\s*(?:,|&|\band\b|\+|;)\s*/i).forEach(n => { n = n.replace(/\([^)]*\)/g, '').replace(/^["\s]+|["\s.]+$/g, ''); if (n.length > 1 && n.length < 60 && !/\d{3,}/.test(n) && !out.some(x => foldName(x) === foldName(n))) out.push(n); });
  });
  return out;
}
function buildLore() {
  const rs = S.lib.releases.slice().sort((a, b) => relDateKey(a).localeCompare(relDateKey(b)));
  const idx = { producers: new Map(), engineers: new Map(), features: new Map(), places: new Map(), photographers: new Map() };
  const add = (map, name, rTitle) => { const k = foldName(name).replace(/^the /, ''); const e = map.get(k) || { name, releases: new Set(), n: 0 };
    if (/[^\x00-\x7f]/.test(name) && !/[^\x00-\x7f]/.test(e.name)) e.name = name;   // keep the accented spelling (Nicólas) when both exist
    e.releases.add(rTitle); e.n++; map.set(k, e); };
  const eras = rs.map(r => {
    const ts = tracksOf(r.release_id, true), vids = eraVideos(r, ts), meta = videosMeta(r);
    const vcount = {}; vids.forEach(v => { const t = meta.types[vKey(v)] || 'music'; vcount[t] = (vcount[t] || 0) + 1; });
    const prod = new Set(), eng = new Set(), feat = new Set();
    ts.forEach(t => { splitNames(creditVal(t, 'producer')).forEach(n => { prod.add(n); add(idx.producers, n, r.title); });
      splitNames(creditVal(t, 'engineer')).forEach(n => { eng.add(n); add(idx.engineers, n, r.title); });
      splitNames(creditVal(t, 'features')).forEach(n => { feat.add(n); add(idx.features, n, r.title); }); });
    // Credits typed as free text on the release page (any layout): producers, mix/master, features, places, photographers.
    const sc = scanCredits(r.album_credits, ts.map(t => t.title));
    const mergeNames = (set, list) => list.forEach(n => { if (![...set].some(x => foldName(x) === foldName(n))) set.add(n); });
    mergeNames(prod, sc.producers); mergeNames(eng, sc.engineers); mergeNames(feat, sc.features);
    sc.producers.forEach(n => add(idx.producers, n, r.title)); sc.engineers.forEach(n => add(idx.engineers, n, r.title)); sc.features.forEach(n => add(idx.features, n, r.title));
    sc.places.forEach(n => add(idx.places, n, r.title));
    const photoNames = [...new Set(creditsFrom(photosMeta(r).credits, /photo|shot|camera|director of photography/i).concat(scanPhotoCredits(photosMeta(r).credits), sc.photographers))];
    photoNames.filter((n, i) => photoNames.findIndex(x => foldName(x) === foldName(n)) === i).forEach(n => add(idx.photographers, n, r.title));
    if (String(r.recorded_at || '').trim()) add(idx.places, r.recorded_at.trim(), r.title);
    return { r, songs: ts.length, runtime: runtimeOf(ts), prod: [...prod], eng: [...eng], feat: [...feat], vcount, photos: extrasOf(r.release_id, 'photo').length,
             as: relArtist(r), ages: agesOf(r) };
  });
  const years = rs.map(r => Number(r.year)).filter(Boolean);
  return { eras, idx, totals: { releases: rs.length, songs: S.lib.tracks.length, videos: eras.reduce((a, e) => a + Object.values(e.vcount).reduce((x, y) => x + y, 0), 0),
    photos: eras.reduce((a, e) => a + e.photos, 0), from: years.length ? Math.min(...years) : '', to: years.length ? Math.max(...years) : '',
    names: [...new Set(eras.map(e => e.as))] } };
}
const vcText = vc => Object.entries(vc).map(([k, n]) => `${n} ${VTYPE[k] ? VTYPE[k].toLowerCase() : k}${n === 1 ? '' : (k === 'bts' ? '' : 's')}`).join(', ');
function indexList(map, label) {
  const rows = [...map.values()].sort((a, b) => b.releases.size - a.releases.size || a.name.localeCompare(b.name));
  if (!rows.length) return `<p class="cs">No ${label} in your credits yet.</p>`;
  return `<ul class="lorelist">${rows.map(e => `<li><b>${linkName(e.name)}</b><span class="cs">${[...e.releases].map(esc).join(' · ')}</span></li>`).join('')}</ul>`;
}
function renderLore() {
  clearPageBg(); S.view = 'lore'; renderChrome();
  const L = buildLore(), t = L.totals; t.toNow = Math.min(Number(t.to) || 0, new Date().getFullYear()) || t.to;   // a release sealed until next year does not count as active years yet
  const top = m => [...m.values()].sort((x, y) => y.releases.size - x.releases.size || x.name.localeCompare(y.name))[0];
  const hi = [['Most-used producer', top(L.idx.producers)], ['Most-featured artist', top(L.idx.features)], ['Most-used place', top(L.idx.places)]].filter(h => h[1]);
  const cats = [['producers', 'Producers', L.idx.producers, 'producers'], ['engineers', 'Engineers', L.idx.engineers, 'engineers'], ['features', 'Featured', L.idx.features, 'features'],
    ['places', 'Places', L.idx.places, 'recording locations'], ['photographers', 'Photographers', L.idx.photographers, 'photo credits']];
  const phRels = L.eras.map(e => ({ r: e.r, ph: extrasOf(e.r.release_id, 'photo').filter(x => x.file_id) })).filter(x => x.ph.length);
  let cat = cats.some(c => c[0] === S.loreCat) ? S.loreCat : (cats.find(c => c[2].size) || cats[0])[0];
  $('#main').innerHTML = `<div class="wrap lore">
    ${homeHeader(true)}
    <section class="lorephotos${S.loreAll ? ' all' : ''}" aria-label="Photos">${SITE.photos.map((f, i) => `<button type="button" class="lph1${i >= 6 ? ' extra' : ''}" data-lphoto="${i}" aria-label="Open photo ${i + 1}"><img src="/photos/${esc(f)}.jpg" alt="Nicólas Soul" loading="lazy" onerror="this.parentNode.remove()"></button>`).join('')}</section>
    ${SITE.photos.length > 6 ? `<button type="button" class="pill soft lormore" data-lore-all>${S.loreAll ? 'Show fewer photos' : 'See all ' + SITE.photos.length + ' photos'}</button>` : ''}
    <div class="lorestats">
      <div class="kpi"><b>${t.releases}</b><span>Releases</span></div><div class="kpi"><b>${t.songs}</b><span>Songs</span></div>
      <div class="kpi"><b>${t.videos}</b><span>Videos</span></div><div class="kpi"><b>${t.from}${t.toNow && t.toNow !== t.from ? '–' + t.toNow : ''}</b><span>Years</span></div></div>
    ${hi.length ? `<div class="lorehi">${hi.map(h => `<div class="hi"><span class="cs">${esc(h[0])}</span><b>${esc(h[1].name)}</b><span class="cs">${h[1].releases.size} ${h[1].releases.size === 1 ? 'release' : 'releases'}</span></div>`).join('')}</div>` : ''}
    <h2 class="sh"><span><b>Eras</b></span></h2>
    <div class="loreeras" role="list">${L.eras.map(e => { const c = /^#[0-9a-f]{6}$/i.test(e.r.world_color || '') ? e.r.world_color : '', nv = Object.values(e.vcount).reduce((a, b) => a + b, 0);
      return `<button type="button" role="listitem" class="loreera" data-rel="${esc(e.r.release_id)}"><span class="lc"${c ? ` style="background:${c}"` : ''}><img data-lcover="${esc(e.r.cover_file_id || '')}" alt="" loading="lazy"></span>
        <b>${esc(e.r.title)}</b><span class="cs">${esc([e.r.year, isUnrel(e.r) ? 'Unreleased' : '', typeOf(e.r)].filter(Boolean).join(' · '))}</span>
        <span class="cs">${e.songs} ${e.songs === 1 ? 'song' : 'songs'}${fmtRuntime(e.runtime) ? ' · ' + esc(fmtRuntime(e.runtime)) : ''}</span>
        ${e.r.recorded_at ? `<span class="cs">${esc(e.r.recorded_at)}</span>` : ''}${e.ages.made ? `<span class="agechip">made at ${esc(e.ages.made)}</span>` : ''}
        ${nv || e.photos ? `<span class="cs">${[nv ? nv + (nv === 1 ? ' video' : ' videos') : '', e.photos ? e.photos + (e.photos === 1 ? ' photo' : ' photos') : ''].filter(Boolean).join(' · ')}</span>` : ''}</button>`; }).join('')}</div>
    ${phRels.length ? `<h2 class="sh"><span><b>Photos</b> from every release</span></h2>
    <div class="loreeras" role="list">${phRels.map(x => `<button type="button" role="listitem" class="loreera" data-lore-phrel="${esc(x.r.release_id)}"><span class="lc"><img data-ss-src="${esc(x.ph[0].file_id)}" alt="" loading="lazy"></span><b>${esc(x.r.title)}</b><span class="cs">${x.ph.length} ${x.ph.length === 1 ? 'photo' : 'photos'}</span></button>`).join('')}</div>` : ''}
    <h2 class="sh"><span><b>The people</b> behind it</span></h2>
    <label class="lorecatsel"><span class="sr-only">Credits</span><select class="field" data-lcatsel aria-label="Credits">${cats.map(c => `<option value="${c[0]}"${c[0] === cat ? ' selected' : ''}>${esc(c[1])} (${c[2].size})</option>`).join('')}</select></label>
    <div id="lorePeople"></div>
  </div>`;
  $$('[data-lphoto]').forEach(b => b.addEventListener('click', () => openLorePhoto(+b.dataset.lphoto)));
  const more = $('[data-lore-all]'); if (more) more.addEventListener('click', () => { S.loreAll = !S.loreAll; $('.lorephotos').classList.toggle('all', S.loreAll); more.textContent = S.loreAll ? 'Show fewer photos' : 'See all ' + SITE.photos.length + ' photos'; });
  $$('[data-lcover]').forEach(img => setCover(img, img.dataset.lcover));
  $$('[data-lore-phrel]').forEach(b => { ssThumb(b.querySelector('img')); b.addEventListener('click', () => { S.releaseId = b.dataset.lorePhrel; openSlideshow(0); }); });
  // The people: one list at a time as name chips; tap a name to see which releases they are on.
  const drawPeople = () => {
    const c = cats.find(x => x[0] === cat), all = [...c[2].values()].sort((x, y) => y.releases.size - x.releases.size || x.name.localeCompare(y.name));
    const rows = S.lorePeopleAll || all.length <= 20 ? all : all.slice(0, 18);
    $('#lorePeople').innerHTML = rows.length ? `<div class="lchips">${rows.map((e, i) => `<button type="button" class="lchip" data-lperson="${i}" aria-expanded="false">${esc(e.name)}${e.releases.size > 1 ? `<i>${e.releases.size}</i>` : ''}</button>`).join('')}</div><div class="lpdetail" id="lpDetail" hidden></div>${all.length > rows.length ? `<button type="button" class="pill soft" data-lpall>Show all ${all.length}</button>` : ''}` : `<p class="cs">No ${esc(c[3])} in the credits yet.</p>`;
    const lpAll = $('[data-lpall]'); if (lpAll) lpAll.addEventListener('click', () => { S.lorePeopleAll = true; drawPeople(); });
    $$('#lorePeople [data-lperson]').forEach(b => b.addEventListener('click', () => {
      const e = rows[+b.dataset.lperson], d = $('#lpDetail'), open = b.getAttribute('aria-expanded') === 'true';
      $$('#lorePeople [data-lperson]').forEach(x => x.setAttribute('aria-expanded', 'false'));
      if (open) { d.hidden = true; return; }
      b.setAttribute('aria-expanded', 'true'); d.hidden = false;
      d.innerHTML = `<b>${linkName(e.name)}</b><div class="lprel">${[...e.releases].map(tt => { const er = L.eras.find(x => x.r.title === tt); return er ? `<button type="button" class="linkish" data-rel="${esc(er.r.release_id)}">${esc(tt)}</button>` : `<span>${esc(tt)}</span>`; }).join('')}</div>`;
      d.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }));
  };
  const catSel = $('[data-lcatsel]'); if (catSel) catSel.addEventListener('change', () => { cat = catSel.value; S.loreCat = cat; S.lorePeopleAll = false; drawPeople(); });
  drawPeople();
  window.scrollTo(0, 0);
}
// Lore photo viewer: full screen; rotate, download, next/previous. (Pinch to zoom works as on any page.)
function openLorePhoto(i) {
  const list = [...$$('[data-lphoto] img')].map(x => x.getAttribute('src')).filter(Boolean);
  if (!list.length) return;
  let at = Math.max(0, Math.min(i, list.length - 1)), rot = 0;
  const m = $('#modal'); m.className = 'modal lbmodal';
  m.innerHTML = `<div class="lbview" role="dialog" aria-modal="true" aria-label="Photo viewer">
    <div class="lbtop"><span class="cs" id="lbCount"></span><span class="acts">
      <button class="ib" id="lbRot" aria-label="Rotate the photo">↻</button>
      <a class="ib" id="lbDl" download aria-label="Download the photo">⬇</a>
      <button class="ib" id="lbX" aria-label="Close">${I.x}</button></span></div>
    <div class="lbstage" id="lbStage"><img id="lbImg" alt="Nicólas Soul">
      <button class="ssnav prev" id="lbPrev" aria-label="Previous photo">${I.back}</button><button class="ssnav next" id="lbNext" aria-label="Next photo">${I.back}</button></div></div>`;
  m.hidden = false;
  const img = $('#lbImg'), stage = $('#lbStage');
  const fit = () => {
    const odd = rot % 180 !== 0, w = stage.clientWidth, h = stage.clientHeight;
    img.style.maxWidth = (odd ? h : w) + 'px'; img.style.maxHeight = (odd ? w : h) + 'px';
    img.style.transform = 'rotate(' + rot + 'deg)';
  };
  const show = n => {
    at = (n + list.length) % list.length; rot = 0; img.src = list[at]; fit();
    $('#lbCount').textContent = (at + 1) + ' of ' + list.length;
    const dl = $('#lbDl'); dl.href = list[at]; dl.setAttribute('download', 'nicolas-soul-' + String(at + 1).padStart(2, '0') + '.jpg');
  };
  $('#lbRot').addEventListener('click', () => { rot = (rot + 90) % 360; fit(); });
  $('#lbX').addEventListener('click', closeModal);
  $('#lbPrev').addEventListener('click', () => show(at - 1)); $('#lbNext').addEventListener('click', () => show(at + 1));
  stage.addEventListener('click', e => { if (e.target === stage) closeModal(); });
  show(at);
}
function loreText() {
  const L = buildLore(), t = L.totals, lines = [];
  lines.push('NICÓLAS SOUL: LORE', '', (S.lib.artist_bio || '').trim(), '', `${t.releases} releases · ${t.songs} songs · ${t.videos} videos · ${t.from}–${t.to}`);
  if (t.names.length > 1) lines.push('Names: ' + t.names.join(' → '));
  lines.push('', 'ERAS');
  L.eras.forEach(e => lines.push(`${e.r.year} · ${e.r.title} (${typeOf(e.r)})${isHomeName(e.as) ? '' : ' as ' + e.as}` +
    (e.r.recorded_at ? ` · recorded in ${e.r.recorded_at}` : '') + (e.prod.length ? ` · produced by ${e.prod.join(', ')}` : '') +
    (Object.keys(e.vcount).length ? ` · ${vcText(e.vcount)}` : '')));
  const sec = (title, map) => { const rows = [...map.values()]; if (rows.length) { lines.push('', title); rows.forEach(r => lines.push(`${r.name}: ${[...r.releases].join(', ')}`)); } };
  sec('PRODUCERS', L.idx.producers); sec('ENGINEERS', L.idx.engineers); sec('FEATURES', L.idx.features); sec('LOCATIONS', L.idx.places); sec('PHOTOGRAPHERS', L.idx.photographers);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}


/* ═════════ Build 49: songs from YouTube + the audio theater ═════════ */
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  /* ── house: darkened edges like a theater ── */
  /* the vignette sits behind all content (body is its own layer), so nothing needs repositioning */
  body { isolation: isolate; }
  body::before { content: ''; position: fixed; inset: 0; pointer-events: none; z-index: -1;
    background: radial-gradient(ellipse 120% 90% at 50% 30%, transparent 55%, rgba(0,0,0,.55) 100%); }
  body.house-dim::before { background: radial-gradient(ellipse 110% 85% at 50% 30%, transparent 45%, rgba(0,0,0,.72) 100%); transition: background 1.2s; }
  /* ── stage light on the release hero ── */
  .relhead { position: relative; overflow: hidden; }
  .relhead::after { content: ''; position: absolute; left: 50%; top: -30%; width: 140%; height: 140%; transform: translateX(-50%); pointer-events: none;
    background: radial-gradient(ellipse 35% 55% at 50% 0%, rgba(255,236,196,.16), transparent 70%); mix-blend-mode: screen; }
  /* ── curtains part when a release opens ── */
  .curtain { position: fixed; inset: 0; z-index: 80; pointer-events: none; display: flex; }
  .curtain i { flex: 1; background:
      repeating-linear-gradient(90deg, rgba(0,0,0,.28) 0 6px, transparent 6px 26px, rgba(255,255,255,.05) 26px 30px, transparent 30px 44px),
      linear-gradient(180deg, #7a0c1e, #4a0612 60%, #2a030a); box-shadow: inset 0 -40px 60px rgba(0,0,0,.5); }
  .curtain i:first-child { animation: curtL 1.05s cubic-bezier(.7,0,.25,1) .12s forwards; transform-origin: left; }
  .curtain i:last-child  { animation: curtR 1.05s cubic-bezier(.7,0,.25,1) .12s forwards; transform-origin: right; }
  .curtain::after { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 48px; background: linear-gradient(180deg, #5a0915, #3a0510);
    box-shadow: 0 6px 18px rgba(0,0,0,.6); animation: valance 1.2s ease .4s forwards; }
  @keyframes curtL { to { transform: translateX(-102%) skewY(-2deg); } }
  @keyframes curtR { to { transform: translateX(102%) skewY(2deg); } }
  @keyframes valance { to { transform: translateY(-100%); } }
  /* ── now playing is the stage ── */
  #np .npmedia { position: relative; }
  #np .npmedia::before { content: ''; position: absolute; left: 50%; top: -60px; width: 120%; height: calc(100% + 60px); transform: translateX(-50%); pointer-events: none; z-index: 0;
    background: conic-gradient(from 180deg at 50% 0%, transparent 150deg, rgba(255,232,190,.14) 172deg, rgba(255,232,190,.2) 180deg, rgba(255,232,190,.14) 188deg, transparent 210deg); filter: blur(6px); }
  #np .npmedia::after { content: ''; position: absolute; left: 8%; right: 8%; bottom: -14px; height: 22px; pointer-events: none; z-index: 0;
    background: radial-gradient(ellipse at center, rgba(255,210,150,.28), transparent 70%); filter: blur(4px); }
  #np .npmedia > * { position: relative; z-index: 1; }
  /* ── marquee touches ── */
  .marquee { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 6px; font-size: 11px; font-weight: 900; letter-spacing: .16em;
    text-transform: uppercase; color: #1a1205; background: linear-gradient(180deg, #F6D77A, #C9A227); box-shadow: 0 0 0 2px rgba(0,0,0,.35), 0 0 14px rgba(201,162,39,.45); }
  .slide .marquee { position: absolute; top: 14px; right: 14px; z-index: 2; }
  .ytadd { margin-top: 6px; padding-top: 12px; border-top: 1px solid var(--line); display: grid; gap: 8px; }
  @media (prefers-reduced-motion: reduce) { .curtain { display: none; } body.house-dim::before { transition: none; } }
` }));

/* ── curtains: once per release you open (not on every redraw) ── */
function raiseCurtain(id) {
  if (S.curtainFor === id || matchMedia('(prefers-reduced-motion: reduce)').matches) { S.curtainFor = id; return; }
  S.curtainFor = id;
  const c = document.createElement('div'); c.className = 'curtain'; c.setAttribute('aria-hidden', 'true'); c.innerHTML = '<i></i><i></i>';
  document.body.appendChild(c); setTimeout(() => c.remove(), 1500);
}
audio.addEventListener('playing', () => document.body.classList.add('house-dim'));
audio.addEventListener('pause', () => { if (!S.ytSong) document.body.classList.remove('house-dim'); });

/* ── songs that play from YouTube (no audio file) ── */
const isScSong = v => !!v && v.format === 'SOUNDCLOUD' && !v.audio && !v.preview;   // plays in SoundCloud's own player
const isYtSong = v => !!v && !v.audio && !v.preview && !isScSong(v);
// Listen to the YouTube player so a YouTube song can move on when it ends, and play/pause from the mini player.
window.addEventListener('message', e => {
  if (!/youtube(-nocookie)?\.com$/.test((() => { try { return new URL(e.origin).hostname; } catch (x) { return ''; } })())) return;
  let d; try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (x) { return; }
  if (!d || !S.ytSong) return;
  const st = d.event === 'onStateChange' ? d.info : d.info && d.info.playerState;
  if (st === 1) { S.ytPlaying = true; setToggle(true); document.body.classList.add('house-dim'); }
  else if (st === 2) { S.ytPlaying = false; setToggle(false); document.body.classList.remove('house-dim'); }
  else if (st === 0) { S.ytPlaying = false; step(1); }
});
function ytCommand(func) {
  const f = $('#npVid iframe'); if (!f) return;
  f.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*');
}
function ytHello() {
  const f = $('#npVid iframe'); if (!f) return;
  const hello = () => { try { f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'np', channel: 'widget' }), '*'); } catch (x) {} };
  f.addEventListener('load', () => { hello(); setTimeout(hello, 800); });
}
async function addScSong(relId, btn) {
  const url = (($('#uSc') || {}).value || '').trim(), er = $('#uErr');
  if (!/^https:\/\/(www\.|m\.)?soundcloud\.com\/[^/]+\/[^/?#]+/i.test(url)) { er.hidden = false; er.textContent = "Paste the link to one song from SoundCloud (open the song, tap Share, then Copy link)."; return; }
  btn.disabled = true; btn.textContent = 'Adding…'; er.hidden = true;
  try {
    const o = await run('addSoundcloudSong', BOOT.key, { releaseId: relId, url, title: ($('#uTitle') || {}).value || '' });
    S.lib.tracks.push(o.track); S.lib.versions.push(o.version);
    closeModal(); renderRelease(relId); toast(`Added "${o.track.title}" from SoundCloud. Tip: add the audio file too (Settings, Songs on links only).`);
  } catch (e) { btn.disabled = false; btn.innerHTML = I.play + 'Add from SoundCloud'; er.hidden = false; er.textContent = e.message || 'Could not add it.'; }
}
// A SoundCloud song: SoundCloud's own player fills the Now Playing picture area (SoundCloud does not give out audio files). It keeps going when Now Playing is closed, until another song starts.
function showSc(t) {
  const box = $('#npVid');
  box.innerHTML = `<iframe src="https://w.soundcloud.com/player/?url=${encodeURIComponent(t.sc_url)}&auto_play=true&visual=true&hide_related=true&show_comments=false&show_user=true" title="SoundCloud: ${esc(t.title)}" allow="autoplay" loading="eager"></iframe>`;
  box.dataset.vid = ''; box.hidden = false; $('#npArt').hidden = true; $('#npMode').hidden = true;
}
function clearSc() {
  if (!S.scSong) return;
  S.scSong = false; const box = $('#npVid'); box.innerHTML = ''; box.hidden = true; $('#npArt').hidden = false;
}
function openSoundcloudRelease() {
  $('#modal').innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mTitle"><h2 id="mTitle">New release from SoundCloud</h2>
    <p class="cs">Paste the link to one song (on SoundCloud: open the song, tap Share, then Copy link). It plays in SoundCloud's player and SoundCloud's picture becomes the cover. It stays hidden from fans until you show it. Afterwards, add the audio file too (Settings, Songs on links only) so it can't disappear if the link is taken down.</p>
    <label>SoundCloud link<input class="field" id="srUrl" type="url" inputmode="url" placeholder="https://soundcloud.com/artist/song" maxlength="1000"></label>
    <label>Title (optional: SoundCloud's title is used)<input class="field" id="srTitle" maxlength="120"></label>
    <div class="nrrow"><label>Type<select class="field" id="srType">${REL_TYPES.map(t => `<option${t === 'Single' ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Year<input class="field" id="srYear" type="number" inputmode="numeric" min="1990" max="2100" value="${new Date().getFullYear()}"></label></div>
    <p class="err" id="srErr" hidden></p>
    <div class="end"><button class="pill soft" data-close>Cancel</button><button class="pill main" data-scr-go>Create release</button></div></div>`;
  $('#modal').hidden = false; $('#srUrl').focus();
}
async function createFromSoundcloud(btn) {
  const url = $('#srUrl').value.trim(), err = $('#srErr');
  if (!/^https:\/\/(www\.|m\.)?soundcloud\.com\/[^/]+\/[^/?#]+/i.test(url)) { err.hidden = false; err.textContent = 'Paste the link to one song from SoundCloud (open the song, tap Share, then Copy link).'; return; }
  btn.disabled = true; btn.textContent = 'Creating…'; err.hidden = true;
  try {
    const out = await run('createReleaseFromSoundcloud', BOOT.key, { url, title: $('#srTitle').value.trim(), type: $('#srType').value, year: $('#srYear').value });
    const add = normalizeLib({ releases: [out.release], tracks: out.tracks, versions: out.versions, extras: [] });
    S.lib.releases.push(...add.releases); S.lib.tracks.push(...add.tracks); S.lib.versions.push(...add.versions);
    primeThumbs(); libCacheSet(S.lib); closeModal(); renderRelease(out.release.release_id);
    toast(`Created “${out.release.title}”. It's hidden from fans until you show it. Add the audio file under Settings, Songs on links only.`);
  } catch (e) { btn.disabled = false; btn.textContent = 'Create release'; err.hidden = false; err.textContent = e.message || 'Could not create it.'; }
}
// Songs that only exist as a YouTube or SoundCloud link: if the link is taken down, the song is gone. Settings > Songs on links only lists them so you can add the audio file.
const linkOnlySongs = () => {
  const by = {}; S.lib.versions.forEach(v => (by[v.track_id] = by[v.track_id] || []).push(v));
  return S.lib.tracks.filter(t => { const vs = (by[t.track_id] || []).filter(v => !v.hidden); return vs.length && vs.every(v => !v.audio && !v.preview && (v.format === 'YOUTUBE' || v.format === 'SOUNDCLOUD')); });
};
function openLinkOnly() {
  const m = $('#modal'); m.className = 'modal';
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Songs on links only"><h2>Songs on links only</h2><p class="cs" id="loSt"></p>
    <div id="loList" class="mslistbox"></div><input type="file" id="loFile" accept="audio/*,.wav,.aif,.aiff,.flac,.mp3,.m4a,.aac,.ogg" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">
    <div class="end"><button class="pill soft" data-close>Close</button></div></div>`;
  m.hidden = false;
  let pickFor = null;
  const draw = () => {
    const ts = linkOnlySongs(), rl = id => S.lib.releases.find(r => r.release_id === id) || {};
    $('#loSt').textContent = ts.length ? `${ts.length} ${ts.length === 1 ? 'song plays' : 'songs play'} only through a YouTube or SoundCloud link. If a link is taken down, that song disappears. Tap Add file and pick the audio (a WAV, MP3 or M4A); the link keeps working as the video.` : 'Every song has its own audio file. Nothing depends on a link.';
    const by = {}; ts.forEach(t => (by[rl(t.release_id).title || ''] = by[rl(t.release_id).title || ''] || []).push(t));
    $('#loList').innerHTML = Object.keys(by).map(r => `<div><b>${esc(r)}</b>${by[r].map(t => { const v = S.lib.versions.find(x => x.track_id === t.track_id && !x.hidden);
      return `<div class="msrow" data-lo="${esc(t.track_id)}"><div><span>${esc(t.title)}</span> <span class="cs">· ${v && v.format === 'SOUNDCLOUD' ? 'SoundCloud' : 'YouTube'}</span></div>
        <div class="cs msst" role="status"></div><div class="msbar" hidden style="height:4px;border-radius:4px;background:var(--raise);overflow:hidden"><i style="display:block;height:100%;width:0;background:var(--red)"></i></div>
        <div class="msbtns"><button class="pill main" data-lo-up="${esc(t.track_id)}">Add file</button></div></div>`; }).join('')}</div>`).join('');
  };
  draw();
  m.addEventListener('click', e => { const b = e.target.closest('[data-lo-up]'); if (b) { pickFor = b.dataset.loUp; $('#loFile').value = ''; $('#loFile').click(); } });
  $('#loFile').addEventListener('change', async e => {
    const f = e.target.files[0], tid = pickFor; if (!f || !tid) return;
    const row = [...$$('#loList [data-lo]')].find(x => x.dataset.lo === tid), t = S.lib.tracks.find(x => x.track_id === tid); if (!row || !t) return;
    const st = row.querySelector('.msst'), bar = row.querySelector('.msbar'), fill = bar.firstElementChild; bar.hidden = false;
    row.querySelectorAll('button').forEach(b => (b.disabled = true));
    try {
      const out = await uploadSongToEdge(f, t.release_id, tid, t.title, 'Original', true, x => (st.textContent = x), p => (fill.style.width = Math.round(p * 100) + '%'));
      S.lib.versions.forEach(v => { if (v.track_id === tid) v.is_primary = false; });
      S.lib.versions.push(Object.assign({}, out.version, { is_primary: true })); libCacheSet(S.lib);
      toast('Saved. “' + t.title + '” now has its own file.'); draw();
    } catch (er) { st.textContent = (er && er.message) || 'The upload did not finish.'; row.querySelectorAll('button').forEach(b => (b.disabled = false)); bar.hidden = true; }
  });
}
async function addYtSong(relId, btn) {
  const url = ($('#uYt') || {}).value || '';
  if (!ytId(url)) { const er = $('#uErr'); er.hidden = false; er.textContent = "That doesn't look like a YouTube video link."; return; }
  btn.disabled = true; btn.textContent = 'Adding…';
  try {
    const o = await run('addYoutubeSong', BOOT.key, { releaseId: relId, url: url.trim(), title: ($('#uTitle') || {}).value || '' });
    S.lib.tracks.push(o.track); S.lib.versions.push(o.version);
    closeModal(); renderRelease(relId); toast(`Added "${o.track.title}" from YouTube. Tip: add the audio file too (Settings, Songs on links only).`);
  } catch (e) { btn.disabled = false; btn.textContent = 'Add from YouTube'; const er = $('#uErr'); er.hidden = false; er.textContent = e.message || 'Could not add it.'; }
}


/* ═════════ Build 50: playlists, more photo types, album link in now playing ═════════ */
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  .nprel { color: inherit; font: inherit; text-decoration: underline; text-decoration-color: rgba(255,255,255,.35); text-underline-offset: 3px; padding: 0; background: none; }
  .nprel:hover { color: #fff; text-decoration-color: var(--green-hi); }
  #pagebg::after { background: linear-gradient(180deg,
      rgba(8,8,9,calc(var(--bgd,.72) * .42 + max(0, var(--bgd,.72) - .72) * 2.1)) 0%,
      rgba(8,8,9,calc(var(--bgd,.72) * .7 + max(0, var(--bgd,.72) - .72) * 1.1)) 35%,
      rgba(8,8,9,var(--bgd,.72)) 100%) !important; }
  .plcard { flex: 0 0 200px; display: grid; gap: 8px; text-align: left; padding: 10px; border-radius: 18px; border: 1px solid var(--line); background: rgba(255,255,255,.03); scroll-snap-align: start; }
  .plcard:hover { background: rgba(255,255,255,.06); }
  .mosaic { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; aspect-ratio: 1; border-radius: 12px; overflow: hidden; background: rgba(255,255,255,.06); }
  .mosaic.one { grid-template-columns: 1fr; }
  .mosaic .art { width: 100%; height: 100%; aspect-ratio: auto; border-radius: 0; object-fit: cover; }
  .plcard .nm { font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .plcard.new { place-content: center; justify-items: center; min-height: 200px; border-style: dashed; color: var(--dim); font-weight: 800; }
  .plhead { display: grid; grid-template-columns: 200px minmax(0,1fr); gap: 22px; align-items: end; padding: 12px 0 18px; }
  .plhead .mosaic { width: 200px; box-shadow: 0 24px 50px -20px #000; }
  .plhead h1 { margin: 4px 0; font: 800 clamp(26px, 5vw, 44px)/1.05 var(--serif); }
  .plhead .kick { font-size: 12px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: var(--dim); }
  .plhead .acts { margin-top: 14px; }
  .pledit { display: grid; gap: 12px; margin: 6px 0 16px; }
  .pledit label { display: grid; gap: 6px; font-size: 13px; font-weight: 600; color: var(--dim); }
  .pledit .field { background: var(--raise); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; color: var(--text); font: inherit; font-weight: 400; }
  .pledit .row2 { display: flex; gap: 10px; align-items: center; }
  .pledit .row2 input { width: 18px; height: 18px; accent-color: var(--brass); }
  .plrow { display: grid; grid-template-columns: 44px minmax(0,1fr) auto auto; gap: 10px; align-items: center; padding: 8px 4px; border-top: 1px solid var(--line); list-style: none; }
  .plrow .art { width: 44px; height: 44px; border-radius: 8px; }
  .plrow .t { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pllist { margin: 0; padding: 0; }
  .plpick { list-style: none; margin: 10px 0; padding: 0; display: grid; gap: 6px; }
  .plpick button { width: 100%; display: flex; justify-content: space-between; gap: 10px; padding: 12px; border-radius: 12px; background: rgba(255,255,255,.04); font-weight: 700; text-align: left; }
  .plpick button[disabled] { opacity: .55; }
  .plnew { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px; }
  @media (min-width: 0px) { .plhead { grid-template-columns: 1fr; justify-items: center; text-align: center; } .plhead .mosaic { width: min(220px, 62vw); } .plcard { flex-basis: 44%; } }
` }));


// Settings > Your bio: the bio editor used to sit in the middle of the Lore page; fans read the bio, only you edit it.
function openBio() {
  const m = $('#modal'); m.className = 'modal';
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Your bio"><h2>Your bio</h2>
    <p class="cs">Fans on the fan club link can read this bio and the whole Lore page.</p>
    <textarea class="field" id="loreBio" maxlength="8000" rows="10" placeholder="Write the story: where you're from, how the sound started, the eras, what's next.">${esc(S.lib.artist_bio || '')}</textarea>
    <div class="end"><button class="pill soft" data-lore-copy>Copy all lore as text</button><button class="pill main" data-lore-bio>Save bio</button></div>
    <div class="end"><button class="pill soft" data-close>Close</button></div></div>`;
  m.hidden = false; $('#loreBio').focus();
}
