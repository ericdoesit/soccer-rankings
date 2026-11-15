#!/bin/zsh
# Publish the data the site reads at runtime as a GitHub Release asset.
#
# The site needs data/snapshot.json (≈100 MB) plus a few files git doesn't hold. They are packed
# into runtime-data.tar.gz (≈25 MB compressed) and attached to a release tagged data-YYYY-MM-DD.
# Builds without local data download the latest one: scripts/fetch-data.mjs (npm prebuild).
#
#   npm run data:publish        # after a refresh (Refresh Data.command runs it with PUBLISH_DATA=1)
set -e
cd "$(dirname "$0")/.."

# keep in sync with scripts/fetch-data.mjs (RUNTIME_FILES) and the runtime readers in src/lib
FILES=(
  data/snapshot.json                 # teams, games, ratings (src/lib/data.ts)
  data/snapshot-dropped-events.json  # events left out of the snapshot (data.ts)
  data/discovery                     # tournament division labels, team event lists (tournament-view, team-context, league-rankings)
  data/predictions/mlsnext.json      # MLS NEXT predictions page (src/lib/mlsnext.ts)
  data/upcoming-events.json          # Events tab (src/lib/events.ts)
  data/coast-soccer/games.json       # CSL league rankings (src/lib/league-rankings.ts)
  data/norcal-premier/clubs.json     # NorCal Premier club list (src/lib/explore.ts)
  data/ysg/teams.json                # team names (data.ts)
)
present=()
for f in "${FILES[@]}"; do [[ -e "$f" ]] && present+=("$f") || echo "skip (missing): $f"; done
[[ -e data/snapshot.json ]] || { echo "data/snapshot.json missing: run npm run build:data first"; exit 1; }

OUT="$(mktemp -d)/runtime-data.tar.gz"
tar -czf "$OUT" "${present[@]}"
SIZE=$(du -h "$OUT" | cut -f1)
TAG="data-$(date +%Y-%m-%d)"
GAMES=$(node -e 'const s=require("./data/snapshot.json");process.stdout.write(String(s.games.length))')
NOTES="Runtime data for the site, built $(date '+%Y-%m-%d %H:%M'): ${GAMES} games. Downloaded by scripts/fetch-data.mjs."

if gh release view "$TAG" >/dev/null 2>&1; then
  # same day: replace the asset
  gh release upload "$TAG" "$OUT" --clobber
  gh release edit "$TAG" --notes "$NOTES"
else
  gh release create "$TAG" "$OUT" --title "Data $(date +%Y-%m-%d)" --notes "$NOTES" --latest
fi
echo "Published $TAG ($SIZE)"
