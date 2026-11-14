// The Shop: things Nick sells (CDs, merch). Each item is a name, a price, a picture and a link to a hosted checkout (a Stripe Payment Link, Square, PayPal...),
// so the site never touches card details. Stored as one list in the kv table; anyone can read it, only the owner can change it.
const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(6))).map(b => b.toString(16).padStart(2, '0')).join('');
export const MAX_ITEMS = 20;
export function cleanItems(list) {
  if (!Array.isArray(list)) throw new Error('Send the list of items.');
  if (list.length > MAX_ITEMS) throw new Error('The shop can hold up to ' + MAX_ITEMS + ' items.');
  return list.map(it => {
    it = it || {};
    const title = cut(it.title, 80); if (!title) throw new Error('Every item needs a name.');
    const url = cut(it.buy_url, 600);
    if (!/^https:\/\/[^\s/@]+(\/[^\s]*)?$/i.test(url)) throw new Error('The buy link must start with https:// (in Stripe: Payment Links, open your link, Copy link).');
    const image = cut(it.image, 40); if (image && !/^c[0-9a-f]{20}$/.test(image)) throw new Error('That picture is not one of yours. Choose it again.');
    return { id: cut(it.id, 24).replace(/[^A-Za-z0-9]/g, '') || rid(), title, price: cut(it.price, 24), blurb: cut(it.blurb, 240), buy_url: url, image,
      release_id: cut(it.release_id, 80).replace(/[^A-Za-z0-9_-]/g, ''), sold_out: it.sold_out === true || it.sold_out === 'true', home: it.home !== false && it.home !== 'false' };
  });
}
export async function getShop(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)').run();
  const r = await db.prepare("SELECT v FROM kv WHERE k = 'shop'").first();
  try { const l = r && JSON.parse(r.v); return Array.isArray(l) ? l : []; } catch (e) { return []; }
}
export async function saveShop(db, list) {
  const items = cleanItems(list);
  await db.prepare('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)').run();
  await db.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES ('shop', ?)").bind(JSON.stringify(items)).run();
  return items;
}
