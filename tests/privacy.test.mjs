// The privacy page has to say what the site really does. These checks fail when a feature that touches visitors is added without it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../public/privacy-policy.html', import.meta.url), 'utf8').replace(/&rsquo;/g, "'").replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

test('privacy page: third parties that see a visit (YouTube, SoundCloud, Bandsintown, Cloudflare), the Video tab, and the saved copy of the app are all named', () => {
  for (const must of ['YouTube', 'SoundCloud', 'Bandsintown', 'Cloudflare', 'Video tab', 'SoundCloud sees your visit', 'a saved copy of the app', 'songs and videos are only saved if you tap', 'Offline music', 'Do Not Track', 'Soul Tribe', 'unsubscribe'])
    assert.ok(page.includes(must), 'the privacy page should mention: ' + must);
});
