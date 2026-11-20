# Fixarr roadmap

## Next

- **Proxy mode.** Fixarr serves Sonarr itself on a second port with the add-on already in place, so people without a reverse proxy get Fixarr inside Sonarr with no userscript.
- **Windows app.** A native Windows install (installer plus a background service) for people running Sonarr on Windows:
  - It sees the same drive letters as Sonarr, so no path mapping is needed.
  - It installs its own updates, with the option to turn that off.
  - It falls back to copying when downloads and the library are on different drives.
- **Notifications.** Send messages through a self-hosted [Apprise API](https://github.com/caronc/apprise-api), which covers Telegram, Discord, ntfy, email and many more from one URL list. They would cover:
  - auto imports and clears
  - downloads waiting for review
  - audit findings
  - the Sonarr add-on not working after a Sonarr update

## Later

- Joining WMV parts (through ffmpeg).
- Subtitle matching: use subtitle hashes (OpenSubtitles) to confirm untitled or badly numbered episodes. Needs an OpenSubtitles API account.
- Radarr counterpart for multi-part movies (CD1/CD2).
- Optional API key for setups that expose Fixarr beyond the LAN.

## Notes

- Sonarr v5's alternate episode orders reach Fixarr through Sonarr's own episode numbering, so no extra work is needed there.
