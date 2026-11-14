// YouTube for the owner's tools, on Cloudflare (ports of ytApi_ / ytSource_ / checkYoutube / the title refresh in Vault.gs).
// It uses YOUTUBE_API_KEY, a Cloudflare secret (a Google Cloud key limited to "YouTube Data API v3"). Nothing here is shown to fans.
export const REFRESH_DAYS = 25;
export const ytId = u => { const m = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{11})/.exec(String(u || '').trim()) || /^([A-Za-z0-9_-]{11})$/.exec(String(u || '').trim()); return m ? m[1] : ''; };
export const ytList = u => { const m = /[?&]list=([A-Za-z0-9_-]{10,64})/.exec(String(u || '')); return m ? m[1] : ''; };
const today = () => new Date().toISOString().slice(0, 10);
export const srcTag = () => 'api:' + today();

/** What YouTube's refusal means, in plain words (same wording as the old script, with the key living in Cloudflare). */
export function errorText(code, body) {
  const e = (body && body.error) || {}, reason = ((e.errors || [])[0] || {}).reason || '', msg = String(e.message || ''), all = JSON.stringify(body || {});
  if (reason === 'accessNotConfigured' || /API_KEY_SERVICE_BLOCKED/.test(all) || /has not been used|is disabled|are blocked|not authorized|API restrictions/i.test(msg))
    return 'YouTube is not switched on for your API key yet. In Google Cloud Console: APIs & Services > Library > "YouTube Data API v3" > Enable. Then Credentials > your key > API restrictions > add "YouTube Data API v3". Give it a minute, then try again.';
  if (reason === 'keyInvalid' || /API key not valid|API_KEY_INVALID/i.test(all)) return 'Google says the YOUTUBE_API_KEY saved in Cloudflare is not valid. Copy the key again from Google Cloud > Credentials (no spaces).';
  if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded' || reason === 'rateLimitExceeded') return "YouTube's daily limit for your key has been reached. Try again tomorrow.";
  if (reason === 'playlistNotFound' || reason === 'playlistItemsNotAccessible' || (code === 403 && /private|not accessible/i.test(msg)) || code === 404) return "YouTube couldn't open that playlist. If it's private, set it to Unlisted or Public.";
  return 'YouTube said no (' + code + '). ' + msg.slice(0, 140);
}
export const NO_KEY = 'Add your YouTube key to Cloudflare first: Workers & Pages, soul-vault, Settings, Variables and secrets, add a Secret named YOUTUBE_API_KEY (a Google Cloud key limited to YouTube Data API v3), then retry the deployment.';

export async function api(env, path, params) {
  const key = String(env.YOUTUBE_API_KEY || '').trim();
  if (!key) throw new Error(NO_KEY);
  const q = Object.keys(params).filter(k => params[k] !== '' && params[k] != null).map(k => k + '=' + encodeURIComponent(params[k])).join('&');
  const res = await fetch('https://www.googleapis.com/youtube/v3/' + path + '?' + q + '&key=' + encodeURIComponent(key));
  let body = {}; try { body = await res.json(); } catch (e) { /* not json */ }
  if (res.status >= 400) throw new Error(errorText(res.status, body));
  return body;
}

/** A playlist (every public video, up to 200) or a single video: { kind, id, title, channel, videos: [{ id, title }] }. */
export async function source(env, url) {
  url = String(url || '').trim();
  const list = ytList(url), vid = ytId(url);
  if (list) {
    const meta = await api(env, 'playlists', { part: 'snippet', id: list });
    if (!meta.items || !meta.items.length) throw new Error("YouTube couldn't find that playlist. If it's private, set it to Unlisted or Public.");
    const out = { kind: 'playlist', id: list, title: String(meta.items[0].snippet.title || ''), channel: String(meta.items[0].snippet.channelTitle || ''), videos: [] };
    let token = '', pages = 0;
    do {
      const d = await api(env, 'playlistItems', { part: 'snippet', maxResults: 50, playlistId: list, pageToken: token });
      (d.items || []).forEach(it => { const sn = it.snippet || {}, id = sn.resourceId && sn.resourceId.videoId, t = String(sn.title || ''); if (id && !/^(Private|Deleted) video$/i.test(t)) out.videos.push({ id, title: t }); });
      token = d.nextPageToken || ''; pages++;
    } while (token && pages < 4 && out.videos.length < 200);
    if (!out.videos.length) throw new Error('That playlist has no public videos.');
    return out;
  }
  if (vid) {
    const d = await api(env, 'videos', { part: 'snippet', id: vid });
    if (!d.items || !d.items.length) throw new Error("YouTube couldn't find that video.");
    const sn = d.items[0].snippet;
    return { kind: 'video', id: vid, title: String(sn.title || ''), channel: String(sn.channelTitle || ''), videos: [{ id: vid, title: String(sn.title || '') }] };
  }
  throw new Error("That doesn't look like a YouTube video or playlist link.");
}

/** The title of a video without any key (YouTube's public "oEmbed" answer); '' if it cannot be read. */
export async function oembedTitle(vid) {
  try { const res = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + vid)); if (!res.ok) return ''; return String((await res.json()).title || '').trim(); }
  catch (e) { return ''; }
}

/** One SoundCloud song link (soundcloud.com/<artist>/<song>, optionally with a private /s-… part); anything else gives ''. Sets and profiles are refused. */
export function scUrl(u) {
  const m = /^https:\/\/(?:www\.|m\.)?soundcloud\.com\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_%.-]+)(\/s-[A-Za-z0-9]+)?\/?(?:[?#].*)?$/.exec(String(u || '').trim());
  if (!m || ['sets', 'likes', 'reposts', 'tracks', 'albums', 'popular-tracks', 'following', 'followers'].indexOf(m[2].toLowerCase()) > -1) return '';
  return 'https://soundcloud.com/' + m[1] + '/' + m[2] + (m[3] || '');
}
/** SoundCloud's public oEmbed answer (no key): { title, artist } or null when SoundCloud cannot find the song (private, deleted, or a typo). */
export async function scInfo(url) {
  try {
    const res = await fetch('https://soundcloud.com/oembed?format=json&url=' + encodeURIComponent(url)); if (!res.ok) return null;
    const j = await res.json(), artist = String(j.author_name || '').trim(); let title = String(j.title || '').trim();
    if (artist && title.toLowerCase().endsWith(' by ' + artist.toLowerCase())) title = title.slice(0, title.length - artist.length - 4).trim();
    return { title, artist, thumb: String(j.thumbnail_url || '') };
  } catch (e) { return null; }
}

/** Settings page button: is YouTube switched on for the key? (The key is its own secret here, so it is never the one fans' phones use.) */
export async function check(env) {
  try { await api(env, 'videos', { part: 'id', id: 'dQw4w9WgXcQ' }); return { ok: true, shared: false }; }
  catch (e) { return { ok: false, message: e.message }; }
}

/** The rows whose title came from YouTube (title_src "api:<date>"): songs (video_url) and videos on release pages (url). */
export function titleRows(tracks, extras) {
  const out = [];
  (extras || []).forEach(x => { if (x.kind === 'video' && /^api:/.test(String(x.title_src || ''))) out.push({ row: x, vid: ytId(x.url), at: String(x.title_src).slice(4) }); });
  (tracks || []).forEach(t => { if (/^api:/.test(String(t.title_src || ''))) out.push({ row: t, vid: ytId(t.video_url), at: String(t.title_src).slice(4) }); });
  return out;
}
const stale = (r, cutoff) => !(new Date(r.at).getTime() >= cutoff);
export function status(rows) { const cutoff = Date.now() - REFRESH_DAYS * 864e5; return { total: rows.length, stale: rows.filter(r => stale(r, cutoff)).length }; }

/** Re-reads the titles that are due (or all, with force) and writes them into the rows. A video YouTube no longer has becomes "Video unavailable". */
export async function refresh(env, rows, force) {
  const cutoff = Date.now() - REFRESH_DAYS * 864e5;
  const due = rows.filter(r => r.vid && (force || stale(r, cutoff)));
  if (!due.length) return { checked: 0, updated: 0, gone: 0 };
  let updated = 0, gone = 0;
  for (let i = 0; i < due.length; i += 50) {
    const chunk = due.slice(i, i + 50), ids = chunk.map(r => r.vid).filter((v, k, a) => a.indexOf(v) === k);
    const d = await api(env, 'videos', { part: 'snippet', id: ids.join(','), maxResults: 50 }), fresh = {};
    (d.items || []).forEach(it => { fresh[it.id] = String(it.snippet.title || '').slice(0, 200); });
    chunk.forEach(r => {
      if (fresh[r.vid] != null) { r.row.title = fresh[r.vid]; r.row.title_src = srcTag(); updated++; }
      else { r.row.title = 'Video unavailable'; r.row.title_src = ''; gone++; }   // it can't be refreshed, so it isn't kept
    });
  }
  return { checked: due.length, updated, gone };
}

/** YouTube's length ("PT3M42S") in seconds; 0 when it has none (a live stream, a premiere that has not started). */
export function isoSeconds(d) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(d || '')); if (!m) return 0;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}
/** Seconds as the app shows song lengths: "3:42". */
export const mmss = sec => { const s = Math.round(sec); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
/** What YouTube knows about videos, so nobody has to type it: { id: { title, date: 'YYYY-MM-DD' (uploaded), seconds } }. Best effort: no key or any trouble gives {} and the song is added without it. */
export async function videoFacts(env, ids) {
  const out = {}, list = [...new Set((ids || []).filter(Boolean))];
  if (!String(env.YOUTUBE_API_KEY || '').trim()) return out;
  for (let i = 0; i < list.length; i += 50) {
    try {
      const r = await api(env, 'videos', { part: 'snippet,contentDetails', id: list.slice(i, i + 50).join(','), maxResults: 50 });
      (r.items || []).forEach(it => { const sn = it.snippet || {}; out[it.id] = { title: String(sn.title || '').trim(), date: /^\d{4}-\d{2}-\d{2}/.test(sn.publishedAt || '') ? sn.publishedAt.slice(0, 10) : '', seconds: isoSeconds((it.contentDetails || {}).duration) }; });
    } catch (e) { /* carry on without the extras */ }
  }
  return out;
}
