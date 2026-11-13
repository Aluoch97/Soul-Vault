const BOOT = window.SV_BOOT || {};
window.SV_APP_LOADED = true;
const OWNER = !!BOOT.key && !BOOT.token;
const S = { lib: null, share: null, view: 'library', releaseId: null, now: null, played: {},
            covers: {}, coverP: {}, filter: 'All', q: '', libScroll: 0,
            queue: [], qi: -1, comments: {}, draft: null, editing: false, viaApi: false, jobBusy: false };

const I = {
  lib:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  link:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
  play:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>',
  prev:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 12l9-6v12zM3 12l9-6v12z"/></svg>',
  next:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 12L4 6v12zM21 12l-9-6v12z"/></svg>',
  down:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  back:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  home:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
  vault: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="12" cy="12" r="3.5"/><path d="M12 8.5V7M15.5 12H17M12 15.5V17M8.5 12H7"/></svg>',
  note:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/></svg>',
  disc:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  wave:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/></svg>',
  chev:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M9 6l6 6-6 6"/></svg>',
  film:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/></svg>',
  star:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  lock:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  mail:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 7l8 6 8-6"/></svg>',
  mic:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  text:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 11h16M4 16h10"/></svg>',
  pin:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  more:  '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  plus:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  shuf:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>',
  next2: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h11M4 12h11M4 18h7"/><path d="M17 15l4 3-4 3z" fill="currentColor"/></svg>',
  queue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h9"/><path d="M18 15v6M15 18h6"/></svg>',
  info:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  up2:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 20h16"/></svg>',
  chat:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  x:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  edit:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  img:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
  up:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
  dn:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  dl:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>'
};

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Two ways to reach the server: Google's built-in channel, or plain web requests (the backup).
let TRANSPORT = 'gas';
const runGas = (fn, ...a) => new Promise((res, rej) => google.script.run.withSuccessHandler(res).withFailureHandler(rej)[fn](...a));
async function runFetch(fn, ...a) {
  if (!BOOT.api) throw new Error('The backup connection needs app_url in the Settings tab.');
  // BOOT.api is our own /api on Cloudflare (when switched on); BOOT.gas is the Apps Script address. If our own answer fails, the call is repeated against Apps Script.
  const call = url => fetch(url, { method: 'POST', body: JSON.stringify({ fn: fn, args: a }), credentials: 'omit', redirect: 'follow' }).then(async r => ({ r, j: await r.json() }));
  let r, j;
  try { ({ r, j } = await call(BOOT.api)); }
  catch (e) {
    if (BOOT.gas && BOOT.gas !== BOOT.api) { try { ({ r, j } = await call(BOOT.gas)); } catch (e2) { throw new Error('Could not reach Soul Vault. Check your internet connection.'); } }
    else throw new Error('Could not reach Soul Vault. Check your internet connection.');
  }
  if (!j.ok) throw new Error(j.error || 'Something went wrong.');
  return j.result;
}
const runBase = (fn, ...a) => TRANSPORT === 'fetch' ? runFetch(fn, ...a) : runGas(fn, ...a);
// Covers, song covers, page backgrounds and photos are kept on our own storage (media.soulnicolas.com/img/<file id>/<size>, copied by tools/mirror-images.py).
// The old way (Apps Script reading Google Drive) is the spare: used when a picture is not there, for private/sealed releases, and for animated covers.
const MEDIA_BASE = 'https://media.soulnicolas.com/';   // our own storage (same address as MEDIA_BASE in functions/_lib/native.js)
const IMG_BASE = MEDIA_BASE + 'img/', imgMiss = {};
const imgSizeKey = full => { if (!full) return 't'; if (full === true) return '1200'; const n = +full || 1200; return n <= 240 ? '160' : n <= 600 ? '400' : n <= 1300 ? '1200' : '1600'; };
const loadOurImg = url => new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(url); i.onerror = () => rej(new Error('img')); i.src = url; });
async function ourImage(id, full) {
  const key = imgSizeKey(full), tag = id + '|' + key;
  if (!id || imgMiss[tag] || /[^A-Za-z0-9_-]/.test(String(id))) return '';
  try { return await loadOurImg(IMG_BASE + id + '/' + key); } catch (e) { imgMiss[tag] = 1; return ''; }
}
const setImgSrc = (img, u) => { if (/^https:\/\/media\./.test(u)) img.crossOrigin = 'anonymous'; img.src = u; };   // our pictures are drawn on a canvas for the cover tint, which needs the CORS mode
const run = (fn, ...a) => fn === 'getCover' ? ourImage(a[0], a[3]).then(u => u || runBase(fn, ...a)) : runBase(fn, ...a);
const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
// First call of the session: if Google's channel is silent for 8 seconds, switch to the backup for good.
async function firstCall(fn, ...a) {
  if (typeof google === 'undefined' || !google.script) { TRANSPORT = 'fetch'; return runFetch(fn, ...a); }
  try { return await timeout(runGas(fn, ...a), 8000); }
  catch (e) {
    if (!BOOT.api) throw e;
    TRANSPORT = 'fetch';
    $('#main').innerHTML = '<p class="status">Switching to the backup connection…</p>';
    return runFetch(fn, ...a);
  }
}
const fmt = t => !isFinite(t) ? '0:00' : Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
const songs = n => n + (n === 1 ? ' song' : ' songs');
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
function toast(t, cls) {
  const el = $('#toast'); el.textContent = t; el.className = 'toast' + (cls ? ' ' + cls : ''); el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), cls ? 3600 : 2200);
}

/* ── data ── */
const rel = id => S.lib.releases.find(r => r.release_id === id);
const trk = id => S.lib.tracks.find(t => t.track_id === id);
const ver = id => S.lib.versions.find(v => v.version_id === id);
const hidden = x => x.hidden === true || x.hidden === 'TRUE';
// all = include hidden songs and versions (used by edit mode)
function tracksOf(relId, all) {
  return S.lib.tracks.filter(t => t.release_id === relId && (all || !hidden(t)) && versionsOf(t.track_id, all).length)
    .sort((a, b) => (a.track_no === '' ? 999 : a.track_no) - (b.track_no === '' ? 999 : b.track_no) || String(a.title).localeCompare(b.title));
}
function versionsOf(trackId, all) {
  return S.lib.versions.filter(v => v.track_id === trackId && (all || !hidden(v)))
    .sort((a, b) => (b.is_primary - a.is_primary) || String(a.label).localeCompare(b.label));
}
const primaryOf = t => versionsOf(t.track_id)[0];
const TYPE_FILTERS = ['All', 'Album', 'Mixtape', 'EP', 'Single', 'Compilation', 'Unreleased'];
// Runtime: song lengths are "m:ss" (or "h:mm:ss"); a project shows as "54 min 12 sec".
function durSecs(d) {
  const p = String(d || '').trim().split(':').map(Number);
  if (p.length < 2 || p.some(x => !isFinite(x))) return 0;
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
}
function runtimeOf(ts) {
  let secs = 0, missing = 0;
  ts.forEach(t => { const v = primaryOf(t); const n = v ? durSecs(v.duration) : 0; if (n) secs += n; else missing++; });
  return { secs, missing };
}
function fmtRuntime(rt) {
  if (!rt.secs) return '';
  const m = Math.floor(rt.secs / 60), sec = Math.round(rt.secs % 60);
  return `${m} min ${sec} sec${rt.missing ? '+' : ''}`;
}
function dateLabel(r) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(r.release_date || ''));
  if (!m) return String(r.year || '');
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}
function metaLine(r, ts) {
  const L = songLists(ts.filter(t => !hidden(t)));
  const full = runtimeOf(L.full), both = runtimeOf(L.full.concat(L.deluxe));
  const parts = [esc(dateLabel(r)), songs(L.full.length)];
  if (full.secs) parts.push(`<span${full.missing ? ' title="Some song lengths are measured the first time they play"' : ''}>${fmtRuntime(full)}</span>`);
  let html = `<div class="relmeta">${parts.join(' · ')}</div>`;
  if (L.deluxe.length) html += `<div class="relmeta sub">With drafts: ${songs(L.full.length + L.deluxe.length)}${both.secs ? ', ' + fmtRuntime(both) : ''}</div>`;
  if (String(r.recorded_at || '').trim()) html += `<div class="recorded">${I.pin}<span>Recorded in ${esc(r.recorded_at)}</span></div>`;
  html += `<div id="firstRow">${firstRow(r)}</div>`;
  html += agesLine(r) + unrelTag(r) + genreTags(r.genre);
  html += `<div id="listenRow">${S.editing ? '' : listenRow(r)}</div>`;   // streaming icons, directly under the genre
  return html;
}
// Release types describe the format. Old "Deluxe"/"B-Sides" labels read as Album until you pick a type in Edit.
const typeOf = r => (['Deluxe', 'B-Sides'].indexOf(r.type) > -1 || !r.type ? 'Album' : r.type);
const typeGroup = r => typeOf(r);
const EDIT_TYPES = ['Album', 'Mixtape', 'EP', 'Single', 'Live', 'Compilation', 'Unreleased', 'Other'];
// Songs inside a release: the full project (main tracklist), the drafts songs, singles, and b-sides.
const sectionOf = t => (['B-Side', 'Extra'].indexOf(t.category) > -1 ? 'bsides' : ['Deluxe', 'Bonus'].indexOf(t.category) > -1 ? 'deluxe' : 'full');
const isSingle = t => t.is_single === true || t.is_single === 'TRUE';
function songLists(ts) {
  return { full: ts.filter(t => sectionOf(t) === 'full'), deluxe: ts.filter(t => sectionOf(t) === 'deluxe'),
           singles: ts.filter(isSingle), bsides: ts.filter(t => sectionOf(t) === 'bsides') };
}
const CLUB = () => !!(S.share && S.share.target_type === 'all');
// Pulls the 11-character video ID out of any common YouTube link.
function ytId(u) {
  u = String(u || '').trim();
  const m = u.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{11})/) ||
            u.match(/^([A-Za-z0-9_-]{11})$/);
  return m ? m[1] : '';
}
// A slowed + reverb version can have its own YouTube video, listed in /links.json under "sr" (track id → video link). Pass the playing version as `v` to get it.
const isSR = v => !!v && /slow|reverb|\bs\s*(\+|&|n|and)\s*r\b/i.test(String(v.label || ''));
const srVideo = t => (t && S.links && S.links.sr && ytId(S.links.sr[t.track_id])) || '';
const videoOf = (t, v) => (v && isSR(v) && srVideo(t)) || (t && ytId(t.video_url)) || '';
const hasWorld = r => !!(r && (String(r.world_tagline || '').trim() || String(r.world_story || '').trim() || String(r.world_mood || '').trim()));
// Covers saved by the app carry a small copy in the Sheet: show it instantly instead of waiting on Drive.
function primeThumbs() {
  try { registerXCovers(); } catch (e) {}
  if (typeof primeTrackThumbs === 'function') primeTrackThumbs();
  (S.lib.releases || []).forEach(r => {
    if (r.cover_thumb && r.cover_file_id && !S.covers[r.cover_file_id]) {
      S.covers[r.cover_file_id] = r.cover_thumb;
      S.coverP[r.cover_file_id] = Promise.resolve(r.cover_thumb);
    }
    if (r.clean_cover_thumb && r.clean_cover_file_id && !S.covers[r.clean_cover_file_id]) {
      S.covers[r.clean_cover_file_id] = r.clean_cover_thumb;
      S.coverP[r.clean_cover_file_id] = Promise.resolve(r.clean_cover_thumb);
    }
  });
}
// The name a release came out under ("Released as"): set in Release page, otherwise read from the song file names.
const HOME_NAME = 'Nicólas Soul';
const isHomeName = n => /nic[oó]las\s*soul/i.test(String(n || ''));
function relArtist(r) {
  if (!r) return HOME_NAME;
  if (String(r.artist_name || '').trim()) return String(r.artist_name).trim();
  S.nameCache = S.nameCache || {};
  if (S.nameCache[r.release_id]) return S.nameCache[r.release_id];
  const ts = S.lib.tracks.filter(t => t.release_id === r.release_id);
  const counts = {};
  ts.forEach(t => { const a = String(t.artist || '').trim(); if (a && !/nurenaissance/i.test(a)) counts[a] = (counts[a] || 0) + 1; });
  const names = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  let out = HOME_NAME;
  if (names.length && counts[names[0]] >= ts.length / 2) out = isHomeName(names[0]) ? HOME_NAME : names[0];
  else if (names.length >= 3) out = 'Various artists';
  return (S.nameCache[r.release_id] = out);
}
// A song's own artist is only worth showing when it differs from the release's name (features, compilations).
// Song artist: shown only when it differs from the project artist (a Nicólas Soul song on a LyriCal project shows).
const artistOf = t => {
  const a = String(t.artist || '').trim();
  if (!a || /nurenaissance/i.test(a)) return '';
  const pa = relArtist(rel(t.release_id));
  const same = a.toLowerCase() === pa.toLowerCase() || (isHomeName(a) && isHomeName(pa));
  return same ? '' : a;
};
// The number shown for a song: your custom number if set, otherwise its position.
const numLabel = t => String(t.number_label || '').trim() || String(t.track_no || '');

