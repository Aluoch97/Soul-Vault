/* ═════════ Fan experience: members, drops, letter, voice notes, lyrics, exclusives, badges ═════════ */
const isLocked = r => !!(r && r.unlock_at && new Date(r.unlock_at) > new Date());
const EXCL = /(demo|draft|rough|mix\s*v?\d|^v\d|\balt\b|alternate|a\s?c+ap+el+a|instrumental|live|stage|slowed|reverb|sped|snippet|unreleased|idea|voice memo)/i;
const isExclusive = v => !!(v && EXCL.test(String(v.label || '')));
const pad3 = n => String(n).padStart(3, '0');
function until(ms) {
  if (ms <= 0) return 'Opening…';
  const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4), s = Math.floor(ms % 6e4 / 1e3);
  return (d ? d + 'd ' : '') + String(h).padStart(2, '0') + 'h ' + String(m).padStart(2, '0') + 'm ' + String(s).padStart(2, '0') + 's';
}
const whenLabel = iso => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
function localInput(iso) {
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(d)) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const paras = t => String(t || '').trim().split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

/* countdowns: one ticker for every [data-unlock] on screen */
function tick() {
  const now = Date.now(); let due = false;
  $$('[data-unlock]').forEach(el => { const ms = new Date(el.dataset.unlock) - now; el.textContent = until(ms); if (ms <= 0) due = true; });
  if (due && !OWNER && BOOT.token && !S.refreshing && now - (S.lastRefresh || 0) > 15000) refreshClub();
}
setInterval(tick, 1000);
async function refreshClub() {
  S.refreshing = true; S.lastRefresh = Date.now();
  award('drop');
  await new Promise(z => setTimeout(z, 3000));   // give the server a moment past the unlock time
  try {
    const d = await run('getShare', BOOT.token);
    if (!d.error) {
      S.lib = normalizeLib(d); S.share = d.share; primeThumbs(); libCacheSet(d);
      if (S.view === 'release') renderRelease(S.releaseId); else renderLibrary();
      if (!d.releases.some(isLocked)) toast("It's here. The drop is open.");
    }
  } catch (e) {} finally { S.refreshing = false; }
}

/* home sections */
function letterCard() {
  const L = S.lib.letter;
  if (!L) return OWNER ? `<button class="letter empty" data-letter-edit>${I.edit}<span>Write a note to the fan club. It shows at the top of their Home.</span></button>` : '';
  const long = L.body.length > 240;
  return `<section class="letter" aria-label="${esc(L.title)}">
    <div class="lhead"><span class="lfrom"><span class="avatar sm" aria-hidden="true">NS</span>
      <span><strong>${esc(L.title)}</strong><span class="cs">${L.updated ? esc(fmtDate(L.updated)) : ''}</span></span></span>
      ${OWNER ? '<button class="seeall" data-letter-edit>Edit</button>' : ''}</div>
    <div class="lbody${long ? '' : ' open'}" id="lbody">${paras(L.body)}</div>
    ${long ? '<button class="seeall" data-letter-more>Read the whole note</button>' : ''}
  </section>`;
}
// Songs that were never officially released: every song marked "Unreleased" (or on a release marked Unreleased). Tap one to play it.
function unreleasedSongs() {
  return S.lib.tracks.filter(t => !hidden(t) && primaryOf(t) && (isUnrel(t) || isUnrel(rel(t.release_id))) && (OWNER || !(rel(t.release_id) || {}).locked))
    .sort((a, b) => relDateKey(rel(b.release_id) || {}).localeCompare(relDateKey(rel(a.release_id) || {})) || (Number(a.track_no) || 0) - (Number(b.track_no) || 0));
}
/* ═════ Special areas on the Music tab: Unreleased (secret access) and Features ═════
   Each is its own area with its own View menu (scrolling shelf, large covers, small covers, list), kept separately from the releases' View menu, and filter chips. */
const UNREL_KINDS = ['Single', 'Album', 'EP', 'Mixtape', 'Compilation'];
// What an unreleased song is meant to be: the one you set on the song in Studio, else its release's type, else "Unsorted".
const unrelKindOf = t => UNREL_KINDS.indexOf(t.unrel_kind) > -1 ? t.unrel_kind : (UNREL_KINDS.indexOf(typeOf(rel(t.release_id) || {})) > -1 ? typeOf(rel(t.release_id)) : '');
// Guests on a song: the Features field, or "(feat. X)" / "(ft. X)" in the title.
// One artist whose name has a comma in it, and nicknames for the same person: all become that one name.
const ARTIST_FULL = 'Charlie, The Healer';
const sameArtist = x => /^(charlie|the healer|charlie\s*,?\s*the healer)$/i.test(x) ? ARTIST_FULL : x;
function featuresOf(t) {
  const out = [], add = s => String(s || '').replace(/charlie\s*,\s*the healer/ig, 'Charlie\u0001The Healer').split(/\s*(?:,|&|\band\b|\+)\s*/i).map(x => sameArtist(x.replace(/\u0001/g, ' ').replace(/^(feat\.?|ft\.?|featuring|with)\s+/i, '').trim())).filter(x => x && x.length < 60).forEach(x => { if (out.indexOf(x) < 0) out.push(x); });
  add(t.features);
  const m = String(t.title || '').match(/[(\[]\s*(?:feat\.?|ft\.?|featuring)\s+([^)\]]+)[)\]]/i); if (m) add(m[1]);
  return out;
}
const isGuestSpot = t => t.feature_role === 'mine';   // my guest spot on someone else's song (set in Studio)
function featuredSongs() {
  return S.lib.tracks.filter(t => !hidden(t) && primaryOf(t) && (featuresOf(t).length || isGuestSpot(t)) && (OWNER || !(rel(t.release_id) || {}).locked))
    .sort((a, b) => relDateKey(rel(b.release_id) || {}).localeCompare(relDateKey(rel(a.release_id) || {})) || (Number(a.track_no) || 0) - (Number(b.track_no) || 0));
}
const secState = id => { S.sec = S.sec || {}; return (S.sec[id] = S.sec[id] || { view: ls.get('sv_secview_' + id, 'scroll'), chip: 'all' }); };
const songArt = t => t.track_cover || (rel(t.release_id) || {}).cover_file_id || '';
function redrawSection(id) {
  const el = $('#' + id); if (!el) return;
  el.outerHTML = id === 'unreleased' ? unreleasedSection() : featuresSection();
  const now = $('#' + id); loadCovers(); markPlaying(); if (now) wireRows(now);
}
/** cfg: { id, cls, ribbon (html), title (html), blurb (html), songs, chips: [[key, label, count]], inChip(t, key), tagOfGroup(g), subOfGroup(g), hint }
    The area shows PROJECTS (a release with its matching songs), not every song one by one. Tap a project to open it. */
const projectsOf = ts => { const m = new Map(); ts.forEach(t => { if (!m.has(t.release_id)) m.set(t.release_id, { r: rel(t.release_id) || {}, songs: [] }); m.get(t.release_id).songs.push(t); }); return [...m.values()]; };
const nProjects = ts => new Set(ts.map(t => t.release_id)).size;
function vaultSection(cfg) {
  const st = secState(cfg.id), view = VIEWS.some(v => v[0] === st.view) ? st.view : 'scroll';
  if (!cfg.chips.some(c => c[0] === st.chip)) st.chip = 'all';
  const list = st.chip === 'all' ? cfg.songs : cfg.songs.filter(t => cfg.inChip(t, st.chip)), groups = projectsOf(list);
  const card = g => `<button type="button" class="agc vsc" data-rel="${esc(g.r.release_id)}" aria-label="Open ${esc(g.r.title)}">
    <span class="vart"><img class="art" data-cover="${esc(g.r.cover_file_id || '')}" alt=""><span class="vtag">${esc(cfg.tagOfGroup(g))}</span></span>
    <span class="agt">${esc(g.r.title)}</span><span class="cs">${esc(cfg.subOfGroup(g))}</span></button>`;
  const row = g => `<button type="button" class="alr" data-rel="${esc(g.r.release_id)}" aria-label="Open ${esc(g.r.title)}"><img class="art" data-cover="${esc(g.r.cover_file_id || '')}" alt=""><span class="alt"><b>${esc(g.r.title)}</b><span class="cs">${esc([cfg.tagOfGroup(g), cfg.subOfGroup(g)].filter(Boolean).join(' · '))}</span></span></button>`;
  const body = !groups.length ? '<p class="cs">Nothing here yet.</p>'
    : view === 'list' ? `<section class="alllist" aria-label="${esc(cfg.label)}">${groups.map(row).join('')}</section>`
    : view === 'scroll' ? `<div class="hrow vrow" aria-label="${esc(cfg.label)}">${groups.map(card).join('')}</div>`
    : `<div class="allgrid vgrid ${view === 'small' ? 'small' : 'large'}">${groups.map(card).join('')}</div>`;
  const chips = cfg.chips.length > 2 ? `<div class="seg vs-chips" role="group" aria-label="Filter ${esc(cfg.label)}">${cfg.chips.map(([k, l, n]) => `<button type="button" data-secchip="${esc(cfg.id)}|${esc(k)}" aria-pressed="${k === st.chip}">${esc(l)} <span class="n">${n}</span></button>`).join('')}</div>` : '';
  return `<section id="${cfg.id}" class="vsec ${cfg.cls}" aria-label="${esc(cfg.label)}">
    <div class="vs-ribbon">${cfg.ribbon}</div>
    <div class="vs-head"><h2 class="sh"><span>${cfg.title}</span></h2></div>
    <p class="cs vs-blurb">${cfg.blurb}</p>
    ${viewMenu(view, cfg.id)}${chips}${body}${cfg.hint || ''}</section>`;
}
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
function unreleasedSection() {
  const ts = unreleasedSongs();
  if (!ts.length) return '';
  const byKind = {}; ts.forEach(t => { const k = unrelKindOf(t) || 'Unsorted'; (byKind[k] = byKind[k] || []).push(t); });
  const chips = [['all', 'All', nProjects(ts)]].concat(UNREL_KINDS.concat(['Unsorted']).filter(k => byKind[k]).map(k => [k, { Single: 'Singles', Album: 'Albums', EP: 'EPs', Mixtape: 'Mixtapes', Compilation: 'Compilations', Unsorted: 'Unsorted' }[k], nProjects(byKind[k])]));
  const kindOf = g => { const c = {}; g.songs.forEach(t => { const k = unrelKindOf(t) || ''; c[k] = (c[k] || 0) + 1; }); return Object.keys(c).sort((a, b) => c[b] - c[a])[0] || ''; };
  const unsorted = (byKind.Unsorted || []).length;
  return vaultSection({ id: 'unreleased', cls: 'secret', label: 'Unreleased projects', songs: ts, chips,
    ribbon: `<span class="vs-lock">${I.lock}</span><span class="vs-acc">Access granted</span><i class="vs-dot" aria-hidden="true"></i><span class="vs-sub">Unreleased vault</span>`,
    title: '<b>Unreleased</b>', blurb: `Music that was never officially released. You are hearing it before anyone else. ${plural(ts.length, 'song')} in ${plural(nProjects(ts), 'project')}.`,
    inChip: (t, k) => (unrelKindOf(t) || 'Unsorted') === k, tagOfGroup: g => kindOf(g) || 'Unreleased',
    subOfGroup: g => [g.r.year, plural(g.songs.length, 'unreleased song')].filter(Boolean).join(' · '),
    hint: OWNER && unsorted ? `<p class="cs vs-hint">${plural(unsorted, 'song')} ${unsorted === 1 ? 'is' : 'are'} not sorted yet. In Studio, open the song and pick what it counts as (Single, Album, EP, Mixtape or Compilation).</p>` : '' });
}
function featuresSection() {
  const ts = featuredSongs();
  if (!ts.length) return '';
  const mine = ts.filter(isGuestSpot), guests = ts.filter(t => !isGuestSpot(t) && featuresOf(t).length);
  const mainArtist = t => String(t.artist || (rel(t.release_id) || {}).artist_name || '').trim();
  const who = t => isGuestSpot(t) ? [sameArtist(mainArtist(t))].filter(Boolean) : featuresOf(t);
  const byPerson = {}; ts.forEach(t => who(t).forEach(n => { (byPerson[n] = byPerson[n] || []).push(t); }));
  const names = Object.keys(byPerson).sort((a, b) => nProjects(byPerson[b]) - nProjects(byPerson[a]) || a.localeCompare(b)).slice(0, 10);
  const chips = [['all', 'All', nProjects(ts)]].concat(guests.length && mine.length ? [['k:guests', 'Guests on my songs', nProjects(guests)], ['k:mine', 'My guest spots', nProjects(mine)]] : []).concat(names.map(n => ['a:' + n, n, nProjects(byPerson[n])]));
  return vaultSection({ id: 'features', cls: 'spot', label: 'Projects with features', songs: ts, chips,
    ribbon: `<span class="vs-lock">${I.mic || ''}</span><span class="vs-acc">Special guests</span><i class="vs-dot" aria-hidden="true"></i><span class="vs-sub">Features</span>`,
    title: '<b>Features</b>', blurb: `Guests on my songs, and my guest spots on other artists' songs. ${plural(ts.length, 'song')} in ${plural(nProjects(ts), 'project')}.`,
    inChip: (t, k) => k === 'k:guests' ? !isGuestSpot(t) : k === 'k:mine' ? isGuestSpot(t) : k.indexOf('a:') === 0 && who(t).indexOf(k.slice(2)) > -1,
    tagOfGroup: g => g.songs.every(isGuestSpot) ? 'Guest spot' : plural(g.songs.length, 'feature'),
    subOfGroup: g => { const n = []; g.songs.forEach(t => who(t).forEach(x => { if (n.indexOf(x) < 0) n.push(x); })); return (n.slice(0, 3).join(', ') + (n.length > 3 ? ' +' + (n.length - 3) : '')); } });
}
function dropsRow() {
  const ds = S.lib.releases.filter(isLocked).sort((a, b) => new Date(a.unlock_at) - new Date(b.unlock_at));
  if (!ds.length) return '';
  return `<h2 class="sh"><span><b>Coming</b> attractions</span></h2>
    <div class="hrow">${ds.map(r => `<button class="drop" data-rel="${esc(r.release_id)}" aria-label="${esc(r.title)}, unlocks ${esc(whenLabel(r.unlock_at))}">
      <span class="dimg"><img class="art" data-cover="${esc(r.cover_file_id)}" alt=""><span class="lock" aria-hidden="true">${I.lock}</span></span>
      <span class="dtxt"><span class="ct">${esc(r.title)}</span>
        <span class="dcount" data-unlock="${esc(r.unlock_at)}">${until(new Date(r.unlock_at) - Date.now())}</span>
        <span class="cs">${esc(whenLabel(r.unlock_at))}</span></span></button>`).join('')}</div>`;
}
function tribeCard() {
  const u = JOIN_URL(); if (!u) return '';
  return `<section class="tribe"><div><div class="tt2">Join the <b>Soul Tribe</b></div>
    <p class="cs">The newsletter: drop alerts, show dates and first word on new music, twice a month.</p></div>
    <a class="pill main" href="${esc(u)}" target="_blank" rel="noopener">${I.mail}Join the Soul Tribe</a></section>`;
}

/* sealed release page for fans */
function sealedView(r) {
  clearPageBg();
  $('#main').innerHTML = `
    <header class="relhead sealed" id="relhead"><div class="wrap">
      <button class="back" data-nav="library-back">${I.back}Music</button>
      <div class="hero">
        <div class="artwrap sealart"><img class="art" id="heroArt" alt=""><span class="lock" aria-hidden="true">${I.lock}</span></div>
        <div>
          <div class="kind">${esc(typeOf(r))}, sealed</div>
          <h1>${esc(r.title)}</h1>
          <i class="flagband" aria-hidden="true" style="display:block;margin:2px 0 10px"></i>
          ${r.world_tagline ? `<p class="tagline">${esc(r.world_tagline)}</p>` : ''}
          <div class="cdown" role="timer"><span class="cl">Unlocks in</span>
            <span class="cv" data-unlock="${esc(r.unlock_at)}">${until(new Date(r.unlock_at) - Date.now())}</span>
            <span class="cs">${esc(whenLabel(r.unlock_at))}</span></div>
        </div>
      </div>
    </div></header>
    <div class="wrap">${aboutSection(r)}${seriesPanel(r)}<p class="cs sealnote">The songs appear here the moment it opens. Keep this page open to be here for the drop.</p></div>`;
  if (r.world_color) $('#relhead').style.setProperty('--tint', r.world_color);
  const hero = $('#heroArt');
  setCover(hero, r.cover_file_id, true, () => { if (!r.world_color) tintFrom(hero); });
  loadCovers();
  window.scrollTo(0, 0);
}

/* letter editor */
function openLetter() {
  const L = S.lib.letter || { title: '', body: '' };
  $('#modal').innerHTML = `<div class="sheet wide" role="dialog" aria-modal="true" aria-labelledby="mTitle">
    <h2 id="mTitle">Note to the fan club</h2>
    <label>Title<input class="field" id="lTitle" maxlength="80" value="${esc(L.title)}" placeholder="A note from Nicólas"></label>
    <label>Your note<textarea class="field" id="lBody" rows="9" maxlength="4000" placeholder="What you're working on, a thank-you, what's coming next…">${esc(L.body)}</textarea></label>
    <p class="err" id="lErr" hidden></p>
    <div class="end">${S.lib.letter ? '<button class="pill soft" data-letter-clear>Remove note</button>' : ''}<button class="pill soft" data-close>Cancel</button><button class="pill main" data-letter-save>Post note</button></div></div>`;
  $('#modal').hidden = false; $('#lBody').focus();
}
async function saveLetterEdits(btn, clear) {
  btn.disabled = true;
  try {
    S.lib.letter = await run('saveLetter', BOOT.key, clear ? '' : $('#lTitle').value, clear ? '' : $('#lBody').value);
    closeModal(); toast(clear ? 'Note removed' : 'Note posted'); renderLibrary();
  } catch (e) { btn.disabled = false; const err = $('#lErr'); err.hidden = false; err.textContent = e.message || 'Could not save.'; }
}

/* voice notes */
const vn = new Audio(); vn.preload = 'none';
async function playVoice(tid) {
  const t = trk(tid); if (!t || !t.voice_note_id) return;
  audio.pause();
  if (S.videoMode) setMode('song');
  $('#vbT').textContent = 'On ' + t.title; $('#voicebar').hidden = false;
  try {
    // a note kept on our own storage is "r2:<file>" and plays straight from there; an older one is a Google Drive file
    vn.src = /^r2:/.test(t.voice_note_id) ? MEDIA_BASE + t.voice_note_id.slice(3) : (await run('prepareAudio', t.voice_note_id, BOOT.key, BOOT.token)).stream;
    await vn.play(); award('voice');
  } catch (e) { $('#vbT').textContent = 'This voice note could not be played right now.'; }
}
vn.addEventListener('timeupdate', () => $('#vnBar').style.setProperty('--p', (vn.duration ? vn.currentTime / vn.duration * 100 : 0) + '%'));
vn.addEventListener('play', () => ($('[data-vn-toggle]').innerHTML = I.pause));
vn.addEventListener('pause', () => ($('[data-vn-toggle]').innerHTML = I.play));
vn.addEventListener('ended', () => { $('#voicebar').hidden = true; });
function openVoiceUpload(tid) {
  const t = trk(tid);
  $('#modal').innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mTitle">
    <h2 id="mTitle">Voice note for ${esc(t.title)}</h2>
    <p class="cs">Record a voice memo on your phone about this song, then pick it here. Fans hear it from the song's menu and the now-playing screen.</p>
    <label>Audio file<input class="field" type="file" id="vnFile" accept="audio/*,.m4a,.mp3,.wav,.aac"></label>
    <div class="prog" id="vnProg" hidden><div class="bar"><i id="vnUpBar"></i></div><p class="cs" id="vnStat"></p></div>
    <p class="err" id="vnErr" hidden></p>
    <div class="end"><button class="pill soft" data-close>Cancel</button><button class="pill main" data-voice-go="${esc(tid)}">Upload</button></div></div>`;
  $('#modal').hidden = false; $('#vnFile').focus();
}
async function uploadVoice(btn) {
  const tid = btn.dataset.voiceGo, t = trk(tid), f = $('#vnFile').files[0], err = $('#vnErr');
  if (!f) { err.hidden = false; err.textContent = 'Choose a voice memo first.'; return; }
  btn.disabled = true; $('#vnProg').hidden = false; $('#vnStat').textContent = 'Uploading…';
  try {
    const bar = p => $('#vnUpBar').style.setProperty('--p', Math.round(p * 100) + '%');
    let id = '';
    if (EDGE_UPLOADS()) {   // our own storage: nothing goes through Google Drive
      const ext = (f.name.split('.').pop() || 'm4a').toLowerCase();
      let plan = null;
      try { plan = await run('studioPlanUpload', BOOT.key, { relId: t.release_id, trackId: tid, kind: 'voice', ext }); }
      catch (e) { if (!/Switch the catalog/.test(e.message || '')) throw e; }   // catalog still on the Sheet: use the Drive way below
      if (plan) {
        await putFile(plan.key, f, f.type || (ext === 'mp3' ? 'audio/mpeg' : 'audio/mp4'), bar);
        id = (await run('studioSetVoice', BOOT.key, { relId: t.release_id, trackId: tid, key: plan.key })).voice_note_id;
      }
    }
    if (!id) {
      const ticket = await run('getUploadTicket', BOOT.key, t.release_id);
      id = await driveUpload(f, `Voice note - ${t.title}.${(f.name.split('.').pop() || 'm4a')}`, f.type || 'audio/mp4', ticket, bar);
      await run('setVoiceNote', BOOT.key, tid, id);
    }
    t.voice_note_id = id; closeModal(); toast('Voice note added');
    if (S.view === 'release') renderRelease(S.releaseId); if (S.now) updateNowUI();
  } catch (e) { btn.disabled = false; err.hidden = false; err.textContent = e.message || 'Upload failed.'; }
}
async function removeVoice(tid) {
  if (!confirm('Remove the voice note from this song?')) return;
  try {
    let done = false;
    if (EDGE_UPLOADS()) { try { await run('studioSetVoice', BOOT.key, { relId: trk(tid).release_id, trackId: tid, key: '' }); done = true; } catch (e) { if (!/Switch the catalog/.test(e.message || '')) throw e; } }
    if (!done) await run('setVoiceNote', BOOT.key, tid, '');
    trk(tid).voice_note_id = ''; toast('Voice note removed'); if (S.view === 'release') renderRelease(S.releaseId); if (S.now) updateNowUI(); }
  catch (e) { toast('Could not remove'); }
}

/* lyrics + exclusives + voice in now playing */
function renderNpExtras(n) {
  $('#npExcl').hidden = !isExclusive(n.v);
  $('#npVoice').innerHTML = n.t.voice_note_id ? `<button class="pill soft vnbtn" data-vn="${esc(n.t.track_id)}">${I.mic}Hear the story behind it</button>` : '';
  const has = !!String(n.t.lyrics || '').trim();
  $('[data-np-lyrics]').hidden = !has;
  $('#npLyrics').innerHTML = '';
  if (S.sync && S.sync.tid !== n.t.track_id) S.sync = null;
  if (S.lyrMode) { if (has) { renderLyr(); syncLyHead(); } else setLyrMode(false); }
  else if (has && isSynced(n.t.lyrics) && !S.lyrAutoOff && !S.videoMode) setLyrMode(true);   // synced lyrics open by themselves, like Apple Music
}
function openLyrics(tid) {
  const t = trk(tid);
  $('#modal').innerHTML = `<div class="sheet wide" role="dialog" aria-modal="true" aria-labelledby="mTitle"><h2 id="mTitle">${esc(t.title)}</h2>
    <div class="lyrics">${esc(plainLyrics(t.lyrics))}</div><div class="end"><button class="pill soft" data-close>Close</button></div></div>`;
  $('#modal').hidden = false; award('lyrics');
}

/* badges (saved on this device) */
const BADGES = [
  { id: 'first', icon: '🎧', name: 'First listen', how: 'Play any song' },
  { id: 'ten', icon: '🔟', name: 'Ten deep', how: 'Hear 10 different songs' },
  { id: 'night', icon: '🌙', name: 'Night owl', how: 'Listen between midnight and 4 AM' },
  { id: 'video', icon: '🎬', name: 'Front row', how: 'Watch a music video' },
  { id: 'voice', icon: '🎙️', name: 'Inner circle', how: 'Hear a voice note from Nicólas' },
  { id: 'world3', icon: '🌍', name: 'Era explorer', how: 'Open 3 different releases' },
  { id: 'lyrics', icon: '📝', name: 'Word for word', how: 'Open the lyrics' },
  { id: 'drop', icon: '⏳', name: 'There at the drop', how: 'Be here the moment a sealed drop opens' }
];
const bKey = () => 'sv_b_' + (OWNER ? 'owner' : BOOT.token);
const bState = () => Object.assign({ e: {}, h: {}, w: {} }, ls.get(bKey(), {}));
// Fan club badges were removed; calls elsewhere stay harmless.
function award() {}
function markHeard() {}
function visitWorld() {}


/* ═════════ New release (owner only) ═════════ */
const REL_TYPES = ['Album', 'Mixtape', 'EP', 'Single', 'Live', 'Compilation', 'Unreleased', 'Other'];
const AUDIO_OK = /\.(wav|aiff?|flac|mp3|m4a|aac)$/i;
function niceTitle(name) {
  return name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').replace(/^\s*\d{1,3}\s*[-.)]?\s+/, '').replace(/\s+/g, ' ').trim() || name;
}
function openNewRelease() {
  if (!OWNER) return;
  S.nr = { files: [], cover: null, busy: false };
  const year = new Date().getFullYear();
  $('#modal').innerHTML = `<div class="sheet wide nr" role="dialog" aria-modal="true" aria-labelledby="mTitle">
    <h2 id="mTitle">New release</h2>
    <button class="pill soft" type="button" data-nr-yt>${I.film}Start from a YouTube link instead</button>
    <div class="nrtop">
      <button class="nrcover" type="button" data-nr-cover aria-label="Add cover art"><img id="nrCoverImg" alt="" hidden><span id="nrCoverTxt">${I.img}<span>Add cover</span></span></button>
      <div class="nrfields">
        <label>Title<input class="field" id="nrTitle" maxlength="120" placeholder="SATURN RETURN" autocomplete="off"></label>
        <div class="nrrow">
          <label>Type<select class="field" id="nrType">${REL_TYPES.map(t => `<option${t === 'Single' ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
          <label>Year<input class="field" id="nrYear" type="number" inputmode="numeric" min="1990" max="2100" value="${year}"></label>
        </div>
      </div>
    </div>
    <input type="file" id="nrCoverFile" accept="image/jpeg,image/png,image/webp,image/gif" hidden>
    <input type="file" id="nrFiles" accept=".wav,.aif,.aiff,.flac,.mp3,.m4a,.aac,audio/*" multiple hidden>
    <div class="nrdrop" id="nrDrop"><button class="pill soft" type="button" data-nr-add>${I.plus}Add songs</button><span class="cs"><span class="dragonly">or drag audio files here. </span>Pick them in track order, or reorder below.</span></div>
    <ol class="nrlist" id="nrList"></ol>
    <fieldset class="nrvis"><legend>Fan club</legend>
      <label class="row2"><input type="radio" name="nrVis" value="show" checked> Show it when the upload finishes</label>
      <label class="row2"><input type="radio" name="nrVis" value="hide"> Keep it hidden for now</label>
      <label class="row2 nrseal"><input type="radio" name="nrVis" value="seal"> Seal it until
        <input type="datetime-local" id="nrSeal" class="field" aria-label="Unlock date and time"></label>
    </fieldset>
    <div class="prog" id="nrProg" hidden><div class="bar"><i id="nrBar"></i></div><p class="cs" id="nrStat" role="status" aria-live="polite"></p></div>
    <p class="err" id="nrErr" hidden></p>
    <div class="end"><button class="pill soft" data-close id="nrCancel">Cancel</button><button class="pill main" data-nr-go>Upload release</button></div>
  </div>`;
  $('#modal').hidden = false;
  $('#nrCoverFile').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    S.nr.cover = f; const img = $('#nrCoverImg'); img.src = URL.createObjectURL(f); img.hidden = false; $('#nrCoverTxt').hidden = true;
  });
  $('#nrFiles').addEventListener('change', e => { nrAdd([...e.target.files]); e.target.value = ''; });
  $('#nrSeal').addEventListener('focus', () => { $$('[name="nrVis"]').forEach(r => (r.checked = r.value === 'seal')); });
  const drop = $('#nrDrop');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); nrAdd([...e.dataTransfer.files]); });
  nrRender();
  $('#nrTitle').focus();
}
function nrAdd(files) {
  const skipped = [];
  files.forEach(f => {
    if (!AUDIO_OK.test(f.name) && !/^audio\//.test(f.type)) { skipped.push(f.name); return; }
    if (S.nr.files.some(x => x.file.name === f.name && x.file.size === f.size)) return;
    S.nr.files.push({ file: f, title: niceTitle(f.name), state: '' });
  });
  nrRender();
  if (skipped.length) toast('Skipped (not audio): ' + skipped.slice(0, 2).join(', ') + (skipped.length > 2 ? '…' : ''));
}
function nrRender(moved) {
  const n = S.nr.files.length;
  makeSortable($('#nrList'), nrMoveTo);
  $('#nrList').innerHTML = S.nr.files.map((x, i) => `<li class="nritem sortrow${moved === i ? ' moved' : ''}">
    <span class="n">${i + 1}</span>
    <div class="nrmain"><input class="field" data-nr-title="${i}" value="${esc(x.title)}" maxlength="200" aria-label="Title of song ${i + 1}" ${S.nr.busy ? 'disabled' : ''}>
      <span class="cs nrmeta">${esc(x.file.name)}, ${(x.file.size / 1048576).toFixed(1)} MB${x.state ? ' · <b class="nrstate">' + esc(x.state) + '</b>' : ''}</span></div>
    <div class="moves">
      <button class="grip" type="button" data-grip="${i}" ${S.nr.busy ? 'disabled' : ''} aria-label="Reorder ${esc(x.title)}, position ${i + 1} of ${n}. Drag, or use the up and down arrow keys." title="Drag to reorder">${I.grip}</button>
      <button class="ib" data-nr-del="${i}" ${S.nr.busy ? 'disabled' : ''} aria-label="Remove ${esc(x.title)}">${I.trash}</button>
    </div></li>`).join('');
  const go = $('[data-nr-go]');
  if (go && !S.nr.busy) go.textContent = n ? `Upload release (${n} ${n === 1 ? 'song' : 'songs'})` : 'Upload release';
}
async function doNewRelease(btn) {
  const err = $('#nrErr'), fail = m => { err.hidden = false; err.textContent = m; };
  err.hidden = true;
  const title = $('#nrTitle').value.trim(), type = $('#nrType').value, year = +$('#nrYear').value;
  const picked = [...$$('[name="nrVis"]')].find(x => x.checked);
  const vis = picked ? picked.value : 'show';
  const sealAt = $('#nrSeal').value ? new Date($('#nrSeal').value) : null;
  if (!title) return fail('Give the release a title.');
  if (!(year >= 1990 && year <= 2100)) return fail('Year should look like ' + new Date().getFullYear() + '.');
  if (!S.nr.files.length) return fail('Add at least one song.');
  if (S.nr.files.some(x => !x.title.trim())) return fail('Every song needs a title.');
  if (vis === 'seal' && !(sealAt && sealAt > new Date())) return fail('Pick a future date and time to seal it until.');
  S.nr.busy = true; btn.disabled = true; btn.textContent = 'Uploading…';
  $$('#modal .nrtop input, #modal .nrtop select, #modal .nrtop button, #nrCancel, [data-nr-add], [name="nrVis"], #nrSeal').forEach(el => (el.disabled = true));
  nrRender();
  $('#nrProg').hidden = false;
  const stat = t => ($('#nrStat').textContent = t), bar = p => $('#nrBar').style.setProperty('--p', Math.round(p * 100) + '%');
  const n = S.nr.files.length, failed = [];
  let r;
  try {
    stat('Creating the release…');
    r = await run('createRelease', BOOT.key, { title, type, year });
    S.lib.releases.push(r);
    if (S.nr.cover && S.nr.cover.type === 'image/gif') {
      stat('Uploading the animated cover…');
      try { await uploadGifCover(S.nr.cover, r.release_id); } catch (e) { failed.push('the cover'); }
    } else if (S.nr.cover) {
      stat('Uploading the cover…');
      const data = await shrinkImage(S.nr.cover);
      let thumb = await shrinkImage(S.nr.cover, 320, 0.72); if (thumb.length > 44000) thumb = await shrinkImage(S.nr.cover, 240, 0.6);
      try {
        const out = await run('uploadCover', BOOT.key, r.release_id, data, thumb);
        r.cover_file_id = out.fileId; r.cover_thumb = out.thumb || '';
        S.covers[out.fileId] = out.thumb || data; S.covers[out.fileId + '|f'] = data;
        S.coverP[out.fileId] = Promise.resolve(out.thumb || data); S.coverP[out.fileId + '|f'] = Promise.resolve(data);
      } catch (e) { failed.push('the cover'); }
    }
    const wantPrev = false;
    for (let i = 0; i < n; i++) {
      const x = S.nr.files[i], at = p => bar((i + p) / n), label = `${i + 1} of ${n}: ${x.title}`;
      try {
        const preview = null; const duration = await audioDuration(x.file);
        x.state = 'Uploading'; nrRender(); stat('Uploading ' + label);
        const ticket = await run('getUploadTicket', BOOT.key, r.release_id);
        const base = preview ? 0.3 : 0, span = preview ? 0.6 : 0.9;
        const fileId = await driveUpload(x.file, x.file.name, x.file.type || 'audio/wav', ticket, p => at(base + p * span));
        let previewId = '';
        if (preview) previewId = await driveUpload(preview, x.file.name.replace(/\.[^.]+$/, '') + ' (preview).mp3', 'audio/mpeg', ticket, p => at(0.9 + p * 0.05));
        const out = await run('registerUpload', BOOT.key, { releaseId: r.release_id, title: x.title.trim(), label: 'Original', fileId, previewId, duration, primary: true });
        if (out.track) S.lib.tracks.push(out.track);
        S.lib.versions.push(out.version);
        x.state = 'Done ✓';
      } catch (e) { x.state = 'Failed'; failed.push(x.title); }
      nrRender(); at(1);
    }
    const songsFailed = failed.filter(f => f !== 'the cover');
    if (songsFailed.length) {
      stat(`${n - songsFailed.length} of ${n} songs uploaded.`);
      fail(`Didn't upload: ${songsFailed.join(', ')}. The release stays hidden from the fan club. Open it, use Add song to retry, then unhide it in Edit.`);
    } else {
      if (vis === 'seal') { r.unlock_at = await run('saveUnlock', BOOT.key, r.release_id, sealAt.toISOString()); }
      if (vis !== 'hide') { await run('saveTracklist', BOOT.key, r.release_id, '', [], false); r.hidden = false; }
      stat('Done.');
    }
  } catch (e) {
    fail((e && e.message) || 'The release could not be created.');
  }
  S.nr.busy = false;
  $('#nrCancel').disabled = false; $('#nrCancel').textContent = 'Close';
  if (r && !failed.filter(f => f !== 'the cover').length) {
    closeModal();
    toast(vis === 'seal' ? 'Release sealed until ' + whenLabel(r.unlock_at) : vis === 'hide' ? 'Release uploaded (hidden from fans)' : 'Release uploaded');
    if (failed.includes('the cover')) setTimeout(() => toast('The cover did not upload. Use Change cover on the release page.'), 2400);
    renderRelease(r.release_id);
  } else if (r) {
    btn.hidden = true;
    $('#nrCancel').dataset.openRel = r.release_id;
  } else {
    btn.disabled = false; btn.textContent = 'Try again';
    $$('#modal .nrtop input, #modal .nrtop select, #modal .nrtop button, [data-nr-add], [name="nrVis"], #nrSeal').forEach(el => (el.disabled = false));
    nrRender();
  }
}
window.addEventListener('beforeunload', e => { if (S.nr && S.nr.busy) { e.preventDefault(); e.returnValue = ''; } });


