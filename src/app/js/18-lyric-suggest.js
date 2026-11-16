/* ── "Suggest timings" for lyrics (owner only, Nov 2026) ──
   Next to "Sync lyrics" under Now Playing. The browser shrinks the playing version to a small mono MP3 (16 kHz), the edge call `lyricTimes` lets Cloudflare's speech model
   listen to it and lines the words it heard up with the saved lyrics, and the result opens in the same "All lines timed, save these?" screen as hand syncing.
   Nothing is saved until the owner taps Save. Needs the Workers AI binding `AI` on the Pages project; without it the call says how to add it. */
function suggestSetNote(msg) { const n = $('#lyNote'); if (n) { n.hidden = false; n.innerHTML = `<span role="status" aria-live="polite">${esc(msg)}</span>`; } }

// Decodes the song, mixes it to mono, resamples to 16 kHz and encodes a 48 kbps MP3 (a few hundred KB per minute is plenty for speech recognition).
async function suggestAudio(url, onStat) {
  const lame = await loadLame();
  onStat('Fetching the song…');
  const r = await fetch(url, { credentials: 'omit' }); if (!r.ok) throw new Error('Could not fetch the song file (' + r.status + ').');
  const raw = await r.arrayBuffer();
  onStat('Preparing the audio…');
  const AC = window.AudioContext || window.webkitAudioContext, ctx = new AC();
  let buf; try { buf = await ctx.decodeAudioData(raw); } catch (e) { throw new Error('This browser could not read that audio file.'); } finally { try { ctx.close(); } catch (e) {} }
  const RATE = 16000, OC = window.OfflineAudioContext || window.webkitOfflineAudioContext, off = new OC(1, Math.max(1, Math.ceil(buf.duration * RATE)), RATE);
  const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
  const mono = (await off.startRendering()).getChannelData(0);
  const enc = new lame.Mp3Encoder(1, RATE, 48), out = [], block = 1152, pcm = new Int16Array(block);
  for (let i = 0, b = 0; i < mono.length; i += block, b++) {
    const n = Math.min(block, mono.length - i);
    for (let k = 0; k < n; k++) { let x = mono[i + k]; x = x < -1 ? -1 : x > 1 ? 1 : x; pcm[k] = x < 0 ? x * 0x8000 : x * 0x7FFF; }
    const d = enc.encodeBuffer(pcm.subarray(0, n)); if (d.length) out.push(new Uint8Array(d));
    if (b % 400 === 0) await new Promise(z => setTimeout(z, 0));
  }
  const f = enc.flush(); if (f.length) out.push(new Uint8Array(f));
  const bytes = new Uint8Array(await new Blob(out, { type: 'audio/mpeg' }).arrayBuffer());
  let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

let suggestBusy = false;
async function suggestTimings() {
  const n = S.now; if (!OWNER || !n || suggestBusy) return;
  const t = n.t, lines = plainLyrics(t.lyrics).split('\n').map(x => x.trim()).filter(Boolean);
  if (lines.length < 2) return toast('Add at least two lines of lyrics first');
  const v = n.v || primaryOf(t), url = v && /^https:\/\/media\.soulnicolas\.com\//.test(v.url || '') ? v.url : '';
  if (!url) return toast('This song needs a file on Cloudflare first (it is not a YouTube, SoundCloud or Drive-only song)');
  suggestBusy = true;
  try {
    const b64 = await suggestAudio(url, suggestSetNote);
    suggestSetNote('Cloudflare is listening to the song… this can take up to a minute.');
    const res = await run('lyricTimes', BOOT.key, t.track_id, b64);
    if (!S.now || S.now.t.track_id !== t.track_id) return;   // the owner moved on to another song meanwhile
    const pct = res.total ? Math.round(100 * res.matched / res.total) : 0;
    S.sync = { tid: t.track_id, lines: res.lines, times: res.times, note: `${res.matched} of ${res.total} words matched what Cloudflare heard (${pct}%). Save, then play the song to check it. Lines it could not hear are placed between the others, and you can sync by hand any time.` };
    try { audio.pause(); } catch (e2) {}
    renderSync();
  } catch (e) { toast((e && e.message) || 'Could not suggest timings'); renderLyr(); }
  finally { suggestBusy = false; }
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-sync-suggest]'); if (!b || !OWNER) return;
  e.preventDefault(); e.stopPropagation(); suggestTimings();
});
