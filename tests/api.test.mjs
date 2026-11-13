// The /api and /upload endpoints, end to end against a real SQLite database: who is allowed to do what, and what changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { withWorld, fixtureLib, makeBucket, OWNER_KEY, APPS_URL } from './_helpers.mjs';

const cfg = JSON.parse(readFileSync(new URL('../site.config.json', import.meta.url), 'utf8'));
const OWNER_ONLY = ['addSoundcloudSong', 'createReleaseFromSoundcloud', 'setOwnerPassword', 'getFans', 'edgeSync', 'backupNow', 'backupGet', 'backupStatus', 'adoptDomain', 'releaseDomain',
  'studioGet', 'studioSaveRelease', 'studioSaveBulk', 'studioSaveTrack', 'studioSaveLinks', 'studioPlanUpload', 'studioAddSong', 'studioNewRelease', 'studioSetCover', 'studioSetVoice', 'studioReplaceAudio', 'studioAddPhoto',
  'missingList', 'missingResolve', 'missingLink', 'missingHide', 'missingRemove', 'missingAdd'];
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

test('Voice notes: kept on our own storage, only once the catalog is on Cloudflare, only inside their own release, and removable', () => withWorld(async (w) => {
  const plan = { relId: 'rel_pub', trackId: 'trk_a1', kind: 'voice', ext: 'm4a' };
  assert.match((await w.owner('studioPlanUpload', plan)).error, /Switch the catalog/);                    // catalog still on the Sheet: the old Drive way applies, and nothing is uploaded first
  assert.match((await w.owner('studioSetVoice', { relId: 'rel_pub', trackId: 'trk_a1', key: '' })).error, /Switch the catalog/);
  assert.equal((await w.owner('adoptDomain', 'catalog')).ok, true);
  assert.match((await w.owner('studioPlanUpload', { ...plan, trackId: 'ghost' })).error, /Song not found/);
  assert.match((await w.owner('studioPlanUpload', { ...plan, relId: 'ghost' })).error, /not found/);
  assert.match((await w.owner('studioPlanUpload', { ...plan, ext: 'exe' })).error, /MP3, M4A/);
  const key = (await w.owner('studioPlanUpload', plan)).result.key;
  assert.match(key, /^pub\/voice-01-song-trk-a1-[0-9a-f]{4}\.m4a$/);                                       // next to the songs, safe name, a short random tail so a re-upload never collides
  assert.match((await w.owner('studioSetVoice', { relId: 'rel_pub', trackId: 'trk_a1', key })).error, /did not arrive/);
  assert.match((await w.owner('studioSetVoice', { relId: 'rel_pub', trackId: 'trk_a1', key: 'other/voice-01-x.m4a' })).error, /not a voice note for this release/);
  assert.match((await w.owner('studioSetVoice', { relId: 'rel_pub', trackId: 'trk_a1', key: 'pub/01-song-trk-a1-live-aaaa.mp3' })).error, /not a voice note/);   // a song file is not a voice note
  assert.match((await w.owner('studioSetVoice', { relId: 'rel_pub', trackId: 'trk_a1', key: 'pub/voice-../../x.m4a' })).error, /not a voice note/);
  assert.match((await w.owner('studioSetVoice', { relId: 'rel_pub', trackId: 'ghost', key })).error, /Song not found/);
  assert.equal((await w.put(key, { type: 'audio/mp4', bytes: new Uint8Array(1024) })).status, 200);
  assert.deepEqual((await w.owner('studioSetVoice', { relId: 'rel_pub', trackId: 'trk_a1', key })).result, { voice_note_id: 'r2:' + key });
  const pub = async () => (await w.call('getShare', ['PUB'])).result;
  assert.equal((await pub()).tracks.find(t => t.track_id === 'trk_a1').voice_note_id, 'r2:' + key);       // fans see it
  assert.equal((await w.owner('studioGet')).result.tracks.find(t => t.track_id === 'trk_a1').voice_note_id, 'r2:' + key);   // so does the owner
  assert.equal((await w.owner('studioPlanUpload', plan)).result.key === key, false);                     // a new plan never reuses the name
  assert.deepEqual((await w.owner('studioSetVoice', { relId: 'rel_pub', trackId: 'trk_a1', key: '' })).result, { voice_note_id: '' });
  assert.equal((await pub()).tracks.find(t => t.track_id === 'trk_a1').voice_note_id, '');
  assert.ok(await w.env.MEDIA.head(key), 'removing a voice note never deletes the uploaded file');
  assert.deepEqual(w.appsCalls(), []);                                                                    // none of it went to Apps Script
}));

test('Voice notes: the app plays "r2:" notes from our storage address and uses the Cloudflare way when it is on', () => {
  const app = readFileSync(new URL('../src/app/js/09-club-letters-new-release.js', import.meta.url), 'utf8');
  const boot = readFileSync(new URL('../src/app/js/01-boot-and-helpers.js', import.meta.url), 'utf8');
  const native = readFileSync(new URL('../functions/_lib/native.js', import.meta.url), 'utf8');
  assert.equal((/MEDIA_BASE = '([^']+)'/.exec(boot) || [])[1], (/MEDIA_BASE = '([^']+)'/.exec(native) || [])[1]);   // one address for our storage, in the app and the backend
  assert.match(app, /\/\^r2:\/\.test\(t\.voice_note_id\) \? MEDIA_BASE \+ t\.voice_note_id\.slice\(3\)/);
  assert.match(app, /studioPlanUpload', BOOT\.key, \{ relId: t\.release_id, trackId: tid, kind: 'voice'/);
  assert.match(app, /studioSetVoice/);
});

test('Animated covers: a GIF kept on our storage with a still preview, only once the catalog is on Cloudflare; any other cover clears it', () => withWorld(async (w) => {
  const set = (extra) => w.owner('studioSetCover', { relId: 'rel_pub', coverId: 'gifcover1', kind: 'cover', animated: true, ...extra });
  const rel = async () => (await w.call('getShare', ['PUB'])).result.releases.find(r => r.release_id === 'rel_pub');
  assert.match((await set({ preflight: true })).error, /Switch the catalog/);                              // catalog still on the Sheet: the app uses the Drive way and uploads nothing here
  assert.match((await set({})).error, /Switch the catalog/);
  assert.equal((await w.owner('adoptDomain', 'catalog')).ok, true);
  assert.equal((await set({ preflight: true })).result, true);                                             // asks only: needs no file and changes nothing
  assert.equal((await rel()).cover_type || '', '');
  assert.match((await w.owner('studioSetCover', { relId: 'rel_pub', coverId: 'gifcover1', kind: 'bg', animated: true })).error, /Only the main cover/);
  assert.match((await set({ coverId: '../x' })).error, /Bad cover/);
  assert.match((await set({ relId: 'ghost' })).error, /not found/);
  assert.match((await set({})).error, /did not arrive/);
  assert.equal((await w.put('img/notagif01/1200', { type: 'image/jpeg' })).status, 200);
  assert.match((await set({ coverId: 'notagif01' })).error, /need to be GIF/);                               // a picture that is not a GIF is not an animated cover
  assert.equal((await w.put('img/gifcover1/1200', { type: 'image/gif', bytes: new Uint8Array(100) })).status, 200);
  const thumb = 'data:image/jpeg;base64,/9j/4AAQSkZJRgAB';
  assert.deepEqual((await set({ thumb })).result, { fileId: 'gifcover1', thumb });
  const r1 = await rel(); assert.deepEqual([r1.cover_file_id, r1.cover_type, r1.cover_thumb], ['gifcover1', 'gif', thumb]);   // fans get the GIF, its type and its still preview
  assert.equal((await w.put('img/gifcover2/1200', { type: 'image/gif' })).status, 200);
  assert.equal((await set({ coverId: 'gifcover2', thumb: 'javascript:alert(1)' })).result.thumb, '');         // a preview that is not a small JPEG picture is dropped
  assert.equal((await w.put('img/gifcover3/1200', { type: 'image/gif' })).status, 200);
  assert.equal((await set({ coverId: 'gifcover3', thumb: 'data:image/jpeg;base64,' + 'A'.repeat(45000) })).result.thumb, '');   // so is one over 45 KB
  assert.equal((await w.put('img/stillcov1/1200', { type: 'image/jpeg' })).status, 200);
  assert.equal((await w.owner('studioSetCover', { relId: 'rel_pub', coverId: 'stillcov1' })).result, true);      // an ordinary cover afterwards clears the animation
  const r2 = await rel(); assert.deepEqual([r2.cover_file_id, r2.cover_type || '', r2.cover_thumb || ''], ['stillcov1', '', '']);
  assert.deepEqual(w.appsCalls(), []);                                                                       // none of it went to Apps Script
}));

test('Animated covers: the app sends the GIF as the big sizes, still pictures for the grid, and falls back to Drive on the old catalog', () => {
  const gif = readFileSync(new URL('../src/app/js/10-release-extras-and-song-covers.js', import.meta.url), 'utf8');
  const studio = readFileSync(new URL('../src/app/js/05-vault-and-studio.js', import.meta.url), 'utf8');
  assert.match(gif, /preflight: true/);                                                                       // asks before uploading
  assert.match(gif, /uploadPicture\(file, id, \['t', '160', '400'\]\)/);
  assert.match(gif, /putFile\('img\/' \+ id \+ '\/1200', file, 'image\/gif'\); await putFile\('img\/' \+ id \+ '\/1600', file, 'image\/gif'\)/);
  assert.match(gif, /animated: true, thumb/);
  assert.match(gif, /getUploadTicket[\s\S]*setAnimatedCover/);                                               // the Drive way is still there for the old catalog
  assert.match(studio, /f\.type === 'image\/gif'\) \{ await uploadGifCover\(f, rid\)/);                         // Studio keeps a GIF animated too
});

test('Replace audio: a version keeps its name, order and links but plays the new file; only on the Cloudflare catalog, only from its own release', () => withWorld(async (w) => {
  const plan = { relId: 'rel_pub', trackId: 'trk_a1', label: 'Original', ext: 'mp3' };
  const ver = async () => (await w.call('getShare', ['PUB'])).result.versions.find(v => v.version_id === 'ver_a1');
  assert.match((await w.owner('studioReplaceAudio', { versionId: 'ver_a1', preflight: true })).error, /Switch the catalog/);   // catalog still on the Sheet: the app uses the Drive way and uploads nothing here
  assert.match((await w.owner('studioReplaceAudio', { versionId: 'ver_a1', key: 'pub/x.mp3' })).error, /Switch the catalog/);
  assert.equal((await w.owner('adoptDomain', 'catalog')).ok, true);
  const before = await ver(), countBefore = (await w.owner('studioGet')).result.versions.filter(v => v.track_id === 'trk_a1').length;
  assert.equal((await w.owner('studioReplaceAudio', { versionId: 'ver_a1', preflight: true })).result, true);   // asks only: no file needed, nothing changes
  assert.deepEqual(await ver(), before);
  assert.match((await w.owner('studioReplaceAudio', { versionId: 'ghost', preflight: true })).error, /not found/);
  const key = (await w.owner('studioPlanUpload', plan)).result.key;
  assert.match((await w.owner('studioReplaceAudio', { versionId: 'ver_a1', key })).error, /did not arrive/);
  for (const bad of ['other/01-x-aaaa.mp3', 'pub/../other/01-x.mp3', 'pub/voice-01-x-aaaa.mp3', '']) assert.match((await w.owner('studioReplaceAudio', { versionId: 'ver_a1', key: bad })).error, /does not belong/, bad);
  assert.equal((await w.put(key, { type: 'audio/mpeg', bytes: new Uint8Array(2 * 1048576) })).status, 200);
  const r = (await w.owner('studioReplaceAudio', { versionId: 'ver_a1', key, seconds: 125 })).result;
  assert.equal(r.version_id, 'ver_a1'); assert.equal(r.track_id, 'trk_a1'); assert.equal(r.label, before.label); assert.equal(r.is_primary, before.is_primary);   // same version, same name and order
  assert.equal(r.audio, 'r2:' + key); assert.equal(r.url, 'https://media.soulnicolas.com/' + key); assert.equal(r.duration, '2:05'); assert.equal(r.size_mb, 2); assert.equal(r.format, 'MP3');
  const after = await ver(); assert.deepEqual([after.url, after.audio, after.duration], [r.url, r.audio, '2:05']);   // fans get the new file
  assert.equal((await w.owner('studioGet')).result.versions.filter(v => v.track_id === 'trk_a1').length, countBefore);   // replaced in place: no extra version
  const key2 = (await w.owner('studioPlanUpload', plan)).result.key; assert.notEqual(key2, key);              // a second replacement gets its own name
  assert.equal((await w.put(key2, { type: 'audio/mpeg' })).status, 200);
  assert.equal((await w.owner('studioReplaceAudio', { versionId: 'ver_a1', key: key2 })).result.audio, 'r2:' + key2);
  assert.ok(await w.env.MEDIA.head(key), 'the earlier file is never deleted');
  assert.deepEqual(w.appsCalls(), []);                                                                         // none of it went to Apps Script
}));

test('Replace audio: the app uses the Cloudflare way when it is on and the Drive way on the old catalog; one streaming-copy step is shared with adding songs', () => {
  const m = readFileSync(new URL('../src/app/js/07-covers-player-and-details.js', import.meta.url), 'utf8');
  const st = readFileSync(new URL('../src/app/js/05-vault-and-studio.js', import.meta.url), 'utf8');
  assert.match(m, /EDGE_UPLOADS\(\) \? await replaceAudioOnEdge\(file, old, t,/);
  assert.match(m, /if \(!o\) \{[\s\S]*getUploadTicket[\s\S]*updateVersion/);
  assert.match(st, /studioReplaceAudio', BOOT\.key, \{ versionId: v\.version_id, preflight: true \}/);
  assert.equal((st.match(/await streamingCopy\(file, stat, bar\)/g) || []).length, 2);                      // adding a song and replacing audio make the same streaming copy
});

// ---------------------------------------------------------------- YouTube songs, releases and videos (the key is the Cloudflare secret YOUTUBE_API_KEY)
const YT = { fn: ['addYoutubeSong', 'createReleaseFromYoutube', 'addYoutubePlaylistVideos', 'refreshYoutubeTitles', 'youtubeTitleStatus', 'checkYoutube'] };
const todayTag = () => 'api:' + new Date().toISOString().slice(0, 10);
async function ytWorld(w, { catalog = true } = {}) {
  w.env.YOUTUBE_API_KEY = 'test-yt-key';
  w.youtube.videos = { dQw4w9WgXcQ: 'Never Gonna Give You Up (Official)', aaaaaaaaaaa: 'One', ccccccccccc: 'Three' };
  w.youtube.playlists = { PLabcdefghij1: { title: 'My Mixtape', videos: [{ id: 'aaaaaaaaaaa', title: 'One' }, { id: 'bbbbbbbbbbb', title: 'Private video' }, { id: 'ccccccccccc', title: 'Three' }] } };
  if (catalog) assert.equal((await w.owner('adoptDomain', 'catalog')).ok, true);
}

test('YouTube: until the catalog or the extras are switched over the old script does it; after that it is done here and needs the key', () => withWorld(async (w) => {
  w.youtube.videos = { dQw4w9WgXcQ: 'x' };
  const r = await w.owner('addYoutubeSong', { releaseId: 'rel_pub', url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(r.ok, true); assert.ok(w.appsCalls().some(c => c.fn === 'addYoutubeSong'));                 // the old way, unchanged
  assert.deepEqual(w.ytCalls, []);
  assert.equal((await w.owner('adoptDomain', 'catalog')).ok, true);
  const noKey = /YOUTUBE_API_KEY/;                                                                            // no key: a clear message, never the old script's "not available yet"
  assert.match((await w.owner('createReleaseFromYoutube', { url: 'https://youtu.be/dQw4w9WgXcQ' })).error, noKey);
  assert.match((await w.owner('addYoutubePlaylistVideos', 'rel_pub', 'https://www.youtube.com/playlist?list=PLabcdefghij1')).error, noKey);
  assert.match((await w.owner('checkYoutube')).result.message, noKey);
  assert.deepEqual((await w.owner('youtubeTitleStatus')).result, { total: 0, stale: 0 });
  assert.deepEqual((await w.owner('refreshYoutubeTitles', false)).result, { checked: 0, updated: 0, gone: 0 });
  const song = (await w.owner('addYoutubeSong', { releaseId: 'rel_pub', url: 'https://youtu.be/dQw4w9WgXcQ' })).result.track;   // a single song needs no key: its title comes from YouTube's public lookup
  assert.equal(song.title, 'x'); assert.equal(song.title_src || '', '');                                       // (and is not refreshed later, because only the key can)
  assert.deepEqual(w.ytCalls, []);
  const apps = w.appsCalls().length;
  for (const fn of YT.fn) for (const args of [[], [''], ['wrong-key']]) assert.equal((await w.call(fn, [...args, { releaseId: 'rel_pub', url: 'https://youtu.be/dQw4w9WgXcQ' }])).ok, false, fn);   // owner-only
  assert.equal(w.appsCalls().length, apps); assert.deepEqual(w.ytCalls, []);
}));

test('YouTube: a song from a link plays through YouTube; the title comes from YouTube unless you typed one; no duplicates', () => withWorld(async (w) => {
  await ytWorld(w);
  const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5s';
  assert.match((await w.owner('addYoutubeSong', { releaseId: 'rel_pub', url: 'https://example.com/x' })).error, /doesn't look like a YouTube video link/);
  assert.match((await w.owner('addYoutubeSong', { releaseId: 'ghost', url })).error, /Release not found/);
  const r = (await w.owner('addYoutubeSong', { releaseId: 'rel_pub', url })).result;
  assert.equal(r.track.title, 'Never Gonna Give You Up (Official)'); assert.equal(r.track.video_url, 'https://youtu.be/dQw4w9WgXcQ'); assert.equal(r.track.track_no, 3); assert.equal(r.track.title_src, todayTag());
  assert.deepEqual([r.version.label, r.version.format, r.version.is_primary, r.version.audio, r.version.track_id], ['YouTube', 'YOUTUBE', true, '', r.track.track_id]);
  assert.ok(w.ytCalls.every(c => c.params.key === 'test-yt-key'));                                           // the Cloudflare secret is what is sent
  const fan = (await w.call('getShare', ['PUB'])).result;
  assert.ok(fan.tracks.some(t => t.track_id === r.track.track_id && t.video_url === 'https://youtu.be/dQw4w9WgXcQ') && fan.versions.some(v => v.version_id === r.version.version_id));
  assert.match((await w.owner('addYoutubeSong', { releaseId: 'rel_pub', url: 'https://youtu.be/dQw4w9WgXcQ' })).error, /already a song in this release/);
  const typed = (await w.owner('addYoutubeSong', { releaseId: 'rel_pub', url: 'https://youtu.be/aaaaaaaaaaa', title: '  My own words ' })).result;
  assert.equal(typed.track.title, 'My own words'); assert.equal(typed.track.title_src || '', '');            // your own words are never refreshed from YouTube
  w.youtube.error = { status: 403, reason: 'quotaExceeded' };                                                  // the key's allowance used up: the song is still added, titled by YouTube's public lookup
  const viaLookup = (await w.owner('addYoutubeSong', { releaseId: 'rel_pub', url: 'https://youtu.be/ccccccccccc' })).result.track;
  assert.equal(viaLookup.title, 'Three'); assert.equal(viaLookup.title_src || '', '');
  assert.equal((await w.owner('addYoutubeSong', { releaseId: 'rel_pub', url: 'https://youtu.be/eeeeeeeeeee' })).result.track.title, 'YouTube song');   // nothing can read the title: a plain one
  assert.deepEqual(w.appsCalls().filter(c => /Youtube/i.test(c.fn)), []);
}));

test('YouTube: a release from a playlist or a video starts hidden, keeps the first video as its cover at every size, and caps at 100 songs', () => withWorld(async (w) => {
  await ytWorld(w);
  assert.match((await w.owner('createReleaseFromYoutube', { url: 'https://example.com' })).error, /doesn't look like a YouTube video or playlist link/);
  const r = (await w.owner('createReleaseFromYoutube', { url: 'https://www.youtube.com/playlist?list=PLabcdefghij1', year: '2024' })).result;
  assert.deepEqual([r.release.title, r.release.type, r.release.year, r.release.hidden, r.playlist, r.total, r.truncated], ['My Mixtape', 'Album', '2024', true, 'My Mixtape', 2, false]);   // the "Private video" entry is left out
  assert.deepEqual(r.tracks.map(t => [t.track_no, t.title, t.video_url, t.title_src]), [[1, 'One', 'https://youtu.be/aaaaaaaaaaa', todayTag()], [2, 'Three', 'https://youtu.be/ccccccccccc', todayTag()]]);
  assert.ok(r.versions.every(v => v.format === 'YOUTUBE' && v.is_primary && v.audio === ''));
  assert.match(r.release.cover_file_id, /^c[0-9a-f]{16}$/);
  for (const size of ['t', '160', '400', '1200', '1600']) assert.ok(await w.env.MEDIA.head('img/' + r.release.cover_file_id + '/' + size), 'cover size ' + size);
  assert.ok(!JSON.stringify((await w.call('getShare', ['PUB'])).result).includes('My Mixtape'), 'hidden from fans until you show it');
  assert.ok((await w.owner('studioGet')).result.releases.some(x => x.release_id === r.release.release_id));
  const single = (await w.owner('createReleaseFromYoutube', { url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Just One', type: 'Tape' })).result;      // an unknown type falls back to automatic
  assert.deepEqual([single.release.title, single.release.type, single.tracks.length], ['Just One', 'Single', 1]);
  w.ytImages['maxresdefault.jpg'] = false;                                                                     // no big picture: the smaller one is used
  assert.match((await w.owner('createReleaseFromYoutube', { url: 'https://youtu.be/aaaaaaaaaaa' })).result.release.cover_file_id, /^c/);
  w.ytImages['hqdefault.jpg'] = false;                                                                         // no picture at all: still made, without a cover
  assert.equal((await w.owner('createReleaseFromYoutube', { url: 'https://youtu.be/ccccccccccc' })).result.release.cover_file_id, '');
  w.youtube.playlists.PLbigbigbig1 = { title: 'Big', videos: Array.from({ length: 150 }, (_, i) => ({ id: 'v' + String(i).padStart(10, '0'), title: 'Song ' + i })) };
  const big = (await w.owner('createReleaseFromYoutube', { url: 'https://www.youtube.com/playlist?list=PLbigbigbig1' })).result;
  assert.deepEqual([big.tracks.length, big.total, big.truncated], [100, 150, true]);
  w.youtube.playlists.PLemptyempt1 = { title: 'Empty', videos: [{ id: 'zzzzzzzzzzz', title: 'Deleted video' }] };
  assert.match((await w.owner('createReleaseFromYoutube', { url: 'https://www.youtube.com/playlist?list=PLemptyempt1' })).error, /no public videos/);
  assert.deepEqual(w.appsCalls().filter(c => /Youtube/i.test(c.fn)), []);
}));

test('YouTube: every video of a playlist becomes a video on the release page, once each, wherever the extras live', () => withWorld(async (w) => {
  await ytWorld(w);
  const url = 'https://www.youtube.com/playlist?list=PLabcdefghij1';
  assert.match((await w.owner('addYoutubePlaylistVideos', 'ghost', url)).error, /Release not found/);
  const first = (await w.owner('addYoutubePlaylistVideos', 'rel_pub', url)).result;
  assert.deepEqual([first.added.length, first.skipped, first.total, first.playlist, first.truncated], [2, 0, 2, 'My Mixtape', false]);
  assert.deepEqual(first.added.map(x => [x.kind, x.url, x.title, x.site, x.image, x.title_src]), [['video', 'https://youtu.be/aaaaaaaaaaa', 'One', 'YouTube', 'https://i.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg', todayTag()], ['video', 'https://youtu.be/ccccccccccc', 'Three', 'YouTube', 'https://i.ytimg.com/vi/ccccccccccc/hqdefault.jpg', todayTag()]]);
  assert.equal((await w.call('getShare', ['PUB'])).result.extras.filter(x => x.kind === 'video' && x.release_id === 'rel_pub').length >= 2, true);   // fans see them
  const again = (await w.owner('addYoutubePlaylistVideos', 'rel_pub', url)).result;
  assert.deepEqual([again.added.length, again.skipped], [0, 2]);                                               // nothing is added twice
  assert.equal((await w.owner('adoptDomain', 'extras')).ok, true);                                             // once the extras are Cloudflare's own, they are kept there
  w.youtube.playlists.PLsecondsecon = { title: 'Second', videos: [{ id: 'ddddddddddd', title: 'Four' }] };
  assert.equal((await w.owner('addYoutubePlaylistVideos', 'rel_pub', 'https://www.youtube.com/playlist?list=PLsecondsecon')).result.added.length, 1);
  assert.deepEqual((await w.owner('addYoutubePlaylistVideos', 'rel_pub', url)).result.added, []);              // still remembers the first ones
  assert.equal((await w.call('getShare', ['PUB'])).result.extras.filter(x => x.kind === 'video' && x.release_id === 'rel_pub').length >= 3, true);
}));

test('YouTube: titles taken from YouTube are kept fresh (every 25 days), your own words never are, and a video that is gone says so', () => withWorld(async (w) => {
  await ytWorld(w);
  const a1 = (await w.owner('addYoutubeSong', { releaseId: 'rel_pub', url: 'https://youtu.be/dQw4w9WgXcQ' })).result.track;
  await w.owner('addYoutubeSong', { releaseId: 'rel_pub', url: 'https://youtu.be/aaaaaaaaaaa', title: 'Mine' });
  await w.owner('addYoutubePlaylistVideos', 'rel_pub', 'https://www.youtube.com/playlist?list=PLabcdefghij1');
  assert.deepEqual((await w.owner('youtubeTitleStatus')).result, { total: 3, stale: 0 });                      // the song + 2 videos; "Mine" is not counted
  const calls = w.ytCalls.length;
  assert.deepEqual((await w.owner('refreshYoutubeTitles', false)).result, { checked: 0, updated: 0, gone: 0 });   // nothing is due yet
  assert.equal(w.ytCalls.length, calls, 'nothing due means no YouTube request');
  w.db._raw.exec("UPDATE kv SET v = REPLACE(v, '" + todayTag() + "', 'api:2020-01-01')");                       // pretend they were read long ago
  assert.deepEqual((await w.owner('youtubeTitleStatus')).result, { total: 3, stale: 3 });
  w.youtube.videos.dQw4w9WgXcQ = 'Renamed on YouTube'; delete w.youtube.videos.ccccccccccc;                    // one renamed, one removed
  const out = (await w.owner('refreshYoutubeTitles', false)).result;
  assert.deepEqual(out, { checked: 3, updated: 2, gone: 1 });
  const songs = (await w.owner('studioGet')).result.tracks;
  assert.equal(songs.find(t => t.track_id === a1.track_id).title, 'Renamed on YouTube');
  assert.equal(songs.find(t => t.title === 'Mine').title, 'Mine');                                              // your own words stay
  assert.deepEqual((await w.owner('youtubeTitleStatus')).result, { total: 2, stale: 0 });                      // fresh again; the removed one is no longer tracked
  assert.equal((await w.owner('refreshYoutubeTitles', true)).result.checked, 2);                                // "force" re-reads all
  assert.deepEqual(w.appsCalls().filter(c => /Youtube/i.test(c.fn)), []);
}));

test('YouTube: the key check and YouTube refusals are explained in plain words', () => withWorld(async (w) => {
  await ytWorld(w);
  assert.deepEqual((await w.owner('checkYoutube')).result, { ok: true, shared: false });                       // its own secret, never the key fans use
  for (const [error, pattern] of [[{ status: 403, reason: 'accessNotConfigured' }, /not switched on for your API key/], [{ status: 400, reason: 'keyInvalid', message: 'API key not valid' }, /not valid/], [{ status: 403, reason: 'quotaExceeded' }, /daily limit/], [{ status: 404, reason: 'playlistNotFound' }, /couldn't open that playlist/], [{ status: 500, reason: 'backendError', message: 'oops' }, /YouTube said no \(500\)/]]) {
    w.youtube.error = error;
    const chk = (await w.owner('checkYoutube')).result; assert.equal(chk.ok, false); assert.match(chk.message, pattern);
    assert.match((await w.owner('addYoutubePlaylistVideos', 'rel_pub', 'https://www.youtube.com/playlist?list=PLabcdefghij1')).error, pattern);
  }
  w.youtube.error = null;
  assert.match((await w.owner('createReleaseFromYoutube', { url: 'https://www.youtube.com/playlist?list=PLnothereeee1' })).error, /couldn't find that playlist/);
  assert.match((await w.owner('createReleaseFromYoutube', { url: 'https://youtu.be/xxxxxxxxxxx' })).error, /couldn't find that video/);
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

const YT_ID = 'abcdefghijk';
async function addedFromYoutube(w, title) {   // a song added through "New release from YouTube": its own hidden release, song and version
  w.env.YOUTUBE_API_KEY = 'yt-test-key'; w.youtube.videos[YT_ID] = title;
  const out = (await w.owner('createReleaseFromYoutube', { url: 'https://youtu.be/' + YT_ID })).result;
  return { rel: out.release.release_id, trk: out.tracks[0].track_id, ver: out.versions[0].version_id };
}
test('missing files: link a song you already added (from YouTube or a file) to the missing one', () => withWorld(async (w) => {
  await w.owner('adoptDomain', 'catalog'); await w.owner('adoptDomain', 'extras');
  await w.owner('missingAdd', { versionId: 'ver_sg' });                                                    // a version of A Single whose file is gone
  const add = await addedFromYoutube(w, 'Recovered Song');
  assert.ok(!(await w.call('getShare', ['PUB'])).result.versions.some(v => v.version_id === add.ver));      // the new release is hidden from fans
  const r = (await w.owner('missingLink', 'ver_sg', add.ver)).result;
  assert.deepEqual([r.version.track_id, r.version.label, r.version.is_primary], ['trk_sg', 'Original', false]);   // it takes the missing version's place and name
  assert.deepEqual([r.removedTrackId, r.hiddenVersionIds, r.fromReleaseEmpty], [add.trk, ['ver_sg'], true]);
  assert.deepEqual((await w.owner('missingList')).result, []);                                              // off the list
  const fan = (await w.call('getShare', ['PUB'])).result.versions.map(v => v.version_id);
  assert.ok(fan.includes(add.ver) && !fan.includes('ver_sg'), 'fans now get the linked file, not the broken one');
  assert.ok(!(await w.owner('studioGet')).result.tracks.some(t => t.track_id === add.trk), 'the empty song it came from is gone');
  assert.ok((await w.owner('studioGet')).result.releases.some(x => x.release_id === add.rel), 'its (now empty, hidden) release is left for you to delete');
}));
test('missing files: a song that was never added gets the linked file as its main version and shows up for fans', () => withWorld(async (w) => {
  await w.owner('adoptDomain', 'catalog'); await w.owner('adoptDomain', 'extras');
  await w.owner('missingAdd', { trackId: 'trk_a2' });                                                      // hidden song with a broken file
  assert.deepEqual((await w.owner('missingList')).result.map(x => [x.kind, x.unhide]), [['song', true]]);
  const add = await addedFromYoutube(w, 'Never Added Song');
  const r = (await w.owner('missingLink', 'trk_a2', add.ver)).result;
  assert.deepEqual([r.version.track_id, r.version.is_primary, r.unhide], ['trk_a2', true, true]);
  const g = (await w.call('getShare', ['PUB'])).result;
  assert.ok(g.tracks.some(t => t.track_id === 'trk_a2'), 'the song is visible now');
  assert.deepEqual(g.versions.filter(v => v.track_id === 'trk_a2').map(v => v.version_id), [add.ver]);
}));
test('missing files: linking refuses what would be wrong', () => withWorld(async (w) => {
  await w.owner('adoptDomain', 'catalog'); await w.owner('adoptDomain', 'extras');
  await w.owner('missingAdd', { versionId: 'ver_sg' }); await w.owner('missingAdd', { versionId: 'ver_a1' });
  const add = await addedFromYoutube(w, 'Recovered Song');
  assert.match((await w.owner('missingLink', 'nope', add.ver)).error, /not on the list/);
  assert.match((await w.owner('missingLink', 'ver_sg', 'ghost')).error, /not found/);
  assert.match((await w.owner('missingLink', 'ver_sg', 'ver_sg')).error, /already on this song|missing its file/);   // not itself
  assert.match((await w.owner('missingLink', 'ver_sg', 'ver_a1')).error, /also missing its file/);               // not another broken one
  assert.match((await w.owner('missingLink', 'ver_sg', 'ver_h1')).error, /only songs you added/i);               // a song from the old Sheet is not one you added here: left alone
  assert.equal((await w.owner('missingList')).result.length, 2);                                                  // nothing changed
  assert.ok((await w.call('getShare', ['PUB'])).result.versions.some(v => v.version_id === 'ver_sg'));
  assert.equal((await w.call('missingLink', ['wrong', 'ver_sg', add.ver])).ok, false);                            // owner only
}));
test('missing files: linking works before the catalog moves over too (native songs, the broken one is hidden by an overlay)', () => withWorld(async (w) => {
  await w.owner('adoptDomain', 'extras');                                                                   // YouTube tools run once extras are owned; the catalog is still the Sheet's
  await w.owner('missingAdd', { versionId: 'ver_sg' });
  const add = await addedFromYoutube(w, 'Recovered Song');
  const r = (await w.owner('missingLink', 'ver_sg', add.ver)).result;
  assert.equal(r.version.track_id, 'trk_sg');
  const fan = (await w.call('getShare', ['PUB'])).result.versions.map(v => v.version_id);
  assert.ok(fan.includes(add.ver) && !fan.includes('ver_sg'));
  assert.deepEqual((await w.owner('missingList')).result, []);
  assert.match((await w.owner('missingLink', 'ver_sg', 'ver_h1')).error, /not on the list|Switch the catalog/);
}));

test('extras: each extra song keeps its label (draft, audio note, remix, cover, b-side) and fans can see it', () => withWorld(async (w) => {
  await w.owner('adoptDomain', 'catalog');
  const save = (cat, kind) => w.owner('saveTracklist', 'rel_pub', 'Open Album', [{ track_id: 'trk_a1', category: cat, extra_kind: kind }], false, 'Album');
  const fan = async () => (await w.call('getShare', ['PUB'])).result.tracks.find(t => t.track_id === 'trk_a1');
  for (const kind of ['Draft', 'Audio note', 'Remix', 'Cover', 'B-Side']) {
    assert.equal((await save(kind === 'B-Side' ? 'B-Side' : 'Deluxe', kind)).ok, true);
    const t = await fan(); assert.equal(t.extra_kind, kind); assert.notEqual(t.category, 'Main');
  }
  await save('Deluxe', 'Not a real kind'); assert.equal((await fan()).extra_kind, '');                    // only the five labels are accepted
  await save('Deluxe', 'Remix'); await save('Main', 'Remix');                                              // back on the main tracklist: the label is dropped
  const t = await fan(); assert.deepEqual([t.category, t.extra_kind], ['Main', '']);
  assert.equal((await w.call('saveTracklist', ['wrong', 'rel_pub', 'x', [], false, 'Album'])).ok, false);   // owner only
}));

test('unreleased songs: what a song counts as (single, album, EP, mixtape, compilation) is saved, checked, and shown to fans', () => withWorld(async (w) => {
  await w.owner('adoptDomain', 'catalog');
  const fan = async () => (await w.call('getShare', ['PUB'])).result.tracks.find(t => t.track_id === 'trk_a1');
  for (const kind of ['Single', 'Album', 'EP', 'Mixtape', 'Compilation']) {
    assert.equal((await w.owner('studioSaveTrack', 'trk_a1', { fields: { unrel_kind: kind }, unreleased: true })).ok, true);
    assert.equal((await fan()).unrel_kind, kind);
  }
  await w.owner('studioSaveTrack', 'trk_a1', { fields: { unrel_kind: 'Not a kind' } }); assert.equal((await fan()).unrel_kind, '');   // only the five are accepted
  await w.owner('studioSaveTrack', 'trk_a1', { fields: { unrel_kind: 'EP' } }); await w.owner('studioSaveTrack', 'trk_a1', { fields: { unrel_kind: '' } });
  assert.equal((await fan()).unrel_kind, '');                                                                  // "same as its release" clears it
  assert.equal((await w.call('studioSaveTrack', ['wrong', 'trk_a1', { fields: { unrel_kind: 'EP' } }])).ok, false);   // owner only
}));

test('features: a song can be marked as my guest spot on someone else\'s song, and fans can see that', () => withWorld(async (w) => {
  await w.owner('adoptDomain', 'catalog');
  const fan = async () => (await w.call('getShare', ['PUB'])).result.tracks.find(t => t.track_id === 'trk_a1');
  assert.equal((await w.owner('studioSaveTrack', 'trk_a1', { fields: { feature_role: 'mine', artist: 'Berhani' } })).ok, true);
  assert.deepEqual([(await fan()).feature_role, (await fan()).artist], ['mine', 'Berhani']);
  await w.owner('studioSaveTrack', 'trk_a1', { fields: { feature_role: 'something else' } }); assert.equal((await fan()).feature_role, '');   // only "mine" is accepted
  await w.owner('studioSaveTrack', 'trk_a1', { fields: { feature_role: 'mine' } }); await w.owner('studioSaveTrack', 'trk_a1', { fields: { feature_role: '' } });
  assert.equal((await fan()).feature_role, '');
  assert.equal((await w.call('studioSaveTrack', ['wrong', 'trk_a1', { fields: { feature_role: 'mine' } }])).ok, false);   // owner only
}));

// ---------------------------------------------------------------- website insights (a Wix-style breakdown of who visits the site)
const NASH = { city: 'Nashville', region: 'Tennessee', country: 'US' }, MEMPHIS = { city: 'Memphis', region: 'Tennessee', country: 'US' };
let VN = 0;
const pick = (o, k, d) => (k in o ? o[k] : d);
const view = (w, o = {}) => w.call('siteView', [o.key || '', o.token || '', pick(o, 'dev', 'devA'), pick(o, 'visit', 'visitA'), pick(o, 'view', 'view' + (++VN)), pick(o, 'path', '/'), o.seconds == null ? 30 : o.seconds, o.device || 'phone', o.ref || ''], { cf: o.cf || NASH, ua: o.ua || 'Mozilla/5.0 (iPhone)' });
const siteRows = w => w.db.prepare('SELECT * FROM site_views ORDER BY at').all().then(r => r.results);
const seedSite = async (w, rows) => { await w.owner('getSiteLive', false); await seedSiteRows(w, rows); };   // (the first call makes the table)
const seedSiteRows = (w, rows) => Promise.all(rows.map(([ago, dev, visit, path, sec = 20, device = 'phone', ref = '', tok = 'public', city = 'Nashville']) => w.db.prepare('INSERT INTO site_views (view_id, at, last, visit_id, device_id, share_token, path, device, city, region, country, ref, seconds) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
  .bind('seed' + (++VN), Date.now() - ago * DAY, Date.now() - ago * DAY, visit, dev, tok, path, device, city, 'Tennessee', 'US', ref, sec).run()));

test('website insights: a page view is recorded with its city, device and referrer (never an address), and a repeat note only adds time', () => withWorld(async (w) => {
  assert.equal((await view(w, { view: 'v1', path: '/vault/2019-soulless?x=1#top', seconds: 12, ref: 'l.instagram.com' })).result, true);
  let r = (await siteRows(w))[0];
  assert.deepEqual([r.path, r.city, r.region, r.country, r.device, r.ref, r.seconds, r.share_token], ['/vault/2019-soulless', 'Nashville', 'Tennessee', 'US', 'phone', 'l.instagram.com', 12, 'public']);
  assert.ok(!JSON.stringify(r).includes('203.0.113.7'), 'no IP address is stored');
  await view(w, { view: 'v1', path: '/vault/2019-soulless', seconds: 45 }); await view(w, { view: 'v1', path: '/vault/2019-soulless', seconds: 20 });   // still here (45), then an older note (20)
  const rows = await siteRows(w); assert.equal(rows.length, 1); assert.equal(rows[0].seconds, 45);                                                  // one view; time only goes up
}));
test('website insights: robots, bad input and odd values are handled', () => withWorld(async (w) => {
  assert.equal((await view(w, { ua: 'Googlebot/2.1' })).result, true); assert.equal((await view(w, { ua: 'HeadlessChrome/120' })).result, true);
  assert.equal((await siteRows(w)).length, 0);                                                                // crawlers are not visitors
  for (const bad of [{ path: 'no-slash' }, { path: '/<script>' }, { dev: '' }, { visit: '' }, { view: '' }]) assert.equal((await view(w, bad)).result, false, JSON.stringify(bad));
  assert.equal((await view(w, { seconds: 999999, device: 'toaster', ref: 'evil host/<x>', cf: { city: 'X'.repeat(200), country: 'USA' } })).result, true);
  const r = (await siteRows(w))[0]; assert.deepEqual([r.seconds, r.device, r.ref, r.city.length, r.country], [1800, 'desktop', '', 60, '']);   // clamped, defaulted, cleaned
  assert.equal((await view(w, { ref: 'soulnicolas.com', view: 'self' })).result, true); assert.equal((await siteRows(w)).find(x => x.view_id === 'self').ref, '');   // our own site is not a source
}));
test('website insights: numbers, top pages with time on each, devices, cities and sources', () => withWorld(async (w) => {
  await seedSite(w, [[1, 'a', 'v1', '/', 10, 'phone', 'l.instagram.com'], [1, 'a', 'v1', '/vault', 50], [1, 'a', 'v1', '/lore', 40], [2, 'b', 'v2', '/', 30, 'desktop', '', 'public', 'Memphis'], [2, 'b', 'v2', '/vault', 20, 'desktop', '', 'public', 'Memphis'], [3, 'c', 'v3', '/', 60, 'tablet', 'www.google.com']]);
  const d = (await w.owner('getSiteInsights', 7, false)).result;
  assert.deepEqual([d.totals.visitors, d.totals.visits, d.totals.views], [3, 3, 6]);
  assert.equal(d.totals.avgVisit, 70); assert.equal(d.totals.avgPage, 35);                                     // (100 + 50 + 60) / 3 visits;  210 s / 6 views
  const home = d.pages.find(p => p.path === '/'); assert.deepEqual([home.page, home.views, home.visitors, home.avg], ['Home', 3, 3, 33]);
  assert.deepEqual(d.pages.map(p => p.page), ['Home', 'Music', 'Lore']); assert.equal(d.pages.find(p => p.page === 'Music').avg, 35);
  assert.deepEqual(d.devices, { phone: 1, tablet: 1, desktop: 1 });                                            // one per visit
  assert.deepEqual(d.cities.map(c => [c.city, c.visitors]), [['Nashville', 2], ['Memphis', 1]]);
  assert.deepEqual(d.sources.map(s => [s.name, s.visits]), [['Direct', 1], ['Google', 1], ['Instagram', 1]]);
  assert.ok(d.perDay.reduce((n, x) => n + x.n, 0) === 6 && d.perDay.every(x => x.v <= x.n));
}));
test('website insights: release pages are named by their title; the previous period and new vs returning are worked out', () => withWorld(async (w) => {
  await seedSite(w, [[1, 'a', 'v1', '/vault/pub'], [1, 'new1', 'v2', '/'], [2, 'new2', 'v3', '/'], [9, 'a', 'v4', '/'], [30, 'a', 'v5', '/'], [10, 'z', 'v6', '/']]);
  const d = (await w.owner('getSiteInsights', 7, false)).result;
  assert.ok(d.pages.some(p => p.page === 'Open Album'), 'rel_pub reads as its title: ' + d.pages.map(p => p.page));
  assert.deepEqual([d.totals.visitors, d.prev.visitors, d.prev.views], [3, 2, 2]);                          // the 7 days before: devices a (9 d ago) and z (10 d ago)
  assert.deepEqual(d.audience, { newVisitors: 2, returning: 1 });                                            // a was here a month ago
  assert.equal((await w.owner('getSiteInsights', 0, false)).result.prev, null);
}));
test('website insights: your own visits are left out unless you ask', () => withWorld(async (w) => {
  assert.equal((await view(w, { key: OWNER_KEY, dev: 'me' })).result, true); await view(w, { dev: 'fan' });
  assert.equal((await siteRows(w)).find(r => r.device_id === 'me').share_token, 'owner');
  assert.equal((await w.owner('getSiteInsights', 7, false)).result.totals.visitors, 1); assert.equal((await w.owner('getSiteInsights', 7, true)).result.totals.visitors, 2);
}));
test('website insights: only the owner can read them; anyone can send a page view', () => withWorld(async (w) => {
  await view(w);
  for (const fn of ['getSiteInsights', 'getSiteLive']) for (const args of [[], [''], ['wrong', 7], [null]]) assert.equal((await w.call(fn, args)).ok, false, fn);
  assert.equal((await w.owner('getSiteLive', false)).ok, true);
}));
test('website insights: who is on the site right now', () => withWorld(async (w) => {
  await view(w, { dev: 'a', path: '/vault', cf: NASH }); await view(w, { dev: 'b', path: '/lore', device: 'desktop', cf: MEMPHIS }); await view(w, { dev: 'a', path: '/lore', view: 'second' });   // a moved to Lore
  let live = (await w.owner('getSiteLive', false)).result; assert.equal(live.count, 2);
  assert.deepEqual(live.now.map(x => [x.page, x.device, x.city]).sort(), [['Lore', 'desktop', 'Memphis, Tennessee'], ['Lore', 'phone', 'Nashville, Tennessee']]);
  await w.db.prepare('UPDATE site_views SET last = ? WHERE device_id = ?').bind(Date.now() - 120000, 'b').run();   // went quiet 2 minutes ago
  assert.equal((await w.owner('getSiteLive', false)).result.count, 1);
}));
test('website insights: one browser cannot flood the table', () => withWorld(async (w) => {
  await seedSite(w, Array.from({ length: 300 }, (_, i) => [0.001, 'spam', 'vs', '/']));
  assert.equal((await view(w, { dev: 'spam', view: 'extra' })).result, true); assert.ok(!(await siteRows(w)).some(r => r.view_id === 'extra'));
  assert.ok((await siteRows(w)).length === 300);
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

// ---------------------------------------------------------------- listening insights (like Spotify for Artists) and "listening now"
const DAY = 864e5, NOW = () => Date.now();
// rows: [daysAgo, versionId, deviceId, outcome, token, device, hourOffset]
async function seedListens(w, rows) {
  await w.owner('adoptDomain', 'activity'); await w.owner('getInsights', 30, false);   // makes the tables
  const ver = { ver_a1: ['trk_a1', 'rel_pub'], ver_sg: ['trk_sg', 'rel_single'] };
  for (const [ago, v, dev, out = 'complete', tok = 'PUB', device = 'phone'] of rows) {
    await w.db.prepare('INSERT INTO listens (at, track_id, version_id, release_id, share_token, device_id, seconds, pct, outcome, device) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(NOW() - ago * DAY, ver[v][0], v, ver[v][1], tok, dev, out === 'skip' ? 5 : 120, out === 'skip' ? 4 : 100, out, device).run();
  }
}

test('insights: unique listeners (not plays), streams per listener, and listeners for each song', () => withWorld(async (w) => {
  await seedListens(w, [[1, 'ver_a1', 'devA'], [1.1, 'ver_a1', 'devA'], [2, 'ver_a1', 'devB', 'partial'], [2, 'ver_sg', 'devB'], [3, 'ver_sg', 'devC'], [3, 'ver_sg', 'devC', 'skip']]);
  const d = (await w.owner('getInsights', 30, false)).result;
  assert.equal(d.totals.plays, 5); assert.equal(d.totals.skips, 1);
  assert.equal(d.totals.listeners, 3);                                                                       // three people, however many plays
  assert.equal(d.totals.perListener, 1.7);                                                                   // 5 streams / 3 listeners
  const a = d.songs.find(x => x.track_id === 'trk_a1'), s = d.songs.find(x => x.track_id === 'trk_sg');
  assert.deepEqual([a.plays, a.listeners], [3, 2]); assert.deepEqual([s.plays, s.listeners], [2, 2]);        // devC only skipped once and played once: still one listener
  assert.equal(d.perDay.reduce((n, x) => n + x.n, 0), 5);
  assert.ok(d.perDay.every(x => x.l <= x.n), 'a day never has more listeners than streams');
  assert.ok(d.perDay.some(x => x.n === 2 && x.l === 1), 'one person playing twice in a day is one listener that day');
  assert.equal(d.hours.length, 24); assert.equal(d.hours.reduce((a, b) => a + b, 0), 5);                      // every stream lands in an hour...
  assert.equal(d.weekdays.length, 7); assert.equal(d.weekdays.reduce((a, b) => a + b, 0), 5);                 // ...and a weekday
  assert.deepEqual(d.devices, { phone: 5, desktop: 0 });
}));

test('insights: phone vs computer split', () => withWorld(async (w) => {
  await seedListens(w, [[1, 'ver_a1', 'devA', 'complete', 'PUB', 'phone'], [1, 'ver_a1', 'devB', 'complete', 'PUB', 'desktop'], [1, 'ver_a1', 'devC', 'complete', 'PUB', 'desktop'], [1, 'ver_a1', 'devC', 'skip', 'PUB', 'desktop']]);
  assert.deepEqual((await w.owner('getInsights', 7, false)).result.devices, { phone: 1, desktop: 2 });       // skips are not streams
}));

test('insights: the previous period for the up/down arrows (and none for "all time")', () => withWorld(async (w) => {
  await seedListens(w, [[1, 'ver_a1', 'devA'], [2, 'ver_a1', 'devB'], [3, 'ver_a1', 'devB'], [4, 'ver_a1', 'devB'], [9, 'ver_a1', 'devA'], [10, 'ver_a1', 'devA', 'partial'], [40, 'ver_a1', 'devZ']]);
  const d = (await w.owner('getInsights', 7, false)).result;
  assert.deepEqual([d.totals.plays, d.totals.listeners], [4, 2]);
  assert.deepEqual([d.prev.plays, d.prev.listeners], [2, 1]);                                                // the 7 days before: two plays, one person
  assert.equal(d.prev.finishRate, 50);
  assert.equal((await w.owner('getInsights', 0, false)).result.prev, null);
  const d30 = (await w.owner('getInsights', 30, false)).result; assert.deepEqual([d30.prev.plays, d30.prev.listeners], [1, 1]);   // the 30 days before that: only devZ
}));

test('insights: new vs returning listeners', () => withWorld(async (w) => {
  await seedListens(w, [[1, 'ver_a1', 'devNew'], [1, 'ver_a1', 'devOld'], [30, 'ver_a1', 'devOld'], [2, 'ver_a1', 'devNew2'], [20, 'ver_a1', 'devGone']]);
  const d = (await w.owner('getInsights', 7, false)).result;
  assert.deepEqual(d.audience, { newListeners: 2, returning: 1 });                                          // devOld was already here a month ago
}));

test('insights: your own plays are left out unless you ask, in every number', () => withWorld(async (w) => {
  await seedListens(w, [[1, 'ver_a1', 'devA'], [1, 'ver_a1', 'me', 'complete', 'owner'], [1, 'ver_a1', 'me', 'complete', 'owner']]);
  const fans = (await w.owner('getInsights', 30, false)).result, all = (await w.owner('getInsights', 30, true)).result;
  assert.deepEqual([fans.totals.plays, fans.totals.listeners, fans.songs[0].listeners, fans.hours.reduce((a, b) => a + b, 0)], [1, 1, 1, 1]);
  assert.deepEqual([all.totals.plays, all.totals.listeners, all.songs[0].listeners], [3, 2, 2]);
}));

test('insights: an empty range still gives the whole shape (no crash, zeros)', () => withWorld(async (w) => {
  await w.owner('adoptDomain', 'activity');
  const d = (await w.owner('getInsights', 7, false)).result;
  assert.equal(d.totals.plays, 0); assert.equal(d.perDay.length, 7); assert.ok(d.perDay.every(x => x.n === 0 && x.l === 0));
  assert.equal(d.hours.length, 24); assert.equal(d.weekdays.length, 7); assert.deepEqual(d.audience, { newListeners: 0, returning: 0 });
}));

test('listening now: a fan\'s phone shows up for the owner, then goes away when they stop or go quiet', () => withWorld(async (w) => {
  await w.owner('adoptDomain', 'activity');
  assert.equal((await w.call('listeningNow', ['', 'FAN', 'dev1', 'ver_a1', 'phone'])).result, true);
  assert.equal((await w.call('listeningNow', ['', 'PUB', 'dev2', 'ver_sg', 'desktop'])).result, true);
  const live = (await w.owner('getLive', false)).result;
  assert.equal(live.count, 2);
  const jo = live.now.find(x => x.who === 'Jo'); assert.deepEqual([jo.title, jo.release, jo.device], ['Song trk_a1', 'Open Album', 'phone']);   // the link's name, never a person's details
  assert.ok(live.now.find(x => x.who === 'Fan club link'));
  assert.equal((await w.call('listeningNow', ['', 'FAN', 'dev1', '', 'phone'])).result, true);              // paused / stopped
  assert.equal((await w.owner('getLive', false)).result.count, 1);
  await w.db.prepare('UPDATE live SET at = ? WHERE device_id = ?').bind(NOW() - 120000, 'dev2').run();     // went quiet 2 minutes ago
  assert.equal((await w.owner('getLive', false)).result.count, 0);
}));

test('listening now: only the owner can see it, and fans cannot fake what they are not allowed to hear', () => withWorld(async (w) => {
  await w.owner('adoptDomain', 'activity');
  for (const args of [[], [''], ['wrong'], [null]]) assert.equal((await w.call('getLive', args)).ok, false);
  assert.equal((await w.call('listeningNow', ['', 'nope', 'dev1', 'ver_a1', 'phone'])).result, false);       // not a real link
  assert.equal((await w.call('listeningNow', ['', 'OFF', 'dev1', 'ver_a1', 'phone'])).result, false);        // switched off
  assert.equal((await w.call('listeningNow', ['', 'EXP', 'dev1', 'ver_a1', 'phone'])).result, false);        // expired
  assert.equal((await w.call('listeningNow', ['', 'VER', 'dev1', 'ver_sg', 'phone'])).result, false);        // a song outside what this link covers
  assert.equal((await w.call('listeningNow', ['', 'PUB', 'dev1', 'ver_h1', 'phone'])).result, false);        // hidden release
  assert.equal((await w.call('listeningNow', ['', 'PUB', 'dev1', 'ver_zzz', 'phone'])).result, false);       // not a song
  assert.equal((await w.call('listeningNow', ['', 'PUB', '', 'ver_a1', 'phone'])).result, false);            // no device id
  assert.equal((await w.owner('getLive', false)).result.count, 0);
}));

test('listening now: your own phone is hidden unless you ask; one row per device; quick repeats are not rewritten; old rows are cleaned up', () => withWorld(async (w) => {
  await w.owner('adoptDomain', 'activity');
  assert.equal((await w.call('listeningNow', [OWNER_KEY, '', 'meDev', 'ver_a1', 'phone'])).result, true);
  assert.equal((await w.owner('getLive', false)).result.count, 0); assert.equal((await w.owner('getLive', true)).result.count, 1);
  assert.equal((await w.owner('getLive', true)).result.now[0].who, 'You');
  await w.call('listeningNow', ['', 'PUB', 'dev1', 'ver_a1', 'phone']);
  const at1 = (await w.db.prepare('SELECT at FROM live WHERE device_id = ?').bind('dev1').first()).at;
  await new Promise(r => setTimeout(r, 15)); await w.call('listeningNow', ['', 'PUB', 'dev1', 'ver_a1', 'phone']);
  assert.equal((await w.db.prepare('SELECT at FROM live WHERE device_id = ?').bind('dev1').first()).at, at1);   // same song, a moment later: left alone
  await w.call('listeningNow', ['', 'PUB', 'dev1', 'ver_sg', 'phone']);                                      // next song: updated
  assert.equal((await w.db.prepare('SELECT COUNT(*) AS n FROM live WHERE device_id = ?').bind('dev1').first()).n, 1);
  assert.equal((await w.db.prepare('SELECT version_id FROM live WHERE device_id = ?').bind('dev1').first()).version_id, 'ver_sg');
  await w.db.prepare('UPDATE live SET at = ? WHERE device_id = ?').bind(NOW() - 10 * 60000, 'meDev').run();
  await w.call('listeningNow', ['', 'PUB', 'dev9', 'ver_a1', 'phone']);
  assert.equal((await w.db.prepare("SELECT COUNT(*) AS n FROM live WHERE device_id = 'meDev'").first()).n, 0);   // stale rows are deleted, never kept as history
  assert.equal((await w.db.prepare('SELECT COUNT(*) AS n FROM listens').first()).n, 0);                        // and "now" never touches the listening history
}));

// ---------------------------------------------------------------- the Video tab (two public YouTube playlists)
test('Video tab: anyone can read the Originals and Remixes playlists; a missing key or a failed list never breaks the other', () => withWorld(async (w) => {
  const O = 'PLYYNnxWFsj19t22I4Qy6lke0ytPaFz3LK', R = 'PLYYNnxWFsj18iVfs3mLzki3VA2OesBnDV';
  const noKey = await w.call('getVideoLists', []);                                              // no key yet: still answers, lists say they are not available
  assert.equal(noKey.ok, true); assert.deepEqual(noKey.result.lists.map(l => [l.key, l.videos.length, l.error]), [['originals', 0, 'not-available'], ['remixes', 0, 'not-available'], ['music', 0, 'not-available']]);
  w.env.YOUTUBE_API_KEY = 'test-yt-key';
  w.youtube.playlists = { [O]: { title: 'Originals', videos: [{ id: 'aaaaaaaaaaa', title: 'One <b>x</b>' }, { id: 'bbbbbbbbbbb', title: 'Private video' }] } };   // the Remixes list is missing at YouTube
  const half = (await w.call('getVideoLists', [])).result.lists;
  assert.deepEqual(half[0].videos, [{ id: 'aaaaaaaaaaa', title: 'One <b>x</b>' }]);             // private videos are skipped
  assert.equal(half[1].error, 'not-available'); assert.ok(!JSON.stringify(half).includes('test-yt-key'));
  w.youtube.playlists[R] = { title: 'Remixes', videos: [{ id: 'ccccccccccc', title: 'Remix' }] };
  const full = (await w.call('getVideoLists', [])).result.lists;
  assert.deepEqual(full.map(l => [l.key, l.videos.length, l.error]).slice(0, 2), [['originals', 1, undefined], ['remixes', 1, undefined]]);
  assert.equal(full[2].key, 'music', 'the music videos playlist is the third list'); assert.equal(full[2].id, 'PLYYNnxWFsj1_wIe3c0Lyj4EL9tMs9GQYU');
  assert.equal(full[0].videos[0].views, undefined, 'no statistics from YouTube: the list still works, just without them');
}));

test('Video tab: an older kept answer (made before a playlist was added) is not served, so the new playlist shows at once', () => withWorld(async (w) => {
  w.env.YOUTUBE_API_KEY = 'test-yt-key';
  w.youtube.playlists = Object.fromEntries(['PLYYNnxWFsj19t22I4Qy6lke0ytPaFz3LK', 'PLYYNnxWFsj18iVfs3mLzki3VA2OesBnDV', 'PLYYNnxWFsj1_wIe3c0Lyj4EL9tMs9GQYU'].map((id, i) => [id, { title: 'L' + i, videos: [{ id: 'aaaaaaaaaa' + i, title: 'V' + i }] }]));
  await caches.default.put(new Request('https://edge.soulnicolas.invalid/videolists/1'), new Response(JSON.stringify({ lists: [{ key: 'originals', videos: [] }, { key: 'remixes', videos: [] }] }), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=900' } }));
  const lists = (await w.call('getVideoLists', [])).result.lists;
  assert.deepEqual(lists.map((l) => [l.key, l.videos.length]), [['originals', 1], ['remixes', 1], ['music', 1]]);
}));

test('Video tab: each video carries its upload date, views and likes (likes can be hidden), read 50 at a time', () => withWorld(async (w) => {
  const O = 'PLYYNnxWFsj19t22I4Qy6lke0ytPaFz3LK', R = 'PLYYNnxWFsj18iVfs3mLzki3VA2OesBnDV';
  w.env.YOUTUBE_API_KEY = 'test-yt-key';
  const ids = Array.from({ length: 60 }, (_, i) => 'v' + String(i).padStart(10, '0'));
  w.youtube.videos = Object.fromEntries(ids.map((id, i) => [id, 'Song ' + i]));
  w.youtube.stats = Object.fromEntries(ids.map((id, i) => [id, { at: '2025-01-' + String(1 + (i % 28)).padStart(2, '0') + 'T10:00:00Z', views: i * 10, likes: i === 3 ? null : i }]));
  w.youtube.playlists = { [O]: { title: 'Originals', videos: ids.map((id, i) => ({ id, title: 'Song ' + i })) }, [R]: { title: 'Remixes', videos: [{ id: ids[0], title: 'Song 0' }] } };
  const r = (await w.call('getVideoLists', [])).result.lists;
  assert.equal(r[0].videos.length, 60); assert.deepEqual([r[0].videos[7].views, r[0].videos[7].likes, r[0].videos[7].at], [70, 7, '2025-01-08T10:00:00Z']);
  assert.equal(r[0].videos[3].likes, null, 'hidden likes are null, not 0');
  assert.equal(r[0].videos[59].views, 590, 'the second batch of 50 is read too');
  assert.equal(w.ytCalls.filter(c => c.path === 'videos').length >= 2, true);
}));

// ---------------------------------------------------------------- songs from a SoundCloud link (plays through SoundCloud's own player; no key)
test('SoundCloud: a song link becomes a song with no audio file; one song only; no duplicates; needs the owner key', () => withWorld(async (w) => {
  w.soundcloud = { 'https://soundcloud.com/nicolas-soul/spiderman': { title: 'Spiderman by Nicolas Soul', author_name: 'Nicolas Soul' }, 'https://soundcloud.com/some-guest/their-song': { title: 'Their Song by Some Guest', author_name: 'Some Guest' } };
  assert.equal((await w.call('addSoundcloudSong', [undefined, { releaseId: 'rel_pub', url: 'https://soundcloud.com/nicolas-soul/spiderman' }])).ok, false, 'owner key needed');
  for (const bad of ['', 'https://example.com/a/b', 'https://soundcloud.com/nicolas-soul', 'https://soundcloud.com/nicolas-soul/sets/my-set', 'https://soundcloud.com/nicolas-soul/likes', 'http://soundcloud.com/a/b', 'javascript:alert(1)'])
    assert.match((await w.owner('addSoundcloudSong', { releaseId: 'rel_pub', url: bad })).error, /ONE song from SoundCloud/, bad);
  assert.match((await w.owner('addSoundcloudSong', { releaseId: 'nope', url: 'https://soundcloud.com/nicolas-soul/spiderman' })).error, /Release not found/);
  assert.match((await w.owner('addSoundcloudSong', { releaseId: 'rel_pub', url: 'https://soundcloud.com/nicolas-soul/missing-song' })).error, /couldn't find that song/);
  const ok = await w.owner('addSoundcloudSong', { releaseId: 'rel_pub', url: 'https://www.soundcloud.com/nicolas-soul/spiderman?si=abc&utm_source=clipboard' });
  assert.equal(ok.ok, true); const { track, version } = ok.result;
  assert.deepEqual([track.title, track.sc_url, track.artist, version.format, version.audio, version.url], ['Spiderman', 'https://soundcloud.com/nicolas-soul/spiderman', '', 'SOUNDCLOUD', '', ''], 'title tidied (no "by artist"), tracking parameters dropped, no audio file');
  assert.match((await w.owner('addSoundcloudSong', { releaseId: 'rel_pub', url: 'https://soundcloud.com/nicolas-soul/spiderman' })).error, /already in this release/);
  const g = await w.owner('addSoundcloudSong', { releaseId: 'rel_pub', url: 'https://soundcloud.com/some-guest/their-song', title: 'My own title' });
  assert.deepEqual([g.result.track.title, g.result.track.artist], ['My own title', 'Some Guest'], 'a typed title wins; another artist is remembered');
  const lib = (await w.owner('getLibrary')).result; assert.ok(lib.tracks.some((t) => t.sc_url === 'https://soundcloud.com/nicolas-soul/spiderman'), 'the owner library carries sc_url');
}));

test('SoundCloud: a release from one song link (hidden, cover from SoundCloud\'s picture, no audio file); bad links refused', () => withWorld(async (w) => {
  w.soundcloud = { 'https://soundcloud.com/nicolas-soul/new-single': { title: 'New Single by Nicolas Soul', author_name: 'Nicolas Soul', thumbnail_url: 'https://i1.sndcdn.com/artworks-abc-large.jpg' } };
  assert.equal((await w.call('createReleaseFromSoundcloud', [undefined, { url: 'https://soundcloud.com/nicolas-soul/new-single' }])).ok, false, 'owner key needed');
  assert.match((await w.owner('createReleaseFromSoundcloud', { url: 'https://soundcloud.com/nicolas-soul/sets/x' })).error, /ONE song from SoundCloud/);
  assert.match((await w.owner('createReleaseFromSoundcloud', { url: 'https://soundcloud.com/nicolas-soul/gone' })).error, /couldn't find that song/);
  const r = await w.owner('createReleaseFromSoundcloud', { url: 'https://soundcloud.com/nicolas-soul/new-single?si=x', year: 2026 });
  assert.equal(r.ok, true); const { release, tracks, versions } = r.result;
  assert.deepEqual([release.title, release.type, !!release.hidden, tracks.length, tracks[0].sc_url, versions[0].format, versions[0].audio], ['New Single', 'Single', true, 1, 'https://soundcloud.com/nicolas-soul/new-single', 'SOUNDCLOUD', ''], JSON.stringify(r.result));
  assert.ok(release.cover_file_id, 'the cover came from SoundCloud\'s picture');
}));

test('release types: Unreleased is no longer a type you can pick (new releases refuse it); an older release that has it keeps it', () => withWorld(async (w) => {
  assert.match((await w.owner('studioNewRelease', { title: 'Nope', type: 'Unreleased', year: '2026' })).error, /Pick a release type/);
  const ok = await w.owner('studioNewRelease', { title: 'Fine', type: 'EP', year: '2026' }); assert.equal(ok.ok, true);
  const old = await w.owner('studioSaveRelease', 'rel_pub', { basics: { type: 'Unreleased' } });   // an older release that already has this type can still be saved
  assert.equal(old.ok, true);
}));

test('song settings: marking a song as my guest spot (feature_role) is saved, shown to fans, and can be taken off again', () => withWorld(async (w) => {
  await w.owner('adoptDomain', 'catalog');
  const save = (item) => w.owner('saveTracklist', 'rel_pub', 'Open Album', [Object.assign({ track_id: 'trk_a1' }, item)], false, 'Album');
  const fan = async () => (await w.call('getShare', ['PUB'])).result.tracks.find(t => t.track_id === 'trk_a1');
  assert.equal((await save({ feature_role: 'mine', artist: 'Berhani' })).ok, true);
  let t = await fan(); assert.deepEqual([t.feature_role, t.artist], ['mine', 'Berhani'], 'saved with the main artist');
  await save({ title: 'Open Album song' }); t = await fan(); assert.equal(t.feature_role, 'mine', 'an edit that does not mention it leaves it alone');
  await save({ feature_role: 'something else' }); t = await fan(); assert.equal(t.feature_role, '', 'only "mine" is accepted; anything else clears it');
  await save({ feature_role: 'mine' }); await save({ feature_role: '' }); t = await fan(); assert.equal(t.feature_role, '', 'taken off again');
}));
