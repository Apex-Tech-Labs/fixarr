# Changelog

## 3.1.0

- New layout modeled on Sonarr: header with the Fixarr logo, title and a search box (packs and series, press / to focus), a left menu with counts, and a toolbar on every page.
- Settings is now a page with its own sections instead of a window.
- Inside Sonarr, Fixarr pages live at `/addons/fixarr/...`, its menu entry gets sub-items, and series, season, Wanted and Queue buttons open the right page directly.
- Activity and History are paginated; the Audit's "Not hardlinked" list is paged too.
- Check Now and Run Audit moved to the toolbar; explanatory text moved into labeled info boxes.
- Neutral grey count badges, bold white menu titles with a hover effect.
- Fixed oddly drawn rows in Activity's "Recently handled" list.
- The web app's script URL now includes the build time, so a new version is never served from a stale cache.
- Source of the UI split into `static/src/` and concatenated into `static/layer.js`.

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
