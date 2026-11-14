/* ── Press tab: two tabs, Coverage (search + the stories by year) and Press kit (bio, photos, contact, links) ──
   Everything here comes from `SITE` (03-home-tour-press.js): `bio`, `booking`, `photos`, `links`, `press`. Text is escaped. */
const pressYear = p => (/\b(19|20)\d\d\b/.exec(p.date || '') || [])[0] || 'Earlier';
function pressCard(p) {
  return `<a class="pcard" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">
    <div class="pimg"><span class="pfall" aria-hidden="true">${esc(p.site)}</span><img src="/press-img/${esc(p.image)}.jpg" alt="" loading="lazy" onerror="this.remove()"></div>
    <div class="pbody"><div class="ptitle">${esc(p.title)}</div><p class="pdesc">${esc(p.desc)}</p>
      <div class="pfoot"><span class="pico" aria-hidden="true">${esc(p.site.charAt(0))}</span><span class="psrc">${esc([p.site, p.author, p.date].filter(Boolean).join(' · '))}</span>${I.chev}</div></div></a>`;
}
function pressKitHtml() {
  const paras = String(SITE.bio || '').split(/\n\s*\n/).filter(Boolean), photos = (SITE.photos || []).slice(0, 6);
  return `<div class="pkit">
    <section class="pksec" aria-label="Bio"><h3 class="pkh">Bio</h3><div class="pkbio"><p>${esc(paras[0] || '')}</p>${paras.length > 1 ? `<details><summary>Read the full bio</summary>${paras.slice(1).map(x => `<p>${esc(x)}</p>`).join('')}</details>` : ''}</div>
      <div class="pkacts"><button type="button" class="pill soft" data-press-copy="bio">Copy bio</button></div></section>
    ${photos.length ? `<section class="pksec" aria-label="Photos"><h3 class="pkh">Photos</h3><div class="pkphotos" role="list">${photos.map((n, i) => `<a role="listitem" class="pkphoto" href="/photos/${esc(n)}.jpg" download="nicolas-soul-${esc(n)}.jpg" aria-label="Download press photo ${i + 1}"><img src="/photos/${esc(n)}.jpg" alt="Press photo ${i + 1}" loading="lazy"><span>${I.dl}</span></a>`).join('')}</div>
      <p class="cs pkfoot">Tap a photo to download it (about 1400 px wide: good for web and social). <a href="#" data-nav="lore">See all photos</a></p></section>` : ''}
    <section class="pksec" aria-label="Contact"><h3 class="pkh">Contact</h3><p class="pkmail">${esc(SITE.booking)}</p>
      <div class="pkacts"><a class="pill main" href="mailto:${esc(SITE.booking)}?subject=${encodeURIComponent('Press / booking: Nicólas Soul')}">${I.mail}Email booking</a><button type="button" class="pill soft" data-press-copy="email">Copy email</button></div></section>
    <section class="pksec" aria-label="Find Soul online"><h3 class="pkh">Find Soul</h3><div class="pklinks">${(SITE.links || []).map(l => `<a href="${esc(l[1])}" target="_blank" rel="noopener noreferrer">${esc(l[0])}</a>`).join('')}</div></section></div>`;
}
function drawPressList() {
  const q = lyNorm($('#pq') ? $('#pq').value : ''), yr = $('#pyear') ? $('#pyear').value : '';
  const list = SITE.press.filter(p => (!yr || pressYear(p) === yr) && (!q || lyNorm([p.title, p.site, p.desc, p.author].join(' ')).includes(q)));
  const years = [...new Set(list.map(pressYear))];
  const body = $('#pressBody'); if (!body) return;
  if (!list.length) { body.innerHTML = '<p class="cs">Nothing matches that.</p>'; return; }
  body.innerHTML = years.map(y => `<h3 class="pyr">${esc(y)}</h3><div class="pcards">${list.filter(p => pressYear(p) === y).map(pressCard).join('')}</div>`).join('');
}
function fillPress() {
  const kit = $('#pressKit'); if (!kit) return;
  kit.innerHTML = pressKitHtml();
  const years = [...new Set(SITE.press.map(pressYear))];
  $('#pressFind').innerHTML = `<div class="pfind"><label class="vidsearch">${I.search}<input id="pq" type="search" placeholder="Search press" aria-label="Search press" autocomplete="off"></label>
    ${years.length > 1 ? `<label class="libsel"><span class="sr-only">Year</span><select id="pyear" aria-label="Year"><option value="">All years</option>${years.map(y => `<option>${esc(y)}</option>`).join('')}</select></label>` : ''}</div>`;
  $('#pq').addEventListener('input', drawPressList); const sel = $('#pyear'); if (sel) sel.addEventListener('change', drawPressList);
  drawPressList();
  const tabs = [...$$('[data-pstab]')];
  const pick = k => { S.pressTab = k; tabs.forEach(b => b.setAttribute('aria-selected', String(b.dataset.pstab === k))); $('#pressCoverage').hidden = k !== 'coverage'; kit.hidden = k !== 'kit'; };
  tabs.forEach(b => b.addEventListener('click', () => pick(b.dataset.pstab)));
  pick(S.pressTab === 'kit' ? 'kit' : 'coverage');
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-press-copy]'); if (!b) return;
  e.preventDefault(); copy(b.dataset.pressCopy === 'email' ? SITE.booking : String(SITE.bio || '').trim(), b);
});
