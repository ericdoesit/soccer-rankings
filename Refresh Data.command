#!/bin/zsh
# Double-click in Finder to open Terminal and refresh all data, one step at a time.
# Also runnable from a terminal: ./"Refresh Data.command"  (or: npm run refresh:all)
#
# Scrapers run one after another, never in parallel. If one fails, the rest still run
# and the snapshot is rebuilt from whatever data is on disk. The full log is saved to
# logs/refresh-<date>.log.
#
# SKIP_ECNL=1 skips the ECNL step (TotalGlobalSports blocks AI crawlers, so Claude runs it this way).
# PUBLISH_DATA=1 also publishes the rebuilt data as a GitHub Release (scripts/publish-data.sh);
# the weekly scheduled run sets it. After a successful publish it also rebuilds the live site
# (npm run site:redeploy), since a new data release alone doesn't redeploy Vercel.

cd "$(dirname "$0")" || exit 1
mkdir -p logs
LOG="logs/refresh-$(date +%Y-%m-%d_%H%M).log"
exec > >(tee -a "$LOG") 2>&1

STEPS=(
  "scrape:modular11|MLS NEXT playoffs + USL Academy (Modular11)"
  "scrape:surf|Surf Cup"
  "scrape:ecnl|ECNL / ECNL RL"
  "scrape:mlsnext|MLS NEXT 2026-27 season (MLS NEXT Tracker, ~9 min)"
  "build:data|Rebuild snapshot + ratings"
  "check:data|Check snapshot"
  "predict:mlsnext|MLS NEXT predictions"
  "league:ranges|League level ranges for the About page (~11 min)"
  "events:upcoming|Upcoming events calendar"
  "data:publish|Publish data to GitHub Releases"
  "site:redeploy|Rebuild the live site with the new data (Vercel)"
)

typeset -a RESULTS
FAILED=0
START=$SECONDS
echo "=== Refresh started $(date) ==="

for step in "${STEPS[@]}"; do
  script="${step%%|*}"; label="${step#*|}"
  if [[ ( "$script" == "data:publish" || "$script" == "site:redeploy" ) && -z "$PUBLISH_DATA" ]]; then
    continue
  fi
  if [[ ( "$script" == "data:publish" || "$script" == "site:redeploy" ) && $FAILED -gt 0 ]]; then
    RESULTS+=("⏭  $label  (skipped: an earlier step failed)")
    continue
  fi
  if [[ "$script" == "scrape:ecnl" && -n "$SKIP_ECNL" ]]; then
    RESULTS+=("⏭  $label  (skipped: SKIP_ECNL set; run npm run scrape:ecnl yourself)")
    continue
  fi
  echo ""
  echo "──────────────────────────────────────────────"
  echo "▶ $label  (npm run $script)"
  echo "──────────────────────────────────────────────"
  t=$SECONDS
  if npm run "$script"; then
    RESULTS+=("✅ $label  ($(( (SECONDS - t) / 60 ))m $(( (SECONDS - t) % 60 ))s)")
  else
    RESULTS+=("❌ $label  (failed)")
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "=== Summary — $(( (SECONDS - START) / 60 )) min total ==="
printf '%s\n' "${RESULTS[@]}"
echo "Log: $LOG"

if (( FAILED )); then
  osascript -e "display notification \"$FAILED step(s) failed — see $LOG\" with title \"Soccer data refresh\"" 2>/dev/null
else
  osascript -e 'display notification "All steps finished" with title "Soccer data refresh"' 2>/dev/null
fi

if [[ -t 0 ]]; then
  echo ""
  read -k 1 "?Press any key to close…"
fi
