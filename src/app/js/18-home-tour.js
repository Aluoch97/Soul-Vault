/* ── Home: "On the road" (Road to 100 + the next show), Continue listening and Soul's Picks ──
   The numbers come from the public `getTourFeed` call (the Road to 100 tracker sheet). Nothing is shown until they arrive, and nothing breaks if they never do. */
function loadTour() {
  if (!S.tourP) S.tourP = run('getTourFeed').then(r => (S.tour = r && r.available ? r : null)).catch(() => (S.tour = null));
  return S.tourP;
}
const safeHttps = u => (/^https:\/\/[^\s/@]+(\/[^\s]*)?$/i.test(String(u || '')) ? String(u) : '');
const shortDate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); return m ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[2] - 1] + ' ' + +m[3] : ''; };
function roadRing(done, goal) {
  const r = 34, c = 2 * Math.PI * r, k = Math.max(0, Math.min(1, goal ? done / goal : 0));
  return `<svg class="roadring" viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="${r}" class="bg"/><circle cx="40" cy="40" r="${r}" class="fg" stroke-dasharray="${(c * k).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 40 40)"/><text x="40" y="46" text-anchor="middle">${esc(String(done))}</text></svg>`;
}
function roadCard(t) {
  const last = (t.shows || []).filter(s => s.done).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0], nx = t.next;
  const line = nx ? `<b>Next show</b> ${esc(nx.dateText || '')}${nx.venue ? ' · ' + esc(nx.venue) : ''}${nx.city ? ', ' + esc(nx.city) : ''}`
    : last ? `<b>Last show</b> ${esc(shortDate(last.date))} · ${esc(last.venue)}${last.city ? ', ' + esc(last.city) : ''}` : '';
  const tix = nx && safeHttps(nx.ticketUrl);
  return `<div class="roadcard"><button class="roadmain" type="button" data-nav="tour" aria-label="Road to ${esc(String(t.goal))}: ${esc(String(t.completed))} shows played. Open the tour page.">
      ${roadRing(t.completed, t.goal)}<span class="roadtxt"><span class="roadhead">Road to ${esc(String(t.goal))}</span><span class="roadsub">${esc(String(t.completed))} of ${esc(String(t.goal))} shows played${t.cityCount ? ' · ' + esc(String(t.cityCount)) + (t.cityCount === 1 ? ' city' : ' cities') : ''}${t.states && t.states.length > 1 ? ' · ' + esc(String(t.states.length)) + ' states' : ''}</span>
      ${line ? `<span class="roadline">${line}</span>` : ''}</span></button>
    ${tix ? `<a class="pill main roadtix" href="${esc(tix)}" target="_blank" rel="noopener noreferrer">Tickets</a>` : ''}</div>`;
}
async function fillRoad() {
  const box = $('#roadHome'); if (!box) return;
  const t = await loadTour(); const now = $('#roadHome'); if (!now) return;
  now.innerHTML = t ? `<h2 class="sh"><span><b>On the</b> road</span></h2>${roadCard(t)}` : ''; now.hidden = !t;
}
// Everything on Home that needs data after the page is drawn.
function fillHomeExtras() {
  fillShop(); fillRoad();
  const p = $('#picksHome'); if (p && S.lib) { p.innerHTML = picksRow(); loadCovers(); }
}
