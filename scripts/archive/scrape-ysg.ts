/**
 * YouthSoccerGames.com Scraper
 *
 * Scrapes game history from team pages on youthsoccergames.com.
 * Server-rendered HTML, no CAPTCHA.
 *
 * Structure per game (nested table):
 * - Row 1: Team A name + score
 * - Row 2: Team B name + score (winner has border-success span)
 * - Row 3: Date + tournament link (often links to GotSport source)
 *
 * Usage:
 *   npx tsx scripts/scrape-ysg.ts --state california-south --age 2015 --gender boys
 *   npx tsx scripts/scrape-ysg.ts --team 300426340
 */

import * as fs from "fs";
import * as path from "path";

const BASE_URL = "https://youthsoccergames.com";
const OUTPUT_DIR = path.join(process.cwd(), "data", "ysg");
const DELAY_MS = 500;

interface GameRecord {
  team1: string;
  team2: string;
  team1Score: number;
  team2Score: number;
  date: string;
  tournament: string;
  sourceUrl: string;
  teamId: string;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getTeamIds(
  state: string,
  gender: string,
  age: string
): Promise<string[]> {
  const url = `${BASE_URL}/teams/${state}/${gender}/${age}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
  });
  const html = await res.text();

  const ids = new Set<string>();
  const matches = html.matchAll(/href="\/team\/(\d+)"/g);
  for (const m of matches) {
    ids.add(m[1]);
  }
  return Array.from(ids);
}

async function scrapeTeamGames(teamId: string): Promise<GameRecord[]> {
  const url = `${BASE_URL}/team/${teamId}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
  });
  const html = await res.text();
  const games: GameRecord[] = [];

  // Each game is in a <tr class="border-bottom border-3"> containing a nested table
  // Structure per game:
  //   Row: <a title="Team1">Team1</a> ... <td>SCORE1</td>
  //   Row: <div>Team2</div> or <a title="Team2"> ... <td>SCORE2</td>
  //   Row: <td>Date - <a href="source">Tournament Name</a></td>
  const gameBlocks = html.split('border-bottom border-3');

  for (const block of gameBlocks) {
    // Team names: title="Team Name" or <div>Team Name</div>
    const titleMatches = Array.from(block.matchAll(/title="([^"]+)"/g)).map((m) => m[1]);
    const divMatches = Array.from(block.matchAll(/<div>([^<]{5,})<\/div>/g)).map((m) => m[1].trim());
    const names = [...titleMatches, ...divMatches].filter(
      (n) => n.length > 4 && !n.includes("club-logo")
    );

    // Scores: col-1 align-middle td with a number
    const scores = Array.from(
      block.matchAll(/col-1 align-middle[^>]*>(?:<span[^>]*>)?(\d+)/g)
    ).map((m) => parseInt(m[1]));

    if (names.length < 2 || scores.length < 2) continue;

    // Date
    const dateMatch = block.match(
      /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4})/
    );

    // Source URL and tournament name
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
      teamId,
    });
  }

  return games;
}

async function main() {
  const args = process.argv.slice(2);
  const stateIdx = args.indexOf("--state");
  const ageIdx = args.indexOf("--age");
  const genderIdx = args.indexOf("--gender");
  const teamIdx = args.indexOf("--team");

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let teamIds: string[] = [];

  if (teamIdx >= 0) {
    teamIds = [args[teamIdx + 1]];
  } else {
    const state = stateIdx >= 0 ? args[stateIdx + 1] : "california-south";
    const gender = genderIdx >= 0 ? args[genderIdx + 1] : "boys";
    const age = ageIdx >= 0 ? args[ageIdx + 1] : "2015";

    console.log(`Fetching team list: ${state}/${gender}/${age}`);
    teamIds = await getTeamIds(state, gender, age);
    console.log(`Found ${teamIds.length} teams`);
  }

  const allGames: GameRecord[] = [];
  const progressFile = path.join(OUTPUT_DIR, "progress.json");
  let progress: Record<string, boolean> = {};
  if (fs.existsSync(progressFile)) {
    progress = JSON.parse(fs.readFileSync(progressFile, "utf-8"));
  }

  let scraped = 0;
  for (let i = 0; i < teamIds.length; i++) {
    const tid = teamIds[i];
    if (progress[tid]) continue;

    try {
      const games = await scrapeTeamGames(tid);
      allGames.push(...games);
      scraped++;
      progress[tid] = true;

      if (games.length > 0 && scraped % 20 === 0) {
        console.log(`  [${i + 1}/${teamIds.length}] ${scraped} teams scraped, ${allGames.length} games`);
        fs.writeFileSync(progressFile, JSON.stringify(progress));
      }
    } catch {
      // skip
    }

    await sleep(DELAY_MS);
  }

  // Deduplicate
  const unique = new Map<string, GameRecord>();
  for (const g of allGames) {
    const key = `${g.team1}_${g.team2}_${g.team1Score}_${g.team2Score}_${g.date}`;
    unique.set(key, g);
  }

  // Save
  const gamesFile = path.join(OUTPUT_DIR, "games.json");
  let existing: GameRecord[] = [];
  if (fs.existsSync(gamesFile)) {
    existing = JSON.parse(fs.readFileSync(gamesFile, "utf-8"));
  }
  const merged = new Map<string, GameRecord>();
  for (const g of [...existing, ...Array.from(unique.values())]) {
    const key = `${g.team1}_${g.team2}_${g.team1Score}_${g.team2Score}_${g.date}`;
    merged.set(key, g);
  }
  fs.writeFileSync(gamesFile, JSON.stringify(Array.from(merged.values()), null, 2));
  fs.writeFileSync(progressFile, JSON.stringify(progress));

  // Also extract discovered event IDs
  const gsEvents = new Set<string>();
  const tgsEvents = new Set<string>();
  for (const g of allGames) {
    const gsMatch = g.sourceUrl.match(/events\/(\d+)/);
    const tgsMatch = g.sourceUrl.match(/event\/(\d+)/);
    if (gsMatch) gsEvents.add(gsMatch[1]);
    if (tgsMatch) tgsEvents.add(tgsMatch[1]);
  }
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "discovered_events.json"),
    JSON.stringify({ gotsport: Array.from(gsEvents), tgs: Array.from(tgsEvents) }, null, 2)
  );

  console.log(`\n=== FINAL ===`);
  console.log(`Teams scraped: ${scraped}`);
  console.log(`Games: ${merged.size} unique`);
  console.log(`GotSport events discovered: ${gsEvents.size}`);
  console.log(`TGS events discovered: ${tgsEvents.size}`);
  console.log(`Saved to: ${OUTPUT_DIR}/`);
}

main().catch(console.error);
