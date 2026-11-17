/* ── Support: the button on Home opens the NuRenaissance support page (public/support.html) right in the page, like the Soul Tribe card ── */
// Close puts the button back as it was. The page lists PayPal, Cash App, Venmo, Zelle and Apple Pay; each payment app itself opens in a new tab
// (those sites do not allow being shown inside another site). Nothing loads from the support page until the button is tapped.
function wireSupport() {
  const btn = $('.homepg [data-support-open]'); if (!btn) return;
  btn.addEventListener('click', () => {
    const panel = document.createElement('section');
    panel.id = 'supportpanel'; panel.className = 'supportpanel';
    panel.innerHTML = `<div class="tribehead"><div class="tt2"><b>Support</b> Nicólas Soul</div><button type="button" class="tribeclose" data-support-close aria-label="Close">✕</button></div>
      <iframe class="tribeframe supportframe" title="Support" src="/support?embed=1"></iframe>`;
    btn.replaceWith(panel);
    const f = panel.querySelector('iframe');
    const fit = () => { try { const d = f.contentDocument; if (d && d.body) f.style.height = Math.max(380, Math.ceil(d.documentElement.scrollHeight)) + 'px'; } catch (e) {} };
    f.addEventListener('load', () => { fit(); try { if (window.ResizeObserver) new ResizeObserver(fit).observe(f.contentDocument.body); } catch (e) {} });
    panel.querySelector('[data-support-close]').addEventListener('click', () => { panel.replaceWith(btn); btn.scrollIntoView({ block: 'center' }); });
    panel.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
}
