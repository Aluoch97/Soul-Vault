/* ── library ── */
// The top of the Music and Lore pages: the greeting and Soul Vault name, and for the owner the new-release, share-links and Settings buttons.
function homeHeader() {
  return `<header class="home-h">
        <div><div class="hello">${OWNER ? 'Karibu tena' : 'Karibu, ' + esc((S.share && S.share.fan_name) || 'family')}</div><div class="brand">Soul <span>Vault</span></div></div>
        <div class="hbtns">
          ${OWNER ? `<button class="round" data-newrel aria-label="New release">${I.plus}</button>
                     <button class="round" data-nav="shares" aria-label="Share links">${I.link}</button>
                     <button class="avatar" data-nav="vault" aria-label="Settings">NS</button>`
                  : ''}
        </div>
      </header>`;
}
function renderLibrary(keepScroll) {
  clearPageBg();
  S.view = 'library'; renderChrome();
  const types = TYPE_FILTERS;
  $('#main').innerHTML = `
    <div class="wrap">
      ${homeHeader()}
      <label class="search big">${I.search}<input id="q" type="search" placeholder="Search songs and releases" value="${esc(S.q)}" aria-label="Search songs and releases"></label>
      <div id="libBody"></div>
    </div>`;
  $('#libBody').dataset.types = JSON.stringify(types);
  $('#q').addEventListener('input', e => { S.q = e.target.value; renderLibBody(); });
  renderLibBody();
  window.scrollTo(0, keepScroll ? S.libScroll : 0);
}

/* ── Listen links under each release header, and slowed + reverb videos: both come from /links.json ──
   { "releases": { "<release_id>": { "first": "DatPiff", "links": [["Spotify", "https://..."], ["Apple Music", "https://..."]] } },
     "sr": { "<track_id>": "<YouTube link or id>" } }   (edited by hand in public/links.json) */
// Links per release: Studio's entry wins, but where Studio has no links for a release (only "first appeared on", say) the links from /links.json still show.
function mergeRelLinks(fb, ov) {
  const out = Object.assign({}, fb || {});
  Object.keys(ov || {}).forEach(id => {
    const o = ov[id] || {}, f = (fb || {})[id] || {};
    out[id] = Object.assign({}, f, o);
    if (!(Array.isArray(o.links) && o.links.length) && Array.isArray(f.links)) out[id].links = f.links;
  });
  return out;
}
function loadLinks() {
  if (S.linksP) return S.linksP;
  // The owner reads the Studio extras from the edge; everyone else gets them with the library (lib.overlay), or from the small /links.json file as a fallback.
  // The small /links.json file holds links found by hand (Apple Music, Spotify...). A release that Studio has its own links for wins; every other release keeps the file's links.
  const fileP = fetch('/links.json').then(r => (r.ok ? r.json() : {})).catch(() => ({}));
  S.linksP = Promise.all([OWNER ? run('getOverlay').catch(() => ({})) : Promise.resolve(null), fileP]).then(([ov, fb]) => {
    fb = (fb && typeof fb === 'object') ? fb : {};
    const base = OWNER ? (ov && typeof ov === 'object' ? ov : {}) : (S.links || {});
    S.links = Object.assign({}, fb, base);
    S.links.releases = mergeRelLinks(fb.releases, base.releases);
    S.links.sr = Object.assign({}, fb.sr || {}, base.sr || {});
    applyFlags(S.lib);
    const el = $('#listenRow'); if (el && S.releaseId) el.innerHTML = listenRow(rel(S.releaseId)); const fr = $('#firstRow'); if (fr && S.releaseId) fr.innerHTML = firstRow(rel(S.releaseId));
    if (S.now) syncVideo();
    return S.links;
  });
  return S.linksP;
}
// Unreleased flags saved in Studio (kept on Cloudflare) win over the Sheet's.
function applyFlags(lib) {
  const f = S.links && S.links.flags; if (!f || !lib) return;
  (lib.releases || []).forEach(r => { if (f.releases && r.release_id in f.releases) r.unreleased = !!f.releases[r.release_id]; });
  (lib.tracks || []).forEach(t => { if (f.tracks && t.track_id in f.tracks) t.unreleased = !!f.tracks[t.track_id]; });
}
function firstRow(r) {
  const e = r && S.links && S.links.releases && S.links.releases[r.release_id];
  if (!e || !e.first) return '';
  return `<div class="recorded">${I.disc}<span>First ${String(typeOf(r) || '').toLowerCase() === 'single' ? 'released' : 'appeared'} on ${esc(e.first)}</span></div>`;
}
function listenRow(r) {
  const e = r && S.links && S.links.releases && S.links.releases[r.release_id];
  const links = e && Array.isArray(e.links) ? e.links.filter(l => Array.isArray(l) && l[0] && /^https?:\/\//i.test(String(l[1] || ''))) : [];
  if (!links.length) return '';
  return `<section class="listenrow" aria-label="Listen on streaming services"><span class="lrchips">${links.map(l => `<a class="lrchip" href="${esc(l[1])}" target="_blank" rel="noopener" title="${esc(l[0])}" aria-label="Listen on ${esc(l[0])}">${BRAND[l[0]] ? `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="${BRAND[l[0]]}"/></svg>` : I.link}</a>`).join('')}</span></section>`;
}
function shelfOrder(rs) {
  const key = r => (/^\d{4}-\d{2}-\d{2}/.test(String(r.release_date || '')) ? String(r.release_date).slice(0, 10) : String(r.year || 0) + '-00-00');
  return rs.slice().sort((a, b) => key(b).localeCompare(key(a)) || String(a.title).localeCompare(String(b.title)));
}
// The View menu on the Music tab: how the releases are laid out.
const VSVG = {
  scroll: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="5" width="10" height="14" rx="2"/><path d="M3 12h1M20 12h1"/></svg>',
  large: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>',
  small: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>'
};
const VIEWS = [['scroll', 'Scrolling shelf'], ['large', 'Large covers'], ['small', 'Small covers'], ['list', 'List']];
function viewMenu(cur, sec) {   // sec: the Unreleased / Features sections have their own View menu, kept separately
  return `<div class="viewrow"><div class="viewwrap"><button type="button" class="pill soft viewbtn" data-libmenu aria-haspopup="menu" aria-expanded="false">${VSVG.list}<span>View</span><span aria-hidden="true">&#9662;</span></button>
    <div class="viewmenu" role="menu" aria-label="View" hidden>${VIEWS.map(v => `<button type="button" role="menuitemradio" aria-checked="${v[0] === cur}" ${sec ? `data-secview="${sec}|${v[0]}"` : `data-libview="${v[0]}"`}><i class="vdot">${v[0] === cur ? '&bull;' : ''}</i>${VSVG[v[0]]}<span>${v[1]}</span></button>`).join('')}</div></div></div>`;
}
// Every release at once, in rows (newest first): large covers, small covers or a plain list.
function allGrid(rs, view) {
  if (view === 'list') return `<section class="alllist" aria-label="All releases">${rs.map(r => `<button class="alr" data-rel="${esc(r.release_id)}" aria-label="Open ${esc(r.title)}">
    <img class="art" data-cover="${esc(r.cover_file_id)}" alt=""><span class="alt"><b>${esc(r.title)}</b><span class="cs">${esc([r.year, typeOf(r), songs(tracksOf(r.release_id).filter(t => !hidden(t)).length)].filter(Boolean).join(' · '))}</span></span></button>`).join('')}</section>`;
  return `<section class="allgrid ${view === 'small' ? 'small' : 'large'}" aria-label="All releases">${rs.map(r => `<button class="agc" data-rel="${esc(r.release_id)}" aria-label="Open ${esc(r.title)}">
    <img class="art" data-cover="${esc(r.cover_file_id)}" alt=""><span class="agt">${esc(r.title)}</span><span class="cs">${esc([r.year, typeOf(r)].filter(Boolean).join(' · '))}</span></button>`).join('')}</section>`;
}
document.addEventListener('click', e => {
  const m = e.target.closest && e.target.closest('[data-libmenu]');
  if (m) { const menu = m.nextElementSibling, open = menu.hidden; menu.hidden = !open; m.setAttribute('aria-expanded', String(open)); return; }
  const sv = e.target.closest && e.target.closest('[data-secview]'), sc = e.target.closest && e.target.closest('[data-secchip]');
  if (sv) { const [id, v] = sv.dataset.secview.split('|'); secState(id).view = v; ls.set('sv_secview_' + id, v); redrawSection(id); return; }
  if (sc) { const [id, k] = sc.dataset.secchip.split('|'); secState(id).chip = k; redrawSection(id); return; }
  const o = e.target.closest && e.target.closest('[data-libview]');
  if (o) { S.libView = o.dataset.libview; ls.set('sv_libview', S.libView); renderLibBody(); return; }
  $$('.viewmenu').forEach(x => { x.hidden = true; if (x.previousElementSibling) x.previousElementSibling.setAttribute('aria-expanded', 'false'); });   // a tap anywhere else closes it
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') $$('.viewmenu').forEach(x => { x.hidden = true; }); });
// Sharing out: the phone's own share sheet when there is one (Instagram, TikTok, Messages, WhatsApp...), else a small sheet with links.
const siteBase = () => String((window.SV_BOOT && SV_BOOT.site) || location.origin).replace(/\/$/, '');
const relShareUrl = id => siteBase() + '/vault/' + relSlug(id);
async function shareOut(o) {
  try {
    if (o.file && navigator.canShare && navigator.canShare({ files: [o.file] })) { await navigator.share({ files: [o.file], title: o.title, text: o.text || o.title }); return; }
    if (navigator.share) { await navigator.share({ title: o.title, text: o.text || o.title, url: o.url }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  openSocialShare(o);
}
function openSocialShare(o) {
  const u = encodeURIComponent(o.url), t = encodeURIComponent(o.text || o.title), m = $('#modal'); m.className = 'modal';
  const link = (href, label) => `<a class="pill soft" href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Share"><h2>Share</h2><p class="cs" style="margin:0 0 10px">${esc(o.title)}</p>
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      ${link('https://wa.me/?text=' + t + '%20' + u, 'WhatsApp')}${link('https://twitter.com/intent/tweet?text=' + t + '&url=' + u, 'X')}${link('https://www.facebook.com/sharer/sharer.php?u=' + u, 'Facebook')}
      ${link('https://t.me/share/url?url=' + u + '&text=' + t, 'Telegram')}${link('mailto:?subject=' + encodeURIComponent(o.title) + '&body=' + t + '%20' + u, 'Email')}
      <button class="pill main" data-copy="${esc(o.url)}">Copy link</button></div>
    <div class="end"><button class="pill soft" data-close>Close</button></div></div>`;
  m.hidden = false;
}
document.addEventListener('click', async e => {
  const b = e.target.closest && e.target.closest('[data-share-out]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const k = b.dataset.shareOut;
  if (k === 'release') { const r = rel(S.releaseId); if (r) shareOut({ title: r.title, text: 'Listen to ' + r.title + ' by ' + relArtist(r), url: relShareUrl(r.release_id) }); }
  else if (k === 'video') shareOut({ title: b.dataset.title || 'Video', text: b.dataset.title || 'Watch', url: 'https://www.youtube.com/watch?v=' + b.dataset.vid });
  else if (k === 'photo') {
    const r = rel(S.releaseId), url = r ? relShareUrl(r.release_id) : siteBase(), o = { title: r ? r.title + ' (photo)' : 'Photo', text: r ? 'A photo from ' + r.title : 'A photo', url };
    try { const img = $('#ssImg'); if (img && img.src) { const blob = await (await fetch(img.src)).blob(); o.file = new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' }); } } catch (er) {}
    shareOut(o);
  }
}, true);
function shelf(rs) {
  if (!rs.length) return '';
  return `<section class="shelf" id="all-releases" aria-label="Releases, newest to oldest">
    <div class="shelfbar"><span class="cs" id="shelfPos" aria-live="polite">1 of ${rs.length}</span>
      <span class="arrows"><button class="round" data-shelf="-1" aria-label="Previous releases">${I.back}</button>
      <button class="round" data-shelf="1" aria-label="Next releases"><span class="flip">${I.back}</span></button></span></div>
    <div class="ctrack" id="ctrack">${rs.map((r, i) => `
      <article class="slide" data-year="${esc(r.year)}">
        <img data-shelf-cover="${esc(r.cover_file_id)}" alt="">
        <span class="tag"><i></i>${esc(typeOf(r))}</span>${isUnrel(r) ? '<span class="tag unrelt">Unreleased</span>' : ''}
        <span class="cap"><span class="yr">${esc(r.year)}</span><span class="ttl">${esc(r.title)}</span>${isHomeName(relArtist(r)) ? '' : `<span class="as">as ${esc(relArtist(r))}</span>`}${seriesTag(r)}</span>
        <button class="card slidelink" data-rel="${esc(r.release_id)}" aria-label="Open ${esc(r.title)}, ${esc(typeOf(r))}, ${esc(r.year)}"></button>
        <button class="go" data-play-rel="${esc(r.release_id)}" aria-label="Play ${esc(r.title)}">${I.play}</button>
      </article>`).join('')}</div>
  </section>`;
}
// Small covers first; full-size (or animated) art only as each card comes into view.
function wireShelf() {
  const tr = $('#ctrack'); if (!tr) return;
  const imgs = [...tr.querySelectorAll('img[data-shelf-cover]')];
  imgs.forEach(img => setCover(img, img.dataset.shelfCover, false));
  if (S.shelfObs) S.shelfObs.disconnect();
  if ('IntersectionObserver' in window) {
    S.shelfObs = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { S.shelfObs.unobserve(e.target); setCover(e.target, e.target.dataset.shelfCover, true); }
    }), { root: tr, rootMargin: '0px 60% 0px 60%' });
    imgs.forEach(i => S.shelfObs.observe(i));
  } else imgs.slice(0, 3).forEach(img => setCover(img, img.dataset.shelfCover, true));
  const step = () => (tr.firstElementChild ? tr.firstElementChild.getBoundingClientRect().width + 14 : 1);
  const pos = () => {
    const i = Math.min(imgs.length, Math.round(tr.scrollLeft / step()) + 1);
    const el = $('#shelfPos'); if (el) el.textContent = `${i} of ${imgs.length}`;
    S.shelfLeft = tr.scrollLeft;
  };
  tr.addEventListener('scroll', () => { clearTimeout(tr._t); tr._t = setTimeout(pos, 80); }, { passive: true });
  if (S.shelfLeft) { tr.scrollLeft = S.shelfLeft; pos(); }
  S.shelfStep = step;
}
function shelfGo(dir) {
  const tr = $('#ctrack'); if (!tr) return;
  const per = Math.max(1, Math.floor(tr.clientWidth / S.shelfStep()));
  tr.scrollBy({ left: dir * per * S.shelfStep(), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
function shelfYear(y) {
  const tr = $('#ctrack'), slide = tr && tr.querySelector(`.slide[data-year="${CSS.escape(String(y))}"]`);
  if (!slide) return;
  tr.scrollTo({ left: slide.offsetLeft - tr.offsetLeft, behavior: 'smooth' });
  $('#all-releases').scrollIntoView({ block: 'start' });
}
function playRelease(relId) {
  warmRelease(relId);
  const list = releaseQueue(relId);
  if (list.length) playQueue(list, 0);
}

function renderLibBody() {
  const q = S.q.trim().toLowerCase();
  const types = JSON.parse($('#libBody').dataset.types || '["All"]');
  if (TYPE_FILTERS.indexOf(S.filter) === -1) S.filter = 'All';
  let rs = S.lib.releases.filter(r => (S.filter === 'All' || typeGroup(r) === S.filter) && (OWNER || !r.locked) && (OWNER || tracksOf(r.release_id).length));
  let songHits = [];
  if (q) {
    songHits = S.lib.tracks.filter(t => (String(t.title).toLowerCase().includes(q) || String(t.genre || '').toLowerCase().includes(q)) && !hidden(t) && primaryOf(t)).slice(0, 12);
    const relHit = new Set(songHits.map(t => t.release_id));
    rs = rs.filter(r => String(r.title).toLowerCase().includes(q) || String(r.genre || '').toLowerCase().includes(q) || relHit.has(r.release_id));
  }
  rs = shelfOrder(rs);
  const lyHits = q ? lyricHits(q, songHits) : [];
  const lyList = lyHits.length ? `
    <h2 class="sh"><span><b>In the</b> lyrics</span></h2>
    <ol class="tracks">${lyHits.map(t => lyricRow(t, q)).join('')}</ol>` : '';
  const songList = songHits.length ? `
    <h2 class="sh"><span><b>Songs</b></span></h2>
    <ol class="tracks">${songHits.map(t => trackRow(t, true)).join('')}</ol>` : '';
  const chips = `<div class="seg" role="group" aria-label="Filter by type">${types.map(t => `<button data-filter="${esc(t)}" aria-pressed="${t === S.filter}">${esc(t)}</button>`).join('')}</div>`;
  const empty = `<p class="status" style="padding-left:0">${q ? `Nothing matches "${esc(S.q)}". Try part of a song or release title.` : 'Nothing matches this filter yet.'}</p>`;
  const view = S.libView = S.libView || ls.get('sv_libview', 'scroll');
  const allMode = view !== 'scroll' && !q;
  const viewBtn = q ? '' : viewMenu(view);
  $('#libBody').innerHTML = (!q ? resumeCard() : '') + chips + viewBtn + (rs.length ? (allMode ? allGrid(rs, view) : shelf(rs)) : (songList || lyList ? '' : empty)) + songList + lyList +
    (!q && !allMode ? seriesRow() + playlistsRow() + dropsRow() : '') + (!q ? unreleasedSection() + featuresSection() : '') + (!q && !allMode ? recentRow() : '') +
    (!q && !OWNER ? '<p class="cs privnote">Plays are counted per device, without names, so Nick can see which songs fans love.</p>' : '');
  loadCovers(); markPlaying();
  wireShelf();
  wireRows($('#libBody'));
  tick();
  if (!q && rs[0] && !S.warmedHome) { S.warmedHome = true; warmRelease(rs[0].release_id); }
}

/* ── release page editor (tagline, about, mood, color, album credits) ── */
function relDetailsForm(r) {
  S.vdraft = null; S.chaps = null; S.pdraft = null; S.aldraft = null; S.plattach = null;
  const nPh = extrasOf(r.release_id, 'photo').length, nAl = Object.keys(S.lib.artist_links || {}).length;
  const vids = orderedVideos(r, tracksOf(r.release_id, true));
  const chapHtml = chapEditor(), nCh = (S.chaps || []).length;
  const dl = [r.release_date ? dateLabel(r) : '', r.artist_name || '', r.recorded_at || ''].filter(Boolean).join(' · ');
  const look = [r.clean_cover_file_id ? 'Clean cover set' : '', r.bg_file_id ? 'Background set' : '', r.world_color ? 'Theme color set' : '', r.world_mood ? 'Mood: ' + r.world_mood : ''].filter(Boolean).join(' · ');
  const nCred = creditLines(r.album_credits).length;
  const setting = [typeOf(r), hidden(r) ? 'hidden from fans' : 'visible to fans', r.unlock_at ? 'sealed' : ''].filter(Boolean).join(' · ');
  return `<section id="relDetails" class="epanels reldetails" aria-label="Release settings">
    ${panel('details', 'Details', [r.world_tagline, r.genre].filter(Boolean).join(' · ') || 'Tagline, genre and the story of the release', `
    <label>Genre (comma separated)<input class="field" id="wGenre" list="genreList" maxlength="160" value="${esc(r.genre || '')}" placeholder="Alternative R&B, Heal hop"></label>${genreDatalist()}
    <label>Tagline<input class="field" id="wTag" maxlength="140" value="${esc(r.world_tagline || '')}" placeholder="One line that sets the scene"></label>
    <label>About this release<textarea class="field" id="wStory" maxlength="12000" rows="8" placeholder="The story of the era: what it's about, where you were, how it was made. Blank lines start new paragraphs.">${esc(r.world_story || '')}</textarea></label>`)}
    ${panel('dates', 'Dates & names', dl || 'Release date, project artist, where and when it was made', `
    <div class="nrrow datewhere">
      <label>Release date<input class="field" type="date" id="wDate" value="${esc(String(r.release_date || '').slice(0, 10))}"></label>
      <label>Project artist (released as)<input class="field" id="wName" maxlength="80" value="${esc(r.artist_name || '')}" placeholder="${esc(relArtist(Object.assign({}, r, { artist_name: '' })))}"></label>
      <label>Mostly recorded in<input class="field" id="wWhere" maxlength="140" value="${esc(r.recorded_at || '')}" placeholder="Nashville, TN"></label>
    </div>
    <div class="nrrow agerow">
      <label>Made from<input class="field" type="month" id="wFrom" value="${esc(r.made_from || '')}"></label>
      <label>Made until<input class="field" type="month" id="wTo" value="${esc(r.made_to || '')}"></label>
      <label>Your birthday <span class="note">(private: only used to work out your ages, never shown)</span><input class="field" type="date" id="wBirth" value="${esc(S.lib.birth_date || '')}"></label>
    </div>`)}
    ${panel('series', 'Series', r.series_name ? r.series_name + (partLabel(r) ? ' · ' + partLabel(r) : '') : 'Not part of a series', seriesFields(r))}
    ${panel('look', 'Look, covers & background', look || 'Covers, page background, theme color, mood words', `
    ${cleanCoverRow(r)}
    ${moreCoversEditor(r)}
    ${bgRow(r)}
    ${bgControls(r)}
    <label>Mood words (comma separated)<input class="field" id="wMood" maxlength="200" value="${esc(r.world_mood || '')}" placeholder="Nairobi nights, heartbreak, neon, rain"></label>
    <label>Theme color
      <span class="colorrow"><input type="color" id="wColor" value="${esc(r.world_color || '#D21034')}" aria-label="Theme color">
      <button class="pill soft" type="button" data-color-clear>Use the cover's colors</button></span></label>`)}
    ${panel('credits', 'Album credits', nCred ? nCred + (nCred === 1 ? ' credit' : ' credits') : 'Who made it', `
    <p class="cs" style="margin:0">Producer and engineer lines also appear in every song's credits. To limit one to certain songs, add numbers or titles in brackets, like <b>Produced by: Shake (1, 3-5)</b>. Features only show on songs you name.</p><label>Album credits (one per line)<textarea class="field" id="wCredits" maxlength="4000" rows="5" placeholder="Produced by: Nicólas Soul&#10;Mixed by: Shake&#10;Cover photo: NuRenaissance">${esc(r.album_credits || '')}</textarea></label>`)}
    ${vids.length ? panel('videos', 'Videos', vids.length + (vids.length === 1 ? ' video' : ' videos') + ' · order and type', `<p class="cs" style="margin:0">Drag to set the order they play in. Mark each as a music video or a short film.</p>${videoEditor(r)}`) : ''}
    ${nPh ? panel('photos', 'Photos', nPh + (nPh === 1 ? ' photo' : ' photos') + ' · covers, shoots, credits', photoEditor(r)) : ''}
    ${panel('artists', 'Artist links', nAl ? nAl + (nAl === 1 ? ' artist' : ' artists') + ' linked · all releases' : 'Make other artists\' names clickable', artistLinksEditor())}
    ${panel('playlists', 'Playlists on this page', (n => n ? n + ' shown, kept in sync' : 'None yet')(plIdsOf(r).filter(id => plOf(id)).length), plAttachEditor(r))}
    ${panel('chapters', 'Chapters', nCh ? nCh + (nCh === 1 ? ' chapter' : ' chapters') : 'No chapters yet', chapHtml)}
    ${panel('settings', 'Release settings', setting, `
    <label class="typesel">Release type <select class="field" id="relType">${EDIT_TYPES
      .map(x => `<option${x === typeOf(r) ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>
      <span class="cs">Album, Mixtape, EP and Single are the Home filters. For extras (drafts, audio notes, remixes, covers, b-sides), keep the type and set those songs to Extra in Edit.</span></label>
    <label class="row2 relhide"><input type="checkbox" id="relHidden" ${hidden(r) ? 'checked' : ''}> Hide this whole release from the fan club</label>
    <label class="row2 relhide"><input type="checkbox" id="relUnreleased" ${isUnrel(r) ? 'checked' : ''}> Mark as unreleased (shows an "Unreleased" tag)</label>
    <div class="unlockrow"><label>Seal it until (fan club sees a countdown, songs open at this time)
      <input type="datetime-local" id="relUnlock" value="${esc(localInput(r.unlock_at))}"></label>
      <button class="pill soft" type="button" data-unlock-clear>No seal</button></div>
    ${bsidesPicker(r)}
    <div class="dangerzone"><h3>Delete this release</h3><p class="cs" style="margin:0">Removes the release, all its songs, versions, comments, photos and videos, and every share link for it. A backup of your Sheet is saved first.</p>
      <button class="pill soft danger" type="button" data-del-release>${I.trash}Delete this release…</button></div>`)}
  </section>`;
}
function readDetails() {
  const c = $('#wColor'); if (!c) return null;
  return { world_tagline: $('#wTag').value, world_mood: $('#wMood').value, world_story: $('#wStory').value,
           album_credits: $('#wCredits').value, world_color: c.dataset.cleared ? '' : c.value.toUpperCase(),
           release_date: $('#wDate').value, recorded_at: $('#wWhere').value, artist_name: $('#wName').value,
           made_from: $('#wFrom').value, made_to: $('#wTo').value, birth_date: $('#wBirth').value,
           series_name: $('#wSeries').value, series_part: $('#wPart').value,
           ...(S.vdraft ? { videos_meta: videosMetaDraft() } : {}),
           ...(S.bgDraft && rel(S.releaseId).bg_file_id ? { bg_style: JSON.stringify(S.bgDraft) } : {}),
           ...(S.pdraft ? { photos_meta: photosMetaDraft() } : {}),
           genre: $('#wGenre').value, ...($('#wBsides') && !$('#wBsides').disabled ? { bsides_of: $('#wBsides').value } : {}), ...(S.plattach ? { playlist_ids: S.plattach } : {}), ...($('#relUnreleased') ? { unreleased: $('#relUnreleased').checked } : {}) };
}
// Every "edit the description" entry point opens Edit and jumps to the details.
function editDetails() {
  S.editing = true; renderRelease(S.releaseId);
  const pd = $('[data-panel="details"]'); if (pd) pd.open = true;
  const d = $('#relDetails'); if (d) { d.scrollIntoView({ block: 'start' }); const f = $('#wStory'); if (f) f.focus({ preventScroll: true }); }
}

