// The two offsite-copy tools, run for real: restore a database backup into a fresh SQLite, and download the music and picture files from a file list.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { withWorld, makeBucket } from './_helpers.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const py = (args) => execFileSync('python3', args, { cwd: ROOT, encoding: 'utf8' });

test('restore: a backup taken from a live database rebuilds every table with the same rows (twice over is safe)', () => withWorld(async (w) => {
  w.env.BACKUPS = makeBucket(); await w.owner('adoptDomain', 'activity');
  await w.call('joinSubmit', [{ firstName: 'Ana', lastName: "O'Neil", email: 'ana@example.com', emailConsent: true, city: 'Nashville, TN', social: '@ana "quoted"' }], { ip: '5.5.5.5' });
  await w.call('joinSubmit', [{ firstName: 'Bo', email: 'bo@example.com', emailConsent: true }], { ip: '6.6.6.6' });
  await w.owner('createShare', { targetType: 'all', targetId: 'all', label: 'Jo' });
  await w.call('siteView', [undefined, 'PUB', 'dev1', 'visit1', 'view1', '/vault', 12, 'phone', 'news.example'], { cf: { city: 'Franklin', region: 'Tennessee', country: 'US' } }); await w.owner('getSiteLive');   // website visits (their own table)
  const dir = mkdtempSync(join(tmpdir(), 'restore-')), src = join(dir, 'backup.json'), sql = join(dir, 'restore.sql');
  const dump = (await w.owner('backupGet')).result; writeFileSync(src, JSON.stringify(dump));
  assert.ok(dump.tables.fans.length === 2 && dump.tables.shares.length >= 1 && dump.tables.kv.length >= 1, 'the backup holds the fans, share links and settings');
  const said = py(['tools/restore-backup.py', src, sql]); assert.ok(!/skipping unknown table/.test(said), 'every table in the backup is known to the restore tool: ' + said);
  const db = new DatabaseSync(':memory:'); const script = readFileSync(sql, 'utf8'); db.exec(script); db.exec(script);   // run it twice: it must not double anything
  for (const name of Object.keys(dump.tables)) {   // the restored tables have the same columns as the live ones (so a new column in the code cannot be forgotten here)
    const cols = (rs) => rs.map((c) => c.name).sort().join(',');
    assert.equal(cols(db.prepare('PRAGMA table_info(' + name + ')').all()), cols((await w.db.prepare('PRAGMA table_info(' + name + ')').all()).results), 'columns of ' + name);
  }
  for (const [name, rows] of Object.entries(dump.tables)) {
    const got = db.prepare('SELECT * FROM ' + name).all().map((r) => ({ ...r }));
    const norm = (list) => JSON.stringify(list.map((r) => Object.fromEntries(Object.entries(r).sort())).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
    assert.equal(norm(got), norm(rows), 'table ' + name + ' comes back exactly');
  }
}));

test('download-media: fetches every file in the list, skips what is already there, retries and reports a bad one, and never leaves half files', async () => {
  const files = { 'rise/01-song.m4a': Buffer.from('A'.repeat(3000)), 'img/c1/400': Buffer.from('B'.repeat(50)), 'bad/short.mp3': Buffer.from('C'.repeat(40)) };
  let hits = 0;
  const server = http.createServer((req, res) => { hits++; const k = decodeURIComponent(req.url.slice(1)); const f = files[k]; if (!f) { res.statusCode = 404; return res.end('no'); } res.end(k === 'bad/short.mp3' ? f.subarray(0, 10) : f); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}/`;
  const dir = mkdtempSync(join(tmpdir(), 'media-')), list = join(dir, 'files.json'), out = join(dir, 'copy');
  writeFileSync(list, JSON.stringify({ base: 'https://media.example.invalid/', files: Object.entries(files).map(([key, b]) => ({ key, size: b.length })) }));
  const run = (extra = []) => new Promise((resolve) => { const p = spawn('python3', ['tools/download-media.py', list, out, '--base=' + base, ...extra], { cwd: ROOT, env: { ...process.env, NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1', HTTP_PROXY: '', http_proxy: '', HTTPS_PROXY: '', https_proxy: '' } }); let o = ''; p.stdout.on('data', (d) => { o += d; }); p.stderr.on('data', (d) => { o += d; }); p.on('close', (code) => resolve({ code, o })); });
  const first = await run();
  assert.equal(first.code, 1, 'a file with the wrong size makes the run say so'); assert.match(first.o, /FAILED bad\/short\.mp3/); assert.match(first.o, /2 downloaded, 0 already there, 1 failed/);
  assert.equal(readFileSync(join(out, 'rise', '01-song.m4a')).length, 3000); assert.equal(statSync(join(out, 'img', 'c1', '400')).size, 50);
  assert.ok(!existsSync(join(out, 'bad', 'short.mp3')) && !existsSync(join(out, 'bad', 'short.mp3.part')), 'no half-downloaded file is left behind');
  const before = hits; files['bad/short.mp3'] = Buffer.from('C'.repeat(10)); writeFileSync(list, JSON.stringify({ base: 'x', files: Object.entries(files).map(([key, b]) => ({ key, size: b.length })) }));
  const again = await run(); assert.equal(again.code, 0); assert.match(again.o, /1 downloaded, 2 already there, 0 failed/, 'the second run only fetches what is missing'); assert.ok(hits - before <= 2);
  const dry = await run(['--dry-run']); assert.match(dry.o, /0 downloaded, 3 already there/);
  server.close();
});
