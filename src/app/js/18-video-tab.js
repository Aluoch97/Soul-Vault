/* ── Video tab: autoplay next ──
   YouTube's player (asked to report with `enablejsapi=1` in `wireYt`) says when the featured clip has ended; the Video tab then plays the next one (`S.videoNext`, set in renderVideo).
   Only the featured clip on the Video tab counts, never a clip on Home or Tour. iPhones may refuse to start the next clip without a tap: then the poster of the next clip is shown. */
window.addEventListener('message', e => {
  if (e.origin !== 'https://www.youtube-nocookie.com' || S.view !== 'video' || !S.videoNext) return;
  const fr = document.querySelector('.vidhero iframe'); if (!fr || e.source !== fr.contentWindow) return;
  let d = e.data; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (x) { return; } }
  const state = d && (d.event === 'onStateChange' ? d.info : d.event === 'infoDelivery' && d.info ? d.info.playerState : null);
  if (state === 0) { const next = S.videoNext; S.videoNext = null; next(); }   // 0 = ended
});
