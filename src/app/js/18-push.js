/* ── Phone notifications (Nov 17, 2026, Nick) ──
   Fans: "Notifications" in the Home footer opens a small sheet with one button, "Turn on notifications". It asks the phone, subscribes to web push with the
   public key from the public `pushInfo` call, and saves it through `pushSubscribe`. The link only shows when notifications are switched on (both VAPID keys set in Cloudflare).
   Owner: Settings > Fans & activity > Notify fans: pick "Newest release" or "Next show" (or write your own), see how many phones, and send (`pushSend`, at most 3 a day).
   /sw.js shows the notification. Everything shown is plain text (esc). Nothing here runs a notification by itself: Nick sends each one. */
const pushIsIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const pushStandalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
const pushCan = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
function pushInfo() { if (!S.pushInfoP) S.pushInfoP = run('pushInfo').catch(() => ({ on: false })); return S.pushInfoP; }
function pushKeyBytes(text) { const t = text.replace(/-/g, '+').replace(/_/g, '/'), s = atob(t + '='.repeat((4 - (t.length % 4)) % 4)); return Uint8Array.from(s, c => c.charCodeAt(0)); }
async function fillPushLink() {   // the footer link appears only when notifications are switched on AND the visitor is signed in to their NuRenaissance account
  const a = $('[data-push-open]'); if (!a) return;   // (Nov 21, 2026, Nick: notifications live with the account, the same in every NuRenaissance app; nrnGet is in 18-nrn-account.js)
  const info = await pushInfo(); const now = $('[data-push-open]'); if (now) now.hidden = !(info && info.on && nrnGet());
}
async function pushMine() {
  try { const reg = await navigator.serviceWorker.getRegistration('/sw.js'); return reg ? await reg.pushManager.getSubscription() : null; } catch (e) { return null; }
}
async function openPushSheet() {
  const info = await pushInfo(); if (!info || !info.on) return;
  const m = $('#modal'); m.className = 'modal';
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Notifications"><h2>Notifications</h2>
    <p class="cs" id="pushMsg"></p><button type="button" class="pill main" id="pushBtn" hidden></button>
    <p class="cs">Only new music and show announcements, a few a month at most. Turn them off here or in your phone's settings any time.</p>
    <div class="end"><button class="pill soft" data-close>Close</button></div></div>`;
  m.hidden = false;
  const msg = $('#pushMsg'), btn = $('#pushBtn');
  const show = (text, label, state) => { msg.textContent = text; btn.hidden = !label; btn.textContent = label || ''; btn.dataset.state = state || ''; btn.disabled = false; };
  async function refresh() {
    if (!pushCan()) return show(pushIsIos() && !pushStandalone() ? 'On iPhone, first add Soul Vault to your Home Screen (Home footer > Add to Home Screen), then open it from there to turn notifications on.' : 'This browser cannot show notifications.', '', 'none');
    if (Notification.permission === 'denied') return show('Notifications are blocked for Soul Vault. Allow them for this app in your phone or browser settings, then come back.', '', 'blocked');
    const on = !!(await pushMine()) && Notification.permission === 'granted';
    show(on ? "You're on. You'll hear about new music and shows." : 'Get a notification on your phone for new music and show announcements.', on ? 'Turn off notifications' : 'Turn on notifications', on ? 'on' : 'off');
  }
  btn.addEventListener('click', async () => {
    if (btn.disabled) return; const off = btn.dataset.state === 'on'; btn.disabled = true;
    try {
      if (off) {
        const sub = await pushMine(); if (sub) { const ep = sub.endpoint; await sub.unsubscribe(); await run('pushUnsubscribe', ep); }
        toast('Notifications are off');
      } else {
        const asked = Notification.requestPermission();   // first, so the phone sees it as the result of the tap
        const reg = await navigator.serviceWorker.register('/sw.js');
        if ((await asked) !== 'granted') { toast('Notifications were not allowed'); return refresh(); }
        await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: pushKeyBytes(info.key) });
        const j = sub.toJSON();
        try { await run('pushSubscribe', { endpoint: j.endpoint, p256dh: j.keys && j.keys.p256dh, auth: j.keys && j.keys.auth }); toast('Notifications are on'); }
        catch (e) { try { await sub.unsubscribe(); } catch (x) { /* ignore */ } toast((e && e.message) || 'Could not turn on notifications'); }
      }
    } catch (e) { toast('Could not change notifications on this phone'); }
    refresh();
  });
  refresh();
}
document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('[data-push-open]'); if (a) { e.preventDefault(); openPushSheet(); } });

/* Owner: Notify fans (a full Settings page, like Milestones and Shop: Settings > Fans & activity > Notify fans) */
async function renderNotifyPage() {
  clearPageBg(); S.view = 'notify'; renderChrome();
  const head = '<button class="back" data-nav="vault">' + I.back + 'Settings</button><header class="vh"><h1 class="page-h" style="padding:0;margin:0"><b>Notify</b> fans</h1><button class="round" data-nav="vault" aria-label="Settings">' + I.gear + '</button></header>';
  $('#main').innerHTML = `<div class="wrap studio shoppg pnpage">${head}
    <p class="cs" id="pnSt" role="status" aria-live="polite">Checking…</p>
    <div id="pnBody" hidden>
      <div class="shopitem pnauto"><h2 class="vsub" style="margin:0 0 6px">Automatic</h2>
        <p class="cs">Fans are told by themselves. They go out between 9 AM and 9 PM Central and count toward the 3-a-day limit. Switching one on never announces anything that already exists.</p>
        <div class="stuvis"><label class="chk"><input type="checkbox" id="pnAutoRel"> <span><b>New music</b><span class="cs">When a release goes live: it is public and its release date has arrived.</span></span></label>
          <label class="chk"><input type="checkbox" id="pnAutoShow"> <span><b>New shows</b><span class="cs">When a new upcoming show appears in your Road to 100 sheet (Completed = FALSE) or on Bandsintown.</span></span></label></div>
        <p class="cs" id="pnAutoSt" role="status" aria-live="polite"></p></div>
      <p class="cs">Or send one yourself: tap a suggestion to fill it in, change the words if you like, then send.</p>
      <div class="mschips"><button type="button" class="pill soft" data-pn="release">${I.plus}Newest release</button><button type="button" class="pill soft" data-pn="show">${I.plus}Next show</button></div>
      <div class="shopitem">
        <label class="sf">Title (shows in bold)<input class="field" id="pnTitle" maxlength="60" autocomplete="off" placeholder="New music from Nicólas Soul"></label>
        <label class="sf">Message<input class="field" id="pnBody2" maxlength="140" autocomplete="off" placeholder="Out now on all platforms"></label>
        <label class="sf">Where a tap goes<select class="field" id="pnUrl"><option value="/">Home</option><option value="/vault">Music</option><option value="/tour">Tour</option><option value="/lore">Lore</option></select></label>
        <p class="cs" id="pnPrev"></p>
      </div>
      <div class="save"><button type="button" class="pill main" id="pnSend">Send</button><span class="st" id="pnMsg" role="status" aria-live="polite"></span></div>
      <p class="cs" id="pnLast"></p></div>
    <p class="cs" id="pnErr" role="alert" style="color:#ff8a8a" hidden></p></div>`;
  const st = $('#pnSt'), err = $('#pnErr'), page = $('.pnpage'); let status;
  const fail = t => { err.textContent = t; err.hidden = !t; };
  async function load() {
    try { status = await run('pushStatus', BOOT.key); } catch (e) { st.textContent = (e && e.message) || 'Could not load.'; return; }
    if (!$('#pnSt')) return;
    if (!status.on) { st.textContent = 'Notifications are not switched on yet: the two keys (VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY) are missing in Cloudflare.'; return; }
    st.textContent = status.subscribers + (status.subscribers === 1 ? ' phone has' : ' phones have') + ' notifications on. You have sent ' + status.sentToday + ' of ' + status.cap + ' allowed in the last 24 hours.';
    if (status.auto) { $('#pnAutoRel').checked = !!status.auto.releases; $('#pnAutoShow').checked = !!status.auto.shows; }
    $('#pnBody').hidden = false; $('#pnSend').textContent = 'Send to ' + status.subscribers + (status.subscribers === 1 ? ' phone' : ' phones');
    $('#pnLast').innerHTML = (status.last || []).length ? '<b>Recently sent:</b><br>' + status.last.map(l => esc(new Date(l.at).toLocaleDateString() + ': ' + l.title + ' (' + l.sent + ' phones)')).join('<br>') : '';
  }
  const prev = () => { const p = $('#pnPrev'); if (!p) return; const t = $('#pnTitle').value, b = $('#pnBody2').value; p.textContent = (t || b) ? 'It will look like: “' + (t || '…') + '” — ' + (b || '…') : ''; };
  page.addEventListener('input', prev);
  page.addEventListener('change', async e => {
    if (!e.target.closest || !e.target.closest('.pnauto')) return;
    const say = $('#pnAutoSt'), want = { releases: $('#pnAutoRel').checked, shows: $('#pnAutoShow').checked };
    say.textContent = 'Saving…';
    try { const r = await run('pushAuto', BOOT.key, want); $('#pnAutoRel').checked = !!r.releases; $('#pnAutoShow').checked = !!r.shows;
      say.textContent = (r.releases || r.shows) ? 'On: ' + [r.releases ? 'new music' : '', r.shows ? 'new shows' : ''].filter(Boolean).join(' and ') + '. Everything that exists today was recorded, so only NEW things are announced.' : 'Off. Nothing is sent by itself.'; }
    catch (er) { say.textContent = (er && er.message) || 'Could not save.'; await load(); }
  });
  page.addEventListener('click', async e => {
    const q = e.target.closest && e.target.closest('[data-pn]');
    if (q) {
      fail('');
      if (q.dataset.pn === 'release') { const r = homePicks(); const rel = [r.single, r.project].filter(Boolean).sort((a, b) => relDateKey(b).localeCompare(relDateKey(a)))[0];
        if (!rel) return fail('No public release found yet.');
        $('#pnTitle').value = 'New music from Nicólas Soul'; $('#pnBody2').value = rel.title + ' is out now'; $('#pnUrl').value = '/vault'; }
      else { const t = await loadTour(), nx = t && t.next; if (!nx) return fail('No upcoming show is announced yet. Add one to the Road to 100 sheet first.');
        $('#pnTitle').value = 'Next show'; $('#pnBody2').value = [nx.dateText, nx.venue, nx.city].filter(Boolean).join(' · '); $('#pnUrl').value = '/tour'; }
      prev(); return;
    }
    if (!e.target.closest || !e.target.closest('#pnSend')) return; fail('');
    const title = $('#pnTitle').value.trim(); if (!title) return fail('Write a title first.');
    if (!confirm('Send this to ' + status.subscribers + ' phone' + (status.subscribers === 1 ? '' : 's') + '?\n\n' + title + '\n' + $('#pnBody2').value)) return;
    const b = $('#pnSend'); b.disabled = true; b.textContent = 'Sending…';
    try { const r = await run('pushSend', BOOT.key, { title, body: $('#pnBody2').value, url: $('#pnUrl').value }); $('#pnMsg').textContent = 'Sent to ' + r.sent + ' phone' + (r.sent === 1 ? '' : 's') + (r.removed ? ' (' + r.removed + ' had turned them off)' : ''); toast('Sent to ' + r.sent + ' phone' + (r.sent === 1 ? '' : 's')); await load(); }
    catch (er) { fail((er && er.message) || 'Could not send.'); b.textContent = 'Send'; }
    b.disabled = false;
  });
  load();
}
