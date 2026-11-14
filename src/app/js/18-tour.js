/* ── Tour tab: Overview (next show, Road to 100, the shows so far, book Soul) ──
   Data: the same public `getTourFeed` as Home's "On the road" card (loadTour, safeHttps and shortDate come from 18-home-tour.js). The old Shows (Bandsintown) and Road to 100 pages stay as the other two tabs. */
const TOUR_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthOf = iso => { const m = /^(\d{4})-(\d{2})/.exec(String(iso || '')); return m ? TOUR_MONTHS[+m[2] - 1] + ' ' + m[1] : 'Date to be added'; };
// "Add to calendar" for the next show: a small .ics file made right here (nothing is sent anywhere).
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
  if (!nx) return `<section class="tournext none" aria-label="Next show"><div class="tnk">Next show</div><div class="tnv">No show announced yet</div>
    <p class="cs">Join the Soul Tribe and you'll hear first when the next one is booked.</p>${join ? `<a class="pill main" href="${esc(join)}">${I.mail}Join the Soul Tribe</a>` : ''}</section>`;
  return `<section class="tournext" aria-label="Next show"><div class="tnk">Next show</div><div class="tnv">${esc(nx.dateText || 'Date to be announced')}</div>
    <div class="tnw">${esc(nx.venue || '')}${nx.city ? '<span class="cs"> · ' + esc(nx.city) + '</span>' : ''}</div>${nx.type ? `<p class="cs">${esc(nx.type)}</p>` : ''}
    <div class="tnb">${tix ? `<a class="pill main" href="${esc(tix)}" target="_blank" rel="noopener noreferrer">Get tickets</a>` : ''}${ics ? `<a class="pill soft" href="${ics}" download="soul-show.ics">${I.clock}Add to calendar</a>` : ''}</div></section>`;
}
function tourProgress(t) {
  const pct = t.goal ? Math.min(100, Math.round(t.completed / t.goal * 100)) : 0;
  return `<section class="tourprog" aria-label="Road to ${esc(String(t.goal))}"><div class="tpk">Road to ${esc(String(t.goal))}</div>
    <div class="tpn"><b>${esc(String(t.completed))}</b> <span>of ${esc(String(t.goal))} shows</span></div>
    <div class="tpbar" role="progressbar" aria-valuemin="0" aria-valuemax="${esc(String(t.goal))}" aria-valuenow="${esc(String(t.completed))}" aria-label="Shows played"><i style="width:${pct}%"></i></div>
    <p class="cs">${esc(String(t.remaining))} to go${t.cityCount ? ' · ' + esc(String(t.cityCount)) + (t.cityCount === 1 ? ' city' : ' cities') : ''}</p>
    ${t.states && t.states.length ? `<div class="tpst" aria-label="States played">${t.states.map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}</section>`;
}
function tourShowRow(s) {
  const meta = [s.city, s.type, s.songs].filter(Boolean).map(esc).join(' · ');
  const head = `<span class="tsd">${esc(shortDate(s.date) || '·')}</span><span class="tsm"><b>${esc(s.venue)}</b><span class="cs">${meta}</span></span>`;
  if (!s.story && !s.clip) return `<li class="tshow"><div class="tsrow">${head}</div></li>`;
  return `<li class="tshow has"><details><summary>${head}<span class="tsc" aria-hidden="true">${I.chev}</span></summary>
    ${s.story ? `<p class="tstory">${esc(s.story)}</p>` : ''}${s.clip ? `<div class="tclip"><button class="latvid" type="button" data-yt="${esc(s.clip)}" aria-label="Play clip from ${esc(s.venue)}"><img src="https://i.ytimg.com/vi/${esc(s.clip)}/hqdefault.jpg" alt="" loading="lazy" onerror="this.remove()"><i>${I.play}</i></button></div>` : ''}</details></li>`;
}
function tourShows(t, all) {
  const done = (t.shows || []).filter(s => s.done).sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.n - a.n), list = all ? done : done.slice(0, 10), groups = [];
  list.forEach(s => { const m = monthOf(s.date), g = groups[groups.length - 1]; if (g && g.m === m) g.rows.push(s); else groups.push({ m, rows: [s] }); });
  return `<section class="tourshows" aria-label="Shows so far"><h2 class="sh"><span><b>The</b> shows</span></h2>${groups.map(g => `<h3 class="tmon">${esc(g.m)}</h3><ul class="tlist">${g.rows.map(tourShowRow).join('')}</ul>`).join('')}
    ${!all && done.length > 10 ? `<button class="pill soft" type="button" data-tour-all>Show all ${esc(String(done.length))} shows</button>` : ''}</section>`;
}
function tourBook() {
  const mail = 'mailto:' + SITE.booking + '?subject=' + encodeURIComponent('Booking Nicólas Soul');
  return `<section class="tourbook" aria-label="Book Soul"><div><div class="tbk">Book Soul</div><p class="cs">Shows, festivals, features and private events.</p></div><a class="pill main" href="${esc(mail)}">${I.mail}Email booking</a></section>`;
}
async function drawTourOverview(box) {
  box.innerHTML = '<p class="status" style="padding:16px">Loading the tour…</p>';
  const t = await loadTour(); if (!box.isConnected) return;
  if (!t) { box.innerHTML = `<div class="tourwrap"><p class="cs" style="padding:8px 0">The tour numbers can't load right now. Try Shows or Road to 100 above.</p>${tourBook()}</div>`; return; }
  const paint = all => { box.innerHTML = `<div class="tourwrap">${tourNextHero(t)}${tourProgress(t)}${tourShows(t, all)}${tourBook()}</div>`; wireYt(box); const b = box.querySelector('[data-tour-all]'); if (b) b.addEventListener('click', () => paint(true)); };
  paint(false);
}
