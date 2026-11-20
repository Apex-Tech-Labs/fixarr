/*
 * Fixarr layer 3.0 for Sonarr. Served by Fixarr at /fixarr/layer.js and added to Sonarr's page by the reverse proxy.
 *
 * Where Fixarr appears in Sonarr (nothing depends on Sonarr's generated class names; everything is found by
 * link address, button text or title, and cloned at runtime so it matches the installed Sonarr version):
 *   left menu      Fixarr entry with a count of packs and downloads that need you
 *   series page    Fixarr toolbar button, plus a Fixarr icon on every season row
 *   Wanted         Fixarr toolbar button and a row icon on missing episodes a pack on disk can fill
 *   Activity       Fixarr toolbar button and a row icon on downloads Fixarr is handling
 *   fallback       a floating button if the menu entry cannot be placed
 */
(function () {
  'use strict';
  if (window.__fixarrLayer) return;
  var VERSION = '3.0.0';
  window.__fixarrLayer = VERSION;
  var STANDALONE = !!window.FIXARR_STANDALONE;
  var REPO = 'Apex-Tech-Labs/fixarr';

  var script = document.currentScript;
  var BASE = window.FIXARR_BASE || (script && script.src ? new URL('.', script.src).href : location.origin + '/fixarr/');
  if (!/\/$/.test(BASE)) BASE += '/';

  // ================================================================== helpers
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function ago(ts) {
    if (!ts) return '';
    var s = Math.max(0, Date.now() / 1000 - ts);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    return new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function gb(b) { return (b / 1073741824).toFixed(1) + ' GB'; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

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

  var ICON = {
    line: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/>' +
      '<path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',
    solid: '<path d="M12 2 2 7l10 5 10-5z"/><path d="m2 12 10 5 10-5-2.4-1.2L12 14.6l-7.6-3.8z"/><path d="m2 17 10 5 10-5-2.4-1.2L12 19.6l-7.6-3.8z"/>',
    clock: '<path fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1 4h2v6.4l4.2 2.5-1 1.7-5.2-3.1Z"/>'
  };
  function svgIcon(kind, size) {
    var solid = kind !== 'line';
    return '<svg viewBox="0 0 24 24" width="' + (size || 16) + '" height="' + (size || 16) + '" aria-hidden="true" ' +
      (solid ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"') + '>' + ICON[kind] + '</svg>';
  }
  // Sonarr v4 menus use solid icons, v5 uses outline (Lucide) icons: follow whatever the page uses.
  function isOutline(svg) { return !!svg && ((svg.getAttribute('stroke') && svg.getAttribute('stroke') !== 'none') || /lucide/.test(svg.getAttribute('class') || '')); }
  function setIcon(svg, outline) {
    if (!svg) return;
    ['data-icon', 'data-prefix', 'role'].forEach(function (a) { svg.removeAttribute(a); });
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    if (outline) {
      svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.innerHTML = ICON.line;
    } else {
      svg.setAttribute('fill', 'currentColor'); svg.removeAttribute('stroke'); svg.innerHTML = ICON.solid;
    }
  }
  function stripState(root) {
    [root].concat(Array.prototype.slice.call(root.querySelectorAll('*'))).forEach(function (el) {
      if (!el.classList) return;
      Array.prototype.slice.call(el.classList).forEach(function (c) { if (/active|selected|disabled|spinning/i.test(c)) el.classList.remove(c); });
    });
  }
  // First visible text in root (v4 wraps labels in a span, v5 leaves a bare text node next to the icon).
  function setText(root, text, skipNumbers) {
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), n;
    while ((n = w.nextNode())) {
      var t = (n.nodeValue || '').trim();
      if (!t || (n.parentElement && n.parentElement.closest('svg'))) continue;
      if (skipNumbers && /^\d+$/.test(t)) continue;
      n.nodeValue = text;
      return true;
    }
    return false;
  }
  function buttonByText(texts) {
    var buttons = Array.prototype.filter.call(document.querySelectorAll('button'), function (b) { return !b.closest('[data-fixarr]'); });
    for (var i = 0; i < texts.length; i++) {
      for (var j = 0; j < buttons.length; j++) if ((buttons[j].textContent || '').trim() === texts[i]) return buttons[j];
    }
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

  // ================================================================== shared data (small caches)
  var DATA = { overview: null, missing: null, missingAt: 0, queue: null, queueAt: 0, catalog: null, catalogAt: 0 };
  function loadOverview() {
    return api('api/overview').then(function (o) { DATA.overview = o; if (o.version && o.version.repo) REPO = o.version.repo; updateBadges(); if (!STANDALONE) scheduleEnsure(); return o; }).catch(function () {});
  }
  function attentionCount() {
    var o = DATA.overview; if (!o) return 0;
    return (o.packs.needs || 0) + (o.packs.review || 0) + (o.resolver.open || 0);
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

  // ================================================================== placement in Sonarr
  var state = { nav: false, series: null, season: null, wanted: null, queue: null };
  var NAV_ANCHORS = ['/wanted/missing', '/wanted', '/activity/queue', '/calendar', '/settings'];

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

  function buildNav() {
    var item = null, anchor = null;
    for (var i = 0; i < NAV_ANCHORS.length && !item; i++) {
      var a = sidebarLink(NAV_ANCHORS[i]);
      if (a) { item = itemOf(a); anchor = NAV_ANCHORS[i]; }
    }
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
    main.setAttribute('href', '#fixarr'); main.removeAttribute('target');
    main.setAttribute('title', 'Fixarr: import the packs Sonarr cannot');
    main.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); openPanel({}); });
    var src = (sidebarLink('/activity/queue') || document.createElement('a')).querySelector('[class*="status"]');
    var badge = src ? src.cloneNode(true) : document.createElement('span');
    badge.setAttribute('data-fixarr-badge', '');
    if (!src) badge.style.cssText = 'margin-left:auto;background:var(--warningColor,#ffa500);color:#fff;border-radius:2px;padding:1px 5px;font-size:12px;font-weight:600';
    main.appendChild(badge);
    if (anchor === '/settings') item.before(clone); else item.after(clone);
    updateBadges();
    return clone;
  }

  // Activity's outline clock looks lighter than the solid menu icons around it: give it a solid clock to match.
  function fixActivityIcon() {
    var a = sidebarLink('/activity/queue'), ref = sidebarLink('/calendar') || sidebarLink('/wanted/missing');
    if (!a || !ref || isOutline(ref.querySelector('svg'))) return;
    var svg = a.querySelector('svg');
    if (!svg || svg.getAttribute('data-fixarr-icon') === 'clock') return;
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'currentColor'); svg.removeAttribute('stroke');
    svg.innerHTML = ICON.clock; svg.setAttribute('data-fixarr-icon', 'clock');
  }

  function updateBadges() {
    var n = attentionCount();
    var b = document.querySelector('[data-fixarr="nav"] [data-fixarr-badge]');
    if (b) {
      var leaf = Array.prototype.find.call(b.querySelectorAll('*'), function (e) { return !e.children.length; }) || b;
      leaf.textContent = n ? String(n) : '';
      b.style.display = n ? '' : 'none';
      b.setAttribute('title', n ? plural(n, 'item') + ' waiting in Fixarr' : '');
    }
    if (fab) { var c = fab.querySelector('.n'); c.hidden = !n; c.textContent = n || ''; }
    if (root) {
      var o = DATA.overview;
      setTabBadge('activity', o ? o.resolver.open : 0);
      setTabBadge('import', o ? (o.packs.needs || 0) + (o.packs.review || 0) : 0);
    }
  }

  function seriesSlug() {
    var m = location.pathname.match(/\/series\/([^/]+)(?:\/\d+)?\/?$/);
    return m ? decodeURIComponent(m[1]) : null;
  }
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
      if (anchor) sb = cloneButton(anchor, 'series', 'Fixarr', 'Import packs for this series with Fixarr', function () { openPanel({ slug: slug }); }, { 'data-slug': slug });
    }
    state.series = showButton === false ? null : !!sb;
    if (showSeasons === false) { state.season = null; return; }
    // Season rows: a Fixarr icon after "Manage Episodes" (or Preview Rename / History) in each season's actions
    var anchors = Array.prototype.filter.call(document.querySelectorAll('button[title],a[title]'), function (b) {
      var t = b.getAttribute('title') || '';
      return !b.closest('[data-fixarr]') && /season/i.test(t) && /manage episodes/i.test(t);
    });
    if (!anchors.length) anchors = Array.prototype.filter.call(document.querySelectorAll('button[title],a[title]'), function (b) {
      var t = b.getAttribute('title') || ''; return !b.closest('[data-fixarr]') && /season/i.test(t) && /(preview rename|history)/i.test(t);
    });
    var placed = 0;
    anchors.forEach(function (a) {
      var next = a.nextElementSibling;
      if (next && next.getAttribute('data-fixarr') === 'season') {
        if (next.getAttribute('data-slug') === slug) { placed++; return; }
        next.remove();
      }
      var season = seasonOf(a);
      if (season === null) return;
      var b = cloneButton(a, 'season', null, 'Fixarr: import packs for ' + (season ? 'Season ' + season : 'Specials'),
        function () { openPanel({ slug: slug, season: season }); }, { 'data-season': String(season), 'data-slug': slug });
      placed++;
      tintSeason(b, slug, season);
    });
    state.season = anchors.length ? placed === anchors.length : null;
  }
  // Season icons light up (theme blue) when a pack on disk still has episodes for that season.
  function tintSeason(b, slug, season) {
    loadCatalog().then(function (c) {
      var hit = (c.items || []).some(function (x) {
        return x.state === 'needs' && x.series_id && (x.missing_seasons || []).indexOf(season) !== -1 && slugOf(x.series_id) === slug;
      });
      if (hit) { b.style.color = 'var(--themeBlue,#35c5f4)'; b.setAttribute('title', b.getAttribute('title') + ' (a pack on disk has missing episodes)'); }
    }).catch(function () {});
  }
  var SLUGS = {};
  function slugOf(id) { return SLUGS[id]; }
  function loadSlugs() { return api('api/series').then(function (l) { l.forEach(function (s) { SLUGS[s.id] = s.slug; }); SERIES = l; return l; }); }

  function placeWanted() {
    var tb = document.querySelector('[data-fixarr="wanted"]');
    if (!tb) {
      var anchor = buttonByText(['Manual Import']);
      if (anchor) tb = cloneButton(anchor, 'wanted', 'Fixarr', 'Missing episodes that packs already on disk can fill', function () { openPanel({ tab: 'import', missingOnly: true }); });
    }
    state.wanted = !!tb;
    loadMissing().then(function (m) {
      var n = m.raw.episodes;
      if (tb) setText(tb, n ? 'Fixarr (' + n + ')' : 'Fixarr', false);
      Array.prototype.forEach.call(document.querySelectorAll('tbody tr'), function (tr) {
        if (tr.querySelector('[data-fixarr="wrow"]')) return;
        var link = tr.querySelector('a[href*="/series/"]');
        var cell = Array.prototype.find.call(tr.children, function (td) { return /^\d+x\d+$/.test((td.textContent || '').trim()); });
        if (!link || !cell) return;
        var se = (cell.textContent || '').trim().split('x');
        var hit = m.map[(link.textContent || '').trim().toLowerCase() + '|S' + pad(se[0]) + 'E' + pad(se[1])];
        if (!hit) return;
        var last = tr.lastElementChild; if (!last) return;
        last.appendChild(rowButton('wrow', 'A pack on disk has this episode: open it in Fixarr', function () {
          openPanel({ seriesId: hit.series_id, seriesTitle: hit.series, pack: hit.packs[0] && hit.packs[0].path });
        }));
      });
    }).catch(function () {});
  }

  function placeQueue() {
    var tb = document.querySelector('[data-fixarr="queue"]');
    if (!tb) {
      var anchor = buttonByText(['Remove Selected']);
      if (anchor) tb = cloneButton(anchor, 'queue', 'Fixarr', 'Downloads Fixarr is handling', function () { openPanel({ tab: 'activity' }); });
    }
    state.queue = !!tb;
    loadQueueMap().then(function (q) {
      if (tb) setText(tb, q.list.length ? 'Fixarr (' + q.list.length + ')' : 'Fixarr', false);
      Array.prototype.forEach.call(document.querySelectorAll('tbody tr'), function (tr) {
        if (tr.querySelector('[data-fixarr="qrow"]')) return;
        var cell = Array.prototype.find.call(tr.children, function (td) { return q.map[(td.textContent || '').trim()]; });
        if (!cell) return;
        var d = q.map[(cell.textContent || '').trim()];
        var rm = tr.querySelector('button[title*="emove"]');
        var where = rm ? rm.parentElement : tr.lastElementChild;
        var b = rowButton('qrow', 'Fixarr: ' + (d.plan ? d.plan.text : 'handling this download'), function () {
          if (d.plan && d.plan.action === 'review' && d.plan.pack) openPanel({ pack: d.plan.pack, seriesId: d.plan.series_id || d.series_id, seriesTitle: d.series, downloadId: d.download_id });
          else openPanel({ tab: 'activity' });
        });
        if (rm) rm.before(b); else where.appendChild(b);
      });
    }).catch(function () {});
  }

  function rowButton(kind, title, onClick) {
    var b = document.createElement('button');
    b.type = 'button'; b.setAttribute('data-fixarr', kind); b.title = title; b.setAttribute('aria-label', title);
    b.style.cssText = 'background:none;border:0;padding:2px 6px;margin:0 2px;cursor:pointer;color:var(--themeBlue,#35c5f4);vertical-align:middle;line-height:1';
    b.innerHTML = svgIcon(isOutline(document.querySelector('a[href$="/calendar"] svg')) ? 'line' : 'solid', 15);
    b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); onClick(); });
    return b;
  }

  var ensureTimer = null;
  function ensure() {
    ensureTimer = null;
    if (!document.querySelector('[data-fixarr="nav"]')) buildNav();
    state.nav = !!document.querySelector('[data-fixarr="nav"]');
    fixActivityIcon();
    var p = location.pathname, slug = seriesSlug(), opt = (DATA.overview && DATA.overview.settings) || {};
    function on(k) { return opt[k] !== false; }
    if (!on('addon_seasons')) Array.prototype.forEach.call(document.querySelectorAll('[data-fixarr="season"]'), function (e) { e.remove(); });
    if (!on('addon_series')) Array.prototype.forEach.call(document.querySelectorAll('[data-fixarr="series"]'), function (e) { e.remove(); });
    if (!on('addon_wanted')) Array.prototype.forEach.call(document.querySelectorAll('[data-fixarr="wanted"],[data-fixarr="wrow"]'), function (e) { e.remove(); });
    if (!on('addon_queue')) Array.prototype.forEach.call(document.querySelectorAll('[data-fixarr="queue"],[data-fixarr="qrow"]'), function (e) { e.remove(); });
    if (slug && (on('addon_series') || on('addon_seasons'))) placeSeries(slug, on('addon_series'), on('addon_seasons'));
    else {
      Array.prototype.forEach.call(document.querySelectorAll('[data-fixarr="series"],[data-fixarr="season"]'), function (e) { e.remove(); });
      state.series = state.season = null;
    }
    if (on('addon_wanted') && /\/wanted\/(missing|cutoffunmet)/.test(p)) placeWanted(); else state.wanted = null;
    if (on('addon_queue') && /\/activity\/queue/.test(p)) placeQueue(); else state.queue = null;
    if (fab) fab.hidden = state.nav || !settled;
    scheduleReport();
  }
  function scheduleEnsure() { if (!STANDALONE && !ensureTimer) ensureTimer = setTimeout(ensure, 200); }

  var lastReport = '', reportTimer = null, settled = false;
  if (!STANDALONE) setTimeout(function () { settled = true; ensure(); }, 8000);
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

  // ================================================================== panel styles
  var CSS = [
    ':host{all:initial}', '*{box-sizing:border-box}',
    '.wrap{font:14px/1.45 Roboto,"open sans","Helvetica Neue",Helvetica,Arial,sans-serif;color:var(--textColor,#ccc);',
    '--fx-bg:var(--modalBackgroundColor,#2a2a2a);--fx-card:var(--cardBackgroundColor,#333);--fx-input:var(--inputBackgroundColor,#333);',
    '--fx-line:color-mix(in srgb,var(--borderColor,#858585) 40%,transparent);--fx-muted:var(--helpTextColor,#909293);',
    '--fx-accent:var(--themeBlue,#35c5f4);--fx-green:var(--successBackgroundColor,#27c24c);--fx-amber:var(--warningColor,#ffa500);',
    '--fx-red:var(--dangerColor,#f05050);--fx-blue:var(--primaryColor,#5d9cec);--fx-plex:#b48ae6;--fx-hover:var(--tableRowHoverBackgroundColor,rgba(255,255,255,.05))}',
    '[hidden]{display:none!important}',
    'button{font:inherit}',
    '.fab{position:fixed;right:22px;bottom:22px;width:48px;height:48px;border-radius:50%;border:none;background:var(--fx-accent);color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.45);cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2}',
    '.fab .n{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;border-radius:10px;background:var(--fx-amber);font-size:12px;font-weight:600;line-height:20px;padding:0 5px}',
    '.backdrop{position:fixed;inset:0;background:var(--modalBackdropBackgroundColor,rgba(0,0,0,.6));display:flex;align-items:center;justify-content:center;z-index:3;padding:20px}',
    '.modal{position:relative;background:var(--fx-bg);border-radius:6px;width:min(1320px,100%);height:min(880px,calc(100vh - 40px));display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,.5);overflow:hidden}',
    '.mh{display:flex;align-items:center;gap:10px;padding:14px 18px 0 26px}',
    '.mh .logo{color:var(--fx-accent);display:flex}.mh .t{font-size:18px}.mh .sub{color:var(--fx-muted);font-size:14px;margin-left:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mh .upd{margin-left:auto;font-size:12px;color:var(--fx-accent);text-decoration:none;white-space:nowrap}',
    '.x{margin-left:8px;background:none;border:none;color:var(--fx-muted);font-size:26px;line-height:1;cursor:pointer;width:36px;height:36px;border-radius:4px;flex:none}',
    '.x:hover{color:var(--textColor,#ccc)}',
    '.tabs{display:flex;gap:4px;padding:8px 26px 0;border-bottom:1px solid var(--fx-line)}',
    '.tab{background:none;border:none;border-bottom:2px solid transparent;color:var(--fx-muted);padding:9px 14px;cursor:pointer;display:flex;align-items:center;gap:7px}',
    '.tab:hover{color:var(--textColor,#ccc)}.tab.on{color:var(--textColor,#ccc);border-bottom-color:var(--fx-accent)}',
    '.tab .c{min-width:18px;height:18px;border-radius:9px;background:var(--fx-amber);color:#fff;font-size:11px;font-weight:600;line-height:18px;padding:0 5px;text-align:center}',
    '.mb{padding:22px 26px;overflow:auto;flex:1}',
    '.mf{display:flex;align-items:center;gap:10px;padding:12px 26px;border-top:1px solid var(--fx-line);min-height:56px}',
    '.mf .note{color:var(--fx-muted);font-size:12px;margin-right:auto}',
    'h4{margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:var(--fx-muted);font-weight:600}',
    'label.f{display:block;color:var(--fx-muted);font-size:12px;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px}',
    '.row{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end}.grow{flex:1;min-width:260px}',
    '.btn{border:1px solid var(--defaultBorderColor,#393f45);background:var(--defaultBackgroundColor,#333);color:var(--defaultButtonTextColor,#eee);border-radius:4px;padding:7px 16px;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:7px}',
    '.btn:hover{background:var(--defaultHoverBackgroundColor,#444);border-color:var(--defaultHoverBorderColor,#5a6265)}',
    '.btn.primary{background:var(--primaryBackgroundColor,#5d9cec);border-color:var(--primaryBorderColor,#5899eb);color:#fff}',
    '.btn.primary:hover{background:var(--primaryHoverBackgroundColor,#4b91ea)}',
    '.btn.danger{background:var(--dangerColor,#f05050);border-color:var(--dangerColor,#f05050);color:#fff}',
    '.btn.sm{padding:4px 11px;font-size:13px}.btn:disabled{opacity:.5;cursor:not-allowed}',
    '.btn.icon{padding:7px 10px}',
    'input[type=text],input[type=number],select{background:var(--fx-input);color:var(--textColor,#ccc);border:1px solid var(--inputBorderColor,#dde6e9);border-radius:4px;padding:7px 10px;font:inherit}',
    'input:focus,select:focus,button:focus-visible{outline:none;border-color:var(--inputFocusBorderColor,#66afe9);box-shadow:0 0 0 2px color-mix(in srgb,var(--inputFocusBorderColor,#66afe9) 35%,transparent)}',
    /* combobox */
    '.cb{position:relative}.cb input{width:100%;padding-right:34px}',
    '.cb .chev{position:absolute;right:10px;top:50%;transform:translateY(-50%);color:var(--fx-muted);pointer-events:none;display:flex}',
    '.cb .spin{position:absolute;right:30px;top:50%;margin-top:-7px}',
    '.lb{position:absolute;left:0;right:0;top:calc(100% + 4px);background:var(--fx-bg);border:1px solid var(--fx-line);border-radius:4px;box-shadow:0 8px 24px rgba(0,0,0,.45);max-height:360px;overflow:auto;z-index:5;padding:4px 0}',
    '.op{padding:7px 12px;cursor:pointer;display:flex;align-items:center;gap:10px}.op .m{flex:1;min-width:0}',
    '.op .l{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.op .s{display:block;font-size:12px;color:var(--fx-muted)}',
    '.op.on,.op:hover{background:var(--fx-hover)}.op.sel .l{color:var(--fx-accent)}',
    '.lb .empty{padding:10px 12px;color:var(--fx-muted);font-size:13px}.lb .grp{padding:8px 12px 4px;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--fx-muted)}',
    /* chips, badges */
    '.chip{display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;white-space:nowrap;letter-spacing:.2px}',
    '.c-needs{background:color-mix(in srgb,var(--fx-blue) 22%,transparent);color:var(--fx-blue)}',
    '.c-review{background:color-mix(in srgb,var(--fx-amber) 22%,transparent);color:var(--fx-amber)}',
    '.c-done{background:color-mix(in srgb,var(--fx-green) 20%,transparent);color:var(--fx-green)}',
    '.c-covered,.c-muted{background:color-mix(in srgb,var(--fx-muted) 22%,transparent);color:var(--fx-muted)}',
    '.c-red{background:color-mix(in srgb,var(--fx-red) 20%,transparent);color:var(--fx-red)}',
    '.c-plex{background:color-mix(in srgb,var(--fx-plex) 24%,transparent);color:var(--fx-plex)}',
    '.filters{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;align-items:center}',
    '.pill{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--fx-line);border-radius:14px;padding:3px 10px;font-size:12.5px;color:var(--textColor,#ccc)}',
    '.pill button{background:none;border:none;color:var(--fx-muted);cursor:pointer;padding:0 0 0 2px;font-size:15px;line-height:1}',
    '.status{display:flex;align-items:center;gap:9px;margin-top:16px;padding:10px 14px;border-radius:4px;font-size:13px;background:color-mix(in srgb,var(--fx-accent) 10%,transparent)}',
    '.status.ok{background:color-mix(in srgb,var(--fx-green) 12%,transparent)}.status.warn{background:color-mix(in srgb,var(--fx-amber) 12%,transparent)}',
    '.status.err{background:color-mix(in srgb,var(--fx-red) 12%,transparent)}',
    '.spin{display:inline-block;width:14px;height:14px;border:2px solid color-mix(in srgb,currentColor 25%,transparent);border-top-color:var(--fx-accent);border-radius:50%;animation:s .7s linear infinite;flex:none}',
    '@keyframes s{to{transform:rotate(360deg)}}',
    '.sk{height:34px;border-radius:4px;margin:6px 0;background:linear-gradient(90deg,var(--fx-card) 25%,color-mix(in srgb,var(--fx-card) 70%,#fff 6%) 50%,var(--fx-card) 75%);background-size:200% 100%;animation:sh 1.2s ease-in-out infinite}',
    '@keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}',
    '.ph{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:10px;color:var(--fx-muted);min-height:260px}',
    '.ph svg{opacity:.45}.ph .ok{color:var(--fx-green);opacity:.95}.ph .t{font-size:17px;font-weight:600;color:var(--textColor,#ccc)}.ph .s{font-size:13px;max-width:440px;line-height:1.5}',
    /* table */
    '.summary{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:18px 0 10px;font-size:13px;color:var(--fx-muted)}',
    '.tw{overflow:auto}table{width:100%;border-collapse:collapse}',
    'th{text-align:left;color:var(--fx-muted);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;padding:8px;border-bottom:1px solid var(--fx-line);white-space:nowrap}',
    'td{padding:6px 8px;border-bottom:1px solid color-mix(in srgb,var(--fx-line) 55%,transparent);vertical-align:middle}',
    'tbody tr:hover td{background:var(--fx-hover)}tr.off td{opacity:.55}',
    'td.fn{font-size:13px;min-width:220px;word-break:break-word}td.fn .sub{display:block;font-size:11px;color:var(--fx-muted);margin-top:2px}',
    'td.ar{color:var(--fx-muted);text-align:center;width:22px}',
    'td select{font-size:12.5px;padding:4px 6px;min-width:180px;max-width:280px}',
    'td input.ti{font-size:12.5px;padding:4px 8px;min-width:180px;width:100%}',
    '.sc{text-align:center;color:var(--fx-muted);font-variant-numeric:tabular-nums;white-space:nowrap}',
    'button.chip{border:none;cursor:pointer}',
    'input[type=checkbox]{width:16px;height:16px;accent-color:var(--fx-accent);cursor:pointer}',
    /* lists */
    '.card{background:var(--fx-card);border-radius:4px;padding:12px 14px;margin-bottom:8px;display:flex;align-items:center;gap:14px}',
    '.card .m{flex:1;min-width:0}.card .t{display:block;font-weight:500}.card .s{display:block;font-size:12.5px;color:var(--fx-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.card .w{display:block;font-size:12.5px;margin-top:2px}',
    '.card a{color:var(--fx-accent);text-decoration:none}',
    '.ic{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none;font-size:15px}',
    '.ic.g{background:color-mix(in srgb,var(--fx-green) 18%,transparent);color:var(--fx-green)}.ic.b{background:color-mix(in srgb,var(--fx-accent) 18%,transparent);color:var(--fx-accent)}',
    '.ic.a{background:color-mix(in srgb,var(--fx-amber) 18%,transparent);color:var(--fx-amber)}.ic.m{background:color-mix(in srgb,var(--fx-muted) 18%,transparent);color:var(--fx-muted)}',
    '.sec{margin-bottom:26px}.sec>h4{display:flex;align-items:center;gap:10px}',
    '.hint{color:var(--fx-muted);font-size:13px;margin:0 0 12px;line-height:1.5}',
    '.det{margin-top:6px;font-size:12.5px;color:var(--fx-muted)}.det li{margin:2px 0}.det ul{margin:4px 0 0 18px;padding:0}',
    /* settings */
    '.set{display:flex;align-items:center;gap:16px;padding:12px 0;border-bottom:1px solid color-mix(in srgb,var(--fx-line) 55%,transparent)}',
    '.set .m{flex:1}.set .t{display:block}.set .s{display:block;font-size:12.5px;color:var(--fx-muted)}',
    '.sw{position:relative;width:40px;height:22px;flex:none}.sw input{opacity:0;width:100%;height:100%;margin:0;position:absolute;cursor:pointer;z-index:1}',
    '.sw span{position:absolute;inset:0;border-radius:11px;background:var(--defaultBackgroundColor,#444);border:1px solid var(--fx-line);transition:.15s}',
    '.sw span:after{content:"";position:absolute;width:16px;height:16px;border-radius:50%;background:#fff;top:2px;left:2px;transition:.15s}',
    '.sw input:checked+span{background:var(--fx-accent);border-color:var(--fx-accent)}.sw input:checked+span:after{left:20px}',
    '.sw input:disabled+span{opacity:.45}',
    '.set input[type=number]{width:80px}',
    /* dialog */
    '.inner{position:absolute;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:6;padding:20px}',
    '.dlg{background:var(--fx-bg);border:1px solid var(--fx-line);border-radius:6px;width:min(540px,100%);box-shadow:0 12px 40px rgba(0,0,0,.5)}',
    '.dlg .dh{padding:14px 20px;font-size:16px;border-bottom:1px solid var(--fx-line)}.dlg .db{padding:18px 20px;line-height:1.5}',
    '.dlg .acts{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}',
    '.prog{height:8px;background:var(--fx-input);border-radius:4px;overflow:hidden;margin-top:12px}',
    '.bar{height:100%;width:0;background:var(--fx-accent);transition:width .35s ease}',
    /* settings dialog: Payloads layout (nav column, section header, setting rows), colors from the host theme */
    '.sdwrap{position:absolute;inset:0;z-index:7;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.35);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}',
    '.sd{--r-ctl:6px;--r-chip:4px;--r-panel:8px;--line:color-mix(in srgb,var(--textColor,#fff) 9%,transparent);--line-hi:color-mix(in srgb,var(--textColor,#fff) 17%,transparent);',
    '--dim:color-mix(in srgb,var(--textColor,#fff) 74%,transparent);--faint:var(--fx-muted);--acc:var(--fx-accent);--acc-dk:color-mix(in srgb,var(--fx-accent) 34%,#000);',
    '--sink:color-mix(in srgb,#000 32%,transparent);width:min(980px,100%);height:min(700px,100%);display:grid;grid-template-columns:212px minmax(0,1fr);overflow:hidden;',
    'border:1px solid var(--line-hi);border-radius:var(--r-panel);background:color-mix(in srgb,var(--fx-bg) 80%,transparent);-webkit-backdrop-filter:saturate(160%) blur(28px);backdrop-filter:saturate(160%) blur(28px);',
    'box-shadow:0 40px 100px -28px rgba(0,0,0,.95),inset 0 1px 0 rgba(255,255,255,.06);animation:sdin .22s cubic-bezier(.2,.8,.2,1)}',
    '@keyframes sdin{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:none}}',
    '.sd-nav{display:flex;flex-direction:column;gap:14px;padding:16px 10px 14px;border-right:1px solid var(--line);background:color-mix(in srgb,#000 16%,transparent);min-height:0}',
    '.sd-brand{display:flex;align-items:center;gap:10px;padding:2px 8px 4px;font-size:15.5px;font-weight:600;color:var(--textColor,#fff)}.sd-brand svg{color:var(--acc)}',
    '.sd-tabs{display:flex;flex-direction:column;gap:2px;overflow:auto}',
    '.sd-tabs [role=tab]{display:flex;align-items:center;gap:10px;min-height:38px;padding:0 10px;border:0;border-radius:var(--r-ctl);background:none;color:var(--dim);font-size:13.5px;text-align:left;cursor:pointer;flex:none}',
    '.sd-tabs [role=tab]:hover{background:color-mix(in srgb,var(--textColor,#fff) 5%,transparent);color:var(--textColor,#fff)}',
    '.sd-tabs [role=tab][aria-selected=true]{background:color-mix(in srgb,var(--acc-dk) 70%,transparent);color:var(--textColor,#fff)}',
    '.sd-tabs [role=tab][aria-selected=true] .ico{color:var(--acc)}',
    '.sd-foot{margin-top:auto;display:flex;flex-direction:column;gap:6px;padding:12px 8px 4px}',
    '.sd-gh{display:inline-flex;align-items:center;gap:8px;min-height:34px;padding:0 10px;margin:0 -2px;border:1px solid color-mix(in srgb,var(--acc) 50%,transparent);border-radius:var(--r-ctl);background:color-mix(in srgb,var(--acc-dk) 40%,transparent);color:var(--textColor,#fff);font-size:13px;font-weight:500;text-decoration:none}',
    '.sd-gh:hover{background:color-mix(in srgb,var(--acc-dk) 70%,transparent);border-color:var(--acc)}.sd-gh .ico{color:var(--acc)}',
    '.sd-ver{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;letter-spacing:.06em;color:var(--faint);margin:4px -8px 0;padding:10px 8px 0;border-top:1px solid var(--line)}',
    '.sd-main{display:flex;flex-direction:column;min-width:0;min-height:0}',
    '.sd-h{display:flex;align-items:center;gap:10px;padding:16px 16px 12px 22px;border-bottom:1px solid var(--line)}',
    '.sd-h h2{flex:1;margin:0;font-size:17px;font-weight:600;color:var(--textColor,#fff)}',
    '.sd-saved{font-size:12px;color:var(--fx-green);opacity:0;transition:opacity .2s}.sd-saved.on{opacity:1}.sd-saved.err{color:var(--fx-red)}',
    '.sd-x{width:32px;height:32px;display:grid;place-items:center;border:0;border-radius:var(--r-ctl);background:none;color:var(--faint);cursor:pointer;flex:none}',
    '.sd-x:hover{background:rgba(255,0,0,.12);color:var(--fx-red)}',
    '.sd-body{flex:1;min-height:0;overflow-y:auto;padding:6px 22px 20px}',
    '.srow{display:flex;align-items:center;gap:18px;padding:16px 0;border-bottom:1px solid var(--line)}.srow:last-child{border-bottom:0}',
    '.srow.stack{flex-direction:column;align-items:stretch;gap:12px}.srow.stack .seg{align-self:flex-start}',
    '.st{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}',
    '.st b{font-size:14px;font-weight:500;color:var(--textColor,#fff)}.st small{font-size:12.5px;line-height:1.5;color:var(--faint)}',
    '.st code,.sd-note code{font-size:11.5px;padding:1px 5px;border-radius:var(--r-chip);background:var(--sink)}',
    '.sd .select{-webkit-appearance:none;appearance:none;height:38px;min-width:200px;padding:0 34px 0 11px;background-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%23909293%27 stroke-width=%272.4%27 stroke-linecap=%27round%27%3E%3Cpath d=%27M6 9l6 6 6-6%27/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 11px center;background-size:14px;border:1px solid var(--line-hi);border-radius:var(--r-ctl);background:var(--sink);color:var(--textColor,#fff);font-size:14px;cursor:pointer}',
    '.sd .select:focus{border-color:var(--acc);box-shadow:none}.sd .select option{background:var(--fx-bg)}',
    '.seg{display:inline-flex;flex-wrap:wrap;gap:2px;padding:3px;border:1px solid var(--line-hi);border-radius:var(--r-ctl);background:var(--sink)}',
    '.seg button{min-height:30px;padding:0 12px;border:0;border-radius:var(--r-chip);background:none;color:var(--dim);font-size:13px;cursor:pointer}',
    '.seg button:hover{color:var(--textColor,#fff)}.seg button[aria-checked=true]{background:var(--acc-dk);color:var(--textColor,#fff)}',
    '.switch{position:relative;display:inline-block;width:42px;height:24px;flex:none;cursor:pointer}',
    '.switch input{position:absolute;opacity:0;inset:0;margin:0;cursor:pointer;width:100%;height:100%;z-index:1}',
    '.switch span{position:absolute;inset:0;border-radius:999px;background:color-mix(in srgb,var(--textColor,#fff) 10%,transparent);border:1px solid var(--line-hi);transition:background .2s}',
    '.switch span::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:var(--faint);transition:transform .2s cubic-bezier(.2,.8,.2,1),background .2s}',
    '.switch input:checked+span{background:var(--acc-dk);border-color:var(--acc)}.switch input:checked+span::after{transform:translateX(18px);background:#fff}',
    '.switch input:focus-visible+span{outline:2px solid var(--acc);outline-offset:2px}.switch input:disabled{cursor:not-allowed}.switch input:disabled+span{opacity:.45}',
    '.sd-note{margin:0;padding:14px 0 6px;font-size:13px;line-height:1.5;color:var(--faint)}',
    '.sd-code{display:flex;align-items:flex-start;gap:8px;border:1px solid var(--line-hi);border-radius:var(--r-ctl);background:var(--sink);padding:9px 8px 9px 12px}',
    '.sd-code code{flex:1;min-width:0;white-space:pre-wrap;word-break:break-all;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--textColor,#fff)}',
    '.sd-copy{flex:none;width:30px;height:30px;display:grid;place-items:center;border:1px solid var(--line-hi);border-radius:var(--r-chip);background:none;color:var(--dim);cursor:pointer}',
    '.sd-copy:hover{color:var(--textColor,#fff);border-color:var(--acc)}.sd-copy.done{color:var(--fx-green);border-color:var(--fx-green)}',
    '.sd-acts{display:flex;gap:8px;flex:none}.sd-acts a.btn{text-decoration:none}',
    '.sd-hero{display:flex;gap:14px;margin:14px 0 4px;padding:14px 16px;border:1px solid color-mix(in srgb,var(--acc) 35%,transparent);border-radius:var(--r-panel);background:color-mix(in srgb,var(--acc-dk) 28%,transparent)}',
    '.sd-hero-i{flex:none;width:38px;height:38px;border-radius:var(--r-ctl);display:grid;place-items:center;color:var(--acc);background:color-mix(in srgb,var(--acc) 14%,transparent)}',
    '.sd-hero b{display:block;font-size:14.5px;color:var(--textColor,#fff);margin-bottom:4px}.sd-hero p{margin:0;font-size:13px;line-height:1.55;color:var(--dim)}',
    '.sd-about{display:flex;align-items:center;gap:14px;padding:18px 0 12px;border-bottom:1px solid var(--line)}.sd-about svg{color:var(--acc)}',
    '.sd-about b{display:block;font-size:18px;color:var(--textColor,#fff)}.sd-about span{font-size:13px;color:var(--faint)}',
    '.mh .gear{margin-left:auto;width:36px;height:36px;display:grid;place-items:center;border:0;border-radius:4px;background:none;color:var(--fx-muted);cursor:pointer;flex:none}',
    '.mh .gear:hover{color:var(--textColor,#ccc);background:var(--fx-hover)}.mh .upd:not([hidden])+.gear{margin-left:8px}',
    '@media (max-width:900px){.sd{grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto minmax(0,1fr) auto;grid-template-areas:"h" "tabs" "body" "foot"}',
    '.sd-nav,.sd-main{display:contents}.sd-brand{display:none}.sd-h{grid-area:h}.sd-tabs{grid-area:tabs;flex-direction:row;gap:4px;padding:6px 8px;border-bottom:1px solid var(--line);overflow-x:auto}',
    '.sd-tabs [role=tab]{flex-direction:column;justify-content:center;gap:4px;min-height:52px;padding:0 8px;font-size:12px;text-align:center}',
    '.sd-body{grid-area:body}.sd-foot{grid-area:foot;margin:0;flex-direction:row;align-items:center;justify-content:space-between;padding:10px 16px}.sd-ver{margin:0;padding:0;border-top:0}',
    '.srow{flex-wrap:wrap}.sd .select{width:100%}.sdwrap{padding:0}.sd{width:100%;height:100%;border-radius:0}}',
    /* standalone page: the panel is the whole page */
    '.wrap.alone .backdrop{padding:0;background:var(--pageBackground,#202020)}',
    '.wrap.alone .modal{width:100%;height:100vh;border-radius:0;box-shadow:none}',
    '.wrap.alone [data-close]{display:none}.wrap.alone .mh{padding-top:16px}',
    '@media (max-width:760px){.mb{padding:16px}.mh,.tabs{padding-left:16px}.mf{padding:10px 16px}.grow{min-width:100%}.tab{padding:8px 9px}}'
  ].join('\n');

  // ================================================================== panel shell
  var host = null, root = null, fab = null, $ = null;
  var TABS = [['import', 'Import'], ['activity', 'Activity'], ['history', 'History'], ['audit', 'Audit']];
  function mount() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'fixarr-layer';
    host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483000';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>' + CSS + '</style><div class="wrap">' +
      '<button class="fab" type="button" hidden title="Fixarr" aria-label="Open Fixarr">' + svgIcon('solid', 24) + '<span class="n" hidden></span></button>' +
      '<div class="backdrop" hidden><div class="modal" role="dialog" aria-modal="true" aria-labelledby="fxT">' +
      '<div class="mh"><span class="logo">' + svgIcon('solid', 22) + '</span><span class="t" id="fxT">Fixarr</span><span class="sub" id="fxSub"></span>' +
      '<a class="upd" id="fxUpd" href="#" hidden></a><button class="gear" type="button" id="fxGear" title="Settings" aria-label="Settings">' + sdIco('gear', 19) + '</button>' +
      '<button class="x" type="button" data-close aria-label="Close">&times;</button></div>' +
      '<div class="tabs" role="tablist">' + TABS.map(function (t) {
        return '<button class="tab" role="tab" type="button" data-tab="' + t[0] + '">' + t[1] + '<span class="c" hidden></span></button>';
      }).join('') + '</div>' +
      '<div class="mb" id="fxBody"></div>' +
      '<div class="mf"><span class="note" id="fxNote">Fixarr v' + VERSION + '</span><span id="fxFoot"></span><button class="btn" type="button" data-close>Close</button></div>' +
      '<div class="inner" id="fxDlg" hidden></div><div class="sdwrap" id="fxSettings" hidden></div>' +
      '</div></div></div>';
    $ = function (s) { return root.querySelector(s); };
    fab = $('.fab');
    fab.addEventListener('click', function () { openPanel({}); });
    document.body.appendChild(host);
    // Keys typed in the panel must not reach Sonarr's keyboard shortcuts
    ['keydown', 'keyup', 'keypress'].forEach(function (t) {
      root.addEventListener(t, function (e) {
        if (t === 'keydown' && e.key === 'Escape' && !e.defaultPrevented) {
          if (!$('#fxDlg').hidden) { if (!busy) closeDialog(false); } else if (settingsOpen()) closeSettings(); else if (!STANDALONE) closePanel();
        }
        e.stopPropagation();
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-close]'), function (b) { b.addEventListener('click', closePanel); });
    $('.backdrop').addEventListener('mousedown', function (e) { if (e.target === $('.backdrop')) closePanel(); });
    Array.prototype.forEach.call(root.querySelectorAll('.tab'), function (b) { b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); }); });
  }
  function setTabBadge(tab, n) {
    if (!root) return;
    var c = root.querySelector('.tab[data-tab="' + tab + '"] .c');
    if (c) { c.hidden = !n; c.textContent = n || ''; }
  }

  var busy = false, lastFocus = null, CUR = 'import', SERIES = null;
  var ctx = {};
  function openPanel(opts) {
    mount();
    var wasOpen = !$('.backdrop').hidden;
    if (!wasOpen) { lastFocus = document.activeElement; $('.backdrop').hidden = false; document.documentElement.style.overflow = 'hidden'; }
    ctx = opts || {};
    loadOverview().then(renderHeader);
    if (ctx.tab === 'settings') { showTab('import', true); openSettings(ctx.section); } else showTab(ctx.tab || 'import', true);
  }
  function closePanel() {
    if (busy || !host || $('.backdrop').hidden) return;
    $('.backdrop').hidden = true; document.documentElement.style.overflow = '';
    stopPolls();
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) {}
  }
  function renderHeader() {
    var v = DATA.overview && DATA.overview.version, u = $('#fxUpd');
    if (v && v.update) { u.hidden = false; u.textContent = 'Update available: ' + v.latest; u.onclick = function (e) { e.preventDefault(); openSettings('updates'); }; } else u.hidden = true;
    updateBadges();
  }
  function showTab(tab, fresh) {
    if (busy) return;
    CUR = tab; stopPolls();
    Array.prototype.forEach.call(root.querySelectorAll('.tab'), function (b) {
      var on = b.getAttribute('data-tab') === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $('#fxFoot').innerHTML = '';
    if (tab === 'settings') { openSettings(); return; }
    ({ import: tabImport, activity: tabActivity, history: tabHistory, audit: tabAudit })[tab](fresh);
  }
  var polls = [];
  function poll(fn, ms) { var id = setInterval(fn, ms); polls.push(id); return id; }
  function stopPolls() { polls.forEach(clearInterval); polls = []; }
  function foot(html) { $('#fxFoot').innerHTML = html || ''; }
  function bodyHTML(html) { $('#fxBody').innerHTML = html; return $('#fxBody'); }
  function statusLine(el, kind, html) {
    el.className = 'status' + (kind ? ' ' + kind : ''); el.hidden = !html;
    el.innerHTML = (kind === 'busy' ? '<span class="spin"></span>' : '') + '<span>' + (html || '') + '</span>';
  }

  // ------------------------------------------------------------------ dialog (never alert/confirm)
  var dlgResolve = null;
  function dialog(title, html, okText, danger) {
    var d = $('#fxDlg');
    d.innerHTML = '<div class="dlg" role="alertdialog" aria-modal="true" aria-labelledby="fxDT"><div class="dh" id="fxDT">' + esc(title) + '</div><div class="db">' + html +
      '<div class="acts"><button class="btn" type="button" data-no>Cancel</button><button class="btn ' + (danger ? 'danger' : 'primary') + '" type="button" data-ok>' + esc(okText) + '</button></div></div></div>';
    d.hidden = false;
    d.querySelector('[data-ok]').focus();
    return new Promise(function (res) {
      dlgResolve = res;
      d.querySelector('[data-no]').onclick = function () { closeDialog(false); };
      d.querySelector('[data-ok]').onclick = function () { closeDialog(true); };
    });
  }
  function closeDialog(v) { $('#fxDlg').hidden = true; if (dlgResolve) { var r = dlgResolve; dlgResolve = null; r(v); } }
  function progressDialog(title) {
    var d = $('#fxDlg');
    d.innerHTML = '<div class="dlg" role="alertdialog" aria-modal="true" aria-labelledby="fxDT"><div class="dh" id="fxDT">' + esc(title) + '</div><div class="db">' +
      '<div style="display:flex;gap:9px;align-items:center"><span class="spin"></span><span id="fxStep">Starting...</span></div><div class="prog"><div class="bar" id="fxBar"></div></div></div></div>';
    d.hidden = false;
    var w = 0, bar = d.querySelector('#fxBar');
    var t = setInterval(function () { w += Math.max(0.4, (92 - w) * 0.04); if (w > 92) w = 92; bar.style.width = w.toFixed(1) + '%'; }, 200);
    return { step: function (s) { var e = d.querySelector('#fxStep'); if (e) e.textContent = s; },
             done: function () { clearInterval(t); bar.style.width = '100%'; setTimeout(function () { d.hidden = true; }, 350); } };
  }

  // ------------------------------------------------------------------ searchable combobox
  function combo(el, o) {
    el.className = 'cb';
    el.innerHTML = '<input type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" autocomplete="off" spellcheck="false" placeholder="' + esc(o.placeholder) + '">' +
      '<span class="spin" hidden></span><span class="chev">' +
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg></span><div class="lb" role="listbox" hidden></div>';
    var input = el.querySelector('input'), lb = el.querySelector('.lb'), sp = el.querySelector('.spin');
    var opts = [], value = null, active = -1, shown = [], loadingText = null, typed = false;
    function label(v) { var x = opts.find(function (p) { return p.value === v; }); return x ? x.label : ''; }
    function words(q) { return q.toLowerCase().split(/\s+/).filter(Boolean); }
    function filter(q) {
      if (!q) return (o.defaultFilter ? opts.filter(o.defaultFilter) : opts);
      var ws = words(q);
      return opts.filter(function (p) { var hay = (p.search || p.label).toLowerCase(); return ws.every(function (w) { return hay.indexOf(w) !== -1; }); });
    }
    function render() {
      var q = typed ? input.value.trim() : '';
      shown = filter(q).slice(0, 300);
      if (loadingText && !opts.length) { lb.innerHTML = '<div class="empty" style="display:flex;gap:8px;align-items:center"><span class="spin"></span>' + esc(loadingText) + '</div>'; return; }
      if (!shown.length) { lb.innerHTML = '<div class="empty">' + esc(q ? 'Nothing matches "' + q + '"' : (o.emptyText || 'Nothing to show')) + '</div>'; return; }
      var html = '', lastGroup = null;
      shown.forEach(function (p, i) {
        if (p.group && p.group !== lastGroup) { html += '<div class="grp">' + esc(p.group) + '</div>'; lastGroup = p.group; }
        html += '<div class="op' + (i === active ? ' on' : '') + (p.value === value ? ' sel' : '') + '" role="option" data-i="' + i + '" aria-selected="' + (p.value === value) + '">' +
          '<span class="m"><span class="l">' + esc(p.label) + '</span>' + (p.sub ? '<span class="s">' + esc(p.sub) + '</span>' : '') + '</span>' + (p.chip || '') + '</div>';
      });
      if (!q && o.footer) html += o.footer(opts.length - shown.length);
      lb.innerHTML = html;
      var a = lb.querySelector('.op.on'); if (a) a.scrollIntoView({ block: 'nearest' });
    }
    function open() { lb.hidden = false; input.setAttribute('aria-expanded', 'true'); render(); }
    function close() { lb.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; typed = false; input.value = label(value); }
    function pick(p) { value = p.value; close(); if (o.onSelect) o.onSelect(p.value, p); }
    input.addEventListener('focus', function () { input.select(); open(); });
    input.addEventListener('input', function () { typed = true; active = 0; open(); });
    input.addEventListener('blur', function () { setTimeout(close, 150); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (lb.hidden) open(); active = Math.min(shown.length - 1, active + 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) pick(shown[active]); }
      else if (e.key === 'Escape' && !lb.hidden) { e.preventDefault(); close(); input.blur(); }
    });
    lb.addEventListener('mousedown', function (e) {
      var d = e.target.closest('.op'); if (d) { e.preventDefault(); pick(shown[+d.getAttribute('data-i')]); }
    });
    return {
      set: function (list) { opts = list || []; if (!lb.hidden) render(); if (value != null && document.activeElement !== input) input.value = label(value); },
      value: function () { return value; },
      select: function (v, silent) { value = v; input.value = label(v); if (!silent && o.onSelect) { var p = opts.find(function (x) { return x.value === v; }); if (p) o.onSelect(v, p); } },
      loading: function (text) { loadingText = text; sp.hidden = !text; if (!lb.hidden) render(); },
      focus: function () { input.focus(); }
    };
  }

  // ================================================================== Import tab
  var IMP = null;   // { packCombo, seriesCombo, pack, preview, rows }
  var STATE_CHIP = {
    needs: '<span class="chip c-needs">Needs import</span>', review: '<span class="chip c-review">Needs review</span>',
    done: '<span class="chip c-done">Imported</span>', covered: '<span class="chip c-covered">In library</span>'
  };
  function tabImport(fresh) {
    var b = bodyHTML(
      '<div class="row">' +
      '<div class="grow" style="flex:2"><label class="f" id="fxPL">Pack</label><div id="fxPack"></div></div>' +
      '<div class="grow"><label class="f" id="fxSL">Series</label><div id="fxSeries"></div></div>' +
      '<button class="btn icon" type="button" id="fxRescan" title="Scan the download folders again" aria-label="Scan again">' +
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/></svg></button>' +
      '</div>' +
      '<div class="filters" id="fxFilters"></div>' +
      '<div class="status" id="fxStatus" hidden></div>' +
      '<div id="fxResult"><div class="ph">' + svgIcon('line', 50) + '<div class="t">Pick a pack</div><div class="s">Packs that still need importing are listed first. Type to search every pack, including finished ones.</div></div></div>');
    b.querySelector('#fxPL').setAttribute('for', ''); b.querySelector('#fxSL').setAttribute('for', '');
    IMP = { pack: null, preview: null, rows: [], season: ctx.season != null ? ctx.season : null, seriesLocked: false };
    IMP.packCombo = combo($('#fxPack'), {
      placeholder: 'Search packs...', emptyText: 'No packs need importing. Type to search finished packs.',
      defaultFilter: function (p) {
        if (ctx.missingOnly && p.item.state !== 'needs') return false;
        return p.item.state === 'needs' || p.item.state === 'review' || p.value === IMP.packCombo.value();
      },
      footer: function (hidden) { return hidden ? '<div class="empty">' + plural(hidden, 'finished pack') + ' hidden. Type to search them.</div>' : ''; },
      onSelect: function (v, p) { selectPack(p.item); }
    });
    IMP.seriesCombo = combo($('#fxSeries'), {
      placeholder: 'Search series...', emptyText: 'No series',
      onSelect: function (v) { IMP.seriesLocked = true; renderFilters(); if (IMP.pack) runPreview(); else fillPacks(); }
    });
    $('#fxRescan').addEventListener('click', function () { refreshCatalog(true); });
    // Series list, then context, then packs
    IMP.seriesCombo.loading('Loading series...');
    (SERIES ? Promise.resolve(SERIES) : loadSlugs()).then(function (list) {
      IMP.seriesCombo.loading(null);
      IMP.seriesCombo.set(list.map(function (s) { return { value: s.id, label: s.title, sub: s.year ? String(s.year) : '', search: s.title + ' ' + (s.year || '') }; }));
      return applyContext();
    }).catch(function (e) { statusLine($('#fxStatus'), 'err', esc(e.message)); });
    refreshCatalog(false);
  }
  function applyContext() {
    var p = Promise.resolve();
    if (ctx.slug) p = api('api/series?slug=' + encodeURIComponent(ctx.slug)).then(function (s) { ctx.seriesId = s.id; ctx.seriesTitle = s.title; }).catch(function () {});
    return p.then(function () {
      if (ctx.seriesId) { IMP.seriesCombo.select(ctx.seriesId, true); IMP.seriesLocked = true; }
      $('#fxSub').textContent = ctx.seriesTitle ? ctx.seriesTitle + (IMP.season != null ? (IMP.season ? ' · Season ' + IMP.season : ' · Specials') : '') : '';
      renderFilters(); fillPacks();
    });
  }
  function renderFilters() {
    var f = $('#fxFilters'); if (!f) return;
    var h = '';
    var sid = IMP.seriesCombo.value();
    if (sid && IMP.seriesLocked) h += '<span class="pill">Series: ' + esc((SERIES || []).filter(function (s) { return s.id === sid; }).map(function (s) { return s.title; })[0] || '') + '<button type="button" data-clear="series" aria-label="Show every series">&times;</button></span>';
    if (IMP.season != null) h += '<span class="pill">' + (IMP.season ? 'Season ' + IMP.season : 'Specials') + ' only<button type="button" data-clear="season" aria-label="Show every season">&times;</button></span>';
    if (ctx.missingOnly) h += '<span class="pill">Packs that fill missing episodes<button type="button" data-clear="missing" aria-label="Show all packs">&times;</button></span>';
    f.innerHTML = h;
    Array.prototype.forEach.call(f.querySelectorAll('[data-clear]'), function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-clear');
        if (k === 'series') { IMP.seriesLocked = false; ctx.seriesId = null; IMP.seriesCombo.select(null, true); $('#fxSub').textContent = ''; }
        if (k === 'season') IMP.season = null;
        if (k === 'missing') ctx.missingOnly = false;
        renderFilters(); fillPacks(); if (IMP.preview) renderTable();
      });
    });
  }
  function refreshCatalog(force) {
    var st = $('#fxStatus');
    IMP.packCombo.loading('Scanning your download folders...');
    if (force) statusLine(st, 'busy', 'Scanning your download folders and checking them against the library...');
    var url = 'api/catalog?all=1&nowait=1' + (force ? '&refresh=1' : '');
    function go(u, tries) {
      return api(u).then(function (c) {
        DATA.catalog = c; DATA.catalogAt = c.building ? 0 : Date.now();
        if (c.building && (!c.items.length || force) && tries < 90) {
          statusLine(st, 'busy', 'Scanning your download folders and checking them against the library...');
          return sleep(2000).then(function () { return go('api/catalog?all=1&nowait=1', tries + 1); });
        }
        IMP.packCombo.loading(null);
        if (st.className.indexOf('busy') !== -1) statusLine(st, '', '');
        fillPacks();
        if (ctx.pack && !IMP.pack) {
          var it = c.items.find(function (x) { return x.path === ctx.pack; });
          if (it) { IMP.packCombo.select(it.path, true); selectPack(it); }
        }
        return c;
      });
    }
    return go(url, 0).catch(function (e) { IMP.packCombo.loading(null); statusLine(st, 'err', esc(e.message)); });
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
      return { value: x.path, label: x.name, sub: sub.join(' · '), chip: STATE_CHIP[x.state], item: x,
               search: x.name + ' ' + (x.series_title || '') + ' ' + x.seasons };
    }));
    var needs = items.filter(function (x) { return x.state === 'needs' || x.state === 'review'; }).length;
    if (!IMP.pack && !$('#fxStatus').className.match(/busy|err/)) {
      var r = $('#fxResult .ph .s');
      if (r) r.textContent = needs ? plural(needs, 'pack') + ' ' + (needs === 1 ? 'needs' : 'need') + ' attention' + (sid ? ' for this series' : '') + '. Type to search every pack, including finished ones.'
        : 'Nothing here needs importing' + (sid ? ' for this series' : '') + '. Type in the Pack box to search finished packs and run one again.';
    }
  }
  function selectPack(item) {
    IMP.pack = item;
    if (!IMP.seriesLocked && item.series_id) IMP.seriesCombo.select(item.series_id, true);
    runPreview();
  }

  function runPreview() {
    var item = IMP.pack; if (!item) return;
    var st = $('#fxStatus'), res = $('#fxResult');
    IMP.preview = null; IMP.rows = []; foot('');
    statusLine(st, 'busy', 'Matching ' + plural(item.files, 'file') + ' in <b>' + esc(item.name) + '</b> against Sonarr...');
    res.innerHTML = '<div style="margin-top:18px">' + new Array(7).join('<div class="sk"></div>') + '</div>';
    var sid = IMP.seriesCombo.value();
    var token = {}; IMP.token = token;
    api('api/preview', { pack: item.path, series_id: sid || null }).then(function (d) {
      if (IMP.token !== token) return;
      IMP.preview = d;
      if (!IMP.seriesCombo.value()) IMP.seriesCombo.select(d.series.id, true);
      var rows = [];
      d.matched.forEach(function (m) {
        var include = m.library !== 'linked' && m.library !== 'has_file';
        rows.push({ file: m.file, src: m.src, rel: m.rel, episodeId: m.episodeId, episodeIds: m.episodeIds, ep_to: m.ep_to, parts: m.parts,
          title: m.title, season: m.season, confidence: m.confidence, review: m.review, reasons: m.reasons, notes: m.notes,
          method: m.method, library: m.library, minutes: m.minutes, manual: false, include: include });
      });
      d.unmatched.forEach(function (u) {
        var sp = u.special_title;
        rows.push({ file: u.file, src: u.src, rel: u.rel, episodeId: sp ? 'plex-special' : null, title: sp || '', confidence: 0, manual: false,
          reason: u.reason, include: !!sp, season: null });
      });
      IMP.rows = rows;
      var nIn = rows.filter(function (r) { return r.library === 'linked'; }).length;
      if (item.state === 'done' || item.state === 'covered')
        statusLine(st, 'ok', item.state === 'done' ? 'This pack was imported' + (item.imported_at ? ' ' + ago(item.imported_at) : '') +
          '. Running it again re-checks every file; tick any file you want imported again.' : 'Everything in this pack is already in your library from another release. Tick a file to import it anyway.');
      else statusLine(st, '', '');
      if (!d.matched.length) statusLine(st, 'warn', 'Fixarr could not match any file automatically. Pick episodes below.');
      renderTable();
      if (nIn === rows.length && rows.length) statusLine(st, 'ok', 'Every file in this pack is already your library\'s file. Nothing to import.');
    }).catch(function (e) {
      if (IMP.token !== token) return;
      res.innerHTML = '';
      statusLine(st, 'err', esc(e.message));
    });
  }

  function epOptions(eps, selId) {
    var h = '<option value="">(not imported)</option><option value="plex-special"' + (selId === 'plex-special' ? ' selected' : '') + '>&#9733; Special for the media server (Season 00)</option>';
    var cur = null;
    eps.forEach(function (e) {
      if (e.season !== cur) { if (cur !== null) h += '</optgroup>'; cur = e.season; h += '<optgroup label="' + (e.season ? 'Season ' + e.season : 'Specials') + '">'; }
      h += '<option value="' + e.id + '"' + (e.id === selId ? ' selected' : '') + '>S' + pad(e.season) + 'E' + pad(e.episode) + ' · ' + esc(e.title || '') + (e.hasFile ? ' ✓' : '') + '</option>';
    });
    return h + (cur !== null ? '</optgroup>' : '');
  }
  function badge(r) {
    if (r.episodeId === 'plex-special') return { h: '<span class="chip c-plex" title="Placed straight into Season 00 for Plex/Emby/Jellyfin">Season 00</span>', p: '' };
    if (r.manual) return { h: '<span class="chip c-needs">Manual</span>', p: '100%' };
    if (!r.episodeId) return { h: '<span class="chip c-red" title="' + esc(r.reason || '') + '">No match</span>', p: '' };
    var info = (r.reasons || []).concat(r.notes || []).join('\n');
    if (r.method === 'remembered') return { h: '<span class="chip c-done" title="' + esc(info) + '">Remembered</span>', p: '100%' };
    if (r.review) return { h: '<button type="button" class="chip c-review" data-accept title="' + esc(info + '\n\nSelect to accept this match.') + '">Review</button>', p: r.confidence ? r.confidence + '%' : '' };
    if (r.confidence === 100) return { h: '<span class="chip c-done" title="' + esc(info) + '">Exact</span>', p: '100%' };
    return { h: '<span class="chip c-needs" title="' + esc(info) + '">Close</span>', p: r.confidence ? r.confidence + '%' : '' };
  }
  function importable(r) { return r.include && r.episodeId && (r.episodeId === 'plex-special' || !r.review || r.manual); }
  function visibleRows() {
    if (IMP.season == null) return IMP.rows.map(function (r, i) { return i; });
    return IMP.rows.map(function (r, i) { return i; }).filter(function (i) { var r = IMP.rows[i]; return r.season === IMP.season || r.season == null; });
  }
  function renderTable() {
    var d = IMP.preview; if (!d) return;
    var idx = visibleRows();
    var rows = idx.map(function (i) { return IMP.rows[i]; });
    var nOk = rows.filter(function (r) { return r.episodeId && r.episodeId !== 'plex-special' && !r.review; }).length;
    var nRev = rows.filter(function (r) { return r.review && !r.manual; }).length;
    var nLib = rows.filter(function (r) { return r.library === 'linked'; }).length;
    var nNo = rows.filter(function (r) { return !r.episodeId; }).length;
    var hidden = IMP.rows.length - rows.length;
    var html = '<div class="summary"><span><b>' + rows.length + '</b> file' + (rows.length === 1 ? '' : 's') + '</span>' +
      (nOk ? '<span class="chip c-done">' + nOk + ' matched</span>' : '') + (nRev ? '<span class="chip c-review">' + nRev + ' need review</span>' : '') +
      (nNo ? '<span class="chip c-red">' + nNo + ' no match</span>' : '') + (nLib ? '<span class="chip c-muted">' + nLib + ' already in library</span>' : '') +
      (hidden ? '<span>' + plural(hidden, 'file') + ' from other seasons hidden</span>' : '') + '</div>' +
      '<div class="tw"><table><thead><tr><th><input type="checkbox" id="fxAll" title="Select every importable file" aria-label="Select all"></th><th>File</th><th></th><th>Episode</th><th>Title</th><th>Score</th><th>Match</th><th>Library</th></tr></thead><tbody>';
    idx.forEach(function (i) {
      var r = IMP.rows[i], b = badge(r);
      var sub = r.parts ? '<span class="sub">+ ' + plural(r.parts.length - 1, 'more part') + ', joined into one file on import</span>'
        : (r.ep_to ? '<span class="sub">double episode, through E' + pad(r.ep_to) + '</span>' : '');
      if (r.minutes) sub += '<span class="sub">' + Math.round(r.minutes) + ' min</span>';
      var lib = r.library === 'linked' ? '<span class="chip c-muted" title="The library already uses this exact file">In library</span>'
        : r.library === 'has_file' ? '<span class="chip c-muted" title="The library has a different file for this episode; importing replaces it only if Sonarr sees an upgrade">Has a file</span>' : '';
      html += '<tr data-i="' + i + '"' + (r.include ? '' : ' class="off"') + '><td><input type="checkbox" data-inc' + (r.include ? ' checked' : '') + ' aria-label="Import ' + esc(r.file) + '"></td>' +
        '<td class="fn">' + esc(r.file) + sub + '</td><td class="ar">&rarr;</td>' +
        '<td><select data-ep aria-label="Episode for ' + esc(r.file) + '">' + epOptions(d.episodes, r.episodeId) + '</select></td>' +
        '<td><input class="ti" type="text" data-ti value="' + esc(r.title || '') + '" placeholder="(no title)" aria-label="Title"></td>' +
        '<td class="sc">' + (b.p || '-') + '</td><td data-mt>' + b.h + '</td><td>' + lib + '</td></tr>';
    });
    html += '</tbody></table></div>';
    $('#fxResult').innerHTML = html;
    var tb = $('#fxResult tbody');
    Array.prototype.forEach.call(tb.querySelectorAll('tr'), function (tr) {
      var r = IMP.rows[+tr.getAttribute('data-i')];
      tr.querySelector('[data-inc]').addEventListener('change', function (e) { r.include = e.target.checked; tr.classList.toggle('off', !r.include); updateImportButton(); });
      tr.querySelector('[data-ep]').addEventListener('change', function (e) {
        var raw = e.target.value, id = raw ? (raw === 'plex-special' ? 'plex-special' : +raw) : null;
        r.episodeId = id; r.episodeIds = null; r.parts = r.parts && id === r.episodeId ? r.parts : r.parts; r.changed = true;
        r.manual = !!(id && id !== 'plex-special'); r.include = !!id; r.library = null;
        if (id && id !== 'plex-special') {
          var ep = d.episodes.find(function (x) { return x.id === id; });
          r.title = ep ? (ep.title || '') : ''; tr.querySelector('[data-ti]').value = r.title; r.season = ep ? ep.season : null;
        }
        tr.querySelector('[data-inc]').checked = r.include; tr.classList.toggle('off', !r.include);
        var b2 = badge(r); tr.querySelector('.sc').textContent = b2.p || '-'; tr.querySelector('[data-mt]').innerHTML = b2.h; wireAccept(tr, r);
        updateImportButton();
      });
      tr.querySelector('[data-ti]').addEventListener('input', function (e) { r.title = e.target.value; });
      wireAccept(tr, r);
    });
    $('#fxAll').addEventListener('change', function (e) {
      idx.forEach(function (i) { var r = IMP.rows[i]; if (r.episodeId) r.include = e.target.checked; });
      renderTable();
    });
    updateImportButton();
  }
  function wireAccept(tr, r) {
    var a = tr.querySelector('[data-accept]');
    if (a) a.addEventListener('click', function () {
      r.manual = true; r.include = true; tr.querySelector('[data-inc]').checked = true; tr.classList.remove('off');
      var b2 = badge(r); tr.querySelector('[data-mt]').innerHTML = b2.h; updateImportButton();
    });
  }
  function updateImportButton() {
    var n = visibleRows().filter(function (i) { return importable(IMP.rows[i]); }).length;
    foot('<button class="btn primary" type="button" id="fxImport"' + (n ? '' : ' disabled') + '>' + (n ? 'Import ' + plural(n, 'file') : 'Import') + '</button>');
    var b = $('#fxImport'); if (b) b.addEventListener('click', confirmImport);
  }
  function payload(r) {
    var a = { src: r.src, episodeId: r.episodeId, title: r.title || null };
    if (!r.changed) { if (r.parts) a.parts = r.parts; if (r.episodeIds && r.episodeIds.length > 1) a.episodeIds = r.episodeIds; }
    if (r.manual && r.changed) a.remember = true;
    return a;
  }
  function confirmImport() {
    var as = visibleRows().map(function (i) { return IMP.rows[i]; }).filter(importable).map(payload);
    if (!as.length) return;
    var nj = as.filter(function (a) { return a.parts && a.parts.length > 1; }).length;
    var nr = as.filter(function (a) { return a.remember; }).length;
    dialog('Import into ' + IMP.preview.series.title, '<p style="margin:0">Import <b>' + plural(as.length, 'file') + '</b> from <b>' + esc(IMP.pack.name) + '</b>?</p>' +
      '<p style="margin:10px 0 0;color:var(--fx-muted)">Files are hardlinked, so the torrent keeps seeding and no extra space is used.' +
      (nj ? ' ' + plural(nj, 'multi-part episode') + ' will be joined into a new file (uses extra space).' : '') +
      (nr ? ' Your ' + plural(nr, 'manual match', 'manual matches') + ' will be remembered for next time.' : '') +
      ' Every episode is checked afterwards, and the import can be undone from History.</p>', 'Import').then(function (ok) {
      if (ok) runImport(as);
    });
  }
  function runImport(as) {
    busy = true;
    var pd = progressDialog('Importing into ' + IMP.preview.series.title);
    var body = { series_id: IMP.preview.series.id, pack: IMP.pack.path, assignments: as };
    if (ctx.downloadId) body.download_id = ctx.downloadId;
    api('api/import', body).then(function (j) {
      function next() {
        return sleep(1200).then(function () { return api('api/import/' + j.job); }).then(function (s) {
          if (s.step) pd.step(s.step + '...');
          return s.done ? s : next();
        });
      }
      return next();
    }).then(function (s) {
      busy = false; pd.done();
      var d = s.result || {};
      if (d.error) throw new Error(d.error);
      showResult(d);
      DATA.catalogAt = 0; loadOverview(); refreshCatalog(false);
    }).catch(function (e) {
      busy = false; pd.done(); statusLine($('#fxStatus'), 'err', esc(e.message));
    });
  }
  function showResult(d) {
    var st = $('#fxStatus'); statusLine(st, '', '');
    IMP.pack = null; IMP.preview = null; IMP.packCombo.select(null, true); foot('');
    var ok = d.status === 'completed';
    var list = function (items, title) {
      return items && items.length ? '<div class="det"><b>' + title + '</b><ul>' + items.slice(0, 40).map(function (x) {
        return '<li>' + esc(x.episode) + ' (' + esc(x.file) + '): ' + esc(x.reason) + '</li>'; }).join('') + '</ul></div>' : '';
    };
    $('#fxResult').innerHTML = '<div class="ph">' +
      (ok ? '<svg class="ok" viewBox="0 0 24 24" width="50" height="50" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/></svg>' : svgIcon('line', 50)) +
      '<div class="t">' + (d.imported ? (ok ? 'Import complete' : 'Imported with a few gaps') : 'Nothing was imported') + '</div>' +
      '<div class="s">' + (d.imported ? '<b>' + plural(d.imported, 'file') + '</b> landed in <b>' + esc(d.series) + '</b> and ' + (d.imported === 1 ? 'was' : 'were') + ' checked.' : esc(d.message || '')) +
      (d.joined ? ' ' + plural(d.joined, 'multi-part episode') + ' joined.' : '') + (d.plex ? ' ' + plural(d.plex, 'special') + ' placed in Season 00.' : '') + '</div>' +
      '<div style="text-align:left;max-width:640px">' + list(d.skipped, 'Kept the library\'s file') + list(d.failed, 'Did not land') + '</div>' +
      (d.history_id ? '<button class="btn sm" type="button" id="fxUndoNow">Undo this import</button>' : '') + '</div>';
    var u = $('#fxUndoNow'); if (u) u.addEventListener('click', function () { undo(d.history_id, function () { showTab('history'); }); });
  }

  // ================================================================== Activity tab
  function tabActivity() {
    bodyHTML('<div class="status" id="fxStatus" hidden></div><div id="fxAct"><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>');
    foot('<button class="btn" type="button" id="fxCheck">Check now</button>');
    $('#fxCheck').addEventListener('click', function () {
      api('api/resolve', {}).then(function () { statusLine($('#fxStatus'), 'busy', 'Checking Sonarr\'s queue...'); waitResolve(); }).catch(function (e) { statusLine($('#fxStatus'), 'err', esc(e.message)); });
    });
    loadActivity();
  }
  function waitResolve() {
    var t = poll(function () {
      api('api/activity').then(function (a) {
        if (!a.resolver.running) { clearInterval(t); statusLine($('#fxStatus'), 'ok', 'Checked just now.'); renderActivity(a); loadOverview(); DATA.queueAt = 0; }
      });
    }, 2000);
  }
  function loadActivity() {
    return api('api/activity').then(function (a) { renderActivity(a); if (a.resolver.running) { statusLine($('#fxStatus'), 'busy', 'Checking Sonarr\'s queue...'); waitResolve(); } })
      .catch(function (e) { statusLine($('#fxStatus'), 'err', esc(e.message)); $('#fxAct').innerHTML = ''; });
  }
  var KIND = { cleared: ['g', '✓'], imported: ['b', '↓'], audit: ['m', '≡'], undo: ['a', '↶'], webhook: ['m', '⇄'], review: ['a', '!'], relink: ['g', '⇆'] };
  function renderActivity(a) {
    var o = DATA.overview, s = (o && o.settings) || {};
    var auto = s.auto_import || s.auto_clear;
    var waiting = (a.resolver.downloads || []);
    var html = '<p class="hint">' + (auto ? 'Auto mode is on. When Sonarr gets stuck on a download, Fixarr ' +
      [s.auto_import ? 'imports it when every file matches confidently' : '', s.auto_clear ? 'clears it from Sonarr\'s queue when everything is already in your library' : ''].filter(Boolean).join(' and ') +
      '. Torrents keep seeding either way.' : 'Auto mode is off. Turn it on in Settings to let Fixarr handle stuck downloads by itself.') +
      (a.resolver.at ? ' Last checked ' + ago(a.resolver.at) + '.' : '') + '</p>';
    html += '<div class="sec"><h4>Waiting for you' + (waiting.length ? ' <span class="chip c-review">' + waiting.length + '</span>' : '') + '</h4>';
    if (!waiting.length) html += '<p class="hint">Nothing is waiting. Every stuck download has been handled.</p>';
    waiting.forEach(function (d, i) {
      var p = d.plan || {};
      html += '<div class="card"><span class="ic a">!</span><span class="m"><span class="t">' + esc(d.series || 'Unknown series') + '</span>' +
        '<span class="s" title="' + esc(d.title) + '">' + esc(d.title) + '</span><span class="w">' + esc(p.text || 'Needs a look') + '</span></span>' +
        (p.pack ? '<button class="btn sm primary" type="button" data-rev="' + i + '">Review</button>' : '') + '</div>';
    });
    html += '</div><div class="sec"><h4>Recently handled</h4>';
    var log = a.log || [];
    if (!log.length) html += '<p class="hint">Nothing yet. Fixarr lists what it does here.</p>';
    log.slice(0, 60).forEach(function (l) {
      var k = KIND[l.kind] || ['m', '•'];
      html += '<div class="card"><span class="ic ' + k[0] + '">' + k[1] + '</span><span class="m"><span class="t">' + esc(l.text) + '</span>' +
        '<span class="s">' + ago(l.at) + '</span></span>' + (l.slug ? '<a href="/series/' + encodeURIComponent(l.slug) + '" data-nav>Open series</a>' : '') + '</div>';
    });
    html += '</div>';
    $('#fxAct').innerHTML = html;
    Array.prototype.forEach.call($('#fxAct').querySelectorAll('[data-rev]'), function (b) {
      b.addEventListener('click', function () {
        var d = waiting[+b.getAttribute('data-rev')];
        ctx = { pack: d.plan.pack, seriesId: d.plan.series_id || d.series_id, seriesTitle: d.series, downloadId: d.download_id };
        showTab('import');
      });
    });
    wireNav($('#fxAct'));
  }
  function wireNav(el) {
    Array.prototype.forEach.call(el.querySelectorAll('a[data-nav]'), function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault(); closePanel();
        var href = a.getAttribute('href');
        history.pushState({}, '', href); window.dispatchEvent(new PopStateEvent('popstate'));
      });
    });
  }

  // ================================================================== History tab
  function tabHistory() {
    bodyHTML('<div class="status" id="fxStatus" hidden></div><div id="fxHist"><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>');
    api('api/history').then(renderHistory).catch(function (e) { statusLine($('#fxStatus'), 'err', esc(e.message)); $('#fxHist').innerHTML = ''; });
  }
  function renderHistory(list) {
    var html = '<p class="hint">Every import and relink Fixarr has made, newest first. Undo moves what it added to Sonarr\'s recycle bin and puts back anything it replaced.</p>';
    if (!list.length) html += '<div class="ph">' + svgIcon('line', 44) + '<div class="t">No history yet</div><div class="s">Imports you run, and the ones auto mode runs, show up here.</div></div>';
    list.forEach(function (e, i) {
      var head = e.kind === 'relink' ? 'Relinked ' + plural(e.landed || 0, 'file') + (e.freed ? ', freed ' + gb(e.freed) : '')
        : plural((e.landed || 0) + ((e.placed || []).length), 'file') + ' into ' + esc(e.series || '');
      var chips = (e.auto ? '<span class="chip c-needs">Auto</span> ' : '') + (e.undone ? '<span class="chip c-muted">Undone</span> ' : '') +
        ((e.failed || []).length ? '<span class="chip c-red">' + (e.failed || []).length + ' did not land</span> ' : '') +
        ((e.skipped || []).length ? '<span class="chip c-muted">' + (e.skipped || []).length + ' kept</span> ' : '') +
        (e.joined ? '<span class="chip c-plex">' + e.joined + ' joined</span>' : '');
      var det = (e.failed || []).concat(e.skipped || []);
      html += '<div class="card" style="align-items:flex-start"><span class="ic ' + (e.undone ? 'm' : (e.failed || []).length ? 'a' : 'g') + '">' + (e.undone ? '↶' : '✓') + '</span>' +
        '<span class="m"><span class="t">' + head + '</span><span class="s">' + esc(e.pack_name || e.series || '') + ' · ' + ago(e.at) + '</span>' +
        '<span class="w">' + chips + '</span>' +
        (det.length ? '<div class="det"><ul>' + det.slice(0, 20).map(function (x) { return '<li>' + esc(x.episode) + ': ' + esc(x.reason) + '</li>'; }).join('') + '</ul></div>' : '') + '</span>' +
        (e.slug ? '<a href="/series/' + encodeURIComponent(e.slug) + '" data-nav style="white-space:nowrap">Open series</a>' : '') +
        (e.can_undo ? '<button class="btn sm" type="button" data-undo="' + esc(e.id) + '">Undo</button>' : '') + '</div>';
    });
    $('#fxHist').innerHTML = html;
    Array.prototype.forEach.call($('#fxHist').querySelectorAll('[data-undo]'), function (b) {
      b.addEventListener('click', function () { undo(b.getAttribute('data-undo'), tabHistory); });
    });
    wireNav($('#fxHist'));
  }
  function undo(id, after) {
    dialog('Undo this?', '<p style="margin:0">Files this added go to Sonarr\'s recycle bin, and any library files it replaced are put back. Sonarr then rescans the series.</p>', 'Undo', true).then(function (ok) {
      if (!ok) return;
      busy = true; var pd = progressDialog('Undoing'); pd.step('Restoring the library...');
      api('api/history/' + encodeURIComponent(id) + '/undo', {}).then(function (r) {
        busy = false; pd.done(); DATA.catalogAt = 0; loadOverview();
        if (after) after();
        setTimeout(function () { var st = $('#fxStatus'); if (st) statusLine(st, 'ok', 'Undone: ' + plural(r.removed, 'file') + ' moved to the recycle bin, ' + plural(r.restored, 'file') + ' restored.'); }, 50);
      }).catch(function (e) { busy = false; pd.done(); var st = $('#fxStatus'); if (st) statusLine(st, 'err', esc(e.message)); });
    });
  }

  // ================================================================== Audit tab
  function tabAudit() {
    bodyHTML('<div class="status" id="fxStatus" hidden></div><div id="fxAud"><div class="sk"></div><div class="sk"></div></div>');
    foot('<button class="btn" type="button" id="fxRunAudit">Run audit now</button>');
    $('#fxRunAudit').addEventListener('click', function () {
      api('api/audit', {}).then(function () { watchAudit(); }).catch(function (e) { statusLine($('#fxStatus'), 'err', esc(e.message)); });
    });
    loadAudit();
  }
  function loadAudit() {
    return api('api/audit').then(function (r) { renderAudit(r); if (r.running) watchAudit(); }).catch(function (e) { statusLine($('#fxStatus'), 'err', esc(e.message)); });
  }
  function watchAudit() {
    var t = poll(function () {
      api('api/audit').then(function (r) {
        if (r.running) statusLine($('#fxStatus'), 'busy', esc(r.progress || 'Auditing the library...'));
        else { clearInterval(t); statusLine($('#fxStatus'), 'ok', 'Audit finished.'); renderAudit(r); }
      });
    }, 2000);
    statusLine($('#fxStatus'), 'busy', 'Auditing the library...');
  }
  function renderAudit(r) {
    var s = (DATA.overview && DATA.overview.settings) || {};
    var html = '<p class="hint">' + (r.at ? 'Last audit ' + ago(r.at) + ' across ' + plural(r.series || 0, 'series', 'series') + '. ' : 'The library has not been audited yet. ') +
      (s.audit_nightly ? 'It runs every night at ' + (s.audit_hour || 0) + ':00.' : 'The nightly audit is off (Settings).') + '</p>';
    var mis = r.mislabeled || [], unl = r.unlinked || [];
    html += '<div class="sec"><h4>Possibly mislabeled' + (mis.length ? ' <span class="chip c-review">' + mis.length + '</span>' : '') + '</h4>';
    html += mis.length ? '<p class="hint">The original release name of these files names a different episode than the one they are filed under. Open the series to check; import the right file with Fixarr if it is wrong.</p>' :
      '<p class="hint">' + (r.at ? 'None found.' : 'Run an audit to check.') + '</p>';
    mis.slice(0, 200).forEach(function (m) {
      html += '<div class="card"><span class="ic a">?</span><span class="m"><span class="t">' + esc(m.series) + ': filed as ' + esc(m.filed_as) + '</span>' +
        '<span class="s" title="' + esc(m.release) + '">Release name looks like ' + esc(m.looks_like) + ' · ' + esc(m.release) + '</span></span>' +
        (m.slug ? '<a href="/series/' + encodeURIComponent(m.slug) + '" data-nav>Open series</a>' : '') + '</div>';
    });
    html += '</div><div class="sec"><h4>Not hardlinked' + (unl.length ? ' <span class="chip c-review">' + unl.length + '</span>' : '') + '</h4>';
    html += unl.length ? '<p class="hint">These library files are separate copies of files that are still seeding, using ' + gb(r.wasted || 0) +
      ' twice. Relinking checks that both copies are byte-identical, moves the library copy to Sonarr\'s recycle bin and links the seeding copy in its place.</p>' +
      '<label style="display:flex;gap:8px;align-items:center;margin-bottom:8px;font-size:13px"><input type="checkbox" id="fxRlAll"> Select all</label>' :
      '<p class="hint">' + (r.at ? 'Every library file is hardlinked or has no seeding copy.' : 'Run an audit to check.') + '</p>';
    unl.slice(0, 300).forEach(function (u, i) {
      html += '<div class="card"><input type="checkbox" data-rl="' + i + '" aria-label="Relink ' + esc(u.path) + '"><span class="m"><span class="t">' + esc(u.series) + (u.episode ? ' · ' + esc(u.episode) : '') + ' · ' + gb(u.size) + '</span>' +
        '<span class="s" title="' + esc(u.path) + '">' + esc(u.path) + '</span></span></div>';
    });
    html += '</div>';
    $('#fxAud').innerHTML = html; wireNav($('#fxAud'));
    var boxes = $('#fxAud').querySelectorAll('[data-rl]');
    function upd() {
      var n = Array.prototype.filter.call(boxes, function (b) { return b.checked; }).length;
      foot('<button class="btn" type="button" id="fxRunAudit">Run audit now</button>' + (unl.length ? ' <button class="btn primary" type="button" id="fxRelink"' + (n ? '' : ' disabled') + '>Relink ' + (n ? plural(n, 'file') : '') + '</button>' : ''));
      $('#fxRunAudit').addEventListener('click', function () { api('api/audit', {}).then(watchAudit); });
      var rb = $('#fxRelink');
      if (rb) rb.addEventListener('click', function () {
        var paths = Array.prototype.filter.call(boxes, function (b) { return b.checked; }).map(function (b) { return unl[+b.getAttribute('data-rl')].path; });
        dialog('Relink ' + plural(paths.length, 'file') + '?', '<p style="margin:0">Each library file is compared byte for byte with its seeding copy first. Only identical files are relinked; the old copies go to Sonarr\'s recycle bin (emptied after its retention period). This can be undone from History.</p>', 'Relink').then(function (ok) {
          if (!ok) return;
          busy = true; var pd = progressDialog('Relinking'); pd.step('Comparing and relinking...');
          api('api/audit/relink', { paths: paths }).then(function (res) {
            busy = false; pd.done(); loadAudit().then(function () {
              statusLine($('#fxStatus'), res.problems.length ? 'warn' : 'ok', 'Relinked ' + plural(res.relinked, 'file') + '.' +
                (res.problems.length ? ' Skipped ' + res.problems.length + ': ' + esc(res.problems.slice(0, 3).map(function (p) { return p.reason; }).join('; ')) : ''));
            });
          }).catch(function (e) { busy = false; pd.done(); statusLine($('#fxStatus'), 'err', esc(e.message)); });
        });
      });
    }
    Array.prototype.forEach.call(boxes, function (b) { b.addEventListener('change', upd); });
    var all = $('#fxRlAll'); if (all) all.addEventListener('change', function () { Array.prototype.forEach.call(boxes, function (b) { b.checked = all.checked; }); upd(); });
    upd();
  }

  // ================================================================== Settings (dialog, Payloads layout)
  var SD = null;   // { section, s, maps, health }
  var SD_ICON = {
    general: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    matching: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    audit: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    addon: '<path d="M19.4 13a2.5 2.5 0 0 0 0-4H18V6a2 2 0 0 0-2-2h-3V2.6a2.5 2.5 0 0 0-4 0V4H6a2 2 0 0 0-2 2v3h1.4a2.5 2.5 0 0 1 0 5H4v4a2 2 0 0 0 2 2h4v-1.4a2.5 2.5 0 0 1 5 0V20h1a2 2 0 0 0 2-2v-5z"/>',
    updates: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
    memory: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
    appearance: '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 0 0 0 20c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a6 6 0 0 0 6-6c0-4.4-4.5-8.6-10-8.6z"/>',
    about: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    gear: '<path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'
  };
  function sdIco(k, size) {
    return '<svg class="ico" viewBox="0 0 24 24" width="' + (size || 16) + '" height="' + (size || 16) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + SD_ICON[k] + '</svg>';
  }
  var SD_SECTIONS = [
    ['general', 'General'], ['matching', 'Matching'], ['audit', 'Library audit'], ['addon', 'Sonarr add-on'],
    ['updates', 'Updates'], ['memory', 'Remembered matches'], ['appearance', 'Appearance'], ['about', 'About']
  ];
  function sdSections() { return SD_SECTIONS.filter(function (x) { return x[0] !== 'appearance' || STANDALONE; }); }

  function openSettings(section) {
    mount();
    var d = $('#fxSettings');
    SD = { section: section || (SD && SD.section) || 'general', s: null, maps: [], health: null };
    d.innerHTML = '<div class="sd" role="dialog" aria-modal="true" aria-labelledby="sdH">' +
      '<nav class="sd-nav"><div class="sd-brand">' + svgIcon('solid', 20) + '<span>Settings</span></div>' +
      '<div class="sd-tabs" role="tablist" aria-orientation="vertical">' + sdSections().map(function (x) {
        return '<button type="button" role="tab" data-sec="' + x[0] + '" aria-selected="false">' + sdIco(x[0]) + '<span>' + x[1] + '</span></button>';
      }).join('') + '</div>' +
      '<div class="sd-foot"><a class="sd-gh" href="https://github.com/' + REPO + '" target="_blank" rel="noopener">' +
      '<svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2.2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0C17.3 4.3 18.3 4.6 18.3 4.6c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5z"/></svg>' +
      '<span>Fixarr on GitHub</span></a><div class="sd-ver">Fixarr v' + VERSION + '</div></div></nav>' +
      '<section class="sd-main"><header class="sd-h"><h2 id="sdH"></h2><span class="sd-saved" id="sdSaved" aria-live="polite"></span>' +
      '<button type="button" class="sd-x" data-sdclose aria-label="Close settings"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></header>' +
      '<div class="sd-body" id="sdBody"><div class="sk"></div><div class="sk"></div><div class="sk"></div></div></section></div>';
    d.hidden = false;
    d.onmousedown = function (e) { if (e.target === d) closeSettings(); };
    d.querySelector('[data-sdclose]').addEventListener('click', closeSettings);
    Array.prototype.forEach.call(d.querySelectorAll('[role=tab]'), function (b) {
      b.addEventListener('click', function () { sdShow(b.getAttribute('data-sec')); });
      b.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        var tabs = Array.prototype.slice.call(d.querySelectorAll('[role=tab]')), i = tabs.indexOf(b);
        var n = tabs[(i + (e.key === 'ArrowDown' ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); n.click();
      });
    });
    Promise.all([api('api/settings'), api('api/mappings').catch(function () { return []; }), api('api/health').catch(function () { return {}; }), loadOverview()])
      .then(function (r) { SD.s = r[0]; SD.maps = r[1]; SD.health = r[2]; sdShow(SD.section); })
      .catch(function (e) { $('#sdBody').innerHTML = '<div class="status err"><span>' + esc(e.message) + '</span></div>'; });
    sdShow(SD.section, true);
    var cur = d.querySelector('[role=tab][aria-selected=true]'); if (cur) cur.focus();
  }
  function closeSettings() { var d = $('#fxSettings'); if (d && !d.hidden) { d.hidden = true; d.innerHTML = ''; updateBadges(); scheduleEnsure(); } }
  function settingsOpen() { var d = root && root.querySelector('#fxSettings'); return !!(d && !d.hidden); }

  function sdShow(sec, skeletonOnly) {
    SD.section = sec;
    var d = $('#fxSettings');
    Array.prototype.forEach.call(d.querySelectorAll('[role=tab]'), function (b) { b.setAttribute('aria-selected', b.getAttribute('data-sec') === sec ? 'true' : 'false'); });
    var name = (SD_SECTIONS.filter(function (x) { return x[0] === sec; })[0] || ['', ''])[1];
    $('#sdH').textContent = name;
    if (skeletonOnly || !SD.s) return;
    var b = $('#sdBody'); b.scrollTop = 0;
    b.innerHTML = ({ general: sdGeneral, matching: sdMatching, audit: sdAudit, addon: sdAddon, updates: sdUpdates,
                     memory: sdMemory, appearance: sdAppearance, about: sdAbout })[sec]();
    sdWire(b);
  }

  // row builders
  function srow(title, sub, control, extra) {
    return '<div class="srow' + (extra || '') + '"><div class="st"><b>' + title + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>' + (control || '') + '</div>';
  }
  function swc(key, label, disabled) {
    return '<label class="switch"><input type="checkbox" data-k="' + key + '"' + (SD.s[key] ? ' checked' : '') + (disabled ? ' disabled' : '') +
      ' aria-label="' + esc(label) + '"><span></span></label>';
  }
  function selc(key, opts, label) {
    return '<select class="select" data-k="' + key + '" data-num="1" aria-label="' + esc(label) + '">' + opts.map(function (o) {
      return '<option value="' + o[0] + '"' + (String(SD.s[key]) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('') + '</select>';
  }
  function segc(key, opts, label) {
    return '<div class="seg" role="radiogroup" aria-label="' + esc(label) + '">' + opts.map(function (o) {
      return '<button type="button" role="radio" data-seg="' + key + '" data-v="' + o[0] + '" aria-checked="' + (String(SD.s[key]) === String(o[0])) + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }
  function codeRow(text, label) {
    return '<div class="sd-code"><code>' + esc(text) + '</code><button type="button" class="sd-copy" data-copy="' + esc(text) + '" aria-label="Copy ' + esc(label) + '" title="Copy">' + sdIco('copy', 15) + '</button></div>';
  }
  function hourLabel(h) { return (h % 12 || 12) + ':00 ' + (h < 12 ? 'AM' : 'PM'); }

  // sections
  function sdGeneral() {
    var s = SD.s;
    return srow('Import stuck downloads automatically', 'When Sonarr cannot import a download and every file matches confidently, Fixarr imports it and tags it to the download so Sonarr closes it.', swc('auto_import', 'Import stuck downloads automatically')) +
      srow('Clear finished downloads from Sonarr\'s queue', 'When every episode in a stuck download is already in your library, Fixarr stops Sonarr tracking it. Files stay and the torrent keeps seeding.', swc('auto_clear', 'Clear finished downloads')) +
      srow('Lowest match score for auto import', 'Anything below this waits for you in Activity.', selc('min_confidence', [[80, '80%'], [85, '85%'], [90, '90% (recommended)'], [95, '95%'], [100, '100% only']], 'Lowest match score')) +
      srow('Check Sonarr\'s queue every', 'The Sonarr webhook makes Fixarr react at once; this is the safety net.', selc('resolve_minutes', [[5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour'], [120, '2 hours']], 'Queue check interval')) +
      srow('Sonarr webhook', 'In Sonarr: Settings, Connect, add a Webhook with this URL and tick only "On Manual Interaction Required".', '', ' stack') .replace('</div></div>', '</div>' + codeRow('http://fixarr:8686/api/hook/sonarr', 'webhook URL') + '</div>');
  }
  function sdMatching() {
    var o = DATA.overview || {};
    return srow('Check runtimes', 'Flags files much longer or shorter than the series runtime (double episodes, trailers, wrong files) for review.', swc('runtime_check', 'Check runtimes')) +
      srow('Ask Plex to scan specials', o.plex ? 'After Fixarr places specials in Season 00 itself. Sonarr tells Plex about everything else.' : 'Set PLEX_URL and PLEX_TOKEN on the Fixarr container to use this.', swc('plex_scan', 'Ask Plex to scan specials', !o.plex)) +
      '<p class="sd-note">Multi-part episodes (a/b, Part 1/2, Pt.One, CD1/CD2, Disc 1/2, "1 of 2") are joined losslessly into one MKV on import. MKV, MP4, M4V, MOV, AVI, MPG, VOB and TS parts can be joined; WMV parts cannot.</p>';
  }
  function sdAudit() {
    var hours = []; for (var h = 0; h < 24; h++) hours.push([h, hourLabel(h)]);
    return srow('Audit the library every night', 'Finds episodes that may be mislabeled and library files that are not hardlinked to their seeding copy.', swc('audit_nightly', 'Nightly audit')) +
      srow('Time to run it', 'Server local time.', selc('audit_hour', hours, 'Audit time')) +
      srow('Sonarr\'s recycle bin', (DATA.overview || {}).recycle_bin ? 'Set. Undo and relink move replaced files there instead of deleting them.' :
        'Not set. Undo and relink need it: Sonarr, Settings, Media Management, Recycling Bin.', '<span class="chip ' + ((DATA.overview || {}).recycle_bin ? 'c-done">Ready' : 'c-review">Not set') + '</span>');
  }
  function sdAddon() {
    var h = (SD.health || {}).layer || null, live = h && h.at && Date.now() / 1000 - h.at < 7 * 86400;
    var where = [], seen = (h && h.seen) || {}, recent = function (k) { return seen[k] && Date.now() / 1000 - seen[k] < 30 * 86400; };
    [['nav', 'menu'], ['series', 'series pages'], ['season', 'season rows'], ['wanted', 'Wanted'], ['queue', 'Activity queue']].forEach(function (x) { if (recent(x[0])) where.push(x[1]); });
    var status = live ? 'Running in Sonarr ' + esc(h.sonarr || '') + ', last seen ' + ago(h.at) + (where.length ? '. Working on: ' + where.join(', ') + '.' : '.') +
      (h.fallback ? ' The menu entry could not be placed, so the floating Fixarr button is showing instead.' : '') :
      'Not seen in Sonarr yet. Install it with one of the two ways below, then open Sonarr once.';
    return '<div class="sd-hero"><div class="sd-hero-i">' + sdIco('addon', 22) + '</div><div><b>Fixarr, right inside Sonarr</b>' +
      '<p>The add-on puts Fixarr where you already work: an entry in Sonarr\'s menu, Fixarr buttons on series pages and on every season, and on the Wanted and Activity pages. ' +
      'It takes its colors from Sonarr\'s own theme and finds its place by Sonarr\'s labels, so it looks native and keeps working after Sonarr updates. Sonarr itself is never changed or forked.</p></div></div>' +
      srow('Status', status, '<span class="chip ' + (live ? 'c-done">Active' : 'c-muted">Not installed') + '</span>') +
      srow('Series pages', 'A Fixarr button in the series toolbar.', swc('addon_series', 'Series pages')) +
      srow('Season rows', 'A Fixarr icon on every season. It turns blue when a pack on disk has episodes that season is missing.', swc('addon_seasons', 'Season rows')) +
      srow('Wanted', 'A Fixarr button with the number of missing episodes packs on disk can fill, and an icon on those rows.', swc('addon_wanted', 'Wanted')) +
      srow('Activity queue', 'A Fixarr button with the downloads Fixarr is handling, and an icon on those rows.', swc('addon_queue', 'Activity queue')) +
      '<p class="sd-note">The Fixarr menu entry is always shown while the add-on is installed; it is how you reach Fixarr from Sonarr.</p>' +
      '<div class="srow stack"><div class="st"><b>Install with a reverse proxy (recommended)</b><small>Serve Fixarr under /fixarr/ on Sonarr\'s address and add one script tag to Sonarr\'s page. For Nginx or Nginx Proxy Manager (Advanced tab of the Sonarr host):</small></div>' +
      codeRow('location ^~ /fixarr/ { proxy_pass http://fixarr:8686/; proxy_read_timeout 300s; }\nsub_filter \'</head>\' \'<script defer src="/fixarr/layer.js"></script></head>\';\nsub_filter_once on;\nproxy_set_header Accept-Encoding "";', 'proxy snippet') + '</div>' +
      '<div class="srow stack"><div class="st"><b>Install with a userscript (no proxy changes)</b><small>Set CORS_ORIGINS on the Fixarr container to your Sonarr address, install Violentmonkey or Tampermonkey in your browser, then open this link and accept the install. Replace the Sonarr address with yours.</small></div>' +
      codeRow(BASE + 'fixarr.user.js?sonarr=https://sonarr.example.com', 'userscript link') + '</div>';
  }
  function sdUpdates() {
    var v = (DATA.overview || {}).version || {};
    var state = v.update ? 'Version ' + esc(v.latest) + ' is available' + (v.major ? '. It is a major update; read its notes before updating.' : '.') :
      v.note ? esc(v.note) + '.' : v.latest ? 'You are up to date.' : (SD.s.update_check ? 'Not checked yet.' : 'Update checks are off.');
    return srow('Fixarr ' + esc(v.version || VERSION), state + (v.checked ? ' Last checked ' + ago(v.checked) + '.' : ''),
        '<div class="sd-acts">' + (v.update && v.url ? '<a class="btn sm" href="' + esc(v.url) + '" target="_blank" rel="noopener">Release notes</a>' : '') +
        '<button type="button" class="btn sm" data-act="check">Check now</button></div>') +
      srow('Check for updates', 'Looks for a new release on GitHub once a day and shows it here and in the Fixarr window. Nothing else is sent.', swc('update_check', 'Check for updates')) +
      srow('Update channel', 'Stable gets finished releases. Beta also gets test releases before they are finished.', segc('update_channel', [['stable', 'Stable'], ['beta', 'Beta']], 'Update channel')) +
      srow('Install updates automatically', (v.method === 'docker' || !v.method) ?
          'This install runs in Docker, so the container is updated by your container updater, not by Fixarr. With Watchtower, Fixarr updates itself whenever a new image is published (image <code>ghcr.io/apex-tech-labs/fixarr:latest</code>). Major updates are always announced first.' :
          'Installs new releases by itself when no import is running, and keeps the previous version so it can roll back. Major updates are always announced first.',
        (v.method === 'docker' || !v.method) ? '<span class="chip c-muted" title="Updated by Watchtower or your own container updater">Docker</span>' : swc('auto_install', 'Install updates automatically'));
  }
  function sdMemory() {
    var maps = SD.maps || [];
    var h = '<p class="sd-note" style="padding-top:12px">When you correct a match by hand, Fixarr remembers it for that file name and uses it the next time it sees the file.</p>';
    if (!maps.length) return h + '<div class="ph" style="min-height:200px">' + sdIco('memory', 36) + '<div class="s">No remembered matches yet.</div></div>';
    return h + maps.map(function (m, i) {
      return srow(esc(m.series) + ' · ' + esc(m.label), esc(m.key) + ' · ' + ago(m.at), '<button type="button" class="btn sm" data-forget="' + i + '">Forget</button>');
    }).join('');
  }
  var THEMES = [['auto', 'Auto'], ['sonarr-dark', 'Sonarr Dark'], ['sonarr-light', 'Sonarr Light'], ['harbor', 'Harbor'], ['apex', 'Apex']];
  function sdAppearance() {
    var cur = 'auto'; try { cur = localStorage.getItem('fixarr-theme') || 'auto'; } catch (e) {}
    return srow('Theme', 'Auto follows your device\'s light or dark setting. Inside Sonarr, Fixarr always uses Sonarr\'s own theme.',
      '<div class="seg" role="radiogroup" aria-label="Theme">' + THEMES.map(function (t) {
        return '<button type="button" role="radio" data-theme="' + t[0] + '" aria-checked="' + (t[0] === cur) + '">' + t[1] + '</button>';
      }).join('') + '</div>', ' stack');
  }
  function sdAbout() {
    var v = (DATA.overview || {}).version || {};
    return '<div class="sd-about">' + svgIcon('solid', 44) + '<div><b>Fixarr</b><span>Imports the season packs Sonarr can\'t, from inside Sonarr\'s own UI.</span></div></div>' +
      srow('Version', 'Fixarr ' + esc(v.version || VERSION) + (v.channel === 'beta' ? ' (beta channel)' : ''), '') +
      srow('Source code', 'Free and open source under the GNU GPL v3.0.', '<a class="btn sm" href="https://github.com/' + REPO + '" target="_blank" rel="noopener">GitHub</a>') +
      srow('Report a problem', 'Include what you clicked and the pack name; never paste API keys.', '<a class="btn sm" href="https://github.com/' + REPO + '/issues" target="_blank" rel="noopener">Issues</a>') +
      srow('Made by', 'Apex Tech Labs', '');
  }

  // saving and actions
  var sdTimer = null, sdPending = {};
  function sdSave(key, val) {
    sdPending[key] = val; SD.s[key] = val;
    clearTimeout(sdTimer);
    sdTimer = setTimeout(function () {
      var body = sdPending; sdPending = {};
      api('api/settings', body).then(function (s2) {
        SD.s = s2; if (DATA.overview) DATA.overview.settings = s2;
        var el = $('#sdSaved'); if (el) { el.textContent = 'Saved'; el.className = 'sd-saved on'; setTimeout(function () { if (el) el.className = 'sd-saved'; }, 1400); }
        if ('update_channel' in body || 'update_check' in body) api('api/version?force=1').then(function () { return loadOverview(); }).then(function () { if (SD && SD.section === 'updates') sdShow('updates'); });
        if (/^addon_/.test(Object.keys(body).join(' '))) scheduleEnsure();
      }).catch(function (e) { var el = $('#sdSaved'); if (el) { el.textContent = e.message; el.className = 'sd-saved on err'; } });
    }, 250);
  }
  function sdWire(b) {
    Array.prototype.forEach.call(b.querySelectorAll('[data-k]'), function (inp) {
      inp.addEventListener('change', function () { sdSave(inp.getAttribute('data-k'), inp.type === 'checkbox' ? inp.checked : (inp.getAttribute('data-num') ? +inp.value : inp.value)); });
    });
    Array.prototype.forEach.call(b.querySelectorAll('[data-seg]'), function (btn) {
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(btn.parentElement.children, function (x) { x.setAttribute('aria-checked', x === btn ? 'true' : 'false'); });
        sdSave(btn.getAttribute('data-seg'), btn.getAttribute('data-v'));
      });
    });
    Array.prototype.forEach.call(b.querySelectorAll('[data-theme]'), function (btn) {
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(btn.parentElement.children, function (x) { x.setAttribute('aria-checked', x === btn ? 'true' : 'false'); });
        if (window.fixarrTheme) window.fixarrTheme(btn.getAttribute('data-theme'));
      });
    });
    Array.prototype.forEach.call(b.querySelectorAll('[data-copy]'), function (btn) {
      btn.addEventListener('click', function () {
        var t = btn.getAttribute('data-copy');
        (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () {
          btn.classList.add('done'); setTimeout(function () { btn.classList.remove('done'); }, 1200);
        }).catch(function () { var r = document.createRange(); r.selectNodeContents(btn.previousElementSibling); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); });
      });
    });
    Array.prototype.forEach.call(b.querySelectorAll('[data-forget]'), function (btn) {
      btn.addEventListener('click', function () {
        var m = SD.maps[+btn.getAttribute('data-forget')];
        api('api/mappings/' + m.series_id + '/' + encodeURIComponent(m.key), undefined, 'DELETE').then(function () {
          SD.maps = SD.maps.filter(function (x) { return x !== m; }); sdShow('memory');
        });
      });
    });
    var chk = b.querySelector('[data-act=check]');
    if (chk) chk.addEventListener('click', function () {
      chk.disabled = true; chk.innerHTML = '<span class="spin"></span>Checking';
      api('api/version?force=1').then(loadOverview).then(function () { renderHeader(); sdShow('updates'); })
        .catch(function (e) { chk.disabled = false; chk.textContent = 'Check now'; var el = $('#sdSaved'); if (el) { el.textContent = e.message; el.className = 'sd-saved on err'; } });
    });
  }

  // ================================================================== start
  function start() {
    mount();
    if (STANDALONE) {
      root.querySelector('.wrap').classList.add('alone');
      loadSlugs().catch(function () {});
      openPanel({ tab: (location.hash.replace('#', '') || 'import') });
      $('#fxGear').addEventListener('click', function () { openSettings(); });
      setInterval(function () { if (!document.hidden) loadOverview(); }, 180000);
      return;
    }
    $('#fxGear').addEventListener('click', function () { openSettings(); });
    ensure();
    new MutationObserver(scheduleEnsure).observe(document.body, { childList: true, subtree: true });
    ['pushState', 'replaceState'].forEach(function (m) {
      var orig = history[m];
      history[m] = function () { var r = orig.apply(this, arguments); scheduleEnsure(); return r; };
    });
    window.addEventListener('popstate', scheduleEnsure);
    loadSlugs().catch(function () {});
    loadOverview();
    setInterval(function () { if (!document.hidden) loadOverview(); }, 180000);
    if (location.hash === '#fixarr') openPanel({});
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
