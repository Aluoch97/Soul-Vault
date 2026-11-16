/* ── Lore: the story (bio). "Year by year" (releases, milestones, press and shows in one timeline) lives in 18-timeline.js ──
   Built from what the library already holds: `artist_bio`. All text is escaped. (The "Stories behind the songs" section was removed Nov 16, 2026 at Nick's request; voice notes still play from Now Playing.) */
function loreStoryHtml() {
  const b = bioParts(S.lib.artist_bio); if (!b.short && !b.full) return '';
  return `<section class="lorestory" aria-label="The story"><h2 class="sh"><span><b>The</b> story</span></h2>${bioHtml(b.short || b.full)}
    ${b.short && b.full ? `<details><summary>Keep reading</summary>${bioHtml(b.full)}</details>` : ''}</section>`;
}
function fillLoreExtras(L) {
  const set = (id, html) => { const el = $('#' + id); if (el) el.innerHTML = html; };
  set('loreStory', loreStoryHtml());
  fillTimeline(L);
}
