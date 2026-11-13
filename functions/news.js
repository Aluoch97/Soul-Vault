// /news  — the Soul Tribe newsletter.
//   GET  /news?unsub=<email>&token=...                       the unsubscribe link in every e-mail
//   GET  /news?survey=<loved|liked|meh>&video=..&email=..&token=...   the "what did you think?" links
//   POST /news {"action":"send"|"preview","token":"<NEWSLETTER_CRON_TOKEN>"}   called once an hour on Fridays by .github/workflows/newsletter.yml
// The old soulMATES Google script keeps its own copy of the list until you turn its trigger off (see CLAUDE.md).
import * as NL from './_lib/newsletter.js';

const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { 'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store' } });
const page = html => new Response(html, { status: 200, headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });

export async function onRequestGet({ request, env }) {
  if (!env.DB || !env.NEWSLETTER_SECRET) return page(NL.confirmationPage('Newsletter', 'This page is not set up yet. Reply to any of my emails and I will take care of it.'));
  const q = new URL(request.url).searchParams;
  try {
    const html = await NL.handleClick(env, { unsub: q.get('unsub'), survey: q.get('survey'), video: q.get('video'), email: q.get('email'), token: q.get('token') });
    return html ? page(html) : new Response('Not found', { status: 404 });
  } catch (e) { return page(NL.confirmationPage('Newsletter', 'Something went wrong on my end. Try the link again in a bit.')); }
}

export async function onRequestPost({ request, env }) {
  let body = {}; try { body = await request.json(); } catch (e) { /* empty */ }
  if (!env.NEWSLETTER_CRON_TOKEN || !NL.sameText(body.token, env.NEWSLETTER_CRON_TOKEN)) return json({ ok: false, error: 'Not allowed.' }, 401);
  if (!env.DB) return json({ ok: false, error: 'No database.' }, 503);
  try {
    if (body.action === 'preview') return json({ ok: true, result: await NL.preview(env) });
    if (body.action === 'send') return json({ ok: true, result: await NL.sendScheduled(env) });
    return json({ ok: false, error: 'Unknown action.' }, 400);
  } catch (e) { return json({ ok: false, error: String((e && e.message) || e) }, 500); }
}
