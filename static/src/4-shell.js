
  // ================================================================== shell
  var hostEl = null, root = null, $ = null, PAGE = null, busy = false;
  var ICONS = [['stock', 'static/icons/fixarr.webp', 'Stock'], ['alt', 'static/icons/fixarr2.webp', 'Alternate']];
  var ALT_DARK = 'static/icons/fixarr2-dark.webp';       // the alternate icon drawn in black, for light backgrounds
  function themeIsLight() {
    if (!STANDALONE) return lightPage();
    var h = document.documentElement;
    return h.getAttribute('data-theme') === 'sonarr-light' || h.classList.contains('light');
  }
  function onLight(url) { return /fixarr2\.webp(\?|$)/.test(url || '') ? BASE + ALT_DARK : url; }   // same icon, readable on white
  function siteIcon() { var v = null; try { v = localStorage.getItem('fixarr-icon'); } catch (e) {} return v || BASE + ICONS[0][1]; }
  function applyIcon(url) {
    try { localStorage.setItem('fixarr-icon', url); } catch (e) {}
    each(root.querySelectorAll('.wm-icon'), function (i) { i.src = url; });
    var f = document.querySelector('link[rel=icon]'); if (f && STANDALONE) f.href = themeIsLight() ? onLight(url) : url;
  }

  function mount() {
    if (hostEl) return;
    if (!document.getElementById('fixarr-font')) {      // fonts must be declared in the document, not in the shadow root
      var fs = document.createElement('style'); fs.id = 'fixarr-font';
      fs.textContent = "@font-face{font-family:'FixarrLogo';src:url('" + BASE + "static/fonts/FixarrLogo-Regular.woff') format('woff');font-display:swap}";
      document.head.appendChild(fs);
    }
    hostEl = document.createElement('div');
    hostEl.id = 'fixarr-layer';
    hostEl.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:' + (STANDALONE ? '1' : '1050');
    root = hostEl.attachShadow({ mode: 'open' });
    $ = function (s) { return root.querySelector(s); };
    var page = '<div class="page"><div class="tbar" id="tbar"></div><div class="pc" id="pc"></div></div>';
    if (STANDALONE) {
      root.innerHTML = '<style>' + CSS + '</style><div class="root"><div class="app" id="app">' +
        '<header class="hdr"><button class="burger" type="button" id="burger" aria-label="Menu">' + ico('menu', 22) + '</button>' +
        '<a class="logo" href="#/import" aria-label="Fixarr home"><span class="wm">Fix</span><img class="wm-icon" alt="" src="' + esc(siteIcon()) + '"><span class="wm arr">arr</span></a>' +
        '<div class="search" id="search">' + ico('search', 18) + '<input type="text" id="q" placeholder="Search packs and series" autocomplete="off" spellcheck="false" aria-label="Search packs and series">' +
        '<div class="sres" id="sres" role="listbox" hidden></div></div>' +
        '<div class="hdr-r"><a class="hbtn" id="hUpd" href="#/settings/updates" title="Updates" aria-label="Updates">' + ico('refresh', 19) + '<span class="dot" hidden></span></a>' +
        '<a class="hbtn" href="https://github.com/' + REPO + '" target="_blank" rel="noopener" title="Fixarr on GitHub" aria-label="Fixarr on GitHub">' + ico('github', 19) + '</a></div></header>' +
        '<nav class="side" id="side" aria-label="Fixarr"></nav><div class="scrim" id="scrim"></div>' + page + '</div><div id="dlg"></div></div>';
      document.body.appendChild(hostEl);
      $('#burger').addEventListener('click', function () { $('#app').classList.toggle('menu'); });
      $('#scrim').addEventListener('click', function () { $('#app').classList.remove('menu'); });
      wireSearch();
    } else {
      root.innerHTML = '<style>' + CSS + '</style><div class="root"><div class="host" id="host" hidden>' + page + '</div>' +
        '<button class="fab" type="button" id="fab" hidden title="Fixarr" aria-label="Open Fixarr">' + solid('fixarr', 24) + '</button><div id="dlg"></div></div>';
      document.body.appendChild(hostEl);
      fab = $('#fab'); fab.addEventListener('click', function () { go('import'); });
      // keys typed in Fixarr must not reach Sonarr's keyboard shortcuts
      ['keydown', 'keyup', 'keypress'].forEach(function (t) { root.addEventListener(t, function (e) { e.stopPropagation(); }); });
    }
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('#dlg').hidden && $('#dlg').innerHTML && !busy) closeDialog(false);
    });
    if (STANDALONE) document.addEventListener('keydown', function (e) {
      if (e.key === '/' && !/input|select|textarea/i.test((e.composedPath()[0] || {}).tagName || '')) { e.preventDefault(); $('#q').focus(); }
    });
    onData(function () { renderSide(); updateNavBadge(); var u = $('#hUpd .dot'); if (u) u.hidden = !(DATA.overview.version || {}).update; });
  }

  // host for the add-on: Sonarr's content area (right of its menu, below its header)
  function placeHost() {
    if (STANDALONE || !root) return;
    var route = currentRoute(), host = $('#host');
    if (!route) { host.hidden = true; return; }
    var item = itemOf(sidebarLink('/calendar') || sidebarLink('/settings') || document.createElement('a'));
    var col = item && item.parentElement, r = col ? col.getBoundingClientRect() : null;
    var left = r && r.width > 40 && getComputedStyle(col).visibility !== 'hidden' && r.right > 0 ? Math.round(r.right) : 0;
    var top = r && r.top > 0 ? Math.round(r.top) : 60;
    host.style.cssText = 'left:' + left + 'px;top:' + top + 'px;right:0;bottom:0';
    host.hidden = false;
  }

  // left menu (web app)
  function renderSide() {
    var side = STANDALONE && $('#side'); if (!side) return;
    var route = currentRoute() || { page: 'import' }, c = counts();
    side.innerHTML = PAGES.map(function (p) {
      var on = route.page === p.id, n = p.id === 'import' ? c.packs : p.id === 'activity' ? c.waiting : 0;
      var h = '<div class="navi' + (on ? ' on' : '') + '"><a class="nl" href="' + routeHref(p.id, p.children ? 'general' : '') + '" data-p="' + p.id + '"' + (on ? ' aria-current="page"' : '') + '>' +
        ico(p.icon, 15) + '<span>' + p.label + '</span>' + (n ? '<span class="nbadge" title="' + plural(n, 'item') + ' need you">' + n + '</span>' : '') + '</a>';
      if (on && p.children) h += '<div class="subs">' + settingsChildren().map(function (ch) {
        return '<a class="ns' + (route.sub === ch[0] ? ' on' : '') + '" href="' + routeHref('settings', ch[0]) + '">' + ch[1] + '</a>';
      }).join('') + '</div>';
      return h + '</div>';
    }).join('') + '<div class="side-foot"><a href="' + routeHref('settings', 'about') + '">Fixarr v' + VERSION + '</a></div>';
    each(side.querySelectorAll('a[href^="#"]'), function (a) { a.addEventListener('click', function () { $('#app').classList.remove('menu'); }); });
  }

  // toolbar (Sonarr page toolbar: icon over label)
  function toolbar(left, right) {
    var tb = $('#tbar');
    function btns(list) {
      return (list || []).map(function (b, i) {
        if (b === '|') return '<div class="tsep"></div>';
        if (b.note) return '<div class="tnote" id="tnote" aria-live="polite"></div>';
        if (b.html) return b.html;
        return '<button type="button" class="tbtn' + (b.hot ? ' hot' : '') + '" data-tb="' + (b.id || i) + '"' + (b.disabled ? ' disabled' : '') +
          ' title="' + esc(b.title || b.label) + '">' + (b.spin ? '<span class="spin"></span>' : ico(b.icon, 21)) + '<span>' + esc(b.label) + '</span></button>';
      }).join('');
    }
    tb.innerHTML = '<div class="tsec">' + btns(left) + '</div><div class="tsec r">' + btns(right) + '</div>';
    (left || []).concat(right || []).forEach(function (b, i) {
      if (!b || b === '|' || b.note || b.html || !b.onClick) return;
      var el = tb.querySelector('[data-tb="' + (b.id || i) + '"]'); if (el) el.addEventListener('click', function () { b.onClick(el); });
    });
  }
  function setTool(id, opts) {
    var el = $('#tbar [data-tb="' + id + '"]'); if (!el) return;
    if ('disabled' in opts) el.disabled = !!opts.disabled;
    if ('label' in opts) el.querySelector('span:last-child').textContent = opts.label;
    if ('spin' in opts) { var f = el.firstElementChild; f.outerHTML = opts.spin ? '<span class="spin"></span>' : ico(opts.icon || 'refresh', 21); }
    if ('hot' in opts) el.classList.toggle('hot', !!opts.hot);
  }
  function note(text, err) {
    var n = $('#tnote'); if (!n) return;
    n.textContent = text; n.className = 'tnote on' + (err ? ' err' : '');
    clearTimeout(n._t); n._t = setTimeout(function () { n.className = 'tnote'; }, 1800);
  }

  // building blocks
  function alertBox(kind, html, icon) {
    var i = icon || { ok: 'check', warn: 'alert', bad: 'alert', busy: '', info: 'info' }[kind] || 'info';
    return '<div class="alert ' + (kind || 'info') + '">' + (kind === 'busy' ? '<span class="spin"></span>' : ico(i, 18)) + '<div class="grow">' + html + '</div></div>';
  }
  function emptyState(icon, title, text) {
    return '<div class="empty">' + ico(icon, 44) + '<div class="t">' + esc(title) + '</div>' + (text ? '<div class="s">' + text + '</div>' : '') + '</div>';
  }
  function skeleton(n) { var h = ''; for (var i = 0; i < (n || 6); i++) h += '<div class="sk"></div>'; return h; }
  function codeBox(text, label) {
    return '<div class="code"><code>' + esc(text) + '</code><button type="button" class="copy" data-copy="' + esc(text) + '" aria-label="Copy ' + esc(label) + '" title="Copy">' + ico('copy', 15) + '</button></div>';
  }
  function wireCopy(el) {
    each(el.querySelectorAll('[data-copy]'), function (btn) {
      btn.addEventListener('click', function () {
        var t = btn.getAttribute('data-copy');
        (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () {
          btn.classList.add('done'); setTimeout(function () { btn.classList.remove('done'); }, 1200);
        }).catch(function () { var r = document.createRange(); r.selectNodeContents(btn.previousElementSibling); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); });
      });
    });
  }
  function wireLinks(el) {        // in-page links to Fixarr pages and to Sonarr series pages
    each(el.querySelectorAll('a[data-go]'), function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); var g = a.getAttribute('data-go').split('/'); go(g[0], g[1] || ''); });
    });
    each(el.querySelectorAll('a[data-series]'), function (a) {
      if (STANDALONE) return;   // the web app opens Sonarr in a new tab via href
      a.addEventListener('click', function (e) { e.preventDefault(); goSonarr('/series/' + a.getAttribute('data-series')); });
    });
  }
  function seriesLink(slug, text) {
    if (!slug) return esc(text || '');
    var o = DATA.overview || {}, href = STANDALONE ? (o.sonarr_public || '') + '/series/' + encodeURIComponent(slug) : URLBASE + '/series/' + encodeURIComponent(slug);
    if (STANDALONE && !o.sonarr_public) return esc(text || '');
    return '<a href="' + esc(href) + '" data-series="' + esc(slug) + '"' + (STANDALONE ? ' target="_blank" rel="noopener"' : '') + '>' + esc(text || slug) + '</a>';
  }

  // pager: Sonarr's table pager (total on the left, first/prev/page/next/last on the right)
  function pagerHTML(p) {
    if (!p || p.total <= p.pageSize) return p && p.total ? '<div class="pager"><span>Total records: ' + p.total + '</span></div>' : '';
    return '<div class="pager"><span>Total records: ' + p.total + '</span><div class="ctl">' +
      '<button type="button" data-pg="1" aria-label="First page"' + (p.page <= 1 ? ' disabled' : '') + '>' + ico('first', 16) + '</button>' +
      '<button type="button" data-pg="' + (p.page - 1) + '" aria-label="Previous page"' + (p.page <= 1 ? ' disabled' : '') + '>' + ico('chevL', 16) + '</button>' +
      '<span class="pg">Page ' + p.page + ' of ' + p.pages + '</span>' +
      '<button type="button" data-pg="' + (p.page + 1) + '" aria-label="Next page"' + (p.page >= p.pages ? ' disabled' : '') + '>' + ico('chevR', 16) + '</button>' +
      '<button type="button" data-pg="' + p.pages + '" aria-label="Last page"' + (p.page >= p.pages ? ' disabled' : '') + '>' + ico('last', 16) + '</button></div></div>';
  }
  function wirePager(el, fn) { each(el.querySelectorAll('[data-pg]'), function (b) { b.addEventListener('click', function () { fn(+b.getAttribute('data-pg')); }); }); }

  // dialogs (never alert/confirm)
  var dlgResolve = null;
  function dialog(title, html, okText, danger) {
    var d = $('#dlg');
    d.innerHTML = '<div class="dlgwrap"><div class="dlg" role="alertdialog" aria-modal="true" aria-labelledby="dT"><div class="dh" id="dT">' + esc(title) + '</div>' +
      '<div class="db">' + html + '</div><div class="df"><button class="btn" type="button" data-no>Cancel</button>' +
      '<button class="btn ' + (danger ? 'danger' : 'primary') + '" type="button" data-ok>' + esc(okText) + '</button></div></div></div>';
    d.hidden = false; d.querySelector('[data-ok]').focus();
    return new Promise(function (res) {
      dlgResolve = res;
      d.querySelector('[data-no]').onclick = function () { closeDialog(false); };
      d.querySelector('[data-ok]').onclick = function () { closeDialog(true); };
    });
  }
  function closeDialog(v) { var d = $('#dlg'); d.innerHTML = ''; d.hidden = true; if (dlgResolve) { var r = dlgResolve; dlgResolve = null; r(v); } }
  function progressDialog(title) {
    var d = $('#dlg');
    d.innerHTML = '<div class="dlgwrap"><div class="dlg" role="alertdialog" aria-modal="true" aria-labelledby="dT"><div class="dh" id="dT">' + esc(title) + '</div><div class="db">' +
      '<div style="display:flex;gap:10px;align-items:center"><span class="spin"></span><span id="dStep">Starting...</span></div><div class="prog"><div class="bar" id="dBar"></div></div></div></div></div>';
    d.hidden = false;
    var w = 0, bar = d.querySelector('#dBar');
    var t = setInterval(function () { w += Math.max(0.4, (92 - w) * 0.04); if (w > 92) w = 92; bar.style.width = w.toFixed(1) + '%'; }, 200);
    return { step: function (s) { var e = d.querySelector('#dStep'); if (e) e.textContent = s; },
             done: function () { clearInterval(t); bar.style.width = '100%'; setTimeout(function () { d.innerHTML = ''; d.hidden = true; }, 350); } };
  }

  // header search (web app): packs and series, keyboard friendly
  function wireSearch() {
    var input = $('#q'), box = $('#sres'), items = [], active = 0, t = null;
    function close() { box.hidden = true; }
    function pick(it) { close(); input.value = ''; input.blur(); go('import', '', it.q); }
    function draw() {
      if (!items.length) { box.innerHTML = '<div class="none">Nothing matches "' + esc(input.value.trim()) + '"</div>'; box.hidden = false; return; }
      var h = '', last = null;
      items.forEach(function (it, i) {
        if (it.group !== last) { h += '<div class="grp">' + it.group + '</div>'; last = it.group; }
        h += '<div class="opt' + (i === active ? ' on' : '') + '" role="option" data-i="' + i + '"><span class="m"><b>' + esc(it.label) + '</b><small>' + esc(it.sub) + '</small></span>' + (it.chip || '') + '</div>';
      });
      box.innerHTML = h; box.hidden = false;
    }
    function run() {
      var q = input.value.trim().toLowerCase();
      if (!q) { close(); return; }
      var ws = q.split(/\s+/);
      function hit(s) { s = (s || '').toLowerCase(); return ws.every(function (w) { return s.indexOf(w) !== -1; }); }
      Promise.all([loadCatalog().catch(function () { return { items: [] }; }), loadSeries().catch(function () { return []; })]).then(function (r) {
        items = [];
        r[0].items.filter(function (x) { return hit(x.name + ' ' + (x.series_title || '')); }).slice(0, 8).forEach(function (x) {
          items.push({ group: 'Packs', label: x.name, sub: (x.series_title || 'Series unknown') + ' · ' + x.seasons, chip: STATE_LBL[x.state], q: { pack: x.path } });
        });
        r[1].filter(function (s) { return hit(s.title); }).slice(0, 6).forEach(function (s) {
          items.push({ group: 'Series', label: s.title, sub: s.year ? String(s.year) : '', q: { seriesId: s.id } });
        });
        active = 0; draw();
      });
    }
    input.addEventListener('input', function () { clearTimeout(t); t = setTimeout(run, 120); });
    input.addEventListener('focus', function () { if (input.value.trim()) run(); });
    input.addEventListener('blur', function () { setTimeout(close, 150); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(items.length - 1, active + 1); draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); draw(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (items[active]) pick(items[active]); }
      else if (e.key === 'Escape') { close(); input.blur(); }
    });
    box.addEventListener('mousedown', function (e) { var o = e.target.closest('.opt'); if (o) { e.preventDefault(); pick(items[+o.getAttribute('data-i')]); } });
  }

  // searchable combobox (import page)
  function combo(el, o) {
    el.className = 'cb';
    el.innerHTML = '<input type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" autocomplete="off" spellcheck="false" placeholder="' + esc(o.placeholder) + '"' +
      (o.label ? ' aria-labelledby="' + o.label + '"' : '') + '><span class="spin" hidden></span><span class="chev">' + ico('down', 15) + '</span><div class="lb" role="listbox" hidden></div>';
    var input = el.querySelector('input'), lb = el.querySelector('.lb'), sp = el.querySelector('.spin');
    var opts = [], value = null, active = -1, shown = [], loadingText = null, typed = false;
    function label(v) { var x = opts.find(function (p) { return p.value === v; }); return x ? x.label : ''; }
    function filter(q) {
      if (!q) return o.defaultFilter ? opts.filter(o.defaultFilter) : opts;
      var ws = q.toLowerCase().split(/\s+/).filter(Boolean);
      return opts.filter(function (p) { var hay = (p.search || p.label).toLowerCase(); return ws.every(function (w) { return hay.indexOf(w) !== -1; }); });
    }
    function draw() {
      var q = typed ? input.value.trim() : '';
      shown = filter(q).slice(0, 300);
      if (loadingText && !opts.length) { lb.innerHTML = '<div class="none" style="display:flex;gap:8px;align-items:center"><span class="spin"></span>' + esc(loadingText) + '</div>'; return; }
      if (!shown.length) { lb.innerHTML = '<div class="none">' + esc(q ? 'Nothing matches "' + q + '"' : (o.emptyText || 'Nothing to show')) + '</div>'; return; }
      var h = '';
      shown.forEach(function (p, i) {
        h += '<div class="op' + (i === active ? ' on' : '') + (p.value === value ? ' sel' : '') + '" role="option" data-i="' + i + '" aria-selected="' + (p.value === value) + '">' +
          (p.img ? '<img class="th" loading="lazy" alt="" src="' + esc(p.img) + '">' : '') + '<span class="m"><span class="l">' + esc(p.label) + '</span>' + (p.sub ? '<span class="s">' + esc(p.sub) + '</span>' : '') + '</span>' + (p.chip || '') + '</div>';
      });
      if (!q && o.footer) h += o.footer(opts.length - shown.length);
      lb.innerHTML = h;
      var a = lb.querySelector('.op.on'); if (a) a.scrollIntoView({ block: 'nearest' });
    }
    function open() { lb.hidden = false; input.setAttribute('aria-expanded', 'true'); draw(); }
    function close() { lb.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; typed = false; input.value = label(value); }
    function pick(p) { value = p.value; close(); if (o.onSelect) o.onSelect(p.value, p); }
    input.addEventListener('focus', function () { input.select(); open(); });
    input.addEventListener('input', function () { typed = true; active = 0; open(); });
    input.addEventListener('blur', function () { setTimeout(close, 150); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (lb.hidden) open(); active = Math.min(shown.length - 1, active + 1); draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); draw(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) pick(shown[active]); }
      else if (e.key === 'Escape' && !lb.hidden) { e.preventDefault(); close(); input.blur(); }
    });
    lb.addEventListener('mousedown', function (e) { var d = e.target.closest('.op'); if (d) { e.preventDefault(); pick(shown[+d.getAttribute('data-i')]); } });
    return {
      set: function (list) { opts = list || []; if (!lb.hidden) draw(); if (value != null && root.activeElement !== input) input.value = label(value); },
      value: function () { return value; },
      select: function (v, silent) { value = v; input.value = label(v); if (!silent && o.onSelect) { var p = opts.find(function (x) { return x.value === v; }); if (p) o.onSelect(v, p); } },
      loading: function (text) { loadingText = text; sp.hidden = !text; if (!lb.hidden) draw(); }
    };
  }

  // page lifecycle
  var polls = [];
  function poll(fn, ms) { var id = setInterval(fn, ms); polls.push(id); return id; }
  function stopPolls() { polls.forEach(clearInterval); polls = []; }
  function render() {
    var route = currentRoute();
    if (!STANDALONE) { scheduleEnsure(); placeHost(); if (!route) { stopPolls(); PAGE = null; return; } }
    if (!route) return;
    var key = route.page + '/' + route.sub + '?' + JSON.stringify(route.q);
    // Sonarr sets its own title on its not-found page underneath; put Fixarr's back whenever it does.
    if (PAGE && PAGE.key === key) { if (!STANDALONE && PAGE.title && document.title !== PAGE.title) document.title = PAGE.title; return; }
    if (busy) return;
    stopPolls(); closeDialog(false);
    PAGE = { key: key, route: route };
    renderSide();
    PAGE.title = document.title = (route.page === 'settings' ? 'Settings' : PAGES.filter(function (p) { return p.id === route.page; })[0].label) + ' - Fixarr' + (STANDALONE ? '' : ' - Sonarr');
    var pc = $('#pc'); pc.scrollTop = 0; pc.innerHTML = '';
    pc.style.animation = 'none'; void pc.offsetWidth; pc.style.animation = '';
    ({ import: pageImport, activity: pageActivity, history: pageHistory, audit: pageAudit, settings: pageSettings })[route.page](route, pc);
  }
