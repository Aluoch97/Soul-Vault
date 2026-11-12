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
let homeBaked = {};
try { homeBaked = JSON.parse(fs.readFileSync('home.json', 'utf8')); } catch (e) { console.log('no home.json: Home covers will load from the backend'); }
const boot = `<script>(function(){if(/^www\\./.test(location.hostname)){location.replace(location.href.replace('//www.','//'));return}var q=new URLSearchParams(location.search),c=x=>String(x||'').replace(/[^A-Za-z0-9]/g,'').slice(0,64),ls=function(k,v){try{if(v===undefined)return localStorage.getItem(k)||'';localStorage.setItem(k,v)}catch(e){return ''}};
var k=c(q.get('k'))||c(ls('sv_owner_key')),s=c(q.get('s'));if(q.get('k')){ls('sv_owner_key',k);history.replaceState(null,'',location.pathname)}
var pub=!k&&!s;if(pub)s=${JSON.stringify(cfg.publicToken.replace(/[^A-Za-z0-9]/g, ''))};
window.SV_BOOT={token:s,key:s?'':k,api:${JSON.stringify(cfg.edge ? '/api' : cfg.api)},gas:${JSON.stringify(cfg.api)},pub:pub,home:${JSON.stringify(homeBaked).replace(/</g, '\\u003c')},site:${JSON.stringify(String(cfg.siteUrl || 'https://' + cfg.domain).replace(/\/$/, ''))}};})();</script>`;
let page = raw.slice(0, a).replace('window.SV_BOOT = __SV_BOOT__;', '') + `<script src="/app.js?v=${build}-APPHASH" onerror="svAppFailed()"></script>` + raw.slice(b + 9);
page = page.replace(/<script>window\.SV_BOOT = __SV_BOOT__;<\/script>/, '');
// boot must run before app.js: put it right before the app script tag
page = page.replace('<script src="/app.js', boot + '<script src="/app.js').replace('<title>Soul Vault</title>', `<title>${cfg.siteName}</title>`);
// Apps Script injected the viewport tag itself (Vault.gs addMetaTag); on the website it must be in the page,
// or phones render the desktop layout at 980px and the whole phone UI (tab bar, mini player) never appears.
if (!page.includes('<meta charset="utf-8">')) throw new Error('index.html: <meta charset> not found, cannot add viewport tag');
// Browser icon and the picture shown when the link is shared (texts, social posts). siteUrl must be the address people share:
// app.soulnicolas.com until the main domain moves, then https://soulnicolas.com (site.config.json).
const siteUrl = String(cfg.siteUrl || 'https://' + cfg.domain).replace(/\/$/, '');
const attr = s => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const iconLinks = '<link rel="icon" href="/favicon.ico" sizes="48x48">\n<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">\n'
  + '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">\n<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">\n'
  + '<link rel="apple-touch-icon" href="/apple-touch-icon.png">';
const shareTags = '<meta name="description" content="' + attr(cfg.description) + '">\n<meta property="og:type" content="website">\n'
  + '<meta property="og:site_name" content="' + attr(cfg.siteName) + '">\n<meta property="og:title" content="' + attr(cfg.shareTitle || cfg.siteName) + '">\n'
  + '<meta property="og:description" content="' + attr(cfg.description) + '">\n<meta property="og:url" content="' + siteUrl + '/">\n'
  + '<meta property="og:image" content="' + siteUrl + '/og-image.png">\n<meta property="og:image:type" content="image/png">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n'
  + '<meta property="og:image:alt" content="' + attr(cfg.siteName) + ' logo">\n<meta name="twitter:card" content="summary_large_image">\n'
  + '<meta name="twitter:title" content="' + attr(cfg.shareTitle || cfg.siteName) + '">\n<meta name="twitter:description" content="' + attr(cfg.description) + '">\n'
  + '<meta name="twitter:image" content="' + siteUrl + '/og-image.png">';
// Open the connection to Google early: the library comes from there, and the handshake is otherwise paid after the app code loads.
const preload = homeBaked.single && /^\/home-covers\/[A-Za-z0-9_.-]+$/.test(homeBaked.single.src) ? '<link rel="preload" as="image" href="' + homeBaked.single.src + '" fetchpriority="high">\n' : '';
const preconnect = preload + '<link rel="preconnect" href="https://script.google.com" crossorigin>\n<link rel="preconnect" href="https://script.googleusercontent.com" crossorigin>';
page = page.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta name="theme-color" content="#151318">\n' + preconnect + '\n' + iconLinks + '\n' + shareTags);
// Crawlable text: the app draws everything in the browser, so give crawlers that don't run it a plain-text version. The app replaces it as soon as it starts.
const releases = JSON.parse(fs.readFileSync('releases.json', 'utf8'));   // refresh with: node tools/updatereleases.js
if (!Array.isArray(releases) || !releases.length) throw new Error('releases.json is empty; run node tools/updatereleases.js');
const pages = [['Vault: the music', '/vault'], ['Tour: upcoming shows', '/tour'], ['Road to 100 Shows', '/tour/road-to-100'], ['Press', '/press'], ['Press videos', '/press/video'], ['Lore: bio and story', '/lore'], ['Join the Soul Tribe', '/join'], ['Privacy policy', '/privacy-policy']];
const seo = '<div style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden"><h1>' + attr(cfg.siteName) + '</h1><p>' + attr(cfg.description) + '</p><nav><ul>'
  + pages.map(p => '<li><a href="' + p[1] + '">' + attr(p[0]) + '</a></li>').join('') + releases.map(r => '<li><a href="/vault/' + r[1] + '">' + attr(r[0]) + '</a></li>').join('') + '</ul></nav></div>';
if (!page.includes('<main id="main"></main>')) throw new Error('index.html: empty <main id="main"> not found, cannot add crawlable text');
page = page.replace('<main id="main"></main>', '<main id="main">' + seo + '</main>');
fs.rmSync('dist', { recursive: true, force: true }); fs.mkdirSync('dist', { recursive: true });
// Shrink the app code (esbuild is a dev dependency; Cloudflare installs it before building). If it is missing, ship the readable code instead.
let minified = false;
try { code = require('esbuild').transformSync(code, { minify: true, target: 'safari15', legalComments: 'none' }).code; minified = true; }
catch (e) { console.log('minify skipped (' + String(e.message || e).split('\n')[0].slice(0, 80) + ')'); }
// The address of app.js carries a fingerprint of its content, so every new version is fetched at once instead of waiting for the browser's saved copy to expire.
const appHash = require('crypto').createHash('sha1').update(code).digest('hex').slice(0, 8);
page = page.replace('APPHASH', appHash);
fs.writeFileSync('dist/index.html', page); fs.writeFileSync('dist/app.js', code);
const lame = fs.readFileSync('apps-script/Lame.html', 'utf8').replace(/^\s*<script[^>]*>/, '').replace(/<\/script>\s*$/, '');
fs.writeFileSync('dist/lame.js', lame);
fs.cpSync('public', 'dist', { recursive: true });   // includes public/fonts/
// The other pages (join, shows, privacy policy, tracker) get the browser icon too.
for (const f of fs.readdirSync('dist')) {
  if (!f.endsWith('.html') || f === 'index.html') continue;
  let h = fs.readFileSync('dist/' + f, 'utf8');
  if (!/rel=["']icon["']/.test(h) && h.includes('</head>')) fs.writeFileSync('dist/' + f, h.replace('</head>', iconLinks + '\n</head>'));
}
// Content-Security-Policy: which outside sites the pages may load from. The pages use inline scripts/styles, so 'unsafe-inline' is needed.
// If you add a new outside service (video host, embed, API), add its address here or the browser will block it.
// frame-ancestors is not set on purpose, so other sites can still embed pages.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://static.cloudflareinsights.com https://widgetv3.bandsintown.com https://*.bandsintown.com",
  "style-src 'self' 'unsafe-inline' https://*.bandsintown.com",
  "font-src 'self' data: https://*.bandsintown.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: data: https:",
  "connect-src 'self' https://script.google.com https://cloudflareinsights.com https://script.googleusercontent.com https://docs.google.com https://*.googleusercontent.com https://www.googleapis.com https://*.bandsintown.com",
  "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com https://open.spotify.com https://w.soundcloud.com https://embed.music.apple.com https://*.bandsintown.com https://bandcamp.com https://nrnszn.bandcamp.com",
  "worker-src 'self' blob:", "manifest-src 'self'", "object-src 'none'", "base-uri 'self'",
  "form-action 'self' https://script.google.com https://script.googleusercontent.com",
].join('; ');
// Big files that rarely change are kept by the browser for a week (fonts, 30 days); app.js stays at 5 minutes so updates show up quickly. If you replace a picture or video, give it a new file name.
fs.writeFileSync('dist/_headers', '/app.js\n  Cache-Control: public, max-age=300\n'
  + ['/home-bg-hd.mp4', '/home-bg-hd-poster.jpg', '/press-img/*', '/photos/*', '/og-image.png', '/roadto100-wanted.jpg', '/icon*', '/apple-touch-icon.png', '/favicon*'].map(p => p + '\n  Cache-Control: public, max-age=604800\n').join('')
  + '/links.json\n  Cache-Control: public, max-age=300\n'
  + '/fonts/*\n  Cache-Control: public, max-age=2592000\n'
  + '/home-covers/*\n  Cache-Control: public, max-age=31536000, immutable\n'
  + '/*\n  Content-Security-Policy: ' + csp + '\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()\n  Strict-Transport-Security: max-age=15552000\n');
// Old Wix addresses -> new ones (permanent redirects). Real files in dist/ (join, shows, privacy-policy, roadto100shows) are not listed.
const wix = [['/music', '/vault'], ['/pre2018', '/vault'], ['/soulless', '/vault/2019-soulless'], ['/riseofthelost', '/vault/2025-rise-of-the-lost'],
  ['/causeitfeelsgood', '/vault/2024-cause-it-feels-good-ep'], ['/soulsearching', '/vault/2022-soulsearching'], ['/troubleinparadise', '/vault/2018-trouble-in-paradise'],
  ['/survivingthenuworld', '/vault/2020-bluu-redd'], ['/jambojacquetesphaye', '/vault/2022-jambo-jacque-tesphaye'], ['/alltc', '/vault/2020-a-love-letter-to-cali-ep'],
  ['/about', '/lore'], ['/bio', '/lore'], ['/roadto100', '/tour/road-to-100']];
fs.writeFileSync('dist/_redirects', wix.map(r => r[0] + ' ' + r[1] + ' 301').join('\n') + '\n');
const urls = ['/'].concat(pages.map(p => p[1]).filter(p => p !== '/press/video'), releases.map(r => '/vault/' + r[1]));
fs.writeFileSync('dist/sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.map(u => '  <url><loc>' + siteUrl + u + '</loc></url>').join('\n') + '\n</urlset>\n');
fs.writeFileSync('dist/robots.txt', 'User-agent: *\nAllow: /\n\nSitemap: ' + siteUrl + '/sitemap.xml\n');
console.log('built dist/ (build ' + build + ', ' + Math.round(code.length / 1024) + ' KB app.js' + (minified ? ', minified' : ', NOT minified') + ')');
