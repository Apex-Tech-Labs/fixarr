"""Small synthetic checks for matcher behaviour that the fixture regression does not cover.
Run: python3 tests/units.py  (from the fixarr folder or tests/)"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import matcher

def eps(rows):
    return [dict(id=i + 1, seasonNumber=s, episodeNumber=e, title=t, airDate=None) for i, (s, e, t) in enumerate(rows)]

def run(rels, episodes, title):
    r = matcher.match(rels, episodes, title)
    return {m['file']: m for m in r['matched']}, r

FAIL = []
def check(name, cond):
    print(('ok    ' if cond else 'FAIL  ') + name)
    if not cond: FAIL.append(name)

# 1. A true split: one episode delivered as S01E01a + S01E01b with no per-segment titles -> joined
E = eps([(1, 1, 'The Long Night'), (1, 2, 'Morning')])
m, _ = run(['Show.S01E01a.mkv', 'Show.S01E01b.mkv', 'Show.S01E02.Morning.mkv'], E, 'Show')
row = m.get('Show.S01E01a.mkv')
check('a/b split joins into S01E01', bool(row) and row['episode'] == 1 and len(row.get('parts') or []) == 2)

# 2. Weekenders style: each lettered segment is its own TVDB episode with its own title -> kept separate
E = eps([(1, 1, 'Crushed'), (1, 2, 'Grop'), (1, 3, 'Laff Riot'), (1, 4, 'Brainiacs')])
m, _ = run(['S01E01a - Crushed.m4v', 'S01E01b - Grop.m4v', 'S01E02a - Laff Riot.m4v', 'S01E02b - Brainiacs.m4v'], E, 'The Weekenders')
check('titled segments stay separate', all(not x.get('parts') for x in m.values()) and
      [m[f]['title'] for f in ('S01E01a - Crushed.m4v', 'S01E01b - Grop.m4v', 'S01E02a - Laff Riot.m4v', 'S01E02b - Brainiacs.m4v')] ==
      ['Crushed', 'Grop', 'Laff Riot', 'Brainiacs'])

# 3. Part patterns: Part 1/Part 2, Pt.One/Pt.Two, CD1/CD2, "1 of 2"/"2 of 2" join into one episode
for a, b in [('Part.1', 'Part.2'), ('Pt.One', 'Pt.Two'), ('CD1', 'CD2'), ('1of2', '2of2'), ('Disc 1', 'Disc 2')]:
    E = eps([(1, 1, 'The Movie'), (1, 2, 'After')])
    m, _ = run(['Show.S01E01.The.Movie.%s.mkv' % a, 'Show.S01E01.The.Movie.%s.mkv' % b, 'Show.S01E02.After.mkv'], E, 'Show')
    row = next((x for x in m.values() if x.get('parts')), None)
    check('parts %s + %s join' % (a, b), bool(row) and row['episode'] == 1 and len(row['parts']) == 2)

# 4. Part-titled episodes (TVDB lists "Part 1" and "Part 2" separately) are NOT joined
E = eps([(1, 1, 'Pilot (Part 1)'), (1, 2, 'Pilot (Part 2)')])
m, _ = run(['Show.S01E01.Pilot.Part.1.mkv', 'Show.S01E02.Pilot.Part.2.mkv'], E, 'Show')
check('per-part episodes stay separate', len(m) == 2 and all(not x.get('parts') for x in m.values()))

# 5. A title that contains the show name keeps it ("Love at the Jersey Shore")
E = eps([(5, 7, 'Love at the Jersey Shore'), (0, 30, 'After Hours XIII: Love at the Jersey Shore')])
m, _ = run(['Jersey.Shore.2011.S05E07.Love.at.the.Jersey.Shore.720p.WEB-DL.mkv'], E, 'Jersey Shore')
row = next(iter(m.values()), None)
check('show name inside a title is kept', bool(row) and row['season'] == 5 and row['confidence'] == 100 and not row['review'])

# 6. Reunion specials resolve by season ("Season 5 Reunion", "S06E14 Reunion", "S01E111 Reunion Special")
E = eps([(0, 11, 'Season 1 Reunion'), (0, 32, 'Season 5 Reunion'), (0, 37, 'Season 6 Reunion'), (5, 1, 'Hurricane Situation')])
for f, want in [('Jersey.Shore.2011.S05E12.Season.5.Reunion.720p.mkv', 32), ('Jersey.Shore.2011.S06E14.Reunion.1080p.mkv', 37),
                ('Jersey.Shore.2008.S01E111.Reunion.Special.720p.mkv', 11)]:
    m, _ = run([f], E, 'Jersey Shore')
    row = next(iter(m.values()), None)
    check('%s -> S00E%02d' % (f.split('.720p')[0].split('.1080p')[0], want), bool(row) and row['season'] == 0 and row['episode'] == want and not row['review'])

print('\n%d failed' % len(FAIL)); sys.exit(1 if FAIL else 0)
