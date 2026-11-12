// The building blocks: input cleaning, owner password, sign-ups, share links, comments, listening history, playlists, deletes, backups.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withWorld, fixtureLib } from './_helpers.mjs';

const throwsMsg = (fn, re) => assert.throws(fn, e => re.test(e.message), 'expected an error matching ' + re);

// ---------------------------------------------------------------- owner password
test('owner password: right one passes, wrong ones fail, every record has its own salt', () => withWorld(async (w) => {
  const a = await w.t.auth.makeRecord('correct horse battery'), b = await w.t.auth.makeRecord('correct horse battery');
  assert.notEqual(a.salt, b.salt); assert.notEqual(a.hash, b.hash);
  assert.ok(!JSON.stringify(a).includes('correct horse'));                       // the password itself is never stored
  assert.equal(await w.t.auth.checkPassword('correct horse battery', a), true);
  assert.equal(await w.t.auth.checkPassword('correct horse batterz', a), false);
  assert.equal(await w.t.auth.checkPassword('', a), false);
  assert.equal(await w.t.auth.checkPassword('anything', null), false);
  assert.equal(await w.t.auth.checkPassword('anything', {}), false);
  assert.equal(w.t.auth.PW_MIN, 10); assert.equal(w.t.auth.MAX_TRIES, 5); assert.equal(w.t.auth.LOGIN_LOCK_MS, 15 * 60 * 1000);
  assert.equal(w.t.auth.failKey('1.2.3.4'), 'lf:1.2.3.4');
}));

// ---------------------------------------------------------------- Studio input cleaning
test('Studio cleaners: release basics', () => withWorld(async (w) => {
  const s = w.t.studio;
  assert.deepEqual(s.cleanBasics({ title: '  New Title  ', type: 'EP', hidden: 1 }), { title: 'New Title', type: 'EP', hidden: true });
  assert.deepEqual(s.cleanBasics({}), {});
  throwsMsg(() => s.cleanBasics({ title: '   ' }), /needs a title/);
  throwsMsg(() => s.cleanBasics({ type: 'Podcast' }), /release type/);
  assert.equal(s.cleanBasics({ title: 'x'.repeat(500) }).title.length, 120);
}));

test('Studio cleaners: release page (colour, mood, lengths)', () => withWorld(async (w) => {
  const s = w.t.studio;
  assert.equal(s.cleanWorld({ world_color: '#C8102E' }).world_color, '#C8102E');
  throwsMsg(() => s.cleanWorld({ world_color: 'red' }), /Theme color/);
  throwsMsg(() => s.cleanWorld({ world_color: '#12345' }), /Theme color/);
  assert.equal(s.cleanWorld({ world_mood: ' a, b ,, c,d,e,f,g,h,i,j ' }).world_mood, 'a, b, c, d, e, f, g, h');   // at most 8 moods
  assert.equal(s.cleanWorld({ world_story: 'x'.repeat(20000) }).world_story.length, 12000);
  assert.equal(s.cleanWorld({ series_name: '  The   Series  ' }).series_name, 'The Series');
  assert.equal(s.cleanWorld({}).world_color, '');
  assert.equal(s.cleanWorld({ genre: ' Hip Hop,  hip hop , R&B ,, Gospel' }).genre, 'Hip Hop, R&B, Gospel');   // tidied like the release page does
  assert.equal(s.cleanWorld({ genre: 'a,b,c,d,e,f,g,h' }).genre, 'a, b, c, d, e, f');                            // at most 6
  assert.equal('genre' in s.cleanWorld({ world_color: '#C8102E' }), false);                                         // not sent: not touched
}));

test('Studio cleaners: songs only accept real YouTube links', () => withWorld(async (w) => {
  const s = w.t.studio;
  for (const ok of ['https://youtu.be/abcdefghijk', 'https://www.youtube.com/watch?v=abcdefghijk', 'https://www.youtube.com/shorts/abcdefghijk', 'abcdefghijk', '']) assert.doesNotThrow(() => s.cleanTrack({ video_url: ok }), ok);
  for (const bad of ['https://vimeo.com/123456789', 'javascript:alert(1)', 'https://youtu.be/short']) throwsMsg(() => s.cleanTrack({ video_url: bad }), /YouTube/);
  throwsMsg(() => s.cleanTrack({ title: '  ' }), /needs a title/);
  assert.deepEqual(s.cleanTrack({ title: ' Hi ', features: ' Jo ', bpm: 90, artist: 'A' }), { title: 'Hi', features: 'Jo', bpm: '90', artist: 'A' });
  assert.doesNotThrow(() => s.cleanSr('')); throwsMsg(() => s.cleanSr('https://example.com'), /slowed/);
}));

test('Studio cleaners: streaming links need https and a name, max 20', () => withWorld(async (w) => {
  const s = w.t.studio;
  assert.deepEqual(s.cleanLinks({ first: ' DatPiff ', links: [['Spotify', 'https://s.example/a'], ['', '']] }), { first: 'DatPiff', links: [['Spotify', 'https://s.example/a']] });
  throwsMsg(() => s.cleanLinks({ links: [['', 'https://s.example']] }), /needs a name/);
  throwsMsg(() => s.cleanLinks({ links: [['Spotify', 'javascript:alert(1)']] }), /https:\/\//);
  throwsMsg(() => s.cleanLinks({ links: [['Spotify', 'spotify.com/x']] }), /https:\/\//);
  assert.equal(s.cleanLinks({ links: Array.from({ length: 30 }, (_, i) => ['n' + i, 'https://e.example/' + i]) }).links.length, 20);
  assert.deepEqual(s.cleanLinks({}), { first: '', links: [] });
}));

test('Studio overlay helpers', () => withWorld(async (w) => {
  const s = w.t.studio, ov = s.normOverlay(null);
  assert.equal(s.overlayIsEmpty(ov), true);
  ov.sr.t = 'x'; assert.equal(s.overlayIsEmpty(ov), false);
  const lib = { releases: [{ release_id: 'r', title: 'a' }] };
  s.patchRow(lib, 'releases', 'release_id', 'r', { title: 'b' }); assert.equal(lib.releases[0].title, 'b');
  throwsMsg(() => s.patchRow(lib, 'releases', 'release_id', 'missing', {}), /Not found/);
}));

// ---------------------------------------------------------------- native (Studio-made) rows
test('native helpers: names, durations, new rows start safe', () => withWorld(async (w) => {
  const n = w.t.native;
  assert.equal(n.slug('Dreams of L.A. (Prologue) & Más'), 'dreams-of-l-a-and-mas');
  assert.equal(n.slug(''), 'track'); assert.equal(n.relSlug('rel_2019_soul_less'), '2019-soul-less');
  assert.equal(n.fmtDur(125), '2:05'); assert.equal(n.fmtDur(0), ''); assert.equal(n.fmtDur(-5), ''); assert.equal(n.fmtDur('x'), '');
  const r = n.newRelease({ title: 'Brand New', type: 'EP', year: '2026' });
  assert.match(r.release_id, /^rel_2026_brand_new_[0-9a-f]{4}$/);
  assert.equal(r.hidden, true);                                                  // fans never see it until the owner un-hides it
  assert.equal(r.native, true);
  const v = n.newVersion('trk_1', 'Original', true, 'rel/01-a b.mp3', 'mp3', 3 * 1048576, 125);
  assert.equal(v.url, 'https://media.soulnicolas.com/rel/01-a%20b.mp3'); assert.equal(v.audio, 'r2:rel/01-a b.mp3');
  assert.equal(v.size_mb, 3); assert.equal(v.duration, '2:05'); assert.equal(v.format, 'MP3');
  assert.equal(n.newTrack('rel_x', 4, 'T').track_no, 4);
}));

test('mergeNative adds Studio rows on top of the Sheet copy, skips duplicate ids, and applies overrides', () => withWorld(async (w) => {
  const n = w.t.native, lib = fixtureLib();
  const nat = { releases: [{ release_id: 'rel_pub', title: 'DUP' }, { release_id: 'rel_new', title: 'New' }], tracks: [], versions: [], extras: [] };
  const out = n.mergeNative(lib, nat, null);
  assert.deepEqual(out.releases.map(r => r.release_id), ['rel_pub', 'rel_hid', 'rel_seal', 'rel_single', 'rel_new']);
  assert.equal(out.releases[0].title, 'Open Album');                             // the Sheet row wins on a duplicate id
  const ov = { cover: { rel_pub: 'newcover12' }, primary: { trk_a1: 'ver_a1b' }, vhide: { ver_sg: true }, show: { trk_a2: true } };
  const m = n.mergeNative(lib, n.emptyNative(), ov);
  assert.equal(m.releases.find(r => r.release_id === 'rel_pub').cover_file_id, 'newcover12');
  assert.equal(m.versions.find(v => v.version_id === 'ver_a1b').is_primary, true); assert.equal(m.versions.find(v => v.version_id === 'ver_a1').is_primary, false);
  assert.equal(m.versions.find(v => v.version_id === 'ver_sg').hidden, true);
  assert.equal(m.tracks.find(t => t.track_id === 'trk_a2').hidden, false);
  assert.equal(lib.releases[0].cover_file_id, 'cover_rel_pub_xx');              // the original copy was not changed
}));

// ---------------------------------------------------------------- fan sign-ups
const signup = (o = {}) => Object.assign({ firstName: 'Ana', email: 'ana@example.com', emailConsent: true }, o);

test('fan sign-up: needs a name, a real email and the consent box', () => withWorld(async (w) => {
  const f = w.t.fans;
  await assert.rejects(f.joinSubmit(w.db, signup({ firstName: ' ' }), '1.1.1.1'), /first name/);
  await assert.rejects(f.joinSubmit(w.db, signup({ email: 'nope' }), '1.1.1.1'), /email/);
  await assert.rejects(f.joinSubmit(w.db, signup({ email: 'a@b' }), '1.1.1.1'), /email/);
  await assert.rejects(f.joinSubmit(w.db, signup({ emailConsent: 'yes' }), '1.1.1.1'), /Check the box/);
  await assert.rejects(f.joinSubmit(w.db, signup({ emailConsent: false }), '1.1.1.1'), /Check the box/);
  assert.deepEqual(await f.getFans(w.db), []);
}));

test('fan sign-up: saves lower-cased, trims fields, detects duplicates, ignores the bot trap', () => withWorld(async (w) => {
  const f = w.t.fans;
  assert.deepEqual(await f.joinSubmit(w.db, signup({ email: '  Ana@Example.COM ', city: ' Nashville ', birthYear: '1990' }), '1.1.1.1'), { ok: true, added: true });
  assert.deepEqual(await f.joinSubmit(w.db, signup({ email: 'ana@example.com' }), '2.2.2.2'), { duplicate: true });
  assert.deepEqual(await f.joinSubmit(w.db, signup({ email: 'bot@example.com', website: 'http://spam' }), '3.3.3.3'), { ok: true });   // looks like success to the bot
  const rows = await f.getFans(w.db);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, 'ana@example.com'); assert.equal(rows[0].city, 'Nashville'); assert.equal(rows[0].birth_year, '1990'); assert.equal(rows[0].consent, 1);
  assert.ok(!('ip_hash' in rows[0]));                                           // the stored address fingerprint is never handed out
}));

test('fan sign-up: a nonsense birth year is dropped, and one address can sign up at most 10 times an hour', () => withWorld(async (w) => {
  const f = w.t.fans;
  for (const by of ['1800', '2999', 'abcd', '19900']) { await f.joinSubmit(w.db, signup({ email: by + '@example.com', birthYear: by }), '9.9.9.9'); }
  assert.deepEqual((await f.getFans(w.db)).map(r => r.birth_year).sort(), ['', '', '', '1990']);   // out-of-range and non-numbers are dropped; a 5th digit is simply cut off
  for (let i = 0; i < 6; i++) await f.joinSubmit(w.db, signup({ email: 'p' + i + '@example.com' }), '9.9.9.9');
  await assert.rejects(f.joinSubmit(w.db, signup({ email: 'eleventh@example.com' }), '9.9.9.9'), /Too many sign-ups/);
  assert.deepEqual(await f.joinSubmit(w.db, signup({ email: 'other@example.com' }), '8.8.8.8'), { ok: true, added: true });   // a different address is fine
}));

test('fan list import skips bad emails and duplicates', () => withWorld(async (w) => {
  const n = await w.t.fans.importFans(w.db, [[1, 'A', '', 'a@example.com', 1], [2, 'B', '', 'bad', 1], [3, 'C', '', 'A@EXAMPLE.com', 0]]);
  assert.equal(n, 1);
}));

// ---------------------------------------------------------------- share links
const act = w => w.t.activity;

test('share links: types, expiry, fan numbers and URLs', () => withWorld(async (w) => {
  await act(w).ensureTables(w.db);
  await assert.rejects(act(w).createShare(w.db, { targetType: 'bogus' }, 'https://s.example'), /Unknown share type/);
  const a = await act(w).createShare(w.db, { targetType: 'all', fanName: 'Jo', expiresDays: 2 }, 'https://s.example');
  const b = await act(w).createShare(w.db, { targetType: 'all', fanName: 'Max' }, 'https://s.example');
  const r = await act(w).createShare(w.db, { targetType: 'release', targetId: 'rel_pub', fanName: 'ignored' }, 'https://s.example');
  assert.match(a.token, /^[0-9a-f]{12}$/); assert.equal(a.url, 'https://s.example/?s=' + a.token);
  assert.equal(a.member_no, 1); assert.equal(b.member_no, 2); assert.equal(r.member_no, 0); assert.equal(r.fan_name, '');
  assert.ok(Date.parse(a.expires) - Date.now() > 1.9 * 864e5); assert.equal(b.expires, '');
  const list = await act(w).loadShares(w.db);
  assert.equal(list.length, 3); assert.equal(list[0].active, true); assert.equal(list[2].target_type, 'release');
}));

test('share links: the site-wide public link cannot be deleted; others can be switched off and deleted', () => withWorld(async (w) => {
  await act(w).ensureTables(w.db);
  const s = await act(w).createShare(w.db, { targetType: 'all' }, 'https://s.example');
  await assert.rejects(act(w).deleteShare(w.db, 'PUBLICTOKEN', 'PUBLICTOKEN'), /cannot be deleted/);
  assert.equal(await act(w).setShareActive(w.db, s.token, false), true);
  assert.equal((await act(w).loadShares(w.db))[0].active, false);
  await assert.rejects(act(w).setShareActive(w.db, 'missing', true), /not found/);
  assert.equal(await act(w).deleteShare(w.db, s.token, 'PUBLICTOKEN'), true);
  await assert.rejects(act(w).deleteShare(w.db, s.token, 'PUBLICTOKEN'), /not found/);
}));

test('quick "Public link" for a song or release is created once, then reused', () => withWorld(async (w) => {
  await act(w).ensureTables(w.db);
  const a = await act(w).quickShare(w.db, { targetType: 'track', targetId: 'trk_a1' }, 'https://s.example');
  const b = await act(w).quickShare(w.db, { targetType: 'track', targetId: 'trk_a1' }, 'https://s.example');
  assert.equal(a.created, true); assert.equal(b.created, false); assert.equal(a.token, b.token);
  await assert.rejects(act(w).quickShare(w.db, { targetType: 'all' }, 'https://s.example'), /Unknown share type/);
}));

test('plays are counted only for live links', () => withWorld(async (w) => {
  await act(w).ensureTables(w.db);
  const s = await act(w).createShare(w.db, { targetType: 'all' }, 'x'); const lib = { shares: await act(w).loadShares(w.db) };
  assert.equal(await act(w).recordPlay(w.db, lib, s.token), true);
  assert.equal(await act(w).recordPlay(w.db, lib, 'nope'), false);
  assert.equal((await act(w).loadShares(w.db))[0].plays, 1);
}));

// ---------------------------------------------------------------- listening history
test('listening history: a link can only log songs it can reach, with sane numbers', () => withWorld(async (w) => {
  await act(w).ensureTables(w.db);
  const lib = fixtureLib();
  const ev = (v, o = 'complete', extra = {}) => Object.assign({ v, o, s: 100, p: 100, ago: 0 }, extra);
  const n = await act(w).logListens(w.db, lib, false, 'REL', 'dev-1', [ev('ver_a1'), ev('ver_sg'), ev('ver_h1'), ev('ver_a1b'), ev('ver_a1', 'bogus'), ev('ver_a1', 'skip', { s: 99999 }), ev('ver_a1', 'skip', { p: 101 }), null]);
  assert.equal(n, 1);                                                            // only the one valid event for a reachable version
  assert.equal(await act(w).logListens(w.db, lib, false, 'nope', 'dev-1', [ev('ver_a1')]), 0);   // dead link
  const rows = (await w.db.prepare('SELECT * FROM listens').all()).results;
  assert.equal(rows.length, 1); assert.equal(rows[0].share_token, 'REL'); assert.equal(rows[0].release_id, 'rel_pub');
}));

test('listening history: limits per device and per link, and the owner is not limited per link', () => withWorld(async (w) => {
  await act(w).ensureTables(w.db);
  const lib = fixtureLib(), ev = i => ({ v: 'ver_a1', o: 'partial', s: 10 + (i % 5), p: 10, ago: 0 });
  const many = n => Array.from({ length: n }, (_, i) => ev(i));
  assert.equal(await act(w).logListens(w.db, lib, false, 'PUB', 'dev-1', many(100)), 60);   // at most 60 events per call
  assert.equal(await act(w).logListens(w.db, lib, false, 'PUB', 'dev-1', many(100)), 60);   // now 120 for this device this hour
  assert.equal(await act(w).logListens(w.db, lib, false, 'PUB', 'dev-1', many(10)), 0);     // the device is at its limit
  assert.equal(await act(w).logListens(w.db, lib, false, 'PUB', 'dev-2', many(10)), 10);    // another device is fine
  const old = await act(w).logListens(w.db, lib, true, null, 'owner-dev', [{ v: 'ver_a1', o: 'complete', s: 5, p: 100, ago: 99999999 }]);
  assert.equal(old, 1);
  const last = (await w.db.prepare("SELECT at FROM listens WHERE share_token = 'owner'").first()).at;
  assert.ok(Date.now() - last <= 7 * 86400e3 + 5000);                            // "ago" is capped at a week
  assert.equal(await act(w).logListens(w.db, lib, true, null, 'a/b\\c<script>', [ev(1)]), 1);
  assert.ok((await w.db.prepare("SELECT device_id FROM listens WHERE share_token = 'owner' ORDER BY id DESC").first()).device_id.match(/^[A-Za-z0-9-]*$/));   // device ids are cleaned
}));

test('insights count plays, skips and finish rate, and leave the owner out unless asked', () => withWorld(async (w) => {
  await act(w).ensureTables(w.db);
  const lib = fixtureLib();
  const ev = (o, d = 'm') => ({ v: 'ver_a1', o, s: 60, p: o === 'complete' ? 100 : 20, ago: 0, d });
  await act(w).logListens(w.db, lib, false, 'PUB', 'd1', [ev('complete'), ev('complete'), ev('skip'), ev('partial')]);
  await act(w).logListens(w.db, lib, true, null, 'o1', [ev('complete')]);
  const fans = await act(w).getInsights(w.db, lib, 30, false);
  assert.equal(fans.totals.plays, 3); assert.equal(fans.totals.skips, 1); assert.equal(fans.totals.listeners, 1); assert.equal(fans.totals.finishRate, 67);
  assert.equal((await act(w).getInsights(w.db, lib, 30, true)).totals.plays, 4);
  assert.equal(fans.perDay.length, 30);
  const empty = await act(w).getInsights(w.db, lib, 7, false).then(() => w.db.prepare('DELETE FROM listens').run()).then(() => act(w).getInsights(w.db, lib, 7, false));
  assert.equal(empty.totals.plays, 0); assert.equal(empty.perDay.length, 7);
}));

// ---------------------------------------------------------------- comments
test('comments: a fan sees their own and the owner\'s, never other fans\'; owner sees all with the link', () => withWorld(async (w) => {
  await act(w).ensureTables(w.db);
  const lib = fixtureLib(), A = act(w);
  await A.addComment(w.db, lib, false, '', 'PUB', 'ver_a1', 12.34, 'Fan One', '  great  ');
  await A.addComment(w.db, lib, false, '', 'FAN', 'ver_a1', 30, 'Fan Two', 'other');
  await A.addComment(w.db, lib, true, 'Nicólas', null, 'ver_a1', 5, '', 'thanks');
  const one = await A.getComments(w.db, lib, false, 'PUB', 'ver_a1');
  assert.deepEqual(one.map(c => c.text), ['thanks', 'great']);
  assert.equal(one.find(c => c.text === 'great').time_sec, 12.3); assert.ok(one.every(c => c.via === undefined));   // fans never see who else wrote
  const all = await A.getComments(w.db, lib, true, null, 'ver_a1');
  assert.equal(all.length, 3); assert.deepEqual(all.map(c => c.via).sort(), ['FAN', 'PUB', 'owner']);
  assert.deepEqual(await A.getComments(w.db, lib, false, 'nope', 'ver_a1'), []);
  assert.deepEqual(await A.getComments(w.db, lib, false, 'VER', 'ver_sg'), []);   // a link can't read comments on songs it can't reach
}));

test('comments: validation and limits', () => withWorld(async (w) => {
  await act(w).ensureTables(w.db);
  const lib = fixtureLib(), A = act(w);
  await assert.rejects(A.addComment(w.db, lib, false, '', 'PUB', 'ver_a1', 1, 'Me', '   '), /Write a note/);
  await assert.rejects(A.addComment(w.db, lib, false, '', 'PUB', 'ver_a1', 1, '  ', 'hi'), /Add your name/);
  await assert.rejects(A.addComment(w.db, lib, false, '', 'PUB', 'ver_h1', 1, 'Me', 'hi'), /can no longer comment/);
  await assert.rejects(A.addComment(w.db, lib, false, '', 'OFF', 'ver_a1', 1, 'Me', 'hi'), /can no longer comment/);
  const long = await A.addComment(w.db, lib, false, '', 'PUB', 'ver_a1', -5, 'N'.repeat(100), 'T'.repeat(2000));
  assert.equal(long.text.length, 1000); assert.equal(long.name.length, 60); assert.equal(long.time_sec, 0);
  for (let i = 0; i < 299; i++) await A.addComment(w.db, lib, false, '', 'PUB', 'ver_a1', 1, 'Me', 'c' + i);
  await assert.rejects(A.addComment(w.db, lib, false, '', 'PUB', 'ver_a1', 1, 'Me', 'one too many'), /comment limit/);
  assert.equal((await A.commentCounts(w.db)).PUB, 300);
}));

test('comments can be resolved and deleted; unknown ones are reported', () => withWorld(async (w) => {
  await act(w).ensureTables(w.db);
  const lib = fixtureLib(), A = act(w), c = await A.addComment(w.db, lib, true, 'N', null, 'ver_a1', 1, '', 'x');
  assert.equal(await A.resolveComment(w.db, c.comment_id, true), true);
  assert.equal((await A.getComments(w.db, lib, true, null, 'ver_a1'))[0].resolved, true);
  await assert.rejects(A.resolveComment(w.db, 'cmt_nope', true), /not found/);
  assert.equal(await A.deleteComment(w.db, c.comment_id), true);
  assert.deepEqual(await A.getComments(w.db, lib, true, null, 'ver_a1'), []);
}));

// ---------------------------------------------------------------- error reports
test('error reports from the public are capped at 30 a minute and grouped by message', () => withWorld(async (w) => {
  await act(w).ensureTables(w.db);
  for (let i = 0; i < 40; i++) await act(w).logClientError(w.db, 'Song ' + i + ' failed at line ' + (1000 + i), 'phone');
  assert.equal(Number((await w.db.prepare('SELECT COUNT(*) AS n FROM errors').first()).n), 30);
  const s = await act(w).errorSummary(w.db);
  assert.equal(s.total, 30); assert.equal(s.top.length, 1); assert.equal(s.top[0].count, 30); assert.equal(s.top[0].mode, 'phone');   // numbers are ignored when grouping
  await act(w).logClientError(w.db, 'x'.repeat(1000), 'abcdefghijklmnop');
}));

// ---------------------------------------------------------------- playlists, extras, settings
const ow = w => w.t.owned;
test('playlists: unknown and repeated songs are dropped, edits keep the id, deletes report', () => withWorld(async (w) => {
  const o = ow(w).emptyOwned(), lib = fixtureLib();
  throwsMsg(() => ow(w).savePlaylist({ title: '  ' }, o, lib, 'now'), /name/);
  const p = ow(w).savePlaylist({ title: 'Mix', tracks: ['trk_a1', 'trk_a1', 'ghost', 'trk_sg'], fans: 1 }, o, lib, 'now');
  assert.deepEqual(p.tracks, ['trk_a1', 'trk_sg']); assert.equal(p.fans, true); assert.match(p.playlist_id, /^pl_/);
  const q = ow(w).savePlaylist({ id: p.playlist_id, title: 'Mix 2', tracks: [] }, o, lib, 'later');
  assert.equal(q.playlist_id, p.playlist_id); assert.equal(o.playlists.length, 1); assert.equal(q.title, 'Mix 2');
  assert.equal(ow(w).deletePlaylist(p.playlist_id, o), true); assert.equal(ow(w).deletePlaylist('nope', o), false);
}));

test('playlist answers: the owner sees all, a fan sees shared ones trimmed to what their link reaches', () => withWorld(async (w) => {
  const o = ow(w).emptyOwned(), lib = fixtureLib();
  o.playlists = lib.playlists;
  assert.equal(ow(w).playlistsAnswer(lib, o, null).playlists.length, 2);
  const scope = w.t.share.shareScope(lib.shares[0], lib, new Date());
  const fan = ow(w).playlistsAnswer(lib, o, scope);
  assert.deepEqual(fan.playlists.map(p => [p.playlist_id, p.tracks]), [['pl_1', ['trk_a1']]]);
}));

test('applyOwned puts adopted areas on top of the Sheet copy and leaves the rest', () => withWorld(async (w) => {
  const lib = fixtureLib(), o = ow(w).emptyOwned();
  o.domains = { playlists: true, settings: true }; o.playlists = [{ playlist_id: 'p' }]; o.bio = 'new bio'; o.letter = null; o.artist_links = { A: 'https://a.example' };
  const out = ow(w).applyOwned(lib, o);
  assert.deepEqual(out.playlists, [{ playlist_id: 'p' }]); assert.equal(out.artist_bio, 'new bio'); assert.equal(out.letter, null);
  assert.equal(out.releases.length, lib.releases.length); assert.equal(out.extras.length, lib.extras.length);
  assert.equal(ow(w).applyOwned(lib, ow(w).emptyOwned()).artist_bio, 'The bio');   // nothing adopted: unchanged
}));

test('extras: kinds and links are checked; videos need a YouTube link', () => withWorld(async (w) => {
  const o = ow(w).emptyOwned(), lib = fixtureLib();
  await assert.rejects(ow(w).addExtra('rel_pub', { kind: 'bogus', url: 'https://x.example' }, o, lib, 'n'), /Unknown item type/);
  await assert.rejects(ow(w).addExtra('rel_pub', { kind: 'review', url: 'javascript:alert(1)' }, o, lib, 'n'), /https:\/\//);
  await assert.rejects(ow(w).addExtra('ghost', { kind: 'review', url: 'https://x.example' }, o, lib, 'n'), /Release not found/);
  await assert.rejects(ow(w).addExtra('rel_pub', { kind: 'video', url: 'https://x.example/v' }, o, lib, 'n'), /YouTube/);
  const v = await ow(w).addExtra('rel_pub', { kind: 'video', url: 'https://youtu.be/abcdefghijk', title: 'Clip' }, o, lib, 'n');
  assert.equal(v.image, 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg'); assert.equal(v.title, 'Clip'); assert.equal(v.site, 'YouTube');
  const r = await ow(w).addExtra('rel_pub', { kind: 'review', url: 'https://www.example.com/page' }, o, lib, 'n');   // the page can't be fetched here: falls back to the host name
  assert.equal(r.site, 'example.com'); assert.equal(r.title, 'example.com');
  const u = ow(w).updateExtra(r.extra_id, { title: 'Better', url: 'https://other.example/x' }, o);
  assert.equal(u.title, 'Better'); assert.equal(u.site, 'other.example');
  assert.throws(() => ow(w).updateExtra(r.extra_id, { url: 'ftp://x' }, o), /https:\/\//);
  assert.throws(() => ow(w).updateExtra('ghost', {}, o), /not found/);
  assert.equal(ow(w).deleteExtra(r.extra_id, o), true); assert.equal(o.extras.some(e => e.extra_id === r.extra_id), false);
}));

test('letter, bio and artist links are cleaned', () => withWorld(async (w) => {
  const o = ow(w).emptyOwned();
  assert.deepEqual(ow(w).saveLetter(' Hi ', ' body ', o, 'now'), { title: 'Hi', body: 'body', updated: 'now' });
  assert.equal(ow(w).saveLetter('x', '  ', o, 'now'), null);                    // an empty letter removes it
  assert.equal(ow(w).saveBio('a\r\nb\rc ', o), 'a\nb\nc');
  assert.deepEqual(ow(w).saveArtistLinks({ ' A ': ' https://a.example ', B: '' }, o), { A: 'https://a.example' });
  assert.deepEqual(ow(w).saveArtistLinks('{"C":"https://c.example"}', o), { C: 'https://c.example' });
  assert.throws(() => ow(w).saveArtistLinks({ D: 'javascript:alert(1)' }, o), /should start/);
  assert.equal(ow(w).hostOf('https://www.Example.com:8080/x?y'), 'Example.com');
}));

// ---------------------------------------------------------------- catalog edits (once Cloudflare owns the catalog)
function catalogOwned(w) {
  const o = ow(w).emptyOwned(), lib = fixtureLib();
  o.releases = lib.releases; o.tracks = lib.tracks; o.versions = lib.versions; o.playlists = lib.playlists; o.extras = lib.extras;
  return o;
}
test('saving the track list renumbers songs and keeps credits and extras', () => withWorld(async (w) => {
  const o = catalogOwned(w), c = w.t.catalog;
  o.tracks.push({ track_id: 'trk_a3', release_id: 'rel_pub', track_no: 3, title: 'Third' });
  c.saveTracklist(o, 'rel_pub', 'Renamed', [{ track_id: 'trk_a3', title: 'Now First' }, { track_id: 'trk_a1' }, { track_id: 'trk_sg', title: 'Wrong release' }], false, 'EP');
  assert.equal(o.tracks.find(t => t.track_id === 'trk_a3').track_no, 1); assert.equal(o.tracks.find(t => t.track_id === 'trk_a3').title, 'Now First');
  assert.equal(o.tracks.find(t => t.track_id === 'trk_a1').track_no, 2);
  assert.equal(o.tracks.find(t => t.track_id === 'trk_sg').title, 'Song trk_sg');   // a song from another release is ignored
  const r = o.releases.find(x => x.release_id === 'rel_pub'); assert.equal(r.title, 'Renamed'); assert.equal(r.type, 'EP'); assert.equal(r.album_credits, 'public credits');
}));

test('deleting: a song takes its versions and playlist entries; a release needs its exact name', () => withWorld(async (w) => {
  const o = catalogOwned(w), c = w.t.catalog;
  assert.deepEqual(c.deleteTrack(o, 'trk_a1'), { deleted: 'trk_a1', title: 'Song trk_a1' });
  assert.equal(o.versions.some(v => v.track_id === 'trk_a1'), false);
  assert.equal(o.playlists.some(p => p.tracks.includes('trk_a1')), false);
  assert.throws(() => c.deleteTrack(o, 'trk_a1'), /not found/);
  assert.throws(() => c.deleteRelease(o, 'rel_pub', 'wrong name'), /exactly/);
  assert.equal(o.releases.some(r => r.release_id === 'rel_pub'), true);
  const gone = c.deleteRelease(o, 'rel_pub', '  open ALBUM ');
  assert.equal(gone.deleted, 'rel_pub'); assert.equal(o.releases.some(r => r.release_id === 'rel_pub'), false);
  assert.equal(o.tracks.some(t => t.release_id === 'rel_pub'), false); assert.equal(o.extras.some(e => e.release_id === 'rel_pub'), false);
  assert.throws(() => c.deleteRelease(o, 'ghost', 'x'), /not found/);
}));

test('deleting a version: the last one is protected, and the primary moves on', () => withWorld(async (w) => {
  const o = catalogOwned(w), c = w.t.catalog;
  assert.throws(() => c.deleteVersion(o, 'ver_sg'), /only version/);
  c.deleteVersion(o, 'ver_a1');                                                  // trk_a1 had a hidden second version: it takes over as primary
  assert.equal(o.versions.find(v => v.version_id === 'ver_a1b').is_primary, true);
  assert.throws(() => c.deleteVersion(o, 'ghost'), /not found/);
}));

test('song details: bad YouTube links and empty titles are refused; lengths are cut', () => withWorld(async (w) => {
  const o = catalogOwned(w), c = w.t.catalog;
  assert.throws(() => c.saveTrackDetails(o, 'trk_a1', { video_url: 'https://vimeo.com/1' }), /YouTube/);
  assert.throws(() => c.saveTrackDetails(o, 'trk_a1', { title: ' ' }), /needs a title/);
  assert.throws(() => c.saveTrackDetails(o, 'ghost', {}), /not found/);
  c.saveTrackDetails(o, 'trk_a1', { title: 'T'.repeat(500), lyrics: 'L'.repeat(30000), notes: 'n' });
  const t = o.tracks.find(x => x.track_id === 'trk_a1'); assert.equal(t.title.length, 200); assert.equal(t.lyrics.length, 20000);
}));

// ---------------------------------------------------------------- backups
test('backups: everything is dumped except the rebuildable Sheet copy, and the 30 newest are kept', () => withWorld(async (w) => {
  const b = w.t.backup;
  await w.t.owned.saveOwned(w.db, { ...w.t.owned.emptyOwned(), bio: 'mine' });
  await w.t.fans.joinSubmit(w.db, { firstName: 'A', email: 'a@example.com', emailConsent: true }, '1.1.1.1');
  const dump = await b.dumpAll(w.db);
  assert.ok(dump.tables.fans.length === 1 && dump.tables.kv.some(r => r.k === 'owned'));
  assert.ok(!dump.tables.kv.some(r => /^p:/.test(r.k) || r.k === 'meta'));
  const env = { DB: w.db, BACKUPS: (await import('./_helpers.mjs')).makeBucket() };
  const info = await b.runBackup(env);
  assert.match(info.key, /^db\/soul-vault-\d{4}-\d\d-\d\dT\d\d-\d\d\.json\.gz$/);
  assert.equal((await b.lastBackup(w.db)).key, info.key);
  for (let i = 0; i < 35; i++) await env.BACKUPS.put('db/soul-vault-2020-01-' + String(i + 1).padStart(2, '0') + 'T00-00.json.gz', 'x');
  await b.runBackup(env);
  assert.equal((await b.listBackups(env)).length, 30);
}));

test('backups run by themselves only when the last one is old', () => withWorld(async (w) => {
  const mk = (await import('./_helpers.mjs')).makeBucket, env = { DB: w.db, BACKUPS: mk() };
  await w.t.backup.maybeBackup(env);
  assert.equal((await w.t.backup.listBackups(env)).length, 1);
}));
