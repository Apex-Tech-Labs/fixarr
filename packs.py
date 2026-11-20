"""Pack catalog: which download folders still need importing, judged against the library itself.

A pack's state comes from Sonarr's library, not from "Fixarr imported it once":
  needs    some episode the pack holds is missing from the library
  review   Fixarr cannot tell which series or episodes the files are (needs a look)
  done     every file is already the library's file (same inode), or the pack was imported and nothing is missing
  covered  every episode it holds is already in the library from a different release (not needed)
"""
import os, re, threading, time
from concurrent.futures import ThreadPoolExecutor
import matcher, sonarr, store
from config import SCAN_DIRS, TORRENTS

VIDEXT = matcher.VIDEXT
SAMPLE = re.compile(r'(?:^|[._ -])sample(?:[._ -]|$)', re.I)

def norm(s): return re.sub(r'[^a-z0-9]', '', re.sub(r'\s*&\s*', ' and ', (s or '').lower()))

def guess_name(path):
    name = re.split(r'[.\s][sS]\d{1,2}', os.path.basename(path.rstrip('/')))[0].replace('.', ' ').strip()
    return re.sub(r'\s*\(?(?:19|20)\d\d\)?\s*$', '', name)

def match_series(series, path, name=None):
    n = norm(name or guess_name(path)); best, blen = None, 0
    if not n: return None
    for s in series:
        for t in [s.get("title"), (s.get("titleSlug") or "").replace("-", " ")] + [a.get("title") for a in s.get("alternateTitles") or []]:
            sn = norm(t)
            if not sn: continue
            if sn == n: return s
            if (n in sn or sn in n) and len(sn) > blen: best, blen = s, len(sn)
    if best or name: return best
    return _parse_series(series, path)

_parsed = {}
def _parse_series(series, path):
    """Last resort: ask Sonarr's own parser which series a release name belongs to (cached per name)."""
    base = os.path.basename(path.rstrip('/'))
    if base not in _parsed:
        try: sid = ((sonarr.parse(base) or {}).get("series") or {}).get("id")
        except Exception: sid = None
        _parsed[base] = sid
    sid = _parsed[base]
    return next((s for s in series if s.get("id") == sid), None) if sid else None

def under_torrents(p):
    try: rp = os.path.realpath(p)
    except Exception: return False
    return rp.startswith(TORRENTS + os.sep)

def video_files(path):
    """[(rel, inode, nlink, size)] for real video files in a pack folder (samples and hidden folders skipped)."""
    out = []
    for root, dirs, fs in os.walk(path):
        dirs[:] = sorted(d for d in dirs if not d.startswith('.'))
        for f in sorted(fs):
            if os.path.splitext(f)[1].lower() not in VIDEXT or SAMPLE.search(f): continue
            p = os.path.join(root, f)
            try: st = os.stat(p)
            except OSError: continue
            out.append((os.path.relpath(p, path), st.st_ino, st.st_nlink, st.st_size))
    return out

def season_label(seasons):
    sl = sorted(seasons)
    if not sl: return "S??"
    if len(sl) == 1: return "S%02d" % sl[0]
    if sl[-1] - sl[0] + 1 == len(sl): return "S%02d-S%02d" % (sl[0], sl[-1])
    return "S" + ",".join("%02d" % x for x in sl)

def library(sid):
    """What the library holds for one series: episodes with files, known episodes, file inodes."""
    def build():
        eps = sonarr.episodes(sid); files = sonarr.episode_files(sid)
        inodes = set()
        for f in files:
            try: inodes.add(os.stat(f["path"]).st_ino)
            except (OSError, KeyError): pass
        return dict(has={(e["seasonNumber"], e["episodeNumber"]) for e in eps if e.get("hasFile")},
                    known={(e["seasonNumber"], e["episodeNumber"]) for e in eps}, inodes=inodes)
    return sonarr.cached(("lib", sid), 60, build)

def assess(path, series_list, by_output, imported):
    files = video_files(path)
    if not files: return None
    s = by_output.get(os.path.realpath(path)) or match_series(series_list, path)
    seasons, covered, unnumbered = set(), set(), 0
    for rel, ino, nl, size in files:
        f = matcher.parse_file(rel, s["title"] if s else "")
        if f["season"] is None or f["episode"] is None: unnumbered += 1; continue
        seasons.add(f["season"])
        for e in range(f["episode"], (f["ep_to"] or f["episode"]) + 1): covered.add((f["season"], e))
    rec = dict(path=path, name=os.path.basename(path), files=len(files), season_list=sorted(seasons),
               seasons=season_label(seasons), unlinked=sum(1 for x in files if x[2] == 1),
               size=sum(x[3] for x in files), series_id=s["id"] if s else None, series_title=s["title"] if s else None,
               imported=bool(imported.get(path)), imported_at=(imported.get(path) or {}).get("at"))
    if not s:
        rec.update(state="review", why="Fixarr could not tell which series this is", missing=0, missing_eps=[], linked=0)
        return rec
    lib = library(s["id"])
    linked = sum(1 for x in files if x[1] in lib["inodes"])
    missing = sorted(se for se in covered if se in lib["known"] and se not in lib["has"])
    rec.update(linked=linked, missing=len(missing), missing_eps=["S%02dE%02d" % se for se in missing][:300],
               missing_seasons=sorted({se[0] for se in missing}))
    if linked == len(files): state, why = "done", "Every file is already in the library"
    elif missing: state, why = "needs", "%d episode%s missing from the library" % (len(missing), "" if len(missing) == 1 else "s")
    elif unnumbered and not linked and not covered: state, why = "review", "File names carry no episode numbers"
    elif rec["imported"] or linked: state, why = "done", "Imported; nothing it holds is missing"
    else: state, why = "covered", "Everything it holds is already in the library from another release"
    rec.update(state=state, why=why)
    return rec

# ------------------------------------------------------------------ cached catalog
_cat = {"at": 0, "items": [], "busy": False, "error": None}
_lock = threading.Lock()

def _build():
    series_list = sonarr.series_all()
    by_output = {}
    try:
        for r in sonarr.queue():
            if r.get("outputPath") and r.get("series"): by_output[os.path.realpath(r["outputPath"])] = r["series"]
    except sonarr.SonarrError: pass
    imported = store.imported()
    paths = [os.path.join(d, n) for d in SCAN_DIRS if os.path.isdir(d)
             for n in sorted(os.listdir(d)) if not n.startswith('.') and os.path.isdir(os.path.join(d, n))]
    with ThreadPoolExecutor(6) as ex:
        items = [x for x in ex.map(lambda p: assess(p, series_list, by_output, imported), paths) if x]
    items.sort(key=lambda x: x["name"].lower())
    return items

def rebuild():
    with _lock:
        if _cat["busy"]: return
        _cat["busy"] = True
    try:
        items = _build()
        _cat.update(items=items, at=time.time(), error=None)
    except Exception as e:
        _cat["error"] = str(e)
    finally:
        _cat["busy"] = False

def catalog(max_age=300, wait=True):
    """Return (items, building). Rebuilds when stale; with wait=False a stale catalog is returned while it rebuilds."""
    if time.time() - _cat["at"] > max_age:
        if wait and not _cat["items"]: rebuild()
        else: threading.Thread(target=rebuild, daemon=True).start()
    return _cat["items"], _cat["busy"]

def invalidate(series_id=None):
    if series_id: sonarr.drop_series(series_id)
    _cat["at"] = 0
