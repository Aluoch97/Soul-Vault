# Soul Vault in the App Store and Google Play

Status: **preparation only. Nothing has been built, signed or submitted.** Store rules change, so check each store's current rules before paying or submitting.

## What is here
- `icon-1024.png`: the 1024×1024 App Store icon (opaque, no transparency; Apple rounds the corners itself).
- `../public/icon-maskable-512.png`: Android adaptive icon (also used by the installed website; the logo sits inside the safe zone so it is never cropped).
- `LISTING.md`: names, descriptions, categories, privacy answers, notes for the reviewers.
- `SCREENSHOTS.md`: the sizes each store needs and the list of shots to take.

## Decisions for Nick
1. **Bundle / package name** (cannot change after the first upload). Suggested: `com.soulnicolas.vault`. Use the same developer account name you used before.
2. **Which kind of iPhone app.** (a) *Loads soulnicolas.com inside the app* is the quick way, but Apple often rejects it (guideline 4.2, "just a website"). (b) *Bundle the app files in the app* is much safer for review, but the app then runs from the address `capacitor://localhost`, and our servers only allow soulnicolas.com (the music and picture storage and the API). Option (b) needs us to allow that address in `functions/api.js`, `functions/upload.js` and the R2 bucket's CORS rules. I recommend (b); it is a small, testable change I can make.
3. **Phone notifications.** Our web notifications do not work inside an iPhone app (a different system, APNs, is needed). Plan: ship the first version without them, add native push later.
4. **Support button** (tips and payments inside an app): Apple has rules about payments. Decide whether the store build hides it or keeps it. I am not sure it would pass.

## Android (Google Play): the easy route
Soul Vault is already an installable web app, so Play can accept it as a "Trusted Web Activity" (a thin wrapper that shows the real site full-screen).
1. On the Mac: `npm i -g @bubblewrap/cli`, then `bubblewrap init --manifest https://soulnicolas.com/manifest.webmanifest` and `bubblewrap build`. (PWABuilder.com does the same from a web page.) It asks you to create a **signing key: back it up somewhere safe; losing it means losing the ability to update the app**. Better: use Play App Signing and let Google hold the real key.
2. Upload the `.aab` file in Play Console > Create app > Production (or Closed testing first).
3. Play Console > Setup > App integrity > copy the **SHA-256 certificate fingerprint** and send it to me. I add `public/.well-known/assetlinks.json`, which is what makes the wrapper hide the browser address bar. Until then the app shows a bar at the top.
4. A **new personal Google developer account must run a closed test with at least 12 testers for 14 days** before it can publish (rule as I know it; an organization account does not have this). An account that already published an app may already be past it: check in Play Console.

## iPhone (App Store)
1. On the Mac with Xcode: in a fresh folder, `npm i @capacitor/core @capacitor/cli @capacitor/ios`, `npx cap init "Soul Vault" com.soulnicolas.vault --web-dir dist`, `npx cap add ios`, `npx cap open ios`. (I can prepare this project and commit it so you only open and sign it.)
2. In Xcode: pick your team, set the icon (`icon-1024.png`), turn on **Background Modes > Audio** (so music keeps playing with the screen off) and set the audio session so it does not stop other apps' music at launch.
3. Test on your own iPhone through **TestFlight** before submitting. Things I cannot test from here: background playback, lock-screen controls, offline music, cover art in the car.
4. App Store Connect: upload the build, add the screenshots and `LISTING.md` text, answer the privacy questions, submit for review (usually a day or two).

## What I can still do
Allow the app's address on our servers, write the Capacitor project, the assetlinks file (once you send the fingerprint), privacy-policy updates, and fix whatever TestFlight finds. What only you can do: sign in to the developer accounts, create the signing key, press upload and submit.
