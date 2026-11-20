
  // ================================================================== Settings (pages, Sonarr form layout, saved as you change them)
  var SET = null;
  function pageSettings(route, pc) {
    var sec = route.sub || 'general';
    var left = sec === 'updates' ? [{ id: 'chk', label: 'Check Now', icon: 'refresh', title: 'Check GitHub for a new release', onClick: checkUpdates }]
      : sec === 'library' ? [{ id: 'aud', label: 'Run Audit', icon: 'play', onClick: function () { api('api/audit', {}).then(function () { go('audit'); }); } }]
      : sec === 'general' ? [{ id: 'act', label: 'Activity', icon: 'activity', onClick: function () { go('activity'); } }] : [];
    toolbar(left, [{ note: true }]);
    var nav = STANDALONE ? '' : '<nav class="secnav" aria-label="Settings sections">' + settingsChildren().map(function (c) {
      return '<a href="' + routeHref('settings', c[0]) + '" data-go="settings/' + c[0] + '"' + (c[0] === sec ? ' class="on" aria-current="page"' : '') + '>' + c[1] + '</a>';
    }).join('') + '</nav>';
    pc.innerHTML = '<div class="pc-inner">' + nav + '<div id="set">' + skeleton(5) + '</div></div>';
    wireLinks(pc);
    Promise.all([api('api/settings'), sec === 'remembered' ? api('api/mappings') : null, sec === 'addon' ? api('api/health') : null, loadOverview()]).then(function (r) {
      SET = { s: r[0], maps: r[1] || [], health: r[2] || {} };
      var b = $('#set'); if (!b) return;
      b.innerHTML = ({ general: setGeneral, matching: setMatching, library: setLibrary, addon: setAddon, updates: setUpdates,
                       remembered: setRemembered, appearance: setAppearance, about: setAbout })[sec]();
      wireSettings(b); wireCopy(b); wireLinks(b);
    }).catch(function (e) { var b = $('#set'); if (b) b.innerHTML = alertBox('bad', esc(e.message)); });
  }
  function fg(label, control, help, id) {
    return '<div class="fg"><div class="fl"' + (id ? ' id="' + id + '"' : '') + '>' + label + '</div><div class="fc">' + control + (help ? '<div class="help">' + help + '</div>' : '') + '</div></div>';
  }
  function fs(title, body, extra) { return '<div class="fs"><h2 class="legend">' + title + (extra || '') + '</h2>' + body + '</div>'; }
  function sw(key, label, disabled) {
    return '<label class="switch"><input type="checkbox" data-k="' + key + '"' + (SET.s[key] ? ' checked' : '') + (disabled ? ' disabled' : '') + ' aria-label="' + esc(label) + '"><span></span></label>';
  }
  function sel(key, opts, label) {
    return '<select data-k="' + key + '" data-num="1" aria-label="' + esc(label) + '" style="min-width:240px">' + opts.map(function (o) {
      return '<option value="' + o[0] + '"' + (String(SET.s[key]) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('') + '</select>';
  }
  function seg(key, opts, label) {
    return '<div class="seg" role="radiogroup" aria-label="' + esc(label) + '">' + opts.map(function (o) {
      return '<button type="button" role="radio" data-seg="' + key + '" data-v="' + o[0] + '" aria-checked="' + (String(SET.s[key]) === String(o[0])) + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }

  function setGeneral() {
    return fs('Auto Mode',
      fg('Import automatically', sw('auto_import', 'Import stuck downloads automatically'), 'When Sonarr cannot import a download and every file matches confidently, Fixarr imports it and tags it to the download so Sonarr closes it.') +
      fg('Clear finished downloads', sw('auto_clear', 'Clear finished downloads'), 'When every episode in a stuck download is already in your library, Fixarr removes it from Sonarr\'s queue. Files stay and the torrent keeps seeding.') +
      fg('Lowest match score', sel('min_confidence', [[80, '80%'], [85, '85%'], [90, '90% (recommended)'], [95, '95%'], [100, '100% only']], 'Lowest match score'), 'Downloads with any file below this score wait for you in Activity.') +
      fg('Check the queue every', sel('resolve_minutes', [[5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour'], [120, '2 hours']], 'Queue check interval'), 'The Sonarr webhook below makes Fixarr react at once; this timer is the safety net.')) +
      fs('Sonarr Webhook', fg('Webhook URL', codeBox('http://fixarr:8686/api/hook/sonarr', 'webhook URL'),
        'In Sonarr, open Settings, Connect, add a Webhook with this URL and tick only <b class="strong">On Manual Interaction Required</b>. Use Fixarr\'s address as Sonarr sees it if they are not on the same Docker network.'));
  }
  function setMatching() {
    var o = DATA.overview || {};
    return fs('Matching',
      fg('Check runtimes', sw('runtime_check', 'Check runtimes'), 'Flags files much longer or shorter than the series runtime (double episodes, trailers, wrong files) for review.') +
      fg('Scan specials in Plex', sw('plex_scan', 'Scan specials in Plex', !o.plex), o.plex ? 'After Fixarr places specials in Season 00 itself, it asks Plex to scan that folder. Sonarr tells Plex about everything else.'
        : 'Set <code class="inl">PLEX_URL</code> and <code class="inl">PLEX_TOKEN</code> on the Fixarr container to use this.')) +
      fs('Multi-part Episodes', '<dl class="kv"><dt>Recognized parts</dt><dd>a/b segments, Part 1/2, Pt.One/Two, CD1/CD2, Disc 1/2, 1 of 2</dd>' +
        '<dt>How they are joined</dt><dd>Losslessly into one MKV file with mkvmerge</dd><dt>Formats that can be joined</dt><dd>MKV, MP4, M4V, MOV, AVI, MPG, VOB and TS</dd>' +
        '<dt>Cannot be joined</dt><dd>WMV (import part 1 on its own instead)</dd></dl>');
  }
  function setLibrary() {
    var hours = []; for (var h = 0; h < 24; h++) hours.push([h, hourLabel(h)]);
    var rb = (DATA.overview || {}).recycle_bin;
    return fs('Library Audit',
      fg('Audit every night', sw('audit_nightly', 'Audit every night'), 'Finds episodes that may be mislabeled and library files that are not hardlinked to their seeding copy.') +
      fg('Time to run it', sel('audit_hour', hours, 'Audit time'), 'Server local time.')) +
      fs('Recycle Bin', fg('Sonarr recycle bin', '<span class="lbl ' + (rb ? 'ok">Set' : 'warn">Not set') + '</span>',
        rb ? 'Undo and relink move replaced files there instead of deleting them.' : 'Undo and relink need it. In Sonarr: Settings, Media Management, Recycling Bin.'));
  }
  function setAddon() {
    var h = SET.health.layer || null, live = h && h.at && Date.now() / 1000 - h.at < 7 * 86400;
    var seen = (h && h.seen) || {}, where = [];
    [['nav', 'Menu'], ['series', 'Series pages'], ['season', 'Season rows'], ['wanted', 'Wanted'], ['queue', 'Activity queue']].forEach(function (x) { if (seen[x[0]] && Date.now() / 1000 - seen[x[0]] < 30 * 86400) where.push(x[1]); });
    return alertBox('info', '<b>Fixarr, right inside Sonarr.</b> The add-on puts Fixarr where you already work: an entry with its own pages in Sonarr\'s menu, Fixarr buttons on series pages and on every season, and on the Wanted and Activity pages. ' +
        'It takes its colors from Sonarr\'s theme and finds its place by Sonarr\'s labels, so it looks native and keeps working after Sonarr updates. Sonarr itself is never changed or forked.', 'layers') +
      fs('Status', '<dl class="kv"><dt>Add-on</dt><dd><span class="lbl ' + (live ? 'ok">Active' : '">Not installed') + '</span></dd>' +
        (live ? '<dt>Sonarr</dt><dd>' + esc(h.sonarr || 'unknown version') + '</dd><dt>Last seen</dt><dd>' + ago(h.at) + '</dd><dt>Working on</dt><dd>' + (where.join(', ') || 'Not reported yet') + '</dd>' +
          (h.fallback ? '<dt>Note</dt><dd>The menu entry could not be placed, so a floating Fixarr button is showing instead.</dd>' : '')
          : '<dt>Next step</dt><dd>Install it with one of the two ways below, then open Sonarr once.</dd>') + '</dl>') +
      fs('Show Fixarr On',
        fg('Series pages', sw('addon_series', 'Series pages'), 'A Fixarr button in the series toolbar.') +
        fg('Season rows', sw('addon_seasons', 'Season rows'), 'A Fixarr icon on every season. It turns blue when a pack on disk has episodes that season is missing.') +
        fg('Wanted', sw('addon_wanted', 'Wanted'), 'A Fixarr button with the number of missing episodes packs on disk can fill, and an icon on those rows.') +
        fg('Activity queue', sw('addon_queue', 'Activity queue'), 'A Fixarr button with the downloads Fixarr is handling, and an icon on those rows.') +
        fg('Menu', '<span class="lbl ok">Always on</span>', 'The Fixarr menu entry is how you reach Fixarr from Sonarr, so it stays while the add-on is installed.')) +
      fs('Install',
        fg('Reverse proxy', codeBox('location ^~ /fixarr/ { proxy_pass http://fixarr:8686/; proxy_read_timeout 300s; }\nsub_filter \'</head>\' \'<script defer src="/fixarr/layer.js"></script></head>\';\nsub_filter_once on;\nproxy_set_header Accept-Encoding "";', 'proxy snippet'),
          'Recommended. For Nginx or Nginx Proxy Manager, add this to the Advanced tab of the Sonarr host. Protect <code class="inl">/fixarr/</code> with the same login as Sonarr.') +
        fg('Userscript', codeBox(BASE + 'fixarr.user.js?sonarr=https://sonarr.example.com', 'userscript link'),
          'No proxy changes. Set <code class="inl">CORS_ORIGINS</code> on the Fixarr container to your Sonarr address, install Violentmonkey or Tampermonkey, then open this link with your Sonarr address and accept the install.'));
  }
  function setUpdates() {
    var v = (DATA.overview || {}).version || {};
    var state = v.update ? '<span class="lbl info">' + esc(v.latest) + ' available</span>' + (v.major ? ' <span class="lbl warn">Major update</span>' : '')
      : v.note ? '<span class="muted">' + esc(v.note) + '</span>' : v.latest ? '<span class="lbl ok">Up to date</span>' : '<span class="muted">' + (SET.s.update_check ? 'Not checked yet' : 'Checks are off') + '</span>';
    return fs('Version', '<dl class="kv"><dt>Installed</dt><dd>Fixarr ' + esc(v.version || VERSION) + '</dd><dt>Latest</dt><dd>' + state + '</dd>' +
        (v.checked ? '<dt>Last checked</dt><dd>' + ago(v.checked) + '</dd>' : '') +
        (v.url ? '<dt>Release notes</dt><dd><a href="' + esc(v.url) + '" target="_blank" rel="noopener">Open on GitHub</a></dd>' : '') + '</dl>') +
      fs('Updates',
        fg('Check for updates', sw('update_check', 'Check for updates'), 'Looks for a new release on GitHub once a day and shows it here and in the header. Nothing else is sent.') +
        fg('Update channel', seg('update_channel', [['stable', 'Stable'], ['beta', 'Beta']], 'Update channel'), 'Stable gets finished releases. Beta also gets test releases before they are finished.') +
        fg('Install automatically', (v.method === 'docker' || !v.method) ? '<span class="lbl">Docker</span>' : sw('auto_install', 'Install automatically'),
          (v.method === 'docker' || !v.method) ? 'This install runs in Docker, so your container updater installs new versions, not Fixarr. With Watchtower watching <code class="inl">ghcr.io/apex-tech-labs/fixarr:latest</code>, Fixarr updates itself whenever a release is published. Major updates are always announced here first.'
            : 'Installs new releases by itself when no import is running, and keeps the previous version so it can roll back. Major updates are always announced first.'));
  }
  function checkUpdates() {
    setTool('chk', { spin: true, disabled: true });
    api('api/version?force=1').then(loadOverview).then(function () { setTool('chk', { spin: false, disabled: false, icon: 'refresh' }); note('Checked just now'); reload(); })
      .catch(function (e) { setTool('chk', { spin: false, disabled: false, icon: 'refresh' }); note(e.message, true); });
  }
  function setRemembered() {
    var maps = SET.maps || [];
    var h = alertBox('info', 'When you correct a match by hand, Fixarr remembers it for that file name and uses it the next time it sees the file.');
    if (!maps.length) return h + emptyState('history', 'No remembered matches yet', 'Pick a different episode for a file on the Import page and it shows up here.');
    return h + '<div class="tw"><table class="tbl"><thead><tr><th>Series</th><th class="min">Episode</th><th>File name key</th><th class="min">Saved</th><th class="min"></th></tr></thead><tbody>' +
      maps.map(function (m, i) {
        return '<tr><td class="nowrap strong">' + esc(m.series) + '</td><td class="min">' + esc(m.label) + '</td><td class="wrap muted">' + esc(m.key) + '</td><td class="min muted">' + ago(m.at) + '</td>' +
          '<td class="min"><button class="btn sm" type="button" data-forget="' + i + '">Forget</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  var THEMES = [['auto', 'Auto'], ['sonarr-dark', 'Sonarr Dark'], ['sonarr-light', 'Sonarr Light'], ['harbor', 'Harbor'], ['apex', 'Apex']];
  function setAppearance() {
    var cur = 'auto'; try { cur = localStorage.getItem('fixarr-theme') || 'auto'; } catch (e) {}
    var icon = siteIcon(), custom = !ICONS.some(function (x) { return BASE + x[1] === icon; });
    return fs('Theme', fg('Theme', '<div class="seg" role="radiogroup" aria-label="Theme">' + THEMES.map(function (t) {
        return '<button type="button" role="radio" data-theme="' + t[0] + '" aria-checked="' + (t[0] === cur) + '">' + t[1] + '</button>'; }).join('') + '</div>',
        'Auto follows your device\'s light or dark setting. Inside Sonarr, Fixarr always uses Sonarr\'s own theme.')) +
      fs('Site Icon', fg('Icon', '<div class="icons">' + ICONS.map(function (x) {
          return '<button type="button" class="icn' + (BASE + x[1] === icon ? ' on' : '') + '" data-icon="' + esc(BASE + x[1]) + '" title="' + x[2] + '" aria-label="' + x[2] + ' icon"><img src="' + esc(themeIsLight() ? onLight(BASE + x[1]) : BASE + x[1]) + '" alt=""></button>';
        }).join('') + (custom ? '<button type="button" class="icn on" data-icon="' + esc(icon) + '" title="Custom" aria-label="Custom icon"><img src="' + esc(themeIsLight() ? onLight(icon) : icon) + '" alt=""></button>' : '') + '</div>',
        'Used next to the Fixarr title in the header and as the browser tab icon.') +
        fg('Custom icon', '<div class="row" style="align-items:center"><input type="text" id="iUrl" placeholder="Paste an image URL" style="flex:1;min-width:220px">' +
          '<button class="btn" type="button" id="iApply">Use URL</button><label class="btn">Upload<input type="file" id="iFile" accept=".png,.webp,.svg,.ico,image/png,image/webp,image/svg+xml,image/x-icon" hidden></label></div>',
          'A square PNG, WEBP, SVG or ICO works best. It is stored in this browser only.'));
  }
  function setAbout() {
    var v = (DATA.overview || {}).version || {};
    return fs('About', '<dl class="kv"><dt>Version</dt><dd>Fixarr ' + esc(v.version || VERSION) + (v.channel === 'beta' ? ' (beta channel)' : '') + '</dd>' +
      '<dt>Runs as</dt><dd>' + (STANDALONE ? 'Web app' : 'Sonarr add-on') + '</dd><dt>License</dt><dd>GNU General Public License v3.0</dd>' +
      '<dt>Source code</dt><dd><a href="https://github.com/' + REPO + '" target="_blank" rel="noopener">github.com/' + esc(REPO) + '</a></dd>' +
      '<dt>Report a problem</dt><dd><a href="https://github.com/' + REPO + '/issues" target="_blank" rel="noopener">GitHub issues</a> <span class="muted">(include what you clicked and the pack name; never paste API keys)</span></dd>' +
      '<dt>Made by</dt><dd>Apex Tech Labs</dd></dl>');
  }

  var saveTimer = null, pending = {};
  function save(key, val) {
    pending[key] = val; SET.s[key] = val;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var body = pending; pending = {};
      api('api/settings', body).then(function (s2) {
        SET.s = s2; if (DATA.overview) DATA.overview.settings = s2; note('Saved');
        if ('update_channel' in body || 'update_check' in body) api('api/version?force=1').then(loadOverview).then(function () { if (PAGE && PAGE.route.sub === 'updates') reload(); });
        if (Object.keys(body).some(function (k) { return /^addon_/.test(k); })) scheduleEnsure();
      }).catch(function (e) { note(e.message, true); });
    }, 250);
  }
  function wireSettings(b) {
    each(b.querySelectorAll('[data-k]'), function (inp) {
      inp.addEventListener('change', function () { save(inp.getAttribute('data-k'), inp.type === 'checkbox' ? inp.checked : (inp.getAttribute('data-num') ? +inp.value : inp.value)); });
    });
    each(b.querySelectorAll('[data-seg]'), function (btn) {
      btn.addEventListener('click', function () { each(btn.parentElement.children, function (x) { x.setAttribute('aria-checked', x === btn ? 'true' : 'false'); }); save(btn.getAttribute('data-seg'), btn.getAttribute('data-v')); });
    });
    each(b.querySelectorAll('[data-theme]'), function (btn) {
      btn.addEventListener('click', function () { each(btn.parentElement.children, function (x) { x.setAttribute('aria-checked', x === btn ? 'true' : 'false'); }); if (window.fixarrTheme) window.fixarrTheme(btn.getAttribute('data-theme')); applyIcon(siteIcon()); each(b.querySelectorAll('.icn img'), function (im) { var u = im.parentElement.getAttribute('data-icon'); im.src = themeIsLight() ? onLight(u) : u; }); note('Saved'); });
    });
    each(b.querySelectorAll('[data-icon]'), function (btn) {
      btn.addEventListener('click', function () { each(b.querySelectorAll('.icn'), function (x) { x.classList.toggle('on', x === btn); }); applyIcon(btn.getAttribute('data-icon')); note('Saved'); });
    });
    var ia = b.querySelector('#iApply'); if (ia) ia.addEventListener('click', function () { var u = b.querySelector('#iUrl').value.trim(); if (u) { applyIcon(u); reload(); } });
    var fi = b.querySelector('#iFile'); if (fi) fi.addEventListener('change', function () {
      var f = fi.files && fi.files[0]; if (!f) return;
      if (f.size > 512 * 1024) { note('Pick an image under 512 KB', true); return; }
      var rd = new FileReader(); rd.onload = function () { applyIcon(rd.result); reload(); }; rd.readAsDataURL(f);
    });
    each(b.querySelectorAll('[data-forget]'), function (btn) {
      btn.addEventListener('click', function () {
        var m = SET.maps[+btn.getAttribute('data-forget')];
        api('api/mappings/' + m.series_id + '/' + encodeURIComponent(m.key), undefined, 'DELETE').then(function () { note('Forgotten'); reload(); });
      });
    });
  }

  // ================================================================== start
  function lightPage() {             // Sonarr's light theme: use dark text where Fixarr would use white
    var v = getComputedStyle(document.documentElement).getPropertyValue('--pageBackground').trim();
    var m = /^#?([0-9a-f]{6})$/i.exec(v); if (!m) return false;
    var n = parseInt(m[1], 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 150;
  }
  // A browser or proxy cache can hand Sonarr an old copy of this script. Ask Fixarr which build is current and, if this
  // copy is older, load the current one under a URL no cache has seen. window.__fixarrFresh stops it from looping.
  function start() {
    if (STANDALONE || window.__fixarrFresh || BUILD.indexOf('__') === 0 || !window.fetch) return boot();
    fetch(BASE + 'api/build', { cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (b) {
        if (!b || !b.build || b.build === BUILD) return boot();
        window.__fixarrFresh = b.build; window.__fixarrLayer = null;
        var s = document.createElement('script');
        s.src = BASE + 'layer.js?v=' + encodeURIComponent(b.build);
        s.onerror = function () { window.__fixarrLayer = VERSION; boot(); };
        document.head.appendChild(s);
      }).catch(function () { boot(); });
  }
  function boot() {
    mount();
    loadOverview();
    setInterval(function () { if (!document.hidden) loadOverview(); }, 180000);
    if (STANDALONE) {
      window.addEventListener('hashchange', render);
      if (!/^#\//.test(location.hash)) go('import', '', null, true); else render();
      return;
    }
    if (lightPage()) hostEl.style.setProperty('--fxStrong', '#333');
    ensure(); render();
    new MutationObserver(scheduleEnsure).observe(document.body, { childList: true, subtree: true });
    var tEl = document.querySelector('title');
    if (tEl) new MutationObserver(function () { if (PAGE && PAGE.title && document.title !== PAGE.title && currentRoute()) document.title = PAGE.title; }).observe(tEl, { childList: true, characterData: true, subtree: true });
    ['pushState', 'replaceState'].forEach(function (m) {
      var orig = history[m];
      history[m] = function () { var r = orig.apply(this, arguments); setTimeout(render, 0); return r; };
    });
    window.addEventListener('popstate', function () { setTimeout(render, 0); });
    window.addEventListener('resize', placeHost);
    setTimeout(function () { settled = true; ensure(); }, 8000);
    loadSeries().catch(function () {});
    onData(function () { scheduleEnsure(); });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
