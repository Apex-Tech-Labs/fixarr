/*
 * Fixarr UI 3.1. One script, two homes:
 *   web app   templates/index.html sets FIXARR_STANDALONE; Fixarr draws a Sonarr-style shell (header, left menu, pages).
 *   add-on    loaded into Sonarr's page by the reverse proxy or a userscript. Fixarr adds a menu entry with sub-items and
 *             renders its pages in Sonarr's own content area at /addons/fixarr/<page>, plus buttons on series, season,
 *             Wanted and Queue pages. Nothing depends on Sonarr's generated class names: everything is found by link
 *             address, button text or title, and cloned at runtime so it matches the installed Sonarr version.
 * Built from static/src/*.js (cat in order) into static/layer.js.
 */
(function () {
  'use strict';
  if (window.__fixarrLayer) return;
  var VERSION = '3.2.1';
  var BUILD = '20261120181435';        // replaced by static/build.sh; lets the add-on spot a stale cached copy
  window.__fixarrLayer = VERSION;
  var STANDALONE = !!window.FIXARR_STANDALONE;
  var REPO = 'Apex-Tech-Labs/fixarr';

  var script = document.currentScript;
  var BASE = window.FIXARR_BASE || (script && script.src ? new URL('.', script.src).href : location.origin + '/fixarr/');
  if (!/\/$/.test(BASE)) BASE += '/';
  var URLBASE = (!STANDALONE && window.Sonarr && window.Sonarr.urlBase) || '';
  var ROUTE_PREFIX = URLBASE + '/addons/fixarr';

  // ================================================================== helpers
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function posterUrl(id) { return window.FIXARR_DEMO_POSTER ? window.FIXARR_DEMO_POSTER(id) : BASE + 'api/poster/' + id; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function ago(ts) {
    if (!ts) return '';
    var s = Math.max(0, Date.now() / 1000 - ts);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    if (s < 7 * 86400) return Math.floor(s / 86400) + ' d ago';
    return new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function when(ts) {
    if (!ts) return '';
    return new Date(ts * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function gb(b) { return (b / 1073741824).toFixed(1) + ' GB'; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function each(list, fn) { Array.prototype.forEach.call(list || [], fn); }
  function hourLabel(h) { return (h % 12 || 12) + ':00 ' + (h < 12 ? 'AM' : 'PM'); }

  function api(path, body, method) {
    var opt = { credentials: 'same-origin', headers: { Accept: 'application/json' }, method: method || (body !== undefined ? 'POST' : 'GET') };
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    return fetch(BASE + path, opt).then(function (r) {
      var ct = r.headers.get('content-type') || '';
      if (ct.indexOf('json') === -1) throw new Error(r.ok ? 'Your sign-in has expired. Reload the page and try again.' : 'Fixarr is not reachable right now (HTTP ' + r.status + ').');
      return r.json().then(function (d) {
        if (!r.ok) throw new Error((d && d.error) || 'Fixarr returned HTTP ' + r.status + '.');
        return d;
      });
    }, function () { throw new Error('Fixarr is not reachable right now. Check that the Fixarr container is running.'); });
  }

  // ================================================================== icons (Lucide-style outline paths, 24px grid)
  var P = {
    import: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
    activity: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    audit: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    settings: '<path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
    play: '<path d="M6 4l14 8-14 8z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-1"/>',
    swap: '<path d="M7 7h13l-3-3M17 17H4l3 3"/>',
    chevL: '<path d="m15 18-6-6 6-6"/>', chevR: '<path d="m9 18 6-6-6-6"/>',
    first: '<path d="m11 17-5-5 5-5M18 17l-5-5 5-5"/>', last: '<path d="m13 17 5-5-5-5M6 17l5-5-5-5"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    film: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4"/>',
    layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',
    github: '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3.1-.4 6.4-1.6 6.4-7A5.4 5.4 0 0 0 20 4.8 5 5 0 0 0 19.9 1S18.7.7 16 2.5a13.4 13.4 0 0 0-7 0C6.3.7 5.1 1 5.1 1A5 5 0 0 0 5 4.8a5.4 5.4 0 0 0-1.5 3.7c0 5.4 3.3 6.6 6.4 7a3.4 3.4 0 0 0-.9 2.6V22"/>'
  };
  var SOLID = {
    fixarr: '<path d="M12 2 2 7l10 5 10-5z"/><path d="m2 12 10 5 10-5-2.4-1.2L12 14.6l-7.6-3.8z"/><path d="m2 17 10 5 10-5-2.4-1.2L12 19.6l-7.6-3.8z"/>',
    clock: '<path fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1 4h2v6.4l4.2 2.5-1 1.7-5.2-3.1Z"/>'
  };
  function ico(name, size, cls) {
    return '<svg class="i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" width="' + (size || 16) + '" height="' + (size || 16) +
      '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P[name] + '</svg>';
  }
  function solid(name, size) {
    return '<svg viewBox="0 0 24 24" width="' + (size || 16) + '" height="' + (size || 16) + '" fill="currentColor" aria-hidden="true">' + SOLID[name] + '</svg>';
  }

  // ================================================================== shared data (small caches)
  var DATA = { overview: null, missing: null, missingAt: 0, queue: null, queueAt: 0, catalog: null, catalogAt: 0, series: null, slugs: {} };
  var listeners = [];
  function onData(fn) { listeners.push(fn); }
  function loadOverview() {
    return api('api/overview').then(function (o) {
      DATA.overview = o; if (o.version && o.version.repo) REPO = o.version.repo;
      listeners.forEach(function (fn) { try { fn(o); } catch (e) {} });
      return o;
    }).catch(function () {});
  }
  function withOverview(fn) { return (DATA.overview ? Promise.resolve(DATA.overview) : loadOverview()).then(function () { return fn(); }); }
  function counts() {
    var o = DATA.overview; if (!o) return { packs: 0, waiting: 0, total: 0 };
    var packs = (o.packs.needs || 0) + (o.packs.review || 0), waiting = o.resolver.open || 0;
    return { packs: packs, waiting: waiting, total: packs + waiting };
  }
  function settings() { return (DATA.overview && DATA.overview.settings) || {}; }
  function loadSeries() {
    if (DATA.series) return Promise.resolve(DATA.series);
    return api('api/series').then(function (l) { DATA.series = l; l.forEach(function (s) { DATA.slugs[s.id] = s.slug; }); return l; });
  }
  function loadMissing(force) {
    if (!force && DATA.missing && Date.now() - DATA.missingAt < 120000) return Promise.resolve(DATA.missing);
    return api('api/missing').then(function (m) {
      var map = {};
      m.series.forEach(function (s) { s.episodes.forEach(function (e) { map[(s.series || '').toLowerCase() + '|' + e] = s; }); });
      DATA.missing = { raw: m, map: map }; DATA.missingAt = Date.now(); return DATA.missing;
    });
  }
  function loadQueueMap(force) {
    if (!force && DATA.queue && Date.now() - DATA.queueAt < 60000) return Promise.resolve(DATA.queue);
    return api('api/activity').then(function (a) {
      var map = {};
      (a.resolver.downloads || []).forEach(function (d) { if (d.output) map[d.output] = d; });
      DATA.queue = { list: a.resolver.downloads || [], map: map }; DATA.queueAt = Date.now(); return DATA.queue;
    });
  }
  function loadCatalog(force) {
    if (!force && DATA.catalog && Date.now() - DATA.catalogAt < 120000) return Promise.resolve(DATA.catalog);
    return api('api/catalog?all=1&nowait=1').then(function (c) { DATA.catalog = c; DATA.catalogAt = c.building ? 0 : Date.now(); return c; });
  }

  // ================================================================== routing
  // Pages: import, activity, history, audit, settings/<section>. Web app: #/page?query. Add-on: /addons/fixarr/page?query.
  var PAGES = [
    { id: 'import', label: 'Import', icon: 'import' },
    { id: 'activity', label: 'Activity', icon: 'activity' },
    { id: 'history', label: 'History', icon: 'history' },
    { id: 'audit', label: 'Audit', icon: 'audit' },
    { id: 'settings', label: 'Settings', icon: 'settings', children: [
      ['general', 'General'], ['matching', 'Matching'], ['library', 'Library Audit'], ['addon', 'Sonarr Add-on'],
      ['updates', 'Updates'], ['remembered', 'Remembered'], ['appearance', 'Appearance'], ['about', 'About']
    ] }
  ];
  function settingsChildren() { return PAGES[4].children.filter(function (c) { return c[0] !== 'appearance' || STANDALONE; }); }
  function parseRoute(path, search) {
    var parts = (path || '').replace(/^\/+|\/+$/g, '').split('/');
    var page = parts[0] || 'import', sub = parts[1] || '';
    if (!PAGES.some(function (p) { return p.id === page; })) page = 'import';
    if (page === 'settings' && !settingsChildren().some(function (c) { return c[0] === sub; })) sub = 'general';
    var q = {}; new URLSearchParams(search || '').forEach(function (v, k) { q[k] = v; });
    return { page: page, sub: sub, q: q };
  }
  function currentRoute() {
    if (STANDALONE) {
      var h = location.hash.replace(/^#\/?/, ''), i = h.indexOf('?');
      return parseRoute(i < 0 ? h : h.slice(0, i), i < 0 ? '' : h.slice(i));
    }
    if (location.pathname.indexOf(ROUTE_PREFIX) !== 0) return null;
    return parseRoute(location.pathname.slice(ROUTE_PREFIX.length), location.search);
  }
  function routeHref(page, sub, q) {
    var path = page + (sub ? '/' + sub : ''), qs = '';
    if (q) { var u = new URLSearchParams(); Object.keys(q).forEach(function (k) { if (q[k] != null && q[k] !== '') u.set(k, q[k]); }); qs = u.toString() ? '?' + u.toString() : ''; }
    return STANDALONE ? '#/' + path + qs : ROUTE_PREFIX + '/' + path + qs;
  }
  function go(page, sub, q, replace) {
    var href = routeHref(page, sub, q);
    if (STANDALONE) {
      if (replace) { history.replaceState(null, '', href); render(); } else location.hash = href.slice(1);
      return;
    }
    history[replace ? 'replaceState' : 'pushState']({}, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));   // Sonarr's router follows along (it shows its not-found page under ours)
  }
  function goSonarr(href) {                                 // a Sonarr page (add-on only)
    history.pushState({}, '', URLBASE + href); window.dispatchEvent(new PopStateEvent('popstate'));
  }

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

  // ================================================================== styles (Sonarr's own theme variables, with Sonarr's dark values as fallback)
  var CSS = [
    ':host{all:initial}', '*{box-sizing:border-box}', '[hidden]{display:none!important}',
    '.root{--bg:var(--pageBackground,#202020);--hdr:var(--pageHeaderBackgroundColor,#2a2a2a);--side:var(--sidebarBackgroundColor,#2a2a2a);',
    '--sideAct:var(--sidebarActiveBackgroundColor,#333);--sideTxt:var(--sidebarColor,#e1e2e3);--tb:var(--toolbarBackgroundColor,#262626);',
    '--tbTxt:var(--toolbarColor,#e1e2e3);--acc:var(--themeBlue,#35c5f4);--accDk:#2193b5;--txt:var(--textColor,#ccc);--strong:var(--fxStrong,#fff);',
    '--muted:var(--helpTextColor,#909293);--card:var(--cardBackgroundColor,#333);--hover:var(--tableRowHoverBackgroundColor,rgba(255,255,255,.08));',
    '--line:color-mix(in srgb,var(--txt) 13%,transparent);--line2:color-mix(in srgb,var(--txt) 24%,transparent);--badge:#3d3d3d;',
    '--ok:var(--successBackgroundColor,#27c24c);--warn:var(--warningColor,#ffa500);--bad:var(--dangerColor,#f05050);--info:var(--infoColor,#5d9cec);',
    '--input:var(--inputBackgroundColor,#333);--modal:var(--modalBackgroundColor,#2a2a2a);',
    'font:14px/1.5 Roboto,"open sans","Helvetica Neue",Helvetica,Arial,sans-serif;color:var(--txt);-webkit-font-smoothing:antialiased}',
    'button,input,select{font:inherit}a{color:var(--acc)}',
    '.i{flex:none;display:block}',
    '@keyframes spin{to{transform:rotate(360deg)}}@keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}',
    '@keyframes fadein{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}',
    '.spin{display:inline-block;width:14px;height:14px;border:2px solid color-mix(in srgb,currentColor 25%,transparent);border-top-color:var(--acc);border-radius:50%;animation:spin .7s linear infinite;flex:none}',
    '.sk{height:38px;border-radius:2px;margin:0 0 6px;background:linear-gradient(90deg,var(--card) 25%,color-mix(in srgb,var(--card) 80%,#fff) 50%,var(--card) 75%);background-size:200% 100%;animation:sh 1.2s ease-in-out infinite}',
    '@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important}}',

    /* web app shell: header, left menu, page */
    '.app{position:fixed;inset:0;display:grid;grid-template-columns:210px minmax(0,1fr);grid-template-rows:60px minmax(0,1fr);background:var(--bg)}',
    '.hdr{grid-column:1/-1;display:flex;align-items:center;height:60px;background:var(--hdr);color:var(--sideTxt);position:relative;z-index:3}',
    '.logo{display:flex;align-items:center;width:210px;height:60px;padding-left:20px;text-decoration:none;flex:none}',
    '.wm{font-family:FixarrLogo,Roboto,sans-serif;font-size:30px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#fff;line-height:1;transform:translateY(4.5px)}',
    '.wm.arr{letter-spacing:3px}.wm-icon{width:30px;height:30px;object-fit:contain;display:block}',
    '.burger{display:none;width:44px;height:44px;margin-left:8px;border:0;background:none;color:var(--sideTxt);cursor:pointer;align-items:center;justify-content:center}',
    '.search{position:relative;display:flex;align-items:center;gap:8px;margin-left:20px;color:var(--sideTxt)}',
    '.search input[type=text]{width:260px;box-shadow:none;border-radius:0;height:30px;padding:0 4px;border:0;border-bottom:1px solid color-mix(in srgb,var(--sideTxt) 60%,transparent);background:none;color:#fff;font-size:15px;outline:none;transition:border-color .2s,width .25s}',
    '.search input[type=text]:focus{border-bottom-color:var(--acc);width:340px;box-shadow:none}.search input::placeholder{color:color-mix(in srgb,var(--sideTxt) 70%,transparent)}',
    '.sres{position:absolute;top:44px;left:0;width:440px;max-height:460px;overflow:auto;background:var(--modal);border:1px solid var(--line2);border-radius:4px;box-shadow:0 10px 30px rgba(0,0,0,.5);padding:4px 0;z-index:5}',
    '.sres .grp{padding:8px 14px 4px;font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--muted)}',
    '.sres .opt{display:flex;align-items:center;gap:10px;padding:8px 14px;cursor:pointer;color:var(--txt)}.sres .opt .m{flex:1;min-width:0}',
    '.sres .opt b{display:block;color:var(--strong);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sres .opt small{display:block;color:var(--muted);font-size:12px}',
    '.sres .opt.on,.sres .opt:hover{background:var(--hover)}.sres .none{padding:12px 14px;color:var(--muted)}',
    '.hdr-r{margin-left:auto;display:flex;align-items:center;gap:2px;padding-right:12px}',
    '.hbtn{position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;border:0;border-radius:4px;background:none;color:var(--sideTxt);cursor:pointer;text-decoration:none}',
    '.hbtn:hover{color:var(--acc)}.hbtn .dot{position:absolute;top:8px;right:8px;width:8px;height:8px;border-radius:50%;background:var(--acc)}',

    '.side{background:var(--side);overflow-y:auto;display:flex;flex-direction:column;padding-bottom:12px}',
    '.navi{position:relative}',
    '.nl{position:relative;display:flex;align-items:center;gap:13px;padding:12px 24px;color:var(--fxNav,#fff);font-weight:700;font-size:14px;letter-spacing:.15px;text-decoration:none;cursor:pointer;transition:background .2s ease,color .2s ease}',
    '.nl::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--acc);transform:scaleY(0);transform-origin:center;transition:transform .25s cubic-bezier(.2,.8,.2,1)}',
    '.nl::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,color-mix(in srgb,var(--acc) 14%,transparent),transparent 70%);opacity:0;transition:opacity .25s ease;pointer-events:none}',
    '.nl .i{width:15px;height:15px;transition:transform .25s cubic-bezier(.2,.8,.2,1),color .2s}',
    '.nl:hover{background:var(--sideAct)}.nl:hover::before{transform:scaleY(.55)}.nl:hover::after{opacity:1}.nl:hover .i{color:var(--acc);transform:translateX(3px)}',
    '.navi.on>.nl{background:var(--sideAct);color:var(--acc)}.navi.on>.nl::before{transform:scaleY(1)}',
    '.nl:focus-visible,.ns:focus-visible{outline:2px solid var(--acc);outline-offset:-2px}',
    '.nbadge{margin-left:auto;min-width:22px;height:20px;padding:0 6px;border-radius:10px;background:var(--badge);color:#fff;font-size:11.5px;font-weight:700;line-height:20px;text-align:center;border:1px solid rgba(255,255,255,.08)}',
    '.navi.on .nbadge{background:#4a4a4a}',
    '.subs{padding-bottom:4px}',
    '.ns{position:relative;display:block;padding:9px 24px 9px 52px;color:var(--sideTxt);font-size:14px;font-weight:500;text-decoration:none;transition:color .2s,padding-left .2s}',
    '.ns:hover{color:var(--acc);padding-left:56px}.ns.on{color:var(--acc)}',
    '.side-foot{margin-top:auto;padding:14px 24px 0;font-size:12px;color:var(--muted)}.side-foot a{color:var(--fxFoot,var(--muted));text-decoration:none}.side-foot a:hover{color:var(--acc)}',
    '.scrim{display:none}',
    '@media (max-width:768px){.app{grid-template-columns:minmax(0,1fr)}.side{position:fixed;top:60px;bottom:0;left:0;width:240px;z-index:4;transform:translateX(-100%);transition:transform .25s ease}',
    '.app.menu .side{transform:none}.app.menu .scrim{display:block;position:fixed;inset:60px 0 0;background:rgba(0,0,0,.5);z-index:3}.burger{display:flex}',
    '.logo{width:auto;padding-left:6px}.wm{font-size:24px}.wm-icon{width:24px;height:24px}.search input{width:140px}.search input:focus{width:180px}.sres{width:calc(100vw - 40px)}}',

    /* page: toolbar + content (both homes) */
    '.page{display:flex;flex-direction:column;min-width:0;min-height:0;height:100%;background:var(--bg)}',
    '.host{position:fixed;display:flex;flex-direction:column;background:var(--bg);z-index:1}',
    '.tbar{display:flex;align-items:stretch;height:60px;flex:none;padding:0 10px;background:var(--tb);color:var(--tbTxt)}',
    '.tsec{display:flex;align-items:stretch}.tsec.r{margin-left:auto}',
    '.tcustom{display:flex;align-items:center;gap:12px;padding:0 8px}.tcustom:empty{display:none}',
    '.tcustom input[type=text]{width:220px;height:32px}.tcustom .seg{padding:2px}.tcustom .seg button{min-height:26px;font-size:13px}',
    '@media (max-width:760px){.tcustom input[type=text]{width:120px}.tcustom .seg button{padding:0 8px}}',
    '.tbtn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-width:62px;padding:4px 8px 0;border:0;background:none;color:var(--tbTxt);cursor:pointer;transition:color .15s}',
    '.tbtn .i{width:21px;height:21px}.tbtn span{font-size:11.5px;line-height:1.15;white-space:nowrap}.tbtn .spin{width:21px;height:21px}',
    '.tbtn:hover:not(:disabled){color:var(--acc)}.tbtn:disabled{opacity:.4;cursor:default}.tbtn.hot{color:var(--acc)}',
    '.tsep{width:1px;margin:10px 8px;background:color-mix(in srgb,var(--tbTxt) 22%,transparent)}',
    '.tnote{display:flex;align-items:center;padding:0 10px;font-size:13px;color:var(--ok);opacity:0;transition:opacity .25s}.tnote.on{opacity:1}.tnote.err{color:var(--bad)}',
    '.pc{flex:1;overflow:auto;padding:20px;animation:fadein .2s ease}',
    '.pc-inner{width:100%}',
    '.pc-inner.set{max-width:1180px;margin:0 auto}',   /* forms read best centered; lists and grids use the full width */

    /* building blocks */
    '.legend{margin:0 0 18px;padding-bottom:6px;border-bottom:1px solid var(--line2);font-size:21px;font-weight:400;line-height:1.4;color:var(--strong);display:flex;align-items:center;gap:10px}',
    '.legend .lbl{font-size:12px}',
    '.fs{margin-bottom:34px}',
    '.alert{display:flex;gap:12px;align-items:flex-start;margin:0 0 20px;padding:12px 15px;border-left:4px solid var(--info);border-radius:4px;background:color-mix(in srgb,var(--info) 11%,transparent);color:var(--txt);line-height:1.55}',
    '.alert .i{margin-top:2px;color:var(--info)}.alert b{color:var(--strong);font-weight:600}.alert .grow{flex:1;min-width:0}',
    '.alert.ok{border-color:var(--ok);background:color-mix(in srgb,var(--ok) 11%,transparent)}.alert.ok .i{color:var(--ok)}',
    '.alert.warn{border-color:var(--warn);background:color-mix(in srgb,var(--warn) 11%,transparent)}.alert.warn .i{color:var(--warn)}',
    '.alert.bad{border-color:var(--bad);background:color-mix(in srgb,var(--bad) 11%,transparent)}.alert.bad .i{color:var(--bad)}',
    '.alert.busy .spin{margin-top:3px}',
    '.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:10px;padding:56px 20px;color:var(--muted)}',
    '.empty .i{opacity:.5}.empty .t{font-size:17px;font-weight:600;color:var(--strong)}.empty .s{max-width:460px;line-height:1.55}',
    '.lbl{display:inline-block;padding:0 7px;border-radius:2px;background:#4a4a4a;color:#fff;font-size:11.5px;font-weight:600;line-height:20px;white-space:nowrap;vertical-align:middle}',
    '.lbl.ok{background:color-mix(in srgb,var(--ok) 85%,#000)}.lbl.warn{background:color-mix(in srgb,var(--warn) 85%,#000)}.lbl.bad{background:color-mix(in srgb,var(--bad) 88%,#000)}',
    '.lbl.info{background:color-mix(in srgb,var(--info) 85%,#000)}.lbl.plex{background:#7d4fb8}.lbl.line{background:none;border:1px solid var(--line2);color:var(--txt);line-height:18px}',
    'button.lbl{border:0;cursor:pointer}button.lbl:hover{filter:brightness(1.15)}',
    '.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:34px;padding:0 14px;border:1px solid var(--defaultBorderColor,#393f45);border-radius:4px;background:var(--defaultBackgroundColor,#333);color:var(--defaultButtonTextColor,#eee);cursor:pointer;white-space:nowrap;text-decoration:none;transition:background .15s,border-color .15s}',
    '.btn:hover{background:var(--defaultHoverBackgroundColor,#444);border-color:var(--defaultHoverBorderColor,#5a6265)}.btn:disabled{opacity:.5;cursor:default}',
    '.btn.primary{background:var(--primaryBackgroundColor,#5d9cec);border-color:var(--primaryBorderColor,#5899eb);color:#fff}.btn.primary:hover{background:var(--primaryHoverBackgroundColor,#4b91ea)}',
    '.btn.danger{background:var(--dangerBackgroundColor,#f05050);border-color:var(--dangerBackgroundColor,#f05050);color:#fff}',
    '.btn.sm{min-height:28px;padding:0 10px;font-size:13px}',
    'input[type=text],input[type=number],select{height:35px;padding:0 10px;border:1px solid var(--line2);border-radius:4px;background:var(--input);color:var(--strong);outline:none;transition:border-color .15s,box-shadow .15s}',
    'input[type=text]:focus,input[type=number]:focus,select:focus{border-color:var(--inputFocusBorderColor,#66afe9);box-shadow:0 0 0 3px color-mix(in srgb,var(--inputFocusBorderColor,#66afe9) 25%,transparent)}',
    'select{-webkit-appearance:none;appearance:none;padding-right:32px;cursor:pointer;background-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%23909293%27 stroke-width=%272.4%27 stroke-linecap=%27round%27%3E%3Cpath d=%27M6 9l6 6 6-6%27/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;background-size:14px}',
    'select option{background:var(--modal);color:var(--strong)}',
    'input[type=checkbox]{width:16px;height:16px;accent-color:var(--acc);cursor:pointer;margin:0;vertical-align:middle}',
    '.flabel{display:block;margin-bottom:7px;font-size:12.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--strong)}',
    '.row{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end}.grow{flex:1;min-width:260px}',
    '.pills{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}',
    '.pill{display:inline-flex;align-items:center;gap:6px;padding:3px 6px 3px 11px;border:1px solid var(--line2);border-radius:14px;font-size:12.5px;color:var(--strong)}',
    '.pill button{width:20px;height:20px;display:grid;place-items:center;border:0;border-radius:50%;background:none;color:var(--muted);cursor:pointer}.pill button:hover{background:var(--hover);color:var(--strong)}',
    '.muted{color:var(--muted)}.strong{color:var(--strong)}.nowrap{white-space:nowrap}',
    '.code{display:flex;align-items:flex-start;gap:8px;padding:9px 8px 9px 12px;border:1px solid var(--line2);border-radius:4px;background:color-mix(in srgb,#000 25%,var(--bg))}',
    '.code code{flex:1;min-width:0;white-space:pre-wrap;overflow-wrap:anywhere;font:12.5px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--strong)}',
    '.copy{flex:none;width:30px;height:30px;display:grid;place-items:center;border:1px solid var(--line2);border-radius:4px;background:none;color:var(--muted);cursor:pointer}',
    '.copy:hover{color:var(--strong);border-color:var(--acc)}.copy.done{color:var(--ok);border-color:var(--ok)}',
    'code.inl{padding:1px 5px;border-radius:3px;background:color-mix(in srgb,#000 30%,var(--bg));font:12px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--strong)}',

    /* tables and pager (Sonarr look) */
    '.tw{overflow-x:auto}',
    '.tbl{width:100%;border-collapse:collapse}',
    '.tbl th{padding:8px;text-align:left;font-weight:700;font-size:13.5px;color:var(--strong);border-bottom:1px solid var(--line2);white-space:nowrap}',
    '.tbl td{padding:8px;border-top:1px solid var(--line);vertical-align:middle;line-height:1.45}',
    '.tbl tbody tr{transition:background .12s}.tbl tbody tr:hover>td{background:var(--hover)}.tbl tr.off td{opacity:.5}',
    '.tbl td.min,.tbl th.min{width:1%;white-space:nowrap}.tbl td.wrap{overflow-wrap:anywhere;min-width:200px}.tbl td.r,.tbl th.r{text-align:right}',
    '.tbl .sub{display:block;margin-top:2px;font-size:12px;color:var(--muted)}',
    '.tbl tr.clickable{cursor:pointer}.tbl tr.detail>td{border-top:0;padding:2px 8px 12px 46px;background:color-mix(in srgb,var(--hover) 50%,transparent)}',
    '.tbl td select{height:31px;font-size:13px;min-width:190px;max-width:290px}.tbl td input.ti{height:31px;font-size:13px;width:100%;min-width:170px}',
    '.st{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:50%}',
    '.st.ok{color:var(--ok);background:color-mix(in srgb,var(--ok) 16%,transparent)}.st.info{color:var(--acc);background:color-mix(in srgb,var(--acc) 16%,transparent)}',
    '.st.warn{color:var(--warn);background:color-mix(in srgb,var(--warn) 16%,transparent)}.st.mute{color:var(--muted);background:color-mix(in srgb,var(--muted) 16%,transparent)}',
    '.st.bad{color:var(--bad);background:color-mix(in srgb,var(--bad) 16%,transparent)}',
    '.det{margin:4px 0 0;padding-left:18px;color:var(--muted);font-size:13px}.det li{margin:2px 0}.det b{color:var(--txt);font-weight:500}',
    '.pager{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;flex-wrap:wrap;color:var(--muted);font-size:13px}',
    '.pager .ctl{display:flex;align-items:center;gap:2px}',
    '.pager button{width:32px;height:32px;display:grid;place-items:center;border:0;border-radius:4px;background:none;color:var(--txt);cursor:pointer}',
    '.pager button:hover:not(:disabled){background:var(--hover);color:var(--acc)}.pager button:disabled{opacity:.3;cursor:default}',
    '.pager .pg{padding:0 12px;color:var(--strong);font-weight:500;white-space:nowrap}',

    /* import page */
    '.cb{position:relative}.cb input{width:100%;padding-right:56px}',
    '.cb .chev{position:absolute;right:10px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none;display:flex}',
    '.cb .spin{position:absolute;right:30px;top:50%;margin-top:-7px}',
    '.lb{position:absolute;left:0;right:0;top:calc(100% + 4px);max-height:380px;overflow:auto;padding:4px 0;background:var(--modal);border:1px solid var(--line2);border-radius:4px;box-shadow:0 10px 30px rgba(0,0,0,.5);z-index:5}',
    '.op{display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer}.op .m{flex:1;min-width:0}',
    '.op .l{display:block;color:var(--strong);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.op .s{display:block;font-size:12px;color:var(--muted)}',
    '.op.on,.op:hover{background:var(--hover)}.op.sel .l{color:var(--acc)}',
    '.op .th{width:30px;height:45px;flex:none;object-fit:cover;border-radius:2px;background:var(--card)}',
    /* poster browser, laid out like Sonarr's series index (poster view) */
    '.pbrowse .legend{margin-bottom:16px}',
    '.pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(162px,1fr));gap:20px 18px}',
    '.pcard{position:relative;display:block;padding:0;border:0;background:var(--card);color:inherit;text-align:left;cursor:pointer;border-radius:4px;overflow:hidden;box-shadow:0 0 10px rgba(0,0,0,.35);transition:transform .2s cubic-bezier(.2,.8,.2,1),box-shadow .2s}',
    '.pcard:hover{transform:translateY(-3px);box-shadow:0 6px 18px rgba(0,0,0,.5)}.pcard:focus-visible{outline:2px solid var(--acc);outline-offset:2px}',
    '.pcard .pimg{display:block;position:relative;aspect-ratio:2/3;overflow:hidden;background:color-mix(in srgb,var(--card) 70%,#000)}',
    '.pcard .pimg img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}',
    '.pcard .pimg .ptxt{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:12px;text-align:center;font-size:15px;font-weight:600;color:var(--strong)}',
    '.pcard .pbadge{position:absolute;top:8px;right:8px;z-index:1;padding:0 7px;border-radius:2px;background:var(--badge);color:#fff;font-size:11.5px;font-weight:700;line-height:20px;box-shadow:0 1px 3px rgba(0,0,0,.5)}',
    '.pcard .pprog{display:block;height:5px;background:color-mix(in srgb,var(--txt) 15%,transparent)}.pcard .pprog i{display:block;height:100%;max-width:100%}',
    '.pprog .pc-c{background:#5d9cec}.pprog .pc-e{background:#27c24c}.pprog .pc-m{background:#f05050}.pprog .pc-u{background:#ffa500}',
    '.pcard .pmeta{display:block;padding:7px 9px 9px}.pcard .pt{display:block;color:var(--strong);font-weight:600;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.pcard .ps{display:block;color:var(--muted);font-size:12px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.shead{display:flex;gap:14px;align-items:center;margin:0 0 16px}.shead img{width:60px;height:90px;object-fit:cover;border-radius:3px;background:var(--card);box-shadow:0 0 8px rgba(0,0,0,.4)}',
    '.shead .t{font-size:21px;color:var(--strong);line-height:1.3}.shead .s{color:var(--muted);font-size:13px;margin-top:3px}',
    '.plist tr[data-pi]{cursor:pointer}.plist td.pk{cursor:pointer}.plist tr:hover td{background:var(--hover)}',
    '@media (max-width:640px){.pgrid{grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:14px}}',
    '.lb .none{padding:10px 12px;color:var(--muted)}.lb .grp{padding:8px 12px 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)}',
    '.summary{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:20px 0 10px;color:var(--muted)}.summary b{color:var(--strong)}',

    /* settings pages (Sonarr form layout) */
    '.secnav{display:flex;gap:4px;flex-wrap:wrap;margin:-4px 0 22px}',
    '.secnav a{padding:6px 12px;border-radius:4px;color:var(--txt);text-decoration:none;font-size:13.5px;font-weight:500}.secnav a:hover{background:var(--hover);color:var(--acc)}.secnav a.on{background:var(--sideAct);color:var(--acc)}',
    '.fg{display:flex;align-items:flex-start;margin-bottom:22px}',
    '.fg>.fl{flex:0 0 250px;padding:6px 20px 0 0;text-align:right;font-weight:700;color:var(--strong)}',
    '.fg>.fc{flex:1;min-width:0;max-width:860px}.fg .help{margin-top:6px;font-size:13px;line-height:1.55;color:var(--muted)}',
    '.fg .fc>.switch{margin-top:5px}',
    '@media (max-width:900px){.fg{flex-direction:column}.fg>.fl{flex:none;text-align:left;padding:0 0 8px}}',
    '.switch{position:relative;display:inline-block;width:44px;height:24px;flex:none;cursor:pointer;vertical-align:middle}',
    '.switch input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer;z-index:1}',
    '.switch span{position:absolute;inset:0;border-radius:999px;background:color-mix(in srgb,var(--txt) 16%,transparent);border:1px solid var(--line2);transition:background .2s}',
    '.switch span::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:var(--muted);transition:transform .2s cubic-bezier(.2,.8,.2,1),background .2s}',
    '.switch input:checked+span{background:color-mix(in srgb,var(--acc) 40%,#000);border-color:var(--acc)}.switch input:checked+span::after{transform:translateX(20px);background:#fff}',
    '.switch input:focus-visible+span{outline:2px solid var(--acc);outline-offset:2px}.switch input:disabled{cursor:not-allowed}.switch input:disabled+span{opacity:.45}',
    '.seg{display:inline-flex;flex-wrap:wrap;gap:2px;padding:3px;border:1px solid var(--line2);border-radius:4px;background:var(--input)}',
    '.seg button{min-height:29px;padding:0 13px;border:0;border-radius:3px;background:none;color:var(--txt);cursor:pointer;font-size:13.5px}',
    '.seg button:hover{color:var(--strong)}.seg button[aria-checked=true]{background:color-mix(in srgb,var(--acc) 30%,#000);color:#fff}',
    '.icons{display:flex;gap:10px;flex-wrap:wrap}',
    '.icn{width:64px;height:64px;display:grid;place-items:center;border:2px solid var(--line2);border-radius:6px;background:var(--input);cursor:pointer}',
    '.icn img{width:40px;height:40px;object-fit:contain}.icn.on{border-color:var(--acc);box-shadow:0 0 0 3px color-mix(in srgb,var(--acc) 25%,transparent)}.icn:hover{border-color:var(--acc)}',
    '.kv{display:grid;grid-template-columns:200px 1fr;gap:10px 20px;line-height:1.5}.kv dt{font-weight:700;color:var(--strong);text-align:right}.kv dd{margin:0}',
    '@media (max-width:700px){.kv{grid-template-columns:1fr}.kv dt{text-align:left}}',

    /* dialogs (confirm / progress) and the floating fallback button */
    '.dlgwrap{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:20px;background:var(--modalBackdropBackgroundColor,rgba(0,0,0,.6));z-index:10}',
    '.dlg{width:min(560px,100%);background:var(--modal);border-radius:6px;box-shadow:0 12px 40px rgba(0,0,0,.6);animation:fadein .18s ease}',
    '.dlg .dh{padding:15px 24px;border-bottom:1px solid var(--line2);font-size:18px;color:var(--strong)}',
    '.dlg .db{padding:22px 24px;line-height:1.6}.dlg .db p{margin:0 0 10px}.dlg .db p:last-child{margin:0}',
    '.dlg .df{display:flex;justify-content:flex-end;gap:10px;padding:14px 24px;border-top:1px solid var(--line2)}',
    '.prog{height:8px;margin-top:14px;border-radius:4px;overflow:hidden;background:var(--input)}.bar{height:100%;width:0;background:var(--acc);transition:width .35s ease}',
    '.fab{position:fixed;right:22px;bottom:22px;width:48px;height:48px;border:0;border-radius:50%;background:var(--acc);color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.45);cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2}',
    '@media (max-width:760px){.pc{padding:14px}.tbtn{min-width:52px;padding:4px 4px 0}.tbtn span{font-size:10.5px}}'
  ].join('\n');

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

  function reload() { PAGE = null; render(); }
  var STATE_LBL = {
    needs: '<span class="lbl info">Needs import</span>', review: '<span class="lbl warn">Needs review</span>',
    done: '<span class="lbl ok">Imported</span>', covered: '<span class="lbl">In library</span>'
  };

  // ================================================================== Import
  var IMP = null;
  function pageImport(route, pc) {
    var q = route.q;
    toolbar([{ id: 'scan', label: 'Scan Folders', icon: 'refresh', title: 'Scan the download folders again', onClick: function () { refreshCatalog(true); } }, '|',
             { id: 'imp', label: 'Import', icon: 'import', disabled: true, title: 'Import the selected files', onClick: confirmImport }],
            [{ note: true }, { html: '<div class="tcustom" id="tbCustom"></div>' }]);
    pc.innerHTML = '<div class="pc-inner"><div class="row">' +
      '<div class="grow" style="flex:2"><span class="flabel" id="lPack">Pack</span><div id="cPack"></div></div>' +
      '<div class="grow"><span class="flabel" id="lSeries">Series</span><div id="cSeries"></div></div></div>' +
      '<div class="pills" id="pills"></div><div id="ist" style="margin-top:18px"></div>' +
      '<div id="ires"></div><div id="ibrowse">' + skeleton(3) + '</div></div>';
    IMP = { pack: null, preview: null, rows: [], season: q.season != null && q.season !== '' ? +q.season : null, seriesId: q.seriesId ? +q.seriesId : null,
            slug: q.series || null, missingOnly: !!q.missing, wantPack: q.pack || null, dl: q.dl || null, seriesLocked: false,
            browse: { mode: 'needs', q: '' }, autoPick: false };
    IMP.packCombo = combo($('#cPack'), {
      placeholder: 'Search packs...', label: 'lPack', emptyText: 'No packs need importing. Type to search finished packs.',
      defaultFilter: function (p) {
        if (IMP.missingOnly && p.item.state !== 'needs') return false;
        return p.item.state === 'needs' || p.item.state === 'review' || p.value === IMP.packCombo.value();
      },
      footer: function (hidden) { return hidden ? '<div class="none">' + plural(hidden, 'finished pack') + ' hidden. Type to search them.</div>' : ''; },
      onSelect: function (v, p) { selectPack(p.item); }
    });
    IMP.seriesCombo = combo($('#cSeries'), {
      placeholder: 'Search series...', label: 'lSeries', emptyText: 'No series',
      onSelect: function () { IMP.seriesLocked = true; renderPills(); if (IMP.pack) runPreview(); else fillPacks(); }
    });
    IMP.seriesCombo.loading('Loading series...');
    loadSeries().then(function (list) {
      IMP.seriesCombo.loading(null);
      IMP.seriesCombo.set(list.map(function (s) { return { value: s.id, label: s.title, sub: [s.year || '', s.network].filter(Boolean).join(' · '), img: s.poster ? posterUrl(s.id) : '', search: s.title + ' ' + (s.year || '') + ' ' + (s.network || '') }; }));
      if (IMP.slug) { var s = list.find(function (x) { return x.slug === IMP.slug; }); if (s) IMP.seriesId = s.id; }
      if (IMP.seriesId) { IMP.seriesCombo.select(IMP.seriesId, true); IMP.seriesLocked = true; }
      renderPills(); fillPacks();
    }).catch(function (e) { $('#ist').innerHTML = alertBox('bad', esc(e.message)); });
    refreshCatalog(false);
  }
  function seriesTitle(id) { var s = (DATA.series || []).find(function (x) { return x.id === id; }); return s ? s.title : ''; }
  function renderPills() {
    var f = $('#pills'); if (!f) return;
    var h = '', sid = IMP.seriesCombo.value();
    if (sid && IMP.seriesLocked) h += '<span class="pill">Series: ' + esc(seriesTitle(sid)) + '<button type="button" data-clear="series" aria-label="Show every series">' + ico('x', 12) + '</button></span>';
    if (IMP.season != null) h += '<span class="pill">' + (IMP.season ? 'Season ' + IMP.season : 'Specials') + ' only<button type="button" data-clear="season" aria-label="Show every season">' + ico('x', 12) + '</button></span>';
    if (IMP.missingOnly) h += '<span class="pill">Packs that fill missing episodes<button type="button" data-clear="missing" aria-label="Show all packs">' + ico('x', 12) + '</button></span>';
    f.innerHTML = h;
    each(f.querySelectorAll('[data-clear]'), function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-clear');
        if (k === 'series') { IMP.seriesLocked = false; IMP.seriesCombo.select(null, true); }
        if (k === 'season') IMP.season = null;
        if (k === 'missing') IMP.missingOnly = false;
        renderPills(); fillPacks(); if (IMP.preview) renderTable();
      });
    });
  }
  function refreshCatalog(force) {
    var st = $('#ist');
    IMP.packCombo.loading('Scanning your download folders...');
    if (force) { st.innerHTML = alertBox('busy', 'Scanning your download folders and checking them against the library...'); setTool('scan', { spin: true, disabled: true }); }
    function step(u, tries) {
      return api(u).then(function (c) {
        DATA.catalog = c; DATA.catalogAt = c.building ? 0 : Date.now();
        if (c.building && (!c.items.length || force) && tries < 90) {
          st.innerHTML = alertBox('busy', 'Scanning your download folders and checking them against the library...');
          return sleep(2000).then(function () { return step('api/catalog?all=1&nowait=1', tries + 1); });
        }
        IMP.packCombo.loading(null); setTool('scan', { spin: false, disabled: false, icon: 'refresh' });
        if (force || /busy/.test(st.innerHTML)) st.innerHTML = '';
        if (force) note('Scan finished');
        fillPacks();
        if (IMP.wantPack && !IMP.pack) {
          var it = c.items.find(function (x) { return x.path === IMP.wantPack; });
          if (it) { IMP.packCombo.select(it.path, true); selectPack(it); }
          IMP.wantPack = null;
        }
        return c;
      });
    }
    return step('api/catalog?all=1&nowait=1' + (force ? '&refresh=1' : ''), 0).catch(function (e) {
      IMP.packCombo.loading(null); setTool('scan', { spin: false, disabled: false, icon: 'refresh' }); st.innerHTML = alertBox('bad', esc(e.message));
    });
  }
  function fillPacks() {
    if (!IMP || !DATA.catalog) return;
    var sid = IMP.seriesLocked ? IMP.seriesCombo.value() : null, season = IMP.season;
    var items = DATA.catalog.items.filter(function (x) {
      if (sid && x.series_id && x.series_id !== sid) return false;
      if (season != null && (x.season_list || []).indexOf(season) === -1) return false;
      return true;
    });
    var order = { needs: 0, review: 1, done: 2, covered: 3 };
    items.sort(function (a, b) { return (order[a.state] - order[b.state]) || a.name.localeCompare(b.name); });
    IMP.packCombo.set(items.map(function (x) {
      var sub = [x.series_title || 'Series unknown', x.seasons, plural(x.files, 'file')];
      if (x.state === 'needs') sub.push(plural(x.missing, 'missing episode'));
      if (x.imported_at) sub.push('imported ' + ago(x.imported_at));
      return { value: x.path, label: x.name, sub: sub.join(' · '), chip: STATE_LBL[x.state], item: x, search: x.name + ' ' + (x.series_title || '') + ' ' + x.seasons };
    }));
    var needs = items.filter(function (x) { return x.state === 'needs' || x.state === 'review'; }).length;
    drawBrowse();
  }
  // ------------------------------------------------------------ series posters (Sonarr's series index, poster view)
  function actionable(x) {
    if (x.state !== 'needs' && x.state !== 'review') return false;
    if (IMP.missingOnly && x.state !== 'needs') return false;
    return IMP.season == null || (x.season_list || []).indexOf(IMP.season) !== -1;
  }
  function seriesMeta(s) { return [s.year || '', s.network].filter(Boolean).join(' · '); }
  function posterCard(s, n) {
    var pct = s.episodes ? Math.min(100, Math.round(100 * s.files / s.episodes)) : 0;
    var cls = 'pc-' + (s.episodes && s.files >= s.episodes ? (s.status === 'ended' ? 'e' : 'c') : (s.monitored ? 'm' : 'u'));
    return '<button type="button" class="pcard" data-sid="' + s.id + '" aria-label="' + esc(s.title + (n ? ', ' + plural(n, 'pack') + ' to import' : '')) + '">' +
      (n ? '<span class="pbadge">' + plural(n, 'pack') + '</span>' : '') +
      '<span class="pimg"><span class="ptxt">' + esc(s.title) + '</span>' + (s.poster ? '<img loading="lazy" alt="" src="' + esc(posterUrl(s.id)) + '">' : '') + '</span>' +
      '<span class="pprog" title="' + s.files + ' of ' + s.episodes + ' episodes on disk"><i class="' + cls + '" style="width:' + pct + '%"></i></span>' +
      '<span class="pmeta"><span class="pt">' + esc(s.title) + '</span><span class="ps">' + esc(seriesMeta(s) || ' ') + '</span></span></button>';
  }
  function drawBrowse() {
    var el = $('#ibrowse'); if (!el || !IMP) return;
    if (IMP.pack) { el.innerHTML = ''; el.removeAttribute('data-v'); clearBrowseTools(); return; }
    if (!DATA.catalog || !DATA.series) return;
    var sid = IMP.seriesLocked ? IMP.seriesCombo.value() : null;
    if (sid) { clearBrowseTools(); return drawSeriesPacks(el, sid); }
    var cnt = {}, unknown = 0;
    DATA.catalog.items.forEach(function (x) { if (!actionable(x)) return; if (x.series_id) cnt[x.series_id] = (cnt[x.series_id] || 0) + 1; else unknown++; });
    var waiting = DATA.series.filter(function (s) { return cnt[s.id]; });
    var B = IMP.browse, tb = $('#tbCustom');
    if (tb && !tb.firstChild) {                    // view switch and filter live in the toolbar, like Sonarr's
      tb.innerHTML = '<div class="seg" role="radiogroup" aria-label="Which series"><button type="button" role="radio" data-bm="needs"></button><button type="button" role="radio" data-bm="all"></button></div>' +
        '<input type="text" id="pbQ" placeholder="Filter series" aria-label="Filter series" autocomplete="off" spellcheck="false">';
      $('#pbQ').value = B.q;
      $('#pbQ').addEventListener('input', function () { B.q = this.value; drawBrowse(); });
      each(tb.querySelectorAll('[data-bm]'), function (b) { b.addEventListener('click', function () { B.mode = b.getAttribute('data-bm'); drawBrowse(); }); });
    }
    if (el.getAttribute('data-v') !== 'grid') {
      el.setAttribute('data-v', 'grid');
      el.className = 'pbrowse';
      el.innerHTML = '<h2 class="legend" id="pbTitle"></h2><div id="pbNote"></div><div class="pgrid" id="pbGrid"></div>';
      $('#pbGrid').addEventListener('error', function (e) { if (e.target.tagName === 'IMG') e.target.remove(); }, true);
      $('#pbGrid').addEventListener('click', function (e) {
        var c = e.target.closest('.pcard'); if (!c) return;
        IMP.autoPick = true; IMP.seriesCombo.select(+c.getAttribute('data-sid'), true); IMP.seriesLocked = true; renderPills(); fillPacks();
      });
    }
    var mode = B.mode === 'all' ? 'all' : 'needs';
    each(tb ? tb.querySelectorAll('[data-bm]') : [], function (b) {
      var all = b.getAttribute('data-bm') === 'all';
      b.textContent = all ? 'All series (' + DATA.series.length + ')' : 'Needs import (' + waiting.length + ')';
      b.setAttribute('aria-checked', String((all ? 'all' : 'needs') === mode));
    });
    $('#pbTitle').textContent = mode === 'all' ? 'All Series' : 'Series With Packs to Import';
    var list = mode === 'all' ? DATA.series : waiting, qq = B.q.trim().toLowerCase();
    if (qq) list = list.filter(function (s) { return (s.title + ' ' + (s.year || '') + ' ' + (s.network || '')).toLowerCase().indexOf(qq) !== -1; });
    var note = '';
    if (DATA.catalog.building && !waiting.length) {
      var ist = $('#ist'); note = ist && /alert busy/.test(ist.innerHTML) ? '' : alertBox('busy', 'Checking your download folders against the library...');
      if (!IMP.recheck) IMP.recheck = setTimeout(function () { IMP.recheck = null; if ($('#ibrowse')) refreshCatalog(false); }, 3000);
    } else if (mode === 'needs' && !waiting.length) note = alertBox('ok', 'Nothing needs importing right now. Pick <b>All series</b> to browse your library, or type in the Pack box to run a finished pack again.');
    if (unknown) note += alertBox('warn', plural(unknown, 'pack') + ' could not be matched to a series. Find ' + (unknown === 1 ? 'it' : 'them') + ' in the Pack box, marked Needs review.');
    $('#pbNote').innerHTML = note;
    var sig = mode + '|' + qq + '|' + list.map(function (s) { return s.id + ':' + (cnt[s.id] || 0); }).join(',');
    var g = $('#pbGrid'); if (g.getAttribute('data-sig') === sig) return;
    g.setAttribute('data-sig', sig);
    g.innerHTML = list.length ? list.map(function (s) { return posterCard(s, cnt[s.id]); }).join('')
      : (qq ? '<div class="muted">No series match "' + esc(B.q) + '".</div>' : '');
  }
  function clearBrowseTools() { var tb = $('#tbCustom'); if (tb) tb.innerHTML = ''; }
  function drawSeriesPacks(el, sid) {
    var s = (DATA.series || []).find(function (x) { return x.id === sid; }) || { id: sid, title: seriesTitle(sid) };
    var order = { needs: 0, review: 1, done: 2, covered: 3 };
    var items = DATA.catalog.items.filter(function (x) {
      return x.series_id === sid && (IMP.season == null || (x.season_list || []).indexOf(IMP.season) !== -1);
    }).sort(function (a, b) { return (order[a.state] - order[b.state]) || a.name.localeCompare(b.name); });
    var act = items.filter(actionable);
    if (IMP.autoPick && act.length === 1) { IMP.autoPick = false; IMP.packCombo.select(act[0].path, true); selectPack(act[0]); return; }
    IMP.autoPick = false;
    el.setAttribute('data-v', 'series');
    var h = '<div class="shead">' + (s.poster ? '<img alt="" src="' + esc(posterUrl(s.id)) + '">' : '') +
      '<div><div class="t">' + esc(s.title) + '</div><div class="s">' + esc([seriesMeta(s), s.episodes ? s.files + ' of ' + s.episodes + ' episodes on disk' : ''].filter(Boolean).join(' · ')) + '</div></div></div>';
    if (!items.length) h += emptyState('layers', 'No packs for this series', 'Nothing in your download folders belongs to ' + esc(s.title) + (IMP.season != null ? ' for this season' : '') + '.');
    else {
      h += '<div class="tw"><table class="tbl plist"><thead><tr><th>Pack</th><th class="min">Seasons</th><th class="min r">Files</th><th class="min r">Missing</th><th class="min">State</th></tr></thead><tbody>' +
        items.map(function (x, i) {
          return '<tr data-pi="' + i + '" tabindex="0"><td class="pk wrap strong">' + esc(x.name) + '</td><td class="min">' + esc(x.seasons || '') + '</td><td class="min r">' + (x.files || 0) +
            '</td><td class="min r">' + (x.state === 'needs' ? (x.missing || 0) : '') + '</td><td class="min">' + (STATE_LBL[x.state] || '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    el.innerHTML = h;
    each(el.querySelectorAll('tr[data-pi]'), function (tr) {
      function go() { var it = items[+tr.getAttribute('data-pi')]; IMP.packCombo.select(it.path, true); selectPack(it); }
      tr.addEventListener('click', go);
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }
  function selectPack(item) {
    IMP.pack = item;
    if (!IMP.seriesLocked && item.series_id) IMP.seriesCombo.select(item.series_id, true);
    runPreview();
  }
  function runPreview() {
    var item = IMP.pack; if (!item) return;
    var st = $('#ist'), res = $('#ires'), token = {};
    IMP.preview = null; IMP.rows = []; IMP.token = token; updateImportButton();
    drawBrowse();
    st.innerHTML = alertBox('busy', 'Matching ' + plural(item.files, 'file') + ' in <b>' + esc(item.name) + '</b> against Sonarr...');
    res.innerHTML = skeleton(8);
    api('api/preview', { pack: item.path, series_id: IMP.seriesCombo.value() || null }).then(function (d) {
      if (IMP.token !== token) return;
      IMP.preview = d;
      if (!IMP.seriesCombo.value()) IMP.seriesCombo.select(d.series.id, true);
      var rows = [];
      d.matched.forEach(function (m) {
        rows.push({ file: m.file, src: m.src, rel: m.rel, episodeId: m.episodeId, episodeIds: m.episodeIds, ep_to: m.ep_to, parts: m.parts,
          title: m.title, season: m.season, confidence: m.confidence, review: m.review, reasons: m.reasons, notes: m.notes,
          method: m.method, library: m.library, minutes: m.minutes, manual: false, include: m.library !== 'linked' && m.library !== 'has_file' });
      });
      d.unmatched.forEach(function (u) {
        var sp = u.special_title;
        rows.push({ file: u.file, src: u.src, rel: u.rel, episodeId: sp ? 'plex-special' : null, title: sp || '', confidence: 0, manual: false, reason: u.reason, include: !!sp, season: null });
      });
      IMP.rows = rows;
      var inLib = rows.filter(function (r) { return r.library === 'linked'; }).length;
      if (!d.matched.length) st.innerHTML = alertBox('warn', 'Fixarr could not match any file automatically. Pick the episodes in the table below.');
      else if (inLib === rows.length && rows.length) st.innerHTML = alertBox('ok', 'Every file in this pack is already your library\'s file. There is nothing to import.');
      else if (item.state === 'done') st.innerHTML = alertBox('ok', 'This pack was imported' + (item.imported_at ? ' ' + ago(item.imported_at) : '') + '. Running it again re-checks every file; tick any file you want imported again.');
      else if (item.state === 'covered') st.innerHTML = alertBox('info', 'Everything in this pack is already in your library from another release. Tick a file to import it anyway.');
      else st.innerHTML = '';
      renderTable();
    }).catch(function (e) { if (IMP.token !== token) return; res.innerHTML = ''; st.innerHTML = alertBox('bad', esc(e.message)); });
  }
  function epOptions(eps, selId) {
    var h = '<option value="">(not imported)</option><option value="plex-special"' + (selId === 'plex-special' ? ' selected' : '') + '>Special for the media server (Season 00)</option>', cur = null;
    eps.forEach(function (e) {
      if (e.season !== cur) { if (cur !== null) h += '</optgroup>'; cur = e.season; h += '<optgroup label="' + (e.season ? 'Season ' + e.season : 'Specials') + '">'; }
      h += '<option value="' + e.id + '"' + (e.id === selId ? ' selected' : '') + '>S' + pad(e.season) + 'E' + pad(e.episode) + ' · ' + esc(e.title || '') + (e.hasFile ? ' ✓' : '') + '</option>';
    });
    return h + (cur !== null ? '</optgroup>' : '');
  }
  function matchLbl(r) {
    var info = esc((r.reasons || []).concat(r.notes || []).join('\n'));
    if (r.episodeId === 'plex-special') return { h: '<span class="lbl plex" title="Placed straight into Season 00 for Plex, Emby or Jellyfin">Season 00</span>', p: '' };
    if (r.manual) return { h: '<span class="lbl info">Manual</span>', p: '100%' };
    if (!r.episodeId) return { h: '<span class="lbl bad" title="' + esc(r.reason || '') + '">No match</span>', p: '' };
    if (r.method === 'remembered') return { h: '<span class="lbl ok" title="' + info + '">Remembered</span>', p: '100%' };
    if (r.review) return { h: '<button type="button" class="lbl warn" data-accept title="' + info + '\n\nClick to accept this match.">Review</button>', p: r.confidence ? r.confidence + '%' : '' };
    if (r.confidence === 100) return { h: '<span class="lbl ok" title="' + info + '">Exact</span>', p: '100%' };
    return { h: '<span class="lbl info" title="' + info + '">Close</span>', p: r.confidence ? r.confidence + '%' : '' };
  }
  function importable(r) { return r.include && r.episodeId && (r.episodeId === 'plex-special' || !r.review || r.manual); }
  function visibleRows() {
    return IMP.rows.map(function (r, i) { return i; }).filter(function (i) { var r = IMP.rows[i]; return IMP.season == null || r.season === IMP.season || r.season == null; });
  }
  function renderTable() {
    var d = IMP.preview; if (!d) return;
    var idx = visibleRows(), rows = idx.map(function (i) { return IMP.rows[i]; });
    var nOk = rows.filter(function (r) { return r.episodeId && r.episodeId !== 'plex-special' && !r.review; }).length;
    var nRev = rows.filter(function (r) { return r.review && !r.manual; }).length;
    var nLib = rows.filter(function (r) { return r.library === 'linked'; }).length, nNo = rows.filter(function (r) { return !r.episodeId; }).length;
    var hidden = IMP.rows.length - rows.length;
    var h = '<div class="summary"><span><b>' + rows.length + '</b> ' + (rows.length === 1 ? 'file' : 'files') + ' in <b>' + esc(IMP.pack.name) + '</b> for ' + seriesLink(d.series.slug, d.series.title) + '</span>' +
      (nOk ? '<span class="lbl ok">' + nOk + ' matched</span>' : '') + (nRev ? '<span class="lbl warn">' + nRev + ' need review</span>' : '') +
      (nNo ? '<span class="lbl bad">' + nNo + ' no match</span>' : '') + (nLib ? '<span class="lbl line">' + nLib + ' already in library</span>' : '') +
      (hidden ? '<span>' + plural(hidden, 'file') + ' from other seasons hidden</span>' : '') + '</div>' +
      '<div class="tw"><table class="tbl"><thead><tr><th class="min"><input type="checkbox" id="all" aria-label="Select every importable file"></th><th>File</th>' +
      '<th>Episode</th><th>Title</th><th class="min r">Score</th><th class="min">Match</th><th class="min">Library</th></tr></thead><tbody>';
    idx.forEach(function (i) {
      var r = IMP.rows[i], b = matchLbl(r);
      var sub = r.parts ? '<span class="sub">+ ' + plural(r.parts.length - 1, 'more part') + ', joined into one file on import</span>' : (r.ep_to ? '<span class="sub">Double episode, through E' + pad(r.ep_to) + '</span>' : '');
      if (r.minutes) sub += '<span class="sub">' + Math.round(r.minutes) + ' min</span>';
      var lib = r.library === 'linked' ? '<span class="lbl line" title="The library already uses this exact file">In library</span>'
        : r.library === 'has_file' ? '<span class="lbl line" title="The library has a different file for this episode; Sonarr replaces it only if this one is an upgrade">Has a file</span>' : '';
      h += '<tr data-i="' + i + '"' + (r.include ? '' : ' class="off"') + '><td class="min"><input type="checkbox" data-inc' + (r.include ? ' checked' : '') + ' aria-label="Import ' + esc(r.file) + '"></td>' +
        '<td class="wrap"><span class="strong">' + esc(r.file) + '</span>' + sub + '</td>' +
        '<td><select data-ep aria-label="Episode for ' + esc(r.file) + '">' + epOptions(d.episodes, r.episodeId) + '</select></td>' +
        '<td><input class="ti" type="text" data-ti value="' + esc(r.title || '') + '" placeholder="(no title)" aria-label="Title"></td>' +
        '<td class="min r muted" data-sc>' + (b.p || '-') + '</td><td class="min" data-mt>' + b.h + '</td><td class="min">' + lib + '</td></tr>';
    });
    $('#ires').innerHTML = h + '</tbody></table></div>';
    wireLinks($('#ires'));
    each($('#ires').querySelectorAll('tbody tr'), function (tr) {
      var r = IMP.rows[+tr.getAttribute('data-i')];
      tr.querySelector('[data-inc]').addEventListener('change', function (e) { r.include = e.target.checked; tr.classList.toggle('off', !r.include); updateImportButton(); });
      tr.querySelector('[data-ep]').addEventListener('change', function (e) {
        var raw = e.target.value, id = raw ? (raw === 'plex-special' ? 'plex-special' : +raw) : null;
        r.episodeId = id; r.episodeIds = null; r.changed = true; r.manual = !!(id && id !== 'plex-special'); r.include = !!id; r.library = null;
        if (id && id !== 'plex-special') { var ep = d.episodes.find(function (x) { return x.id === id; }); r.title = ep ? (ep.title || '') : ''; tr.querySelector('[data-ti]').value = r.title; r.season = ep ? ep.season : null; }
        tr.querySelector('[data-inc]').checked = r.include; tr.classList.toggle('off', !r.include);
        var b2 = matchLbl(r); tr.querySelector('[data-sc]').textContent = b2.p || '-'; tr.querySelector('[data-mt]').innerHTML = b2.h; wireAccept(tr, r);
        updateImportButton();
      });
      tr.querySelector('[data-ti]').addEventListener('input', function (e) { r.title = e.target.value; });
      wireAccept(tr, r);
    });
    $('#all').addEventListener('change', function (e) { idx.forEach(function (i) { var r = IMP.rows[i]; if (r.episodeId) r.include = e.target.checked; }); renderTable(); });
    updateImportButton();
  }
  function wireAccept(tr, r) {
    var a = tr.querySelector('[data-accept]');
    if (a) a.addEventListener('click', function () {
      r.manual = true; r.include = true; tr.querySelector('[data-inc]').checked = true; tr.classList.remove('off');
      tr.querySelector('[data-mt]').innerHTML = matchLbl(r).h; updateImportButton();
    });
  }
  function updateImportButton() {
    var n = IMP && IMP.preview ? visibleRows().filter(function (i) { return importable(IMP.rows[i]); }).length : 0;
    setTool('imp', { disabled: !n, label: n ? 'Import ' + n : 'Import', hot: n > 0 });
  }
  function payload(r) {
    var a = { src: r.src, episodeId: r.episodeId, title: r.title || null };
    if (!r.changed) { if (r.parts) a.parts = r.parts; if (r.episodeIds && r.episodeIds.length > 1) a.episodeIds = r.episodeIds; }
    if (r.manual && r.changed) a.remember = true;
    return a;
  }
  function confirmImport() {
    if (!IMP || !IMP.preview) return;
    var as = visibleRows().map(function (i) { return IMP.rows[i]; }).filter(importable).map(payload);
    if (!as.length) return;
    var nj = as.filter(function (a) { return a.parts && a.parts.length > 1; }).length, nr = as.filter(function (a) { return a.remember; }).length;
    dialog('Import into ' + IMP.preview.series.title, '<p>Import <b>' + plural(as.length, 'file') + '</b> from <b>' + esc(IMP.pack.name) + '</b>?</p>' +
      '<p class="muted">Files are hardlinked, so the torrent keeps seeding and no extra space is used.' +
      (nj ? ' ' + plural(nj, 'multi-part episode') + ' will be joined into a new file, which uses extra space.' : '') +
      (nr ? ' Your ' + plural(nr, 'manual match', 'manual matches') + ' will be remembered for next time.' : '') +
      ' Every episode is checked afterwards, and the import can be undone from History.</p>', 'Import').then(function (ok) { if (ok) runImport(as); });
  }
  function runImport(as) {
    busy = true;
    var pd = progressDialog('Importing into ' + IMP.preview.series.title);
    var body = { series_id: IMP.preview.series.id, pack: IMP.pack.path, assignments: as };
    if (IMP.dl) body.download_id = IMP.dl;
    api('api/import', body).then(function (j) {
      function next() { return sleep(1200).then(function () { return api('api/import/' + j.job); }).then(function (s) { if (s.step) pd.step(s.step + '...'); return s.done ? s : next(); }); }
      return next();
    }).then(function (s) {
      busy = false; pd.done();
      var d = s.result || {};
      if (d.error) throw new Error(d.error);
      showResult(d); DATA.catalogAt = 0; loadOverview(); refreshCatalog(false);
    }).catch(function (e) { busy = false; pd.done(); $('#ist').innerHTML = alertBox('bad', esc(e.message)); });
  }
  function showResult(d) {
    IMP.pack = null; IMP.preview = null; IMP.packCombo.select(null, true); updateImportButton();
    var ok = d.status === 'completed';
    var list = function (items, title) {
      return items && items.length ? '<div class="fs"><h3 class="legend" style="font-size:17px">' + title + '</h3><ul class="det">' + items.slice(0, 40).map(function (x) {
        return '<li><b>' + esc(x.episode) + '</b> (' + esc(x.file) + '): ' + esc(x.reason) + '</li>'; }).join('') + '</ul></div>' : '';
    };
    $('#ist').innerHTML = alertBox(d.imported ? (ok ? 'ok' : 'warn') : 'bad',
      '<b>' + (d.imported ? (ok ? 'Import complete.' : 'Imported with a few gaps.') : 'Nothing was imported.') + '</b> ' +
      (d.imported ? plural(d.imported, 'file') + ' landed in ' + esc(d.series) + ' and ' + (d.imported === 1 ? 'was' : 'were') + ' checked.' : esc(d.message || '')) +
      (d.joined ? ' ' + plural(d.joined, 'multi-part episode') + ' joined.' : '') + (d.plex ? ' ' + plural(d.plex, 'special') + ' placed in Season 00.' : '') +
      (d.history_id ? ' <a href="' + routeHref('history') + '" data-go="history">Open History</a> to undo it.' : ''));
    $('#ires').innerHTML = list(d.skipped, 'Kept the library\'s file') + list(d.failed, 'Did not land');
    wireLinks($('#ist'));
  }

  // ================================================================== Activity
  var KIND = { cleared: ['ok', 'check'], imported: ['info', 'import'], review: ['warn', 'alert'], audit: ['mute', 'audit'], undo: ['warn', 'undo'], webhook: ['mute', 'swap'], relink: ['ok', 'link'] };
  function pageActivity(route, pc) {
    var pg = 1;
    toolbar([{ id: 'check', label: 'Check Now', icon: 'refresh', title: 'Check Sonarr\'s queue for stuck downloads now', onClick: checkNow }], [{ note: true }]);
    pc.innerHTML = '<div class="pc-inner" id="act">' + skeleton(8) + '</div>';
    function checkNow() {
      setTool('check', { spin: true, disabled: true });
      api('api/resolve', {}).then(function () {
        var t = poll(function () {
          api('api/activity?page=1&pageSize=25').then(function (a) {
            if (a.resolver.running) return;
            clearInterval(t); setTool('check', { spin: false, disabled: false, icon: 'refresh' }); note('Checked just now');
            pg = 1; draw(a); loadOverview(); DATA.queueAt = 0;
          });
        }, 1500);
      }).catch(function (e) { setTool('check', { spin: false, disabled: false, icon: 'refresh' }); note(e.message, true); });
    }
    function load() { return api('api/activity?page=' + pg + '&pageSize=25').then(draw).catch(function (e) { $('#act').innerHTML = alertBox('bad', esc(e.message)); }); }
    function draw(a) {
      var s = settings(), waiting = a.resolver.downloads || [], log = a.log;
      var auto = s.auto_import || s.auto_clear;
      var h = alertBox('info', auto ? '<b>Auto mode is on.</b> When Sonarr gets stuck on a download, Fixarr ' +
          [s.auto_import ? 'imports it when every file matches confidently' : '', s.auto_clear ? 'clears it from Sonarr\'s queue when everything is already in your library' : ''].filter(Boolean).join(' and ') +
          '. Torrents keep seeding either way.' + (a.resolver.at ? ' Last checked ' + ago(a.resolver.at) + '.' : '') + ' <a href="' + routeHref('settings', 'general') + '" data-go="settings/general">Change this in Settings</a>.'
        : '<b>Auto mode is off.</b> Fixarr only lists stuck downloads. <a href="' + routeHref('settings', 'general') + '" data-go="settings/general">Turn it on in Settings</a> to let Fixarr handle them by itself.');
      h += '<div class="fs"><h2 class="legend">Waiting for You' + (waiting.length ? ' <span class="lbl warn">' + waiting.length + '</span>' : '') + '</h2>';
      if (!waiting.length) h += alertBox('ok', 'Nothing is waiting. Every stuck download has been handled.');
      else {
        h += '<div class="tw"><table class="tbl"><thead><tr><th class="min"></th><th>Series</th><th>Download</th><th>What Fixarr found</th><th class="min"></th></tr></thead><tbody>';
        waiting.forEach(function (d, i) {
          var p = d.plan || {};
          h += '<tr><td class="min"><span class="st warn">' + ico('alert', 14) + '</span></td><td class="nowrap strong">' + esc(d.series || 'Unknown series') + '</td>' +
            '<td class="wrap">' + esc(d.title) + '</td><td>' + esc(p.text || 'Needs a look') + '</td>' +
            '<td class="min">' + (p.pack ? '<button class="btn sm primary" type="button" data-rev="' + i + '">Review</button>' : '') + '</td></tr>';
        });
        h += '</tbody></table></div>';
      }
      h += '</div><div class="fs"><h2 class="legend">Recently Handled</h2>';
      if (!log.total) h += emptyState('activity', 'Nothing yet', 'Everything Fixarr does by itself is listed here.');
      else {
        h += '<div class="tw"><table class="tbl"><thead><tr><th class="min"></th><th>Series</th><th>What happened</th><th class="min">When</th><th class="min"></th></tr></thead><tbody>';
        log.records.forEach(function (l) {
          var k = KIND[l.kind] || ['mute', 'info'], m = /^([^:]{1,90}):\s(.+)$/.exec(l.text || ''), series = m ? m[1] : (l.kind === 'webhook' ? 'Sonarr' : ''), text = m ? m[2] : l.text;
          text = text.charAt(0).toUpperCase() + text.slice(1);
          h += '<tr><td class="min"><span class="st ' + k[0] + '">' + ico(k[1], 14) + '</span></td><td class="nowrap strong">' + (l.slug ? seriesLink(l.slug, series) : esc(series)) + '</td>' +
            '<td>' + esc(text) + '</td><td class="min muted" title="' + esc(when(l.at)) + '">' + ago(l.at) + '</td>' +
            '<td class="min">' + (l.history_id ? '<a href="' + routeHref('history') + '" data-go="history">History</a>' : '') + '</td></tr>';
        });
        h += '</tbody></table></div>' + pagerHTML(log);
      }
      $('#act').innerHTML = h + '</div>';
      wireLinks($('#act'));
      wirePager($('#act'), function (n) { pg = n; load().then(function () { $('#pc').scrollTop = 0; }); });
      each($('#act').querySelectorAll('[data-rev]'), function (b) {
        b.addEventListener('click', function () { var d = waiting[+b.getAttribute('data-rev')]; go('import', '', { pack: d.plan.pack, seriesId: d.plan.series_id || d.series_id, dl: d.download_id }); });
      });
      if (a.resolver.running) { setTool('check', { spin: true, disabled: true }); setTimeout(function () { if (PAGE && PAGE.route.page === 'activity') load(); }, 2000); }
      else setTool('check', { spin: false, disabled: false, icon: 'refresh' });
    }
    withOverview(load);
  }

  // ================================================================== History
  function pageHistory(route, pc) {
    var pg = 1, open = {};
    toolbar([{ id: 'ref', label: 'Refresh', icon: 'refresh', onClick: function () { load().then(function () { note('Updated'); }); } }], [{ note: true }]);
    pc.innerHTML = '<div class="pc-inner" id="hist">' + skeleton(8) + '</div>';
    function load() { return api('api/history?page=' + pg + '&pageSize=25').then(draw).catch(function (e) { $('#hist').innerHTML = alertBox('bad', esc(e.message)); }); }
    function draw(p) {
      if (!p.total) { $('#hist').innerHTML = emptyState('history', 'No history yet', 'Imports you run, and the ones auto mode runs, are listed here. Each one can be undone.'); return; }
      var h = '<div class="tw"><table class="tbl"><thead><tr><th class="min"></th><th class="min">Date</th><th>Series</th><th>Pack</th><th>Result</th><th class="min"></th></tr></thead><tbody>';
      p.records.forEach(function (e) {
        var failed = (e.failed || []).length, kept = (e.skipped || []).length, landed = (e.landed || 0) + (e.placed || []).length;
        var st = e.undone ? ['mute', 'undo'] : failed && !landed ? ['bad', 'x'] : failed ? ['warn', 'alert'] : ['ok', 'check'];
        var res = e.kind === 'relink' ? '<span class="lbl ok">' + plural(e.landed || 0, 'file') + ' relinked</span>' + (e.freed ? ' <span class="lbl line">' + gb(e.freed) + ' freed</span>' : '')
          : (landed ? '<span class="lbl ok">' + landed + ' landed</span> ' : '') + (kept ? '<span class="lbl line">' + kept + ' kept</span> ' : '') +
            (failed ? '<span class="lbl bad">' + failed + ' did not land</span> ' : '') + (e.joined ? '<span class="lbl plex">' + e.joined + ' joined</span> ' : '');
        res += (e.auto ? ' <span class="lbl info">Auto</span>' : '') + (e.undone ? ' <span class="lbl">Undone</span>' : '');
        var more = failed || kept;
        h += '<tr' + (more ? ' class="clickable" data-more="' + esc(e.id) + '" title="Show details"' : '') + '><td class="min"><span class="st ' + st[0] + '">' + ico(st[1], 14) + '</span></td>' +
          '<td class="min muted" title="' + esc(when(e.at)) + '">' + ago(e.at) + '</td>' +
          '<td class="nowrap strong">' + (e.kind === 'relink' ? 'Library' : seriesLink(e.slug, e.series)) + '</td><td class="wrap">' + esc(e.pack_name || '') + '</td>' +
          '<td>' + res + '</td><td class="min">' + (e.can_undo ? '<button class="btn sm" type="button" data-undo="' + esc(e.id) + '">' + ico('undo', 14) + 'Undo</button>' : '') + '</td></tr>';
        if (more) {
          var det = (e.failed || []).map(function (x) { return '<li><b>' + esc(x.episode) + '</b> did not land: ' + esc(x.reason) + '</li>'; })
            .concat((e.skipped || []).map(function (x) { return '<li><b>' + esc(x.episode) + '</b> kept the library\'s file: ' + esc(x.reason) + '</li>'; }));
          h += '<tr class="detail" data-for="' + esc(e.id) + '"' + (open[e.id] ? '' : ' hidden') + '><td colspan="6"><ul class="det">' + det.join('') + '</ul></td></tr>';
        }
      });
      $('#hist').innerHTML = h + '</tbody></table></div>' + pagerHTML(p);
      wireLinks($('#hist'));
      wirePager($('#hist'), function (n) { pg = n; load().then(function () { $('#pc').scrollTop = 0; }); });
      each($('#hist').querySelectorAll('[data-more]'), function (tr) {
        tr.addEventListener('click', function (ev) {
          if (ev.target.closest('button,a')) return;
          var id = tr.getAttribute('data-more'), d = $('#hist').querySelector('tr.detail[data-for="' + id + '"]');
          open[id] = !open[id]; d.hidden = !open[id];
        });
      });
      each($('#hist').querySelectorAll('[data-undo]'), function (b) { b.addEventListener('click', function () { undo(b.getAttribute('data-undo'), load); }); });
    }
    load();
  }
  function undo(id, after) {
    dialog('Undo this import?', '<p>Files this import added go to Sonarr\'s recycle bin, and any library files it replaced are put back. Sonarr then rescans the series.</p>', 'Undo', true).then(function (ok) {
      if (!ok) return;
      busy = true; var pd = progressDialog('Undoing'); pd.step('Restoring the library...');
      api('api/history/' + encodeURIComponent(id) + '/undo', {}).then(function (r) {
        busy = false; pd.done(); DATA.catalogAt = 0; loadOverview();
        if (after) after(); note('Undone: ' + plural(r.removed, 'file') + ' removed, ' + plural(r.restored, 'file') + ' restored');
      }).catch(function (e) { busy = false; pd.done(); note(e.message, true); });
    });
  }

  // ================================================================== Audit
  function pageAudit(route, pc) {
    var pgU = 1, sel = {}, R = null;
    toolbar([{ id: 'run', label: 'Run Audit', icon: 'play', title: 'Audit the library now', onClick: runAudit }, '|',
             { id: 'relink', label: 'Relink', icon: 'link', disabled: true, title: 'Relink the selected files', onClick: relink }], [{ note: true }]);
    pc.innerHTML = '<div class="pc-inner" id="aud">' + skeleton(6) + '</div>';
    function runAudit() { api('api/audit', {}).then(watch).catch(function (e) { note(e.message, true); }); }
    function watch() {
      setTool('run', { spin: true, disabled: true });
      var t = poll(function () {
        api('api/audit').then(function (r) {
          if (r.running) { var a = $('#aStat'); if (a) a.innerHTML = alertBox('busy', esc(r.progress || 'Auditing the library...')); return; }
          clearInterval(t); setTool('run', { spin: false, disabled: false, icon: 'play' }); note('Audit finished'); draw(r);
        });
      }, 2000);
    }
    function load() { return api('api/audit').then(function (r) { draw(r); if (r.running) watch(); }).catch(function (e) { $('#aud').innerHTML = alertBox('bad', esc(e.message)); }); }
    function nSel() { return Object.keys(sel).filter(function (k) { return sel[k]; }).length; }
    function updRelink() { var n = nSel(); setTool('relink', { disabled: !n, label: n ? 'Relink ' + n : 'Relink', hot: n > 0 }); }
    function draw(r) {
      R = r;
      var s = settings(), mis = r.mislabeled || [], unl = r.unlinked || [];
      var h = '<div id="aStat">' + (r.running ? alertBox('busy', esc(r.progress || 'Auditing the library...')) :
        alertBox('info', (r.at ? '<b>Last audit ' + ago(r.at) + '</b> across ' + plural(r.series || 0, 'series', 'series') + '. ' : '<b>The library has not been audited yet.</b> ') +
          (s.audit_nightly ? 'It runs every night at ' + hourLabel(s.audit_hour || 0) + '.' : 'The nightly audit is off.') +
          ' <a href="' + routeHref('settings', 'library') + '" data-go="settings/library">Audit settings</a>')) + '</div>';
      h += '<div class="fs"><h2 class="legend">Possibly Mislabeled' + (mis.length ? ' <span class="lbl warn">' + mis.length + '</span>' : '') + '</h2>';
      if (!r.at) h += emptyState('audit', 'Not checked yet', 'Run an audit to find episodes whose original release name points at a different episode.');
      else if (!mis.length) h += alertBox('ok', 'No mislabeled episodes found.');
      else {
        h += alertBox('warn', 'The original release name of these files names a different episode than the one they are filed under. Open the series to check; if one is wrong, import the right file from the Import page.') +
          '<div class="tw"><table class="tbl"><thead><tr><th>Series</th><th class="min">Filed as</th><th class="min">Name points to</th><th>Release</th></tr></thead><tbody>';
        mis.slice(0, 300).forEach(function (m) {
          h += '<tr><td class="nowrap strong">' + seriesLink(m.slug, m.series) + '</td><td class="min">' + esc(m.filed_as) + '</td><td class="min"><span class="lbl warn">' + esc(m.looks_like) + '</span></td><td class="wrap muted">' + esc(m.release) + '</td></tr>';
        });
        h += '</tbody></table></div>';
      }
      h += '</div><div class="fs"><h2 class="legend">Not Hardlinked' + (unl.length ? ' <span class="lbl warn">' + unl.length + '</span>' : '') + '</h2>';
      if (!r.at) h += emptyState('link', 'Not checked yet', 'Run an audit to find library files that are separate copies of files that are still seeding.');
      else if (!unl.length) h += alertBox('ok', 'Every library file is hardlinked, or has no seeding copy.');
      else {
        var size = 50, pages = Math.max(1, Math.ceil(unl.length / size)); pgU = Math.min(pgU, pages);
        var part = unl.slice((pgU - 1) * size, pgU * size);
        h += alertBox('warn', 'These library files are separate copies of files that are still seeding, using <b class="strong">' + gb(r.wasted || 0) + '</b> twice. ' +
          'Relinking compares both copies byte for byte, moves the library copy to Sonarr\'s recycle bin and links the seeding copy in its place. It can be undone from History.') +
          '<div class="tw"><table class="tbl"><thead><tr><th class="min"><input type="checkbox" id="rlAll" aria-label="Select every file"></th><th>Series</th><th class="min">Episode</th><th class="min r">Size</th><th>Library file</th></tr></thead><tbody>';
        part.forEach(function (u) {
          h += '<tr><td class="min"><input type="checkbox" data-rl="' + esc(u.path) + '"' + (sel[u.path] ? ' checked' : '') + ' aria-label="Relink ' + esc(u.path) + '"></td>' +
            '<td class="nowrap strong">' + esc(u.series) + '</td><td class="min">' + esc(u.episode || '') + '</td><td class="min r">' + gb(u.size) + '</td><td class="wrap muted">' + esc(u.path) + '</td></tr>';
        });
        h += '</tbody></table></div>' + pagerHTML({ total: unl.length, page: pgU, pages: pages, pageSize: size });
      }
      $('#aud').innerHTML = h + '</div>';
      wireLinks($('#aud'));
      wirePager($('#aud'), function (n) { pgU = n; draw(R); });
      each($('#aud').querySelectorAll('[data-rl]'), function (b) { b.addEventListener('change', function () { sel[b.getAttribute('data-rl')] = b.checked; updRelink(); }); });
      var all = $('#rlAll'); if (all) all.addEventListener('change', function () { each($('#aud').querySelectorAll('[data-rl]'), function (b) { b.checked = all.checked; sel[b.getAttribute('data-rl')] = all.checked; }); updRelink(); });
      updRelink();
    }
    function relink() {
      var paths = Object.keys(sel).filter(function (k) { return sel[k]; });
      if (!paths.length) return;
      dialog('Relink ' + plural(paths.length, 'file') + '?', '<p>Each library file is compared byte for byte with its seeding copy first. Only identical files are relinked; the old copies go to Sonarr\'s recycle bin, which empties itself after its retention period.</p><p class="muted">This can be undone from History.</p>', 'Relink').then(function (ok) {
        if (!ok) return;
        busy = true; var pd = progressDialog('Relinking'); pd.step('Comparing and relinking...');
        api('api/audit/relink', { paths: paths }).then(function (res) {
          busy = false; pd.done(); sel = {};
          note('Relinked ' + plural(res.relinked, 'file') + (res.problems.length ? ', skipped ' + res.problems.length : ''), !!res.problems.length);
          load();
        }).catch(function (e) { busy = false; pd.done(); note(e.message, true); });
      });
    }
    withOverview(load);
  }

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
    pc.innerHTML = '<div class="pc-inner set">' + nav + '<div id="set">' + skeleton(5) + '</div></div>';
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
