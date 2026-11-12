// Data that Cloudflare owns instead of the Sheet. An area ("domain") is switched over one at a time with `adoptDomain`:
// its data is copied from the Sheet once, and from then on every edit happens here (the Sheet is left alone as a backup).
//   playlists  -> playlists
//   extras     -> reviews, apps, videos, links, audio notes and photos on a release page
//   settings   -> the letter, the bio, links for other artists
//   catalog    -> releases, songs and versions themselves (titles, order, credits, lyrics, covers, deleting...)
export const DOMAINS = ['playlists', 'extras', 'settings', 'catalog'];
export const emptyOwned = () => ({ domains: {}, playlists: [], extras: [], letter: null, bio: '', artist_links: {}, releases: [], tracks: [], versions: [], birth_date: '' });
export const normOwned = o => Object.assign(emptyOwned(), o || {}, { domains: Object.assign({}, (o && o.domains) || {}) });

export async function loadOwned(db) {
  try { const r = await db.prepare("SELECT v FROM kv WHERE k = 'owned'").first(); return normOwned(r ? JSON.parse(r.v) : null); } catch (e) { return emptyOwned(); }
}
export async function saveOwned(db, o) {
  await db.prepare('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)').run();
  await db.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES ('owned', ?)").bind(JSON.stringify(o)).run();
}

// Put the owned areas on top of a library (public or owner); the Sheet's copy of those areas is ignored.
export function applyOwned(lib, o) {
  const d = o.domains || {}, out = Object.assign({}, lib);
  if (d.playlists) out.playlists = o.playlists;
  if (d.extras) out.extras = o.extras;
  if (d.settings) { out.letter = o.letter; out.artist_bio = o.bio; out.artist_links = o.artist_links; }
  if (d.catalog) { out.releases = o.releases; out.tracks = o.tracks; out.versions = o.versions; }
  return out;
}
// Which calls an adopted area takes over (they never reach Apps Script), and which Apps Script calls would now write into the Sheet's copy and are refused.
export const OWNED_FNS = { savePlaylist: 'playlists', deletePlaylist: 'playlists', getPlaylists: 'playlists',
  addExtra: 'extras', updateExtra: 'extras', deleteExtra: 'extras', saveLetter: 'settings', saveBio: 'settings', saveArtistLinks: 'settings',
  saveTracklist: 'catalog', saveTrackDetails: 'catalog', saveWorld: 'catalog', saveLyrics: 'catalog', saveUnlock: 'catalog', saveVideosMeta: 'catalog', updateVersion: 'catalog', setDuration: 'catalog', deleteTrack: 'catalog', deleteVersion: 'catalog', deleteRelease: 'catalog' };
export const BLOCKED_AFTER = { extras: ['addPhoto', 'addAudioNote', 'addYoutubePlaylistVideos', 'createReleaseFromYoutube', 'addYoutubeSong', 'refreshYoutubeTitles', 'youtubeTitleStatus'],
  catalog: ['uploadCover', 'registerUpload', 'setPreview', 'setVoiceNote', 'createRelease', 'setAnimatedCover', 'setTrackCover', 'setReleaseBg', 'uploadCleanCover', 'addCover', 'removeCover', 'setMainCover', 'addYoutubeSong', 'addYoutubePlaylistVideos', 'createReleaseFromYoutube', 'getUploadTicket', 'addAudioNote', 'addPhoto', 'refreshYoutubeTitles', 'youtubeTitleStatus'] };

const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const hex = n => Array.from(crypto.getRandomValues(new Uint8Array(n))).map(b => b.toString(16).padStart(2, '0')).join('');
export const hostOf = url => { const m = String(url).match(/^https?:\/\/(?:www\.)?([^\/?#:]+)/i); return m ? m[1] : ''; };
const ytId = u => { const m = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{11})/.exec(String(u || '')) || /^([A-Za-z0-9_-]{11})$/.exec(String(u || '').trim()); return m ? m[1] : ''; };
const ytList = u => { const m = /[?&]list=([A-Za-z0-9_-]{10,64})/.exec(String(u || '')); return m ? m[1] : ''; };

// ── playlists ──
export function savePlaylist(o, ow, lib, now) {
  o = o || {};
  const title = cut(o.title, 120); if (!title) throw new Error('Give the playlist a name.');
  const known = new Set((lib.tracks || []).map(t => t.track_id)), seen = new Set(), tracks = [];
  (o.tracks || []).slice(0, 500).forEach(t => { t = String(t); if (known.has(t) && !seen.has(t)) { seen.add(t); tracks.push(t); } });
  const vals = { title, description: cut(o.description, 1000), tracks, fans: !!o.fans, updated: now };
  const i = o.id ? ow.playlists.findIndex(p => p.playlist_id === o.id) : -1;
  if (i >= 0) ow.playlists[i] = Object.assign({}, ow.playlists[i], vals);
  else ow.playlists.push(Object.assign({ playlist_id: 'pl_' + hex(6) }, vals));
  return i >= 0 ? ow.playlists[i] : ow.playlists[ow.playlists.length - 1];
}
export function deletePlaylist(id, ow) { const n = ow.playlists.length; ow.playlists = ow.playlists.filter(p => p.playlist_id !== id); return ow.playlists.length < n; }
const plIds = v => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a.map(String) : []; } catch (e) { return []; } };
export function playlistsAnswer(lib, ow, scope) {   // scope = null for the owner, or { tracks, releases } for a fan link
  const allowed = scope ? new Set(scope.tracks.map(t => t.track_id)) : null, attach = {};
  (scope ? scope.releases : lib.releases || []).forEach(r => { const ids = plIds(r.playlist_ids); if (ids.length) attach[r.release_id] = ids; });
  const pls = ow.playlists.filter(p => !allowed || p.fans).map(p => allowed ? Object.assign({}, p, { tracks: p.tracks.filter(t => allowed.has(t)) }) : p).filter(p => !allowed || p.tracks.length);
  return { playlists: pls, attach };
}

// ── extras ──
export async function linkPreview(url) {
  const out = { title: '', description: '', image: '', site: hostOf(url) };
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (compatible; SoulVaultPreview/1.0)', accept: 'text/html' }, signal: AbortSignal.timeout(8000) });
    if (res.status >= 400) return out;
    const html = (await res.text()).slice(0, 400000);
    const dec = t => String(t || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
    const meta = name => { for (const t of html.match(/<meta\b[^>]*>/gi) || []) { const k = (t.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i) || [])[1]; if (k && k.toLowerCase() === name) { const c = (t.match(/\bcontent\s*=\s*"([^"]*)"/i) || t.match(/\bcontent\s*=\s*'([^']*)'/i) || [])[1]; if (c) return dec(c); } } return ''; };
    out.title = meta('og:title') || meta('twitter:title') || dec((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
    out.description = meta('og:description') || meta('twitter:description') || meta('description');
    let img = meta('og:image') || meta('og:image:url') || meta('twitter:image');
    if (img && img.indexOf('//') === 0) img = 'https:' + img; else if (img && img.charAt(0) === '/') img = (url.match(/^https?:\/\/[^\/]+/i) || [''])[0] + img;
    out.image = /^https:\/\/[^\s"'<>]+$/i.test(img) ? img : ''; out.site = meta('og:site_name') || out.site;
  } catch (e) {}
  out.title = out.title.slice(0, 200); out.description = out.description.slice(0, 500); out.site = String(out.site).slice(0, 80);
  return out;
}
const KINDS = ['review', 'app', 'video', 'link', 'note'];
export async function addExtra(releaseId, o, ow, lib, now) {
  o = o || {};
  if (KINDS.indexOf(o.kind) < 0) throw new Error('Unknown item type.');
  const url = cut(o.url, 1000);
  if (!/^https?:\/\/[^\s]+$/i.test(url)) throw new Error('Paste a full link that starts with https://');
  if (!(lib.releases || []).some(r => r.release_id === releaseId)) throw new Error('Release not found.');
  let meta = { title: '', description: '', image: '', site: hostOf(url) };
  if (o.kind === 'video') {
    const id = ytId(url), list = ytList(url);
    if (!id && !list) throw new Error("That doesn't look like a YouTube video or playlist link.");
    meta.image = id ? 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg' : ''; meta.site = 'YouTube';
    try { const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url), { signal: AbortSignal.timeout(6000) }); if (r.ok) meta.title = cut((await r.json()).title, 200); } catch (e) {}
  } else meta = await linkPreview(url);
  const row = { extra_id: 'ext_' + hex(6), release_id: releaseId, kind: o.kind, url, title: cut(o.title || meta.title || meta.site || url, 200), description: cut(o.description || meta.description, 500),
    image: meta.image, site: cut(meta.site, 80), file_id: '', created: now };
  ow.extras.push(row); return row;
}
export function updateExtra(id, o, ow) {
  o = o || {};
  const i = ow.extras.findIndex(e => e.extra_id === id); if (i < 0) throw new Error('That item was not found. It may have been removed.');
  const x = ow.extras[i], cells = {};
  const title = cut(o.title, 200); if (title) { cells.title = title; if (title !== String(x.title || '')) cells.title_src = ''; }
  if (x.kind === 'note' && o.description != null) cells.description = cut(o.description, 500);
  const url = cut(o.url, 1000);
  if (url && url !== String(x.url || '')) {
    if (x.kind === 'video') { const vid = ytId(url), list = ytList(url); if (!vid && !list) throw new Error("That doesn't look like a YouTube video or playlist link."); cells.url = url; cells.image = vid ? 'https://i.ytimg.com/vi/' + vid + '/hqdefault.jpg' : ''; cells.site = 'YouTube'; }
    else if (x.kind === 'review' || x.kind === 'app') { if (!/^https?:\/\/[^\s]+$/i.test(url)) throw new Error('Paste a full link that starts with https://'); cells.url = url; cells.site = hostOf(url); }
  }
  ow.extras[i] = Object.assign({}, x, cells); return ow.extras[i];
}
export function deleteExtra(id, ow) { ow.extras = ow.extras.filter(e => e.extra_id !== id); return true; }

// ── letter, bio, artist links ──
export function saveLetter(title, body, ow, now) {
  title = cut(title, 80); body = cut(body, 4000);
  ow.letter = body ? { title: title || 'A note from Nicólas', body, updated: now } : null; return ow.letter;
}
export function saveBio(text, ow) { ow.bio = String(text || '').replace(/\r\n?/g, '\n').trim().slice(0, 8000); return ow.bio; }
export function saveArtistLinks(links, ow) {
  let m = links; if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { m = {}; } }
  const out = {};
  Object.keys(m || {}).slice(0, 300).forEach(k => { const name = cut(k, 120), url = cut(m[k], 500); if (!name || !url) return; if (!/^https?:\/\/[^\s<>"']+$/i.test(url)) throw new Error('The link for "' + name + '" should start with https://'); out[name] = url; });
  ow.artist_links = out; return out;
}
