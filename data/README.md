# data/

| Folder / file | Status | Written by | Notes |
|---|---|---|---|
| `discovery/` | **active** | `npm run discover` | GotSport crawler: `frontier.json` (event queue), `teams.json`, `games/<event>.json`. Source of record for GotSport games. |
| `gotsport-teams/` | **active** | `npm run scrape:directory` (also run by the crawler) | Every ranked Region IV team by GotSport `team_id` (`region4.json`). |
| `modular11/` | **active** | `npm run scrape:modular11` | MLS NEXT, Elite Academy League (EA / EA2), USL Academy. |
| `mlsnext/` | **active** | `npm run scrape:mlsnext-playoffs` | MLS NEXT Cup / playoffs. |
| `ecnl/` | **active** | `npm run scrape:ecnl` (owner-run), `npm run ecnl:merge` | ECNL, ECNL RL, Pre-ECNL. |
| `surfcup/` | **active** | `npm run scrape:surf` | Surf Cup, Club America Cup, Surf Challenge, Man City Cup, Girlazo … (SOM Sports). |
| `coast-soccer/` | **active** | `npm run scrape:coast` | Coast Soccer League (SoCal); add new seasons in the script. |
| `demosphere/` | **active** | `npm run scrape:demosphere` | Leagues not on GotSport (e.g. North Puget Sound League); `leagues.json` lists them. |
| `norcal-premier/` | **active** | `npm run scrape:norcal-clubs` | NorCal Premier club directory with GotSport ids. |
| `league-clubs/` | hand-collected | (by hand / with Claude) | Member-club lists from state associations and leagues. |
| `seed/` | hand-maintained | (by hand) + `db:seed` writes `report.json` | Club aliases, websites, overrides. |
| `gotsport/` | frozen | archived scrapers | Older GotSport pulls (`teams.json`, `league-games/`, `az-nv-games/`), still imported where the API doesn't cover the event. |
| `rankings-api/` | frozen | archived `scrape-rankings-api.ts` | Older GotSport API pull; the crawler supersedes it. |
| `utah/` | frozen | archived `scrape-utah.ts` | 2024 UYSA SportsAffinity pull (no dates). Not refreshed: the site is behind bot protection. |
| `adidas-cup/` | frozen | one-off | Generation adidas Cup 2026. |
| `ysg/teams.json` | frozen | archived YSG scrapers | Only used for team gender/age lookups. YSG games were corrupt and are not used. |
| `pglite/` | generated | `npm run db:seed` | Local directory database. |
| `snapshot.json`, `snapshot-dropped-events.json` | generated | `npm run build:data` | What the site reads. Never edit by hand. |
| `recurring-events.json` | generated | `npm run check:events` | Recurring-event checklist. |

"Frozen" sources are still imported but no longer refreshed; their games age out of the
15-month ranking window on their own. Large scraped folders aren't in git (see `.gitignore`):
back up `data/` separately (e.g. a zip) before big changes.
