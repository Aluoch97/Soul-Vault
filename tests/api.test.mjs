// The /api and /upload endpoints, end to end against a real SQLite database: who is allowed to do what, and what changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { withWorld, fixtureLib, makeBucket, OWNER_KEY, APPS_URL } from './_helpers.mjs';

const cfg = JSON.parse(readFileSync(new URL('../site.config.json', import.meta.url), 'utf8'));
const OWNER_ONLY = ['setOwnerPassword', 'getFans', 'edgeSync', 'backupNow', 'backupGet', 'backupStatus', 'adoptDomain', 'releaseDomain',
  'studioGet', 'studioSaveRelease', 'studioSaveBulk', 'studioSaveTrack', 'studioSaveLinks', 'studioPlanUpload', 'studioAddSong', 'studioNewRelease', 'studioSetCover', 'studioAddPhoto',
  'missingList', 'missingResolve', 'missingHide', 'missingRemove', 'missingAdd'];
const quick = async fn => { const st = globalThis.setTimeout; globalThis.setTimeout = (f, ms, ...a) => st(f, ms === 700 ? 0 : ms, ...a); try { return await fn(); } finally { globalThis.setTimeout = st; } };

// ---------------------------------------------------------------- the owner gate
test('every owner-only action refuses a missing, empty or wrong key', () => withWorld(async (w) => {
  w.env.BACKUPS = makeBucket();
  for (const fn of OWNER_ONLY) {
    for (const args of [[], [''], ['wrong-key'], [OWNER_KEY + 'x'], [OWNER_KEY.slice(0, -1)], [null], [{ toString: () => OWNER_KEY }]]) {
      const r = await w.call(fn, args);
      assert.equal(r.ok, false, `${fn}(${JSON.stringify(args)}) must be refused`);
    }
  }
  assert.deepEqual(w.appsCalls(), []);                                                   // nothing reached Apps Script
  assert.equal(await w.kv('owner_pw'), null);
}));

test('when no owner key is configured on the server, nothing is owner-only-open (an empty key is not a key)', () => withWorld(async (w) => {
  w.env.OWNER_KEY = ''; w.env.BACKUPS = makeBucket();
  for (const fn of OWNER_ONLY) for (const args of [[], [''], [undefined]]) assert.equal((await w.call(fn, args)).ok, false, fn);
  assert.equal((await w.put('img/abcdef12/400', { ownerKey: '' })).status, 401);
  assert.equal((await w.put('img/abcdef12/400', { ownerKey: null })).status, 401);
}));

test('the status call works for anyone and never reveals the key', () => withWorld(async (w) => {
  const r = await w.call('edgeStatus', []);
  assert.equal(r.ok, true); assert.equal(r.result.db, true); assert.equal(r.result.owner_key, true);
  assert.ok(!JSON.stringify(r).includes(OWNER_KEY));
}));

test('bad requests get a plain refusal', () => withWorld(async (w) => {
  const res = await w.t.onRequestPost(w.ctx(new Request('https://x/api', { method: 'POST', body: 'not json{' })));
  assert.deepEqual(await res.json(), { ok: false, error: 'Unknown action.' });
  const r2 = await w.call('studioGet', 'not-an-array');                                  // args that are not a list
  assert.equal(r2.ok, false);
}));

// ---------------------------------------------------------------- uploads
test('upload: only the owner, only allowed names and types, never overwrites', () => withWorld(async (w) => {
  assert.equal((await w.put('img/abcdef12/400', { ownerKey: 'wrong' })).status, 401);
  assert.equal((await w.put('img/abcdef12/400', { ownerKey: null })).status, 401);
  assert.equal(w.media._m.size, 0);
  const ok = await w.put('img/abcdef12/400');
  assert.equal(ok.status, 200); assert.equal(ok.body.ok, true); assert.equal(ok.body.size, 4);
  const stored = w.media._m.get('img/abcdef12/400');
  assert.equal(stored.opts.httpMetadata.contentType, 'image/webp'); assert.match(stored.opts.httpMetadata.cacheControl, /immutable/);
  assert.equal((await w.put('img/abcdef12/400')).status, 409);                          // already there: never overwritten
  assert.equal((await w.put('pub/01-song-ab12.mp3', { type: 'audio/mpeg' })).status, 200);
}));

test('upload: dangerous or unexpected file names are refused', () => withWorld(async (w) => {
  const bad = ['../secret', 'img/../../x/400', 'img/abc/400', 'img/abcdef12/999', 'img/abcdef12/400/extra', '/etc/passwd', 'pub/01-song.exe', 'pub/01-song.mp3.html', 'PUB/01-song.mp3',
    'pub/../x/01-song.mp3', 'a/b/c.mp3', 'x.mp3', 'img/abcdef12/400\n', 'db/soul-vault-2026.json.gz', '', 'pub/.mp3'];
  for (const key of bad) assert.equal((await w.put(key, { type: key.endsWith('.mp3') ? 'audio/mpeg' : 'image/webp' })).status, 400, JSON.stringify(key));
  assert.equal(w.media._m.size, 0);
}));

test('upload: file types, sizes and an unconnected bucket', () => withWorld(async (w) => {
  assert.equal((await w.put('img/abcdef12/400', { type: 'text/html' })).status, 400);
  assert.equal((await w.put('img/abcdef12/400', { type: 'image/svg+xml' })).status, 400);      // SVG can carry scripts
  assert.equal((await w.put('pub/01-song-ab12.mp3', { type: 'image/png' })).status, 400);
  assert.equal((await w.put('img/abcdef12/400', { type: 'IMAGE/JPEG; charset=x' })).status, 200);
  assert.equal((await w.put('img/abcdef34/400', { bytes: new Uint8Array(0), length: 0 })).status, 400);
  assert.equal((await w.put('img/abcdef56/400', { length: 95 * 1024 * 1024 + 1 })).status, 413);
  assert.equal((await w.put('img/abcdef78/400', { length: 95 * 1024 * 1024 })).status, 200);
  w.env.MEDIA = undefined;
  assert.equal((await w.put('img/abcdef99/400')).status, 503);
}));

// ---------------------------------------------------------------- owner password and login
test('owner login: needs a password first, which only the owner can set', () => withWorld(async (w) => {
  assert.match((await w.call('ownerLogin', ['whatever'])).error, /No owner password is set/);
  assert.equal((await w.call('setOwnerPassword', ['wrong', 'a long enough password'])).ok, false);
  assert.match((await w.owner('setOwnerPassword', 'short')).error, /at least 10/);
  assert.match((await w.owner('setOwnerPassword', 'x'.repeat(201))).error, /too long/);
  assert.equal((await w.owner('setOwnerPassword', 'a long enough password')).result, true);
  const rec = await w.kv('owner_pw');
  assert.ok(rec.salt && rec.hash); assert.ok(!JSON.stringify(rec).includes('long enough'));
  const good = await w.call('ownerLogin', ['a long enough password']);
  assert.deepEqual(good, { ok: true, result: { key: OWNER_KEY } });
  assert.match((await quick(() => w.call('ownerLogin', ['a long enough passwore']))).error, /not right/);
  assert.match((await w.call('ownerLogin', [])).error ?? '', /not right|No owner/);
}));

test('owner login: five wrong tries lock that address for 15 minutes, other addresses are unaffected, success resets', () => withWorld(async (w) => {
  await w.owner('setOwnerPassword', 'a long enough password');
  await quick(async () => {
    for (let i = 0; i < 4; i++) assert.match((await w.call('ownerLogin', ['nope'], { ip: '1.1.1.1' })).error, /not right/);
    assert.equal((await w.call('ownerLogin', ['a long enough password'], { ip: '1.1.1.1' })).ok, true);     // a good login resets the count
    for (let i = 0; i < 4; i++) assert.match((await w.call('ownerLogin', ['nope'], { ip: '1.1.1.1' })).error, /not right/);   // still not locked: the count started over
    assert.match((await w.call('ownerLogin', ['nope'], { ip: '1.1.1.1' })).error, /not right/);              // the 5th wrong try
    const locked = await w.call('ownerLogin', ['a long enough password'], { ip: '1.1.1.1' });                // even the right password is refused now
    assert.equal(locked.ok, false); assert.match(locked.error, /Too many wrong tries.*1[0-5] minutes/);
    assert.equal((await w.call('ownerLogin', ['a long enough password'], { ip: '2.2.2.2' })).ok, true);     // someone else is fine
    const k = await w.kv('lf:1.1.1.1'); assert.ok(k.until > Date.now() + 14 * 60e3 && k.until <= Date.now() + 15 * 60e3);
    await w.db.prepare('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)').bind('lf:1.1.1.1', JSON.stringify({ n: 0, until: Date.now() - 1000 })).run();   // time passes
    assert.equal((await w.call('ownerLogin', ['a long enough password'], { ip: '1.1.1.1' })).ok, true);
    assert.deepEqual(await w.kv('lf:1.1.1.1'), { n: 0, until: 0 });
  });
}));

// ---------------------------------------------------------------- fan sign-ups and the fan list
test('sign-up through the API: saved once, the old list is told only about new people, the fan list is owner-only', () => withWorld(async (w) => {
  const me = { firstName: 'Ana', email: 'ana@example.com', emailConsent: true };
  const a = await w.call('joinSubmit', [me], { ip: '5.5.5.5' });
  assert.deepEqual(a.result, { ok: true, added: true });
  assert.equal(w.log.filter(x => x.url.startsWith('https://signup.test')).length, 1);
  assert.deepEqual((await w.call('joinSubmit', [me], { ip: '6.6.6.6' })).result, { duplicate: true });
  assert.equal(w.log.filter(x => x.url.startsWith('https://signup.test')).length, 1);                     // a duplicate is not forwarded again
  assert.match((await w.call('joinSubmit', [{ ...me, email: 'bad' }])).error, /email/);
  assert.equal((await w.call('getFans', [])).ok, false); assert.equal((await w.call('getFans', ['wrong'])).ok, false);
  const fans = await w.owner('getFans');
  assert.deepEqual(fans.result.map(f => f.email), ['ana@example.com']);
}));

// ---------------------------------------------------------------- Studio (Sheet-owned rows)
test('Studio: the owner sees everything (hidden too) but never lyrics; fans cannot call it', () => withWorld(async (w) => {
  const r = (await w.owner('studioGet')).result;
  assert.ok(r.releases.some(x => x.release_id === 'rel_hid'));
  assert.ok(r.tracks.every(t => !('lyrics' in t)));
  assert.deepEqual(r.versions[0], { version_id: 'ver_a1', track_id: 'trk_a1', label: 'Original', is_primary: true, hidden: false });   // no audio addresses
  assert.equal((await w.call('studioGet', ['PUB'])).ok, false);
}));

test('Studio: saving a release sends Apps Script an EMPTY song list (never renumbers) and updates the copy; bad input changes nothing', () => withWorld(async (w) => {
  assert.match((await w.owner('studioSaveRelease', 'rel_pub', { basics: { title: '  ' } })).error, /needs a title/);
  assert.match((await w.owner('studioSaveRelease', 'rel_pub', { basics: { type: 'Podcast' } })).error, /release type/);
  assert.match((await w.owner('studioSaveRelease', 'rel_pub', { world: { world_color: 'red' } })).error, /Theme color/);
  assert.match((await w.owner('studioSaveRelease', 'ghost', { basics: { title: 'x' } })).error, /not found/);
  assert.deepEqual(w.appsCalls(), []);
  const ok = await w.owner('studioSaveRelease', 'rel_pub', { basics: { title: ' New Name ', type: 'EP', hidden: true }, world: { world_tagline: 'tag' } });
  assert.equal(ok.result, true);
  const calls = w.appsCalls();
  assert.equal(calls[0].fn, 'saveTracklist');
  assert.deepEqual(calls[0].args, [OWNER_KEY, 'rel_pub', 'New Name', [], true, 'EP']);                   // [] = no song list, so no renumbering
  assert.equal(calls[1].fn, 'saveWorld'); assert.equal(calls[1].args[2].world_tagline, 'tag');
  const rel = (await w.owner('studioGet')).result.releases.find(x => x.release_id === 'rel_pub');
  assert.equal(rel.title, 'New Name'); assert.equal(rel.type, 'EP'); assert.equal(rel.hidden, true);
}));

test('Studio: changing one field on several releases touches only that field; a bad release does not stop the rest', () => withWorld(async (w) => {
  assert.match((await w.owner('studioSaveBulk', [], { genre: 'x' })).error, /at least one release/);
  assert.match((await w.owner('studioSaveBulk', ['rel_pub'], {})).error, /at least one thing/);
  assert.match((await w.owner('studioSaveBulk', ['rel_pub'], { type: 'Podcast' })).error, /release type/);
  assert.match((await w.owner('studioSaveBulk', ['rel_pub'], { world_color: 'red' })).error, /Theme color/);
  assert.equal((await w.call('studioSaveBulk', ['PUB', ['rel_pub'], { genre: 'x' }])).ok, false);
  assert.deepEqual(w.appsCalls(), []);
  const before = (await w.owner('studioGet')).result.releases.find(x => x.release_id === 'rel_pub');
  const r = (await w.owner('studioSaveBulk', ['rel_pub', 'ghost'], { genre: ' Hip Hop,  hip hop , Gospel' })).result;
  assert.deepEqual(r.saved, ['rel_pub']); assert.equal(r.failed.length, 1); assert.equal(r.failed[0].id, 'ghost'); assert.match(r.failed[0].error, /not found/);
  const after = (await w.owner('studioGet')).result.releases.find(x => x.release_id === 'rel_pub');
  assert.equal(after.genre, 'Hip Hop, Gospel');
  assert.equal(after.title, before.title); assert.equal(after.world_tagline, before.world_tagline); assert.equal(after.type, before.type);
}));

test('Studio: changing several releases once the catalog is ours writes here only (never Apps Script), visibility and unreleased included', () => withWorld(async (w) => {
  assert.equal((await w.owner('adoptDomain', 'catalog')).ok, true);
  const n0 = w.appsCalls().length;
  const r = (await w.owner('studioSaveBulk', ['rel_pub'], { hidden: true, unreleased: true, recorded_at: ' Nashville, TN ', type: 'Unreleased' })).result;
  assert.deepEqual(r.saved, ['rel_pub']); assert.deepEqual(r.failed, []);
  assert.equal(w.appsCalls().length, n0);
  const after = (await w.owner('studioGet')).result;
  const rel = after.releases.find(x => x.release_id === 'rel_pub');
  assert.equal(rel.hidden, true); assert.equal(rel.recorded_at, 'Nashville, TN'); assert.equal(rel.type, 'Unreleased');
  assert.equal(after.overlay.flags.releases.rel_pub, true);
}));

test('Studio: if Apps Script refuses a save, the copy here is not changed', () => withWorld({ failApps: ['saveTracklist'] }, async (w) => {
  const r = await w.owner('studioSaveRelease', 'rel_pub', { basics: { title: 'Changed' } });
  assert.equal(r.ok, false); assert.match(r.error, /Apps Script said no/);
  assert.equal((await w.owner('studioGet')).result.releases.find(x => x.release_id === 'rel_pub').title, 'Open Album');
}));

test('Studio: song edits, unreleased flags and slowed+reverb videos reach visitors at once (the kept answer is dropped)', () => withWorld(async (w) => {
  const before = (await w.call('getShare', ['PUB'])).result;                                              // this fills the edge cache
  assert.equal(before.tracks.find(t => t.track_id === 'trk_a1').unreleased, false);
  assert.match((await w.owner('studioSaveTrack', 'trk_a1', { fields: { video_url: 'https://vimeo.com/1' } })).error, /YouTube/);
  assert.match((await w.owner('studioSaveTrack', 'trk_a1', { fields: { title: ' ' } })).error, /needs a title/);
  assert.match((await w.owner('studioSaveTrack', 'ghost', {})).error, /not found/);
  assert.equal((await w.owner('studioSaveTrack', 'trk_a1', { fields: { title: 'Renamed' }, unreleased: true, sr: 'https://youtu.be/abcdefghijk' })).result, true);
  assert.equal(w.appsCalls().find(c => c.fn === 'saveTrackDetails').args[2].title, 'Renamed');
  const after = (await w.call('getShare', ['PUB'])).result;
  const t = after.tracks.find(x => x.track_id === 'trk_a1');
  assert.equal(t.title, 'Renamed'); assert.equal(t.unreleased, true);
  assert.equal(after.overlay.sr.trk_a1, 'https://youtu.be/abcdefghijk');
}));

test('Studio: streaming links are checked, shown to visitors, and cleared by saving nothing', () => withWorld(async (w) => {
  assert.match((await w.owner('studioSaveLinks', 'rel_pub', { links: [['Spotify', 'javascript:alert(1)']] })).error, /https:\/\//);
  assert.match((await w.owner('studioSaveLinks', 'ghost', { links: [] })).error, /not found/);
  await w.owner('studioSaveLinks', 'rel_pub', { first: 'DatPiff', links: [['Spotify', 'https://open.spotify.com/x']] });
  assert.deepEqual((await w.call('getShare', ['PUB'])).result.overlay.releases.rel_pub, { first: 'DatPiff', links: [['Spotify', 'https://open.spotify.com/x']] });
  await w.owner('studioSaveLinks', 'rel_pub', { first: '', links: [] });
  assert.equal((await w.call('getShare', ['PUB'])).result.overlay, undefined);
}));

test('Studio: a new release starts hidden, so fans cannot see it until the owner un-hides it', () => withWorld(async (w) => {
  assert.match((await w.owner('studioNewRelease', { title: ' ', type: 'EP' })).error, /needs a title/);
  assert.match((await w.owner('studioNewRelease', { title: 'X', type: 'Podcast' })).error, /release type/);
  assert.match((await w.owner('studioNewRelease', { title: 'X', type: 'EP', coverId: '../bad' })).error, /Bad cover/);
  assert.match((await w.owner('studioNewRelease', { title: 'X', type: 'EP', coverId: 'abcdef12' })).error, /cover did not arrive/);
  const r = (await w.owner('studioNewRelease', { title: 'Brand New', type: 'EP', year: '2026abc' })).result;
  assert.equal(r.hidden, true); assert.equal(r.year, '2026'); assert.equal(r.native, true);
  assert.ok((await w.owner('studioGet')).result.releases.some(x => x.release_id === r.release_id));
  const pub = JSON.stringify((await w.call('getShare', ['PUB'])).result);
  assert.ok(!pub.includes(r.release_id) && !pub.includes('Brand New'));
  assert.equal((await w.owner('studioSaveRelease', r.release_id, { basics: { hidden: false } })).result, true);   // un-hide: made here, so no Apps Script call
  assert.deepEqual(w.appsCalls(), []);
  assert.ok(!JSON.stringify((await w.call('getShare', ['PUB'])).result).includes('Brand New'));            // visible but empty: fans see a release only once it has a song
  const key = (await w.owner('studioPlanUpload', { relId: r.release_id, ext: 'mp3', title: 'First Song' })).result.key;
  await w.put(key, { type: 'audio/mpeg' });
  await w.owner('studioAddSong', { relId: r.release_id, key, title: 'First Song' });
  assert.ok(JSON.stringify((await w.call('getShare', ['PUB'])).result).includes('Brand New'));
}));

test('Studio: adding a song needs the uploaded file, a file name inside its own release, and creates track + version', () => withWorld(async (w) => {
  assert.match((await w.owner('studioPlanUpload', { relId: 'ghost', ext: 'mp3', title: 'x' })).error, /not found/);
  assert.match((await w.owner('studioPlanUpload', { relId: 'rel_pub', ext: 'exe', title: 'x' })).error, /MP3, M4A/);
  assert.match((await w.owner('studioPlanUpload', { relId: 'rel_pub', ext: 'mp3', title: ' ' })).error, /title/);
  const plan = (await w.owner('studioPlanUpload', { relId: 'rel_pub', ext: 'MP3', title: 'New Song!' })).result;
  assert.match(plan.key, /^pub\/03-new-song-[0-9a-f]{4}\.mp3$/);                                         // next track number, safe name
  assert.match((await w.owner('studioAddSong', { relId: 'rel_pub', key: plan.key, title: 'New Song' })).error, /did not arrive/);
  assert.match((await w.owner('studioAddSong', { relId: 'rel_pub', key: 'other/03-x.mp3', title: 'x' })).error, /does not belong/);
  assert.match((await w.owner('studioAddSong', { relId: 'rel_pub', key: 'pub/../other/03-x.mp3', title: 'x' })).error, /does not belong/);
  assert.equal((await w.put(plan.key, { type: 'audio/mpeg', bytes: new Uint8Array(2 * 1048576) })).status, 200);
  const r = (await w.owner('studioAddSong', { relId: 'rel_pub', key: plan.key, title: 'New Song', seconds: 125 })).result;
  assert.equal(r.track.track_no, 3); assert.equal(r.track.release_id, 'rel_pub');
  assert.equal(r.version.url, 'https://media.soulnicolas.com/' + plan.key); assert.equal(r.version.duration, '2:05'); assert.equal(r.version.size_mb, 2); assert.equal(r.version.is_primary, true);
  assert.ok((await w.owner('studioGet')).result.tracks.some(t => t.track_id === r.track.track_id));
  assert.deepEqual(w.appsCalls(), []);                                                                    // made here: no Apps Script call
  const second = (await w.owner('studioPlanUpload', { relId: 'rel_pub', trackId: 'trk_a1', ext: 'wav', label: 'Live Mix' })).result;
  assert.match(second.key, /^pub\/01-song-trk-a1-live-mix-[0-9a-f]{4}\.wav$/);
}));

test('Studio: covers and photos must have arrived, and show to visitors once saved', () => withWorld(async (w) => {
  assert.match((await w.owner('studioSetCover', { relId: 'rel_pub', coverId: '../x' })).error, /Bad cover/);
  assert.match((await w.owner('studioSetCover', { relId: 'ghost', coverId: 'abcdef12' })).error, /not found/);
  assert.match((await w.owner('studioSetCover', { relId: 'rel_pub', coverId: 'abcdef12', kind: 'tattoo' })).error, /Unknown picture/);
  assert.match((await w.owner('studioSetCover', { relId: 'rel_pub', coverId: 'abcdef12' })).error, /did not arrive/);
  assert.match((await w.owner('studioSetCover', { relId: 'rel_pub', coverId: 'abcdef12', kind: 'bg' })).error, /did not arrive/);
  await w.put('img/abcdef12/1200');
  assert.equal((await w.owner('studioSetCover', { relId: 'rel_pub', coverId: 'abcdef12' })).result, true);
  assert.equal((await w.call('getShare', ['PUB'])).result.releases.find(r => r.release_id === 'rel_pub').cover_file_id, 'abcdef12');
  await w.put('img/abcdef34/1600');
  assert.match((await w.owner('studioSetCover', { relId: 'rel_pub', coverId: 'abcdef34', kind: 'bg' })).error, /Switch the catalog/);   // needs the catalog on Cloudflare
  assert.match((await w.owner('studioAddPhoto', { relId: 'rel_pub', fileId: 'abcdef56' })).error, /did not arrive/);
  assert.match((await w.owner('studioAddPhoto', { relId: 'rel_pub', fileId: 'bad id' })).error, /Bad photo/);
  const x = (await w.owner('studioAddPhoto', { relId: 'rel_pub', fileId: 'abcdef34', caption: '  Backstage ' })).result;
  assert.equal(x.kind, 'photo'); assert.equal(x.release_id, 'rel_pub');
  assert.ok((await w.call('getShare', ['PUB'])).result.extras.some(e => e.extra_id === x.extra_id));
}));

test('Studio: the missing-files list - add, hide a broken version from fans, resolve with a new upload', () => withWorld(async (w) => {
  assert.deepEqual((await w.owner('missingList')).result, []);
  assert.match((await w.owner('missingAdd', { versionId: 'ghost' })).error, /Song not found/);
  assert.equal((await w.owner('missingAdd', { versionId: 'ver_a1' })).result, true);
  assert.equal((await w.owner('missingAdd', { versionId: 'ver_a1' })).result, true);                       // adding twice does nothing
  assert.equal((await w.owner('missingList')).result.length, 1);
  assert.match((await w.owner('missingHide', 'nope')).error, /not on the list/);
  assert.equal((await w.owner('missingHide', 'ver_a1')).result, true);
  assert.ok(!JSON.stringify((await w.call('getShare', ['PUB'])).result.versions).includes('ver_a1"'));      // the broken version is gone for fans
  assert.deepEqual((await w.owner('missingList')).result, []);
  await w.owner('missingAdd', { versionId: 'ver_sg' });
  assert.match((await w.owner('missingResolve', 'ver_sg', 'ver_new')).error, /new file was not found/);
  const key = (await w.owner('studioPlanUpload', { relId: 'rel_single', trackId: 'trk_sg', ext: 'mp3', label: 'Fixed' })).result.key;
  await w.put(key, { type: 'audio/mpeg' });
  const v = (await w.owner('studioAddSong', { relId: 'rel_single', trackId: 'trk_sg', key, label: 'Fixed', primary: true })).result.version;
  assert.equal((await w.owner('missingResolve', 'ver_sg', v.version_id)).result, true);
  const ids = (await w.call('getShare', ['PUB'])).result.versions.map(x => x.version_id);
  assert.ok(ids.includes(v.version_id) && !ids.includes('ver_sg'));
  assert.equal((await w.owner('missingRemove', 'whatever')).result, true);
}));

// ---------------------------------------------------------------- moving areas off the Sheet
test('adopting an area: owner only, known areas only, and the app then answers those calls itself', () => withWorld(async (w) => {
  assert.equal((await w.call('adoptDomain', ['wrong', 'playlists'])).ok, false);
  assert.match((await w.owner('adoptDomain', 'bananas')).error, /Unknown area/);
  const a = await w.owner('adoptDomain', 'playlists');
  assert.deepEqual(a.result, { area: 'playlists', owned: true, copied: 2 });
  assert.equal((await w.owner('adoptDomain', 'playlists')).result.already, true);
  w.log.length = 0;
  assert.match((await w.call('savePlaylist', ['wrong', { title: 'X' }])).error, /owner key/);              // owner only
  const made = await w.owner('savePlaylist', { title: 'Mine', tracks: ['trk_a1'], fans: true });
  assert.equal(made.ok, true); assert.deepEqual(w.appsCalls(), []);                                       // handled here, not sent to Apps Script
  const fan = await w.call('getPlaylists', ['', 'PUB']);
  assert.deepEqual(fan.result.playlists.map(p => p.title).sort(), ['Mine', 'Shared']);
  assert.equal((await w.call('getPlaylists', ['', 'OFF'])).result.error, 'This link has expired or been turned off.');
  assert.equal((await w.owner('releaseDomain', 'playlists')).result.owned, false);                        // back to the Sheet
}));

test('after extras move over, the old Apps Script photo calls are refused instead of writing to the Sheet', () => withWorld(async (w) => {
  await w.owner('adoptDomain', 'extras');
  const r = await w.owner('addPhoto', 'rel_pub', 'x');
  assert.equal(r.ok, false); assert.match(r.error, /isn't available yet/);
}));

test('share links, comments and plays after "activity" moves over: owner-only management, public link protected', () => withWorld(async (w) => {
  await w.owner('adoptDomain', 'activity');
  assert.equal((await w.call('createShare', ['wrong', { targetType: 'all' }])).ok, false);
  const s = (await w.owner('createShare', { targetType: 'release', targetId: 'rel_pub', label: 'For Ana' })).result;
  assert.equal(s.url, (cfg.siteUrl || 'https://' + cfg.domain).replace(/\/$/, '') + '/?s=' + s.token);
  assert.deepEqual((await w.call('getShare', [s.token])).result.tracks.map(t => t.track_id), ['trk_a1']);   // the new link works at once
  assert.match((await w.owner('deleteShare', cfg.publicToken)).error, /cannot be deleted/);
  assert.equal((await w.call('setShareActive', ['wrong', s.token, false])).ok, false);
  await w.owner('setShareActive', s.token, false);
  assert.ok((await w.call('getShare', [s.token])).result.error);                                          // switched off: refused
  const live = (await w.owner('createShare', { targetType: 'all' })).result;
  assert.equal((await w.call('recordPlay', [live.token])).result, true);
  assert.equal((await w.call('recordPlay', ['nope'])).result, false);
  const c = (await w.call('addComment', ['', live.token, 'ver_a1', 4, 'Fan', 'love it'])).result;      // the first slot is the owner key; fans leave it empty
  assert.equal(c.text, 'love it');
  assert.equal((await w.call('getComments', ['', live.token, 'ver_a1'])).result.length, 1);
  assert.deepEqual((await w.call('getComments', ['', 'nope', 'ver_a1'])).result, []);
  assert.equal((await w.call('deleteComment', ['wrong', c.comment_id])).ok, false);                       // fans cannot delete
  assert.equal((await w.owner('deleteComment', c.comment_id)).result, true);
  assert.equal((await w.call('getInsights', ['wrong', 30])).ok, false);
  assert.equal((await w.call('errorSummary', [])).ok, false);
  assert.equal((await w.call('logClientError', ['boom', 'phone'])).result, true);
  assert.equal((await w.owner('errorSummary')).result.total, 1);
}));

// ---------------------------------------------------------------- everything else goes to Apps Script
test('calls this backend does not own go straight to Apps Script, and a successful library change refreshes the copy', () => withWorld(async (w) => {
  w.log.length = 0;
  const r = await w.call('someOldCall', [1, 2]);
  assert.deepEqual(r, { ok: true, result: true });                                                        // Apps Script's own answer, passed through
  assert.deepEqual(w.appsCalls(), [{ fn: 'someOldCall', args: [1, 2] }]);
  w.log.length = 0;
  await w.call('deleteTrack', [OWNER_KEY, 'trk_a2']);                                                     // one of the calls that changes the library
  assert.ok(w.log.some(x => x.body && x.body.fn === 'getLibrary'));                                       // the copy is refreshed from the Sheet
}));

test('if Apps Script cannot be reached the visitor gets a plain message', () => withWorld(async (w) => {
  const f = globalThis.fetch; globalThis.fetch = async () => { throw new Error('offline'); };
  try { const r = await w.call('someOldCall', []); assert.equal(r.ok, false); assert.match(r.error, /Could not reach Soul Vault/); }
  finally { globalThis.fetch = f; }
}));

// ---------------------------------------------------------------- Home picks and backups
test('Home picks: newest single and project, only from covers we hold; otherwise Apps Script answers', () => withWorld(async (w) => {
  w.log.length = 0;
  assert.equal((await w.call('getHome', ['PUB'])).result, true);                                          // no covers in storage yet: falls back to Apps Script
  await w.put('img/cover_rel_pub_xx/400'); await w.put('img/cover_rel_single_xx/1200');
  const h = (await w.call('getHome', ['PUB'])).result.picks;
  assert.equal(h.project.release_id, 'rel_pub'); assert.equal(h.project.src, 'https://media.soulnicolas.com/img/cover_rel_pub_xx/400');
  assert.equal(h.single.release_id, 'rel_single'); assert.equal(h.single.src, 'https://media.soulnicolas.com/img/cover_rel_single_xx/1200');
  assert.deepEqual((await w.call('getHome', ['REL'])).result, { picks: {} });                             // only the all-music link gets picks
  assert.ok((await w.call('getHome', ['nope'])).result.error);
}));

test('backups over the API: owner only, include everything private, and are never public', () => withWorld(async (w) => {
  assert.match((await w.owner('backupNow')).error, /not set up/);
  w.env.BACKUPS = makeBucket();
  await w.owner('setOwnerPassword', 'a long enough password');
  assert.equal((await w.call('backupNow', ['wrong'])).ok, false);
  const now = (await w.owner('backupNow')).result;
  assert.match(now.key, /^db\/soul-vault-/); assert.ok(now.rows.kv >= 1);
  const status = (await w.owner('backupStatus')).result; assert.equal(status.files.length, 1);
  const dump = (await w.owner('backupGet')).result; assert.ok(dump.tables.kv.some(r => r.k === 'owner_pw'));   // it holds the password hash, so owner only
}));
