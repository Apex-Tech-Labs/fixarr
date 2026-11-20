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

  // ----------------------------------------------------------------- posters
  function words(t, max) {
    var out = [], line = '';
    t.split(' ').forEach(function (w) { if ((line + ' ' + w).trim().length > max && line) { out.push(line); line = w; } else line = (line + ' ' + w).trim(); });
    if (line) out.push(line); return out;
  }
  // Each made-up show gets drawn poster art (a scene, a title and a network credit), so the demo looks like a real
  // library without showing anyone's copyrighted artwork.
  var ART = {
    1: function (c) { // Harbor Lights: lighthouse and beam over the water
      return '<path d="M0 0H250V375H0Z" fill="url(#sky)"/>' + stars(18, 160) +
        '<path d="M150 118 L250 70 L250 150Z" fill="#fff" fill-opacity=".18"/><path d="M150 118 L0 60 L0 140Z" fill="#fff" fill-opacity=".12"/>' +
        '<path d="M140 120h20l8 120h-36z" fill="#f4f1ea"/><path d="M136 150h28v12h-28zM133 190h34v12h-33z" fill="' + c[1] + '"/>' +
        '<rect x="141" y="104" width="18" height="16" fill="#ffe58a"/><path d="M137 104h26l-13-14z" fill="#222"/>' +
        '<path d="M90 236 L210 236 L230 260 L70 260Z" fill="#1b2430"/>' + waves(262, '#0b1a2a');
    },
    2: function (c) { // The Copper Mile: desert road to the sun
      return '<path d="M0 0H250V375H0Z" fill="url(#sky)"/><circle cx="125" cy="150" r="46" fill="#ffd27a"/>' +
        '<path d="M0 190 Q60 170 125 188 T250 180 V375 H0Z" fill="#4a2414"/><path d="M118 188 L132 188 L210 375 L40 375Z" fill="#2a1a12"/>' +
        '<path d="M124 200h3v14h-3zM123 236h5v20h-5zM121 290h9v30h-9z" fill="#f2c14e"/>';
    },
    3: function (c) { // Orbit Kitchen: a planet with a ring of cutlery
      return '<path d="M0 0H250V375H0Z" fill="url(#sky)"/>' + stars(30, 375) + '<circle cx="125" cy="150" r="58" fill="#c58cff"/>' +
        '<circle cx="108" cy="134" r="14" fill="#fff" fill-opacity=".18"/><ellipse cx="125" cy="155" rx="104" ry="24" fill="none" stroke="#ffe08a" stroke-width="5" transform="rotate(-14 125 155)"/>' +
        '<path d="M50 100 l10 30M56 98 l10 30" stroke="#eee" stroke-width="3"/><circle cx="198" cy="96" r="9" fill="#eee"/><path d="M198 105v28" stroke="#eee" stroke-width="4"/>';
    },
    4: function (c) { // Paper Lanterns: lanterns over a night street
      var l = ''; [[60, 90, 22], [125, 70, 28], [190, 100, 20], [92, 150, 16], [165, 155, 18]].forEach(function (p) {
        l += '<path d="M' + p[0] + ' ' + (p[1] - 40) + 'v' + (40 - p[2]) + '" stroke="#000" stroke-opacity=".5"/><ellipse cx="' + p[0] + '" cy="' + p[1] + '" rx="' + p[2] * .8 + '" ry="' + p[2] + '" fill="#ff8a5c"/>' +
          '<ellipse cx="' + p[0] + '" cy="' + p[1] + '" rx="' + p[2] * .45 + '" ry="' + p[2] * .8 + '" fill="#ffd08a" fill-opacity=".7"/>'; });
      return '<path d="M0 0H250V375H0Z" fill="url(#sky)"/>' + l + '<path d="M0 230h40v-30h30v30h20v-50h40v50h30v-20h40v20h50v145H0Z" fill="#14070c"/>';
    },
    5: function (c) { // Saltmarsh: reeds and water at dawn
      var r = ''; for (var i = 0; i < 26; i++) { var x = 6 + i * 9.5, h = 50 + (i * 37) % 60; r += '<path d="M' + x + ' 260 q' + (i % 2 ? 6 : -6) + ' -' + h / 2 + ' ' + (i % 2 ? 2 : -2) + ' -' + h + '" stroke="#0e241e" stroke-width="3" fill="none"/>'; }
      return '<path d="M0 0H250V375H0Z" fill="url(#sky)"/><circle cx="180" cy="120" r="30" fill="#fff4d6" fill-opacity=".85"/>' + r + waves(255, '#0f2d26');
    },
    6: function (c) { // Little Engineers: friendly gears
      return '<path d="M0 0H250V375H0Z" fill="url(#sky)"/>' + gear(95, 140, 44, '#ffcf3f') + gear(165, 100, 28, '#ff7a59') + gear(170, 190, 32, '#4fc3f7') +
        '<circle cx="95" cy="140" r="8" fill="#103a52"/><circle cx="82" cy="128" r="5" fill="#103a52"/><circle cx="108" cy="128" r="5" fill="#103a52"/><path d="M82 152 q13 10 26 0" stroke="#103a52" stroke-width="4" fill="none"/>';
    },
    7: function (c) { // Signal & Noise: a waveform
      var d = 'M10 170'; for (var x = 10; x <= 240; x += 6) d += ' L' + x + ' ' + (170 + Math.sin(x / 9) * (40 * Math.sin(x / 70)) + ((x * 7) % 11) - 5);
      return '<path d="M0 0H250V375H0Z" fill="url(#sky)"/>' + '<path d="' + d + '" stroke="#35c5f4" stroke-width="3" fill="none"/><path d="' + d + '" stroke="#fff" stroke-opacity=".4" stroke-width="1" fill="none" transform="translate(0 6)"/>' +
        '<circle cx="125" cy="90" r="22" fill="none" stroke="#35c5f4" stroke-width="3"/><circle cx="125" cy="90" r="38" fill="none" stroke="#35c5f4" stroke-opacity=".5" stroke-width="2"/>';
    },
    8: function (c) { // Night Shift at Pine Ridge: pines under the moon
      var t = ''; for (var i = 0; i < 9; i++) { var x = i * 31 - 4, h = 90 + (i * 29) % 50; t += '<path d="M' + x + ' 260 l18 -' + h + ' l18 ' + h + 'z" fill="#06120a"/>'; }
      return '<path d="M0 0H250V375H0Z" fill="url(#sky)"/>' + stars(22, 170) + '<circle cx="170" cy="85" r="26" fill="#f4f1d0"/><circle cx="182" cy="78" r="24" fill="' + c[0] + '" fill-opacity=".9"/>' + t +
        '<rect x="104" y="220" width="40" height="28" fill="#2a1d10"/><rect x="113" y="228" width="10" height="10" fill="#ffd96a"/>';
    },
    9: function (c) { // Fieldnotes from Nowhere: a notebook on dunes
      return '<path d="M0 0H250V375H0Z" fill="url(#sky)"/><path d="M0 200 Q80 160 160 200 T250 190V375H0Z" fill="#8c7440"/><path d="M0 240 Q90 210 250 245V375H0Z" fill="#6d5a30"/>' +
        '<g transform="rotate(-8 125 130)"><rect x="80" y="80" width="90" height="110" rx="4" fill="#f3ead2"/><path d="M92 102h66M92 116h66M92 130h50M92 144h60M92 158h40" stroke="#9a8a62" stroke-width="2"/><rect x="80" y="80" width="10" height="110" fill="#b8913b"/></g>';
    },
    10: function (c) { // The Lantern Keepers: a tower with a glowing window
      return '<path d="M0 0H250V375H0Z" fill="url(#sky)"/>' + stars(26, 200) + '<path d="M100 250V110l25-30 25 30v140z" fill="#170b26"/><path d="M95 112h60l-30-36z" fill="#2b1545"/>' +
        '<rect x="117" y="130" width="16" height="22" rx="8" fill="#ffd36e"/><circle cx="125" cy="141" r="30" fill="#ffd36e" fill-opacity=".15"/><path d="M0 250h250v125H0z" fill="#0d0617"/>';
    },
    11: function (c) { // Velvet Static: an old TV full of static
      var s = ''; for (var i = 0; i < 140; i++) s += '<rect x="' + (64 + (i * 53) % 122) + '" y="' + (100 + (i * 31) % 86) + '" width="3" height="2" fill="#fff" fill-opacity="' + ((i % 5) / 6 + .1).toFixed(2) + '"/>';
      return '<path d="M0 0H250V375H0Z" fill="url(#sky)"/><rect x="50" y="86" width="150" height="114" rx="14" fill="#1a0a1a"/><rect x="62" y="98" width="126" height="90" rx="10" fill="#555"/>' + s +
        '<path d="M100 86 L80 50 M150 86 L170 50" stroke="#1a0a1a" stroke-width="4"/><rect x="88" y="200" width="74" height="10" fill="#1a0a1a"/>';
    },
    12: function (c) { // Cold Open Tonight: microphone in a spotlight
      return '<path d="M0 0H250V375H0Z" fill="url(#sky)"/><path d="M125 0 L60 260 H190Z" fill="#fff" fill-opacity=".14"/><ellipse cx="125" cy="262" rx="70" ry="10" fill="#fff" fill-opacity=".18"/>' +
        '<rect x="110" y="110" width="30" height="50" rx="15" fill="#d8d8d8"/><path d="M110 150 q15 24 30 0" stroke="#d8d8d8" stroke-width="4" fill="none"/><path d="M125 170v84" stroke="#888" stroke-width="5"/>' +
        '<path d="M0 0h250v40H0z" fill="#9b1c1c"/><path d="M0 40 q20 20 40 0 t40 0 t40 0 t40 0 t40 0 t50 0" fill="#9b1c1c"/>';
    },
    13: function (c) { // Rooftop Gardens: skyline with plants on a roof
      return '<path d="M0 0H250V375H0Z" fill="url(#sky)"/><path d="M0 230V150h30v-20h28v40h22v-60h34v80h20v-40h30v50h26v-30h30v60H0z" fill="#0f2312" fill-opacity=".85"/>' +
        '<rect x="40" y="226" width="170" height="40" fill="#203a1f"/>' + [60, 90, 120, 150, 180].map(function (x, i) { return '<circle cx="' + x + '" cy="' + (214 - i % 2 * 8) + '" r="' + (16 + i % 3 * 4) + '" fill="#7fc45a"/>'; }).join('');
    },
    14: function (c) { // Mapmakers: contour lines and a compass
      var r = ''; for (var i = 0; i < 8; i++) r += '<ellipse cx="' + (110 + i * 3) + '" cy="' + (170 - i * 2) + '" rx="' + (100 - i * 11) + '" ry="' + (70 - i * 8) + '" fill="none" stroke="#f4d9a6" stroke-opacity=".5" stroke-width="2"/>';
      return '<path d="M0 0H250V375H0Z" fill="url(#sky)"/>' + r + '<circle cx="186" cy="92" r="26" fill="none" stroke="#fff" stroke-width="3"/><path d="M186 70 l7 22 -7 22 -7 -22z" fill="#e8a54b" stroke="#fff"/>';
    },
    15: function (c) { // Deep Field: a spiral galaxy
      var s = ''; for (var i = 0; i < 90; i++) { var a = i / 6, r = 4 + i * 0.95; s += '<circle cx="' + (125 + Math.cos(a) * r).toFixed(1) + '" cy="' + (160 + Math.sin(a) * r * .6).toFixed(1) + '" r="' + (i % 4 ? 1.4 : 2.4) + '" fill="#cfe3ff" fill-opacity=".85"/>'; }
      return '<path d="M0 0H250V375H0Z" fill="url(#sky)"/>' + stars(60, 375) + '<ellipse cx="125" cy="160" rx="50" ry="26" fill="#9cc2ff" fill-opacity=".25"/>' + s + '<circle cx="125" cy="160" r="9" fill="#fff"/>';
    },
    16: function (c) { // The Quiet Hours: a clock in a window
      return '<path d="M0 0H250V375H0Z" fill="url(#sky)"/><rect x="60" y="70" width="130" height="170" fill="#0e1216" stroke="#3b4652" stroke-width="6"/><path d="M125 70v170M60 155h130" stroke="#3b4652" stroke-width="4"/>' +
        '<circle cx="125" cy="155" r="42" fill="#e8ecef"/><path d="M125 155v-28M125 155l18 10" stroke="#1a1f24" stroke-width="4" stroke-linecap="round"/><circle cx="160" cy="98" r="10" fill="#e8ecef" fill-opacity=".8"/>';
    }
  };
  function stars(n, maxY) { var s = ''; for (var i = 0; i < n; i++) s += '<circle cx="' + ((i * 97) % 250) + '" cy="' + ((i * 53) % maxY) + '" r="' + (i % 3 ? 0.9 : 1.6) + '" fill="#fff" fill-opacity=".8"/>'; return s; }
  function waves(y, col) { return '<path d="M0 ' + y + ' q31 -8 62 0 t62 0 t62 0 t64 0 V375 H0Z" fill="' + col + '"/>'; }
  function gear(x, y, r, col) {
    var t = ''; for (var i = 0; i < 8; i++) t += '<rect x="' + (x - r * .18) + '" y="' + (y - r * 1.22) + '" width="' + r * .36 + '" height="' + r * .5 + '" rx="2" fill="' + col + '" transform="rotate(' + i * 45 + ' ' + x + ' ' + y + ')"/>';
    return t + '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + col + '"/>';
  }
  window.FIXARR_DEMO_POSTER = function (id) {
    var s = byId(+id); if (!s) return '';
    var c = s.colors, lines = words(s.title.toUpperCase(), 12), y = 300 - (lines.length - 1) * 28;
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 375"><defs>' +
      '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c[0] + '"/><stop offset=".75" stop-color="' + c[1] + '"/></linearGradient>' +
      '<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".85"/></linearGradient></defs>' +
      (ART[s.id] ? ART[s.id](c) : '<rect width="250" height="375" fill="url(#sky)"/>') +
      '<rect width="250" height="375" fill="url(#fade)"/>' +
      lines.map(function (l, i) { return '<text x="125" y="' + (y + i * 28) + '" text-anchor="middle" font-family="Georgia,\'Times New Roman\',serif" font-size="' + Math.min(25, Math.floor(214 / (l.length * 0.82))) + '" font-weight="700" letter-spacing="1.5" fill="#fff">' + l.replace(/&/g, '&amp;') + '</text>'; }).join('') +
      '<text x="125" y="356" text-anchor="middle" font-family="Segoe UI,Roboto,Arial,sans-serif" font-size="10" letter-spacing="3" fill="#fff" fill-opacity=".7">A ' + s.network.toUpperCase() + ' ORIGINAL</text></svg>';
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
