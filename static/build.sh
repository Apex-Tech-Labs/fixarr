#!/bin/sh
# Builds static/layer.js from static/src. The build stamp is part of the script URL and lets the Sonarr add-on
# notice it was handed an old cached copy, so every build reaches the browser without a hard refresh.
set -e
cd "$(dirname "$0")"
STAMP="$(date -u +%Y%m%d%H%M%S)"
cat src/1-core.js src/2-addon.js src/3-css.js src/4-shell.js src/5-pages.js src/6-settings.js \
  | sed "s/__FIXARR_BUILD__/$STAMP/" > layer.js
if command -v node >/dev/null 2>&1; then node --check layer.js; fi
echo "layer.js built ($STAMP)"
