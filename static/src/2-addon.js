
  // ================================================================== Sonarr add-on: placements in Sonarr's own pages
  var state = { nav: false, series: null, season: null, wanted: null, queue: null };
  var NAV_ANCHORS = ['/wanted/missing', '/wanted', '/activity/queue', '/calendar', '/settings'];
  var ACTIVE_COLOR = '#2193b5';

  function isOutline(svg) { return !!svg && ((svg.getAttribute('stroke') && svg.getAttribute('stroke') !== 'none') || /lucide/.test(svg.getAttribute('class') || '')); }
  function setIcon(svg, outline) {
    if (!svg) return;
    ['data-icon', 'data-prefix', 'role'].forEach(function (a) { svg.removeAttribute(a); });
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    if (outline) {
      svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.innerHTML = P.layers;
    } else { svg.setAttribute('fill', 'currentColor'); svg.removeAttribute('stroke'); svg.innerHTML = SOLID.fixarr; }
  }
  function stripState(root) {
    [root].concat(Array.prototype.slice.call(root.querySelectorAll('*'))).forEach(function (el) {
      if (!el.classList) return;
      Array.prototype.slice.call(el.classList).forEach(function (c) { if (/active|selected|disabled|spinning/i.test(c)) el.classList.remove(c); });
    });
  }
  function setText(root, text, skipNumbers) {     // first visible text (v4 wraps labels in a span, v5 uses a bare text node)
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), n;
    while ((n = w.nextNode())) {
      var t = (n.nodeValue || '').trim();
      if (!t || (n.parentElement && n.parentElement.closest('svg'))) continue;
      if (skipNumbers && /^\d+$/.test(t)) continue;
      n.nodeValue = text; return n;
    }
    return null;
  }
  function buttonByText(texts) {
    var buttons = Array.prototype.filter.call(document.querySelectorAll('button'), function (b) { return !b.closest('[data-fixarr]'); });
    for (var i = 0; i < texts.length; i++) for (var j = 0; j < buttons.length; j++) if ((buttons[j].textContent || '').trim() === texts[i]) return buttons[j];
    return null;
  }
  function cloneButton(anchor, kind, label, title, onClick, extra) {
    var b = anchor.cloneNode(true);
    b.setAttribute('data-fixarr', kind); b.removeAttribute('disabled'); b.setAttribute('type', 'button'); b.setAttribute('title', title);
    Object.keys(extra || {}).forEach(function (k) { b.setAttribute(k, extra[k]); });
    stripState(b);
    if (label != null) setText(b, label, false);
    setIcon(b.querySelector('svg'), isOutline(anchor.querySelector('svg')));
    b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); onClick(b); });
    anchor.after(b);
    return b;
  }
  function itemOf(a) {
    var el = a;
    while (el.parentElement && el.parentElement !== document.body) {
      var p = el.parentElement;
      var entries = Array.prototype.filter.call(p.children, function (c) { return c.querySelector('a[href]'); });
      if (entries.length >= 4 && entries.indexOf(el) !== -1) return el;
      el = p;
    }
    return null;
  }
  function sidebarLink(href) {
    return Array.prototype.find.call(document.querySelectorAll('a[href$="' + href + '"]'), function (a) { return !a.closest('[data-fixarr]') && itemOf(a); });
  }

  // menu entry: a clone of a Sonarr menu item, with sub-items while a Fixarr page is open
  function buildNav() {
    var item = null, anchor = null;
    for (var i = 0; i < NAV_ANCHORS.length && !item; i++) { var a = sidebarLink(NAV_ANCHORS[i]); if (a) { item = itemOf(a); anchor = NAV_ANCHORS[i]; } }
    if (!item) return null;
    var outline = isOutline(item.querySelector('svg'));
    var clone = item.cloneNode(true);
    clone.setAttribute('data-fixarr', 'nav');
    stripState(clone);
    var links = clone.querySelectorAll('a'), main = links[0];
    for (var j = links.length - 1; j > 0; j--) {
      var n = links[j];
      while (n.parentElement && !n.parentElement.contains(main)) n = n.parentElement;
      if (n !== clone && !n.contains(main)) n.remove();
    }
    Array.prototype.slice.call(main.querySelectorAll('[class*="status"],[class*="Label"]')).forEach(function (e) { e.remove(); });
    setText(main, 'Fixarr', true);
    setIcon(main.querySelector('svg'), outline);
    main.setAttribute('href', ROUTE_PREFIX + '/import'); main.removeAttribute('target');
    main.setAttribute('title', 'Fixarr: import the packs Sonarr cannot');
    main.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); go('import'); });
    var src = (sidebarLink('/activity/queue') || document.createElement('a')).querySelector('[class*="status"]');
    var badge = src ? src.cloneNode(true) : document.createElement('span');
    badge.setAttribute('data-fixarr-badge', '');
    if (!src) badge.style.cssText = 'margin-left:auto;background:#4a4a4a;color:#fff;border-radius:2px;padding:1px 5px;font-size:12px;font-weight:600';
    main.appendChild(badge);
    if (anchor === '/settings') item.before(clone); else item.after(clone);
    updateNavBadge();
    return clone;
  }
  function updateNavBadge() {
    var n = counts().total, b = document.querySelector('[data-fixarr="nav"] [data-fixarr-badge]');
    if (!b) return;
    var leaf = Array.prototype.find.call(b.querySelectorAll('*'), function (e) { return !e.children.length; }) || b;
    leaf.textContent = n ? String(n) : ''; b.style.display = n ? '' : 'none';
    b.setAttribute('title', n ? plural(n, 'item') + ' waiting in Fixarr' : '');
  }
  function navActive(route) {
    var item = document.querySelector('[data-fixarr="nav"]'); if (!item) return;
    var main = item.querySelector('a'), subs = item.querySelector('[data-fixarr-subs]');
    if (!route) {
      item.style.borderLeft = ''; main.style.background = ''; main.style.color = '';
      if (subs) subs.remove();
      return;
    }
    item.style.borderLeft = '3px solid ' + ACTIVE_COLOR; main.style.background = 'var(--sidebarActiveBackgroundColor,#333)'; main.style.color = ACTIVE_COLOR;
    if (!subs) {
      // line the sub-item labels up under the menu label, like Sonarr's own sub-items
      var label = setText(main, 'Fixarr', true), indent = 56;
      if (label) { var r = document.createRange(); r.selectNodeContents(label); indent = Math.round(r.getBoundingClientRect().left - main.getBoundingClientRect().left) || 56; }
      subs = document.createElement('div'); subs.setAttribute('data-fixarr-subs', '');
      PAGES.forEach(function (p) {
        var a = document.createElement('a');
        a.className = main.className; a.href = ROUTE_PREFIX + '/' + p.id; a.setAttribute('data-page', p.id);
        a.style.cssText = 'display:block;padding:10px 24px 10px ' + indent + 'px;background:none;color:var(--sidebarColor,#e1e2e3);text-decoration:none';
        a.textContent = p.label;
        a.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); go(p.id, p.id === 'settings' ? 'general' : ''); });
        subs.appendChild(a);
      });
      main.after(subs);
    }
    each(subs.querySelectorAll('a'), function (a) { a.style.color = a.getAttribute('data-page') === route.page ? ACTIVE_COLOR : 'var(--sidebarColor,#e1e2e3)'; });
  }

  // Activity's outline clock looks lighter than the solid icons around it in Sonarr v4: give it a solid clock to match
  function fixActivityIcon() {
    var a = sidebarLink('/activity/queue'), ref = sidebarLink('/calendar') || sidebarLink('/wanted/missing');
    if (!a || !ref || isOutline(ref.querySelector('svg'))) return;
    var svg = a.querySelector('svg');
    if (!svg || svg.getAttribute('data-fixarr-icon') === 'clock') return;
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'currentColor'); svg.removeAttribute('stroke');
    svg.innerHTML = SOLID.clock; svg.setAttribute('data-fixarr-icon', 'clock');
  }

  function seriesSlug() { var m = location.pathname.match(/\/series\/([^/]+)(?:\/\d+)?\/?$/); return m ? decodeURIComponent(m[1]) : null; }
  function seasonOf(el) {
    var n = el;
    for (var i = 0; i < 8 && n; i++) {
      n = n.parentElement; if (!n) break;
      var m = ((n.innerText || '').trim()).match(/^(?:Season\s+(\d+)|Specials)\b/);
      if (m) return m[1] ? +m[1] : 0;
    }
    return null;
  }
  function placeSeries(slug, showButton, showSeasons) {
    var sb = document.querySelector('[data-fixarr="series"]');
    if (sb && sb.getAttribute('data-slug') !== slug) { sb.remove(); sb = null; }
    if (!sb && showButton !== false) {
      var anchor = buttonByText(['Manage Episodes', 'Preview Rename', 'Series Monitoring', 'Episode Monitoring', 'History']);
      if (anchor) sb = cloneButton(anchor, 'series', 'Fixarr', 'Import packs for this series with Fixarr', function () { go('import', '', { series: slug }); }, { 'data-slug': slug });
    }
    state.series = showButton === false ? null : !!sb;
    if (showSeasons === false) { state.season = null; return; }
    var all = Array.prototype.filter.call(document.querySelectorAll('button[title],a[title]'), function (b) { return !b.closest('[data-fixarr]') && /season/i.test(b.getAttribute('title') || ''); });
    var anchors = all.filter(function (b) { return /manage episodes/i.test(b.getAttribute('title')); });
    if (!anchors.length) anchors = all.filter(function (b) { return /(preview rename|history)/i.test(b.getAttribute('title')); });
    var placed = 0;
    anchors.forEach(function (a) {
      var next = a.nextElementSibling;
      if (next && next.getAttribute('data-fixarr') === 'season') { if (next.getAttribute('data-slug') === slug) { placed++; return; } next.remove(); }
      var season = seasonOf(a); if (season === null) return;
      var b = cloneButton(a, 'season', null, 'Fixarr: import packs for ' + (season ? 'Season ' + season : 'Specials'),
        function () { go('import', '', { series: slug, season: season }); }, { 'data-season': String(season), 'data-slug': slug });
      placed++; tintSeason(b, slug, season);
    });
    state.season = anchors.length ? placed === anchors.length : null;
  }
  function tintSeason(b, slug, season) {     // theme blue when a pack on disk still has episodes for that season
    loadCatalog().then(function (c) {
      var hit = (c.items || []).some(function (x) { return x.state === 'needs' && x.series_id && (x.missing_seasons || []).indexOf(season) !== -1 && DATA.slugs[x.series_id] === slug; });
      if (hit) { b.style.color = 'var(--themeBlue,#35c5f4)'; b.setAttribute('title', b.getAttribute('title') + ' (a pack on disk has missing episodes)'); }
    }).catch(function () {});
  }
  function rowButton(kind, title, onClick) {
    var b = document.createElement('button');
    b.type = 'button'; b.setAttribute('data-fixarr', kind); b.title = title; b.setAttribute('aria-label', title);
    b.style.cssText = 'background:none;border:0;padding:2px 6px;margin:0 2px;cursor:pointer;color:var(--themeBlue,#35c5f4);vertical-align:middle;line-height:1';
    var r = sidebarLink('/calendar');
    b.innerHTML = isOutline(r && r.querySelector('svg')) ? ico('layers', 15) : solid('fixarr', 15);
    b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); onClick(); });
    return b;
  }
  function placeWanted() {
    var tb = document.querySelector('[data-fixarr="wanted"]');
    if (!tb) {
      var anchor = buttonByText(['Manual Import']);
      if (anchor) tb = cloneButton(anchor, 'wanted', 'Fixarr', 'Missing episodes that packs already on disk can fill', function () { go('import', '', { missing: 1 }); });
    }
    state.wanted = !!tb;
    loadMissing().then(function (m) {
      if (tb) setText(tb, m.raw.episodes ? 'Fixarr (' + m.raw.episodes + ')' : 'Fixarr', false);
      each(document.querySelectorAll('tbody tr'), function (tr) {
        if (tr.querySelector('[data-fixarr="wrow"]')) return;
        var link = tr.querySelector('a[href*="/series/"]');
        var cell = Array.prototype.find.call(tr.children, function (td) { return /^\d+x\d+$/.test((td.textContent || '').trim()); });
        if (!link || !cell) return;
        var se = (cell.textContent || '').trim().split('x');
        var hit = m.map[(link.textContent || '').trim().toLowerCase() + '|S' + pad(se[0]) + 'E' + pad(se[1])];
        if (!hit || !tr.lastElementChild) return;
        tr.lastElementChild.appendChild(rowButton('wrow', 'A pack on disk has this episode: open it in Fixarr', function () {
          go('import', '', { seriesId: hit.series_id, pack: hit.packs[0] && hit.packs[0].path });
        }));
      });
    }).catch(function () {});
  }
  function placeQueue() {
    var tb = document.querySelector('[data-fixarr="queue"]');
    if (!tb) {
      var anchor = buttonByText(['Remove Selected']);
      if (anchor) tb = cloneButton(anchor, 'queue', 'Fixarr', 'Downloads Fixarr is handling', function () { go('activity'); });
    }
    state.queue = !!tb;
    loadQueueMap().then(function (q) {
      if (tb) setText(tb, q.list.length ? 'Fixarr (' + q.list.length + ')' : 'Fixarr', false);
      each(document.querySelectorAll('tbody tr'), function (tr) {
        if (tr.querySelector('[data-fixarr="qrow"]')) return;
        var cell = Array.prototype.find.call(tr.children, function (td) { return q.map[(td.textContent || '').trim()]; });
        if (!cell) return;
        var d = q.map[(cell.textContent || '').trim()], rm = tr.querySelector('button[title*="emove"]');
        var b = rowButton('qrow', 'Fixarr: ' + (d.plan ? d.plan.text : 'handling this download'), function () {
          if (d.plan && d.plan.action === 'review' && d.plan.pack) go('import', '', { pack: d.plan.pack, seriesId: d.plan.series_id || d.series_id, dl: d.download_id });
          else go('activity');
        });
        if (rm) rm.before(b); else tr.lastElementChild.appendChild(b);
      });
    }).catch(function () {});
  }

  var ensureTimer = null, settled = false, fab = null;
  function ensure() {
    ensureTimer = null;
    if (!document.querySelector('[data-fixarr="nav"]')) buildNav();
    state.nav = !!document.querySelector('[data-fixarr="nav"]');
    fixActivityIcon();
    var route = currentRoute(), opt = settings();
    function on(k) { return opt[k] !== false; }
    navActive(route);
    if (!on('addon_seasons')) each(document.querySelectorAll('[data-fixarr="season"]'), function (e) { e.remove(); });
    if (!on('addon_series')) each(document.querySelectorAll('[data-fixarr="series"]'), function (e) { e.remove(); });
    if (!on('addon_wanted')) each(document.querySelectorAll('[data-fixarr="wanted"],[data-fixarr="wrow"]'), function (e) { e.remove(); });
    if (!on('addon_queue')) each(document.querySelectorAll('[data-fixarr="queue"],[data-fixarr="qrow"]'), function (e) { e.remove(); });
    var p = location.pathname, slug = route ? null : seriesSlug();
    if (slug && (on('addon_series') || on('addon_seasons'))) placeSeries(slug, on('addon_series'), on('addon_seasons'));
    else { each(document.querySelectorAll('[data-fixarr="series"],[data-fixarr="season"]'), function (e) { e.remove(); }); state.series = state.season = null; }
    if (!route && on('addon_wanted') && /\/wanted\/(missing|cutoffunmet)/.test(p)) placeWanted(); else state.wanted = null;
    if (!route && on('addon_queue') && /\/activity\/queue/.test(p)) placeQueue(); else state.queue = null;
    if (fab) fab.hidden = state.nav || !settled || !!route;
    placeHost();
    scheduleReport();
  }
  function scheduleEnsure() { if (!STANDALONE && !ensureTimer) ensureTimer = setTimeout(ensure, 200); }

  var lastReport = '', reportTimer = null;
  function scheduleReport() {
    if (!settled) return;
    clearTimeout(reportTimer);
    reportTimer = setTimeout(function () {
      var body = { layer: VERSION, sonarr: (window.Sonarr && window.Sonarr.version) || null, nav: state.nav, series: state.series,
        season: state.season, wanted: state.wanted, queue: state.queue, fallback: !state.nav,
        page: location.pathname.replace(/\/series\/[^/]+(\/\d+)?/, '/series/:slug') };
      var key = JSON.stringify([body.sonarr, body.nav, body.series, body.season, body.wanted, body.queue]);
      if (key === lastReport) return;
      lastReport = key;
      api('api/health', body).catch(function () {});
    }, 2500);
  }
