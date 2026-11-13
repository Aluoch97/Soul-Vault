/* ═════════ Website insights ═════════
   Part 1: the page tells the site which page is open and for how long (a random id for this browser and for this visit, the page, the seconds,
   phone / tablet / computer, and where the visitor came from on the first page of a visit). No name, no e-mail, no address. Skipped when the browser
   says "Do Not Track". Part 2: the owner's Website insights page (Settings > Fans & activity). */
const SITE_TRACK = !(navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.msDoNotTrack === '1');
const siteT = { path: '', view: '', secs: 0, sent: -1 };
const siteRand = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2));
function siteVisit() {   // a visit ends after 30 quiet minutes
  let v = null; try { v = JSON.parse(sessionStorage.getItem('sv_visit') || 'null'); } catch (e) { /* private mode */ }
  const now = Date.now(); if (!v || now - v.last > 30 * 60000) v = { id: siteRand(), first: true };
  v.last = now; try { sessionStorage.setItem('sv_visit', JSON.stringify(v)); } catch (e) { /* private mode */ }
  return v;
}
const siteDevice = () => innerWidth <= 760 ? 'phone' : (matchMedia('(pointer: coarse)').matches && innerWidth <= 1100 ? 'tablet' : 'desktop');
function siteSend(leaving) {
  if (!SITE_TRACK || !siteT.path || siteT.sent === siteT.secs) return;
  siteT.sent = siteT.secs;
  const args = [BOOT.key, BOOT.token, deviceId(), siteT.visit, siteT.view, siteT.path, siteT.secs, siteDevice(), siteT.ref];
  if (leaving && navigator.sendBeacon && BOOT.api) navigator.sendBeacon(BOOT.api, new Blob([JSON.stringify({ fn: 'siteView', args })], { type: 'text/plain' }));
  else run('siteView', ...args).catch(() => {});
}
function siteWatch() {   // the page that is open now (owner screens have no address and are not counted)
  if (!SITE_TRACK) return;
  const p = typeof pathFor === 'function' ? pathFor() : null;
  if (p === siteT.path) return;
  siteSend(false);
  siteT.path = p || ''; if (!p) return;
  const v = siteVisit(); let ref = '';
  if (v.first) { try { const h = new URL(document.referrer).hostname.replace(/^www\./, ''); if (h && h !== location.hostname.replace(/^www\./, '')) ref = h; } catch (e) { /* no referrer */ } v.first = false; try { sessionStorage.setItem('sv_visit', JSON.stringify(v)); } catch (e) { /* private mode */ } }
  Object.assign(siteT, { visit: v.id, view: siteRand(), secs: 0, sent: -1, ref: siteT.ref && !ref ? '' : ref });
  siteSend(false);                                                     // tells the site right away; the time is refreshed below
}
setInterval(() => { siteWatch(); if (siteT.path && document.visibilityState === 'visible') { siteT.secs++; if (siteT.secs % 15 === 0) siteSend(false); } }, 1000);
document.addEventListener('visibilitychange', () => { if (document.hidden) siteSend(true); });
addEventListener('pagehide', () => siteSend(true));

/* ── the owner's page ── */
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  .split .c { background: #f5c542; } .splitkey .k.c { background: #f5c542; }
  .cbars { display: grid; gap: 10px; margin: 6px 0 18px; }
  .cbar { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 12px; font-size: 14px; }
  .cbar span { overflow-wrap: anywhere; } .cbar b { font-variant-numeric: tabular-nums; }
  .cbar i { grid-column: 1 / -1; display: block; height: 6px; border-radius: 3px; background: rgba(255,255,255,.08); overflow: hidden; } .cbar i::after { content: ''; display: block; height: 100%; width: var(--w); background: var(--green-hi); border-radius: 3px; }
` }));
const siteTime = s => !s ? '0s' : s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + String(s % 60).padStart(2, '0') + 's';
async function renderSiteInsights() {
  clearPageBg();
  S.view = 'siteinsights'; renderChrome();
  S.siDays = S.siDays == null ? 30 : S.siDays;
  const rng = [[7, '7 days'], [30, '30 days'], [0, 'All time']];
  $('#main').innerHTML = `<div class="wrap">
    <button class="back" data-nav="vault">${I.back}Settings</button>
    <h1 class="page-h" style="padding-left:0"><b>Website</b> insights</h1>
    <section class="live" id="siLive" aria-live="polite" aria-label="On the site now"><div class="lv-h"><span class="dot" aria-hidden="true"></span><b id="siCount">Checking who is on the site…</b></div><ul id="siList" class="lv-list"></ul></section>
    <div class="ins-top"><div class="seg" role="group" aria-label="Time range">${rng.map(([d, l]) => `<button data-si-days="${d}" aria-pressed="${S.siDays === d}">${l}</button>`).join('')}</div>
      <label><input type="checkbox" id="siMine"${S.siMine ? ' checked' : ''}>Include my own visits</label></div>
    <div id="siBody"><p class="status" style="padding-left:0">Adding up visits…</p></div></div>`;
  window.scrollTo(0, 0);
  clearInterval(S.siLiveT); pollSiteLive(); S.siLiveT = setInterval(pollSiteLive, 20000);
  try { S.siData = await run('getSiteInsights', BOOT.key, S.siDays, !!S.siMine); siteInsightsBody(S.siData); }
  catch (e) { $('#siBody').innerHTML = `<p class="err">${esc(e.message || 'Could not load website insights.')}</p>`; }
}
async function pollSiteLive() {
  const box = $('#siLive');
  if (!box || S.view !== 'siteinsights') { clearInterval(S.siLiveT); S.siLiveT = null; return; }
  try {
    const r = await run('getSiteLive', BOOT.key, !!S.siMine); if (!$('#siLive')) return;
    $('#siCount').textContent = r.count ? `${r.count} on the site now` : 'Nobody is on the site right now';
    box.classList.toggle('on', r.count > 0);
    $('#siList').innerHTML = r.now.map(x => `<li><span class="t">${esc(x.page)}</span><span class="cs">${esc([x.city || 'Unknown location', x.device === 'phone' ? 'Phone' : x.device === 'tablet' ? 'Tablet' : 'Computer', agoText(x.ago)].join(' · '))}</span></li>`).join('');
  } catch (e) { if ($('#siCount')) $('#siCount').textContent = 'Could not check who is on the site'; }
}
function siteChart(perDay, key) {
  const W = 700, H = 140, n = perDay.length, max = Math.max(1, ...perDay.map(x => x[key])), bw = W / n, what = key === 'v' ? 'visitors' : 'page views', total = perDay.reduce((a, b) => a + b[key], 0);
  const label = d => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `<svg class="daychart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${what[0].toUpperCase() + what.slice(1)} per day: ${total} in total (${perDay.map(x => `${label(x.d)} ${x[key]}`).join(', ')})">
    ${perDay.map((x, i) => { const h = x[key] ? Math.max(4, (x[key] / max) * (H - 26)) : 3;
      return `<rect class="b${x[key] ? '' : ' z'}" x="${i * bw + 1}" y="${H - h}" width="${Math.max(1, bw - 2)}" height="${h}" rx="2"><title>${label(x.d)}: ${x[key]} ${what}</title></rect>`; }).join('')}
    </svg><div class="dayaxis" aria-hidden="true"><span>${esc(label(perDay[0].d))}</span><span>${esc(label(perDay[n - 1].d))}</span></div>`;
}
function siteInsightsBody(d) {
  const t = d.totals, p = d.prev, days = d.days;
  if (!t.views) { $('#siBody').innerHTML = `<div class="ins-empty">No visits ${days ? 'in this range' : 'yet'}${S.siMine ? '' : ' from visitors'}. They show up here within about a minute of someone opening the site.</div>`; return; }
  S.siMetric = S.siMetric || 'v';
  const ppv = x => x.visits ? Math.round(x.views / x.visits * 10) / 10 : 0;
  const ph = p ? { v: { v: p.visitors }, n: { v: p.visits }, w: { v: p.views }, pp: { v: ppv(p) }, av: { v: p.avgVisit }, ap: { v: p.avgPage } } : {};
  const kpi = (val, lab, chip) => `<div class="kpi"><b>${val}</b><span>${lab}</span>${chip || ''}</div>`;
  const table = (cap, head, rows) => `<h2 class="sh"><span>${cap}</span></h2><div class="ins-wrap"><table class="instable"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
  const pct = (n, of) => of ? Math.round(n / of * 100) : 0, au = d.audience, auT = au.newVisitors + au.returning, dv = d.devices, dvT = dv.phone + dv.tablet + dv.desktop;
  const bars = (rows, label) => `<div class="cbars">${rows.map(r => `<div class="cbar"><span>${esc(label(r))}</span><b>${r.n.toLocaleString()}</b><i style="--w:${pct(r.n, rows[0].n)}%"></i></div>`).join('')}</div>`;
  $('#siBody').innerHTML = `
    <div class="kpis">
      ${kpi(t.visitors.toLocaleString(), 'Visitors', deltaChip(t.visitors, ph.v, days))}
      ${kpi(t.visits.toLocaleString(), 'Visits', deltaChip(t.visits, ph.n, days))}
      ${kpi(t.views.toLocaleString(), 'Page views', deltaChip(t.views, ph.w, days))}
      ${kpi(ppv(t).toFixed(1), 'Pages per visit', deltaChip(ppv(t), ph.pp, days))}
      ${kpi(siteTime(t.avgVisit), 'Avg. visit time', deltaChip(t.avgVisit, ph.av, days))}
      ${kpi(siteTime(t.avgPage), 'Avg. time on a page', deltaChip(t.avgPage, ph.ap, days))}
    </div>
    <div class="seg chartseg" role="group" aria-label="Chart"><button data-si-metric="v" aria-pressed="${S.siMetric === 'v'}">Visitors</button><button data-si-metric="n" aria-pressed="${S.siMetric === 'n'}">Page views</button></div>
    <h2 class="sh"><span><b>${S.siMetric === 'v' ? 'Visitors' : 'Page views'}</b> per day</span></h2>${siteChart(d.perDay, S.siMetric)}
    ${d.pages.length ? table('<b>Top</b> pages', '<th class="rk">#</th><th>Page</th><th class="n">Views</th><th class="n">Visitors</th><th class="n">Avg. time</th>',
      d.pages.map((x, i) => `<tr><td class="rk">${i + 1}</td><td>${esc(x.page)}</td><td class="n">${x.views}</td><td class="n">${x.visitors}</td><td class="n">${siteTime(x.avg)}</td></tr>`).join('')) : ''}
    ${dvT ? `<h2 class="sh"><span><b>Phone,</b> tablet or computer</span></h2>
      <div class="split" role="img" aria-label="${dv.phone} visits on phones, ${dv.tablet} on tablets, ${dv.desktop} on computers"><span class="a" style="width:${pct(dv.phone, dvT)}%"></span><span class="c" style="width:${pct(dv.tablet, dvT)}%"></span><span class="b" style="width:${Math.max(0, 100 - pct(dv.phone, dvT) - pct(dv.tablet, dvT))}%"></span></div>
      <p class="splitkey"><span><i class="k a"></i>Phone <b>${pct(dv.phone, dvT)}%</b></span><span><i class="k c"></i>Tablet <b>${pct(dv.tablet, dvT)}%</b></span><span><i class="k b"></i>Computer <b>${pct(dv.desktop, dvT)}%</b></span></p>` : ''}
    ${d.cities.length ? `<h2 class="sh"><span><b>Where</b> from</span></h2>${bars(d.cities.map(c => ({ n: c.visitors, c })), r => [r.c.city || 'Unknown location', r.c.region, r.c.country && r.c.country !== 'US' ? r.c.country : ''].filter(Boolean).join(', '))}` : ''}
    ${d.sources.length ? `<h2 class="sh"><span><b>How</b> they found you</span></h2>${bars(d.sources.map(s => ({ n: s.visits, s })), r => r.s.name)}` : ''}
    ${days && auT ? `<h2 class="sh"><span><b>New</b> vs returning</span></h2>
      <div class="split" role="img" aria-label="${au.newVisitors} new visitors and ${au.returning} returning visitors"><span class="a" style="width:${pct(au.newVisitors, auT)}%"></span><span class="b" style="width:${100 - pct(au.newVisitors, auT)}%"></span></div>
      <p class="splitkey"><span><i class="k a"></i>New <b>${au.newVisitors.toLocaleString()}</b> (${pct(au.newVisitors, auT)}%)</span><span><i class="k b"></i>Returning <b>${au.returning.toLocaleString()}</b> (${pct(au.returning, auT)}%)</span></p>` : ''}
    <p class="cs">A visitor is one browser, counted once; one person on two devices counts twice. A visit ends after 30 quiet minutes. Time is the seconds a page was open and on screen. Cities come from Cloudflare and are approximate; no address is stored. Robots are left out. Days are Central time. Arrows compare with the same number of days just before.</p>`;
}
