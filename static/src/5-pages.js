
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
