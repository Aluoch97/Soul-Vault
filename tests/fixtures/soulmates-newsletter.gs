/* A copy of the newsletter functions from the old soulMATES Google script (Apps Script), used ONLY by tests/newsletter.test.mjs as the
 * reference ("oracle") that the new edge code must match. Copied word for word, except:
 *   - the three secrets are replaced by test values (the real ones are NOT in this repo),
 *   - WEB_APP_URL points at the new /news address, so links can be compared,
 *   - functions that only talk to Google (sheets, Gmail, YouTube, Bandsintown) are left out: the test supplies stand-ins.
 */
const SEND_WEEKS_OF_MONTH = [1, 3];
const BANDSINTOWN_APP_ID = 'TEST_APP_ID';
const ROAD_TO_100_PLAYLIST_URL = 'https://www.youtube.com/playlist?list=PLdjhXdodmUqM';
const UNSUB_SECRET = 'TEST_SECRET';
const WEB_APP_URL = 'https://soulnicolas.com/news';

function generateUnsubToken(email) {
  const bytes = Utilities.computeHmacSha256Signature(email.toLowerCase(), UNSUB_SECRET);
  return bytes
    .map(function (b) { return ((b < 0 ? b + 256 : b)).toString(16).padStart(2, '0'); })
    .join('')
    .substring(0, 16);
}

function generateSurveyToken(email, videoUrl, response) {
  const raw = String(email).toLowerCase() + '|' + String(videoUrl) + '|' + String(response);
  const bytes = Utilities.computeHmacSha256Signature(raw, UNSUB_SECRET);
  return bytes
    .map(function (b) { return ((b < 0 ? b + 256 : b)).toString(16).padStart(2, '0'); })
    .join('')
    .substring(0, 16);
}

function buildSurveyUrl(email, videoUrl, response) {
  const token = generateSurveyToken(email, videoUrl, response);
  return WEB_APP_URL +
    '?survey=' + encodeURIComponent(response) +
    '&video=' + encodeURIComponent(videoUrl) +
    '&email=' + encodeURIComponent(email) +
    '&token=' + token;
}

function buildAutoContent() {
  const video = getLatestYouTubeVideo();
  const show = getNextBandsintownShow();

  if (!video && !show) return null;

  let body = "Hey,\n\nI've got some updates for you.\n\n";

  if (video) {
    body += 'My newest video, "' + video.title + '", is up on YouTube now. Watch it here: ' + video.url + '\n\n';
  }

  if (show) {
    const location = show.city + (show.region ? ', ' + show.region : '');
    var showCount = getShowCount();
    body += "I'm playing a show soon. I'll be at " + show.venueName + ' in ' + location +
      ' on ' + show.dateFormatted + '.';
    if (showCount) {
      body += ' That\'ll make ' + showCount.completed + ' shows down on the #ROADTO100SHOWS run' +
        (showCount.remaining !== null ? ', ' + showCount.remaining + ' to go.' : '.') +
        ' Watch the journey so far: ' + ROAD_TO_100_PLAYLIST_URL;
    }
    if (show.ticketUrl) {
      body += " Grab your tickets here before they're gone: " + show.ticketUrl;
    }
    body += '\n\n';
  }

  body += "Thanks for riding with me. I'll see some of you out there.\n\nNicólas";

  const subject = video ? 'Inside the Tribe: ' + video.title : "Inside the Tribe: Here's what's next";

  return { subject: subject, body: body, video: video, show: show, showCount: (typeof showCount !== 'undefined' ? showCount : null) };
}

function isScheduledSendDay(date) {
  if (date.getDay() !== 5) return false; // 5 = Friday
  const weekOfMonth = Math.ceil(date.getDate() / 7);
  return SEND_WEEKS_OF_MONTH.indexOf(weekOfMonth) !== -1;
}

function isNearShow(fanCity, show) {
  if (!fanCity || !show || !show.city) return false;
  const fan = String(fanCity).toLowerCase();
  const showCity = String(show.city).toLowerCase();
  const fanFirstPart = fan.split(',')[0].trim();
  return fan.indexOf(showCity) !== -1 || showCity.indexOf(fanFirstPart) !== -1;
}

function buildTrimLine(marginStyle) {
  let marks = '';
  for (let i = 0; i < 16; i++) {
    const color = i % 2 === 0 ? '#e8392e' : '#00a82a';
    const glyph = i % 2 === 0 ? '▲' : '▽'; // small triangle up / down
    marks += '<span style="color:' + color + ';">' + glyph + '</span> ';
  }
  return '<p style="text-align:center; font-size:10px; line-height:1; margin:' + marginStyle + ';">' + marks + '</p>';
}

function buildPlainEmailHtml(bodyText, firstName, email) {
  const greetingName = firstName ? firstName : 'there';
  const paragraphs = bodyText
    .split(/\n\s*\n/)
    .map(function (p) {
      return '<p style="margin:0 0 16px;">' + p.replace(/\n/g, '<br>') + '</p>';
    })
    .join('');

  const unsubUrl = buildUnsubUrl(email);

  return '' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f7f1e3" style="background-color:#f7f1e3; padding:32px 0;">' +
    '<tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background-color:#f7f1e3;">' +
    '<tr><td style="padding:0 20px; font-family:Georgia, serif; color:#241c12; line-height:1.6;">' +
    buildTrimLine('0 0 20px') +
    '<p style="font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:#a8241c; margin:0 0 16px;">Inside the Tribe</p>' +
    '<p style="margin:0 0 20px;">Hey ' + escapeHtml(greetingName) + ',</p>' +
    paragraphs +
    '<p style="font-style:italic; font-size:12px; color:#6f6349; margin:24px 0 0;">An Ja Karachuonyo Kokoth</p>' +
    '<p style="margin:16px 0 0; font-size:13px; color:#6f6349; border-top:1px solid #ddd0b0; padding-top:16px;">Sent with love from Nicólas Soul. ' +
    '<a href="' + unsubUrl + '" style="color:#6f6349;">Unsubscribe</a></p>' +
    '<p style="margin:6px 0 0; font-size:11px; color:#6f6349;">NuRenaissance Media, 14919 Lebanon Rd, Old Hickory, TN 37138</p>' +
    buildTrimLine('20px 0 0') +
    '</td></tr>' +
    '</table></td></tr></table>';
}

function buildAutoEmailHtml(video, show, firstName, email, isNear, showCount) {
  const greetingName = escapeHtml(firstName ? firstName : 'there');
  const unsubUrl = buildUnsubUrl(email);

  const bg = '#f7f1e3';
  const card = '#efe3c8';
  const red = '#a8241c';
  const redButton = '#b81f14';
  const green = '#1f6b2f';
  const ink = '#241c12';
  const inkMuted = '#5c5040';
  const line = '#ddd0b0';
  const footerMuted = '#6f6349';

  let videoBlock = '';
  if (video) {
    const thumb = video.thumbnailUrl
      ? '<a href="' + escapeHtml(video.url) + '" style="text-decoration:none;">' +
        '<img src="' + video.thumbnailUrl + '" alt="' + escapeHtml(video.title) + '" width="544" ' +
        'style="display:block; width:100%; max-width:544px; height:auto; border-radius:4px; border:0;">' +
        '</a>'
      : '';

    const surveyOptions = [
      { key: 'loved', label: '🔥 Loved it' },
      { key: 'liked', label: '🙂 Pretty good' },
      { key: 'meh', label: '😐 Not my favorite' }
    ];
    const surveyLinks = surveyOptions.map(function (opt) {
      const url = buildSurveyUrl(email, video.url, opt.key);
      return '<a href="' + url + '" style="display:inline-block; margin:0 8px 8px 0; padding:8px 14px; border:1px solid ' + line + '; border-radius:999px; color:' + ink + '; font-family:Georgia, serif; font-size:13px; text-decoration:none;">' + opt.label + '</a>';
    }).join('');

    videoBlock =
      '<tr><td style="padding:0 28px 24px;">' +
      thumb +
      '<p style="font-family:Georgia, serif; font-size:17px; color:' + ink + '; margin:16px 0 4px; line-height:1.4;">My newest video is up.</p>' +
      '<p style="font-family:Georgia, serif; font-size:15px; color:' + inkMuted + '; margin:0 0 16px; line-height:1.5;">&ldquo;' + escapeHtml(video.title) + '&rdquo;</p>' +
      '<a href="' + escapeHtml(video.url) + '" style="display:inline-block; background-color:' + redButton + '; color:#ffffff; font-family:Georgia, serif; font-size:14px; text-decoration:none; padding:12px 22px; border-radius:999px;">Watch on YouTube</a>' +
      '<p style="font-family:Georgia, serif; font-size:14px; color:' + ink + '; margin:22px 0 8px;">What did you think of it?</p>' +
      '<p style="margin:0;">' + surveyLinks + '</p>' +
      '</td></tr>';
  }

  let showBlock = '';
  if (show) {
    const location = escapeHtml(show.city + (show.region ? ', ' + show.region : ''));
    const ticketLink = show.ticketUrl
      ? '<a href="' + escapeHtml(show.ticketUrl) + '" style="display:inline-block; background-color:transparent; border:1px solid ' + ink + '; color:' + ink + '; font-family:Georgia, serif; font-size:14px; text-decoration:none; padding:11px 22px; border-radius:999px;">Get Tickets</a>'
      : '';

    const labelColor = isNear ? redButton : green;
    const labelText = isNear ? 'A Show Near You' : 'Upcoming Show';

    const progressLine = showCount
      ? '<p style="font-family:Georgia, serif; font-size:13px; color:' + inkMuted + '; margin:0 0 6px;">' + showCount.completed + ' shows down on the #ROADTO100SHOWS run' + (showCount.remaining !== null ? ', ' + showCount.remaining + ' to go.' : '.') + '</p>' +
        '<a href="' + ROAD_TO_100_PLAYLIST_URL + '" style="font-family:Georgia, serif; font-size:13px; color:' + inkMuted + '; text-decoration:underline;">Watch the journey so far</a><br><br>'
      : '';

    showBlock =
      '<tr><td style="padding:0 28px 28px;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:' + card + '; border-left:3px solid ' + labelColor + '; border-radius:4px;">' +
      '<tr><td style="padding:20px 22px;">' +
      '<p style="font-family:Georgia, serif; font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:' + labelColor + '; margin:0 0 10px;">' + labelText + '</p>' +
      '<p style="font-family:Georgia, serif; font-size:18px; color:' + ink + '; margin:0 0 4px; line-height:1.4;">' + escapeHtml(show.venueName) + '</p>' +
      '<p style="font-family:Georgia, serif; font-size:14px; color:' + inkMuted + '; margin:0 0 16px;">' + location + ' &middot; ' + escapeHtml(show.dateFormatted) + '</p>' +
      progressLine +
      ticketLink +
      '</td></tr></table></td></tr>';
  }

  return '' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="' + bg + '" style="background-color:' + bg + '; padding:32px 0;">' +
    '<tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; background-color:' + bg + ';">' +
    buildTrimRow() +
    '<tr><td style="padding:0 28px 8px;">' +
    '<p style="font-family:Georgia, serif; font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:' + red + '; margin:0;">Inside the Tribe</p>' +
    '</td></tr>' +
    '<tr><td style="padding:0 28px 20px;">' +
    '<p style="font-family:Georgia, serif; font-size:17px; color:' + ink + '; margin:0; line-height:1.5;">Hey ' + greetingName + ',</p>' +
    '</td></tr>' +
    videoBlock +
    showBlock +
    '<tr><td style="padding:8px 28px 0;">' +
    '<p style="font-family:Georgia, serif; font-size:14px; color:' + ink + '; margin:0 0 8px; line-height:1.6;">Thanks for riding with me. I\'ll see some of you out there.<br>Nicólas</p>' +
    '<p style="font-family:Georgia, serif; font-style:italic; font-size:12px; color:' + inkMuted + '; margin:0 0 24px;">An Ja Karachuonyo Kokoth</p>' +
    '</td></tr>' +
    '<tr><td style="padding:20px 28px 0; border-top:1px solid ' + line + ';">' +
    '<p style="font-family:Georgia, serif; font-size:12px; color:' + footerMuted + '; margin:16px 0 0;">Sent with love from Nicólas Soul. <a href="' + unsubUrl + '" style="color:' + footerMuted + ';">Unsubscribe</a></p>' +
    '<p style="font-family:Georgia, serif; font-size:11px; color:' + footerMuted + '; margin:6px 0 0;">NuRenaissance Media, 14919 Lebanon Rd, Old Hickory, TN 37138</p>' +
    '</td></tr>' +
    buildTrimRow() +
    '</table></td></tr></table>';
}

function buildTrimRow() {
  let marks = '';
  for (let i = 0; i < 16; i++) {
    const color = i % 2 === 0 ? '#e8392e' : '#00a82a';
    const glyph = i % 2 === 0 ? '▲' : '▽'; // small triangle up / down
    marks += '<span style="color:' + color + ';">' + glyph + '</span> ';
  }
  return '<tr><td align="center" style="padding:14px 0; font-size:10px; line-height:1;">' + marks + '</td></tr>';
}

function buildUnsubUrl(email) {
  return WEB_APP_URL +
    '?unsub=' + encodeURIComponent(email) +
    '&token=' + generateUnsubToken(email);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
