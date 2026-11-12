# West Youth Soccer Rankings

Rankings and a club directory for competitive youth soccer in the Western US (US Youth
Soccer Region IV: AK, AZ, CA North & South, CO, HI, ID, MT, NM, NV, OR, UT, WA, WY).

- **Ratings** use every scored game (Massey ratings, margin cap 6, 105-day half-life).
- **Rankings list** only West teams that play tracked competitions (elite leagues, N1, State
  Cups, championships, multi-state showcases) and clear the quality hurdles in
  `RANK_RULES` (`src/lib/data.ts`). State and district leagues are directory-only.
- Next.js 16 app (`src/app`), reading one precomputed file: `data/snapshot.json`.

## Runbook

All commands run from this folder. Details for every source: [SCRAPING.md](SCRAPING.md).

### Always running
```bash
npm run discover -- --loop    # GotSport crawler: new events daily, active leagues weekly
```
Never start a second GotSport crawler (two in parallel get rate-limited); it keeps a lock file.

### Weekly during the season
```bash
npm run scrape:ecnl           # ECNL / ECNL RL / Pre-ECNL: the project owner runs this one
npm run refresh               # Modular11 (MLS NEXT, EA, USL Academy) + Surf events, then rebuild + checks
```
`npm run refresh` ends with `npm run rebuild` = `build:data` (writes `data/snapshot.json`)
followed by `check:data` (must print "All error checks passed"). Restart `npm run dev` to see
the new data: the server caches the snapshot in memory.

### Monthly, and before each season
```bash
npm run check:events          # recurring events: what's due, queued or overdue → data/recurring-events.json
npm run check:twins           # ECNL / Modular11 teams that couldn't be merged with their GotSport copy
npm run check:fairness        # are any states / league types over- or under-rated?
npm run check:websites        # clubs with missing or broken websites
```
For an "overdue" event: find the new edition's ID and add it (GotSport national leagues →
`gotsportEvents` in `src/lib/directory/leagues.ts`; Surf events → `KNOWN_EVENTS` in
`scripts/scrape-surfcup.ts`; ECNL → `ECNL_PRE_EVENT_IDS` in `package.json` or a single-event
pull, see SCRAPING.md).

### New season (August)
- Modular11: add the new season's league ids to `scripts/scrape-modular11.ts`.
- ECNL: copy the event dropdowns from theecnl.com schedule pages; update `ECNL_PRE_EVENT_IDS`.
- `npm run check:events` and work through everything overdue.

## Folder layout

| Path | What it is |
|---|---|
| `src/app/` | Pages (rankings, team, club, league, state, match, tools) and API routes |
| `src/lib/data.ts` | Build pipeline: import → team identity → twin merge → ratings → tracked → rankable |
| `src/lib/import-gotsport-data.ts` | Reads every game source in `data/` |
| `src/lib/directory/` | Clubs, leagues (`leagues.ts`), team identity and names, twin merge, tracked competitions |
| `src/db/`, `drizzle/` | Directory database schema (PGlite locally, Neon via `DATABASE_URL`) |
| `scripts/` | Scrapers, build and checks: one npm command each (see `package.json`) |
| `scripts/lib/` | Shared GotSport client (rate limit + lock) and helpers |
| `scripts/archive/` | Retired one-off and replaced scrapers, kept for reference only |
| `data/` | Scraped sources, seeds and the snapshot: see [data/README.md](data/README.md) |
| `public/` | Static assets (maps, icons, `style-guide.html`) |

## Rules this project keeps
- Respect each site's robots.txt and never bypass bot protection or CAPTCHAs.
- Players are minors: named players only from about U15, only already-published info, honor
  removal requests (see `public_players` in `src/db/schema.ts`).
- Data must be fresh: sources that can't be refreshed aren't added.
