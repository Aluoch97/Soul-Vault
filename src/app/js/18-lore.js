/* ── Lore: the story (bio), year by year, and the stories behind the songs (voice notes) ──
   Built from what the library already holds: `artist_bio`, each release's year and each song's `voice_note_id`. All text is escaped. */
function loreStoryHtml() {
  const paras = String(S.lib.artist_bio || '').trim().split(/\n\s*\n/).filter(Boolean); if (!paras.length) return '';
  return `<section class="lorestory" aria-label="The story"><h2 class="sh"><span><b>The</b> story</span></h2><p>${esc(paras[0])}</p>
    ${paras.length > 1 ? `<details><summary>Keep reading</summary>${paras.slice(1).map(p => `<p>${esc(p)}</p>`).join('')}</details>` : ''}</section>`;
}
function loreTimelineHtml(L) {
  const years = new Map();
  L.eras.forEach(e => { const y = String(e.r.year || '').trim() || 'Undated'; if (!years.has(y)) years.set(y, []); years.get(y).push(e); });
  const keys = [...years.keys()].sort((a, b) => (b === 'Undated') - (a === 'Undated') || b.localeCompare(a)).filter(k => k !== 'Undated').concat(years.has('Undated') ? ['Undated'] : []);
  if (!keys.length) return '';
  return `<section class="loretime" aria-label="Year by year"><h2 class="sh"><span><b>Year</b> by year</span></h2><ol class="ltl">${keys.map(y => {
    const es = years.get(y), songs = es.reduce((n, e) => n + e.songs, 0);
    return `<li><div class="lty"><b>${esc(y)}</b><span class="cs">${es.length} ${es.length === 1 ? 'release' : 'releases'} · ${songs} ${songs === 1 ? 'song' : 'songs'}</span></div>
      <div class="ltr">${es.map(e => `<button type="button" class="lchip" data-rel="${esc(e.r.release_id)}">${esc(e.r.title)}<i>${esc(typeOf(e.r))}</i></button>`).join('')}</div></li>`;
  }).join('')}</ol></section>`;
}
function loreStoriesHtml(all) {
  const ts = S.lib.tracks.filter(t => t.voice_note_id && !hidden(t) && primaryOf(t)); if (!ts.length) return '';
  const rows = all ? ts : ts.slice(0, 6);
  return `<section class="lorestories" aria-label="Stories behind the songs"><h2 class="sh"><span><b>Stories</b> behind the songs</span></h2>
    <p class="cs">Short voice notes from Soul about the songs. Tap one to hear it.</p>
    <ul class="lsl">${rows.map(t => `<li><span class="lsm"><b>${esc(t.title)}</b><span class="cs">${esc((rel(t.release_id) || {}).title || '')}</span></span><button type="button" class="pill soft vnbtn" data-vn="${esc(t.track_id)}" aria-label="Hear the story behind ${esc(t.title)}">${I.mic}Hear</button></li>`).join('')}</ul>
    ${!all && ts.length > 6 ? `<button type="button" class="pill soft" data-lore-stories-all>Show all ${ts.length} stories</button>` : ''}</section>`;
}
function fillLoreExtras(L) {
  const set = (id, html) => { const el = $('#' + id); if (el) el.innerHTML = html; };
  set('loreStory', loreStoryHtml()); set('loreTimeline', loreTimelineHtml(L));
  const drawStories = all => { set('loreStories', loreStoriesHtml(all)); const b = $('[data-lore-stories-all]'); if (b) b.addEventListener('click', () => drawStories(true)); };
  drawStories(false);
}
