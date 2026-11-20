# Fixarr

**Imports the season packs Sonarr can't.**

Fixarr runs as a small container next to Sonarr. It has its own web app, and an optional **Sonarr add-on** that puts Fixarr right inside Sonarr's own pages. Sonarr is never forked or patched, so Sonarr updates keep working.

## What it does

- **Matches messy packs by title, not just numbers.** It handles:
  - wrong numbering, multi-season packs and DVD orders
  - episodes split into parts (`E01a`/`E01b`, `Part 1`/`Part 2`, `Pt.One`, `CD1`/`CD2`, `Disc 1`, `1 of 2`), joined losslessly into one file
- **Imports through Sonarr.** Files are hardlinked, so torrents keep seeding and no extra space is used.
- **Checks every import.** An episode counts as imported only when Sonarr's library file is the exact file Fixarr handed over. You always get "landed", "kept the library's file" or "did not land", each with a reason.
- **Unsticks Sonarr's queue (auto mode):**
  - When everything in a stuck download is already in your library, Fixarr clears it from Sonarr's queue. The torrent keeps seeding.
  - When every file matches confidently, Fixarr imports it, tagged to the download so Sonarr closes it.
  - Anything else waits for you.
- **Shows only what needs you.** Packs that are already imported or already in your library stay hidden until you search for them.
- **History with undo.** Replaced files go to Sonarr's recycle bin and come back on undo.
- **Library audit.**
  - Finds episodes whose original release name points at a different episode.
  - Finds library files that are separate copies of files still seeding, and relinks them after a byte-for-byte check.
- **Remembers your corrections.** Fix a match once and Fixarr reuses it for that file name.
- **Specials.** Files Sonarr has no episode for can go straight into Season 00. Fixarr can then ask Plex to scan that folder (optional).

## Two ways to use it

| | Where it shows | Setup |
|---|---|---|
| **Fixarr web app** | `http://your-server:8686` | Nothing extra |
| **Sonarr add-on** | Inside Sonarr: a menu entry, Fixarr buttons on series pages and on every season, and on the Wanted and Activity pages | One reverse proxy snippet, or a browser userscript |

Both are the same app with the same settings and history. The add-on only adds Fixarr to Sonarr's pages:

- **Looks native.** It takes its colors from Sonarr's own theme.
- **Survives updates.** It finds its place by Sonarr's labels, so it keeps working after Sonarr updates.
- **Easy to tailor.** You can switch each placement on or off in Fixarr's **Settings > Sonarr add-on**.

## Requirements

- **Sonarr:** v4. The v5 beta works too.
- **Docker:** with Docker Compose.
- **One shared data folder.** Fixarr must see the same `/data` folder as Sonarr and your download client. Hardlinks only work inside one filesystem, so use the single `/data` layout from the [TRaSH guide](https://trash-guides.info/File-and-Folder-Structure/).
- **Sonarr's recycle bin (recommended):** turn it on in Sonarr's Settings > Media Management. Undo and relink need it.

## Install (Linux, Docker Compose)

1. **Create a folder for Fixarr's settings**, so it belongs to your user and not root:

   ```sh
   mkdir -p ./fixarr
   ```

2. **Add Fixarr to your `docker-compose.yml`**, next to Sonarr:

   ```yaml
   services:
     fixarr:
       image: ghcr.io/apex-tech-labs/fixarr:latest
       container_name: fixarr
       user: 1000:1000                      # the same user Sonarr runs as
       environment:
         - SONARR_URL=http://sonarr:8989
         - SONARR_API_KEY=your-sonarr-api-key
         - SCAN_DIRS=/data/torrents/tv       # folders that hold TV packs (comma-separated)
         - TZ=Etc/UTC
       volumes:
         - ./fixarr:/config
         - /path/to/data:/data               # the SAME host folder Sonarr mounts as /data
       ports:
         - 8686:8686
       restart: unless-stopped
   ```

   Find Sonarr's API key in Sonarr under Settings > General. See [`docker-compose.example.yml`](docker-compose.example.yml) for every option.

3. **Start it** with `docker compose up -d`, then open `http://your-server:8686`.

4. **Connect the Sonarr webhook** so auto mode reacts the moment Sonarr gets stuck:
   1. In Sonarr, open Settings > Connect > + > Webhook.
   2. Set the URL to `http://fixarr:8686/api/hook/sonarr`.
   3. Tick only **On Manual Interaction Required**.

   Without the webhook, Fixarr still checks the queue every 15 minutes.

## Install the Sonarr add-on (optional)

Pick one way. Fixarr's **Settings > Sonarr add-on** shows the same snippets with copy buttons, and tells you once the add-on is working.

### A. Reverse proxy (recommended)

Serve Fixarr under `/fixarr/` on Sonarr's address and add one script tag to Sonarr's page.

**Nginx or Nginx Proxy Manager** (Advanced tab of the Sonarr host):

```nginx
location ^~ /fixarr/ {
    proxy_pass http://fixarr:8686/;
    proxy_read_timeout 300s;
}
sub_filter '</head>' '<script defer src="/fixarr/layer.js"></script></head>';
sub_filter_once on;
proxy_set_header Accept-Encoding "";
```

Protect `/fixarr/` with the same login as the rest of Sonarr.

**Caddy, Traefik or SWAG:** same idea. Send `/fixarr/*` to the container with the prefix removed, and add the script tag to Sonarr's HTML.

### B. Userscript (no proxy changes)

1. On the Fixarr container, set `CORS_ORIGINS` to your Sonarr address, for example `CORS_ORIGINS=https://sonarr.example.com`.
2. Install a userscript manager in your browser: Violentmonkey or Tampermonkey.
3. Open `http://your-server:8686/fixarr.user.js?sonarr=https://sonarr.example.com` and accept the install.

The add-on then shows in every browser where the userscript is installed.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `SONARR_URL` | `http://sonarr:8989` | How Fixarr reaches Sonarr |
| `SONARR_API_KEY` | | Sonarr's API key |
| `SCAN_DIRS` | `/data/torrents/tv` | Comma-separated folders holding packs |
| `DATA_ROOT` | `/data` | Root of the shared data folder |
| `TORRENTS_ROOT` | `$DATA_ROOT/torrents` | Fixarr only reads and links packs under this folder |
| `STATE_DIR` | `/config` | Settings, history and remembered matches |
| `PLEX_URL`, `PLEX_TOKEN` | | Optional: Plex scan for specials Fixarr places in Season 00 |
| `PLEX_PATH_MAP` | | `container=plex` path pairs when Plex sees the library under another path, e.g. `/data=/mnt/storage/data` |
| `CORS_ORIGINS` | | Sonarr addresses allowed to call Fixarr (userscript install only) |
| `FIXARR_SCHEDULER` | `1` | `0` turns off auto mode, the catalog refresh and the nightly audit |

Everything else lives in **Settings** inside Fixarr: auto mode, match score, runtime check, nightly audit, the Sonarr add-on and updates.

## Updates

Turn these on or off in **Settings > Updates**:

- **Update check.** Fixarr looks for a new GitHub release once a day and shows "Update available" in its window. Nothing else is sent.
- **Channel.**
  - **Stable** gets finished releases.
  - **Beta** also gets test releases before they are finished.
- **Installing updates.** A container can't replace itself, so let your container updater do it. With [Watchtower](https://github.com/nicholas-fedor/watchtower), Fixarr updates itself whenever a new image is published.

Image tags:

| Tag | Follows |
|---|---|
| `latest` | Every stable release (recommended) |
| `beta` | Every beta release (what the Beta channel installs) |
| `edge` | The main branch, for testing |
| `3.1.0` (any version number) | That exact release, never updated |

Major releases (for example 3.x to 4.0) are announced in Fixarr before you install them, and they move your settings forward on their own.

## Security

Fixarr has no login of its own. Anyone who can reach port 8686 can import into your Sonarr, so keep it on your LAN or VPN, or behind the same login as Sonarr.

Fixarr only reads and links files under `TORRENTS_ROOT`. It only changes your library through Sonarr's API.

## Joining multi-part episodes

Parts are joined losslessly with [mkvmerge](https://mkvtoolnix.download/) into one MKV file, which Sonarr, Plex, Jellyfin and Emby all play.

- **Supported part formats:** MKV, MP4, M4V, MOV, AVI, MPG, VOB and TS.
- **WMV parts can't be joined.** Import part 1 on its own instead.
- **Codecs must match.** All parts of one episode need the same video and audio codecs, which is normal for split releases.

## Development

```sh
pip install -r requirements.txt
python3 tests/units.py        # matcher unit checks
python3 tests/regression.py   # synthetic regression: made-up shows covering every naming situation
SONARR_URL=... SONARR_API_KEY=... FIXARR_SCHEDULER=0 python3 app.py
```

## Roadmap

See [ROADMAP.md](ROADMAP.md).

## License

GNU General Public License v3.0. See [LICENSE](LICENSE).
