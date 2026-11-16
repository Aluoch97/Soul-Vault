/* ── Media tab: Videos | Photos. The photos that used to be on the Lore page live here now (Nick, Nov 2026). ──
   Videos are drawn by renderVideo (03-home-tour-press.js, 18-video-tab.js); Photos by renderMediaPhotos below. The tab is S.mediaTab ('videos' | 'photos'),
   the address is /media/videos... or /media/photos (the older /video/... still opens the Videos side).
   Photos have the same View menu as the Music tab (VIEWS / VSVG in 04-library-shelves.js): Scrolling shelf, Large, Small, List; the choice is kept in `sv_photoview`. */
function mediaSwitch() {
  return `<div class="mediasw" role="tablist" aria-label="Media">${[['videos', 'Videos'], ['photos', 'Photos']].map(([k, l]) => `<button type="button" role="tab" data-mtab="${k}" aria-selected="${S.mediaTab === k}">${l}</button>`).join('')}</div>`;
}
function wireMediaSwitch() {
  $$('[data-mtab]').forEach(b => b.addEventListener('click', () => { if (S.mediaTab === b.dataset.mtab) return; S.mediaTab = b.dataset.mtab; syncUrl(); renderVideo(); window.scrollTo(0, 0); }));
}
function photoViewMenu(cur) {
  return `<div class="viewrow"><div class="viewwrap"><button type="button" class="pill soft viewbtn" data-libmenu aria-haspopup="menu" aria-expanded="false">${VSVG.list}<span>View</span><span aria-hidden="true">&#9662;</span></button>
    <div class="viewmenu" role="menu" aria-label="View" hidden>${VIEWS.map(v => `<button type="button" role="menuitemradio" aria-checked="${v[0] === cur}" data-phview="${v[0]}"><i class="vdot">${v[0] === cur ? '&bull;' : ''}</i>${VSVG[v[0]]}<span>${v[1].replace('covers', 'photos')}</span></button>`).join('')}</div></div></div>`;
}
function renderMediaPhotos() {
  clearPageBg(); S.view = 'video'; S.mediaTab = 'photos'; renderChrome();
  const view = VIEWS.some(v => v[0] === S.photoView) ? S.photoView : (S.photoView = ls.get('sv_photoview', 'large') || 'large');
  const L = S.lib ? buildLore() : null;
  const phRels = L ? L.eras.map(e => ({ r: e.r, ph: extrasOf(e.r.release_id, 'photo').filter(x => x.file_id) })).filter(x => x.ph.length) : [];
  const soul = SITE.photos.map((f, i) => `<button type="button" role="listitem" class="mph1" data-lphoto="${i}" aria-label="Open photo ${i + 1}"><img src="/photos/${esc(f)}.jpg" alt="Nicólas Soul" loading="lazy" onerror="this.parentNode.remove()"><span class="mphlab">Photo ${i + 1}</span></button>`).join('');
  const rels = phRels.map(x => `<button type="button" role="listitem" class="mph1 mphrel" data-lore-phrel="${esc(x.r.release_id)}"><span class="mphimg"><img data-ss-src="${esc(x.ph[0].file_id)}" alt="" loading="lazy"></span><span class="mphtxt"><b>${esc(x.r.title)}</b><span class="cs">${x.ph.length} ${x.ph.length === 1 ? 'photo' : 'photos'}</span></span></button>`).join('');
  $('#main').innerHTML = `<div class="wrap sitepg presspg videopg mediapg">
    <header class="vidhead"><h1 class="vidh1">Soul <span>Media</span></h1><p class="cs">Videos and photos.</p></header>
    ${mediaSwitch()}${photoViewMenu(view)}
    <section class="mphsec" aria-label="Photos of Nicólas Soul"><h2 class="sh"><span><b>Photos</b> of Soul</span></h2>
      <div class="mphgrid ${view}" role="list">${soul}</div></section>
    ${phRels.length ? `<section class="mphsec" aria-label="Photos from every release"><h2 class="sh"><span><b>Photos</b> from every release</span></h2>
      <div class="mphgrid rel ${view}" role="list">${rels}</div></section>` : (S.lib ? '' : '<p class="cs">Loading photos…</p>')}
  </div>`;
  wireMediaSwitch();
  $$('[data-phview]').forEach(b => b.addEventListener('click', () => { S.photoView = b.dataset.phview; ls.set('sv_photoview', S.photoView); renderMediaPhotos(); }));
  $$('[data-lphoto]').forEach(b => b.addEventListener('click', () => openLorePhoto(+b.dataset.lphoto)));
  $$('[data-lore-phrel]').forEach(b => { ssThumb(b.querySelector('img')); b.addEventListener('click', () => { S.releaseId = b.dataset.lorePhrel; openSlideshow(0); }); });
  syncUrl(); window.scrollTo(0, 0);
}
