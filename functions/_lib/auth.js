// Owner password (so the long owner key never has to be found or typed).
// The password is stored only as a salted PBKDF2 hash in D1; logging in returns the owner key to the browser, which keeps it like it kept ?k=.
const ITER = 100000;   // the most Cloudflare Workers allow
const enc = new TextEncoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function derive(pw, salt) {
  const k = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, k, 256);
}
function same(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; }

export async function makeRecord(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: b64(salt), hash: b64(await derive(pw, salt)), iter: ITER, set_at: Date.now() };
}
export async function checkPassword(pw, rec) {
  if (!rec || !rec.salt || !rec.hash) return false;
  return same(new Uint8Array(await derive(pw, unb64(rec.salt))), unb64(rec.hash));
}
export const PW_MIN = 10;

// Five wrong tries from one address lock that address out for 15 minutes.
export const MAX_TRIES = 5, LOGIN_LOCK_MS = 15 * 60 * 1000;
export const failKey = ip => 'lf:' + String(ip || 'unknown').slice(0, 64);
