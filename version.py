"""Update check against GitHub releases (stable = latest release, beta = newest release including pre-releases)."""
import json, time, urllib.error, urllib.request
from config import REPO, VERSION
import store

def _tuple(v):
    try: return tuple(int(x) for x in (v or "").lstrip("vV").split("-")[0].split("."))
    except ValueError: return (0,)

def _get(path):
    req = urllib.request.Request("https://api.github.com/repos/%s/%s" % (REPO, path),
                                 headers={"Accept": "application/vnd.github+json", "User-Agent": "fixarr/" + VERSION})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())

def check(force=False):
    s = store.settings()
    st = store.load("update.json", {})
    if not s["update_check"] and not force: return status()
    if not force and time.time() - st.get("checked", 0) < 86400 and st.get("channel") == s["update_channel"]: return status()
    out = {"checked": int(time.time()), "channel": s["update_channel"], "latest": None, "url": None, "note": None, "notes": None}
    try:
        if s["update_channel"] == "beta":
            rel = next((r for r in _get("releases?per_page=10") if not r.get("draft")), None)
            if not rel: raise urllib.error.HTTPError(None, 404, "none", None, None)
        else:
            rel = _get("releases/latest")
        out.update(latest=rel.get("tag_name"), url=rel.get("html_url"), notes=(rel.get("body") or "")[:4000],
                   prerelease=bool(rel.get("prerelease")))
    except urllib.error.HTTPError as e:
        out["note"] = "No release published yet" if e.code == 404 else "GitHub returned HTTP %s" % e.code
    except Exception:
        out["note"] = "Could not reach GitHub"
    store.save("update.json", out)
    return status()

def status():
    st = store.load("update.json", {})
    latest = st.get("latest")
    newer = bool(latest and _tuple(latest) > _tuple(VERSION))
    return {"version": VERSION, "latest": latest, "url": st.get("url"), "note": st.get("note"), "notes": st.get("notes"),
            "checked": st.get("checked"), "channel": st.get("channel") or "stable", "update": newer,
            "major": bool(newer and _tuple(latest)[0] > _tuple(VERSION)[0]), "repo": REPO,
            "enabled": store.settings()["update_check"], "method": "docker"}
