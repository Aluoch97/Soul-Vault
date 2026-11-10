# soulnicolas.com — Soul Vault as the website

Owner: Nick (Nicólas Soul). Goal (DONE Nov 10, 2026): soulnicolas.com is Soul Vault, a web app on Cloudflare Pages (project `soul-vault`). DNS is on Cloudflare (nameservers cleo/molly.ns.cloudflare.com);
the domain registration is still with Wix (keep it renewed; Wix has no email records for this domain). www redirects to soulnicolas.com (a line in the boot script in `build.js`; Pages `_redirects` cannot match a host. A Cloudflare Redirect Rule would also work), app.soulnicolas.com also still works.
Plain language for Nick: short explanations, no jargon. Do not overstate certainty; say what is untested.

## How it fits together
- `src/App.html` — the whole client (one file, ~6.4k lines). Single source of truth. Owner edits go here.
- `apps-script/` — the backend, unchanged: `Vault.gs`, `MusicVaultImporter.gs`, `Lame.html`. Lives in Nick's Apps Script
  project (Sheet "Music Vault" + Drive). Deployed as a web app; the site talks to it with `fetch` POST (`doPost`, whitelisted list).
- `build.js` — turns `src/App.html` into `dist/` (index.html, app.js, lame.js). `node build.js`. Deploy `dist/`.
  `package.json` has one dev dependency, esbuild, which minifies app.js (Cloudflare runs `npm install` first; if it is missing the build still works, unminified).
  Speed notes: on a first visit to the public site Home is drawn at once from `paintHomeShell()` (no library needed) and `fillHomeLatest()` swaps
  in the single/project covers when the library arrives; the background video starts only after that (`startHomeVideo`). `SV_BOOT.pub` marks
  "public default visit". The library JSON from Apps Script was 1.37 MB (738 KB gzip) and took 3.7-5.5 s to build; measured Nov 10: song-cover thumbnails were ~45% of it, lyrics only ~11%.
  Build 66 (Vault.gs): `getShare` no longer sends `track_cover_thumb` (the app fetches song covers on demand with `getCover`), and the finished response is cached for 60 s
  (`bigPut_/bigGet_`, gzip + base64 in pieces under 100 KB; `shareBody_` builds it, `getShare` adds the per-link `share` block). Every place that clears link caches goes through `scopeKeys_()`,
  which now also clears the response cache; direct edits typed into the Sheet show up within 60 s. Lyrics on demand is still possible later but is a small win.
  Build 67: `getHome(token)` (Vault.gs) returns only the newest single and project (same rule as `homePicks`) with their small cover pictures, from the Releases sheet only, cached 60 s (`home1_all`, cleared by `scopeKeys_()`).
  Build 68: PageSpeed (live, Nov 10, after build 67) still showed LCP 7.3 s because the Home cover is ~380 px wide and Chrome counts a small thumbnail as a small image, so `getHome` now also sends a sharp 420 px cover
  (`img`, from `driveThumb_`, kept 6 h as `hcov_<id>`; the `getHome` answer itself is cached 60 s with `bigPut_`/`bigGet_`).
  On a first public visit the app calls it alongside `getShare` and shows the two covers at once (`paintHomeLite`); a tap before the library arrives is remembered (`S.pendingRel`) and opens when it does. Measure with Lighthouse (mobile) against a local copy of dist/.
  PageSpeed (live, mobile, Nov 10): Performance 74, others 100; LCP 7.7 s (covers wait for the library), page weight 3.7 MB. Done since: phones get `public/home-bg-m.mp4` (0.6 MB; the 2.5 MB
  `home-bg.mp4` is for wider screens), no video on 3g or Save-Data, longer cache headers in `build.js` (media 7 days, fonts 30 days; rename a file when you replace it).
- `site.config.json` — Apps Script URL, public token, site name.
- Audio streams straight from Google Drive with an API key (Settings tab: `drive_api_key`); covers via `getCover`.
- The app already has a fetch transport (`runFetch`, `BOOT.api`), so the Apps Script page itself is no longer the host.

## Navigation (matches soulnicolas.com)
Home, Vault, Tour, Press, Lore: same five on the sidebar (desktop) and bottom tab bar (phone). Inside `src/App.html`:
`renderHome`, `renderLibrary` (this is the Vault; internal nav id `library`), `renderTour` (iframe of `/roadto100shows.html`),
`renderPress`, `renderLore`. Press links, social links, booking email and the fallback bio live in the `SITE` constant next to them.
The internal nav id `vault` still means the owner's Settings screen. Strangers and fan links open on Home; the owner opens on the Vault.
Static pages in `public/`: `roadto100shows.html` (tour tracker, reads a Google Sheet), `join.html` (fan sign-up, posts to the soulMATES Apps Script).

## Tab addresses and old links
Each page has its own URL, handled in `src/App.html` by `parseRoute / pathFor / syncUrl / routeTo` (just above `renderChrome`): `/` Home, `/vault`,
`/vault/<release>` (release id without `rel_`, `_` becomes `-`, e.g. `/vault/2019-soulless`), `/tour`, `/tour/road-to-100`, `/press`, `/press/video`, `/lore`.
Back/Forward work and the tab title changes. Owner screens (Settings, Share links, Insights) have no address; single-release share links keep theirs.
Cloudflare Pages serves index.html for any unknown path, which is what makes this work. Old Wix addresses are 301 redirects written to `dist/_redirects` by `build.js`
(list `wix` there; do not redirect `/shows` or `/roadto100shows`, those are real files used inside the Tour tab). Press images live in `public/press-img/` so `/press` stays free.
Checked on the live site (pages load, old Wix links redirect, iPhone confirmed by Nick).

## Layout (phone app on every screen)
Like the Certified and NuDirectory apps, the phone layout is used at every width: no sidebar, a tab bar along the bottom of the
window, and on a computer the content sits in a centered column (max 820px). The old `@media (max-width: 760px)` rules were switched to
`@media (min-width: 0px)`, and the `<style id="desk">` block just before the app script centers the column. To change the column
width, edit that block. The sidebar code in `renderChrome` is still there but hidden.

## Access model (important)
- Owner: open `https://soulnicolas.com/?k=<owner key>` once; key is saved in that device's localStorage and removed from the URL.
- Fans with a link: `/?s=<share token>` (unchanged).
- Everyone else gets the **public token** from `site.config.json`. Create it in the app (Share > a link covering the public
  releases) and paste it in. Anything that link can see is public on the internet. Unreleased/private material must not be in it.
  Verify what a logged-out visitor sees before launch.
- The public token is an "all" (fan club) link: it carries every release that is not hidden or sealed (28 releases, 264 songs, lyrics,
  photos, demo versions). Marking a release "Unreleased" only adds a label; to keep something out use "Hide" or seal it with an unlock date.
  Checked Nov 10, 2026 (scripted, read-only; re-run `node tools/casecheck.js` after changes): wrong, capitalised or empty links are refused,
  owner-only calls with the public link are denied, no other links or owner key are in the data, downloads are off.
  Owner decisions: the music by other artists (The Birdhouse, SHiKi, Berhani, LyriCal) is cleared; demo versions stay public;
  "A Love Letter to Kenya" is sealed until Feb 14, 2027.

## Search and crawlers
`build.js` writes `dist/sitemap.xml` and `dist/robots.txt` (using `siteUrl`) and adds a hidden plain-text block (site name, tagline, links to every page and the 8 main releases)
inside `<main id="main">` of index.html; the app replaces it when it starts. To add a release to the sitemap/text, add it to the `releases` list in `build.js`.
Next for Nick: add soulnicolas.com in Google Search Console and submit `/sitemap.xml`.

## Cloudflare Pages deploy (same as app.nrnszn.com)
1. `node build.js`, then upload `dist/` (Pages > Create > Direct upload) or connect a git repo with build command `node build.js`, output `dist`.
2. Add custom domain `app.soulnicolas.com` first, test everything, then move soulnicolas.com DNS to Cloudflare and attach the apex.
3. Apps Script: Deploy > Manage deployments > keep "Execute as me / Anyone". Set Settings tab `app_url` to the /exec URL.
4. Wix: keep the domain registration (renewal on). The Wix website plan can be removed once the new site has been checked for a few days. No email records existed to copy.

## Known open items (work through with Nick, one at a time)
1. Pages the Wix site has that Vault lacks: shows (Bandsintown), SOULmates fan sign-up + newsletter, bio/press, contact, privacy policy
   (soulnicolas.com/privacy-policy must still exist and be updated: fan names/comments, play counting, YouTube, Errors tab, fonts self-hosted).
2. Home for strangers: today the app opens on the library. Decide what a first-time visitor sees (hero, latest release, shows, sign-up).
3. Speed: Apps Script calls take ~0.5-2s and have cold starts. Measure after launch; Firebase/Cloudflare move is the staged follow-up, not step one.
4. Rights for The Birdhouse tracks by other artists: DONE (owner confirmed he has them, Nov 10, 2026).
5. Tour tracker has its own website-only YouTube key (done). Still optional: a separate `youtube_api_key` for the Vault so "API key 1" can be Drive-only;
   real-iPhone pass (share sheet, lock screen, playback ladder).
6. Add a web manifest + service worker only after the above (installable app), and SEO basics (title/description, Open Graph, a crawlable
   text fallback since the app renders client-side).

## Rules
- Never edit `dist/`. Change `src/App.html` or `apps-script/*`, rebuild.
- Backend changes: paste the changed `.gs` into Apps Script, new deployment version, bump `SV_BUILD`, update the "SV build" tag.
- Keep text escaped with `esc()`. Run a syntax check (esbuild `--target=safari15`) and a phone-width layout check before shipping.
