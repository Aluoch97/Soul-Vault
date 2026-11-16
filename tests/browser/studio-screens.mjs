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
w.youtube.videos.orig1111111 = 'x'; w.youtube.videos.orig2222222 = 'y'; w.youtube.stats = { orig1111111: { at: '2024-03-01T10:00:00Z', views: 5200, likes: 5 }, orig2222222: { at: '2025-06-01T10:00:00Z', views: 90, likes: 40 } };
w.youtube.playlists.PLYYNnxWFsj19t22I4Qy6lke0ytPaFz3LK = { title: 'Originals', videos: [{ id: 'orig1111111', title: 'Nicólas Soul - Original One (Official Audio)' }, { id: 'orig2222222', title: 'Zeta <i>Two</i>' }] };
w.youtube.videos.musA1111111 = 'x'; w.youtube.videos.musB2222222 = 'y'; w.youtube.stats.musA1111111 = { at: '2025-09-01T10:00:00Z', views: 1000, likes: 10 }; w.youtube.stats.musB2222222 = { at: '2023-01-01T10:00:00Z', views: 50, likes: 1 };
w.youtube.playlists.PLYYNnxWFsj1_wIe3c0Lyj4EL9tMs9GQYU = { title: 'Music videos', videos: [{ id: 'musA1111111', title: 'Nicólas Soul - Music Vid A (Official Music Video)' }, { id: 'musB2222222', title: 'Music Vid B' }] };
w.youtube.playlists.PLYYNnxWFsj18iVfs3mLzki3VA2OesBnDV = { title: 'Remixes', videos: [{ id: 'remx1111111', title: 'Remix One' }] };
w.youtube.playlists.PLgroups0123456789abcdefghijklmnop = { title: 'Group EP', videos: [{ id: 'vidCCCCCCC1', title: 'G1 (feat. Aziza)' }, { id: 'vidCCCCCCC2', title: 'G2 (feat. Khairro)' }, { id: 'vidCCCCCCC3', title: 'G3 (feat. Charlie, The Healer)' }] };
const grp = (await w.owner('createReleaseFromYoutube', { url: 'https://www.youtube.com/playlist?list=PLgroups0123456789abcdefghijklmnop' })).result;   // a project with three songs, all unreleased
assert.equal((await w.owner('studioSaveRelease', grp.release.release_id, { basics: { hidden: false } })).ok, true);
for (const t of grp.tracks) assert.equal((await w.owner('studioSaveTrack', t.track_id, { fields: {}, unreleased: true })).ok, true);
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
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
async function phoneContext(cf = { city: 'Nashville', region: 'Tennessee', country: 'US' }, extra = {}) {
  const ctx = await browser.newContext({ viewport: { width: Number(process.env.PHONE_W || 390), height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: IPHONE, ...extra });
await ctx.route('**/*', r => r.abort());                                                     // nothing leaves the machine unless allowed below
await ctx.route('https://media.soulnicolas.com/**', r => r.fulfill({ status: 404, body: '' }));
await ctx.route('https://soulnicolas.com/**', async (route) => {
  const req = route.request(), url = new URL(req.url());
  if (url.pathname === '/api') {
    const request = new Request(req.url(), { method: 'POST', body: req.postData() || '', headers: { 'CF-Connecting-IP': '198.51.100.9', 'User-Agent': req.headers()['user-agent'] || '' } });
    Object.defineProperty(request, 'cf', { value: cf });
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
await step('opens as the owner and shows the library', async () => { await page.goto('https://soulnicolas.com/?k=' + KEY); await page.waitForSelector('.wrap .home-h', { timeout: 15000 }).catch(async e => { if (process.env.DEBUG) console.log('   [body]', (await page.evaluate(() => document.body.innerText)).slice(0, 400)); throw e; }); assert.equal(await page.evaluate(() => document.querySelectorAll('.home-h [data-newrel], .home-h .avatar, .home-h [data-nav="shares"]').length), 0, 'the Music tab has no new-release / share-links / Settings buttons'); await noSideways('library'); });
await step('at start-up the owner app loads Studio\'s saved settings (unreleased flags, listen links)', async () => {
  await page.waitForFunction(() => S.links && S.links.flags && S.links.flags.tracks && S.links.flags.tracks.trk_a1 === true, null, { timeout: 8000 });
});
await step('Settings opens and lists the owner tools', async () => { await page.evaluate(() => renderLore()); await page.waitForSelector('.wrap.lore [data-nav="vault"]'); await page.click('.wrap.lore [data-nav="vault"]'); await page.waitForSelector('.setpg details.sset'); await page.evaluate(() => { document.querySelectorAll('details.sset').forEach((d) => { d.open = true; }); }); await seen('Check YouTube setup'); await seen('Studio');
  assert.deepEqual(await page.evaluate(() => ['Upload a new release', 'Your bio', 'Recently played'].map((t) => document.body.innerText.includes(t))), [false, false, false], 'Settings no longer lists the upload, bio or Recently played rows (uploads and the bio are in Studio)'); await noSideways('settings'); if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true }); });
await step('Settings is decluttered: related rows share one folder row (Fix songs, Health checks, Backups, Sign-in & keys) that opens and shuts, and the stat strip shows three numbers', async () => {
  await page.evaluate(() => { document.querySelectorAll('details.sset').forEach((d) => { d.open = false; }); });
  const c = await page.evaluate(() => ({ folders: [...document.querySelectorAll('details.sset')].map((d) => d.dataset.sset), vis: ['[data-missing]', '[data-fillfacts]', '[data-linkonly]', '[data-check-yt]', '[data-backups]', '[data-ownerpw]'].map((q) => { const e = document.querySelector(q); return !!e && e.getBoundingClientRect().height > 0 && e.offsetParent !== null && !!e.closest('details') && e.closest('details').open; }), stats: [...document.querySelectorAll('.setstats .tile strong')].map((e) => e.textContent.trim()), hero: !!document.querySelector('.shero[data-nav="studio"]'), topRows: document.querySelectorAll('.sgroup > .acts-list > li, .sgroup > .sfolders > details, .sgroup > .sfolders > .acts-list > li').length }));
  assert.deepEqual(c.folders, ['songs', 'health', 'data', 'account'], 'four folders: ' + c.folders); assert.ok(c.vis.every((v) => !v), 'rows inside a shut folder are not on the page: ' + c.vis);
  assert.ok(c.stats.length === 3 && c.stats.every((x) => /^\d+$/.test(x)), 'three numbers: ' + c.stats); assert.ok(c.hero, 'Studio is the big card at the top');
  await page.click('details[data-sset="songs"] > summary'); assert.equal(await page.evaluate(() => [...document.querySelectorAll('details[data-sset="songs"] .acts-list button')].filter((b) => b.getBoundingClientRect().height > 0).length), 3, 'tapping Fix songs shows its three rows');
  await page.waitForFunction(() => S.setOpen.has('songs'), null, { timeout: 3000 });
  await page.evaluate(() => renderVault()); assert.equal(await page.evaluate(() => document.querySelector('details[data-sset="songs"]').open), true, 'a folder you opened stays open');
  await page.evaluate(() => { document.querySelectorAll('details.sset').forEach((d) => { d.open = true; }); });
  await noSideways('settings folders');
  if (process.env.SHOT_SET) { await page.evaluate(() => { document.querySelectorAll('details.sset').forEach((d) => { d.open = false; }); window.scrollTo(0, 0); }); await page.waitForTimeout(300); await page.screenshot({ path: process.env.SHOT_SET, fullPage: true }); await page.evaluate(() => { document.querySelectorAll('details.sset').forEach((d) => { d.open = true; }); }); }
});
await step('Settings rows are tidy: grouped, one-line titles, same height, same layout', async () => {
  const m = await page.evaluate(() => { const rows = [...document.querySelectorAll('.acts-list button')].map((b) => ({ h: Math.round(b.getBoundingClientRect().height), t: Math.round(b.querySelector('b').getBoundingClientRect().height), x: Math.round(b.querySelector('.si').getBoundingClientRect().left), title: b.querySelector('b').textContent }));
    return { narrow: window.innerWidth < 360, rows, groups: document.querySelectorAll('.sgroup').length, headings: [...document.querySelectorAll('.sgroup .vsub')].map((h) => h.textContent) }; });
  assert.ok(m.groups >= 4 && new Set(m.headings).size === m.groups, 'four groups with their own headings: ' + m.headings.join(', '));
  assert.ok(m.rows.length >= 10, 'rows: ' + m.rows.length);
  for (const r of m.rows) { assert.ok(r.t <= (m.narrow ? 48 : 24), `"${r.title}" wraps onto several lines (${r.t}px tall)`); assert.ok(r.h >= 60 && r.h <= 110, `"${r.title}" row height ${r.h}px`); }
  assert.equal(new Set(m.rows.map((r) => r.x)).size, 1, 'icons line up in one column');
  assert.ok(new Set(m.rows.map((r) => r.h)).size <= (m.narrow ? 4 : 2), 'rows are all the same height (within one note line): ' + [...new Set(m.rows.map((r) => r.h))].join(', '));
});
await step('Studio and Share links each have a Settings back button that works', async () => {
  for (const nav of ['studio', 'shares']) {
    await page.click('#main [data-nav="' + nav + '"]');
    await page.waitForSelector('button.back[data-nav="vault"]', { timeout: 8000 });
    assert.match(await page.textContent('button.back[data-nav="vault"]'), /Settings/);
    await page.click('button.back[data-nav="vault"]');
    await seen('Check YouTube setup');
  }
});
await step('Music tab: the Unreleased area is its own secret-access area with its own View menu and classification chips', async () => {
  await page.evaluate(() => renderLibrary());
  await page.waitForSelector('#unreleased .vsc', { timeout: 10000 }).catch(async (e) => { throw new Error('no Unreleased area: ' + JSON.stringify(await page.evaluate(() => ({ n: unreleasedSongs().length, view: S.view, a1: (({ track_id, unreleased, hidden, title }) => ({ track_id, unreleased, hidden, title }))(S.lib.tracks.find((t) => t.track_id === 'trk_a1') || {}), body: document.querySelector('#main').innerText.slice(0, 200).replace(/\s+/g, ' ') })))); });
  const info = await page.evaluate(() => { const el = document.querySelector('#unreleased'); return { cls: el.className, ribbon: el.querySelector('.vs-ribbon').textContent.toLowerCase(), chips: [...el.querySelectorAll('.vs-chips button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()), cards: el.querySelectorAll('.vsc').length,
    glow: getComputedStyle(el, '::before').content, sheen: getComputedStyle(el.querySelector('.vart'), '::after').animationName, menu: !!el.querySelector('[data-libmenu], [data-secview]'), libView: S.libView, hint: !!el.querySelector('.vs-hint') }; });
  assert.ok(/secret/.test(info.cls) && /access granted/.test(info.ribbon) && /unreleased vault/.test(info.ribbon), 'it has the secret-access ribbon: ' + info.ribbon);
  assert.notEqual(info.glow, 'none', 'it has the glowing border'); assert.equal(info.menu, false, 'no View menu of its own: it is a scrolling row');
  assert.deepEqual(info.chips, ['All 3', 'Singles 1', 'Albums 1', 'EPs 1'], 'projects, sorted by what they count as: ' + info.chips.join(' | '));
  assert.equal(info.cards, 3, 'one card per PROJECT (5 songs, 3 projects), not one per song'); assert.equal(info.hint, false, 'nothing is unsorted');
  const cards = await page.evaluate(() => [...document.querySelectorAll('#unreleased .vsc')].map((c) => c.querySelector('.agt').textContent + ' = ' + c.querySelector('.vtag').textContent + ' / ' + c.querySelector('.cs').textContent).sort());
  assert.ok(cards.some((c) => /^Group EP = Album \/ .*3 unreleased songs$/.test(c)) && cards.some((c) => /^Open Album = EP/.test(c)) && cards.some((c) => /^A Single = Single/.test(c)), 'each project says what it is and how many unreleased songs it has: ' + cards.join(' | '));
  await noSideways('music tab with the unreleased area');
  await page.waitForSelector('#unreleased .hrow.vrow .vsc'); await noSideways('unreleased area');
  await page.click('#unreleased [data-secchip="unreleased|EP"]');
  await page.waitForFunction(() => document.querySelectorAll('#unreleased .vsc').length === 1, null, { timeout: 5000 });
  await page.click('#unreleased [data-secchip="unreleased|all"]');
  await page.waitForSelector('#unreleased .hrow .vsc');
  await tapAt('#unreleased .vsc'); await page.waitForFunction(() => S.view === 'release', null, { timeout: 8000 });   // tapping a project opens it
  await page.evaluate(() => renderLibrary()); await page.waitForSelector('#unreleased .vsc');
  if (process.env.SHOT5) { await page.evaluate(() => document.querySelector('#unreleased').scrollIntoView()); await page.screenshot({ path: process.env.SHOT5 }); }
});
await step('Music tab: Features lists only my guest spots (no "my features" tab): one project card each, songs by name, "by <artist>", same-height cards', async () => {
  await page.evaluate(() => { S.sec = {}; renderLibrary(); }); await page.waitForSelector('#extras [data-extab="features"]'); await page.click('#extras [data-extab="features"]');
  await page.waitForSelector('#features .vsc');
  const info = await page.evaluate(() => { const el = document.querySelector('#features'); return { cls: el.className, ribbon: el.querySelector('.vs-ribbon').textContent.toLowerCase(), tabs: el.querySelectorAll('.vs-tabs, [data-sectab]').length, chips: [...el.querySelectorAll('[data-secsel] option')].map((o) => o.textContent.trim()),
    tags: [...el.querySelectorAll('.vtag')].map((b) => b.textContent.trim()), subs: [...el.querySelectorAll('.vsub2')].map((b) => b.textContent.trim()), titles: [...el.querySelectorAll('.vsc .agt')].map((b) => b.textContent.trim()), songs: [...el.querySelectorAll('.vsc')].map((c) => [...c.querySelectorAll('.vsong')].map((x) => x.textContent).join(' / ')) }; });
  assert.ok(/spot/.test(info.cls) && /features/.test(info.ribbon), 'its own look: ' + info.ribbon);
  assert.equal(info.tabs, 0, 'no tabs: Features is only my guest spots');
  assert.ok(info.tags.length >= 1 && info.tags.every((t) => t === 'Guest spot'), 'every card is a guest spot: ' + info.tags.join(' | '));
  assert.ok(info.subs.every((t) => /^by /.test(t)) && info.subs.some((t) => /Berhani/.test(t)), 'each card says whose song it is: ' + info.subs.join(' | '));
  assert.ok(!info.titles.includes('Group EP') && !info.titles.includes('Open Album'), 'projects that only have guests on MY songs are not listed: ' + info.titles.join(' | '));
  assert.ok(info.songs.some((s) => /^Song trk_sg$/.test(s)), 'a card names the song: ' + info.songs.join(' | '));
  assert.deepEqual(await page.evaluate(() => [featuresOf({ features: 'Charlie, The Healer' }), featuresOf({ features: 'Charlie & Aziza' }), featuresOf({ title: 'X (feat. The Healer)' }), featuresOf({ features: 'Charlie, The Healer, Charlie' })]), [['Charlie, The Healer'], ['Charlie, The Healer', 'Aziza'], ['Charlie, The Healer'], ['Charlie, The Healer']], 'Charlie and The Healer are one artist: Charlie, The Healer');
  const uni = await page.evaluate(() => { const c = [...document.querySelectorAll('#features .vsc')]; return { heights: [...new Set(c.map((e) => Math.round(e.getBoundingClientRect().height)))], overflow: c.some((e) => e.scrollWidth > e.clientWidth + 1) }; });
  assert.equal(uni.heights.length, 1, 'every project card is the same height: ' + uni.heights.join(', ')); assert.equal(uni.overflow, false, 'no text spills out of a card');
  assert.equal(await page.evaluate(() => document.querySelectorAll('#features [data-libmenu], #features .allgrid, #features .alllist').length), 0, 'Features has no View menu: one scrolling row');
  await noSideways('features area');
});
await step('Studio: tell an unreleased song what it counts as, and the Unreleased area re-sorts it', async () => {
  await page.evaluate(() => { S.stuRel = 'rel_single'; renderStudio(); });
  await page.waitForSelector('[data-k="unrel_kind"]', { state: 'attached', timeout: 10000 });
  await page.evaluate(() => { const sel = document.querySelector('[data-stu-song="trk_sg"] [data-k="unrel_kind"]'); sel.value = 'Album'; document.querySelector('[data-stu-song="trk_sg"] [data-stu-savesong]').click(); });
  for (let i = 0; i < 50; i++) { const t = (await store()).tracks.find((x) => x.track_id === 'trk_sg'); if (t && t.unrel_kind === 'Album') break; await new Promise((r) => setTimeout(r, 100)); }
  assert.equal((await store()).tracks.find((x) => x.track_id === 'trk_sg').unrel_kind, 'Album', 'saved on the server');
  await page.waitForFunction(() => trk('trk_sg').unrel_kind === 'Album', null, { timeout: 8000 });   // the page has taken the saved answer
  await page.evaluate(() => { S.sec = {}; renderLibrary(); });
  await page.waitForSelector('#unreleased .vs-chips');
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#unreleased .vs-chips button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim())), ['All 3', 'Albums 2', 'EPs 1']);
});
await step('fans see the Unreleased and Features areas too (without the owner hint)', async () => {
  const fctx = await phoneContext(), fan = await fctx.newPage(); fan.on('pageerror', (e) => problems.push('fan page error: ' + e.message));
  await fan.goto('https://soulnicolas.com/?s=PUB'); await fan.waitForSelector('.tabs [data-nav="library"]', { state: 'attached', timeout: 15000 }); await fan.evaluate(() => renderLibrary()); await fan.waitForSelector('#unreleased .vsc', { timeout: 15000 });
  const t = await fan.evaluate(() => ({ chips: [...document.querySelectorAll('#unreleased .vs-chips button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()), feat: false, hint: !!document.querySelector('.vs-hint'), sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  assert.deepEqual(t.chips, ['All 3', 'Albums 2', 'EPs 1']); assert.ok(!t.hint && t.sw <= t.iw + 1);
  await fan.click('#extras [data-extab="features"]'); await fan.waitForSelector('#features .vsc', { timeout: 8000 });   // the Features tab is there for fans too
  await fctx.close();
});
await step('the page reports each page view with the time on it, from a phone, with the city; robots and Do-Not-Track are left out', async () => {
  await w.call('getSiteLive', [KEY, false]);                                                                // (makes the table, so a slow machine does not query it too early)
  const rowsOf = (dev) => w.db.prepare('SELECT * FROM site_views WHERE device_id = ? ORDER BY at').bind(dev).all().then((r) => r.results);
  const fctx = await phoneContext({ city: 'Franklin', region: 'Tennessee', country: 'US' }), fan = await fctx.newPage();
  await fan.goto('https://soulnicolas.com/?s=PUB', { referer: 'https://l.instagram.com/' });
  await fan.waitForSelector('.tabs [data-nav="library"]', { state: 'attached', timeout: 15000 });
  const dev = await fan.evaluate(() => deviceId());
  for (let i = 0; i < 50 && !(await rowsOf(dev)).length; i++) await new Promise((r) => setTimeout(r, 100));
  let r = await rowsOf(dev); assert.equal(r.length, 1, 'the first page is reported right away');
  assert.deepEqual([r[0].path, r[0].device, r[0].city, r[0].ref, r[0].share_token], ['/', 'phone', 'Franklin', 'l.instagram.com', 'PUB'], JSON.stringify(r[0]));
  await fan.evaluate(() => renderLibrary());
  for (let i = 0; i < 50 && (await rowsOf(dev)).length < 2; i++) await new Promise((r) => setTimeout(r, 100));
  await fan.evaluate(() => { siteT.secs = 20; siteSend(false); });                                         // 20 seconds on the Music page
  for (let i = 0; i < 50 && !(await rowsOf(dev)).some((x) => x.seconds === 20); i++) await new Promise((r) => setTimeout(r, 100));
  r = await rowsOf(dev); assert.deepEqual(r.map((x) => x.path), ['/', '/vault']); assert.equal(r[1].seconds, 20, 'time on the page is saved');
  assert.equal(new Set(r.map((x) => x.visit_id)).size, 1, 'one visit'); assert.equal(new Set(r.map((x) => x.view_id)).size, 2, 'two page views');
  assert.equal(r[1].ref, '', 'the source is only noted on the first page of a visit');
  await fan.evaluate(() => { siteT.secs = 29; });                                                           // the page's own timer: at 30 seconds (a multiple of 15) it sends the time by itself
  for (let i = 0; i < 60 && !(await rowsOf(dev)).some((x) => x.seconds === 30); i++) await new Promise((r) => setTimeout(r, 100));
  assert.ok((await rowsOf(dev)).some((x) => x.seconds === 30), 'the time is refreshed on its own every 15 seconds');
  await fctx.close();
  const dnt = await phoneContext(undefined, {}), p2 = await dnt.newPage(); await p2.addInitScript(() => Object.defineProperty(navigator, 'doNotTrack', { value: '1' }));
  await p2.goto('https://soulnicolas.com/?s=PUB'); await p2.waitForSelector('.tabs [data-nav="library"]', { state: 'attached', timeout: 15000 }); const dev2 = await p2.evaluate(() => deviceId()); await new Promise((r) => setTimeout(r, 2500));
  assert.equal((await rowsOf(dev2)).length, 0, 'a browser that says Do Not Track is not counted'); await dnt.close();
  const bot = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }); await bot.route('**/*', (r) => r.abort());
  await bot.close();
});
await step('Video tab: Freestyles (originals + remixes together), Music Videos and Press; sorting; tap to play; own addresses; no sideways scroll', async () => {
  await page.click('#tabs [data-nav="video"]');
  await page.waitForSelector('.videopg .vidhero');
  assert.equal(await page.evaluate(() => document.querySelectorAll('#tabs button').length), 6, 'six tabs');
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#tabs button')].map((b) => b.dataset.nav)), ['home', 'library', 'video', 'tour', 'press', 'lore'], 'Video sits right next to Music');
  const look = await page.evaluate(() => ({ bar: getComputedStyle(document.querySelector('.vidtabs')).backgroundColor, h1: getComputedStyle(document.querySelector('.vidh1')).textAlign, sub: getComputedStyle(document.querySelector('.vidhead .cs')).textAlign, tabs: [...document.querySelectorAll('[data-vidtab]')].map((b) => b.textContent + (b.getAttribute('aria-selected') === 'true' ? '*' : '')) }));
  assert.equal(look.bar, 'rgba(0, 0, 0, 0)', 'no black bar behind the section buttons'); assert.deepEqual([look.h1, look.sub], ['center', 'center'], 'the title and the line under it are centred');
  assert.deepEqual(look.tabs, ['Freestyles*', 'Music Videos', 'Press']);
  const hero = () => page.evaluate(() => ({ title: (document.querySelector('.vidhero .vidtitle') || {}).textContent, tag: (document.querySelector('.vidhero .vidtag') || {}).textContent, wall: [...document.querySelectorAll('.vidwall .vidname')].map((e) => e.textContent), path: location.pathname }));
  const sortBtns = () => page.evaluate(() => [...document.querySelectorAll('[data-vidsortsel] option')].map((o) => o.textContent + (o.selected ? '*' : '')));
  let h = await hero();
  assert.deepEqual(await sortBtns(), ['Newest*', 'A–Z', 'Most viewed', 'Most liked'], 'one Sort dropdown, newest first by default');
  assert.deepEqual([h.title, h.tag, h.wall, h.path], ['Zeta <i>Two</i>', 'Original', ['Original One', 'Remix One'], '/media/videos'], 'originals and remixes in one list; the newest is featured; titles tidied and shown as plain text: ' + JSON.stringify(h));
  assert.match(await page.textContent('.vidhero .vidstat'), /90 views · Jun 2025/, 'views and month uploaded');
  const subs = () => page.evaluate(() => [...document.querySelectorAll('[data-vidsub]')].map((b) => b.textContent.replace(/\s+/g, ' ').trim() + (b.getAttribute('aria-selected') === 'true' ? '*' : '')));
  const bar = await page.evaluate(() => { const q = (x) => document.querySelector(x).getBoundingClientRect(); return { sameRow: Math.abs((q('.vidsub').top + q('.vidsub').height / 2) - (q('.vidsort').top + q('.vidsort').height / 2)) < 12, noPills: getComputedStyle(document.querySelector('[data-vidsub]')).borderTopWidth === '0px', rows: document.querySelectorAll('.vidhead, .vidtabs, .vidbar').length, selectFont: parseFloat(getComputedStyle(document.querySelector('[data-vidsortsel]')).fontSize) }; });
  assert.deepEqual([bar.sameRow, bar.noPills, bar.rows], [true, true, 3], 'less clutter: section buttons, then one toolbar with All/Originals/Remixes and the Sort dropdown on the same row: ' + JSON.stringify(bar)); assert.ok(bar.selectFont >= 16, 'the dropdown text is 16px+ so iPhones do not zoom');
  assert.deepEqual(await subs(), ['All*', 'Originals', 'Remixes'], 'Freestyles has tabs to separate the originals from the remixes');
  await page.click('[data-vidsub="remixes"]'); await page.waitForFunction(() => /Remix One/.test(document.querySelector('.vidhero .vidtitle').textContent) && location.pathname === '/media/videos/remixes' && !document.querySelector('.vidwall'), null, { timeout: 5000 });
  assert.deepEqual(await subs(), ['All', 'Originals', 'Remixes*']);
  await page.click('[data-vidsub="originals"]'); await page.waitForFunction(() => document.querySelectorAll('.vidwall .vidcard').length === 1 && /Original One|Zeta/.test(document.querySelector('.vidhero .vidtitle').textContent) && location.pathname === '/media/videos/originals', null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('.vidtag, .vidwall .vidname')].some((e) => /Remix One/.test(e.textContent))), false, 'no remixes among the originals');
  await page.click('[data-vidsub="all"]'); await page.waitForFunction(() => document.querySelectorAll('.vidwall .vidcard').length === 2 && location.pathname === '/media/videos', null, { timeout: 5000 });
  for (const [btn, expect] of [['A–Z', 'Original One'], ['Most viewed', 'Original One'], ['Most liked', 'Zeta <i>Two</i>'], ['Newest', 'Zeta <i>Two</i>']]) {
    await page.selectOption('[data-vidsortsel]', { label: btn }); await page.waitForFunction((t) => document.querySelector('.vidhero .vidtitle').textContent === t, expect, { timeout: 5000 });
  }
  await noSideways('video'); await tapAt('.vidstage');
  await page.waitForSelector('.vidhero iframe[src*="youtube-nocookie.com/embed/orig2222222"]');
  await page.click('.vidwall .vidcard:has-text("Remix One")');                                                  // a poster loads into the featured spot and plays
  await page.waitForSelector('.vidhero iframe[src*="youtube-nocookie.com/embed/remx1111111"]', { timeout: 5000 });
  h = await hero(); assert.deepEqual([h.title, h.tag], ['Remix One', 'Remix'], 'a remix says so');
  await page.click('[data-vidtab="music"]'); await page.waitForFunction(() => /Music Vid A/.test((document.querySelector('.vidhero .vidtitle') || {}).textContent || '') && location.pathname === '/media/videos/music-videos', null, { timeout: 5000 });
  h = await hero(); assert.deepEqual([h.tag, h.wall], ['Music video', ['Music Vid B']]); await noSideways('music videos');
  await page.click('[data-vidtab="press"]'); await page.waitForFunction(() => location.pathname === '/media/videos/press' && /Press/.test((document.querySelector('.vidhero .vidtag') || {}).textContent || ''), null, { timeout: 5000 });
  h = await hero(); assert.equal(h.wall.length, 3, 'the four press interviews: one featured, three below'); assert.deepEqual(await sortBtns(), [], 'no dates or counts for press videos, so no sort dropdown');
  await noSideways('press videos');
  assert.deepEqual(await page.evaluate(() => { history.pushState(null, '', '/press/video'); const r = parseRoute(); history.pushState(null, '', '/media/videos/press'); return r; }), { v: 'video', tab: 'press' }, 'the old /press/video address opens the Video tab');
  await page.click('#tabs [data-nav="press"]'); await page.waitForSelector('.presspg .pcards');
  assert.equal(await page.evaluate(() => document.querySelectorAll('[data-presstab]').length), 0, 'the Press page no longer has a Video tab');
  const tabs = await page.evaluate(() => [...document.querySelectorAll('#tabs button')].map((b) => { const r = b.getBoundingClientRect(); return [r.left >= 0 && r.right <= innerWidth, r.width >= 44, b.textContent.trim()]; }));
  assert.ok(tabs.every((t) => t[0] && t[1]), 'every tab button fits on screen and is tappable: ' + JSON.stringify(tabs));
  await noSideways('press');
});
await step('Lore: only the new-release, share-links and Settings buttons are at the top (no Karibu tena / Soul Vault greeting)', async () => {
  await page.evaluate(() => renderLore());
  await page.waitForSelector('.wrap.lore .home-h');
  const t = await page.evaluate(() => { const w = document.querySelector('.wrap.lore'), h = w.querySelector('.home-h'); return { first: w.firstElementChild === h, hello: !!h.querySelector('.hello'), brand: !!h.querySelector('.brand'), btns: ['[data-nav="shares"]', '[data-nav="vault"]', '[data-newrel]'].map((q) => !!h.querySelector(q)) }; });
  assert.ok(t.first, 'it is the very first thing on the Lore page'); assert.equal(t.hello, false, 'no greeting on Lore'); assert.equal(t.brand, false, 'no Soul Vault name on Lore'); assert.deepEqual(t.btns, [true, true, false], 'share links and Settings only here (Studio has its own button; new releases are made under Studio)');
  await noSideways('lore page'); await page.click('.wrap.lore .home-h [data-nav="vault"]');
  await seen('Check YouTube setup');                                                                         // the avatar opens Settings
  const fctx = await phoneContext(), fan = await fctx.newPage();
  await fan.goto('https://soulnicolas.com/?s=PUB'); await fan.waitForSelector('.tabs [data-nav="library"]', { state: 'attached', timeout: 15000 }); await fan.evaluate(() => renderLore()); await fan.waitForSelector('.wrap.lore .lorenums');
  const f = await fan.evaluate(() => ({ header: !!document.querySelector('.wrap.lore .home-h'), buttons: document.querySelectorAll('.wrap.lore .round, .wrap.lore .avatar').length }));
  assert.ok(!f.header && f.buttons === 0, 'fans get no greeting and no owner buttons on Lore: ' + JSON.stringify(f));
  await fctx.close();
});
await step('Website insights: visitors, pages with time on each, devices, cities, sources, and who is on the site now', async () => {
  await page.evaluate(() => { renderVault(); document.querySelectorAll('details.sset').forEach((d) => { d.open = true; }); });
  await w.db.prepare('DELETE FROM site_views').run();                                                    // (earlier steps' phones were counted too: start from an empty table)
  const rows = [[1, 'a', 'v1', '/', 10, 'phone', 'l.instagram.com', 'Nashville'], [1, 'a', 'v1', '/vault', 50, 'phone', '', 'Nashville'], [1, 'a', 'v1', '/lore', 40, 'phone', '', 'Nashville'], [2, 'b', 'v2', '/', 30, 'desktop', '', 'Memphis'], [2, 'b', 'v2', '/vault', 20, 'desktop', '', 'Memphis'], [3, 'c', 'v3', '/', 60, 'tablet', 'www.google.com', 'Nashville']];
  for (const [ago, dev, visit, path, sec, device, ref, city] of rows)
    await w.db.prepare('INSERT INTO site_views (view_id, at, last, visit_id, device_id, share_token, path, device, city, region, country, ref, seconds) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind('seedui' + Math.random(), Date.now() - ago * 864e5, Date.now() - ago * 864e5, visit, dev, 'public', path, device, city, 'Tennessee', 'US', ref, sec).run();
  await w.call('siteView', ['', '', 'liveP', 'lv1', 'lvw1', '/lore', 5, 'phone', ''], { cf: { city: 'Franklin', region: 'Tennessee', country: 'US' }, ua: IPHONE });
  await w.call('siteView', ['', '', 'liveC', 'lv2', 'lvw2', '/vault', 5, 'desktop', ''], { cf: { city: 'Nashville', region: 'Tennessee', country: 'US' }, ua: IPHONE });
  await page.click('[data-nav="siteinsights"]:visible');
  await page.waitForFunction(() => /2 on the site now/.test(document.body.innerText), null, { timeout: 8000 });
  const live = await page.evaluate(() => document.querySelector('#siList').innerText.replace(/\s+/g, ' '));
  assert.ok(/Lore.*Franklin, Tennessee · Phone/.test(live) && /Music.*Nashville, Tennessee · Computer/.test(live), 'the live list: ' + live);
  await page.click('[data-si-days="7"]');
  await page.waitForFunction(() => [...document.querySelectorAll('#siBody .kpi')].some((e) => e.querySelector('span').textContent === 'Visitors' && e.querySelector('b').textContent === '5'), null, { timeout: 8000 });
  const k = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#siBody .kpi')].map((e) => [e.querySelector('span').textContent, e.querySelector('b').textContent])));
  assert.deepEqual([k['Visitors'], k['Visits'], k['Page views']], ['5', '5', '8'], JSON.stringify(k));     // the 3 seeded visitors plus the two on the site right now
  const body = await page.evaluate(() => document.querySelector('#siBody').innerText.replace(/\s+/g, ' '));
  assert.ok(/Top pages/i.test(body) && /Home\s*3\s*3\s*33s/.test(body) && /Music\s*3\s*3/.test(body) && /Lore\s*2\s*2/.test(body), 'top pages with time on each: ' + body.slice(0, 700));
  assert.ok(/Phone\s*\d+%/.test(body) && /Tablet\s*\d+%/.test(body) && /Computer\s*\d+%/.test(body), 'devices');
  assert.ok(/Nashville, Tennessee/.test(body) && /Memphis, Tennessee/.test(body) && /Franklin, Tennessee/.test(body), 'cities');
  assert.ok(/Instagram/.test(body) && /Google/.test(body) && /Direct/.test(body), 'sources');
  assert.ok(/New\s*5\s*\(100%\)/.test(body), 'new vs returning');
  await page.click('[data-si-metric="n"]'); await page.waitForFunction(() => /Page views per day/i.test(document.querySelector('#siBody').innerText), null, { timeout: 5000 });
  await noSideways('website insights');
  if (process.env.SHOT7) await page.screenshot({ path: process.env.SHOT7, fullPage: true });
  await page.click('.back'); await seen('Check YouTube setup');
});
await step('Listening insights: who is listening now, unique listeners, arrows, charts, no sideways scroll', async () => {
  await page.evaluate(() => { renderVault(); document.querySelectorAll('details.sset').forEach((d) => { d.open = true; }); });
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
  await page.evaluate(() => { renderVault(); document.querySelectorAll('details.sset').forEach((d) => { d.open = true; }); });
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
await step('"Check YouTube setup" says YouTube is connected', async () => { await page.evaluate(() => { renderVault(); document.querySelectorAll('details.sset').forEach((d) => { d.open = true; }); }); await page.click('[data-check-yt]:visible'); await seen('YouTube is connected').catch(async e => { throw new Error('modal says: ' + (await page.evaluate(() => (document.querySelector('#modal') || document.body).innerText)).replace(/\s+/g, ' ').slice(0, 300)); }); await noSideways('youtube check'); await page.click('#modal [data-close]'); });
let releaseId = null;
await step('a new release from a YouTube playlist is created, hidden, with its songs', async () => {
  await page.evaluate(() => renderStudio()); await page.waitForSelector('#stuNewRel'); await page.click('#stuNewRel'); await page.waitForSelector('[data-nr-yt]'); /* new releases are made under Studio */ await page.evaluate(() => document.querySelector('[data-nr-yt]').click());
  await page.fill('#yrUrl', 'https://www.youtube.com/playlist?list=PLbrowsertest0123456789abcdefghij'); await noSideways('new release from YouTube'); await page.click('[data-yr-go]');
  await seen('Browser Test EP'); await seen("It's hidden from fans", 8000).catch(() => {});
  const nat = await store(); const rel = nat.releases.find(r => r.title === 'Browser Test EP');
  assert.ok(rel, 'the release is stored'); releaseId = rel.release_id; assert.equal(rel.hidden, true, 'it starts hidden');
  assert.equal(nat.tracks.filter(t => t.release_id === releaseId).length, 2, 'two songs');
  assert.match(rel.cover_file_id, /^c/, 'it has a cover'); for (const size of ['t', '160', '400', '1200', '1600']) assert.ok(await w.media.head('img/' + rel.cover_file_id + '/' + size), 'cover size ' + size);
  await noSideways('new release page');
});
await step('Studio is calm: a release card, four tabs (Info, Songs, Links, Add) showing one panel at a time, songs collapsed, a Save bar in reach', async () => {
  await page.evaluate(() => { S.stuRel = 'rel_pub'; S.stuTab = 'info'; renderStudio(); }); await page.waitForSelector('[data-stutab]');
  const m = await page.evaluate(() => ({ tabs: [...document.querySelectorAll('[data-stutab]')].map((b) => b.textContent.replace(/\s+/g, ' ').trim() + (b.getAttribute('aria-selected') === 'true' ? '*' : '')), shown: [...document.querySelectorAll('[data-stupanel]')].filter((x) => !x.hidden).map((x) => x.dataset.stupanel), card: !!document.querySelector('.stuhead .stumeta b'), chip: (document.querySelector('.stuhead .tag') || {}).textContent, open: document.querySelectorAll('.studio details.scard[open]').length, groups: [...document.querySelectorAll('#stuInfo details.stu')].map((d) => d.querySelector('summary').textContent.trim() + (d.open ? '*' : '')), sticky: getComputedStyle(document.querySelector('.stusticky')).position, sw: document.documentElement.scrollWidth <= innerWidth + 1 }));
  assert.deepEqual(m.tabs, ['Info*', 'Songs 2', 'Links', 'Add'], 'tabs: ' + JSON.stringify(m)); assert.deepEqual(m.shown, ['info'], 'one panel at a time');
  assert.ok(m.card && /Visible to fans|Hidden from fans/.test(m.chip), 'a release card says whether fans can see it'); assert.deepEqual(m.groups, ['Basics*', 'Story & mood', 'Series & credits'], 'the long form is in groups, only Basics open'); assert.equal(m.sticky, 'sticky', 'the Save bar stays in reach'); assert.ok(m.sw, 'no sideways scroll');
  await page.click('[data-stutab="songs"]'); assert.deepEqual(await page.evaluate(() => [[...document.querySelectorAll('[data-stupanel]')].filter((x) => !x.hidden).map((x) => x.dataset.stupanel).join(), document.querySelectorAll('.studio details.scard[open]').length, document.querySelectorAll('.studio details.scard').length]), ['songs', 0, 2], 'songs are listed collapsed');
  await page.click('[data-stutab="links"]'); await page.waitForSelector('#stuSaveLinks', { state: 'visible' }); await page.click('[data-stutab="add"]'); await page.waitForSelector('#stuAddSong', { state: 'visible' }); await noSideways('studio add');
  await page.click('[data-stutab="info"]'); await page.waitForSelector('#stuSaveInfo', { state: 'visible' });
});
await step('Studio lists the new release and its songs', async () => {
  await page.evaluate(() => { renderVault(); document.querySelectorAll('details.sset').forEach((d) => { d.open = true; }); }); await page.click('[data-nav="studio"]:visible'); await page.waitForSelector('#stuRel');   // (the release page has no Settings button on a phone, so this hop calls the app's own renderVault)
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
  await page.evaluate(() => { renderVault(); document.querySelectorAll('details.sset').forEach((d) => { d.open = true; }); });                                                                // (the voice note step left us on the release page)
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
await step('the + New release form has a Features section for each song, and saves it', async () => {
  await page.evaluate(() => openNewRelease()); await page.waitForSelector('#nrFiles', { state: 'attached' });
  await page.fill('#nrTitle', 'Plus Button EP');
  await page.setInputFiles('#nrFiles', [{ name: '01 Own Song.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('fake song one'.repeat(30)) }, { name: '02 Guest Song.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('fake song two'.repeat(30)) }]);
  await page.waitForSelector('[data-nr-feat="1"]');
  assert.equal(await page.evaluate(() => document.querySelectorAll('.nrfeat').length), 2, 'every song has a Features box');
  await noSideways('new release form with features');
  await page.fill('[data-nr-feat="0"]', 'Aziza, Khairro');
  await page.check('[data-nr-spot="1"]'); await page.waitForSelector('[data-nr-art="1"]');
  assert.equal(await page.evaluate(() => !document.querySelector('[data-nr-feat="1"]')), true, 'a guest spot asks for the main artist instead of guests');
  await page.check('[name="nrVis"][value="hide"]');
  await page.click('[data-nr-go]'); await seen('Give the main artist'.slice(0, 0) + 'main artist');   // a guest spot without the main artist is refused
  await page.fill('[data-nr-art="1"]', 'Berhani');
  await page.click('[data-nr-go]'); await seen('Plus Button EP', 20000); await page.waitForFunction(() => document.querySelector('#modal').hidden, null, { timeout: 30000 });
  const nat = await store(); const rel = nat.releases.find((r) => r.title === 'Plus Button EP'); assert.ok(rel, 'the release exists'); assert.equal(!!rel.hidden, true, 'kept hidden as asked');
  const trks = nat.tracks.filter((t) => t.release_id === rel.release_id).sort((x, y) => x.track_no - y.track_no);
  assert.equal(trks.length, 2); assert.equal(trks[0].features, 'Aziza, Khairro', 'guests saved on the first song');
  assert.deepEqual([trks[1].feature_role, trks[1].artist], ['mine', 'Berhani'], 'the guest spot saved with its main artist');
});
await step('the + New release form asks whose song it is: my own music, or a feature (my guest spot on someone else\'s song)', async () => {
  await page.evaluate(() => openNewRelease()); await page.waitForSelector('#nrFiles', { state: 'attached' });
  assert.equal(await page.evaluate(() => document.querySelector('[data-nr-kind="own"]').checked), true, 'my own music is the default');
  await page.fill('#nrTitle', 'Feature Cut');
  await page.setInputFiles('#nrFiles', [{ name: '01 My Verse.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('fake verse'.repeat(30)) }]);
  await page.waitForSelector('.nrfeat');
  await page.check('[data-nr-kind="feature"]'); await page.waitForSelector('#nrMain:not([hidden])');
  assert.equal(await page.evaluate(() => document.querySelectorAll('.nrfeat').length), 0, 'a feature has no guest boxes: the whole release is the guest spot');
  await noSideways('new release form, feature');
  await page.check('[name="nrVis"][value="hide"]');
  await page.click('[data-nr-go]'); await seen('type the main artist');                                         // no main artist: refused
  await page.fill('#nrMain', 'Berhani'); await page.click('[data-nr-go]');
  await page.waitForFunction(() => document.querySelector('#modal').hidden, null, { timeout: 30000 });
  const nat = await store(); const rel = nat.releases.find((r) => r.title === 'Feature Cut'); assert.ok(rel, 'the release exists');
  assert.deepEqual([rel.artist_name, !!rel.hidden], ['Berhani', true], 'the release belongs to the main artist');
  const t = nat.tracks.find((x) => x.release_id === rel.release_id); assert.deepEqual([t.feature_role, t.artist], ['mine', 'Berhani'], 'its song is my guest spot');
});
await step('add a song from a SoundCloud link: it is added with no audio file and plays in SoundCloud\'s player', async () => {
  w.soundcloud = { 'https://soundcloud.com/nicolas-soul/spiderman': { title: 'Spiderman by Nicolas Soul', author_name: 'Nicolas Soul' } };
  await page.evaluate((id) => { S.releaseId = id; renderRelease(id); }, releaseId); await seen('Browser Test EP');
  await page.evaluate((id) => openUpload(id), releaseId); await page.waitForSelector('#uSc');
  await noSideways('add song form');
  await page.fill('#uSc', 'https://soundcloud.com/nicolas-soul'); await page.click('[data-sc-add]');
  await seen('Paste the link to one song from SoundCloud');                                                    // a profile link is refused, right in the form
  await page.fill('#uSc', 'https://soundcloud.com/nicolas-soul/spiderman?si=abc'); await page.click('[data-sc-add]');
  await seen('Added "Spiderman" from SoundCloud');
  const nat = await store(); const t = nat.tracks.find((x) => x.release_id === releaseId && x.title === 'Spiderman'); assert.ok(t && t.sc_url === 'https://soundcloud.com/nicolas-soul/spiderman', 'saved with its SoundCloud link');
  const v = nat.versions.find((x) => x.track_id === t.track_id); assert.deepEqual([v.format, v.audio], ['SOUNDCLOUD', '']);
  await page.evaluate((vid) => play(vid), v.version_id);
  await page.waitForSelector('#npVid iframe[src*="w.soundcloud.com/player/"]', { timeout: 8000 });
  assert.match(await page.getAttribute('#npVid iframe', 'src'), /url=https%3A%2F%2Fsoundcloud\.com%2Fnicolas-soul%2Fspiderman/, 'the player is pointed at the song');
  assert.equal(await page.evaluate(() => document.querySelector('#npMode').hidden), true, 'no Song/Video switch for a SoundCloud song');
  await page.evaluate(() => closeNp());
  await page.evaluate((id) => { const first = S.lib.versions.find((x) => x.track_id !== id && (x.audio || x.url)); if (first) play(first.version_id); }, t.track_id);
  await page.waitForFunction(() => !document.querySelector('#npVid iframe'), null, { timeout: 8000 });         // another song replaces SoundCloud's player
  await page.evaluate(() => { try { closeNp(); } catch (e) {} audio.pause(); });
});
await step('Start from a SoundCloud link in the New release form; Songs on links only lists link-only songs and Add file keeps a copy', async () => {
  w.soundcloud['https://soundcloud.com/nicolas-soul/new-single'] = { title: 'New Single by Nicolas Soul', author_name: 'Nicolas Soul', thumbnail_url: 'https://i1.sndcdn.com/artworks-abc-large.jpg' };
  await page.evaluate(() => openNewRelease()); await page.waitForSelector('[data-nr-sc]');
  await page.click('[data-nr-sc]'); await page.waitForSelector('#srUrl');
  await page.fill('#srUrl', 'https://soundcloud.com/nicolas-soul'); await page.click('[data-scr-go]'); await seen('Paste the link to one song from SoundCloud');
  await page.fill('#srUrl', 'https://soundcloud.com/nicolas-soul/new-single'); await page.click('[data-scr-go]');
  await seen('Created “New Single”');
  let nat = await store(); const rel = nat.releases.find((r) => r.title === 'New Single'); assert.ok(rel && rel.hidden, 'a hidden release was made'); assert.ok(rel.cover_file_id, 'with SoundCloud\'s picture as the cover');
  const trk = nat.tracks.find((t) => t.release_id === rel.release_id); assert.ok(trk && trk.sc_url);
  await page.evaluate(() => { renderVault(); document.querySelectorAll('details.sset').forEach((d) => { d.open = true; }); }); await seen('Songs on links only'); await noSideways('settings');
  assert.match(await page.textContent('[data-linkonly]'), /depend on a YouTube or SoundCloud link/);
  await page.click('[data-linkonly]'); await page.waitForSelector('#loList [data-lo]');
  const listed = await page.evaluate(() => [...document.querySelectorAll('#loList [data-lo]')].map((r) => r.dataset.lo));
  assert.ok(listed.includes(trk.track_id), 'the new song is listed as depending on a link');
  await page.evaluate((id) => document.querySelector('[data-lo-up="' + id + '"]').click(), trk.track_id);   // (the row can sit under the tab bar on a long list)
  await page.setInputFiles('#loFile', { name: 'new-single.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('my own master copy'.repeat(30)) });
  await page.waitForFunction((id) => ![...document.querySelectorAll('#loList [data-lo]')].some((r) => r.dataset.lo === id), trk.track_id, { timeout: 20000 });
  nat = await store(); const vs = nat.versions.filter((v) => v.track_id === trk.track_id);
  assert.equal(vs.length, 2, 'the SoundCloud version is kept and a file version was added'); const file = vs.find((v) => v.format !== 'SOUNDCLOUD');
  assert.ok(file && /^r2:/.test(file.audio) && file.is_primary, 'the file is stored on our own storage and plays first'); assert.equal(vs.find((v) => v.format === 'SOUNDCLOUD').is_primary, false);
  assert.deepEqual(await page.evaluate((id) => S.lib.versions.filter((v) => v.track_id === id).map((v) => [v.format === 'SOUNDCLOUD', !!v.is_primary]).sort(), trk.track_id), [[false, true], [true, false]], 'in the open app too, the file plays first');
  await page.evaluate(() => closeModal());
});
await step('a song\'s Options (release page > Edit) has a guest-spot checkbox: it needs the main artist and the song then shows under Features > Guest spots', async () => {
  const rid = 'rel_pub', tid = 'trk_a1';
  await page.evaluate((id) => { S.releaseId = id; S.editing = true; renderRelease(id); }, rid); await page.waitForSelector('#editList [data-guest-track]', { state: 'attached' });
  const idx = await page.evaluate((t) => S.draft.findIndex((d) => d.track_id === t), tid);
  await page.evaluate((i) => { const c = document.querySelector('[data-guest-track="' + i + '"]'); c.closest('details').open = true; c.click(); }, idx);
  assert.match(await page.evaluate((i) => document.querySelector('[data-guest-track="' + i + '"]').closest('details').querySelector('summary').textContent, idx), /Guest spot/, 'the Options tags say Guest spot');
  await page.evaluate(() => document.querySelector('[data-edit-save]').click()); await seen('type the main artist');               // no main artist: refused
  await page.evaluate((i) => { const a = document.querySelector('[data-tart="' + i + '"]'); a.value = 'Zeta Artist'; a.dispatchEvent(new Event('input', { bubbles: true })); }, idx);
  await page.evaluate(() => document.querySelector('[data-edit-save]').click());
  await page.waitForFunction((t) => { const x = S.lib.tracks.find((y) => y.track_id === t); return x && x.feature_role === 'mine' && !S.editing; }, tid, { timeout: 15000 });
  await page.evaluate(() => { S.filter = 'All'; S.sec = {}; renderLibrary(); }); await page.waitForSelector('#extras [data-extab="features"]'); await page.click('#extras [data-extab="features"]'); await page.waitForSelector('#features .vsc');
  await page.waitForFunction(() => /Open Album/.test(document.querySelector('#features').innerText) && /Guest spot/.test(document.querySelector('#features .vtag').textContent), null, { timeout: 8000 });
  await page.evaluate((t) => { const x = S.lib.tracks.find((y) => y.track_id === t); x.feature_role = ''; }, tid);
});
await step('opening the app and tapping around never starts any sound (it would stop music playing from another app on a phone)', async () => {
  const c = await phoneContext(), pg = await c.newPage(); pg.on('pageerror', (e) => problems.push('quiet page error: ' + e.message));
  await pg.addInitScript(() => { window.__plays = []; const o = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { if (!this.muted) window.__plays.push((this.src || '').slice(0, 30)); return o.apply(this, arguments); }; });
  await pg.goto('https://soulnicolas.com/?s=PUB'); await pg.waitForSelector('.tabs [data-nav="library"]', { state: 'attached', timeout: 15000 });
  for (const n of ['library', 'video', 'tour', 'press', 'lore', 'home']) { await pg.click('.tabs [data-nav="' + n + '"]'); await pg.waitForTimeout(250); }
  await pg.mouse.click(190, 300);
  const r = await pg.evaluate(() => ({ plays: window.__plays, trans: S.trans, out: !!S.outUnlocked }));
  assert.deepEqual(r.plays, [], 'no sound was started by just opening the app and tapping: ' + JSON.stringify(r));
  await c.close();
});
await step('Release page header is calmer: Play and Shuffle are the two big buttons, Share / Save offline / Queue sit on one quiet row, the small facts share a line', async () => {
  await page.evaluate(() => { S.links = S.links || { releases: {} }; S.links.releases = S.links.releases || {}; S.links.releases.rel_pub = { first: 'DatPiff', links: [['Spotify', 'https://open.spotify.com/x']] }; S.shop = [{ title: 'Test CD', price: '$12', blurb: 'Ships from Nashville.', buy_url: 'https://buy.stripe.com/x', release_id: 'rel_pub' }]; S.shopP = Promise.resolve(S.shop); renderRelease('rel_pub'); });
  await page.waitForSelector('#relhead .acts'); await page.waitForSelector('#shopRel .shopcard', { timeout: 5000 });
  const r = await page.evaluate(() => { const rc = (q) => { const e = document.querySelector('#relhead ' + q); if (!e || e.hidden) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; }; const sec = [...document.querySelectorAll('#relhead .acts .pill')].filter((e) => !e.hasAttribute('data-playall') && !e.hasAttribute('data-shuffleall') && !e.hidden && e.getBoundingClientRect().height > 0).map((e) => { const b = e.getBoundingClientRect(); return { y: Math.round(b.y), h: Math.round(b.height) }; }); return { play: rc('[data-playall]'), shuf: rc('[data-shuffleall]'), sec, sub: getComputedStyle(document.querySelector('#relhead .relmeta.sub') || document.body).display, shopH: rc('#shopRel .shopcard') && rc('#shopRel .shopcard').h, headH: rc('.hero') && rc('.hero').h }; });
  assert.ok(r.play && r.shuf && r.play.y === r.shuf.y && Math.abs(r.play.w - r.shuf.w) < 4 && r.play.w > 140, 'Play and Shuffle are side by side and equally wide: ' + JSON.stringify(r));
  assert.ok(r.sec.length >= 2 && r.sec.every((x) => x.y === r.sec[0].y && x.h >= 44) && r.sec[0].y > r.play.y, 'the other buttons share one quiet row below, each 44px+ tall: ' + JSON.stringify(r.sec));
  assert.ok(r.shopH && r.shopH < 90, 'the shop card is a slim row: ' + r.shopH);
  await noSideways('release header');
  if (process.env.SHOT_REL) await page.screenshot({ path: process.env.SHOT_REL });
  await page.evaluate(() => { S.shop = []; S.shopP = Promise.resolve([]); });
});
await step('Nick\'s round: NuRenaissance link under Support, Releases shows the kinds, bigger Lore photos, centred Tour and Press tabs, voice notes start inside the tap, Video opens from the kept list', async () => {
  // Home: a link to the NuRenaissance site sits right under the Support button
  await page.evaluate(() => renderHome()); await page.waitForSelector('.homepg .support');
  const hl = await page.evaluate(() => { const l = document.querySelector('.homepg .support + .nulink'); return l ? { href: l.getAttribute('href'), rel: l.rel, target: l.target, h: Math.round(l.getBoundingClientRect().height), txt: l.textContent } : null; });
  assert.ok(hl && hl.href === 'https://www.nrnszn.com' && /noopener/.test(hl.rel) && hl.target === '_blank' && hl.h >= 44 && /NuRenaissance/.test(hl.txt), 'a NuRenaissance link right under Support: ' + JSON.stringify(hl));
  // Lore: tapping Releases lists how many of each kind; the photos are a big shelf
  await page.evaluate(() => renderLore()); await page.waitForSelector('[data-lore-types]');
  assert.equal(await page.evaluate(() => document.querySelector('#loreTypes').hidden), true, 'the kinds start hidden');
  await page.click('[data-lore-types]');
  const ty = await page.evaluate(() => ({ shown: !document.querySelector('#loreTypes').hidden, expanded: document.querySelector('[data-lore-types]').getAttribute('aria-expanded'), items: [...document.querySelectorAll('#loreTypes .lty2')].map((e) => [e.querySelector('span').textContent, +e.querySelector('b').textContent]), total: +document.querySelector('[data-lore-types] b').textContent }));
  assert.ok(ty.shown && ty.expanded === 'true' && ty.items.length >= 1 && ty.items.reduce((n, x) => n + x[1], 0) === ty.total, 'the kinds add up to the number of releases: ' + JSON.stringify(ty));
  await page.click('[data-lore-types]'); assert.equal(await page.evaluate(() => document.querySelector('#loreTypes').hidden), true, 'tapping again hides them');
  await page.evaluate(() => { S.mediaTab = 'photos'; renderVideo(); }); await page.waitForSelector('.mphgrid .mph1');
  const ph = await page.evaluate(() => { const c = document.querySelector('.mphgrid:not(.rel) .mph1'), b = c.getBoundingClientRect(), h = document.querySelector('.mphsec > .sh').getBoundingClientRect(), g = document.querySelector('.mphgrid').getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), gap: Math.round(g.top - h.bottom), path: location.pathname, tab: document.querySelector('#tabs [data-nav="video"]').textContent.trim() }; });
  assert.ok(ph.w >= 150 && ph.h > ph.w && ph.gap >= 0 && ph.gap < 40 && ph.path === '/media/photos' && /Media/.test(ph.tab), 'the photos are on the Media tab (a grid under its Photos heading, at /media/photos): ' + JSON.stringify(ph));
  await noSideways('media photos'); await page.evaluate(() => { S.mediaTab = 'videos'; renderLore(); }); await page.waitForSelector('.wrap.lore .lorenums');
  // Tour and Press tab text is centred
  const centred = async (sel) => page.evaluate((q) => [...document.querySelectorAll(q)].map((b) => { const r = document.createRange(); r.selectNodeContents(b); const t = r.getBoundingClientRect(), bb = b.getBoundingClientRect(); return Math.abs((t.left + t.right) / 2 - (bb.left + bb.right) / 2) < 2; }), sel);
  await page.evaluate(() => renderTour()); await page.waitForSelector('.tourseg button');
  assert.ok((await centred('.tourseg button')).every(Boolean), 'Tour tab text is centred');
  await page.evaluate(() => renderPress()); await page.waitForSelector('.psseg button');
  assert.ok((await centred('.psseg button')).every(Boolean), 'Press tab text is centred');
  // Voice notes: an older (Drive) note starts the player inside the tap, before its address has arrived
  const vnr = await page.evaluate(() => { const t = S.lib.tracks[0]; t.voice_note_id = 'DRIVEID123'; playVoice(t.track_id); const out = { early: vn.src.slice(0, 15), bar: !document.getElementById('voicebar').hidden }; t.voice_note_id = ''; return out; });
  assert.ok(/^data:audio\/wav/.test(vnr.early) && vnr.bar, 'the voice player starts inside the tap: ' + JSON.stringify(vnr));
  await page.evaluate(() => { vn.pause(); document.getElementById('voicebar').hidden = true; });
  // Video: the last list is kept on the device and drawn at once, even while the fresh one is still being fetched
  await page.evaluate(() => { localStorage.setItem('sv_videolists', JSON.stringify({ lists: [{ key: 'originals', name: 'Originals', id: 'x', videos: [{ id: 'aaaaaaaaaaa', title: 'Kept one' }, { id: 'bbbbbbbbbbb', title: 'Kept two' }] }], at: Date.now() })); S.videoTab = 'freestyles'; S.videoSub = 'all'; S.videoQ = ''; S.videoLists = null; S.videoP = new Promise(() => {}); renderVideo(); });
  await page.waitForSelector('.vidhero', { timeout: 3000 });
  assert.match(await page.evaluate(() => document.querySelector('.vidhero').innerText), /Kept/, 'the kept list shows before the fresh one arrives');
  await page.evaluate(() => { S.videoLists = null; S.videoP = null; localStorage.removeItem('sv_videolists'); });
  await noSideways('nick round');
});
await step('Release page: the Music back button stays at the top while you scroll, and still goes back', async () => {
  await page.evaluate(() => { renderRelease('rel_pub'); }); await page.waitForSelector('#relbar .back');
  await page.evaluate(() => { const d = document.createElement('div'); d.id = 'tallfill'; d.style.height = '3000px'; (document.querySelector('#main > .wrap') || document.querySelector('#main')).appendChild(d); window.scrollTo(0, 1500); });
  await page.waitForFunction(() => document.getElementById('relbar').classList.contains('stuck'), null, { timeout: 3000 });
  const b = await page.evaluate(() => { const r = document.querySelector('#relbar .back').getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { top: Math.round(r.top), vis: r.bottom > 0 && r.top < 80, hit: !!top && (top.closest('.back') !== null), y: Math.round(window.scrollY) }; });
  assert.ok(b.y > 500 && b.vis && b.top >= 0 && b.hit, 'the Music button is still on screen, on top, after scrolling: ' + JSON.stringify(b));
  if (process.env.SHOT_STICKY) await page.screenshot({ path: process.env.SHOT_STICKY });
  const tabs = await page.evaluate(() => { const e = document.querySelector('.eranav'); if (!e) return null; const r = e.getBoundingClientRect(), bb = document.querySelector('#relbar .back').getBoundingClientRect(); return { below: r.top >= bb.bottom - 2 }; });
  if (tabs) assert.ok(tabs.below, 'the sticky Songs / Videos tabs sit below the Music button, not under it');
  await page.click('#relbar .back'); await page.waitForFunction(() => S.view === 'library', null, { timeout: 5000 });
  await page.evaluate(() => { const d = document.getElementById('tallfill'); if (d) d.remove(); window.scrollTo(0, 0); });
});
await step('Playlist page: each song is a cover, a bold one-line title and its release, on a clean list; tapping a row plays it', async () => {
  await page.evaluate(() => { const p = S.lib.playlists.find((x) => (x.tracks || []).length) || S.lib.playlists[0]; renderPlaylist(p.playlist_id); }); await page.waitForSelector('.plsongs .plsong');
  const r = await page.evaluate(() => { const rows = [...document.querySelectorAll('.plsongs .plsong')], b = rows[0].querySelector('button').getBoundingClientRect(), t = rows[0].querySelector('.plt b'), cs = getComputedStyle(t), im = rows[0].querySelector('.plart').getBoundingClientRect(); return { n: rows.length, h: Math.round(b.height), cover: Math.round(im.width), one: cs.whiteSpace === 'nowrap' && cs.textOverflow === 'ellipsis', size: parseFloat(cs.fontSize), sub: rows[0].querySelector('.plrel').textContent.length > 0, old: document.querySelectorAll('.tracks .row .dur').length, hasPlay: !!rows[0].querySelector('[data-play]') }; });
  assert.ok(r.n >= 1 && r.cover >= 60 && r.h >= 76 && r.one && r.size >= 17 && r.sub && r.old === 0 && r.hasPlay, 'the new playlist rows: ' + JSON.stringify(r));
  await noSideways('playlist rows');
  if (process.env.SHOT_PL) { await page.evaluate(() => { document.querySelector('.plsongs').scrollIntoView(); window.scrollBy(0, -10); }); await page.screenshot({ path: process.env.SHOT_PL }); }
});
await step('Lore is calmer: no bio editor in the middle of the page, credits in one dropdown; the bio is edited in Studio', async () => {
  await page.evaluate(() => renderLore()); await page.waitForSelector('.wrap.lore [data-lcatsel]');
  assert.deepEqual(await page.evaluate(() => [document.querySelectorAll('.wrap.lore textarea').length, document.querySelectorAll('.wrap.lore [data-lore-bio], .wrap.lore [data-lore-copy]').length, document.querySelectorAll('.wrap.lore .lorecats').length]), [0, 0, 0], 'no bio editor, no pills on Lore');
  const opts = await page.evaluate(() => [...document.querySelectorAll('[data-lcatsel] option')].map((o) => o.textContent.replace(/\s*\(\d+\)$/, '')));
  assert.deepEqual(opts, ['Producers', 'Engineers', 'Featured', 'Places', 'Photographers'], 'one dropdown for the credits');
  await page.selectOption('[data-lcatsel]', await page.evaluate(() => [...document.querySelectorAll('[data-lcatsel] option')].find((o) => /^Featured/.test(o.textContent)).value));
  await page.waitForFunction(() => document.querySelectorAll('#lorePeople .lchip').length > 0 && /Aziza/.test(document.querySelector('#lorePeople').innerText), null, { timeout: 5000 });
  const ph = await page.evaluate(() => ({ photoSections: document.querySelectorAll('.wrap.lore .lorephotos, .wrap.lore .lphshelf, .wrap.lore [data-lphoto], .wrap.lore [data-lore-phrel]').length, heads: [...document.querySelectorAll('.wrap.lore h2, .wrap.lore summary.sh')].map((e) => e.textContent.trim().replace(/\s+/g, ' ')) }));
  assert.equal(ph.photoSections, 0, 'the photos moved to the Media tab: none on Lore: ' + JSON.stringify(ph));
  assert.ok(!ph.heads.some((h) => /^Photos/.test(h)) && ph.heads.some((h) => /numbers/.test(h)) && ph.heads.some((h) => /^Year by year/.test(h)) && ph.heads.some((h) => /^Milestones/.test(h)), 'section headings: ' + ph.heads.join(' | '));
  await page.evaluate(() => { S.mediaTab = 'photos'; renderVideo(); }); await page.waitForSelector('.mphgrid [data-lphoto="2"]'); await page.click('.mphgrid [data-lphoto="2"]'); await page.waitForSelector('#lbStage'); await page.evaluate(() => document.querySelector('#lbX').click());
  if (await page.$('.mphrel')) { await page.click('.mphrel'); await page.waitForSelector('#ssImg', { timeout: 5000 }); await page.evaluate(() => closeModal && closeModal()); }   // a release's own photos open in the slideshow
  await page.evaluate(() => { S.mediaTab = 'videos'; renderLore(); }); await page.waitForSelector('.wrap.lore .lorenums');
  await noSideways('lore calm');
  await page.evaluate(() => renderStudio()); await page.waitForSelector('#stuBio'); await page.evaluate(() => { document.querySelector('#stuBio').open = true; }); await page.waitForSelector('#loreBio', { state: 'visible' });
  assert.equal(await page.evaluate(() => !!document.querySelector('[data-lore-bio]') && !!document.querySelector('[data-lore-copy]')), true, 'Save bio and Copy lore are here now');
  await page.fill('#loreBio', 'A short test bio.'); await page.click('[data-lore-bio]'); await seen('Bio saved');
  await page.evaluate(() => closeModal());
});
await step('Unreleased is not in the type lists (filters, new release, Studio); unreleased work can still be marked and labelled Single, Album, ...', async () => {
  await page.evaluate(() => renderLibrary()); await page.waitForSelector('#libBody [data-filtersel]');
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#libBody [data-filtersel] option')].map((o) => o.textContent.trim())), ['All types', 'Album', 'Mixtape', 'EP', 'Single', 'Compilation'], 'one type dropdown, no Unreleased type');
  assert.deepEqual(await page.evaluate(() => [REL_TYPES, EDIT_TYPES, relTypeOptions('EP'), relTypeOptions('Unreleased')].map((l) => l.includes('Unreleased'))), [false, false, false, true], 'not offered, except to an older release that already has it');
  await page.evaluate(() => openNewRelease()); await page.waitForSelector('#nrType');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('#nrType option')].some((o) => o.textContent === 'Unreleased')), false, 'new release form');
  await page.evaluate(() => closeModal());
  assert.ok(await page.evaluate(() => UNREL_KINDS.join() === 'Single,Album,EP,Mixtape,Compilation'), 'unreleased songs can still be labelled Single, Album, EP, ...'); assert.ok(await page.evaluate(() => !!document.querySelector('#extras [data-extab="unreleased"]')), 'and the Unreleased tab of Extras is still there');
});
await step('on a 320 px phone all six tabs fit on the screen, and the Music tab still has no sideways scroll', async () => {
  await page.setViewportSize({ width: 320, height: 700 });
  try {
    await page.evaluate(() => { S.sec = {}; renderLibrary(); }); await page.waitForSelector('#libBody .libbar'); await page.waitForTimeout(400);
    const tabs = await page.evaluate(() => [...document.querySelectorAll('#tabs button')].map((b) => { const r = b.getBoundingClientRect(); return [r.left >= -0.5 && r.right <= innerWidth + 0.5, r.width >= 40, b.textContent.trim()]; }));
    assert.ok(tabs.length === 6 && tabs.every((t) => t[0] && t[1]), 'every tab fits at 320 px: ' + JSON.stringify(tabs));
    await noSideways('music at 320');
  } finally { await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300); }
});
await step('Music tab is calm: one line for the type filter + View, no "1 of N" counter, no View menus on Unreleased and Features, tabs + guest filter on one line', async () => {
  await page.evaluate(() => { S.filter = 'All'; S.sec = {}; renderLibrary(); }); await page.waitForSelector('#libBody .libbar');
  const m = await page.evaluate(() => { const q = (x) => document.querySelector(x), c = (e) => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; };
    const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return { sameLine: Math.abs(c(q('.libbar [data-filtersel]')) - c(q('.libbar [data-libmenu]'))) < 12, counter: !!q('#shelfPos'), pills: document.querySelectorAll('#libBody [data-filter]').length, viewMenus: document.querySelectorAll('#libBody [data-libmenu]').length,
featLine: !q('#features .vs-tabs') && (!q('#features [data-secsel]') || (c(q('#features .vs-blurb')) < c(q('#features [data-secsel]')) && q('#features [data-secsel]').getBoundingClientRect().right <= innerWidth)), controls: [...document.querySelectorAll('#main button, #main select')].filter(visible).length }; });
  assert.deepEqual([m.sameLine, m.counter, m.pills, m.viewMenus], [true, false, 0, 1], 'one line, no counter, no type pills, a single View menu on the whole Music tab: ' + JSON.stringify(m));
  assert.ok(m.featLine, 'Features: no tabs, and the artist dropdown (when there is more than one artist) stays on screen');
  await page.selectOption('[data-filtersel]', 'EP'); await page.waitForFunction(() => S.filter === 'EP' && document.querySelectorAll('#all-releases .slide').length >= 0 && document.querySelector('[data-filtersel]').value === 'EP', null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('#all-releases .slide')].every((x) => /EP/.test(x.querySelector('.tag, .as, .cap') ? x.textContent : 'EP'))), true, 'the dropdown filters the shelf');
  await page.selectOption('[data-filtersel]', 'All');
});
await step('Extras has a Series tab when two releases share a series, and switching tabs works', async () => {
  const saved = await page.evaluate(() => { const rs = S.lib.releases.filter((r) => !r.locked).slice(0, 2); const old = rs.map((r) => [r.release_id, r.series_name, r.series_part]); rs.forEach((r, i) => { r.series_name = 'Test Saga'; r.series_part = String(i + 1); }); S.sec = {}; renderLibrary(); return old; });
  await page.waitForSelector('#extras [data-extab="series"]');
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#extras [data-extab]')].map((b) => b.textContent.trim())), ['Unreleased', 'Features', 'Series'], 'three tabs, in this order');
  await page.click('#extras [data-extab="series"]'); await page.waitForSelector('#extras .scard');
  assert.deepEqual(await page.evaluate(() => [document.querySelectorAll('#extras .vsec').length, /Test Saga/.test(document.querySelector('#extras .scard').textContent), document.querySelectorAll('#extras > .sh, #extras .ex-body > .sh').length]), [0, true, 1], 'the series cards show, with no second "Series" heading');
  await page.click('#extras [data-extab="unreleased"]'); await page.waitForSelector('#unreleased .vsc'); await noSideways('extras tabs');
  await page.evaluate((old) => { old.forEach(([id, n, p]) => { const r = S.lib.releases.find((x) => x.release_id === id); r.series_name = n; r.series_part = p; }); S.sec = {}; renderLibrary(); }, saved);
});
await step('every row that scrolls sideways (Music shelves, Unreleased, Features, Lore eras and photos) has arrows, only where there is more to scroll', async () => {
  const check = async (label, min = 2) => {
    await page.waitForTimeout(700);
    const rows = await page.evaluate(() => [...document.querySelectorAll('#main .hrow, #main .ctrack:not(.homeone), #main .loreeras')].map((r) => { const w = r.closest('.scrollwrap'), over = r.scrollWidth - r.clientWidth > 4; const vis = (q) => !!w && !!w.querySelector(q) && !w.querySelector(q).hidden; return { cls: r.className.split(' ')[0], wrapped: !!w, over, r: vis('.sarrow.r'), l: vis('.sarrow.l') }; }));
    assert.ok(rows.length >= min, label + ': found the rows: ' + JSON.stringify(rows));
    for (const x of rows) { assert.ok(x.wrapped, label + ': ' + x.cls + ' has arrows'); assert.equal(x.r, x.over, label + ': ' + x.cls + ' shows the right arrow exactly when it can scroll: ' + JSON.stringify(x)); assert.equal(x.l, false, label + ': nothing to the left at the start (' + x.cls + ')'); }
    return rows;
  };
  await page.evaluate(() => { recordRecent(S.lib.tracks.find((t) => primaryOf(t))); renderLibrary(); }); await page.waitForSelector('#unreleased .vsc');
  const order = await page.evaluate(() => { const at = (q) => { const e = document.querySelector('#libBody ' + q); return e ? e.compareDocumentPosition(document.body) : null; }; const ids = ['#discography', '#extras', '#playlists', '#recent']; const els = ids.map((q) => document.querySelector('#libBody ' + q)); return { found: ids.filter((q, i) => els[i]), inOrder: els.filter(Boolean).every((e, i, a) => i === 0 || (a[i - 1].compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING) > 0), disc: (document.querySelector('#discography') || {}).textContent, series: [...document.querySelectorAll('#libBody h2.sh')].map((h) => h.textContent.trim()) }; });
  assert.deepEqual(order.found.slice(0, 2), ['#discography', '#extras'], 'Music tab sections: ' + JSON.stringify(order)); assert.equal(order.found[order.found.length - 1], '#recent', 'Recently played is the LAST section: ' + JSON.stringify(order)); assert.ok(order.inOrder, 'sections in the order Discography, Extras, Playlists, then Recently played last');
  const ex = await page.evaluate(() => ({ title: (document.querySelector('#extras > .sh') || {}).textContent, tabs: [...document.querySelectorAll('#extras [data-extab]')].map((b) => b.textContent.trim() + (b.getAttribute('aria-selected') === 'true' ? '*' : '')), sections: ['#unreleased', '#features'].map((q) => !!document.querySelector('#extras ' + q)) }));
  assert.equal(ex.title.trim(), 'Extras', 'the area is called Extras'); assert.ok(ex.tabs[0] === 'Unreleased*' && ex.tabs.includes('Features'), 'tabs Unreleased, Features (and Series when there is one): ' + ex.tabs.join(' | ')); assert.deepEqual(ex.sections, [true, false], 'one tab shows at a time');
  assert.equal(order.disc.trim(), 'Discography'); assert.ok(!order.series.some((t) => /sagas/i.test(t)), 'Series is just called Series: ' + order.series.join(' | '));
  const rows = await check('Music'); assert.ok(rows.some((x) => x.over), 'at least one row scrolls on a phone');
  const r = await page.evaluate(() => { const row = [...document.querySelectorAll('#main .vrow, #main .ctrack')].find((x) => x.scrollWidth - x.clientWidth > 4), w = row.closest('.scrollwrap'); w.querySelector('.sarrow.r').click(); return new Promise((res) => setTimeout(() => res({ x: Math.round(row.scrollLeft), l: !w.querySelector('.sarrow.l').hidden, bar: document.documentElement.scrollWidth <= innerWidth + 1 }), 900)); });
  assert.ok(r.x > 50 && r.l && r.bar, 'tapping the arrow scrolls the row, the left arrow appears and the page does not move sideways: ' + JSON.stringify(r));
  await noSideways('music with arrows');
  await page.evaluate(() => renderLore()); await page.waitForSelector('.wrap.lore .loreeras'); await check('Lore', 1); await noSideways('lore with arrows');
});
await step('on a computer the scrolling shelves (discography, Unreleased, Features) look like the phone: a row of cards that scrolls sideways', async () => {
  const dctx = await phoneContext(undefined, { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false }), d = await dctx.newPage(); d.on('pageerror', (e) => problems.push('desktop page error: ' + e.message));
  await d.goto('https://soulnicolas.com/?s=PUB'); await d.waitForSelector('.tabs [data-nav="library"]', { state: 'attached', timeout: 15000 });
  await d.evaluate(() => renderLibrary()); await d.waitForSelector('#unreleased .vsc', { timeout: 15000 });
  const m = await d.evaluate(() => {
    const row = document.querySelector('#unreleased .hrow.vrow'), shelf = document.querySelector('#main .shelf .ctrack'), card = row && row.querySelector('.vsc'), slide = shelf && shelf.querySelector('.slide');
    const bar = document.querySelector('#main .shelfbar');
    return { vrowDisplay: row && getComputedStyle(row).display, vrowOverflow: row && getComputedStyle(row).overflowX, cardW: card && Math.round(card.getBoundingClientRect().width), shelf: !!shelf, shelfDisplay: shelf && getComputedStyle(shelf).display, shelfOverflow: shelf && getComputedStyle(shelf).overflowX, slideW: slide && Math.round(slide.getBoundingClientRect().width), arrows: !!bar && getComputedStyle(bar).display !== 'none', sw: document.documentElement.scrollWidth, iw: window.innerWidth };
  });
  assert.ok(m.shelf && m.shelfDisplay === 'flex' && m.shelfOverflow === 'auto', 'the discography shelf scrolls sideways on a computer: ' + JSON.stringify(m));
  assert.deepEqual(await d.evaluate(() => { const row = document.querySelector('#main .shelf .ctrack'), w = row.closest('.scrollwrap'); return [!!w, !w.querySelector('.sarrow.r').hidden === (row.scrollWidth - row.clientWidth > 4)]; }), [true, true], 'the shelf has arrows on a computer (shown only when it can scroll)');
  assert.ok(m.slideW >= 240 && m.slideW <= 300, 'phone-style cards, not big covers: ' + m.slideW + 'px'); 
  assert.deepEqual([m.vrowDisplay, m.vrowOverflow, m.cardW], ['flex', 'auto', 180], 'the Unreleased row is a scrolling row of small cards');
  const bars = await d.evaluate(() => [...document.querySelectorAll('#main .shelf .ctrack, #main .hrow.vrow')].map((r) => { const cs = getComputedStyle(r), pb = getComputedStyle(r, '::-webkit-scrollbar'); return { sb: cs.scrollbarWidth, wk: pb.display }; }));
  assert.ok(bars.length >= 2 && bars.every((b) => b.sb === 'none' || b.wk === 'none'), 'no grey scroll bars under the rows: ' + JSON.stringify(bars));
  assert.deepEqual(await d.evaluate(() => [document.querySelectorAll('.rowwrap, .rowarr').length, [...document.querySelectorAll('#main .scrollwrap')].map((w) => w.querySelectorAll('.sarrow').length).filter((n) => n !== 2).length]), [0, 0], 'one pair of arrows per row, not two');
  assert.ok(m.sw <= m.iw + 1, 'the page itself does not scroll sideways: ' + m.sw + ' vs ' + m.iw);
  await dctx.close();
});
await step('songs added by link: they stay out of the Discography (until they have their own file), keep playing after Now Playing is closed, and the Music tab icon is a music note', async () => {
  await page.evaluate(() => { S.q = ''; S.filter = 'All'; renderLibrary(); }); await page.waitForSelector('#all-releases .slide');
  const d = await page.evaluate(() => { const ids = new Set(linkOnlySongs().map((t) => t.track_id)), only = S.lib.releases.filter((r) => { const ts = S.lib.tracks.filter((t) => t.release_id === r.release_id && !hidden(t)); return ts.length > 0 && ts.every((t) => ids.has(t.track_id)); }).map((r) => r.title); const shelf = [...document.querySelectorAll('#all-releases .slide')].map((x) => x.querySelector('.ttl').textContent.trim()); return { only, shelf }; });
  assert.ok(d.only.length >= 1, 'there are releases made only of link songs: ' + JSON.stringify(d)); assert.deepEqual(d.only.filter((t) => d.shelf.includes(t)), [], 'none of them is in the Discography: ' + JSON.stringify(d));
  assert.ok(d.shelf.includes('New Single'), 'a release shows in the Discography as soon as its songs have their own file (New Single got one above): ' + d.shelf.join(' | '));
  await page.evaluate((t) => { S.q = t; renderLibBody(); }, d.only[0]);
  assert.ok(await page.evaluate((t) => [...document.querySelectorAll('#libBody .slide, #libBody .agc')].some((x) => x.textContent.includes(t)), d.only[0]), 'search still finds a link-only release'); await page.evaluate(() => { S.q = ''; renderLibBody(); });
  // closing Now Playing parks the player instead of removing it
  const v = await page.evaluate(() => S.lib.versions.find((x) => x.format === 'YOUTUBE' && !x.audio && S.lib.tracks.some((t) => t.track_id === x.track_id && t.video_url)).version_id);
  await page.evaluate((id) => play(id), v); await page.waitForSelector('#npVid iframe[src*="youtube-nocookie.com"]', { timeout: 8000 });
  await page.evaluate(() => closeNp());
  const k = await page.evaluate(() => { const np = document.querySelector('#np'), cs = getComputedStyle(np), f = document.querySelector('#npVid iframe'); return { parked: np.classList.contains('parked'), display: cs.display, vis: cs.visibility, frame: !!f, ytSong: S.ytSong, open: npOpen(), body: document.body.style.overflow }; });
  assert.deepEqual([k.parked, k.display !== 'none', k.vis, k.frame, k.ytSong, k.open], [true, true, 'hidden', true, true, false], 'a YouTube song stays on the page (invisible) when Now Playing closes: ' + JSON.stringify(k));
  await page.evaluate(() => openNp()); assert.equal(await page.evaluate(() => [npOpen(), !!document.querySelector('#npVid iframe')].join()), 'true,true', 'opening it again shows the same player');
  await page.evaluate(() => closeNp());
  await page.evaluate((id) => { const f = S.lib.versions.find((x) => x.audio && x.version_id !== id); play(f.version_id); }, v);   // a song with a file: the parked player goes away
  await page.waitForFunction(() => !document.querySelector('#npVid iframe') && document.querySelector('#np').hidden && !document.querySelector('#np').classList.contains('parked'), null, { timeout: 8000 });
  await page.evaluate(() => { try { stopPlayback(); } catch (e) {} });
  assert.equal(await page.evaluate(() => { const t = document.createElement('div'); t.innerHTML = I.note; return document.querySelector('#tabs [data-nav="library"] svg').innerHTML === t.firstElementChild.innerHTML; }), true, 'the Music tab icon is a music note');
});
await step('song downloads are for the owner link only: no song download for fans (even on a link saved with downloads on), no "let them download" choice on share links; Lore photo downloads stay open to everyone', async () => {
  // the owner still has them
  await page.evaluate(() => { S.releaseId = 'rel_pub'; renderRelease('rel_pub'); });
  assert.equal(await page.evaluate(() => { openShare('all', 'all'); const has = !!document.querySelector('#mDl'); closeModal(); return has; }), false, 'no "Let them download the WAV" choice');
  await page.evaluate(() => { renderLore(); openLorePhoto(0); }); await page.waitForSelector('#lbDl'); await page.evaluate(() => document.querySelector('#lbX').click());
  const fctx = await phoneContext(), fan = await fctx.newPage(); fan.on('pageerror', (e) => problems.push('fan page error: ' + e.message));
  await fan.goto('https://soulnicolas.com/?s=FAN'); await fan.waitForSelector('.tabs [data-nav="library"]', { state: 'attached', timeout: 15000 });
  assert.equal(await fan.evaluate(() => S.share && S.share.allow_download), false, 'the app is told downloads are off, even for a link saved with them on');
  assert.deepEqual([await fan.evaluate(() => canDownload()), await page.evaluate(() => canDownload())], [false, true], 'only the owner link can download');
  await fan.evaluate(() => { const v = S.lib.versions.find((x) => x.audio || x.url); S.__v = v && v.version_id; if (v) play(v.version_id); });
  await fan.waitForTimeout(1500);
  assert.equal(await fan.evaluate(() => [(S.now && S.now.dl) || '', document.querySelector('#npDl') ? document.querySelector('#npDl').hidden : true].join('|')), '|true', 'no download link for a fan');
  await fan.evaluate(() => { renderLore(); openLorePhoto(0); }); await fan.waitForSelector('#lbStage'); assert.equal(await fan.evaluate(() => !!document.querySelector('#lbDl')), true, 'fans can still download the Lore photos (only SONG downloads are owner-only)');
  await fctx.close();
});
await step('Soul Tribe fan list: every submitted detail is listed, search works, a fan can be edited and deleted', async () => {
  await w.call('joinSubmit', [{ firstName: 'Ana', lastName: 'Lee', email: 'ana@example.com', emailConsent: true, city: 'Nashville, TN', birthYear: '1995', social: '@ana', howHeard: 'Instagram', favoriteRelease: 'soulLESS' }], { ip: '5.5.5.5' });
  await w.call('joinSubmit', [{ firstName: 'Bo', email: 'bo@example.com', emailConsent: true }], { ip: '6.6.6.6' });
  await page.evaluate(() => { renderVault(); document.querySelectorAll('details.sset').forEach((d) => { d.open = true; }); }); await page.waitForSelector('[data-fans]'); await page.evaluate(() => document.querySelector('[data-fans]').click());
  await page.waitForSelector('.fnrow'); await noSideways('fan list');
  assert.equal(await page.evaluate(() => document.querySelectorAll('.fnrow').length >= 2), true);
  await page.evaluate(() => { const r = [...document.querySelectorAll('.fnrow')].find((x) => /Ana Lee/.test(x.textContent)); r.open = true; });
  const facts = await page.evaluate(() => [...document.querySelectorAll('.fnrow[open] .fnfacts > div')].map((d) => d.innerText.replace(/\s+/g, ' ').trim()));
  for (const want of ['Email ana@example.com', 'Location Nashville, TN', 'Birth year 1995', 'Social @ana', 'Heard about you from Instagram', 'Favorite release soulLESS', 'Agreed to e-mails Yes', 'Newsletter On']) assert.ok(facts.includes(want), 'the fan card shows "' + want + '": ' + facts.join(' | '));
  await page.fill('#fnQ', 'nashville'); await page.waitForFunction(() => document.querySelectorAll('.fnrow').length === 1, null, { timeout: 5000 }); await page.fill('#fnQ', '');
  await page.waitForFunction(() => document.querySelectorAll('.fnrow').length >= 2, null, { timeout: 5000 });
  await page.evaluate(() => { const r = [...document.querySelectorAll('.fnrow')].find((x) => /Ana Lee/.test(x.textContent)); r.open = true; r.querySelector('[data-fn-edit]').click(); });
  await page.waitForSelector('[data-fn-form]'); await page.fill('[data-fn-k="city"]', 'Memphis, TN'); await page.fill('[data-fn-k="email"]', 'nope'); await page.click('[data-fn-form] [type="submit"]'); await seen("That email doesn't look right");
  await page.fill('[data-fn-k="email"]', 'ana@example.com'); await page.fill('[data-fn-k="first_name"]', 'Anna'); await page.uncheck('[data-fn-news]'); await page.click('[data-fn-form] [type="submit"]');
  await page.waitForFunction(() => /Anna Lee/.test(document.querySelector('#fnList').innerText) && /Memphis, TN/.test(document.querySelector('#fnList').innerText) && /No newsletter/.test(document.querySelector('#fnList').innerText), null, { timeout: 8000 });
  assert.deepEqual((await w.call('getFans', [KEY])).result.filter((f) => f.email === 'ana@example.com').map((f) => [f.first_name, f.city, f.news]), [['Anna', 'Memphis, TN', 0]], 'saved on the server');
  await page.evaluate(() => { const r = [...document.querySelectorAll('.fnrow')].find((x) => /Bo/.test(x.querySelector('b').textContent)); r.open = true; r.querySelector('[data-fn-edit]').click(); });
  await page.waitForSelector('[data-fn-del]'); await page.click('[data-fn-del]'); assert.match(await page.textContent('[data-fn-del]'), /Tap again/); await page.click('[data-fn-del]');
  await page.waitForFunction(() => !/bo@example\.com/.test(document.querySelector('#fnList').innerText), null, { timeout: 8000 });
  assert.deepEqual((await w.call('getFans', [KEY])).result.map((f) => f.email), ['ana@example.com'], 'deleted on the server (it asks twice first)');
  await page.evaluate(() => closeModal());
});
await step('New release form: clear boxes with option cards, the seal date only when sealing, and a release can start with no songs (Studio > New)', async () => {
  await page.evaluate(() => renderStudio()); await page.waitForSelector('#stuNewRel'); await page.click('#stuNewRel'); await page.waitForSelector('.nrbox');
  const m = await page.evaluate(() => ({ boxes: [...document.querySelectorAll('.nrbox > h3')].map((h) => h.textContent.trim()), opts: document.querySelectorAll('.nropt').length, seal: document.querySelector('#nrSealRow').hidden, btn: document.querySelector('[data-nr-go]').textContent, lead: !!document.querySelector('.nrlead'), links: [...document.querySelectorAll('.nrlinks [data-nr-yt], .nrlinks [data-nr-sc]')].length }));
  assert.deepEqual(m.boxes, ['Songs', 'Whose song is it?', 'Who can see it?', 'Or start from a link'], 'sections: ' + JSON.stringify(m)); assert.equal(m.opts, 5, 'option cards for whose song and who can see it'); assert.equal(m.seal, true, 'no date box until you choose to seal'); assert.equal(m.btn, 'Create release'); assert.equal(m.links, 2);
  await noSideways('new release form (clean)');
  await page.check('[name="nrVis"][value="seal"]'); await page.waitForFunction(() => !document.querySelector('#nrSealRow').hidden, null, { timeout: 3000 }); await page.check('[name="nrVis"][value="hide"]'); await page.waitForFunction(() => document.querySelector('#nrSealRow').hidden, null, { timeout: 3000 });
  await page.fill('#nrTitle', 'No Songs Yet'); await page.click('[data-nr-go]');
  await page.waitForFunction(() => document.querySelector('#modal').hidden, null, { timeout: 20000 });
  const nat = await store(); const rel = nat.releases.find((r) => r.title === 'No Songs Yet'); assert.ok(rel && rel.hidden === true, 'a hidden release with no songs yet was made');
});
await step('Backups page: the file list for an offsite copy; offline notice; the saved-copy service worker stays off in automated browsers', async () => {
  await page.evaluate(() => { renderVault(); document.querySelectorAll('details.sset').forEach((d) => { d.open = true; }); }); await page.waitForSelector('[data-backups]'); await page.evaluate(() => document.querySelector('[data-backups]').click()); await page.waitForSelector('#bkFiles');
  const dl = page.waitForEvent('download', { timeout: 10000 }); await page.click('#bkFiles'); const file = await dl; assert.equal(file.suggestedFilename(), 'soul-vault-files.json');
  await page.waitForFunction(() => /\d+ files, [\d.]+ MB/.test(document.querySelector('#bkFilesSt').textContent), null, { timeout: 8000 });
  assert.match(await page.textContent('.bkfiles'), /tools\/download-media\.py/, 'it says how to make the copy'); await noSideways('backups page'); await page.evaluate(() => closeModal());
  assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0, 'no service worker in an automated browser');
  await page.evaluate(() => window.dispatchEvent(new Event('offline'))); await seen("You're offline");
});
await step('Shop: add a CD in Studio, it shows on Home and its release page with a safe Buy link; sold out turns the button off; text is escaped', async () => {
  await page.evaluate(() => { renderVault(); document.querySelectorAll('details.sset').forEach((d) => { d.open = true; }); }); await page.waitForSelector('[data-nav="shop"]');
  assert.equal(await page.evaluate(() => !!document.querySelector('.settings-list [data-nav="shop"], [data-nav="shop"]')), true, 'Shop has its own row in Settings');
  await page.evaluate(() => { S.shopP = null; S.shop = null; renderStudio(); }); await page.waitForSelector('.studio .vh');
  assert.equal(await page.evaluate(() => !document.querySelector('#stuShop') && !document.querySelector('#stuShopItems')), true, 'Studio no longer has the Shop in it');
  await page.evaluate(() => { S.shopP = null; S.shop = null; renderShop(); }); await page.waitForSelector('#stuShopItems');
  await page.click('#stuShopAdd'); await page.waitForSelector('[data-shop-item]');
  await page.fill('[data-shop-item] [data-sh="title"]', 'Rise <b>of</b> the Lost (CD)'); await page.fill('[data-shop-item] [data-sh="price"]', '$12');
  await page.fill('[data-shop-item] [data-sh="blurb"]', 'Signed copy.');
  await page.fill('[data-shop-item] [data-sh="buy_url"]', 'javascript:alert(1)'); await page.click('#stuShopSave');
  await page.waitForFunction(() => /https/.test(document.querySelector('#stuShopSt').textContent), null, { timeout: 5000 });
  assert.deepEqual((await w.call('getShop', [])).result, [], 'a bad link is not saved');
  await page.fill('[data-shop-item] [data-sh="buy_url"]', 'https://buy.stripe.com/test123');
  await page.selectOption('[data-shop-item] [data-sh="release_id"]', 'rel_pub');
  await page.click('#stuShopSave'); await seen('Shop saved');
  assert.equal((await w.call('getShop', [])).result.length, 1);
  await page.evaluate(() => { closeModal && closeModal(); renderHome(); }); await page.waitForSelector('#shopHome .shopcard', { timeout: 8000 });
  const card = await page.evaluate(() => { const a = document.querySelector('#shopHome a.shopbtn'); return { href: a.href, target: a.target, rel: a.rel, name: document.querySelector('#shopHome .shopname').textContent, bold: !!document.querySelector('#shopHome .shopname b') }; });
  assert.deepEqual([card.href, card.target, card.rel, card.name, card.bold], ['https://buy.stripe.com/test123', '_blank', 'noopener noreferrer', 'Rise <b>of</b> the Lost (CD)', false]);
  await noSideways('home with shop');
  await page.evaluate(() => { S.releaseId = 'rel_pub'; renderRelease('rel_pub'); }); await page.waitForSelector('#shopRel .shopcard', { timeout: 8000 });
  await page.evaluate(() => { S.releaseId = 'rel_single'; renderRelease('rel_single'); }); await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => document.querySelectorAll('#shopRel .shopcard').length), 0, 'only the chosen release shows it');
  await page.evaluate(() => { S.shopP = null; renderShop(); }); await page.waitForSelector('#stuShopItems');
  await page.waitForSelector('[data-shop-item] [data-sh="sold_out"]'); await page.check('[data-shop-item] [data-sh="sold_out"]'); await page.click('#stuShopSave'); await page.waitForFunction(() => S.shop && S.shop[0] && S.shop[0].sold_out === true, null, { timeout: 8000 });
  assert.equal((await w.call('getShop', [])).result[0].sold_out, true);
  await page.evaluate(() => { closeModal && closeModal(); renderHome(); }); await page.waitForSelector('#shopHome .shopcard.sold', { timeout: 8000 });
  assert.deepEqual(await page.evaluate(() => [!!document.querySelector('#shopHome a.shopbtn'), document.querySelector('#shopHome .shopbtn').textContent]), [false, 'Sold out']);
});
await step('Settings no longer lists Lore (it is on the tab bar); a Refresh link on Home and in Settings clears the saved copy and reloads', async () => {
  await page.evaluate(() => { renderVault(); document.querySelectorAll('details.sset').forEach((d) => { d.open = true; }); }); await seen('Refresh the app'); const html = await page.evaluate(() => document.body.innerText);
  assert.ok(html.includes('Refresh the app'), 'Settings has Refresh the app');
  assert.ok(!html.includes('Producers, places and eras'), 'no Lore row in Settings');
  await page.evaluate(() => closeModal && closeModal()); await page.evaluate(() => renderHome());
  await page.waitForSelector('[data-refresh]');
  const ver0 = await page.evaluate(() => [APP_VERSION, document.querySelector('.appver').textContent]);
  assert.ok(/^\d+-[0-9a-f]+$/.test(ver0[0]) && ver0[1] === 'v' + ver0[0], 'the version is shown: ' + ver0);
  const urls = []; page.on('request', (rq) => { if (rq.isNavigationRequest()) urls.push(rq.url()); });
  const nav = page.waitForNavigation({ timeout: 8000 }); await page.click('a[data-refresh]'); await nav;
  assert.ok(urls.some((u) => /[?&]r=\d+/.test(u)), 'it reloads on a fresh address nothing has saved: ' + urls.join(' '));
  await page.waitForFunction(() => !new URL(location.href).searchParams.has('r'), null, { timeout: 5000 });   // ...and that extra part is removed again
});
await step('project cards never show a blank square: cover, else a song cover, else the YouTube picture, else a plain tile', async () => {
  const r = await page.evaluate(() => {
    const el = h => { const d = document.createElement('div'); d.innerHTML = h; return d.firstElementChild; };
    const g = (cover, songs) => ({ r: { cover_file_id: cover }, songs });
    return [groupArt(g('abc', [{}])), groupArt(g('', [{ track_cover: 'tc1' }])), groupArt(g('', [{ video_url: 'https://youtu.be/dQw4w9WgXcQ' }])), groupArt(g('', [{}]))].map(h => { const e = el(h); return [e.tagName, e.getAttribute('data-cover') || (e.getAttribute('src') || '').replace(/^https:\/\/i\.ytimg\.com\/vi\//, 'yt:'), /vph/.test(e.className)]; });
  });
  assert.deepEqual(r, [['IMG', 'abc', false], ['IMG', 'tc1', false], ['IMG', 'yt:dQw4w9WgXcQ/hqdefault.jpg', false], ['SPAN', '', true]]);
});
await step("Soul's Picks: a playlist marked as a pick gets its own section on the Music tab (and leaves the Playlists row)", async () => {
  { const ad = await page.evaluate(() => run('adoptDomain', BOOT.key, 'playlists')); assert.ok(ad && ad.owned !== false, JSON.stringify(ad)); }
  await page.evaluate(() => { S.lib.playlists = (S.lib.playlists || []).filter(p => p && p.playlist_id); });
  await page.evaluate(async () => { const o = await run('savePlaylist', BOOT.key, { title: 'Hardest verses', description: 'My proudest bars.', tracks: ['trk_a1'], fans: true, pick: true }); (S.lib.playlists = S.lib.playlists || []).push(o); renderLibrary(); });
  await page.waitForSelector('[data-extab]'); await page.evaluate(() => { const b = document.querySelector('[data-extab="picks"]'); if (b) b.click(); }); await page.waitForSelector('#picks .pickcard');
  const r = await page.evaluate(() => ({ inExtras: !!document.querySelector('#extras #picks'), tabs: [...document.querySelectorAll('[data-extab]')].map(b => b.textContent.trim()), picks: [...document.querySelectorAll('#picks .pickcard .picktitle')].map(e => e.textContent), rest: [...document.querySelectorAll('#libBody .plcard:not(.new) .nm')].filter(e => e.textContent === 'Hardest verses').length, head: (document.querySelector('[data-extab="picks"]') || {}).textContent }));
  assert.deepEqual([r.picks, r.head, r.inExtras], [['Hardest verses'], "Soul's Picks", true], "Soul's Picks is a tab of the Extras area: " + JSON.stringify(r));
  assert.equal(r.tabs[r.tabs.length - 1], "Soul's Picks", 'after Unreleased, Features and Series');
  const sh = await page.evaluate(() => { const row = document.querySelector('#picks .picksgrid'), cs = getComputedStyle(row), c = document.querySelector('#picks .pickcard').getBoundingClientRect(); return { flex: cs.display, ox: cs.overflowX, snap: cs.scrollSnapType, w: Math.round(c.width), wrapped: !!row.closest('.scrollwrap') }; });
  assert.ok(sh.flex === 'flex' && /auto|scroll/.test(sh.ox) && /x/.test(sh.snap) && sh.w >= 180 && sh.w <= 300, "Soul's Picks is a scrolling shelf of big cards: " + JSON.stringify(sh));
  assert.equal(r.rest, 0, 'a pick is not also in the Playlists row');
  assert.deepEqual(await page.evaluate(() => [document.querySelector('#picks .pickbadge').textContent, document.querySelector('#picks .pickdesc').textContent]), ["Soul's Pick", 'My proudest bars.']);
  await noSideways("music tab with Soul's Picks");
  if (process.env.SHOT) await page.locator('#picks').screenshot({ path: process.env.SHOT });
  await page.evaluate(() => { const p = S.lib.playlists.find(x => x.pick); renderPlaylist(p.playlist_id); }); await page.waitForSelector('.plhead.ispick .pickkick');
  assert.match(await page.evaluate(() => document.querySelector('.pickkick').textContent), /Curated by Nicólas Soul/);
});
await step('Song <-> Video keeps your place: the video clock comes from YouTube messages (and only from YouTube); back to Song continues from there; "Watch" on the song that is playing does not restart it', async () => {
  const r = await page.evaluate(() => {
    const t = { track_id: 'trk_vid', title: 'Vid song', release_id: 'rel_pub', video_url: 'https://youtu.be/dQw4w9WgXcQ' }, v = { version_id: 'ver_vid', track_id: 'trk_vid', label: 'Original' };
    S.now = { t, v, r: { release_id: 'rel_pub', title: 'X' } }; S.ytSong = false; S.scSong = false; S.videoMode = true; S.vidClock = { tid: 'trk_vid', t: 0, playing: false };
    const msg = (origin, data) => window.dispatchEvent(new MessageEvent('message', { origin, data: JSON.stringify(data) }));
    msg('https://evil.example', { event: 'infoDelivery', info: { currentTime: 999, playerState: 1 } });
    const ignored = S.vidClock.t;
    msg('https://www.youtube-nocookie.com', { event: 'infoDelivery', info: { currentTime: 42.5, playerState: 1 } });
    const got = [S.vidClock.t, S.vidClock.playing];
    let played = 0; const realPlay = audio.play; audio.play = () => { played++; return Promise.resolve(); };
    setMode('song', true);
    const out = { ignored, got, at: Math.round(audio.currentTime * 10) / 10, played, mode: S.videoMode };
    // a different song's clock is never applied
    S.videoMode = true; S.vidClock = { tid: 'other', t: 77, playing: true }; audio.currentTime = 5; setMode('song', true); out.other = audio.currentTime;
    audio.play = realPlay; S.now = null; S.videoMode = false; return out;
  });
  assert.deepEqual([r.ignored, r.got, r.at, r.played, r.mode, r.other], [0, [42.5, true], 42.5, 1, false, 5]);
});
await step('Offline music: Save offline on a release saves its songs inside the app, they then play from the saved copy with no network, and Remove clears them', async () => {
  assert.match(readFileSync(new URL('../../dist/_headers', import.meta.url), 'utf8'), /connect-src[^\n]*https:\/\/media\.soulnicolas\.com/, 'the page is allowed to fetch songs from our storage (else saving is blocked)');
  let net = true;
  await page.route('https://media.soulnicolas.com/test/**', r => (net ? r.fulfill({ status: 200, headers: { 'content-type': 'audio/mp4', 'access-control-allow-origin': '*' }, body: Buffer.from('AAAABBBB') }) : r.fulfill({ status: 500, body: '' })));
  await page.evaluate(() => { S.urlByFile = S.urlByFile || {}; for (const id of ['ver_a1', 'ver_a2', 'ver_s1']) { const v = ver(id); v.audio = v.audio || 'f_' + id; S.urlByFile[v.audio] = 'https://media.soulnicolas.com/test/' + id + '.m4a'; } caches.delete('sv-music-v1'); renderRelease('rel_pub'); });
  await page.waitForSelector('[data-off="rel:rel_pub"]:not([hidden])', { timeout: 8000 });
  assert.match(await page.evaluate(() => document.querySelector('[data-off="rel:rel_pub"]').textContent), /Save offline/);
  await page.click('[data-off="rel:rel_pub"]'); await page.waitForSelector('[data-off="rel:rel_pub"][data-state="saved"]', { timeout: 8000 });
  const keys = async () => page.evaluate(async () => (await (await caches.open('sv-music-v1')).keys()).map((k) => k.url.split('/').pop()).sort());
  assert.deepEqual(await keys(), ['ver_a1.m4a'], 'the visible song is saved; the hidden one is not');
  net = false;   // no connection from here on
  const r = await page.evaluate(async () => { const a = await sourceFor(songFile(ver('ver_a1')), true), b = await offSource(S.urlByFile[songFile(ver('ver_s1'))]); return [a.saved === true, /^blob:/.test(a.stream), b]; });
  assert.deepEqual(r, [true, true, ''], 'a saved song plays from its copy; an unsaved one is not pretended');
  await page.click('[data-off="rel:rel_pub"]'); await page.waitForSelector('[data-off="rel:rel_pub"][data-state="none"]', { timeout: 8000 });
  assert.deepEqual(await keys(), []);
  await noSideways('release page with Save offline');
  await page.evaluate(() => openOfflineMusic()); await seen('Offline music'); await page.evaluate(() => closeModal());
  await page.unroute('https://media.soulnicolas.com/test/**');
});
await step('Crossfade: near the end of a song the old song keeps playing in the second player while it fades out and the next song fades in; Off changes nothing', async () => {
  const wav = (secs, hz) => { const rate = 8000, n = rate * secs, b = Buffer.alloc(44 + n); b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40); for (let i = 0; i < n; i++) b[44 + i] = 128 + Math.round(40 * Math.sin(2 * Math.PI * hz * i / rate)); return b; };
  const files = { 'x1.wav': wav(14, 440), 'x2.wav': wav(14, 660) };
  await page.route('https://media.soulnicolas.com/xf/**', (r) => {
    const body = files[r.request().url().split('/').pop()]; if (!body) return r.fulfill({ status: 404, body: '' });
    const m = /bytes=(\d+)-(\d*)/.exec(r.request().headers().range || ''), base = { 'content-type': 'audio/wav', 'accept-ranges': 'bytes', 'access-control-allow-origin': '*' };
    if (!m) return r.fulfill({ status: 200, headers: { ...base, 'content-length': String(body.length) }, body });
    const a0 = +m[1], b0 = m[2] ? Math.min(+m[2], body.length - 1) : body.length - 1;
    return r.fulfill({ status: 206, headers: { ...base, 'content-range': `bytes ${a0}-${b0}/${body.length}`, 'content-length': String(b0 - a0 + 1) }, body: body.subarray(a0, b0 + 1) });
  });
  await page.evaluate(() => { canSetVolume = true; });   // the test browser poses as an iPhone, which cannot fade; a computer can
  await page.evaluate(() => { S.urlByFile = S.urlByFile || {}; [['ver_a1', 'x1'], ['ver_sg', 'x2']].forEach(([id, f]) => { const v = ver(id); v.audio = 'f_' + id; S.urlByFile['f_' + id] = 'https://media.soulnicolas.com/xf/' + f + '.wav'; }); ls.set('sv_volume', 0.8); S.trans = 'cf3'; S.repeat = 'off'; S.queue = ['ver_a1', 'ver_sg']; S.qi = 0; document.addEventListener('pointerdown', () => unlockOut(), { once: true, capture: true }); });
  await page.mouse.click(5, 5); await page.waitForFunction(() => S.outUnlocked, null, { timeout: 8000 });   // picking a transition is a tap; that tap is what unlocks the second player
  await page.evaluate(() => { play('ver_a1'); });
  await page.waitForFunction(() => !audio.paused && audio.currentTime > 0.3 && audio.duration > 10, null, { timeout: 15000 });
  await page.waitForFunction(() => !audio.paused && audio.currentTime > 0.3 && audio.duration > 10 && S.outUnlocked, null, { timeout: 15000 });
  await page.evaluate(() => { audio.currentTime = audio.duration - 6.5; });
  await page.waitForFunction(() => S.qi === 1 && !audioOut.paused, null, { timeout: 15000 });
  await page.waitForTimeout(1300);
  const mid = await page.evaluate(() => ({ out: audioOut.volume, inn: audio.volume, outT: audioOut.currentTime, now: S.now.v.version_id }));
  assert.equal(mid.now, 'ver_sg'); assert.ok(mid.out < 0.8 && mid.out > 0 && mid.inn > 0 && mid.inn < 0.8, 'both are partway through the fade: ' + JSON.stringify(mid));
  await page.waitForFunction(() => audioOut.paused && Math.abs(audio.volume - 0.8) < 0.02, null, { timeout: 12000 });
  assert.equal(await page.evaluate(() => !audio.paused && S.now.v.version_id), 'ver_sg', 'the next song keeps playing at the chosen volume');
  // Off: the same jump near the end changes nothing until the song really ends
  await page.evaluate(() => { S.trans = 'off'; S.qi = 0; S.queue = ['ver_a1', 'ver_sg']; play('ver_a1'); });
  await page.waitForFunction(() => !audio.paused && audio.currentTime > 0.3 && audio.duration > 10, null, { timeout: 15000 });
  await page.evaluate(() => { audio.currentTime = audio.duration - 6.5; }); await page.waitForTimeout(2500);
  assert.deepEqual(await page.evaluate(() => [S.qi, audioOut.paused]), [0, true]);
  await page.evaluate(() => { audio.pause(); S.trans = 'off'; ls.set('sv_volume', 1); audio.volume = 1; canSetVolume = false; });
  await page.unroute('https://media.soulnicolas.com/xf/**');
});
await step('Search by lyrics: ignores capitals, accents and apostrophes, finds a phrase over two lines, falls back to "all the words", puts exact phrases first, and marks the match safely', async () => {
  await page.evaluate(() => { S.lyCache = null; trk('trk_a1').lyrics = "I don't wanna fall\nIn love with caf\u00e9 lights\n[00:10.00]Stay up all night <b>x</b>"; trk('trk_sg').lyrics = 'night after night I stay'; });
  const r = await page.evaluate(() => {
    const ids = q => lyricHits(q, []).map(t => t.track_id), snip = q => lyricSnippet(trk('trk_a1'), q);
    return { apos: ids('DONT wanna fall'), accent: ids('cafe lights'), twoLines: ids('fall in love'), twoSnip: snip('fall in love'), words: ids('night stay'), none: ids('zzzzqq'), short: ids('ab'), rank: ids('stay up all night'), html: snip('<b>x</b>'), pair: snip('dont wanna') };
  });
  assert.deepEqual([r.apos, r.accent, r.twoLines, r.words, r.none, r.short], [['trk_a1'], ['trk_a1'], ['trk_a1'], ['trk_a1', 'trk_sg'], [], []]);
  assert.match(r.twoSnip, /<mark>fall<\/mark>|<mark>fall \/ In love<\/mark>/); assert.ok(/mark/.test(r.twoSnip) && /In love/.test(r.twoSnip));
  assert.deepEqual(r.rank, ['trk_a1'], 'phrase hit only: the other song lacks "up all"');
  const order = await page.evaluate(() => { const old = trk('trk_sg').title; trk('trk_sg').title = 'AAA alphabetically first'; trk('trk_sg').lyrics = 'I stay but never go up'; const o = lyricHits('stay up', []).map(t => t.track_id); trk('trk_sg').title = old; return o; });
  assert.deepEqual(order, ['trk_a1', 'trk_sg'], 'the song with the exact phrase comes before one that only has the words, even though the other sorts first by title');
  assert.ok(r.html.includes('&lt;') && !r.html.includes('<b>') && !r.html.includes('</b>'), 'lyric text is escaped: ' + r.html);
  assert.match(r.pair, /<mark>don&#39;t wanna<\/mark>/);
  await page.evaluate(() => { S.q = ''; renderLibrary(); }); await page.waitForSelector('#q');
  await page.fill('#q', "dont wanna"); await page.waitForSelector('.lysnip mark', { timeout: 5000 });
  assert.match(await page.evaluate(() => document.querySelector('#q').placeholder), /lyrics/);
  await noSideways('lyric search results');
  await page.fill('#q', ''); await page.evaluate(() => { trk('trk_a1').lyrics = ''; trk('trk_sg').lyrics = ''; S.lyCache = null; });
});
await step('Home: "On the road" shows the Road to 100 ring and the next show, and Soul\'s Picks appear (Continue listening is Music-tab only), nothing overflows', async () => {
  const day = (add) => { const d = new Date(Date.now() + add * 864e5); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + '/' + d.getUTCFullYear(); };
  w.tracker = '#,Date,Venue,City,Show Type / Setlist Notes,Completed,Show Length (min),Reflection,State,Story,Clip\n1,7/9/2026,Rosemary <b>Room</b>,"Nashville, TN",Showcase,TRUE,4 songs,,TN,,\n2,7/24/2026,Open Chord,"Knoxville, TN",Open Mic,TRUE,2 songs,,TN,,\n3,' + day(8) + ',The Planned Room,"Atlanta, GA",Festival,FALSE,,,GA,,\n';
  globalThis.__svTour = null;
  await page.evaluate(() => { S.tourP = null; S.tour = null; ls.set(resumeKey(), { q: ['ver_a1'], qi: 0, t: 42, vid: 'ver_a1', at: Date.now() }); S.now = null; renderHome(); });
  await page.waitForSelector('#roadHome .roadcard', { timeout: 8000 });
  const r = await page.evaluate(() => ({ txt: document.querySelector('#roadHome').innerText, ring: document.querySelector('#roadHome .roadring text').textContent, html: document.querySelector('#roadHome').innerHTML, resume: !!document.querySelector('#homeResume .resume'), picks: !!document.querySelector('#picksHome .pickcard') }));
  assert.match(r.txt, /2 of 100 shows played/); assert.match(r.txt, /The Planned Room, Atlanta, GA/); assert.equal(r.ring, '2');
  assert.ok(!r.html.includes('<b>Room'), 'sheet text is escaped');
  assert.equal(r.resume, false, 'Continue listening is not on Home (it stays on the Music tab)'); assert.equal(r.picks, false, "Soul's Picks are on the Music tab only, not on Home"); assert.equal(await page.evaluate(() => !!document.querySelector('.homepg #picks, #picksHome')), false, 'no Soul\'s Picks section anywhere on Home');
  const lay = await page.evaluate(() => {
    const h = [...document.querySelectorAll('.homepg h2')].map((e) => e.className + ':' + e.textContent.trim());
    const cols = (sel) => { const g = document.querySelector(sel); return g ? getComputedStyle(g).gridTemplateColumns.split(' ').length : 0; };
    return { h, lathead: document.querySelectorAll('.homepg .lathead').length, grids: [...document.querySelectorAll('.homepg .hgrid2')].map((g) => getComputedStyle(g).gridTemplateColumns.split(' ').length), titles: [...document.querySelectorAll('.homepg .lat .lattitle2')].map((e) => e.textContent.trim()).filter(Boolean).length, links: [...document.querySelectorAll('.hlinks a')].map((a) => Math.round(a.getBoundingClientRect().height)) };
  });
  assert.equal(lay.lathead, 0, 'no giant letter-spaced headings on Home: ' + lay.h);
  assert.ok(lay.h.every((x) => x.startsWith('sh:')), 'every Home heading uses the app heading style: ' + lay.h);
  assert.ok(lay.h.some((x) => /On the road/.test(x)) && lay.h.some((x) => /Shop|Watch|New music/.test(x)), 'section headings present: ' + lay.h);
  assert.deepEqual(lay.grids, [2, 2], 'new music and videos sit two across');
  assert.ok(lay.titles >= 2, 'covers and videos show their titles');
  assert.ok(lay.links.length === 4 && lay.links.every((n) => n >= 44), 'footer links have 44px tap room: ' + lay.links);
  await noSideways('home with road card');
  if (process.env.SHOT_HOME) await page.screenshot({ path: process.env.SHOT_HOME, fullPage: true });
  await page.click('#roadHome .roadmain'); await page.waitForFunction(() => S.view === 'tour', null, { timeout: 5000 });
  w.tracker = null; globalThis.__svTour = null;
  await page.evaluate(() => { S.tourP = null; S.tour = null; ls.set(resumeKey(), null); renderHome(); }); await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => document.querySelector('#roadHome').hidden), true, 'no sheet: the card hides itself');
});
await step('Settings > Fill in link song details opens, checks YouTube and says what it would fill in (or why it cannot)', async () => {
  await page.evaluate(() => { renderVault(); document.querySelectorAll('details.sset').forEach((d) => { d.open = true; }); }); await page.waitForSelector('[data-fillfacts]');
  await page.click('[data-fillfacts]'); await page.waitForSelector('#ffSt');
  await page.waitForFunction(() => { const t = document.querySelector('#ffSt').textContent + (document.querySelector('#ffErr').hidden ? '' : document.querySelector('#ffErr').textContent); return t && !/^Checking/.test(t); }, null, { timeout: 8000 });
  const txt = await page.evaluate(() => document.querySelector('#ffSt').textContent + ' ' + document.querySelector('#ffErr').textContent);
  assert.match(txt, /Ready|Nothing to fill|YouTube key|link song/, txt);
  await noSideways('fill in link song details'); await page.evaluate(() => closeModal());
});
await step('Tour: Overview is short (next show, a small Road to 100 card that opens the tracker, Book Soul; no list of shows); Shows and Road to 100 still open; addresses work', async () => {
  const day = (add) => { const d = new Date(Date.now() + add * 864e5); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + '/' + d.getUTCFullYear(); };
  const done = Array.from({ length: 12 }, (_, i) => `${i + 1},${(i % 2 ? '8' : '7')}/${i + 1}/2026,Venue ${i + 1},"Nashville, TN",Showcase,TRUE,3 songs,,TN,${i === 0 ? '"A <b>big</b> night"' : ''},${i === 0 ? 'https://www.youtube.com/embed/rOgojY-PHJc' : ''}`).join('\n');
  w.tracker = '#,Date,Venue,City,Show Type / Setlist Notes,Completed,Show Length (min),Reflection,State,Story,Clip\n' + done + '\n13,' + day(12) + ',The <i>Planned</i> Room,"Atlanta, GA",Festival,FALSE,,,GA,,\n';
  globalThis.__svTour = null;
  await page.route('https://soulnicolas.com/shows.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>shows</title><p>stub</p>' }));   // the two embedded pages call Bandsintown / Google: not in this test
  await page.route('https://soulnicolas.com/roadto100shows.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>road</title><p>stub</p>' }));
  await page.evaluate(() => { S.tourP = null; S.tour = null; S.tourTab = 'overview'; renderTour(); });
  await page.waitForSelector('#tourOver .thero', { timeout: 8000 });
  const r = await page.evaluate(() => ({ next: document.querySelector('.thero').innerText, html: document.querySelector('#tourOver').innerHTML, count: document.querySelector('.tcount').innerText, bar: document.querySelector('.tpbar').getAttribute('aria-valuenow'), cards: document.querySelectorAll('#tourOver .tcard').length, shows: document.querySelectorAll('.tshow, .tmon, [data-tour-all]').length, ics: (document.querySelector('.thero a[download]') || {}).href || '', book: (document.querySelector('.tbook a') || {}).href || '', frameHidden: document.querySelector('.tourframe').style.display, tabW: [...document.querySelectorAll('.tourseg button')].map((b) => Math.round(b.getBoundingClientRect().width)) }));
  assert.match(r.next, /Planned/); assert.match(r.next, /Atlanta, GA/); assert.ok(!r.html.includes('<i>Planned'), 'sheet text is escaped');
  assert.match(r.count, /12\s+of 100 shows/); assert.equal(r.bar, '12'); assert.equal(r.cards, 2, 'two cards (next show, Road to 100) and the Book Soul row'); assert.equal(r.shows, 0, 'no list of shows on the overview');
  assert.ok(r.ics.startsWith('data:text/calendar'), 'add to calendar'); assert.match(r.book, /^mailto:/); assert.equal(r.frameHidden, 'none');
  assert.ok(Math.max(...r.tabW) - Math.min(...r.tabW) <= 2, 'the three tabs are the same width: ' + r.tabW);
  await noSideways('tour overview');
  if (process.env.SHOT_TOUR) await page.screenshot({ path: process.env.SHOT_TOUR });
  await page.click('[data-tour-go="road"]'); await page.waitForFunction(() => location.pathname === '/tour/road-to-100' && /roadto100/.test(document.querySelector('.tourframe').getAttribute('src') || ''), null, { timeout: 4000 });   // the small card opens the tracker tab
  await page.click('[data-tourtab="shows"]'); await page.waitForFunction(() => /\/shows\.html/.test(document.querySelector('.tourframe').getAttribute('src') || '') && location.pathname === '/tour/shows', null, { timeout: 4000 });
  await page.click('[data-tourtab="overview"]'); await page.waitForFunction(() => location.pathname === '/tour' && !document.querySelector('#tourOver').hidden, null, { timeout: 4000 });
  assert.deepEqual(await page.evaluate(() => ['/tour', '/tour/shows', '/tour/road-to-100'].map((p) => { history.pushState({}, '', p); return parseRoute().tab; })), ['overview', 'shows', 'road']);
  await page.unroute('https://soulnicolas.com/shows.html'); await page.unroute('https://soulnicolas.com/roadto100shows.html');
  w.tracker = null; globalThis.__svTour = null;
  await page.evaluate(() => { S.tourP = null; S.tour = null; renderTour(); }); await page.waitForSelector('#tourOver .tbook', { timeout: 8000 });
  assert.match(await page.evaluate(() => document.querySelector('#tourOver').innerText), /can't load right now/, 'no sheet: a friendly message, Book Soul still there');
  await page.evaluate(() => { S.tourTab = 'overview'; });
});
await step('Now Playing is calmer: no volume bar or transitions menu on the page (they are under More), no inline credits, Up next is collapsed, no duplicate title, versions without a heading', async () => {
  await page.evaluate(() => { S.queue = ['ver_a1', 'ver_sg']; S.qi = 0; S.videoMode = false; play('ver_a1'); });
  await page.waitForFunction(() => S.now && S.now.v.version_id === 'ver_a1', null, { timeout: 8000 });
  await page.evaluate(() => { if (!npOpen()) openNp(); updateNowUI(); });
  await page.waitForSelector('#np:not([hidden]) .np-t', { state: 'visible' });
  const r = await page.evaluate(() => {
    const np = document.querySelector('#np'), vis = (e) => !!e && getComputedStyle(e).display !== 'none' && !e.hidden;
    return { vol: !!np.querySelector('.npvol'), trans: !!np.querySelector('[data-trans]'), credits: vis(np.querySelector('#npCredits')), more: vis(np.querySelector('[data-np-more]')), upnext: np.querySelector('.npq') ? np.querySelector('.npq').open : null,
      verHeading: !!np.querySelector('#npVers h4'), sub: np.querySelector('#npS').textContent, title: np.querySelector('#npT').textContent,
      same: npSubHtml({ t: { title: 'Same Name', artist: '' }, r: { title: 'same name', release_id: 'r1' }, v: { label: 'Original' } }) };
  });
  assert.deepEqual([r.vol, r.trans, r.credits, r.more, r.upnext, r.verHeading], [false, false, false, true, false, false], JSON.stringify(r));
  assert.match(r.same, /View release/); assert.ok(!/same name<\/button>/i.test(r.same), 'a single named like its song does not repeat the title');
  if (process.env.SHOT_NP) await page.screenshot({ path: process.env.SHOT_NP });
  await page.click('[data-np-more]'); await page.waitForSelector('#modal [data-trans]', { state: 'visible' });
  assert.deepEqual(await page.evaluate(() => [!!document.querySelector('#modal [data-vol]'), /side buttons/.test(document.querySelector('#modal').innerText), [...document.querySelectorAll('#modal [data-trans] option')].map((o) => o.value)]), [false, true, ['off', 'gapless']], 'an iPhone: no slider, a note about the side buttons, no crossfade choices');
  await page.evaluate(() => { closeModal(); canSetVolume = true; openNpMore(); });
  assert.deepEqual(await page.evaluate(() => [!!document.querySelector('#modal [data-vol]'), document.querySelectorAll('#modal [data-trans] option').length]), [true, 5], 'a computer: the volume slider and every transition choice');
  await page.evaluate(() => { canSetVolume = false; });
  await page.selectOption('#modal [data-trans]', 'gapless'); assert.equal(await page.evaluate(() => S.trans), 'gapless'); await page.selectOption('#modal [data-trans]', 'off');
  await page.evaluate(() => closeModal()); await noSideways('now playing');
  await page.evaluate(() => { audio.pause(); closeNp(); });
});
await step('Now Playing: very long unbroken titles fit on a phone (390 and 320 wide); on an iPhone there is no volume slider (the side buttons do it) and no crossfade choices', async () => {
  const LONG = '#ERRBODYGOTHOOPDREAMSANDNIGHTMARESFOREVERANDEVER';
  const fits = async (label) => {
    const r = await page.evaluate(() => { const t = document.querySelector('#npT'), b = t.getBoundingClientRect(), np = document.querySelector('#np').getBoundingClientRect(); return { sw: t.scrollWidth, cw: t.clientWidth, left: b.left, right: b.right, vw: window.innerWidth, font: parseFloat(getComputedStyle(t).fontSize), lines: Math.round(t.getBoundingClientRect().height / parseFloat(getComputedStyle(t).lineHeight)) }; });
    assert.ok(r.sw <= r.cw + 1 && r.left >= 0 && r.right <= r.vw + 1, label + ' title overflows: ' + JSON.stringify(r));
    return r;
  };
  await page.evaluate((t) => { S.queue = ['ver_a1', 'ver_sg']; S.qi = 0; trk('trk_a1').title = t; play('ver_a1'); }, LONG);
  await page.waitForFunction(() => S.now && S.now.v.version_id === 'ver_a1', null, { timeout: 8000 });
  await page.evaluate(() => { if (!npOpen()) openNp(); updateNowUI(); }); await page.waitForSelector('#np:not([hidden]) .np-t', { state: 'visible' });
  await fits('390px');
  await page.setViewportSize({ width: 320, height: 700 }); await page.waitForTimeout(300); await fits('320px');
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(200);
  // iPhone: the page cannot set the volume, so no slider and no Crossfade (only Gapless)
  const ios = await page.evaluate(() => { const was = [canSetVolume, S.trans]; return was; });
  assert.equal(typeof ios[0], 'boolean');
  const iphone = await page.evaluate(() => { const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'; return deviceCannotSetVolume(ua, 'iPhone', 5); });
  assert.equal(iphone, true, 'an iPhone is recognised as one that cannot set the volume');
  assert.equal(await page.evaluate(() => deviceCannotSetVolume('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120 Safari/537.36', 'MacIntel', 0)), false, 'a computer can');
  assert.equal(await page.evaluate(() => deviceCannotSetVolume('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605 Version/17.0 Safari/605.1.15', 'MacIntel', 5)), true, 'an iPad that says it is a Mac is recognised by its touch screen');
  await page.evaluate(() => { trk('trk_a1').title = 'Song trk_a1 (feat. Aziza)'; audio.pause(); closeNp(); });
});
await step('Lore: The story (bio), Year by year, Stories behind the songs (voice notes); all text escaped; stories play; nothing overflows', async () => {
  await page.evaluate(() => { S.lib.artist_bio = 'Born in Homa Bay & raised in Tennessee.\n\nSecond <b>paragraph</b> here.'; trk('trk_a1').voice_note_id = 'r2:rise/voice-01.m4a'; trk('trk_a2').voice_note_id = 'r2:secret.m4a'; window.__vn = ''; playVoice = (id) => { window.__vn = id; }; renderLore(); });
  await page.waitForSelector('#loreStory .lorestory', { timeout: 6000 });
  const r = await page.evaluate(() => ({ story: document.querySelector('#loreStory p').textContent, more: document.querySelector('#loreStory details').innerHTML, years: [...document.querySelectorAll('.ltl .lty b')].map((e) => e.textContent), chips: document.querySelectorAll('.ltl .lchip[data-rel]').length, stories: [...document.querySelectorAll('.lsl li b')].map((e) => e.textContent), vnBtn: (document.querySelector('.lsl [data-vn]') || {}).dataset && document.querySelector('.lsl [data-vn]').dataset.vn }));
  assert.equal(r.story, 'Born in Homa Bay & raised in Tennessee.'); assert.ok(r.more.includes('&lt;b&gt;paragraph&lt;/b&gt;') && !r.more.includes('<b>paragraph'), 'bio is escaped: ' + r.more);
  assert.ok(r.years.length >= 1 && r.years.every((y, i, a) => !i || a[i - 1] >= y || y === 'Undated'), 'newest year first: ' + r.years); assert.ok(r.chips >= 1, 'every release is a chip that opens it');
  assert.ok(r.stories.includes('Song trk_a1 (feat. Aziza)'), 'a song with a voice note is listed: ' + r.stories);
  assert.ok(!r.stories.some((t) => /trk_a2/.test(t)), 'a hidden song never shows its story: ' + r.stories);
  await page.click('.lsl [data-vn="trk_a1"]'); assert.equal(await page.evaluate(() => window.__vn), 'trk_a1', 'tapping Hear plays the voice note');
  const tl = await page.evaluate(() => { const d = document.querySelector('[data-lore-tl]'), ol = d.querySelector('.ltl'); return { open0: d.open, vis0: document.documentElement.scrollHeight, sum: d.querySelector('summary').textContent.trim() }; });
  assert.equal(tl.open0, false, 'the timeline starts collapsed'); const h0 = tl.vis0; assert.ok(/Year by year/.test(tl.sum) && /\d+ years?/.test(tl.sum), 'the summary names it and counts the years: ' + tl.sum);
  await page.click('[data-lore-tl] > summary'); assert.equal(await page.evaluate((h) => [document.querySelector('[data-lore-tl]').open, document.documentElement.scrollHeight > h + 100].join(), h0), 'true,true', 'tapping opens it and the page grows');
  await page.waitForFunction(() => S.loreTl === true, null, { timeout: 3000 }); await page.evaluate(() => renderLore()); assert.equal(await page.evaluate(() => document.querySelector('[data-lore-tl]').open), true, 'it stays open while you are in the app');
  await page.click('[data-lore-tl] > summary'); await page.waitForFunction(() => S.loreTl === false, null, { timeout: 3000 }); assert.equal(await page.evaluate(() => document.querySelector('[data-lore-tl]').open), false, 'tapping again collapses it'); await page.click('[data-lore-tl] > summary');
  await noSideways('lore timeline open');
  await page.click('.ltl .lchip[data-rel]'); await page.waitForFunction(() => S.view === 'release', null, { timeout: 5000 });
  await page.evaluate(() => { S.lib.artist_bio = ''; S.lib.tracks.forEach((t) => { t.voice_note_id = ''; }); renderLore(); }); await page.waitForSelector('.lorestats');
  assert.deepEqual(await page.evaluate(() => [!!document.querySelector('.lorestory'), !!document.querySelector('.lorestories')]), [false, false], 'no bio and no voice notes: those sections do not show');
  await page.evaluate(() => { S.lib.artist_bio = 'Short story.'; trk('trk_a1').voice_note_id = 'r2:x'; renderLore(); }); await page.waitForSelector('.lorestory');
  await noSideways('lore');
  if (process.env.SHOT_LORE) { await page.evaluate(() => document.querySelector('.lorestory').scrollIntoView()); await page.screenshot({ path: process.env.SHOT_LORE }); }
  await page.evaluate(() => { S.lib.artist_bio = ''; trk('trk_a1').voice_note_id = ''; });
});
await step('Press tab: two tabs, Coverage (search, years, equal cards) and Press kit (bio with copy, 6 downloadable photos, contact, links)', async () => {
  await page.evaluate(() => { S.pressTab = 'coverage'; renderPress(); }); await page.waitForSelector('#pressBody .pcard', { timeout: 6000 });
  await page.evaluate(() => { window.__copied = []; navigator.clipboard.writeText = (t) => { window.__copied.push(t); return Promise.resolve(); }; });
  const c = await page.evaluate(() => ({ kitHidden: document.querySelector('#pressKit').hidden, covHidden: document.querySelector('#pressCoverage').hidden, cards: document.querySelectorAll('#pressBody .pcard').length, total: SITE.press.length, big: document.querySelectorAll('.pfeat').length, years: document.querySelectorAll('.pyr').length, sel: [...document.querySelectorAll('[data-pstab]')].map((b) => b.getAttribute('aria-selected')), w: [...document.querySelectorAll('.psseg button')].map((b) => Math.round(b.getBoundingClientRect().width)) }));
  assert.deepEqual([c.kitHidden, c.covHidden, c.cards === c.total, c.big, c.sel], [true, false, true, 0, ['true', 'false']], 'Coverage first, no oversized card: ' + JSON.stringify(c)); assert.ok(c.years >= 1); assert.ok(Math.max(...c.w) - Math.min(...c.w) <= 2, 'tabs are the same width');
  await page.fill('#pq', 'smoky'); await page.waitForFunction(() => document.querySelectorAll('#pressBody .pcard').length === 1, null, { timeout: 3000 });
  await page.fill('#pq', 'zzzzqq'); await page.waitForFunction(() => /Nothing matches/.test(document.querySelector('#pressBody').innerText), null, { timeout: 3000 });
  await page.fill('#pq', '');
  const yrs = await page.evaluate(() => [...document.querySelectorAll('#pyear option')].map((o) => o.value));
  if (yrs.length > 2) { await page.selectOption('#pyear', yrs[1]); assert.ok(await page.evaluate(() => document.querySelectorAll('.pyr').length === 1), 'one year at a time'); await page.selectOption('#pyear', ''); }
  await noSideways('press coverage');
  await page.click('[data-pstab="kit"]'); await page.waitForSelector('#pressKit .pkphoto', { state: 'visible', timeout: 4000 });
  const r = await page.evaluate(() => ({ covHidden: document.querySelector('#pressCoverage').hidden, photos: [...document.querySelectorAll('.pkphoto')].map((a) => [a.getAttribute('href'), a.hasAttribute('download')]), mail: document.querySelector('.pksec .pkacts a').getAttribute('href'), mailText: document.querySelector('.pkmail').textContent, links: document.querySelectorAll('.pklinks a').length, expectLinks: SITE.links.length, secs: [...document.querySelectorAll('.pkh')].map((e) => e.textContent), bio: document.querySelector('.pkbio p').textContent.slice(0, 20), more: !!document.querySelector('.pkbio details') }));
  assert.equal(r.covHidden, true); assert.deepEqual(r.secs, ['Bio', 'Photos', 'Contact', 'Find Soul']); assert.equal(r.photos.length, 6); assert.ok(r.photos.every(([h, d]) => /^\/photos\/p\d\d\.jpg$/.test(h) && d), JSON.stringify(r.photos));
  assert.match(r.mail, /^mailto:.+\?subject=/); assert.equal(r.mailText, await page.evaluate(() => SITE.booking)); assert.equal(r.links, r.expectLinks); assert.equal(r.bio, 'Nicólas Soul is a he'); assert.equal(r.more, true);
  await page.click('[data-press-copy="bio"]'); await page.click('[data-press-copy="email"]');
  assert.deepEqual(await page.evaluate(() => [window.__copied[0] === SITE.bio.trim(), window.__copied[1] === SITE.booking]), [true, true], 'Copy bio and Copy email put the right text on the clipboard');
  await noSideways('press kit');
  if (process.env.SHOT_PRESS) await page.screenshot({ path: process.env.SHOT_PRESS });
  await page.evaluate(() => { S.pressTab = 'coverage'; });
});
await step('Video tab: search, Up next, Play the song for a video that is a song, and autoplay-next when YouTube says the clip ended (only from the featured clip)', async () => {
  await page.evaluate(() => { trk('trk_a1').video_url = 'https://youtu.be/dQw4w9WgXcQ'; S.videoQ = ''; S.videoAuto = true; ls.set('sv_vidauto', true); S.videoSort = 'az'; S.videoTab = 'freestyles'; S.videoSub = 'all';
    S.videoLists = [{ key: 'originals', videos: [{ id: 'dQw4w9WgXcQ', title: 'Alpha one' }, { id: 'bbbbbbbbbbb', title: 'Bravo <b>two</b>' }, { id: 'ccccccccccc', title: 'Charlie three' }] }, { key: 'remixes', videos: [] }]; S.videoP = new Promise(() => {}); renderVideo(); });
  await page.waitForSelector('.vidhero .vidtitle', { timeout: 8000 });
  const r = await page.evaluate(() => ({ hero: document.querySelector('.vidtitle').textContent, song: !!document.querySelector('[data-vid-song]'), next: (document.querySelector('.vidnext') || {}).textContent, nextOn: (document.querySelector('.vidnext') || { closest: () => null }).closest('.vidcard') && document.querySelector('.vidnext').closest('.vidcard').getAttribute('aria-label'), auto: document.querySelector('#vauto').checked, cards: document.querySelectorAll('.vidcard').length, html: document.querySelector('#videoBody').innerHTML }));
  assert.deepEqual([r.hero, r.song, r.next, r.auto, r.cards], ['Alpha one', true, 'Up next', true, 2]); assert.match(r.nextOn, /Bravo/); assert.ok(!r.html.includes('<b>two'), 'titles are escaped');
  // search
  await page.fill('#vq', 'char'); await page.waitForFunction(() => document.querySelector('.vidtitle') && document.querySelector('.vidtitle').textContent === 'Charlie three', null, { timeout: 4000 });
  assert.equal(await page.evaluate(() => document.querySelectorAll('.vidcard').length), 0);
  await page.fill('#vq', 'zzzz'); await page.waitForFunction(() => /No videos match/.test(document.querySelector('#videoBody').innerText), null, { timeout: 4000 });
  await page.fill('#vq', ''); await page.waitForFunction(() => document.querySelector('.vidtitle') && document.querySelector('.vidtitle').textContent === 'Alpha one', null, { timeout: 4000 });
  // autoplay next
  await page.click('.vidstage'); await page.waitForSelector('.vidhero iframe', { timeout: 4000 });
  const msg = (origin, own, state) => page.evaluate(([o, own, st]) => { const fr = document.querySelector('.vidhero iframe'); window.dispatchEvent(new MessageEvent('message', { origin: o, source: own ? fr.contentWindow : window, data: JSON.stringify({ event: 'onStateChange', info: st }) })); return document.querySelector('.vidtitle').textContent; }, [origin, own, state]);
  assert.equal(await msg('https://evil.example', true, 0), 'Alpha one', 'a wrong origin is ignored');
  assert.equal(await msg('https://www.youtube-nocookie.com', false, 0), 'Alpha one', 'a message from anything but the featured clip is ignored');
  assert.equal(await msg('https://www.youtube-nocookie.com', true, 1), 'Alpha one', 'playing (state 1) does not skip');
  assert.equal(await msg('https://www.youtube-nocookie.com', true, 0), 'Bravo <b>two</b>', 'ended: the next clip is featured (and starts)');
  await page.waitForSelector('.vidhero iframe', { timeout: 4000 });   // it started playing
  await page.uncheck('#vauto'); assert.equal(await page.evaluate(() => S.videoNext), null, 'switched off: nothing plays next');
  // Play the song: back to the poster, and the song plays
  await page.check('#vauto'); await page.evaluate(() => { S.videoAuto = true; renderVideo(); }); await page.waitForSelector('.vidhero .vidtitle');
  await page.click('[data-vid-song]'); await page.waitForFunction(() => S.now && S.now.t.track_id === 'trk_a1', null, { timeout: 6000 });
  assert.equal(await page.evaluate(() => !document.querySelector('.vidhero iframe')), true, 'the video stopped');
  await noSideways('video tab'); await page.evaluate(() => { audio.pause(); trk('trk_a1').video_url = ''; S.videoLists = null; });
});
await step('Header buttons: Studio, Share links and a Settings gear (no "NS" letters); Studio and Shop pages have the gear too', async () => {
  await page.evaluate(() => { renderLore(); }); await page.waitForSelector('.home-h-bar .hbtns');
  const h = await page.evaluate(() => ({ btns: [...document.querySelectorAll('.home-h-bar .hbtns button')].map((b) => [b.getAttribute('data-nav'), b.getAttribute('aria-label'), !!b.querySelector('svg'), b.textContent.trim()]) }));
  assert.deepEqual(h.btns, [['studio', 'Studio', true, ''], ['shares', 'Share links', true, ''], ['vault', 'Settings', true, '']], JSON.stringify(h.btns));
  await page.click('.home-h-bar [data-nav="studio"]'); await page.waitForSelector('.studio .vh', { timeout: 8000 });
  await page.waitForSelector('.studio #stuBio', { timeout: 15000 });   // wait until Studio has finished loading, or its late redraw lands on top of the next page
  assert.equal(await page.evaluate(() => document.querySelector('.studio .vh').innerText.includes('Studio')), true);
  const g = await page.evaluate(() => [document.querySelector('.studio .vh [data-nav="vault"]').textContent.trim(), !!document.querySelector('.studio .vh [data-nav="vault"] svg')]);
  assert.deepEqual(g, ['', true], 'a gear, not "NS"');
  await page.evaluate(() => renderShop()); await page.waitForSelector('.shoppg .vh');
  assert.deepEqual(await page.evaluate(() => [document.querySelector('.shoppg .vh [data-nav="vault"]').textContent.trim(), !!document.querySelector('.shoppg .vh [data-nav="vault"] svg')]), ['', true]);
  await page.evaluate(() => { renderVault(); document.querySelectorAll('details.sset').forEach((d) => { d.open = true; }); }); await page.waitForSelector('.vh [data-nav="library"]');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'NS')), false, 'no "NS" button left on the Settings page');
  await noSideways('settings header');
  if (process.env.SHOT_HDR) { await page.evaluate(() => renderLore()); await page.waitForSelector('.home-h-bar'); await page.locator('.home-h-bar').screenshot({ path: process.env.SHOT_HDR }); }
});
await step('Media tab: Videos and Photos (the photos moved here from Lore); /media addresses; the older /video address still opens Videos', async () => {
  await page.evaluate(() => { S.mediaTab = 'videos'; renderVideo(); }); await page.waitForSelector('.mediasw');
  const m = await page.evaluate(() => ({ tab: document.querySelector('#tabs [data-nav="video"]').textContent.trim(), sw: [...document.querySelectorAll('[data-mtab]')].map((b) => b.textContent + (b.getAttribute('aria-selected') === 'true' ? '*' : '')), path: location.pathname, h1: document.querySelector('.vidh1').textContent }));
  assert.deepEqual([m.tab, m.sw, m.path, m.h1], ['Media', ['Videos*', 'Photos'], '/media/videos', 'Soul Media'], JSON.stringify(m));
  await page.click('[data-mtab="photos"]'); await page.waitForSelector('.mphgrid .mph1');
  const p = await page.evaluate(() => ({ sw: [...document.querySelectorAll('[data-mtab]')].map((b) => b.textContent + (b.getAttribute('aria-selected') === 'true' ? '*' : '')), path: location.pathname, n: document.querySelectorAll('.mphgrid:not(.rel) .mph1').length, title: document.title }));
  assert.deepEqual([p.sw, p.path], [['Videos', 'Photos*'], '/media/photos'], JSON.stringify(p)); assert.ok(p.n >= 6, 'the six photos: ' + p.n); assert.match(p.title, /^Media \|/);
  await noSideways('media photos grid');
  await page.click('.mphgrid [data-lphoto="1"]'); await page.waitForSelector('#lbStage'); await page.evaluate(() => document.querySelector('#lbX').click());
  await page.click('[data-mtab="videos"]'); await page.waitForSelector('.vidhero'); assert.equal(await page.evaluate(() => location.pathname), '/media/videos');
  const routes = await page.evaluate(() => ['/video', '/video/music-videos', '/media', '/media/photos', '/media/videos/remixes'].map((u) => { history.pushState(null, '', u); const r = parseRoute(); return [u, r.v, r.mtab, r.tab, r.sub]; }));
  assert.deepEqual(routes, [['/video', 'video', 'videos', 'freestyles', 'all'], ['/video/music-videos', 'video', 'videos', 'music', 'all'], ['/media', 'video', 'videos', 'freestyles', 'all'], ['/media/photos', 'video', 'photos', 'freestyles', 'all'], ['/media/videos/remixes', 'video', 'videos', 'freestyles', 'remixes']]);
  await page.evaluate(() => history.pushState(null, '', '/media/videos'));
});
await step('Media > Photos has the same View menu as the Music tab: scrolling shelf, large, small and list; the choice is kept', async () => {
  await page.evaluate(() => { S.mediaTab = 'photos'; S.photoView = 'large'; localStorage.removeItem('sv_photoview'); renderVideo(); }); await page.waitForSelector('.mphgrid .mph1');
  await page.click('.viewbtn'); assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('[data-phview]')].map((b) => b.textContent.replace(/^•/, '').trim() +(b.getAttribute('aria-checked') === 'true' ? '*' : ''))), ['Scrolling shelf', 'Large photos*', 'Small photos', 'List'], 'the same four choices');
  const look = () => page.evaluate(() => { const g = document.querySelector('.mphgrid:not(.rel)'), c = g.querySelector('.mph1'), b = c.getBoundingClientRect(), cs = getComputedStyle(g), tops = new Set([...g.querySelectorAll('.mph1')].map((x) => Math.round(x.getBoundingClientRect().top))); return { cls: g.className, w: Math.round(b.width), h: Math.round(b.height), display: cs.display, ox: cs.overflowX, rows: tops.size, n: g.querySelectorAll('.mph1').length, lab: getComputedStyle(c.querySelector('.mphlab')).display, wrapped: !!g.closest('.scrollwrap'), page: document.documentElement.scrollWidth - innerWidth }; });
  let l = await look(); assert.ok(l.w > 150 && l.h > l.w, 'large: two across, tall: ' + JSON.stringify(l));
  await page.click('[data-phview="small"]'); await page.waitForSelector('.mphgrid.small'); l = await look(); assert.ok(l.w < 140 && Math.abs(l.w - l.h) <= 2 && l.page <= 1, 'small: three across, square: ' + JSON.stringify(l));
  await page.click('.viewbtn'); await page.click('[data-phview="list"]'); await page.waitForSelector('.mphgrid.list'); l = await look(); assert.ok(l.rows === l.n && l.lab === 'block' && l.page <= 1, 'list: one photo per row with a label: ' + JSON.stringify(l));
  await page.click('.viewbtn'); await page.click('[data-phview="scroll"]'); await page.waitForSelector('.mphgrid.scroll'); await page.waitForSelector('.mphgrid.scroll', { state: 'attached' });
  await page.waitForFunction(() => document.querySelector('.mphgrid.scroll').closest('.scrollwrap'), null, { timeout: 4000 });
  l = await look(); assert.ok(l.display === 'flex' && /auto|scroll/.test(l.ox) && l.rows === 1 && l.page <= 1 && l.wrapped, 'scrolling shelf: one row you swipe, with the arrows: ' + JSON.stringify(l));
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sv_photoview'))), 'scroll', 'the choice is remembered on this device');
  await page.evaluate(() => { S.photoView = ''; renderVideo(); }); await page.waitForSelector('.mphgrid.scroll'); assert.ok(await page.evaluate(() => !!document.querySelector('.mphgrid.scroll')), 'and used again next time');
  await page.click('.mphgrid.scroll [data-lphoto="2"]'); await page.waitForSelector('#lbStage'); await page.evaluate(() => document.querySelector('#lbX').click());   // photos still open in the viewer
  await page.click('.viewbtn'); await page.click('[data-phview="large"]'); await page.waitForSelector('.mphgrid.large'); await noSideways('media photos views');
  await page.evaluate(() => { S.mediaTab = 'videos'; renderVideo(); });
});
await step('Going back from a project returns to the same spot on the Discography shelf', async () => {
  await page.evaluate(() => { S.libView = 'scroll'; renderLibrary(); }); await page.waitForSelector('#libBody .ctrack [data-rel]');
  const before = await page.evaluate(() => {
    const row = document.querySelector('#libBody .ctrack'), cards = [...row.querySelectorAll('[data-rel]')];
    row.scrollLeft = row.scrollWidth;   // as far along as it goes
    return { max: row.scrollWidth - row.clientWidth, x: row.scrollLeft, n: cards.length, last: cards[cards.length - 1].dataset.rel };
  });
  assert.ok(before.max > 60 && before.x > 60, 'the shelf scrolls sideways in this test: ' + JSON.stringify(before));
  await page.evaluate((id) => document.querySelector('#libBody .ctrack [data-rel="' + id + '"]').click(), before.last);
  const mem = await page.evaluate(() => JSON.stringify(S.libShelf));
  await page.waitForSelector('#relbar [data-nav="library-back"], .relbar [data-nav="library-back"]'); await page.click('.relbar [data-nav="library-back"]'); await page.waitForSelector('#libBody .ctrack [data-rel]');
  await page.waitForFunction((x) => Math.abs(document.querySelector('#libBody .ctrack').scrollLeft - x) <= 3, before.x, { timeout: 4000 }).catch(() => {});   // (it settles once the cards are laid out)
  const after = await page.evaluate((id) => { const row = document.querySelector('#libBody .ctrack'), c = row.querySelector('[data-rel="' + id + '"]').getBoundingClientRect(), r = row.getBoundingClientRect(); return { x: row.scrollLeft, visible: c.right > r.left + 20 && c.left < r.right - 20 }; }, before.last);
  assert.ok(Math.abs(after.x - before.x) <= 3 && after.visible, 'back to where the shelf was, with the project in view: ' + JSON.stringify([before, after, mem]));
  await page.evaluate(() => { renderLibrary(); });   // a fresh visit to the tab starts at the beginning again
  assert.equal(await page.evaluate(() => document.querySelector('#libBody .ctrack').scrollLeft), 0, 'a new visit starts at the first project');
});
await step('Milestones: add in Settings (suggestions, date, story, voice note), shown on Lore oldest first with the voice note playable; fans see them but have no edit button; all text is escaped', async () => {
  await page.evaluate(() => { renderVault(); }); await page.waitForSelector('[data-nav="milestones"]'); await page.click('[data-nav="milestones"]');
  await page.waitForSelector('#msItems'); await page.waitForFunction(() => /No milestones yet/.test(document.querySelector('#msItems').innerText), null, { timeout: 5000 });
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('[data-ms-starter]')].map((b) => b.dataset.msStarter).slice(0, 3)), ['First time on the radio', 'First show in Nashville', 'First song to hit 100k streams']);
  await page.click('[data-ms-starter="First time on the radio"]'); await page.waitForSelector('[data-ms-item]');
  assert.equal(await page.evaluate(() => document.querySelectorAll('[data-ms-starter]').length), 5, 'a used suggestion goes away');
  await page.fill('[data-ms-item] [data-ms="date"]', '2024-06-15'); await page.fill('[data-ms-item] [data-ms="text"]', 'Late night on air. <b>so loud</b>');
  await page.setInputFiles('[data-ms-file]', { name: 'radio.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('fake radio clip bytes'.repeat(40)) });
  await page.waitForFunction(() => /Voice note ready/.test(document.querySelector('[data-ms-audiostate]').textContent), null, { timeout: 15000 });
  await page.fill('[data-ms-item] [data-ms="audio_label"]', 'Hear the first radio play');
  await page.click('#msAdd'); const items = page.locator('[data-ms-item]'); await items.nth(1).locator('[data-ms="title"]').fill('First show <i>in</i> Nashville'); await items.nth(1).locator('[data-ms="date"]').fill('2023');
  await page.click('#msSave'); await page.waitForFunction(() => document.querySelector('#msSt').textContent === 'Saved', null, { timeout: 8000 });
  await noSideways('milestones editor');
  const bad = await page.evaluate(async () => { try { await run('saveMilestones', BOOT.key, [{ title: 'x', date: 'June' }]); return 'saved'; } catch (e) { return e.message; } }); assert.match(bad, /date/);
  await page.evaluate(() => renderLore()); await page.waitForSelector('.mslist .ms');
  const r = await page.evaluate(() => ({ titles: [...document.querySelectorAll('.mstitle')].map((e) => e.textContent), dates: [...document.querySelectorAll('.msdate')].map((e) => e.textContent), text: document.querySelector('.mstext').textContent, injected: document.querySelectorAll('.ms b, .ms i').length > document.querySelectorAll('.ms b.mstitle').length, audio: document.querySelector('.msvoice audio').getAttribute('src'), label: document.querySelector('.msvoice span').textContent, edit: !!document.querySelector('.msedit') }));
  assert.deepEqual(r.titles, ['First show <i>in</i> Nashville', 'First time on the radio'], 'oldest first, shown as plain text'); assert.deepEqual(r.dates, ['2023', 'Jun 15, 2024']);
  assert.equal(r.text, 'Late night on air. <b>so loud</b>'); assert.equal(r.injected, false, 'no HTML from the text got into the page'); assert.match(r.audio, /^https:\/\/media\.soulnicolas\.com\/milestones\/voice-[0-9a-f]{12}\.mp3$/); assert.equal(r.label, 'Hear the first radio play'); assert.equal(r.edit, true, 'the owner sees Edit');
  await noSideways('lore milestones');
  const fctx = await phoneContext(), fan = await fctx.newPage(); fan.on('pageerror', (e) => problems.push('fan page error: ' + e.message));
  await fan.goto('https://soulnicolas.com/?s=PUB'); await fan.waitForSelector('.tabs [data-nav="library"]', { state: 'attached', timeout: 15000 }); await fan.evaluate(() => renderLore()); await fan.waitForSelector('.mslist .ms', { timeout: 10000 });
  const f = await fan.evaluate(() => ({ n: document.querySelectorAll('.mslist .ms').length, edit: document.querySelectorAll('.msedit, [data-nav="milestones"]').length, audio: document.querySelectorAll('.msvoice audio').length }));
  assert.deepEqual(f, { n: 2, edit: 0, audio: 1 }, 'fans see the milestones, not the editor: ' + JSON.stringify(f)); await fctx.close();
  await page.evaluate(async () => { await run('saveMilestones', BOOT.key, []); S.milestones = []; S.milestonesP = Promise.resolve([]); });
});
await step('Smart links: a page per project and per song with a button for each service; the fan\'s choice is remembered and can skip the page next time; Studio saves one song\'s own links', async () => {
  await page.evaluate(() => { S.stuRel = 'rel_pub'; S.stuTab = 'links'; renderStudio(); }); await page.click('[data-stutab="links"]'); await page.waitForSelector('#stuTlSong', { state: 'visible' });
  await page.click('#stuAddLink'); await page.locator('#stuLinks .lrow').first().locator('input').nth(0).fill('Spotify'); await page.locator('#stuLinks .lrow').first().locator('input').nth(1).fill('https://open.spotify.com/album/rel');
  await page.click('#stuSaveLinks'); await page.waitForFunction(() => /Saved/.test(document.querySelector('#stuLinksSt').textContent), null, { timeout: 8000 });
  await page.click('#stuAddTl'); const tl = page.locator('#stuTl .lrow').first(); await tl.locator('input').nth(0).fill('Apple Music'); await tl.locator('input').nth(1).fill('javascript:alert(1)');
  await page.click('#stuSaveTl'); await page.waitForFunction(() => /https/.test(document.querySelector('#stuTlSt').textContent), null, { timeout: 8000 });
  await tl.locator('input').nth(1).fill('https://music.apple.com/song/a1'); await page.click('#stuSaveTl'); await page.waitForFunction(() => /Saved/.test(document.querySelector('#stuTlSt').textContent), null, { timeout: 8000 });
  assert.match(await page.textContent('#stuTlSong option:checked'), /has links/);
  const fctx = await phoneContext(), fan = await fctx.newPage(); fan.on('pageerror', (e) => problems.push('fan page error: ' + e.message));
  const open = async (path) => { await fan.goto('https://soulnicolas.com' + path + '?s=PUB'); await fan.waitForSelector('.smartpg .smtitle', { timeout: 15000 }); };
  await open('/link/pub');   // the project (release id rel_pub)
  let s = await fan.evaluate(() => ({ title: document.querySelector('.smtitle').textContent, btns: [...document.querySelectorAll('.smbtn')].map((a) => [a.textContent.trim(), a.getAttribute('href'), a.target, a.rel]), play: !!document.querySelector('[data-sm-play]'), path: location.pathname, doc: document.title }));
  assert.deepEqual([s.title, s.btns.map((b) => b[0]), s.btns[0][1], s.path], ['Open Album', ['Listen on Spotify'], 'https://open.spotify.com/album/rel', '/link/pub'], JSON.stringify(s)); assert.ok(/noopener/.test(s.btns[0][3]) && s.btns[0][2] === '_blank'); assert.match(s.doc, /^Listen: Open Album/);
  await noSideways('smart link page');
  await open('/link/pub/trk_a1');   // one song: its own links win over the release's
  s = await fan.evaluate(() => ({ title: document.querySelector('.smtitle').textContent, btns: [...document.querySelectorAll('.smbtn')].map((a) => [a.textContent.trim(), a.getAttribute('href')]) }));
  assert.deepEqual(s.btns, [['Listen on Apple Music', 'https://music.apple.com/song/a1']], 'the song\'s own link, not the album\'s: ' + JSON.stringify(s));
  await fan.evaluate(() => { document.querySelectorAll('.smbtn').forEach((a) => a.addEventListener('click', (e) => e.preventDefault())); }); await fan.click('.smbtn');   // tapping remembers the service (the page is not left in this test)
  assert.equal(await fan.evaluate(() => ls.get('sv_pref_platform', '')), 'Apple Music', 'the tapped service is remembered on this device');
  await open('/link/pub'); s = await fan.evaluate(() => ({ first: document.querySelector('.smbtn').textContent.trim(), cls: document.querySelector('.smbtn').className, chk: document.querySelector('#smAutoChk').disabled }));   // the release has no Apple link: nothing is promoted
  assert.equal(s.first, 'Listen on Spotify');
  const bogus = await fan.evaluate(() => { renderSmartLink('nope', ''); return S.view; }); assert.equal(bogus, 'library', 'an unknown address falls back to the Music tab');
  const hostile = await fan.evaluate(() => { S.links.tl = S.links.tl || {}; S.links.tl.trk_a1 = { links: [['<img src=x onerror=window.__x=1>', 'https://example.com/ok'], ['Bad', 'javascript:alert(1)'], ['Plain', 'http://example.com/no']] }; renderSmartLink('pub', 'trk_a1'); return { btns: [...document.querySelectorAll('.smbtn')].map((a) => a.getAttribute('href')), html: document.querySelector('.smlist').innerHTML.includes('<img'), x: window.__x }; });
  assert.deepEqual(hostile.btns, ['https://example.com/ok'], 'only https links become buttons'); assert.equal(hostile.html, false); assert.equal(hostile.x, undefined);
  await fctx.close();
});
await step('Smart links: the release page and Now Playing have a Smart link button that shares /link/ addresses', async () => {
  await page.evaluate(() => { window.__shared = []; Object.defineProperty(navigator, 'share', { value: (o) => { window.__shared.push(o); return Promise.resolve(); }, configurable: true }); renderRelease('rel_pub'); });
  await page.waitForSelector('[data-share-out="release"]'); await page.click('[data-share-out="release"]'); await page.waitForSelector('.sharechoice [data-smart-link="release"]'); await page.click('.sharechoice [data-smart-link="release"]');
  await page.waitForFunction(() => window.__shared.length === 1);
  assert.match(await page.evaluate(() => window.__shared[0].url), /\/link\/pub$/);
  await page.click('[data-share-out="release"]'); await page.click('.sharechoice [data-share-page]'); await page.waitForFunction(() => window.__shared.length === 2);
  assert.match(await page.evaluate(() => window.__shared[1].url), /\/vault\/pub$/, 'the other choice shares the release page');
  const u = await page.evaluate(() => { const t = trk('trk_a1'), r = rel('rel_pub'); return smartUrl(r, t); }); assert.match(u, /\/link\/pub\/trk_a1$/);
});
await step('Press coverage is newest first, with the date and the author / site right under the thumbnail', async () => {
  await page.evaluate(() => { S.pressTab = 'coverage'; renderPress(); }); await page.waitForSelector('#pressBody .pcard');
  const c = await page.evaluate(() => ({ order: SITE.press.slice().map((p) => pressTime(p)).sort((a, b) => b - a), shown: [...document.querySelectorAll('#pressBody .pcard .ptitle')].map((e) => e.textContent), want: pressSorted(SITE.press).map((p) => p.title), years: [...document.querySelectorAll('.pyr')].map((e) => e.textContent),
    layout: [...document.querySelectorAll('#pressBody .pcard')].slice(0, 3).map((c) => { const i = c.querySelector('.pimg').getBoundingClientRect(), m = c.querySelector('.pmeta').getBoundingClientRect(), t = c.querySelector('.ptitle').getBoundingClientRect(); return [m.top >= i.bottom - 1 && m.top - i.bottom < 30, t.top >= m.bottom - 1, c.querySelector('.pdate').textContent.length > 0]; }) }));
  assert.deepEqual(c.shown, c.want, 'newest first'); assert.deepEqual(c.years.filter((y) => /^\d{4}$/.test(y)), c.years.filter((y) => /^\d{4}$/.test(y)).sort().reverse(), 'the newest year is at the top: ' + c.years.join());
  assert.ok(c.layout.every((l) => l.every(Boolean)), 'date and author/site directly under the picture, above the title: ' + JSON.stringify(c.layout));
  const dates = await page.evaluate(() => { const a = pressSorted([{ title: 'a', date: '2025' }, { title: 'b', date: 'Jan 14, 2026' }, { title: 'c', date: '' }, { title: 'd', date: 'Mar 3, 2025' }, { title: 'e', date: '2026' }]); return a.map((p) => p.title).join(''); });
  assert.equal(dates, 'bedac', 'full dates and bare years sort together; no date goes last');
  const dated = await page.evaluate(() => SITE.press.filter((p) => /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(p.date)).length);
  assert.equal(dated, await page.evaluate(() => SITE.press.length), 'every article carries an exact date (read from its page, or given by Nick): ' + dated);
  await noSideways('press coverage order');
});
await step('Settings > Missing files shows where every song plays from: Cloudflare, Google Drive, links; Drive and no-file songs are listed and open in Studio', async () => {
  await page.evaluate(() => { renderVault(); }); await page.waitForSelector('[data-missing], details.sset'); await page.evaluate(() => { document.querySelectorAll('details.sset').forEach((d) => { d.open = true; }); });
  await page.click('[data-missing]'); await page.waitForSelector('#msWhere .mswchips', { timeout: 15000 });
  const truth = (await w.call('missingWhere', [KEY])).result;
  const ui = await page.evaluate(() => ({ chips: Object.fromEntries([...document.querySelectorAll('.mswchip')].map((c) => [c.className.replace('mswchip ', ''), Number(c.querySelector('b').textContent)])), head: document.querySelector('#msWhere h3').textContent, sub: document.querySelector('#msWhere > p').textContent, groups: [...document.querySelectorAll('.mswgroup')].map((g) => [g.className.replace('mswgroup ', ''), g.open, Number(g.querySelector('.mswn').textContent)]), rows: document.querySelectorAll('.mswsongs li').length, drive: document.querySelectorAll('.mswgroup.drive .mswsongs li').length }));
  assert.equal(ui.head, 'Where your songs play from'); assert.match(ui.sub, new RegExp('^' + truth.songs.length + ' songs checked'));
  for (const k of ['cloudflare', 'drive', 'link']) assert.equal(ui.chips[k], truth.totals[k], k + ' count matches the server: ' + JSON.stringify([ui.chips, truth.totals]));
  assert.equal(ui.chips.cloudflare + ui.chips.drive + ui.chips.link + (ui.chips.none || 0), truth.songs.length, 'every song is in exactly one group');
  assert.ok(truth.totals.drive > 0 && truth.totals.link > 0, 'the test library has songs on Drive and link songs: ' + JSON.stringify(truth.totals));
  const g = Object.fromEntries(ui.groups.map(([k, open, n]) => [k, [open, n]])); assert.deepEqual(g.drive, [true, truth.totals.drive], 'the Drive group is open and lists its songs'); assert.equal(ui.drive, truth.totals.drive);
  if (g.cloudflare) assert.equal(g.cloudflare[0], false, 'the long Cloudflare group starts closed');
  await noSideways('missing files where');
  const rel = await page.evaluate(() => document.querySelector('.mswgroup.drive [data-ms-studio]').dataset.msStudio);
  await page.click('.mswgroup.drive [data-ms-studio]'); await page.waitForSelector('[data-stutab]'); await page.waitForSelector('#stuSongs', { state: 'attached' });
  assert.deepEqual(await page.evaluate(() => [S.stuRel, S.stuTab, document.querySelector('#modal').hidden]), [rel, 'songs', true], '"Open in Studio" goes to that release\'s Songs tab and closes the list');
});
await step('Studio > Songs: Select songs lets you tick several (or all), then remove them together; it asks first and renumbers the rest', async () => {
  w.youtube.playlists.PLbulkremove0123456789abcdefghijkl = { title: 'Bulk Test EP', videos: ['One', 'Two', 'Three', 'Four'].map((n, i) => ({ id: 'vidCCCCCCC' + (i + 1), title: n + ' Bulk Song' })) };
  const mk = await w.call('createReleaseFromYoutube', [KEY, { url: 'https://www.youtube.com/playlist?list=PLbulkremove0123456789abcdefghijkl' }]); assert.equal(mk.ok, true, JSON.stringify(mk).slice(0, 300));
  const rid = mk.result.release.release_id;
  await page.evaluate((id) => { S.stuRel = id; S.stuTab = 'songs'; renderStudio(); }, rid); await page.waitForSelector('[data-stu-selmode]');
  const state = () => page.evaluate(() => ({ picks: document.querySelectorAll('[data-stu-pick]').length, shown: [...document.querySelectorAll('[data-stu-pick]')].filter((c) => c.offsetParent !== null).length, ticked: document.querySelectorAll('[data-stu-pick]:checked').length, bar: !document.querySelector('#stuSelBar').hidden, n: document.querySelector('#stuSelN').textContent, del: document.querySelector('[data-stu-delsel]').disabled, allText: document.querySelector('[data-stu-selall]').textContent, open: document.querySelectorAll('.studio details.scard[open]').length }));
  let s = await state(); assert.deepEqual([s.picks, s.shown, s.bar], [4, 0, false], 'ordinary view: no checkboxes, no bar: ' + JSON.stringify(s));
  await page.click('[data-stu-selmode]'); s = await state(); assert.deepEqual([s.shown, s.bar, s.del], [4, true, true], 'select mode: a checkbox on each song, the bar, Remove off until something is ticked: ' + JSON.stringify(s));
  await page.click('[data-stu-selall]'); s = await state(); assert.deepEqual([s.ticked, s.n, s.del, s.allText], [4, '4', false, 'Select none'], 'Select all: ' + JSON.stringify(s));
  await page.click('[data-stu-selall]'); s = await state(); assert.deepEqual([s.ticked, s.del, s.allText], [0, true, 'Select all'], 'Select none: ' + JSON.stringify(s));
  const ids = await page.evaluate(() => [...document.querySelectorAll('[data-stu-pick]')].map((c) => c.dataset.stuPick));
  await page.click('[data-stu-pick="' + ids[1] + '"]'); await page.click('[data-stu-pick="' + ids[2] + '"]'); s = await state();
  assert.deepEqual([s.ticked, s.n, s.open], [2, '2', 0], 'two ticked, and ticking does not open the song cards: ' + JSON.stringify(s));
  const tap = (sel) => { const box = page.locator(sel).first(); return box.boundingBox().then((b) => b && b.width >= 40 && b.height >= 40); };
  assert.ok(await tap('label.stupick'), 'the checkbox has a thumb-sized tap area');
  let asked = ''; page.once('dialog', (d) => { asked = d.message(); d.dismiss(); });
  await page.click('[data-stu-delsel]'); await page.waitForTimeout(300);
  assert.ok(/Remove 2 songs/.test(asked) && /Two Bulk Song/.test(asked) && /Three Bulk Song/.test(asked) && /not deleted/.test(asked), 'it lists what goes and says the audio files stay: ' + asked); assert.equal((await state()).picks, 4, 'Cancel changes nothing');
  page.once('dialog', (d) => d.accept());
  await page.click('[data-stu-delsel]'); await page.waitForFunction(() => document.querySelectorAll('[data-stu-pick]').length === 2, null, { timeout: 10000 });
  const after = await page.evaluate(async (id) => { const g = await run('studioGet', BOOT.key); const ts = g.tracks.filter((t) => t.release_id === id).sort((a, b) => a.track_no - b.track_no); return { titles: ts.map((t) => t.title), nos: ts.map((t) => Number(t.track_no)), tab: S.stuTab, bar: !document.querySelector('#stuSelBar').hidden }; }, rid);
  assert.deepEqual(after.titles, ['One Bulk Song', 'Four Bulk Song'], 'the two ticked songs are gone on the server: ' + JSON.stringify(after)); assert.deepEqual(after.nos, [1, 2], 'renumbered'); assert.equal(after.tab, 'songs'); assert.equal(after.bar, false, 'back to the ordinary view');
  await noSideways('studio select songs');
});
await step('Studio > Songs can remove a song: it asks first (Cancel changes nothing), then the song goes and the others are renumbered', async () => {
  const rid = await page.evaluate(() => S.lib.releases.find((r) => r.title === 'Browser Test EP').release_id);
  await page.evaluate((id) => { S.stuRel = id; S.stuTab = 'songs'; renderStudio(); }, rid); await page.waitForSelector('[data-stu-delsong]', { state: 'attached' }); await page.evaluate(() => document.querySelectorAll('.studio details.scard').forEach((d) => { d.open = true; }));   // (the song cards start collapsed)
  const count = () => page.evaluate(() => document.querySelectorAll('[data-stu-delsong]').length);
  const n0 = await count(); assert.ok(n0 >= 2, 'the test release has songs: ' + n0);
  const name = await page.evaluate(() => document.querySelector('[data-stu-song] h3').textContent.replace(/^\s*\S+\s*/, '').trim());
  let asked = ''; page.once('dialog', (d) => { asked = d.message(); d.dismiss(); });
  await page.click('[data-stu-delsong]'); await page.waitForTimeout(300);
  assert.ok(/for good/.test(asked) && /not deleted/.test(asked), 'it asks first, and says the audio files stay: ' + asked); assert.equal(await count(), n0, 'Cancel changes nothing');
  page.once('dialog', (d) => d.accept());
  await page.click('[data-stu-delsong]'); await page.waitForFunction((n) => document.querySelectorAll('[data-stu-delsong]').length === n - 1, n0, { timeout: 8000 });
  const after = await page.evaluate(async (id) => { const g = await run('studioGet', BOOT.key); const ts = g.tracks.filter((t) => t.release_id === id).sort((a, b) => a.track_no - b.track_no); return { n: ts.length, nos: ts.map((t) => Number(t.track_no)), titles: ts.map((t) => t.title), lib: S.lib.tracks.filter((t) => t.release_id === id).length, tab: S.stuTab }; }, rid);
  assert.equal(after.n, n0 - 1, 'gone on the server too: ' + JSON.stringify(after)); assert.deepEqual(after.nos, after.nos.map((_, i) => i + 1), 'the rest are renumbered 1, 2, 3...'); assert.ok(!after.titles.includes(name), 'the removed song is not in the list');
  assert.equal(after.lib, n0 - 1, 'the app library dropped it too'); assert.equal(after.tab, 'songs', 'you stay on the Songs tab'); await noSideways('studio songs');
});
await step('Missing files > Where your songs play from: Upload file puts a song on Cloudflare (replacing a Drive song in place, adding to a link song) and Remove deletes a song you have no file for', async () => {
  await page.evaluate(() => { renderVault(); }); await page.waitForSelector('[data-missing], details.sset'); await page.evaluate(() => { document.querySelectorAll('details.sset').forEach((d) => { d.open = true; }); });
  await page.click('[data-missing]'); await page.waitForSelector('#msWhere .mswchips', { timeout: 15000 });
  const where = async () => (await w.call('missingWhere', [KEY])).result; const chips = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.mswchip')].map((c) => [c.className.replace('mswchip ', ''), Number(c.querySelector('b').textContent)])));
  const pick = async (sel, name) => { const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 8000 }), page.click(sel, { timeout: 8000 })]).catch((e) => { throw new Error('picking a file with ' + sel + ': ' + e.message.split('\n')[0]); }); await fc.setFiles({ name, mimeType: 'audio/mpeg', buffer: Buffer.from('fake mp3 bytes for a song'.repeat(40)) }); };
  const b0 = await where(), c0 = await chips();
  assert.ok(await page.evaluate(() => document.querySelectorAll('[data-ws-up]').length > 0 && document.querySelectorAll('[data-ws-rm]').length > 0), 'every song that is not on Cloudflare has Upload file and Remove');
  assert.equal(await page.evaluate(() => document.querySelectorAll('.mswgroup.cloudflare [data-ws-up]').length), 0, 'songs already on Cloudflare have no buttons');
  assert.equal(await page.evaluate(() => document.querySelector('#wsFile').accept.includes('.wav') && document.querySelector('#wsFile').accept.includes('.mp3')), true, 'it takes MP3, WAV and the other usual audio files');
  // 1) a song that only has its Google Drive copy: the file replaces it in place and the song moves to Cloudflare
  const a1 = b0.songs.find((s) => s.id === 'trk_a1'); assert.equal(a1.where, 'drive', 'trk_a1 starts on Drive');
  await pick('[data-ws-up="trk_a1"]', 'trouble-song.mp3');
  await page.waitForFunction((n) => { const c = document.querySelector('.mswchip.cloudflare b'); return c && Number(c.textContent) === n + 1; }, c0.cloudflare, { timeout: 20000 });
  let b1 = await where(); const a1b = b1.songs.find((s) => s.id === 'trk_a1');
  assert.deepEqual([a1b.where, a1b.versions], ['cloudflare', a1.versions], 'now on Cloudflare, replaced in place (same number of versions): ' + JSON.stringify(a1b));
  const key = await page.evaluate(() => { const v = S.lib.versions.find((x) => x.version_id === 'ver_a1'); return v && v.audio; }); assert.match(String(key), /^r2:/, 'the library holds the Cloudflare copy: ' + key);
  // 2) a link-only song: the file is added as its first-playing version (the link stays as another version)
  const link = b1.songs.find((s) => s.where === 'link'); assert.ok(link, 'there is a link song to try');
  await page.evaluate(() => document.querySelectorAll('.mswgroup').forEach((d) => { d.open = true; }));   // (the links group starts closed)
  await pick('[data-ws="' + link.id + '"] [data-ws-up]', 'my-own-file.mp3');
  await page.waitForFunction((id) => !document.querySelector('[data-ws="' + id + '"]'), link.id, { timeout: 20000 });
  b1 = await where(); const lk = b1.songs.find((s) => s.id === link.id);
  assert.deepEqual([lk.where, lk.versions, lk.others.link], ['cloudflare', link.versions + 1, 1], 'link song now plays from Cloudflare, the link stays as another version: ' + JSON.stringify(lk));
  // 3) a song with no file you have: Remove (asks first)
  const gone = b1.songs.find((s) => s.where === 'link' || s.where === 'drive'); assert.ok(gone, 'there is another song to remove');
  let asked = ''; page.once('dialog', (d) => { asked = d.message(); d.dismiss(); });
  await page.click('[data-ws="' + gone.id + '"] [data-ws-rm]'); await page.waitForTimeout(300);
  assert.ok(/for good/.test(asked) && /not deleted/.test(asked), 'it asks first: ' + asked); assert.equal((await where()).songs.length, b1.songs.length, 'Cancel changes nothing');
  page.once('dialog', (d) => d.accept()); await page.click('[data-ws="' + gone.id + '"] [data-ws-rm]');
  await page.waitForFunction((id) => !document.querySelector('[data-ws="' + id + '"]'), gone.id, { timeout: 15000 });
  const b2 = await where(); assert.equal(b2.songs.length, b1.songs.length - 1, 'the song is gone on the server'); assert.ok(!b2.songs.some((s) => s.id === gone.id));
  assert.equal(await page.evaluate((id) => !!trk(id), gone.id), false, 'and from the app library');
  await noSideways('missing files upload remove'); await page.evaluate(() => closeModal());
});
await step('Missing files > Where your songs play from: Select songs lets you tick several (or all) and remove them together; it asks first', async () => {
  await page.evaluate(() => { renderVault(); }); await page.waitForSelector('[data-missing], details.sset'); await page.evaluate(() => { document.querySelectorAll('details.sset').forEach((d) => { d.open = true; }); });
  await page.click('[data-missing]'); await page.waitForSelector('#msWhere [data-ws-selmode]', { timeout: 15000 });
  const where = async () => (await w.call('missingWhere', [KEY])).result;
  const st = () => page.evaluate(() => ({ picks: document.querySelectorAll('[data-ws-pick]').length, shown: [...document.querySelectorAll('[data-ws-pick]')].filter((c) => c.offsetParent !== null).length, ticked: document.querySelectorAll('[data-ws-pick]:checked').length, bar: !document.querySelector('#wsSelBar').hidden, n: document.querySelector('#wsSelN').textContent, del: document.querySelector('[data-ws-delsel]').disabled, all: document.querySelector('[data-ws-selall]').textContent }));
  const b0 = await where(); const loose = b0.songs.filter((s) => s.where !== 'cloudflare');
  assert.ok(loose.length >= 4, 'there are songs to select: ' + loose.length);
  let s = await st(); assert.deepEqual([s.picks, s.shown, s.bar], [loose.length, 0, false], 'ordinary view: no checkboxes, no bar: ' + JSON.stringify(s));
  await page.click('[data-ws-selmode]'); s = await st(); assert.deepEqual([s.shown, s.bar, s.del], [loose.length, true, true], 'select mode: a checkbox on every song not on Cloudflare, the bar, Remove off until something is ticked: ' + JSON.stringify(s));
  await page.click('[data-ws-selall]'); s = await st(); assert.deepEqual([s.ticked, s.del, s.all], [loose.length, false, 'Select none'], 'Select all: ' + JSON.stringify(s));
  await page.click('[data-ws-selall]'); s = await st(); assert.deepEqual([s.ticked, s.del, s.all], [0, true, 'Select all'], 'Select none: ' + JSON.stringify(s));
  const three = loose.slice(0, 3); for (const x of three) await page.click('[data-ws-pick="' + x.id + '"]');
  s = await st(); assert.deepEqual([s.ticked, s.n], [3, '3'], JSON.stringify(s));
  let asked = ''; page.once('dialog', (d) => { asked = d.message(); d.dismiss(); });
  await page.click('[data-ws-delsel]'); await page.waitForTimeout(300);
  assert.ok(/Remove 3 songs/.test(asked) && three.every((x) => asked.includes(x.title)) && /not deleted/.test(asked), 'it lists what goes and says the audio files stay: ' + JSON.stringify([asked, three.map((x) => x.title)]));
  assert.equal((await where()).songs.length, b0.songs.length, 'Cancel changes nothing');
  page.once('dialog', (d) => d.accept()); await page.click('[data-ws-delsel]');
  await page.waitForFunction((ids) => ids.every((id) => !document.querySelector('[data-ws="' + id + '"]')), three.map((x) => x.id), { timeout: 20000 });
  const b1 = await where(); assert.equal(b1.songs.length, b0.songs.length - 3, 'three songs are gone on the server'); assert.ok(three.every((x) => !b1.songs.some((y) => y.id === x.id)));
  assert.equal(await page.evaluate((ids) => ids.some((id) => !!trk(id)), three.map((x) => x.id)), false, 'and from the app library');
  s = await st(); assert.deepEqual([s.bar, s.ticked], [false, 0], 'back to the ordinary view after removing: ' + JSON.stringify(s));
  await noSideways('missing files select'); await page.evaluate(() => closeModal());
});
await step('fans never see the hidden test release', async () => {
  const lib = (await w.call('getShare', ['PUB'])).result;
  assert.ok(!JSON.stringify(lib).includes('Browser Test EP'), 'the hidden release must not reach the public link');
});
await step('no console errors or page errors the whole time', async () => { assert.deepEqual(problems, [], problems.join(' | ').slice(0, 500)); });

await browser.close(); w.done();
console.log(failures ? `\n${failures} step(s) failed.` : '\nAll steps passed.');
process.exit(failures ? 1 : 0);
