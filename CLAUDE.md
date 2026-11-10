# soulnicolas.com — Soul Vault as the website

Owner: Nick (Nicólas Soul). Goal: replace the Wix site at soulnicolas.com with Soul Vault, running as a web app,
the same way nrnszn.com was moved (static app on Cloudflare Pages, domain/DNS on Cloudflare, no Wix renewal).
Plain language for Nick: short explanations, no jargon. Do not overstate certainty; say what is untested.

## How it fits together
- `src/App.html` — the whole client (one file, ~6.4k lines). Single source of truth. Owner edits go here.
- `apps-script/` — the backend, unchanged: `Vault.gs`, `MusicVaultImporter.gs`, `Lame.html`. Lives in Nick's Apps Script
  project (Sheet "Music Vault" + Drive). Deployed as a web app; the site talks to it with `fetch` POST (`doPost`, whitelisted list).
- `build.js` — turns `src/App.html` into `dist/` (index.html, app.js, lame.js). `node build.js`. Deploy `dist/`.
- `site.config.json` — Apps Script URL, public token, site name.
- Audio streams straight from Google Drive with an API key (Settings tab: `drive_api_key`); covers via `getCover`.
- The app already has a fetch transport (`runFetch`, `BOOT.api`), so the Apps Script page itself is no longer the host.

## Access model (important)
- Owner: open `https://soulnicolas.com/?k=<owner key>` once; key is saved in that device's localStorage and removed from the URL.
- Fans with a link: `/?s=<share token>` (unchanged).
- Everyone else gets the **public token** from `site.config.json`. Create it in the app (Share > a link covering the public
  releases) and paste it in. Anything that link can see is public on the internet. Unreleased/private material must not be in it.
  Verify what a logged-out visitor sees before launch.

## Cloudflare Pages deploy (same as app.nrnszn.com)
1. `node build.js`, then upload `dist/` (Pages > Create > Direct upload) or connect a git repo with build command `node build.js`, output `dist`.
2. Add custom domain `app.soulnicolas.com` first, test everything, then move soulnicolas.com DNS to Cloudflare and attach the apex.
3. Apps Script: Deploy > Manage deployments > keep "Execute as me / Anyone". Set Settings tab `app_url` to the /exec URL.
4. Do NOT cancel Wix until the new site has been live and checked (email records at the domain must be copied first).

## Known open items (work through with Nick, one at a time)
1. Pages the Wix site has that Vault lacks: shows (Bandsintown), SOULmates fan sign-up + newsletter, bio/press, contact, privacy policy
   (soulnicolas.com/privacy-policy must still exist and be updated: fan names/comments, play counting, YouTube, Errors tab, fonts self-hosted).
2. Home for strangers: today the app opens on the library. Decide what a first-time visitor sees (hero, latest release, shows, sign-up).
3. Speed: Apps Script calls take ~0.5-2s and have cold starts. Measure after launch; Firebase/Cloudflare move is the staged follow-up, not step one.
4. Rights for The Birdhouse tracks by other artists before anything public.
5. Separate `youtube_api_key`; embedding/framing decision; real-iPhone pass (share sheet, lock screen, playback ladder).
6. Add a web manifest + service worker only after the above (installable app), and SEO basics (title/description, Open Graph, a crawlable
   text fallback since the app renders client-side).

## Rules
- Never edit `dist/`. Change `src/App.html` or `apps-script/*`, rebuild.
- Backend changes: paste the changed `.gs` into Apps Script, new deployment version, bump `SV_BUILD`, update the "SV build" tag.
- Keep text escaped with `esc()`. Run a syntax check (esbuild `--target=safari15`) and a phone-width layout check before shipping.
