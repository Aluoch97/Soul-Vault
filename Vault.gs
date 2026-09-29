/**
 * MUSIC VAULT — Web app (server side)
 * Add to the same Apps Script project as the importer: + › Script › name it "Vault".
 *
 * Owner link:  <web app URL>?k=<owner key>   (Soul Vault › Open my app)
 * Share link:  <web app URL>?s=<token>       (created from the app)
 *
 * Playback: when a file is played, it is set to "anyone with the link can view" so the
 * browser can stream it from Drive. Soul Vault › Lock files not in active shares
 * sets everything back to private except files inside a live share link.
 */

const VAULT_DL = 'https://drive.google.com/uc?export=download&id=';

/* ───────────────────────── Page ───────────────────────── */

const SV_BUILD = '51';

function doGet(e) {
  const p = (e && e.parameter) || {};
  // The app's code is served as its own script download (keeps the page small for Google's page writer).
  if (p.asset === 'app') {
    return ContentService.createTextOutput(appPart_('code')).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  const clean = function (x) { return String(x || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 64); };
  let api = '';
  try { api = appUrl_() || ''; } catch (err) {}
  const base = api || ScriptApp.getService().getUrl();
  const boot = JSON.stringify({ token: clean(p.s), key: clean(p.k), api: api }).replace(/</g, '\\u003c');
  const html = appPart_('page')
    .replace('__SV_BOOT__', function () { return boot; })
    .replace('__SV_APP_SRC__', function () { return base + '?asset=app&v=' + SV_BUILD; });
  const out = HtmlService.createHtmlOutput(html)
    .setTitle('Soul Vault')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  try { out.addMetaTag('apple-mobile-web-app-capable', 'yes'); } catch (err) {}
  try { out.addMetaTag('mobile-web-app-capable', 'yes'); } catch (err) {}
  try { const icon = setting_('icon_url'); if (icon) out.setFaviconUrl(icon); } catch (err) {}
  return out;
}

// Splits the single App file: 'page' = everything except the app code, 'code' = the app code.
function appPart_(which) {
  const raw = HtmlService.createHtmlOutputFromFile('App').getContent();
  const open = '<script id="sv-app">';
  const a = raw.indexOf(open);
  const b = raw.indexOf('</script>', a);
  if (a < 0 || b < 0) throw new Error('App file is missing its app code block.');
  if (which === 'code') return raw.slice(a + open.length, b);
  return raw.slice(0, a) + '<script src="__SV_APP_SRC__" onerror="svAppFailed()"></script>' + raw.slice(b + '</script>'.length);
}

/* ───────────────────────── App address ───────────────────────── */

// The web app URL comes from Settings › app_url (copied from Deploy › Manage deployments).
// Google's own lookup can return an outdated address, so it is only a fallback.
function setting_(key) {
  const cache = CacheService.getScriptCache();
  let map = null;
  const hit = cache.get('settings_v1');
  if (hit) { try { map = JSON.parse(hit); } catch (e) {} }
  if (!map) {
    map = {};
    const sh = sheet_('Settings');
    if (sh) sh.getDataRange().getValues().slice(1).forEach(function (r) { const k = String(r[0]).trim(); if (k) map[k] = String(r[1]).trim(); });
    try { cache.put('settings_v1', JSON.stringify(map), 60); } catch (e) {}
  }
  return map[key] || '';
}

function appUrl_() {
  const u = setting_('app_url');
  if (u.indexOf('/exec') > -1) return u.replace(/\?.*$/, '');
  return ScriptApp.getService().getUrl();
}

/* ───────────────────────── Owner access ───────────────────────── */

function ownerKey_() {
  const props = PropertiesService.getScriptProperties();
  let k = props.getProperty('OWNER_KEY');
  if (!k) { k = Utilities.getUuid().replace(/-/g, ''); props.setProperty('OWNER_KEY', k); }
  return k;
}
function isOwner_(key) { return !!key && key === ownerKey_(); }
function requireOwner_(key) { if (!isOwner_(key)) throw new Error('This link is missing its owner key. Open the app from Soul Vault › Open my app.'); }

function showAppLink() {
  const ui = SpreadsheetApp.getUi();
  const url = appUrl_();
  if (!url) {
    ui.alert('Deploy the web app first: Extensions › Apps Script › Deploy › New deployment › Web app.');
    return;
  }
  const link = url + '?k=' + ownerKey_();
  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;font-size:14px">' +
    '<p>Your private owner link. Bookmark it and keep it to yourself.</p>' +
    '<input style="width:100%;padding:6px" value="' + link + '" onclick="this.select()">' +
    '<p><a href="' + link + '" target="_blank">Open Soul Vault</a></p></div>'
  ).setWidth(540).setHeight(170);
  ui.showModalDialog(html, 'Soul Vault');
}

/* ───────────────────────── Data ───────────────────────── */

function sheet_(name) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); }

function readTable_(name) {
  const rng = sheet_(name).getDataRange();
  const v = rng.getValues();
  const h = v.shift().map(function (x) { return String(x).trim(); });
  // Song lengths like "3:19" can be auto-converted by Sheets into clock times; read those as displayed.
  const dCol = h.indexOf('duration');
  const shown = dCol > -1 ? rng.getDisplayValues().slice(1) : null;
  return v.map(function (r, i) {
    const o = { _row: i + 2 };
    h.forEach(function (k, j) {
      if (!k) return;
      if (j === dCol) { o[k] = durText_(r[j], shown[i][j]); return; }
      o[k] = r[j] instanceof Date ? r[j].toISOString() : r[j];
    });
    return o;
  }).filter(function (o) { return o[h[0]] !== '' && o[h[0]] != null; });
}

// "3:19" stays "3:19"; a cell Sheets turned into the time 3:19:00 comes back as "3:19".
function durText_(raw, shown) {
  if (raw === '' || raw == null) return '';
  const t = String(shown || raw).trim();
  const m = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (!m) return typeof raw === 'string' ? raw : '';
  if (raw instanceof Date || m[3] != null) return m[1] + ':' + m[2];
  return t;
}

function tables_() {
  return { releases: readTable_('Releases'), tracks: readTable_('Tracks'), versions: readTable_('Versions') };
}

function slimVersions_(vs) {
  return vs.map(function (v) {
    return {
      version_id: v.version_id, track_id: v.track_id, label: v.label, is_primary: v.is_primary === true,
      audio: v.audio_file_id, preview: v.preview_file_id || '', format: v.format,
      duration: v.duration, specs: v.specs, size_mb: v.size_mb, hidden: v.hidden === true
    };
  });
}

function sharesOut_(rows) {
  return rows.map(function (s) {
    return {
      token: s.token, target_type: s.target_type, target_id: s.target_id, label: s.label,
      allow_download: s.allow_download === true, expires: s.expires || '', active: s.active === true,
      plays: Number(s.plays) || 0, created: s.created || '', fan_name: s.fan_name || '', member_no: Number(s.member_no) || 0
    };
  });
}

function getLibrary(key) {
  requireOwner_(key);
  const T = tables_();
  return {
    releases: T.releases.map(function (r) {
      r.release_date = dateOnly_(r.release_date); r.made_from = monthOnly_(r.made_from); r.made_to = monthOnly_(r.made_to);
      const a = agesFor_(r); r.age_made = a.made; r.age_released = a.released;
      r.chapter_mode = String(r.chapter_mode || '').replace(/^'/, ''); return r;
    }),
    birth_date: dateOnly_(setting_('birth_date')),
    last_backup: String(setting_('last_backup') || '').replace(/^'/, ''),
    artist_bio: setting_('artist_bio'),
    nightly_backup: ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'nightlyBackup'; }),
    tracks: T.tracks, versions: slimVersions_(T.versions),
    shares: sharesOut_(readTable_('Shares')), base: appUrl_(),
    commentCounts: commentCounts_(), letter: letter_(), newsletter: newsletterUrl_(), extras: extrasFor_(null),
    stream_key: setting_('drive_api_key'), artist_links: artistLinks_(), playlists: playlistsFor_(null)
  };
}

/* ───────────────────────── Shares ───────────────────────── */

function liveShare_(s) {
  if (!s || s.active !== true) return false;
  if (s.expires && new Date(s.expires) < new Date()) return false;
  return true;
}

function findShare_(token) {
  if (!token) return null;
  const s = readTable_('Shares').filter(function (r) { return r.token === token; })[0];
  return liveShare_(s) ? s : null;
}

function shareScope_(s, T) {
  T = T || tables_();
  let tracks = [], versions = [];
  let locked = [];
  if (s.target_type === 'all') {
    const ok = {}, now = new Date();
    T.releases.forEach(function (r) {
      if (r.hidden === true) return;
      if (isLocked_(r, now)) locked.push(r); else ok[r.release_id] = true;
    });
    tracks = T.tracks.filter(function (t) { return ok[t.release_id]; });
  } else if (s.target_type === 'release') {
    tracks = T.tracks.filter(function (t) { return t.release_id === s.target_id; });
  } else if (s.target_type === 'track') {
    tracks = T.tracks.filter(function (t) { return t.track_id === s.target_id; });
  } else if (s.target_type === 'version') {
    versions = T.versions.filter(function (v) { return v.version_id === s.target_id; });
    const tid = versions[0] && versions[0].track_id;
    tracks = T.tracks.filter(function (t) { return t.track_id === tid; });
  }
  tracks = tracks.filter(function (t) { return t.hidden !== true; });
  if (s.target_type !== 'version') {
    const ids = {};
    tracks.forEach(function (t) { ids[t.track_id] = true; });
    versions = T.versions.filter(function (v) { return ids[v.track_id]; });
  }
  versions = versions.filter(function (v) { return v.hidden !== true; });
  const relIds = {};
  tracks.forEach(function (t) { relIds[t.release_id] = true; });
  return {
    releases: T.releases.filter(function (r) { return relIds[r.release_id]; }),
    tracks: tracks,
    versions: slimVersions_(versions),
    locked: locked
  };
}

function isLocked_(r, now) {
  if (!r.unlock_at) return false;
  const t = new Date(r.unlock_at);
  return !isNaN(t) && t > (now || new Date());
}

function getShare(token) {
  const s = findShare_(token);
  if (!s) return { error: 'This link has expired or been turned off. Ask the person who sent it for a new one.' };
  const sc = shareScope_(s);
  const relOut = function (r, isLockedRel) {
    return { release_id: r.release_id, title: r.title, year: r.year, type: r.type, cover_file_id: r.cover_file_id,
             cover_thumb: r.cover_thumb || '', world_tagline: r.world_tagline || '', world_story: r.world_story || '',
             world_color: r.world_color || '', world_mood: r.world_mood || '',
             album_credits: isLockedRel ? '' : (r.album_credits || ''), cover_type: r.cover_type || '',
             release_date: dateOnly_(r.release_date), recorded_at: r.recorded_at || '', artist_name: r.artist_name || '',
             age_made: agesFor_(r).made, age_released: agesFor_(r).released, bg_file_id: isLockedRel ? '' : (r.bg_file_id || ''),
             chapter_mode: String(r.chapter_mode || '').replace(/^'/, ''),
             series_name: r.series_name || '', series_part: String(r.series_part || '').replace(/^'/, ''),
             chapter_colors: r.chapter_colors || '', videos_meta: r.videos_meta || '', bg_style: r.bg_style || '',
             photos_meta: r.photos_meta || '', chapter_meta: r.chapter_meta || '', genre: r.genre || '', bsides_of: r.bsides_of || '',
             unlock_at: isLockedRel ? new Date(r.unlock_at).toISOString() : '', locked: !!isLockedRel };
  };
  return {
    releases: sc.releases.map(function (r) { return relOut(r, false); }).concat((sc.locked || []).map(function (r) { return relOut(r, true); })),
    tracks: sc.tracks.map(function (t) {
      return { track_id: t.track_id, release_id: t.release_id, track_no: t.track_no, title: t.title, artist: t.artist || '',
               features: t.features || '', producer: t.producer || '', engineer: t.engineer || '', bpm: t.bpm || '', key: t.key || '',
               video_url: t.video_url || '', lyrics: t.lyrics || '', voice_note_id: t.voice_note_id || '', chapter: t.chapter || '',
               category: t.category || 'Main', is_single: t.is_single === true,
               track_cover: t.track_cover || '', track_cover_thumb: t.track_cover_thumb || '',
               number_label: String(t.number_label || '').replace(/^'/, ''), genre: t.genre || '' };
    }),
    versions: sc.versions,
    shares: [],
    share: { target_type: s.target_type, allow_download: s.allow_download === true,
             fan_name: s.fan_name || '', member_no: Number(s.member_no) || 0, created: s.created || '' },
    letter: letter_(), newsletter: newsletterUrl_(),
    extras: extrasFor_(sc.releases.reduce(function (m, r) { m[r.release_id] = true; return m; }, {})),
    stream_key: setting_('drive_api_key'), artist_links: artistLinks_(), playlists: playlistsFor_(sc.tracks.reduce(function (m, t) { m[t.track_id] = true; return m; }, {}))
  };
}

function createShare(key, o) {
  requireOwner_(key);
  if (['release', 'track', 'version', 'all'].indexOf(o.targetType) === -1) throw new Error('Unknown share type.');
  if (o.targetType === 'all') o.targetId = 'all';
  const token = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  const days = Number(o.expiresDays) || 0;
  const expires = days ? new Date(Date.now() + days * 864e5) : '';
  const sh = ensureHeaders_('Shares');
  const fanName = o.targetType === 'all' ? String(o.fanName || '').trim().slice(0, 40) : '';
  let memberNo = '';
  if (fanName) {
    const nums = readTable_('Shares').map(function (x) { return Number(x.member_no) || 0; });
    memberNo = (nums.length ? Math.max.apply(null, nums) : 0) + 1;
  }
  const row = [token, o.targetType, String(o.targetId), String(o.label || '').slice(0, 120),
               !!o.allowDownload, expires, true, 0, new Date(), fanName, memberNo];
  sh.appendRow(row);
  const r = sh.getLastRow();
  sh.getRange(r, colOf_(sh, 'allow_download')).insertCheckboxes();
  sh.getRange(r, colOf_(sh, 'active')).insertCheckboxes();
  return { token: token, url: appUrl_() + '?s=' + token,
           expires: expires ? expires.toISOString() : '', fan_name: fanName, member_no: Number(memberNo) || 0 };
}

function setShareActive(key, token, active) {
  requireOwner_(key);
  const sh = sheet_('Shares');
  const s = readTable_('Shares').filter(function (r) { return r.token === token; })[0];
  if (!s) throw new Error('Share not found.');
  sh.getRange(s._row, colOf_(sh, 'active')).setValue(!!active);
  CacheService.getScriptCache().remove('scope_' + token);
  if (!active) lockUnshared_();
  return true;
}

function recordPlay(token) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) return false;
  try {
    const s = findShare_(token);
    if (!s) return false;
    const sh = sheet_('Shares');
    sh.getRange(s._row, colOf_(sh, 'plays')).setValue((Number(s.plays) || 0) + 1);
    return true;
  } finally {
    lock.releaseLock();
  }
}

// Finds a column by its header. If a newer column is missing (for example, the Sheet or the importer
// file is from an older build), it is added at the end instead of failing.
function colOf_(sh, name) {
  const last = Math.max(sh.getLastColumn(), 1);
  const h = sh.getRange(1, 1, 1, last).getValues()[0].map(function (x) { return String(x).trim(); });
  const i = h.indexOf(name);
  if (i > -1) return i + 1;
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(name)) throw new Error('Column "' + name + '" is missing on ' + sh.getName() + '.');
  const col = h[last - 1] === '' && last > 1 ? last : last + 1;
  sh.getRange(1, col).setValue(name).setFontWeight('bold');
  return col;
}

/* ───────────────────────── Files ───────────────────────── */

function allowedIds_(token) {
  if (!token) return null;
  const cache = CacheService.getScriptCache();
  const hit = cache.get('scope_' + token);
  if (hit) return hit === '-' ? null : JSON.parse(hit);
  const s = findShare_(token);
  if (!s) { cache.put('scope_' + token, '-', 60); return null; }
  const sc = shareScope_(s);
  const ids = {};
  sc.releases.concat(sc.locked || []).forEach(function (r) { if (r.cover_file_id) ids[r.cover_file_id] = 1; });
  sc.versions.forEach(function (v) { ids[v.audio] = 1; if (v.preview) ids[v.preview] = 1; ids['v:' + v.version_id] = 1; });
  sc.tracks.forEach(function (t) { if (t.voice_note_id) ids[t.voice_note_id] = 1; if (t.track_cover) ids[t.track_cover] = 1; });
  sc.releases.forEach(function (r) { if (r.bg_file_id) ids[r.bg_file_id] = 1; });
  const open = {};
  sc.releases.forEach(function (r) { open[r.release_id] = true; });
  extrasFor_(open).forEach(function (x) { if (x.file_id) ids[x.file_id] = 1; });
  const json = JSON.stringify(ids);
  let ttl = 120;   // re-checked every 2 minutes, or sooner if a drop unlocks before then
  (sc.locked || []).forEach(function (r) { ttl = Math.min(ttl, Math.max(5, Math.ceil((new Date(r.unlock_at) - new Date()) / 1000))); });
  if (json.length < 90000) cache.put('scope_' + token, json, ttl);
  return ids;
}

function canAccessFile_(fileId, key, token) {
  if (!fileId) return false;
  if (isOwner_(key)) return true;
  const ids = allowedIds_(token);
  return !!(ids && ids[fileId]);
}

function getCover(fileId, key, token, full) {
  if (!canAccessFile_(fileId, key, token)) return '';
  if (full) {
    const anim = animatedUrl_(fileId);   // GIF covers keep their animation
    if (anim) return anim;
    const big = driveThumb_(fileId, typeof full === 'number' ? Math.max(200, Math.min(1600, full)) : 1200);
    if (big) return big;
    try {
      const f = DriveApp.getFileById(fileId);
      if (f.getSize() < 3000000) {
        const b = f.getBlob();
        return 'data:' + (b.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(b.getBytes());
      }
    } catch (e) {}
  }
  const cache = CacheService.getScriptCache();
  const hit = cache.get('cov_' + fileId);
  if (hit) return hit;
  let blob = null;
  try { blob = DriveApp.getFileById(fileId).getThumbnail(); } catch (e) {}
  if (!blob) {
    try {
      const f = DriveApp.getFileById(fileId);
      if (f.getSize() < 400000) blob = f.getBlob();
    } catch (e) {}
  }
  if (!blob) return '';
  const url = 'data:' + (blob.getContentType() || 'image/png') + ';base64,' + Utilities.base64Encode(blob.getBytes());
  if (url.length < 95000) cache.put('cov_' + fileId, url, 21600);
  return url;
}

function prepareAudio(fileId, key, token, force) {
  if (!canAccessFile_(fileId, key, token)) throw new Error('This file is not part of your link.');
  if (force) CacheService.getScriptCache().remove('pub_' + fileId);   // re-check sharing instead of trusting the cache
  try { ensureLinkOpen_(fileId); }
  catch (e) { throw new Error('Drive would not open this file for playback (' + e.message + ').'); }
  const apiKey = setting_('drive_api_key');
  return {
    stream: apiKey ? 'https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media&key=' + encodeURIComponent(apiKey)
                   : VAULT_DL + fileId,
    download: VAULT_DL + fileId,
    viaApi: !!apiKey
  };
}

// Sets every audio file back to private unless it belongs to a live share.
function lockUnshared_() {
  const T = tables_();
  const keep = {};
  readTable_('Shares').filter(liveShare_).forEach(function (s) {
    const sc = shareScope_(s, T);
    sc.versions.forEach(function (v) {
      keep[v.audio] = true;
      if (v.preview) keep[v.preview] = true;
    });
    sc.tracks.forEach(function (t) { if (t.voice_note_id) keep[t.voice_note_id] = true; });
  });
  let locked = 0;
  const ids = [];
  T.versions.forEach(function (v) { ids.push(v.audio_file_id, v.preview_file_id); });
  T.tracks.forEach(function (t) { ids.push(t.voice_note_id); });
  [ids].forEach(function (list) {
    list.forEach(function (id) {
      if (!id || keep[id]) return;
      try {
        const f = DriveApp.getFileById(id);
        if (f.getSharingAccess() === DriveApp.Access.ANYONE_WITH_LINK) {
          f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
          CacheService.getScriptCache().remove('pub_' + id);
          locked++;
        }
      } catch (e) {}
    });
  });
  return locked;
}

function lockFiles() {
  const n = lockUnshared_();
  SpreadsheetApp.getActiveSpreadsheet().toast('Set ' + n + ' file(s) back to private.', 'Soul Vault', 8);
}

/* ───────────────────────── Maintenance ───────────────────────── */

function logClientError(message, mode) {
  console.error('Soul Vault page error (' + String(mode).slice(0, 10) + '): ' + String(message).slice(0, 500));
  return true;
}

function resetOwnerKey() {
  const ui = SpreadsheetApp.getUi();
  const ok = ui.alert('Reset owner key?', 'Your current owner link will stop working. Share links are not affected.', ui.ButtonSet.OK_CANCEL);
  if (ok !== ui.Button.OK) return;
  PropertiesService.getScriptProperties().deleteProperty('OWNER_KEY');
  showAppLink();
}

function nightlyLock() {
  try { lockUnshared_(); } catch (e) { console.error('Nightly lock failed: ' + e.message); }
}

function toggleNightlyLock() {
  const ui = SpreadsheetApp.getUi();
  const existing = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'nightlyLock'; });
  if (existing.length) {
    existing.forEach(function (t) { ScriptApp.deleteTrigger(t); });
    ui.alert('Nightly lock is off.');
  } else {
    ScriptApp.newTrigger('nightlyLock').timeBased().everyDays(1).atHour(4).create();
    ui.alert('Nightly lock is on. Every night around 4 a.m., files you played are set back to private unless a live share link uses them.');
  }
}

/* ───────────────────────── Owner edits ───────────────────────── */

function saveTracklist(key, releaseId, releaseTitle, items, releaseHidden, releaseType, chapterMode, chapterColors, chapterMeta) {
  requireOwner_(key);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Another save is running. Try again in a moment.');
  try {
    const tsh = ensureHeaders_('Tracks'), vsh = ensureHeaders_('Versions');
    const tracks = readTable_('Tracks'), versions = readTable_('Versions');
    const byId = {};
    tracks.forEach(function (r) { byId[r.track_id] = r; });
    const tTitle = {}, tNo = {}, tHid = {}, tCh = {}, tCat = {}, tSgl = {}, tNum = {}, tArt = {}, tGen = {}, vPri = {}, vHid = {};
    (items || []).forEach(function (it, i) {
      const r = byId[it.track_id];
      if (!r || r.release_id !== releaseId) return;
      const title = String(it.title || '').trim().slice(0, 200);
      if (title) tTitle[r._row] = title;
      tNo[r._row] = i + 1;
      if (it.hidden != null) tHid[r._row] = !!it.hidden;
      if (it.chapter != null) tCh[r._row] = String(it.chapter).trim().slice(0, 80);
      if (['Main', 'Deluxe', 'B-Side'].indexOf(it.category) > -1) tCat[r._row] = it.category;
      if (it.single != null) tSgl[r._row] = !!it.single;
      // Custom number shown for the song ("07", "15", "Intro", "7a"); play order still follows the list
      if (it.number != null) tNum[r._row] = cleanNumber_(it.number);
      // Song artist: who this song is by, when that differs from the project artist
      if (it.artist != null) tArt[r._row] = String(it.artist).trim().slice(0, 120);
      if (it.genre != null) tGen[r._row] = cleanGenre_(it.genre);
      const hv = {};
      (it.hiddenVersions || []).forEach(function (id) { hv[id] = true; });
      versions.filter(function (v) { return v.track_id === r.track_id; }).forEach(function (v) {
        if (it.primary) vPri[v._row] = v.version_id === it.primary;
        if (it.hiddenVersions) vHid[v._row] = !!hv[v.version_id];
      });
    });
    setCells_(tsh, 'title', tTitle); setCells_(tsh, 'track_no', tNo); setCells_(tsh, 'hidden', tHid); setCells_(tsh, 'chapter', tCh); setCells_(tsh, 'category', tCat); setCells_(tsh, 'is_single', tSgl);
    setCells_(tsh, 'number_label', tNum); setCells_(tsh, 'artist', tArt); setCells_(tsh, 'genre', tGen);
    setCells_(vsh, 'is_primary', vPri); setCells_(vsh, 'hidden', vHid);
    const t = String(releaseTitle || '').trim().slice(0, 120);
    const rsh = ensureHeaders_('Releases');
    const rr = readTable_('Releases').filter(function (x) { return x.release_id === releaseId; })[0];
    if (rr && t) rsh.getRange(rr._row, colOf_(rsh, 'title')).setValue(t);
    if (rr && releaseHidden != null) rsh.getRange(rr._row, colOf_(rsh, 'hidden')).setValue(!!releaseHidden);
    if (rr && releaseType && RELEASE_TYPES.indexOf(releaseType) > -1) rsh.getRange(rr._row, colOf_(rsh, 'type')).setValue(releaseType);
    // '2' = every song in a chapter carries its name (the Chapters panel); older saves only marked the first song
    if (rr && chapterMode === '2') rsh.getRange(rr._row, colOf_(rsh, 'chapter_mode')).setValue("'2");
    if (rr && chapterColors != null) rsh.getRange(rr._row, colOf_(rsh, 'chapter_colors')).setValue(cleanChapterColors_(chapterColors));
    if (rr && chapterMeta != null) rsh.getRange(rr._row, colOf_(rsh, 'chapter_meta')).setValue(cleanChapterMeta_(chapterMeta));
    CacheService.getScriptCache().removeAll(readTable_('Shares').map(function (s) { return 'scope_' + s.token; }));
    return true;
  } finally {
    lock.releaseLock();
  }
}

function uploadCover(key, releaseId, dataUrl, thumbUrl) {
  requireOwner_(key);
  const m = /^data:(image\/(jpeg|png|webp));base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('Upload a JPG, PNG, or WebP image.');
  const bytes = Utilities.base64Decode(m[3]);
  if (bytes.length > 8000000) throw new Error('That image is too large. Use one under 8 MB.');
  const rsh = sheet_('Releases');
  const r = readTable_('Releases').filter(function (x) { return x.release_id === releaseId; })[0];
  if (!r) throw new Error('Release not found.');
  let folder;
  try { folder = DriveApp.getFolderById(r.folder_id); } catch (e) { folder = DriveApp.getRootFolder(); }
  const ext = m[2] === 'jpeg' ? 'jpg' : m[2];
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HHmm');
  const file = folder.createFile(Utilities.newBlob(bytes, m[1], 'Soul Vault cover ' + stamp + '.' + ext));
  ensureHeaders_('Releases');
  rsh.getRange(r._row, colOf_(rsh, 'cover_file_id')).setValue(file.getId());
  const thumb = /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(String(thumbUrl || '')) && thumbUrl.length < 45000 ? thumbUrl : '';
  rsh.getRange(r._row, colOf_(rsh, 'cover_thumb')).setValue(thumb);
  rsh.getRange(r._row, colOf_(rsh, 'cover_type')).setValue('');
  return { fileId: file.getId(), dataUrl: dataUrl, thumb: thumb };
}

/* ───────────────────────── Sheet helpers ───────────────────────── */

// Makes sure a tab has its full, current header row (TABS lives in the importer file).
function ensureHeaders_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  const h = TABS[name];
  const cur = sh.getRange(1, 1, 1, h.length).getValues()[0].map(function (x) { return String(x).trim(); });
  if (cur.join('|') !== h.join('|')) {
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

// Writes several cells in one column at once: updates = { rowNumber: value }.
function setCells_(sh, colName, updates) {
  const rows = Object.keys(updates).map(Number);
  if (!rows.length) return;
  const c = colOf_(sh, colName);
  const min = Math.min.apply(null, rows), max = Math.max.apply(null, rows);
  const rng = sh.getRange(min, c, max - min + 1, 1);
  const vals = rng.getValues();
  rows.forEach(function (r) { vals[r - min][0] = updates[r]; });
  rng.setValues(vals);
}

/* ───────────────────────── Credits ───────────────────────── */

function saveTrackDetails(key, trackId, fields) {
  requireOwner_(key);
  const sh = ensureHeaders_('Tracks');
  const r = readTable_('Tracks').filter(function (x) { return x.track_id === trackId; })[0];
  if (!r) throw new Error('Song not found.');
  if (fields && fields.video_url != null) {
    const v = String(fields.video_url).trim();
    if (v && !ytId_(v)) throw new Error("That doesn't look like a YouTube link. Paste the full link from YouTube's Share button.");
  }
  ['features', 'producer', 'engineer', 'bpm', 'key', 'notes', 'video_url', 'lyrics', 'artist'].forEach(function (k) {
    if (fields && fields[k] != null) {
      const max = k === 'lyrics' ? 20000 : k === 'notes' ? 2000 : k === 'artist' ? 120 : 200;
      sh.getRange(r._row, colOf_(sh, k)).setValue(String(fields[k]).trim().slice(0, max));
    }
  });
  return true;
}

/* ───────────────────────── Uploads ───────────────────────── */

// Gives the owner's browser a short-lived Drive token and the folder to upload into.
function getUploadTicket(key, releaseId) {
  requireOwner_(key);
  const r = readTable_('Releases').filter(function (x) { return x.release_id === releaseId; })[0];
  if (!r) throw new Error('Release not found.');
  let folder;
  try { folder = DriveApp.getFolderById(r.folder_id); } catch (e) { folder = DriveApp.getRootFolder(); }
  const it = folder.getFoldersByName('Soul Vault uploads');
  const up = it.hasNext() ? it.next() : folder.createFolder('Soul Vault uploads');
  return { token: ScriptApp.getOAuthToken(), folderId: up.getId() };
}

function registerUpload(key, o) {
  requireOwner_(key);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Another save is running. Try again in a moment.');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const tsh = ensureHeaders_('Tracks'), vsh = ensureHeaders_('Versions');
    const file = DriveApp.getFileById(o.fileId);
    const name = file.getName(), ext = (name.match(/\.([^.]+)$/) || ['', ''])[1].toLowerCase();
    const tracks = readTable_('Tracks');
    let trackId = o.trackId, newTrack = null;
    if (trackId) {
      const t = tracks.filter(function (x) { return x.track_id === trackId; })[0];
      if (!t || t.release_id !== o.releaseId) throw new Error('Song not found in this release.');
    } else {
      const title = String(o.title || '').trim().slice(0, 200) || name.replace(/\.[^.]+$/, '');
      trackId = 'trk_' + hash_(o.releaseId + '|up|' + o.fileId);
      const nums = tracks.filter(function (x) { return x.release_id === o.releaseId; }).map(function (x) { return Number(x.track_no) || 0; });
      const no = (nums.length ? Math.max.apply(null, nums) : 0) + 1;
      newTrack = [trackId, o.releaseId, no, title, 'Main', '', '', '', '', '', false, '', '', '', '', '', '', false];
      appendRows_(ss, 'Tracks', [newTrack], []);
    }
    const makePrimary = !!newTrack || !!o.primary;
    if (makePrimary && !newTrack) {
      const upd = {};
      readTable_('Versions').filter(function (v) { return v.track_id === trackId; }).forEach(function (v) { upd[v._row] = false; });
      setCells_(vsh, 'is_primary', upd);
    }
    const info = ext === 'wav' ? wavInfo_(o.fileId, file.getSize()) : null;
    const seconds = info ? info.seconds : Number(o.duration) || 0;
    const row = [
      'ver_' + hash_(o.fileId), trackId, String(o.label || 'Original').slice(0, 60), makePrimary, o.fileId, ext.toUpperCase(),
      o.previewId || '', Math.round(file.getSize() / 1048576 * 10) / 10,
      seconds ? fmtDuration_(seconds) : '', info ? fmtSpecs_(info) : '',
      'Uploaded in Soul Vault: ' + name, new Date(), false
    ];
    appendRows_(ss, 'Versions', [row], [4]);
    return {
      track: newTrack ? { track_id: trackId, release_id: o.releaseId, track_no: newTrack[2], title: newTrack[3], category: 'Main',
                          features: '', bpm: '', key: '', notes: '', artist: '', hidden: false, producer: '', engineer: '' } : null,
      version: slimVersions_([{ version_id: row[0], track_id: trackId, label: row[2], is_primary: makePrimary, audio_file_id: o.fileId,
                                format: row[5], preview_file_id: row[6], size_mb: row[7], duration: row[8], specs: row[9], hidden: false }])[0]
    };
  } finally {
    lock.releaseLock();
  }
}

function setPreview(key, versionId, fileId) {
  requireOwner_(key);
  DriveApp.getFileById(fileId);   // throws if the file does not exist
  const sh = ensureHeaders_('Versions');
  const v = readTable_('Versions').filter(function (x) { return x.version_id === versionId; })[0];
  if (!v) throw new Error('Version not found.');
  sh.getRange(v._row, colOf_(sh, 'preview_file_id')).setValue(fileId);
  return true;
}

/* ───────────────────────── Comments ───────────────────────── */

function commentOut_(c, owner) {
  return { comment_id: c.comment_id, name: c.name, time_sec: Number(c.time_sec) || 0, text: c.text,
           created: c.created || '', resolved: c.resolved === true, via: owner ? c.token : undefined };
}

function getComments(key, token, versionId) {
  const owner = isOwner_(key);
  if (!owner) {
    const ids = allowedIds_(token);
    if (!ids || !ids['v:' + versionId]) return [];
  }
  ensureHeaders_('Comments');
  return readTable_('Comments')
    .filter(function (c) { return c.version_id === versionId && (owner || c.token === token || c.token === 'owner'); })
    .map(function (c) { return commentOut_(c, owner); })
    .sort(function (a, b) { return a.time_sec - b.time_sec; });
}

function addComment(key, token, versionId, timeSec, name, text) {
  const owner = isOwner_(key);
  text = String(text || '').trim().slice(0, 1000);
  name = owner ? (setting_('owner_name') || 'Nicólas Soul') : String(name || '').trim().slice(0, 60);
  if (!text) throw new Error('Write a note first.');
  if (!name) throw new Error('Add your name.');
  if (!owner) {
    const ids = allowedIds_(token);
    if (!ids || !ids['v:' + versionId]) throw new Error('This link can no longer comment on this song.');
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Busy. Try again in a moment.');
  try {
    const sh = ensureHeaders_('Comments');
    const tok = owner ? 'owner' : token;
    if (!owner && readTable_('Comments').filter(function (c) { return c.token === tok; }).length >= 300) {
      throw new Error('This link has reached its comment limit.');
    }
    const row = ['cmt_' + Utilities.getUuid().replace(/-/g, '').slice(0, 12), versionId, tok, name,
                 Math.max(0, Math.round((Number(timeSec) || 0) * 10) / 10), text, new Date(), false];
    sh.appendRow(row);
    sh.getRange(sh.getLastRow(), 8).insertCheckboxes();
    if (!owner) notifyComment_(versionId, name, row[4], text);
    return commentOut_({ comment_id: row[0], name: name, time_sec: row[4], text: text, created: row[6].toISOString(), resolved: false, token: tok }, owner);
  } finally {
    lock.releaseLock();
  }
}

function notifyComment_(versionId, name, t, text) {
  const to = setting_('notify_email');
  if (!to) return;
  try {
    const v = readTable_('Versions').filter(function (x) { return x.version_id === versionId; })[0];
    const tr = v && readTable_('Tracks').filter(function (x) { return x.track_id === v.track_id; })[0];
    const title = tr ? tr.title : 'a song';
    const at = Math.floor(t / 60) + ':' + ('0' + Math.floor(t % 60)).slice(-2);
    MailApp.sendEmail(to, 'Soul Vault: ' + name + ' commented on ' + title,
      name + ' left a note at ' + at + ' on ' + title + (v ? ' (' + v.label + ')' : '') + ':\n\n' + text + '\n\nOpen Soul Vault to reply or resolve it.');
  } catch (e) { console.error('Comment email failed: ' + e.message); }
}

function resolveComment(key, id, resolved) {
  requireOwner_(key);
  const sh = ensureHeaders_('Comments');
  const c = readTable_('Comments').filter(function (x) { return x.comment_id === id; })[0];
  if (!c) throw new Error('Comment not found.');
  sh.getRange(c._row, colOf_(sh, 'resolved')).setValue(!!resolved);
  return true;
}

function deleteComment(key, id) {
  requireOwner_(key);
  const sh = ensureHeaders_('Comments');
  const c = readTable_('Comments').filter(function (x) { return x.comment_id === id; })[0];
  if (!c) return true;
  sh.deleteRow(c._row);
  return true;
}

function commentCounts_() {
  const sh = sheet_('Comments');
  if (!sh || sh.getLastRow() < 2) return {};
  const out = {};
  readTable_('Comments').forEach(function (c) { if (c.token && c.token !== 'owner') out[c.token] = (out[c.token] || 0) + 1; });
  return out;
}

/* ───────────────────────── Backup connection ─────────────────────────
 * iPhone Safari can block Apps Script's built-in google.script.run channel.
 * The page then falls back to plain POST requests here. Only these functions
 * are reachable, and each one still checks the owner key or share token itself. */

function ping() { return { ok: true, at: new Date().toISOString() }; }

function doPost(e) {
  const API = {
    ping: ping, getLibrary: getLibrary, getShare: getShare, getCover: getCover, prepareAudio: prepareAudio,
    createShare: createShare, setShareActive: setShareActive, recordPlay: recordPlay,
    saveTracklist: saveTracklist, uploadCover: uploadCover, saveTrackDetails: saveTrackDetails,
    getUploadTicket: getUploadTicket, registerUpload: registerUpload, setPreview: setPreview,
    getComments: getComments, addComment: addComment, resolveComment: resolveComment, deleteComment: deleteComment, saveWorld: saveWorld,
    addExtra: addExtra, addPhoto: addPhoto, deleteExtra: deleteExtra, setAnimatedCover: setAnimatedCover,
    saveLetter: saveLetter, saveUnlock: saveUnlock, setVoiceNote: setVoiceNote, createRelease: createRelease, prepareRelease: prepareRelease,
    setDuration: setDuration, saveLyrics: saveLyrics, backupNow: backupNow, saveVideosMeta: saveVideosMeta,
    saveArtistLinks: saveArtistLinks, fetchLyrics: fetchLyrics, saveBio: saveBio, addYoutubeSong: addYoutubeSong,
    savePlaylist: savePlaylist, deletePlaylist: deletePlaylist, logListens: logListens, getInsights: getInsights, setTrackCover: setTrackCover, setReleaseBg: setReleaseBg,
    logClientError: logClientError
  };
  let out;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const fn = API.hasOwnProperty(req.fn) ? API[req.fn] : null;
    if (!fn) throw new Error('Unknown action.');
    out = { ok: true, result: fn.apply(null, Array.isArray(req.args) ? req.args : []) };
  } catch (err) {
    out = { ok: false, error: (err && err.message) || String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ───────────────────────── Videos + worlds ───────────────────────── */

// Pulls the 11-character video ID out of any common YouTube link.
function ytId_(u) {
  u = String(u || '').trim();
  const m = u.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{11})/) ||
            u.match(/^([A-Za-z0-9_-]{11})$/);
  return m ? m[1] : '';
}

function saveWorld(key, releaseId, f) {
  requireOwner_(key);
  const sh = ensureHeaders_('Releases');
  const r = readTable_('Releases').filter(function (x) { return x.release_id === releaseId; })[0];
  if (!r) throw new Error('Release not found.');
  f = f || {};
  const color = String(f.world_color || '').trim();
  if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) throw new Error('Theme color must look like #C8102E.');
  const vals = {
    world_tagline: String(f.world_tagline || '').trim().slice(0, 140),
    world_story: String(f.world_story || '').trim().slice(0, 12000),
    world_color: color,
    world_mood: String(f.world_mood || '').split(',').map(function (x) { return x.trim(); }).filter(String).slice(0, 8).join(', ').slice(0, 200),
    album_credits: String(f.album_credits || '').trim().slice(0, 4000),
    recorded_at: String(f.recorded_at || '').trim().slice(0, 140),
    artist_name: String(f.artist_name || '').trim().slice(0, 80),
    // Releases that share a series name are linked (a trilogy, a saga); part orders them
    series_name: String(f.series_name || '').trim().replace(/\s+/g, ' ').slice(0, 80),
    series_part: String(f.series_part || '').trim().slice(0, 12)
  };
  ['made_from', 'made_to'].forEach(function (k) {
    if (f[k] == null) return;
    const m = String(f[k]).trim();
    if (m && !/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) throw new Error('Made from/until should be a month and year.');
    vals[k] = m;
  });
  if (vals.made_from && vals.made_to && vals.made_from > vals.made_to) throw new Error('"Made from" should come before "Made until".');
  if (f.videos_meta != null) vals.videos_meta = cleanVideosMeta_(f.videos_meta);
  if (f.bg_style != null) vals.bg_style = cleanBgStyle_(f.bg_style);
  if (f.photos_meta != null) vals.photos_meta = cleanPhotosMeta_(f.photos_meta);
  if (f.genre != null) vals.genre = cleanGenre_(f.genre);
  if (f.bsides_of != null) vals.bsides_of = checkBsidesOf_(releaseId, String(f.bsides_of || '').trim());
  if (f.birth_date != null) {
    const b = String(f.birth_date).trim();
    if (b && !validDate_(b)) throw new Error('Birthday should be a real date.');
    setSettingValue_('birth_date', b ? "'" + b : '');
  }
  if (f.release_date != null) {
    const d = String(f.release_date).trim();
    if (d && !validDate_(d)) throw new Error('Release date should be a real date.');
    vals.release_date = d;
  }
  Object.keys(vals).forEach(function (k) {
    // "'" keeps dates as plain text so Sheets doesn't shift them by time zone
    const textDate = (k === 'release_date' || k === 'made_from' || k === 'made_to' || k === 'series_part') && vals[k];
    sh.getRange(r._row, colOf_(sh, k)).setValue(textDate ? "'" + vals[k] : vals[k]);
  });
  if (vals.release_date) sh.getRange(r._row, colOf_(sh, 'year')).setValue(Number(vals.release_date.slice(0, 4)));
  CacheService.getScriptCache().removeAll(readTable_('Shares').map(function (x) { return 'scope_' + x.token; }));
  const rr = readTable_('Releases').filter(function (x) { return x.release_id === releaseId; })[0];
  const ages = agesFor_(rr);
  vals.age_made = ages.made; vals.age_released = ages.released;
  return vals;
}

// Asks Drive for a resized copy of an image (long edge = size px). Returns '' if Drive has none yet.
function driveThumb_(id, size) {
  try {
    const auth = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
    const meta = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?fields=thumbnailLink',
                                   { headers: auth, muteHttpExceptions: true });
    if (meta.getResponseCode() !== 200) return '';
    const link = JSON.parse(meta.getContentText()).thumbnailLink;
    if (!link) return '';
    const img = UrlFetchApp.fetch(link.replace(/=s\d+(-[a-z]+)?$/, '=s' + size), { headers: auth, muteHttpExceptions: true });
    if (img.getResponseCode() !== 200) return '';
    const blob = img.getBlob(), bytes = blob.getBytes();
    if (bytes.length < 2000 || !/^image\//.test(blob.getContentType() || '')) return '';
    return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(bytes);
  } catch (e) {
    return '';
  }
}

/* ───────────────────────── Club: letter, drops, voice notes, newsletter ───────────────────────── */

const SOUL_TRIBE_URL = 'https://script.google.com/macros/s/AKfycbx22pIcJuFLQyN9VIvp4LDy9gcmXnaxxfsIc47JPKgI7D7Bq-SufKQWRk3nzX4TOqw6/exec';

function newsletterUrl_() {
  const u = setting_('newsletter_url');
  return /^https:\/\//.test(u) ? u : SOUL_TRIBE_URL;
}

function letter_() {
  const body = setting_('letter_body');
  if (!body) return null;
  return { title: setting_('letter_title') || 'A note from Nicólas', body: body, updated: setting_('letter_updated') };
}

function saveLetter(key, title, body) {
  requireOwner_(key);
  title = String(title || '').trim().slice(0, 80);
  body = String(body || '').trim().slice(0, 4000);
  const stamp = body ? new Date().toISOString() : '';
  setSettingValue_('letter_title', title);
  setSettingValue_('letter_body', body);
  setSettingValue_('letter_updated', stamp);
  return body ? { title: title || 'A note from Nicólas', body: body, updated: stamp } : null;
}

function setSettingValue_(k, v) {
  CacheService.getScriptCache().remove('settings_v1');
  const sh = sheet_('Settings');
  const vals = sh.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === k) { sh.getRange(i + 1, 2).setValue(v); return; }
  }
  sh.appendRow([k, v]);
}

// iso = the moment the fan club can hear it ('' clears the lock).
function saveUnlock(key, releaseId, iso) {
  requireOwner_(key);
  const sh = ensureHeaders_('Releases');
  const r = readTable_('Releases').filter(function (x) { return x.release_id === releaseId; })[0];
  if (!r) throw new Error('Release not found.');
  let v = '';
  if (iso) {
    const d = new Date(iso);
    if (isNaN(d)) throw new Error('That unlock date could not be read.');
    v = d.toISOString();
  }
  sh.getRange(r._row, colOf_(sh, 'unlock_at')).setValue(v);
  CacheService.getScriptCache().removeAll(readTable_('Shares').map(function (x) { return 'scope_' + x.token; }));
  return v;
}

function setVoiceNote(key, trackId, fileId) {
  requireOwner_(key);
  if (fileId) DriveApp.getFileById(fileId);   // throws if missing
  const sh = ensureHeaders_('Tracks');
  const t = readTable_('Tracks').filter(function (x) { return x.track_id === trackId; })[0];
  if (!t) throw new Error('Song not found.');
  sh.getRange(t._row, colOf_(sh, 'voice_note_id')).setValue(fileId || '');
  CacheService.getScriptCache().removeAll(readTable_('Shares').map(function (x) { return 'scope_' + x.token; }));
  return true;
}

/* ───────────────────────── New releases (owner only) ───────────────────────── */

const RELEASE_TYPES = ['Album', 'Mixtape', 'EP', 'Single', 'Live', 'Compilation', 'Other'];

// Creates "YEAR - Title" in the Discography folder and a Releases row.
// The release starts hidden from the fan club; the app applies your chosen visibility once every song is uploaded.
function createRelease(key, o) {
  requireOwner_(key);
  o = o || {};
  const title = String(o.title || '').trim().slice(0, 120);
  if (!title) throw new Error('Give the release a title.');
  const type = RELEASE_TYPES.indexOf(o.type) > -1 ? o.type : 'Other';
  const year = Math.round(Number(o.year));
  if (!(year >= 1990 && year <= 2100)) throw new Error('Year should look like 2026.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Another save is running. Try again in a moment.');
  try {
    const sh = ensureHeaders_('Releases');
    const existing = readTable_('Releases');
    let id = 'rel_' + year + '_' + slug_(title);
    if (existing.some(function (r) { return r.release_id === id; })) id += '_' + hash_(title + Date.now()).slice(0, 4);
    let root;
    try { root = DriveApp.getFolderById(setting_('root_folder_id') || CONFIG.ROOT_FOLDER_ID); }
    catch (e) { throw new Error('Could not open your Discography folder. Check root_folder_id in the Settings tab.'); }
    const safeName = (year + ' - ' + title).replace(/[\\\/:*?"<>|]/g, '-');
    const folder = root.createFolder(safeName);
    const row = TABS.Releases.map(function (h) {
      switch (h) {
        case 'release_id': return id;
        case 'year': return year;
        case 'title': return title;
        case 'type': return type;
        case 'folder_id': return folder.getId();
        case 'status': return year >= new Date().getFullYear() ? 'In progress' : 'Released';
        case 'hidden': return true;
        default: return '';
      }
    });
    sh.appendRow(row);
    const out = {};
    TABS.Releases.forEach(function (h, i) { out[h] = row[i]; });
    out.folder_url = folder.getUrl();
    return out;
  } finally {
    lock.releaseLock();
  }
}

/* ───────────────────────── Release pages as eras: extras, GIF covers, link previews ───────────────────────── */

const EXTRA_KINDS = ['review', 'app', 'video', 'link'];

function extrasFor_(relIds) {
  const sh = sheet_('Extras');
  if (!sh || sh.getLastRow() < 2) return [];
  return readTable_('Extras')
    .filter(function (x) { return !relIds || relIds[x.release_id]; })
    .map(function (x) {
      return { extra_id: x.extra_id, release_id: x.release_id, kind: x.kind, url: x.url || '', title: x.title || '',
               description: x.description || '', image: x.image || '', site: x.site || '', file_id: x.file_id || '', created: x.created || '' };
    });
}

function addExtra(key, releaseId, o) {
  requireOwner_(key);
  o = o || {};
  if (EXTRA_KINDS.indexOf(o.kind) === -1) throw new Error('Unknown item type.');
  const url = String(o.url || '').trim();
  if (!/^https?:\/\/[^\s]+$/i.test(url)) throw new Error('Paste a full link that starts with https://');
  if (!readTable_('Releases').some(function (r) { return r.release_id === releaseId; })) throw new Error('Release not found.');
  let meta = { title: '', description: '', image: '', site: hostOf_(url) };
  if (o.kind === 'video') {
    const id = ytId_(url), list = ytListId_(url);
    if (!id && !list) throw new Error("That doesn't look like a YouTube video or playlist link.");
    meta.image = id ? 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg' : '';
    meta.site = 'YouTube';
    meta.title = linkPreview_(url).title;
  } else {
    meta = linkPreview_(url);
  }
  const row = {
    extra_id: 'ext_' + Utilities.getUuid().replace(/-/g, '').slice(0, 12), release_id: releaseId, kind: o.kind, url: url,
    title: String(o.title || meta.title || meta.site || url).trim().slice(0, 200),
    description: String(o.description || meta.description || '').trim().slice(0, 500),
    image: meta.image, site: String(meta.site || '').slice(0, 80), file_id: '', created: new Date()
  };
  const sh = ensureHeaders_('Extras');
  sh.appendRow(TABS.Extras.map(function (h) { return row[h]; }));
  row.created = row.created.toISOString();
  return row;
}

function addPhoto(key, releaseId, fileId, caption) {
  requireOwner_(key);
  const f = DriveApp.getFileById(fileId);
  if (!/^image\//.test(f.getMimeType() || '') && !/\.(heic|heif)$/i.test(f.getName() || '')) throw new Error('That file is not an image.');
  const row = { extra_id: 'ext_' + Utilities.getUuid().replace(/-/g, '').slice(0, 12), release_id: releaseId, kind: 'photo', url: '',
                title: String(caption || '').trim().slice(0, 200), description: '', image: '', site: '', file_id: fileId, created: new Date() };
  const sh = ensureHeaders_('Extras');
  sh.appendRow(TABS.Extras.map(function (h) { return row[h]; }));
  CacheService.getScriptCache().removeAll(readTable_('Shares').map(function (x) { return 'scope_' + x.token; }));
  row.created = row.created.toISOString();
  return row;
}

function deleteExtra(key, id) {
  requireOwner_(key);
  const sh = ensureHeaders_('Extras');
  const x = readTable_('Extras').filter(function (e) { return e.extra_id === id; })[0];
  if (x) sh.deleteRow(x._row);
  return true;
}

// GIF covers: stored as-is so they animate; a still first frame is kept for the grid.
function setAnimatedCover(key, releaseId, fileId, thumbUrl) {
  requireOwner_(key);
  const f = DriveApp.getFileById(fileId);
  if ((f.getMimeType() || '') !== 'image/gif') throw new Error('Animated covers need to be GIF files.');
  const sh = ensureHeaders_('Releases');
  const r = readTable_('Releases').filter(function (x) { return x.release_id === releaseId; })[0];
  if (!r) throw new Error('Release not found.');
  const thumb = /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(String(thumbUrl || '')) && thumbUrl.length < 45000 ? thumbUrl : '';
  sh.getRange(r._row, colOf_(sh, 'cover_file_id')).setValue(fileId);
  sh.getRange(r._row, colOf_(sh, 'cover_thumb')).setValue(thumb);
  sh.getRange(r._row, colOf_(sh, 'cover_type')).setValue('gif');
  return { fileId: fileId, thumb: thumb };
}

// For GIFs: opens the file by link and returns a direct address so the browser streams and caches it.
function animatedUrl_(fileId) {
  try {
    const f = DriveApp.getFileById(fileId);
    // GIFs (animation) and AVIFs (Drive can't make previews of them) are served straight from Drive
    if (!isDirectImage_(f)) return '';
    const apiKey = setting_('drive_api_key');
    if (apiKey) {
      if (f.getSharingAccess() !== DriveApp.Access.ANYONE_WITH_LINK) f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return 'https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media&key=' + encodeURIComponent(apiKey);
    }
    if (f.getSize() < 6000000) return 'data:' + (isAvif_(f) ? 'image/avif' : 'image/gif') + ';base64,' + Utilities.base64Encode(f.getBlob().getBytes());
  } catch (e) {}
  return '';
}

function hostOf_(url) {
  const m = String(url).match(/^https?:\/\/(?:www\.)?([^\/?#:]+)/i);
  return m ? m[1] : '';
}

function decodeHtml_(t) {
  return String(t || '')
    .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(+d); })
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}

// Reads a page's preview tags (title, description, image, site name), the same ones texting apps use.
function linkPreview_(url) {
  const out = { title: '', description: '', image: '', site: hostOf_(url) };
  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SoulVaultPreview/1.0)', 'Accept': 'text/html' } });
    if (res.getResponseCode() >= 400) return out;
    const html = res.getContentText().slice(0, 400000);
    const meta = function (name) {
      const tags = html.match(/<meta\b[^>]*>/gi) || [];
      for (let i = 0; i < tags.length; i++) {
        const t = tags[i];
        const k = (t.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i) || [])[1];
        if (k && k.toLowerCase() === name) {
          const c = (t.match(/\bcontent\s*=\s*"([^"]*)"/i) || t.match(/\bcontent\s*=\s*'([^']*)'/i) || [])[1];
          if (c) return decodeHtml_(c);
        }
      }
      return '';
    };
    out.title = meta('og:title') || meta('twitter:title') || decodeHtml_((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
    out.description = meta('og:description') || meta('twitter:description') || meta('description');
    let img = meta('og:image') || meta('og:image:url') || meta('twitter:image');
    if (img && img.indexOf('//') === 0) img = 'https:' + img;
    else if (img && img.charAt(0) === '/') img = (url.match(/^https?:\/\/[^\/]+/i) || [''])[0] + img;
    out.image = /^https:\/\/[^\s"'<>]+$/i.test(img) ? img : '';
    out.site = meta('og:site_name') || out.site;
  } catch (e) {}
  out.title = out.title.slice(0, 200); out.description = out.description.slice(0, 500); out.site = String(out.site).slice(0, 80);
  return out;
}

/* ───────────────────────── Instant playback ───────────────────────── */

// Opens a file by link once, then remembers it for 6 hours so later taps skip the Drive check.
function ensureLinkOpen_(fileId) {
  const cache = CacheService.getScriptCache();
  if (cache.get('pub_' + fileId)) return;
  const f = DriveApp.getFileById(fileId);
  if (f.getSharingAccess() !== DriveApp.Access.ANYONE_WITH_LINK) f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  cache.put('pub_' + fileId, '1', 21600);
}

// Called in the background when a release opens: readies every song so a tap plays immediately.
function prepareRelease(key, token, releaseId) {
  let versions;
  if (isOwner_(key)) {
    const tids = {};
    readTable_('Tracks').forEach(function (t) { if (t.release_id === releaseId) tids[t.track_id] = true; });
    versions = slimVersions_(readTable_('Versions').filter(function (v) { return tids[v.track_id]; }));
  } else {
    const s = findShare_(token);
    if (!s) return { ready: [], key: '' };
    const sc = shareScope_(s);
    const tids = {};
    sc.tracks.forEach(function (t) { if (t.release_id === releaseId) tids[t.track_id] = true; });
    versions = sc.versions.filter(function (v) { return tids[v.track_id]; });
  }
  const ids = [];
  versions.sort(function (a, b) { return (b.is_primary === true) - (a.is_primary === true); })
          .forEach(function (v) { ids.push(v.preview || v.audio); if (v.preview) ids.push(v.audio); });
  const ready = [], start = Date.now();
  ids.forEach(function (id) {
    if (!id || Date.now() - start > 20000) return;   // stay well inside Apps Script's time limit
    try { ensureLinkOpen_(id); ready.push(id); } catch (e) {}
  });
  return { ready: ready, key: setting_('drive_api_key') };
}

/* ───────────────────────── Release date + runtime ───────────────────────── */

function validDate_(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return false;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return dt.getUTCFullYear() === +m[1] && dt.getUTCMonth() === +m[2] - 1 && dt.getUTCDate() === +m[3] && +m[1] >= 1990 && +m[1] <= 2100;
}

// Returns YYYY-MM-DD whether the cell held text or Sheets turned it into a date.
function dateOnly_(v) {
  if (!v) return '';
  const s = String(v).replace(/^'/, '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d)) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// The app measures a song the first time you play it; this saves the length if it was blank.
function setDuration(key, versionId, seconds) {
  requireOwner_(key);
  seconds = Number(seconds);
  if (!(seconds > 0 && seconds < 3 * 3600)) throw new Error('That length does not look right.');
  const sh = ensureHeaders_('Versions');
  const v = readTable_('Versions').filter(function (x) { return x.version_id === versionId; })[0];
  if (!v) throw new Error('Version not found.');
  if (String(v.duration || '').trim()) return v.duration;
  const out = fmtDuration_(seconds);
  sh.getRange(v._row, colOf_(sh, 'duration')).setValue("'" + out);
  return out;
}

/* ───────────────────────── Lyrics for a whole release ───────────────────────── */

// items = [{ track_id, lyrics }] for songs in this release; only these rows are touched.
function saveLyrics(key, releaseId, items) {
  requireOwner_(key);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Another save is running. Try again in a moment.');
  try {
    const sh = ensureHeaders_('Tracks');
    const byId = {};
    readTable_('Tracks').forEach(function (t) { byId[t.track_id] = t; });
    const upd = {};
    let saved = 0;
    (items || []).forEach(function (it) {
      const t = byId[it && it.track_id];
      if (!t || t.release_id !== releaseId) return;
      upd[t._row] = String(it.lyrics || '').replace(/\r\n?/g, '\n').trim().slice(0, 20000);
      saved++;
    });
    setCells_(sh, 'lyrics', upd);
    return saved;
  } finally {
    lock.releaseLock();
  }
}

/* ───────────────────────── Ages, song covers, page backgrounds ───────────────────────── */

function monthOnly_(v) {
  if (!v) return '';
  const s = String(v).replace(/^'/, '');
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d) ? '' : Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM');
}

// Whole years old on a given day.
function ageOn_(birth, y, m, d) {
  let a = y - birth[0];
  if (m < birth[1] || (m === birth[1] && d < birth[2])) a--;
  return a;
}

// Ages are worked out on the server so fans never receive the birthday itself.
function agesFor_(r) {
  const out = { made: '', released: '' };
  const b = dateOnly_(setting_('birth_date'));
  if (!r || !b) return out;
  const B = b.split('-').map(Number);
  const from = monthOnly_(r.made_from), to = monthOnly_(r.made_to), rel = dateOnly_(r.release_date);
  if (from || to) {
    const f = (from || to).split('-').map(Number), t = (to || from).split('-').map(Number);
    const lastDay = new Date(Date.UTC(t[0], t[1], 0)).getUTCDate();
    const a1 = ageOn_(B, f[0], f[1], 1), a2 = ageOn_(B, t[0], t[1], lastDay);
    if (a1 >= 0 && a2 >= 0) out.made = a1 === a2 ? String(a1) : a1 + '–' + a2;
  }
  if (rel) {
    const R = rel.split('-').map(Number), a = ageOn_(B, R[0], R[1], R[2]);
    if (a >= 0) out.released = String(a);
  }
  return out;
}

function setTrackCover(key, trackId, fileId, thumbUrl) {
  requireOwner_(key);
  if (fileId) {
    const f = DriveApp.getFileById(fileId);
    if (!/^image\//.test(f.getMimeType() || '')) throw new Error('Song covers need to be images.');
  }
  const sh = ensureHeaders_('Tracks');
  const t = readTable_('Tracks').filter(function (x) { return x.track_id === trackId; })[0];
  if (!t) throw new Error('Song not found.');
  const thumb = fileId && /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(String(thumbUrl || '')) && thumbUrl.length < 30000 ? thumbUrl : '';
  sh.getRange(t._row, colOf_(sh, 'track_cover')).setValue(fileId || '');
  sh.getRange(t._row, colOf_(sh, 'track_cover_thumb')).setValue(thumb);
  CacheService.getScriptCache().removeAll(readTable_('Shares').map(function (x) { return 'scope_' + x.token; }));
  return { fileId: fileId || '', thumb: thumb };
}

function setReleaseBg(key, releaseId, fileId) {
  requireOwner_(key);
  if (fileId) {
    const f = DriveApp.getFileById(fileId);
    if (!/^image\//.test(f.getMimeType() || '') && !isAvif_(f)) throw new Error('Backgrounds need to be images.');
  }
  const sh = ensureHeaders_('Releases');
  const r = readTable_('Releases').filter(function (x) { return x.release_id === releaseId; })[0];
  if (!r) throw new Error('Release not found.');
  sh.getRange(r._row, colOf_(sh, 'bg_file_id')).setValue(fileId || '');
  CacheService.getScriptCache().removeAll(readTable_('Shares').map(function (x) { return 'scope_' + x.token; }));
  return fileId || '';
}

function isAvif_(f) { return (f.getMimeType() || '') === 'image/avif' || /\.avif$/i.test(f.getName() || ''); }
function isDirectImage_(f) { return (f.getMimeType() || '') === 'image/gif' || isAvif_(f); }

// Up to 6 letters, digits, dots or dashes. "'" keeps "07" from turning into 7 in the Sheet.
function cleanNumber_(v) {
  const t = String(v || '').trim().replace(/[^A-Za-z0-9.\-]/g, '').slice(0, 6);
  return t ? "'" + t : '';
}

/* ───────────────────────── Backups ───────────────────────── */

const BACKUPS_KEPT = 30;

// "Soul Vault backups" sits next to your Sheet in Drive.
function backupFolder_() {
  const id = setting_('backup_folder_id');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const ssFile = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId());
  const parents = ssFile.getParents();
  const folder = (parents.hasNext() ? parents.next() : DriveApp.getRootFolder()).createFolder('Soul Vault backups');
  setSettingValue_('backup_folder_id', folder.getId());
  return folder;
}

// A full copy of the Sheet (every tab), dated. Keeps the newest 30 and moves older ones to the trash.
function makeBackup_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HHmm');
  const folder = backupFolder_();
  const copy = DriveApp.getFileById(ss.getId()).makeCopy(ss.getName() + ' backup ' + stamp, folder);
  const all = [], it = folder.getFiles();
  while (it.hasNext()) { const f = it.next(); if (/ backup \d{4}-\d{2}-\d{2}/.test(f.getName()) && !f.isTrashed()) all.push(f); }
  all.sort(function (a, b) { return b.getDateCreated().getTime() - a.getDateCreated().getTime(); });
  all.slice(BACKUPS_KEPT).forEach(function (f) { f.setTrashed(true); });
  const when = new Date().toISOString();
  setSettingValue_('last_backup', "'" + when);
  return { name: copy.getName(), url: copy.getUrl(), folderUrl: folder.getUrl(), kept: Math.min(all.length, BACKUPS_KEPT), at: when };
}

function backupNow(key) {
  requireOwner_(key);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('A backup is already running. Try again in a moment.');
  try { return makeBackup_(); } finally { lock.releaseLock(); }
}

function nightlyBackup() {
  try { makeBackup_(); } catch (e) { console.error('Nightly backup failed: ' + e.message); }
}

function toggleNightlyBackup() {
  const ui = SpreadsheetApp.getUi();
  const existing = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'nightlyBackup'; });
  if (existing.length) {
    existing.forEach(function (t) { ScriptApp.deleteTrigger(t); });
    ui.alert('Nightly backups are off.');
  } else {
    ScriptApp.newTrigger('nightlyBackup').timeBased().everyDays(1).atHour(3).create();
    const b = makeBackup_();
    ui.alert('Nightly backups are on. Every night around 3 a.m. a full copy of this Sheet is saved to the "Soul Vault backups" folder (newest ' + BACKUPS_KEPT + ' kept). First backup made just now: ' + b.name);
  }
}

function backupFromMenu() {
  const b = makeBackup_();
  SpreadsheetApp.getUi().alert('Backed up: ' + b.name + '\n\nIt is in the "Soul Vault backups" folder next to this Sheet.');
}

/* ───────────────────────── Listening insights ───────────────────────── */

const LISTEN_OUTCOMES = { complete: 1, partial: 1, skip: 1 };
const LISTEN_MAX_PER_DEVICE_HOUR = 120;   // a device can't play 120 songs in an hour
const LISTEN_MAX_PER_LINK_HOUR = 3000;    // one shared link, many fans
const LISTEN_MAX_ROWS = 400000;           // stays well under Google Sheets' size limit

// Batches of plays from the app. Only songs this visitor can actually hear are accepted.
// A play is 30s+; shorter listens you move on from are skips. device_id is a random per-device id (no names).
function logListens(key, token, deviceId, events) {
  const owner = isOwner_(key);
  let shareTok = 'owner', allowed = null;
  if (!owner) {
    const s = findShare_(token); if (!s) return 0;
    shareTok = s.token; allowed = {};
    shareScope_(s).versions.forEach(function (v) { allowed[v.version_id] = true; });
  }
  const vTrack = {}, tRel = {};
  readTable_('Versions').forEach(function (v) { vTrack[v.version_id] = v.track_id; });
  readTable_('Tracks').forEach(function (t) { tRel[t.track_id] = t.release_id; });
  const dev = String(deviceId || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 40);
  const now = Date.now(), rows = [];
  // Flood protection. Real listening is a few plays per hour per person; these caps only stop scripted spam.
  const cache = CacheService.getScriptCache(), hour = Math.floor(now / 3600000);
  const kDev = 'lq_d_' + hour + '_' + shareTok + '_' + dev, kTok = 'lq_t_' + hour + '_' + shareTok;
  const usedDev = Number(cache.get(kDev) || 0), usedTok = Number(cache.get(kTok) || 0);
  const room = Math.min(LISTEN_MAX_PER_DEVICE_HOUR - usedDev, (owner ? Infinity : LISTEN_MAX_PER_LINK_HOUR) - usedTok);
  if (room <= 0) return 0;
  const sh0 = sheet_('Listens');
  if (sh0 && sh0.getLastRow() > LISTEN_MAX_ROWS) { console.error('Listens tab is full (' + LISTEN_MAX_ROWS + ' rows). Archive it to keep counting.'); return 0; }
  (events || []).slice(0, 60).forEach(function (e) {
    if (!e || !vTrack[e.v] || (allowed && !allowed[e.v]) || !LISTEN_OUTCOMES[e.o]) return;
    const sec = Math.round(Number(e.s)), pct = Math.round(Number(e.p));
    if (!(sec >= 0 && sec <= 7200) || !(pct >= 0 && pct <= 100)) return;
    const ago = Math.min(7 * 86400, Math.max(0, Number(e.ago) || 0));
    const tid = vTrack[e.v];
    rows.push({ at: new Date(now - ago * 1000), track_id: tid, version_id: e.v, release_id: tRel[tid] || '', share_token: shareTok,
                device_id: dev, seconds: sec, pct: pct, outcome: e.o, device: e.d === 'phone' ? 'phone' : 'desktop' });
  });
  if (rows.length > room) rows.length = room;
  if (!rows.length) return 0;
  cache.put(kDev, String(usedDev + rows.length), 3700); cache.put(kTok, String(usedTok + rows.length), 3700);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Busy, will retry.');
  try {
    const sh = ensureHeaders_('Listens');
    const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, head.length).setValues(rows.map(function (r) { return head.map(function (h) { return r[h] != null ? r[h] : ''; }); }));
  } finally { lock.releaseLock(); }
  return rows.length;
}

function getInsights(key, days, includeOwner) {
  requireOwner_(key);
  days = Number(days) || 0;
  const out = { days: days, totals: { plays: 0, skips: 0, listeners: 0, seconds: 0, finishRate: 0 }, perDay: [], songs: [], skipped: [], releases: [], links: [] };
  const sh = sheet_('Listens');
  if (!sh || sh.getLastRow() < 2) return out;
  const since = days > 0 ? Date.now() - days * 864e5 : 0;
  const L = readTable_('Listens').filter(function (x) {
    const t = new Date(x.at).getTime();
    return t >= since && (includeOwner || x.share_token !== 'owner');
  });
  const T = {}, Rl = {}, Sh = {};
  readTable_('Tracks').forEach(function (t) { T[t.track_id] = t; });
  readTable_('Releases').forEach(function (r) { Rl[r.release_id] = r; });
  readTable_('Shares').forEach(function (s) { Sh[s.token] = s; });
  const tz = Session.getScriptTimeZone(), song = {}, relA = {}, link = {}, day = {}, devs = {};
  let complete = 0;
  L.forEach(function (x) {
    const play = x.outcome !== 'skip';
    const sg = song[x.track_id] = song[x.track_id] || { plays: 0, complete: 0, skips: 0 };
    if (play) { sg.plays++; out.totals.plays++; if (x.outcome === 'complete') { sg.complete++; complete++; } }
    else { sg.skips++; out.totals.skips++; }
    out.totals.seconds += Number(x.seconds) || 0;
    if (x.device_id) devs[x.device_id] = 1;
    if (play) relA[x.release_id] = (relA[x.release_id] || 0) + 1;
    const lk = link[x.share_token] = link[x.share_token] || { plays: 0, devs: {} };
    if (play) lk.plays++;
    if (x.device_id) lk.devs[x.device_id] = 1;
    if (play) { const d = Utilities.formatDate(new Date(x.at), tz, 'yyyy-MM-dd'); day[d] = (day[d] || 0) + 1; }
  });
  out.totals.listeners = Object.keys(devs).length;
  out.totals.finishRate = out.totals.plays ? Math.round(complete / out.totals.plays * 100) : 0;
  const span = days > 0 ? Math.min(days, 31) : 30;
  for (let i = span - 1; i >= 0; i--) {
    const d = Utilities.formatDate(new Date(Date.now() - i * 864e5), tz, 'yyyy-MM-dd');
    out.perDay.push({ d: d, n: day[d] || 0 });
  }
  const name = function (tid) { const t = T[tid] || {}, r = Rl[t.release_id] || {}; return { title: t.title || '(removed song)', release: r.title || '' }; };
  out.songs = Object.keys(song).map(function (tid) {
    const g = song[tid], heard = g.plays + g.skips;
    return Object.assign(name(tid), { track_id: tid, plays: g.plays, finish: g.plays ? Math.round(g.complete / g.plays * 100) : 0, skip: heard ? Math.round(g.skips / heard * 100) : 0, heard: heard });
  }).sort(function (a, b) { return b.plays - a.plays || b.finish - a.finish; });
  out.skipped = out.songs.filter(function (x) { return x.heard >= 3 && x.skip > 0; }).sort(function (a, b) { return b.skip - a.skip || b.heard - a.heard; }).slice(0, 8);
  out.songs = out.songs.filter(function (x) { return x.plays > 0; }).slice(0, 15);
  out.releases = Object.keys(relA).map(function (rid) { return { release_id: rid, title: (Rl[rid] || {}).title || '(removed release)', plays: relA[rid] }; })
    .sort(function (a, b) { return b.plays - a.plays; }).slice(0, 10);
  out.links = Object.keys(link).map(function (tok) {
    const s = Sh[tok] || {}, lb = tok === 'owner' ? 'You' : (s.fan_name || s.label || (s.target_type === 'all' ? 'Fan club link' : 'Share link'));
    return { label: String(lb), plays: link[tok].plays, listeners: Object.keys(link[tok].devs).length, active: tok === 'owner' || String(s.active) !== 'false' };
  }).sort(function (a, b) { return b.plays - a.plays; });
  return out;
}

// { "Chapter I: Descent": "#34C27A", ... } → stored as JSON on the release. Only real #RRGGBB colors are kept.
function cleanChapterColors_(m) {
  const out = {};
  if (m && typeof m === 'object') Object.keys(m).slice(0, 40).forEach(function (k) {
    const name = String(k).trim().slice(0, 80), c = String(m[k] || '').trim();
    if (name && /^#[0-9a-fA-F]{6}$/.test(c)) out[name] = c.toUpperCase();
  });
  return Object.keys(out).length ? JSON.stringify(out) : '';
}

// Video order and type for a release: { order: ["t:<track_id>", "x:<extra_id>", ...], types: { key: "music" | "film" } }
function cleanVideosMeta_(v) {
  let m = v;
  if (typeof m === 'string') { try { m = JSON.parse(m || '{}'); } catch (e) { m = {}; } }
  const keyOk = function (k) { return /^(t|x):[A-Za-z0-9_\-]{1,80}$/.test(String(k)); };
  const order = [], seen = {};
  ((m && m.order) || []).slice(0, 200).forEach(function (k) { if (keyOk(k) && !seen[k]) { seen[k] = 1; order.push(String(k)); } });
  const types = {};
  Object.keys((m && m.types) || {}).slice(0, 200).forEach(function (k) { const t = m.types[k]; if (keyOk(k) && ['music', 'film', 'live', 'trailer', 'bts'].indexOf(t) > -1) types[k] = t; });
  return order.length || Object.keys(types).length ? JSON.stringify({ order: order, types: types }) : '';
}

// Background picture: how it fills the page. { fit: "cover" | "contain", x: 0-100, y: 0-100, dim: 0-95 }
function cleanBgStyle_(v) {
  let m = v;
  if (typeof m === 'string') { try { m = JSON.parse(m || '{}'); } catch (e) { m = {}; } }
  if (!m || typeof m !== 'object') return '';
  const n = function (x, lo, hi, d) { x = Number(x); return isFinite(x) ? Math.max(lo, Math.min(hi, Math.round(x))) : d; };
  const out = { fit: m.fit === 'contain' ? 'contain' : 'cover', x: n(m.x, 0, 100, 50), y: n(m.y, 0, 100, 50), dim: n(m.dim, 0, 100, 72) };
  return out.fit === 'cover' && out.x === 50 && out.y === 50 && out.dim === 72 ? '' : JSON.stringify(out);
}

// Changes only the video order/types of a release (used by the Edit button on a video card).
function saveVideosMeta(key, releaseId, meta) {
  requireOwner_(key);
  const sh = ensureHeaders_('Releases');
  const r = readTable_('Releases').filter(function (x) { return x.release_id === releaseId; })[0];
  if (!r) throw new Error('Release not found.');
  const v = cleanVideosMeta_(meta);
  sh.getRange(r._row, colOf_(sh, 'videos_meta')).setValue(v);
  CacheService.getScriptCache().removeAll(readTable_('Shares').map(function (x) { return 'scope_' + x.token; }));
  return v;
}

/* ───────────────────────── Round 2: photos, chapters, artist links, lyrics from a link ───────────────────────── */

const safeJson_ = function (v) { if (v && typeof v === 'object') return v; try { return JSON.parse(v || '{}') || {}; } catch (e) { return {}; } };
const idOk_ = function (k) { return /^[A-Za-z0-9_\-]{1,80}$/.test(String(k)); };

// { order: [extra_id], cat: { id: "cover" | "shoot" }, group: { id: "Group name" }, credits: "text" }
function cleanPhotosMeta_(v) {
  const m = safeJson_(v), out = { order: [], cat: {}, group: {}, credits: '' }, seen = {};
  (m.order || []).slice(0, 500).forEach(function (k) { if (idOk_(k) && !seen[k]) { seen[k] = 1; out.order.push(String(k)); } });
  Object.keys(m.cat || {}).slice(0, 500).forEach(function (k) { if (idOk_(k) && ['cover', 'shoot', 'bts', 'social'].indexOf(m.cat[k]) > -1) out.cat[k] = m.cat[k]; });
  Object.keys(m.group || {}).slice(0, 500).forEach(function (k) { const g = String(m.group[k] || '').trim().slice(0, 80); if (idOk_(k) && g) out.group[k] = g; });
  out.credits = String(m.credits || '').replace(/\r\n?/g, '\n').trim().slice(0, 2000);
  return out.order.length || Object.keys(out.cat).length || Object.keys(out.group).length || out.credits ? JSON.stringify(out) : '';
}

// { "Chapter name": { desc: "…", trailer: "https://youtu.be/…" } }; trailers must be YouTube links.
function cleanChapterMeta_(v) {
  const m = safeJson_(v), out = {};
  Object.keys(m).slice(0, 40).forEach(function (k) {
    const name = String(k).trim().slice(0, 80), x = m[k] || {};
    const desc = String(x.desc || '').replace(/\r\n?/g, '\n').trim().slice(0, 1200);
    let trailer = String(x.trailer || '').trim().slice(0, 300);
    if (trailer && !trailerId_(trailer)) throw new Error('The trailer for "' + name + '" needs to be a YouTube link.');
    if (name && (desc || trailer)) out[name] = { desc: desc, trailer: trailer };
  });
  return Object.keys(out).length ? JSON.stringify(out) : '';
}
function trailerId_(u) {
  const m = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/.exec(String(u || ''));
  return m ? m[1] : '';
}

// Links for artists other than you, saved once and used across every release: { "Aziza": "https://instagram.com/…" }
function artistLinks_() {
  const m = safeJson_(setting_('artist_links')), out = {};
  Object.keys(m).forEach(function (k) { if (/^https?:\/\//i.test(String(m[k] || ''))) out[k] = m[k]; });
  return out;
}
function saveArtistLinks(key, links) {
  requireOwner_(key);
  const m = safeJson_(links), out = {};
  Object.keys(m).slice(0, 300).forEach(function (k) {
    const name = String(k).trim().slice(0, 120), url = String(m[k] || '').trim().slice(0, 500);
    if (!name || !url) return;
    if (!/^https?:\/\/[^\s<>"']+$/i.test(url)) throw new Error('The link for "' + name + '" should start with https://');
    out[name] = url;
  });
  setSettingValue_('artist_links', JSON.stringify(out));
  return out;
}

// Reads a lyrics page (Genius, AZLyrics, or most simple lyrics pages) and returns plain text for you to check.
function fetchLyrics(key, url) {
  requireOwner_(key);
  url = String(url || '').trim();
  if (!/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/[^\s]*)?$/i.test(url)) throw new Error('Paste a full https:// link to the lyrics page.');
  if (/^https:\/\/(localhost|127\.|10\.|192\.168\.|169\.254\.)/i.test(url)) throw new Error('That address is not allowed.');
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36', 'Accept-Language': 'en' } });
  const code = res.getResponseCode();
  if (code === 403 || code === 429) throw new Error('That site blocked the request (' + code + '). Open the page and paste the lyrics instead.');
  if (code >= 400) throw new Error('The page could not be opened (' + code + ').');
  const text = extractLyrics_(res.getContentText());
  if (!text || text.length < 20) throw new Error("Couldn't find lyrics on that page. Open it and paste them instead.");
  return text.slice(0, 20000);
}
function extractLyrics_(html) {
  html = String(html || '');
  // Genius: one or more <div data-lyrics-container="true"> blocks (with nested divs)
  const parts = [], marker = 'data-lyrics-container="true"';
  let from = 0;
  while (true) {
    const at = html.indexOf(marker, from); if (at < 0) break;
    const start = html.indexOf('>', at) + 1;
    let depth = 1, i = start;
    const re = /<\/?div\b[^>]*>/gi; re.lastIndex = start;
    let m;
    while ((m = re.exec(html))) { depth += m[0][1] === '/' ? -1 : 1; if (depth === 0) { i = m.index; break; } }
    let block = html.slice(start, i);
    block = block.replace(/<div[^>]*data-exclude-from-selection="true"[\s\S]*?<\/div>/gi, '');
    parts.push(block);
    from = i;
  }
  let raw = parts.join('<br>');
  // AZLyrics: the lyrics sit right after this comment
  if (!raw) { const az = /<!-- Usage of azlyrics\.com content[\s\S]*?-->([\s\S]*?)<\/div>/i.exec(html); if (az) raw = az[1]; }
  // Otherwise: the block with the most line breaks
  if (!raw) {
    let best = '', n = 0;
    (html.match(/<(div|p)[^>]*>(?:(?!<\/?(?:div|p)\b)[\s\S])*?<\/\1>/gi) || []).forEach(function (b) { const c = (b.match(/<br\s*\/?>/gi) || []).length; if (c > n) { n = c; best = b; } });
    if (n >= 6) raw = best;
  }
  if (!raw) return '';
  return raw.replace(/[\r\n]+/g, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(+d); })
    .split('\n').map(function (l) { return l.trim(); }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* ───────────────────────── Genres + companion B-sides ───────────────────────── */

// "alternative r&b,  Heal hop , ,R&B" → "alternative r&b, Heal hop, R&B" (up to 6 genres, duplicates dropped)
function cleanGenre_(v) {
  const seen = {}, out = [];
  String(v || '').split(',').forEach(function (g) {
    g = g.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (g && !seen[g.toLowerCase()] && out.length < 6) { seen[g.toLowerCase()] = 1; out.push(g); }
  });
  return out.join(', ');
}

// A release can be the B-sides of one other release (e.g. SHADOW WORK → soulSEARCHING). No self-links, no chains.
function checkBsidesOf_(releaseId, targetId) {
  if (!targetId) return '';
  if (targetId === releaseId) throw new Error("A release can't be its own B-sides.");
  const all = readTable_('Releases');
  const target = all.filter(function (x) { return x.release_id === targetId; })[0];
  if (!target) throw new Error('That release was not found.');
  if (String(target.bsides_of || '').trim()) throw new Error('"' + target.title + '" is itself B-sides of another release. Pick the main release instead.');
  if (all.some(function (x) { return String(x.bsides_of || '').trim() === releaseId; })) throw new Error('Other releases are B-sides of this one, so it can\'t be B-sides itself.');
  return targetId;
}

/* ───────────────────────── Playlists + bio ───────────────────────── */
function ytListId_(u) { const m = /[?&]list=([A-Za-z0-9_-]{10,64})/.exec(String(u || '')); return m ? m[1] : ''; }
function saveBio(key, text) {
  requireOwner_(key);
  const t = String(text || '').replace(/\r\n?/g, '\n').trim().slice(0, 8000);
  setSettingValue_('artist_bio', t);
  return t;
}

/* ───────────────────────── Songs from a YouTube link ───────────────────────── */
// The song has no audio file: it plays through its YouTube video. { releaseId, url, title? }
function addYoutubeSong(key, o) {
  requireOwner_(key);
  o = o || {};
  const url = String(o.url || '').trim(), vid = ytId_(url);
  if (!vid) throw new Error("That doesn't look like a YouTube video link.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Another save is running. Try again in a moment.');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureHeaders_('Tracks'); ensureHeaders_('Versions');
    if (!readTable_('Releases').some(function (r) { return r.release_id === o.releaseId; })) throw new Error('Release not found.');
    const tracks = readTable_('Tracks');
    let title = String(o.title || '').trim().slice(0, 200);
    if (!title) { try { title = String(linkPreview_(url).title || '').replace(/\s*-\s*YouTube\s*$/i, '').trim().slice(0, 200); } catch (e) {} }
    if (!title) title = 'YouTube song';
    const trackId = 'trk_' + hash_(o.releaseId + '|yt|' + vid);
    if (tracks.some(function (t) { return t.track_id === trackId; })) throw new Error('That video is already a song in this release.');
    const nums = tracks.filter(function (x) { return x.release_id === o.releaseId; }).map(function (x) { return Number(x.track_no) || 0; });
    const no = (nums.length ? Math.max.apply(null, nums) : 0) + 1;
    const vals = { track_id: trackId, release_id: o.releaseId, track_no: no, title: title, category: 'Main', hidden: false, is_single: false, video_url: 'https://youtu.be/' + vid };
    appendRows_(ss, 'Tracks', [TABS.Tracks.map(function (k) { return vals[k] != null ? vals[k] : ''; })], []);
    const row = ['ver_' + hash_('yt|' + vid + '|' + o.releaseId), trackId, 'YouTube', true, '', 'YOUTUBE', '', 0, '', '', 'Added from YouTube: ' + url, new Date(), false];
    appendRows_(ss, 'Versions', [row], [4]);
    CacheService.getScriptCache().removeAll(readTable_('Shares').map(function (x) { return 'scope_' + x.token; }));
    return {
      track: { track_id: trackId, release_id: o.releaseId, track_no: no, title: title, category: 'Main', video_url: vals.video_url, hidden: false, artist: '', features: '' },
      version: slimVersions_([{ version_id: row[0], track_id: trackId, label: 'YouTube', is_primary: true, audio_file_id: '', format: 'YOUTUBE', preview_file_id: '', size_mb: 0, duration: '', specs: '', hidden: false }])[0]
    };
  } finally { lock.releaseLock(); }
}

/* ───────────────────────── Playlists ───────────────────────── */
// Owner: every playlist. Fans (allowed = songs in their link): only playlists shared with the fan club, trimmed to songs they can hear.
function playlistsFor_(allowed) {
  const sh = sheet_('Playlists'); if (!sh || sh.getLastRow() < 2) return [];
  return readTable_('Playlists').map(function (p) {
    let tracks = []; try { tracks = JSON.parse(p.tracks || '[]'); } catch (e) {}
    return { playlist_id: p.playlist_id, title: String(p.title || ''), description: String(p.description || ''), tracks: tracks,
             fans: p.fans === true || String(p.fans) === 'true', updated: p.updated ? new Date(p.updated).toISOString() : '' };
  }).filter(function (p) { return !allowed || p.fans; })
    .map(function (p) { if (allowed) p.tracks = p.tracks.filter(function (t) { return allowed[t]; }); return p; })
    .filter(function (p) { return !allowed || p.tracks.length; });
}
// { id?, title, description, tracks: [track_id, …], fans } → creates or updates
function savePlaylist(key, o) {
  requireOwner_(key);
  o = o || {};
  const title = String(o.title || '').trim().slice(0, 120);
  if (!title) throw new Error('Give the playlist a name.');
  const known = {}; readTable_('Tracks').forEach(function (t) { known[t.track_id] = true; });
  const seen = {}, tracks = [];
  (o.tracks || []).slice(0, 500).forEach(function (t) { t = String(t); if (known[t] && !seen[t]) { seen[t] = 1; tracks.push(t); } });
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Another save is running. Try again in a moment.');
  try {
    const sh = ensureHeaders_('Playlists'), now = new Date();
    const vals = { title: title, description: String(o.description || '').trim().slice(0, 1000), tracks: JSON.stringify(tracks), fans: !!o.fans, updated: now };
    const row = o.id ? readTable_('Playlists').filter(function (p) { return p.playlist_id === o.id; })[0] : null;
    let id = o.id;
    if (row) Object.keys(vals).forEach(function (k) { sh.getRange(row._row, colOf_(sh, k)).setValue(vals[k]); });
    else {
      id = 'pl_' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
      const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
      const full = Object.assign({ playlist_id: id, created: now }, vals);
      sh.appendRow(head.map(function (h) { return full[h] != null ? full[h] : ''; }));
    }
    CacheService.getScriptCache().removeAll(readTable_('Shares').map(function (x) { return 'scope_' + x.token; }));
    return { playlist_id: id, title: vals.title, description: vals.description, tracks: tracks, fans: vals.fans, updated: now.toISOString() };
  } finally { lock.releaseLock(); }
}
function deletePlaylist(key, id) {
  requireOwner_(key);
  const sh = sheet_('Playlists'); if (!sh) return false;
  const row = readTable_('Playlists').filter(function (p) { return p.playlist_id === id; })[0];
  if (!row) return false;
  sh.deleteRow(row._row);
  return true;
}
