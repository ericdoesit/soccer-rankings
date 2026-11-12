/**
 * YouthSoccerGames.com Full Scraper
 *
 * Pipeline: States → Clubs → Teams → Game History
 * Plain HTTP, no CAPTCHA, no browser.
 *
 * Usage:
 *   npx tsx scripts/scrape-ysg-full.ts                              # all states
 *   npx tsx scripts/scrape-ysg-full.ts --state california-south     # one state
 *   npx tsx scripts/scrape-ysg-full.ts --state arizona --limit 50   # limit teams
 */

import * as fs from "fs";
import * as path from "path";

const BASE_URL = "https://youthsoccergames.com";
const OUTPUT_DIR = path.join(process.cwd(), "data", "ysg");
const PROGRESS_FILE = path.join(OUTPUT_DIR, "progress.json");
const DELAY_MS = 400;
const HEADERS = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" };

const STATES = [
  // West (current focus)
  "california-south", "california-north", "arizona", "nevada", "colorado", "utah",
  "washington", "oregon", "idaho", "montana", "wyoming", "new-mexico", "hawaii", "alaska",
  // Texas
  "texas-north", "texas-south",
  // South
  "florida", "georgia", "north-carolina", "south-carolina", "virginia", "tennessee",
  "alabama", "mississippi", "louisiana", "kentucky", "arkansas", "oklahoma",
  // Northeast
  "new-york-east", "new-york-west", "new-jersey", "pennsylvania-east", "pennsylvania-west",
  "connecticut", "massachusetts", "maryland", "delaware", "rhode-island",
  "new-hampshire", "vermont", "maine", "west-virginia",
  // Midwest
  "ohio", "michigan", "illinois", "indiana", "minnesota", "missouri", "wisconsin",
  "iowa", "kansas", "nebraska", "north-dakota", "south-dakota",
];

interface GameRecord {
  team1: string;
  team2: string;
  team1Score: number;
  team2Score: number;
  date: string;
  tournament: string;
  sourceUrl: string;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: HEADERS });
  return res.text();
}

async function getClubIds(state: string): Promise<string[]> {
  const html = await fetchText(`${BASE_URL}/clubs/${state}`);
  const ids = new Set<string>();
  for (const m of html.matchAll(/href="\/club\/[^/]+\/(\d+)"/g)) {
    ids.add(m[1]);
  }
  return Array.from(ids);
}

async function getTeamIdsFromClub(state: string, clubId: string): Promise<string[]> {
  const html = await fetchText(`${BASE_URL}/club/${state}/${clubId}`);
  const ids = new Set<string>();
  for (const m of html.matchAll(/href="\/team\/(\d+)"/g)) {
    ids.add(m[1]);
  }
  return Array.from(ids);
}

function parseTeamGames(html: string): GameRecord[] {
  const games: GameRecord[] = [];
  const blocks = html.split("border-bottom border-3");

  for (const block of blocks.slice(1)) {
    const titleMatches = Array.from(block.matchAll(/title="([^"]+)"/g)).map((m) => m[1]);
    const divMatches = Array.from(block.matchAll(/<div>([^<]{5,})<\/div>/g)).map((m) => m[1].trim());
    const names = [...titleMatches, ...divMatches].filter(
      (n) => n.length > 4 && !n.includes("club-logo")
    );

    const scores = Array.from(
      block.matchAll(/col-1 align-middle[^>]*>(?:<span[^>]*>)?(\d+)/g)
    ).map((m) => parseInt(m[1]));

    if (names.length < 2 || scores.length < 2) continue;

    const dateMatch = block.match(
      /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4})/
    );
    const sourceMatch = block.match(
      /href="(https?:\/\/[^"]*(?:gotsport|totalglobalsports)[^"]*)"\s*>([^<]+)/
    );

    games.push({
      team1: names[0],
      team2: names[1],
      team1Score: scores[0],
      team2Score: scores[1],
      date: dateMatch ? dateMatch[1] : "",
      tournament: sourceMatch ? sourceMatch[2].trim() : "",
      sourceUrl: sourceMatch ? sourceMatch[1] : "",
    });
  }

  return games;
}

async function main() {
  const args = process.argv.slice(2);
  const stateIdx = args.indexOf("--state");
  const limitIdx = args.indexOf("--limit");
  const targetState = stateIdx >= 0 ? args[stateIdx + 1] : null;
  const teamLimit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : Infinity;

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let progress: Record<string, boolean> = {};
  if (fs.existsSync(PROGRESS_FILE)) {
    progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8"));
  }

  const states = targetState ? [targetState] : STATES;
  const allGames: GameRecord[] = [];

  // Load existing
  const gamesFile = path.join(OUTPUT_DIR, "games.json");
  if (fs.existsSync(gamesFile)) {
    allGames.push(...JSON.parse(fs.readFileSync(gamesFile, "utf-8")));
    console.log(`Loaded ${allGames.length} existing games`);
  }

  const gsEvents = new Set<string>();
  const tgsEvents = new Set<string>();
  let totalTeams = 0;

  for (const state of states) {
    console.log(`\n=== ${state.toUpperCase()} ===`);

    const clubIds = await getClubIds(state);
    console.log(`  ${clubIds.length} clubs`);
    await sleep(DELAY_MS);

    let stateTeams = 0;
    let stateGames = 0;

    for (let ci = 0; ci < clubIds.length; ci++) {
      const clubId = clubIds[ci];
      const clubKey = `club_${state}_${clubId}`;
      if (progress[clubKey]) continue;

      const teamIds = await getTeamIdsFromClub(state, clubId);
      await sleep(DELAY_MS);

      for (const tid of teamIds) {
        if (totalTeams >= teamLimit) break;
        const teamKey = `team_${tid}`;
        if (progress[teamKey]) continue;

        try {
          const html = await fetchText(`${BASE_URL}/team/${tid}`);
          const games = parseTeamGames(html);
          allGames.push(...games);
          stateGames += games.length;

          // Collect discovered event IDs
          for (const g of games) {
            const gsMatch = g.sourceUrl.match(/events\/(\d+)/);
            const tgsMatch = g.sourceUrl.match(/event\/(\d+)/);
            if (gsMatch) gsEvents.add(gsMatch[1]);
            if (tgsMatch) tgsEvents.add(tgsMatch[1]);
          }

          progress[teamKey] = true;
          totalTeams++;
          stateTeams++;
        } catch {
          // skip
        }

        await sleep(DELAY_MS);
      }

      if (totalTeams >= teamLimit) break;

      progress[clubKey] = true;

      // Save progress every 20 clubs
      if ((ci + 1) % 20 === 0) {
        console.log(
          `  [${ci + 1}/${clubIds.length}] ${stateTeams} teams, ${stateGames} games`
        );
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));

        // Deduplicate and save games
        const unique = new Map<string, GameRecord>();
        for (const g of allGames) {
          unique.set(`${g.team1}_${g.team2}_${g.team1Score}_${g.team2Score}_${g.date}`, g);
        }
        fs.writeFileSync(gamesFile, JSON.stringify(Array.from(unique.values()), null, 2));
      }
    }

    console.log(`  ${state}: ${stateTeams} teams, ${stateGames} games`);
  }

  // Final save
  const unique = new Map<string, GameRecord>();
  for (const g of allGames) {
    unique.set(`${g.team1}_${g.team2}_${g.team1Score}_${g.team2Score}_${g.date}`, g);
  }
  fs.writeFileSync(gamesFile, JSON.stringify(Array.from(unique.values()), null, 2));
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "discovered_events.json"),
    JSON.stringify({
      gotsport: Array.from(gsEvents).sort(),
      tgs: Array.from(tgsEvents).sort(),
    }, null, 2)
  );

  console.log(`\n=== FINAL ===`);
  console.log(`Teams scraped: ${totalTeams}`);
  console.log(`Unique games: ${unique.size}`);
  console.log(`GotSport events discovered: ${gsEvents.size}`);
  console.log(`TGS events discovered: ${tgsEvents.size}`);
}

main().catch(console.error);
