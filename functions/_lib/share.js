// The read side of the backend, moved from Apps Script (Vault.gs: findShare_, shareScope_, shareBody_, playlistsFor_, extrasFor_).
// `lib` is the library snapshot copied from Apps Script (its getLibrary answer); everything here is plain data in, plain data out.

export const ERR_LINK = 'This link has expired or been turned off. Ask the person who sent it for a new one.';

export function liveShare(s, now) {
  if (!s || s.active !== true) return false;
  if (s.expires && new Date(s.expires) < now) return false;
  return true;
}
export function findShare(lib, token, now) {
  if (!token) return null;
  const s = (lib.shares || []).filter(r => r.token === token)[0];
  return liveShare(s, now) ? s : null;
}
export function isLocked(r, now) {
  if (!r.unlock_at) return false;
  const t = new Date(r.unlock_at);
  return !isNaN(t) && t > now;
}
const flag = v => v === true || String(v) === 'true';

export function shareScope(s, lib, now) {
  let tracks = [], versions = [];
  const locked = [];
  if (s.target_type === 'all') {
    const ok = {};
    (lib.releases || []).forEach(r => {
      if (r.hidden === true) return;
      if (isLocked(r, now)) locked.push(r); else ok[r.release_id] = true;
    });
    tracks = (lib.tracks || []).filter(t => ok[t.release_id]);
  } else if (s.target_type === 'release') {
    tracks = (lib.tracks || []).filter(t => t.release_id === s.target_id);
  } else if (s.target_type === 'track') {
    tracks = (lib.tracks || []).filter(t => t.track_id === s.target_id);
  } else if (s.target_type === 'version') {
    versions = (lib.versions || []).filter(v => v.version_id === s.target_id);
    const tid = versions[0] && versions[0].track_id;
    tracks = (lib.tracks || []).filter(t => t.track_id === tid);
  }
  tracks = tracks.filter(t => t.hidden !== true);
  if (s.target_type !== 'version') {
    const ids = {};
    tracks.forEach(t => { ids[t.track_id] = true; });
    versions = (lib.versions || []).filter(v => ids[v.track_id]);
  }
  versions = versions.filter(v => v.hidden !== true);
  const relIds = {};
  tracks.forEach(t => { relIds[t.release_id] = true; });
  return { releases: (lib.releases || []).filter(r => relIds[r.release_id]), tracks, versions, locked };
}

function relOut(r, isLockedRel, ov) {
  const strip = v => String(v || '').replace(/^'/, '');
  return {
    release_id: r.release_id, title: r.title, year: r.year, type: r.type, cover_file_id: r.cover_file_id,
    cover_thumb: r.cover_thumb || '', world_tagline: r.world_tagline || '', world_story: r.world_story || '',
    world_color: r.world_color || '', world_mood: r.world_mood || '',
    album_credits: isLockedRel ? '' : (r.album_credits || ''), cover_type: r.cover_type || '',
    release_date: r.release_date || '', recorded_at: r.recorded_at || '', artist_name: r.artist_name || '',
    age_made: r.age_made || '', age_released: r.age_released || '', bg_file_id: isLockedRel ? '' : (r.bg_file_id || ''),
    chapter_mode: strip(r.chapter_mode),
    series_name: r.series_name || '', series_part: strip(r.series_part),
    chapter_colors: r.chapter_colors || '', videos_meta: r.videos_meta || '', bg_style: r.bg_style || '',
    photos_meta: r.photos_meta || '', chapter_meta: r.chapter_meta || '', genre: r.genre || '', bsides_of: r.bsides_of || '',
    clean_cover_file_id: isLockedRel ? '' : (r.clean_cover_file_id || ''), clean_cover_thumb: isLockedRel ? '' : (r.clean_cover_thumb || ''),
    playlist_ids: isLockedRel ? '' : (r.playlist_ids || ''), unreleased: ov && r.release_id in ov.flags.releases ? !!ov.flags.releases[r.release_id] : flag(r.unreleased), extra_covers: isLockedRel ? '' : (r.extra_covers || ''),
    unlock_at: isLockedRel ? new Date(r.unlock_at).toISOString() : '', locked: !!isLockedRel
  };
}

function playlistsFor(lib, allowed) {
  return (lib.playlists || []).filter(p => !allowed || p.fans)
    .map(p => Object.assign({}, p, allowed ? { tracks: (p.tracks || []).filter(t => allowed[t]) } : {}))
    .filter(p => !allowed || p.tracks.length);
}

// The part that is the same for everyone with the same kind of link (cached); the per-link `share` block is added after.
export function shareBody(s, lib, now, ov) {
  const sc = shareScope(s, lib, now);
  const relIds = {}; sc.releases.forEach(r => { relIds[r.release_id] = true; });
  const allowed = {}; sc.tracks.forEach(t => { allowed[t.track_id] = true; });
  return {
    releases: sc.releases.map(r => relOut(r, false, ov)).concat((sc.locked || []).map(r => relOut(r, true, ov))),
    tracks: sc.tracks.map(t => ({
      track_id: t.track_id, release_id: t.release_id, track_no: t.track_no, title: t.title, artist: t.artist || '',
      features: t.features || '', producer: t.producer || '', engineer: t.engineer || '', bpm: t.bpm || '', key: t.key || '',
      video_url: t.video_url || '', lyrics: t.lyrics || '', voice_note_id: t.voice_note_id || '', chapter: t.chapter || '',
      category: t.category || 'Main', is_single: t.is_single === true,
      track_cover: t.track_cover || '',
      number_label: String(t.number_label || '').replace(/^'/, ''), genre: t.genre || '',
      unreleased: ov && t.track_id in ov.flags.tracks ? !!ov.flags.tracks[t.track_id] : flag(t.unreleased)
    })),
    versions: sc.versions,
    shares: [],
    letter: lib.letter || null, newsletter: lib.newsletter || '',
    extras: (lib.extras || []).filter(x => relIds[x.release_id]),
    stream_key: lib.stream_key || '', artist_links: lib.artist_links || {}, playlists: playlistsFor(lib, allowed),
    artist_bio: s.target_type === 'all' ? (lib.artist_bio || '') : ''
  };
  // (the overlay is added by the caller when it has anything in it)
}

// Seconds the built body may be kept: never past the moment a sealed release unlocks.
export function bodyTtl(body, now, base) {
  let ttl = base;
  (body.releases || []).forEach(r => { if (r.locked && r.unlock_at) ttl = Math.min(ttl, Math.max(5, Math.ceil((new Date(r.unlock_at) - now) / 1000))); });
  return ttl;
}

export function shareBlock(s) {
  return { target_type: s.target_type, allow_download: s.allow_download === true, fan_name: s.fan_name || '', member_no: Number(s.member_no) || 0, created: s.created || '' };
}

// The Studio-only extras (listen links, slowed + reverb videos, unreleased flags) for the releases and songs a link can see.
export function overlayFor(body, ov) {
  const rel = {}, sr = {}, ids = {}, tr = {};
  body.releases.forEach(r => { ids[r.release_id] = 1; if (ov.releases[r.release_id]) rel[r.release_id] = ov.releases[r.release_id]; });
  body.tracks.forEach(t => { tr[t.track_id] = 1; if (ov.sr[t.track_id]) sr[t.track_id] = ov.sr[t.track_id]; });
  return { releases: rel, sr };
}
