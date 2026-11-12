// Guards for the app's layout in src/app (see build_app.js): the parts must join into one working page, nothing may be left out or
// included twice, every script part must be a complete piece of JavaScript, and no part may grow into a new giant file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const { assembleApp, listParts } = createRequire(import.meta.url)('../build_app.js');

const app = assembleApp('src/app');
const read = (p) => fs.readFileSync(path.join('src/app', p), 'utf8');
const lineCount = (p) => read(p).split('\n').length - 1;

test('the app joins into one page: the app script and styles are single blocks, no leftover include lines', () => {
  assert.equal((app.match(/<script id="sv-app">/g) || []).length, 1);
  assert.ok(!/@@include/.test(app), 'an @@include line was not replaced');
  assert.equal((app.match(/<style id="desk">/g) || []).length, 1);
  assert.equal(app.indexOf('<script id="sv-app">') < app.indexOf('</script>', app.indexOf('<script id="sv-app">')), true);
  assert.match(app, /window\.SV_BOOT = __SV_BOOT__;/);       // build.js replaces this exact text
});

test('the whole app script is valid JavaScript, and each part is a complete piece of it (no part starts or ends in the middle of something)', () => {
  const open = '<script id="sv-app">', a = app.indexOf(open), b = app.indexOf('</script>', a);
  assert.doesNotThrow(() => new vm.Script(app.slice(a + open.length, b), { filename: 'sv-app' }));
  for (const p of listParts('src/app').filter((x) => x.startsWith('js/'))) assert.doesNotThrow(() => new vm.Script(read(p), { filename: p }), `${p} is not a complete piece of JavaScript: move its start or end to a place between two functions`);
  for (const p of listParts('src/app').filter((x) => x.startsWith('css/'))) {
    const t = read(p); assert.equal((t.match(/{/g) || []).length, (t.match(/}/g) || []).length, `${p} has unbalanced braces`);
  }
});

test('the key functions are all still there, in the order the app relies on', () => {
  const code = app.slice(app.indexOf('<script id="sv-app">'));
  const at = (n) => { const i = code.search(new RegExp(`function ${n}\\b`)); assert.ok(i >= 0, `${n} is missing`); return i; };
  for (const n of ['init', 'renderChrome', 'renderLibrary', 'renderRelease', 'play', 'normalizeLib', 'renderLore', 'loadLame']) at(n);
  assert.ok(code.indexOf('const S = {') < at('init'), 'state must be defined before init');
  assert.ok(code.indexOf('function renderVault') < code.indexOf('__renderVault'), 'the __renderVault wrapper must come after renderVault');
  assert.ok(/\ninit\(\);\n<\/script>\n<\/body>\n<\/html>\n?$/.test(code), 'init(); must be the very last statement of the app (on its own line)');
});

test('every part is included exactly once, and the numbering follows the include order', () => {
  const skeleton = read('index.html');
  const included = [...skeleton.matchAll(/^[ \t]*@@include[ \t]+(\S+)[ \t]*$/gm)].map((m) => m[1]);
  assert.deepEqual([...included].sort(), listParts('src/app').sort()); assert.equal(new Set(included).size, included.length);
  for (const kind of ['css', 'js']) { const mine = included.filter((p) => p.startsWith(kind + '/')); assert.deepEqual(mine, [...mine].sort(), `${kind} parts must be included in their numbered order`); }
});

test('the build refuses a missing part, a part nothing includes, a part included twice, a bad path and a part without a final line break', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'svparts-'));
  try {
    fs.mkdirSync(`${tmp}/css`); fs.mkdirSync(`${tmp}/js`); fs.writeFileSync(`${tmp}/css/01-a.css`, 'a{}\n'); fs.writeFileSync(`${tmp}/js/01-a.js`, 'var a;\n');
    const set = (index) => fs.writeFileSync(`${tmp}/index.html`, index);
    set('<style>\n@@include css/01-a.css\n</style>\n<script>\n@@include js/01-a.js\n</script>\n');
    assert.equal(assembleApp(tmp), '<style>\na{}\n</style>\n<script>\nvar a;\n</script>\n');
    set('<style>\n@@include css/01-a.css\n</style>\n');                                              assert.throws(() => assembleApp(tmp), /not included/);
    set('@@include css/01-a.css\n@@include css/01-a.css\n@@include js/01-a.js\n');                    assert.throws(() => assembleApp(tmp), /included twice/);
    set('@@include css/01-a.css\n@@include js/01-a.js\n@@include js/02-missing.js\n');               assert.throws(() => assembleApp(tmp), /does not exist/);
    set('@@include ../secret.txt\n');                                                                 assert.throws(() => assembleApp(tmp), /is not a part/);
    fs.writeFileSync(`${tmp}/js/01-a.js`, 'var a;'); set('@@include css/01-a.css\n@@include js/01-a.js\n'); assert.throws(() => assembleApp(tmp), /must end with a line break/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('no part grows into a giant file again (600 lines for scripts, 300 for styles)', () => {
  for (const p of listParts('src/app')) assert.ok(lineCount(p) <= (p.startsWith('js/') ? 600 : 300), `${p} has ${lineCount(p)} lines: split it into two parts`);
});

test('no secret key sneaks into the page', () => {
  assert.ok(!/sb_secret_[A-Za-z0-9_-]{8,}/.test(app), 'a secret key must never be in the page');
  for (const jwt of app.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) || []) {
    assert.notEqual(JSON.parse(Buffer.from(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()).role, 'service_role');
  }
});
