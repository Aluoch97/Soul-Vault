/* ── Song transitions: gapless and crossfade ──
   Off (the song ends, the next one starts), Gapless (the next song starts a split second early so there is no silence between songs),
   or Crossfade (the end of one song fades out while the next fades in, 3 / 6 / 9 seconds).
   How: the page has ONE player (`audio`), so the end of the current song is handed to a second, always-ready player (`audioOut`) that keeps it playing
   (and fading out) while `audio` already moves on to the next song and fades in. iPhones do not let a web page change the volume (`canSetVolume` is false there),
   so on an iPhone Crossfade turns into Gapless (a short overlap, no fade). */
const audioOut = new Audio(); audioOut.preload = 'auto';
const TRANS_CHOICES = [['off', 'Off', 0], ['gapless', 'Gapless', 0.3], ['cf3', 'Crossfade 3 s', 3], ['cf6', 'Crossfade 6 s', 6], ['cf9', 'Crossfade 9 s', 9]];
S.trans = TRANS_CHOICES.some(c => c[0] === ls.get('sv_trans', 'off')) ? ls.get('sv_trans', 'off') : 'off';
const userVolume = () => { const v = Number(ls.get('sv_volume', 1)); return v >= 0 && v <= 1 ? v : 1; };
const transSecs = () => { const c = TRANS_CHOICES.find(x => x[0] === S.trans); const s = c ? c[2] : 0; return s > 0.3 && !canSetVolume ? 0.3 : s; };   // no volume control (iPhone): a short overlap instead of a fade
// Phones only let a player start inside a tap: unlock the second player the same way the first one is (called from the first tap on a song).
function unlockOut() { try { if (!S.outUnlocked) { audioOut.src = SILENT; audioOut.play().then(() => { S.outUnlocked = true; audioOut.pause(); }).catch(() => {}); } } catch (e) { /* the fade just will not happen */ } }
// the first tap anywhere unlocks it (a phone only allows sound that starts inside a tap); song starts try again
document.addEventListener('pointerdown', () => unlockOut(), { capture: true });
function rampVolume(el, from, to, ms, done) {
  clearInterval(el._ramp); const t0 = performance.now();
  el._ramp = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / Math.max(1, ms));
    try { el.volume = Math.max(0, Math.min(1, from + (to - from) * k)); } catch (e) { /* no volume control */ }
    if (k >= 1) { clearInterval(el._ramp); if (done) done(); }
  }, 50);
}
function transCancel(restore) {
  clearTimeout(S.trTimer); S.trTimer = 0; S.trPrep = null;
  clearInterval(audioOut._ramp); try { audioOut.pause(); } catch (e) { /* nothing playing */ }
  clearInterval(audio._ramp); S.trIn = null;
  if (restore && canSetVolume) { try { audio.volume = userVolume(); } catch (e) { /* ignore */ } }
}
// Watches the song that is playing; a few seconds before the end it loads the same song into the second player, then schedules the hand-over.
function transTick() {
  const secs = transSecs();
  if (!secs || S.trBusy || !S.now || S.ytSong || S.scSong || S.videoMode || S.rescuing || audio.paused || audio.src === SILENT || !S.outUnlocked) return;
  const d = audio.duration, left = d - audio.currentTime; if (!isFinite(d) || d < secs * 3 + 2) return;
  if (S.repeat === 'one' || !S.queue || S.qi >= S.queue.length - 1) return;   // the last song just ends, and repeat-one loops
  const nv = ver(S.queue[S.qi + 1]); if (!nv || isYtSong(nv) || !songFile(nv)) return;
  const vid = S.now.v.version_id;
  if (left > secs + 8) return;
  if (!S.trPrep || S.trPrep.vid !== vid) {
    S.trPrep = { vid, src: audio.src };
    audioOut.src = audio.src; audioOut.volume = 0; audioOut.load();   // loaded now, silent; it only has to be ready
  }
  if (!S.trTimer && audioOut.readyState >= 3) {
    const wait = Math.max(0, (left - secs) * 1000 / (audio.playbackRate || 1));
    S.trTimer = setTimeout(() => transGo(secs, vid), wait);
  }
}
audio.addEventListener('timeupdate', transTick);
async function transGo(secs, vid) {
  S.trTimer = 0;
  if (!S.now || S.now.v.version_id !== vid || audio.paused || !S.trPrep || S.trPrep.vid !== vid) return;   // the person skipped, paused or sought: nothing to do
  const left = audio.duration - audio.currentTime; if (left > secs + 1.5 || left < 0) return;
  S.trBusy = true;
  try {
    audioOut.currentTime = audio.currentTime; const vol = userVolume();
    audioOut.volume = vol; await audioOut.play();                        // the end of the old song carries on here
    if (S.now.v.version_id !== vid) { transCancel(false); return; }
    if (secs > 0.3 && canSetVolume) { rampVolume(audioOut, vol, 0, Math.max(300, left * 1000), () => audioOut.pause()); S.trIn = { secs, vol }; try { audio.volume = 0; } catch (e) { /* ignore */ } }
    listenEnd(true); step(1);                                             // the main player moves on to the next song (starting silent when fading)
  } catch (e) { transCancel(true); }
  setTimeout(() => { S.trBusy = false; }, 1200); S.trPrep = null;
}
// The next song has started: fade it in.
audio.addEventListener('playing', () => { const t = S.trIn; if (!t) return; S.trIn = null; rampVolume(audio, 0, t.vol, t.secs * 1000, () => { try { audio.volume = userVolume(); } catch (e) { /* ignore */ } }); });
// The person paused, skipped or sought: stop the old song's tail and put the volume back.
audio.addEventListener('pause', () => { if (!S.trBusy && !audio.ended) transCancel(true); });
audio.addEventListener('seeking', () => { if (!S.trBusy) { clearTimeout(S.trTimer); S.trTimer = 0; S.trPrep = null; } });
// The choice (in Now Playing).
function paintTransChoice() {
  const sel = $('[data-trans]'); if (!sel) return;
  const choices = TRANS_CHOICES.filter(c => canSetVolume || !/^cf/.test(c[0]));
  sel.innerHTML = choices.map(c => `<option value="${c[0]}"${c[0] === S.trans || (!canSetVolume && /^cf/.test(S.trans) && c[0] === 'gapless') ? ' selected' : ''}>${c[1]}</option>`).join('');
}
document.addEventListener('change', e => {
  const sel = e.target.closest && e.target.closest('[data-trans]'); if (!sel) return;
  S.trans = sel.value; ls.set('sv_trans', S.trans); transCancel(true);
  toast(S.trans === 'off' ? 'Song transitions off' : S.trans === 'gapless' ? 'Gapless playback on' : 'Crossfade ' + sel.value.replace('cf', '') + ' seconds');
});
paintTransChoice();
