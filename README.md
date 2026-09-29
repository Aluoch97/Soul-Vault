# Soul Vault

Nicólas Soul's private music vault and fan club: a Google Apps Script web app backed by a Google Sheet and Google Drive.

| File | Apps Script file | What it is |
| --- | --- | --- |
| `App.html` | `App` (HTML) | The whole web page and app code |
| `Vault.gs` | `Vault` (Script) | The web app's server side |
| `Importer.gs` | Importer (Script) | Reads the Discography folder into the Sheet; also defines the tab headers (`TABS`) |

## Updating the live app

1. Open the Vault Google Sheet › Extensions › Apps Script.
2. Replace the contents of each file with the matching file from this repo.
3. Deploy › Manage deployments › edit the web app › Version: **New version** › Deploy.

The web address stays the same, so owner and share links keep working.
