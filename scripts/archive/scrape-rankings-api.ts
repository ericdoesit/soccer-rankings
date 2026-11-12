/**
 * GotSport Rankings API Scraper — NO CAPTCHA REQUIRED
 *
 * Uses the public rankings API to get ALL game scores:
 * 1. /api/v1/event_ranking_data/event_details?event_id={id} → get flights/brackets
 * 2. /api/v1/event_ranking_data/flight_matches?flight_id={id}&event_id={id} → game scores
 * 3. /api/v1/event_ranking_data/flight_registrations?flight_id={id}&event_id={id} → standings
 *
 * This is the fastest scraper — pure HTTP, no browser, no CAPTCHA.
 *
 * Usage:
 *   npx tsx scripts/scrape-rankings-api.ts                          # all known events
 *   npx tsx scripts/scrape-rankings-api.ts --event 51665            # specific event
 *   npx tsx scripts/scrape-rankings-api.ts --scan-range 50000 55000 # discover events
 */

import * as fs from "fs";
import * as path from "path";

const API_BASE = "https://system.gotsport.com/api/v1/event_ranking_data";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
  "x-rankings-client": "rankings-web",
  Referer: "https://rankings.gotsport.com/",
  Accept: "application/json",
};
const OUTPUT_DIR = path.join(process.cwd(), "data", "rankings-api");
const DELAY_MS = 1500; // 1.5s between requests to avoid CloudFront rate limiting

interface GameRecord {
  gameId: number;
  matchNumber: number;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  venue: string;
  division: string;
  eventId: number;
  eventName: string;
}

interface EventInfo {
  id: number;
  name: string;
  city: string;
  state: string;
  isLeague: boolean;
  startDate: string;
  endDate: string;
  flightCount: number;
}

const KNOWN_EVENTS = [
  // SoCal leagues
  43086, 51407, 51408, 51409, 51411, 52038, 33123,
  // NorCal leagues
  49370, 33458, 41823, 43082, 44146, 40753,
  // Arizona leagues/tournaments
  34355, 34357, 42831, 40568, 43088, 37959, 44690,
  // Arizona upcoming (from gotsoccer events page)
  50907, 52687, 52975, 53889, 54203, 54216, 54285, 54470, 55044, 55364,
  // Nevada leagues/tournaments
  34926, 46235, 35204, 40180, 44025, 35419, 44382, 44482, 49872, 42598, 36961, 51665,
  // Nevada upcoming
  49753, 50598, 52326, 52327, 52328, 52329, 52987, 54501, 54528, 54717,
  // Colorado
  33862, 50887, 39601, 49875,
  // Colorado upcoming
  47496, 47498, 49706, 51394, 52543, 52707, 52708, 52709, 52710, 53975,
  // Utah
  49142,
  // Utah upcoming
  52042, 52344, 52607, 52609, 52850, 53187, 53867, 54128, 54129, 54335,
  // Montana
  40682, 54153,
  // Wyoming
  34040, 52668, 55628,
  // New Mexico
  54126,
  // Idaho
  52613, 52824, 52944, 54244,
  // California upcoming tournaments
  47495, 47824, 49642, 49667, 50835, 51132, 51159, 51193, 51306, 53262, 53643, 54441,
  // Multi-state / Cross-regional
  34558, 42977, 42900,
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJSON(url: string, retries = 3): Promise<unknown> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) return res.json();
    if (res.status === 403) {
      // Rate limited — back off exponentially
      const waitMs = (attempt + 1) * 10000;
      console.log(`    Rate limited (403), waiting ${waitMs / 1000}s...`);
      await sleep(waitMs);
    } else {
      return null;
    }
  }
  return null;
}

async function getEventDetails(eventId: number): Promise<{
  info: EventInfo | null;
  bracketIds: Array<{ bracketId: number; division: string }>;
}> {
  const data = (await fetchJSON(
    `${API_BASE}/event_details?event_id=${eventId}`
  )) as {
    event?: {
      id: number;
      name: string;
      city: string;
      state: string;
      league: boolean;
      start_date_formatted?: { dashed: string };
      end_date_formatted?: { dashed: string };
      schedule_groups?: Array<{
        id: number;
        division: string;
        brackets: Array<{ id: number }>;
      }>;
    };
  } | null;

  if (!data?.event) return { info: null, bracketIds: [] };

  const ev = data.event;
  // flight_id = schedule_group.id (NOT bracket.id)
  const bracketIds: Array<{ bracketId: number; division: string }> = [];

  for (const sg of ev.schedule_groups || []) {
    bracketIds.push({ bracketId: sg.id, division: sg.division });
  }

  return {
    info: {
      id: ev.id,
      name: ev.name,
      city: ev.city,
      state: ev.state,
      isLeague: ev.league,
      startDate: ev.start_date_formatted?.dashed || "",
      endDate: ev.end_date_formatted?.dashed || "",
      flightCount: bracketIds.length,
    },
    bracketIds,
  };
}

async function getFlightGames(
  eventId: number,
  bracketId: number,
  eventName: string,
  division: string
): Promise<GameRecord[]> {
  const data = (await fetchJSON(
    `${API_BASE}/flight_matches?flight_id=${bracketId}&event_id=${eventId}`
  )) as Array<{
    id: number;
    match_number: number;
    home_score: number | null;
    away_score: number | null;
    match_date_formatted?: { dashed: string; medium: string };
    homeTeam?: { full_name: string; team_id: number };
    awayTeam?: { full_name: string; team_id: number };
    venue?: { name: string };
    division_name?: string;
  }> | null;

  if (!data || !Array.isArray(data)) return [];

  const games: GameRecord[] = [];
  for (const match of data) {
    if (
      match.home_score === null ||
      match.away_score === null ||
      !match.homeTeam ||
      !match.awayTeam
    )
      continue;

    games.push({
      gameId: match.id,
      matchNumber: match.match_number,
      date:
        match.match_date_formatted?.dashed ||
        match.match_date_formatted?.medium ||
        "",
      homeTeam: match.homeTeam.full_name,
      awayTeam: match.awayTeam.full_name,
      homeTeamId: match.homeTeam.team_id,
      awayTeamId: match.awayTeam.team_id,
      homeScore: match.home_score,
      awayScore: match.away_score,
      venue: match.venue?.name || "",
      division: match.division_name || division,
      eventId,
      eventName,
    });
  }

  return games;
}

async function scrapeEvent(eventId: number): Promise<GameRecord[]> {
  const { info, bracketIds } = await getEventDetails(eventId);
  if (!info || bracketIds.length === 0) return [];

  console.log(
    `  ${info.name} (${info.city}, ${info.state}) — ${bracketIds.length} flights`
  );

  const allGames: GameRecord[] = [];

  for (let fi = 0; fi < bracketIds.length; fi++) {
    const { bracketId, division } = bracketIds[fi];
    const games = await getFlightGames(
      eventId,
      bracketId,
      info.name,
      division
    );
    allGames.push(...games);

    if ((fi + 1) % 50 === 0) {
      console.log(`    [${fi + 1}/${bracketIds.length}] ${allGames.length} games so far`);
    }

    await sleep(DELAY_MS);
  }

  if (allGames.length > 0) {
    console.log(`    ${allGames.length} games with scores`);
  }

  return allGames;
}

async function scanForEvents(
  start: number,
  end: number
): Promise<EventInfo[]> {
  const events: EventInfo[] = [];
  console.log(`Scanning event IDs ${start}-${end}...`);

  for (let id = start; id <= end; id += 10) {
    const batch = Array.from({ length: Math.min(10, end - id + 1) }, (_, i) => id + i);
    const results = await Promise.all(
      batch.map(async (eid) => {
        const { info } = await getEventDetails(eid);
        return info;
      })
    );

    for (const info of results) {
      if (info && info.flightCount > 0) {
        events.push(info);
        console.log(
          `  ${info.id}: ${info.name} (${info.state}) — ${info.flightCount} flights`
        );
      }
    }

    if ((id - start) % 100 === 0 && id > start) {
      console.log(`  Scanned ${id - start}/${end - start}...`);
    }

    await sleep(DELAY_MS);
  }

  return events;
}

async function main() {
  const args = process.argv.slice(2);
  const eventIdx = args.indexOf("--event");
  const scanIdx = args.indexOf("--scan-range");

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let eventIds: number[];

  if (scanIdx >= 0) {
    const start = parseInt(args[scanIdx + 1]);
    const end = parseInt(args[scanIdx + 2]);
    const discovered = await scanForEvents(start, end);
    const eventsFile = path.join(OUTPUT_DIR, "discovered_events.json");
    let existing: EventInfo[] = [];
    if (fs.existsSync(eventsFile)) existing = JSON.parse(fs.readFileSync(eventsFile, "utf-8"));
    const merged = new Map<number, EventInfo>();
    for (const e of [...existing, ...discovered]) merged.set(e.id, e);
    fs.writeFileSync(eventsFile, JSON.stringify(Array.from(merged.values()), null, 2));
    console.log(`\nDiscovered ${discovered.length} events with flights. Total: ${merged.size}`);
    eventIds = discovered.map((e) => e.id);
  } else if (eventIdx >= 0) {
    eventIds = [parseInt(args[eventIdx + 1])];
  } else {
    eventIds = KNOWN_EVENTS;
  }

  console.log(`\nScraping ${eventIds.length} events...\n`);

  const allGames: GameRecord[] = [];
  const gamesFile = path.join(OUTPUT_DIR, "games.json");

  if (fs.existsSync(gamesFile)) {
    const existing = JSON.parse(fs.readFileSync(gamesFile, "utf-8"));
    allGames.push(...existing);
    console.log(`Loaded ${existing.length} existing games\n`);
  }

  const scrapedEvents: EventInfo[] = [];

  for (const eventId of eventIds) {
    try {
      const games = await scrapeEvent(eventId);
      allGames.push(...games);
      await sleep(DELAY_MS);
    } catch (e) {
      console.log(`  Error on event ${eventId}: ${e}`);
    }
  }

  // Deduplicate by game ID
  const unique = new Map<number, GameRecord>();
  for (const g of allGames) {
    unique.set(g.gameId, g);
  }

  const uniqueGames = Array.from(unique.values());
  fs.writeFileSync(gamesFile, JSON.stringify(uniqueGames, null, 2));

  // CSV
  const csvH =
    "game_id,match_number,date,home_team,away_team,home_team_id,away_team_id,home_score,away_score,venue,division,event_id,event_name";
  const csvR = uniqueGames.map((g) =>
    [
      g.gameId, g.matchNumber, `"${g.date}"`,
      `"${g.homeTeam.replace(/"/g, '""')}"`,
      `"${g.awayTeam.replace(/"/g, '""')}"`,
      g.homeTeamId, g.awayTeamId, g.homeScore, g.awayScore,
      `"${g.venue.replace(/"/g, '""')}"`,
      `"${g.division.replace(/"/g, '""')}"`,
      g.eventId, `"${g.eventName.replace(/"/g, '""')}"`,
    ].join(",")
  );
  fs.writeFileSync(path.join(OUTPUT_DIR, "games.csv"), [csvH, ...csvR].join("\n"));

  // Summary
  const byEvent: Record<string, number> = {};
  const byState: Record<string, number> = {};
  const teams = new Set<number>();
  for (const g of uniqueGames) {
    byEvent[g.eventName] = (byEvent[g.eventName] || 0) + 1;
    teams.add(g.homeTeamId);
    teams.add(g.awayTeamId);
  }

  console.log(`\n=== FINAL ===`);
  console.log(`Unique games: ${uniqueGames.length}`);
  console.log(`Unique teams: ${teams.size}`);
  console.log(`\nBy event:`);
  for (const [e, c] of Object.entries(byEvent).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${e}: ${c}`);
  }
  console.log(`\nSaved to: ${OUTPUT_DIR}/`);
}

main().catch(console.error);
