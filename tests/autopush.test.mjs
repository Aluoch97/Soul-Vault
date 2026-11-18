// Automatic phone notifications (functions/_lib/autopush.js): new music and new shows, only when switched on, never for old things, only 9 AM to 9 PM Central,
// one message per kind, never twice, shares the daily limit. No network: a fake push service.
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { withWorld } from './_helpers.mjs';
import * as P from '../functions/_lib/push.js';
import * as A from '../functions/_lib/autopush.js';

async function keys(h) {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  h.env.VAPID_PUBLIC_KEY = P.b64u.encode(new Uint8Array(await webcrypto.subtle.exportKey('raw', pair.publicKey)));
  h.env.VAPID_PRIVATE_KEY = (await webcrypto.subtle.exportKey('jwk', pair.privateKey)).d;
}
async function phone(h, n = 1) {
  const ecdh = await webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const sub = { p256dh: P.b64u.encode(new Uint8Array(await webcrypto.subtle.exportKey('raw', ecdh.publicKey))), auth: P.b64u.encode(webcrypto.getRandomValues(new Uint8Array(16))) };
  await P.ensurePush(h.db);
  for (let i = 0; i < n; i++) await h.db.prepare('INSERT INTO push_subs (endpoint, p256dh, auth, at, ip_hash) VALUES (?,?,?,?,?)').bind('https://push.test/p' + i + '-abcdefghijkl', sub.p256dh, sub.auth, i, 'x').run();
}
const rel = (key, title = key) => ({ key, title, slug: key.replace(/^rel_/, '').replace(/_/g, '-') });
const show = (date, venue = 'The Basement', city = 'Nashville, TN') => ({ key: date, date, venue, city });
const TEN_AM = Date.UTC(2026, 10, 18, 16, 0);            // 10:00 in Nashville (CST)
const THREE_AM = Date.UTC(2026, 10, 18, 9, 0);           // 03:00 in Nashville
const run = (h, data, now = TEN_AM) => A.runAuto(h.db, h.env, data, { now, fetchFn: globalThis.fetch });
const body = async h => JSON.stringify(h.pushed.map(p => p.url));

test('off by default: nothing is sent and nothing is remembered', () => withWorld(async h => {
  await keys(h); await phone(h);
  assert.deepEqual(await A.getAutoSettings(h.db), { releases: false, shows: false });
  assert.equal((await run(h, { releases: [rel('rel_a')], shows: [show('2026-12-01')] })).skipped, 'off');
  assert.equal(h.pushed.length, 0); assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM push_auto_seen').first()).n, 0);
}));

test('turning a switch ON records what exists now WITHOUT sending; only newer things are announced', () => withWorld(async h => {
  await keys(h); await phone(h);
  const data = { releases: [rel('rel_old1'), rel('rel_old2')], shows: [show('2026-12-01')] };
  assert.deepEqual(await A.setAutoSettings(h.db, { releases: true, shows: true }, data, TEN_AM), { releases: true, shows: true });
  assert.equal(h.pushed.length, 0, 'switching on sends nothing');
  assert.deepEqual((await run(h, data)).sent, [], 'old releases and old shows are never announced');
  const next = { releases: [...data.releases, rel('rel_new', 'Fresh Tape')], shows: [...data.shows, show('2026-12-20', 'The Hive', 'Knoxville, TN')] };
  const r = await run(h, next);
  assert.deepEqual(r.sent.map(x => [x.kind, x.count, x.phones]), [['release', 1, 1], ['show', 1, 1]]);
  assert.equal(h.pushed.length, 2);
  assert.deepEqual((await run(h, next)).sent, [], 'never twice');
  assert.equal(h.pushed.length, 2);
}));

test('a switch that stays off stays silent, and switching the other one on does not announce the first one\'s backlog', () => withWorld(async h => {
  await keys(h); await phone(h);
  await A.setAutoSettings(h.db, { releases: true, shows: false }, { releases: [rel('rel_a')], shows: [show('2026-12-01')] }, TEN_AM);
  const r = await run(h, { releases: [rel('rel_a')], shows: [show('2026-12-01'), show('2026-12-02')] });
  assert.deepEqual(r.sent, [], 'shows are off');
  await A.setAutoSettings(h.db, { releases: true, shows: true }, { releases: [rel('rel_a')], shows: [show('2026-12-01'), show('2026-12-02')] }, TEN_AM);
  assert.deepEqual((await run(h, { releases: [rel('rel_a')], shows: [show('2026-12-01'), show('2026-12-02')] })).sent, [], 'the shows that existed when it was switched on are not announced');
}));

test('the message says what it is, and a tap goes to the release or the tour page', () => withWorld(async h => {
  await keys(h); const ph = await phone(h); void ph;
  await A.setAutoSettings(h.db, { releases: true, shows: true }, { releases: [], shows: [] }, TEN_AM);
  await run(h, { releases: [rel('rel_2026_fresh', 'Fresh Tape')], shows: [show('2026-12-20', 'The Hive', 'Knoxville, TN')] });
  const texts = (await h.db.prepare('SELECT title, body, url FROM push_log ORDER BY id').all()).results;
  assert.deepEqual(texts, [{ title: 'New music from Nicólas Soul', body: 'Fresh Tape is out now', url: '/vault/2026-fresh' }, { title: 'New show announced', body: 'Dec 20 · The Hive · Knoxville, TN', url: '/tour' }]);
}));

test('several new things at once become ONE notification each, not a pile', () => withWorld(async h => {
  await keys(h); await phone(h);
  await A.setAutoSettings(h.db, { releases: true, shows: true }, { releases: [], shows: [] }, TEN_AM);
  await run(h, { releases: [rel('rel_a'), rel('rel_b'), rel('rel_c')], shows: [show('2026-12-24', 'B'), show('2026-12-02', 'A')] });
  const texts = (await h.db.prepare('SELECT title, body, url FROM push_log ORDER BY id').all()).results;
  assert.deepEqual(texts, [{ title: 'New music from Nicólas Soul', body: '3 new releases are out now', url: '/vault' }, { title: 'New shows announced', body: '2 new shows, starting Dec 2 at A', url: '/tour' }]);
}));

test('only between 9 AM and 9 PM Central: at night nothing is sent AND nothing is used up, so it goes out in the morning', () => withWorld(async h => {
  await keys(h); await phone(h);
  await A.setAutoSettings(h.db, { releases: true, shows: false }, { releases: [], shows: [] }, TEN_AM);
  assert.equal((await run(h, { releases: [rel('rel_night')], shows: [] }, THREE_AM)).skipped, 'quiet hours');
  assert.equal((await run(h, { releases: [rel('rel_night')], shows: [] }, Date.UTC(2026, 10, 19, 3, 30))).skipped, 'quiet hours', '9:30 PM');
  assert.equal(h.pushed.length, 0); assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM push_auto_seen').first()).n, 0);
  assert.deepEqual((await run(h, { releases: [rel('rel_night')], shows: [] }, TEN_AM)).sent.map(x => x.kind), ['release']);
  assert.equal(A.centralHour(new Date(Date.UTC(2026, 6, 18, 14, 0))), 9, 'summer time too (9 AM CDT = 14:00 UTC)');
}));

test('it shares the 3-a-day limit; a blocked item is kept and goes out once the limit rolls', () => withWorld(async h => {
  await keys(h); await phone(h);
  await A.setAutoSettings(h.db, { releases: true, shows: false }, { releases: [], shows: [] }, TEN_AM);
  for (let i = 0; i < 3; i++) assert.equal((await P.pushSend(h.db, h.env, { title: 'manual ' + i }, { fetchFn: globalThis.fetch, now: TEN_AM - 3600e3 })).sent, 1);
  const blocked = await run(h, { releases: [rel('rel_wait')], shows: [] }); assert.match(blocked.skipped, /already sent 3/);
  assert.equal((await h.db.prepare("SELECT COUNT(*) AS n FROM push_auto_seen WHERE key = 'rel_wait'").first()).n, 0, 'not marked as announced');
  assert.deepEqual((await run(h, { releases: [rel('rel_wait')], shows: [] }, TEN_AM + 25 * 3600e3)).sent.map(x => x.kind), ['release'], 'a day later it goes out');
}));

test('nobody subscribed: nothing to send, the item counts as announced (not retried forever)', () => withWorld(async h => {
  await keys(h);
  await A.setAutoSettings(h.db, { releases: true, shows: false }, { releases: [], shows: [] }, TEN_AM);
  const r = await run(h, { releases: [rel('rel_x')], shows: [] }); assert.deepEqual(r.sent, [{ kind: 'release', count: 1, phones: 0 }]);
  assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM push_auto_seen').first()).n, 1);
}));

test('if no phone can be reached the item is kept for the next check', () => withWorld(async h => {
  await keys(h); await phone(h); h.pushStatus['https://push.test/p0-abcdefghijkl'] = 500;
  await A.setAutoSettings(h.db, { releases: true, shows: false }, { releases: [], shows: [] }, TEN_AM);
  await run(h, { releases: [rel('rel_x')], shows: [] });
  assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM push_auto_seen').first()).n, 0, 'unclaimed again');
  h.pushStatus['https://push.test/p0-abcdefghijkl'] = 201;
  assert.deepEqual((await run(h, { releases: [rel('rel_x')], shows: [] })).sent.map(x => x.phones), [1]);
}));

test('two checks at the same moment (two data centres) announce it once', () => withWorld(async h => {
  await keys(h); await phone(h);
  await A.setAutoSettings(h.db, { releases: true, shows: false }, { releases: [], shows: [] }, TEN_AM);
  const data = { releases: [rel('rel_race')], shows: [] };
  await Promise.all([run(h, data), run(h, data), run(h, data)]);
  assert.equal(h.pushed.length, 1);
}));

test('the owner call: only the owner can read or change the switches; status shows them; switching on from the real library records only what fans can see', () => withWorld(async h => {
  await keys(h);
  assert.equal((await h.call('pushAuto', ['wrong'])).ok, false); assert.equal((await h.call('pushAuto', ['wrong', { releases: true }])).ok, false);
  assert.deepEqual((await h.owner('pushAuto')).result, { releases: false, shows: false });
  h.tracker = 'Road to 100,,,,,,,,,\n#,Date,Venue,City,Show Type,Completed,Show Length,State,Story,Clip\n1,5/1/2026,Old Place,Nashville,Headline,TRUE,,TN,,\n2,12/31/2099,The Future Room,Nashville,Headline,FALSE,,TN,,\n';
  const on = (await h.owner('pushAuto', { releases: true, shows: true })).result; assert.deepEqual(on, { releases: true, shows: true });
  const seen = (await h.db.prepare('SELECT kind, key FROM push_auto_seen ORDER BY kind, key').all()).results.map(r => r.kind + ':' + r.key);
  assert.deepEqual(seen, ['release:rel_pub', 'release:rel_single', 'show:2099-12-31'], 'public live releases and upcoming shows only (not the hidden or sealed release, not a finished show)');
  assert.deepEqual((await h.owner('pushStatus')).result.auto, { releases: true, shows: true });
  assert.deepEqual((await h.owner('pushAuto', { releases: false, shows: true })).result, { releases: false, shows: true });
}));
