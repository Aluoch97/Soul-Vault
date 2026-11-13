/* ── boot ── */
async function init() {
  window.SV_STARTED = true;
  loadLinks();   // listen links + slowed/reverb videos (a small file, read in the background)
  $$('[data-ctl="prev"]').forEach(b => b.innerHTML = I.prev);
  $$('[data-ctl="next"]').forEach(b => b.innerHTML = I.next);
  $$('[data-ctl="close"]').forEach(b => b.innerHTML = I.down);
  setToggle(false);
  watchStall();
  setRobots(parseRoute().unknown);
  if (/^\/admin\/?$/.test(location.pathname)) { if (OWNER) { history.replaceState(null, '', '/vault'); } else { renderAdminLogin(); return; } }
  if (BOOT.pub && BOOT.home && (BOOT.home.single || BOOT.home.project)) { S.homeLite = BOOT.home; primeHomeCover(BOOT.home.single); primeHomeCover(BOOT.home.project); }   // covers saved with the site: Home can draw them before anything is fetched
  try {
    if (BOOT.token) {
      const cached = libCacheGet();
      const show = d => { if (CLUB()) { document.body.classList.add('club-mode'); const r1 = parseRoute();
                            if ((r1.v === 'tour' || r1.v === 'press' || r1.v === 'video') && S.view === r1.v && $('#main .tourpg, #main .presspg, #main .videopg')) renderChrome(true);   // already on screen (drawn before the data came): do not reload it
                            else routeTo(r1); }
                          else { document.body.classList.add('share-mode'); renderRelease(d.releases[0].release_id); } };
      if (cached && cached.releases && cached.releases.length) { S.lib = normalizeLib(cached); S.share = cached.share; primeThumbs(); S.streamKey = cached.stream_key || ''; S.stale = true; show(cached); }
      else if (BOOT.pub) {
        document.body.classList.add('club-mode'); const r0 = parseRoute(); if (r0.v === 'tour' || r0.v === 'press' || r0.v === 'video') routeTo(r0); else if (r0.v !== 'home') { S.view = r0.v === 'lore' ? 'lore' : 'library'; renderChrome(true); paintSkeleton(); } else if (r0.v === 'home') {
          paintHomeShell();
          firstCall('getHome', BOOT.token).then(h => { if (!S.lib && h && h.picks) paintHomeLite(h.picks); }).catch(() => {});   // small and quick: the two covers, before the whole library
        }
      } else paintSkeleton();   // first visit to the public site: show Home now, fill in the covers when the library arrives (a fan link just shows grey blocks until its data comes)
      let d;
      try { d = await firstCall('getShare', BOOT.token); } catch (e) { if (cached) { S.stale = false; toast("Couldn't refresh. Showing your last copy."); return; } throw e; }
      if (d.error) { libCacheClear(); document.body.classList.add('share-mode'); return empty(d.error); }
      S.lib = normalizeLib(d); S.share = d.share; primeThumbs(); S.streamKey = d.stream_key || ''; S.stale = false; libCacheSet(d);
      if (!d.releases.length) { document.body.classList.add('share-mode'); return empty('There is nothing to play on this link yet.'); }
      if (cached) refreshView(); else show(d);
      if (S.pendingRel) { const id = S.pendingRel; S.pendingRel = ''; if (rel(id)) renderRelease(id); }   // tapped a cover before the library arrived
    } else if (BOOT.key) {
      const cached = libCacheGet();
      if (!cached) { S.view = 'library'; renderChrome(true); paintSkeleton(); }
      if (cached) { S.lib = normalizeLib(cached); primeThumbs(); S.streamKey = cached.stream_key || ''; S.stale = true; renderChrome(); routeTo(parseRoute()); }
      let d;
      try { d = await firstCall('getLibrary', BOOT.key); } catch (e) { if (cached) { S.stale = false; toast("Couldn't refresh. Showing your last copy."); return; } throw e; }
      S.lib = normalizeLib(d); primeThumbs(); S.streamKey = S.lib.stream_key || ''; S.stale = false; libCacheSet(d);
      if (cached) refreshView(); else { renderChrome(); routeTo(parseRoute()); }
    } else {
      empty('Open this page from your owner link, or from a share link someone sent you.');
    }
  } catch (e) { empty('Soul Vault could not load: ' + (e.message || String(e)), true); }
  clearTimeout(watchStall.t);
}
function empty(msg, retry) {
  $('#main').innerHTML = `<div class="status"><p style="margin:0 0 16px">${esc(msg)}</p>${retry ? '<button class="pill main" data-retry>Try again</button>' : ''}</div>`;
}
// If Google never answers, say so instead of loading forever.
const STALL_MSG = 'Soul Vault is taking too long to load, even on the backup connection. Check your internet, then try again. '
  + 'If it keeps happening, open this link in a Private tab and send a screenshot of this message.';
function watchStall() {
  clearTimeout(watchStall.t);
  watchStall.t = setTimeout(() => {
    if (!S.lib && TRANSPORT === 'fetch' && !watchStall.extended) { watchStall.extended = true; return watchStall(); }
    if (!S.lib) { empty(STALL_MSG, true); logErr('Startup stalled 25s via ' + TRANSPORT + ': ' + navigator.userAgent); }
  }, 25000);
}

/* ── tab addresses: each page has its own URL (/vault, /tour, /press, /lore, /vault/<release>); Back and Forward work ── */
const relSlug = id => String(id || '').replace(/^rel_/, '').replace(/_/g, '-');
function parseRoute() {
  const p = decodeURIComponent(location.pathname).replace(/\/+$/, '').toLowerCase().split('/').filter(Boolean);
  if (p[0] === 'vault') return p[1] ? { v: 'release', slug: p.slice(1).join('/') } : { v: 'library' };
  if (p[0] === 'tour') return { v: 'tour', tab: p[1] === 'road-to-100' ? 'road' : 'shows' };
  if (p[0] === 'press' && p[1] === 'video') return { v: 'video', tab: 'press' };   // the press videos moved to the Video tab
  if (p[0] === 'press') return { v: 'press', tab: 'articles' };
  if (p[0] === 'video') return { v: 'video', tab: p[1] === 'music-videos' ? 'music' : p[1] === 'press' ? 'press' : 'freestyles', sub: p[1] === 'originals' || p[1] === 'remixes' ? p[1] : 'all' };   // (/video/originals and /video/remixes are the one Freestyles list now)
  if (p[0] === 'lore') return { v: 'lore' };
  return { v: 'home', unknown: p.length > 0 };   // an address nobody made: show Home, but tell search engines not to index it
}
function pathFor() {
  const v = S.view;
  if (v === 'home') return '/';
  if (v === 'library') return '/vault';
  if (v === 'release' && S.releaseId) return '/vault/' + relSlug(S.releaseId);
  if (v === 'tour') return S.tourTab === 'road' ? '/tour/road-to-100' : '/tour';
  if (v === 'press') return '/press';
  if (v === 'video') return S.videoTab === 'music' ? '/video/music-videos' : S.videoTab === 'press' ? '/video/press' : S.videoSub === 'originals' || S.videoSub === 'remixes' ? '/video/' + S.videoSub : '/video';
  if (v === 'lore') return '/lore';
  return null;   // owner screens (settings, share links, insights) have no address
}
// Search engines: unknown addresses get "noindex"; every page names its own address as canonical.
function setRobots(on) {
  let m = document.querySelector('meta[name="robots"]');
  if (on && !m) { m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex'; document.head.appendChild(m); }
  else if (!on && m && m.content === 'noindex') m.remove();
}
function setCanonical(p) {
  let l = document.querySelector('link[rel="canonical"]');
  if (document.querySelector('meta[name="robots"][content="noindex"]')) { if (l) l.remove(); return; }   // an unknown address names no canonical
  if (!l) { l = document.createElement('link'); l.rel = 'canonical'; document.head.appendChild(l); }
  l.href = String(BOOT.site || location.origin).replace(/\/$/, '') + (p === '/' ? '/' : p);
}
function syncUrl() {
  if (!OWNER && !document.body.classList.contains('club-mode')) return;   // single-release share links keep their own address
  const p = pathFor(); if (!p) return;
  if (S.urlInit && location.pathname !== p) setRobots(false);   // the visitor moved on from an unknown address
  setCanonical(p);
  const r = S.lib && S.view === 'release' ? rel(S.releaseId) : null;
  const names = { home: '', library: 'Music', tour: 'Tour', press: 'Press', video: 'Video', lore: 'Lore' };
  S.siteName = S.siteName || document.title.split(' | ')[0] || 'Nicólas Soul';
  const t = S.view === 'release' ? (r ? r.title : 'Release') : names[S.view];
  document.title = t ? t + ' | ' + S.siteName : S.siteName;
  if (location.pathname !== p) { try { history[S.fromPop || !S.urlInit ? 'replaceState' : 'pushState'](null, '', p + location.search); } catch (e) {} }
  S.urlInit = true;
}
function routeTo(r) {
  setRobots(!!r.unknown);
  S.fromPop = true;
  try {
    if (r.v === 'tour') { S.tourTab = r.tab; renderTour(); }
    else if (r.v === 'press') { S.pressTab = r.tab; renderPress(); }
    else if (r.v === 'video') { S.videoTab = r.tab; S.videoSub = r.sub || 'all'; renderVideo(); }
    else if (r.v === 'lore' && (OWNER || CLUB())) renderLore();
    else if (r.v === 'library' && S.lib) renderLibrary();
    else if (r.v === 'release' && S.lib) {
      const x = S.lib.releases.find(q => relSlug(q.release_id) === r.slug);
      if (x) renderRelease(x.release_id); else renderLibrary();
    }
    else if (OWNER && r.v === 'home' && S.lib) renderLibrary();
    else renderHome();
  } finally { S.fromPop = false; }
}
window.addEventListener('popstate', () => { if (S.lib || ['tour', 'press', 'video'].indexOf(parseRoute().v) > -1) routeTo(parseRoute()); });

function paintSkeleton() { $('#main').innerHTML = '<div class="wrap skelpg" aria-busy="true"><i class="skelhead"></i><div class="skelgrid">' + '<i></i>'.repeat(8) + '</div></div>'; }
// One moving background behind Home, Vault, Tour, Press and Lore. It lives outside #main, so the video keeps playing when you change tabs.
function syncSiteBg() {
  const on = ['home', 'library', 'tour', 'press', 'video', 'lore'].indexOf(S.view) > -1;
  let el = $('#sitebg');
  if (on && !el) { el = Object.assign(document.createElement('div'), { id: 'sitebg' }); el.setAttribute('aria-hidden', 'true'); el.innerHTML = '<video muted loop playsinline preload="none" poster="/home-bg-hd-poster.jpg"></video>'; document.body.prepend(el); }
  document.body.classList.toggle('vbg', on);
  const vv = el && $('video', el); if (vv && vv.dataset.started) { if (on) { const q = vv.play(); if (q && q.catch) q.catch(() => {}); } else vv.pause(); }   // no hidden video eating battery on release pages
  if (on) startHomeVideo($('#sitebg video'), S.lib || S.view !== 'home' ? 1500 : 8000);   // 8 s fallback on Home while the library is slow
}
function renderChrome(noUrl) {
  const v = S.view;
  syncSiteBg();
  const cur = ['home', 'tour', 'press', 'video', 'lore'].indexOf(v) > -1 ? v : (['shares', 'vault'].indexOf(v) > -1 ? v : 'library');
  const years = [...new Set(((S.lib && S.lib.releases) || []).map(r => r.year))].sort((a, b) => b - a);
  const cc = n => n === cur ? 'aria-current="page"' : '';
  const club = !OWNER;
  const main = [['home', I.home, 'Home'], ['library', I.note, 'Music'], ['video', I.play, 'Video'], ['tour', I.pin, 'Tour'], ['press', I.text, 'Press'], ['lore', I.layers, 'Lore']];
  $('#side').innerHTML = `
    <div class="brand">Soul <span>Vault</span><i class="flagband" aria-hidden="true"></i></div>
    <nav>
      ${main.map(m => `<button class="nav" data-nav="${m[0]}" ${cc(m[0])}>${m[1]}${m[2]}</button>`).join('')}
      ${club ? '' : `<button class="nav" data-nav="vault" ${cc('vault')}>${I.vault}Settings</button>
      <button class="nav" data-nav="shares" ${cc('shares')}>${I.link}Share links</button>
`}
    </nav>
    ${cur === 'library' ? `<h3>Years</h3>
    <div class="yrs">${years.map(y => `<button data-year="${esc(y)}">${esc(y)}</button>`).join('')}</div>` : ''}`;
  $('#tabs').classList.remove('four');
  $('#tabs').innerHTML = main.map(m => `<button data-nav="${m[0]}" ${cc(m[0])}>${m[1]}${m[2]}</button>`).join('');
  if (!noUrl) syncUrl();
}

