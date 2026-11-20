/*
 * Fixarr demo mode: open the web app with ?demo to see every page filled with made-up shows.
 * Nothing is read from or sent to Sonarr; every /api/ call is answered here. Used for the README screenshots.
 */
(function () {
  'use strict';
  var NOW = Math.floor(Date.now() / 1000), H = 3600, D = 86400;
  var ROOT = '/data/torrents/tv/';

  var SERIES = [
    [1, 'Harbor Lights', 2019, 'Northwind', 'continuing', true, 38, 40, ['#0f2b46', '#2d7fb8']],
    [2, 'The Copper Mile', 2021, 'Meridian', 'continuing', true, 20, 20, ['#3b1d0e', '#c8742c']],
    [3, 'Orbit Kitchen', 2018, 'Fieldhouse TV', 'ended', true, 52, 52, ['#1e1b3a', '#7b5cd6']],
    [4, 'Paper Lanterns', 2020, 'Kestrel', 'continuing', true, 9, 24, ['#3a0f1e', '#e0566f']],
    [5, 'Saltmarsh', 2015, 'Coastline', 'ended', true, 30, 30, ['#13302a', '#4fb38f']],
    [6, 'Little Engineers', 2017, 'Sprout Box', 'continuing', true, 61, 130, ['#103a52', '#f2c230']],
    [7, 'Signal & Noise', 2023, 'Meridian', 'continuing', true, 16, 16, ['#111418', '#35c5f4']],
    [8, 'Night Shift at Pine Ridge', 2022, 'Northwind', 'continuing', true, 22, 22, ['#0d1f14', '#6fae5b']],
    [9, 'Fieldnotes from Nowhere', 2016, 'Atlas', 'ended', true, 18, 18, ['#2e2a1c', '#c9b46a']],
    [10, 'The Lantern Keepers', 2024, 'Kestrel', 'continuing', true, 7, 10, ['#241238', '#d08cf0']],
    [11, 'Velvet Static', 2012, 'Coastline', 'ended', false, 40, 44, ['#2b0f2b', '#e36bd0']],
    [12, 'Cold Open Tonight', 2020, 'Fieldhouse TV', 'continuing', true, 110, 110, ['#1b1b1b', '#f05050']],
    [13, 'Rooftop Gardens', 2019, 'Atlas', 'ended', true, 12, 12, ['#18301a', '#9bd16a']],
    [14, 'Mapmakers', 2021, 'Northwind', 'continuing', true, 24, 24, ['#2a2116', '#e8a54b']],
    [15, 'Deep Field', 2022, 'Meridian', 'continuing', true, 8, 8, ['#060b1a', '#5d9cec']],
    [16, 'The Quiet Hours', 2018, 'Kestrel', 'ended', true, 26, 26, ['#1a1f24', '#8fa3b5']]
  ].map(function (s) {
    return { id: s[0], title: s[1], year: s[2], network: s[3], status: s[4], monitored: s[5], files: s[6], episodes: s[7],
             slug: s[1].toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), poster: true, colors: s[8] };
  });
  function byId(id) { return SERIES.find(function (s) { return s.id === id; }); }
  function pub(s) { var o = {}; Object.keys(s).forEach(function (k) { if (k !== 'colors') o[k] = s[k]; }); return o; }

  // ----------------------------------------------------------------- posters: drawn, so nothing real is shown
  function words(t, max) {
    var out = [], line = '';
    t.split(' ').forEach(function (w) { if ((line + ' ' + w).trim().length > max && line) { out.push(line); line = w; } else line = (line + ' ' + w).trim(); });
    if (line) out.push(line); return out;
  }
  window.FIXARR_DEMO_POSTER = function (id) {
    var s = byId(+id); if (!s) return '';
    var c = s.colors, lines = words(s.title.toUpperCase(), 11), y = 250 - lines.length * 17;
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 375"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + c[1] + '"/><stop offset=".62" stop-color="' + c[0] + '"/></linearGradient>' +
      '<radialGradient id="r" cx=".72" cy=".24" r=".55"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="250" height="375" fill="url(#g)"/><rect width="250" height="375" fill="url(#r)"/>' +
      '<circle cx="' + (60 + (s.id * 37) % 140) + '" cy="' + (90 + (s.id * 23) % 60) + '" r="' + (38 + (s.id * 11) % 30) + '" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="2"/>' +
      '<path d="M0 ' + (300 - (s.id * 7) % 40) + ' Q125 ' + (250 + (s.id * 13) % 50) + ' 250 ' + (290 - (s.id * 5) % 30) + ' V375 H0Z" fill="#000" fill-opacity=".35"/>' +
      lines.map(function (l, i) { return '<text x="125" y="' + (y + i * 34) + '" text-anchor="middle" font-family="Segoe UI,Roboto,Arial,sans-serif" font-size="27" font-weight="800" letter-spacing="1" fill="#fff">' + l.replace(/&/g, '&amp;') + '</text>'; }).join('') +
      '<text x="125" y="352" text-anchor="middle" font-family="Segoe UI,Roboto,Arial,sans-serif" font-size="12" letter-spacing="3" fill="#fff" fill-opacity=".75">' + s.network.toUpperCase() + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  };

  // ----------------------------------------------------------------- packs in the download folders
  function pack(name, sid, seasons, files, state, extra) {
    var s = byId(sid), list = seasons.replace(/S/g, '').split('-').map(Number);
    var sl = []; for (var n = list[0]; n <= (list[1] || list[0]); n++) sl.push(n);
    return Object.assign({ name: name, path: ROOT + name, series_id: sid, series_title: s ? s.title : null, seasons: seasons, season_list: sl, files: files,
      state: state, missing: 0, missing_eps: [], missing_seasons: [], imported: state === 'done', imported_at: state === 'done' ? NOW - 2 * D : null,
      linked: state === 'needs' ? 0 : files, unlinked: 0, size: files * 380e6, why: '' }, extra || {});
  }
  var PACKS = [
    pack('Little.Engineers.S03-S05.1080p.WEBRip.x265-DEMO', 6, 'S03-S05', 69, 'needs', { missing: 69, linked: 0, why: '69 episodes the library is missing' }),
    pack('Paper.Lanterns.S02.1080p.WEB-DL.DDP5.1.H.264-DEMO', 4, 'S02', 15, 'needs', { missing: 15, linked: 0 }),
    pack('Harbor.Lights.S04.720p.HDTV.x264-DEMO', 1, 'S04', 10, 'needs', { missing: 2, linked: 8 }),
    pack('Saltmarsh.Specials.Collection.1080p.WEB-DL-DEMO', 5, 'S00', 6, 'review', { why: 'Specials without numbers' }),
    pack('The.Copper.Mile.S01-S02.1080p.WEB-DL.DDP5.1-DEMO', 2, 'S01-S02', 20, 'done'),
    pack('Orbit.Kitchen.Complete.Series.720p.WEB-DL-DEMO', 3, 'S01-S04', 52, 'done'),
    pack('Signal.and.Noise.S01.2160p.WEB-DL.HDR-DEMO', 7, 'S01', 16, 'done'),
    pack('Night.Shift.at.Pine.Ridge.S01-S02.1080p.WEB-DL-DEMO', 8, 'S01-S02', 22, 'done'),
    pack('Mapmakers.S01-S02.1080p.AMZN.WEB-DL-DEMO', 14, 'S01-S02', 24, 'covered'),
    pack('Cold.Open.Tonight.S01-S05.720p.WEB-DL-DEMO', 12, 'S01-S05', 110, 'done')
  ];
  function counts() {
    var c = { needs: 0, review: 0, done: 0, covered: 0 }; PACKS.forEach(function (p) { c[p.state]++; }); return c;
  }

  // ----------------------------------------------------------------- one pack, matched (Little Engineers season 3)
  var LE = ['Gears and Gizmos', 'The Wobbly Bridge', 'Rocket Day', 'Bubble Machine', 'The Great Pulley', 'Magnet Mayhem', 'Sandcastle Science',
    'Kite Weather', 'The Rain Gauge', 'Wheels Within Wheels', 'Light and Shadow', 'The Tallest Tower', 'Lever Lesson', 'The Marble Run'];
  function episodesFor(sid) {
    var eps = [], id = sid * 1000;
    if (sid === 6) { for (var se = 3; se <= 5; se++) for (var e = 1; e <= 23; e++) eps.push({ id: ++id, season: se, episode: e, title: se === 3 && LE[e - 1] ? LE[e - 1] : 'Episode ' + e, hasFile: false }); }
    else { for (var s2 = 1; s2 <= 4; s2++) for (var e2 = 1; e2 <= 12; e2++) eps.push({ id: ++id, season: s2, episode: e2, title: 'Chapter ' + e2, hasFile: s2 < 4 }); }
    return eps;
  }
  function preview(path) {
    var p = PACKS.find(function (x) { return x.path === path; }) || PACKS[0], s = byId(p.series_id), eps = episodesFor(s.id), m = [];
    function ep(se, e) { return eps.find(function (x) { return x.season === se && x.episode === e; }); }
    var base = s.title.replace(/[^A-Za-z0-9]+/g, '.');
    if (s.id === 6) {
      for (var e = 1; e <= 14; e++) {
        var x = ep(3, e), f = base + '.S03E' + (e < 10 ? '0' : '') + e + '.' + x.title.replace(/ /g, '.') + '.1080p.WEBRip.x265-DEMO.mkv';
        var row = { file: f, src: p.path, rel: 'Season 03/' + f, episodeId: x.id, episodeIds: [x.id], title: x.title, season: 3, confidence: 100, review: false,
          reasons: ['Season and episode number match', 'Title matches Sonarr exactly'], notes: [], method: 'title', library: null, minutes: 11 };
        if (e === 3) { row.file = base + '.S03E03.Rocket.Day.Part.1.1080p.WEBRip.x265-DEMO.mkv'; row.parts = [row.file, base + '.S03E03.Rocket.Day.Part.2.1080p.WEBRip.x265-DEMO.mkv']; row.minutes = 22; }
        if (e === 9) { row.confidence = 82; row.review = true; row.method = 'number'; row.file = base + '.S03E09.Rain.Day.1080p.WEBRip.x265-DEMO.mkv'; row.reasons = ['Episode number matches', 'Title is close but not the same ("Rain Day" vs "The Rain Gauge")']; }
        if (e === 12) row.notes = ['Runtime is 24 min; this series usually runs 11'];
        if (e === 1 || e === 2) row.library = 'linked';
        m.push(row);
      }
    } else {
      for (var e3 = 1; e3 <= 10; e3++) {
        var y = ep(4, e3) || eps[e3], f3 = base + '.S04E' + (e3 < 10 ? '0' : '') + e3 + '.720p.HDTV.x264-DEMO.mkv';
        m.push({ file: f3, src: p.path, rel: f3, episodeId: y.id, episodeIds: [y.id], title: y.title, season: y.season, confidence: 100, review: false, reasons: ['Season and episode number match'],
          notes: [], method: 'number', library: e3 < 9 ? 'linked' : null, minutes: 44 });
      }
    }
    return { pack: p.path, series: { id: s.id, title: s.title, slug: s.slug, runtime: 11 }, trust: 1, episodes: eps, matched: m,
      unmatched: s.id === 6 ? [{ file: base + '.S03.Behind.The.Scenes.1080p.WEBRip.x265-DEMO.mkv', src: p.path, rel: 'Season 03/Extras', reason: 'No episode in Sonarr looks like this file' }] : [],
      ignored: [] };
  }

  // ----------------------------------------------------------------- activity, history, audit
  var LOG = [
    { at: NOW - 9 * 60, kind: 'imported', text: 'Harbor Lights: imported 2 files automatically', slug: 'harbor-lights', history_id: 'h1' },
    { at: NOW - 41 * 60, kind: 'cleared', text: 'The Copper Mile: already in your library, cleared from Sonarr\'s queue (still seeding)', slug: 'the-copper-mile' },
    { at: NOW - 2 * H, kind: 'webhook', text: 'Sonarr flagged a download for manual import; Fixarr checked it right away' },
    { at: NOW - 3 * H, kind: 'review', text: 'Velvet Static: two files could be S03E07; waiting for you', slug: 'velvet-static' },
    { at: NOW - 6 * H, kind: 'imported', text: 'Signal & Noise: imported 16 files automatically', slug: 'signal-and-noise', history_id: 'h3' },
    { at: NOW - 21 * H, kind: 'audit', text: 'Library audit: 2 possibly mislabeled, 3 files not hardlinked' },
    { at: NOW - 22 * H, kind: 'relink', text: 'Library: relinked 4 files, 18.2 GB freed', history_id: 'h5' },
    { at: NOW - 30 * H, kind: 'cleared', text: 'Night Shift at Pine Ridge: already in your library, cleared from Sonarr\'s queue (still seeding)', slug: 'night-shift-at-pine-ridge' },
    { at: NOW - 2 * D, kind: 'imported', text: 'Orbit Kitchen: imported 52 files, 3 multi-part episodes joined', slug: 'orbit-kitchen', history_id: 'h6' }
  ];
  var HIST = [
    { id: 'h1', at: NOW - 9 * 60, kind: 'import', auto: true, can_undo: true, series: 'Harbor Lights', slug: 'harbor-lights', series_id: 1, pack_name: 'Harbor.Lights.S04.720p.HDTV.x264-DEMO', landed: 2, joined: 0, failed: [], skipped: [], placed: [] },
    { id: 'h2', at: NOW - 3 * H, kind: 'import', auto: false, can_undo: true, series: 'Paper Lanterns', slug: 'paper-lanterns', series_id: 4, pack_name: 'Paper.Lanterns.S01.1080p.WEB-DL.DDP5.1.H.264-DEMO', landed: 11, joined: 0,
      failed: [], skipped: [{ episode: 'S01E04', reason: 'The library already has a better copy (2160p)' }], placed: [] },
    { id: 'h3', at: NOW - 6 * H, kind: 'import', auto: true, can_undo: true, series: 'Signal & Noise', slug: 'signal-and-noise', series_id: 7, pack_name: 'Signal.and.Noise.S01.2160p.WEB-DL.HDR-DEMO', landed: 16, joined: 0, failed: [], skipped: [], placed: [] },
    { id: 'h4', at: NOW - 20 * H, kind: 'import', auto: false, can_undo: true, series: 'Saltmarsh', slug: 'saltmarsh', series_id: 5, pack_name: 'Saltmarsh.Specials.Collection.1080p.WEB-DL-DEMO', landed: 3, joined: 0,
      failed: [{ episode: 'S00E05', reason: 'Sonarr refused the file: it is a sample' }], skipped: [], placed: ['S00E06'] },
    { id: 'h5', at: NOW - 22 * H, kind: 'relink', auto: false, can_undo: true, series: '', slug: '', pack_name: '4 library files relinked to their seeding copies', landed: 4, freed: 18.2e9, failed: [], skipped: [], placed: [] },
    { id: 'h6', at: NOW - 2 * D, kind: 'import', auto: false, can_undo: true, series: 'Orbit Kitchen', slug: 'orbit-kitchen', series_id: 3, pack_name: 'Orbit.Kitchen.Complete.Series.720p.WEB-DL-DEMO', landed: 52, joined: 3, failed: [], skipped: [], placed: [] },
    { id: 'h7', at: NOW - 4 * D, kind: 'import', auto: false, can_undo: false, undone: true, series: 'Mapmakers', slug: 'mapmakers', series_id: 14, pack_name: 'Mapmakers.S02.720p.WEB-DL-DEMO', landed: 12, joined: 0, failed: [], skipped: [], placed: [] }
  ];
  var AUDIT = { at: NOW - 21 * H, running: false, progress: '', series: SERIES.length, wasted: 7.4e9,
    mislabeled: [
      { series: 'Fieldnotes from Nowhere', slug: 'fieldnotes-from-nowhere', series_id: 9, filed_as: 'S02E05 The Salt Flats', looks_like: 'S02E06 The Lighthouse', release: 'Fieldnotes.from.Nowhere.S02E05.The.Lighthouse.1080p.WEB-DL-DEMO', path: '' },
      { series: 'Cold Open Tonight', slug: 'cold-open-tonight', series_id: 12, filed_as: 'S03E11', looks_like: 'S03E12', release: 'Cold.Open.Tonight.S03E12.720p.WEB-DL-DEMO', path: '' }],
    unlinked: [
      { series: 'Rooftop Gardens', slug: 'rooftop-gardens', series_id: 13, episode: 'S01E03', size: 2.6e9, path: '/data/media/tv/Rooftop Gardens/Season 01/Rooftop Gardens - S01E03 - Compost.mkv', candidate: '' },
      { series: 'Rooftop Gardens', slug: 'rooftop-gardens', series_id: 13, episode: 'S01E04', size: 2.4e9, path: '/data/media/tv/Rooftop Gardens/Season 01/Rooftop Gardens - S01E04 - Rain Barrels.mkv', candidate: '' },
      { series: 'The Quiet Hours', slug: 'the-quiet-hours', series_id: 16, episode: 'S02E01', size: 2.4e9, path: '/data/media/tv/The Quiet Hours/Season 02/The Quiet Hours - S02E01 - Morning.mkv', candidate: '' }] };
  var SETTINGS = { addon_queue: true, addon_seasons: true, addon_series: true, addon_wanted: true, audit_hour: 3, audit_nightly: true, auto_clear: true, auto_import: true,
    auto_install: true, min_confidence: 90, plex_scan: true, resolve_minutes: 15, runtime_check: true, update_channel: 'stable', update_check: true };
  var WAITING = [{ series: 'Velvet Static', title: 'Velvet.Static.S03E07.1080p.WEB.h264-DEMO', plan: { text: 'Two files could be S03E07. Pick one.', pack: ROOT + 'Harbor.Lights.S04.720p.HDTV.x264-DEMO' } }];
  function page(list, q) {
    var p = +(q.get('page') || 1), n = +(q.get('pageSize') || 25), pages = Math.max(1, Math.ceil(list.length / n));
    return { records: list.slice((p - 1) * n, p * n), total: list.length, page: p, pageSize: n, pages: pages };
  }
  function version() {
    return { version: '3.2.0', latest: '3.2.0', update: false, major: false, channel: SETTINGS.update_channel, enabled: SETTINGS.update_check, checked: NOW - 5 * H,
      method: 'docker', note: '', notes: null, repo: 'Apex-Tech-Labs/fixarr', url: 'https://github.com/Apex-Tech-Labs/fixarr/releases' };
  }
  function overview() {
    return { packs: counts(), building: false, plex: true, recycle_bin: true, settings: SETTINGS, sonarr_public: 'https://sonarr.example.com',
      resolver: { at: NOW - 9 * 60, open: WAITING.length, running: false }, audit: { at: AUDIT.at, running: false, progress: '' }, version: version() };
  }

  // ----------------------------------------------------------------- the fake API
  function route(path, q, method, body) {
    if (path === 'overview') return overview();
    if (path === 'build') return { version: '3.2.0', build: 'demo' };
    if (path === 'series') return SERIES.map(pub);
    if (path === 'catalog') return { at: NOW, building: false, counts: counts(), items: PACKS };
    if (path === 'preview') return preview(body && body.pack);
    if (path === 'activity') return { resolver: { at: NOW - 9 * 60, running: false, downloads: WAITING }, log: page(LOG, q) };
    if (path === 'history') return page(HIST, q);
    if (path === 'audit') return AUDIT;
    if (path === 'settings') { if (method === 'POST' && body) Object.assign(SETTINGS, body); return SETTINGS; }
    if (path === 'version') return version();
    if (path === 'missing') return { episodes: 84, series: [{ series_id: 6, series: 'Little Engineers', episodes: ['S03E01', 'S03E02'], packs: [{ name: PACKS[0].name, path: PACKS[0].path }] }] };
    if (path === 'mappings') return [{ series: 'Harbor Lights', label: 'S04E05 The Fog Bell', key: 'harbor lights s04e05 fog bell 720p hdtv', at: NOW - 6 * D }];
    if (path === 'health') return { fixarr: '3.2.0', sonarr_url: 'http://sonarr:8989', layer: { at: NOW - 60, layer: '3.2.0', sonarr: '4.0.20.3014', nav: true, fallback: false,
      seen: { nav: NOW - 60, series: NOW - 2 * H, season: NOW - 2 * H, wanted: NOW - D, queue: NOW - 3 * H } } };
    if (path === 'queue') return [];
    if (path === 'resolve') return { started: true };
    return { error: 'This is the demo: nothing is changed.' };
  }
  var real = window.fetch.bind(window);
  window.FIXARR_DEMO = true;
  window.fetch = function (input, init) {
    var url = new URL(typeof input === 'string' ? input : input.url, location.href);
    var m = /\/api\/([a-z]+)/.exec(url.pathname);
    if (url.origin !== location.origin || !m) return real(input, init);
    var method = (init && init.method) || 'GET', body = null;
    try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) {}
    var data = route(m[1], url.searchParams, method, body);
    var status = data && data.error && method !== 'GET' ? 400 : 200;
    return new Promise(function (res) {
      setTimeout(function () { res(new Response(JSON.stringify(data), { status: status, headers: { 'Content-Type': 'application/json' } })); }, 120);
    });
  };
})();
