/* ── Add a whole batch of songs at once (Studio > Add tab, and Studio's top "Add songs" button) ── */
// "03 - Song_Name.wav" -> "Song Name". Leading track numbers, underscores and the extension are dropped.
function batchTitle(name) {
  const t = String(name || '').replace(/\.[^.]+$/, '').replace(/_/g, ' ').replace(/^\s*(?:track\s*)?\d{1,3}\s*[-.)\]:]*\s+/i, '').replace(/\s+/g, ' ').trim();
  return (t || String(name || '').replace(/\.[^.]+$/, '').trim() || 'Untitled').slice(0, 200);
}
const BATCH_OK = /\.(wav|aiff?|flac|mp3|m4a|aac|ogg)$/i;
// Upload the files one at a time into a release; one failure never stops the rest.
// Mark a release or a song Unreleased (same saves as Studio's Unreleased switch), and keep the app's own copy in step.
async function markUnrel(kind, id) {
  if (kind === 'release') await run('studioSaveRelease', BOOT.key, id, { unreleased: true }); else await run('studioSaveTrack', BOOT.key, id, { fields: {}, unreleased: true });
  const fl = S.stu && S.stu.overlay ? (S.stu.overlay.flags = S.stu.overlay.flags || { releases: {}, tracks: {} }) : null;
  if (fl) fl[kind === 'release' ? 'releases' : 'tracks'][id] = true;
  const row = kind === 'release' ? rel(id) : trk(id); if (row) row.unreleased = true;
}
async function batchUpload(files, titles, rid, stat, bar, unrel) {
  const g = S.stu, failed = [], errs = []; let ok = 0;
  for (let i = 0; i < files.length; i++) {
    try {
      const out = await uploadSongToEdge(files[i], rid, null, titles[i], 'Original', true, t => stat(`Song ${i + 1} of ${files.length}: ${titles[i]}. ${t}`), p => bar((i + p) / files.length));
      if (out.track) { S.lib.tracks.push(out.track); if (g && g.tracks) g.tracks.push(out.track); }
      if (out.version) { S.lib.versions.push(out.version); if (g && g.versions) g.versions.push(out.version); if (out.version.url) (S.urlByFile = S.urlByFile || {})[out.version.audio] = out.version.url; }
      if (unrel && out.track) { try { await markUnrel('track', out.track.track_id); } catch (e) { failed.push(`${titles[i]} (added, but could not be marked Unreleased)`); } }
      ok++;
    } catch (e) { errs.push((e && e.message) || 'did not upload'); failed.push(`${titles[i]} (${errs[errs.length - 1]})`); }
  }
  return { ok, failed, errs, msg: `${ok} of ${files.length} song${files.length === 1 ? '' : 's'} added.` + (failed.length ? ' Not added: ' + failed.join('; ') + '.' : '') };
}
const batchPick = list => [...list].filter(f => BATCH_OK.test(f.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
function wireBatchSongs(rid, say) {
  const btn = $('#stuAddBatch'), inp = $('#stuBatchFiles'), box = $('#stuBatchBox'); if (!btn || !inp || !box) return;
  btn.addEventListener('click', () => inp.click());
  inp.addEventListener('change', () => {
    const files = batchPick(inp.files); inp.value = '';
    if (!files.length) return say('Choose audio files (MP3, WAV, AIFF, FLAC, M4A, AAC or OGG).', true);
    box.hidden = false;
    box.innerHTML = `<div class="stubody"><p class="cs" style="margin:0">${files.length} song${files.length === 1 ? '' : 's'} ready. Check the titles, then tap Upload all. They are added in this order, after the songs already on the release.</p>` +
      files.map((f, i) => `<label class="sf">${esc(f.name)}<input class="field" data-batch-title="${i}" maxlength="200" value="${esc(batchTitle(f.name))}"></label>`).join('') +
      `<label class="chk"><input type="checkbox" id="stuBatchUnrel"> These songs are unreleased</label>` +
      `<div class="prog" id="stuBatchProg" hidden><div class="bar"><i id="stuBatchBar"></i></div></div><p class="st" id="stuBatchSt" role="status"></p>` +
      `<div class="save"><button type="button" class="pill main" id="stuBatchGo">Upload all</button><button type="button" class="pill soft" id="stuBatchCancel">Cancel</button></div></div>`;
    $('#stuBatchCancel').addEventListener('click', () => { box.hidden = true; box.innerHTML = ''; });
    $('#stuBatchGo').addEventListener('click', async () => {
      const go = $('#stuBatchGo'), st = $('#stuBatchSt'); go.disabled = true; $('#stuBatchCancel').hidden = true; $('#stuBatchProg').hidden = false;
      const titles = [...$$('[data-batch-title]')].map((e, i) => e.value.trim() || batchTitle(files[i].name));
      const { ok, failed, msg } = await batchUpload(files, titles, rid, t => { st.textContent = t; }, p => $('#stuBatchBar').style.setProperty('--p', Math.round(p * 100) + '%'), $('#stuBatchUnrel').checked);
      if (ok) { S.stuTab = 'songs'; drawStudio(); toast(msg); } else { go.disabled = false; $('#stuBatchCancel').hidden = false; }
      const s2 = $('#stuBatchSt') || $('#stuAddSt'); if (s2) { s2.textContent = msg; s2.style.color = failed.length ? 'var(--red, #ff6b6b)' : ''; }
    });
  });
}

// Studio's top "Add songs": no release picked first. The files go into an existing release or a brand-new (hidden) one, chosen in the form.
function openQuickSongs() {
  const rels = (S.stu && S.stu.releases || []).slice().sort((a, b) => String(b.release_date || b.year).localeCompare(String(a.release_date || a.year)));
  const q = { files: [] };
  $('#modal').innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mTitle"><h2 id="mTitle">Add songs</h2>
    <label>Audio files<input class="field" type="file" id="qFiles" accept=".wav,.aif,.aiff,.flac,.mp3,.m4a,.aac,.ogg,audio/*" multiple></label>
    <div id="qList"></div>
    <label>Where do they go?<select class="field" id="qDest"><option value="">A new release</option>${rels.map(r => `<option value="${esc(r.release_id)}">${esc(r.title)} (${esc(r.year)})</option>`).join('')}</select></label>
    <label class="chk"><input type="checkbox" id="qUnrel"> These songs are unreleased</label>
    <div id="qNew"><label>Release name<input class="field" id="qTitle" maxlength="200" placeholder="Release name"></label>
      <label>Kind<select class="field" id="qType"><option>Single</option><option>EP</option><option>Album</option><option>Mixtape</option></select></label>
      <p class="cs" style="margin:0">A new release starts hidden from fans. Un-hide it in Studio when you are ready.</p></div>
    <div class="prog" id="qProg" hidden><div class="bar"><i id="qBar"></i></div></div><p class="st" id="qSt" role="status"></p>
    <div class="end"><button class="pill soft" data-close id="qCancel">Cancel</button><button class="pill main" id="qGo">Upload</button></div></div>`;
  $('#modal').hidden = false;
  const syncDest = () => { const d = $('#qDest').value; $('#qNew').hidden = !!d; $('#qTitle').closest('label').hidden = d === '__singles'; $('#qType').closest('label').hidden = d === '__singles'; };
  const drawList = () => { $('#qList').innerHTML = q.files.map((f, i) => `<label>${esc(f.name)}<input class="field" data-q-title="${i}" maxlength="200" value="${esc(batchTitle(f.name))}"></label>`).join(''); };
  $('#qDest').insertAdjacentHTML('afterbegin', '<option value="__singles">Each song as its own single</option>');
  $('#qDest').value = ''; $('#qDest').addEventListener('change', syncDest);
  $('#qFiles').addEventListener('change', e => {
    q.files = batchPick(e.target.files); drawList();
    const skipped = [...e.target.files].filter(f => !BATCH_OK.test(f.name)).map(f => f.name);
    $('#qSt').style.color = ''; $('#qSt').textContent = skipped.length ? `${skipped.length} file${skipped.length === 1 ? '' : 's'} left out (not MP3, WAV, AIFF, FLAC, M4A, AAC or OGG): ${skipped.slice(0, 4).join(', ')}${skipped.length > 4 ? '…' : ''}` : '';
    if (q.files.length === 1 && !$('#qTitle').value) $('#qTitle').value = batchTitle(q.files[0].name);
    if (q.files.length > 1 && !$('#qDest').value) { $('#qDest').value = '__singles'; syncDest(); }   // many files and no release chosen: most likely separate singles
  });
  $('#qGo').addEventListener('click', async () => {
    const st = $('#qSt'), bad = m => { st.textContent = m; st.style.color = 'var(--red, #ff6b6b)'; };
    if (!q.files.length) return bad('Choose at least one audio file.');
    let rid = $('#qDest').value; const name = $('#qTitle').value.trim();
    if (!rid && !name) return bad('Give the new release a name.');
    st.style.color = ''; $('#qGo').disabled = true; $('#qCancel').hidden = true; $('#qProg').hidden = false;
    if (rid === '__singles') {   // one hidden Single per file, named after the song
      const titles = [...$$('[data-q-title]')].map((e, i) => e.value.trim() || batchTitle(q.files[i].name)), n = q.files.length, left = [], failed = []; let ok = 0, last = '';
      for (let i = 0; i < n; i++) {
        let r = null, step = 'creating the release';
        try {
          st.textContent = `Single ${i + 1} of ${n}: ${titles[i]}. Creating it…`;
          r = await run('studioNewRelease', BOOT.key, { title: titles[i], type: 'Single', year: String(new Date().getFullYear()), coverId: '', artist_name: '' });
          (S.lib.releases = S.lib.releases || []).push(r); if (S.stu && S.stu.releases) S.stu.releases.push(r);
          step = 'uploading the song'; const out = await batchUpload([q.files[i]], [titles[i]], r.release_id, t => { st.textContent = `Single ${i + 1} of ${n}: ${titles[i]}. ${t.replace(/^Song 1 of 1: [^.]*\. /, '')}`; }, p => $('#qBar').style.setProperty('--p', Math.round(((i + p) / n) * 100) + '%'));
          if (!out.ok) throw new Error(out.errs[0] || 'did not upload');
          if ($('#qUnrel').checked) { try { await markUnrel('release', r.release_id); } catch (e3) { failed.push(`${titles[i]} (added, but could not be marked Unreleased)`); } }
          ok++; last = r.release_id;
        } catch (e) {
          failed.push(`${titles[i]} (${step}: ${(e && e.message) || 'failed'})`); left.push(i);
          if (r) { try { await run('deleteRelease', BOOT.key, r.release_id); S.lib.releases = S.lib.releases.filter(x => x.release_id !== r.release_id); if (S.stu) S.stu.releases = S.stu.releases.filter(x => x.release_id !== r.release_id); } catch (e2) { /* an empty hidden release stays: remove it in Studio */ } }
        }
      }
      const msg = `${ok} of ${n} single${n === 1 ? '' : 's'} added (hidden from fans until you un-hide them).` + (failed.length ? ' Not added: ' + failed.join('; ') + '.' : '');
      if (!failed.length) { closeModal(); S.stuRel = last; S.stuTab = 'info'; drawStudio(); toast(msg); return; }
      q.files = left.map(i => q.files[i]); drawList(); bad(msg); $('#qGo').disabled = false; $('#qCancel').hidden = false;   // only the ones that failed stay in the list, so trying again never makes doubles
      if (ok) { S.stuRel = last; }
      return;
    }
    let madeNew = false;
    try {
      if (!rid) {
        st.textContent = 'Creating the release…';
        const r = await run('studioNewRelease', BOOT.key, { title: name, type: $('#qType').value, year: String(new Date().getFullYear()), coverId: '', artist_name: '' });
        (S.lib.releases = S.lib.releases || []).push(r); if (S.stu && S.stu.releases) S.stu.releases.push(r); rid = r.release_id; madeNew = true;
        if ($('#qUnrel').checked) await markUnrel('release', rid);   // the whole new release is unreleased
      }
      const titles = [...$$('[data-q-title]')].map((e, i) => e.value.trim() || batchTitle(q.files[i].name));
      const { ok, msg } = await batchUpload(q.files, titles, rid, t => { st.textContent = t; }, p => $('#qBar').style.setProperty('--p', Math.round(p * 100) + '%'), $('#qUnrel').checked && !madeNew);   // an existing release: mark each new song
      if (ok) { closeModal(); S.stuRel = rid; S.stuTab = 'songs'; drawStudio(); toast(msg); } else { bad(msg); $('#qGo').disabled = false; $('#qCancel').hidden = false; }
    } catch (e) { bad((e && e.message) || 'Could not add them.'); $('#qGo').disabled = false; $('#qCancel').hidden = false; }
  });
}
