// The releases / songs / versions editors, ported from Vault.gs to work on the copy Cloudflare owns once the "catalog" area is switched over.
// Each function takes the owned data `ow` (ow.releases, ow.tracks, ow.versions, and ow.extras / ow.playlists when those areas are owned too)
// and returns what the Apps Script function returned, so the app needs no change.
const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const rel = (ow, id) => ow.releases.find(r => r.release_id === id);
const flag = v => v === true || String(v) === 'true';

// ── cleaners (same rules as Vault.gs) ──
export const cleanNumber = v => { const t = String(v || '').trim().replace(/[^A-Za-z0-9.\-]/g, '').slice(0, 6); return t; };   // the Sheet stores it with a leading ' ; the app strips it
export function cleanGenre(v) { const seen = {}, out = []; String(v || '').split(',').forEach(g => { g = g.trim().replace(/\s+/g, ' ').slice(0, 40); if (g && !seen[g.toLowerCase()] && out.length < 6) { seen[g.toLowerCase()] = 1; out.push(g); } }); return out.join(', '); }
const trailerId = u => { const m = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/.exec(String(u || '')); return m ? m[1] : ''; };
const jobj = v => { if (v && typeof v === 'object') return v; try { return JSON.parse(v || '{}') || {}; } catch (e) { return {}; } };
const idOk = k => /^[A-Za-z0-9_\-]{1,80}$/.test(String(k));
export function cleanChapterColors(m) { const out = {}; if (m && typeof m === 'object') Object.keys(m).slice(0, 40).forEach(k => { const name = String(k).trim().slice(0, 80), c = String(m[k] || '').trim(); if (name && /^#[0-9a-fA-F]{6}$/.test(c)) out[name] = c.toUpperCase(); }); return Object.keys(out).length ? JSON.stringify(out) : ''; }
export function cleanChapterMeta(v) {
  const m = jobj(v), out = {};
  Object.keys(m).slice(0, 40).forEach(k => {
    const name = String(k).trim().slice(0, 80), x = m[k] || {}, desc = String(x.desc || '').replace(/\r\n?/g, '\n').trim().slice(0, 1200); let trailer = String(x.trailer || '').trim().slice(0, 300);
    if (trailer && !trailerId(trailer)) throw new Error('The trailer for "' + name + '" needs to be a YouTube link.');
    if (name && (desc || trailer)) out[name] = { desc, trailer };
  });
  return Object.keys(out).length ? JSON.stringify(out) : '';
}
export function cleanVideosMeta(v) {
  const m = jobj(v), keyOk = k => /^(t|x):[A-Za-z0-9_\-]{1,80}$/.test(String(k)), order = [], seen = {};
  (m.order || []).slice(0, 200).forEach(k => { if (keyOk(k) && !seen[k]) { seen[k] = 1; order.push(String(k)); } });
  const types = {}; Object.keys(m.types || {}).slice(0, 200).forEach(k => { const t = m.types[k]; if (keyOk(k) && ['music', 'film', 'live', 'trailer', 'bts', 'skit', 'reaction', 'interview', 'podcast'].indexOf(t) > -1) types[k] = t; });
  return order.length || Object.keys(types).length ? JSON.stringify({ order, types }) : '';
}
export function cleanBgStyle(v) {
  const m = jobj(v); if (!m || typeof m !== 'object') return '';
  const n = (x, lo, hi, d) => { x = Number(x); return isFinite(x) ? Math.max(lo, Math.min(hi, Math.round(x))) : d; };
  const o = { fit: m.fit === 'contain' ? 'contain' : 'cover', x: n(m.x, 0, 100, 50), y: n(m.y, 0, 100, 50), dim: n(m.dim, 0, 100, 72) };
  return o.fit === 'cover' && o.x === 50 && o.y === 50 && o.dim === 72 ? '' : JSON.stringify(o);
}
export function cleanPhotosMeta(v) {
  const m = jobj(v), o = { order: [], cat: {}, group: {}, credits: '' }, seen = {};
  (m.order || []).slice(0, 500).forEach(k => { if (idOk(k) && !seen[k]) { seen[k] = 1; o.order.push(String(k)); } });
  Object.keys(m.cat || {}).slice(0, 500).forEach(k => { if (idOk(k) && ['cover', 'shoot', 'bts', 'social'].indexOf(m.cat[k]) > -1) o.cat[k] = m.cat[k]; });
  Object.keys(m.group || {}).slice(0, 500).forEach(k => { const g = String(m.group[k] || '').trim().slice(0, 80); if (idOk(k) && g) o.group[k] = g; });
  o.credits = String(m.credits || '').replace(/\r\n?/g, '\n').trim().slice(0, 2000);
  return o.order.length || Object.keys(o.cat).length || Object.keys(o.group).length || o.credits ? JSON.stringify(o) : '';
}
const plIds = v => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a.map(String) : []; } catch (e) { return []; } };
export function cleanPlaylistIds(v, playlists) {
  let a = v; if (typeof a === 'string') a = plIds(a); if (!Array.isArray(a)) return '';
  const known = new Set((playlists || []).map(p => p.playlist_id)), seen = new Set(), out = [];
  a.forEach(id => { id = String(id); if (known.has(id) && !seen.has(id) && out.length < 12) { seen.add(id); out.push(id); } });
  return out.length ? JSON.stringify(out) : '';
}
function validDate(d) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d); if (!m) return false; const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return dt.getUTCFullYear() === +m[1] && dt.getUTCMonth() === +m[2] - 1 && dt.getUTCDate() === +m[3] && +m[1] >= 1990 && +m[1] <= 2100; }

// ── ages (worked out here so fans never get the birthday itself) ──
const ageOn = (B, y, m, d) => { let a = y - B[0]; if (m < B[1] || (m === B[1] && d < B[2])) a--; return a; };
export function agesFor(r, birth) {
  const out = { made: '', released: '' }; if (!r || !birth || !/^\d{4}-\d{2}-\d{2}$/.test(birth)) return out;
  const B = birth.split('-').map(Number), from = r.made_from, to = r.made_to, rd = r.release_date;
  if (from || to) {
    const f = (from || to).split('-').map(Number), t = (to || from).split('-').map(Number), last = new Date(Date.UTC(t[0], t[1], 0)).getUTCDate();
    const a1 = ageOn(B, f[0], f[1], 1), a2 = ageOn(B, t[0], t[1], last);
    if (a1 >= 0 && a2 >= 0) out.made = a1 === a2 ? String(a1) : a1 + '–' + a2;
  }
  if (rd && /^\d{4}-\d{2}-\d{2}$/.test(rd)) { const R = rd.split('-').map(Number), a = ageOn(B, R[0], R[1], R[2]); if (a >= 0) out.released = String(a); }
  return out;
}

// ── editors ──
const TYPES = ['Album', 'Mixtape', 'EP', 'Single', 'Live', 'Compilation', 'Other'];
// items = the release's songs in their new order; each song's number becomes its place in the list. (Studio never calls this with a partial list.)
export function saveTracklist(ow, releaseId, releaseTitle, items, releaseHidden, releaseType, chapterMode, chapterColors, chapterMeta) {
  const byId = {}; ow.tracks.forEach(t => { byId[t.track_id] = t; });
  (items || []).forEach((it, i) => {
    const t = byId[it.track_id]; if (!t || t.release_id !== releaseId) return;
    const title = cut(it.title, 200); if (title) t.title = title;
    t.track_no = i + 1;
    if (it.hidden != null) t.hidden = !!it.hidden;
    if (it.chapter != null) t.chapter = cut(it.chapter, 80);
    if (['Main', 'Deluxe', 'B-Side'].indexOf(it.category) > -1) t.category = it.category;
    if (it.single != null) t.is_single = !!it.single;
    if (it.number != null) t.number_label = cleanNumber(it.number);
    if (it.artist != null) t.artist = cut(it.artist, 120);
    if (it.genre != null) t.genre = cleanGenre(it.genre);
    if (it.unreleased != null) t.unreleased = it.unreleased === true || it.unreleased === 'true';
    const hv = {}; (it.hiddenVersions || []).forEach(id => { hv[id] = true; });
    ow.versions.filter(v => v.track_id === t.track_id).forEach(v => { if (it.primary) v.is_primary = v.version_id === it.primary; if (it.hiddenVersions) v.hidden = !!hv[v.version_id]; });
  });
  const r = rel(ow, releaseId), tt = cut(releaseTitle, 120);
  if (r && tt) r.title = tt;
  if (r && releaseHidden != null) r.hidden = !!releaseHidden;
  if (r && releaseType && TYPES.indexOf(releaseType) > -1) r.type = releaseType;
  if (r && chapterMode === '2') r.chapter_mode = '2';
  if (r && chapterColors != null) r.chapter_colors = cleanChapterColors(chapterColors);
  if (r && chapterMeta != null) r.chapter_meta = cleanChapterMeta(chapterMeta);
  return true;
}
export function saveTrackDetails(ow, trackId, f) {
  const t = ow.tracks.find(x => x.track_id === trackId); if (!t) throw new Error('Song not found.');
  if (f && f.video_url != null) { const v = cut(f.video_url, 300); if (v && !/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/))[A-Za-z0-9_-]{11}|^[A-Za-z0-9_-]{11}$/.test(v)) throw new Error("That doesn't look like a YouTube link. Paste the full link from YouTube's Share button."); }
  if (f && f.title != null && !String(f.title).trim()) throw new Error('A song needs a title.');
  ['title', 'features', 'producer', 'engineer', 'bpm', 'key', 'notes', 'video_url', 'lyrics', 'artist'].forEach(k => {
    if (f && f[k] != null) t[k] = cut(f[k], k === 'lyrics' ? 20000 : k === 'notes' ? 2000 : k === 'artist' ? 120 : 200);
  });
  return true;
}
export function saveWorld(ow, releaseId, f, birth, playlists) {
  const r = rel(ow, releaseId); if (!r) throw new Error('Release not found.'); f = f || {};
  const color = cut(f.world_color, 7); if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) throw new Error('Theme color must look like #C8102E.');
  const vals = { world_tagline: cut(f.world_tagline, 140), world_story: cut(f.world_story, 12000), world_color: color,
    world_mood: String(f.world_mood || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 8).join(', ').slice(0, 200), album_credits: cut(f.album_credits, 4000),
    recorded_at: cut(f.recorded_at, 140), artist_name: cut(f.artist_name, 80), series_name: cut(f.series_name, 80).replace(/\s+/g, ' '), series_part: cut(f.series_part, 12) };
  ['made_from', 'made_to'].forEach(k => { if (f[k] == null) return; const m = cut(f[k], 7); if (m && !/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) throw new Error('Made from/until should be a month and year.'); vals[k] = m; });
  if (vals.made_from && vals.made_to && vals.made_from > vals.made_to) throw new Error('"Made from" should come before "Made until".');
  if (f.videos_meta != null) vals.videos_meta = cleanVideosMeta(f.videos_meta);
  if (f.bg_style != null) vals.bg_style = cleanBgStyle(f.bg_style);
  if (f.photos_meta != null) vals.photos_meta = cleanPhotosMeta(f.photos_meta);
  if (f.genre != null) vals.genre = cleanGenre(f.genre);
  if (f.playlist_ids != null) vals.playlist_ids = cleanPlaylistIds(f.playlist_ids, playlists);
  if (f.unreleased != null) vals.unreleased = f.unreleased === true || f.unreleased === 'true';
  if (f.bsides_of != null) {
    const tid = cut(f.bsides_of, 80);
    if (tid) {
      if (tid === releaseId) throw new Error("A release can't be its own B-sides.");
      const target = rel(ow, tid); if (!target) throw new Error('That release was not found.');
      if (String(target.bsides_of || '').trim()) throw new Error('"' + target.title + '" is itself B-sides of another release. Pick the main release instead.');
      if (ow.releases.some(x => String(x.bsides_of || '').trim() === releaseId)) throw new Error("Other releases are B-sides of this one, so it can't be B-sides of another.");
    }
    vals.bsides_of = tid;
  }
  if (f.release_date != null) { const d = cut(f.release_date, 10); if (d && !validDate(d)) throw new Error('Release date should be a real date.'); vals.release_date = d; }
  Object.assign(r, vals);
  if (vals.release_date) r.year = vals.release_date.slice(0, 4);
  const ages = agesFor(r, birth); r.age_made = ages.made; r.age_released = ages.released;
  vals.age_made = ages.made; vals.age_released = ages.released;
  return vals;
}
export function saveLyrics(ow, releaseId, items) {
  const byId = {}; ow.tracks.forEach(t => { byId[t.track_id] = t; }); let saved = 0;
  (items || []).forEach(it => { const t = byId[it && it.track_id]; if (!t || t.release_id !== releaseId) return; t.lyrics = String(it.lyrics || '').replace(/\r\n?/g, '\n').trim().slice(0, 20000); saved++; });
  return saved;
}
export function saveUnlock(ow, releaseId, iso) {
  const r = rel(ow, releaseId); if (!r) throw new Error('Release not found.');
  let v = ''; if (iso) { const d = new Date(iso); if (isNaN(d)) throw new Error('That unlock date could not be read.'); v = d.toISOString(); }
  r.unlock_at = v; return v;
}
export function saveVideosMeta(ow, releaseId, meta) { const r = rel(ow, releaseId); if (!r) throw new Error('Release not found.'); r.videos_meta = cleanVideosMeta(meta); return r.videos_meta; }
export function updateVersion(ow, versionId, o) {
  o = o || {}; const v = ow.versions.find(x => x.version_id === versionId); if (!v) throw new Error('That version was not found. It may have been deleted.');
  if (o.fileId) throw new Error("Replacing the audio of a version isn't available yet. Add it as a new version in Studio instead.");
  if (o.label != null) { const label = cut(o.label, 60); if (!label) throw new Error('Give the version a name.'); v.label = label; }
  if (o.primary) ow.versions.forEach(x => { if (x.track_id === v.track_id) x.is_primary = x.version_id === versionId; });
  return v;
}
export function setDuration(ow, versionId, seconds) {
  seconds = Number(seconds); if (!(seconds > 0 && seconds < 3 * 3600)) throw new Error('That length does not look right.');
  const v = ow.versions.find(x => x.version_id === versionId); if (!v) throw new Error('Version not found.');
  if (String(v.duration || '').trim()) return v.duration;
  const s = Math.round(seconds); v.duration = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); return v.duration;
}
// ── deleting ──
function dropTracks(ow, ids) {
  const set = new Set(ids), vers = ow.versions.filter(v => set.has(v.track_id));
  ow.versions = ow.versions.filter(v => !set.has(v.track_id)); ow.tracks = ow.tracks.filter(t => !set.has(t.track_id));
  (ow.playlists || []).forEach(p => { p.tracks = (p.tracks || []).filter(t => !set.has(t)); });
  return vers.length;
}
function renumber(ow, releaseId) { ow.tracks.filter(t => t.release_id === releaseId).sort((a, b) => (Number(a.track_no) || 0) - (Number(b.track_no) || 0)).forEach((t, i) => { t.track_no = i + 1; }); }
export function deleteTrack(ow, trackId) {
  const t = ow.tracks.find(x => x.track_id === trackId); if (!t) throw new Error('That song was not found. It may already be deleted.');
  dropTracks(ow, [trackId]); renumber(ow, t.release_id); return { deleted: trackId, title: String(t.title || '') };
}
export function deleteVersion(ow, versionId) {
  const v = ow.versions.find(x => x.version_id === versionId); if (!v) throw new Error('That version was not found. It may already be deleted.');
  const sibs = ow.versions.filter(x => x.track_id === v.track_id && x.version_id !== versionId);
  if (!sibs.length) throw new Error("This is the song's only version. Delete the whole song instead.");
  if (flag(v.is_primary)) sibs[0].is_primary = true;
  ow.versions = ow.versions.filter(x => x.version_id !== versionId); return { deleted: versionId };
}
export function deleteRelease(ow, releaseId, confirmTitle) {
  const r = rel(ow, releaseId); if (!r) throw new Error('That release was not found. It may already be deleted.');
  if (String(confirmTitle || '').trim().toLowerCase() !== String(r.title || '').trim().toLowerCase()) throw new Error('Type the release name exactly to confirm.');
  const ids = ow.tracks.filter(t => t.release_id === releaseId).map(t => t.track_id); dropTracks(ow, ids);
  if (ow.extras) ow.extras = ow.extras.filter(x => x.release_id !== releaseId);
  ow.releases.forEach(x => { if (String(x.bsides_of || '') === releaseId) x.bsides_of = ''; });
  ow.releases = ow.releases.filter(x => x.release_id !== releaseId);
  return { deleted: releaseId, title: String(r.title || ''), tracks: ids.length, backedUp: false };
}
