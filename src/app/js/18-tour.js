/* ── Tour tab: Overview ──
   Deliberately short: the next show, a small Road to 100 card (the full tracker is its own tab, so the overview does not repeat it), and how to book.
   Data: the same public `getTourFeed` as Home's "On the road" card (loadTour, safeHttps and shortDate come from 18-home-tour.js). The Shows (Bandsintown) and Road to 100 pages stay as the other two tabs. */
// "Add to calendar" for the next show: a small .ics made right here (nothing is sent anywhere).
function tourIcs(nx) {
  if (!nx || !/^\d{4}-\d{2}-\d{2}$/.test(nx.date || '')) return '';
  const d = nx.date.replace(/-/g, ''), nxt = new Date(Date.UTC(+nx.date.slice(0, 4), +nx.date.slice(5, 7) - 1, +nx.date.slice(8, 10) + 1)).toISOString().slice(0, 10).replace(/-/g, '');
  const t = s => String(s || '').replace(/[\\;,\r\n]/g, ' ').replace(/\s+/g, ' ').trim();
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Soul Vault//Tour//EN', 'BEGIN:VEVENT', 'UID:' + d + '-' + t(nx.venue).replace(/\W/g, '').slice(0, 20) + '@soulnicolas.com', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''),
    'DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + nxt, 'SUMMARY:Nicólas Soul at ' + t(nx.venue), 'LOCATION:' + t(nx.venue + ', ' + nx.city), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(body);
}
function tourNextHero(t) {
  const nx = t.next, join = JOIN_URL(), tix = nx && safeHttps(nx.ticketUrl), ics = tourIcs(nx);
  if (!nx) return `<section class="tcard thero none" aria-label="Next show"><div class="tlabel">Next show</div><div class="tbig">No show announced yet</div>
    <p class="cs">Join the Soul Tribe and you'll hear first when the next one is booked.</p>${join ? `<div class="tacts"><a class="pill main" href="${esc(join)}">${I.mail}Join the Soul Tribe</a></div>` : ''}</section>`;
  return `<section class="tcard thero" aria-label="Next show"><div class="tlabel">Next show</div><div class="tbig">${esc(nx.dateText || 'Date to be announced')}</div>
    <div class="tvenue">${esc(nx.venue || '')}${nx.city ? '<span class="cs"> · ' + esc(nx.city) + '</span>' : ''}</div>${nx.type ? `<p class="cs">${esc(nx.type)}</p>` : ''}
    ${tix || ics ? `<div class="tacts">${tix ? `<a class="pill main" href="${esc(tix)}" target="_blank" rel="noopener noreferrer">Get tickets</a>` : ''}${ics ? `<a class="pill soft" href="${ics}" download="soul-show.ics">${I.clock}Add to calendar</a>` : ''}</div>` : ''}</section>`;
}
// A small card, not the tracker: the count, one bar and one line; tapping it opens the Road to 100 tab.
function tourRoadCard(t) {
  const pct = t.goal ? Math.min(100, Math.round(t.completed / t.goal * 100)) : 0, bits = [esc(String(t.remaining)) + ' to go', t.cityCount ? esc(String(t.cityCount)) + (t.cityCount === 1 ? ' city' : ' cities') : '', t.states && t.states.length > 1 ? esc(String(t.states.length)) + ' states' : ''].filter(Boolean);
  return `<button type="button" class="tcard troad" data-tour-go="road" aria-label="Road to ${esc(String(t.goal))}: ${esc(String(t.completed))} shows played. Open the tracker.">
    <span class="tlabel">Road to ${esc(String(t.goal))}</span><span class="tcount"><b>${esc(String(t.completed))}</b> of ${esc(String(t.goal))} shows</span>
    <span class="tpbar" role="progressbar" aria-valuemin="0" aria-valuemax="${esc(String(t.goal))}" aria-valuenow="${esc(String(t.completed))}" aria-label="Shows played"><i style="width:${pct}%"></i></span>
    <span class="tfoot"><span class="cs">${bits.join(' · ')}</span><span class="tmore">Open the tracker ${I.chev}</span></span></button>`;
}
function tourBook() {
  const mail = 'mailto:' + SITE.booking + '?subject=' + encodeURIComponent('Booking Nicólas Soul');
  return `<section class="tbook" aria-label="Book Soul"><div><div class="tlabel">Book Soul</div><p class="cs">Shows, festivals, features and private events.</p></div><a class="pill soft" href="${esc(mail)}">${I.mail}Email booking</a></section>`;
}
async function drawTourOverview(box) {
  box.innerHTML = '<p class="status" style="padding:16px">Loading the tour…</p>';
  const t = await loadTour(); if (!box.isConnected) return;
  if (!t) { box.innerHTML = `<div class="tourwrap"><p class="cs" style="padding:8px 0">The tour numbers can't load right now. Try Shows or Road to 100 above.</p>${tourBook()}</div>`; return; }
  box.innerHTML = `<div class="tourwrap">${tourNextHero(t)}${tourRoadCard(t)}${tourBook()}</div>`;
  const go = box.querySelector('[data-tour-go]'); if (go) go.addEventListener('click', () => { const tab = document.querySelector('[data-tourtab="' + go.dataset.tourGo + '"]'); if (tab) tab.click(); });
}
