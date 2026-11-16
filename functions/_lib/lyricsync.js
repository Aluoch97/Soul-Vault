/* Suggested lyric timings (Nov 2026).
   Workers AI (Whisper) listens to the song and returns the words it heard with times. We already have the real lyrics, so this file lines the two up:
   every lyric line gets the time of the first of its words that was heard. Lines it could not find are placed between their neighbours.
   Pure functions, no network: tests/lyricsync.test.mjs runs them with made-up "heard" words. */

const LRC_TAG = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

/** The lines the sync screen taps through: same rule as plainLyrics() + startSync() in the app, so the saved LRC lines up with what the app shows. */
export function lyricLines(text) {
  return String(text || '').split('\n').filter(l => !/^\s*\[[a-z]+:[^\]]*\]\s*$/i.test(l)).map(l => l.replace(LRC_TAG, '').trimEnd()).map(s => s.trim()).filter(Boolean);
}

/** One comparable word: lower case, no accents, no punctuation. "Don't" and "dont" are the same word. */
export function normWord(w) {
  return String(w || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** A line's spoken words. A line that is only a section label in brackets ("[Hook]", "(Verse 2)") has none: nobody sings it. */
function wordsOfLine(line) {
  if (/^\s*[\[(][^\])]*[\])]\s*$/.test(line)) return [];
  return line.replace(/[\[(][^\])]*[\])]/g, ' ').split(/\s+/).map(normWord).filter(Boolean);
}

/** Pulls [{w, t}] (a normalised word and the second it starts) out of whatever Whisper returned: word times if there are any, else segment times spread over the segment. */
export function heardWords(out) {
  const r = out && out.result ? out.result : (out || {}), list = [];
  const push = (word, t) => { const w = normWord(word); if (w && Number.isFinite(t)) list.push({ w, t }); };
  const segs = Array.isArray(r.segments) ? r.segments : [];
  let any = false;
  for (const s of segs) if (Array.isArray(s.words)) for (const x of s.words) { any = true; push(x.word != null ? x.word : x.text, Number(x.start)); }
  if (!any && Array.isArray(r.words)) for (const x of r.words) { any = true; push(x.word != null ? x.word : x.text, Number(x.start)); }
  if (any) return list.sort((a, b) => a.t - b.t);
  for (const s of segs) {   // no word times: spread each segment's words evenly between its start and end
    const ws = String(s.text || '').split(/\s+/).filter(Boolean), a = Number(s.start), b = Number.isFinite(Number(s.end)) ? Number(s.end) : a;
    ws.forEach((w, i) => push(w, a + (b - a) * (i / Math.max(1, ws.length))));
  }
  return list;
}

function editDistance(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
/** How well two words match: 2 same, 1 close ("gonna" / "gona"), -1 different. */
function score(a, b) {
  if (a === b) return 2;
  if (a.length < 3 || b.length < 3) return -1;
  const d = editDistance(a, b), longest = Math.max(a.length, b.length);
  return d / longest <= 0.34 ? 1 : -1;
}

/** Lines up the lyric words with the heard words (a global alignment: order is kept, either side may skip words).
    Returns { times: [seconds per line], matched, total, lines: [{ matched, words }] }, or null when almost nothing matched. */
export function alignLyrics(lines, heard) {
  const per = lines.map(wordsOfLine), L = [], lineOf = [];
  per.forEach((ws, i) => ws.forEach(w => { L.push(w); lineOf.push(i); }));
  const n = L.length, m = heard.length;
  if (!n || !m) return null;
  const GAP = -1, W = m + 1, dp = new Int32Array((n + 1) * W), tb = new Uint8Array((n + 1) * W);   // tb: 1 diagonal, 2 skip a lyric word, 3 skip a heard word
  for (let i = 1; i <= n; i++) { dp[i * W] = i * GAP; tb[i * W] = 2; }
  for (let j = 1; j <= m; j++) { dp[j] = j * GAP; tb[j] = 3; }
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const diag = dp[(i - 1) * W + j - 1] + score(L[i - 1], heard[j - 1].w), up = dp[(i - 1) * W + j] + GAP, left = dp[i * W + j - 1] + GAP;
    let best = diag, how = 1; if (up > best) { best = up; how = 2; } if (left > best) { best = left; how = 3; }
    dp[i * W + j] = best; tb[i * W + j] = how;
  }
  const at = new Array(n).fill(-1);   // for each lyric word: index of the heard word it landed on (only counted when the words really match)
  for (let i = n, j = m; i > 0 || j > 0;) {
    const how = tb[i * W + j];
    if (i > 0 && j > 0 && how === 1) { if (score(L[i - 1], heard[j - 1].w) > 0) at[i - 1] = j - 1; i--; j--; }
    else if (i > 0 && (how === 2 || j === 0)) i--; else j--;
  }
  const stats = per.map(ws => ({ words: ws.length, matched: 0 })), first = new Array(lines.length).fill(null), last = new Array(lines.length).fill(null);
  let matched = 0;
  at.forEach((h, k) => {
    if (h < 0) return; matched++;
    const li = lineOf[k]; stats[li].matched++;
    const t = heard[h].t; if (first[li] === null || t < first[li]) first[li] = t;
    if (last[li] === null || t > last[li]) last[li] = t;
  });
  if (matched < Math.max(3, Math.round(n * 0.2))) return null;   // under a fifth matched: the song was not really heard, so do not pretend
  // lines with no heard word (and bracket-only section labels): put them between their neighbours, spread by how many words each has
  const times = first.slice();
  for (let i = 0; i < times.length; i++) {
    if (times[i] !== null) continue;
    let a = i - 1; while (a >= 0 && times[a] === null) a--;
    let b = i + 1; while (b < times.length && first[b] === null) b++;
    let t0 = a >= 0 ? (last[a] !== null ? last[a] + 0.6 : times[a]) : 0; const t1x = b < times.length ? first[b] : null; if (t1x !== null && t0 > t1x) t0 = times[a];   // a gap starts where the line before it stopped being sung
    const t1 = b < times.length ? first[b] : (a >= 0 ? times[a] + 4 * (i - a) : 0);
    const gap = []; for (let k = a + 1; k < (b < times.length ? b : times.length); k++) gap.push(Math.max(1, per[k].length));
    const total = gap.reduce((x, y) => x + y, 0); let before = 0; for (let k = a + 1; k < i; k++) before += Math.max(1, per[k].length);
    times[i] = a < 0 && b >= times.length ? 0 : t0 + (t1 - t0) * (before / Math.max(1, total));
  }
  for (let i = 1; i < times.length; i++) if (times[i] < times[i - 1]) times[i] = times[i - 1];   // never go backwards
  return { times: times.map(t => Math.max(0, Math.round(t * 100) / 100)), matched, total: n, lines: stats };
}

/** Writes the times and lines as synced lyrics ([mm:ss.xx] text), the same format the sync screen saves. */
export function toLrc(lines, times) {
  const f = t => { const m = Math.floor(t / 60), s = t - m * 60; return '[' + String(m).padStart(2, '0') + ':' + s.toFixed(2).padStart(5, '0') + ']'; };
  return lines.map((l, i) => f(times[i]) + l).join('\n');
}
