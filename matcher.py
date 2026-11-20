"""fixarr matcher v2.

Pure functions, no I/O: takes pack-relative file paths plus Sonarr's episode
list and returns assignments. Tested by tests/run.py against real fixtures.

Pipeline:
  1. parse every file into signals (numbers in several formats, air date,
     clean title, part number, special/sample flags, folder season)
  2. measure how far the pack's numbering can be trusted (titled files whose
     numbers agree with their title match)
  3. group multi-part files that belong to one episode (joined on import)
  4. score every file against every episode, assign one-to-one, best first
  5. fill untitled runs between anchors in order (sequence alignment)
  6. fall back to numbers, flagging them for review when trust is low
"""
import os, re, difflib

VIDEXT = {'.avi', '.mkv', '.mp4', '.m4v', '.mpg', '.mpeg', '.wmv', '.ts'}

# Anything from the first of these onward is release info, not title.
_STRONG = (r'(?:2160p|1080[pi]|720p|576p|480p|4k|uhd|x26[45]|h[ .]?26[45]|hevc|avc|xvid|divx|'
           r'web[ -]?dl|webrip|web|hdtv|pdtv|dsr|tvrip|dvdrip|dvd|bdrip|brrip|bluray|blu ray|remux|hdrip|'
           r'ai upscale|10bit|ddp?\d|aac\d|eac3|ac3|dts|truehd)')
_STRONG_RE = re.compile(r'\b' + _STRONG + r'\b', re.I)
# Trailing junk left after the cut (services, scene flags).
_TRAIL_RE = re.compile(r'(?:\b(?:amzn|hulu|nf|dsnp|hmax|max|roku|atvp|pcok|ws|fs|internal|proper|repack|real|rerip|'
                       r'nordic|multi|complete|uncut|extended)\b\s*)+$', re.I)
_SPECIAL_RE = re.compile(r'\b(specials?|bonus|extras?|christmas|xmas|best of|compilations?|complation|'
                         r'behind the scenes|making of|reunion|recap)\b', re.I)
_GENERIC_EP = re.compile(r'^(episode|ep|chapter|part)?\s*\d+$|^tb[ad]$|^$', re.I)
_WORDNUM = {'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8}
_PART_RE = re.compile(r'\b(?:part|pt|cd|disc|disk)\.?\s?(\d{1,2}|one|two|three|four|five|six|seven|eight|[a-d])\b|\b([1-8])\s?of\s?[2-8]\b', re.I)
_NOT_EP = {'264', '265', '480', '576', '720', '1080', '2160'}


# ----------------------------------------------------------------- helpers
def spaced(s):
    s = re.sub(r'[._]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def tnorm(x):
    x = (x or '').lower().replace('&', ' and ').replace('%', ' percent ').replace('+', ' plus ')
    x = re.sub(r"['’`]", '', x)
    x = re.sub(r'[^a-z0-9]+', ' ', x)
    return ' '.join(w for w in x.split() if w not in ('the', 'a', 'an'))

def tsim(a, b):
    """Title similarity on tnorm'd strings, 0..1."""
    if not a or not b: return 0.0
    na, nb = a.replace(' ', ''), b.replace(' ', '')
    if na == nb: return 1.0
    r = difflib.SequenceMatcher(None, na, nb).ratio()
    ta, tb = set(a.split()), set(b.split())
    tok = 2 * len(ta & tb) / (len(ta) + len(tb))
    cont = 0.9 if min(len(na), len(nb)) >= 8 and (na in nb or nb in na) else 0.0
    best = max(r, tok * 0.97, cont)
    da, db = re.findall(r'\d+', a), re.findall(r'\d+', b)
    if da and db and da != db: best = min(best, 0.75)   # "Season 5 Reunion" is not "Season 6 Reunion"
    return best

def _partless(t):
    """'crossing part 1', 'crossing pt one' and 'crossing 1' (from "The Crossing (1)") compare equal."""
    w = [str(_WORDNUM.get(x, x)) for x in (t or '').split() if x not in ('part', 'pt')]
    return ' '.join(w)

def strip_series(text, series_title, anywhere=True):
    """Remove the show name (and a trailing year) from the front, or from anywhere.
    Titles after the episode number only lose a leading show name: "Love at the Jersey Shore" keeps its words."""
    if not series_title: return text
    words = tnorm(series_title).split()
    if not words: return text
    pat = r'\b' + r'\W*'.join(re.escape(w) for w in words) + r'\b(?:\W*\(?(?:19|20)\d\d\)?)?'
    t = re.sub(r'^\s*(?:the\s+)?' + pat, ' ', text, flags=re.I)
    if anywhere: t = re.sub(pat, ' ', t, flags=re.I)
    return re.sub(r'\s+', ' ', t).strip(' -')


# ----------------------------------------------------------------- parsing
def parse_file(rel, series_title=''):
    fn = os.path.basename(rel)
    stem = os.path.splitext(fn)[0]
    s = spaced(stem)
    f = dict(rel=rel, fn=fn, season=None, episode=None, ep_to=None, seg=None, part=None,
             date=None, title='', tn='', special=False, sample=False, folder_season=None,
             season_hint=None, numsrc=None)
    f['sample'] = bool(re.search(r'(?:^|[\s-])sample(?:[\s-]|$)', s, re.I))

    for comp in reversed(os.path.dirname(rel).split(os.sep)):
        c = spaced(comp)
        m = (re.search(r'\b(?:season|series)\s?(\d{1,2})\b', c, re.I)
             or re.search(r'(?:^|\s)S(\d{1,2})(?:\s|$)', c, re.I))
        if m: f['folder_season'] = int(m.group(1)); break

    work = s
    tail = None
    m = re.search(r'\bS(\d{1,2})\s?E(\d{1,3})([a-d])?(?:\s?-?\s?E(\d{1,3}))?(?=\b|[a-d]\b)', work, re.I)
    if m:
        f.update(season=int(m.group(1)), episode=int(m.group(2)), numsrc='SxxEyy')
        if m.group(3): f['seg'] = m.group(3).lower()
        if m.group(4) and int(m.group(4)) > f['episode']: f['ep_to'] = int(m.group(4))
        tail = work[m.end():]
    if f['season'] is None:
        m = re.search(r'\b(\d{1,2})x(\d{2,3})\b', work, re.I)
        if m:
            f.update(season=int(m.group(1)), episode=int(m.group(2)), numsrc='NxNN'); tail = work[m.end():]
    if f['season'] is None:
        m = re.search(r'\b(?:season|series)\s?(\d{1,2})\s?(?:episode|ep|e)\s?(\d{1,3})\b', work, re.I)
        if m:
            f.update(season=int(m.group(1)), episode=int(m.group(2)), numsrc='words'); tail = work[m.end():]
    d = re.search(r'\b((?:19|20)\d\d)[\s-](\d\d)[\s-](\d\d)\b', work)
    if d: f['date'] = '%s-%s-%s' % d.groups()
    if f['season'] is None:
        rest = strip_series(work, series_title)
        for tok in rest.split():
            if not re.fullmatch(r'\d{3,4}', tok) or tok in _NOT_EP: continue
            if len(tok) == 4 and 1900 <= int(tok) <= 2099: continue
            sn, en = int(tok[:-2]), int(tok[-2:])
            if en >= 1:
                f.update(season=sn, episode=en, numsrc='compact')
                tail = rest[rest.index(tok) + len(tok):]
            break
    m = re.search(r'\b(?:season|series)\s?(\d{1,2})\b', work, re.I) or re.search(r'(?:^|\s)S(\d{1,2})(?:\s|$)', work, re.I)
    if m: f['season_hint'] = int(m.group(1))

    # title
    raw = tail if tail is not None else strip_series(work, series_title)
    cut = _STRONG_RE.search(raw)
    if cut: raw = raw[:cut.start()]
    raw = re.sub(r'(?<=\S)-[A-Za-z0-9]+$', '', raw.strip())
    raw = _TRAIL_RE.sub('', raw.strip())
    raw = re.sub(r'\b(?:19|20)\d\d\b\s*$', '', raw)
    raw = strip_series(raw, series_title, anywhere=tail is None)
    raw_season = raw                                   # specials keep "Season 5" ("Season 5 Reunion")
    raw = re.sub(r'\b(?:season|series)\s?\d{1,2}\b|(?:^|\s)S\d{1,2}(?=\s|$)', ' ', raw, flags=re.I)
    pm = _PART_RE.search(raw)
    if pm:
        v = (pm.group(1) or pm.group(2)).lower()
        f['part'] = _WORDNUM.get(v) or (ord(v) - 96 if v in 'abcd' else int(v))
    f['special'] = bool(_SPECIAL_RE.search(s)) or f['season'] == 0
    title = raw
    title_np = _PART_RE.sub(' ', title)
    title_np = re.sub(r'\b(?:specials?|bonus|extras?)\b', ' ', title_np, flags=re.I)
    clean = lambda t: re.sub(r'\s+', ' ', re.sub(r'^[\s,:;-]+|[\s,:;-]+$', '', t)).strip()
    f['title'] = clean(title_np)
    f['title_full'] = clean(re.sub(r'\b(?:specials?|bonus|extras?)\b', ' ', raw_season if f['special'] else title, flags=re.I))
    if f['special'] and f['season'] and not re.search(r'\b(?:season|series)\s?\d', raw_season, re.I) and f['title_full']:
        f['title_full'] = 'Season %d %s' % (f['season'], f['title_full'])   # "S06E14 Reunion" is the Season 6 Reunion
    f['tn'] = '' if _GENERIC_EP.match(f['title']) else tnorm(f['title'])
    f['tn_full'] = '' if _GENERIC_EP.match(f['title_full']) else tnorm(f['title_full'])
    return f


def ep_tn(e):
    t = (e.get('title') or '').strip()
    return '' if _GENERIC_EP.match(t) else tnorm(t)


def special_title(f):
    """Human title for a special that has no Sonarr episode (Plex Season 00)."""
    if not f['special']: return None
    t = f['title_full'] or f['title']
    return ' '.join(w if w.isupper() else w[:1].upper() + w[1:] for w in t.split()) or None


# ----------------------------------------------------------------- matching
def match(rels, episodes, series_title='', sonarr_map=None, hints=None):
    """sonarr_map: rel -> [episodeId] from Sonarr's /api/v3/parse (applies
    scene/XEM numbering). When present it replaces the raw filename number."""
    eps = [dict(id=e['id'], s=e['seasonNumber'], e=e['episodeNumber'], title=e.get('title'),
                air=e.get('airDate'), tn=ep_tn(e)) for e in episodes]
    by_se = {(x['s'], x['e']): x for x in eps}
    by_id = {x['id']: x for x in eps}
    files = [parse_file(r, series_title) for r in rels if os.path.splitext(r)[1].lower() in VIDEXT]
    ignored = [f for f in files if f['sample']]
    files = [f for f in files if not f['sample']]
    for f in files:                                   # title hint only fills a missing title
        h = (hints or {}).get(f['rel'])
        if h and not f['tn']:
            ht = tnorm(strip_series(spaced(h), series_title))
            if ht and not _GENERIC_EP.match(ht):
                f['title'] = f['title_full'] = h; f['tn'] = f['tn_full'] = ht; f['hinted'] = True
    for f in files:
        f['raw_se'] = (f['season'], f['episode'])
        ids = [i for i in ((sonarr_map or {}).get(f['rel']) or []) if i in by_id]
        if ids:
            xs = sorted((by_id[i] for i in ids), key=lambda x: (x['s'], x['e']))
            f['season'], f['episode'] = xs[0]['s'], xs[0]['e']
            f['ep_to'] = xs[-1]['e'] if len(xs) > 1 and xs[-1]['s'] == xs[0]['s'] else None
            f['numsrc'] = 'sonarr'

    # -- 2. number trust: among titled files, how often does the number agree
    #       with the episode the title points to?
    agree = total = 0
    for f in files:
        if not f['tn'] or f['season'] is None or f['special']: continue
        named = {(x['s'], x['e']) for x in eps if tsim(f['tn'], x['tn']) >= 0.92}
        if not named: continue
        total += 1
        agree += (f['season'], f['episode']) in named
    trust = (agree + 1) / (total + 1)

    # -- 3. multi-part groups: same base title, parts 1..n, title names ONE
    #       episode and no episode is titled with the part itself.
    units = []
    grouped = set()
    parts = {}
    for i, f in enumerate(files):
        if f['part'] and f['tn']:
            parts.setdefault((f['tn'], f['folder_season']), []).append(i)
    for (tn, _), idx in parts.items():
        nums = sorted(files[i]['part'] for i in idx)
        if len(idx) < 2 or nums != list(range(1, len(idx) + 1)): continue
        def own_ep(i, x):                          # an episode titled with this part's own number ("X (2)", "X Part 2")
            a, b = _partless(files[i]['tn_full']), _partless(x['tn'])
            return re.findall(r'\d+', a)[-1:] == re.findall(r'\d+', b)[-1:] != [] and tsim(a, b) >= 0.95
        per_part = any(own_ep(i, x) for i in idx for x in eps)
        if per_part: continue
        idx.sort(key=lambda i: files[i]['part'])
        units.append(dict(files=idx, tn=tn, season=None, episode=None, date=None, special=True,
                          season_hint=None, folder_season=None, group=True))
        grouped.update(idx)
    segs = {}
    for i, f in enumerate(files):
        if i in grouped or not f['seg'] or f['raw_se'][0] is None: continue
        segs.setdefault(f['raw_se'], []).append(i)
    for (sn, en), idx in segs.items():
        if len(idx) < 2: continue
        idx.sort(key=lambda i: files[i]['seg'])
        if [files[i]['seg'] for i in idx] != [chr(97 + k) for k in range(len(idx))]: continue
        titles = [files[i]['tn'] for i in idx]
        own = [max((tsim(t, x['tn']) for x in eps), default=0) >= 0.9 for t in titles if t]
        if len(own) == len(idx) and all(own) and len(set(titles)) == len(idx): continue
        units.append(dict(files=idx, tn=next((t for t in titles if t), ''), season=sn, episode=en, ep_to=None,
                          date=None, special=False, season_hint=None, folder_season=files[idx[0]]['folder_season'], group=True))
        grouped.update(idx)
    dupes = {}
    conflict_hint = {}
    same = {}
    for i, f in enumerate(files):
        if i in grouped or f['numsrc'] != 'sonarr' or f['ep_to']: continue
        same.setdefault((f['season'], f['episode']), []).append(i)
    for (sn, en), idx in same.items():
        if len(idx) < 2 or any(files[i]['raw_se'][0] is None for i in idx): continue
        raws = sorted(files[i]['raw_se'] for i in idx)
        if len({files[i]['tn'] for i in idx if files[i]['tn']}) > 1:
            continue                              # different titles: different episodes, let titles decide
        if len(set(raws)) < len(raws):           # same raw number twice: duplicate release
            keep = max(idx, key=lambda i: files[i].get('size', 0) or 0)
            for i in idx:
                if i != keep: dupes[i] = 'duplicate of %s' % files[keep]['fn']; grouped.add(i)
            continue
        names = ', '.join('S%02dE%02d' % files[i]['raw_se'] for i in sorted(idx, key=lambda i: files[i]['raw_se']))
        for i in idx:
            dupes[i] = 'Sonarr maps %s to the same episode (S%02dE%02d); pick manually' % (names, sn, en)
            conflict_hint[i] = by_se.get((sn, en))
            grouped.add(i)
    for i, f in enumerate(files):
        if i in grouped: continue
        units.append(dict(files=[i], tn=f['tn'], tn2=f['tn_full'] if f['special'] else '', season=f['season'], episode=f['episode'], ep_to=f['ep_to'],
                          date=f['date'], special=f['special'], season_hint=f['season_hint'],
                          folder_season=f['folder_season'], group=False))

    # -- 4. score and assign one-to-one
    def score(u, x):
        t = max(tsim(u['tn'], x['tn']), tsim(u.get('tn2'), x['tn']))
        num = u['season'] is not None and x['s'] == u['season'] and (
            x['e'] == u['episode'] or (bool(u.get('ep_to')) and u['episode'] <= x['e'] <= u['ep_to']))
        date = bool(u['date']) and u['date'] == x['air']
        sc = 0.0
        if t >= 0.6: sc += 100 * t
        if num: sc += 45 * trust
        if date: sc += 90
        if u['special'] and x['s'] == 0 and t >= 0.6: sc += 10
        if x['s'] == (u['season_hint'] if u['season'] is None else -1): sc += 5
        return sc, t, num, date

    cands = []
    per_unit = {}
    for ui, u in enumerate(units):
        sc_list = []
        for x in eps:
            sc, t, num, date = score(u, x)
            if sc > 0: sc_list.append((sc, t, num, date, x['id']))
        sc_list.sort(reverse=True)
        per_unit[ui] = sc_list[:5]
        for c in sc_list:
            if c[0] >= 40: cands.append((c[0], ui) + c[1:])
    cands.sort(key=lambda c: (-c[0], c[1]))

    assign = {}          # unit index -> dict
    claimed = set()
    for sc, ui, t, num, date, eid in cands:
        if ui in assign or eid in claimed: continue
        u = units[ui]; x = by_id[eid]
        if u['group'] and t >= 0.6: method = 'title'
        elif u['group']: method = 'number'
        elif date and t < 0.6: method = 'date'
        elif t >= 0.95: method = 'title'
        elif t >= 0.6: method = 'close'
        else: method = 'number'
        conf = 100 if (t >= 0.95 and (num or u['group'] or u['season'] is None)) else \
               98 if t >= 0.95 else round(t * 100) if t >= 0.6 else 95 if date else round(92 * trust)
        reasons = []
        top = per_unit[ui]
        rival = next((c for c in top if c[4] != eid), None)
        if rival and rival[0] >= sc - 8 and rival[4] not in claimed:
            reasons.append('ambiguous: also fits S%02dE%02d' % (by_id[rival[4]]['s'], by_id[rival[4]]['e']))
        if method == 'close' and t < 0.8: reasons.append('weak title match (%d%%)' % round(t * 100))
        if method == 'number' and trust < 0.8: reasons.append('pack numbering disagrees with titles')
        if method == 'number' and not u['group']:
            rs = files[u['files'][0]]['raw_se']
            if rs[0] is not None and rs != (u['season'], u['episode']):
                reasons.append('Sonarr scene mapping renumbers S%02dE%02d to S%02dE%02d, no title to confirm' % (rs + (u['season'], u['episode'])))
        ids = [eid]
        if u.get('ep_to') and num:
            ids = [y['id'] for n in range(u['episode'], u['ep_to'] + 1)
                   for y in [by_se.get((u['season'], n))] if y and (y['id'] not in claimed or y['id'] == eid)]
        assign[ui] = dict(ids=ids, method=method, conf=conf, reasons=reasons)
        claimed.update(ids)

    # -- 5. sequence alignment: runs of unassigned units between regular
    #       anchors take the unclaimed regular episodes between them, in order
    regular = sorted([x for x in eps if x['s'] > 0], key=lambda x: (x['s'], x['e']))
    pos = {x['id']: i for i, x in enumerate(regular)}

    def okey(ui):
        u = units[ui]; f = files[u['files'][0]]
        sn = u['season'] if u['season'] is not None else (f['folder_season'] or 999)
        return (sn, u['episode'] if u['episode'] is not None else 999, f['rel'])
    order = sorted(range(len(units)), key=okey)

    def is_anchor(ui):
        a = assign.get(ui)
        return a and by_id[a['ids'][0]]['s'] > 0 and a['method'] in ('title', 'close', 'date')
    run = []
    prev = None
    seq = []
    for ui in order + [None]:
        if ui is not None and ui not in assign and not units[ui]['special'] and (units[ui]['season'] is None or trust < 0.8):
            run.append(ui); continue
        if ui is not None and ui not in assign:
            continue
        if ui is not None and not is_anchor(ui):
            continue  # specials / S00 groups / number matches are transparent
        if run:
            lo = pos[assign[prev]['ids'][-1]] if prev is not None else -1
            hi = pos[assign[ui]['ids'][0]] if ui is not None else len(regular)
            gap = [x for x in regular[lo + 1:hi] if x['id'] not in claimed]
            if len(gap) == len(run) and (prev is not None or ui is not None):
                seq.append((run, gap, prev is not None and ui is not None))
            run = []
        prev = ui
    for run_units, gap, both in seq:
        for ui, x in zip(run_units, gap):
            u = units[ui]; reasons = []
            if u['tn'] and tsim(u['tn'], x['tn']) < 0.5: reasons.append('filename title differs from episode title')
            if not both: reasons.append('placed by order from one side only')
            moved = u['season'] is not None and (u['season'], u['episode']) != (x['s'], x['e'])
            assign[ui] = dict(ids=[x['id']], method='sequence', conf=88 if both else 70, reasons=reasons,
                              notes=(['renumbered from S%02dE%02d by position between matched titles' % (u['season'], u['episode'])] if moved else []))
            claimed.add(x['id'])

    # -- 6. number fallback for whatever is left
    for ui, u in enumerate(units):
        if ui in assign or u['season'] is None: continue
        x = by_se.get((u['season'], u['episode']))
        if not x or x['id'] in claimed: continue
        reasons = []
        if trust < 0.8: reasons.append('pack numbering disagrees with titles')
        if u['tn'] and x['tn'] and tsim(u['tn'], x['tn']) < 0.5: reasons.append('filename title differs from episode title')
        rs = files[u['files'][0]]['raw_se']
        if not u['group'] and rs[0] is not None and rs != (u['season'], u['episode']):
            reasons.append('Sonarr scene mapping renumbers S%02dE%02d to S%02dE%02d, no title to confirm' % (rs + (u['season'], u['episode'])))
        assign[ui] = dict(ids=[x['id']], method='number', conf=round(92 * trust), reasons=reasons)
        claimed.add(x['id'])

    # -- output
    matched, unmatched = [], []
    for ui, u in enumerate(units):
        f0 = files[u['files'][0]]
        a = assign.get(ui)
        if a:
            x = by_id[a['ids'][0]]
            row = dict(file=f0['fn'], rel=f0['rel'], episodeId=x['id'], episodeIds=a['ids'],
                       season=x['s'], episode=x['e'], title=x['title'], method=a['method'],
                       confidence=a['conf'], review=bool(a['reasons']), reasons=a['reasons'], notes=list(a.get('notes', [])))
            if u['group']:
                row['parts'] = [files[i]['rel'] for i in u['files']]
                row['notes'].append('%d parts will be joined into one file' % len(u['files']))
            if len(a['ids']) > 1:
                row['ep_to'] = by_id[a['ids'][-1]]['e']
            matched.append(row)
        else:
            for i in u['files']:
                f = files[i]
                top = [dict(id=c[4], season=by_id[c[4]]['s'], episode=by_id[c[4]]['e'], title=by_id[c[4]]['title'])
                       for c in per_unit.get(ui, [])[:3] if c[4] not in claimed]
                why = ('number S%02dE%02d not in Sonarr' % (f['season'], f['episode'])
                       if f['season'] is not None and (f['season'], f['episode']) not in by_se
                       else 'no confident match')
                unmatched.append(dict(file=f['fn'], rel=f['rel'], special_title=special_title(f),
                                      candidates=top, reason=why))
    for i, why in dupes.items():
        h = conflict_hint.get(i)
        cand = [dict(id=h['id'], season=h['s'], episode=h['e'], title=h['title'])] if h else []
        unmatched.append(dict(file=files[i]['fn'], rel=files[i]['rel'], special_title=None, candidates=cand, reason=why))
    matched.sort(key=lambda m: (m['season'], m['episode']))
    return dict(matched=matched, unmatched=unmatched,
                ignored=[dict(file=f['fn'], rel=f['rel'], reason='sample') for f in ignored],
                trust=round(trust, 2))
