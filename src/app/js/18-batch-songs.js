/* ── Studio > Add: add a whole batch of songs at once ── */
// "03 - Song_Name.wav" -> "Song Name". Leading track numbers, underscores and the extension are dropped.
function batchTitle(name) {
  const t = String(name || '').replace(/\.[^.]+$/, '').replace(/_/g, ' ').replace(/^\s*(?:track\s*)?\d{1,3}\s*[-.)\]:]*\s+/i, '').replace(/\s+/g, ' ').trim();
  return (t || String(name || '').replace(/\.[^.]+$/, '').trim() || 'Untitled').slice(0, 200);
}
const BATCH_OK = /\.(wav|aiff?|flac|mp3|m4a|aac|ogg)$/i;
function wireBatchSongs(rid, say) {
  const btn = $('#stuAddBatch'), inp = $('#stuBatchFiles'), box = $('#stuBatchBox'); if (!btn || !inp || !box) return;
  btn.addEventListener('click', () => inp.click());
  inp.addEventListener('change', () => {
    const files = [...inp.files].filter(f => BATCH_OK.test(f.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })); inp.value = '';
    if (!files.length) return say('Choose audio files (MP3, WAV, AIFF, FLAC, M4A, AAC or OGG).', true);
    box.hidden = false;
    box.innerHTML = `<div class="stubody"><p class="cs" style="margin:0">${files.length} song${files.length === 1 ? '' : 's'} ready. Check the titles, then tap Upload all. They are added in this order, after the songs already on the release.</p>` +
      files.map((f, i) => `<label class="sf">${esc(f.name)}<input class="field" data-batch-title="${i}" maxlength="200" value="${esc(batchTitle(f.name))}"></label>`).join('') +
      `<div class="prog" id="stuBatchProg" hidden><div class="bar"><i id="stuBatchBar"></i></div></div><p class="st" id="stuBatchSt" role="status"></p>` +
      `<div class="save"><button type="button" class="pill main" id="stuBatchGo">Upload all</button><button type="button" class="pill soft" id="stuBatchCancel">Cancel</button></div></div>`;
    $('#stuBatchCancel').addEventListener('click', () => { box.hidden = true; box.innerHTML = ''; });
    $('#stuBatchGo').addEventListener('click', async () => {
      const go = $('#stuBatchGo'), st = $('#stuBatchSt'); go.disabled = true; $('#stuBatchCancel').hidden = true; $('#stuBatchProg').hidden = false;
      const titles = [...$$('[data-batch-title]')].map((e, i) => e.value.trim() || batchTitle(files[i].name)), g = S.stu, failed = []; let ok = 0;
      for (let i = 0; i < files.length; i++) {
        const bar = p => $('#stuBatchBar').style.setProperty('--p', Math.round(((i + p) / files.length) * 100) + '%');
        try {
          const out = await uploadSongToEdge(files[i], rid, null, titles[i], 'Original', true, t => { st.textContent = `Song ${i + 1} of ${files.length}: ${titles[i]}. ${t}`; }, bar);
          if (out.track) { S.lib.tracks.push(out.track); if (g && g.tracks) g.tracks.push(out.track); }
          if (out.version) { S.lib.versions.push(out.version); if (g && g.versions) g.versions.push(out.version); if (out.version.url) (S.urlByFile = S.urlByFile || {})[out.version.audio] = out.version.url; }
          ok++;
        } catch (e) { failed.push(`${titles[i]} (${(e && e.message) || 'did not upload'})`); }
      }
      const msg = `${ok} of ${files.length} song${files.length === 1 ? '' : 's'} added.` + (failed.length ? ' Not added: ' + failed.join('; ') + '.' : '');
      if (ok) { S.stuTab = 'songs'; drawStudio(); toast(msg); } else { go.disabled = false; $('#stuBatchCancel').hidden = false; }
      const s2 = $('#stuBatchSt') || $('#stuAddSt'); if (s2) { s2.textContent = msg; s2.style.color = failed.length ? 'var(--red, #ff6b6b)' : ''; }
    });
  });
}
