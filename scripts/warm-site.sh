#!/bin/zsh
# After a deploy, request the main pages and data routes once so the server functions start
# (each fresh instance parses the ~110 MB snapshot, 3–4 s) and the CDN caches the data routes,
# before real visitors arrive. Run by "Refresh Data.command" after site:redeploy.
#
#   npm run site:warm
SITE="${SITE:-https://soccer-rankings-two.vercel.app}"
paths=(
  / /rankings /socal "/socal?view=teams" /league/socal-soccer-league /league/norcal-premier
  /league/coast-soccer-league /proven /events /findings /about /mls-next
  "/api/rankings?coverage=1" "/api/rankings?leagues=list"
)
for age in U9 U10 U11 U12 U13 U14 U15 U16 U17 U19; do
  for g in Boys Girls; do paths+=("/api/rankings?ageGroup=$age&gender=$g&limit=50&offset=0" "/api/proven?ageGroup=$age&gender=$g"); done
done
for p in "${paths[@]}"; do
  curl -s -o /dev/null --compressed -w "%{http_code} %{time_total}s  $p\n" "$SITE$p"
done
