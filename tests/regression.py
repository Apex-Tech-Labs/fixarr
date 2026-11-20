"""Synthetic matcher regression.

Made-up shows and packs that cover the naming situations Fixarr meets in real downloads: clean numbering, other
number formats, titles only, wrong numbering, multi-season folders, lettered segments, multi-part episodes, double
episodes, specials, samples, daily shows and untitled runs. Every expected answer is known by construction, so the
test needs no real library data.

Run: python3 tests/regression.py      (exit code 1 on any wrong match or when fewer than 97% are matched)
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import matcher

WORDS = ('Amber Basin Cinder Delta Ember Falcon Garnet Harbor Ivory Juniper Kestrel Lantern Meadow Nimbus Orchard '
         'Pioneer Quarry Raven Summit Thistle Umber Valley Willow Yarrow Zephyr Atlas Beacon Comet Drift Echo').split()

def title_for(show, s, e):
    """Deterministic two-word episode titles that never repeat within a show."""
    i = (sum(map(ord, show)) + s * 37 + e * 11) % len(WORDS)
    j = (i + s * 7 + e * 3 + 5) % len(WORDS)
    if j == i: j = (j + 1) % len(WORDS)
    return '%s %s' % (WORDS[i], WORDS[j])

class Show:
    def __init__(self, name, seasons, specials=(), extra=None):
        self.name, self.eps, nid = name, [], 1
        for s, n in enumerate(seasons, 1):
            for e in range(1, n + 1):
                self.eps.append(dict(id=nid, seasonNumber=s, episodeNumber=e, title=(extra or {}).get((s, e)) or title_for(name, s, e),
                                     airDate='20%02d-%02d-%02d' % (10 + s, 1 + (e - 1) // 4, 1 + ((e - 1) % 4) * 7)))
                nid += 1
        for e, t in enumerate(specials, 1):
            self.eps.append(dict(id=nid, seasonNumber=0, episodeNumber=e, title=t, airDate=None)); nid += 1
    def ep(self, s, e): return next(x for x in self.eps if x['seasonNumber'] == s and x['episodeNumber'] == e)
    def t(self, s, e): return self.ep(s, e)['title']
    def dots(self, text): return text.replace(' ', '.')

CASES = []
def case(name, show, files, expect, skip=()):
    """files: list of rel paths. expect: rel -> [(s, e), ...] (several = one file covering a double episode) or
    ('parts', [rels]) for a joined unit keyed by its first part. skip: rels that must not be matched (samples)."""
    CASES.append(dict(name=name, show=show, files=files, expect=expect, skip=set(skip)))

# 1. clean SxxEyy with titles
sh = Show('Paper Lanterns', [10, 10])
se = [(s, e) for s in (1, 2) for e in range(1, 11)]
f = ['%s.S%02dE%02d.%s.1080p.WEB-DL.DDP5.1.H.264-GRP.mkv' % (sh.dots(sh.name), s, e, sh.dots(sh.t(s, e))) for s, e in se]
case('clean SxxEyy', sh, f, {r: [x] for r, x in zip(f, se)})

# 2. 1x01 numbering with titles
sh = Show('Copper Coast', [8])
f = ['%s - 1x%02d - %s.avi' % (sh.name, e, sh.t(1, e)) for e in range(1, 9)]
case('1x01 numbering', sh, f, {r: [(1, e)] for r, e in zip(f, range(1, 9))})

# 3. compact 101 numbering with titles
sh = Show('North Star Diner', [9])
f = ['%s %d%02d %s.mp4' % (sh.name, 1, e, sh.t(1, e)) for e in range(1, 10)]
case('compact 101 numbering', sh, f, {r: [(1, e)] for r, e in zip(f, range(1, 10))})

# 4. titles only inside a season folder
sh = Show('Glass Orchard', [6, 6])
f = ['Glass Orchard Season 2/%s.mkv' % sh.t(2, e) for e in range(1, 7)]
case('titles only, season folder', sh, f, {r: [(2, e)] for r, e in zip(f, range(1, 7))})

# 5. pack numbered in a different order (DVD order): titles must win over numbers
sh = Show('Midnight Ledger', [10])
order = [1, 2, 4, 3, 6, 5, 8, 7, 10, 9]   # file number -> real episode
f = ['%s.S01E%02d.%s.DVDRip.x264.mkv' % (sh.dots(sh.name), n, sh.dots(sh.t(1, real))) for n, real in zip(range(1, 11), order)]
case('wrong numbering, titles win', sh, f, {r: [(1, real)] for r, real in zip(f, order)})

# 6. multi-season pack in season folders
sh = Show('River Wardens', [5, 5, 5])
se = [(s, e) for s in (1, 2, 3) for e in range(1, 6)]
f = ['River.Wardens.S01-S03.1080p/Season %d/River.Wardens.S%02dE%02d.%s.mkv' % (s, s, e, sh.dots(sh.t(s, e))) for s, e in se]
case('multi-season folders', sh, f, {r: [x] for r, x in zip(f, se)})

# 7. lettered segments that TVDB lists as separate episodes (each has its own title)
sh = Show('The Weekday Kids', [8])
f = []; exp = {}
for k, e in enumerate(range(1, 9)):
    rel = 'S01E%02d%s - %s.m4v' % (k // 2 + 1, 'ab'[k % 2], sh.t(1, e)); f.append(rel); exp[rel] = [(1, e)]
case('titled a/b segments stay separate', sh, f, exp)

# 8. one episode split into untitled a/b files -> joined
sh = Show('Hollow Pines', [4])
f = ['Hollow.Pines.S01E01a.mkv', 'Hollow.Pines.S01E01b.mkv'] + ['Hollow.Pines.S01E%02d.%s.mkv' % (e, sh.dots(sh.t(1, e))) for e in (2, 3, 4)]
exp = {'Hollow.Pines.S01E01a.mkv': ('parts', ['Hollow.Pines.S01E01a.mkv', 'Hollow.Pines.S01E01b.mkv'])}
exp.update({r: [(1, e)] for r, e in zip(f[2:], (2, 3, 4))})
case('untitled a/b split joins', sh, f, exp)

# 9. multi-part episode listed once (Part 1 / Part 2, CD1 / CD2, 1 of 2)
for label, (pa, pb) in (('Part', ('Part.1', 'Part.2')), ('CD', ('CD1', 'CD2')), ('of', ('1of2', '2of2')), ('Pt', ('Pt.One', 'Pt.Two'))):
    sh = Show('Signal Fire ' + label, [3])
    first = 'Signal.Fire.S01E02.%s.%s.mkv' % (sh.dots(sh.t(1, 2)), pa)
    f = ['Signal.Fire.S01E01.%s.mkv' % sh.dots(sh.t(1, 1)), first, 'Signal.Fire.S01E02.%s.%s.mkv' % (sh.dots(sh.t(1, 2)), pb),
         'Signal.Fire.S01E03.%s.mkv' % sh.dots(sh.t(1, 3))]
    case('%s parts join' % label, sh, f, {f[0]: [(1, 1)], first: ('parts', [first, f[2]]), f[3]: [(1, 3)]})

# 10. two-part story listed as two episodes stays separate
sh = Show('Iron Meridian', [3], extra={(1, 1): 'The Crossing (1)', (1, 2): 'The Crossing (2)'})
f = ['Iron.Meridian.S01E01.The.Crossing.Part.1.mkv', 'Iron.Meridian.S01E02.The.Crossing.Part.2.mkv', 'Iron.Meridian.S01E03.%s.mkv' % sh.dots(sh.t(1, 3))]
case('two-part story as two episodes', sh, f, {f[0]: [(1, 1)], f[1]: [(1, 2)], f[2]: [(1, 3)]})

# 11. double episode in one file
sh = Show('Lighthouse Row', [6])
f = ['Lighthouse.Row.S01E01E02.%s.mkv' % sh.dots(sh.t(1, 1))] + ['Lighthouse.Row.S01E%02d.%s.mkv' % (e, sh.dots(sh.t(1, e))) for e in range(3, 7)]
exp = {f[0]: [(1, 1), (1, 2)]}; exp.update({r: [(1, e)] for r, e in zip(f[1:], range(3, 7))})
case('double episode', sh, f, exp)

# 12. samples are ignored
sh = Show('Granite Falls', [3])
f = ['Granite.Falls.S01E%02d.%s.mkv' % (e, sh.dots(sh.t(1, e))) for e in (1, 2, 3)] + ['Sample/granite.falls.s01e01.sample.mkv']
case('samples ignored', sh, f, {r: [(1, e)] for r, e in zip(f[:3], (1, 2, 3))}, skip=[f[3]])

# 13. reunion specials resolve by season
sh = Show('Boardwalk Summer', [4, 4], specials=['Season 1 Reunion', 'Season 2 Reunion'])
f = ['Boardwalk.Summer.S01E05.Reunion.Special.720p.mkv', 'Boardwalk.Summer.S02E05.Season.2.Reunion.720p.mkv'] + \
    ['Boardwalk.Summer.S02E%02d.%s.720p.mkv' % (e, sh.dots(sh.t(2, e))) for e in range(1, 5)]
exp = {f[0]: [(0, 1)], f[1]: [(0, 2)]}; exp.update({r: [(2, e)] for r, e in zip(f[2:], range(1, 5))})
case('reunion specials by season', sh, f, exp)

# 14. show name inside an episode title
sh = Show('Pine Harbor', [4], extra={(1, 3): 'Last Night in Pine Harbor'})
f = ['Pine.Harbor.S01E%02d.%s.mkv' % (e, sh.dots(sh.t(1, e))) for e in range(1, 5)]
case('show name inside a title', sh, f, {r: [(1, e)] for r, e in zip(f, range(1, 5))})

# 15. untitled files between titled anchors, numbered one off -> placed by order
sh = Show('Static Bloom', [8])
f = ['Static.Bloom.S01E01.%s.mkv' % sh.dots(sh.t(1, 1)), 'Static.Bloom.S01E03.mkv', 'Static.Bloom.S01E04.mkv', 'Static.Bloom.S01E05.mkv',
     'Static.Bloom.S01E05.%s.mkv' % sh.dots(sh.t(1, 5))] + ['Static.Bloom.S01E%02d.%s.mkv' % (e, sh.dots(sh.t(1, e))) for e in (6, 7, 8)]
f[4] = 'Static.Bloom.S01E06.%s.mkv' % sh.dots(sh.t(1, 5))     # pack numbers run one ahead from here
f[5:] = ['Static.Bloom.S01E%02d.%s.mkv' % (e + 1, sh.dots(sh.t(1, e))) for e in (6, 7, 8)]
exp = {f[0]: [(1, 1)], f[1]: [(1, 2)], f[2]: [(1, 3)], f[3]: [(1, 4)], f[4]: [(1, 5)]}
exp.update({r: [(1, e)] for r, e in zip(f[5:], (6, 7, 8))})
case('untitled run placed by order', sh, f, exp)

# 16. year in the show name
sh = Show('Tidewater', [5])
f = ['Tidewater.2019.S01E%02d.%s.1080p.mkv' % (e, sh.dots(sh.t(1, e))) for e in range(1, 6)]
case('year in show name', sh, f, {r: [(1, e)] for r, e in zip(f, range(1, 6))})

# 17. daily show by air date
sh = Show('Morning Wire', [6])
f = ['Morning.Wire.%s.%s.720p.mkv' % (sh.ep(1, e)['airDate'], sh.dots(sh.t(1, e))) for e in range(1, 7)]
case('daily show by air date', sh, f, {r: [(1, e)] for r, e in zip(f, range(1, 7))})


def run():
    total = correct = wrong = missed = 0
    fails = []
    for c in CASES:
        sh = c['show']; ids = {(x['seasonNumber'], x['episodeNumber']): x['id'] for x in sh.eps}
        res = matcher.match(c['files'], sh.eps, sh.name)
        rows = {m['rel']: m for m in res['matched']}
        for rel in c['skip']:
            if rel in rows: wrong += 1; fails.append((c['name'], rel, 'should be ignored', rows[rel].get('episodeIds')))
        for rel, want in c['expect'].items():
            total += 1
            row = rows.get(rel)
            if not row:
                missed += 1; fails.append((c['name'], rel, want, 'unmatched')); continue
            if isinstance(want, tuple) and want[0] == 'parts':
                ok = sorted(row.get('parts') or []) == sorted(want[1])
            else:
                ok = sorted(row.get('episodeIds') or [row['episodeId']]) == sorted(ids[x] for x in want)
            if ok: correct += 1
            else: wrong += 1; fails.append((c['name'], rel, want, row.get('episodeIds'), row.get('parts')))
    rate = 100.0 * correct / max(total, 1)
    print('synthetic regression: %d cases, %d files, correct %d (%.1f%%), wrong %d, missed %d' % (len(CASES), total, correct, rate, wrong, missed))
    for x in fails: print('  FAIL', *x)
    return 0 if wrong == 0 and rate >= 97 else 1

if __name__ == '__main__':
    sys.exit(run())
