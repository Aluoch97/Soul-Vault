/* ── Smart links: one short address per project and per song that lets a fan pick their own streaming service. ──
   /link/<release-slug>            a project            /link/<release-slug>/<track id>        one song
   The page shows the cover, the title and a button for every service we have a link for: a song's own links (Studio > release > Links > "One song's own links"),
   else its release's links. A fan's choice is remembered on their device (`sv_pref_platform`); "Skip this page next time" (`sv_pref_auto`) sends them straight
   to that service on later visits, with a short "Opening Spotify…" notice and a way to choose another. Links are https only; all text is escaped. */
const PREF_KEY = 'sv_pref_platform', AUTO_KEY = 'sv_pref_auto';
const smartUrl = (r, t) => siteBase() + '/link/' + relSlug(r.release_id) + (t ? '/' + encodeURIComponent(String(t.track_id)) : '');
function smartLinks(r, t) {
  const L = S.links || {}, own = t && L.tl && L.tl[t.track_id] && L.tl[t.track_id].links, fromRel = L.releases && L.releases[r.release_id] && L.releases[r.release_id].links;
  const ok = l => Array.isArray(l) && l[0] && /^https:\/\/[^\s]+$/i.test(String(l[1] || ''));
  const pick = a => (Array.isArray(a) ? a.filter(ok) : []);
  const mine = pick(own);
  return { links: mine.length ? mine : pick(fromRel), own: !!mine.length };
}
function smartBtn(l, cls) {
  return `<a class="smbtn${cls ? ' ' + cls : ''}" data-sm-svc="${esc(l[0])}" href="${esc(l[1])}" target="_blank" rel="noopener noreferrer">${BRAND[l[0]] ? `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="${BRAND[l[0]]}"/></svg>` : I.link}<span>${cls === 'pref' ? 'Open in ' : 'Listen on '}${esc(l[0])}</span>${I.chev}</a>`;
}
function renderSmartLink(slug, seg) {
  const r = S.lib && S.lib.releases.find(q => relSlug(q.release_id) === slug);
  if (!r) { renderLibrary(); return; }
  const t = seg ? S.lib.tracks.find(x => x.release_id === r.release_id && String(x.track_id).toLowerCase() === seg) : null;
  clearPageBg(); S.view = 'link'; S.releaseId = r.release_id; S.linkTrack = t ? t.track_id : ''; renderChrome();
  const { links } = smartLinks(r, t), pref = ls.get(PREF_KEY, ''), prefL = links.find(l => l[0] === pref), rest = links.filter(l => l !== prefL), auto = !!ls.get(AUTO_KEY, false);
  const title = t ? t.title : r.title, sub = t ? `${esc(relArtist(r))} · from ${esc(r.title)}` : esc([relArtist(r), typeOf(r), r.year].filter(Boolean).join(' · '));
  const v = t && primaryOf(t), canPlay = !!(t ? v : S.lib.tracks.some(x => x.release_id === r.release_id && primaryOf(x)));
  $('#main').innerHTML = `<div class="wrap smartpg">
    <div class="smcover"><img alt="" data-smcover="${esc(r.cover_file_id || '')}"></div>
    <h1 class="smtitle">${esc(title)}</h1><p class="cs smsub">${sub}</p>
    <div id="smAuto" class="smauto" role="status" hidden></div>
    ${links.length ? `<p class="smhead">Choose where to listen</p><div class="smlist">${prefL ? smartBtn(prefL, 'pref') : ''}${rest.map(l => smartBtn(l)).join('')}</div>
      <label class="chk smremember"><input type="checkbox" id="smAutoChk"${auto ? ' checked' : ''}${pref ? '' : ' disabled'}> <span><b>Skip this page next time</b><span class="cs">${pref ? 'Go straight to ' + esc(pref) + '. You can always pick another here.' : 'Pick a service first, then you can turn this on.'}</span></span></label>`
      : `<p class="cs">Streaming links for this ${t ? 'song' : 'project'} are coming soon. You can listen right here.</p>`}
    <div class="smacts">${canPlay ? `<button type="button" class="pill main" data-sm-play>${I.play}Play it here</button>` : ''}<button type="button" class="pill soft" data-rel="${esc(r.release_id)}">${I.disc}Open the full ${esc(typeOf(r) || 'release').toLowerCase()}</button><button type="button" class="pill soft" data-sm-share>${I.share}Share this link</button></div></div>`;
  $$('[data-smcover]').forEach(img => { if (img.dataset.smcover) setCover(img, img.dataset.smcover, true); });
  $$('[data-sm-svc]').forEach(a => a.addEventListener('click', () => { ls.set(PREF_KEY, a.dataset.smSvc); }));
  const chk = $('#smAutoChk'); if (chk) chk.addEventListener('change', () => ls.set(AUTO_KEY, chk.checked));
  const play = $('[data-sm-play]');
  if (play) play.addEventListener('click', () => {
    const first = t ? primaryOf(t) : (S.lib.tracks.filter(x => x.release_id === r.release_id && primaryOf(x)).sort((a, b) => (Number(a.track_no) || 0) - (Number(b.track_no) || 0))[0] || null);
    const pv = t ? first : first && primaryOf(first); if (pv) playFromTap(pv.version_id);
  });
  $('[data-sm-share]').addEventListener('click', () => shareOut({ title, text: t ? `Listen to ${t.title} by ${relArtist(r)}` : `Listen to ${r.title} by ${relArtist(r)}`, url: smartUrl(r, t) }));
  // A fan who chose "skip this page" goes straight to their service (once per visit, so Back does not bounce them forward again).
  const flag = 'sv_smart_' + location.pathname;
  if (auto && prefL && !/[?&]pick=1/.test(location.search)) {
    let done = false; try { done = !!sessionStorage.getItem(flag); } catch (e) {}
    if (!done) {
      const note = $('#smAuto'); note.hidden = false; note.innerHTML = `Opening ${esc(prefL[0])}… <button type="button" class="linkish" data-sm-stay>Choose another</button>`;
      const go = setTimeout(() => { try { sessionStorage.setItem(flag, '1'); } catch (e) {} location.href = prefL[1]; }, 1400);
      $('[data-sm-stay]').addEventListener('click', () => { clearTimeout(go); note.hidden = true; try { sessionStorage.setItem(flag, '1'); } catch (e) {} });
    }
  }
  syncUrl(); window.scrollTo(0, 0);
}
// The release page's Share button: a small sheet with the two things you can share, the smart link or the release page itself.
function openShareChoice() {
  const r = rel(S.releaseId); if (!r) return;
  const m = $('#modal'); m.className = 'modal';
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Share ${esc(r.title)}"><h2>Share</h2><p class="cs" style="margin:0 0 10px">${esc(r.title)}</p>
    <div class="sharechoice"><button type="button" class="pill main" data-smart-link="release">${I.link}Smart link</button><p class="cs">A short link where each fan picks Spotify, Apple Music or whatever they use.</p>
      <button type="button" class="pill soft" data-share-page>${I.share}The release page</button><p class="cs">Opens the whole project here: every song, lyrics and photos.</p></div>
    <div class="end"><button class="pill soft" data-close>Close</button></div></div>`;
  m.hidden = false;
}
document.addEventListener('click', e => {
  const pg = e.target.closest && e.target.closest('[data-share-page]'); if (!pg) return;
  e.preventDefault(); e.stopPropagation();
  const r = rel(S.releaseId); closeModal(); if (r) shareOut({ title: r.title, text: 'Listen to ' + r.title + ' by ' + relArtist(r), url: relShareUrl(r.release_id) });
});
// The smart link for a project (the Share sheet) or a song (Now Playing > More): share it with the phone's share sheet, or copy it.
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-smart-link]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const r = b.dataset.smartLink === 'song' ? (S.now && S.now.r) : rel(S.releaseId), t = b.dataset.smartLink === 'song' ? (S.now && S.now.t) : null;
  if (!r) return;
  closeModal();   // (the Share or More sheet it was tapped in)
  shareOut({ title: t ? t.title : r.title, text: t ? `Listen to ${t.title} by ${relArtist(r)}` : `Listen to ${r.title} by ${relArtist(r)}`, url: smartUrl(r, t) });
});
