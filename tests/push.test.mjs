// Phone notifications: the message encryption (a pretend phone decrypts it), the signed token, who may subscribe and send, the daily limit, and phones that left.
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { withWorld } from './_helpers.mjs';
import * as P from '../functions/_lib/push.js';

const { b64u } = P, te = new TextEncoder();
async function phone() {
  const keys = await webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const auth = webcrypto.getRandomValues(new Uint8Array(16)), pub = new Uint8Array(await webcrypto.subtle.exportKey('raw', keys.publicKey));
  const hk = async (salt, ikm, info, n) => new Uint8Array(await webcrypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, await webcrypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), n * 8));
  const cat = (...p) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
  return {
    sub: { p256dh: b64u.encode(pub), auth: b64u.encode(auth) },
    async decrypt(body) {
      body = new Uint8Array(body); const salt = body.slice(0, 16), rs = new DataView(body.buffer, body.byteOffset).getUint32(16), idlen = body[20];
      assert.equal(rs, 4096); assert.equal(idlen, 65);
      const asPub = body.slice(21, 21 + idlen), cipher = body.slice(21 + idlen);
      const server = await webcrypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
      const ecdh = new Uint8Array(await webcrypto.subtle.deriveBits({ name: 'ECDH', public: server }, keys.privateKey, 256));
      const prk = await hk(auth, ecdh, cat(te.encode('WebPush: info\0'), pub, asPub), 32);
      const cek = await hk(salt, prk, te.encode('Content-Encoding: aes128gcm\0'), 16), nonce = await hk(salt, prk, te.encode('Content-Encoding: nonce\0'), 12);
      const plain = new Uint8Array(await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await webcrypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), cipher));
      assert.equal(plain[plain.length - 1], 2); return new TextDecoder().decode(plain.slice(0, -1));
    },
  };
}
async function vapidKeys() {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  return { publicKey: b64u.encode(new Uint8Array(await webcrypto.subtle.exportKey('raw', pair.publicKey))), privateKey: (await webcrypto.subtle.exportKey('jwk', pair.privateKey)).d };
}
const A = 'A'.repeat(87), B = 'B'.repeat(22);

test('the message is encrypted so only the phone can read it (accents and all); another phone cannot', async () => {
  const p = await phone(), body = await P.encryptPayload('{"title":"New music — Café ✓"}', p.sub);
  assert.equal(await p.decrypt(body), '{"title":"New music — Café ✓"}');
  assert.ok(!new TextDecoder().decode(body).includes('New music'));
  await assert.rejects((await phone()).decrypt(body));
  await assert.rejects(P.encryptPayload('x', { p256dh: 'AAAA', auth: p.sub.auth }), /bad p256dh/);
  await assert.rejects(P.encryptPayload('x', { p256dh: p.sub.p256dh, auth: 'AAAA' }), /bad auth/);
  await assert.rejects(P.encryptPayload('x'.repeat(4000), p.sub), /too long/);
});
test('the signed token (VAPID): right claims, a web-address subject, and a signature that verifies', async () => {
  const k = await vapidKeys(), now = Date.UTC(2026, 10, 17, 12);
  const h = await P.vapidHeader('https://fcm.googleapis.com/fcm/send/abc', 'https://soulnicolas.com', k.publicKey, k.privateKey, now);
  const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(h); assert.ok(m, h);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(b64u.decode(m[2]))), { aud: 'https://fcm.googleapis.com', exp: Math.floor(now / 1000) + 43200, sub: 'https://soulnicolas.com' });
  const pub = await webcrypto.subtle.importKey('raw', b64u.decode(k.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.ok(await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64u.decode(m[3]), te.encode(m[1] + '.' + m[2])));
});

const setup = async h => { Object.assign(h.env, await vapidKeys()); h.env.VAPID_PUBLIC_KEY = h.env.publicKey; h.env.VAPID_PRIVATE_KEY = h.env.privateKey; };
const join = (h, n, ip) => h.call('pushSubscribe', [{ endpoint: 'https://push.test/' + n + '-abcdefghijkl', p256dh: A, auth: B }], { ip });

test('pushInfo: public, and says off until both keys exist', async () => withWorld(async h => {
  assert.deepEqual((await h.call('pushInfo', [])).result, { on: false });
  await setup(h); const r = (await h.call('pushInfo', [])).result; assert.equal(r.on, true); assert.equal(r.key, h.env.VAPID_PUBLIC_KEY); assert.ok(!JSON.stringify(r).includes(h.env.VAPID_PRIVATE_KEY), 'the private key is never sent');
}));
test('subscribing: valid ones are saved (once per address), bad ones refused, a flood is stopped', async () => withWorld(async h => {
  assert.match((await join(h, 'x')).error, /not switched on/);
  await setup(h);
  assert.equal((await join(h, 'one')).ok, true); assert.equal((await join(h, 'one')).ok, true);
  assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM push_subs').first()).n, 1, 'the same address twice is one row');
  for (const bad of [{ endpoint: 'http://push.test/aaaaaaaaaa', p256dh: A, auth: B }, { endpoint: 'javascript:alert(1)aaaa', p256dh: A, auth: B }, { endpoint: 'https://push.test/a b', p256dh: A, auth: B },
    { endpoint: 'https://push.test/' + 'a'.repeat(700), p256dh: A, auth: B }, { endpoint: 'https://push.test/aaaaaaaa', p256dh: 'short', auth: B }, { endpoint: 'https://push.test/aaaaaaaa', p256dh: A, auth: 'x' }, null]) {
    const r = await h.call('pushSubscribe', [bad]); assert.match(r.error, /does not look like/, JSON.stringify(bad));
  }
  for (let i = 0; i < 10; i++) assert.equal((await join(h, 'f' + i, '198.51.100.9')).ok, true);
  assert.match((await join(h, 'f10', '198.51.100.9')).error, /Too many/, '10 an hour from one place');
  assert.equal((await join(h, 'f10', '198.51.100.10')).ok, true, 'someone else is fine');
}));
test('unsubscribing deletes the phone', async () => withWorld(async h => {
  await setup(h); await join(h, 'one');
  assert.equal((await h.call('pushUnsubscribe', ['https://push.test/one-abcdefghijkl'])).ok, true);
  assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM push_subs').first()).n, 0);
}));
test('only the owner can see the numbers or send; the public table cannot be read', async () => withWorld(async h => {
  await setup(h); await join(h, 'one');
  for (const fn of ['pushStatus', 'pushSend']) assert.equal((await h.call(fn, ['wrong', { title: 'Hi' }])).ok, false, fn + ' with a wrong key');
  assert.equal((await h.call('pushSend', [{ title: 'Hi' }])).ok, false, 'no key at all');
  assert.equal(h.pushed.length, 0);
  const st = (await h.owner('pushStatus')).result; assert.deepEqual([st.on, st.subscribers, st.sentToday, st.cap], [true, 1, 0, 3]);
}));
test('sending: every phone gets the encrypted message; the notification says what Nick wrote; bad links become "/"; the log records it', async () => withWorld(async h => {
  await setup(h); const ph = await phone(); await P.ensurePush(h.db);
  for (let i = 0; i < 3; i++) await h.db.prepare('INSERT INTO push_subs (endpoint, p256dh, auth, at, ip_hash) VALUES (?,?,?,?,?)').bind('https://push.test/p' + i + '-abcdefghijkl', ph.sub.p256dh, ph.sub.auth, i, 'x').run();
  const r = await h.owner('pushSend', { title: 'New\nmusic <b>out</b>', body: 'x'.repeat(400), url: 'https://evil.example/' });
  assert.deepEqual(r.result, { sent: 3, failed: 0, removed: 0 });
  assert.equal(h.pushed.length, 3); assert.ok(h.pushed[0].headers.authorization.startsWith('vapid t='));
  const msg = JSON.parse(await ph.decrypt(h.pushed[0].body)); assert.deepEqual([msg.title, msg.body.length, msg.url], ['New music <b>out</b>', 140, '/'], 'plain text, trimmed, and an outside link is replaced by the home page');
  const ok = await h.owner('pushSend', { title: 'Next show', body: 'x', url: '/tour' });
  assert.equal(ok.ok, true); assert.equal(JSON.parse(await ph.decrypt(h.pushed[3].body)).url, '/tour');
  const st = (await h.owner('pushStatus')).result; assert.equal(st.sentToday, 2); assert.equal(st.last.length, 2);
}));
test('sending needs a title and at least one subscriber, and says so plainly', async () => withWorld(async h => {
  await setup(h);
  assert.match((await h.owner('pushSend', { title: 'Hi' })).error, /Nobody has turned on/);
  await join(h, 'one'); assert.match((await h.owner('pushSend', { title: '  ' })).error, /Write a title/);
  assert.equal(h.pushed.length, 0);
}));
test('phones that left are removed, other failures are kept and counted, and a send that reached nobody does not use up the day', async () => withWorld(async h => {
  await setup(h); const ph = await phone();
  await P.ensurePush(h.db);
  for (const n of ['ok', 'gone', 'bad']) await h.db.prepare('INSERT INTO push_subs (endpoint, p256dh, auth, at, ip_hash) VALUES (?,?,?,?,?)').bind('https://push.test/' + n + '-abcdefghijkl', ph.sub.p256dh, ph.sub.auth, 1, 'x').run();
  h.pushStatus['https://push.test/gone-abcdefghijkl'] = 410; h.pushStatus['https://push.test/bad-abcdefghijkl'] = 500;
  assert.deepEqual((await h.owner('pushSend', { title: 'Hi' })).result, { sent: 1, failed: 1, removed: 1 });
  assert.deepEqual((await h.db.prepare('SELECT endpoint FROM push_subs ORDER BY endpoint').all()).results.map(r => r.endpoint.split('/').pop().split('-')[0]), ['bad', 'ok']);
  h.pushStatus['https://push.test/ok-abcdefghijkl'] = 500;
  const before = (await h.owner('pushStatus')).result.sentToday;
  assert.deepEqual((await h.owner('pushSend', { title: 'Hi again' })).result, { sent: 0, failed: 2, removed: 0 });
  assert.equal((await h.owner('pushStatus')).result.sentToday, before, 'nothing reached a phone, so the day is not used up');
}));
test('at most 3 a day, then a plain message; the 24 hours roll', async () => withWorld(async h => {
  await setup(h); const ph = await phone(); await P.ensurePush(h.db);
  await h.db.prepare('INSERT INTO push_subs (endpoint, p256dh, auth, at, ip_hash) VALUES (?,?,?,?,?)').bind('https://push.test/a-abcdefghijkl', ph.sub.p256dh, ph.sub.auth, 1, 'x').run();
  for (let i = 0; i < 3; i++) assert.equal((await h.owner('pushSend', { title: 'n' + i })).result.sent, 1);
  assert.match((await h.owner('pushSend', { title: 'n4' })).error, /already sent 3 notifications/);
  await h.db.prepare('UPDATE push_log SET at = at - ?').bind(25 * 3600e3).run();
  assert.equal((await h.owner('pushSend', { title: 'tomorrow' })).result.sent, 1);
}));
test('without the keys sending is refused and nothing is sent', async () => withWorld(async h => {
  await P.ensurePush(h.db);
  assert.match((await h.owner('pushSend', { title: 'Hi' })).error, /not switched on/); assert.equal(h.pushed.length, 0);
}));
