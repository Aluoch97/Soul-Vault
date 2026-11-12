// PUT /upload?key=<object key>   (header x-owner-key)  — the owner's browser sends a song or a picture straight to our R2 bucket.
// Only two kinds of keys are accepted, so nothing else in the bucket can be touched:
//   img/<id>/<t|160|400|1200|1600>     pictures (covers, photos)
//   <release-slug>/<name>.<mp3|m4a|aac|ogg|wav>   streaming copies of songs
// An object that already exists is never overwritten (409), so the songs and pictures already there are safe.
const IMG = /^img\/[A-Za-z0-9_-]{6,80}\/(?:t|160|400|1200|1600)$/;
const AUD = /^[a-z0-9][a-z0-9-]{1,80}\/[a-z0-9][a-z0-9._-]{1,120}\.(?:mp3|m4a|aac|ogg|wav)$/;
const MAX = 95 * 1024 * 1024;   // a request body can be about 100 MB
const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function onRequestPut({ request, env }) {
  if (!env.MEDIA) return json({ ok: false, error: 'Uploads are not set up yet (storage is not connected).' }, 503);
  if (!env.OWNER_KEY || request.headers.get('x-owner-key') !== env.OWNER_KEY) return json({ ok: false, error: 'This link is missing its owner key.' }, 401);
  const key = new URL(request.url).searchParams.get('key') || '';
  const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const isImg = IMG.test(key), isAud = AUD.test(key);
  if (!isImg && !isAud) return json({ ok: false, error: 'That file name is not allowed.' }, 400);
  if (isImg && !/^image\/(jpeg|png|webp|gif|avif)$/.test(type)) return json({ ok: false, error: 'That is not a picture.' }, 400);
  if (isAud && !/^audio\//.test(type)) return json({ ok: false, error: 'That is not an audio file.' }, 400);
  const len = Number(request.headers.get('content-length') || 0);
  if (!len) return json({ ok: false, error: 'The file looks empty.' }, 400);
  if (len > MAX) return json({ ok: false, error: 'That file is over 95 MB. Make a smaller copy (an MP3 or AAC file) and try again.' }, 413);
  if (await env.MEDIA.head(key)) return json({ ok: false, error: 'A file with that name is already there.' }, 409);
  await env.MEDIA.put(key, request.body, { httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' } });
  return json({ ok: true, key, size: len });
}
