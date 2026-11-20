"""Library audit (nightly and on demand).

mislabeled  the file's original release name names a different episode than the one it is filed under
unlinked    a library file that is not hardlinked, while a byte-identical copy sits in the download folders
            (it uses its space twice and the torrent copy is not the library copy). Relink fixes it: the library
            file is moved to Sonarr's recycle bin and replaced by a hardlink to the seeding copy.
"""
import filecmp, os, threading, time
from concurrent.futures import ThreadPoolExecutor
import matcher, sonarr, store
from config import TORRENTS

_state = {"running": False, "progress": ""}
_lock = threading.Lock()
MIN_SIZE = 50 * 1024 * 1024

def _torrent_sizes():
    idx = {}
    for root, dirs, fs in os.walk(TORRENTS):
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for f in fs:
            if os.path.splitext(f)[1].lower() not in matcher.VIDEXT: continue
            p = os.path.join(root, f)
            try: st = os.stat(p)
            except OSError: continue
            if st.st_size >= MIN_SIZE: idx.setdefault(st.st_size, []).append(p)
    return idx

def _series_check(s, sizes):
    mis, unl = [], []
    eps = sonarr.episodes(s["id"], fresh=True); files = sonarr.episode_files(s["id"], fresh=True)
    eps_by_file = {}
    for e in eps:
        if e.get("episodeFileId"): eps_by_file.setdefault(e["episodeFileId"], []).append(e)
    tns = [(e, matcher.ep_tn(e)) for e in eps]
    for f in files:
        mine = eps_by_file.get(f["id"]) or []
        try: st = os.stat(f["path"])
        except OSError: continue
        if st.st_nlink == 1 and st.st_size >= MIN_SIZE:
            cands = [p for p in sizes.get(st.st_size, []) if p != f["path"]]
            if cands:
                unl.append(dict(series_id=s["id"], series=s["title"], slug=s.get("titleSlug"), path=f["path"], candidate=cands[0],
                                size=st.st_size, episode=", ".join("S%02dE%02d" % (e["seasonNumber"], e["episodeNumber"]) for e in mine)))
        scene = f.get("sceneName") or ""
        if len(mine) != 1 or not scene: continue
        p = matcher.parse_file(scene + ".mkv", s["title"])
        if not p["tn"] or p.get("part"): continue
        cur = mine[0]
        cur_sim = matcher.tsim(p["tn"], matcher.ep_tn(cur))
        if cur_sim >= 0.6: continue
        best = max(((matcher.tsim(p["tn"], tn), e) for e, tn in tns if e["id"] != cur["id"]), key=lambda x: x[0], default=(0, None))
        if best[0] >= 0.92:
            o = best[1]
            mis.append(dict(series_id=s["id"], series=s["title"], slug=s.get("titleSlug"), path=f["path"], release=scene,
                            filed_as="S%02dE%02d %s" % (cur["seasonNumber"], cur["episodeNumber"], cur.get("title") or ""),
                            looks_like="S%02dE%02d %s" % (o["seasonNumber"], o["episodeNumber"], o.get("title") or "")))
    return mis, unl

def run():
    if not _lock.acquire(blocking=False): return {"busy": True}
    _state.update(running=True, progress="Indexing the download folders")
    try:
        sizes = _torrent_sizes()
        series = sonarr.series_all()
        mis, unl, done = [], [], [0]
        def one(s):
            try: return _series_check(s, sizes)
            except Exception: return [], []
            finally:
                done[0] += 1; _state["progress"] = "Checked %d of %d series" % (done[0], len(series))
        with ThreadPoolExecutor(4) as ex:
            for m, u in ex.map(one, series): mis += m; unl += u
        res = dict(at=int(time.time()), series=len(series), mislabeled=mis, unlinked=unl,
                   wasted=sum(x["size"] for x in unl))
        store.save("audit.json", res)
        store.log("audit", "Library audit: %d possibly mislabeled, %d files not hardlinked" % (len(mis), len(unl)))
        return res
    finally:
        _state.update(running=False, progress="")
        _lock.release()

def run_async(): threading.Thread(target=run, daemon=True).start()

def results():
    r = store.load("audit.json", {})
    r.update(running=_state["running"], progress=_state["progress"])
    return r

def relink(paths):
    """Replace library files with hardlinks to their byte-identical seeding copies. Originals go to the recycle bin."""
    rb = sonarr.recycle_bin()
    if not rb or not os.path.isdir(rb):
        raise ValueError("Relink needs Sonarr's recycle bin (Settings > Media Management) so nothing is deleted for good.")
    r = results(); todo = [x for x in r.get("unlinked", []) if x["path"] in set(paths)]
    done, items, problems = [], [], []
    for x in todo:
        lib, src = x["path"], x["candidate"]
        try:
            a, b = os.stat(lib), os.stat(src)
            if a.st_ino == b.st_ino: done.append(lib); continue
            if a.st_dev != b.st_dev: problems.append(dict(path=lib, reason="Different filesystems; hardlinks are impossible")); continue
            if a.st_size != b.st_size or not filecmp.cmp(lib, src, shallow=False):
                problems.append(dict(path=lib, reason="The seeding copy is not byte-identical")); continue
            series_root = os.path.dirname(os.path.dirname(lib)) if os.path.basename(os.path.dirname(lib)).lower().startswith(("season", "specials")) else os.path.dirname(lib)
            rec = os.path.join(rb, os.path.relpath(lib, os.path.dirname(series_root)))
            os.makedirs(os.path.dirname(rec), exist_ok=True)
            tmp = lib + ".fixarr-link"
            os.link(src, tmp)                 # link first, so the library path is never empty
            os.rename(lib, rec)
            os.rename(tmp, lib)
            done.append(lib); items.append(dict(path=lib, recycled=rec, source=src))
        except OSError as ex:
            problems.append(dict(path=lib, reason=ex.strerror or str(ex)))
    if items:
        store.add_history(dict(kind="relink", series=", ".join(sorted({x["series"] for x in todo if x["path"] in done}))[:200],
                               landed=len(items), items=items, freed=sum(os.path.getsize(i["path"]) for i in items)))
        r["unlinked"] = [x for x in r.get("unlinked", []) if x["path"] not in set(done)]
        r["wasted"] = sum(x["size"] for x in r["unlinked"])
        store.save("audit.json", {k: v for k, v in r.items() if k not in ("running", "progress")})
    return dict(relinked=len(items), problems=problems)
