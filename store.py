"""Small JSON state store (settings, history, activity, mappings, audit). Atomic writes, one lock."""
import json, os, threading, time, uuid
from config import STATE_DIR

_lock = threading.RLock()

def _path(name): return os.path.join(STATE_DIR, name)

def load(name, default):
    with _lock:
        try:
            with open(_path(name)) as f: return json.load(f)
        except Exception:
            return default

def save(name, data):
    with _lock:
        os.makedirs(STATE_DIR, exist_ok=True)
        tmp = _path(name) + ".tmp"
        with open(tmp, "w") as f: json.dump(data, f, indent=1)
        os.replace(tmp, _path(name))

# ------------------------------------------------------------------ settings
DEFAULTS = {
    "auto_import": True,        # import stuck downloads by itself when every file matches confidently
    "auto_clear": True,         # stop Sonarr tracking a download once every episode in it is in the library
    "min_confidence": 90,       # lowest match score auto mode accepts
    "resolve_minutes": 15,      # how often auto mode checks Sonarr's queue (the webhook also triggers it)
    "audit_nightly": True,      # nightly library audit
    "audit_hour": 3,            # local hour for the nightly audit
    "addon_series": True,       # Sonarr add-on: Fixarr button on series pages
    "addon_seasons": True,      # Sonarr add-on: Fixarr icon on every season row
    "addon_wanted": True,       # Sonarr add-on: Fixarr button and row icons on Wanted
    "addon_queue": True,        # Sonarr add-on: Fixarr button and row icons on the Activity queue
    "update_check": True,       # look for new releases on GitHub once a day
    "update_channel": "stable", # stable | beta
    "auto_install": True,       # install updates by itself where Fixarr can (the Windows app); Docker uses its own updater
    "plex_scan": True,          # ask Plex to scan a folder after Fixarr places files in it directly
    "runtime_check": True,      # compare file runtimes with the series runtime in previews
}

def settings():
    s = dict(DEFAULTS); s.update({k: v for k, v in load("settings.json", {}).items() if k in DEFAULTS}); return s

def save_settings(upd):
    s = settings()
    for k, v in (upd or {}).items():
        if k not in DEFAULTS: continue
        t = type(DEFAULTS[k])
        try: s[k] = (bool(v) if t is bool else t(v))
        except (TypeError, ValueError): pass
    s["min_confidence"] = max(50, min(100, s["min_confidence"]))
    s["resolve_minutes"] = max(5, min(240, s["resolve_minutes"]))
    s["audit_hour"] = max(0, min(23, s["audit_hour"]))
    if s["update_channel"] not in ("stable", "beta"): s["update_channel"] = "stable"
    save("settings.json", s)
    return s

# ------------------------------------------------------------------ history (imports, relinks; undo info)
def history(): return load("history.json", [])

def add_history(ev):
    with _lock:
        h = history()
        ev.setdefault("id", uuid.uuid4().hex[:12]); ev.setdefault("at", int(time.time()))
        h.insert(0, ev); save("history.json", h[:500])
        return ev

def get_history(eid): return next((e for e in history() if e.get("id") == eid), None)

def update_history(eid, **kw):
    with _lock:
        h = history()
        for e in h:
            if e.get("id") == eid: e.update(kw)
        save("history.json", h)

# ------------------------------------------------------------------ activity log (what auto mode did)
def activity(): return load("activity.json", [])

def log(kind, text, **extra):
    with _lock:
        a = activity()
        a.insert(0, dict(kind=kind, text=text, at=int(time.time()), **extra))
        save("activity.json", a[:300])

# ------------------------------------------------------------------ imported packs (2.x file, kept)
def imported(): return load("imported.json", {})

def mark_imported(pack, title, count):
    if not pack or not count: return
    with _lock:
        d = imported(); d[pack] = {"at": int(time.time()), "series": title, "count": int(count)}; save("imported.json", d)

# ------------------------------------------------------------------ remembered mappings (per series)
def mappings(): return load("mappings.json", {})

def remember(series_id, key, episode_ids, label):
    with _lock:
        m = mappings(); m.setdefault(str(series_id), {})[key] = {"ids": episode_ids, "label": label, "at": int(time.time())}
        save("mappings.json", m)

def forget(series_id, key):
    with _lock:
        m = mappings(); m.get(str(series_id), {}).pop(key, None)
        if not m.get(str(series_id)): m.pop(str(series_id), None)
        save("mappings.json", m)
