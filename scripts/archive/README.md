# Archived scripts

Not maintained and not part of the runbook. Kept so the provenance of the "frozen" data
sources (see `data/README.md`) is documented. Paths inside them assume they lived in
`scripts/`, so they won't run from here as-is.

| Script | Was used for | Replaced by / why retired |
|---|---|---|
| `scrape-rankings-api.ts`, `scrape-gotsport.ts` | GotSport rankings API (events, team data) | `discover-west.ts` crawler |
| `scrape-league-games.ts`, `scrape-az-nv.ts`, `scrape-west-division.ts`, `scrape-california.ts`, `scrape-games.ts`, `scrape-games-playwright.ts` | GotSport schedule pages via Playwright (needed a CAPTCHA solve) | crawler (API, no CAPTCHA) |
| `scrape-ysg.ts`, `scrape-ysg-full.ts` | YSG | corrupt away scores; events re-collected by the crawler |
| `scrape-tgs.ts`, `scrape-ecnl.ts` | ECNL via TotalGlobalSports / Sidearm pages | TGS robots.txt disallows ClaudeBot; owner-run `scrape-ecnl-api.ts` |
| `scrape-utah.ts` | UYSA SportsAffinity | site behind bot protection |
| `capture-*`, `intercept-*`, `explore-gotsport-api.ts`, `find-gotsport-js.ts`, `gotsport-search.ts`, `gotsport-scraper.ts`, `test-gotsport-scrape.ts`, `discover-teams.ts`, `count-event-teams.ts`, `find-league-events.ts`, `identify-events.ts`, `scrape_game_scores.py` | one-off exploration (June 2026) | — |
