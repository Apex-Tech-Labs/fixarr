"""Sonarr API v3 client with a short cache. v3 is served by Sonarr v4 and by the v5 develop branch."""
import json, threading, time, urllib.error, urllib.parse, urllib.request
from config import SONARR, SONARR_KEY

q = urllib.parse.quote

class SonarrError(Exception):
    pass

def api(path, method="GET", body=None, timeout=120):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(SONARR + path, data=data, method=method, headers={
        "X-Api-Key": SONARR_KEY, "Content-Type": "application/json", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raise SonarrError("Sonarr returned HTTP %s for %s" % (e.code, path.split("?")[0]))
    except urllib.error.URLError as e:
        raise SonarrError("Sonarr is not reachable at %s (%s)" % (SONARR, e.reason))

_cache, _clock = {}, threading.Lock()

def cached(key, ttl, fn):
    now = time.time()
    with _clock:
        hit = _cache.get(key)
        if hit and now - hit[0] < ttl: return hit[1]
    val = fn()
    with _clock: _cache[key] = (now, val)
    return val

def drop(*keys):
    with _clock:
        for k in keys: _cache.pop(k, None)

def drop_series(sid):
    drop(("eps", sid), ("files", sid), ("lib", sid), "series")

def status(): return cached("status", 3600, lambda: api("/api/v3/system/status"))
def series_all(): return cached("series", 120, lambda: api("/api/v3/series"))

def series(sid):
    for s in series_all():
        if s["id"] == int(sid): return s
    return api("/api/v3/series/%d" % int(sid))

def episodes(sid, fresh=False):
    if fresh: drop(("eps", sid))
    return cached(("eps", sid), 60, lambda: api("/api/v3/episode?seriesId=%d" % int(sid)))

def episode_files(sid, fresh=False):
    if fresh: drop(("files", sid))
    return cached(("files", sid), 60, lambda: api("/api/v3/episodefile?seriesId=%d" % int(sid)))

def queue():
    r = api("/api/v3/queue?page=1&pageSize=2000&includeSeries=true&includeEpisode=true&includeUnknownSeriesItems=true")
    return (r or {}).get("records") or []

def recycle_bin():
    return (cached("mm", 600, lambda: api("/api/v3/config/mediamanagement")) or {}).get("recycleBin") or ""

def parse(title): return api("/api/v3/parse?title=" + q(title))

def command(body, wait=900):
    c = api("/api/v3/command", "POST", body)
    st, end = c, time.time() + wait
    while time.time() < end and st.get("status") not in ("completed", "failed", "aborted", "cancelled", "orphaned"):
        time.sleep(2)
        st = api("/api/v3/command/%d" % c["id"])
    return st

def rescan(sid): return command({"name": "RescanSeries", "seriesId": int(sid)}, wait=600)

def stop_tracking(queue_ids):
    """Remove a download from Sonarr's queue only: files stay, the torrent keeps seeding, nothing is blocklisted."""
    api("/api/v3/queue/bulk?removeFromClient=false&blocklist=false&skipRedownload=true", "DELETE", {"ids": list(queue_ids)})

def delete_episode_file(fid):
    """Sonarr moves the file to its recycle bin when one is configured."""
    api("/api/v3/episodefile/%d" % int(fid), "DELETE")
