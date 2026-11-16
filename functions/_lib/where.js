// "Where does each song play from?" for Settings > Missing files (owner only).
// For every song we look at the version that plays first and sort it into:
//   cloudflare  our own storage (the R2 bucket) really has the file
//   drive       only the old Google Drive copy exists (the app falls back to it, a little slower; it cannot be saved offline)
//   link        a YouTube or SoundCloud link, no audio file
//   none        nothing plays at all
// The bucket is asked directly (env.MEDIA.head), so the answer is what is really stored, not what the sheet says.
import { MEDIA_BASE } from './native.js';

const yes = v => v === true || v === 1 || /^(true|1|yes)$/i.test(String(v == null ? '' : v));
export const LINK_FORMATS = ['YOUTUBE', 'SOUNDCLOUD'];
/** The storage key of a version's own copy, or ''. */
export function keyOf(v) {
  const a = String(v.audio || ''), u = String(v.url || '');
  if (a.indexOf('r2:') === 0) return a.slice(3);
  if (u.indexOf(MEDIA_BASE) === 0) { try { return decodeURIComponent(u.slice(MEDIA_BASE.length)); } catch (e) { return ''; } }
  return '';
}

export async function whereSongs(all, bucket) {
  if (!bucket) throw new Error('Cloudflare storage is not connected here, so the files cannot be checked.');
  const keys = [...new Set(all.versions.map(keyOf).filter(Boolean))], there = new Map();
  for (let i = 0; i < keys.length; i += 25) {
    await Promise.all(keys.slice(i, i + 25).map(async k => { try { there.set(k, !!(await bucket.head(k))); } catch (e) { there.set(k, false); } }));
  }
  const kind = v => {
    if (LINK_FORMATS.indexOf(String(v.format || '').toUpperCase()) > -1) return 'link';
    const k = keyOf(v); if (k && there.get(k)) return 'cloudflare';
    const a = String(v.audio || ''); return a && a.indexOf('r2:') !== 0 ? 'drive' : 'none';   // a Drive id with no working copy of ours, or nothing at all
  };
  const rel = new Map(all.releases.map(r => [r.release_id, r])), byTrack = new Map();
  all.versions.forEach(v => { (byTrack.get(v.track_id) || byTrack.set(v.track_id, []).get(v.track_id)).push(v); });
  const totals = { cloudflare: 0, drive: 0, link: 0, none: 0 }, songs = [];
  all.tracks.forEach(t => {
    const r = rel.get(t.release_id); if (!r) return;
    const vs = byTrack.get(t.track_id) || [], live = vs.filter(v => !yes(v.hidden));
    const first = live.find(v => yes(v.is_primary)) || live[0] || vs[0];
    const where = first ? kind(first) : 'none', others = { cloudflare: 0, drive: 0, link: 0, none: 0 };
    vs.forEach(v => { if (v !== first) others[kind(v)]++; });
    totals[where]++;
    songs.push({ id: t.track_id, release_id: t.release_id, release: String(r.title || ''), no: Number(t.track_no) || 0, title: String(t.title || ''), hidden: yes(t.hidden) || yes(r.hidden), where, versions: vs.length, others });
  });
  songs.sort((a, b) => a.release.localeCompare(b.release) || a.no - b.no);
  return { checked_at: new Date().toISOString(), totals, songs };
}
