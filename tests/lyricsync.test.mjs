import test from 'node:test';
import assert from 'node:assert/strict';
import { lyricLines, normWord, heardWords, alignLyrics, toLrc } from '../functions/_lib/lyricsync.js';

const LYRICS = "[Verse 1]\nWalking down the strip tonight\nNeon lights are burning bright\n\n[Hook]\nDon't you ever let me go\nSin city, sin city, take me home";
const w = (word, start) => ({ word, start, end: start + 0.4 });

test('lyricLines matches the sync screen: no blank lines, no LRC tags or [ti:..] headers', () => {
  assert.deepEqual(lyricLines('[ti:Song]\n[00:01.00]  first line \n\n[00:05.20]second'), ['first line', 'second']);
  assert.equal(lyricLines(LYRICS).length, 6);
});
test('normWord ignores case, accents and punctuation', () => {
  assert.equal(normWord("Don't"), 'dont'); assert.equal(normWord('Nicólas,'), 'nicolas'); assert.equal(normWord('...'), '');
});
test('heardWords reads word times, spreads segment times when there are none, and ignores junk', () => {
  assert.deepEqual(heardWords({ segments: [{ words: [w('Hi,', 1), w('there', 2)] }] }).map(x => [x.w, x.t]), [['hi', 1], ['there', 2]]);
  assert.deepEqual(heardWords({ result: { words: [w('yo', 3)] } }).map(x => x.w), ['yo']);
  const sp = heardWords({ segments: [{ text: 'one two three four', start: 10, end: 14 }] });
  assert.deepEqual(sp.map(x => x.t), [10, 11, 12, 13]);
  assert.deepEqual(heardWords(null), []); assert.deepEqual(heardWords({ segments: [{ words: [{ word: 'x' }] }] }), []);
});
test('alignLyrics: each line gets the time of its first heard word; a section label is placed with its neighbours; times never go backwards', () => {
  const lines = lyricLines(LYRICS);
  const heard = heardWords({ segments: [{ words: [
    w('walking', 12), w('down', 12.5), w('the', 13), w('strip', 13.3), w('tonight', 13.8),
    w('neon', 16), w('lights', 16.4), w('are', 16.8), w('burning', 17), w('bright', 17.5),
    w('dont', 24), w('you', 24.3), w('ever', 24.6), w('let', 25), w('me', 25.2), w('go', 25.5),
    w('sin', 28), w('city', 28.5), w('sin', 29), w('city', 29.5), w('take', 30), w('me', 30.3), w('home', 30.6)] }] });
  const r = alignLyrics(lines, heard);
  assert.deepEqual([r.times[1], r.times[2], r.times[4], r.times[5]], [12, 16, 24, 28]);
  assert.ok(r.times[0] <= r.times[1], '[Verse 1] label sits at or before its first line');
  assert.ok(r.times[3] >= 16 && r.times[3] <= 24, '[Hook] label sits between the verse and the hook');
  assert.ok(r.times.every((t, i) => i === 0 || t >= r.times[i - 1]));
  assert.equal(r.matched, r.total);
});
test('alignLyrics copes with misheard words, skipped lines and extra ad-libs', () => {
  const lines = ['we ride all night', 'under the neon sky', 'never coming down'];
  const heard = [w('yeah', 1), w('we', 2), w('ride', 2.4), w('all', 2.8), w('nite', 3), w('uh', 4), w('never', 9), w('coming', 9.4), w('down', 9.9)].map(x => ({ w: normWord(x.word), t: x.start }));
  const r = alignLyrics(lines, heard);
  assert.equal(r.times[0], 2);                        // "nite" is close enough to "night"; the ad-libs are skipped
  assert.equal(r.times[2], 9);
  assert.ok(r.times[1] > 3 && r.times[1] < 9, 'the line it did not hear is placed between its neighbours');
});
test('alignLyrics gives up (null) when the song was not really heard', () => {
  assert.equal(alignLyrics(['a long line of words nobody sang here at all'], [{ w: 'banana', t: 1 }, { w: 'tree', t: 2 }]), null);
  assert.equal(alignLyrics([], [{ w: 'x', t: 1 }]), null); assert.equal(alignLyrics(['x y z'], []), null);
});
test('toLrc writes [mm:ss.xx] before each line', () => {
  assert.equal(toLrc(['a', 'b'], [0, 75.5]), '[00:00.00]a\n[01:15.50]b');
});
