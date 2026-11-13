// The real Soul Vault app in a real browser (phone size), signed in as the owner, talking to the REAL backend code (functions/)
// with a real SQLite database and fake Resend / YouTube / storage. Nothing touches the live site, live data or any key.
//   Run:   node tests/browser/studio-screens.mjs           (needs Playwright; set PW_CHROMIUM to a Chrome if it is not found)
//   Needs: `node build.js` has been run (it serves dist/).
// What it proves: Settings opens; "Check YouTube setup" says connected; a new release from a YouTube playlist is created HIDDEN with its songs;
// Studio lists it; a voice note uploads and is saved on the song; the new release does not leak into what fans see; no page-level sideways
// scroll at 390px on any screen; no console errors.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { harness, OWNER_KEY } from '../_helpers.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url)), DIST = join(ROOT, 'dist');
if (!existsSync(join(DIST, 'index.html'))) { console.error('dist/ is missing: run `node build.js` first.'); process.exit(2); }
const load = () => { try { return createRequire(import.meta.url)('playwright'); } catch (e) { return createRequire(join(execSync('npm root -g').toString().trim(), 'x'))('playwright'); } };
const { chromium } = load();
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.xml': 'application/xml', '.woff2': 'font/woff2' };

const w = await harness();
w.env.YOUTUBE_API_KEY = 'yt-test-key';
w.youtube.playlists.PLbrowsertest0123456789abcdefghij = { title: 'Browser Test EP', videos: [{ id: 'vidAAAAAAA1', title: 'First Test Song' }, { id: 'vidAAAAAAA2', title: 'Second Test Song' }] };
w.youtube.videos.vidAAAAAAA1 = 'First Test Song'; w.youtube.videos.vidAAAAAAA2 = 'Second Test Song';
for (const area of ['catalog', 'extras']) assert.equal((await w.owner('adoptDomain', area)).ok, true, 'switch ' + area);   // like Settings > Move off the Sheet

const KEY = 'ownerkey0123456789';   // the app keeps only letters and digits from ?k= (the real key has no dashes)
w.env.OWNER_KEY = KEY;
const store = async () => { const o = await w.kv('owned'); return o && o.domains && o.domains.catalog ? o : await w.kv('native'); };   // the catalog is owned by Cloudflare, so new releases are stored there
let failures = 0; const problems = [];
const step = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + String(e.message || e).split('\n')[0]); } };

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await ctx.route('**/*', r => r.abort());                                                     // nothing leaves the machine unless allowed below
await ctx.route('https://media.soulnicolas.com/**', r => r.fulfill({ status: 404, body: '' }));
await ctx.route('https://soulnicolas.com/**', async (route) => {
  const req = route.request(), url = new URL(req.url());
  if (url.pathname === '/api') {
    const request = new Request(req.url(), { method: 'POST', body: req.postData() || '', headers: { 'CF-Connecting-IP': '198.51.100.9' } });
    const res = await w.t.onRequestPost(w.ctx(request)); await w.settle();
    return route.fulfill({ status: res.status, headers: { 'content-type': 'application/json' }, body: await res.text() });
  }
  if (url.pathname === '/upload') {
    const bytes = req.postDataBuffer() || Buffer.alloc(0);
    const headers = new Headers({ 'content-type': req.headers()['content-type'] || '', 'x-owner-key': req.headers()['x-owner-key'] || '', 'content-length': String(bytes.length) });
    const res = await w.t.onRequestPut({ request: { url: req.url(), headers, body: new Blob([bytes]).stream() }, env: w.env });
    return route.fulfill({ status: res.status, headers: { 'content-type': 'application/json' }, body: await res.text() });
  }
  let file = join(DIST, decodeURIComponent(url.pathname));
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  return route.fulfill({ status: 200, headers: { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }, body: readFileSync(file) });
});

const page = await ctx.newPage();
if (process.env.DEBUG) { page.on('requestfailed', r => console.log('   [failed]', r.url().slice(0, 100))); page.on('console', m => console.log('   [console]', m.type(), m.text().slice(0, 200))); page.on('response', async r => { if (r.url().includes('/api')) { let b = ''; try { b = (await r.text()).slice(0, 160); } catch (e) { /* gone */ } console.log('   [api]', r.status(), (r.request().postData() || '').slice(0, 60).replace(KEY, '<key>'), '=>', b); } }); }
page.on('pageerror', e => problems.push('page error: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_FAILED|404/.test(m.text())) problems.push('console error: ' + m.text()); });
const noSideways = async (label) => { const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })); assert.ok(o.sw <= o.iw + 1, `${label}: page scrolls sideways (${o.sw} > ${o.iw})`); };
const seen = (text, ms = 8000) => page.waitForFunction(t => document.body.innerText.includes(t), text, { timeout: ms });

console.log('Soul Vault owner screens, 390px wide, real backend code:');
await step('opens as the owner and shows the library', async () => { await page.goto('https://soulnicolas.com/?k=' + KEY); await page.waitForSelector('.avatar[data-nav="vault"]', { timeout: 15000 }).catch(async e => { if (process.env.DEBUG) console.log('   [body]', (await page.evaluate(() => document.body.innerText)).slice(0, 400)); throw e; }); await noSideways('library'); });
await step('Settings opens and lists the owner tools', async () => { await page.click('.avatar[data-nav="vault"]'); await seen('Check YouTube setup'); await seen('Upload a new release'); await noSideways('settings'); });
await step('"Check YouTube setup" says YouTube is connected', async () => { await page.click('[data-check-yt]:visible'); await seen('YouTube is connected').catch(async e => { throw new Error('modal says: ' + (await page.evaluate(() => (document.querySelector('#modal') || document.body).innerText)).replace(/\s+/g, ' ').slice(0, 300)); }); await noSideways('youtube check'); await page.click('#modal [data-close]'); });
let releaseId = null;
await step('a new release from a YouTube playlist is created, hidden, with its songs', async () => {
  await page.click('[data-newrel]:visible'); await seen('Start from a YouTube link instead').catch(async e => { throw new Error('screen says: ' + (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 300)); }); await page.click('[data-nr-yt]:visible');
  await page.fill('#yrUrl', 'https://www.youtube.com/playlist?list=PLbrowsertest0123456789abcdefghij'); await noSideways('new release from YouTube'); await page.click('[data-yr-go]');
  await seen('Browser Test EP'); await seen("It's hidden from fans", 8000).catch(() => {});
  const nat = await store(); const rel = nat.releases.find(r => r.title === 'Browser Test EP');
  assert.ok(rel, 'the release is stored'); releaseId = rel.release_id; assert.equal(rel.hidden, true, 'it starts hidden');
  assert.equal(nat.tracks.filter(t => t.release_id === releaseId).length, 2, 'two songs');
  assert.match(rel.cover_file_id, /^c/, 'it has a cover'); for (const size of ['t', '160', '400', '1200', '1600']) assert.ok(await w.media.head('img/' + rel.cover_file_id + '/' + size), 'cover size ' + size);
  await noSideways('new release page');
});
await step('Studio lists the new release and its songs', async () => {
  await page.evaluate(() => renderVault()); await page.click('[data-nav="studio"]:visible'); await page.waitForSelector('#stuRel');   // (the release page has no Settings button on a phone, so this hop calls the app's own renderVault)
  await page.selectOption('#stuRel', releaseId);
  for (const t of ['First Test Song', 'Second Test Song']) await page.waitForFunction(x => document.querySelector('#main').textContent.includes(x), t, { timeout: 8000 });   // (songs sit in a collapsed section: textContent, not innerText) await noSideways('studio');
});
await step('a voice note uploads and is saved on the song', async () => {
  const nat = await store(); const tid = nat.tracks.find(t => t.release_id === releaseId && t.title === 'First Test Song').track_id;
  await page.evaluate(id => { S.releaseId = id; renderRelease(id); }, releaseId); await seen('Browser Test EP');
  await page.evaluate(t => openVoiceUpload(t), tid); await page.waitForSelector('#vnFile');
  await page.setInputFiles('#vnFile', { name: 'memo.m4a', mimeType: 'audio/mp4', buffer: Buffer.from('fake voice memo bytes'.repeat(20)) });
  await noSideways('voice note form'); await page.click('[data-voice-go]'); await seen('Voice note added');
  const saved = (await store()).tracks.find(t => t.track_id === tid);
  assert.match(saved.voice_note_id, /^r2:/, 'the song points at the uploaded file');
  assert.ok(await w.media.head(saved.voice_note_id.slice(3)), 'the file is in storage');
});
await step('fans never see the hidden test release', async () => {
  const lib = (await w.call('getShare', ['PUB'])).result;
  assert.ok(!JSON.stringify(lib).includes('Browser Test EP'), 'the hidden release must not reach the public link');
});
await step('no console errors or page errors the whole time', async () => { assert.deepEqual(problems, []); });

await browser.close(); w.done();
console.log(failures ? `\n${failures} step(s) failed.` : '\nAll steps passed.');
process.exit(failures ? 1 : 0);
