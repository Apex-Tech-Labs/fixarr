"""Fixarr 3 - imports the packs Sonarr can't, from inside Sonarr's own UI.

Routes kept from 2.x (Mission Patch and the standalone page use them): /, /api/packs, /api/preview,
/api/import, /api/import/<job>. Everything else is new in 3.0.
"""
import datetime, os, re, threading, time
from flask import Flask, request, jsonify, render_template, send_from_directory
import audit, importer, packs, plex, resolver, sonarr, store, version
from config import VERSION, CORS_ORIGINS, SONARR, SONARR_PUBLIC

app = Flask(__name__)

def err(msg, code=400): return jsonify({"error": msg}), code

@app.after_request
def cors(r):
    o = (request.headers.get("Origin") or "").rstrip("/")
    if o and o in CORS_ORIGINS:
        r.headers["Access-Control-Allow-Origin"] = o
        r.headers["Access-Control-Allow-Headers"] = "Content-Type"
        r.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
        r.headers["Vary"] = "Origin"
    return r

@app.errorhandler(sonarr.SonarrError)
def sonarr_down(e): return err(str(e), 502)

# ------------------------------------------------------------------ pages and the layer
_build = {"mtime": None, "id": VERSION}
def layer_build():
    """The build stamp static/build.sh writes into layer.js. It is part of the script URL, and the add-on compares it
    with its own copy, so a new build is never stuck behind a browser or proxy cache."""
    p = os.path.join(app.static_folder, "layer.js")
    try: m = os.path.getmtime(p)
    except OSError: return VERSION
    if _build["mtime"] != m:
        with open(p, encoding="utf-8") as f: head = f.read(6000)
        mm = re.search(r"var BUILD = '([0-9A-Za-z.\-]+)'", head)
        _build.update(mtime=m, id=mm.group(1) if mm else "%s-%d" % (VERSION, int(m)))
    return _build["id"]

@app.route("/")
def index(): return render_template("index.html", version=VERSION, asset_v=layer_build())

@app.route("/api/build")
def api_build():
    r = jsonify({"version": VERSION, "build": layer_build()})
    r.headers["Cache-Control"] = "no-store"
    return r

@app.route("/layer.js")
def layer_js():
    r = send_from_directory(app.static_folder, "layer.js", mimetype="application/javascript", max_age=0)
    r.headers["Cache-Control"] = "no-cache"
    return r

@app.route("/fixarr.user.js")
def userscript():
    """Install without a reverse proxy: a userscript (Tampermonkey/Violentmonkey) that loads the layer into Sonarr.
    /fixarr.user.js?sonarr=https://sonarr.example.com  (that origin must also be listed in CORS_ORIGINS)."""
    base = request.host_url.rstrip("/") + "/"
    target = (request.args.get("sonarr") or "").rstrip("/")
    match = (target + "/*") if target else "*://*/*"
    js = "\n".join([
        "// ==UserScript==", "// @name         Fixarr for Sonarr", "// @namespace    https://github.com/" + version.REPO,
        "// @version      " + VERSION, "// @description  Adds Fixarr to Sonarr's own UI",
        "// @match        " + match, "// @grant        none", "// @run-at       document-end", "// ==/UserScript==",
        "(function () {",
        "  if (!document.querySelector('meta[name=\"description\"][content*=\"Sonarr\"]') && !/sonarr/i.test(document.title)) return;",
        "  window.FIXARR_BASE = %r;" % base,
        "  var s = document.createElement('script'); s.defer = true; s.src = %r + 'layer.js'; document.head.appendChild(s);" % base,
        "})();", ""])
    return app.response_class(js, mimetype="application/javascript")

# ------------------------------------------------------------------ packs
def _filter(items, series_id=None, season=None, show_all=False, q=None):
    out = items
    if series_id: out = [x for x in out if x.get("series_id") == series_id]
    if season is not None: out = [x for x in out if season in (x.get("season_list") or [])]
    if q:
        ql = q.lower()
        out = [x for x in out if ql in x["name"].lower() or ql in (x.get("series_title") or "").lower()]
    elif not show_all:
        out = [x for x in out if x["state"] in ("needs", "review")]
    return out

@app.route("/api/packs")
def api_packs():
    """2.x shape plus state. Default: only packs that still need work (finished ones show with ?all=1)."""
    items, _ = packs.catalog()
    return jsonify(_filter(items, request.args.get("series_id", type=int), None, bool(request.args.get("all"))))

@app.route("/api/catalog")
def api_catalog():
    if request.args.get("refresh"): packs.invalidate()
    items, building = packs.catalog(wait=not request.args.get("nowait"))
    out = _filter(items, request.args.get("series_id", type=int), request.args.get("season", type=int),
                  bool(request.args.get("all")), (request.args.get("q") or "").strip() or None)
    counts = {k: sum(1 for x in items if x["state"] == k) for k in ("needs", "review", "done", "covered")}
    return jsonify({"items": out, "building": building, "counts": counts, "at": packs._cat["at"]})

@app.route("/api/missing")
def api_missing():
    """Wanted integration: missing episodes that a pack already on disk can fill."""
    items, _ = packs.catalog()
    by_series = {}
    for x in items:
        if x["state"] != "needs": continue
        s = by_series.setdefault(x["series_id"], {"series_id": x["series_id"], "series": x["series_title"], "episodes": set(), "packs": []})
        s["episodes"].update(x.get("missing_eps") or []); s["packs"].append({"path": x["path"], "name": x["name"]})
    out = [dict(v, episodes=sorted(v["episodes"])) for v in by_series.values()]
    return jsonify({"series": out, "episodes": sum(len(v["episodes"]) for v in out)})

# ------------------------------------------------------------------ preview / import
@app.route("/api/preview", methods=["POST"])
def api_preview():
    b = request.get_json(force=True)
    try: return jsonify(importer.preview(b.get("pack"), b.get("series_id"), b.get("series"), b.get("only")))
    except ValueError as e: return err(str(e))
    except LookupError as e: return err(str(e), 404)

@app.route("/api/import", methods=["POST"])
def api_import():
    b = request.get_json(force=True)
    if not b.get("series_id") or not (b.get("assignments") or []): return err("Nothing to import.")
    return jsonify({"job": importer.start(b)}), 202

@app.route("/api/import/<job>")
def api_import_status(job):
    j = importer.job(job)
    return jsonify(j) if j else err("Unknown import job.", 404)

def _series_row(s):
    st = s.get("statistics") or {}
    return {"id": s["id"], "title": s["title"], "slug": s.get("titleSlug"), "year": s.get("year"),
            "network": s.get("network") or "", "status": s.get("status") or "", "monitored": bool(s.get("monitored")),
            "files": st.get("episodeFileCount") or 0, "episodes": st.get("episodeCount") or 0,
            "poster": any((i.get("coverType") == "poster") for i in (s.get("images") or []))}

@app.route("/api/poster/<int:sid>")
def api_poster(sid):
    """Sonarr's own poster for a series (the 250px thumbnail), so the web app can show it without Sonarr's key."""
    try: data, ctype = sonarr.poster(sid)
    except sonarr.SonarrError: data, ctype = None, None
    if not data: return err("No poster.", 404)
    r = app.response_class(data, mimetype=ctype or "image/jpeg")
    r.headers["Cache-Control"] = "public, max-age=86400"
    return r

@app.route("/api/series")
def api_series():
    series = sonarr.series_all()
    slug = request.args.get("slug"); sid = request.args.get("id", type=int)
    if slug or sid:
        for s in series:
            if (slug and s.get("titleSlug") == slug) or (sid and s["id"] == sid):
                return jsonify(_series_row(s))
        return err("Series not found in Sonarr.", 404)
    out = [_series_row(s) for s in series]
    out.sort(key=lambda x: (x.get("title") or "").lower().removeprefix("the "))
    return jsonify(out)

# ------------------------------------------------------------------ auto mode, history, audit, settings
@app.route("/api/overview")
def api_overview():
    items, building = packs.catalog(wait=False)
    st = resolver.state()
    return jsonify({
        "version": version.status(), "settings": store.settings(), "plex": plex.enabled(),
        "packs": {k: sum(1 for x in items if x["state"] == k) for k in ("needs", "review", "done", "covered")},
        "building": building, "resolver": {"running": st["running"], "at": st["at"], "open": len(st["downloads"])},
        "audit": {k: v for k, v in audit.results().items() if k in ("at", "running", "progress")},
        "recycle_bin": bool(sonarr.recycle_bin()), "sonarr_public": SONARR_PUBLIC})

def _page(items):
    """?page=1&pageSize=25 -> one page plus totals (the UI pages through long lists)."""
    size = max(5, min(200, request.args.get("pageSize", 25, type=int)))
    total = len(items); pages = max(1, -(-total // size))
    page = max(1, min(pages, request.args.get("page", 1, type=int)))
    return {"records": items[(page - 1) * size: page * size], "total": total, "page": page, "pageSize": size, "pages": pages}

@app.route("/api/activity")
def api_activity():
    log = store.activity()
    if request.args.get("page"): return jsonify({"resolver": resolver.state(), "log": _page(log)})
    return jsonify({"resolver": resolver.state(), "log": log[:150]})

@app.route("/api/resolve", methods=["POST"])
def api_resolve():
    b = request.get_json(force=True, silent=True) or {}
    resolver.run_async(b.get("download_id"), trigger="manual")
    return jsonify({"started": True}), 202

@app.route("/api/history")
def api_history():
    out = []
    for e in store.history():
        out.append({k: v for k, v in e.items() if k not in ("before", "after", "items")} | {"can_undo": not e.get("undone") and bool(e.get("landed") or e.get("placed") or e.get("kind") == "relink")})
    if request.args.get("page"): return jsonify(_page(out))
    return jsonify(out[:200])

@app.route("/api/history/<eid>/undo", methods=["POST"])
def api_undo(eid):
    try: return jsonify(importer.undo(eid))
    except (LookupError, ValueError) as e: return err(str(e))

@app.route("/api/settings", methods=["GET", "POST"])
def api_settings():
    if request.method == "POST": return jsonify(store.save_settings(request.get_json(force=True)))
    return jsonify(store.settings())

@app.route("/api/mappings")
def api_mappings():
    m = store.mappings(); names = {s["id"]: s["title"] for s in sonarr.series_all()}
    return jsonify([{"series_id": int(sid), "series": names.get(int(sid), "Series %s" % sid), "key": k, **v}
                    for sid, d in m.items() for k, v in d.items()])

@app.route("/api/mappings/<int:sid>/<key>", methods=["DELETE"])
def api_forget(sid, key):
    store.forget(sid, key); return jsonify({"ok": True})

@app.route("/api/audit", methods=["GET", "POST"])
def api_audit():
    if request.method == "POST": audit.run_async(); return jsonify({"started": True}), 202
    return jsonify(audit.results())

@app.route("/api/audit/relink", methods=["POST"])
def api_relink():
    b = request.get_json(force=True)
    try: return jsonify(audit.relink(b.get("paths") or []))
    except ValueError as e: return err(str(e))

@app.route("/api/version")
def api_version(): return jsonify(version.check(force=bool(request.args.get("force"))))

# ------------------------------------------------------------------ Sonarr webhook (Settings > Connect > Webhook)
@app.route("/api/hook/sonarr", methods=["POST"])
def api_hook():
    b = request.get_json(force=True, silent=True) or {}
    ev = b.get("eventType")
    if ev == "Test":
        store.log("webhook", "Sonarr's test message arrived; auto mode will react to stuck downloads right away")
    elif ev in ("ManualInteractionRequired", "Download", "Grab"):
        did = b.get("downloadId")
        if ev == "ManualInteractionRequired": resolver.run_async(did, trigger="webhook")
        else: packs.invalidate()
    return jsonify({"ok": True})

# ------------------------------------------------------------------ layer health
@app.route("/api/health", methods=["GET", "POST"])
def api_health():
    if request.method == "POST":
        b = request.get_json(force=True, silent=True) or {}
        keep = {k: b.get(k) for k in ("layer", "sonarr", "nav", "series", "season", "wanted", "queue", "fallback", "page")}
        now = int(time.time()); old = store.load("layer-health.json", {}) or {}
        seen = dict(old.get("seen") or {})                 # when each placement last worked (pages report one at a time)
        for k in ("nav", "series", "season", "wanted", "queue"):
            if keep.get(k) is True: seen[k] = now
        keep.update(at=now, seen=seen); store.save("layer-health.json", keep)
        return jsonify({"ok": True})
    return jsonify({"fixarr": VERSION, "sonarr_url": SONARR, "layer": store.load("layer-health.json", None)})

# ------------------------------------------------------------------ background scheduler
def _scheduler():
    last = {"resolve": 0, "catalog": 0, "audit_day": None, "version": 0}
    time.sleep(20)
    while True:
        try:
            s = store.settings(); now = time.time()
            if now - last["catalog"] > 600:
                packs.rebuild(); last["catalog"] = now
            if (s["auto_import"] or s["auto_clear"]) and now - last["resolve"] > s["resolve_minutes"] * 60:
                resolver.run(trigger="timer"); last["resolve"] = time.time()
            today = datetime.date.today().isoformat()
            if s["audit_nightly"] and datetime.datetime.now().hour == s["audit_hour"] and last["audit_day"] != today:
                last["audit_day"] = today; audit.run()
            if now - last["version"] > 86400:
                version.check(); last["version"] = now
        except Exception:
            pass
        time.sleep(60)

if os.environ.get("FIXARR_SCHEDULER", "1") == "1":
    threading.Thread(target=_scheduler, daemon=True, name="fixarr-scheduler").start()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8686)
