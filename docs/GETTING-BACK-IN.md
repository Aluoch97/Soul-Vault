# Getting back in: Soul Vault (soulnicolas.com)

Plain steps for the day something goes wrong. **None of this has been rehearsed end to end**; where a step has never been tried it says so.

## Where everything lives
- **The site:** Cloudflare Pages project `soul-vault`. Code is this GitHub repo; merging into `main` publishes it.
- **Domain:** registered at Cloudflare (moved from Wix, Nov 16, 2026). Renewal: Cloudflare dashboard > Domain Registration.
- **Data:** Cloudflare D1 `soul-vault-db` (releases, shares, plays, fans...). **Files:** R2 bucket `soulvault-media` (songs, pictures). **Backups:** private R2 bucket `soulvault-backups`.
- **Old backend:** Apps Script project "Music Vault" + the Google Sheet. Still the source for older song records until the catalog is switched over.
- **Secrets** (names only, values live in Cloudflare > soul-vault > Settings > Variables and Secrets): `OWNER_KEY`, `YOUTUBE_API_KEY`, `RESEND_API_KEY`, `NEWSLETTER_SECRET`, `NEWSLETTER_CRON_TOKEN`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `BANDSINTOWN_APP_ID`. The same newsletter token is also a GitHub Actions secret.

## I can't sign in as the owner
1. Go to `soulnicolas.com/admin` and use the owner password.
2. Five wrong tries lock that address for **15 minutes**. Wait, then try again.
3. Forgot the password: open `soulnicolas.com/?k=<owner key>` once. The key is the Cloudflare secret `OWNER_KEY`. Then Settings > "Set owner password".
4. Lost the key too: change `OWNER_KEY` in Cloudflare to a new value, then redeploy (Deployments > Retry). **The Apps Script project must hold the same key, or the old-data sync breaks.** (Not rehearsed.)

## A deploy broke the site
Cloudflare > Workers & Pages > soul-vault > Deployments > pick the last good one > **Rollback to this deployment**. Then fix the problem in GitHub. Rolling back does not touch the database.

## The data is wrong or gone
- A backup is written automatically after a normal visit when the newest is over 23 hours old. See and download them: Settings > Backups.
- Rebuilding tables from a backup: `python3 tools/restore-backup.py backup.json restore.sql`. It was tested on a scratch database, **never against the real one**. Practise on a scratch database first.
- Songs and pictures are **not** in the backup. Settings > Backups > "Download the file list", then `python3 tools/download-media.py` copies them to a computer. Do this now and then.

## The site is down
`soulnicolas.com` is Cloudflare. Check the Cloudflare status page and the Pages project. If only the data calls fail, the app falls back to Apps Script for some of them.
