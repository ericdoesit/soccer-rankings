/**
 * SOM Sports / Athletes2Events Scraper (Surf Cup, etc.)
 * Server-rendered HTML, no CAPTCHA, no browser needed.
 *
 * Usage:
 *   npx tsx scripts/scrape-surfcup.ts --event 81   # Surf Cup 2025
 *   npx tsx scripts/scrape-surfcup.ts               # all known events
 */

import * as fs from "fs";
import * as path from "path";

const BASE_URL = "https://somsports.athletes2events.com";
const OUTPUT_DIR = path.join(process.cwd(), "data", "surfcup");
const DELAY_MS = 400;
const HEADERS = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" };

interface GameRecord {
  gameNumber: string;
  division: string;
  group: string;
  time: string;
  /** YYYY-MM-DD, from the day heading above each match table ("Sat May 23, 2026") */
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  field: string;
  venue: string;
  eventId: number;
  eventName: string;
}

const KNOWN_EVENTS = [
  { id: 81, name: "Surf Cup Championship Olders 2026" },
  { id: 93, name: "Surf Cup Championship Youngers 2026" },
  { id: 47, name: "Surf Challenge 2026" },
  { id: 72, name: "Club America Cup 2026" },
  { id: 78, name: "Surf Nation Champions League 2026" },
  { id: 84, name: "Surf Select Regional Cup 2026" },
  { id: 137, name: "Manchester City Cup 2026" },
  { id: 138, name: "Girlazo 2026" },
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getFlightIds(eventId: number): Promise<number[]> {
  const res = await fetch(`${BASE_URL}/events/${eventId}/groups`, { headers: HEADERS });
  const html = await res.text();
  const ids = new Set<number>();
  for (const m of html.matchAll(/flight-id=(\d+)/g)) {
    ids.add(parseInt(m[1]));
  }
  return Array.from(ids);
}

async function scrapeFlightGames(eventId: number, flightId: number, eventName: string): Promise<GameRecord[]> {
  const res = await fetch(`${BASE_URL}/events/${eventId}/schedules?flight-id=${flightId}`, { headers: HEADERS });
  const html = await res.text();
  const games: GameRecord[] = [];

  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];

  const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
  let date = "";
  for (const row of rows) {
    // day heading row: <th colspan="9">Sat May 23, 2026</th>
    const day = row.match(/<th[^>]*colspan[^>]*>\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s*(\d{4})\s*<\/th>/);
    if (day) {
      const mm = MONTHS[day[1].toLowerCase()];
      if (mm) date = `${day[3]}-${mm}-${day[2].padStart(2, "0")}`;
      continue;
    }
    const cells = (row.match(/<td[^>]*>[\s\S]*?<\/td>/g) || []).map(
      (c) => c.replace(/<[^>]+>/g, " ").replace(/&[^;]+;/g, "'").replace(/\s+/g, " ").trim()
    );

    if (cells.length < 6) continue;

    // Game row: #NUM | Division | Group | Time | HomeTeam | Score | AwayTeam | Field | Venue
    const gameNumMatch = cells[0].match(/#(\d+)/);
    if (!gameNumMatch) continue;

    const scoreMatch = cells.find((c) => /^\d+\s*-\s*\d+$/.test(c));
    if (!scoreMatch) continue;

    const scoreIdx = cells.indexOf(scoreMatch);
    const [s1, s2] = scoreMatch.split("-").map((s) => parseInt(s.trim()));

    games.push({
      gameNumber: gameNumMatch[1],
      division: cells[1] || "",
      group: cells[2] || "",
      time: cells[3] || "",
      date,
      homeTeam: cells[scoreIdx - 1] || "",
      awayTeam: cells[scoreIdx + 1] || "",
      homeScore: s1,
      awayScore: s2,
      field: cells[scoreIdx + 2] || "",
      venue: cells[scoreIdx + 3] || "",
      eventId,
      eventName,
    });
  }

  return games;
}

async function main() {
  const args = process.argv.slice(2);
  const eventIdx = args.indexOf("--event");
  const targetEvent = eventIdx >= 0 ? parseInt(args[eventIdx + 1]) : null;

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const events = targetEvent
    ? KNOWN_EVENTS.filter((e) => e.id === targetEvent)
    : KNOWN_EVENTS;

  const allGames: GameRecord[] = [];

  const gamesFile = path.join(OUTPUT_DIR, "games.json");
  if (fs.existsSync(gamesFile)) {
    allGames.push(...JSON.parse(fs.readFileSync(gamesFile, "utf-8")));
    console.log(`Loaded ${allGames.length} existing games`);
  }

  for (const event of events) {
    console.log(`\n=== ${event.name} (event ${event.id}) ===`);

    const flightIds = await getFlightIds(event.id);
    console.log(`  ${flightIds.length} flights`);

    let eventGames = 0;
    for (let i = 0; i < flightIds.length; i++) {
      const games = await scrapeFlightGames(event.id, flightIds[i], event.name);
      allGames.push(...games);
      eventGames += games.length;

      if ((i + 1) % 10 === 0) {
        console.log(`  [${i + 1}/${flightIds.length}] ${eventGames} games`);
      }

      await sleep(DELAY_MS);
    }
    console.log(`  Total: ${eventGames} games`);
  }

  // Deduplicate
  const unique = new Map<string, GameRecord>();
  for (const g of allGames) {
    unique.set(`${g.eventId}_${g.gameNumber}_${g.homeTeam}_${g.awayTeam}`, g);
  }

  fs.writeFileSync(gamesFile, JSON.stringify(Array.from(unique.values()), null, 2));

  console.log(`\n=== FINAL ===`);
  console.log(`Unique games: ${unique.size}`);
  console.log(`Saved to: ${OUTPUT_DIR}/`);
}

main().catch(console.error);
