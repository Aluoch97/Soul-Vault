/* ── website pages: Home, Tour, Press (mirror soulnicolas.com; edit the text/links here) ── */
const SITE = {
  tagline: 'Heal hop artist. Hip-hop and R&B rooted in healing, self-work, and reinvention. Founder of NuRenaissance.',
  bio: "Nicólas Soul is a heal hop artist, hip-hop and R&B rooted in healing, self-work, and reinvention, and the founder of NuRenaissance.\n\n"
     + "He was born in Homa Bay, Kenya and raised in Tennessee from age six. Writing and recording since 2012, he's built a sound that blends soulful vocals with introspective, systems-minded songwriting, drawing from Eminem's lyricism, Lauryn Hill's soul, and the genre-blurring instincts of Kanye West and Childish Gambino.\n\n"
     + "Follow his #ROADTO100SHOWS journey as he performs his way to his highest self.",
  booking: 'nurrenaissance@gmail.com',
  support: 'https://www.nrnszn.com/support',
  photos: ['p01', 'p02', 'p03', 'p04', 'p05', 'p06', 'p07', 'p08', 'p09', 'p10', 'p11'],   // Lore photo wall: public/photos/<name>.jpg
  // Home "Latest": the single and project come from the Vault (newest release already out); these two are YouTube videos [id, title].
  feature: ['JcCS7z57lmc', 'Dorian Robinson - SEARCHIN (feat. Nicólas Soul & Dylan Hammock)'],
  video: ['ygF-rGp0ZYU', 'Nicólas Soul - SAIL AWAY! (feat. Aziza Latrece)'],
  links: [
    ['Spotify', 'https://open.spotify.com/artist/0trticneQHmkSeVLyPSIuH'],
    ['Apple Music', 'https://music.apple.com/us/artist/nic%C3%B3las-soul/1224416995'],
    ['YouTube', 'https://www.youtube.com/channel/UCbmmYh6O9kaXltKu5pazb6g'],
    ['Bandcamp', 'https://nrnszn.bandcamp.com/music'],
    ['SoundCloud', 'https://soundcloud.com/nrnszn'],
    ['Instagram', 'https://www.instagram.com/soulnicolas'],
    ['TikTok', 'https://www.tiktok.com/@soulnicolas'],
    ['Threads', 'https://www.threads.com/@soulnicolas'],
    ['Facebook', 'https://www.facebook.com/soulnicolas']
  ],
  // Press articles, newest first. Each card: link, headline, blurb, publication, and a picture saved in public/press-img/<image>.jpg.
  press: [
    { url: 'https://umcworldwide.com/2026/01/14/nicolas-soul-smoky-blues/', image: 'umc', site: 'Underground Music Collective', date: 'Jan 14, 2026',
      title: "WATCH: Nicólas Soul & Foundation Mecca Catch the 'smoky blues'", desc: 'A weekend trip to the Smoky Mountains has resulted in the latest collaboration between UnderDogs.' },
    { url: 'https://nashvillevoyager.com/interview/nicolas-soul-on-life-lessons-legacy-highlight', image: 'nv2026', site: 'Nashville Voyager', date: '2026',
      title: 'Nicólas Soul on Life, Lessons & Legacy', desc: 'Nicólas Soul shared their story and experiences with us recently and you can find our conversation below. Nicólas, so good to connect and we’re excited to share your story and insights with…' },
    { url: 'https://boldjourney.com/meet-nicolas-soul/', image: 'boldjourney', site: 'Bold Journey Magazine', date: '',
      title: 'Meet Nicólas Soul', desc: 'We were lucky to catch up with Nicólas Soul recently and have shared our conversation below. Nicólas, so great to be with you and I think a lot of folks are going to benefit from hearing…' },
    { url: 'https://canvasrebel.com/meet-nicolas-soul/', image: 'canvasrebel', site: 'Canvas Rebel', date: '',
      title: 'Meet Nicólas Soul', desc: 'We caught up with the brilliant and insightful Nicólas Soul a few weeks ago and have shared our conversation below.' },
    { url: 'https://nashvillevoyager.com/interview/rising-stars-meet-nicolas-soul-of-nashville', image: 'nv2024', site: 'Nashville Voyager', date: '2024',
      title: 'Rising Stars: Meet Nicólas Soul of Nashville', desc: 'Today we’d like to introduce you to Nicólas Soul Alright, so thank you so much for sharing your story and insight with our readers. To kick things off, can you tell us a bit about how you…' },
    { url: 'https://www.buzz-music.com/post/nic%C3%B3las-soul-tells-a-story-with-his-album-soulless', image: 'buzz', site: 'BUZZMUSIC', author: 'Jennifer Gurton', date: 'Feb 7, 2020',
      title: 'Nicólas Soul Tells A Story With His Album, “SoulLESS”', desc: 'Nicólas Soul released the thought-provoking album titled “SoulLESS”. When asked about the name of this album, Nicólas Soul explains that the name is based upon two concepts. This album…' },
    { url: "https://aboveaveragehiphop.com/nicolas-soul-drops-a-new-ep-called-summer-break/", image: "aah", site: "Above Average Hip Hop", date: "2016", title: "Nicólas Soul Drops a New EP Called Summer Break", desc: "Coverage of the Summer Break EP." },
    { url: "https://thebandcampdiaries.com/post/185469080652/nic%C3%B3las-soul-soulless-nic%C3%B3las-soul-is-a", image: "bcd", site: "The Bandcamp Diaries", date: "", title: "Nicólas Soul: soulLESS", desc: "A review of the soulLESS album." },
    { url: "https://thearkofmusic.com/nurenaissance-redd-bluu/", image: "ark", site: "The Ark of Music", date: "", title: "NuRenaissance: REDD & bluu", desc: "Coverage of REDD and bluu from the NuRenaissance." },
    { url: "https://indiebandguru.com/nurenaissance-redd-bluu/", image: "ibg", site: "Indie Band Guru", date: "Aug 4, 2020", title: "Decide to go with REDD or bluu in the NuRenaissance", desc: "Coverage of REDD and bluu from the NuRenaissance." },
    { url: "https://stereostickman.com/music/nurenaissance-redd-bluu/", image: "ss", site: "Stereo Stickman", date: "2020", title: "NuRenaissance: REDD & bluu", desc: "Coverage of REDD and bluu from the NuRenaissance." },
    { url: "https://maxedhiphop.com/the-heart-and-sound-of-nicolas-soul/", image: "maxed", site: "Maxed Hip Hop", date: "Jul 7, 2025", title: "The Heart and Sound of Nicólas Soul", desc: "A feature on Nicólas Soul." },
    { url: "https://utdailybeacon.com/109514/arts-and-culture/review-the-connect-playlist-brings-together-campus-musicians/", image: "utdb", site: "The Daily Beacon (University of Tennessee)", date: "", title: "Review: The Connect playlist brings together campus musicians", desc: "A review of a campus playlist that includes Nicólas Soul." },
  ],
  videos: [
    ["Da' Healerz Circle Ep. 5 w/ Special Guest Nicólas Soul", 'fJkff8Er46Q'],
    ['WXNA 101.5 Interview: Spring 2025 Showcase', 'pI-8wc_kuhs'],
    ['Nicólas Soul & Yonna Jones talk new album, how they met & upcoming show (WXNA 101.5)', 'pYvXOm71zRo'],
    ['Have You Met...? ft. Jazzy the Uncontrolled Goddess, Kelsey Muse, and Nicolas Soul', 'rX8hJj4omXU']
  ]
};
const BRAND = {"Spotify":"M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z","Apple Music":"M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.4-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.624.497 2.373.65 1.42 1.738 2.353 3.234 2.801.42.127.856.187 1.293.228.555.053 1.11.06 1.667.06h11.03a12.5 12.5 0 001.57-.1c.822-.106 1.596-.35 2.295-.81a5.046 5.046 0 001.88-2.207c.186-.42.293-.87.37-1.324.113-.675.138-1.358.137-2.04-.002-3.8 0-7.595-.003-11.393zm-6.423 3.99v5.712c0 .417-.058.827-.244 1.206-.29.59-.76.962-1.388 1.14-.35.1-.706.157-1.07.173-.95.045-1.773-.6-1.943-1.536a1.88 1.88 0 011.038-2.022c.323-.16.67-.25 1.018-.324.378-.082.758-.153 1.134-.24.274-.063.457-.23.51-.516a.904.904 0 00.02-.193c0-1.815 0-3.63-.002-5.443a.725.725 0 00-.026-.185c-.04-.15-.15-.243-.304-.234-.16.01-.318.035-.475.066-.76.15-1.52.303-2.28.456l-2.325.47-1.374.278c-.016.003-.032.01-.048.013-.277.077-.377.203-.39.49-.002.042 0 .086 0 .13-.002 2.602 0 5.204-.003 7.805 0 .42-.047.836-.215 1.227-.278.64-.77 1.04-1.434 1.233-.35.1-.71.16-1.075.172-.96.036-1.755-.6-1.92-1.544-.14-.812.23-1.685 1.154-2.075.357-.15.73-.232 1.108-.31.287-.06.575-.116.86-.177.383-.083.583-.323.6-.714v-.15c0-2.96 0-5.922.002-8.882 0-.123.013-.25.042-.37.07-.285.273-.448.546-.518.255-.066.515-.112.774-.165.733-.15 1.466-.296 2.2-.444l2.27-.46c.67-.134 1.34-.27 2.01-.403.22-.043.442-.088.663-.106.31-.025.523.17.554.482.008.073.012.148.012.223.002 1.91.002 3.822 0 5.732z","YouTube":"M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z","Bandcamp":"M0 18.75l7.437-13.5H24l-7.438 13.5H0z","SoundCloud":"M23.999 14.165c-.052 1.796-1.612 3.169-3.4 3.169h-8.18a.68.68 0 0 1-.675-.683V7.862a.747.747 0 0 1 .452-.724s.75-.513 2.333-.513a5.364 5.364 0 0 1 2.763.755 5.433 5.433 0 0 1 2.57 3.54c.282-.08.574-.121.868-.12.884 0 1.73.358 2.347.992s.948 1.49.922 2.373ZM10.721 8.421c.247 2.98.427 5.697 0 8.672a.264.264 0 0 1-.53 0c-.395-2.946-.22-5.718 0-8.672a.264.264 0 0 1 .53 0ZM9.072 9.448c.285 2.659.37 4.986-.006 7.655a.277.277 0 0 1-.55 0c-.331-2.63-.256-5.02 0-7.655a.277.277 0 0 1 .556 0Zm-1.663-.257c.27 2.726.39 5.171 0 7.904a.266.266 0 0 1-.532 0c-.38-2.69-.257-5.21 0-7.904a.266.266 0 0 1 .532 0Zm-1.647.77a26.108 26.108 0 0 1-.008 7.147.272.272 0 0 1-.542 0 27.955 27.955 0 0 1 0-7.147.275.275 0 0 1 .55 0Zm-1.67 1.769c.421 1.865.228 3.5-.029 5.388a.257.257 0 0 1-.514 0c-.21-1.858-.398-3.549 0-5.389a.272.272 0 0 1 .543 0Zm-1.655-.273c.388 1.897.26 3.508-.01 5.412-.026.28-.514.283-.54 0-.244-1.878-.347-3.54-.01-5.412a.283.283 0 0 1 .56 0Zm-1.668.911c.4 1.268.257 2.292-.026 3.572a.257.257 0 0 1-.514 0c-.241-1.262-.354-2.312-.023-3.572a.283.283 0 0 1 .563 0Z","Instagram":"M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077","TikTok":"M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z","Threads":"M18.263 11.097c-.03-3.486-1.92-5.586-5.111-5.586-2.13 0-3.922.963-4.863 2.499l2.062 1.438c.535-.843 1.272-1.543 2.628-1.543 1.528 0 2.318.85 2.544 2.431a15 15 0 0 0-2.236-.173c-4.125 0-6.068 1.867-6.068 4.336s1.943 3.99 4.804 3.99c3.139 0 5.013-2.115 5.781-4.735.798.361 1.348 1.204 1.348 2.47 0 3.387-3.907 5.232-7.22 5.232-4.885 0-8.077-3.207-8.077-8.424 0-6.392 4.223-10.487 9.9-10.487 3.808 0 5.69 1.671 6.97 3.914l2.108-1.475C21.44 2.078 18.331 0 13.663 0 6.227 0 1.168 5.277 1.168 12.934c0 7 4.953 11.066 10.856 11.066 4.878 0 9.809-2.846 9.809-7.716 0-2.545-1.46-4.231-3.569-5.187m-6.33 4.855c-1.077 0-2.026-.512-2.026-1.453 0-1.483 1.822-1.934 3.606-1.934.678 0 1.34.045 1.927.173-.422 1.927-1.671 3.215-3.508 3.214Z","Facebook":"M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"};   // brand logos (simple-icons, CC0), keyed by the names in SITE.links
const JOIN_URL = () => (BOOT.api ? '/join' : (S.lib && S.lib.newsletter) || '');

// Newest single and newest project (EP, album, mixtape...) that are already out: a future release date does not count yet.
function homePicks() {
  const today = new Date().toISOString().slice(0, 10);
  const out = shelfOrder(((S.lib && S.lib.releases) || []).filter(r => (OWNER || !isUnrel(r)) && relDateKey(r) <= today));
  return { single: out.find(r => typeOf(r) === 'Single'), project: out.find(r => typeOf(r) !== 'Single') };
}
// Until the library arrives, the single and project show a grey placeholder; the rest of Home does not need the library.
function homeCover(r, label, slot) {
  if (!S.lib) {   // first visit: getHome may already have sent the two covers (small pictures); the library follows
    const l = S.homeLite && S.homeLite[slot];
    if (l && (l.src || l.img || l.thumb)) return `<figure class="lat" data-slot="${slot}"><button class="latcover" data-rel="${esc(l.release_id)}" aria-label="Open ${esc(l.title)}">
      <img src="${esc(l.src || l.img || l.thumb)}" alt="${esc(l.title)} cover"></button><figcaption class="latlabel">${label}</figcaption></figure>`;
  }
  if (!S.lib) return `<figure class="lat" data-slot="${slot}"><div class="latcover skel" aria-hidden="true"></div><figcaption class="latlabel">${label}</figcaption></figure>`;
  return r ? `<figure class="lat" data-slot="${slot}"><button class="latcover" data-rel="${esc(r.release_id)}" aria-label="Open ${esc(r.title)}">
      <img data-home-cover="${esc(r.cover_file_id)}" alt="${esc(r.title)} cover"></button><figcaption class="latlabel">${label}</figcaption></figure>` : '';
}
// getHome answered before the library: show the two covers now (the library swaps in the full version later).
function paintHomeLite(p) {
  const prev = S.homeLite || {}; S.homeLite = Object.assign({}, p);
  ['single', 'project'].forEach(slot => {
    const l = S.homeLite[slot]; if (!l) return;
    if (prev[slot] && prev[slot].release_id === l.release_id) { S.homeLite[slot] = prev[slot]; return; }   // the same release is already on screen: leave it alone
    primeHomeCover(l);
    const el = $('.homepg [data-slot="' + slot + '"]'); if (el && S.view === 'home' && !S.lib) el.outerHTML = homeCover(null, slot === 'single' ? 'Single' : 'Project', slot);
  });
}
// The sharp cover is also what the library's Home swap starts from (so the picture never drops to a tiny thumbnail).
function primeHomeCover(l) {
  const u = l && (l.src || l.img);
  if (u && l.cover_file_id && !S.covers[l.cover_file_id]) { S.covers[l.cover_file_id] = u; S.coverP[l.cover_file_id] = Promise.resolve(u); }
}
// The library arrived after Home was already on screen: swap in the real covers and leave everything else (video, scroll, a playing video) alone.
function fillHomeLatest() {
  const { single, project } = homePicks();
  [['single', single, 'Single'], ['project', project, 'Project']].forEach(([slot, r, label]) => {
    const el = $('.homepg [data-slot="' + slot + '"]'); if (el) el.outerHTML = homeCover(r, label, slot);
  });
  $$('[data-home-cover]').forEach(img => setCover(img, img.dataset.homeCover, true));
  startHomeVideo($('#sitebg video'), 1200);   // the covers have the connection now; the video can follow
}
// The background video starts only after the page has settled, and not at all for reduced motion, data saver or a very slow connection.
// It waits `delay` ms (so the library and covers get the connection first); calling it again with a shorter delay moves the start earlier.
function startHomeVideo(v, delay) {
  if (!v || v.dataset.started) return;
  const c = navigator.connection;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || '')))) { v.parentNode.classList.add('still'); v.remove(); return; }
  // Slow cellular (3g or worse): keep the still picture.
  if (c && /(^|-)3g$/.test(c.effectiveType || '')) { v.parentNode.classList.add('still'); v.remove(); return; }
  const go = () => { if (v.dataset.started || !v.isConnected) return; v.dataset.started = '1'; v.src = '/home-bg-hd.mp4'; v.muted = true; const p = v.play(); if (p && p.catch) p.catch(() => {}); };
  clearTimeout(v._t); v._t = setTimeout(() => (window.requestIdleCallback || (f => f()))(go, { timeout: 1500 }), delay);
}
// First visit: draw the parts of Home that need no data (name, Support, sign-up, links, YouTube) right away.
function paintHomeShell() { S.homeShell = true; renderHome(); }
function renderHome() {
  clearPageBg(); S.view = 'home'; renderChrome();
  if (S.lib && S.homeShell && $('.homepg')) { S.homeShell = false; fillHomeLatest(); return; }
  const { single, project } = homePicks();
  const join = JOIN_URL();
  const yt = (v, label) => `<figure class="lat"><button class="latvid" data-yt="${esc(v[0])}" aria-label="Play ${esc(v[1])}">
      <img src="https://i.ytimg.com/vi/${esc(v[0])}/hqdefault.jpg" alt="" loading="lazy" onerror="this.remove()"><i>${I.play}</i></button>
      <div class="lattitle">${esc(v[1])}</div><figcaption class="latlabel">${label}</figcaption></figure>`;
  $('#main').innerHTML = `<div class="wrap sitepg homepg">
    <section class="sitehero">
      <h1 class="herot">Nicólas <span>Soul</span></h1>
      <p class="herop">${esc(SITE.tagline)}</p>
      <div class="linkgrid" role="group" aria-label="Listen and follow">${SITE.links.map(l => `<a class="soc" href="${esc(l[1])}" target="_blank" rel="noopener" aria-label="${esc(l[0])}" title="${esc(l[0])}">${BRAND[l[0]] ? `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="${BRAND[l[0]]}"/></svg>` : esc(l[0])}</a>`).join('')}</div>
      <a class="support" href="${esc(SITE.support)}" target="_blank" rel="noopener"><span>Support Nicólas Soul</span><i aria-hidden="true">$</i></a>
    </section>
    <section class="latest" aria-label="Latest">
      <h2 class="lathead">Latest</h2>
      ${homeCover(single, 'Single', 'single')}${homeCover(project, 'Project', 'project')}${yt(SITE.feature, 'Feature')}${yt(SITE.video, 'Video')}
    </section>
    ${join ? `<section class="tribe" id="tribe" data-join="${esc(join)}"><div><div class="tt2">Join the <b>Soul Tribe</b></div>
      <p class="cs">Get new music before anyone else, show announcements, and behind the scenes content.</p></div>
      <button type="button" class="pill main" data-tribe-open>${I.mail}Join the Soul Tribe</button></section>` : ''}
    <p class="cs sitefoot">Booking: <a href="mailto:${esc(SITE.booking)}">${esc(SITE.booking)}</a> · <a href="/privacy-policy">Privacy policy</a> · <a href="#" data-install>Add to Home Screen</a> · © ${new Date().getFullYear()} Nicólas Soul</p>
  </div>`;
  // Covers; videos load from YouTube only when tapped (nothing from YouTube runs until then); then the background video
  // (a still image instead if the person asked for less motion or is saving data).
  $$('[data-home-cover]').forEach(img => setCover(img, img.dataset.homeCover, true));
  wireYt(); wireTribe();
  window.scrollTo(0, 0);
}

// The Soul Tribe card opens the sign-up form right on Home (the /join page shown inside the card); Close puts the card back as it was.
function wireTribe() {
  const card = $('#tribe'), btn = card && card.querySelector('[data-tribe-open]'); if (!btn) return;
  const original = card.innerHTML;
  btn.addEventListener('click', () => {
    card.classList.add('open');
    card.innerHTML = `<div class="tribehead"><div class="tt2">Join the <b>Soul Tribe</b></div><button type="button" class="tribeclose" data-tribe-close aria-label="Close the sign-up form">✕</button></div>
      <iframe class="tribeframe" title="Join the Soul Tribe" src="${esc(card.dataset.join)}?embed=1"></iframe>`;
    const f = card.querySelector('iframe');
    const fit = () => { try { const d = f.contentDocument; if (d && d.body) f.style.height = Math.max(420, Math.ceil(d.documentElement.scrollHeight)) + 'px'; } catch (e) {} };
    f.addEventListener('load', () => { fit(); try { if (window.ResizeObserver) new ResizeObserver(fit).observe(f.contentDocument.body); } catch (e) {} });
    card.querySelector('[data-tribe-close]').addEventListener('click', () => { card.classList.remove('open'); card.innerHTML = original; wireTribe(); card.scrollIntoView({ block: 'center' }); });
    card.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
}
// Tap a video picture and it turns into YouTube's player right there (the privacy-enhanced one); nothing from YouTube loads before that.
function wireYt(root) {
  [...(root || document).querySelectorAll('[data-yt]')].forEach(b => b.addEventListener('click', () => {
    const f = document.createElement('iframe');
    f.className = 'latplayer'; f.title = (b.getAttribute('aria-label') || 'Video').replace(/^Play /, '');
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen; web-share'; f.allowFullscreen = true;
    f.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(b.dataset.yt) + '?autoplay=1&rel=0&playsinline=1';
    b.replaceWith(f);
  }));
}
function renderTour() {
  clearPageBg(); S.view = 'tour'; renderChrome();
  const fit = () => document.documentElement.style.setProperty('--tabh', ($('#tabs') ? $('#tabs').offsetHeight : 70) + 'px');
  fit(); if (window.ResizeObserver && $('#tabs')) { if (S.tabRO) S.tabRO.disconnect(); S.tabRO = new ResizeObserver(fit); S.tabRO.observe($('#tabs')); }   // keep the bottom edge in step with the tab bar
  const pages = { shows: '/shows.html', road: '/roadto100shows.html' };
  if (!pages[S.tourTab]) S.tourTab = 'shows';
  $('#main').innerHTML = `<div class="wrap tourpg">
    <div class="tourseg" role="tablist" aria-label="Tour">
      <button role="tab" data-tourtab="shows">Shows</button><button role="tab" data-tourtab="road">Road to 100</button></div>
    <iframe class="tourframe" title="Tour"></iframe></div>`;
  const frame = $('.tourframe'), btns = [...$$('[data-tourtab]')];
  const pick = k => {
    S.tourTab = k; syncUrl(); frame.title = k === 'shows' ? 'Upcoming and past shows' : 'Road to 100 Shows tracker'; frame.src = pages[k];
    btns.forEach(b => b.setAttribute('aria-selected', String(b.dataset.tourtab === k)));
  };
  btns.forEach(b => b.addEventListener('click', () => pick(b.dataset.tourtab)));
  pick(S.tourTab);
  window.scrollTo(0, 0);
}

function renderPress() {
  clearPageBg(); S.view = 'press'; renderChrome();
  const articles = `<div class="pcards">${SITE.press.map(p => `<a class="pcard" href="${esc(p.url)}" target="_blank" rel="noopener">
      <div class="pimg"><span class="pfall" aria-hidden="true">${esc(p.site)}</span><img src="/press-img/${esc(p.image)}.jpg" alt="" loading="lazy" onerror="this.remove()"></div>
      <div class="pbody"><div class="ptitle">${esc(p.title)}</div><p class="pdesc">${esc(p.desc)}</p>
        <div class="pfoot"><span class="pico" aria-hidden="true">${esc(p.site.charAt(0))}</span><span class="psrc">${esc([p.site, p.author, p.date].filter(Boolean).join(' · '))}</span>${I.chev}</div></div></a>`).join('')}</div>`;
  const videos = `<div class="vidgrid">${SITE.videos.map(v => `<div class="vid">
      <button class="thumb" data-yt="${esc(v[1])}" aria-label="Play ${esc(v[0])}"><img src="https://i.ytimg.com/vi/${esc(v[1])}/hqdefault.jpg" alt="" loading="lazy" onerror="this.remove()"><i>${I.play}</i></button><span class="vt">${esc(v[0])}</span></div>`).join('')}</div>`;
  if (S.pressTab !== 'articles' && S.pressTab !== 'video') S.pressTab = 'articles';
  $('#main').innerHTML = `<div class="wrap sitepg presspg">
    <div class="tourseg pseg" role="tablist" aria-label="Press"><button role="tab" data-presstab="articles">Articles</button><button role="tab" data-presstab="video">Video</button></div>
    <div id="pressBody"></div>
    <p class="cs sitefoot">Press and booking: <a href="mailto:${esc(SITE.booking)}">${esc(SITE.booking)}</a></p>
  </div>`;
  const body = $('#pressBody'), btns = [...$$('[data-presstab]')];
  const pick = k => {
    S.pressTab = k; syncUrl(); body.innerHTML = k === 'video' ? videos : articles; if (k === 'video') wireYt(body);
    btns.forEach(b => b.setAttribute('aria-selected', String(b.dataset.presstab === k)));
  };
  btns.forEach(b => b.addEventListener('click', () => { pick(b.dataset.presstab); window.scrollTo(0, 0); }));
  pick(S.pressTab);
  window.scrollTo(0, 0);
}


// Video tab: the two YouTube playlists (Originals, Remixes). The list is read at the edge (getVideoLists); if that fails, a button still opens the playlist on YouTube.
const VIDEO_PL = { originals: 'PLYYNnxWFsj19t22I4Qy6lke0ytPaFz3LK', remixes: 'PLYYNnxWFsj18iVfs3mLzki3VA2OesBnDV' };
function renderVideo() {
  clearPageBg(); S.view = 'video'; renderChrome();
  if (S.videoTab !== 'originals' && S.videoTab !== 'remixes') S.videoTab = 'originals';
  $('#main').innerHTML = `<div class="wrap sitepg presspg videopg">
    <div class="tourseg pseg" role="tablist" aria-label="Video"><button role="tab" data-vidtab="originals">Originals</button><button role="tab" data-vidtab="remixes">Remixes</button></div>
    <div id="videoBody"><p class="cs">Loading videos…</p></div></div>`;
  const body = $('#videoBody'), btns = [...$$('[data-vidtab]')];
  const draw = k => {
    const L = S.videoLists && S.videoLists.find(x => x.key === k), yt = 'https://www.youtube.com/playlist?list=' + VIDEO_PL[k];
    if (!S.videoLists) { body.innerHTML = '<p class="cs">Loading videos…</p>'; return; }
    if (!L || !L.videos || !L.videos.length) { body.innerHTML = `<p class="cs">The videos could not load right now.</p><p><a class="pill" href="${esc(yt)}" target="_blank" rel="noopener">Open on YouTube</a></p>`; return; }
    body.innerHTML = `<div class="vidgrid">${L.videos.map(v => `<div class="vid">
      <button class="thumb" data-yt="${esc(v.id)}" aria-label="Play ${esc(v.title)}"><img src="https://i.ytimg.com/vi/${esc(v.id)}/hqdefault.jpg" alt="" loading="lazy" onerror="this.remove()"><i>${I.play}</i></button><span class="vt">${esc(v.title)}</span></div>`).join('')}</div>
      <p class="cs sitefoot"><a href="${esc(yt)}" target="_blank" rel="noopener">Open the whole playlist on YouTube</a></p>`;
    wireYt(body);
  };
  const pick = k => { S.videoTab = k; syncUrl(); btns.forEach(b => b.setAttribute('aria-selected', String(b.dataset.vidtab === k))); draw(k); };
  btns.forEach(b => b.addEventListener('click', () => { pick(b.dataset.vidtab); window.scrollTo(0, 0); }));
  pick(S.videoTab);
  if (!S.videoLists) runBase('getVideoLists').then(r => { S.videoLists = (r && r.lists) || []; if (S.view === 'video') draw(S.videoTab); }).catch(() => { S.videoLists = []; if (S.view === 'video') draw(S.videoTab); });
  window.scrollTo(0, 0);
}
