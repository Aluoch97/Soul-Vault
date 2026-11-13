// "Inside the Tribe" newsletter, moved from the old soulMATES Google script (Apps Script) to the edge.
// Same rules as the old script (tests/newsletter.test.mjs runs the real old functions next to these and compares):
//   - sends on the 1st and 3rd Friday of the month, from 9 AM Central, once per day
//   - content = your newest YouTube video + your next Bandsintown show (either can be missing); or a hand-written subject + body
//   - the same two e-mail layouts, the same unsubscribe link and the same three "what did you think?" survey links, signed so they can't be changed
// Differences on purpose: it sends through Resend (not Gmail), every fan is its own message, a day is only marked "sent" when at least one
// message really went out, the show count comes from the public Road to 100 sheet, and links point at /news on this site.

export const SITE = 'https://soulnicolas.com';
export const TIMEZONE = 'America/Chicago';
export const SEND_HOUR = 9;
export const SEND_WEEKS_OF_MONTH = [1, 3];
export const YOUTUBE_CHANNEL_ID = 'UCbmmYh6O9kaXltKu5pazb6g';
export const BANDSINTOWN_ARTIST_ID = '15507350';
export const ROAD_TO_100_PLAYLIST_URL = 'https://www.youtube.com/playlist?list=PLdjhXdodmUqM';
export const TRACKER_CSV_URL = 'https://docs.google.com/spreadsheets/d/1d_H_nsgxQml0_CUNh7Q0XLO8-jplXMpIbirIBjhHK2E/export?format=csv';
export const SHOW_GOAL = 100;
export const NOTIFY_EMAIL = 'nurrenaissance@gmail.com';
export const DAILY_CAP = 90;   // Resend's free tier is 100 a day, shared with the other apps
export const MAILING_ADDRESS = 'NuRenaissance Media, 14919 Lebanon Rd, Old Hickory, TN 37138';

import { ensureFans } from './fans.js';

// ---------------------------------------------------------------- tables
const DDL = ['CREATE TABLE IF NOT EXISTS news_sends (day TEXT PRIMARY KEY, subject TEXT, sent INTEGER, total INTEGER, mode TEXT, at INTEGER)',
  'CREATE TABLE IF NOT EXISTS news_survey (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, email TEXT, video TEXT, response TEXT)'];
export const ensureNews = db => db.batch(DDL.map(s => db.prepare(s)));

// ---------------------------------------------------------------- signed links
const enc = s => new TextEncoder().encode(String(s));
async function hmac16(secret, raw) {
  const key = await crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc(raw)));
  return Array.from(sig).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}
export const unsubToken = (secret, email) => hmac16(secret, String(email).toLowerCase());
export const surveyToken = (secret, email, video, response) => hmac16(secret, String(email).toLowerCase() + '|' + String(video) + '|' + String(response));
export function sameText(a, b) {   // no early exit, so the time taken says nothing about how much matched
  a = String(a || ''); b = String(b || ''); let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
export const unsubUrl = async (secret, email, base) => (base || SITE) + '/news?unsub=' + encodeURIComponent(email) + '&token=' + await unsubToken(secret, email);
export const surveyUrl = async (secret, email, video, response, base) =>
  (base || SITE) + '/news?survey=' + encodeURIComponent(response) + '&video=' + encodeURIComponent(video) + '&email=' + encodeURIComponent(email) + '&token=' + await surveyToken(secret, email, video, response);
/** every link one fan's e-mail needs */
export async function linksFor(secret, email, video, base) {
  const survey = {};
  if (video) for (const k of ['loved', 'liked', 'meh']) survey[k] = await surveyUrl(secret, email, video.url, k, base);
  return { unsub: await unsubUrl(secret, email, base), survey };
}

// ---------------------------------------------------------------- the calendar (Central time)
export function localParts(date, tz) {
  const p = {}; for (const x of new Intl.DateTimeFormat('en-US', { timeZone: tz || TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(date)) p[x.type] = x.value;
  return { ymd: p.year + '-' + p.month + '-' + p.day, day: Number(p.day), hour: Number(p.hour), friday: p.weekday === 'Fri' };
}
/** 1st and 3rd Friday of the month (Central time) */
export function isScheduledSendDay(date) {
  const l = localParts(date);
  return l.friday && SEND_WEEKS_OF_MONTH.indexOf(Math.ceil(l.day / 7)) !== -1;
}

// ---------------------------------------------------------------- the e-mails (layouts copied from the old script)
export function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function marks() {
  let m = '';
  for (let i = 0; i < 16; i++) { const color = i % 2 === 0 ? '#e8392e' : '#00a82a'; const glyph = i % 2 === 0 ? '▲' : '▽'; m += '<span style="color:' + color + ';">' + glyph + '</span> '; }
  return m;
}
export function buildTrimLine(marginStyle) { return '<p style="text-align:center; font-size:10px; line-height:1; margin:' + marginStyle + ';">' + marks() + '</p>'; }
export function buildTrimRow() { return '<tr><td align="center" style="padding:14px 0; font-size:10px; line-height:1;">' + marks() + '</td></tr>'; }

/** A hand-written draft: plain, text-based. Your own words go in as typed (links and bold work); only you can write a draft. The links we make are already encoded. */
export function buildPlainEmailHtml(bodyText, firstName, links) {
  const greetingName = firstName ? firstName : 'there';
  const paragraphs = bodyText.split(/\n\s*\n/).map(p => '<p style="margin:0 0 16px;">' + p.replace(/\n/g, '<br>') + '</p>').join('');
  return '' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f7f1e3" style="background-color:#f7f1e3; padding:32px 0;">' +
    '<tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background-color:#f7f1e3;">' +
    '<tr><td style="padding:0 20px; font-family:Georgia, serif; color:#241c12; line-height:1.6;">' +
    buildTrimLine('0 0 20px') +
    '<p style="font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:#a8241c; margin:0 0 16px;">Inside the Tribe</p>' +
    '<p style="margin:0 0 20px;">Hey ' + escapeHtml(greetingName) + ',</p>' +
    paragraphs +
    '<p style="font-style:italic; font-size:12px; color:#6f6349; margin:24px 0 0;">An Ja Karachuonyo Kokoth</p>' +
    '<p style="margin:16px 0 0; font-size:13px; color:#6f6349; border-top:1px solid #ddd0b0; padding-top:16px;">Sent with love from Nicólas Soul. ' +
    '<a href="' + links.unsub + '" style="color:#6f6349;">Unsubscribe</a></p>' +
    '<p style="margin:6px 0 0; font-size:11px; color:#6f6349;">' + MAILING_ADDRESS + '</p>' +
    buildTrimLine('20px 0 0') +
    '</td></tr>' +
    '</table></td></tr></table>';
}

/** The normal send: newest video (with its thumbnail) and next show. */
export function buildAutoEmailHtml(video, show, firstName, links, isNear, showCount) {
  const greetingName = escapeHtml(firstName ? firstName : 'there');
  const unsub = links.unsub;
  const bg = '#f7f1e3', card = '#efe3c8', red = '#a8241c', redButton = '#b81f14', green = '#1f6b2f', ink = '#241c12', inkMuted = '#5c5040', line = '#ddd0b0', footerMuted = '#6f6349';

  let videoBlock = '';
  if (video) {
    const thumb = video.thumbnailUrl
      ? '<a href="' + escapeHtml(video.url) + '" style="text-decoration:none;">' +
        '<img src="' + video.thumbnailUrl + '" alt="' + escapeHtml(video.title) + '" width="544" ' +
        'style="display:block; width:100%; max-width:544px; height:auto; border-radius:4px; border:0;">' +
        '</a>'
      : '';
    const surveyOptions = [{ key: 'loved', label: '🔥 Loved it' }, { key: 'liked', label: '🙂 Pretty good' }, { key: 'meh', label: '😐 Not my favorite' }];
    const surveyLinks = surveyOptions.map(opt =>
      '<a href="' + links.survey[opt.key] + '" style="display:inline-block; margin:0 8px 8px 0; padding:8px 14px; border:1px solid ' + line + '; border-radius:999px; color:' + ink + '; font-family:Georgia, serif; font-size:13px; text-decoration:none;">' + opt.label + '</a>').join('');
    videoBlock =
      '<tr><td style="padding:0 28px 24px;">' +
      thumb +
      '<p style="font-family:Georgia, serif; font-size:17px; color:' + ink + '; margin:16px 0 4px; line-height:1.4;">My newest video is up.</p>' +
      '<p style="font-family:Georgia, serif; font-size:15px; color:' + inkMuted + '; margin:0 0 16px; line-height:1.5;">&ldquo;' + escapeHtml(video.title) + '&rdquo;</p>' +
      '<a href="' + escapeHtml(video.url) + '" style="display:inline-block; background-color:' + redButton + '; color:#ffffff; font-family:Georgia, serif; font-size:14px; text-decoration:none; padding:12px 22px; border-radius:999px;">Watch on YouTube</a>' +
      '<p style="font-family:Georgia, serif; font-size:14px; color:' + ink + '; margin:22px 0 8px;">What did you think of it?</p>' +
      '<p style="margin:0;">' + surveyLinks + '</p>' +
      '</td></tr>';
  }

  let showBlock = '';
  if (show) {
    const location = escapeHtml(show.city + (show.region ? ', ' + show.region : ''));
    const ticketLink = show.ticketUrl
      ? '<a href="' + escapeHtml(show.ticketUrl) + '" style="display:inline-block; background-color:transparent; border:1px solid ' + ink + '; color:' + ink + '; font-family:Georgia, serif; font-size:14px; text-decoration:none; padding:11px 22px; border-radius:999px;">Get Tickets</a>'
      : '';
    const labelColor = isNear ? redButton : green;
    const labelText = isNear ? 'A Show Near You' : 'Upcoming Show';
    const progressLine = showCount
      ? '<p style="font-family:Georgia, serif; font-size:13px; color:' + inkMuted + '; margin:0 0 6px;">' + showCount.completed + ' shows down on the #ROADTO100SHOWS run' + (showCount.remaining !== null ? ', ' + showCount.remaining + ' to go.' : '.') + '</p>' +
        '<a href="' + ROAD_TO_100_PLAYLIST_URL + '" style="font-family:Georgia, serif; font-size:13px; color:' + inkMuted + '; text-decoration:underline;">Watch the journey so far</a><br><br>'
      : '';
    showBlock =
      '<tr><td style="padding:0 28px 28px;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:' + card + '; border-left:3px solid ' + labelColor + '; border-radius:4px;">' +
      '<tr><td style="padding:20px 22px;">' +
      '<p style="font-family:Georgia, serif; font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:' + labelColor + '; margin:0 0 10px;">' + labelText + '</p>' +
      '<p style="font-family:Georgia, serif; font-size:18px; color:' + ink + '; margin:0 0 4px; line-height:1.4;">' + escapeHtml(show.venueName) + '</p>' +
      '<p style="font-family:Georgia, serif; font-size:14px; color:' + inkMuted + '; margin:0 0 16px;">' + location + ' &middot; ' + escapeHtml(show.dateFormatted) + '</p>' +
      progressLine +
      ticketLink +
      '</td></tr></table></td></tr>';
  }

  return '' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="' + bg + '" style="background-color:' + bg + '; padding:32px 0;">' +
    '<tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; background-color:' + bg + ';">' +
    buildTrimRow() +
    '<tr><td style="padding:0 28px 8px;">' +
    '<p style="font-family:Georgia, serif; font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:' + red + '; margin:0;">Inside the Tribe</p>' +
    '</td></tr>' +
    '<tr><td style="padding:0 28px 20px;">' +
    '<p style="font-family:Georgia, serif; font-size:17px; color:' + ink + '; margin:0; line-height:1.5;">Hey ' + greetingName + ',</p>' +
    '</td></tr>' +
    videoBlock +
    showBlock +
    '<tr><td style="padding:8px 28px 0;">' +
    '<p style="font-family:Georgia, serif; font-size:14px; color:' + ink + '; margin:0 0 8px; line-height:1.6;">Thanks for riding with me. I\'ll see some of you out there.<br>Nicólas</p>' +
    '<p style="font-family:Georgia, serif; font-style:italic; font-size:12px; color:' + inkMuted + '; margin:0 0 24px;">An Ja Karachuonyo Kokoth</p>' +
    '</td></tr>' +
    '<tr><td style="padding:20px 28px 0; border-top:1px solid ' + line + ';">' +
    '<p style="font-family:Georgia, serif; font-size:12px; color:' + footerMuted + '; margin:16px 0 0;">Sent with love from Nicólas Soul. <a href="' + unsub + '" style="color:' + footerMuted + ';">Unsubscribe</a></p>' +
    '<p style="font-family:Georgia, serif; font-size:11px; color:' + footerMuted + '; margin:6px 0 0;">' + MAILING_ADDRESS + '</p>' +
    '</td></tr>' +
    buildTrimRow() +
    '</table></td></tr></table>';
}

/** Small page shown after an unsubscribe or survey click. */
export function confirmationPage(title, message) {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>' + escapeHtml(title) + '</title>' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">' +
    '<style>body{font-family:Georgia,serif;background:#f7f1e3;color:#241c12;' +
    'display:flex;align-items:center;justify-content:center;min-height:100vh;' +
    'margin:0;padding:24px;text-align:center;}p{max-width:420px;line-height:1.6;}</style>' +
    '</head><body><p>' + escapeHtml(message) + '</p></body></html>';
}

// ---------------------------------------------------------------- where the content comes from
const timed = (url, ms) => fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(ms || 8000) : undefined });
const decode = s => String(s || '').replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Newest upload from the channel's public RSS feed (no key). null when it can't be read. */
export async function getLatestYouTubeVideo() {
  try {
    const res = await timed('https://www.youtube.com/feeds/videos.xml?channel_id=' + YOUTUBE_CHANNEL_ID);
    if (!res.ok) return null;
    const xml = await res.text();
    const entry = (xml.match(/<entry>([\s\S]*?)<\/entry>/) || [])[1];
    if (!entry) return null;
    const title = decode((entry.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
    const url = decode((entry.match(/<link[^>]*\shref="([^"]*)"/) || [])[1]);
    if (!title) return null;
    const id = (url.match(/[?&]v=([^&]+)/) || [])[1] || '';
    return { title, url, thumbnailUrl: id ? 'https://img.youtube.com/vi/' + id + '/hqdefault.jpg' : '' };
  } catch (e) { return null; }
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** "Friday, November 20" for a Bandsintown date. A time with no zone ("2026-11-20T19:00:00") is the venue's own clock, so its date is used as written. */
export function formatShowDate(datetime) {
  const m = String(datetime || '').match(/^(\d{4})-(\d{2})-(\d{2})T(?!.*(?:Z|[+-]\d{2}:?\d{2})$)/);
  if (m) { const y = +m[1], mo = +m[2], d = +m[3]; return DAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()] + ', ' + MONTHS[mo - 1] + ' ' + d; }
  const dt = new Date(datetime); if (isNaN(dt.getTime())) return '';
  const p = {}; for (const x of new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, weekday: 'long', month: 'long', day: 'numeric' }).formatToParts(dt)) p[x.type] = x.value;
  return p.weekday + ', ' + p.month + ' ' + p.day;
}

/** Soonest upcoming show. null when there is no app id (secret BANDSINTOWN_APP_ID), nothing upcoming, or it can't be read. */
export async function getNextBandsintownShow(env) {
  if (!env.BANDSINTOWN_APP_ID) return null;
  try {
    const res = await timed('https://rest.bandsintown.com/artists/id_' + BANDSINTOWN_ARTIST_ID + '/events/?app_id=' + encodeURIComponent(env.BANDSINTOWN_APP_ID) + '&date=upcoming');
    if (!res.ok) return null;
    const events = await res.json();
    if (!events || !events.length) return null;
    const next = events[0], venue = next.venue || {};
    return { venueName: venue.name || 'a venue TBA', city: venue.city || '', region: venue.region || venue.country || '', dateFormatted: formatShowDate(next.datetime),
      ticketUrl: (next.offers && next.offers[0] && next.offers[0].url) || next.url || '' };
  } catch (e) { return null; }
}

function csvRows(text) {   // small CSV reader: quotes, doubled quotes, commas and newlines inside quotes
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
/** Shows played so far, from the public Road to 100 sheet (rows marked Completed = TRUE). null when it can't be read. */
export async function getShowCount() {
  try {
    const res = await timed(TRACKER_CSV_URL);
    if (!res.ok) return null;
    const rows = csvRows(await res.text());
    const h = rows.findIndex(r => r.some(c => c.trim().toLowerCase() === 'venue'));
    if (h < 0) return null;
    const ic = rows[h].map(c => c.trim().toLowerCase()).indexOf('completed');
    if (ic < 0) return null;
    const completed = rows.slice(h + 1).filter(r => (r[ic] || '').trim().toUpperCase() === 'TRUE').length;
    return completed > 0 ? { completed, remaining: Math.max(0, SHOW_GOAL - completed) } : null;
  } catch (e) { return null; }
}

/** Loose "is this fan in the show's city" check (same as the old script). */
export function isNearShow(fanCity, show) {
  if (!fanCity || !show || !show.city) return false;
  const fan = String(fanCity).toLowerCase(), showCity = String(show.city).toLowerCase(), first = fan.split(',')[0].trim();
  return fan.indexOf(showCity) !== -1 || showCity.indexOf(first) !== -1;
}

/** Subject + body text + the pieces, or null when there is neither a video nor a show. */
export async function buildAutoContent(env, parts) {
  const video = parts && 'video' in parts ? parts.video : await getLatestYouTubeVideo();
  const show = parts && 'show' in parts ? parts.show : await getNextBandsintownShow(env);
  if (!video && !show) return null;
  let showCount = null, body = "Hey,\n\nI've got some updates for you.\n\n";
  if (video) body += 'My newest video, "' + video.title + '", is up on YouTube now. Watch it here: ' + video.url + '\n\n';
  if (show) {
    const location = show.city + (show.region ? ', ' + show.region : '');
    showCount = parts && 'showCount' in parts ? parts.showCount : await getShowCount();
    body += "I'm playing a show soon. I'll be at " + show.venueName + ' in ' + location + ' on ' + show.dateFormatted + '.';
    if (showCount) body += " That'll make " + showCount.completed + ' shows down on the #ROADTO100SHOWS run' + (showCount.remaining !== null ? ', ' + showCount.remaining + ' to go.' : '.') + ' Watch the journey so far: ' + ROAD_TO_100_PLAYLIST_URL;
    if (show.ticketUrl) body += " Grab your tickets here before they're gone: " + show.ticketUrl;
    body += '\n\n';
  }
  body += "Thanks for riding with me. I'll see some of you out there.\n\nNicólas";
  return { subject: video ? 'Inside the Tribe: ' + video.title : "Inside the Tribe: Here's what's next", body, video, show, showCount };
}

// ---------------------------------------------------------------- sending (Resend)
export async function sendMail(env, { to, subject, html, text, unsub }) {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set.');
  const msg = { from: env.NEWSLETTER_FROM || 'Nicólas Soul <news@mail.nrnszn.com>', to: [to], subject, reply_to: env.NEWSLETTER_REPLY_TO || NOTIFY_EMAIL };
  if (html) msg.html = html; else msg.text = text || '';
  if (unsub) msg.headers = { 'List-Unsubscribe': '<' + unsub + '>' };
  const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify(msg) });
  if (!res.ok) throw new Error('Resend ' + res.status + ': ' + String(await res.text().catch(() => '')).slice(0, 200));
}
const notifyOwner = (env, subject, text) => sendMail(env, { to: env.NEWSLETTER_NOTIFY_TO || NOTIFY_EMAIL, subject, text }).catch(() => {});

// ---------------------------------------------------------------- the draft (replaces the Subject/Body cells of the old sheet)
export async function getDraft(db) { const r = await db.prepare("SELECT v FROM kv WHERE k = 'news_draft'").first(); try { return r ? JSON.parse(r.v) : { subject: '', body: '' }; } catch (e) { return { subject: '', body: '' }; } }
export async function setDraft(db, subject, body) {
  const v = JSON.stringify({ subject: String(subject || '').trim().slice(0, 200), body: String(body || '').trim().slice(0, 20000) });
  await db.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES ('news_draft', ?)").bind(v).run();
}

export async function subscribers(db) {
  await ensureFans(db);   // the table may not exist yet if nobody has ever signed up
  return (await db.prepare("SELECT first_name AS firstName, email, city FROM fans WHERE news = 1 AND consent = 1 AND COALESCE(email, '') != '' ORDER BY id").all()).results;
}

function secretOf(env) { if (!env.NEWSLETTER_SECRET) throw new Error('NEWSLETTER_SECRET is not set (it signs the unsubscribe links).'); return env.NEWSLETTER_SECRET; }

/** A preview to the owner only. Touches nothing else (no ledger, the draft stays). */
export async function preview(env, { base } = {}) {
  const secret = secretOf(env), to = env.NEWSLETTER_NOTIFY_TO || NOTIFY_EMAIL, d = await getDraft(env.DB);
  let subject = d.subject, html;
  if (d.subject && d.body) { html = buildPlainEmailHtml(d.body, 'Nick', await linksFor(secret, to, null, base)); }
  else {
    const a = await buildAutoContent(env);
    if (!a) { await sendMail(env, { to, subject: 'Newsletter preview: nothing to send yet', text: 'No hand-written draft is saved, and there is no video or upcoming show to build one from. Check that your YouTube channel or Bandsintown has something current, then try again.' }); return { ok: true, nothing: true }; }
    subject = a.subject; html = buildAutoEmailHtml(a.video, a.show, 'Nick', await linksFor(secret, to, a.video, base), false, a.showCount);
  }
  const links = await linksFor(secret, to, null, base);
  await sendMail(env, { to, subject: '[PREVIEW] ' + subject, html, unsub: links.unsub });
  return { ok: true, to };
}

/** The scheduled send. Safe to call as often as you like: it only sends on a send day, from 9 AM Central, once per day. */
export async function sendScheduled(env, { now = new Date(), force = false, base } = {}) {
  await ensureNews(env.DB);
  const secret = secretOf(env), l = localParts(now);
  if (!force) {
    if (!isScheduledSendDay(now)) return { skipped: 'Not a send day (1st and 3rd Friday).' };
    if (l.hour < SEND_HOUR) return { skipped: 'Before 9 AM Central.' };
  }
  const day = l.ymd;
  const claim = await env.DB.prepare('INSERT OR IGNORE INTO news_sends (day, subject, sent, total, mode, at) VALUES (?,?,?,?,?,?)').bind(day, '', 0, 0, 'sending', Date.now()).run();
  if (!claim.meta.changes) return { skipped: 'Already sent today.' };
  const release = () => env.DB.prepare('DELETE FROM news_sends WHERE day = ?').bind(day).run();
  try {
    const d = await getDraft(env.DB), manual = !!(d.subject && d.body);
    let subject = d.subject, body = d.body, video = null, show = null, showCount = null;
    if (!manual) {
      const a = await buildAutoContent(env);
      if (!a) { await release(); await notifyOwner(env, 'Newsletter draft is empty, nothing sent today', 'Today (' + day + ') was a scheduled newsletter send day, but there was no video or show to build one from and no hand-written draft, so nothing went out.'); return { skipped: 'Nothing to send.' }; }
      subject = a.subject; body = a.body; video = a.video; show = a.show; showCount = a.showCount;
    }
    const subs = await subscribers(env.DB);
    if (!subs.length) { await release(); return { skipped: 'Nobody is subscribed.' }; }
    if (subs.length > DAILY_CAP) { await release(); await notifyOwner(env, 'Newsletter NOT sent: too many fans for the daily e-mail limit', subs.length + ' fans would get it, but the free e-mail plan allows about 100 a day (shared with your other apps). Nothing was sent. Upgrade the Resend plan or ask for the send to be split over days.'); return { error: 'Too many fans for one day.' }; }
    let sent = 0; const failed = [];
    for (const sub of subs) {
      try {
        const links = await linksFor(secret, sub.email, video, base);
        const html = manual ? buildPlainEmailHtml(body, sub.firstName, links) : buildAutoEmailHtml(video, show, sub.firstName, links, isNearShow(sub.city, show), showCount);
        await sendMail(env, { to: sub.email, subject, html, unsub: links.unsub }); sent++;
      } catch (e) { failed.push(sub.email + ' (' + String((e && e.message) || e).slice(0, 80) + ')'); }
    }
    if (!sent) { await release(); await notifyOwner(env, 'Newsletter failed: nothing was sent', 'No message could be sent today (' + day + '). It will try again on the next check today.\n\n' + failed.join('\n')); return { error: 'Nothing could be sent.', failed: failed.length }; }
    await env.DB.prepare('UPDATE news_sends SET subject = ?, sent = ?, total = ?, mode = ?, at = ? WHERE day = ?').bind(subject, sent, subs.length, manual ? 'manual' : 'auto', Date.now(), day).run();
    if (failed.length) await notifyOwner(env, 'Newsletter sent, but ' + failed.length + ' address(es) failed', 'The ' + day + ' newsletter went out to everyone else, but these did not get it:\n\n' + failed.join('\n') + '\n\nWorth checking those addresses.');
    if (manual) await setDraft(env.DB, '', '');   // the next send goes back to automatic unless you write another
    return { sent, total: subs.length, subject, mode: manual ? 'manual' : 'auto' };
  } catch (e) { await release().catch(() => {}); throw e; }
}

// ---------------------------------------------------------------- link clicks
export async function handleClick(env, params) {
  await ensureNews(env.DB);
  const secret = secretOf(env);
  if (params.unsub) {
    if (sameText(params.token, await unsubToken(secret, params.unsub))) {
      await env.DB.prepare('UPDATE fans SET news = 0 WHERE lower(email) = ?').bind(String(params.unsub).toLowerCase()).run();
      return confirmationPage('Unsubscribe', "You're unsubscribed. Sorry to see you go, come back anytime.");
    }
    return confirmationPage('Unsubscribe', "That unsubscribe link looks invalid or expired. Reply to any of my emails and I'll take care of it.");
  }
  if (params.survey) {
    const ok = params.email && params.video && sameText(params.token, await surveyToken(secret, params.email, params.video, params.survey));
    if (ok) {
      await env.DB.prepare('INSERT INTO news_survey (at, email, video, response) VALUES (?,?,?,?)').bind(Date.now(), String(params.email).slice(0, 200), String(params.video).slice(0, 300), String(params.survey).slice(0, 40)).run();
      return confirmationPage('Thanks for the feedback', 'Thanks for letting me know what you think!');
    }
    return confirmationPage('Thanks for the feedback', "That link looks invalid or expired, but I appreciate you trying to let me know.");
  }
  return null;
}
