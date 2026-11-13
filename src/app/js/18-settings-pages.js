/* ═════════ Settings screens as full pages ═════════
   Missing files, Backups, Soul Tribe fan list, Move off the Sheet, Set owner password, Problems reported, Check YouTube setup, Check playback setup and
   New release used to open as grey pop-ups. They now open as full pages with the same look as Studio and Listening insights: a "‹ Settings" link,
   a big title, the content on the page background, and the tab bar still at the bottom. The screens themselves are unchanged (same buttons, same code):
   the pop-up container simply dresses as a page while one of these is open (class "pagemode"), and goes back to normal when it closes. */
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  .modal.pagemode { display: block; place-items: unset; overflow-y: auto; overscroll-behavior: contain; padding: 0 16px; z-index: 9; background: var(--bg, #0A0A0B); backdrop-filter: none; }
  .modal.pagemode .sheet { width: min(820px, 100%); margin: 0 auto; max-height: none; overflow: visible; background: transparent; border: 0; border-radius: 0; padding: 0 0 130px; gap: 16px; }
  .modal.pagemode .sheet .pgback { justify-self: start; padding-top: calc(22px + env(safe-area-inset-top)); }
  .modal.pagemode .sheet h2.pgtitle { font: 300 38px/1 var(--serif); letter-spacing: -.01em; padding: 4px 0 6px; margin: 0; }
  .modal.pagemode .sheet h2.pgtitle b { font-weight: 800; }
  .modal.pagemode .sheet > p.cs, .modal.pagemode .sheet > p { margin: 0; line-height: 1.5; }
  .modal.pagemode .sheet .end { position: static; display: flex; flex-wrap: wrap; justify-content: flex-start; gap: 10px; margin-top: 6px; }
  .modal.pagemode .sheet .end .pill { flex: 1 1 140px; justify-content: center; min-height: 48px; }
  .modal.pagemode .sheet [id="msList"], .modal.pagemode .sheet [id="bkList"] { max-height: none !important; overflow: visible !important; }
  .modal.pagemode .sheet .field, .modal.pagemode .sheet input, .modal.pagemode .sheet select, .modal.pagemode .sheet textarea { font-size: 16px; }
  /* Missing files: each item is a card, like the groups in Settings */
  .mslistbox { display: grid; gap: 14px; }
  .mslistbox > div > b { display: block; margin: 4px 0 10px 4px; font-size: 12px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; color: var(--dim); }
  .msrow { display: grid; gap: 10px; padding: 16px; margin-bottom: 12px; border: 1px solid var(--line); border-radius: 18px; background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.025)); }
  .msrow > div:first-child { font-size: 16px; font-weight: 700; overflow-wrap: anywhere; } .msrow > div:first-child .cs { font-weight: 500; }
  .msbtns { display: flex; flex-wrap: wrap; gap: 8px; } .msbtns .pill { flex: 1 1 auto; justify-content: center; min-height: 44px; }
  .mslink { display: grid; gap: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
  .mslink[hidden] { display: none; }
  .mspick { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; max-height: 320px; overflow-y: auto; }
  .mspick .pill { width: 100%; display: grid; gap: 2px; justify-items: start; text-align: left; padding: 12px 14px; border-radius: 14px; height: auto; }
  .mspick .t { font-weight: 700; font-size: 15px; overflow-wrap: anywhere; } .mspick .cs { font-size: 13px; overflow-wrap: anywhere; }
` }));
function dressAsPage() {
  const m = $('#modal'); if (!m || m.hidden) return;
  m.classList.add('pagemode');
  const sh = m.querySelector('.sheet'); if (!sh) return;
  if (!sh.querySelector(':scope > .pgback')) sh.insertAdjacentHTML('afterbegin', `<button type="button" class="back pgback" data-close>${I.back}Settings</button>`);
  const h = sh.querySelector('h2');
  if (h && !h.classList.contains('pgtitle') && !h.children.length) {
    const t = h.textContent.trim(), i = t.indexOf(' '); h.classList.add('pgtitle');
    h.innerHTML = i > 0 ? `<b>${esc(t.slice(0, i))}</b>${esc(t.slice(i))}` : `<b>${esc(t)}</b>`;
  }
  const first = m.querySelector('.pgtitle'); if (first && !m.dataset.scrolled) { m.dataset.scrolled = '1'; m.scrollTop = 0; }
}
// the pop-up container is re-filled by these screens as they load; keep it dressed, and undress it the moment it closes
new MutationObserver(() => { const m = $('#modal'); if (m.hidden) { m.classList.remove('pagemode'); delete m.dataset.scrolled; } else if (m.classList.contains('pagemode')) dressAsPage(); })
  .observe($('#modal'), { childList: true, attributes: true, attributeFilter: ['hidden'] });
['openMissing', 'openBio', 'openLinkOnly', 'openFans', 'openBackups', 'openAreas', 'openOwnerPw', 'showProblems', 'checkYoutubeSetup', 'checkPlayback', 'openNewRelease'].forEach(name => {
  const orig = window[name]; if (typeof orig !== 'function') return;
  window[name] = function () { const r = orig.apply(this, arguments); dressAsPage(); return r && r.then ? r.then(v => { dressAsPage(); return v; }) : r; };
});
