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
  var VERSION = '3.2.0';
  var BUILD = '__FIXARR_BUILD__';        // replaced by static/build.sh; lets the add-on spot a stale cached copy
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
