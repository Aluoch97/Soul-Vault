/* ── Move areas off the Sheet: each one is switched over on its own, and can be switched back ── */
const AREAS = [['activity', 'Share links, plays and comments', 'Fan links, listening insights, comments and problem reports. Comment e-mail alerts are not sent yet.'], ['catalog', 'Releases, songs and versions', 'The big one: titles, order, credits, lyrics, covers, deleting. Old Google Drive actions (song covers, page background, voice notes, YouTube songs) stop working; use Studio for covers and backgrounds.'], ['playlists', 'Playlists', 'Your playlists and which ones fans can see.'], ['extras', 'Extras', 'Reviews, apps, videos, links, audio notes and photos on release pages.'], ['settings', 'Letter, bio and artist links', 'Your letter to fans, the bio, and links for other artists.']];
async function openAreas() {
  const m = $('#modal'); m.className = 'modal';
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Move off the Sheet"><h2>Move off the Sheet</h2><p class="cs" id="arSt">Checking…</p><div id="arList" style="display:grid;gap:10px"></div>
    <p class="cs" style="margin:12px 0 0">Switching an area copies its current data to Cloudflare once. After that, edits are saved on Cloudflare, and your Sheet is left alone as a backup. Switching back returns to the Sheet's copy; edits made since are not carried back.</p>
    <p class="cs" id="arErr" role="alert" style="color:#ff8a8a" hidden></p><div class="end"><button class="pill soft" data-close>Done</button></div></div>`;
  m.hidden = false;
  const draw = on => {
    $('#arSt').textContent = 'Each area switches on its own.';
    $('#arList').innerHTML = AREAS.map(a => `<div style="display:flex;gap:10px;align-items:center;justify-content:space-between;border:1px solid var(--line);border-radius:12px;padding:10px 12px">
      <div style="min-width:0"><b>${esc(a[1])}</b><div class="cs">${esc(a[2])}</div><div class="cs">${on[a[0]] ? 'On Cloudflare' : 'Still on the Sheet'}</div></div>
      <button class="pill ${on[a[0]] ? 'soft' : 'main'}" data-area="${a[0]}" data-on="${on[a[0]] ? 1 : 0}">${on[a[0]] ? 'Switch back' : 'Switch'}</button></div>`).join('');
  };
  try { const st = await fetch(BOOT.api, { method: 'POST', body: JSON.stringify({ fn: 'edgeStatus', args: [] }) }).then(r => r.json()); draw((st.result && st.result.owned_areas) || {}); }
  catch (e) { $('#arSt').textContent = 'Could not check. Try again.'; return; }
  $('#arList').addEventListener('click', async e => {
    const b = e.target.closest('[data-area]'); if (!b) return;
    b.disabled = true; $('#arErr').hidden = true; const was = b.textContent; b.textContent = 'Working…';
    try {
      await run(b.dataset.on === '1' ? 'releaseDomain' : 'adoptDomain', BOOT.key, b.dataset.area);
      const st = await fetch(BOOT.api, { method: 'POST', body: JSON.stringify({ fn: 'edgeStatus', args: [] }) }).then(r => r.json()); draw((st.result && st.result.owned_areas) || {});
      toast('Done. Reload the app to see everything from the new place.');
    } catch (er) { $('#arErr').hidden = false; $('#arErr').textContent = er.message || 'Could not switch.'; b.disabled = false; b.textContent = was; }
  });
}

/* ── Owner password: sign in at /admin without the owner key ── */
// Add to Home Screen: Chrome/Android fires beforeinstallprompt (a real Install button); Safari/iOS has no such API, so we show the steps.
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
window.addEventListener('appinstalled', () => { installEvt = null; });
document.addEventListener('click', e => {
  const t = e.target.closest && e.target.closest('[data-install]');
  if (t) { e.preventDefault(); openInstall(); }
});
function openInstall() {
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const m = $('#modal'); m.className = 'modal';
  const stepsIos = '<p class="cs" style="margin:0 0 6px"><b>iPhone or iPad (Safari):</b> tap the <b>Share</b> button (square with an arrow), scroll down, tap <b>Add to Home Screen</b>, then <b>Add</b>.</p>';
  const stepsAnd = '<p class="cs" style="margin:0 0 6px"><b>Android (Chrome):</b> tap the <b>\u22EE</b> menu, then <b>Install app</b> or <b>Add to Home screen</b>.</p>';
  const body = standalone ? '<p class="cs">You are already using Soul Vault from your home screen. \u2713</p>'
    : (installEvt ? '<button class="pill main" id="instGo" style="margin:4px 0 10px">Install Soul Vault</button>' : '')
      + (ios ? stepsIos : android ? stepsAnd : stepsIos + stepsAnd);
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Add to Home Screen">
    <h2>Add to Home Screen</h2>
    <p class="cs" style="margin:0 0 10px">Put Soul Vault on your phone so it opens like an app, one tap from your home screen.</p>
    ${body}
    <div class="end"><button class="pill soft" data-close>Close</button></div></div>`;
  m.hidden = false;
  const go = $('#instGo');
  if (go) go.addEventListener('click', async () => {
    const ev = installEvt; installEvt = null;
    if (!ev) return;
    ev.prompt();
    try { await ev.userChoice; } catch (e) {}
    closeModal();
  });
}
// Missing files: the to-do list of songs and versions that need their audio. Pick a file next to one and it goes live right away.
async function openMissing() {
  const m = $('#modal'); m.className = 'modal';
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Missing files"><h2>Missing files</h2><p class="cs" id="msSt">Loading…</p>
    <div id="msList" class="mslistbox"></div><input type="file" id="msFile" accept="audio/*,.wav,.aif,.aiff,.flac,.mp3,.m4a,.aac,.ogg" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0" tabindex="-1"><div class="end"><button class="pill soft" data-close>Close</button></div></div>`;
  m.hidden = false;
  let items = [];
  const draw = () => {
    $('#msSt').textContent = items.length ? items.length + ' still to fix. Tap Upload file and pick the audio, or, if you already added the song with New release (from a YouTube link or a file), tap Link an added song to use that one. It goes live for everyone as soon as it is done. A WAV or AIFF is turned into a 256 kbps MP3 first; your master stays on your computer.' : 'Nothing is missing.';
    const by = {}; items.forEach(it => (by[it.release] = by[it.release] || []).push(it));
    $('#msList').innerHTML = Object.keys(by).map(r => `<div><b>${esc(r)}</b>${by[r].sort((a, b) => (a.no || 0) - (b.no || 0) || String(a.label).localeCompare(b.label)).map(it => `
      <div class="msrow" data-ms="${esc(it.id)}">
        <div><span>${it.no ? '#' + esc(it.no) + ' ' : ''}${esc(it.title)}</span> <span class="cs">· ${esc(it.label)}${it.kind === 'song' ? ' · never added' : ''}</span></div>
        <div class="cs msst" role="status"></div><div class="msbar" hidden style="height:4px;border-radius:4px;background:var(--raise);overflow:hidden"><i style="display:block;height:100%;width:0;background:var(--text)"></i></div>
        <div class="msbtns"><button class="pill main" data-ms-up="${esc(it.id)}">Upload file</button><button class="pill soft" data-ms-link="${esc(it.id)}">Link an added song</button>${it.kind === 'version' ? `<button class="pill soft" data-ms-hide="${esc(it.id)}">Hide it</button>` : ''}</div><div class="mslink" hidden></div></div>`).join('')}</div>`).join('');
  };
  const rowOf = id => [...$$('#msList [data-ms]')].find(x => x.dataset.ms === id);
  try { items = await run('missingList', BOOT.key); draw(); } catch (e) { $('#msSt').textContent = (e && e.message) || 'Could not load the list.'; return; }
  // Link a song you already added with New release (from YouTube or a file) to a missing one. The added song's file moves onto the missing song,
  // the broken one is hidden, and the missing item comes off this list.
  const candidates = (it, q) => {
    const bad = new Set(items.map(x => x.id).concat(it.oldVersionIds || [])), tr = id => S.lib.tracks.find(t => t.track_id === id), rl = id => S.lib.releases.find(r => r.release_id === id);
    q = String(q || '').trim().toLowerCase();
    return S.lib.versions.filter(v => v.native === true && !bad.has(v.version_id) && v.track_id !== it.trackId && tr(v.track_id)).reverse()
      .map(v => { const t = tr(v.track_id), r = rl(t.release_id) || {}; return { id: v.version_id, title: t.title, release: r.title || '', hidden: !!r.hidden, how: v.format === 'YOUTUBE' ? 'plays through YouTube' : v.format === 'SOUNDCLOUD' ? 'plays through SoundCloud' : (v.duration || 'audio file') }; })
      .filter(x => !q || (x.title + ' ' + x.release).toLowerCase().includes(q)).slice(0, 25);
  };
  const drawLink = (row, it, q) => {
    const box = row.querySelector('.mslink'), list = candidates(it, q);
    box.hidden = false;
    box.innerHTML = `<label class="cs" style="display:grid;gap:6px">Songs you added with New release<input class="field" type="search" data-ms-q placeholder="Search by song or release" value="${esc(q || '')}" autocomplete="off"></label>
      ${list.length ? `<ul class="mspick">${list.map(c => `<li><button type="button" class="pill soft" data-ms-pick="${esc(c.id)}"><span class="t">${esc(c.title)}</span><span class="cs">${esc(c.release)}${c.hidden ? ' (hidden release)' : ''} · ${esc(c.how)}</span></button></li>`).join('')}</ul>`
        : `<p class="cs">${q ? 'No match.' : 'No added songs to link yet. Add one with New release first, from a YouTube link or a file.'}</p>`}
      <div class="msbtns"><button type="button" class="pill soft" data-ms-cancel>Cancel</button></div>`;
    const inp = box.querySelector('[data-ms-q]'); inp.addEventListener('input', () => { const pos = inp.selectionStart; drawLink(row, it, inp.value); const n = row.querySelector('[data-ms-q]'); n.focus(); n.setSelectionRange(pos, pos); });
  };
  const linkFlow = async (e, lnk, pick, go, cancel) => {
    const row = e.target.closest('[data-ms]'); if (!row) return;
    const it = items.find(x => x.id === row.dataset.ms); if (!it) return;
    const box = row.querySelector('.mslink');
    if (lnk) { drawLink(row, it, ''); const q = box.querySelector('[data-ms-q]'); if (q) q.focus(); return; }
    if (cancel) { box.hidden = true; box.innerHTML = ''; return; }
    if (pick) {
      const c = candidates(it, '').find(x => x.id === pick.dataset.msPick); if (!c) return;
      box.innerHTML = `<p>Use <b>${esc(c.title)}</b> (${esc(c.release)}) as the file for <b>${esc(it.title)}</b>${it.label && it.label !== 'Original' ? ` (${esc(it.label)})` : ''}?</p>
        <p class="cs">${esc(c.title)} moves onto ${esc(it.title)}${it.kind === 'version' ? ' and the broken file is hidden from fans' : ' and it shows for fans'}. The song it was added as is removed from ${esc(c.release || 'its release')}. Nothing is deleted from storage.</p>
        <div class="msbtns"><button type="button" class="pill main" data-ms-go="${esc(c.id)}">Link it</button><button type="button" class="pill soft" data-ms-cancel>Cancel</button></div><div class="cs msst" role="status"></div>`;
      return;
    }
    if (go) {
      const st = box.querySelector('.msst'); go.disabled = true; st.textContent = 'Linking…'; st.style.color = '';
      try {
        const r = await run('missingLink', BOOT.key, it.id, go.dataset.msGo);
        const v = S.lib.versions.find(x => x.version_id === r.version.version_id); if (v) Object.assign(v, r.version);
        S.lib.versions.forEach(x => { if ((r.hiddenVersionIds || []).indexOf(x.version_id) > -1) x.hidden = true; });
        const t = S.lib.tracks.find(x => x.track_id === it.trackId); if (t && r.unhide) t.hidden = false;
        if (r.removedTrackId) S.lib.tracks = S.lib.tracks.filter(x => x.track_id !== r.removedTrackId);
        if (typeof libCacheSet === 'function') libCacheSet(S.lib);
        items = items.filter(x => x.id !== it.id); draw();
        toast('Linked: ' + it.title);
        if (r.fromReleaseEmpty) $('#msSt').textContent = `Linked “${it.title}”. The release “${r.fromRelease}” you added it in is empty now. It is still hidden; delete it from its page if you do not need it. ` + $('#msSt').textContent;
        if (S.view === 'release') renderRelease(it.relId);
      } catch (er) { go.disabled = false; st.textContent = (er && er.message) || 'Could not link it.'; st.style.color = 'var(--red, #ff6b6b)'; }
    }
  };
  $('#msList').addEventListener('click', e => {
    const lnk = e.target.closest('[data-ms-link]'), pick = e.target.closest('[data-ms-pick]'), go = e.target.closest('[data-ms-go]'), cancel = e.target.closest('[data-ms-cancel]');
    if (lnk || pick || go || cancel) { linkFlow(e, lnk, pick, go, cancel); return; }
    const up = e.target.closest('[data-ms-up]'), hide = e.target.closest('[data-ms-hide]');
    if (hide) {
      const id = hide.dataset.msHide; hide.disabled = true;
      run('missingHide', BOOT.key, id).then(() => { const it = items.find(x => x.id === id); (S.lib.versions || []).forEach(v => { if (v.version_id === id) v.hidden = true; }); items = items.filter(x => x.id !== id); draw(); toast('Hidden for fans'); }).catch(er => { hide.disabled = false; toast((er && er.message) || 'Could not hide it.'); });
      return;
    }
    if (!up) return;
    const it = items.find(x => x.id === up.dataset.msUp); if (!it) return;
    const inp = $('#msFile'); inp.value = '';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      const row = rowOf(it.id), st = row.querySelector('.msst'), bw = row.querySelector('.msbar'), bi = bw.firstElementChild; up.disabled = true; bw.hidden = false; st.style.color = ''; st.textContent = 'Picked ' + f.name + '. Starting…';
      try {
        const out = await uploadSongToEdge(f, it.relId, it.trackId, it.title, it.label, it.kind === 'song', t => { st.textContent = t; }, p => { bi.style.width = Math.round(p * 100) + '%'; });
        st.textContent = 'Going live…';
        await run('missingResolve', BOOT.key, it.id, out.version.version_id);
        const v = out.version; if (v.is_primary) S.lib.versions.filter(x => x.track_id === v.track_id).forEach(x => (x.is_primary = false));
        S.lib.versions.forEach(x => { if ((it.oldVersionIds || []).indexOf(x.version_id) > -1) x.hidden = true; }); S.lib.versions.push(v);
        if (v.url) (S.urlByFile = S.urlByFile || {})[v.audio] = v.url;
        const t = S.lib.tracks.find(x => x.track_id === it.trackId); if (t && it.unhide) t.hidden = false;
        items = items.filter(x => x.id !== it.id); draw(); toast('Live now: ' + it.title);
        if (S.view === 'release') renderRelease(it.relId);
      } catch (er) { st.textContent = (er && er.message) || 'The upload did not finish.'; st.style.color = 'var(--red, #ff6b6b)'; up.disabled = false; bw.hidden = true; }
    };
    inp.click();
  });
}
// Backups: Cloudflare copies its database into a private bucket about once a day; this screen shows that and lets you download a copy to keep.
async function openBackups() {
  const m = $('#modal'); m.className = 'modal';
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Backups"><h2>Backups</h2><p class="cs" id="bkSt">Loading…</p>
    <div id="bkList" class="cs" style="display:grid;gap:4px;max-height:34vh;overflow:auto"></div>
    <p class="cs" style="margin:10px 0 0">What is saved: releases, songs, versions, extras, playlists, letter and bio, share links, plays, comments, the fan list and the missing-files list. Not included: the music and picture files themselves (your masters stay on your own drive).</p>
    <div class="end"><button class="pill soft" data-close>Close</button><button class="pill soft" id="bkNow">Back up now</button><button class="pill main" id="bkDl">Download a copy</button></div></div>`;
  m.hidden = false;
  const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const draw = async () => {
    try {
      const r = await run('backupStatus', BOOT.key);
      $('#bkSt').textContent = r.last ? 'Last automatic backup: ' + new Date(r.last.at).toLocaleString() + ' (' + kb(r.last.size) + '). ' + r.files.length + ' kept; the newest 30 are saved.' : 'No backup yet. Tap Back up now.';
      $('#bkList').innerHTML = r.files.slice(0, 8).map(f => `<div>${esc(new Date(f.at).toLocaleString())} · ${kb(f.size)}</div>`).join('');
    } catch (e) { $('#bkSt').textContent = (e && e.message) || 'Could not load.'; }
  };
  await draw();
  $('#bkNow').addEventListener('click', async e => { const b = e.currentTarget; b.disabled = true; try { await run('backupNow', BOOT.key); toast('Backed up'); await draw(); } catch (er) { toast((er && er.message) || 'Backup failed.'); } b.disabled = false; });
  $('#bkDl').addEventListener('click', async e => {
    const b = e.currentTarget; b.disabled = true;
    try {
      const d = await run('backupGet', BOOT.key);
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d)], { type: 'application/json' }));
      a.download = 'soul-vault-backup-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); toast('Downloaded');
    } catch (er) { toast((er && er.message) || 'Could not download.'); }
    b.disabled = false;
  });
}
async function openFans() {
  const m = $('#modal'); m.className = 'modal';
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Soul Tribe fan list"><h2>Soul Tribe fan list</h2><p class="cs" id="fnSt">Loading…</p>
    <div id="fnList" style="display:grid;gap:6px;max-height:50vh;overflow:auto"></div>
    <div class="end"><button class="pill soft" data-close>Close</button><button class="pill main" id="fnCsv" disabled>Download CSV</button></div></div>`;
  m.hidden = false;
  try {
    const rows = await run('getFans', BOOT.key); $('#fnSt').textContent = rows.length + ' fans. New sign-ups are saved here (and still copied to the old Google list so the newsletter keeps working).';
    $('#fnList').innerHTML = rows.slice(0, 200).map(r => `<div class="cs"><b>${esc(r.first_name + ' ' + r.last_name)}</b> · ${esc(r.email)} · ${esc(new Date(r.at).toLocaleDateString())}</div>`).join('');
    const cols = ['at', 'first_name', 'last_name', 'email', 'consent', 'city', 'birth_year', 'social', 'how_heard', 'favorite', 'source'];
    const cell = v => { v = String(v == null ? '' : v); if (/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
    $('#fnCsv').disabled = false;
    $('#fnCsv').addEventListener('click', () => {
      const csv = [cols.join(',')].concat(rows.map(r => cols.map(c => cell(c === 'at' ? new Date(r.at).toISOString() : r[c])).join(','))).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'soul-tribe-fans.csv'; a.click();
    });
  } catch (e) { $('#fnSt').textContent = (e && e.message) || 'Could not load the list.'; }
}
function openOwnerPw() {
  const m = $('#modal'); m.className = 'modal';
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Owner password">
    <h2>Owner password</h2>
    <p class="cs" style="margin:0 0 10px">Choose a password only you know (10 or more characters; a few random words works well). Then you can sign in at <b>soulnicolas.com/admin</b> on any device without the long owner key.</p>
    <label class="sf" style="display:grid;gap:5px;margin-bottom:10px">New password<input class="field" id="pwA" type="password" autocomplete="new-password"></label>
    <label class="sf" style="display:grid;gap:5px">Type it again<input class="field" id="pwB" type="password" autocomplete="new-password"></label>
    <p class="cs" id="pwErr" role="alert" style="color:#ff8a8a;margin:8px 0 0" hidden></p>
    <div class="end"><button class="pill soft" data-close>Cancel</button><button class="pill main" id="pwSave">Save password</button></div></div>`;
  m.hidden = false; $('#pwA').focus();
  $('#pwSave').addEventListener('click', async e => {
    const a = $('#pwA').value, b = $('#pwB').value, err = $('#pwErr'), btn = e.currentTarget;
    const bad = t => { err.hidden = false; err.textContent = t; };
    if (a.length < 10) return bad('Use at least 10 characters.');
    if (a !== b) return bad('The two passwords are different.');
    btn.disabled = true;
    try { await run('setOwnerPassword', BOOT.key, a); closeModal(); toast('Password saved. Sign in at soulnicolas.com/admin'); }
    catch (er) { bad(er.message || 'Could not save the password.'); btn.disabled = false; }
  });
}
function renderAdminLogin() {
  document.body.classList.add('share-mode');
  $('#main').innerHTML = `<div class="wrap" style="max-width:420px;margin:0 auto;padding-top:12vh">
    <h1 class="page-h" style="padding:0"><b>Owner login</b></h1>
    <form id="adminForm" style="display:grid;gap:12px;margin-top:14px">
      <label class="sf" style="display:grid;gap:5px">Password<input class="field" id="adminPw" type="password" autocomplete="current-password" required autofocus></label>
      <p class="cs" id="adminErr" role="alert" style="color:#ff8a8a;margin:0" hidden></p>
      <button class="pill main" type="submit" id="adminGo">Sign in</button>
    </form>
    <p class="cs" style="margin-top:18px">Only for Nicólas. <a href="/">Back to the site</a></p></div>`;
  $('#adminForm').addEventListener('submit', async e => {
    e.preventDefault(); const btn = $('#adminGo'), err = $('#adminErr'); btn.disabled = true; err.hidden = true;
    try {
      const r = await fetch(BOOT.api, { method: 'POST', body: JSON.stringify({ fn: 'ownerLogin', args: [$('#adminPw').value] }), credentials: 'omit' }).then(x => x.json());
      if (!r.ok) throw new Error(r.error || 'Could not sign in.');
      try { localStorage.setItem('sv_owner_key', r.result.key); } catch (e2) { throw new Error('This browser would not save the sign-in. Turn off private browsing and try again.'); }
      location.replace('/vault');
    } catch (er) { err.hidden = false; err.textContent = er.message || 'Could not sign in.'; btn.disabled = false; }
  });
}

function recentKey() { return 'sv_recent_' + (OWNER ? 'owner' : BOOT.token); }
function recordRecent(t) {
  const list = ls.get(recentKey(), []).filter(id => id !== t.track_id);
  list.unshift(t.track_id); ls.set(recentKey(), list.slice(0, 20));
}
function recentRow() {
  const ts = ls.get(recentKey(), []).map(trk).filter(t => t && !hidden(t) && primaryOf(t)).slice(0, 8);
  if (!ts.length) return '';
  return `<section id="recent"><h2 class="sh"><span><b>Recently</b> played</span></h2><div class="recent hrow">${ts.map(t => {
    const r = rel(t.release_id) || {};
    return `<button class="rc" data-track-play="${esc(t.track_id)}"><img class="art" data-cover="${esc(r.cover_file_id)}" alt="">
      <span class="ct">${esc(t.title)}</span><span class="cs">${esc(r.title)}</span></button>`;
  }).join('')}</div></section>`;
}

/* ── release ── */
function renderRelease(id) {
  if (S.editing && S.stale) { S.editing = false; toast('Syncing your latest changes. Try Edit again in a second.'); }
  if (S.view === 'library') S.libScroll = window.scrollY;
  if (S.releaseId !== id) { S.editing = false; S.songTab = 'full'; }
  S.view = 'release'; S.releaseId = id;
  warmRelease(id);
  if (OWNER || CLUB()) renderChrome();
  const r = rel(id);
  if (!OWNER && r.locked) { sealedView(r); return; }
  visitWorld(r);
  const editing = OWNER && S.editing;
  const ts = tracksOf(id, editing);
  $('#main').innerHTML = `
    <header class="relhead" id="relhead"><div class="wrap">
      ${OWNER || CLUB() ? `<button class="back" data-nav="library-back">${I.back}Music</button>` : ''}
      <div class="hero">
        <div class="artwrap">
          <img class="art" id="heroArt" alt="Cover of ${esc(r.title)}">
          ${OWNER ? `<button class="covbtn" data-cover-change aria-label="Change cover for ${esc(r.title)}"><span>${I.img}Change cover</span></button>` : ''}
        </div>
        <div>
          <div class="kind">${esc(typeOf(r))}${OWNER || CLUB() ? '' : ', shared with you'}</div>
          ${editing ? `<input class="edit-title" id="editRelTitle" value="${esc(r.title)}" maxlength="120" aria-label="Release title">`
                    : `<h1>${esc(r.title)}</h1>`}
          ${editing ? '' : `<div class="byline">by <b>${linkName(relArtist(r))}</b></div>${r.bsides_of && rel(r.bsides_of) ? `<div class="bsof">B-sides to <button data-rel="${esc(r.bsides_of)}">${esc(rel(r.bsides_of).title)}</button></div>` : ''}`}
          <i class="flagband" aria-hidden="true" style="display:block;margin:2px 0 10px"></i>
          ${r.world_tagline && !editing ? `<p class="tagline">${esc(r.world_tagline)}</p>` : ''}
          ${OWNER && isLocked(r) && !editing ? `<div class="ownerseal">${I.lock}<span>Sealed for the fan club until ${esc(whenLabel(r.unlock_at))}.</span><span data-unlock="${esc(r.unlock_at)}"></span></div>` : ''}
          ${metaLine(r, ts)}
          <div class="acts">
            ${editing ? '' : `<button class="pill main" data-playall>${I.play}Play</button>
                              <button class="pill soft" data-shuffleall>${I.shuf}Shuffle</button>${!isLocked(r) && !isUnrel(r) ? `<button class="pill soft" data-share-out="release" aria-label="Share ${esc(r.title)}">${I.share}Share</button>` : ''}<button class="pill soft" data-queue-rel aria-label="Add ${esc(r.title)} to the queue">${I.queue}Add to queue</button>`}
          </div>
          ${OWNER && !editing ? `<div class="tools" role="group" aria-label="Release tools">
            <button class="pill soft" data-share="release" data-id="${esc(id)}">${I.share}<span>Share</span></button>
            <button class="pill soft" data-edit>${I.edit}<span>Edit</span></button>
            <button class="pill soft" data-upload="new">${I.plus}<span>Add song</span></button>
          </div>` : ''}
        </div>
      </div>
    </div></header>
    <div class="wrap">${editing ? editList(ts) : eraNav(r, ts) + songsSection(ts) + videosSection(r, ts) + playlistsSection(r) + notesSection(r) + aboutSection(r) + photosSection(r)
      + linkCards(r, 'review', '<b>Reviews</b> and press') + linkCards(r, 'app', '<b>Apps</b> and experiences') + seriesPanel(r)}</div>`;
  const hero = $('#heroArt');
  if (r.world_color) $('#relhead').style.setProperty('--tint', r.world_color);
  setCover(hero, r.cover_file_id, true, () => { if (!r.world_color) tintFrom(hero); });
  markPlaying(); loadPhotos(); fitTitle(); loadCovers(); applyPageBg(r); $$('#era-videos .vsec').forEach(x => wireRows(x));
  if (!editing && relPublic(r) && extrasOf(r.release_id, 'photo').length) prepImages(id);   // get this release's pictures ready in the background

  if (editing) { makeSortable($('#editList'), moveDraftTo); if ($('#vEditList')) makeSortable($('#vEditList'), vMoveTo); if ($('#pEditList')) makeSortable($('#pEditList'), pMoveTo); }
  if (!editing) window.scrollTo(0, 0);
}

/* ── edit tracklist ── */
function editList(ts) {
  S.draft = ts.map(t => {
    const vs = versionsOf(t.track_id, true);
    return { track_id: t.track_id, title: String(t.title == null ? '' : t.title), hidden: hidden(t), chapter: String(t.chapter || ''),
             number: String(t.number_label || '').trim(), artist: String(t.artist || '').trim(), genre: String(t.genre || '').trim(), unreleased: isUnrel(t), guest: t.feature_role === 'mine',
             category: { bsides: 'B-Side', deluxe: 'Deluxe', full: 'Main' }[sectionOf(t)], extraKind: isExtra(t) ? extraKindOf(t) : '', single: isSingle(t),
             primary: (vs.find(v => v.is_primary) || vs[0] || {}).version_id,
             hiddenVersions: vs.filter(hidden).map(v => v.version_id) };
  });
  return `<div class="editbar top"><button class="pill soft lybtn" data-lyrics-all>${I.text}Lyrics</button><button class="pill soft" data-edit-cancel>Cancel</button><button class="pill main" data-edit-save>Save changes</button></div>
    ${relDetailsForm(rel(S.releaseId))}
    <h2 class="sh songshead"><span><b>Tracklist</b></span><button class="seeall" type="button" data-num-reset>Reset numbers</button></h2>
    <p class="cs" style="margin:0 0 6px">Drag the handle to reorder. Rename songs here; tap Options for a song's artist, section, single, hiding, and which version plays first.</p>
    <ol class="tracks" id="editList">${editRows()}</ol>
    <div class="editbar"><button class="pill soft" data-edit-cancel>Cancel</button><button class="pill main" data-edit-save>Save changes</button></div>
    <p class="err" id="editErr" hidden></p>`;
}
function editRows(moved) {
  const n = S.draft.length;
  return S.draft.map((d, i) => `
    <li class="erow sortrow${moved === i ? ' moved' : ''}${d.hidden ? ' hid' : ''}">
      <input class="numin" data-num="${i}" value="${esc(d.number)}" placeholder="${i + 1}" maxlength="6" inputmode="text" aria-label="Number shown for ${esc(d.title)} (empty = ${i + 1})">
      <input data-draft="${i}" value="${esc(d.title)}" maxlength="200" aria-label="Title of song ${i + 1}">
      <button class="grip" type="button" data-grip="${i}" aria-label="Reorder ${esc(d.title)}, position ${i + 1} of ${n}. Drag, or use the up and down arrow keys." title="Drag to reorder">${I.grip}</button>
      <details class="sopts"><summary>Options ${songOptsTags(d)}</summary><div class="eopts">
        <label class="artin">Song artist <span class="note">(fill in only if it's not ${esc(relArtist(rel(S.releaseId)))})</span>
          <input class="field" data-tart="${i}" value="${esc(d.artist)}" maxlength="120" placeholder="${esc(relArtist(rel(S.releaseId)))}"></label>
        <label class="artin">Song genre <span class="note">(leave empty to use the project's${rel(S.releaseId).genre ? ': ' + esc(rel(S.releaseId).genre) : ''})</span>
          <input class="field" data-tgenre="${i}" list="genreList" value="${esc(d.genre)}" maxlength="160" placeholder="${esc(rel(S.releaseId).genre || 'Genre')}"></label>
        <div class="secrow"><label class="secsel">Section <select class="field" data-cat="${i}">
            <option value="Main"${d.category === 'Main' ? ' selected' : ''}>Full project</option>
            ${EXTRA_KINDS.map(k => `<option value="${esc(k)}"${d.category !== 'Main' && d.extraKind === k ? ' selected' : ''}>Extra: ${esc(k)}</option>`).join('')}</select></label>
          <label><input type="checkbox" data-single="${i}" ${d.single ? 'checked' : ''}> Released as a single</label></div>
        <label><input type="checkbox" data-hide-track="${i}" ${d.hidden ? 'checked' : ''}> Hide this song</label>
        <label><input type="checkbox" data-unrel-track="${i}" ${d.unreleased ? 'checked' : ''}> Unreleased (shows an "Unreleased" tag)</label>
        <label><input type="checkbox" data-guest-track="${i}" ${d.guest ? 'checked' : ''}> A feature: my guest spot on someone else's song</label>
        <span class="cs">It then shows under Features, Guest spots. Type the main artist (whose song it is) in Song artist above.</span>
        <button class="pill soft danger" type="button" data-del-song="${i}">${I.trash}Delete this song…</button>
        ${(() => {
          const vs = versionsOf(d.track_id, true);
          if (vs.length < 2) return '';
          return vs.map(v => `<div class="vline">
            <label><input type="radio" name="pri-${i}" data-primary="${i}" value="${esc(v.version_id)}" ${v.version_id === d.primary ? 'checked' : ''}> Plays first: ${esc(v.label)}</label>
            <label><input type="checkbox" data-hide-ver="${i}" value="${esc(v.version_id)}" ${d.hiddenVersions.includes(v.version_id) ? 'checked' : ''}> Hide</label>
            <button class="ib" type="button" data-del-ver="${esc(v.version_id)}" aria-label="Delete the ${esc(v.label)} version">${I.trash}</button>
          </div>`).join('');
        })()}
      </div></details>
    </li>`).join('');
}
async function saveEdits() {
  let items = [];
  const btns = [...$$('[data-edit-save]')];
  btns.forEach(b => { b.disabled = true; b.textContent = 'Saving…'; });
  const btn = { set disabled(v) { btns.forEach(b => (b.disabled = v)); }, set textContent(v) { btns.forEach(b => (b.textContent = v)); } };
  const title = ($('#editRelTitle').value || '').trim();
  const details = readDetails();
  const badTrailer = (S.chaps || []).find(c => (c.trailer || '').trim() && !ytId(c.trailer.trim()));
  const chapErr = badTrailer ? `The trailer for "${badTrailer.name}" needs to be a YouTube link.` : applyChapters();
  if (chapErr) {
    btn.disabled = false; btn.textContent = 'Save changes';
    const ce = $('#chapErr'); if (ce) { ce.hidden = false; ce.textContent = chapErr; const pd = ce.closest('details'); if (pd) pd.open = true; ce.scrollIntoView({ block: 'center' }); }
    toast(chapErr); return;
  }
  const noArtist = S.draft.find(d => d.guest && !String(d.artist || '').trim());
  if (noArtist) {
    btn.disabled = false; btn.textContent = 'Save changes';
    const msg = `For a guest spot, type the main artist (whose song it is) in Song artist for “${noArtist.title}”.`;
    const row = $('#editList [data-guest-track="' + S.draft.indexOf(noArtist) + '"]'); if (row) { const dt = row.closest('details'); if (dt) dt.open = true; row.scrollIntoView({ block: 'center' }); }
    toast(msg); return;
  }
  try {
    items = S.draft.map(d => ({ track_id: d.track_id, title: String(d.title == null ? '' : d.title).trim(), hidden: d.hidden, primary: d.primary, hiddenVersions: d.hiddenVersions, chapter: d.chapter, category: d.category, extra_kind: d.category === 'Main' ? '' : d.extraKind, single: d.single,
                                number: d.number, artist: d.artist, genre: d.genre, unreleased: !!d.unreleased, feature_role: d.guest ? 'mine' : '' }));
    const al = artistLinksDraft();
    if (al) S.lib.artist_links = await run('saveArtistLinks', BOOT.key, al);
    if (details) {
      const out = await run('saveWorld', BOOT.key, S.releaseId, details);
      Object.assign(rel(S.releaseId), out);
      if (out.release_date) rel(S.releaseId).year = Number(out.release_date.slice(0, 4));
      S.lib.birth_date = details.birth_date;
      if (S.nameCache) delete S.nameCache[S.releaseId];
    }
    const relHidden = $('#relHidden') ? $('#relHidden').checked : null;
    const relType = $('#relType') ? $('#relType').value : null;
    const colors = {}, cmeta = {};
    (S.chaps || []).forEach((c, i) => { const n = String(c.name || '').trim() || `Chapter ${i + 1}`; if (c.color) colors[n] = c.color;
      if ((c.desc || '').trim() || (c.trailer || '').trim()) cmeta[n] = { desc: (c.desc || '').trim(), trailer: (c.trailer || '').trim() }; });
    await run('saveTracklist', BOOT.key, S.releaseId, title, items, relHidden, relType, '2', S.chaps ? colors : null, S.chaps ? cmeta : null);
    if (S.chaps) { rel(S.releaseId).chapter_colors = Object.keys(colors).length ? JSON.stringify(colors) : ''; rel(S.releaseId).chapter_meta = Object.keys(cmeta).length ? JSON.stringify(cmeta) : ''; }
    rel(S.releaseId).chapter_mode = '2';
    if (relType) rel(S.releaseId).type = relType;   // replaces any old Deluxe/B-Sides label
    const uEl = $('#relUnlock'), rr = rel(S.releaseId);
    if (uEl) {
      const want = uEl.value ? new Date(uEl.value).toISOString() : '';
      const have = rr.unlock_at ? new Date(rr.unlock_at).toISOString() : '';
      if (want !== have) rr.unlock_at = await run('saveUnlock', BOOT.key, S.releaseId, want);
    }
    const r = rel(S.releaseId); if (title) r.title = title; if (relHidden != null) r.hidden = relHidden;
    items.forEach((it, i) => {
      const t = trk(it.track_id); if (!t) return;
      if (it.title) t.title = it.title; t.track_no = i + 1; t.hidden = !!it.hidden; t.chapter = String(it.chapter || '').trim(); t.category = it.category; t.extra_kind = it.category === 'Main' ? '' : (it.extra_kind || ''); t.is_single = !!it.single;
      t.number_label = String(it.number || '').trim().replace(/[^A-Za-z0-9.\-]/g, '').slice(0, 6); t.artist = String(it.artist || '').trim();
      if (it.genre != null) t.genre = String(it.genre || '').split(',').map(x => x.trim()).filter(Boolean).join(', ');
      t.unreleased = !!it.unreleased; t.feature_role = it.feature_role === 'mine' ? 'mine' : '';
      S.lib.versions.filter(v => v.track_id === t.track_id).forEach(v => {
        if (it.primary) v.is_primary = v.version_id === it.primary;
        v.hidden = it.hiddenVersions.includes(v.version_id);
      });
    });
    S.editing = false;
    renderRelease(S.releaseId);
    if (S.now) updateNowUI();
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Save changes';
    const err = $('#editErr'); err.hidden = false; err.textContent = e.message || 'Your changes could not be saved.';
    toast(e.message || 'Your changes could not be saved.');
  }
}

/* ── lyrics for every song in the release ── */
// Hidden songs are left out (also ones you've just ticked "Hide this song" on but not saved yet).
function lyricTracks() {
  return (S.draft || []).filter(d => !d.hidden).map(d => ({ t: trk(d.track_id), title: d.title })).filter(x => x.t);
}
function openLyricsAll() {
  const list = lyricTracks();
  if (!list.length) return toast((S.draft || []).some(d => d.hidden) ? 'Every song is hidden, so there are none to add lyrics to.' : 'No songs to add lyrics to yet');
  $('#modal').innerHTML = `<div class="sheet wide lyrall" role="dialog" aria-modal="true" aria-labelledby="mTitle">
    <h2 id="mTitle">Lyrics: ${esc(rel(S.releaseId).title)}</h2>
    <p class="cs">Paste lyrics into any song, then save once. Line breaks and blank lines are kept. <b id="lyCount"></b></p>
    <ol class="lylist">${list.map((x, i) => `<li>
      <label for="ly-${i}"><span class="n">${i + 1}</span>${esc(x.title)}</label>
      <textarea class="field" id="ly-${i}" data-ly="${esc(x.t.track_id)}" rows="6" maxlength="20000" placeholder="Paste the lyrics for ${esc(x.title)}">${esc(x.t.lyrics || '')}</textarea>
      <div class="lyacts"><button class="pill soft lylink" type="button" data-lylink="${i}">${I.link || ''}Fill from a link (Genius…)</button>
        <button class="pill soft lylink" type="button" data-lyclear="${i}">Clear lyrics</button></div>
    </li>`).join('')}</ol>
    <p class="err" id="lyErr" hidden></p>
    <div class="end"><button class="pill soft" data-close>Cancel</button><button class="pill main" data-lyrics-save>Save lyrics</button></div></div>`;
  $('#modal').hidden = false;
  lyCount();
  $('#ly-0').focus();
}
function lyChanged() {
  return [...$$('[data-ly]')].filter(el => el.value.trim() !== String(trk(el.dataset.ly).lyrics || '').trim());
}
function lyCount() {
  const els = [...$$('[data-ly]')], n = els.filter(el => el.value.trim()).length, c = $('#lyCount');
  if (c) c.textContent = `${n} of ${els.length} songs have lyrics.`;
}
async function saveLyricsAll(btn) {
  const changed = lyChanged();
  if (!changed.length) { closeModal(); toast('No lyric changes to save'); return; }
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const items = changed.map(el => ({ track_id: el.dataset.ly, lyrics: el.value }));
    await run('saveLyrics', BOOT.key, S.releaseId, items);
    items.forEach(it => { trk(it.track_id).lyrics = it.lyrics.replace(/\r\n?/g, '\n').trim(); });
    $('#modal').hidden = true; $('#modal').innerHTML = '';
    toast(`Lyrics saved for ${items.length} song${items.length === 1 ? '' : 's'}`);
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Save lyrics';
    const err = $('#lyErr'); err.hidden = false; err.textContent = e.message || 'Could not save the lyrics.';
  }
}

