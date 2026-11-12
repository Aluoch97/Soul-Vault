// Puts the app back together from its parts (node build.js calls this). The app's source lives in src/app:
//   src/app/index.html      the page: head, markup, small inline scripts, with a line  @@include css/<file>  or  @@include js/<file>
//                           wherever a part goes
//   src/app/css/NN-*.css    the main styles, in the order index.html includes them
//   src/app/js/NN-*.js      the app script, in the order index.html includes them. It is ONE classic script (so every function and
//                           variable is shared exactly as before) and the ORDER MATTERS: later code wraps earlier functions
//                           (__renderVault, __closeModal, __updateNow) and constants must exist before they are used.
// The result is the same text the old single src/App.html held. It refuses to build if an include points at a missing file, a part
// is included twice, or a part is not included at all (it would silently vanish from the app).
const fs = require('fs'), path = require('path');
const INCLUDE = /^[ \t]*@@include[ \t]+([A-Za-z0-9_./-]+)[ \t]*$/;
const PART = /^(css|js)\/[A-Za-z0-9_.-]+\.(css|js)$/;

function listParts(dir = 'src/app') {
  const out = [];
  for (const sub of ['css', 'js']) {
    const d = path.join(dir, sub);
    if (fs.existsSync(d)) for (const f of fs.readdirSync(d).sort()) out.push(sub + '/' + f);
  }
  return out;
}

function assembleApp(dir = 'src/app') {
  const skeleton = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const used = new Set(), out = [];
  skeleton.split('\n').forEach((line, i) => {
    const m = INCLUDE.exec(line);
    if (!m) { out.push(line); return; }
    const rel = m[1], where = `${dir}/index.html line ${i + 1}`;
    if (!PART.test(rel)) throw new Error(`${where}: "${rel}" is not a part (expected css/<name>.css or js/<name>.js)`);
    if (used.has(rel)) throw new Error(`${where}: "${rel}" is included twice`);
    const file = path.join(dir, rel);
    if (!fs.existsSync(file)) throw new Error(`${where}: the part "${file}" does not exist`);
    const text = fs.readFileSync(file, 'utf8');
    if (text.length && !text.endsWith('\n')) throw new Error(`${file} must end with a line break`);
    used.add(rel);
    out.push(text.length ? text.slice(0, -1) : null);   // the part's own final line break stands in for the marker line's
  });
  const orphans = listParts(dir).filter((p) => !used.has(p));
  if (orphans.length) throw new Error(`these parts are not included in ${dir}/index.html, so they would be left out of the app: ${orphans.map((p) => dir + '/' + p).join(', ')}`);
  return out.filter((l) => l !== null).join('\n');
}

module.exports = { assembleApp, listParts };
