/* ── arrows on every row that scrolls sideways (shelves on the Music tab, Unreleased, Features, playlists, eras and photos on Lore) ──
   so people can see there is more to the right. A row gets a small wrapper with a left and a right arrow; an arrow only shows when there is more to scroll in that direction. */
const SCROLL_ROWS = '.hrow, .ctrack:not(.homeone), .loreeras';
function arrowsFor(row) {
  if (row.dataset.arrows) return;
  row.dataset.arrows = '1';
  const wrap = document.createElement('div'); wrap.className = 'scrollwrap';
  row.parentNode.insertBefore(wrap, row); wrap.appendChild(row);
  wrap.insertAdjacentHTML('beforeend', `<button type="button" class="sarrow l" aria-label="Scroll left" hidden>${I.back}</button><button type="button" class="sarrow r" aria-label="Scroll right" hidden><span class="flip">${I.back}</span></button>`);
  const bl = wrap.querySelector('.sarrow.l'), br = wrap.querySelector('.sarrow.r');
  const update = () => { const max = row.scrollWidth - row.clientWidth; bl.hidden = !(max > 4 && row.scrollLeft > 4); br.hidden = !(max > 4 && row.scrollLeft < max - 4); };
  const go = d => row.scrollBy({ left: d * Math.max(160, row.clientWidth * 0.8), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  bl.addEventListener('click', () => go(-1)); br.addEventListener('click', () => go(1));
  row.addEventListener('scroll', update, { passive: true });
  row.addEventListener('load', update, true);   // pictures arriving change the row's width
  if (window.ResizeObserver) { const ro = new ResizeObserver(update); ro.observe(row); [...row.children].slice(0, 40).forEach(c => ro.observe(c)); }
  window.addEventListener('resize', update);
  update(); setTimeout(update, 400);
}
let arrowsQueued = false;
function enhanceRows() { arrowsQueued = false; [...document.querySelectorAll('#main ' + SCROLL_ROWS.split(', ').join(', #main '))].forEach(arrowsFor); }
new MutationObserver(() => { if (!arrowsQueued) { arrowsQueued = true; requestAnimationFrame(enhanceRows); } }).observe($('#main'), { childList: true, subtree: true });
