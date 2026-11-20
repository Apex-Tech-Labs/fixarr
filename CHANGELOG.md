# Changelog

## 3.0.0

- Fixarr inside Sonarr's UI: tabbed panel (Import, Activity, History, Audit, Settings), season icons, Wanted and Queue buttons.
- Auto mode: clears stuck downloads that are already in the library, imports confident ones, Sonarr webhook for instant reaction.
- Every import is verified per episode; history with undo through Sonarr's recycle bin.
- Pack catalog with states; finished packs hidden unless searched.
- Library audit (possibly mislabeled episodes, files that are not hardlinked) with byte-compared relink.
- Matcher: lettered segments, more part patterns (Pt, CD, Disc, "1 of 2"), show names inside titles kept, season-aware specials.
- Remembered manual matches, runtime check, optional Plex scan, daily update check.
- Configuration through environment variables only; `/config` for state; userscript install (`/fixarr.user.js`).
- One app, two ways in: the Fixarr web app (now the same panel as inside Sonarr, with themes) and the Sonarr add-on.
- New Settings window: General, Matching, Library audit, Sonarr add-on (status and per-placement switches), Updates (check, channel), Remembered matches, Appearance, About.
- Licensed under GPL-3.0.

## 2.1.0

- First in-Sonarr layer (menu entry, series button, panel).
