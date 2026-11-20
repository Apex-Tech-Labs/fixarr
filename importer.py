"""Preview and import.

Import = stage hardlinks (or a lossless join) -> Sonarr ManualImport (copy mode = hardlink on one filesystem,
tagged with Sonarr's downloadId when the pack is a Sonarr download) -> verify that every episode's library file
IS the file we handed over. Nothing is reported as imported unless it actually landed.
"""
import os, re, threading, time, uuid
from concurrent.futures import ThreadPoolExecutor
import matcher, media, packs, plex, sonarr, store
from config import TORRENTS

def safe(s): return re.sub(r'[\\/:*?"<>|]+', ' ', (s or '')).strip()
def mkey(path): return packs.norm(os.path.splitext(os.path.basename(path or ''))[0])

def all_rels(pack, only=None):
    rels = []
    for root, dirs, fs in os.walk(pack):
        dirs[:] = sorted(d for d in dirs if not d.startswith('.'))
        for fn in sorted(fs):
            if os.path.splitext(fn)[1].lower() in matcher.VIDEXT:
                rels.append(os.path.relpath(os.path.join(root, fn), pack))
    if only: rels = [r for r in rels if r in set(only)]
    return rels

def sonarr_numbers(series_id, rels):
    """Sonarr's own parser applies scene/XEM numbering; use it as one more clue."""
    def one(rel):
        try:
            r = sonarr.parse(os.path.basename(rel))
            if (r.get("series") or {}).get("id") == series_id: return rel, [e["id"] for e in r.get("episodes") or []]
        except Exception: pass
        return rel, []
    with ThreadPoolExecutor(8) as ex:
        return {rel: ids for rel, ids in ex.map(one, rels) if ids}

def find_series(pack, series_id=None, series_name=None):
    series = sonarr.series_all()
    if series_id:
        for s in series:
            if s["id"] == int(series_id): return s
    return packs.match_series(series, pack, series_name)

def ep_list(eps):
    return sorted([{"id": e["id"], "season": e["seasonNumber"], "episode": e["episodeNumber"], "title": e.get("title"),
                    "hasFile": bool(e.get("hasFile"))} for e in eps], key=lambda x: (x["season"], x["episode"]))

# ------------------------------------------------------------------ preview
def preview(pack, series_id=None, series_name=None, only=None):
    if not pack or not os.path.isdir(pack) or not packs.under_torrents(pack):
        raise ValueError("That pack folder is not in the download folders Fixarr can read.")
    s = find_series(pack, series_id, series_name)
    if not s: raise LookupError("Fixarr could not tell which series this is. Pick it in the Series box.")
    sid = s["id"]
    eps = sonarr.episodes(sid, fresh=True)
    lib_files = {f["id"]: f for f in sonarr.episode_files(sid, fresh=True)}
    by_id = {e["id"]: e for e in eps}
    rels = all_rels(pack, only)
    absp = lambda rel: os.path.join(pack, rel)

    hints = {}                                         # MKV title tags fill in names with no title
    plain = [r for r in rels if not matcher.parse_file(r, s["title"])["tn"]][:400]
    if plain:
        with ThreadPoolExecutor(8) as ex:
            for r, t in zip(plain, ex.map(lambda r: media.embedded_title(absp(r)), plain)):
                if t: hints[r] = t
    res = matcher.match(rels, eps, s["title"], sonarr_numbers(sid, rels), hints=hints)

    # Remembered mappings from earlier imports win over guessing
    mem = store.mappings().get(str(sid), {})
    rows = res["matched"] + res["unmatched"]
    matched = []
    for r in rows:
        m = mem.get(mkey(r["rel"]))
        ids = [i for i in (m or {}).get("ids", []) if i in by_id]
        if ids:
            e = by_id[ids[0]]
            r.update(episodeId=ids[0], episodeIds=ids, season=e["seasonNumber"], episode=e["episodeNumber"],
                     title=e.get("title"), method="remembered", confidence=100, review=False,
                     reasons=[], notes=["Remembered from an earlier import of this file"])
            if len(ids) > 1: r["ep_to"] = by_id[ids[-1]]["episodeNumber"]
            r.pop("reason", None); r.pop("special_title", None)
        if r.get("episodeId"): matched.append(r)
    unmatched = [r for r in rows if not r.get("episodeId")]

    # Where each file stands against the library
    def lib_state(r):
        st = []
        for i in r.get("episodeIds") or [r["episodeId"]]:
            e = by_id.get(i); lf = lib_files.get((e or {}).get("episodeFileId"))
            if not lf: st.append("new"); continue
            try: same = os.stat(lf["path"]).st_ino == os.stat(absp(r["rel"])).st_ino
            except OSError: same = False
            st.append("linked" if same else "has_file")
        return "linked" if st and all(x == "linked" for x in st) else ("new" if "new" in st else "has_file")
    for r in matched: r["library"] = lib_state(r)

    # Runtime check against the series runtime (flags double episodes, trailers, wrong files)
    runtime = s.get("runtime") or 0
    if store.settings()["runtime_check"] and runtime and media.HAVE_MEDIAINFO:
        check = [r for r in matched if not r.get("parts") and not r.get("ep_to") and r.get("library") != "linked"][:300]
        with ThreadPoolExecutor(8) as ex:
            for r, mins in zip(check, ex.map(lambda r: media.minutes(absp(r["rel"])), check)):
                r["minutes"] = mins
                if mins and (mins > runtime * 1.6 or mins < runtime * 0.45) and r.get("method") != "remembered":
                    r.setdefault("notes", []).append("Runs %d min; this series runs about %d min per episode" % (round(mins), runtime))
                    r["runtime_flag"] = True
                    if r.get("confidence", 0) < 100: r["review"] = True

    for r in matched:
        r["src"] = absp(r["rel"])
        if r.get("parts"): r["parts"] = [absp(x) for x in r["parts"]]
    for r in unmatched + res["ignored"]: r["src"] = absp(r["rel"])
    return {"series": {"id": sid, "title": s["title"], "runtime": runtime, "slug": s.get("titleSlug")},
            "matched": matched, "unmatched": unmatched, "ignored": res["ignored"], "trust": res["trust"],
            "episodes": ep_list(eps), "pack": pack}

# ------------------------------------------------------------------ import
FRIENDLY = [
    (r"not an upgrade", "skip", "The library already has this episode at the same or better quality"),
    (r"already imported", "skip", "This exact file is already in the library"),
    (r"sample", "fail", "Sonarr thinks this file is a sample"),
    (r"free space", "fail", "Not enough free disk space"),
    (r"unexpected considering|not found in the grabbed release", "fail", "Sonarr did not expect this episode in this download"),
]

def explain(reasons):
    for text in reasons or []:
        for pat, kind, msg in FRIENDLY:
            if re.search(pat, text, re.I): return kind, msg
    return "fail", (reasons[0] if reasons else "Sonarr did not import it")

JOBS, JOBS_LOCK = {}, threading.Lock()
_import_lock = threading.Lock()

def start(body, auto=False):
    job = uuid.uuid4().hex
    with JOBS_LOCK:
        for k in [k for k, v in JOBS.items() if v.get("done") and time.time() - v["at"] > 3600]: JOBS.pop(k, None)
        JOBS[job] = {"done": False, "step": "Waiting for the previous import to finish" if _import_lock.locked() else "Starting", "at": time.time()}
    threading.Thread(target=_runner, args=(job, body, auto), daemon=True).start()
    return job

def _runner(job, body, auto):
    def upd(**kw):
        with JOBS_LOCK: JOBS[job].update(kw)
    try: result = run(body, upd, auto)
    except Exception as ex: result = dict(status="failed", error=str(ex))
    upd(done=True, result=result, step="Done")

def job(jid):
    with JOBS_LOCK: return dict(JOBS.get(jid) or {})

def run(body, upd=lambda **k: None, auto=False):
    with _import_lock:
        return _run(body, upd, auto)

def _run(b, upd, auto):
    sid = int(b["series_id"]); pack = b.get("pack"); download_id = b.get("download_id") or None
    assignments = b.get("assignments") or []
    series = sonarr.api("/api/v3/series/%d" % sid); title = series["title"]; spath = series.get("path")
    eps = sonarr.episodes(sid, fresh=True); by_id = {e["id"]: e for e in eps}
    files0 = {f["id"]: f for f in sonarr.episode_files(sid, fresh=True)}
    before = {}
    for e in eps:
        f = files0.get(e.get("episodeFileId"))
        if f: before[str(e["id"])] = {"file_id": f["id"], "path": f["path"], "size": f.get("size")}

    # 1) specials with no Sonarr episode go straight into Season 00 for the media server
    placed = []
    plex_asn = [a for a in assignments if a.get("episodeId") == "plex-special"]
    if plex_asn and spath:
        upd(step="Placing specials in Season 00")
        s0 = os.path.join(spath, "Season 00")
        os.makedirs(s0, exist_ok=True)
        n = max([int(m.group(1)) for f in os.listdir(s0) for m in [re.search(r"[sS]00[eE](\d+)", f)] if m] or [0])
        for a in plex_asn:
            src = a.get("src")
            if not src or not packs.under_torrents(src) or not os.path.isfile(src): continue
            n += 1
            dst = os.path.join(s0, "%s - S00E%02d - %s%s" % (safe(title), n, safe(a.get("title") or "Special"), os.path.splitext(src)[1].lower()))
            if os.path.exists(dst): continue
            try: os.link(src, dst); placed.append(dst)
            except OSError: pass
        if placed and store.settings()["plex_scan"]:
            try: plex.scan(s0)
            except Exception: pass

    # 2) stage, hand to Sonarr
    landed, skipped, failed, joined, after = [], [], [], 0, {}
    sonarr_asn = [a for a in assignments if isinstance(a.get("episodeId"), int)]
    if sonarr_asn:
        stage = os.path.join(TORRENTS, ".import-staging", "%s [fixarr %d %s]" % (safe(title), int(time.time()), uuid.uuid4().hex[:4]))
        os.makedirs(stage)
        want, origin, ino, label, srcs = {}, {}, {}, {}, {}
        njoin = sum(1 for a in sonarr_asn if len(a.get("parts") or []) > 1)
        try:
            for a in sonarr_asn:
                ids = [i for i in (a.get("episodeIds") or [a["episodeId"]]) if i in by_id]
                if not ids:
                    failed.append(dict(file=os.path.basename(a.get("src") or ""), episode="?", reason="That episode no longer exists in Sonarr")); continue
                es = sorted((by_id[i] for i in ids), key=lambda e: (e["seasonNumber"], e["episodeNumber"]))
                num = "S%02dE%02d" % (es[0]["seasonNumber"], es[0]["episodeNumber"]) + ("-E%02d" % es[-1]["episodeNumber"] if len(es) > 1 else "")
                etitle = a.get("title") or es[0].get("title") or ""
                parts = [p for p in (a.get("parts") or []) if packs.under_torrents(p) and os.path.isfile(p)]
                if len(parts) > 1:
                    dst = os.path.join(stage, "%s - %s - %s.mkv" % (safe(title), num, safe(etitle)))
                    upd(step="Joining %d parts for %s (%d of %d)" % (len(parts), num, joined + 1, njoin))
                    try: media.join(parts, dst); joined += 1; src_name = os.path.basename(parts[0])
                    except Exception as ex:
                        failed.append(dict(file=os.path.basename(parts[0]), episode=num, reason=str(ex))); continue
                else:
                    src = a.get("src")
                    if not src or not packs.under_torrents(src) or not os.path.isfile(src):
                        failed.append(dict(file=os.path.basename(src or ""), episode=num, reason="The file is no longer in the download folder")); continue
                    dst = os.path.join(stage, "%s - %s - %s%s" % (safe(title), num, safe(etitle), os.path.splitext(src)[1].lower()))
                    try:
                        if not os.path.exists(dst): os.link(src, dst)
                    except OSError as ex:
                        failed.append(dict(file=os.path.basename(src), episode=num, reason="Could not hardlink: %s" % ex.strerror)); continue
                    src_name = os.path.basename(src)
                name = os.path.basename(dst)
                want[name] = [x["id"] for x in es]; origin[name] = src_name; ino[name] = os.stat(dst).st_ino; label[name] = num
                srcs[name] = a.get("src")
                if a.get("remember") and a.get("src"): store.remember(sid, mkey(a["src"]), want[name], num)

            upd(step="Handing files to Sonarr")
            # folder only: with seriesId Sonarr ignores the folder and lists the whole series folder instead
            items = sonarr.api("/api/v3/manualimport?folder=%s&filterExistingFiles=false" % sonarr.q(stage)) or []
            by_name = {os.path.basename(it.get("path") or ""): it for it in items}
            files, reasons = [], {}
            for name, ids in want.items():
                it = by_name.get(name)
                if not it or not it.get("quality"):
                    failed.append(dict(file=origin[name], episode=label[name], reason="Sonarr could not read the file")); continue
                reasons[name] = [r.get("reason") for r in it.get("rejections") or [] if r.get("reason")]
                q = it.get("quality")
                try:
                    pq = (sonarr.parse(origin[name]).get("parsedEpisodeInfo") or {}).get("quality")
                    if pq and (pq.get("quality") or {}).get("id"): q = pq
                except Exception: pass
                f = {"path": it["path"], "seriesId": sid, "episodeIds": ids, "quality": q,
                     "languages": it.get("languages") or [{"id": 1, "name": "English"}], "releaseGroup": it.get("releaseGroup", "")}
                if download_id: f["downloadId"] = download_id
                files.append(f)
            if files:
                upd(step="Sonarr is importing %d file%s" % (len(files), "" if len(files) == 1 else "s"))
                sonarr.command({"name": "ManualImport", "importMode": "copy", "files": files})

            # 3) verify: an episode counts only when its library file IS the file we handed over
            upd(step="Checking that every episode landed")
            eps2 = {e["id"]: e for e in sonarr.episodes(sid, fresh=True)}
            files2 = {f["id"]: f for f in sonarr.episode_files(sid, fresh=True)}
            for f in files:
                name = os.path.basename(f["path"]); ok = True
                for i in f["episodeIds"]:
                    lf = files2.get((eps2.get(i) or {}).get("episodeFileId"))
                    try: same = bool(lf) and os.stat(lf["path"]).st_ino == ino[name]
                    except OSError: same = False
                    if same: after[str(i)] = {"file_id": lf["id"], "path": lf["path"]}
                    else: ok = False
                item = dict(file=origin[name], episode=label[name])
                if ok: landed.append(item); continue
                kind, why = explain(reasons.get(name))
                item["reason"] = why
                (skipped if kind == "skip" else failed).append(item)
        finally:
            for fn in os.listdir(stage):
                try: os.remove(os.path.join(stage, fn))
                except OSError: pass
            try: os.rmdir(stage)
            except OSError: pass

    sonarr.drop_series(sid); packs.invalidate(sid)
    count = len(landed) + len(placed)
    ev = None
    if count or failed:
        ev = store.add_history(dict(kind="import", auto=auto, series_id=sid, series=title, slug=series.get("titleSlug"),
                                    pack=pack, pack_name=os.path.basename(pack or ""), download_id=download_id,
                                    landed=len(landed), placed=placed, joined=joined, skipped=skipped, failed=failed,
                                    before={k: v for k, v in before.items() if k in after}, after=after))
    if pack and count and not failed: store.mark_imported(pack, title, count)
    status = "completed" if not failed else ("partial" if count else "failed")
    return dict(status=status, series=title, imported=count, plex=len(placed), joined=joined, landed=landed,
                skipped=skipped, failed=failed, history_id=ev and ev["id"],
                errors=["%s: %s" % (x["episode"], x["reason"]) for x in failed],
                message=None if count or failed else "Nothing new to import: %s." % (skipped[0]["reason"].lower() if skipped else "no files were assigned"))

# ------------------------------------------------------------------ undo
def undo(eid):
    ev = store.get_history(eid)
    if not ev: raise LookupError("That history entry no longer exists.")
    if ev.get("undone"): raise ValueError("This was already undone.")
    rb = sonarr.recycle_bin()
    if not rb or not os.path.isdir(rb):
        raise ValueError("Undo needs Sonarr's recycle bin (Settings > Media Management) so nothing is deleted for good.")
    if ev["kind"] == "relink": return _undo_relink(ev, rb)
    sid = ev["series_id"]
    series = sonarr.api("/api/v3/series/%d" % sid)
    parent = os.path.dirname(series["path"].rstrip("/"))
    removed = restored = 0
    # 1) move the replaced originals out of the recycle bin's way first, so deleting the new
    #    files (which Sonarr also recycles, possibly under the same name) can never overwrite them
    hold = os.path.join(rb, ".fixarr-undo-" + eid)
    held = []
    for epid, b in (ev.get("before") or {}).items():
        p = b["path"]
        if os.path.exists(p) and p not in {a["path"] for a in ev.get("after", {}).values()}: continue
        cand = os.path.join(rb, os.path.relpath(p, parent))
        if b.get("size") and (not os.path.exists(cand) or os.path.getsize(cand) != b["size"]):
            d, stem = os.path.dirname(cand), os.path.splitext(os.path.basename(cand))[0]
            cand = next((os.path.join(d, x) for x in (os.listdir(d) if os.path.isdir(d) else [])
                         if x.startswith(stem) and os.path.getsize(os.path.join(d, x)) == b["size"]), None)
        if cand and os.path.exists(cand):
            h = os.path.join(hold, os.path.relpath(p, parent))
            os.makedirs(os.path.dirname(h), exist_ok=True); os.rename(cand, h); held.append((h, p))
    # 2) remove what the import added (Sonarr moves it to the recycle bin)
    for fid in sorted({a["file_id"] for a in ev.get("after", {}).values()}):
        try: sonarr.delete_episode_file(fid); removed += 1
        except sonarr.SonarrError: pass
    # 3) put the originals back
    for h, p in held:
        if not os.path.exists(p):
            os.makedirs(os.path.dirname(p), exist_ok=True); os.rename(h, p); restored += 1
    for root, dirs, fs in os.walk(hold, topdown=False):
        if not fs:
            try: os.rmdir(root)
            except OSError: pass
    for p in ev.get("placed") or []:
        if os.path.exists(p):
            dst = os.path.join(rb, os.path.relpath(p, parent))
            os.makedirs(os.path.dirname(dst), exist_ok=True); os.rename(p, dst); removed += 1
    sonarr.rescan(sid)
    sonarr.drop_series(sid); packs.invalidate(sid)
    if ev.get("pack"):
        d = store.imported(); d.pop(ev["pack"], None); store.save("imported.json", d)
    store.update_history(eid, undone=int(time.time()))
    store.log("undo", "Undid the import of %s into %s" % (ev.get("pack_name") or "a pack", ev.get("series")))
    return dict(removed=removed, restored=restored)

def _undo_relink(ev, rb):
    restored = 0
    for it in ev.get("items") or []:
        if os.path.exists(it["recycled"]):
            os.replace(it["recycled"], it["path"]); restored += 1
    store.update_history(ev["id"], undone=int(time.time()))
    return dict(removed=0, restored=restored)
