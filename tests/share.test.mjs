// What a visitor can and cannot see. These are the privacy rules of the site.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withWorld, fixtureLib, FUTURE } from './_helpers.mjs';

const ids = (arr, k) => arr.map(x => x[k]).sort();

test('the public link shows released music only: no hidden releases, songs or versions', () => withWorld(async (w) => {
  const r = await w.call('getShare', ['PUB']);
  assert.equal(r.ok, true);
  const b = r.result;
  assert.deepEqual(ids(b.releases.filter(x => !x.locked), 'release_id'), ['rel_pub', 'rel_single']);
  assert.deepEqual(ids(b.tracks, 'track_id'), ['trk_a1', 'trk_sg']);          // not the hidden song, the hidden release's song, or the sealed release's song
  assert.deepEqual(ids(b.versions, 'version_id'), ['ver_a1', 'ver_sg']);       // not the hidden version
  const text = JSON.stringify(b);
  for (const secret of ['rel_hid', 'trk_h1', 'ver_h1', 'trk_a2', 'ver_a1b', 'trk_s1', 'ver_s1']) assert.ok(!text.includes(secret), secret + ' leaked');
}));

test('a sealed release shows only as a locked placeholder: no credits, no background, no songs, with its unlock date', () => withWorld(async (w) => {
  const b = (await w.call('getShare', ['PUB'])).result;
  const sealed = b.releases.find(x => x.release_id === 'rel_seal');
  assert.equal(sealed.locked, true);
  assert.equal(sealed.unlock_at, FUTURE);
  assert.equal(sealed.album_credits, '');
  assert.equal(sealed.bg_file_id, '');
  const text = JSON.stringify(b);
  assert.ok(!text.includes('secret credits')); assert.ok(!text.includes('bgsecret123'));
  assert.equal(b.tracks.some(t => t.release_id === 'rel_seal'), false);
}));

test('the artist\'s birthday is never sent to a visitor', () => withWorld(async (w) => {
  for (const token of ['PUB', 'FAN', 'REL', 'TRK', 'VER']) {
    const text = JSON.stringify((await w.call('getShare', [token])).result);
    assert.ok(!text.includes('1990-05-05'), token + ' leaked the birthday');
    assert.ok(!text.includes('birth_date'), token + ' sent a birth_date field');
  }
}));

test('links that are off, expired, unknown or empty are refused with the same message', () => withWorld(async (w) => {
  const msgs = new Set();
  for (const token of ['OFF', 'EXP', 'nope', '', 'pub', ' PUB']) {
    const r = await w.call('getShare', [token]);
    assert.equal(r.ok, true, token);
    assert.ok(r.result.error, 'token "' + token + '" should be refused');
    assert.equal(r.result.releases, undefined);
    msgs.add(r.result.error);
  }
  assert.equal(msgs.size, 1);                    // wrong, capitalised and padded links look exactly like missing ones
}));

test('playlists: fans only see shared playlists, trimmed to songs they can reach', () => withWorld(async (w) => {
  const pls = (await w.call('getShare', ['PUB'])).result.playlists;
  assert.deepEqual(pls.map(p => p.playlist_id), ['pl_1']);                      // the private playlist is not sent
  assert.deepEqual(pls[0].tracks, ['trk_a1']);                                   // hidden songs are taken out of it
}));

test('extras (photos, links) come only from releases the link can see', () => withWorld(async (w) => {
  const ex = (await w.call('getShare', ['PUB'])).result.extras;
  assert.deepEqual(ex.map(x => x.extra_id), ['ext_1']);
}));

test('a single-song link or single-release link shows just that, and no bio', () => withWorld(async (w) => {
  const t = (await w.call('getShare', ['TRK'])).result;
  assert.deepEqual(ids(t.tracks, 'track_id'), ['trk_a1']);
  assert.deepEqual(ids(t.versions, 'version_id'), ['ver_a1']);                   // the hidden version still stays hidden
  assert.equal(t.artist_bio, '');
  const rel = (await w.call('getShare', ['REL'])).result;
  assert.deepEqual(ids(rel.tracks, 'track_id'), ['trk_a1']);                     // hidden song inside a visible release stays hidden
  const ver = (await w.call('getShare', ['VER'])).result;
  assert.deepEqual(ids(ver.versions, 'version_id'), ['ver_a1']);
  const all = (await w.call('getShare', ['PUB'])).result;
  assert.equal(all.artist_bio, 'The bio');                                       // only the "all" link carries the bio
}));

test('the share block tells the app about the link (never "download allowed", fan name) and nothing secret', () => withWorld(async (w) => {
  const r = (await w.call('getShare', ['FAN'])).result;
  assert.deepEqual(r.share, { target_type: 'all', allow_download: false, fan_name: 'Jo', member_no: 1, created: '' });   // downloads are for the owner link only, even for a link saved with them on
  assert.equal((await w.call('getShare', ['PUB'])).result.share.allow_download, false);
}));

test('a second visit is answered from the edge cache with the same content', () => withWorld(async (w) => {
  const a = (await w.call('getShare', ['PUB'])).result, b = (await w.call('getShare', ['PUB'])).result;
  assert.deepEqual(a, b);
}));

test('Studio\'s "unreleased" flags show to visitors, and win over the Sheet', () => withWorld(async (w) => {
  const lib = fixtureLib();
  const body = w.t.share.shareBody({ target_type: 'all' }, lib, new Date(), { flags: { releases: { rel_pub: true }, tracks: { trk_a1: true } }, releases: {}, sr: {} });
  assert.equal(body.releases.find(r => r.release_id === 'rel_pub').unreleased, true);
  assert.equal(body.tracks.find(t => t.track_id === 'trk_a1').unreleased, true);
  const plain = w.t.share.shareBody({ target_type: 'all' }, lib, new Date(), null);
  assert.equal(plain.releases.find(r => r.release_id === 'rel_pub').unreleased, false);
}));

test('listen links and slowed+reverb videos are limited to what the link can see', () => withWorld(async (w) => {
  const lib = fixtureLib(), now = new Date();
  const ov = { releases: { rel_pub: { first: 'DatPiff', links: [['Spotify', 'https://s.example']] }, rel_hid: { first: '', links: [['X', 'https://h.example']] } }, sr: { trk_a1: 'abcdefghijk', trk_h1: 'zzzzzzzzzzz' }, flags: { releases: {}, tracks: {} } };
  const out = w.t.share.overlayFor(w.t.share.shareBody({ target_type: 'all' }, lib, now, ov), ov);
  assert.deepEqual(Object.keys(out.releases), ['rel_pub']);
  assert.deepEqual(Object.keys(out.sr), ['trk_a1']);
}));

test('a cached answer never outlives the moment a sealed release unlocks', () => withWorld(async (w) => {
  const now = new Date('2026-11-12T12:00:00Z');
  const body = { releases: [{ locked: true, unlock_at: '2026-11-12T12:00:30.000Z' }] };
  assert.equal(w.t.share.bodyTtl(body, now, 60), 30);
  assert.equal(w.t.share.bodyTtl({ releases: [{ locked: true, unlock_at: '2026-11-12T12:00:01.000Z' }] }, now, 60), 5);   // never below 5 s
  assert.equal(w.t.share.bodyTtl({ releases: [{ locked: true, unlock_at: FUTURE }] }, now, 60), 60);
  assert.equal(w.t.share.bodyTtl({ releases: [] }, now, 60), 60);
}));

test('liveShare and isLocked handle edges: expiry, inactive, bad dates', () => withWorld(async (w) => {
  const now = new Date('2026-11-12T12:00:00Z');
  assert.equal(w.t.share.liveShare({ active: true }, now), true);
  assert.equal(w.t.share.liveShare({ active: true, expires: '2026-11-12T11:59:59Z' }, now), false);
  assert.equal(w.t.share.liveShare({ active: true, expires: '2026-11-12T12:00:01Z' }, now), true);
  assert.equal(w.t.share.liveShare({ active: 'true' }, now), false);          // only a real true counts
  assert.equal(w.t.share.liveShare(undefined, now), false);
  assert.equal(w.t.share.isLocked({ unlock_at: 'not a date' }, now), false);
  assert.equal(w.t.share.isLocked({ unlock_at: '' }, now), false);
  assert.equal(w.t.share.isLocked({ unlock_at: '2026-11-12T12:00:01Z' }, now), true);
  assert.equal(w.t.share.isLocked({ unlock_at: '2026-11-12T12:00:00Z' }, now), false);   // unlocks at the exact moment
}));

test('a release link shows that release even if it is hidden from the public link (the owner made that link on purpose)', () => withWorld(async (w) => {
  // Characterisation, not a promise: a link aimed at one release does not apply the "hidden"/"sealed" rules of the all-music link.
  const lib = fixtureLib(); lib.shares.push({ token: 'HIDREL', target_type: 'release', target_id: 'rel_hid', active: true });
  const sc = w.t.share.shareScope(lib.shares.find(s => s.token === 'HIDREL'), lib, new Date());
  assert.deepEqual(ids(sc.tracks, 'track_id'), ['trk_h1']);
}));
