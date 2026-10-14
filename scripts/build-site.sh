#!/usr/bin/env bash
# Builds the Booker Arcade website: the menu page from site/ plus every game,
# each in its own folder (<out>/booker-run/, <out>/soba-tower/, and so on).
# Games build with relative paths (--base ./), so the site works from any
# subfolder, including https://<user>.github.io/booker-arcade/.
#
# Usage: bash scripts/build-site.sh [out-dir]   (default: _site)
set -euo pipefail
cd "$(dirname "$0")/.."

GAMES=(booker-run backyard-brawl soba-tower soba-guard lucky-paw-casino)
OUT="${1:-_site}"
case "$OUT" in /*) ;; *) OUT="$PWD/$OUT" ;; esac

rm -rf "$OUT"
mkdir -p "$OUT"
cp -R site/. "$OUT/"

for game in "${GAMES[@]}"; do
  echo "== Building $game"
  (
    cd "$game"
    [ -d node_modules ] || npm ci --no-audit --no-fund
    npx vite build --base ./ --outDir "$OUT/$game" --emptyOutDir --logLevel warn
  )
done

echo "Site ready in $OUT"
