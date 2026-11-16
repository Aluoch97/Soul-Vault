// Milestones: the big moments in Nick's story (first time on the radio, first show in Nashville, first song to hit 100k streams...).
// Each one has a title, a date (a full day, a month or just a year), a few words, an optional voice note (an audio file in our own storage,
// `milestones/voice-<12 hex>.<ext>`) and an optional https link. Stored as one list in the kv table; anyone can read it, only the owner can change it.
const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(6))).map(b => b.toString(16).padStart(2, '0')).join('');
export const MAX_MILESTONES = 60;
export const AUDIO_KEY = /^milestones\/voice-[0-9a-f]{12}\.(?:mp3|m4a|aac|ogg|wav)$/;
export const AUDIO_EXTS = ['mp3', 'm4a', 'aac', 'ogg', 'wav'];
const DATE = /^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/;

export function cleanMilestones(list) {
  if (!Array.isArray(list)) throw new Error('Send the list of milestones.');
  if (list.length > MAX_MILESTONES) throw new Error('You can keep up to ' + MAX_MILESTONES + ' milestones.');
  return list.map(m => {
    m = m || {};
    const title = cut(m.title, 90); if (!title) throw new Error('Every milestone needs a title.');
    const date = cut(m.date, 10); if (date && !DATE.test(date)) throw new Error('The date for "' + title + '" must look like 2024, 2024-06 or 2024-06-15.');
    const audio = cut(m.audio, 80); if (audio && !AUDIO_KEY.test(audio)) throw new Error('The voice note for "' + title + '" is not one of yours. Add it again.');
    const url = cut(m.url, 600); if (url && !/^https:\/\/[^\s/@]+(\/[^\s]*)?$/i.test(url)) throw new Error('The link for "' + title + '" must start with https://');
    return { id: cut(m.id, 24).replace(/[^A-Za-z0-9]/g, '') || rid(), title, date, text: cut(m.text, 700), audio, audio_label: cut(m.audio_label, 60), url, url_label: cut(m.url_label, 40) };
  });
}
const kv = db => db.prepare('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)').run();
export async function getMilestones(db) {
  await kv(db);
  const r = await db.prepare("SELECT v FROM kv WHERE k = 'milestones'").first();
  try { const l = r && JSON.parse(r.v); return Array.isArray(l) ? l : []; } catch (e) { return []; }
}
export async function saveMilestones(db, list) {
  const items = cleanMilestones(list);
  await kv(db);
  await db.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES ('milestones', ?)").bind(JSON.stringify(items)).run();
  return items;
}
/** A new key for a voice note. The file itself goes to PUT /upload (which accepts <slug>/<name>.<audio ext>). */
export function planAudio(ext) {
  ext = String(ext || '').toLowerCase();
  if (AUDIO_EXTS.indexOf(ext) < 0) throw new Error('Use an MP3, M4A, AAC, OGG or WAV file.');
  return { key: 'milestones/voice-' + rid() + '.' + ext };
}
