// The newsletter ("Inside the Tribe"). Two kinds of proof:
//  1. The real functions from the OLD Google script (tests/fixtures/soulmates-newsletter.gs) run next to the new code and must give the same
//     e-mails, links and send days.
//  2. The whole thing against a real SQLite database, a fake Resend, a fake YouTube feed and a fake Bandsintown: who gets it, when, once,
//     what happens when a send fails, and the unsubscribe / survey links.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { withWorld, OWNER_KEY } from './_helpers.mjs';

// ---------------------------------------------------------------- the old script as a reference
function oldScript(stubs = {}) {
  const sandbox = {
    Utilities: { computeHmacSha256Signature: (value, key) => Array.from(createHmac('sha256', key).update(value).digest()).map(b => (b > 127 ? b - 256 : b)) },
    getLatestYouTubeVideo: () => stubs.video || null, getNextBandsintownShow: () => stubs.show || null, getShowCount: () => stubs.showCount || null,
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL('./fixtures/soulmates-newsletter.gs', import.meta.url), 'utf8')
    + '\n;this.api = { generateUnsubToken, generateSurveyToken, buildSurveyUrl, buildUnsubUrl, buildAutoContent, isScheduledSendDay, isNearShow, buildPlainEmailHtml, buildAutoEmailHtml, escapeHtml, UNSUB_SECRET };', sandbox);
  return sandbox.api;
}
const SECRET = 'TEST_SECRET', BASE = 'https://soulnicolas.com';
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = a => a[Math.floor(rnd() * a.length)];
const NASTY = ['', 'Ana', 'Zoë', '<script>alert(1)</script>', 'A & B', 'He said "hi"', "O'Brien", 'a<b>c', '😀 Fan', '  spaced  ', 'x'.repeat(80)];
const EMAILS = ['ana@example.com', 'Mixed.Case+tag@Example.COM', "o'brien@example.co.uk", 'a&b@example.com', 'sp ace@example.com', 'ünï@example.com'];
const randVideo = () => ({ title: pick(['New song', 'SHOW 19 & more | #ROADTO100SHOWS', '<b>bold</b> "quoted"', "It's mine", 'Ünïcode 🎵']), url: 'https://www.youtube.com/watch?v=' + pick(['abc', 'a_b-C1', 'zz9']), thumbnailUrl: pick(['', 'https://img.youtube.com/vi/abc/hqdefault.jpg']) });
const randShow = () => ({ venueName: pick(['The Basement', 'Bar & Grill', '<i>Venue</i>', 'a venue TBA']), city: pick(['Nashville', 'Memphis', 'Old Hickory', '']), region: pick(['TN', '', 'United States']), dateFormatted: pick(['Friday, November 20', 'Saturday, December 5']), ticketUrl: pick(['', 'https://tickets.example/x?a=1&b=2', 'https://t.example/"q"']) });
const randCount = () => pick([null, { completed: 18, remaining: 82 }, { completed: 99, remaining: null }, { completed: 1, remaining: 99 }]);

test('links: the unsubscribe and survey links are exactly what the old script made, so old and new can never disagree', async () => {
  const old = oldScript(), NL = (await import('../functions/_lib/newsletter.js'));
  for (let i = 0; i < 60; i++) {
    const email = pick(EMAILS), video = 'https://www.youtube.com/watch?v=' + pick(['a', 'b&c', 'd e']), resp = pick(['loved', 'liked', 'meh']);
    assert.equal(await NL.unsubToken(SECRET, email), old.generateUnsubToken(email));
    assert.equal(await NL.surveyToken(SECRET, email, video, resp), old.generateSurveyToken(email, video, resp));
    assert.equal(await NL.unsubUrl(SECRET, email), old.buildUnsubUrl(email));
    assert.equal(await NL.surveyUrl(SECRET, email, video, resp), old.buildSurveyUrl(email, video, resp));
  }
  assert.equal(await NL.unsubToken(SECRET, 'A@B.com'), await NL.unsubToken(SECRET, 'a@b.com'));         // capital letters do not matter
});

test('send days: the 1st and 3rd Friday, same answer as the old script for every day of three years', async () => {
  const old = oldScript(), NL = await import('../functions/_lib/newsletter.js'); let sendDays = 0;
  for (let t = Date.UTC(2026, 0, 1, 12); t < Date.UTC(2029, 0, 1, 12); t += 86400e3) {
    const d = new Date(t); const a = old.isScheduledSendDay(d), b = NL.isScheduledSendDay(d);
    assert.equal(b, a, d.toISOString()); if (b) sendDays++;
  }
  assert.ok(sendDays > 60 && sendDays < 80, 'about 2 a month: ' + sendDays);
});

test('e-mails: the automatic layout is identical to the old one (400 random mixes of video, show, fan name and city)', async () => {
  const NL = await import('../functions/_lib/newsletter.js');
  for (let i = 0; i < 400; i++) {
    const video = rnd() < 0.8 ? randVideo() : null, show = rnd() < 0.7 ? randShow() : null, showCount = show ? randCount() : null;
    const old = oldScript({ video, show, showCount });
    const email = pick(EMAILS), first = pick(NASTY), near = rnd() < 0.3;
    const links = await NL.linksFor(SECRET, email, video, BASE);
    assert.equal(NL.buildAutoEmailHtml(video, show, first, links, near, showCount), old.buildAutoEmailHtml(video, show, first, email, near, showCount), JSON.stringify({ video, show, first }));
    const a = old.buildAutoContent(), b = await NL.buildAutoContent({}, { video, show, showCount });
    assert.deepEqual(b && { subject: b.subject, body: b.body }, a && { subject: a.subject, body: a.body });
  }
});

test('e-mails: a hand-written draft looks the same as before, and "near you" is decided the same way', async () => {
  const NL = await import('../functions/_lib/newsletter.js'), old = oldScript();
  for (let i = 0; i < 200; i++) {
    const body = pick(['One line.', 'Para one.\n\nPara two with <b>bold</b> & a link https://x.example/?a=1&b=2', 'Line\nbreak\n\n\n\nMany blanks', 'Ünï 🎵\n\nend']), email = pick(EMAILS), first = pick(NASTY);
    assert.equal(NL.buildPlainEmailHtml(body, first, await NL.linksFor(SECRET, email, null, BASE)), old.buildPlainEmailHtml(body, first, email));
    const city = pick(['Nashville, TN', 'nashville', 'Memphis', '', 'Old Hickory', 'x']), show = rnd() < 0.8 ? randShow() : null;
    assert.equal(NL.isNearShow(city, show), old.isNearShow(city, show), city + JSON.stringify(show));
  }
});

// ---------------------------------------------------------------- where the content comes from
test('the YouTube feed: newest video, entities decoded, thumbnail from the video id; a broken feed gives nothing', () => withWorld(async (w) => {
  const NL = w.t.newsletter;
  assert.deepEqual(await NL.getLatestYouTubeVideo(), { title: 'SHOW 19 & more | #ROADTO100SHOWS', url: 'https://www.youtube.com/watch?v=abc123XYZ_-', thumbnailUrl: 'https://img.youtube.com/vi/abc123XYZ_-/hqdefault.jpg' });
  w.feed = null; assert.equal(await NL.getLatestYouTubeVideo(), null);
  w.feed = '<feed></feed>'; assert.equal(await NL.getLatestYouTubeVideo(), null);
}));

test('Bandsintown: soonest show; the date is the venue\'s own day; no app id, an error or no shows gives nothing', () => withWorld(async (w) => {
  const NL = w.t.newsletter;
  w.shows = [{ datetime: '2026-11-20T02:00:00', venue: { name: 'The Basement', city: 'Nashville', region: 'TN' }, offers: [{ url: 'https://t.example/1' }], url: 'https://b.example/1' }, { datetime: '2026-12-01T20:00:00', venue: {} }];
  assert.deepEqual(await NL.getNextBandsintownShow(w.env), { venueName: 'The Basement', city: 'Nashville', region: 'TN', dateFormatted: 'Friday, November 20', ticketUrl: 'https://t.example/1' });
  w.shows = [{ datetime: '2026-12-05T20:00:00', venue: {}, url: 'https://b.example/2' }];
  assert.deepEqual(await NL.getNextBandsintownShow(w.env), { venueName: 'a venue TBA', city: '', region: '', dateFormatted: 'Saturday, December 5', ticketUrl: 'https://b.example/2' });
  assert.equal(NL.formatShowDate('2026-11-21T02:30:00Z'), 'Friday, November 20');                          // a real time zone is converted to Central
  w.shows = []; assert.equal(await NL.getNextBandsintownShow(w.env), null);
  w.shows = null; assert.equal(await NL.getNextBandsintownShow(w.env), null);
  w.shows = [{ datetime: '2026-12-05T20:00:00', venue: {} }]; assert.equal(await NL.getNextBandsintownShow({ ...w.env, BANDSINTOWN_APP_ID: '' }), null);
}));

test('show count: rows marked Completed on the public tracker; nothing when it cannot be read', () => withWorld(async (w) => {
  const NL = w.t.newsletter;
  w.tracker = 'Road to 100,,\n,,\nDate,Venue,City,Completed,State\n1/1/26,"The ""Basement""",Nashville,TRUE,TN\n2/1/26,Bar,"Memphis, TN",TRUE,TN\n3/1/26,Later,X,FALSE,TN\n';
  assert.deepEqual(await NL.getShowCount(), { completed: 2, remaining: 98 });
  w.tracker = 'Date,Venue,Completed\n'; assert.equal(await NL.getShowCount(), null);
  w.tracker = null; assert.equal(await NL.getShowCount(), null);
}));

// ---------------------------------------------------------------- the fan list
const FRIDAY_9AM = new Date('2026-11-06T15:00:00Z');       // 1st Friday of November 2026, 9:00 Central (standard time)
const join = (w, n, extra = {}) => w.call('joinSubmit', [{ firstName: 'Fan' + n, email: `fan${n}@example.com`, emailConsent: true, city: 'Nashville, TN', ...extra }], { ip: '9.9.9.' + n });

test('who is on the list: form sign-ups AND the contacts Nick imported by hand; never someone who unsubscribed or withdrew consent', () => withWorld(async (w) => {
  await w.t.fans.ensureFans(w.db);
  await w.t.fans.importFans(w.db, [[1, 'Imp', 'Orted', 'imported@example.com', 1, '', '', '', '', '', 'Imported contact'], [2, 'No', 'Consent', 'noconsent@example.com', 0, '', '', '', '', '', 'Imported contact']]);
  await join(w, 1); await join(w, 2);
  const emails = async () => (await w.t.newsletter.subscribers(w.db)).map(s => s.email).sort();
  assert.deepEqual(await emails(), ['fan1@example.com', 'fan2@example.com']);                                // imported after the one-time step: not on it yet
  await w.db.prepare("UPDATE fans SET news = 1 WHERE email = 'imported@example.com'").run();
  assert.deepEqual(await emails(), ['fan1@example.com', 'fan2@example.com', 'imported@example.com']);
  await w.db.prepare('UPDATE fans SET news = 0 WHERE email = ?').bind('fan2@example.com').run();
  assert.deepEqual(await emails(), ['fan1@example.com', 'imported@example.com']);
  await w.db.prepare('UPDATE fans SET news = 1, consent = 0 WHERE email = ?').bind('fan1@example.com').run();       // withdrawn consent wins, even if the flag says subscribed
  assert.deepEqual(await emails(), ['imported@example.com']);
}));

test('a fan table made before the newsletter existed is upgraded once, and keeps the old list\'s rule (form sign-ups and imported contacts yes, anyone without consent no)', () => withWorld(async (w) => {
  w.db._raw.exec("CREATE TABLE fans (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, first_name TEXT, last_name TEXT, email TEXT UNIQUE, consent INTEGER, city TEXT, birth_year TEXT, social TEXT, how_heard TEXT, favorite TEXT, source TEXT, ip_hash TEXT)");
  w.db._raw.exec("INSERT INTO fans (at, first_name, email, consent, source) VALUES (1,'A','form@example.com',1,'https://www.soulnicolas.com/'),(2,'B','imp@example.com',1,'Imported contact'),(3,'C','no@example.com',0,'https://www.soulnicolas.com/')");
  await w.t.fans.ensureFans(w.db);
  const emails = async () => (await w.t.newsletter.subscribers(w.db)).map(s => s.email).sort();
  assert.deepEqual(await emails(), ['form@example.com', 'imp@example.com']);                                // Nick's decision: imported contacts are on it; no consent = never
  await w.db.prepare("UPDATE fans SET news = 0 WHERE email = 'imp@example.com'").run();                    // they unsubscribe...
  await w.t.fans.ensureFans(w.db);
  assert.deepEqual(await emails(), ['form@example.com']);                                                    // ...and the one-time step does not bring them back
  assert.ok(await w.kv('news_imported_optin'));
}));

// ---------------------------------------------------------------- the scheduled send
const sendNow = (w, now = FRIDAY_9AM, o = {}) => w.t.newsletter.sendScheduled(w.env, { now, ...o });
const ledger = w => w.db.prepare('SELECT * FROM news_sends').all().then(r => r.results);

test('sends on a send day from 9 AM Central: one message per fan, the right subject, signed links, a record of it', () => withWorld(async (w) => {
  await join(w, 1); await join(w, 2, { city: 'Memphis' });
  w.shows = [{ datetime: '2026-11-20T19:00:00', venue: { name: 'The Basement', city: 'Nashville', region: 'TN' }, offers: [{ url: 'https://t.example/1' }] }];
  const r = await sendNow(w);
  assert.deepEqual(r, { sent: 2, total: 2, subject: 'Inside the Tribe: SHOW 19 & more | #ROADTO100SHOWS', mode: 'auto' });
  assert.deepEqual(w.mail.map(m => m.to), [['fan1@example.com'], ['fan2@example.com']]);
  assert.equal(w.mail[0].subject, r.subject); assert.equal(w.mail[0].reply_to, 'nurrenaissance@gmail.com');
  assert.match(w.mail[0].from, /Nicólas Soul/);
  assert.match(w.mail[0].html, /A Show Near You/); assert.match(w.mail[1].html, /Upcoming Show/);            // Nashville fan vs Memphis fan
  const tok = await w.t.newsletter.unsubToken('news-secret-for-tests', 'fan1@example.com');
  assert.match(w.mail[0].html, new RegExp('/news\\?unsub=fan1%40example.com&token=' + tok));
  assert.equal(w.mail[0].headers['List-Unsubscribe'], `<https://soulnicolas.com/news?unsub=fan1%40example.com&token=${tok}>`);
  const rows = await ledger(w); assert.equal(rows.length, 1); assert.deepEqual([rows[0].day, rows[0].sent, rows[0].total, rows[0].mode], ['2026-11-06', 2, 2, 'auto']);
}));

test('never twice: asking again the same day sends nothing; a double request at the same moment sends once', () => withWorld(async (w) => {
  await join(w, 1);
  const [a, b] = await Promise.all([sendNow(w), sendNow(w)]);
  assert.equal([a, b].filter(x => x.sent).length, 1); assert.equal(w.mail.length, 1);
  assert.deepEqual(await sendNow(w, new Date(FRIDAY_9AM.getTime() + 3600e3)), { skipped: 'Already sent today.' });
  assert.equal(w.mail.length, 1);
}));

test('only on the right days and hours: not on other Fridays or other days, not before 9 AM Central (winter and summer time)', () => withWorld(async (w) => {
  await join(w, 1);
  assert.match((await sendNow(w, new Date('2026-11-13T15:00:00Z'))).skipped, /Not a send day/);              // 2nd Friday
  assert.match((await sendNow(w, new Date('2026-11-05T15:00:00Z'))).skipped, /Not a send day/);              // a Thursday
  assert.match((await sendNow(w, new Date('2026-11-06T14:59:00Z'))).skipped, /Before 9/);                    // 8:59 CST
  assert.match((await sendNow(w, new Date('2026-07-03T13:59:00Z'))).skipped, /Before 9/);                    // 8:59 CDT (1st Friday of July)
  assert.equal(w.mail.length, 0); assert.equal((await ledger(w)).length, 0);
  assert.equal((await sendNow(w, new Date('2026-07-03T14:00:00Z'))).sent, 1);                                  // 9:00 CDT
}));

test('a late timer still sends the same day (a delayed GitHub run at 11 AM)', () => withWorld(async (w) => {
  await join(w, 1); assert.equal((await sendNow(w, new Date('2026-11-06T17:30:00Z'))).sent, 1);
}));

test('a send that fails for one address still reaches everyone else, and you are told who missed it', () => withWorld(async (w) => {
  await join(w, 1); await join(w, 2); await join(w, 3); w.mailFail = ['fan2@example.com'];
  const r = await sendNow(w);
  assert.deepEqual([r.sent, r.total], [2, 3]);
  const note = w.mail.find(m => /failed/.test(m.subject));
  assert.deepEqual(note.to, ['nurrenaissance@gmail.com']); assert.match(note.text, /fan2@example.com/);
}));

test('if nothing at all can be sent (e-mail service down) the day is NOT used up: the next check tries again', () => withWorld(async (w) => {
  await join(w, 1); w.mailDown = true;
  const r = await sendNow(w); assert.equal(r.error, 'Nothing could be sent.');
  assert.equal((await ledger(w)).length, 0);
  w.mailDown = false; assert.equal((await sendNow(w, new Date(FRIDAY_9AM.getTime() + 3600e3))).sent, 1);
}));

test('no key set: it says so and does not mark the day as sent', () => withWorld(async (w) => {
  await join(w, 1); delete w.env.RESEND_API_KEY;
  const r = await sendNow(w); assert.ok(r.error); assert.equal((await ledger(w)).length, 0);
}));

test('nothing to say (no video, no show, no draft): you are told, nobody is e-mailed, the day stays open', () => withWorld(async (w) => {
  await join(w, 1); w.feed = null; w.shows = [];
  assert.deepEqual(await sendNow(w), { skipped: 'Nothing to send.' });
  assert.deepEqual(w.mail.map(m => m.subject), ['Newsletter draft is empty, nothing sent today']); assert.deepEqual(w.mail[0].to, ['nurrenaissance@gmail.com']);
  assert.equal((await ledger(w)).length, 0);
}));

test('a video alone is enough, and a show alone is enough', () => withWorld(async (w) => {
  await join(w, 1); w.shows = [];
  assert.match((await sendNow(w)).subject, /^Inside the Tribe: SHOW 19/);
  assert.doesNotMatch(w.mail[0].html, /Upcoming Show/);
  await w.db.prepare('DELETE FROM news_sends').run(); w.mail.length = 0; w.feed = null;
  w.shows = [{ datetime: '2026-11-20T19:00:00', venue: { name: 'V', city: 'Memphis', region: 'TN' } }];
  assert.equal((await sendNow(w)).subject, "Inside the Tribe: Here's what's next");
  assert.doesNotMatch(w.mail[0].html, /My newest video/);
}));

test('a hand-written draft is used once, then it goes back to automatic', () => withWorld(async (w) => {
  await join(w, 1); await w.t.newsletter.setDraft(w.db, 'Big news', 'Hello there.\n\nSecond paragraph.');
  const r = await sendNow(w); assert.deepEqual([r.subject, r.mode], ['Big news', 'manual']);
  assert.match(w.mail[0].html, /Second paragraph/); assert.doesNotMatch(w.mail[0].html, /My newest video/);
  assert.deepEqual(await w.t.newsletter.getDraft(w.db), { subject: '', body: '' });
  assert.equal((await ledger(w))[0].mode, 'manual');
  await w.db.prepare('DELETE FROM news_sends').run(); assert.equal((await sendNow(w)).mode, 'auto');
  await w.t.newsletter.setDraft(w.db, 'Only a subject', ''); await w.db.prepare('DELETE FROM news_sends').run();
  assert.equal((await sendNow(w)).mode, 'auto');                                                             // both boxes are needed, like the old sheet
}));

test('the daily e-mail limit: too many fans for the free plan sends nothing and tells you', () => withWorld(async (w) => {
  await w.t.fans.ensureFans(w.db);
  for (let i = 0; i < 91; i++) await w.db.prepare("INSERT INTO fans (at, first_name, email, consent, source, news) VALUES (1,'F',?,1,'form',1)").bind(`f${i}@example.com`).run();
  const r = await sendNow(w); assert.match(r.error, /Too many/);
  assert.deepEqual(w.mail.map(m => m.subject), ['Newsletter NOT sent: too many fans for the daily e-mail limit']);
  assert.equal((await ledger(w)).length, 0);
}));

test('nobody subscribed: nothing sent, day stays open', () => withWorld(async (w) => {
  assert.deepEqual(await sendNow(w), { skipped: 'Nobody is subscribed.' }); assert.equal(w.mail.length, 0);
}));

test('hostile text in a video title, venue or fan name is escaped in the e-mail', () => withWorld(async (w) => {
  await join(w, 1, { firstName: '<img src=x onerror=alert(1)>' });
  w.feed = SAMPLE().replace('SHOW 19 &amp; more', '&lt;script&gt;alert(1)&lt;/script&gt;');
  w.shows = [{ datetime: '2026-11-20T19:00:00', venue: { name: '<b>Evil</b>', city: 'X', region: 'Y' }, offers: [{ url: 'https://t.example/"><script>' }] }];
  await sendNow(w); const html = w.mail[0].html;
  assert.doesNotMatch(html, /<script|<img src=x|<b>Evil/); assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
}));
function SAMPLE() { return `<feed><entry><title>SHOW 19 &amp; more</title><link rel="alternate" href="https://www.youtube.com/watch?v=abc"/></entry></feed>`; }

// ---------------------------------------------------------------- preview
test('preview: goes only to you, marked [PREVIEW], and records nothing', () => withWorld(async (w) => {
  await join(w, 1);
  const r = await w.t.newsletter.preview(w.env); assert.deepEqual(r, { ok: true, to: 'nurrenaissance@gmail.com' });
  assert.equal(w.mail.length, 1); assert.deepEqual(w.mail[0].to, ['nurrenaissance@gmail.com']); assert.match(w.mail[0].subject, /^\[PREVIEW\] Inside the Tribe/);
  assert.equal((await ledger(w).catch(() => [])).length, 0);
  await w.t.newsletter.setDraft(w.db, 'Draft', 'Body text'); await w.t.newsletter.preview(w.env);
  assert.equal((await w.t.newsletter.getDraft(w.db)).subject, 'Draft');                                     // a preview does not use up the draft
}));

// ---------------------------------------------------------------- /news (the endpoint)
const req = (w, method, url, body) => ({ request: new Request('https://soulnicolas.com' + url, { method, body: body ? JSON.stringify(body) : undefined }), env: w.env });

test('POST /news: only with the right token; send and preview work; anything else is refused', () => withWorld(async (w) => {
  await join(w, 1);
  for (const token of [undefined, '', 'wrong', 'cron-token-for-tests ', 'CRON-TOKEN-FOR-TESTS']) {
    assert.equal((await w.t.newsPost(req(w, 'POST', '/news', { action: 'send', token }))).status, 401, String(token));
  }
  assert.equal((await w.t.newsPost({ request: new Request('https://soulnicolas.com/news', { method: 'POST', body: 'not json' }), env: w.env })).status, 401);
  w.env.NEWSLETTER_CRON_TOKEN = ''; assert.equal((await w.t.newsPost(req(w, 'POST', '/news', { action: 'send', token: '' }))).status, 401);   // no secret set = closed, not open
  w.env.NEWSLETTER_CRON_TOKEN = 'cron-token-for-tests';
  assert.equal(w.mail.length, 0);
  const p = await w.t.newsPost(req(w, 'POST', '/news', { action: 'preview', token: 'cron-token-for-tests' }));
  assert.equal(p.status, 200); assert.equal(w.mail.length, 1);
  assert.equal((await w.t.newsPost(req(w, 'POST', '/news', { action: 'bogus', token: 'cron-token-for-tests' }))).status, 400);
  const s = await (await w.t.newsPost(req(w, 'POST', '/news', { action: 'send', token: 'cron-token-for-tests' }))).json();
  assert.equal(s.ok, true); assert.ok(s.result.skipped || s.result.sent);                                    // (today may or may not be a send day)
}));

test('the unsubscribe link: works once signed, ignores capital letters, refuses a changed address or a made-up token', () => withWorld(async (w) => {
  await join(w, 1); await join(w, 2);
  const t1 = await w.t.newsletter.unsubToken('news-secret-for-tests', 'fan1@example.com');
  const get = u => w.t.newsGet(req(w, 'GET', u)).then(async r => ({ status: r.status, text: await r.text() }));
  assert.match((await get('/news?unsub=fan2%40example.com&token=' + t1)).text, /invalid or expired/);        // fan1's token on fan2's address
  assert.match((await get('/news?unsub=fan1%40example.com&token=0000000000000000')).text, /invalid or expired/);
  assert.match((await get('/news?unsub=fan1%40example.com')).text, /invalid or expired/);
  assert.equal((await w.t.newsletter.subscribers(w.db)).length, 2);
  const ok = await get('/news?unsub=FAN1%40example.com&token=' + t1); assert.match(ok.text, /You're unsubscribed/);
  assert.deepEqual((await w.t.newsletter.subscribers(w.db)).map(s => s.email), ['fan2@example.com']);
  assert.match((await get('/news?unsub=fan1%40example.com&token=' + t1)).text, /You're unsubscribed/);      // clicking twice is fine
  await w.call('joinSubmit', [{ firstName: 'x', email: 'other@example.com', emailConsent: true }]);
  assert.equal((await w.t.newsletter.subscribers(w.db)).length, 2);
  const row = await w.db.prepare("SELECT consent FROM fans WHERE email = 'fan1@example.com'").first(); assert.equal(row.consent, 1);   // what they once agreed to is kept
}));

test('the survey links: a real answer is saved; a changed answer, address or video is refused and saves nothing', () => withWorld(async (w) => {
  const NL = w.t.newsletter, S = 'news-secret-for-tests', video = 'https://www.youtube.com/watch?v=abc';
  const get = u => w.t.newsGet(req(w, 'GET', u)).then(r => r.text());
  const good = await NL.surveyUrl(S, 'fan1@example.com', video, 'loved', BASE);
  assert.match(await get(good.replace(BASE, '')), /Thanks for letting me know/);
  const rows = (await w.db.prepare('SELECT email, video, response FROM news_survey').all()).results;
  assert.deepEqual(rows, [{ email: 'fan1@example.com', video, response: 'loved' }]);
  for (const bad of [good.replace('survey=loved', 'survey=meh'), good.replace('fan1%40', 'fan9%40'), good.replace('v%3Dabc', 'v%3Dxyz'), good.replace(/token=.*/, 'token=1234567890abcdef'), good.replace(/&token=.*/, '')])
    assert.match(await get(bad.replace(BASE, '')), /invalid or expired/);
  assert.equal((await w.db.prepare('SELECT COUNT(*) AS n FROM news_survey').first()).n, 1);
}));

test('GET /news with nothing to do is a 404, and with no secret configured it says it is not set up', () => withWorld(async (w) => {
  assert.equal((await w.t.newsGet(req(w, 'GET', '/news'))).status, 404);
  delete w.env.NEWSLETTER_SECRET;
  const r = await w.t.newsGet(req(w, 'GET', '/news?unsub=a%40b.com&token=x')); assert.match(await r.text(), /not set up/);
}));
