/* ── NuRenaissance account (Nov 21, 2026, Nick: one sign-in for every app) ──
   soulnicolas.com is a different website from nrnszn.com, so it cannot share nrnszn.com's sign-in cookie. Instead the Home footer link
   "NuRenaissance account" goes to www.nrnszn.com/api/account/connect, which (after signing in there if needed) sends the visitor back here
   with `#nrn_ticket=<one-time ticket>`. We take the ticket out of the address at once and trade it ONCE at www.nrnszn.com/api/account/redeem
   for the person's name and e-mail, kept on this device only (localStorage `sv_nrn`). Nothing in Soul Vault is locked behind it yet;
   the footer just shows who is signed in. Text only (esc). The link stays hidden until nrnszn.com says accounts are switched on. */
const NRN = 'https://www.nrnszn.com';
const nrnGet = () => { try { const j = JSON.parse(localStorage.getItem('sv_nrn') || 'null'); return j && j.email ? j : null; } catch (e) { return null; } };
const nrnSet = (u) => { try { u ? localStorage.setItem('sv_nrn', JSON.stringify({ email: String(u.email), name: u.name ? String(u.name) : '' })) : localStorage.removeItem('sv_nrn'); } catch (e) { /* private window */ } };
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
    .then(r => r.json()).then(j => { if (j && j.ok && j.user) { nrnSet(j.user); if (typeof fillPushLink === 'function') fillPushLink(); toast('Signed in as ' + (j.user.name || j.user.email)); } else toast((j && j.message) || 'That sign-in did not work. Try again.'); })
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
