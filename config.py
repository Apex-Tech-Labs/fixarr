"""Fixarr settings. Everything comes from the environment, so the same image runs next to any Sonarr."""
import os

VERSION = "3.0.0"

SONARR = os.environ.get("SONARR_URL", "http://sonarr:8989").rstrip("/")
SONARR_KEY = os.environ.get("SONARR_API_KEY", "")

# Fixarr must see the same /data tree as Sonarr and the download client (hardlinks need one filesystem).
DATA_ROOT = os.environ.get("DATA_ROOT", "/data")
TORRENTS = os.path.realpath(os.environ.get("TORRENTS_ROOT", os.path.join(DATA_ROOT, "torrents")))
SCAN_DIRS = [d.strip() for d in os.environ.get("SCAN_DIRS", os.path.join(TORRENTS, "tv")).split(",") if d.strip()]

# State: /config when mounted (the normal container layout), else next to the torrents (this server's 2.x layout).
STATE_DIR = os.environ.get("STATE_DIR") or ("/config" if os.path.isdir("/config") else os.path.join(TORRENTS, ".fixarr"))

# Optional: Plex targeted scans after files are placed directly in Season 00.
PLEX_URL = os.environ.get("PLEX_URL", "").rstrip("/")
PLEX_TOKEN = os.environ.get("PLEX_TOKEN", "")
# "container_prefix=plex_prefix,..." when Plex sees the library under a different path (e.g. /data=/mnt/storage/data)
PLEX_PATH_MAP = [tuple(x.split("=", 1)) for x in os.environ.get("PLEX_PATH_MAP", "").split(",") if "=" in x]

# Update check (GitHub releases) and optional CORS for the userscript install method.
REPO = os.environ.get("FIXARR_REPO", "Apex-Tech-Labs/fixarr")
CORS_ORIGINS = [o.strip().rstrip("/") for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
