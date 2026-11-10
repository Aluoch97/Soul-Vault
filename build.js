// node build.js  ->  dist/  (index.html + app.js + lame.js + static files). Deploy dist/ to Cloudflare Pages.
const fs = require('fs'), path = require('path');
const cfg = JSON.parse(fs.readFileSync('site.config.json', 'utf8'));
const raw = fs.readFileSync('src/App.html', 'utf8');
const open = '<script id="sv-app">', a = raw.indexOf(open), b = raw.indexOf('</script>', a);
if (a < 0 || b < 0) throw new Error('src/App.html is missing its <script id="sv-app"> block');
const build = (fs.readFileSync('apps-script/Vault.gs', 'utf8').match(/SV_BUILD = '(\d+)'/) || [, '0'])[1];
let code = raw.slice(a + open.length, b);
// On the website the MP3 encoder is a plain file next to the app instead of an Apps Script route.
const lameOld = ": '';\n  return lameP";
if (!code.includes(lameOld)) throw new Error('loadLame() changed; update the patch in build.js');
code = code.replace(lameOld, ": '/lame.js';\n  return lameP");
// Boot: owner opens /?k=<owner key>; a fan link is /?s=<share token>; everyone else gets the public token.
const boot = `<script>(function(){var q=new URLSearchParams(location.search),c=x=>String(x||'').replace(/[^A-Za-z0-9]/g,'').slice(0,64),ls=function(k,v){try{if(v===undefined)return localStorage.getItem(k)||'';localStorage.setItem(k,v)}catch(e){return ''}};
var k=c(q.get('k'))||c(ls('sv_owner_key')),s=c(q.get('s'));if(q.get('k')){ls('sv_owner_key',k);history.replaceState(null,'',location.pathname)}
if(!k&&!s)s=${JSON.stringify(cfg.publicToken.replace(/[^A-Za-z0-9]/g, ''))};
window.SV_BOOT={token:s,key:s?'':k,api:${JSON.stringify(cfg.api)}};})();</script>`;
let page = raw.slice(0, a).replace('window.SV_BOOT = __SV_BOOT__;', '') + `<script src="/app.js?v=${build}" onerror="svAppFailed()"></script>` + raw.slice(b + 9);
page = page.replace(/<script>window\.SV_BOOT = __SV_BOOT__;<\/script>/, '');
// boot must run before app.js: put it right before the app script tag
page = page.replace('<script src="/app.js', boot + '<script src="/app.js').replace('<title>Soul Vault</title>', `<title>${cfg.siteName}</title>`);
// Apps Script injected the viewport tag itself (Vault.gs addMetaTag); on the website it must be in the page,
// or phones render the desktop layout at 980px and the whole phone UI (tab bar, mini player) never appears.
if (!page.includes('<meta charset="utf-8">')) throw new Error('index.html: <meta charset> not found, cannot add viewport tag');
page = page.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta name="theme-color" content="#151318">');
fs.rmSync('dist', { recursive: true, force: true }); fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/index.html', page); fs.writeFileSync('dist/app.js', code);
const lame = fs.readFileSync('apps-script/Lame.html', 'utf8').replace(/^\s*<script[^>]*>/, '').replace(/<\/script>\s*$/, '');
fs.writeFileSync('dist/lame.js', lame);
fs.cpSync('public', 'dist', { recursive: true });   // includes public/fonts/
fs.writeFileSync('dist/_headers', '/app.js\n  Cache-Control: public, max-age=300\n/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n');
console.log('built dist/ (build ' + build + ', ' + Math.round(code.length / 1024) + ' KB app.js)');
