# Scraping Playbook

How each data source is collected and refreshed. The order of a routine refresh is in the
[README runbook](README.md#runbook). Every source respects robots.txt; none bypasses bot
protection. Retired scrapers are listed in [scripts/archive/README.md](scripts/archive/README.md).

| Source | Command | Output | Refresh |
|---|---|---|---|
| GotSport (leagues, tournaments, State Cups, N1, GA, DPL …) | `npm run discover -- --loop` | `data/discovery/` | continuous |
| GotSport team directory (Region IV) | `npm run scrape:directory` | `data/gotsport-teams/` | weekly (crawler does it) |
| Modular11: MLS NEXT, EA / EA2, USL Academy | `npm run scrape:modular11` | `data/modular11/` | weekly |
| MLS NEXT Cup / playoffs | `npm run scrape:mlsnext-playoffs` | `data/mlsnext/` | after playoffs |
| ECNL / ECNL RL / Pre-ECNL | `npm run scrape:ecnl` (owner-run) | `data/ecnl/` | weekly |
| Surf Sports events (SOM Sports) | `npm run scrape:surf` | `data/surfcup/` | after each event |
| Coast Soccer League | `npm run scrape:coast` | `data/coast-soccer/` | each season |
| Demosphere leagues (e.g. NPSL) | `npm run scrape:demosphere` | `data/demosphere/` | weekly in season |
| NorCal Premier club directory | `npm run scrape:norcal-clubs` | `data/norcal-premier/` | each season |

After any scrape: `npm run rebuild` (= `build:data` + `check:data`).

---

## GotSport discovery crawler

```bash
npm run discover -- --loop        # run continuously (directory weekly, active leagues weekly, new events daily)
npm run discover -- --budget 500  # stop after 500 API requests
npm run discover -- --state UT    # one state
npm run discover -- --status      # progress per state
```

- **Phase 1, team directory:** pages the GotSport rankings list filtered to Region IV
  (`/team_ranking_data?search[team_region]=4&search[filter_by]=regional`, ~1,900 pages): every ranked
  West team with its `team_id`, club, state association and the events it earned points in →
  `data/gotsport-teams/region4.json`.
- **Phase 2, events.** The frontier comes from: (1) event search per West state, (2) every event a
  directory team played, (3) leagues pinned in `gotsportEvents` in `src/lib/directory/leagues.ts`.
  - **National leagues hosted outside the West (Girls Academy, Aspire, DPL …) are only found if
    pinned.** Pin each new season's event ID (GA 26/27 = 56497, Aspire 26/27 = 56498, linked from
    girlsacademyleague.com/schedules). The crawler reads the list at start-up: restart it after a change.
  - Recreational / AYSO / adult / futsal events are skipped (`NOT_COMPETITIVE`); out-of-West events
    only when 8+ West teams played.
- **Incremental re-crawls:** each event records which divisions are finished (last match in the past,
  nothing waiting for a score; unscored matches older than 14 days count as cancelled). Unfinished
  divisions are re-fetched weekly, finished ones re-checked every 28 days; events that haven't started
  are recorded and crawled once they start.
- **All GotSport calls go through `scripts/lib/gotsport-client.ts`:** one request per 1.5 s, a lock
  file (two crawlers in parallel got HTTP 403), multi-minute back-off on 403.
- API notes: `event_ranking_data/event_details?event_id=` → schedule groups; `flight_matches?flight_id=
  <schedule_group.id>&event_id=` → scored games; headers `x-rankings-client: rankings-web`,
  `Referer: https://rankings.gotsport.com/`.
- The importer treats these API games as the source of record: for events they cover, the frozen
  Playwright / AZ-NV / rankings-API rows are skipped. Teams are keyed by `team_id`.

## Modular11: MLS NEXT, Elite Academy League, USL Academy

```bash
npm run scrape:modular11              # refreshes the current season
npm run scrape:modular11 -- --refresh # refetch finished seasons too
```
- Endpoint used by modular11.com/schedule: `/public_schedule/league/get_matches?tournament=<id>&age=<code>&open_page=<n>&status=all&match_type=2&start_date=…&end_date=…`
  (HTML, 25 rows per page, **pages start at 1**; page 0 repeats page 1). Age codes:
  `/public_schedule/league/get-filter-options?UID_league=<id>`.
- League ids: 12 = MLS NEXT 2025-26, 35 = MLS NEXT Academy Division 2026-27 (unscored so far),
  27 = Elite Academy League (EA, EA2, EA National), 22 = USL Academy. The 2026-27 MLS NEXT regular
  season is **not** on Modular11's public schedule as of 2026-11-11.
- No robots.txt; 1.5 s between requests; ~22.6k games in ~1 hour.
- Teams are named by birth year ("… EA2 B2014"); the build merges each into its GotSport twin
  (`src/lib/directory/merge-twins.ts`, see "Twin merge" below).

## ECNL / ECNL RL / Pre-ECNL (owner-run, AthleteOne API)

ECNL results live on TotalGlobalSports; theecnl.com embeds TGS widgets fed by `api.athleteone.com`.
TGS's robots.txt disallows ClaudeBot, so the AI assistant doesn't run or change this importer: the
project owner runs it (decision 2026-11-11).

```bash
npm run scrape:ecnl     # all West ECNL / ECNL RL events + the Pre-ECNL IDs in package.json
npm run rebuild
```
- Options (env): `ECNL_SEASONS=2026-27`, `ECNL_API_DELAY_MS=500`, `ECNL_PRE_EVENT_IDS=…` (set in the
  `scrape:ecnl` npm command: Pre-ECNL has no organization the importer can search).
- **A run replaces `data/ecnl/`.** After a full run, check the "Discovered … events" line includes
  "Southern Cal" (4354 boys, 4315 girls).
- **Single event** (a missed or new event), without losing the rest:
  ```bash
  cp -R data/ecnl data/ecnl-full
  npm run scrape:ecnl -- --event 4354 && cp -R data/ecnl data/ecnl-event-4354
  cp -R data/ecnl-full/. data/ecnl/ && rm -rf data/ecnl-full
  npm run ecnl:merge -- data/ecnl-event-4354 && npm run rebuild
  ```
- **Finding event IDs:** each theecnl.com schedule page has an `#event-select` dropdown whose option
  values are the event IDs. Copy its HTML from the browser.
- **West events 2026-27:**
  - ECNL Boys: Far West 4273, Mountain 4280, Northern Cal 4283, Northwest 4284, Southwest 4287
  - ECNL Girls: Northern Cal 4267, Northwest 4268, Southwest 4271 (only 10 Girls conferences; no Far West / Mountain)
  - ECNL RL Boys: Far West 4427, Frontier 4347, Golden State 4348, Mountain 4343, NorCal 4351, Northwest 4353, Southern Cal 4354, Southwest 4358
  - ECNL RL Girls: Far West 4298, Frontier 4299, Golden State 4300, Mountain 4306, NorCal 4307, Northwest 4311, Southern Cal 4315, Southwest 4316
  - Pre-ECNL Boys: Colorado 4387, Far West 4383, Frontier 4360, Mountain 4363, Northern Cal 4368, Northwest 4385, Southern Cal 4370, Utah 4391
  - Pre-ECNL Girls: Colorado 4386, Far West 4382, Mountain 4390, Northwest 4384, Utah 4388
- The importer classifies events by name: "Southern Cal", "So Cal", "Colorado" and "Utah" were added
  to its alias lists (owner-applied, 2026-11-11). A new naming style can make it skip an event as
  "not a West event".
- Gaps as of 2026-11-11: ECNL Girls Northwest (4268) and RL Boys Far West (4427) have teams but no
  games yet; 2024-25 national finals aren't included.

## Surf Sports events (SOM Sports / athletes2events)

```bash
npm run scrape:surf                # every event in KNOWN_EVENTS
npm run scrape:surf -- --event 72  # one event
```
- `somsports.athletes2events.com/events/<id>/groups` → flight ids → `/events/<id>/schedules?flight-id=`.
  Match dates come from each schedule table's day heading ("Sat May 23, 2026").
- robots.txt disallows `/api/`; only the public HTML pages are fetched.
- New editions get new event IDs: add them to `KNOWN_EVENTS` in `scripts/scrape-surfcup.ts`.
  Known 2026 IDs: 47 Surf Challenge, 72 Club America Cup, 78 Surf Nation Champions League,
  81 Surf Cup Olders, 84 Surf Select Regional Cup, 93 Surf Cup Youngers, 137 Manchester City Cup, 138 Girlazo.

## Coast Soccer League

```bash
npm run scrape:coast
```
- `coastsoccer.us/coastsoccer/schedule?BRACKET={code}&AGE={age}&YEAR={year}&SEX={B|G}&SEASON={fall|spring}`,
  server-rendered tables. Add new seasons to `SEASONS` in the script. ~5 minutes.

## Demosphere leagues

```bash
npm run scrape:demosphere
```
- Static pages `elements.demosphere-secure.com/<org>/schedules/<season>/<division>.html` only
  (robots.txt disallows `/scripts/`). Leagues and divisions: `data/demosphere/leagues.json`.

## Club directory

- `npm run scrape:norcal-clubs`: NorCal Premier club pages (GotSport org / team ids, exact joins).
- `data/league-clubs/*.json`: member lists from state associations and leagues, collected by hand.
- `data/seed/`: `club-aliases.json`, `club-websites.json` (overrides), etc. `npm run check:websites`
  lists clubs with missing or broken sites.
- Directory database: schema `src/db/schema.ts`, migrations `drizzle/` (`npm run db:generate`).
  PGlite in `data/pglite/` unless `DATABASE_URL` is set (Neon). `npm run db:seed` loads the directory
  and writes `data/seed/report.json`; `npm run db:report` summarizes it. Players are read only through
  the `public_players` view (U15+, no suppressed or removal-requested players).

## Build and checks

- `npm run build:data` → `data/snapshot.json`: import every source, team identity (club match, state,
  age), twin merge, Massey ratings, tracked competitions, rankable rules.
- **Twin merge** (`merge-twins.ts`): an ECNL / Modular11 schedule team is merged into the one GotSport
  team of the same club, age, gender and competition marker. With several candidates it picks the
  one that has the schedule name exactly, else the only one active in the same Aug–Jul season, else
  the one with the same birth years, else the one GotSport-registered team. `npm run check:twins`
  prints the cases still left separate.
- `npm run check:data`: self-play, bad scores, missing events, top-10 sanity; must pass.
- `npm run check:events`: recurring events due / queued / overdue (`data/recurring-events.json`).
  Overdue usually means a new edition ID to add; some are just renamed editions. USYS National
  League (NL Club P1/P2) ended after 25-26; N1 is its successor.
- `npm run check:fairness`: performance vs. prediction by state and league type.
