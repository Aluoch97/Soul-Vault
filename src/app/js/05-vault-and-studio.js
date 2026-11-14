/* ── My Vault ── */
function renderVault() {
  clearPageBg();
  S.view = 'vault'; renderChrome();
  const tracks = S.lib.tracks.filter(t => !hidden(t) && primaryOf(t));
  const rels = S.lib.releases.filter(r => tracksOf(r.release_id).length);
  const live = (S.lib.shares || []).filter(s => s.active);
  const tile = (cls, nav, icon, title, sub) => `<button class="tile ${cls}" ${nav}><span class="ic">${icon}</span><strong>${title}</strong><span>${sub}</span></button>`;
  // One row = icon, a one-line title with its note underneath, a chevron. Every row is built the same way so they all line up.
  const row = (attr, icon, title, sub, subId) => `<li><button ${attr}><span class="si">${icon}</span><span class="st"><b>${title}</b><span class="cs"${subId ? ` id="${subId}"` : ''}>${sub}</span></span><span class="sc">${I.chev}</span></button></li>`;
  const group = (title, rows, cls) => `<section class="sgroup ${cls || ''}"><h2 class="vsub">${title}</h2><ul class="acts-list">${rows.filter(Boolean).join('')}</ul></section>`;
  const edge = EDGE_UPLOADS();
  $('#main').innerHTML = `<div class="wrap">
    <header class="vh"><h1 class="page-h" style="padding:0;margin:0"><b>Settings</b></h1><button class="avatar" data-nav="library" aria-label="Home">NS</button></header>
    <div class="tiles three">
      ${tile('r', 'data-nav="search"', I.note, 'Songs', tracks.length + ' songs')}
      ${tile('g', 'data-jump="all"', I.disc, 'Releases', rels.length + ' releases')}
      ${tile('g', 'data-nav="shares"', I.link, 'Share links', live.length + ' on')}
    </div>
    ${group('Create &amp; edit', [
      row('data-nav="studio"', I.edit, 'Studio', 'New releases, songs, info, links and your bio'),
      edge ? row('data-missing', I.up2, 'Missing files', 'Songs waiting for their audio') : '',
      edge ? row('data-linkonly', I.link, 'Songs on links only', linkOnlySongs().length ? linkOnlySongs().length + ' depend on a YouTube or SoundCloud link' : 'All songs have their own file') : '',
    ])}
    ${group('Fans &amp; activity', [
      row('data-nav="siteinsights"', I.chart, 'Website insights', 'Visitors, pages, cities and devices'),
      row('data-nav="insights"', I.chart, 'Listening insights', 'Plays and listeners'),
      edge ? row('data-fans', I.link, 'Soul Tribe fan list', 'Sign-ups from /join, to download') : '',
      row('data-nav="lore"', I.layers, 'Lore', 'Producers, places and eras'),
    ])}
    ${group('Health checks', [
      row('data-check-yt', I.film, 'Check YouTube setup', 'Needed for playlists from YouTube'),
      row('data-yt-titles', I.up2, 'YouTube titles', 'checking…', 'ytTitlesCount'),
      row('data-check-playback', I.play, 'Check playback setup', 'Tests your API key'),
      row('data-problems', I.layers, 'Problems reported', 'checking…', 'probCount'),
    ])}
    ${group('Backups &amp; Cloudflare', [
      edge ? row('data-backups', I.up2, 'Backups', 'A copy of everything on Cloudflare') : '',
      row('data-backup', I.up2, 'Back up my Sheet now', esc(backupLine())),
      edge ? row('data-areas', I.layers, 'Move off the Sheet', 'Move playlists, extras and bio over') : '',
    ])}
    ${group('Account', [
      row('data-ownerpw', I.lock, 'Set owner password', 'Sign in at /admin, no key needed'),
      row('data-signout', I.x, 'Sign out on this device', 'Sign back in with your password'),
      row('data-ownerkey', I.link, 'Copy owner key', 'For Cloudflare setup. Keep private'),
    ], 'account')}
  </div>`;
  $('[data-ownerpw]').addEventListener('click', openOwnerPw);
  if ($('[data-areas]')) $('[data-areas]').addEventListener('click', openAreas);
  if ($('[data-fans]')) $('[data-fans]').addEventListener('click', openFans);
  if ($('[data-missing]')) $('[data-missing]').addEventListener('click', openMissing);
  if ($('[data-linkonly]')) $('[data-linkonly]').addEventListener('click', openLinkOnly);
  if ($('[data-backups]')) $('[data-backups]').addEventListener('click', openBackups);
  $('[data-signout]').addEventListener('click', () => { try { localStorage.removeItem('sv_owner_key'); } catch (e) {} location.replace('/'); });
  const ok = $('[data-ownerkey]');
  if (ok) ok.addEventListener('click', async () => {   // the key is never shown on screen, only put on the clipboard
    try { await navigator.clipboard.writeText(BOOT.key || ''); toast('Owner key copied. Paste it into Cloudflare, nowhere else.'); }
    catch (e) { toast('Could not copy. Try again, or use the Soul Vault menu in your Sheet.'); }
  });
  window.scrollTo(0, 0);
}

/* ═════════ Studio: one place to edit titles, songs, info, streaming links (owner only) ═════════ */
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  .studio .stusel { width: 100%; margin: 6px 0 14px; }
  .studio details.stu { border: 1px solid var(--line); border-radius: 14px; margin: 0 0 12px; background: rgba(255,255,255,.03); }
  .studio details.stu > summary { cursor: pointer; padding: 14px 16px; font-weight: 800; list-style: none; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .studio details.stu > summary::-webkit-details-marker { display: none; }
  .studio .stubody { padding: 0 16px 16px; display: grid; gap: 12px; }
  .studio label.sf { display: grid; gap: 5px; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--dim); }
  .studio label.sf .field, .studio label.sf select, .studio label.sf textarea { text-transform: none; letter-spacing: 0; font-weight: 400; font-size: 15px; color: var(--text); }
  .studio .sf2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } @media (max-width: 520px) { .studio .sf2 { grid-template-columns: 1fr; } }
  .studio .chk { display: flex; align-items: center; gap: 8px; font-size: 14px; }
  .studio .lrow { display: grid; grid-template-columns: minmax(0, 150px) minmax(0, 1fr) auto; gap: 8px; align-items: center; }
  .studio .scard { border: 1px solid var(--line); border-radius: 12px; padding: 12px; display: grid; gap: 10px; background: rgba(255,255,255,.02); }
  .studio .scard h3 { margin: 0; font-size: 15px; } .studio .scard h3 span { color: var(--dim); font-weight: 600; margin-right: 6px; }
  .studio .save { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; } .studio .st { font-size: 13px; color: var(--dim); }
` }));
/* ═════════ Uploads straight to our own storage (no Google Drive) ═════════ */
const EDGE_UPLOADS = () => !!BOOT.api && BOOT.api !== BOOT.gas;   // true once the Cloudflare backend is on
function putFile(key, blob, type, onProg) {
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest(); x.open('PUT', '/upload?key=' + encodeURIComponent(key));
    x.setRequestHeader('content-type', type); x.setRequestHeader('x-owner-key', BOOT.key);
    x.upload.onprogress = e => { if (e.lengthComputable && onProg) onProg(e.loaded / e.total); };
    x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch (e) {} x.status === 200 && j.ok ? res(j) : rej(new Error(j.error || 'The upload failed (' + x.status + ').')); };
    x.onerror = () => rej(new Error('The upload was interrupted. Check your connection and try again.'));
    x.send(blob);
  });
}
const newImgId = prefix => prefix + Array.from(crypto.getRandomValues(new Uint8Array(10))).map(b => b.toString(16).padStart(2, '0')).join('');
async function resizeJpeg(file, w) {
  let bmp; try { bmp = await createImageBitmap(file); } catch (e) { throw new Error('That picture could not be read. Use a JPG or PNG.'); }
  const sc = Math.min(1, w / bmp.width), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * sc)); c.height = Math.max(1, Math.round(bmp.height * sc));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('That picture could not be prepared.'))), 'image/jpeg', 0.88));
}
// Makes the sizes the app asks for and uploads them under img/<id>/<size>. covers: t + 1200; photos: 160 + 400 + 1600.
async function uploadPicture(file, id, sizes, onProg) {
  const px = { t: 400, 160: 160, 400: 400, 1200: 1200, 1600: 1600 };
  for (let i = 0; i < sizes.length; i++) await putFile('img/' + id + '/' + sizes[i], await resizeJpeg(file, px[sizes[i]]), 'image/jpeg', p => onProg && onProg((i + p) / sizes.length));
}
// The file as it will be streamed: an MP3/M4A/AAC/OGG goes as it is; WAV, AIFF, FLAC and the like become a 256 kbps MP3 (your master stays on your own drive).
async function streamingCopy(file, stat, bar) {
  const ext0 = (file.name.match(/\.([^.]+)$/) || ['', ''])[1].toLowerCase();
  let blob = file, ext = ext0, seconds = await audioDuration(file);
  if (['mp3', 'm4a', 'aac', 'ogg'].indexOf(ext0) < 0) {
    stat('Making a streaming copy…');
    const out = await toMp3(await file.arrayBuffer(), p => bar(p * 0.45), 256); blob = out.blob; ext = 'mp3'; seconds = seconds || out.duration;
  }
  const type = ext === 'mp3' ? 'audio/mpeg' : ext === 'ogg' ? 'audio/ogg' : 'audio/mp4';
  if (blob.size > 90 * 1048576) throw new Error('That file is over 90 MB. Use an MP3 or AAC copy.');
  return { blob, ext, type, seconds };
}
async function uploadSongToEdge(file, relId, tid, title, label, primary, stat, bar) {
  const { blob, ext, type, seconds } = await streamingCopy(file, stat, bar);
  stat('Uploading…');
  const plan = await run('studioPlanUpload', BOOT.key, { relId, trackId: tid || undefined, title, label, ext });
  await putFile(plan.key, blob, type, p => bar(0.45 + p * 0.5));
  stat('Adding it to your library…');
  return run('studioAddSong', BOOT.key, { relId, trackId: tid || undefined, title, label, primary, seconds, key: plan.key, ext });
}
// Replace the audio of an existing version on our own storage. Returns the updated version, or null when the catalog is still on the Sheet (the caller then uses the Drive way).
async function replaceAudioOnEdge(file, v, t, stat, bar) {
  try { await run('studioReplaceAudio', BOOT.key, { versionId: v.version_id, preflight: true }); }   // asks first, so nothing is uploaded for nothing
  catch (e) { if (/Switch the catalog/.test(e.message || '')) return null; throw e; }
  const { blob, ext, type, seconds } = await streamingCopy(file, stat, bar);
  stat('Uploading…');
  const plan = await run('studioPlanUpload', BOOT.key, { relId: t.release_id, trackId: t.track_id, label: v.label, ext });
  await putFile(plan.key, blob, type, p => bar(0.45 + p * 0.5));
  stat('Swapping it in…');
  return run('studioReplaceAudio', BOOT.key, { versionId: v.version_id, key: plan.key, seconds });
}

// Studio: the buttons for adding things to a release, and a New release form.
function stuAddSection(rid, isOwnerEdge) {
  return `<div class="stu stubox"><div class="stubody">
    <p class="cs" style="margin:0">Songs and pictures go straight to your own storage. A WAV or AIFF is turned into a 256 kbps MP3 first; your master files stay on your computer.</p>
    <div class="save"><button type="button" class="pill main" id="stuAddSong">${I.plus}Add a song</button><button type="button" class="pill soft" id="stuAddPhotos">${I.img}Add photos</button><button type="button" class="pill soft" id="stuCover">${I.img}Change cover</button>
      <button type="button" class="pill soft" id="stuBg">${I.img}Page background</button><button type="button" class="pill soft" id="stuClean">${I.img}Clean cover</button></div>
    <input type="file" id="stuPhotoFiles" accept="image/*" multiple hidden><input type="file" id="stuCoverFile" accept="image/*" hidden><input type="file" id="stuBgFile" accept="image/*" hidden><input type="file" id="stuCleanFile" accept="image/*" hidden>
    <p class="cs" style="margin:0">Page background, clean cover and song covers work once the catalog is switched to Cloudflare (Settings, Move off the Sheet).</p>
    <p class="st" id="stuAddSt" role="status"></p></div></div>`;
}
function wireStuAdd(rid) {
  const say = (t, bad) => { const e = $('#stuAddSt'); if (e) { e.textContent = t; e.style.color = bad ? 'var(--red, #ff6b6b)' : ''; } };
  $('#stuAddSong').addEventListener('click', () => openUpload(rid));
  $('#stuAddPhotos').addEventListener('click', () => $('#stuPhotoFiles').click());
  $('#stuCover').addEventListener('click', () => $('#stuCoverFile').click());
  const oneImage = (btn, input, kind, sizes, done) => {
    $(btn).addEventListener('click', () => $(input).click());
    $(input).addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      try { say('Uploading…'); const id = newImgId('c'); await uploadPicture(f, id, sizes); await run('studioSetCover', BOOT.key, { relId: rid, coverId: id, kind }); done(id); say('Done.'); toast('Saved'); }
      catch (er) { say(er.message || 'Could not upload.', true); }
    });
  };
  oneImage('#stuBg', '#stuBgFile', 'bg', ['1600'], id => { const m = rel(rid); if (m) m.bg_file_id = id; });
  oneImage('#stuClean', '#stuCleanFile', 'clean', ['t', '1200'], id => { const m = rel(rid); if (m) { m.clean_cover_file_id = id; m.clean_cover_thumb = ''; } });
  $$('[data-stu-songcover]').forEach(b => b.addEventListener('click', () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return; const tid = b.dataset.stuSongcover;
      try { say('Uploading the song cover…'); const id = newImgId('c'); await uploadPicture(f, id, ['t', '1200']); await run('studioSetCover', BOOT.key, { relId: rid, coverId: id, kind: 'song', trackId: tid }); const t = trk(tid); if (t) t.track_cover = id; say('Song cover saved.'); toast('Saved'); }
      catch (er) { say(er.message || 'Could not upload.', true); }
    };
    inp.click();
  }));
  $('#stuPhotoFiles').addEventListener('change', async e => {
    const files = [...e.target.files]; e.target.value = ''; if (!files.length) return;
    let n = 0;
    try {
      for (const f of files) {
        say('Uploading photo ' + (n + 1) + ' of ' + files.length + '…');
        const id = newImgId('p'); await uploadPicture(f, id, ['160', '400', '1600']);
        const x = await run('studioAddPhoto', BOOT.key, { relId: rid, fileId: id, caption: f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 80) });
        (S.lib.extras = S.lib.extras || []).push(x); n++;
      }
      say(n + (n === 1 ? ' photo' : ' photos') + ' added.'); toast('Photos added');
    } catch (er) { say((n ? n + ' added, then: ' : '') + (er.message || 'Could not upload.'), true); }
  });
  $('#stuCoverFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      say('Uploading the cover…');
      if (f.type === 'image/gif') { await uploadGifCover(f, rid); say('Cover changed.'); toast('Cover changed'); return; }   // keeps its animation
      const id = newImgId('c'); await uploadPicture(f, id, ['t', '1200']);
      await run('studioSetCover', BOOT.key, { relId: rid, coverId: id });
      const mine = rel(rid); if (mine) { mine.cover_file_id = id; mine.cover_thumb = ''; mine.cover_type = ''; }
      say('Cover changed.'); toast('Cover changed');
    } catch (er) { say(er.message || 'Could not upload the cover.', true); }
  });
}
const STU_SERVICES = ['Spotify', 'Apple Music', 'YouTube Music', 'YouTube', 'Bandcamp', 'SoundCloud', 'DatPiff', 'Audiomack', 'Tidal', 'Amazon Music', 'Deezer'];
async function renderStudio() {
  clearPageBg(); S.view = 'studio'; renderChrome();
  const head = '<button class="back" data-nav="vault">' + I.back + 'Settings</button><header class="vh"><h1 class="page-h" style="padding:0;margin:0"><b>Studio</b></h1><button class="avatar" data-nav="vault" aria-label="Settings">NS</button></header>';
  $('#main').innerHTML = `<div class="wrap studio">${head}<p class="cs">Loading your catalog…</p></div>`;
  try { S.stu = await run('studioGet', BOOT.key); }
  catch (e) { $('#main').innerHTML = `<div class="wrap studio">${head}<p class="status">${esc(e.message || 'Studio could not load.')}</p><button class="pill main" data-nav="studio">Try again</button></div>`; return; }
  if (!S.stuRel || !S.stu.releases.some(r => r.release_id === S.stuRel)) S.stuRel = (S.stu.releases.slice().sort((a, b) => String(b.release_date || b.year).localeCompare(String(a.release_date || a.year))).find(r => !r.unlock_at && S.stu.tracks.some(t => t.release_id === r.release_id)) || S.stu.releases[0] || {}).release_id;
  drawStudio();
}
function drawStudio() {
  const g = S.stu, rid = S.stuRel, r = g.releases.find(x => x.release_id === rid); if (!r) return;
  const ov = g.overlay || { releases: {}, sr: {}, flags: { releases: {}, tracks: {} } };
  const fl = ov.flags || { releases: {}, tracks: {} }, lk = ov.releases[rid] || { first: '', links: [] };
  const rels = g.releases.slice().sort((a, b) => String(b.release_date || b.year).localeCompare(String(a.release_date || a.year)));
  const tracks = g.tracks.filter(t => t.release_id === rid).sort((a, b) => (Number(a.track_no) || 0) - (Number(b.track_no) || 0));
  const unrel = rid in fl.releases ? fl.releases[rid] : (r.unreleased === true || String(r.unreleased) === 'true');
  const f = (id, label, val, extra) => `<label class="sf">${label}<input class="field" id="${id}" value="${esc(val == null ? '' : val)}" ${extra || ''}></label>`;
  const ta = (id, label, val, rows) => `<label class="sf">${label}<textarea class="field" id="${id}" rows="${rows}">${esc(val || '')}</textarea></label>`;
  const linkRow = l => `<div class="lrow"><input class="field" list="stuSvc" placeholder="Spotify" value="${esc(l[0])}" aria-label="Service name"><input class="field" type="url" placeholder="https://…" value="${esc(l[1])}" aria-label="Link"><button type="button" class="ib" data-stu-rmlink aria-label="Remove this link">${I.x}</button></div>`;
  const songs = tracks.map(t => {
    const hasSR = g.versions.some(v => v.track_id === t.track_id && isSR(v)), tu = t.track_id in fl.tracks ? fl.tracks[t.track_id] : (t.unreleased === true || String(t.unreleased) === 'true');
    const tags = [tu ? 'Unreleased' : '', t.feature_role === 'mine' ? 'Guest spot' : '', t.artist ? 'by ' + t.artist : ''].filter(Boolean).map(x => `<span class="tag">${esc(x)}</span>`).join('');
    return `<details class="stu scard" data-stu-song="${esc(t.track_id)}">
      <summary><h3><span>${esc(t.number_label || t.track_no)}</span>${esc(t.title)}</h3><span class="stutags">${tags}</span></summary>
      <div class="stubody">
        <div class="sf2">${f('', 'Title', t.title, 'data-k="title"')}${f('', 'Artist', t.artist, 'data-k="artist"')}</div>
        <div class="sf2">${f('', 'Features', t.features, 'data-k="features"')}${f('', 'Producer', t.producer, 'data-k="producer"')}</div>
        <div class="sf2">${f('', 'Engineer', t.engineer, 'data-k="engineer"')}${f('', 'Music video (YouTube link)', t.video_url, 'data-k="video_url" type="url"')}</div>
        ${hasSR ? f('', 'Slowed + reverb video (YouTube link)', ov.sr[t.track_id] || '', 'data-sr type="url"') : ''}
        <div class="stuvis"><label class="chk"><input type="checkbox" data-unrel ${tu ? 'checked' : ''}> Unreleased song</label></div>
        <div class="sf2"><label class="stf">In the Features area <select class="field" data-k="feature_role"><option value="">Not a guest spot</option><option value="mine"${t.feature_role === 'mine' ? ' selected' : ''}>My guest spot on someone else's song</option></select><span class="cs">For a guest spot, put the main artist in Artist above.</span></label>
        <label class="stf">If unreleased, it counts as <select class="field" data-k="unrel_kind"><option value="">Same as its release</option>${UNREL_KINDS.map(k => `<option${t.unrel_kind === k ? ' selected' : ''}>${esc(k)}</option>`).join('')}</select></label></div>
        <div class="save"><button type="button" class="pill main" data-stu-savesong>Save song</button>${EDGE_UPLOADS() ? `<button type="button" class="pill soft" data-stu-songcover="${esc(t.track_id)}">${I.img}Song cover</button>` : ''}<span class="st" role="status"></span></div>
      </div></details>`;
  }).join('');
  const tab = ['info', 'songs', 'links', 'add'].indexOf(S.stuTab) > -1 && (S.stuTab !== 'add' || EDGE_UPLOADS()) ? S.stuTab : 'info';
  const nowHidden = r.hidden === true;
  $('#main').innerHTML = `<div class="wrap studio">
    <button class="back" data-nav="vault">${I.back}Settings</button>
    <header class="vh"><h1 class="page-h" style="padding:0;margin:0"><b>Studio</b></h1><button class="avatar" data-nav="vault" aria-label="Settings">NS</button></header>
    <div class="stupick"><select class="field stusel" id="stuRel" aria-label="Release">${rels.map(x => `<option value="${esc(x.release_id)}" ${x.release_id === rid ? 'selected' : ''}>${esc(x.title)} (${esc(x.year)})</option>`).join('')}</select>
      ${EDGE_UPLOADS() ? `<button type="button" class="pill main" id="stuNewRel">${I.plus}New</button>` : ''}</div>
    <section class="stuhead" aria-label="${esc(r.title)}">
      <span class="stuart">${r.cover_file_id ? `<img class="art" data-cover="${esc(r.cover_file_id)}" alt="">` : ''}</span>
      <span class="stumeta"><b>${esc(r.title)}</b><span class="cs">${esc([typeOf(r), r.year].filter(Boolean).join(' · '))} · ${plural(tracks.length, 'song')}</span>
        <span class="stutags"><span class="tag${nowHidden ? ' warn' : ''}">${nowHidden ? 'Hidden from fans' : 'Visible to fans'}</span>${unrel ? '<span class="tag">Unreleased</span>' : ''}</span></span>
    </section>
    <div class="vs-tabs stutabs" role="tablist" aria-label="Studio sections">
      <button type="button" role="tab" data-stutab="info">Info</button><button type="button" role="tab" data-stutab="songs">Songs <span class="n">${tracks.length}</span></button><button type="button" role="tab" data-stutab="links">Links</button>${EDGE_UPLOADS() ? '<button type="button" role="tab" data-stutab="add">Add</button>' : ''}
    </div>
    <section data-stupanel="info" id="stuInfo">
      <div class="stuvis">
        <label class="chk"><input type="checkbox" id="stHidden" ${nowHidden ? 'checked' : ''}> <span><b>Hide this release from fans</b><span class="cs">Fans can't see it until you untick this.</span></span></label>
        <label class="chk"><input type="checkbox" id="stUnrel" ${unrel ? 'checked' : ''}> <span><b>Unreleased</b><span class="cs">Shows under Extras, Unreleased.</span></span></label>
      </div>
      <details class="stu" open><summary>Basics</summary><div class="stubody">
        <div class="sf2">${f('stTitle', 'Title', r.title)}<label class="sf">Type<select class="field" id="stType">${relTypeOptions(r.type).map(t => `<option ${t === r.type ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
        <div class="sf2">${f('stArtist', 'Artist name (if not Nicólas Soul)', r.artist_name)}${f('stRec', 'Recorded at', r.recorded_at)}</div>
        ${f('stGenre', 'Genre (comma separated, up to 6)', r.genre, 'list="stuGenres"')}<datalist id="stuGenres">${knownGenres().map(x => `<option value="${esc(x)}">`).join('')}</datalist>
      </div></details>
      <details class="stu"><summary>Story &amp; mood</summary><div class="stubody">
        ${f('stTag', 'Tagline', r.world_tagline, 'maxlength="140"')}
        ${ta('stStory', 'Story', r.world_story, 6)}
        <div class="sf2">${f('stMood', 'Mood words (comma separated)', r.world_mood)}${f('stColor', 'Theme color (like #D21034)', r.world_color)}</div>
      </div></details>
      <details class="stu"><summary>Series &amp; credits</summary><div class="stubody">
        <div class="sf2">${f('stSeries', 'Series name', r.series_name)}${f('stPart', 'Series part', String(r.series_part || '').replace(/^'/, ''))}</div>
        ${ta('stCredits', 'Album credits (one per line, like “Produced by: Name (1, 3-5)”)', r.album_credits, 8)}
      </div></details>
      <div class="save stusticky"><button type="button" class="pill main" id="stuSaveInfo">Save release info</button><span class="st" id="stuInfoSt" role="status"></span></div>
    </section>
    <section data-stupanel="songs">${songs ? `<div class="stulist">${songs}</div>` : '<p class="cs">No songs on this release yet.</p>'}<p class="cs">Lyrics, covers and audio files are still edited on the release page.</p></section>
    <section data-stupanel="links"><div class="stu stubox"><div class="stubody">
      <p class="cs" style="margin:0">Shown as “Listen on” buttons under the release name. Use the full link.</p>
      <div id="stuLinks" style="display:grid;gap:8px">${(lk.links || []).map(linkRow).join('')}</div>
      <datalist id="stuSvc">${STU_SERVICES.map(x => `<option value="${x}">`).join('')}</datalist>
      <div class="save"><button type="button" class="pill soft" id="stuAddLink">${I.plus}Add a link</button></div>
      ${f('stFirst', 'First appeared on (DatPiff, Bandcamp…)', lk.first)}
      <div class="save"><button type="button" class="pill main" id="stuSaveLinks">Save links</button><span class="st" id="stuLinksSt" role="status"></span></div></div></div></section>
    ${EDGE_UPLOADS() ? `<section data-stupanel="add">${stuAddSection(rid)}</section>` : ''}
    <details class="stu" id="stuShop"><summary>Shop</summary><div class="stubody"><p class="cs" style="margin:0">CDs and merch. Each item has a buy link from Stripe (or Square). Fans pay on Stripe's own page; this site never sees card details.</p>
      <div id="stuShopItems" class="shopitems"><p class="cs">Loading…</p></div>
      <div class="save"><button type="button" class="pill soft" id="stuShopAdd">${I.plus}Add an item</button><button type="button" class="pill main" id="stuShopSave">Save shop</button><span class="st" id="stuShopSt" role="status"></span></div></div></details>
    <details class="stu" id="stuBio"><summary>Your bio</summary><div class="stubody"><p class="cs" style="margin:0">The story fans read on the Lore page.</p>
      <textarea class="field" id="loreBio" maxlength="8000" rows="8" placeholder="Write the story: where you're from, how the sound started, the eras, what's next.">${esc(S.lib.artist_bio || '')}</textarea>
      <div class="save"><button class="pill soft" type="button" data-lore-copy>Copy all lore as text</button><button class="pill main" type="button" data-lore-bio>Save bio</button></div></div></details>
    <details class="stu" id="stuBulk"><summary>Edit several releases at once</summary><div class="stubody">
      <p class="cs" style="margin:0">Tick the releases, tick each field you want to change and type the new value, then Apply. Anything you leave unticked stays exactly as it is.</p>
      <div class="save"><button type="button" class="pill soft" data-bk-all>Select all</button><button type="button" class="pill soft" data-bk-none>None</button><span class="st" id="bkCount">0 selected</span></div>
      <div class="bklist">${rels.map(x => `<label class="chk"><input type="checkbox" data-bk-rel="${esc(x.release_id)}"> ${esc(x.title)} <span class="cs">${esc([x.year, typeOf(x)].filter(Boolean).join(' · '))}</span></label>`).join('')}</div>
      <datalist id="bkGenres">${knownGenres().map(x => `<option value="${esc(x)}">`).join('')}</datalist>
      <div class="bkfields">
        <div class="bkf"><label class="chk"><input type="checkbox" data-bk-on="genre"> Genre</label><input class="field" data-bk-val="genre" list="bkGenres" placeholder="Hip Hop, R&B"></div>
        <div class="bkf"><label class="chk"><input type="checkbox" data-bk-on="type"> Type</label><select class="field" data-bk-val="type">${['Album', 'Mixtape', 'EP', 'Single', 'Live', 'Compilation', 'Other'].map(t => `<option>${t}</option>`).join('')}</select></div>
        <div class="bkf"><label class="chk"><input type="checkbox" data-bk-on="artist_name"> Artist name</label><input class="field" data-bk-val="artist_name" maxlength="80" placeholder="(blank = Nicólas Soul)"></div>
        <div class="bkf"><label class="chk"><input type="checkbox" data-bk-on="recorded_at"> Recorded at</label><input class="field" data-bk-val="recorded_at" maxlength="140" placeholder="Nashville, TN"></div>
        <div class="bkf"><label class="chk"><input type="checkbox" data-bk-on="series_name"> Series name</label><input class="field" data-bk-val="series_name" maxlength="80"></div>
        <div class="bkf"><label class="chk"><input type="checkbox" data-bk-on="world_mood"> Mood words</label><input class="field" data-bk-val="world_mood" placeholder="calm, honest"></div>
        <div class="bkf"><label class="chk"><input type="checkbox" data-bk-on="world_color"> Theme color</label><input class="field" data-bk-val="world_color" placeholder="#D21034"></div>
        <div class="bkf"><label class="chk"><input type="checkbox" data-bk-on="hidden"> Visibility</label><select class="field" data-bk-val="hidden"><option value="true">Hide from fans</option><option value="false">Show to fans</option></select></div>
        <div class="bkf"><label class="chk"><input type="checkbox" data-bk-on="unreleased"> Unreleased</label><select class="field" data-bk-val="unreleased"><option value="true">Mark as unreleased</option><option value="false">Not unreleased</option></select></div>
      </div>
      <div class="save"><button type="button" class="pill main" id="bkApply">Apply to the ticked releases</button><span class="st" id="bkSt" role="status"></span></div></div></details>
    </div>`;
  loadCovers(); wireShopEditor();
  const stuTabs = [...$$('[data-stutab]')], stuPanels = [...$$('[data-stupanel]')];
  const showStuTab = k => { S.stuTab = k; stuTabs.forEach(b => b.setAttribute('aria-selected', String(b.dataset.stutab === k))); stuPanels.forEach(x => { x.hidden = x.dataset.stupanel !== k; }); };
  stuTabs.forEach(b => b.addEventListener('click', () => showStuTab(b.dataset.stutab))); showStuTab(tab);
  window.scrollTo(0, 0);
  const say = (el, t, bad) => { if (el) { el.textContent = t; el.style.color = bad ? 'var(--red, #ff6b6b)' : ''; } };
  const guard = async (btn, st, fn) => { btn.disabled = true; say(st, 'Saving…'); try { await fn(); say(st, 'Saved'); toast('Saved'); } catch (e) { say(st, e.message || 'Could not save', true); } btn.disabled = false; };
  $('#stuRel').addEventListener('change', e => { S.stuRel = e.target.value; drawStudio(); });
  if ($('#stuNewRel')) { $('#stuNewRel').addEventListener('click', openNewRelease); wireStuAdd(rid); }
  // Edit several releases at once: each ticked release is saved the same way as the single form, with only the ticked fields changed.
  const bkCount = () => { $('#bkCount').textContent = [...$$('[data-bk-rel]')].filter(x => x.checked).length + ' selected'; };
  $$('[data-bk-rel]').forEach(c => c.addEventListener('change', bkCount));
  $('[data-bk-all]').addEventListener('click', () => { $$('[data-bk-rel]').forEach(c => { c.checked = true; }); bkCount(); });
  $('[data-bk-none]').addEventListener('click', () => { $$('[data-bk-rel]').forEach(c => { c.checked = false; }); bkCount(); });
  $('#bkApply').addEventListener('click', async e => {
    const btn = e.currentTarget, st = $('#bkSt'), ids = [...$$('[data-bk-rel]')].filter(x => x.checked).map(x => x.dataset.bkRel), on = {};
    $$('[data-bk-on]').forEach(c => { if (c.checked) on[c.dataset.bkOn] = $('[data-bk-val="' + c.dataset.bkOn + '"]').value; });
    if (!ids.length) return say(st, 'Tick at least one release.', true);
    if (!Object.keys(on).length) return say(st, 'Tick at least one field to change.', true);
    const names = { genre: 'genre', type: 'type', artist_name: 'artist name', recorded_at: 'recorded at', series_name: 'series name', world_mood: 'mood words', world_color: 'theme color', hidden: 'visibility', unreleased: 'unreleased' };
    const what = 'Change ' + Object.keys(on).map(k => names[k]).join(', ') + ' on ' + ids.length + (ids.length === 1 ? ' release' : ' releases');
    if (!btn.dataset.armed) {   // two taps instead of a pop-up (some phones hide pop-ups): the first shows what will happen, the second does it
      btn.dataset.armed = '1'; btn.textContent = 'Tap again to confirm'; say(st, what + '. Tap the button again within 10 seconds to save.');
      setTimeout(() => { delete btn.dataset.armed; btn.textContent = 'Apply to the ticked releases'; }, 10000); return;
    }
    delete btn.dataset.armed; btn.textContent = 'Apply to the ticked releases';
    btn.disabled = true; say(st, 'Saving ' + ids.length + (ids.length === 1 ? ' release' : ' releases') + '…');
    const changes = {}; Object.keys(on).forEach(k => { changes[k] = (k === 'hidden' || k === 'unreleased') ? on[k] === 'true' : on[k]; });
    try {
      const out = await run('studioSaveBulk', BOOT.key, ids, changes);
      (out.saved || []).forEach(id => {
        const x = g.releases.find(q => q.release_id === id), a = out.applied || {};
        const fields = Object.assign({}, a); delete fields.unreleased;
        if (x) Object.assign(x, fields);
        const mine = rel(id); if (mine) Object.assign(mine, fields, 'unreleased' in a ? { unreleased: a.unreleased } : {});
        if ('unreleased' in a) { (g.overlay.flags = g.overlay.flags || { releases: {}, tracks: {} }).releases[id] = a.unreleased; fl.releases[id] = a.unreleased; }
      });
      const bad = out.failed || [], n = (out.saved || []).length;
      say(st, bad.length ? n + ' saved. Not saved: ' + bad.map(f => f.title + ' (' + f.error + ')').join('; ') : n + (n === 1 ? ' release' : ' releases') + ' saved.', !!bad.length);
      if (bad.length) alert('Not saved:\n\n' + bad.map(f => f.title + ': ' + f.error).join('\n'));
      if (n) toast(n + ' saved');
    } catch (er) { say(st, er.message || 'Could not save.', true); alert('Nothing was saved.\n\n' + (er.message || 'Could not save.')); }
    btn.disabled = false;
  });
  $('#stuSaveInfo').addEventListener('click', e => guard(e.currentTarget, $('#stuInfoSt'), async () => {
    const v = id => $('#' + id).value;
    const basics = { title: v('stTitle'), type: v('stType'), hidden: $('#stHidden').checked };
    const world = { world_tagline: v('stTag'), world_story: v('stStory'), world_color: v('stColor'), world_mood: v('stMood'), album_credits: v('stCredits'), recorded_at: v('stRec'), artist_name: v('stArtist'), series_name: v('stSeries'), series_part: v('stPart'), genre: v('stGenre') };
    await run('studioSaveRelease', BOOT.key, rid, { basics, world, unreleased: $('#stUnrel').checked });
    Object.assign(r, basics, world); (g.overlay.flags = g.overlay.flags || { releases: {}, tracks: {} }).releases[rid] = $('#stUnrel').checked;
    const mine = rel(rid); if (mine) { Object.assign(mine, basics, world, { unreleased: $('#stUnrel').checked }); }
  }));
  $('#stuAddLink').addEventListener('click', () => { $('#stuLinks').insertAdjacentHTML('beforeend', linkRow(['', ''])); });
  $('#stuLinks').addEventListener('click', e => { const b = e.target.closest('[data-stu-rmlink]'); if (b) b.closest('.lrow').remove(); });
  $('#stuSaveLinks').addEventListener('click', e => guard(e.currentTarget, $('#stuLinksSt'), async () => {
    const links = [...$$('#stuLinks .lrow')].map(row => { const i = row.querySelectorAll('input'); return [i[0].value, i[1].value]; });
    await run('studioSaveLinks', BOOT.key, rid, { first: $('#stFirst').value, links });
    const clean = links.filter(l => l[0].trim() && l[1].trim()), first = $('#stFirst').value.trim();
    if (clean.length || first) g.overlay.releases[rid] = { first, links: clean }; else delete g.overlay.releases[rid];
    S.links = Object.assign({}, S.links || {}, { releases: Object.assign({}, g.overlay.releases) });
  }));
  $$('[data-stu-savesong]').forEach(btn => btn.addEventListener('click', e => {
    const card = e.currentTarget.closest('[data-stu-song]'), tid = card.dataset.stuSong, t = g.tracks.find(x => x.track_id === tid);
    guard(e.currentTarget, card.querySelector('.st'), async () => {
      const fields = {}; card.querySelectorAll('[data-k]').forEach(i => { fields[i.dataset.k] = i.value; });
      const srEl = card.querySelector('[data-sr]'), un = card.querySelector('[data-unrel]').checked;
      await run('studioSaveTrack', BOOT.key, tid, { fields, sr: srEl ? srEl.value : undefined, unreleased: un });
      Object.assign(t, fields); const mine = trk(tid); if (mine) Object.assign(mine, fields, { unreleased: un });
      g.overlay.flags.tracks[tid] = un; if (srEl) { if (srEl.value.trim()) g.overlay.sr[tid] = srEl.value.trim(); else delete g.overlay.sr[tid]; }
      S.links = Object.assign({}, S.links || {}, { sr: Object.assign({}, g.overlay.sr), flags: g.overlay.flags });
      card.querySelector('h3').innerHTML = `<span>${esc(t.number_label || t.track_no)}</span>${esc(t.title)}`;
    });
  }));
}

