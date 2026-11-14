/* ── Shop: CDs and merch with a link to a hosted checkout (Stripe Payment Link, Square, PayPal...). The site never handles payment. ──
   Items are edited in Studio > Shop. Home shows the items marked "Show on Home"; a release page shows the items tied to that release. */
const shopImg = id => id ? MEDIA_BASE + 'img/' + id + '/400' : '';
function shopCard(it) {
  const sold = !!it.sold_out;
  return `<article class="shopcard${sold ? ' sold' : ''}">${it.image ? `<img class="shopimg" src="${esc(shopImg(it.image))}" alt="" loading="lazy">` : ''}
    <div class="shopinfo"><b class="shopname">${esc(it.title)}</b>${it.price ? `<span class="shopprice">${esc(it.price)}</span>` : ''}${it.blurb ? `<p class="cs">${esc(it.blurb)}</p>` : ''}
      ${sold ? '<span class="pill soft shopbtn" aria-disabled="true">Sold out</span>' : `<a class="pill main shopbtn" href="${esc(it.buy_url)}" target="_blank" rel="noopener noreferrer">Buy${it.price ? ' · ' + esc(it.price) : ''}</a>`}</div></article>`;
}
function loadShop() {
  if (!S.shopP) S.shopP = run('getShop').then(r => (S.shop = Array.isArray(r) ? r : [])).catch(() => (S.shop = []));
  return S.shopP;
}
async function fillShop() {
  const items = await loadShop();
  const h = $('#shopHome'); if (h) { const list = items.filter(x => x.home !== false); h.innerHTML = list.length ? `<h2 class="lathead">Shop</h2><div class="shoplist">${list.map(shopCard).join('')}</div>` : ''; h.hidden = !list.length; }
  const r = $('#shopRel'); if (r) { const list = items.filter(x => x.release_id && x.release_id === S.releaseId); r.innerHTML = list.length ? `<div class="shoplist">${list.map(shopCard).join('')}</div>` : ''; }
}
// Studio > Shop: add, change and remove items. Nothing is saved until you tap Save shop.
const shopItemForm = (it, rels) => `<div class="shopitem" data-shop-item data-id="${esc(it.id || '')}" data-image="${esc(it.image || '')}">
  <div class="sf2"><label class="sf">Name<input class="field" data-sh="title" maxlength="80" value="${esc(it.title || '')}" placeholder="Rise of the Lost (CD)"></label><label class="sf">Price<input class="field" data-sh="price" maxlength="24" value="${esc(it.price || '')}" placeholder="$15"></label></div>
  <label class="sf">Short description<textarea class="field" data-sh="blurb" rows="2" maxlength="240" placeholder="Signed copy, ships from Nashville.">${esc(it.blurb || '')}</textarea></label>
  <label class="sf">Buy link (from Stripe: Payment Links, Copy link)<input class="field" data-sh="buy_url" type="url" inputmode="url" maxlength="600" value="${esc(it.buy_url || '')}" placeholder="https://buy.stripe.com/…"></label>
  <label class="sf">Also show on this release's page<select class="field" data-sh="release_id"><option value="">No release page</option>${rels.map(r => `<option value="${esc(r.release_id)}"${r.release_id === it.release_id ? ' selected' : ''}>${esc(r.title)} (${esc(r.year)})</option>`).join('')}</select></label>
  <div class="shopphoto"><span class="stuart">${it.image ? `<img src="${esc(shopImg(it.image))}" alt="" data-shop-prev>` : '<img alt="" data-shop-prev hidden>'}</span><button type="button" class="pill soft" data-shop-photo>${I.img}${it.image ? 'Change photo' : 'Add a photo'}</button><input type="file" accept="image/*" hidden data-shop-file></div>
  <div class="stuvis"><label class="chk"><input type="checkbox" data-sh="home" ${it.home === false ? '' : 'checked'}> <span><b>Show on Home</b><span class="cs">Appears in the Shop section on the Home page.</span></span></label>
    <label class="chk"><input type="checkbox" data-sh="sold_out" ${it.sold_out ? 'checked' : ''}> <span><b>Sold out</b><span class="cs">The button turns into "Sold out".</span></span></label></div>
  <div class="save"><button type="button" class="pill soft danger" data-shop-del>${I.trash}Remove this item</button></div></div>`;
async function wireShopEditor() {
  const box = $('#stuShopItems'); if (!box) return;
  const rels = (S.stu && S.stu.releases || []).slice().sort((a, b) => String(a.title).localeCompare(String(b.title)));
  const items = await loadShop(); if (!$('#stuShopItems')) return;
  const draw = list => { box.innerHTML = list.length ? list.map(it => shopItemForm(it, rels)).join('') : '<p class="cs">Nothing for sale yet. Tap Add an item.</p>'; };
  draw(items);
  const read = () => [...box.querySelectorAll('[data-shop-item]')].map(d => { const o = { id: d.dataset.id, image: d.dataset.image };
    d.querySelectorAll('[data-sh]').forEach(i => { o[i.dataset.sh] = i.type === 'checkbox' ? i.checked : i.value; }); return o; });
  $('#stuShopAdd').addEventListener('click', () => { const cur = read(); cur.push({ title: '', price: '', blurb: '', buy_url: '', home: true }); draw(cur); const last = [...box.querySelectorAll('[data-shop-item]')].pop(); if (last) last.querySelector('[data-sh="title"]').focus(); });
  box.addEventListener('click', e => {
    const del = e.target.closest('[data-shop-del]');
    if (del) { const d = del.closest('[data-shop-item]'); const cur = read(); cur.splice([...box.querySelectorAll('[data-shop-item]')].indexOf(d), 1); draw(cur); return; }
    const ph = e.target.closest('[data-shop-photo]'); if (ph) ph.closest('[data-shop-item]').querySelector('[data-shop-file]').click();
  });
  box.addEventListener('change', async e => {
    const f = e.target.closest('[data-shop-file]'); if (!f || !f.files[0]) return;
    const d = f.closest('[data-shop-item]'), st = $('#stuShopSt'), id = newImgId('c');
    try { st.textContent = 'Uploading the photo…'; await uploadPicture(f.files[0], id, ['t', '400']); d.dataset.image = id; const img = d.querySelector('[data-shop-prev]'); img.src = shopImg(id); img.hidden = false; st.textContent = 'Photo ready. Tap Save shop.'; }
    catch (er) { st.textContent = (er && er.message) || 'The photo did not upload.'; }
  });
  $('#stuShopSave').addEventListener('click', async e => {
    const b = e.currentTarget, st = $('#stuShopSt'); b.disabled = true; st.textContent = 'Saving…';
    try { const out = await run('saveShop', BOOT.key, read()); S.shop = out; S.shopP = Promise.resolve(out); draw(out); st.textContent = 'Saved'; toast('Shop saved'); }
    catch (er) { st.textContent = (er && er.message) || 'Could not save.'; }
    b.disabled = false;
  });
}
