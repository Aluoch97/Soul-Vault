/* ── Sync lyrics for EVERY song (owner, Nov 2026, Nick) ──
   Settings > Fix songs > "Sync all lyrics". Goes through the songs one at a time and does what "Suggest timings" does for one song (18-lyric-suggest.js): the browser prepares
   the audio, Cloudflare AI listens (`lyricTimes`) and the words it heard are lined up with the SAVED lyrics. When enough of the words matched (LB_MIN) the timings are saved as synced
   lyrics (`saveLyrics`); otherwise the song is listed as "needs a look" and nothing is changed for it.
   Skipped on purpose: songs that are already synced (a hand sync is never overwritten), songs with no lyrics saved (nothing to line up), songs without a file on Cloudflare.
   It stops by itself when Cloudflare says today's free allowance is used up; run it again tomorrow and it carries on with the songs not done yet.
   "Undo this run" puts back the lyrics as they were (this session only). The screen has to stay open while it works. */
const LB_MIN = 0.6;   // at least 60% of the lyric words must match what was heard
const LB = { stop: false, running: false, done: [], review: [], failed: [], undo: [], quota: false };
function lbSongs() {
  const out = { ready: [], synced: 0, noLyrics: 0, noFile: 0, total: S.lib.tracks.length };
  S.lib.tracks.forEach(t => {
    const raw = String(t.lyrics || ''), lines = plainLyrics(raw).split('\n').map(x => x.trim()).filter(Boolean);
    if (lines.length < 2) { out.noLyrics++; return; }
    if (isSynced(raw)) { out.synced++; return; }
    const v = primaryOf(t);
    if (!v || !/^https:\/\/media\.soulnicolas\.com\//.test(v.url || '') || /^(YOUTUBE|SOUNDCLOUD)$/i.test(String(v.format || ''))) { out.noFile++; return; }
    out.ready.push({ t, v });
  });
  return out;
}
// Songs still waiting: ready to sync and not already flagged "needs a look" in this run.
const lbLeft = () => lbSongs().ready.filter(x => !LB.review.some(r => r.tid === x.t.track_id)).length;
const lbList = (title, rows, fmt) => rows.length ? `<h3>${esc(title)} (${rows.length})</h3><ul class="lblist">${rows.slice(0, 40).map(r => `<li>${fmt(r)}</li>`).join('')}${rows.length > 40 ? `<li class="cs">and ${rows.length - 40} more</li>` : ''}</ul>` : '';
function lbDraw() {
  const c = lbSongs(), list = $('#lbList'); if (!list) return;
  $('#lbInfo').innerHTML = `${c.total} songs: <b>${c.ready.length}</b> ready to sync, ${c.synced} already synced (kept as they are), ${c.noLyrics} with no lyrics saved yet, ${c.noFile} without a file on Cloudflare.`;
  list.innerHTML = lbList('Synced this run', LB.done, r => `<b>${esc(r.title)}</b> <span class="cs">${r.pct}% of the words matched</span>`)
    + lbList('Needs a look (nothing was changed)', LB.review, r => `<b>${esc(r.title)}</b> <span class="cs">${esc(r.why)}. Sync it by hand: play it, open Lyrics, tap Sync lyrics.</span>`)
    + lbList('Could not do', LB.failed, r => `<b>${esc(r.title)}</b> <span class="cs">${esc(r.why)}</span>`);
  $('#lbUndo').hidden = !LB.undo.length || LB.running;
}
async function lbRun() {
  const plan = lbSongs().ready, say = x => { const s = $('#lbSt'); if (s) s.textContent = x; };
  if (!plan.length) return say('Nothing to do: every song with lyrics and a file is already synced.');
  LB.stop = false; LB.running = true; LB.quota = false; $('#lbGo').hidden = true; $('#lbStop').hidden = false; $('#lbUndo').hidden = true;
  let fails = 0, n = 0;
  for (const it of plan) {
    if (LB.stop) break;
    n++; const t = it.t, bar = $('#lbFill'); if (bar) bar.style.width = Math.round(100 * (n - 1) / plan.length) + '%';
    const head = `Song ${n} of ${plan.length}: ${t.title}. `;
    try {
      const b64 = await suggestAudio(it.v.url, x => say(head + x));
      say(head + 'Cloudflare is listening…');
      const res = await run('lyricTimes', BOOT.key, t.track_id, b64), pct = res.total ? res.matched / res.total : 0, dur = durSecs(it.v.duration), late = dur && res.times[res.times.length - 1] > dur + 5;
      if (pct < LB_MIN || late) { LB.review.push({ tid: t.track_id, title: t.title, why: late ? 'the timings ran past the end of the song' : `only ${Math.round(pct * 100)}% of the words matched` }); fails = 0; lbDraw(); continue; }
      const lrc = res.lines.map((l, k) => fmtLrc(res.times[k]) + l).join('\n'), was = t.lyrics;
      await run('saveLyrics', BOOT.key, t.release_id, [{ track_id: t.track_id, lyrics: lrc }]);
      LB.undo.push({ tid: t.track_id, rid: t.release_id, was }); t.lyrics = lrc; LB.done.push({ title: t.title, pct: Math.round(pct * 100) }); fails = 0;
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (/allocation|neurons?|quota|allowance|daily limit|too many|rate limit|429|4006/i.test(msg)) { LB.quota = true; break; }
      if (/could not match|did not hear/i.test(msg)) LB.review.push({ tid: t.track_id, title: t.title, why: msg.replace(/\.\s*Sync it by hand\.?$/, '') });
      else { LB.failed.push({ title: t.title, why: msg.slice(0, 160) }); if (++fails >= 3) { LB.quota = false; say('Stopped after three songs in a row failed. The last problem: ' + msg.slice(0, 160)); break; } }
    }
    lbDraw();
  }
  LB.running = false; $('#lbStop').hidden = true; $('#lbGo').hidden = false; $('#lbGo').textContent = 'Start again'; lbDraw();
  const left = lbLeft(), bar = $('#lbFill'); if (bar) bar.style.width = left ? bar.style.width : '100%';
  if (LB.quota) say(`Cloudflare's free allowance for today looks used up. Nothing is lost: ${LB.done.length} synced so far, ${left} still to do. Come back tomorrow and tap Start again.`);
  else if (LB.stop) say(`Stopped. ${LB.done.length} synced this run, ${left} still to do.`);
  else if (!/^Stopped after three/.test(($('#lbSt') || {}).textContent || '')) say(`Done. ${LB.done.length} synced, ${LB.review.length} need a look${left ? `, ${left} could not be done` : ''}.`);
}
async function lbUndo() {
  const items = LB.undo.slice().reverse(); if (!items.length || !confirm(`Put the lyrics back as they were for ${items.length} ${items.length === 1 ? 'song' : 'songs'}?`)) return;
  $('#lbUndo').disabled = true;
  for (const u of items) { try { await run('saveLyrics', BOOT.key, u.rid, [{ track_id: u.tid, lyrics: u.was || '' }]); const t = trk(u.tid); if (t) t.lyrics = u.was || ''; } catch (e) { toast((e && e.message) || 'Could not put one back'); break; } }
  LB.undo = []; LB.done = []; $('#lbUndo').disabled = false; lbDraw(); const s = $('#lbSt'); if (s) s.textContent = 'Put back as they were.';
}
function openLyricBatch() {
  const m = $('#modal'); m.className = 'modal';
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Sync lyrics for every song"><h2>Sync all lyrics</h2>
    <p class="cs" id="lbInfo"></p>
    <p class="cs">Cloudflare's AI listens to each song and times your saved lyrics, line by line. A song is only changed when most of its words matched; the others are listed for you. Songs you already synced are never touched. Keep this screen open while it works, ideally on a computer: each song takes about half a minute, and Cloudflare's free daily allowance may cover only part of your songs per day.</p>
    <div class="msbar" style="height:6px;border-radius:6px;background:var(--raise);overflow:hidden"><i id="lbFill" style="display:block;height:100%;width:0;background:var(--red)"></i></div>
    <p class="cs" id="lbSt" role="status" aria-live="polite"></p><div id="lbList"></div>
    <div class="end"><button class="pill main" id="lbGo">Start</button><button class="pill soft" id="lbStop" hidden>Stop</button><button class="pill soft danger" id="lbUndo" hidden>Undo this run</button><button class="pill soft" data-close id="lbClose">Close</button></div></div>`;
  m.hidden = false; lbDraw();
  $('#lbGo').addEventListener('click', lbRun); $('#lbStop').addEventListener('click', () => { LB.stop = true; $('#lbSt').textContent = 'Stopping after this song…'; });
  $('#lbUndo').addEventListener('click', lbUndo); $('#lbClose').addEventListener('click', () => { LB.stop = true; });
}
