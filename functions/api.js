// POST /api  { fn, args }  — same shape as the Apps Script web app, so the app needs no other change.
// Stage 1: `getShare` (the whole library, which was the slow call) is answered here from the D1 copy and cached at the edge for 60 s.
// Everything else is passed straight to Apps Script. If anything here fails, the call goes to Apps Script instead.
import cfg from '../site.config.json';
import { ERR_LINK, findShare, shareBody, bodyTtl, shareBlock } from './_lib/share.js';
import { loadLib, saveLib, readMeta } from './_lib/mirror.js';

const appsUrl = env => (env && env.APPS_URL) || cfg.api;
const FRESH_MS = 5 * 60 * 1000;      // refresh the copy when it is older than this
const LOCK_MS = 90 * 1000;           // one refresh at a time
const json = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: { 'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store' } });

async function proxy(env, text) {
  const r = await fetch(appsUrl(env), { method: 'POST', body: text, headers: { 'content-type': 'text/plain;charset=utf-8' }, redirect: 'follow' });
  return new Response(await r.text(), { status: r.status, headers: { 'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store' } });
}

// Refresh the copy from Apps Script (its getLibrary, using the owner key kept as a secret here).
export async function syncMirror(env, force) {
  if (!env.DB || !env.OWNER_KEY) throw new Error('Not set up (needs the DB binding and the OWNER_KEY secret).');
  const meta = await readMeta(env.DB);
  if (!force && meta && meta.lock && Date.now() - meta.lock < LOCK_MS) return meta;
  if (meta) await env.DB.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES ('meta', ?)").bind(JSON.stringify(Object.assign({}, meta, { lock: Date.now() }))).run().catch(() => {});
  const r = await fetch(appsUrl(env), { method: 'POST', body: JSON.stringify({ fn: 'getLibrary', args: [env.OWNER_KEY] }), headers: { 'content-type': 'text/plain;charset=utf-8' }, redirect: 'follow' });
  const j = await r.json();
  if (!j.ok) throw new Error('Apps Script said: ' + j.error);
  const lib = j.result;
  if (!lib || !Array.isArray(lib.releases) || !lib.releases.length || !Array.isArray(lib.tracks) || !lib.tracks.length) throw new Error('The library looked empty; keeping the old copy.');
  // Not needed to answer fans, and not worth keeping: the birthday, comment counts, backup state.
  return saveLib(env.DB, lib, { source: 'apps-script-getLibrary', build: lib.build || '' });
}

const mem = { at: 0, lib: null };   // kept for a minute inside a warm instance
async function library(ctx) {
  const { env } = ctx, now = Date.now();
  if (mem.lib && now - mem.at < 60000) return mem.lib;
  const lib = await loadLib(env.DB);
  if (!lib) { if (env.OWNER_KEY) ctx.waitUntil(syncMirror(env).catch(() => {})); return null; }
  mem.lib = lib; mem.at = now;
  ctx.waitUntil(readMeta(env.DB).then(m => { if (m && now - m.synced_at > FRESH_MS && env.OWNER_KEY) return syncMirror(env); }).catch(() => {}));
  return lib;
}

async function edgeShare(ctx, args) {
  const lib = await library(ctx);
  if (!lib) return null;                                   // not copied yet: Apps Script answers this one
  const now = new Date(), token = String(args[0] || '');
  const s = findShare(lib, token, now);
  if (!s) return { error: ERR_LINK };
  const cache = caches.default, key = new Request('https://edge.soulnicolas.invalid/gs1/' + encodeURIComponent(s.target_type) + '/' + encodeURIComponent(s.target_id || ''));
  let body, hit = await cache.match(key);
  if (hit) body = await hit.json();
  else {
    body = shareBody(s, lib, now);
    const ttl = bodyTtl(body, now, 60);
    ctx.waitUntil(cache.put(key, new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=' + ttl } })));
  }
  return Object.assign({}, body, { share: shareBlock(s) });
}

export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  const text = await request.text();
  let req; try { req = JSON.parse(text); } catch (e) { return json({ ok: false, error: 'Unknown action.' }); }
  const fn = req && req.fn, args = Array.isArray(req && req.args) ? req.args : [];
  try {
    if (fn === 'getShare' && env.DB) {
      const out = await edgeShare(ctx, args);
      if (out) return json({ ok: true, result: out });
    } else if (fn === 'edgeStatus') {
      const m = env.DB ? await readMeta(env.DB) : null;
      return json({ ok: true, result: { db: !!env.DB, owner_key: !!env.OWNER_KEY, synced_at: m ? m.synced_at : null, age_s: m ? Math.round((Date.now() - m.synced_at) / 1000) : null, counts: m ? m.counts : null } });
    } else if (fn === 'edgeSync') {
      if (!env.OWNER_KEY || String(args[0] || '') !== env.OWNER_KEY) return json({ ok: false, error: 'Not allowed.' });
      const m = await syncMirror(env, true); mem.lib = null;
      return json({ ok: true, result: { synced_at: m.synced_at, counts: m.counts } });
    }
  } catch (e) {
    if (fn === 'edgeSync') return json({ ok: false, error: String((e && e.message) || e) });
    // anything else: fall through to Apps Script
  }
  try { return await proxy(env, text); }
  catch (e) { return json({ ok: false, error: 'Could not reach Soul Vault. Check your internet connection.' }, 502); }
}
