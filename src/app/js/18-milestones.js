/* ── Milestones: the big moments in the story (first time on the radio, first show in Nashville, first song to hit 100k streams...). ──
   Shown on the Lore page under "The story" (`loreMilestonesHtml`, filled by `fillMilestones`). Each has a title, a date (a day, a month or a year), a few words,
   an optional voice note (our own storage, `milestones/voice-<hex>.<ext>`, played with the browser's own audio controls) and an optional https link.
   Edited by the owner in Settings > Milestones (`renderMilestonesEditor`). Edge calls: getMilestones (public), saveMilestones / planMilestoneAudio (owner). */
const MS_STARTERS = ['First time on the radio', 'First show in Nashville', 'First song to hit 100k streams', 'First music video', 'First headline show', 'First sold-out show'];
const MS_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const msAudioUrl = key => MEDIA_BASE + key;
function msDate(d) {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(String(d || '')); if (!m) return '';
  return m[3] ? MS_MONTHS[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1] : m[2] ? MS_MONTHS[+m[2] - 1] + ' ' + m[1] : m[1];
}
// Oldest first, so the list reads as a story; milestones with no date come last.
const msSorted = list => list.map((m, i) => [m, i]).sort((a, b) => (a[0].date || '9999').localeCompare(b[0].date || '9999') || a[1] - b[1]).map(x => x[0]);
function loadMilestones() {
  if (!S.milestonesP) S.milestonesP = run('getMilestones').then(r => (S.milestones = Array.isArray(r) ? r : [])).catch(() => { S.milestonesP = null; return (S.milestones = S.milestones || []); });
  return S.milestonesP;
}
function loreMilestonesHtml(list) {
  if (!list.length) return OWNER ? `<section class="msec" aria-label="Milestones"><h2 class="sh"><span><b>Milestones</b></span></h2><p class="cs">Your big moments will show here: first time on the radio, first show in Nashville, first song to hit 100k streams. <button type="button" class="linkish" data-nav="milestones">Add your first milestone</button></p></section>` : '';
  return `<section class="msec" aria-label="Milestones"><h2 class="sh"><span><b>Milestones</b></span>${OWNER ? '<button type="button" class="linkish msedit" data-nav="milestones">Edit</button>' : ''}</h2>
    <ol class="mslist">${msSorted(list).map(m => `<li class="ms"><span class="msdot" aria-hidden="true"></span>
      ${msDate(m.date) ? `<span class="msdate">${esc(msDate(m.date))}</span>` : ''}<b class="mstitle">${esc(m.title)}</b>${m.text ? `<p class="mstext">${esc(m.text)}</p>` : ''}
      ${m.audio ? `<div class="msvoice">${I.mic}<span>${esc(m.audio_label || 'Hear it')}</span><audio controls preload="none" src="${esc(msAudioUrl(m.audio))}" aria-label="${esc((m.audio_label || 'Voice note') + ': ' + m.title)}"></audio></div>` : ''}
      ${m.url ? `<a class="pill soft mslink" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">${esc(m.url_label || 'See more')}</a>` : ''}</li>`).join('')}</ol></section>`;
}
async function fillMilestones() {
  const list = await loadMilestones(), box = $('#loreMilestones'); if (!box) return;
  box.innerHTML = loreMilestonesHtml(list);
  $$('audio', box).forEach(a => a.addEventListener('play', () => {   // a voice note and a song never talk over each other
    try { if (!audio.paused) audio.pause(); } catch (e) {}
    $$('audio', box).forEach(o => { if (o !== a && !o.paused) o.pause(); });
  }));
}

// Settings > Milestones: add, change and remove. Nothing is saved until you tap Save.
const msForm = m => `<div class="shopitem msitem" data-ms-item data-id="${esc(m.id || '')}" data-audio="${esc(m.audio || '')}">
  <label class="sf">What happened<input class="field" data-ms="title" maxlength="90" value="${esc(m.title || '')}" placeholder="First time on the radio"></label>
  <label class="sf">When (a year, a month or a day: 2024, 2024-06 or 2024-06-15)<input class="field" data-ms="date" inputmode="numeric" maxlength="10" value="${esc(m.date || '')}" placeholder="2024-06-15"></label>
  <label class="sf">The story in a few words<textarea class="field" data-ms="text" rows="3" maxlength="700" placeholder="Where it was, who was there, what it felt like.">${esc(m.text || '')}</textarea></label>
  <div class="msaudio"><span class="cs" data-ms-audiostate>${m.audio ? 'Voice note added.' : 'No voice note yet.'}</span>
    <div class="save"><button type="button" class="pill soft" data-ms-upload>${I.mic}${m.audio ? 'Replace voice note' : 'Add a voice note'}</button><button type="button" class="pill soft" data-ms-noaudio${m.audio ? '' : ' hidden'}>Remove voice note</button></div>
    <input type="file" accept="audio/*" data-ms-file hidden>
    <label class="sf">What the voice note is called<input class="field" data-ms="audio_label" maxlength="60" value="${esc(m.audio_label || '')}" placeholder="Hear the first time I was on the radio"></label></div>
  <div class="sf2"><label class="sf">Link (optional, https://)<input class="field" data-ms="url" type="url" inputmode="url" maxlength="600" value="${esc(m.url || '')}" placeholder="https://"></label>
    <label class="sf">Link button says<input class="field" data-ms="url_label" maxlength="40" value="${esc(m.url_label || '')}" placeholder="Watch it"></label></div>
  <div class="save"><button type="button" class="pill soft danger" data-ms-del>${I.trash}Remove this milestone</button></div></div>`;
function renderMilestonesEditor() {
  clearPageBg(); S.view = 'milestones'; renderChrome();
  const head = '<button class="back" data-nav="vault">' + I.back + 'Settings</button><header class="vh"><h1 class="page-h" style="padding:0;margin:0"><b>Milestones</b></h1><button class="round" data-nav="vault" aria-label="Settings">' + I.gear + '</button></header>';
  $('#main').innerHTML = `<div class="wrap studio shoppg">${head}
    <p class="cs">The big moments in your story. They show on the Lore page, oldest first. Add a voice note (a clip of the first radio play, say) and fans can hear it right there.</p>
    <div class="mschips" id="msStarters" aria-label="Quick add"></div>
    <div id="msItems" class="shopitems"><p class="cs">Loading…</p></div>
    <div class="save"><button type="button" class="pill soft" id="msAdd">${I.plus}Add a milestone</button><button type="button" class="pill main" id="msSave">Save milestones</button><span class="st" id="msSt" role="status" aria-live="polite"></span></div></div>`;
  const box = $('#msItems'), st = $('#msSt');
  const read = () => [...box.querySelectorAll('[data-ms-item]')].map(d => { const o = { id: d.dataset.id, audio: d.dataset.audio };
    d.querySelectorAll('[data-ms]').forEach(i => { o[i.dataset.ms] = i.value; }); return o; });
  const draw = list => {
    box.innerHTML = list.length ? list.map(msForm).join('') : '<p class="cs">No milestones yet. Tap a suggestion above or Add a milestone.</p>';
    const have = new Set(list.map(m => String(m.title || '').trim().toLowerCase()));
    $('#msStarters').innerHTML = MS_STARTERS.filter(t => !have.has(t.toLowerCase())).map(t => `<button type="button" class="pill soft" data-ms-starter="${esc(t)}">${I.plus}${esc(t)}</button>`).join('');
  };
  loadMilestones().then(l => { if ($('#msItems')) draw(l); });
  $('#msAdd').addEventListener('click', () => { const cur = read(); cur.push({ title: '' }); draw(cur); const last = [...box.querySelectorAll('[data-ms="title"]')].pop(); if (last) last.focus(); });
  $('#msStarters').addEventListener('click', e => {
    const b = e.target.closest('[data-ms-starter]'); if (!b) return;
    const cur = read(); cur.push({ title: b.dataset.msStarter }); draw(cur);
    const items = box.querySelectorAll('[data-ms-item]'), last = items[items.length - 1]; if (last) { const d = last.querySelector('[data-ms="date"]'); if (d) d.focus(); }
  });
  box.addEventListener('click', e => {
    const del = e.target.closest('[data-ms-del]');
    if (del) { const d = del.closest('[data-ms-item]'), cur = read(); cur.splice([...box.querySelectorAll('[data-ms-item]')].indexOf(d), 1); draw(cur); return; }
    const up = e.target.closest('[data-ms-upload]'); if (up) { up.closest('[data-ms-item]').querySelector('[data-ms-file]').click(); return; }
    const no = e.target.closest('[data-ms-noaudio]');
    if (no) { const d = no.closest('[data-ms-item]'); d.dataset.audio = ''; d.querySelector('[data-ms-audiostate]').textContent = 'No voice note. Tap Save to keep this.'; no.hidden = true; }
  });
  box.addEventListener('change', async e => {
    const f = e.target.closest('[data-ms-file]'); if (!f || !f.files[0]) return;
    const d = f.closest('[data-ms-item]'), state = d.querySelector('[data-ms-audiostate]'), file = f.files[0]; f.value = '';
    const say = t => { state.textContent = t; };
    try {
      const { blob, ext, type } = await streamingCopy(file, say, () => {});
      say('Uploading…');
      const plan = await run('planMilestoneAudio', BOOT.key, { ext });
      await putFile(plan.key, blob, type, p => say('Uploading… ' + Math.round(p * 100) + '%'));
      d.dataset.audio = plan.key; say('Voice note ready. Tap Save milestones to keep it.');
      const nb = d.querySelector('[data-ms-noaudio]'); if (nb) nb.hidden = false;
    } catch (er) { say((er && er.message) || 'The voice note did not upload.'); }
  });
  $('#msSave').addEventListener('click', async e => {
    const b = e.currentTarget; b.disabled = true; st.textContent = 'Saving…';
    try { const out = await run('saveMilestones', BOOT.key, read()); S.milestones = out; S.milestonesP = Promise.resolve(out); draw(out); st.textContent = 'Saved'; toast('Milestones saved'); }
    catch (er) { st.textContent = (er && er.message) || 'Could not save.'; }
    b.disabled = false;
  });
  window.scrollTo(0, 0);
}
