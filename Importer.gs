/**
 * MUSIC VAULT — Discography Importer
 * Container-bound Apps Script: open the Vault Google Sheet > Extensions > Apps Script, paste this in.
 *
 * What it does:
 *  - Walks Nicólas Soul › Discography (one "YEAR - Title" folder per release)
 *  - Fills Releases, Tracks, Versions; logs anything odd to Needs Review
 *  - Re-runnable: matches on Drive file IDs, only ever ADDS new rows, never edits yours
 *  - Pauses itself before the 6-minute Apps Script limit and resumes automatically
 */

const CONFIG = {
  ROOT_FOLDER_ID: '1vvl1oAqhkDXz2IXbcD1FTf3PljPNF_CL', // Nicólas Soul › Discography
  READ_WAV_INFO: true,            // small ranged read of each WAV header for duration + specs
  MAX_RUNTIME_MS: 4.5 * 60 * 1000,
  SKIP_FOLDER_PATTERN: /\b(project files|contracts?|stems?|bts|behind the scenes|cuts?|videos?|footage|photos?)\b/i,
  COVER_FOLDER_PATTERN: /\b(covers?|art|artwork)\b/i,
  // DAW project bundles and their internals: raw takes, not songs
  SESSION_FOLDER_PATTERN: /\.(band|logicx|logic|ptx|als|flp|cpr|rpp)$|^(audio files|freeze files|media|samples|alternatives|resources|undo files)$/i,
  JUNK_FILE_PATTERN: /^\._|^\.ds_store$/i,          // macOS metadata files
  TRUSTED_OWNERS: ['aluoch1@gmail.com'],             // your other account(s), lowercase
  AUDIO_EXT: ['wav', 'aif', 'aiff', 'flac', 'mp3', 'm4a'],
  LOSSLESS_EXT: ['wav', 'aif', 'aiff', 'flac'],
  IMAGE_EXT: ['jpg', 'jpeg', 'png', 'webp']
};

const TABS = {
  'Releases':     ['release_id', 'year', 'title', 'type', 'abbrev', 'folder_id', 'cover_file_id', 'status', 'notes',
                   'hidden', 'world_tagline', 'world_story', 'world_color', 'world_mood', 'cover_thumb', 'unlock_at',
                   'album_credits', 'cover_type', 'release_date', 'recorded_at', 'artist_name',
                   'made_from', 'made_to', 'bg_file_id', 'chapter_mode', 'series_name', 'series_part',
                   'chapter_colors', 'videos_meta', 'bg_style', 'photos_meta', 'chapter_meta', 'genre', 'bsides_of'],
  'Tracks':       ['track_id', 'release_id', 'track_no', 'title', 'category', 'features', 'bpm', 'key', 'notes', 'artist',
                   'hidden', 'producer', 'engineer', 'video_url', 'lyrics', 'voice_note_id', 'chapter', 'is_single',
                   'track_cover', 'track_cover_thumb', 'number_label', 'genre'],
  'Versions':     ['version_id', 'track_id', 'label', 'is_primary', 'audio_file_id', 'format', 'preview_file_id',
                   'size_mb', 'duration', 'specs', 'source_path', 'added', 'hidden'],
  'Shares':       ['token', 'target_type', 'target_id', 'label', 'allow_download', 'expires', 'active', 'plays', 'created',
                   'fan_name', 'member_no'],
  'Needs Review': ['file_id', 'path', 'reason', 'resolved', 'logged'],
  'Extras':       ['extra_id', 'release_id', 'kind', 'url', 'title', 'description', 'image', 'site', 'file_id', 'created'],
  'Comments':     ['comment_id', 'version_id', 'token', 'name', 'time_sec', 'text', 'created', 'resolved'],
  'Listens':      ['at', 'track_id', 'version_id', 'release_id', 'share_token', 'device_id', 'seconds', 'pct', 'outcome', 'device'],
  'Playlists':    ['playlist_id', 'title', 'description', 'tracks', 'fans', 'created', 'updated'],
  'Settings':     ['key', 'value']
};

/* ───────────────────────── Menu & setup ───────────────────────── */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Soul Vault')
    .addItem('1. Set up tabs', 'setupSheets')
    .addItem('2. Run import', 'runImport')
    .addSeparator()
    .addItem('Stop / reset import', 'resetImport')
    .addItem('Clear imported data (keeps Shares)', 'clearImported')
    .addSeparator()
    .addItem('Open my app', 'showAppLink')
    .addItem('Lock files not in active shares', 'lockFiles')
    .addItem('Turn nightly lock on or off', 'toggleNightlyLock')
    .addItem('Turn nightly backups on or off', 'toggleNightlyBackup')
    .addItem('Back up now', 'backupFromMenu')
    .addItem('Reset owner key', 'resetOwnerKey')
    .addToUi();
}

// Wipes Releases, Tracks, Versions, Needs Review (headers stay). Shares + Settings untouched.
// IDs are generated from Drive IDs, so a re-import recreates the same IDs.
function clearImported() {
  const ui = SpreadsheetApp.getUi();
  const ok = ui.alert('Clear imported data?',
    'This deletes all rows in Releases, Tracks, Versions and Needs Review, including any notes, ' +
    'features, BPM or primary picks you entered. Shares and Settings are kept.', ui.ButtonSet.OK_CANCEL);
  if (ok !== ui.Button.OK) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const done = [];
  ['Releases', 'Tracks', 'Versions', 'Needs Review'].forEach(function (name) {
    const sh = ss.getSheetByName(name);
    if (!sh) return;
    sh.clear();                       // contents, formats, checkboxes
    sh.clearConditionalFormatRules();
    const headers = TABS[name];
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    done.push(name);
  });
  toast_('Cleared ' + done.join(', ') + '. Run the import again.');
}

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(TABS).forEach(function (name) {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    const headers = TABS[name];
    // Always restore the header row: the script writes columns by position,
    // so a blank or renamed header cell would silently break the app.
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    const extra = sh.getLastColumn() - headers.length;
    if (extra > 0) {
      const rng = sh.getRange(1, headers.length + 1, 1, extra);
      const vals = rng.getValues()[0].map(function (v) {
        return headers.indexOf(String(v).trim()) > -1 ? '' : v;   // drop stray duplicate headers
      });
      rng.setValues([vals]);
    }
  });
  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  setSetting_('root_folder_id', CONFIG.ROOT_FOLDER_ID, true);
  setSetting_('previews_folder_id', '', true);
}

/* ───────────────────────── Import control ───────────────────────── */

function runImport() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) { toast_('An import is already running.'); return; }
  try {
    setupSheets();
    const ids = [];
    const it = DriveApp.getFolderById(CONFIG.ROOT_FOLDER_ID).getFolders();
    while (it.hasNext()) ids.push(it.next().getId());
    const props = PropertiesService.getScriptProperties();
    props.setProperty('queue', JSON.stringify(ids));
    props.setProperty('stats', JSON.stringify({ releases: 0, tracks: 0, versions: 0, review: 0 }));
    deleteTriggers_();
    setSetting_('import_status', 'Running — ' + ids.length + ' release folders queued');
    processQueue_();
  } finally {
    lock.releaseLock();
  }
}

function continueImport() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try { processQueue_(); } finally { lock.releaseLock(); }
}

function resetImport() {
  deleteTriggers_();
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('queue');
  props.deleteProperty('stats');
  setSetting_('import_status', 'Reset — no import running');
  toast_('Import stopped and reset.');
}

function processQueue_() {
  const props = PropertiesService.getScriptProperties();
  const queue = JSON.parse(props.getProperty('queue') || '[]');
  const stats = JSON.parse(props.getProperty('stats') || '{"releases":0,"tracks":0,"versions":0,"review":0}');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const idx = loadIndex_(ss);
  const start = Date.now();

  while (queue.length) {
    if (Date.now() - start > CONFIG.MAX_RUNTIME_MS) {
      props.setProperty('queue', JSON.stringify(queue));
      props.setProperty('stats', JSON.stringify(stats));
      deleteTriggers_();
      ScriptApp.newTrigger('continueImport').timeBased().after(60 * 1000).create();
      setSetting_('import_status', 'Paused — ' + queue.length + ' releases left, resuming automatically');
      return;
    }
    const folderId = queue[0];
    try {
      importRelease_(DriveApp.getFolderById(folderId), ss, idx, stats);
    } catch (e) {
      logReview_(ss, idx, folderId, '(release folder)', 'Import error: ' + e.message, stats);
    }
    queue.shift();
    props.setProperty('queue', JSON.stringify(queue));
    props.setProperty('stats', JSON.stringify(stats));
  }

  deleteTriggers_();
  props.deleteProperty('queue');
  props.deleteProperty('stats');
  const summary = 'Done — added ' + stats.releases + ' releases, ' + stats.tracks + ' tracks, ' +
                  stats.versions + ' versions; ' + stats.review + ' items need review';
  setSetting_('last_import', new Date());
  setSetting_('import_status', summary);
  toast_(summary);
}

/* ───────────────────────── One release ───────────────────────── */

function importRelease_(folder, ss, idx, stats) {
  const folderName = folder.getName();
  const m = folderName.match(/^(\d{4})\s*-\s*(.+)$/);
  if (!m) {
    logReview_(ss, idx, folder.getId(), folderName, 'Folder name is not "YEAR - Title"', stats);
    return;
  }
  const year = Number(m[1]);
  const releaseTitle = m[2].trim();
  const existing = idx.releasesByFolder[folder.getId()];
  const releaseId = existing ? existing.release_id : 'rel_' + year + '_' + slug_(releaseTitle);

  const tree = { files: [] };
  walk_(folder, [], tree);

  const audio = [], images = [];
  tree.files.forEach(function (e) {
    e.ext = extOf_(e.file.getName());
    if (CONFIG.AUDIO_EXT.indexOf(e.ext) > -1) audio.push(e);
    else if (CONFIG.IMAGE_EXT.indexOf(e.ext) > -1) images.push(e);
  });

  if (!audio.length) {
    logReview_(ss, idx, folder.getId(), folderName, 'No audio files found in this release', stats);
  }

  // Short caps prefixes used on 2+ files (e.g. "SL", "C") get stripped from titles
  const abbrevs = detectAbbrevs_(audio.map(function (e) {
    return parseFileName_(baseOf_(e.file.getName()), [], releaseTitle).candidate;
  }));

  // Pair WAV + MP3 with the same name in the same folder
  const groups = {};
  audio.forEach(function (e) {
    const base = baseOf_(e.file.getName());
    const key = e.segs.join('/') + '||' + base.toLowerCase();
    const g = groups[key] || (groups[key] = { segs: e.segs, base: base });
    if (CONFIG.LOSSLESS_EXT.indexOf(e.ext) > -1) { if (!g.main) g.main = e; }
    else { if (!g.lossy) g.lossy = e; }
  });

  const newTracks = {};
  const newVersions = [];

  Object.keys(groups).sort().forEach(function (key) {
    const g = groups[key];
    const main = g.main || g.lossy;
    const preview = g.main ? g.lossy : null;
    const fileId = main.file.getId();
    const path = [folderName].concat(g.segs, main.file.getName()).join('/');
    if (idx.files[fileId]) return; // already imported

    const parsed = parseFileName_(g.base, abbrevs, releaseTitle);
    if (!parsed.title) {
      logReview_(ss, idx, fileId, path, 'Could not read a song title from the file name', stats);
      return;
    }

    const ctx = folderContext_(g.segs);
    const labelParts = dedupe_(ctx.labels.concat(parsed.tags));
    const label = labelParts.length ? labelParts.join(' · ') : 'Original';
    const category = ctx.category !== 'Main' ? ctx.category : (parsed.bonus ? 'Bonus' : 'Main');
    const score = primaryScore_(label);

    const trackId = 'trk_' + hash_(releaseId + '|' + normTitle_(parsed.title));
    if (!idx.tracks[trackId]) {
      const t = newTracks[trackId];
      if (!t) {
        newTracks[trackId] = { id: trackId, trackNo: parsed.trackNo, title: parsed.title,
                               category: category, artist: parsed.artist, score: score };
      } else {
        if (category === 'Main') t.category = 'Main';
        if (score > t.score) {               // show the title from the best version
          t.score = score;
          t.title = parsed.title;
          if (parsed.trackNo !== '') t.trackNo = parsed.trackNo;
        }
        if (t.trackNo === '' && parsed.trackNo !== '') t.trackNo = parsed.trackNo;
        if (!t.artist && parsed.artist) t.artist = parsed.artist;
      }
    }

    const owner = externalOwner_(main.file);
    if (owner) logReview_(ss, idx, fileId, path, 'File is owned by ' + owner + ', not this account', stats);

    const info = (CONFIG.READ_WAV_INFO && main.ext === 'wav') ? wavInfo_(fileId, main.file.getSize()) : null;

    newVersions.push({
      trackId: trackId, title: parsed.title, label: label, score: score, path: path,
      lossless: CONFIG.LOSSLESS_EXT.indexOf(main.ext) > -1, fileId: fileId,
      row: [
        'ver_' + hash_(fileId), trackId, label, false, fileId, main.ext.toUpperCase(),
        preview ? preview.file.getId() : '',
        Math.round(main.file.getSize() / 1048576 * 10) / 10,
        info ? fmtDuration_(info.seconds) : '',
        info ? fmtSpecs_(info) : '',
        path, new Date(), false
      ]
    });
    idx.files[fileId] = true;
  });

  // Same track + same label in a lossy AND lossless file (e.g. Album/ MP3 + WAVs/ WAV):
  // fold the MP3 in as the WAV's preview instead of keeping two versions.
  const byKey = {};
  newVersions.forEach(function (v) {
    const k = v.trackId + '|' + v.label;
    (byKey[k] = byKey[k] || []).push(v);
  });
  const dropped = {};
  Object.keys(byKey).forEach(function (k) {
    const list = byKey[k];
    const wavs = list.filter(function (v) { return v.lossless; });
    const lossy = list.filter(function (v) { return !v.lossless; });
    wavs.forEach(function (w) {
      if (w.row[6]) return;                  // already has a preview
      const p = lossy.shift();
      if (p) { w.row[6] = p.fileId; dropped[p.fileId] = true; }
    });
  });
  const finalVersions = newVersions.filter(function (v) { return !dropped[v.fileId]; });

  // Remaining same-track + same-label pairs are real duplicates
  finalVersions.forEach(function (v) {
    const labels = idx.trackLabels[v.trackId] || (idx.trackLabels[v.trackId] = {});
    if (labels[v.label]) {
      logReview_(ss, idx, v.fileId, v.path, 'Possible duplicate: "' + v.title + '" already has a ' + v.label + ' version', stats);
    }
    labels[v.label] = true;
  });

  // Primary version for each NEW track
  const best = {};
  finalVersions.forEach(function (v) {
    if (!newTracks[v.trackId]) return;
    if (!best[v.trackId] || v.score > best[v.trackId].score) best[v.trackId] = v;
  });
  Object.keys(best).forEach(function (id) { best[id].row[3] = true; });

  if (!existing) {
    const row = [
      releaseId, year, releaseTitle, guessType_(releaseTitle), abbrevs.join(' / '), folder.getId(),
      pickCover_(images), year >= new Date().getFullYear() ? 'In progress' : 'Released', ''
    ];
    appendRows_(ss, 'Releases', [row], []);
    idx.releasesByFolder[folder.getId()] = { release_id: releaseId };
    stats.releases++;
  }

  const trackRows = Object.keys(newTracks).map(function (k) { return newTracks[k]; })
    .sort(function (a, b) { return (a.trackNo === '' ? 999 : a.trackNo) - (b.trackNo === '' ? 999 : b.trackNo); })
    .map(function (t) { return [t.id, releaseId, t.trackNo, t.title, t.category, '', '', '', '', t.artist || '', false, '', '', '', '', '', '', false]; });
  appendRows_(ss, 'Tracks', trackRows, []);
  trackRows.forEach(function (r) { idx.tracks[r[0]] = true; });
  stats.tracks += trackRows.length;

  appendRows_(ss, 'Versions', finalVersions.map(function (v) { return v.row; }), [4]);
  stats.versions += finalVersions.length;
}

function walk_(folder, segs, out) {
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (CONFIG.JUNK_FILE_PATTERN.test(f.getName())) continue;
    out.files.push({ file: f, segs: segs });
  }
  const subs = folder.getFolders();
  while (subs.hasNext()) {
    const sub = subs.next();
    const name = sub.getName();
    if (CONFIG.SKIP_FOLDER_PATTERN.test(name) || CONFIG.SESSION_FOLDER_PATTERN.test(name)) continue;
    walk_(sub, segs.concat(name), out);
  }
}

/* ───────────────────────── Name parsing ───────────────────────── */

// Handles:  "03 - SL - ARES (Clean)"
//           "Nicólas Soul - Seasons (Deluxe) - 02 Right Now"      (distributor style)
//           "01 DEAD THE COUNTERFEIT Mastered 44k 16b"
//           "bluu - spiderman", "KIRBY CLEAN", "PARANOIA (s+r)", "Drive Slow -Bonus-"
function parseFileName_(base, abbrevs, releaseTitle) {
  let s = base.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  let trackNo = '', artist = '', bonus = false;

  // Distributor style: "Artist - Release - NN Title"
  const d = s.match(/^(.+?)\s+-\s+(.+?)\s+-\s+(\d{1,3})\s+(.+)$/);
  if (d && !/^\d+$/.test(d[1].trim()) && !/^[A-Z0-9&]{1,6}$/.test(d[2].trim())) { artist = d[1].trim(); trackNo = Number(d[3]); s = d[4].trim(); }

  if (trackNo === '') {
    const m = s.match(/^(\d{1,3})\s*[-.)]\s*(.+)$/) || s.match(/^(\d{2})\s+(.+)$/);
    if (m && !/^\d/.test(m[2])) { trackNo = Number(m[1]); s = m[2].trim(); }
  }

  // Release-abbreviation prefix ("SL - ", "C - ")
  let candidate = '';
  const a = s.match(/^([A-Z0-9&]{1,6})\s+-\s+(.+)$/);
  if (a) {
    candidate = a[1];
    if (abbrevs.indexOf(a[1]) > -1) s = a[2].trim();
  }

  // Side/part prefix that is a word of the release title ("bluu - ", "REDD - ")
  const p = s.match(/^([^-]{1,20}?)\s+-\s+(.+)$/);
  if (p && releaseTitle && normTitle_(p[1]).length > 1 &&
      normTitle_(releaseTitle).indexOf(normTitle_(p[1])) > -1 && !isVersionTag_(p[1])) {
    s = p[2].trim();
  }

  s = s.replace(/([\)\]])\s+\d$/, '$1');  // Drive copy suffix: "Title (feat. X) 1"

  const tags = [];
  let changed = true;
  while (changed) {
    changed = false;
    let t = s.match(/^(.+?)\s*[\(\[\-]\s*bonus(?:\s+track)?\s*[\)\]\-]?\s*$/i);   // (Bonus) [Bonus] -Bonus-
    if (t) { bonus = true; s = t[1].trim(); changed = true; continue; }
    t = s.match(/^(.+?)[\s_-]+(\d{2}(?:\.\d)?)k[\s_-]*(\d{2})\s*b(?:it)?$/i);     // "44k 16b"
    if (t) { tags.unshift(specTag_(t[2], t[3])); s = t[1].trim(); changed = true; continue; }
    t = s.match(/^(.+?)\s+(mastered|master)$/i);                                  // "Title Mastered"
    if (t) { tags.unshift('Master'); s = t[1].trim(); changed = true; continue; }
    t = s.match(/^(.+?)\s+(CLEAN|EXPLICIT)$/);                                     // "KIRBY CLEAN" (caps only)
    if (t) { tags.unshift(normTag_(t[2])); s = t[1].trim(); changed = true; continue; }
    t = s.match(/^(.*?)\s*[\(\[]([^\)\]]+)[\)\]]\s*$/);                           // "Title (Clean)"
    if (t && t[1] && isVersionTag_(t[2])) { tags.unshift(normTag_(t[2])); s = t[1].trim(); changed = true; continue; }
    t = s.match(/^(.+?)\s+-\s+([^-]+)$/);                                          // "Title - Mix v3"
    if (t && isVersionTag_(t[2])) { tags.unshift(normTag_(t[2])); s = t[1].trim(); changed = true; continue; }
    t = s.match(/^(.+?)\s+((?:mix|master|version|v)\s*v?\d+)$/i);                 // "Title Mix v3"
    if (t) { tags.unshift(normTag_(t[2])); s = t[1].trim(); changed = true; }
  }
  s = s.replace(/[\s\-–]+$/, '');
  return { trackNo: trackNo, candidate: candidate, title: s, tags: tags, artist: artist, bonus: bonus };
}

const VERSION_TAG = /^(clean|explicit|dirty|instrumental|inst\.?|a\s?c+ap+el+a|demo|rough( mix)?|radio edit|extended( mix)?|live|sped up|slowed|s\s?\+\s?r|slowed\s?(\+|&|and)\s?reverb|stage|new|alt|final|mix|master(ed)?|remaster(ed)?|(mix|master|version|v)\s*v?\d+)$/i;

function isVersionTag_(t) {
  return VERSION_TAG.test(t.trim().replace(/\s+version$/i, ''));
}

function normTag_(t) {
  const s = t.trim().replace(/\s+version$/i, '');
  if (/^clean$/i.test(s)) return 'Clean';
  if (/^(explicit|dirty)$/i.test(s)) return 'Explicit';
  if (/^inst/i.test(s)) return 'Instrumental';
  if (/c+ap+el+a/i.test(s)) return 'Acapella';
  if (/^s\s?\+\s?r$|reverb/i.test(s)) return 'Slowed + Reverb';
  if (/^stage$/i.test(s)) return 'Stage Version';
  const n = s.match(/^(mix|master|version|v)\s*v?(\d+)$/i);
  if (n) {
    const kind = n[1].toLowerCase();
    return (kind === 'mix' ? 'Mix ' : kind === 'master' ? 'Master ' : '') + 'v' + n[2];
  }
  return s.toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

function detectAbbrevs_(candidates) {
  const counts = {};
  candidates.forEach(function (c) { if (c) counts[c] = (counts[c] || 0) + 1; });
  return Object.keys(counts).filter(function (c) { return counts[c] >= 2; });
}

function folderContext_(segs) {
  const labels = [];
  let category = 'Main';
  segs.forEach(function (s) {
    if (/^clean$/i.test(s)) labels.push('Clean');
    else if (/^(explicit|dirty)$/i.test(s)) labels.push('Explicit');
    else if (/instrumental/i.test(s)) labels.push('Instrumental');
    else if (/a\s?c+ap+el+a/i.test(s)) labels.push('Acapella');
    else if (/^live!?$|\blive (version|session|recording)s?\b/i.test(s)) labels.push('Live');
    else if (/\bdraft\b/i.test(s) && !/^drafts$/i.test(s)) labels.push(titleCase_(s));   // "First Draft"
    else if (/^drafts$|^demos?$|^rough(s| mixes)?$/i.test(s)) labels.push('Demo');
    else if (/\bmasters?\b/i.test(s)) labels.push('Master');
    else {
      const sp = s.match(/^(\d{2}(?:\.\d)?)k[\s_-]*(\d{2})\s*b(?:it)?$/i);             // "44k 16b" folder
      if (sp) labels.push(specTag_(sp[1], sp[2]));
    }
    if (/b[\s-]?sides?/i.test(s)) category = 'B-Side';
    else if (/^(extras?|bonus)/i.test(s)) category = 'Extra';
  });
  return { labels: labels, category: category };
}

function guessType_(title) {
  if (/b[\s-]?sides/i.test(title)) return 'B-Sides';
  if (/\bEP\b/.test(title)) return 'EP';
  if (/single/i.test(title)) return 'Single';
  return 'Album';
}

function primaryScore_(label) {
  let s = 0;
  if (/Master/.test(label)) s += 3;
  if (/Explicit/.test(label)) s += 2;
  if (/Original/.test(label)) s += 1;
  if (/Instrumental|Acapella/.test(label)) s -= 2;
  if (/Demo|Rough|Draft/.test(label)) s -= 3;
  if (/Live|Slowed|Stage/.test(label)) s -= 1;
  if (/48k\/24/.test(label)) s += 0.05; // prefer the hi-res master when both exist
  const v = label.match(/v(\d+)/);
  if (v) s += Number(v[1]) * 0.1; // newer mix wins
  return s;
}

function pickCover_(images) {
  const pool = images.filter(function (e) {
    return e.segs.length === 0 || e.segs.some(function (s) { return CONFIG.COVER_FOLDER_PATTERN.test(s); });
  });
  if (!pool.length) return '';
  const named = pool.filter(function (e) { return /cover|front|art/i.test(e.file.getName()); });
  return (named[0] || pool[0]).file.getId();
}

/* ───────────────────────── WAV header reader ───────────────────────── */

// Reads only the first 64 KB of the file to get format + duration.
function wavInfo_(fileId, fileSize) {
  try {
    const res = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media', {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), Range: 'bytes=0-65535' },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 206 && res.getResponseCode() !== 200) return null;
    const b = res.getContent().map(function (x) { return x & 0xff; });
    const str = function (o, n) { return String.fromCharCode.apply(null, b.slice(o, o + n)); };
    const u16 = function (o) { return b[o] | (b[o + 1] << 8); };
    const u32 = function (o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; };

    if (str(0, 4) !== 'RIFF' || str(8, 4) !== 'WAVE') return null;
    let p = 12, fmt = null, dataSize = null, dataOffset = null;
    while (p + 8 <= b.length) {
      const id = str(p, 4), size = u32(p + 4);
      if (id === 'fmt ') fmt = { channels: u16(p + 10), sampleRate: u32(p + 12), byteRate: u32(p + 16), bits: u16(p + 22) };
      if (id === 'data') { dataSize = size; dataOffset = p + 8; break; }
      p += 8 + size + (size % 2);
    }
    if (!fmt || !fmt.byteRate) return null;
    if (!dataSize || dataSize === 0xFFFFFFFF) dataSize = fileSize - (dataOffset || 44);
    return { seconds: dataSize / fmt.byteRate, sampleRate: fmt.sampleRate, bits: fmt.bits, channels: fmt.channels };
  } catch (e) {
    return null;
  }
}

function fmtDuration_(sec) {
  const s = Math.round(sec);
  return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
}

function fmtSpecs_(i) {
  const ch = i.channels === 1 ? 'mono' : i.channels === 2 ? 'stereo' : i.channels + 'ch';
  return (i.sampleRate / 1000) + 'k / ' + i.bits + '-bit ' + ch;
}

/* ───────────────────────── Sheet helpers ───────────────────────── */

function loadIndex_(ss) {
  const read = function (name) {
    const v = ss.getSheetByName(name).getDataRange().getValues();
    const h = v.shift();
    return v.map(function (r) {
      const o = {};
      h.forEach(function (k, i) { o[k] = r[i]; });
      return o;
    });
  };
  const idx = { releasesByFolder: {}, tracks: {}, files: {}, review: {}, trackLabels: {} };
  read('Releases').forEach(function (r) { if (r.folder_id) idx.releasesByFolder[r.folder_id] = r; });
  read('Tracks').forEach(function (r) { if (r.track_id) idx.tracks[r.track_id] = true; });
  read('Versions').forEach(function (r) {
    if (r.audio_file_id) idx.files[r.audio_file_id] = true;
    if (r.preview_file_id) idx.files[r.preview_file_id] = true;
    if (r.track_id) (idx.trackLabels[r.track_id] = idx.trackLabels[r.track_id] || {})[r.label] = true;
  });
  read('Needs Review').forEach(function (r) { idx.review[r.file_id + '|' + r.reason] = true; });
  return idx;
}

function appendRows_(ss, name, rows, checkboxCols) {
  if (!rows.length) return;
  const sh = ss.getSheetByName(name);
  const start = sh.getLastRow() + 1;
  sh.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
  checkboxCols.forEach(function (c) { sh.getRange(start, c, rows.length, 1).insertCheckboxes(); });
}

function logReview_(ss, idx, fileId, path, reason, stats) {
  const key = fileId + '|' + reason;
  if (idx.review[key]) return;
  idx.review[key] = true;
  appendRows_(ss, 'Needs Review', [[fileId, path, reason, false, new Date()]], [4]);
  stats.review++;
}

function setSetting_(key, value, onlyIfMissing) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Settings');
  if (!sh) return;
  const vals = sh.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (vals[i][0] === key) {
      if (!onlyIfMissing) sh.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sh.appendRow([key, value]);
}

/* ───────────────────────── Small utilities ───────────────────────── */

let ME_ = null;
function externalOwner_(file) {
  try {
    if (ME_ === null) ME_ = Session.getEffectiveUser().getEmail();
    const o = file.getOwner();
    if (!o) return '';
    const email = o.getEmail().toLowerCase();
    if (email === ME_.toLowerCase() || CONFIG.TRUSTED_OWNERS.indexOf(email) > -1) return '';
    return o.getEmail();
  } catch (e) {
    return '';
  }
}

function deleteTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'continueImport') ScriptApp.deleteTrigger(t);
  });
}

function toast_(msg) {
  try { SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'Soul Vault', 8); } catch (e) {}
}

function specTag_(rate, bits) {
  const r = rate === '44' ? '44.1' : rate === '88' ? '88.2' : rate;
  return r + 'k/' + bits + '-bit';
}

function titleCase_(s) {
  return s.toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

function extOf_(name) { const m = name.match(/\.([^.]+)$/); return m ? m[1].toLowerCase() : ''; }
function baseOf_(name) { return name.replace(/\.[^.]+$/, ''); }
function dedupe_(arr) { return arr.filter(function (x, i) { return arr.indexOf(x) === i; }); }

function normTitle_(t) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[\(\[][^\)\]]*\b(feat|ft|featuring|with|w-|intro|outro|prologue|epilogue|bonus)\b[^\)\]]*[\)\]]/g, '')
    .replace(/\s(feat|ft|featuring)\.?\s.*$/, '')
    .replace(/[^a-z0-9]/g, '');
}

function slug_(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);
}

function hash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s, Utilities.Charset.UTF_8)
    .slice(0, 5)
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); })
    .join('');
}
