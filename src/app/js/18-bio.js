/* ── The bio on Lore: a short bio, a longer one behind "Keep reading", bold text and headings (Nov 2026, Nick) ──
   Stored as ONE text in `artist_bio` (so nothing on the server changed): the short bio, then a line `[[more]]`, then the longer bio.
   Older bios have no marker: their first paragraph is the short bio and the rest is the longer one, exactly as before.
   Writing: **bold** makes bold text, a line starting with ## is a heading. The Bold and Heading buttons in Studio > Your bio add those marks for you.
   All text is escaped before the marks are turned into tags, so nothing typed can add its own HTML. */
const BIO_MORE = '[[more]]';
function bioParts(text) {
  const t = String(text || '').replace(/\r\n?/g, '\n').trim(), i = t.indexOf(BIO_MORE);
  if (i >= 0) return { short: t.slice(0, i).trim(), full: t.slice(i + BIO_MORE.length).trim() };
  const paras = t.split(/\n\s*\n/).filter(Boolean);
  return { short: paras[0] || '', full: paras.slice(1).join('\n\n') };
}
const bioJoin = (short, full) => { short = String(short || '').trim(); full = String(full || '').trim(); return full ? (short + '\n\n' + BIO_MORE + '\n\n' + full).trim() : short; };
// Plain text without the marks (for "Copy all lore as text").
const bioPlain = text => { const p = bioParts(text); return [p.short, p.full].filter(Boolean).join('\n\n').replace(/\*\*(.+?)\*\*/g, '$1').replace(/^##\s+/gm, ''); };
// Safe HTML: escape first, then turn **bold** and ## headings into tags. Blank lines separate paragraphs; a single line break stays a line break.
function bioHtml(text) {
  return String(text || '').trim().split(/\n\s*\n/).filter(Boolean).map(block => {
    const m = /^##\s+(.+)$/.exec(block.trim());
    const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    return m && !m[1].includes('\n') ? `<h3 class="biohd">${inline(m[1])}</h3>` : `<p>${inline(block.trim().replace(/^##\s+/gm, ''))}</p>`;
  }).join('');
}
function bioToolbar(target, label) {
  return `<div class="biotools" role="group" aria-label="Format ${esc(label)}"><button type="button" class="pill soft" data-bio-fmt="bold" data-bio-for="${target}"><b>B</b> Bold</button><button type="button" class="pill soft" data-bio-fmt="head" data-bio-for="${target}">Heading</button></div>`;
}
// The editor shown in Studio > Your bio (replaces the old single box).
function bioEditorHtml() {
  const p = bioParts(S.lib.artist_bio);
  return `<p class="cs" style="margin:0">Fans see the <b>short bio</b> when Lore opens, and the <b>full bio</b> after they tap Keep reading. Use <b>Bold</b> for bold text and <b>Heading</b> for a section title; leave a blank line between paragraphs.</p>
    <label class="sf">Short bio (shown on Lore)${bioToolbar('bioShort', 'the short bio')}<textarea class="field" id="bioShort" maxlength="1200" rows="5" placeholder="Two or three sentences: who you are and what you make.">${esc(p.short)}</textarea></label>
    <label class="sf">Full bio (after Keep reading)${bioToolbar('bioFull', 'the full bio')}<textarea class="field" id="bioFull" maxlength="6500" rows="12" placeholder="The whole story. Start a section with a heading, like ## Where it started">${esc(p.full)}</textarea></label>
    <details class="biopre"><summary>Preview how it looks</summary><div class="lorestory" id="bioPre"></div></details>
    <div class="save"><button class="pill soft" type="button" data-lore-copy>Copy all lore as text</button><button class="pill main" type="button" data-lore-bio>Save bio</button></div>`;
}
function bioPreview() {
  const box = $('#bioPre'); if (!box) return;
  const s = ($('#bioShort') || {}).value || '', f = ($('#bioFull') || {}).value || '';
  box.innerHTML = (bioHtml(s) || '<p class="cs">Nothing yet.</p>') + (f.trim() ? `<p class="cs">Keep reading ▾</p>${bioHtml(f)}` : '');
}
// The Bold / Heading buttons: wrap the selected words in ** **, or put ## at the start of the line the cursor is on.
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-bio-fmt]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const ta = $('#' + b.dataset.bioFor); if (!ta) return;
  const v = ta.value, a = ta.selectionStart, z = ta.selectionEnd;
  if (b.dataset.bioFmt === 'bold') {
    if (a === z) { ta.value = v.slice(0, a) + '****' + v.slice(z); ta.setSelectionRange(a + 2, a + 2); }
    else { ta.value = v.slice(0, a) + '**' + v.slice(a, z) + '**' + v.slice(z); ta.setSelectionRange(a + 2, z + 2); }
  } else {
    const ls = v.lastIndexOf('\n', a - 1) + 1, has = v.slice(ls, ls + 3) === '## ';
    ta.value = has ? v.slice(0, ls) + v.slice(ls + 3) : v.slice(0, ls) + '## ' + v.slice(ls);
    const d = has ? -3 : 3; ta.setSelectionRange(Math.max(ls, a + d), Math.max(ls, z + d));
  }
  ta.focus(); bioPreview();
});
document.addEventListener('input', e => { if (e.target && (e.target.id === 'bioShort' || e.target.id === 'bioFull')) bioPreview(); });
document.addEventListener('toggle', e => { if (e.target && e.target.classList && e.target.classList.contains('biopre')) bioPreview(); }, true);
