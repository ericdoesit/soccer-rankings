/**
 * Total Global Sports (TGS) Scraper
 *
 * Scrapes game results from public.totalglobalsports.com
 * No CAPTCHA. JS-rendered (needs Playwright). No rate limiting observed.
 *
 * Structure:
 * - Event page: /public/event/{event_id} → lists flights with standings links
 * - Standings: /public/event/{event_id}/standings/{standings_id} → team W-L-D + links
 * - Team page: /public/event/{event_id}/individual-team/{org_id}/{team_id}/{group_id} → game scores
 *
 * Usage:
 *   npx tsx scripts/scrape-tgs.ts --event 3923
 *   npx tsx scripts/scrape-tgs.ts                  # all known events
 */

import { chromium, type Page } from "playwright";
import * as fs from "fs";
import * as path from "path";

const BASE_URL = "https://public.totalglobalsports.com";
const OUTPUT_DIR = path.join(process.cwd(), "data", "tgs");
const PROGRESS_FILE = path.join(OUTPUT_DIR, "progress.json");

interface GameRecord {
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  venue: string;
  gameNumber: string;
  eventId: number;
  eventName: string;
  flight: string;
}

interface StandingsEntry {
  team: string;
  gp: number;
  wins: number;
  losses: number;
  draws: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
  teamUrl: string;
  flight: string;
  eventId: number;
  eventName: string;
}

const KNOWN_EVENTS = [
  { id: 3923, name: "Pre-ECNL Boys SoCal 2025-26" },
  { id: 4205, name: "Pre-ECNL Boys Northern Cal Cup" },
  { id: 3817, name: "TGS Event 3817" },
];

async function getFlightIds(
  page: Page,
  eventId: number
): Promise<Array<{ standingsId: string; flight: string }>> {
  await page.goto(`${BASE_URL}/public/event/${eventId}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(8000);

  const eventName = await page.evaluate(() => {
    const h = document.querySelector("h1, h2, .event-name");
    return h?.textContent?.trim() || "";
  });

  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("a"))
      .map((a) => ({
        text: a.textContent?.trim() || "",
        href: a.getAttribute("href") || "",
      }))
      .filter((l) => l.href.includes("standings/"));
  });

  const flights = links.map((l) => {
    const match = l.href.match(/standings\/(\d+)/);
    return {
      standingsId: match ? match[1] : "",
      flight: l.text || "",
    };
  }).filter((f) => f.standingsId);

  console.log(`  ${eventName} — ${flights.length} flights`);
  return flights;
}

async function scrapeStandings(
  page: Page,
  eventId: number,
  standingsId: string,
  eventName: string
): Promise<{ standings: StandingsEntry[]; teamUrls: string[] }> {
  await page.goto(
    `${BASE_URL}/public/event/${eventId}/standings/${standingsId}`,
    { waitUntil: "domcontentloaded", timeout: 60000 }
  );
  await page.waitForTimeout(8000);

  const flightName = await page.evaluate(() => {
    const els = document.querySelectorAll("h1, h2, h3, h4");
    for (const el of els) {
      const text = el.textContent?.trim() || "";
      if (text.includes("STANDINGS") || text.includes("Flight") || text.includes("B20"))
        return text;
    }
    return "";
  });

  // Get standings table
  const tableData = await page.evaluate(() => {
    const rows: Array<{
      team: string;
      cells: string[];
      teamUrl: string;
    }> = [];

    document.querySelectorAll("tr").forEach((tr) => {
      const tds = tr.querySelectorAll("td");
      if (tds.length < 5) return;

      const cells = Array.from(tds).map((td) => td.textContent?.trim() || "");
      const link = tr.querySelector("a[href*='individual-team']");
      const teamUrl = link?.getAttribute("href") || "";
      const teamName = link?.textContent?.trim() || cells[0];

      if (teamName && teamName.length > 3 && !teamName.includes("POS")) {
        rows.push({ team: teamName, cells, teamUrl });
      }
    });

    return rows;
  });

  const standings: StandingsEntry[] = [];
  const teamUrls: string[] = [];

  for (const row of tableData) {
    if (row.teamUrl) teamUrls.push(row.teamUrl);

    // Parse: team, GP, W, L, D, GF, GA, GD, PTS, PPG
    const nums = row.cells
      .map((c) => parseFloat(c))
      .filter((n) => !isNaN(n));

    if (nums.length >= 7) {
      standings.push({
        team: row.team,
        gp: nums[0],
        wins: nums[1],
        losses: nums[2],
        draws: nums[3],
        gf: nums[4],
        ga: nums[5],
        gd: nums[6],
        pts: nums[7] || 0,
        teamUrl: row.teamUrl,
        flight: flightName,
        eventId,
        eventName,
      });
    }
  }

  return { standings, teamUrls };
}

async function scrapeTeamGames(
  page: Page,
  teamUrl: string,
  eventId: number,
  eventName: string,
  flight: string
): Promise<GameRecord[]> {
  const fullUrl = teamUrl.startsWith("http")
    ? teamUrl
    : `${BASE_URL}${teamUrl}`;

  await page.goto(fullUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(8000);

  const teamName = await page.evaluate(() => {
    const h = document.querySelector("h1, h2, .team-name, .club-name");
    return h?.textContent?.trim() || "";
  });

  // Extract game results
  const games = await page.evaluate(() => {
    const results: Array<{
      date: string;
      opponent: string;
      score: string;
      venue: string;
      gameNum: string;
    }> = [];

    const text = document.body?.innerText || "";
    const lines = text.split("\n").map((l) => l.trim()).filter((l) => l);

    for (let i = 0; i < lines.length; i++) {
      // Look for date pattern (Mon DD, YYYY or MM/DD/YYYY)
      const dateMatch = lines[i].match(
        /^((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4})/
      );
      if (!dateMatch) continue;

      const date = dateMatch[1];

      // Look for score pattern nearby
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        const scoreMatch = lines[j].match(/^(\d+)\s*-\s*(\d+)$/);
        if (scoreMatch) {
          // Opponent is usually between date and score
          const opponent = lines
            .slice(i + 1, j)
            .find(
              (l) =>
                l.length > 5 &&
                !l.match(/^\d/) &&
                !l.match(/^#/) &&
                !l.match(/AM$|PM$/)
            );

          // Game number
          const gameNum = lines
            .slice(i + 1, j)
            .find((l) => l.match(/^#\d+/))
            ?.replace("#", "") || "";

          // Venue
          const venue = lines
            .slice(i + 1, j)
            .find(
              (l) =>
                l.includes("Field") ||
                l.includes("Park") ||
                l.includes("Complex") ||
                l.includes("Stadium")
            ) || "";

          results.push({
            date,
            opponent: opponent || "",
            score: lines[j],
            venue,
            gameNum,
          });
          break;
        }
      }
    }

    return results;
  });

  const gameRecords: GameRecord[] = [];
  for (const g of games) {
    const [s1, s2] = g.score.split("-").map((s) => parseInt(s.trim()));
    if (isNaN(s1) || isNaN(s2)) continue;

    // Extract opponent team name (remove club prefix if present)
    const opponentName = g.opponent.replace(/\|/g, "").trim();

    gameRecords.push({
      date: g.date,
      homeTeam: teamName,
      awayTeam: opponentName,
      homeScore: s1,
      awayScore: s2,
      venue: g.venue,
      gameNumber: g.gameNum,
      eventId,
      eventName,
      flight,
    });
  }

  return gameRecords;
}

async function main() {
  const args = process.argv.slice(2);
  const eventIdx = args.indexOf("--event");
  const targetEvent = eventIdx >= 0 ? parseInt(args[eventIdx + 1]) : null;

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let progress: Record<string, boolean> = {};
  if (fs.existsSync(PROGRESS_FILE)) {
    progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8"));
  }

  const events = targetEvent
    ? KNOWN_EVENTS.filter((e) => e.id === targetEvent)
    : KNOWN_EVENTS;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  });
  const page = await context.newPage();

  const allGames: GameRecord[] = [];
  const allStandings: StandingsEntry[] = [];

  // Load existing
  const gamesFile = path.join(OUTPUT_DIR, "games.json");
  if (fs.existsSync(gamesFile)) {
    const existing = JSON.parse(fs.readFileSync(gamesFile, "utf-8"));
    allGames.push(...existing);
    console.log(`Loaded ${existing.length} existing games`);
  }

  for (const event of events) {
    console.log(`\n=== ${event.name} (event ${event.id}) ===`);

    // Get flight IDs
    const flights = await getFlightIds(page, event.id);

    for (const flight of flights) {
      const key = `${event.id}_${flight.standingsId}`;
      if (progress[key]) continue;

      // Get standings + team URLs
      const { standings, teamUrls } = await scrapeStandings(
        page,
        event.id,
        flight.standingsId,
        event.name
      );
      allStandings.push(...standings);

      if (standings.length > 0) {
        console.log(
          `  Flight ${flight.standingsId}: ${standings.length} teams`
        );
      }

      // Scrape each team's games
      let flightGames = 0;
      for (const teamUrl of teamUrls) {
        try {
          const games = await scrapeTeamGames(
            page,
            teamUrl,
            event.id,
            event.name,
            flight.flight
          );
          allGames.push(...games);
          flightGames += games.length;
        } catch {
          // skip
        }
      }

      if (flightGames > 0) {
        console.log(`    ${flightGames} games scraped`);
      }

      progress[key] = true;
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
    }
  }

  // Deduplicate games
  const unique = new Map<string, GameRecord>();
  for (const g of allGames) {
    const key = `${g.eventId}_${g.homeTeam}_${g.awayTeam}_${g.homeScore}_${g.awayScore}_${g.date}`;
    unique.set(key, g);
  }

  // Save
  fs.writeFileSync(gamesFile, JSON.stringify(Array.from(unique.values()), null, 2));
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "standings.json"),
    JSON.stringify(allStandings, null, 2)
  );

  // CSV
  const csvH = "date,home_team,away_team,home_score,away_score,venue,event_id,event_name,flight";
  const csvR = Array.from(unique.values()).map((g) =>
    [`"${g.date}"`, `"${g.homeTeam.replace(/"/g, '""')}"`, `"${g.awayTeam.replace(/"/g, '""')}"`,
     g.homeScore, g.awayScore, `"${g.venue.replace(/"/g, '""')}"`, g.eventId,
     `"${g.eventName.replace(/"/g, '""')}"`, `"${g.flight}"`].join(",")
  );
  fs.writeFileSync(path.join(OUTPUT_DIR, "games.csv"), [csvH, ...csvR].join("\n"));

  console.log(`\n=== FINAL ===`);
  console.log(`Standings: ${allStandings.length} team entries`);
  console.log(`Games: ${unique.size} unique (${allGames.length} raw)`);
  console.log(`Saved to: ${OUTPUT_DIR}/`);

  await browser.close();
}

main().catch(console.error);
