// Studio: what the owner may change, checked and cleaned on the server (the same limits Vault.gs uses), and applied to the copy in D1.
const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
export const RELEASE_TYPES = ['Album', 'Mixtape', 'EP', 'Single', 'Live', 'Compilation', 'Other'];
const ytOk = u => /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/))[A-Za-z0-9_-]{11}|^[A-Za-z0-9_-]{11}$/.test(String(u || '').trim());
const httpUrl = u => /^https?:\/\/[^\s]+$/i.test(String(u || '').trim());

export function cleanBasics(b) {
  const out = {};
  if (b.title != null) { out.title = cut(b.title, 120); if (!out.title) throw new Error('A release needs a title.'); }
  if (b.type != null) { if (RELEASE_TYPES.indexOf(b.type) < 0) throw new Error('Pick a release type from the list.'); out.type = b.type; }
  if (b.hidden != null) out.hidden = !!b.hidden;
  return out;
}
export function cleanWorld(w) {
  const color = cut(w.world_color, 7);
  if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) throw new Error('Theme color must look like #C8102E.');
  return {
    world_tagline: cut(w.world_tagline, 140), world_story: cut(w.world_story, 12000), world_color: color,
    world_mood: String(w.world_mood || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 8).join(', ').slice(0, 200),
    album_credits: cut(w.album_credits, 4000), recorded_at: cut(w.recorded_at, 140), artist_name: cut(w.artist_name, 80),
    series_name: cut(w.series_name, 80).replace(/\s+/g, ' '), series_part: cut(w.series_part, 12)
  };
}
export function cleanTrack(f) {
  const out = {};
  if (f.video_url != null) { const v = cut(f.video_url, 200); if (v && !ytOk(v)) throw new Error("That doesn't look like a YouTube link. Paste the full link from YouTube's Share button."); out.video_url = v; }
  if (f.title != null) { const t = cut(f.title, 200); if (!t) throw new Error('A song needs a title.'); out.title = t; }
  ['features', 'producer', 'engineer', 'bpm', 'key'].forEach(k => { if (f[k] != null) out[k] = cut(f[k], 200); });
  if (f.artist != null) out.artist = cut(f.artist, 120);
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

export const emptyOverlay = () => ({ releases: {}, sr: {}, flags: { releases: {}, tracks: {} }, cover: {}, primary: {} });
export const normOverlay = ov => { const o = Object.assign(emptyOverlay(), ov || {}); o.cover = o.cover || {}; o.primary = o.primary || {}; o.flags = Object.assign({ releases: {}, tracks: {} }, o.flags || {}); return o; };
export const overlayIsEmpty = ov => !Object.keys(ov.cover || {}).length && !Object.keys(ov.primary || {}).length && !Object.keys(ov.releases).length && !Object.keys(ov.sr).length && !Object.keys(ov.flags.releases).length && !Object.keys(ov.flags.tracks).length;

// Apply a saved change to the in-memory copy (the Sheet already has it).
export function patchRow(lib, table, idKey, id, fields) {
  const row = (lib[table] || []).find(r => r[idKey] === id);
  if (!row) throw new Error('Not found.');
  Object.assign(row, fields); return row;
}
