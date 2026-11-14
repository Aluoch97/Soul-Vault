// The Tour feed: Road to 100 numbers, the shows so far and the next show, read from Nick's public tracker sheet (and Bandsintown when its key exists).
// Public to read. Nothing here is private: it is what the tracker sheet already shows on the Tour tab.
import { csvRows, TRACKER_CSV_URL, SHOW_GOAL, TIMEZONE, getNextBandsintownShow, formatShowDate } from './newsletter.js';
import { ytId } from './youtube.js';

const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
/** "7/9/2026" (US order, 2 or 4 digit year) to "2026-07-09"; '' when it is not a real date. */
export function usDate(d) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(String(d || '').trim()); if (!m) return '';
  const y = m[3].length === 2 ? 2000 + +m[3] : +m[3], mo = +m[1], da = +m[2], t = new Date(Date.UTC(y, mo - 1, da));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === da ? t.toISOString().slice(0, 10) : '';
}
const today = now => new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

/** The sheet's rows as shows. Columns are found by their heading, so adding a column does not break it. */
export function parseTour(csv) {
  const rows = csvRows(String(csv || '')), h = rows.findIndex(r => r.some(c => c.trim().toLowerCase() === 'venue')); if (h < 0) return [];
  const head = rows[h].map(c => c.trim().toLowerCase()), col = (...names) => head.findIndex(c => names.some(n => c === n || c.startsWith(n)));
  const I = { n: col('#'), date: col('date'), venue: col('venue'), city: col('city'), type: col('show type'), done: col('completed'), len: col('show length'), state: col('state'), story: col('story'), clip: col('clip') };
  return rows.slice(h + 1).map(r => {
    const get = i => (i < 0 ? '' : String(r[i] == null ? '' : r[i]).trim()), venue = cut(get(I.venue), 120); if (!venue) return null;
    const clip = ytId(get(I.clip));
    return { n: Number(get(I.n)) || 0, date: usDate(get(I.date)), venue, city: cut(get(I.city), 80), state: cut(get(I.state), 4), type: cut(get(I.type), 140), songs: cut(get(I.len), 40),
      done: get(I.done).toUpperCase() === 'TRUE', story: cut(get(I.story), 600), clip };
  }).filter(Boolean);
}
/** The whole feed. `next` is the soonest upcoming show: a not-yet-completed row in the sheet dated today or later, else Bandsintown (needs BANDSINTOWN_APP_ID). */
export function buildTour(shows, now, bands) {
  const done = shows.filter(s => s.done), t = today(now);
  const states = [...new Set(done.map(s => s.state).filter(Boolean))], cities = new Set(done.map(s => (s.city || '').toLowerCase()).filter(Boolean));
  const up = shows.filter(s => !s.done && s.date && s.date >= t).sort((a, b) => a.date.localeCompare(b.date))[0];
  let next = null;
  if (up) next = { venue: up.venue, city: up.city, date: up.date, dateText: formatShowDate(up.date + 'T00:00:00'), type: up.type, ticketUrl: '' };
  else if (bands) next = { venue: bands.venueName, city: [bands.city, bands.region].filter(Boolean).join(', '), date: '', dateText: bands.dateFormatted, type: '', ticketUrl: bands.ticketUrl || '' };
  return { available: true, goal: SHOW_GOAL, completed: done.length, remaining: Math.max(0, SHOW_GOAL - done.length), states, cityCount: cities.size,
    shows: shows.filter(s => s.done || s.date).slice(0, 200), next };
}
export async function getTour(env, now = new Date()) {
  const memo = globalThis.__svTour;   // kept 10 minutes (one shared place, so a test can clear it)
  if (memo && now.getTime() - memo.at < 10 * 60 * 1000) return memo.data;
  try {
    const res = await fetch(TRACKER_CSV_URL, { signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined });
    if (!res.ok) throw new Error('sheet ' + res.status);
    const shows = parseTour(await res.text()); if (!shows.length) throw new Error('empty');
    const hasPlanned = shows.some(s => !s.done && s.date && s.date >= today(now));
    const data = buildTour(shows, now, hasPlanned ? null : await getNextBandsintownShow(env));
    globalThis.__svTour = { at: now.getTime(), data }; return data;
  } catch (e) { return memo ? memo.data : { available: false }; }
}
export const _resetTourCache = () => { globalThis.__svTour = null; };
