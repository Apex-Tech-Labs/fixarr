"""File-level helpers: runtime (mediainfo), embedded title (mkvmerge -J), lossless joins (mkvmerge)."""
import functools, json, os, shutil, subprocess

def _run(cmd, timeout=60):
    try: return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout).stdout
    except Exception: return ""

HAVE_MEDIAINFO = bool(shutil.which("mediainfo"))
HAVE_MKVMERGE = bool(shutil.which("mkvmerge"))

@functools.lru_cache(maxsize=8192)
def _duration(path, mtime):
    out = _run(["mediainfo", "--Inform=General;%Duration%", path]).strip()
    try: return round(float(out.split(".")[0]) / 60000.0, 1)
    except ValueError: return None

def minutes(path):
    """Runtime in minutes, or None."""
    if not HAVE_MEDIAINFO: return None
    try: return _duration(path, os.stat(path).st_mtime)
    except OSError: return None

@functools.lru_cache(maxsize=8192)
def _title(path, mtime):
    out = _run(["mkvmerge", "-J", path])
    try: return ((json.loads(out).get("container") or {}).get("properties") or {}).get("title") or ""
    except ValueError: return ""

def embedded_title(path):
    """The title stored inside an MKV (rips often carry the episode title there)."""
    if not HAVE_MKVMERGE or not path.lower().endswith((".mkv", ".mk3d", ".webm")): return ""
    try: return _title(path, os.stat(path).st_mtime)
    except OSError: return ""

def join(parts, dst):
    """Losslessly append parts into one MKV. mkvmerge exit 0 = ok, 1 = warnings, 2 = error.
    mkvmerge reads MKV, MP4/M4V/MOV, AVI, MPEG-PS (mpg/vob), MPEG-TS (ts/m2ts), FLV, OGM and RealMedia; it cannot
    read WMV/ASF. Parts must share the same codecs (mkvmerge refuses to append mismatched tracks)."""
    exts = {os.path.splitext(p)[1].lower() for p in parts}
    if exts & {".wmv", ".asf"}:
        raise RuntimeError("WMV parts cannot be joined losslessly; import part 1 on its own or convert the parts first")
    cmd = ["mkvmerge", "-q", "-o", dst, parts[0]]
    for p in parts[1:]: cmd += ["+", p]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=7200)
    if r.returncode >= 2 or not os.path.exists(dst):
        try: os.remove(dst)
        except OSError: pass
        raise RuntimeError("mkvmerge could not join the parts: " + (r.stdout + r.stderr).strip()[-300:])
