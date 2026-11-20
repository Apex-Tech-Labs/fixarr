"""Auto mode: deal with downloads Sonarr could not import, instead of showing its warnings.

For every download Sonarr has blocked:
  clear   every episode in it is already in the library -> stop Sonarr tracking it (files and seeding untouched)
  import  every file needing import matches confidently -> import it, tagged with the download so Sonarr closes it
  review  something needs a person -> it shows up in Fixarr's Import tab, marked "Needs review"
Triggered by Sonarr's webhook (Manual Interaction Required), on a timer, or by "Check now".
"""
import os, threading, time
import importer, packs, sonarr, store
from config import TORRENTS

BLOCKED = {"importblocked", "importpending", "importfailed"}
_lock = threading.Lock()
_state = {"running": False, "at": 0, "downloads": []}

def blocked():
    groups = {}
    for r in sonarr.queue():
        st = (r.get("trackedDownloadState") or "").lower()
        warn = (r.get("trackedDownloadStatus") or "").lower() == "warning" and (r.get("status") or "").lower() == "completed"
        if st not in BLOCKED and not warn: continue
        key = r.get("downloadId") or r.get("title")
        g = groups.setdefault(key, dict(download_id=r.get("downloadId"), title=r.get("title"), series_id=r.get("seriesId"),
                                        series=(r.get("series") or {}).get("title"), slug=(r.get("series") or {}).get("titleSlug"),
                                        output=r.get("outputPath"), queue_ids=[]))
        g["queue_ids"].append(r["id"])
    return list(groups.values())

def plan(g, settings):
    out = g.get("output") or ""
    rp = os.path.realpath(out) if out else ""
    if not rp or not os.path.exists(rp) or not rp.startswith(TORRENTS + os.sep):
        return dict(action="wait", text="Waiting for the download to finish moving")
    pack, only = (rp, None) if os.path.isdir(rp) else (os.path.dirname(rp), [os.path.basename(rp)])
    if not g.get("series_id"):
        return dict(action="review", text="Fixarr needs you to pick the series", pack=pack)
    pv = importer.preview(pack, series_id=g["series_id"], only=only)
    rows = pv["matched"]
    need = [r for r in rows if r.get("library") == "new"]
    if not need and not [u for u in pv["unmatched"] if u.get("special_title") is None]:
        return dict(action="clear", text="Everything in this download is already in your library", pack=pack, series_id=pv["series"]["id"])
    if not need:
        return dict(action="clear", text="Every episode is in your library; leftover extras are not Sonarr episodes", pack=pack, series_id=pv["series"]["id"])
    unsure = [r for r in need if r.get("review") or (r.get("confidence") or 0) < settings["min_confidence"]]
    if unsure:
        return dict(action="review", pack=pack, series_id=pv["series"]["id"],
                    text="%d of %d file%s need%s your review" % (len(unsure), len(need), "" if len(need) == 1 else "s", "s" if len(unsure) == 1 else ""))
    asn = []
    for r in need:
        a = {"src": r["src"], "episodeId": r["episodeId"], "title": r.get("title")}
        if r.get("parts"): a["parts"] = r["parts"]
        if r.get("episodeIds") and len(r["episodeIds"]) > 1: a["episodeIds"] = r["episodeIds"]
        asn.append(a)
    return dict(action="import", pack=pack, series_id=pv["series"]["id"], assignments=asn,
                text="%d file%s ready to import" % (len(asn), "" if len(asn) == 1 else "s"))

def run(download_id=None, trigger="timer"):
    """Plan every blocked download and act on it as the settings allow. Returns the plans."""
    if not _lock.acquire(blocking=False): return {"busy": True}
    _state["running"] = True
    try:
        s = store.settings(); out = []
        for g in blocked():
            if download_id and g["download_id"] != download_id: continue
            try: p = plan(g, s)
            except Exception as ex: p = dict(action="review", text="Fixarr could not read this download (%s)" % ex)
            g.update(plan=p, done=None)
            name = g.get("series") or g.get("title")
            if p["action"] == "clear" and s["auto_clear"]:
                try:
                    sonarr.stop_tracking(g["queue_ids"])
                    g["done"] = "cleared"
                    store.log("cleared", "%s: already in your library, cleared from Sonarr's queue (still seeding)" % name, title=g["title"], slug=g.get("slug"))
                    if p.get("series_id"): packs.invalidate(p["series_id"])
                except sonarr.SonarrError as ex: g["done"] = "error"; g["error"] = str(ex)
            elif p["action"] == "import" and s["auto_import"]:
                res = importer.run(dict(series_id=p["series_id"], pack=p["pack"], assignments=p["assignments"],
                                        download_id=g["download_id"]), auto=True)
                g["done"] = "imported" if res["status"] == "completed" else res["status"]
                g["result"] = {k: res.get(k) for k in ("imported", "joined", "failed", "skipped", "history_id")}
                n, nf = res["imported"], len(res["failed"])
                text = ("%s: imported %d file%s automatically" % (name, n, "" if n == 1 else "s")) if n else \
                       ("%s: Sonarr did not take the file%s; it is waiting for you" % (name, "" if nf == 1 else "s"))
                if n and nf: text += "; %d need%s a look" % (nf, "s" if nf == 1 else "")
                store.log("imported" if n else "review", text,
                    title=g["title"], slug=g.get("slug"), history_id=res.get("history_id"))
            out.append({k: v for k, v in g.items() if k != "queue_ids"})
        if not download_id:
            _state.update(downloads=out, at=time.time())
        else:
            keep = [d for d in _state["downloads"] if d.get("download_id") != download_id]
            _state.update(downloads=keep + out, at=time.time())
        packs.invalidate()
        return {"downloads": out}
    finally:
        _state["running"] = False
        _lock.release()

def run_async(download_id=None, trigger="timer"):
    threading.Thread(target=run, kwargs=dict(download_id=download_id, trigger=trigger), daemon=True).start()

def state():
    return dict(running=_state["running"], at=_state["at"],
                downloads=[d for d in _state["downloads"] if d.get("done") not in ("cleared", "imported")])
