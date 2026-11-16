/* ── Lore: the story (bio) and year by year ──
   Built from what the library already holds: `artist_bio` and each release's year. All text is escaped. (The "Stories behind the songs" section was removed Nov 16, 2026 at Nick's request; voice notes still play from Now Playing.) */
function loreStoryHtml() {
  const b = bioParts(S.lib.artist_bio); if (!b.short && !b.full) return '';
  return `<section class="lorestory" aria-label="The story"><h2 class="sh"><span><b>The</b> story</span></h2>${bioHtml(b.short || b.full)}
    ${b.short && b.full ? `<details><summary>Keep reading</summary>${bioHtml(b.full)}</details>` : ''}</section>`;
}
function loreTimelineHtml(L) {
  const years = new Map();
  L.eras.forEach(e => { const y = String(e.r.year || '').trim() || 'Undated'; if (!years.has(y)) years.set(y, []); years.get(y).push(e); });
  const keys = [...years.keys()].sort((a, b) => (b === 'Undated') - (a === 'Undated') || b.localeCompare(a)).filter(k => k !== 'Undated').concat(years.has('Undated') ? ['Undated'] : []);
  if (!keys.length) return '';
  return `<section class="loretime" aria-label="Year by year"><details class="ltdet" data-lore-tl${S.loreTl ? ' open' : ''}><summary class="sh"><span><b>Year</b> by year</span><span class="ltsum cs">${keys.length} ${keys.length === 1 ? 'year' : 'years'}<i aria-hidden="true"></i></span></summary><ol class="ltl">${keys.map(y => {
    const es = years.get(y), songs = es.reduce((n, e) => n + e.songs, 0);
    return `<li><div class="lty"><b>${esc(y)}</b><span class="cs">${es.length} ${es.length === 1 ? 'release' : 'releases'} · ${songs} ${songs === 1 ? 'song' : 'songs'}</span></div>
      <div class="ltr">${es.map(e => `<button type="button" class="lchip" data-rel="${esc(e.r.release_id)}">${esc(e.r.title)}<i>${esc(typeOf(e.r))}</i></button>`).join('')}</div></li>`;
  }).join('')}</ol></details></section>`;
}
function fillLoreExtras(L) {
  const set = (id, html) => { const el = $('#' + id); if (el) el.innerHTML = html; };
  set('loreStory', loreStoryHtml()); set('loreTimeline', loreTimelineHtml(L));
  fillMilestones();
  const tl = $('[data-lore-tl]'); if (tl) tl.addEventListener('toggle', () => { S.loreTl = tl.open; });
}
