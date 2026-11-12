const seriesOf = r => String((r && r.series_name) || '').trim();
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();
function romanVal(s) {
  const v = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 }; let t = 0; s = s.toLowerCase();
  for (let i = 0; i < s.length; i++) { const a = v[s[i]], b = v[s[i + 1]] || 0; t += a < b ? -a : a; }
  return t;
}
const PART_WORDS = { prelude: -2, prologue: -2, intro: -1, introduction: -1, interlude: 1.5, outro: 999, finale: 1000, epilogue: 1001 };
function partRank(r) {
  const p = String(r.series_part || '').trim(); if (!p) return null;
  if (/^\d+(\.\d+)?$/.test(p)) return parseFloat(p);
  if (/^[ivxlcdm]+$/i.test(p)) return romanVal(p);
  const w = PART_WORDS[p.toLowerCase()]; return w == null ? null : w;
}
const relDateKey = r => (/^\d{4}-\d{2}-\d{2}/.test(String(r.release_date || '')) ? String(r.release_date).slice(0, 10) : String(r.year || 0) + '-00-00');
function partLabel(r) {
  const p = String(r.series_part || '').trim(); if (!p) return '';
  return /^\d+(\.\d+)?$/.test(p) || /^[ivxlcdm]+$/i.test(p) ? 'Part ' + p : p;
}
// Every visible release in a series, in order. Fans see sealed parts (as locked) but never hidden ones.
function seriesParts(name) {
  return S.lib.releases.filter(x => sameName(seriesOf(x), name) && (OWNER || x.locked || tracksOf(x.release_id).length))
    .sort((a, b) => { const ra = partRank(a), rb = partRank(b);
      if (ra != null && rb != null && ra !== rb) return ra - rb;
      return relDateKey(a).localeCompare(relDateKey(b)) || String(a.title).localeCompare(String(b.title)); });
}
function partSub(p) {
  if (!OWNER && p.locked) return 'Unlocks ' + whenLabel(p.unlock_at);
  return String(p.year || '');
}
// A sealed part's cover is blurred everywhere fans can see it (same look as the sealed page and the "coming attractions" card).
const sealedCov = p => (!OWNER && p && p.locked) ? ' sealedcov' : '';
function seriesPanel(r) {
  const name = seriesOf(r); if (!name) return '';
  const parts = seriesParts(name), i = parts.findIndex(p => p.release_id === r.release_id);
  const prev = parts[i - 1], next = parts[i + 1], lbl = partLabel(r);
  return `<section class="seriespanel" aria-label="${esc(lbl ? lbl + ' of ' + name : name)}">
    <div class="shd"><span class="stag">${I.layers}Series</span>
      <span class="stitle">${lbl ? esc(lbl) + ' of ' : ''}<b>${esc(name)}</b></span>
      <span class="cs">${parts.length === 1 ? '1 part so far' : parts.length + ' parts'}</span></div>
    <ol class="sparts">${parts.map(p => `<li><button class="spart${p.release_id === r.release_id ? ' cur' : ''}" data-rel="${esc(p.release_id)}"${p.release_id === r.release_id ? ' aria-current="true"' : ''}
        aria-label="${esc((partLabel(p) ? partLabel(p) + ': ' : '') + p.title)}${p.locked && !OWNER ? ', sealed' : ''}">
      <span class="sart"><img class="art${sealedCov(p)}" data-cover="${esc(p.cover_file_id)}" alt="">${!OWNER && p.locked ? `<span class="lock">${I.lock}</span>` : ''}</span>
      ${partLabel(p) ? `<span class="sp">${esc(partLabel(p))}</span>` : ''}<span class="st">${esc(p.title)}</span>
      <span class="cs">${esc(partSub(p))}</span>${OWNER && hidden(p) ? '<span class="hid">Hidden from fans</span>' : ''}</button></li>`).join('')}</ol>
    ${prev || next ? `<div class="snav">${prev ? `<button class="pill soft" data-rel="${esc(prev.release_id)}">${I.back}${esc(partLabel(prev) || prev.title)}</button>` : ''}
      ${next ? `<button class="pill soft next" data-rel="${esc(next.release_id)}">${esc(partLabel(next) || next.title)}<span style="display:grid;transform:scaleX(-1)">${I.back}</span></button>` : ''}</div>` : ''}
  </section>`;
}
function seriesTag(r) {
  const name = seriesOf(r); if (!name) return '';
  return `<span class="as sr">${esc(name)}${partLabel(r) ? ' · ' + esc(partLabel(r)) : ''}</span>`;
}
function seriesRow() {
  const names = [];
  S.lib.releases.forEach(r => { const n = seriesOf(r); if (n && !names.some(x => sameName(x, n))) names.push(n); });
  const cards = names.map(n => ({ n, parts: seriesParts(n) })).filter(x => x.parts.length >= 2);
  if (!cards.length) return '';
  return `<h2 class="sh"><span><b>Series</b> and sagas</span></h2>
    <div class="hrow">${cards.map(({ n, parts }) => {
      const years = parts.map(p => Number(p.year)).filter(Boolean), span = years.length ? (Math.min(...years) === Math.max(...years) ? Math.min(...years) : Math.min(...years) + '–' + Math.max(...years)) : '';
      return `<button class="scard" data-series="${esc(n)}" aria-label="${esc(n)}, ${parts.length} parts. Tap to play the whole series or choose a project">
        <div class="fan" aria-hidden="true">${parts.slice(0, 4).map((p, k) => `<img class="art${sealedCov(p)}" data-cover="${esc(p.cover_file_id)}" alt="" style="left:${k * 52}px;z-index:${10 - k}">`).join('')}</div>
        <div><div class="nm">${esc(n)}</div><div class="cs">${parts.length} parts${span ? ' · ' + span : ''}</div></div>
        <div class="chips">${parts.map(p => `<span class="chip">${esc(partLabel(p) ? partLabel(p) + ': ' + p.title : p.title)}${!OWNER && p.locked ? ' 🔒' : ''}</span>`).join('')}</div>
      <span class="serhint">Tap to play or choose</span></button>`; }).join('')}</div>`;
}
function seriesFields(r) {
  const names = []; S.lib.releases.forEach(x => { const n = seriesOf(x); if (n && !names.some(y => sameName(y, n))) names.push(n); });
  return `<div class="nrrow seriesrow">
    <label>Series (releases with the same name are linked)<input class="field" id="wSeries" list="seriesNames" maxlength="80" value="${esc(r.series_name || '')}" placeholder="soul Trilogy"></label>
    <label>Part<input class="field" id="wPart" maxlength="12" value="${esc(String(r.series_part || ''))}" placeholder="1, II, Prelude"></label>
  </div><datalist id="seriesNames">${names.map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist>`;
}


/* ═════════ Series transition: end of one part → the next part ═════════ */
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  #sxOverlay { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; overflow: hidden; background: #050505; color: #fff;
               opacity: 0; transition: opacity .5s ease; }
  #sxOverlay.show { opacity: 1; }
  #sxOverlay .bg { position: absolute; inset: -8%; background: center / cover no-repeat; filter: blur(38px) saturate(1.4) brightness(.55); transform: scale(1.15);
                   transition: transform 8s linear, opacity 1s ease; opacity: 0; }
  #sxOverlay.show .bg { opacity: 1; transform: scale(1.02); }
  #sxOverlay .flag { position: absolute; left: 0; right: 0; top: 0; height: 5px; background: var(--flag); }
  #sxOverlay .stage { position: relative; display: grid; justify-items: center; gap: 18px; padding: 24px; text-align: center; max-width: 560px; }
  #sxOverlay .covers { position: relative; width: min(260px, 62vw); aspect-ratio: 1; }
  #sxOverlay .covers img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; border-radius: 18px; box-shadow: 0 30px 70px -20px #000; }
  #sxOverlay .old { animation: sxOut 1.4s .2s cubic-bezier(.6,0,.3,1) forwards; }
  #sxOverlay .new { opacity: 0; animation: sxIn 1.2s 1.1s cubic-bezier(.2,.7,.2,1) forwards; }
  @keyframes sxOut { to { transform: translateX(-70%) rotate(-8deg) scale(.82); opacity: 0; } }
  @keyframes sxIn { from { transform: translateY(40px) scale(.9); opacity: 0; } to { transform: none; opacity: 1; } }
  #sxOverlay .kick { font-size: 12px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; color: rgba(255,255,255,.75); }
  #sxOverlay .done { font: 400 16px var(--serif); color: rgba(255,255,255,.8); opacity: 1; animation: sxFade .6s 1.4s forwards; }
  #sxOverlay .next { font: 800 clamp(24px, 6vw, 38px)/1.1 var(--serif); opacity: 0; animation: sxUp .8s 1.6s forwards; }
  #sxOverlay .next small { display: block; font: 800 13px var(--sans); letter-spacing: .14em; text-transform: uppercase; color: var(--green-hi); margin-bottom: 6px; }
  @keyframes sxFade { to { opacity: .45; } }
  @keyframes sxUp { from { transform: translateY(14px); opacity: 0; } to { transform: none; opacity: 1; } }
  #sxOverlay .sxrow { display: flex; gap: 10px; align-items: center; justify-content: center; flex-wrap: wrap; opacity: 0; animation: sxUp .6s 2s forwards; }
  #sxOverlay .ring { position: relative; width: 58px; height: 58px; flex: none; }
  #sxOverlay .ring svg { width: 58px; height: 58px; transform: rotate(-90deg); }
  #sxOverlay .ring circle { fill: none; stroke-width: 4; }
  #sxOverlay .ring .trk { stroke: rgba(255,255,255,.2); }
  #sxOverlay .ring .val { stroke: var(--red-hi); stroke-linecap: round; stroke-dasharray: 163.4; stroke-dashoffset: 0; }
  #sxOverlay .ring span { position: absolute; inset: 0; display: grid; place-items: center; font-weight: 800; font-variant-numeric: tabular-nums; }
  #sxOverlay .pill { min-height: 48px; }
  #sxOverlay .pill.soft { background: rgba(255,255,255,.12); color: #fff; }
  @media (prefers-reduced-motion: reduce) {
    #sxOverlay .old, #sxOverlay .new, #sxOverlay .next, #sxOverlay .sxrow, #sxOverlay .done { animation: none; opacity: 1; }
    #sxOverlay .old { display: none; }
    #sxOverlay .bg { transition: none; transform: none; }
  }
` }));

const SX_SECONDS = 8;
// The part that follows r in its series (as this viewer can see it), or null.
function nextPart(r) {
  const name = seriesOf(r); if (!name) return null;
  const parts = seriesParts(name), i = parts.findIndex(p => p.release_id === r.release_id);
  return i > -1 ? parts[i + 1] || null : null;
}
// Called when the queue runs out. Returns true if a series transition took over.
function maybeSeriesTransition() {
  const n = S.now; if (!n) return false;
  const r = rel(n.t.release_id), nx = r && nextPart(r); if (!nx) return false;
  const sealed = !OWNER && nx.locked;
  if (document.hidden && !sealed) { continueSeries(nx); return true; }   // locked phone / background: keep the music going
  showSeriesTransition(r, nx, sealed);
  return true;
}
function continueSeries(nx) {
  closeSeriesTransition();
  if (S.view === 'release') renderRelease(nx.release_id);
  playRelease(nx.release_id);
  toast(`${partLabel(nx) || 'Next part'}: ${nx.title}`);
}
function closeSeriesTransition() {
  clearInterval(S.sxTimer); S.sxTimer = null;
  const o = $('#sxOverlay'); if (!o) return;
  o.classList.remove('show'); setTimeout(() => o.remove(), 450);
  if (S.sxReturn && document.body.contains(S.sxReturn)) S.sxReturn.focus();
}
function showSeriesTransition(r, nx, sealed) {
  closeSeriesTransition(); $$('#sxOverlay').forEach(x => x.remove());
  S.sxReturn = document.activeElement;
  const name = seriesOf(r), doneLbl = partLabel(r) ? `${partLabel(r)} complete` : `${r.title} complete`;
  const o = document.createElement('div');
  o.id = 'sxOverlay'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-labelledby', 'sxNext');
  o.innerHTML = `<div class="bg" id="sxBg"></div><div class="flag" aria-hidden="true"></div>
    <div class="stage">
      <div class="kick">${I.layers ? '' : ''}${esc(name)}</div>
      <div class="covers" aria-hidden="true"><img class="old" id="sxOld" alt=""><img class="new" id="sxNew" alt=""></div>
      <div class="done">${esc(doneLbl)}</div>
      <div class="next" id="sxNext"><small>${sealed ? 'Coming next' : 'Up next'}</small>${esc((partLabel(nx) ? partLabel(nx) + ' · ' : '') + nx.title)}</div>
      <div class="sxrow">${sealed
        ? `<p class="cs" style="width:100%;color:rgba(255,255,255,.8);margin:0">Sealed until ${esc(whenLabel(nx.unlock_at))}.</p>
           <button class="pill main" data-sx-open="${esc(nx.release_id)}">See the countdown</button><button class="pill soft" data-sx-close>Not now</button>`
        : `<span class="ring" aria-hidden="true"><svg viewBox="0 0 58 58"><circle class="trk" cx="29" cy="29" r="26"/><circle class="val" id="sxVal" cx="29" cy="29" r="26"/></svg><span id="sxSec">${SX_SECONDS}</span></span>
           <button class="pill main" data-sx-play="${esc(nx.release_id)}" aria-label="Play ${esc(partLabel(nx) || 'the next part')} now">Play now</button><button class="pill soft" data-sx-close>Not now</button>`}</div>
      <p class="sr" aria-live="assertive" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">${esc(doneLbl)}. ${sealed ? 'Next part is sealed.' : `Up next: ${partLabel(nx) || ''} ${nx.title}, starting in ${SX_SECONDS} seconds.`}</p>
    </div>`;
  document.body.appendChild(o);
  setCover($('#sxOld'), r.cover_file_id, true);
  setCover($('#sxNew'), nx.cover_file_id, true, () => { const u = $('#sxNew').src; if (u) $('#sxBg').style.backgroundImage = `url("${u}")`; });
  requestAnimationFrame(() => o.classList.add('show'));
  o.querySelector('.pill.main').focus();
  if (sealed) return;
  const started = Date.now();
  S.sxTimer = setInterval(() => {
    const left = Math.max(0, SX_SECONDS - (Date.now() - started) / 1000);
    const sec = $('#sxSec'), val = $('#sxVal');
    if (sec) sec.textContent = Math.ceil(left);
    if (val) val.style.strokeDashoffset = String(163.4 * (1 - left / SX_SECONDS));
    if (left <= 0) continueSeries(nx);
  }, 100);
}
document.addEventListener('keydown', e => {
  if (!$('#sxOverlay')) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeSeriesTransition(); }
  else if (e.key === 'Tab') {   // keep focus inside the transition
    const f = [...$$('#sxOverlay button')]; if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  }
}, true);
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-sx-play],[data-sx-close],[data-sx-open]'); if (!b) return;
  e.stopPropagation();
  if (b.dataset.sxPlay) continueSeries(rel(b.dataset.sxPlay));
  else if (b.dataset.sxOpen) { closeSeriesTransition(); if (!$('#np').hidden) closeNp(); renderRelease(b.dataset.sxOpen); }
  else closeSeriesTransition();
}, true);


/* ═════════ Round 1: backups button, continue listening, lyric search ═════════ */
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  .resume { display: grid; grid-template-columns: 56px minmax(0,1fr) auto; gap: 12px; align-items: center; margin: 4px 0 14px; padding: 10px 12px;
            border-radius: 16px; border: 1px solid rgba(52,194,122,.35); background: linear-gradient(90deg, rgba(8,122,59,.18), rgba(0,0,0,.15)); }
  .resume .art { width: 56px; height: 56px; border-radius: 10px; }
  .resume .k { font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: var(--green-hi); }
  .resume .t { font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .resume .bar { height: 3px; border-radius: 2px; background: rgba(255,255,255,.15); margin-top: 6px; overflow: hidden; }
  .resume .bar i { display: block; height: 100%; background: var(--green-hi); }
  .resume .x { width: 40px; height: 40px; }
  .resume .go2 { display: flex; gap: 6px; align-items: center; }
  @media (min-width: 0px) {
    .resume { grid-template-columns: 56px minmax(0,1fr); }
    .resume .go2 { grid-column: 1 / -1; }
    .resume .go2 .pill { flex: 1; justify-content: center; }
  }
  .lysnip { margin-top: 4px; font-size: 13px; color: var(--dim); font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lysnip mark { background: rgba(240,48,79,.3); color: #fff; border-radius: 3px; padding: 0 2px; font-style: normal; }
` }));

/* ── backups ── */
function backupLine() {
  const at = S.lib.last_backup ? new Date(S.lib.last_backup) : null;
  return at && !isNaN(at) ? 'last ' + at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + (S.lib.nightly_backup ? ' · nightly on' : '') : (S.lib.nightly_backup ? 'nightly on' : 'never');
}
async function doBackup(btn) {
  btn.disabled = true; const cs = btn.querySelector('.cs'); if (cs) cs.textContent = 'Backing up…';
  try {
    const b = await run('backupNow', BOOT.key);
    S.lib.last_backup = b.at; S.lib.backup_folder = b.folderUrl;
    toast(`Backed up: ${b.name}`);
  } catch (e) { toast(e.message || 'The backup did not finish'); }
  btn.disabled = false; if (cs) cs.textContent = backupLine();
}

/* ── continue where you left off (saved on this device) ── */
const resumeKey = () => recentKey() + ':resume';
function saveResume(force) {
  const n = S.now; if (!n || audio.src === SILENT || !audio.duration) return;
  if (!force && Date.now() - (S.resumeSaved || 0) < 5000) return;
  S.resumeSaved = Date.now();
  const t = audio.currentTime, left = audio.duration - t;
  const last = S.qi >= S.queue.length - 1;
  if (last && left < 15) { ls.set(resumeKey(), null); return; }   // finished everything: nothing to resume
  // nearly done with this song: resume at the start of the next one instead of replaying the ending
  const qi = left < 15 ? S.qi + 1 : S.qi;
  ls.set(resumeKey(), { q: S.queue.slice(0, 200), qi, t: left < 15 ? 0 : Math.max(0, t - 2), vid: S.queue[qi], at: Date.now() });
}
function resumeState() {
  const r = ls.get(resumeKey(), null);
  if (!r || !r.q || !r.q.length) return null;
  const v = ver(r.q[r.qi]); if (!v) return null;
  const t = trk(v.track_id); if (!t || hidden(t)) return null;
  if (Date.now() - (r.at || 0) > 60 * 864e5) return null;   // older than 60 days: let it go
  return Object.assign(r, { v, tr: t, rl: rel(t.release_id) });
}
function resumeCard() {
  const r = resumeState(); if (!r || (S.now && S.now.v.version_id === r.v.version_id)) return '';
  const total = durSecs(r.v.duration), pct = total ? Math.min(100, Math.round(r.t / total * 100)) : 0;
  return `<section class="resume" aria-label="Continue listening">
    <img class="art" data-cover="${esc(artFor(r.tr))}" alt="">
    <div style="min-width:0"><div class="k">Continue listening</div><div class="t">${esc(r.tr.title)}</div>
      <div class="cs">${esc(fmt(r.t))}${r.v.duration ? ' of ' + esc(r.v.duration) : ''} · ${esc((r.rl || {}).title || '')}</div>
      ${pct ? `<div class="bar" aria-hidden="true"><i style="width:${pct}%"></i></div>` : ''}</div>
    <div class="go2"><button class="pill main" data-resume>${I.play}Resume</button>
      <button class="ib x" data-resume-x aria-label="Dismiss continue listening">${I.x || '✕'}</button></div>
  </section>`;
}
function doResume() {
  const r = resumeState(); if (!r) return;
  const q = r.q.filter(ver);
  const qi = Math.max(0, q.indexOf(r.q[r.qi]));
  S.resumeAt = { vid: r.q[r.qi], t: r.t };
  playQueue(q, qi);
  const card = $('.resume'); if (card) card.remove();
}

/* ── search inside lyrics ── */
function lyricSnippet(t, q) {
  const line = plainLyrics(t.lyrics).split('\n').find(l => l.toLowerCase().includes(q)); if (!line) return '';
  const i = line.toLowerCase().indexOf(q);
  const a = Math.max(0, i - 40), b = Math.min(line.length, i + q.length + 50);
  return `${a ? '…' : ''}${esc(line.slice(a, i))}<mark>${esc(line.slice(i, i + q.length))}</mark>${esc(line.slice(i + q.length, b))}${b < line.length ? '…' : ''}`;
}
function lyricHits(q, exclude) {
  if (q.length < 3) return [];
  const skip = new Set(exclude.map(t => t.track_id));
  return S.lib.tracks.filter(t => !skip.has(t.track_id) && !hidden(t) && primaryOf(t) && plainLyrics(t.lyrics).toLowerCase().includes(q)).slice(0, 12);
}
function lyricRow(t, q) {
  return trackRow(t, true).replace('\n    </div>\n    <span class="dur">', `\n      <div class="lysnip">${lyricSnippet(t, q)}</div>\n    </div>\n    <span class="dur">`);
}


/* ═════════ Listening insights ═════════ */
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  .ins-top { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; margin: 6px 0 14px; }
  .ins-top label { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--dim); font-weight: 600; }
  .ins-top input { width: 18px; height: 18px; accent-color: var(--brass); }
  .kpis { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 10px; margin-bottom: 18px; }
  .kpi { padding: 14px; border-radius: 16px; border: 1px solid var(--line); background: rgba(255,255,255,.03); }
  .kpi b { display: block; font: 800 28px/1.1 var(--serif); font-variant-numeric: tabular-nums; }
  .kpi span { font-size: 12px; color: var(--dim); font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
  .daychart { width: 100%; height: 124px; display: block; margin: 4px 0 4px; }
  .dayaxis { display: flex; justify-content: space-between; font-size: 12px; color: var(--dim); margin-bottom: 18px; }
  .daychart rect.b { fill: var(--red-hi); } .daychart rect.b.z { fill: rgba(255,255,255,.08); }
  .daychart text { fill: var(--dim); font-size: 10px; font-family: var(--sans); }
  .instable { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; }
  .instable th { text-align: left; font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--dim); padding: 6px 8px; border-bottom: 1px solid var(--line); }
  .instable td { padding: 9px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  .instable td.n, .instable th.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .instable .sub { display: block; font-size: 12px; color: var(--dim); }
  .instable .rk { color: var(--dim); width: 28px; font-variant-numeric: tabular-nums; }
  .ins-wrap { overflow-x: auto; }
  .ins-empty { padding: 30px 16px; text-align: center; border: 1px dashed var(--line); border-radius: 16px; color: var(--dim); }
  .privnote { text-align: center; font-size: 12px; margin: 24px 0 8px; }
  @media (min-width: 0px) { .kpis { grid-template-columns: repeat(2, minmax(0,1fr)); } .kpi b { font-size: 24px; }
    .instable { font-size: 13px; } .instable th { font-size: 10px; letter-spacing: .04em; padding: 6px 4px; } .instable td { padding: 8px 4px; }
    .instable .rk { width: 18px; } }
` }));
I.chart = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>';

/* ── counting plays (sent in small batches) ── */
const LQ_KEY = 'sv_listen_queue';
function deviceId() {
  let id = ls.get('sv_device', '');
  if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2)); ls.set('sv_device', id); }
  return id;
}
function listenStart() {
  const n = S.now; if (!n) return;
  S.lt = { v: n.v.version_id, heard: 0, last: audio.currentTime };
}
function listenTick() {
  const lt = S.lt; if (!lt || audio.paused || !S.now || S.now.v.version_id !== lt.v) return;
  if (lt.last == null) { lt.last = audio.currentTime; return; }   // just after a jump: start measuring again from here
  const d = audio.currentTime - lt.last; lt.last = audio.currentTime;
  // jumps (seeking) are excluded by the seeking event; this cap is only a safety net, scaled to playback speed
  if (d > 0 && d < 2 * Math.max(1, audio.playbackRate || 1) + 1) lt.heard += d;
}
function listenEnd(finished) {
  const lt = S.lt; S.lt = null; if (!lt) return;
  const dur = audio.duration && isFinite(audio.duration) ? audio.duration : durSecs((ver(lt.v) || {}).duration) || 0;
  const heard = lt.heard;
  let o = heard >= 30 ? 'partial' : 'skip';
  if (finished && heard >= Math.min(30, dur * 0.5)) o = 'complete';
  if (o === 'skip' && heard < 3) return;   // an accidental tap, not a skip
  const q = ls.get(LQ_KEY, []);
  q.push({ v: lt.v, o, s: Math.round(heard), p: dur ? Math.min(100, Math.round(heard / dur * 100)) : 0, t: Date.now(),
           d: matchMedia('(max-width: 760px)').matches ? 'phone' : 'desktop' });
  ls.set(LQ_KEY, q.slice(-200));
  if (q.length >= 10) flushListens();
}
function listenPayload(q) { return q.map(e => Object.assign({}, e, { ago: Math.max(0, (Date.now() - e.t) / 1000) })); }
async function flushListens() {
  if (S.lqBusy) return;
  const q = ls.get(LQ_KEY, []); if (!q.length) return;
  S.lqBusy = true;
  try {
    await run('logListens', BOOT.key, BOOT.token, deviceId(), listenPayload(q));
    const now = ls.get(LQ_KEY, []); ls.set(LQ_KEY, now.slice(q.length));   // keep anything added while sending
  } catch (e) { /* stays queued; retried on the next flush */ }
  S.lqBusy = false;
}
// Leaving the page: count the current song and hand the batch off even as the tab closes.
function flushOnLeave() {
  if (S.lt) listenEnd(false);
  const q = ls.get(LQ_KEY, []); if (!q.length || !BOOT.api || !navigator.sendBeacon) return;
  const body = JSON.stringify({ fn: 'logListens', args: [BOOT.key, BOOT.token, deviceId(), listenPayload(q)] });
  if (navigator.sendBeacon(BOOT.api, new Blob([body], { type: 'text/plain' }))) ls.set(LQ_KEY, []);
}
setInterval(flushListens, 60000);
setTimeout(() => { initVolume(); syncModes(); }, 0);
setTimeout(flushListens, 8000);   // anything left over from last time

/* ── the Insights page (you only) ── */
async function renderInsights() {
  clearPageBg();
  S.view = 'insights'; renderChrome();
  S.insDays = S.insDays == null ? 30 : S.insDays;
  const rng = [[7, '7 days'], [30, '30 days'], [0, 'All time']];
  $('#main').innerHTML = `<div class="wrap">
    <button class="back" data-nav="vault">${I.back}Settings</button>
    <h1 class="page-h" style="padding-left:0"><b>Listening</b> insights</h1>
    <div class="ins-top"><div class="seg" role="group" aria-label="Time range">${rng.map(([d, l]) => `<button data-ins-days="${d}" aria-pressed="${S.insDays === d}">${l}</button>`).join('')}</div>
      <label><input type="checkbox" id="insMine"${S.insMine ? ' checked' : ''}>Include my own plays</label></div>
    <div id="insBody"><p class="status" style="padding-left:0">Adding up plays…</p></div></div>`;
  window.scrollTo(0, 0);
  try { insightsBody(await run('getInsights', BOOT.key, S.insDays, !!S.insMine)); }
  catch (e) { $('#insBody').innerHTML = `<p class="err">${esc(e.message || 'Could not load insights.')}</p>`; }
}
function dayChart(perDay) {
  const W = 700, H = 140, n = perDay.length, max = Math.max(1, ...perDay.map(x => x.n)), bw = W / n;
  const total = perDay.reduce((a, b) => a + b.n, 0);
  const label = d => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `<svg class="daychart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Plays per day: ${total} plays from ${label(perDay[0].d)} to ${label(perDay[n - 1].d)}, busiest day ${max} plays.">
    ${perDay.map((x, i) => { const h = x.n ? Math.max(4, (x.n / max) * (H - 26)) : 3;
      return `<rect class="b${x.n ? '' : ' z'}" x="${i * bw + 1}" y="${H - h}" width="${Math.max(1, bw - 2)}" height="${h}" rx="2"><title>${label(x.d)}: ${x.n} plays</title></rect>`; }).join('')}
    </svg><div class="dayaxis" aria-hidden="true"><span>${esc(label(perDay[0].d))}</span><span>${esc(label(perDay[n - 1].d))}</span></div>`;
}
function insightsBody(d) {
  const t = d.totals, hrs = t.seconds / 3600;
  if (!t.plays && !t.skips) {
    $('#insBody').innerHTML = `<div class="ins-empty">No plays ${d.days ? 'in this range' : 'yet'}${S.insMine ? '' : ' from fans'}. Plays show up here within about a minute of someone listening.</div>`;
    return;
  }
  const table = (cap, head, rows) => `<h2 class="sh"><span>${cap}</span></h2><div class="ins-wrap"><table class="instable"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
  $('#insBody').innerHTML = `
    <div class="kpis">
      <div class="kpi"><b>${t.plays.toLocaleString()}</b><span>Plays</span></div>
      <div class="kpi"><b>${t.listeners.toLocaleString()}</b><span>Listeners</span></div>
      <div class="kpi"><b>${hrs < 10 ? hrs.toFixed(1) : Math.round(hrs).toLocaleString()}</b><span>Hours listened</span></div>
      <div class="kpi"><b>${t.finishRate}%</b><span>Finish rate</span></div>
    </div>
    <h2 class="sh"><span><b>Plays</b> per day</span></h2>${dayChart(d.perDay)}
    ${d.songs.length ? table('<b>Top</b> songs', '<th class="rk">#</th><th>Song</th><th class="n">Plays</th><th class="n">Finished</th><th class="n">Skipped</th>',
      d.songs.map((s, i) => `<tr><td class="rk">${i + 1}</td><td>${esc(s.title)}<span class="sub">${esc(s.release)}</span></td><td class="n">${s.plays}</td><td class="n">${s.finish}%</td><td class="n">${s.skip}%</td></tr>`).join('')) : ''}
    ${d.skipped.length ? table('<b>Most</b> skipped', '<th>Song</th><th class="n">Skipped</th><th class="n">Times heard</th>',
      d.skipped.map(s => `<tr><td>${esc(s.title)}<span class="sub">${esc(s.release)}</span></td><td class="n">${s.skip}%</td><td class="n">${s.heard}</td></tr>`).join('')) : ''}
    ${d.releases.length ? table('<b>Top</b> releases', '<th class="rk">#</th><th>Release</th><th class="n">Plays</th>',
      d.releases.map((r, i) => `<tr><td class="rk">${i + 1}</td><td>${esc(r.title)}</td><td class="n">${r.plays}</td></tr>`).join('')) : ''}
    ${d.links.length ? table('<b>By</b> share link', '<th>Link</th><th class="n">Plays</th><th class="n">Listeners</th>',
      d.links.map(l => `<tr><td>${esc(l.label)}${l.active ? '' : '<span class="sub">switched off</span>'}</td><td class="n">${l.plays}</td><td class="n">${l.listeners}</td></tr>`).join('')) : ''}
    <p class="cs">A play is 30 seconds or more. Shorter listens you moved on from count as skips. Listeners are counted by device, without names.</p>`;
}


