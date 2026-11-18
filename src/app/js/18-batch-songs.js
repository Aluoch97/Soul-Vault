/* ── Add a whole batch of songs at once (Studio > Add tab, and Studio's top "Add songs" button) ── */
// "03 - Song_Name.wav" -> "Song Name". Leading track numbers, underscores and the extension are dropped.
function batchTitle(name) {
  const t = String(name || '').replace(/\.[^.]+$/, '').replace(/_/g, ' ').replace(/^\s*(?:track\s*)?\d{1,3}\s*[-.)\]:]*\s+/i, '').replace(/\s+/g, ' ').trim();
  return (t || String(name || '').replace(/\.[^.]+$/, '').trim() || 'Untitled').slice(0, 200);
}
const BATCH_OK = /\.(wav|aiff?|flac|mp3|m4a|aac|ogg)$/i;
// Upload the files one at a time into a release; one failure never stops the rest.
async function batchUpload(files, titles, rid, stat, bar) {
  const g = S.stu, failed = []; let ok = 0;
  for (let i = 0; i < files.length; i++) {
    try {
      const out = await uploadSongToEdge(files[i], rid, null, titles[i], 'Original', true, t => stat(`Song ${i + 1} of ${files.length}: ${titles[i]}. ${t}`), p => bar((i + p) / files.length));
      if (out.track) { S.lib.tracks.push(out.track); if (g && g.tracks) g.tracks.push(out.track); }
      if (out.version) { S.lib.versions.push(out.version); if (g && g.versions) g.versions.push(out.version); if (out.version.url) (S.urlByFile = S.urlByFile || {})[out.version.audio] = out.version.url; }
      ok++;
    } catch (e) { failed.push(`${titles[i]} (${(e && e.message) || 'did not upload'})`); }
  }
  return { ok, failed, msg: `${ok} of ${files.length} song${files.length === 1 ? '' : 's'} added.` + (failed.length ? ' Not added: ' + failed.join('; ') + '.' : '') };
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
      `<div class="prog" id="stuBatchProg" hidden><div class="bar"><i id="stuBatchBar"></i></div></div><p class="st" id="stuBatchSt" role="status"></p>` +
      `<div class="save"><button type="button" class="pill main" id="stuBatchGo">Upload all</button><button type="button" class="pill soft" id="stuBatchCancel">Cancel</button></div></div>`;
    $('#stuBatchCancel').addEventListener('click', () => { box.hidden = true; box.innerHTML = ''; });
    $('#stuBatchGo').addEventListener('click', async () => {
      const go = $('#stuBatchGo'), st = $('#stuBatchSt'); go.disabled = true; $('#stuBatchCancel').hidden = true; $('#stuBatchProg').hidden = false;
      const titles = [...$$('[data-batch-title]')].map((e, i) => e.value.trim() || batchTitle(files[i].name));
      const { ok, failed, msg } = await batchUpload(files, titles, rid, t => { st.textContent = t; }, p => $('#stuBatchBar').style.setProperty('--p', Math.round(p * 100) + '%'));
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
    <div id="qNew"><label>Release name<input class="field" id="qTitle" maxlength="200" placeholder="Release name"></label>
      <label>Kind<select class="field" id="qType"><option>Single</option><option>EP</option><option>Album</option><option>Mixtape</option></select></label>
      <p class="cs" style="margin:0">A new release starts hidden from fans. Un-hide it in Studio when you are ready.</p></div>
    <div class="prog" id="qProg" hidden><div class="bar"><i id="qBar"></i></div></div><p class="st" id="qSt" role="status"></p>
    <div class="end"><button class="pill soft" data-close id="qCancel">Cancel</button><button class="pill main" id="qGo">Upload</button></div></div>`;
  $('#modal').hidden = false;
  $('#qDest').addEventListener('change', () => { $('#qNew').hidden = !!$('#qDest').value; });
  $('#qFiles').addEventListener('change', e => {
    q.files = batchPick(e.target.files);
    $('#qList').innerHTML = q.files.map((f, i) => `<label>${esc(f.name)}<input class="field" data-q-title="${i}" maxlength="200" value="${esc(batchTitle(f.name))}"></label>`).join('');
    if (q.files.length === 1 && !$('#qTitle').value) $('#qTitle').value = batchTitle(q.files[0].name);
  });
  $('#qGo').addEventListener('click', async () => {
    const st = $('#qSt'), bad = m => { st.textContent = m; st.style.color = 'var(--red, #ff6b6b)'; };
    if (!q.files.length) return bad('Choose at least one audio file.');
    let rid = $('#qDest').value; const name = $('#qTitle').value.trim();
    if (!rid && !name) return bad('Give the new release a name.');
    st.style.color = ''; $('#qGo').disabled = true; $('#qCancel').hidden = true; $('#qProg').hidden = false;
    try {
      if (!rid) {
        st.textContent = 'Creating the release…';
        const r = await run('studioNewRelease', BOOT.key, { title: name, type: $('#qType').value, year: String(new Date().getFullYear()), coverId: '', artist_name: '' });
        (S.lib.releases = S.lib.releases || []).push(r); if (S.stu && S.stu.releases) S.stu.releases.push(r); rid = r.release_id;
      }
      const titles = [...$$('[data-q-title]')].map((e, i) => e.value.trim() || batchTitle(q.files[i].name));
      const { ok, msg } = await batchUpload(q.files, titles, rid, t => { st.textContent = t; }, p => $('#qBar').style.setProperty('--p', Math.round(p * 100) + '%'));
      if (ok) { closeModal(); S.stuRel = rid; S.stuTab = 'songs'; drawStudio(); toast(msg); } else { bad(msg); $('#qGo').disabled = false; $('#qCancel').hidden = false; }
    } catch (e) { bad((e && e.message) || 'Could not add them.'); $('#qGo').disabled = false; $('#qCancel').hidden = false; }
  });
}
