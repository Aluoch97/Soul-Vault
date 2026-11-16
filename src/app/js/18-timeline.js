/* ── Lore: "Year by year", one timeline for everything (Nov 2026, Nick) ──
   Releases, milestones (Settings > Milestones), press articles (`SITE.press`) and shows played (the Road to 100 tracker, `getTourFeed`) share ONE timeline, newest year first,
   so a milestone is seen next to the releases around it. Each year folds open and shut (the newest starts open); small chips filter by kind.
   Dates are kept as sortable keys `YYYY-MM-DD` (00 where the month or day is not known). All text is escaped; links must be https. */
const TL_KINDS = [['release', 'Releases'], ['milestone', 'Milestones'], ['press', 'Press'], ['show', 'Shows']];
const TL_KIND_LABEL = { release: 'Release', milestone: 'Milestone', press: 'Press', show: 'Show' };
const tlPad = (y, m, d) => y + '-' + String(m || 0).padStart(2, '0') + '-' + String(d || 0).padStart(2, '0');
// A readable date from a key: "Jan 14, 2026" / "Jan 2026" / "" (a bare year is already in the heading).
const tlLabel = k => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k || ''); if (!m || m[2] === '00') return ''; const mon = MS_MONTHS[+m[2] - 1]; return m[3] === '00' ? mon + ' ' + m[1] : mon + ' ' + (+m[3]) + ', ' + m[1]; };
function tlKeyOfText(s) {   // "2024", "2024-06", "2024-06-15" (milestones)
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(String(s || '')); return m ? tlPad(m[1], m[2], m[3]) : '';
}
function tlItems(L) {
  const out = [];
  L.eras.forEach(e => {
    const r = e.r, m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(r.release_date || ''));
    out.push({ kind: 'release', key: m ? tlPad(m[1], m[2], m[3]) : (/^\d{4}$/.test(String(r.year || '')) ? tlPad(r.year) : ''), r, songs: e.songs });
  });
  (S.milestones || []).forEach(m => out.push({ kind: 'milestone', key: tlKeyOfText(m.date), m }));
  ((typeof SITE !== 'undefined' && SITE.press) || []).forEach(p => {
    const t = Date.parse(String(p.date || '')), y = (/\b(19|20)\d\d\b/.exec(p.date || '') || [])[0];
    const d = isNaN(t) ? null : new Date(t);
    out.push({ kind: 'press', key: d ? tlPad(d.getFullYear(), d.getMonth() + 1, d.getDate()) : (y ? tlPad(y) : ''), p });
  });
  const tracker = ((S.tour && S.tour.shows) || []).filter(s => s.done && /^\d{4}-\d{2}-\d{2}$/.test(s.date || ''));
  tracker.forEach(s => out.push({ kind: 'show', key: s.date, s }));
  // Shows from before the tracker (`SITE.shows`, 03-home-tour-press.js). A date the tracker already has is not listed twice.
  ((typeof SITE !== 'undefined' && SITE.shows) || []).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s.date || '') && !tracker.some(t => t.date === s.date)).forEach(s => out.push({ kind: 'show', key: s.date, s }));
  return out;
}
function tlItemHtml(it) {
  const date = (it.kind === 'show' && it.s.posted && tlLabel(it.key) ? 'Video posted ' : '') + tlLabel(it.key), meta = `<span class="tlmeta"><i class="tlk ${it.kind}">${TL_KIND_LABEL[it.kind]}</i>${date ? `<span>${esc(date)}</span>` : ''}</span>`;
  let body = '';
  if (it.kind === 'release') {
    const r = it.r;
    body = `<button type="button" class="tltitle tlbtn" data-rel="${esc(r.release_id)}">${esc(r.title)}</button><span class="cs">${esc([typeOf(r), isUnrel(r) ? 'Unreleased' : '', it.songs + (it.songs === 1 ? ' song' : ' songs')].filter(Boolean).join(' · '))}</span>`;
  } else if (it.kind === 'milestone') {
    const m = it.m;
    body = `<b class="tltitle">${esc(m.title)}</b>${m.text ? `<p class="mstext">${esc(m.text)}</p>` : ''}
      ${m.audio ? `<div class="msvoice">${I.mic}<span>${esc(m.audio_label || 'Hear it')}</span><audio controls preload="none" src="${esc(msAudioUrl(m.audio))}" aria-label="${esc((m.audio_label || 'Voice note') + ' (voice note)')}"></audio></div>` : ''}
      ${safeHttps(m.url) ? `<a class="pill soft mslink" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">${esc(m.url_label || 'See more')}</a>` : ''}`;
  } else if (it.kind === 'press') {
    const p = it.p;
    body = `${safeHttps(p.url) ? `<a class="tltitle tla" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.title)}</a>` : `<b class="tltitle">${esc(p.title)}</b>`}<span class="cs">${esc([p.author, p.site].filter(Boolean).join(' · '))}</span>`;
  } else {
    const s = it.s;
    body = `<b class="tltitle">${esc((s.n ? 'Show #' + s.n + ': ' : '') + (s.title || s.venue))}</b><span class="cs">${esc([s.title ? s.venue : '', [s.city, s.state].filter(Boolean).join(', ')].filter(Boolean).join(' · '))}</span>${s.note ? `<p class="mstext">${esc(s.note)}</p>` : ''}${s.clip && /^[\w-]{6,20}$/.test(s.clip) ? `<span class="tlwatch"><button type="button" class="pill soft tlplay" data-tl-vid="${esc(s.clip)}" data-tl-title="${esc(s.title || s.venue)}">${I.play}Watch here</button><a class="tla cs" href="https://www.youtube.com/watch?v=${esc(s.clip)}" target="_blank" rel="noopener noreferrer">Open on YouTube</a></span>` : ''}`;
  }
  return `<li class="tli ${it.kind}"><span class="tldot" aria-hidden="true"></span>${meta}${body}</li>`;
}
function loreTimelineHtml(L) {
  const all = tlItems(L), have = new Set(all.map(i => i.kind)), f = have.has(S.loreTlF) ? S.loreTlF : 'all';
  const shown = all.filter(i => f === 'all' || i.kind === f), byYear = new Map();
  shown.forEach(i => { const y = i.key ? i.key.slice(0, 4) : 'Undated'; if (!byYear.has(y)) byYear.set(y, []); byYear.get(y).push(i); });
  const years = [...byYear.keys()].sort((a, b) => (a === 'Undated') - (b === 'Undated') || b.localeCompare(a));
  if (!years.length && !OWNER) return '';
  const order = { release: 0, milestone: 1, show: 2, press: 3 };
  const open = S.loreYears || new Set(years.slice(0, 1));
  const chips = have.size > 1 ? `<div class="tlchips" role="group" aria-label="Show"><button type="button" class="tlchip" data-tlf="all" aria-pressed="${f === 'all'}">All</button>${TL_KINDS.filter(k => have.has(k[0])).map(k => `<button type="button" class="tlchip" data-tlf="${k[0]}" aria-pressed="${f === k[0]}">${k[1]}</button>`).join('')}</div>` : '';
  const hint = OWNER ? `<p class="cs tlhint">${(S.milestones || []).length ? '' : 'Add milestones in Settings, then Milestones, and they show here beside your releases. '}<button type="button" class="linkish msedit" data-nav="milestones">Edit milestones</button></p>` : '';
  return `<section class="loretime" aria-label="Year by year"><h2 class="sh"><span><b>Year</b> by year</span></h2>${hint}${chips}
    ${years.map(y => { const items = byYear.get(y).slice().sort((a, b) => b.key.localeCompare(a.key) || order[a.kind] - order[b.kind]);
      return `<details class="tlyear" data-y="${esc(y)}"${open.has(y) ? ' open' : ''}><summary><b>${esc(y)}</b><span class="cs">${items.length} ${items.length === 1 ? 'moment' : 'moments'}</span></summary><ol class="tlitems">${items.map(tlItemHtml).join('')}</ol></details>`; }).join('')}</section>`;
}
function fillTimeline(L) {
  const box = $('#loreTimeline'); if (!box) return;
  const draw = () => {
    if (!box.isConnected) return;
    box.innerHTML = loreTimelineHtml(L);
    $$('[data-tlf]', box).forEach(b => b.addEventListener('click', () => { S.loreTlF = b.dataset.tlf; draw(); }));
    $$('.tlyear', box).forEach(d => d.addEventListener('toggle', () => { const s = S.loreYears || (S.loreYears = new Set([...$$('.tlyear[open]', box)].map(x => x.dataset.y))); if (d.open) s.add(d.dataset.y); else s.delete(d.dataset.y); }));
    $$('audio', box).forEach(a => a.addEventListener('play', () => {   // a voice note and a song never talk over each other
      try { if (!audio.paused) audio.pause(); } catch (e) {}
      $$('audio', box).forEach(o => { if (o !== a && !o.paused) o.pause(); });
    }));
  };
  draw();
  Promise.all([loadMilestones(), loadTour()]).then(([ms]) => { if (Array.isArray(ms)) S.milestones = ms; draw(); }).catch(() => {});   // the milestones and the shows arrive a moment later: draw again with them
}
// "Watch here": the video plays in a sheet inside the app (youtube-nocookie, only after the tap; a song that is playing is paused first).
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-tl-vid]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const id = b.dataset.tlVid; if (!/^[\w-]{6,20}$/.test(id)) return;
  try { if (!audio.paused) audio.pause(); } catch (er) {}
  const m = $('#modal'); m.className = 'modal';
  m.innerHTML = `<div class="sheet tlsheet" role="dialog" aria-modal="true" aria-label="${esc(b.dataset.tlTitle || 'Video')}"><h2>${esc(b.dataset.tlTitle || 'Video')}</h2>
    <div class="tlplayer"><iframe src="https://www.youtube-nocookie.com/embed/${esc(id)}?autoplay=1&rel=0&playsinline=1" title="${esc(b.dataset.tlTitle || 'Video')}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>
    <div class="end"><a class="pill soft" href="https://www.youtube.com/watch?v=${esc(id)}" target="_blank" rel="noopener noreferrer">Open on YouTube</a><button type="button" class="pill main" data-close>Close</button></div></div>`;
  m.hidden = false;
}, true);
