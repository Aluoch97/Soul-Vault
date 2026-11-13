// Studio: what the owner may change, checked and cleaned on the server (the same limits Vault.gs uses), and applied to the copy in D1.
const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
export const RELEASE_TYPES = ['Album', 'Mixtape', 'EP', 'Single', 'Live', 'Compilation', 'Other'];   // what you can pick for a new release
const LEGACY_TYPES = ['Unreleased'];   // older releases saved with this type keep it (it still counts as unreleased); it is not offered any more
const ytOk = u => /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/))[A-Za-z0-9_-]{11}|^[A-Za-z0-9_-]{11}$/.test(String(u || '').trim());
const httpUrl = u => /^https?:\/\/[^\s]+$/i.test(String(u || '').trim());

export function cleanBasics(b) {
  const out = {};
  if (b.title != null) { out.title = cut(b.title, 120); if (!out.title) throw new Error('A release needs a title.'); }
  if (b.type != null) { if (RELEASE_TYPES.indexOf(b.type) < 0 && LEGACY_TYPES.indexOf(b.type) < 0) throw new Error('Pick a release type from the list.'); out.type = b.type; }
  if (b.hidden != null) out.hidden = !!b.hidden;
  return out;
}
const cleanGenre = v => { const seen = {}, out = []; String(v || '').split(',').forEach(g => { g = g.trim().replace(/\s+/g, ' ').slice(0, 40); if (g && !seen[g.toLowerCase()] && out.length < 6) { seen[g.toLowerCase()] = 1; out.push(g); } }); return out.join(', '); };
export function cleanWorld(w) {
  const color = cut(w.world_color, 7);
  if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) throw new Error('Theme color must look like #C8102E.');
  const out = {
    world_tagline: cut(w.world_tagline, 140), world_story: cut(w.world_story, 12000), world_color: color,
    world_mood: String(w.world_mood || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 8).join(', ').slice(0, 200),
    album_credits: cut(w.album_credits, 4000), recorded_at: cut(w.recorded_at, 140), artist_name: cut(w.artist_name, 80),
    series_name: cut(w.series_name, 80).replace(/\s+/g, ' '), series_part: cut(w.series_part, 12)
  };
  if (w.genre != null) out.genre = cleanGenre(w.genre);   // only when sent, so older callers do not wipe it
  return out;
}
// For "edit several releases at once": only the fields that were sent are cleaned and returned (nothing else is read or touched).
export function cleanWorldPart(w) {
  const out = {};
  if (w.world_color != null) { const c = cut(w.world_color, 7); if (c && !/^#[0-9A-Fa-f]{6}$/.test(c)) throw new Error('Theme color must look like #C8102E.'); out.world_color = c; }
  if (w.world_mood != null) out.world_mood = String(w.world_mood).split(',').map(x => x.trim()).filter(Boolean).slice(0, 8).join(', ').slice(0, 200);
  if (w.recorded_at != null) out.recorded_at = cut(w.recorded_at, 140);
  if (w.artist_name != null) out.artist_name = cut(w.artist_name, 80);
  if (w.series_name != null) out.series_name = cut(w.series_name, 80).replace(/\s+/g, ' ');
  if (w.genre != null) out.genre = cleanGenre(w.genre);
  return out;
}
export const UNREL_KINDS = ['Single', 'Album', 'EP', 'Mixtape', 'Compilation'];   // what an unreleased song is meant to be
export const FEATURE_ROLES = ['mine'];   // 'mine' = a guest spot on someone else's song (guests on your own songs are found from the title or the Features field)
export function cleanTrack(f) {
  const out = {};
  if (f.video_url != null) { const v = cut(f.video_url, 200); if (v && !ytOk(v)) throw new Error("That doesn't look like a YouTube link. Paste the full link from YouTube's Share button."); out.video_url = v; }
  if (f.title != null) { const t = cut(f.title, 200); if (!t) throw new Error('A song needs a title.'); out.title = t; }
  ['features', 'producer', 'engineer', 'bpm', 'key'].forEach(k => { if (f[k] != null) out[k] = cut(f[k], 200); });
  if (f.artist != null) out.artist = cut(f.artist, 120);
  if (f.feature_role != null) out.feature_role = FEATURE_ROLES.indexOf(f.feature_role) > -1 ? f.feature_role : '';
  if (f.unrel_kind != null) out.unrel_kind = UNREL_KINDS.indexOf(f.unrel_kind) > -1 ? f.unrel_kind : '';
  return out;
}
export function cleanLinks(o) {
  const links = [];
  (Array.isArray(o.links) ? o.links : []).slice(0, 20).forEach(l => {
    const name = cut(l && l[0], 40), url = cut(l && l[1], 500);
    if (!name && !url) return;
    if (!name) throw new Error('Each link needs a name (Spotify, Bandcamp, ...).');
    if (!httpUrl(url)) throw new Error('"' + name + '" needs a full link that starts with https://');
    links.push([name, url]);
  });
  return { first: cut(o.first, 60), links };
}
export function cleanSr(v) {
  v = cut(v, 200);
  if (v && !ytOk(v)) throw new Error("That slowed + reverb link doesn't look like a YouTube link.");
  return v;
}

export const emptyOverlay = () => ({ releases: {}, sr: {}, flags: { releases: {}, tracks: {} }, cover: {}, primary: {}, vhide: {}, show: {} });
export const normOverlay = ov => { const o = Object.assign(emptyOverlay(), ov || {}); o.cover = o.cover || {}; o.primary = o.primary || {}; o.vhide = o.vhide || {}; o.show = o.show || {}; o.flags = Object.assign({ releases: {}, tracks: {} }, o.flags || {}); return o; };
export const overlayIsEmpty = ov => !Object.keys(ov.cover || {}).length && !Object.keys(ov.primary || {}).length && !Object.keys(ov.vhide || {}).length && !Object.keys(ov.show || {}).length && !Object.keys(ov.releases).length && !Object.keys(ov.sr).length && !Object.keys(ov.flags.releases).length && !Object.keys(ov.flags.tracks).length;

// Apply a saved change to the in-memory copy (the Sheet already has it).
export function patchRow(lib, table, idKey, id, fields) {
  const row = (lib[table] || []).find(r => r[idKey] === id);
  if (!row) throw new Error('Not found.');
  Object.assign(row, fields); return row;
}
