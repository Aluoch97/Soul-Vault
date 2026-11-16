/* ── Media tab: Videos | Photos. The photos that used to be on the Lore page live here now (Nick, Nov 2026). ──
   Videos are drawn by renderVideo (03-home-tour-press.js, 18-video-tab.js); Photos by renderMediaPhotos below. The tab is S.mediaTab ('videos' | 'photos'),
   the address is /media/videos... or /media/photos (the older /video/... still opens the Videos side). */
function mediaSwitch() {
  return `<div class="mediasw" role="tablist" aria-label="Media">${[['videos', 'Videos'], ['photos', 'Photos']].map(([k, l]) => `<button type="button" role="tab" data-mtab="${k}" aria-selected="${S.mediaTab === k}">${l}</button>`).join('')}</div>`;
}
function wireMediaSwitch() {
  $$('[data-mtab]').forEach(b => b.addEventListener('click', () => { if (S.mediaTab === b.dataset.mtab) return; S.mediaTab = b.dataset.mtab; syncUrl(); renderVideo(); window.scrollTo(0, 0); }));
}
function renderMediaPhotos() {
  clearPageBg(); S.view = 'video'; S.mediaTab = 'photos'; renderChrome();
  const L = S.lib ? buildLore() : null;
  const phRels = L ? L.eras.map(e => ({ r: e.r, ph: extrasOf(e.r.release_id, 'photo').filter(x => x.file_id) })).filter(x => x.ph.length) : [];
  $('#main').innerHTML = `<div class="wrap sitepg presspg videopg mediapg">
    <header class="vidhead"><h1 class="vidh1">Soul <span>Media</span></h1><p class="cs">Videos and photos.</p></header>
    ${mediaSwitch()}
    <section class="mphsec" aria-label="Photos of Nicólas Soul"><h2 class="sh"><span><b>Photos</b> of Soul</span></h2>
      <div class="mphgrid" role="list">${SITE.photos.map((f, i) => `<button type="button" role="listitem" class="mph1" data-lphoto="${i}" aria-label="Open photo ${i + 1}"><img src="/photos/${esc(f)}.jpg" alt="Nicólas Soul" loading="lazy" onerror="this.parentNode.remove()"></button>`).join('')}</div></section>
    ${phRels.length ? `<section class="mphsec" aria-label="Photos from every release"><h2 class="sh"><span><b>Photos</b> from every release</span></h2>
      <div class="mphgrid rel" role="list">${phRels.map(x => `<button type="button" role="listitem" class="mph1 mphrel" data-lore-phrel="${esc(x.r.release_id)}"><span class="mphimg"><img data-ss-src="${esc(x.ph[0].file_id)}" alt="" loading="lazy"></span><b>${esc(x.r.title)}</b><span class="cs">${x.ph.length} ${x.ph.length === 1 ? 'photo' : 'photos'}</span></button>`).join('')}</div></section>` : (S.lib ? '' : '<p class="cs">Loading photos…</p>')}
  </div>`;
  wireMediaSwitch();
  $$('[data-lphoto]').forEach(b => b.addEventListener('click', () => openLorePhoto(+b.dataset.lphoto)));
  $$('[data-lore-phrel]').forEach(b => { ssThumb(b.querySelector('img')); b.addEventListener('click', () => { S.releaseId = b.dataset.lorePhrel; openSlideshow(0); }); });
  syncUrl(); window.scrollTo(0, 0);
}
