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

/* ── Video tab speed ──
   The last list is kept on this device and drawn at once; a fresh one is fetched in the background and swapped in only if it changed
   (and never while a video is playing). A few seconds after the app opens the list is warmed up, so the tab is usually already filled. */
const VIDEO_KEEP = 'sv_videolists';
function keptVideoLists() { try { const j = JSON.parse(localStorage.getItem(VIDEO_KEEP) || 'null'); return j && Array.isArray(j.lists) && j.lists.some(l => l.videos && l.videos.length) ? j.lists : null; } catch (e) { return null; } }
function loadVideoLists() {
  if (!S.videoP) S.videoP = runBase('getVideoLists').then(r => {
    const lists = (r && r.lists) || [];
    if (lists.some(l => l.videos && l.videos.length)) { try { localStorage.setItem(VIDEO_KEEP, JSON.stringify({ lists, at: Date.now() })); } catch (e) { /* storage full or blocked */ } }
    return lists;
  }).catch(() => null);
  return S.videoP;
}
setTimeout(() => { if (!S.videoLists) S.videoLists = keptVideoLists(); loadVideoLists(); }, 3000);
