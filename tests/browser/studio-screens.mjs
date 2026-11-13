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
w.youtube.playlists.PLextrastest0123456789abcdefghijk = { title: 'Extras Test EP', videos: [{ id: 'vidBBBBBBB1', title: 'Main Song' }, { id: 'vidBBBBBBB2', title: 'Remix Song' }, { id: 'vidBBBBBBB3', title: 'Demo Song' }] };
w.youtube.playlists.PLbrowsertest0123456789abcdefghij = { title: 'Browser Test EP', videos: [{ id: 'vidAAAAAAA1', title: 'First Test Song' }, { id: 'vidAAAAAAA2', title: 'Second Test Song' }] };
w.youtube.videos.vidAAAAAAA1 = 'First Test Song'; w.youtube.videos.vidAAAAAAA2 = 'Second Test Song';
for (const area of ['catalog', 'extras', 'activity']) assert.equal((await w.owner('adoptDomain', area)).ok, true, 'switch ' + area);   // like Settings > Move off the Sheet

// listening data for the Insights screen: this week (devices A, B, C), the week before (A), a month back (D); two phones "listening now"
await w.owner('getInsights', 30, false);                     // makes the activity tables
const DAYMS = 864e5, ver = { ver_a1: ['trk_a1', 'rel_pub'], ver_sg: ['trk_sg', 'rel_single'] };
for (const [ago, v, dev, out, tok, device] of [[0.2, 'ver_a1', 'devA', 'complete', 'PUB', 'phone'], [1, 'ver_a1', 'devA', 'complete', 'PUB', 'phone'], [1, 'ver_sg', 'devB', 'complete', 'FAN', 'desktop'], [2, 'ver_a1', 'devB', 'partial', 'FAN', 'desktop'], [3, 'ver_sg', 'devC', 'complete', 'PUB', 'phone'],
  [3, 'ver_sg', 'devC', 'skip', 'PUB', 'phone'], [8, 'ver_a1', 'devA', 'complete', 'PUB', 'phone'], [20, 'ver_a1', 'devD', 'complete', 'PUB', 'phone']])
  await w.db.prepare('INSERT INTO listens (at, track_id, version_id, release_id, share_token, device_id, seconds, pct, outcome, device) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(Date.now() - ago * DAYMS, ver[v][0], v, ver[v][1], tok, dev, out === 'skip' ? 5 : 120, out === 'skip' ? 4 : 100, out, device).run();
assert.equal((await w.call('listeningNow', ['', 'FAN', 'liveA', 'ver_a1', 'phone'])).result, true);
assert.equal((await w.call('listeningNow', ['', 'PUB', 'liveB', 'ver_sg', 'desktop'])).result, true);
// Music tab areas: two unreleased songs (one told it is an EP, one left to follow its release), and guests on both
assert.equal((await w.owner('studioSaveTrack', 'trk_a1', { fields: { title: 'Song trk_a1 (feat. Aziza)', unrel_kind: 'EP' }, unreleased: true })).ok, true);
assert.equal((await w.owner('studioSaveTrack', 'trk_sg', { fields: { feature_role: 'mine', artist: 'Berhani' }, unreleased: true })).ok, true);   // a guest spot on someone else's song
assert.equal((await w.owner('missingAdd', { versionId: 'ver_sg' })).result, true);   // a song whose file is missing (for the Missing files screens)
const KEY = 'ownerkey0123456789';   // the app keeps only letters and digits from ?k= (the real key has no dashes)
w.env.OWNER_KEY = KEY;
const store = async () => { const o = await w.kv('owned'); return o && o.domains && o.domains.catalog ? o : await w.kv('native'); };   // the catalog is owned by Cloudflare, so new releases are stored there
let failures = 0; const problems = [];
const step = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + String(e.message || e).split('\n').slice(0, process.env.DEBUG ? 6 : 1).join(' / ')); } };

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
async function phoneContext() {
  const ctx = await browser.newContext({ viewport: { width: Number(process.env.PHONE_W || 390), height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
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
  return ctx;
}
const ctx = await phoneContext();
const page = await ctx.newPage();
page.on('pageerror', e => problems.push('page error: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_FAILED|404/.test(m.text())) problems.push('console error: ' + m.text()); });
const noSideways = async (label) => { const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })); assert.ok(o.sw <= o.iw + 1, `${label}: page scrolls sideways (${o.sw} > ${o.iw})`); };
// a real tap at the middle of an element, so something covering it would be hit instead (and the test would notice)
const tapAt = async (sel) => { const r = await page.evaluate((q) => { const e = document.querySelector(q); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, sel); assert.ok(r, 'not found: ' + sel); await page.mouse.click(r.x, r.y); };
const seen = (text, ms = 8000) => page.waitForFunction(t => document.body.innerText.includes(t), text, { timeout: ms });

console.log('Soul Vault owner screens, 390px wide, real backend code:');
await step('opens as the owner and shows the library', async () => { await page.goto('https://soulnicolas.com/?k=' + KEY); await page.waitForSelector('.avatar[data-nav="vault"]', { timeout: 15000 }).catch(async e => { if (process.env.DEBUG) console.log('   [body]', (await page.evaluate(() => document.body.innerText)).slice(0, 400)); throw e; }); await noSideways('library'); });
await step('at start-up the owner app loads Studio\'s saved settings (unreleased flags, listen links)', async () => {
  await page.waitForFunction(() => S.links && S.links.flags && S.links.flags.tracks && S.links.flags.tracks.trk_a1 === true, null, { timeout: 8000 });
});
await step('Settings opens and lists the owner tools', async () => { await page.click('.avatar[data-nav="vault"]'); await seen('Check YouTube setup'); await seen('Upload a new release'); await noSideways('settings'); if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true }); });
await step('Settings rows are tidy: grouped, one-line titles, same height, same layout', async () => {
  const m = await page.evaluate(() => { const rows = [...document.querySelectorAll('.acts-list button')].map((b) => ({ h: Math.round(b.getBoundingClientRect().height), t: Math.round(b.querySelector('b').getBoundingClientRect().height), x: Math.round(b.querySelector('.si').getBoundingClientRect().left), title: b.querySelector('b').textContent }));
    return { narrow: window.innerWidth < 360, rows, groups: document.querySelectorAll('.sgroup').length, headings: [...document.querySelectorAll('.sgroup .vsub')].map((h) => h.textContent) }; });
  assert.ok(m.groups >= 5 && new Set(m.headings).size === m.groups, 'five groups with their own headings: ' + m.headings.join(', '));
  assert.ok(m.rows.length >= 10, 'rows: ' + m.rows.length);
  for (const r of m.rows) { assert.ok(r.t <= (m.narrow ? 48 : 24), `"${r.title}" wraps onto several lines (${r.t}px tall)`); assert.ok(r.h >= 60 && r.h <= 110, `"${r.title}" row height ${r.h}px`); }
  assert.equal(new Set(m.rows.map((r) => r.x)).size, 1, 'icons line up in one column');
  assert.ok(new Set(m.rows.map((r) => r.h)).size <= (m.narrow ? 4 : 2), 'rows are all the same height (within one note line): ' + [...new Set(m.rows.map((r) => r.h))].join(', '));
});
await step('Music tab: the Unreleased area is its own secret-access area with its own View menu and classification chips', async () => {
  await page.evaluate(() => renderLibrary());
  await page.waitForSelector('#unreleased .vsc', { timeout: 10000 }).catch(async (e) => { throw new Error('no Unreleased area: ' + JSON.stringify(await page.evaluate(() => ({ n: unreleasedSongs().length, view: S.view, a1: (({ track_id, unreleased, hidden, title }) => ({ track_id, unreleased, hidden, title }))(S.lib.tracks.find((t) => t.track_id === 'trk_a1') || {}), body: document.querySelector('#main').innerText.slice(0, 200).replace(/\s+/g, ' ') })))); });
  const info = await page.evaluate(() => { const el = document.querySelector('#unreleased'); return { cls: el.className, ribbon: el.querySelector('.vs-ribbon').textContent.toLowerCase(), chips: [...el.querySelectorAll('.vs-chips button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()), cards: el.querySelectorAll('.vsc').length,
    glow: getComputedStyle(el, '::before').content, sheen: getComputedStyle(el.querySelector('.vart'), '::after').animationName, menu: !!el.querySelector('[data-secview]'), libView: S.libView, hint: !!el.querySelector('.vs-hint') }; });
  assert.ok(/secret/.test(info.cls) && /access granted/.test(info.ribbon) && /unreleased vault/.test(info.ribbon), 'it has the secret-access ribbon: ' + info.ribbon);
  assert.notEqual(info.glow, 'none', 'it has the glowing border'); assert.ok(info.menu, 'it has its own View menu');
  assert.deepEqual(info.chips, ['All 2', 'Singles 1', 'EPs 1'], 'classified by what each song counts as: ' + info.chips.join(' | '));
  assert.equal(info.cards, 2); assert.equal(info.hint, false, 'nothing is unsorted');
  await noSideways('music tab with the unreleased area');
  for (const v of ['large', 'small', 'list']) {
    await page.click('#unreleased [data-libmenu]', { timeout: 6000 }).catch(async (e) => { throw new Error('menu button: ' + JSON.stringify(await page.evaluate(() => { const b = document.querySelector('#unreleased [data-libmenu]'); if (!b) return 'none'; const r = b.getBoundingClientRect(), at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], vis: getComputedStyle(b).visibility, at: at ? at.tagName + '.' + at.className : null, scrollY: scrollY }; }))); });
    if (process.env.DEBUG) console.log('   menu:', JSON.stringify(await page.evaluate(() => { const m = document.querySelector('#unreleased .viewmenu'), r = m.getBoundingClientRect(); const cs = getComputedStyle(m); return { hidden: m.hidden, display: cs.display, vis: cs.visibility, pos: cs.position, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], parent: m.parentElement.className, expanded: document.querySelector('#unreleased [data-libmenu]').getAttribute('aria-expanded') }; })));
    await tapAt(`#unreleased [data-secview="unreleased|${v}"]`);
    await page.waitForFunction((x) => document.querySelector('#unreleased').innerHTML.length > 0 && (x === 'list' ? document.querySelector('#unreleased ol.tracks li') : document.querySelector('#unreleased .allgrid.' + x)), v, { timeout: 5000 });
    await noSideways('unreleased area in ' + v);
  }
  const rows = await page.evaluate(() => [...document.querySelectorAll('#unreleased ol.tracks li')].map((e) => e.querySelector('.xkind') ? e.querySelector('.xkind').textContent : '').sort());
  assert.deepEqual(rows, ['EP', 'Single'], 'in the list, each song says what it counts as');
  assert.equal(await page.evaluate(() => [S.libView, ls.get('sv_secview_unreleased', ''), ls.get('sv_libview', 'scroll')].join('|')), 'scroll|list|scroll', "the area's View is its own: the releases' View is unchanged");
  await page.click('#unreleased [data-secchip="unreleased|EP"]');
  await page.waitForFunction(() => document.querySelectorAll('#unreleased ol.tracks li').length === 1, null, { timeout: 5000 });
  await page.click('#unreleased [data-secchip="unreleased|all"]');
  await page.click('#unreleased [data-libmenu]'); await tapAt('#unreleased [data-secview="unreleased|scroll"]');
  await page.waitForSelector('#unreleased .hrow .vsc');
  if (process.env.SHOT5) { await page.evaluate(() => document.querySelector('#unreleased').scrollIntoView()); await page.screenshot({ path: process.env.SHOT5 }); }
});
await step('Music tab: a Features area for guests on my songs AND my guest spots on others\' songs, with its own View menu and chips', async () => {
  await page.waitForSelector('#features .vsc');
  const info = await page.evaluate(() => { const el = document.querySelector('#features'); return { cls: el.className, ribbon: el.querySelector('.vs-ribbon').textContent.toLowerCase(), chips: [...el.querySelectorAll('.vs-chips button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()), cards: el.querySelectorAll('.vsc').length, tags: [...el.querySelectorAll('.vtag')].map((e) => e.textContent).sort(), view: S.sec.features.view }; });
  assert.ok(/spot/.test(info.cls) && /features/.test(info.ribbon), 'its own look: ' + info.ribbon);
  assert.deepEqual(info.chips, ['All 2', 'Guests on my songs 1', 'My guest spots 1', 'Aziza 1', 'Berhani 1'], 'kind chips, then a chip for each person: ' + info.chips.join(' | '));
  assert.deepEqual(info.tags, ['Guest spot', 'feat. Aziza'], 'each song says which kind it is: ' + info.tags.join(' | '));
  assert.equal(info.view, 'scroll', 'its View is separate from the Unreleased area (which is on list)');
  await page.click('#features [data-secchip="features|k:mine"]'); await page.waitForFunction(() => document.querySelectorAll('#features .vsc').length === 1 && /Berhani/.test(document.querySelector('#features .vsc').innerText), null, { timeout: 5000 });
  await page.click('#features [data-secchip="features|a:Aziza"]'); await page.waitForFunction(() => document.querySelectorAll('#features .vsc').length === 1 && /feat. Aziza/i.test(document.querySelector('#features .vsc').innerText), null, { timeout: 5000 });
  await page.click('#features [data-libmenu]'); await tapAt('#features [data-secview="features|large"]');
  await page.waitForSelector('#features .allgrid.large .vsc'); await noSideways('features area');
});
await step('Studio: tell an unreleased song what it counts as, and the Unreleased area re-sorts it', async () => {
  await page.evaluate(() => { S.stuRel = 'rel_single'; renderStudio(); });
  await page.waitForSelector('[data-k="unrel_kind"]', { state: 'attached', timeout: 10000 });
  await page.evaluate(() => { const sel = document.querySelector('[data-stu-song="trk_sg"] [data-k="unrel_kind"]'); sel.value = 'Album'; document.querySelector('[data-stu-song="trk_sg"] [data-stu-savesong]').click(); });
  for (let i = 0; i < 50; i++) { const t = (await store()).tracks.find((x) => x.track_id === 'trk_sg'); if (t && t.unrel_kind === 'Album') break; await new Promise((r) => setTimeout(r, 100)); }
  assert.equal((await store()).tracks.find((x) => x.track_id === 'trk_sg').unrel_kind, 'Album', 'saved on the server');
  await page.waitForFunction(() => trk('trk_sg').unrel_kind === 'Album', null, { timeout: 8000 });   // the page has taken the saved answer
  await page.evaluate(() => { S.sec.unreleased.chip = 'all'; renderLibrary(); });
  await page.waitForSelector('#unreleased .vs-chips');
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#unreleased .vs-chips button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim())), ['All 2', 'Albums 1', 'EPs 1']);
});
await step('fans see the Unreleased and Features areas too (without the owner hint)', async () => {
  const fctx = await phoneContext(), fan = await fctx.newPage(); fan.on('pageerror', (e) => problems.push('fan page error: ' + e.message));
  await fan.goto('https://soulnicolas.com/?s=PUB'); await fan.waitForSelector('.tabs [data-nav="library"]', { state: 'attached', timeout: 15000 }); await fan.evaluate(() => renderLibrary()); await fan.waitForSelector('#unreleased .vsc', { timeout: 15000 });
  const t = await fan.evaluate(() => ({ chips: [...document.querySelectorAll('#unreleased .vs-chips button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()), feat: !!document.querySelector('#features .vsc'), hint: !!document.querySelector('.vs-hint'), sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  assert.deepEqual(t.chips, ['All 2', 'Albums 1', 'EPs 1']); assert.ok(t.feat && !t.hint && t.sw <= t.iw + 1);
  await fctx.close();
});
await step('Lore: the Karibu tena / Soul Vault header with the new-release, share-links and Settings buttons is at the top', async () => {
  await page.evaluate(() => renderLore());
  await page.waitForSelector('.wrap.lore .home-h');
  const t = await page.evaluate(() => { const w = document.querySelector('.wrap.lore'), h = w.querySelector('.home-h'); return { first: w.firstElementChild === h, hello: h.querySelector('.hello').textContent, brand: h.querySelector('.brand').textContent.replace(/\s+/g, ' '), btns: ['[data-newrel]', '[data-nav="shares"]', '.avatar[data-nav="vault"]'].map((q) => !!h.querySelector(q)) }; });
  assert.ok(t.first, 'it is the very first thing on the Lore page'); assert.equal(t.hello, 'Karibu tena'); assert.equal(t.brand, 'Soul Vault'); assert.deepEqual(t.btns, [true, true, true]);
  await noSideways('lore page'); await page.click('.wrap.lore .home-h .avatar');
  await seen('Check YouTube setup');                                                                         // the avatar opens Settings
  const fctx = await phoneContext(), fan = await fctx.newPage();
  await fan.goto('https://soulnicolas.com/?s=PUB'); await fan.waitForSelector('.tabs [data-nav="library"]', { state: 'attached', timeout: 15000 }); await fan.evaluate(() => renderLore()); await fan.waitForSelector('.wrap.lore .home-h');
  const f = await fan.evaluate(() => { const h = document.querySelector('.wrap.lore .home-h'); return { hello: h.querySelector('.hello').textContent, buttons: h.querySelectorAll('button').length }; });
  assert.ok(/^Karibu, /.test(f.hello) && f.buttons === 0, 'fans get the greeting and name, without the owner buttons: ' + JSON.stringify(f));
  await fctx.close();
});
await step('Listening insights: who is listening now, unique listeners, arrows, charts, no sideways scroll', async () => {
  await page.evaluate(() => renderVault());
  await page.click('[data-nav="insights"]:visible');
  await page.waitForFunction(() => /2 listening now/.test(document.body.innerText), null, { timeout: 8000 });
  const t = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  assert.ok(/Jo\b.*Phone/.test(t) && /Fan club link.*Computer/.test(t), 'the live list names who (by link) and the device: ' + t.slice(0, 300));
  await page.waitForFunction(() => document.querySelector('#insBody .kpis'), null, { timeout: 8000 });
  await page.click('[data-ins-days="7"]'); await page.waitForFunction(() => document.querySelector('[data-ins-days="7"]').getAttribute('aria-pressed') === 'true' && document.querySelector('#insBody .kpis'), null, { timeout: 8000 });
  await page.waitForFunction(() => [...document.querySelectorAll('#insBody .kpi')].some((e) => e.querySelector('span').textContent === 'Listeners' && e.querySelector('b').textContent === '3'), null, { timeout: 8000 });
  const k = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#insBody .kpi')].map((e) => [e.querySelector('span').textContent, { v: e.querySelector('b').textContent, chip: ((e.querySelector('.dl') || {}).textContent || '').trim() }])));
  assert.deepEqual([k['Listeners'].v, k['Streams'].v, k['Streams per listener'].v, k['Finish rate'].v, k['Hours listened'].v, k['New listeners'].v], ['3', '5', '1.7', '80%', '0.2', '2'], JSON.stringify(k));
  assert.deepEqual([k['Listeners'].chip, k['Streams'].chip, k['Finish rate'].chip], ['▲ 200%', '▲ 400%', '▼ 20 pts'], 'arrows compare with the week before: ' + JSON.stringify(k));
  const body = await page.evaluate(() => document.querySelector('#insBody').innerText.replace(/\s+/g, ' '));
  assert.ok(/Listeners per day/i.test(body), 'the chart starts on listeners');
  await page.click('[data-ins-metric="n"]'); await page.waitForFunction(() => /Streams per day/i.test(document.querySelector('#insBody').innerText), null, { timeout: 5000 });
  assert.ok(/New\s*2\s*\(67%\)/.test(body) && /Returning\s*1\s*\(33%\)/.test(body), 'new vs returning: ' + body.slice(0, 600));
  assert.ok(/Song trk_a1/.test(body) && /Busiest hour/.test(body) && /Phone\s*60%/.test(body) && /Computer\s*40%/.test(body), 'top songs, busiest hour and the phone/computer split show');
  await noSideways('insights');
  if (process.env.SHOT2) await page.screenshot({ path: process.env.SHOT2, fullPage: true });
  // it keeps itself up to date: a third phone starts, then one stops
  await w.call('listeningNow', ['', 'PUB', 'liveC', 'ver_a1', 'phone']); await page.evaluate(() => pollLive());
  await page.waitForFunction(() => /3 listening now/.test(document.body.innerText), null, { timeout: 8000 });
  await w.call('listeningNow', ['', 'FAN', 'liveA', '', 'phone']); await page.evaluate(() => pollLive());
  await page.waitForFunction(() => /2 listening now/.test(document.body.innerText), null, { timeout: 8000 });
  await page.click('.back');
  await seen('Check YouTube setup');
});
await step('the player tells the site it is playing (about every 30 s) and says so when it pauses', async () => {
  const live = () => w.db.prepare('SELECT share_token, version_id, device FROM live WHERE device_id NOT LIKE ?').bind('live%').all().then((r) => r.results);
  await page.evaluate(() => { Object.defineProperty(audio, 'paused', { configurable: true, get: () => false }); const v = ver('ver_a1'), t = trk(v.track_id); S.now = { v, t, r: S.lib.releases.find((x) => x.release_id === t.release_id), dl: '' }; audio.dispatchEvent(new Event('playing')); });
  await page.waitForFunction(() => true); for (let i = 0; i < 40 && !(await live()).length; i++) await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(await live(), [{ share_token: 'owner', version_id: 'ver_a1', device: 'phone' }], 'a playing song is reported (as the owner, on a phone-sized screen)');
  await page.evaluate(() => nowBeat(false));                                                                 // a moment later, same song: nothing new is sent
  await page.evaluate(() => { Object.defineProperty(audio, 'paused', { configurable: true, get: () => true }); audio.dispatchEvent(new Event('pause')); });
  for (let i = 0; i < 40 && (await live()).length; i++) await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(await live(), [], 'pausing clears it');
  await page.evaluate(() => { delete audio.paused; S.now = null; });
});
await step('every Settings screen that used to be a grey pop-up now opens as a full page with a back link and a big title', async () => {
  await page.evaluate(() => renderVault());
  const rows = [['[data-missing]', 'Missing files', 'missing'], ['[data-fans]', 'Soul Tribe fan list', 'tribe'], ['[data-backups]', 'Backups', 'backups'], ['[data-areas]', 'Move off the Sheet', 'sheet'], ['[data-ownerpw]', 'Set owner password', 'password'], ['[data-problems]', 'Problems reported', 'problems'], ['[data-check-yt]', 'Check YouTube setup', 'youtube']];
  for (const [sel, name, word] of rows) {
   try {
    await page.click(sel + ':visible');
    await page.waitForFunction(() => { const m = document.querySelector('#modal'); return m && !m.hidden && m.classList.contains('pagemode') && m.querySelector('h2.pgtitle') && m.querySelector('.pgback'); }, null, { timeout: 8000 }).catch(async () => { throw new Error(`${name}: did not open as a page (modal: ${await page.evaluate(() => { const m = document.querySelector('#modal'); return m ? `hidden=${m.hidden} class=${m.className} text=${m.innerText.slice(0, 80)}` : 'none'; })})`); });
    const m = await page.evaluate(() => { const m = document.querySelector('#modal'), h = m.querySelector('h2.pgtitle'), r = h.getBoundingClientRect(), bg = getComputedStyle(m.querySelector('.sheet')).backgroundColor, tabs = document.querySelector('.tabs'); return { title: h.textContent, bold: !!h.querySelector('b'), size: parseFloat(getComputedStyle(h).fontSize), top: Math.round(r.top), sheetBg: bg, tabsOn: !!tabs && getComputedStyle(tabs).display !== 'none' }; });
    assert.ok(m.title.toLowerCase().includes(word), `${name}: title is "${m.title}"`);
    assert.ok(m.bold && m.size >= 30, `${name}: the title is big and bold like the other pages (${m.size}px)`);
    assert.ok(/rgba\(0, 0, 0, 0\)|transparent/.test(m.sheetBg), `${name}: no grey box behind the content (${m.sheetBg})`);
    await noSideways(name + ' page');
    if (process.env.SHOT3 && name === 'Missing files') await page.screenshot({ path: process.env.SHOT3, fullPage: false });
    await page.click('#modal .pgback');
    await page.waitForFunction(() => document.querySelector('#modal').hidden && !document.querySelector('#modal').classList.contains('pagemode'), null, { timeout: 5000 });
    await seen('Check YouTube setup');
   } finally { await page.evaluate(() => { const m = document.querySelector('#modal'); if (m && !m.hidden) { m.hidden = true; m.innerHTML = ''; } }); }   // never leave a page open for the next steps
  }
});
await step('"Check YouTube setup" says YouTube is connected', async () => { await page.evaluate(() => renderVault()); await page.click('[data-check-yt]:visible'); await seen('YouTube is connected').catch(async e => { throw new Error('modal says: ' + (await page.evaluate(() => (document.querySelector('#modal') || document.body).innerText)).replace(/\s+/g, ' ').slice(0, 300)); }); await noSideways('youtube check'); await page.click('#modal [data-close]'); });
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
await step('Extras: the release page says what each extra is (draft, remix, ...), can filter them, and the editor offers all five labels', async () => {
  const made = (await w.call('createReleaseFromYoutube', [KEY, { url: 'https://www.youtube.com/playlist?list=PLextrastest0123456789abcdefghijk' }])).result;
  const ids = made.tracks.map((t) => t.track_id), relId = made.release.release_id;
  assert.equal(ids.length, 3);
  const save = await w.call('saveTracklist', [KEY, relId, 'Extras Test EP', [{ track_id: ids[0], category: 'Main' }, { track_id: ids[1], category: 'Deluxe', extra_kind: 'Remix' }, { track_id: ids[2], category: 'Deluxe', extra_kind: 'Draft' }], true, 'Album']);
  assert.equal(save.ok, true, JSON.stringify(save));
  await page.evaluate(async (id) => { await syncCatalog(); S.songTab = 'full'; renderRelease(id); }, relId);
  await seen('Extras Test EP');
  const tabs = await page.evaluate(() => [...document.querySelectorAll('.songtabs button')].map((b) => b.innerText.replace(/\s+/g, ' ').trim()));
  assert.deepEqual(tabs, ['Full project 1', 'Extras 2'], 'the old Drafts and B-Sides tabs are one Extras tab: ' + tabs.join(' | '));
  assert.ok(!/\bDrafts\b/.test(await page.evaluate(() => document.body.innerText)), 'the word "Drafts" is gone from the release page');
  assert.ok(/With extras: 3 songs/.test(await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))), 'the summary line says "With extras"');
  await page.click('[data-songtab="extras"]');
  await page.waitForFunction(() => document.querySelectorAll('#era-songs .xkind').length === 2, null, { timeout: 5000 });
  const chips = await page.evaluate(() => [...document.querySelectorAll('#era-songs .tracks > li, #era-songs .tracks > *')].filter((e) => e.querySelector('.xkind')).map((e) => e.querySelector('.tt').textContent + ' = ' + e.querySelector('.xkind').textContent));
  assert.deepEqual(chips.sort(), ['Demo Song = Draft', 'Remix Song = Remix'], 'each extra shows its label: ' + chips.join(' | '));
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.xfilter button')].map((b) => b.innerText.replace(/\s+/g, ' ').trim())), ['All 2', 'Draft 1', 'Remix 1'], 'filter by kind');
  await page.click('[data-xkind="Remix"]');
  await page.waitForFunction(() => document.querySelectorAll('#era-songs .tracks .tt').length === 1 && /Remix Song/.test(document.querySelector('#era-songs .tracks .tt').innerText), null, { timeout: 5000 });
  await page.click('[data-xkind="all"]'); await page.waitForFunction(() => document.querySelectorAll('#era-songs .tracks .tt').length === 2, null, { timeout: 5000 });
  if (process.env.SHOT4) { await page.evaluate(() => document.querySelector('#era-songs').scrollIntoView()); await page.screenshot({ path: process.env.SHOT4 }); }
  await page.click('[data-xkind="Remix"]');
  await noSideways('release page with extras');
  // the editor: every label is offered; change the draft to a cover and save
  await page.click('[data-edit]:visible'); await page.waitForSelector('[data-cat]', { state: 'attached', timeout: 10000 });
  const opts = await page.evaluate(() => [...document.querySelector('[data-cat]').options].map((o) => o.text));
  assert.deepEqual(opts, ['Full project', 'Extra: Draft', 'Extra: Audio note', 'Extra: Remix', 'Extra: Cover', 'Extra: B-Side']);
  await page.evaluate(() => { const sel = document.querySelector('[data-cat="2"]'); sel.value = 'Cover'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.evaluate(() => document.querySelector('[data-edit-save]').click());
  await page.waitForFunction(() => !document.querySelector('[data-cat]'), null, { timeout: 8000 });
  await page.evaluate(() => { S.songTab = 'extras'; S.xkind = 'all'; renderRelease(S.releaseId); });
  await page.waitForFunction(() => [...document.querySelectorAll('#era-songs .xkind')].some((e) => e.textContent === 'Cover'), null, { timeout: 8000 });
  const fan = (await w.call('getShare', ['PUB'])).result;
  assert.ok(!JSON.stringify(fan).includes('Extras Test EP'), 'still hidden from fans');
  const saved = (await store()).tracks.find((t) => t.track_id === ids[2]);
  assert.deepEqual([saved.category, saved.extra_kind], ['Deluxe', 'Cover'], 'the label was saved on the server');
});
await step('Missing files: link a song you added with New release to the missing one', async () => {
  const lib = async () => { const o = await store(); return o; };
  await page.evaluate(() => renderVault());                                                                // (the voice note step left us on the release page)
  await page.click('[data-missing]:visible'); await page.waitForSelector('#modal .msrow', { timeout: 8000 });
  const row = '#modal .msrow[data-ms="ver_sg"]';
  assert.ok(await page.$(row), 'the missing song is listed');
  await page.click(row + ' [data-ms-link]'); await page.waitForSelector(row + ' [data-ms-q]');
  assert.ok(await page.$(row + ' [data-ms-pick]'), 'the songs you added are offered');
  await page.fill(row + ' [data-ms-q]', 'second test');
  await page.waitForFunction((r) => { const b = [...document.querySelectorAll(r + ' [data-ms-pick]')]; return b.length === 1 && /Second Test Song/.test(b[0].innerText); }, row, { timeout: 5000 });
  await noSideways('missing files with the chooser open');
  await page.click(row + ' [data-ms-pick]'); await page.waitForSelector(row + ' [data-ms-go]');
  await page.click(row + ' [data-ms-go]');
  await page.waitForFunction(() => !document.querySelector('#modal .msrow[data-ms="ver_sg"]'), null, { timeout: 8000 });
  const o = await lib(), moved = o.versions.find((v) => v.track_id === 'trk_sg' && v.native);
  assert.ok(moved, 'the added file is now on the missing song');
  assert.ok(!o.tracks.some((t) => t.title === 'Second Test Song'), 'the added song it came from is gone');
  assert.deepEqual((await w.call('missingList', [KEY])).result, [], 'it is off the Missing files list');
  assert.ok(await page.evaluate(() => S.lib.versions.some((v) => v.track_id === 'trk_sg' && v.native)), 'the app shows the change without a reload');
  await page.click('#modal .pgback');
});
await step('fans never see the hidden test release', async () => {
  const lib = (await w.call('getShare', ['PUB'])).result;
  assert.ok(!JSON.stringify(lib).includes('Browser Test EP'), 'the hidden release must not reach the public link');
});
await step('no console errors or page errors the whole time', async () => { assert.deepEqual(problems, [], problems.join(' | ').slice(0, 500)); });

await browser.close(); w.done();
console.log(failures ? `\n${failures} step(s) failed.` : '\nAll steps passed.');
process.exit(failures ? 1 : 0);
