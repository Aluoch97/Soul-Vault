/* ── NuRenaissance account (Nov 21, 2026, Nick: one sign-in for every app) ──
   soulnicolas.com is a different website from nrnszn.com, so it cannot share nrnszn.com's sign-in cookie. Instead the Home footer link
   "NuRenaissance account" goes to www.nrnszn.com/api/account/connect, which (after signing in there if needed) sends the visitor back here
   with `#nrn_ticket=<one-time ticket>`. We take the ticket out of the address at once and trade it ONCE at www.nrnszn.com/api/account/redeem
   for the person's name and e-mail, kept on this device only (localStorage `sv_nrn`). Nothing in Soul Vault is locked behind it yet;
   the footer just shows who is signed in. Text only (esc). The link stays hidden until nrnszn.com says accounts are switched on. */
const NRN = 'https://www.nrnszn.com';
const nrnGet = () => { try { const j = JSON.parse(localStorage.getItem('sv_nrn') || 'null'); return j && j.email ? j : null; } catch (e) { return null; } };
const nrnSet = (u, token) => { try { u ? localStorage.setItem('sv_nrn', JSON.stringify({ email: String(u.email), name: u.name ? String(u.name) : '', token: token ? String(token) : '' })) : localStorage.removeItem('sv_nrn'); } catch (e) { /* private window */ } };
let nrnOnP = null;
function nrnOn() {   // is sign-in switched on at nrnszn.com? (no cookie is sent: this only asks the public on/off)
  if (!nrnOnP) nrnOnP = fetch(NRN + '/api/account/me', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(j => !!(j && j.on)).catch(() => false);
  return nrnOnP;
}
const nrnTicket = (() => {   // runs once when the app loads: take the ticket out of the address before anything else sees it
  const m = /(?:^|[#&])nrn_ticket=([\w-]{20,100})/.exec(location.hash || '');
  if (!m) return null;
  try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) { /* ignore */ }
  return fetch(NRN + '/api/account/redeem', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket: m[1] }) })
    .then(r => r.json()).then(j => { if (j && j.ok && j.user) { nrnSet(j.user, j.token); if (typeof fillPushLink === 'function') fillPushLink(); nrnLoadSaved(); setTimeout(() => offerTribe(j.user), 900); toast('Signed in as ' + (j.user.name || j.user.email)); } else toast((j && j.message) || 'That sign-in did not work. Try again.'); })
    .catch(() => toast('Could not reach NuRenaissance. Try again.'))
    .then(() => fillNrnAcct());
})();
async function fillNrnAcct() {
  const a = $('[data-nrn-acct]'); if (!a) return;
  const me = nrnGet();
  a.href = me ? NRN + '/account' : NRN + '/api/account/connect?return=' + encodeURIComponent(location.origin + '/');
  a.textContent = me ? 'Signed in: ' + (me.name || me.email) : 'NuRenaissance account';
  const on = await nrnOn(); const now = $('[data-nrn-acct]'); if (now) now.hidden = !on && !me;
}

/* ── Saved songs + Soul Tribe (Nov 21, 2026, Nick: what an account is for) ──
   The heart in Now Playing ([data-np-like]) saves the playing song to the fan's NuRenaissance account (www.nrnszn.com/api/account/saved,
   app "vault", with the app token `sv_nrn.token` that redeem handed out), so it follows them to any phone; the Music tab shows them as
   "Saved songs" (savedRow in 06). Only song ids and titles are sent. Right after signing in, a one-time sheet offers to join the Soul Tribe
   with the account e-mail (joinSubmit; the agree box must be ticked by the fan). */
S.nrnSaved = new Set();
const nrnAuth = () => { const me = nrnGet(); return me && me.token ? { authorization: 'Bearer ' + me.token } : null; };
async function nrnLoadSaved() {
  const h = nrnAuth(); if (!h) return;
  try {
    const r = await fetch(NRN + '/api/account/saved?app=vault', { headers: h, cache: 'no-store' });
    if (r.status === 401) { nrnSet(null); fillNrnAcct(); return; }   // the account was deleted or the token expired: forget it here
    const j = await r.json(); if (!j.ok) return;
    S.nrnSaved = new Set(j.items.filter(x => x.kind === 'song').map(x => x.id));
    paintLike(); if (S.view === 'library' && typeof refreshView === 'function') refreshView();
  } catch (e) { /* offline: keep what we have */ }
}
function likeBtn() { return $('[data-np-like]'); }
function paintLike() {
  const b = likeBtn(); if (!b) return;
  const t = S.now && S.now.t, on = !!(t && S.nrnSaved.has(t.track_id));
  b.hidden = !(nrnAuth() && t);
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
  b.innerHTML = on ? '♥<span> Saved</span>' : '♡<span> Save</span>';
  b.setAttribute('aria-label', on ? 'Remove from your saved songs' : 'Save this song to your account');
}
let nrnLikeFor = null;
setInterval(() => { const id = S.now && S.now.t && S.now.t.track_id; if (id !== nrnLikeFor) { nrnLikeFor = id; paintLike(); } }, 800);
document.addEventListener('click', async e => {
  const b = e.target.closest && e.target.closest('[data-np-like]'); if (!b) return;
  e.preventDefault(); const t = S.now && S.now.t, h = nrnAuth(); if (!t || !h || b.disabled) return;
  const on = !S.nrnSaved.has(t.track_id); b.disabled = true;
  try {
    const r = await fetch(NRN + '/api/account/saved', { method: 'POST', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ app: 'vault', kind: 'song', id: t.track_id, title: t.title || '', url: '/vault/' + String(t.release_id || '').replace(/^rel_/, '').replace(/_/g, '-'), on }) });
    const j = await r.json().catch(() => ({}));
    if (j.ok) { on ? S.nrnSaved.add(t.track_id) : S.nrnSaved.delete(t.track_id); toast(on ? 'Saved to your songs' : 'Removed from your songs'); }
    else toast(j.message || 'Could not save right now.');
  } catch (err) { toast('Could not reach NuRenaissance. Try again.'); }
  b.disabled = false; paintLike();
});
function offerTribe(u) {
  try { if (localStorage.getItem('sv_tribe_asked') === u.email) return; localStorage.setItem('sv_tribe_asked', u.email); } catch (e) { return; }
  const m = $('#modal'); if (!m || !m.hidden) return;
  const first = String(u.name || '').trim().split(/\s+/)[0] || '';
  m.className = 'modal';
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="tribeT"><h2 id="tribeT">Join the Soul Tribe?</h2>
    <p class="cs">New music before anyone else, show announcements and behind the scenes, by e-mail to <b>${esc(u.email)}</b>.</p>
    <label class="field-l" for="tribeFirst">First name</label><input class="field" id="tribeFirst" maxlength="80" autocomplete="given-name" value="${esc(first)}">
    <label class="tribeok"><input type="checkbox" id="tribeOk"> It's okay to e-mail me (unsubscribe any time)</label>
    <p class="cs" id="tribeMsg" role="status"></p>
    <div class="end"><button class="pill soft" data-close>Not now</button><button class="pill main" id="tribeJoin">Join</button></div></div>`;
  m.hidden = false;
  $('#tribeJoin').addEventListener('click', async () => {
    const msg = $('#tribeMsg'), btn = $('#tribeJoin');
    if (!$('#tribeOk').checked) { msg.textContent = 'Tick the box so I know it is okay to e-mail you.'; return; }
    btn.disabled = true;
    try {
      const r = await run('joinSubmit', { firstName: $('#tribeFirst').value, email: u.email, emailConsent: true, source: 'NuRenaissance account' });
      msg.textContent = r && r.duplicate ? "You're already in the Soul Tribe." : "You're in. Welcome to the Soul Tribe!";
      setTimeout(() => { if (typeof closeModal === 'function') closeModal(); else m.hidden = true; }, 1400);
    } catch (err) { msg.textContent = (err && err.message) || 'Could not join right now.'; btn.disabled = false; }
  });
}
setTimeout(nrnLoadSaved, 1500);
