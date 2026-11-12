// Things created in the new backend (new songs, releases, photos) live only here, in D1 (`kv` key `native`), never in the Sheet.
// The 5-minute copy of the Sheet only replaces the Sheet's own rows; these are added on top, so a refresh never loses them.
export const MEDIA_BASE = 'https://media.soulnicolas.com/';
export const emptyNative = () => ({ releases: [], tracks: [], versions: [], extras: [] });
export const normNative = n => Object.assign(emptyNative(), n || {});

export async function loadNative(db) {
  try { const r = await db.prepare("SELECT v FROM kv WHERE k = 'native'").first(); return normNative(r ? JSON.parse(r.v) : null); } catch (e) { return emptyNative(); }
}
export async function saveNative(db, n) {
  await db.prepare('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)').run();
  await db.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES ('native', ?)").bind(JSON.stringify(n)).run();
}

// Sheet rows first, then ours (a native row is skipped if the Sheet somehow has the same id).
export function mergeNative(lib, n, ov) {
  const out = Object.assign({}, lib);
  const add = (name, key) => { const have = new Set((lib[name] || []).map(r => r[key])); out[name] = (lib[name] || []).concat((n[name] || []).filter(r => !have.has(r[key]))); };
  add('releases', 'release_id'); add('tracks', 'track_id'); add('versions', 'version_id'); add('extras', 'extra_id');
  if (ov) {   // Studio overrides for Sheet rows: a new cover, a different "plays first" version
    if (ov.cover && Object.keys(ov.cover).length) out.releases = out.releases.map(r => ov.cover[r.release_id] ? Object.assign({}, r, { cover_file_id: ov.cover[r.release_id], cover_thumb: '' }) : r);
    if (ov.primary && Object.keys(ov.primary).length) out.versions = out.versions.map(v => ov.primary[v.track_id] ? Object.assign({}, v, { is_primary: v.version_id === ov.primary[v.track_id] }) : v);
  }
  return out;
}

export const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(6))).map(b => b.toString(16).padStart(2, '0')).join('');
export const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'track';
export const relSlug = id => String(id).replace(/^rel_/, '').replace(/_/g, '-');
export const fmtDur = sec => { sec = Math.max(0, Math.round(Number(sec) || 0)); return sec ? Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0') : ''; };

export function newRelease(o) {
  const year = String(o.year || new Date().getFullYear()).slice(0, 4);
  const id = 'rel_' + year + '_' + slug(o.title).replace(/-/g, '_') + '_' + rid().slice(0, 4);
  return { release_id: id, title: o.title, year, type: o.type, cover_file_id: o.coverId || '', cover_thumb: '', world_tagline: '', world_story: '', world_color: '', world_mood: '', album_credits: '',
    cover_type: '', release_date: o.release_date || '', recorded_at: '', artist_name: o.artist_name || '', age_made: '', age_released: '', bg_file_id: '', chapter_mode: '', series_name: '', series_part: '',
    chapter_colors: '', videos_meta: '', bg_style: '', photos_meta: '', chapter_meta: '', genre: '', bsides_of: '', clean_cover_file_id: '', clean_cover_thumb: '', playlist_ids: '', unreleased: false,
    extra_covers: '', unlock_at: '', hidden: true, status: '', notes: '', native: true };   // starts hidden from fans until you un-hide it in Studio
}
export function newTrack(relId, no, title) {
  return { track_id: 'trk_' + rid(), release_id: relId, track_no: no, title, category: 'Main', features: '', bpm: '', key: '', notes: '', artist: '', hidden: false, producer: '', engineer: '',
    video_url: '', lyrics: '', voice_note_id: '', chapter: '', is_single: false, track_cover: '', number_label: '', genre: '', unreleased: false, native: true };
}
export function newVersion(trackId, label, primary, key, ext, sizeBytes, seconds) {
  return { version_id: 'ver_' + rid(), track_id: trackId, label, is_primary: !!primary, audio: 'r2:' + key, preview: '', format: String(ext).toUpperCase(), duration: fmtDur(seconds), specs: '',
    size_mb: Math.round(sizeBytes / 1048576 * 10) / 10, hidden: false, url: MEDIA_BASE + key.split('/').map(encodeURIComponent).join('/'), native: true };
}
