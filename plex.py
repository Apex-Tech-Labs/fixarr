"""Optional Plex targeted scan (only used after Fixarr places files that Sonarr does not import itself)."""
import json, urllib.parse, urllib.request
from config import PLEX_URL, PLEX_TOKEN, PLEX_PATH_MAP

def enabled(): return bool(PLEX_URL and PLEX_TOKEN)

def _get(path, timeout=20):
    req = urllib.request.Request(PLEX_URL + path, headers={"X-Plex-Token": PLEX_TOKEN, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
        return json.loads(raw) if raw else None

def _map(p):
    for a, b in PLEX_PATH_MAP:
        if p == a or p.startswith(a.rstrip("/") + "/"): return b.rstrip("/") + p[len(a.rstrip("/")):]
    return p

def scan(folder):
    """Ask Plex to scan one folder. Returns True when a library section owns it."""
    if not enabled(): return False
    target = _map(folder).rstrip("/")
    secs = ((_get("/library/sections") or {}).get("MediaContainer") or {}).get("Directory") or []
    for d in secs:
        for loc in d.get("Location") or []:
            root = (loc.get("path") or "").rstrip("/")
            if root and (target == root or target.startswith(root + "/")):
                _get("/library/sections/%s/refresh?path=%s" % (d["key"], urllib.parse.quote(target)))
                return True
    return False
