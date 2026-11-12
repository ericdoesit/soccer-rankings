/**
 * Utah Youth Soccer (UYSA) Scraper
 *
 * Scrapes from uysa.sportsaffinity.com (Stack Sports platform).
 * No CAPTCHA, server-rendered HTML, plain HTTP requests.
 *
 * Data available per flight:
 * - Standings: W-L-D, GF, GA, points
 * - Schedule/Results: game scores, venues, dates
 * - Scoring Leaders: player names, goals, team
 *
 * Usage: npx tsx scripts/scrape-utah.ts
 */

import * as fs from "fs";
import * as path from "path";

const BASE_URL = "https://uysa.sportsaffinity.com/tour/public/info";
const TOURNAMENT_GUID = "8E70B1E6-3FAE-4121-941B-555D95D5D58E";
const OUTPUT_DIR = path.join(process.cwd(), "data", "utah");
const DELAY_MS = 300;

interface StandingsEntry {
  team: string;
  group: string;
  totalPoints: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  goalsFor: number;
  goalsAgainst: number;
  flight: string;
  ageGroup: string;
  gender: string;
}

interface GameResult {
  gameId: string;
  venue: string;
  time: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  flight: string;
  ageGroup: string;
  gender: string;
}

interface ScoringLeader {
  playerName: string;
  playerId: string;
  team: string;
  goals: number;
  flight: string;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
  });
  return res.text();
}

function parseHTML(html: string, tag: string): string[][] {
  const rows: string[][] = [];
  const trMatches = html.match(new RegExp(`<tr[^>]*>([\\s\\S]*?)</tr>`, "gi")) || [];
  for (const tr of trMatches) {
    const cells = (tr.match(new RegExp(`<td[^>]*>([\\s\\S]*?)</td>`, "gi")) || []).map(
      (c) => c.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim()
    );
    if (cells.length >= 2) rows.push(cells);
  }
  return rows;
}

async function getFlightGuids(show: "boys" | "girls"): Promise<Array<{ guid: string; flight: string }>> {
  const url = `${BASE_URL}/accepted_list.asp?sessionguid=&tournamentguid=${TOURNAMENT_GUID}&show=${show}`;
  const html = await fetchPage(url);

  const flights: Array<{ guid: string; flight: string }> = [];
  const standingsLinks = html.match(/schedule_standings\.asp[^"]*flightguid=([A-F0-9-]+)[^"]*/gi) || [];

  for (const link of standingsLinks) {
    const guidMatch = link.match(/flightguid=([A-F0-9-]+)/i);
    if (guidMatch) {
      flights.push({ guid: guidMatch[1], flight: "" });
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return flights.filter((f) => {
    if (seen.has(f.guid)) return false;
    seen.add(f.guid);
    return true;
  });
}

async function scrapeStandings(
  flightGuid: string,
  gender: string
): Promise<StandingsEntry[]> {
  const url = `${BASE_URL}/schedule_standings.asp?sessionguid=&flightguid=${flightGuid}&tournamentguid=${TOURNAMENT_GUID}`;
  const html = await fetchPage(url);
  const entries: StandingsEntry[] = [];

  // Extract flight name from page
  const flightMatch = html.match(/<title[^>]*>([^<]*)</i);
  const flightName = flightMatch ? flightMatch[1].trim() : "";

  // Find age group from flight name
  const ageMatch = flightName.match(/(\d{1,2})U|U(\d{1,2})/i) ||
    html.match(/(\d{1,2})U|U(\d{1,2})/i);
  const ageGroup = ageMatch ? `U${ageMatch[1] || ageMatch[2]}` : "";

  const rows = parseHTML(html, "td");

  for (const cells of rows) {
    // Standings row: ClubInfo | Group | TotalPoints | GP | W | L | T | GF | GA
    // Or: "A8 : Team Name" | points | gp | w | l | t | gf | ga
    if (cells.length < 7) continue;

    const teamCell = cells[0];
    const teamMatch = teamCell.match(/:\s*(.+)/);
    if (!teamMatch) continue;

    const team = teamMatch[1].trim();
    const nums = cells.slice(1).map((c) => parseInt(c) || 0);

    if (nums.length >= 7) {
      entries.push({
        team,
        group: teamCell.split(":")[0].trim(),
        totalPoints: nums[0],
        gamesPlayed: nums[1],
        wins: nums[2],
        losses: nums[3],
        draws: nums[4],
        goalsFor: nums[5],
        goalsAgainst: nums[6],
        flight: flightName,
        ageGroup,
        gender,
      });
    }
  }

  return entries;
}

async function scrapeGames(
  flightGuid: string,
  gender: string
): Promise<GameResult[]> {
  const url = `${BASE_URL}/schedule_results2.asp?sessionguid=&flightguid=${flightGuid}&tournamentguid=${TOURNAMENT_GUID}`;
  const html = await fetchPage(url);
  const games: GameResult[] = [];

  const ageMatch = html.match(/(\d{1,2})U|U(\d{1,2})/i);
  const ageGroup = ageMatch ? `U${ageMatch[1] || ageMatch[2]}` : "";
  const flightMatch = html.match(/<title[^>]*>([^<]*)</i);
  const flight = flightMatch ? flightMatch[1].trim() : "";

  const rows = parseHTML(html, "td");

  for (const cells of rows) {
    // Game row: GameID | Venue | Time | Field | Group | HomeTeam | vs. | AwayTeam
    // With scores: GameID | Venue | Time | Field | Group | HomeTeam | Score | AwayTeam | Score
    if (cells.length < 7) continue;

    const gameId = cells[0].trim();
    if (!/^\d{5,7}$/.test(gameId)) continue;

    const venue = cells[1].trim();
    const time = cells[2].trim();
    const homeTeam = cells[5].trim();
    const awayTeam = cells[cells.length - 1].trim() || cells[7]?.trim() || "";

    // Look for score - sometimes in cells[6] as "3" or cells between team names
    let homeScore = -1;
    let awayScore = -1;

    for (let i = 5; i < cells.length; i++) {
      const num = parseInt(cells[i]);
      if (!isNaN(num) && cells[i].trim().match(/^\d+$/)) {
        if (homeScore < 0) homeScore = num;
        else if (awayScore < 0) awayScore = num;
      }
    }

    if (homeTeam && awayTeam && homeTeam !== "vs.") {
      games.push({
        gameId,
        venue,
        time,
        homeTeam,
        awayTeam: awayTeam.replace(/^vs\.\s*/, ""),
        homeScore,
        awayScore,
        flight,
        ageGroup,
        gender,
      });
    }
  }

  return games;
}

async function scrapeScoringLeaders(
  flightGuid: string
): Promise<ScoringLeader[]> {
  const url = `${BASE_URL}/scoring_leaders.asp?sessionguid=&flightguid=${flightGuid}&tournamentguid=${TOURNAMENT_GUID}`;
  const html = await fetchPage(url);
  const leaders: ScoringLeader[] = [];

  const flightMatch = html.match(/<title[^>]*>([^<]*)</i);
  const flight = flightMatch ? flightMatch[1].trim() : "";

  const rows = parseHTML(html, "td");

  for (const cells of rows) {
    // Player Name / ID | Team Name / Code | Total Goals | Flight
    if (cells.length < 3) continue;

    const playerCell = cells[0];
    const teamCell = cells[1];
    const goalsCell = cells[2];

    const goals = parseInt(goalsCell);
    if (isNaN(goals)) continue;

    const playerName = playerCell.split(/\d{4,}/).shift()?.trim() || playerCell;
    const playerId = (playerCell.match(/(\d{4,}-\d+)/) || [])[1] || "";
    const team = teamCell.split(/\d{4,}/).shift()?.trim() || teamCell;

    leaders.push({ playerName, playerId, team, goals, flight });
  }

  return leaders;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const allStandings: StandingsEntry[] = [];
  const allGames: GameResult[] = [];
  const allLeaders: ScoringLeader[] = [];

  for (const gender of ["boys", "girls"] as const) {
    console.log(`\n=== ${gender.toUpperCase()} ===`);

    const flights = await getFlightGuids(gender);
    console.log(`  ${flights.length} flights found`);

    for (let i = 0; i < flights.length; i++) {
      const { guid } = flights[i];

      try {
        // Standings
        const standings = await scrapeStandings(guid, gender);
        allStandings.push(...standings);

        // Games
        const games = await scrapeGames(guid, gender);
        allGames.push(...games);

        // Scoring leaders
        const leaders = await scrapeScoringLeaders(guid);
        allLeaders.push(...leaders);

        if (standings.length > 0 || games.length > 0) {
          const flight = standings[0]?.flight || games[0]?.flight || `Flight ${i}`;
          console.log(
            `  [${i + 1}/${flights.length}] ${flight}: ${standings.length} teams, ${games.length} games, ${leaders.length} scorers`
          );
        }
      } catch {
        // skip
      }

      await sleep(DELAY_MS);
    }
  }

  // Save all data
  fs.writeFileSync(path.join(OUTPUT_DIR, "standings.json"), JSON.stringify(allStandings, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, "games.json"), JSON.stringify(allGames, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, "scoring_leaders.json"), JSON.stringify(allLeaders, null, 2));

  // CSV for standings
  const csvH = "team,group,points,gp,w,l,d,gf,ga,flight,age_group,gender";
  const csvR = allStandings.map((s) =>
    [`"${s.team}"`, s.group, s.totalPoints, s.gamesPlayed, s.wins, s.losses, s.draws,
     s.goalsFor, s.goalsAgainst, `"${s.flight}"`, s.ageGroup, s.gender].join(",")
  );
  fs.writeFileSync(path.join(OUTPUT_DIR, "standings.csv"), [csvH, ...csvR].join("\n"));

  // CSV for games
  const gCsvH = "game_id,venue,time,home_team,away_team,home_score,away_score,flight,age_group,gender";
  const gCsvR = allGames.map((g) =>
    [g.gameId, `"${g.venue}"`, `"${g.time}"`, `"${g.homeTeam}"`, `"${g.awayTeam}"`,
     g.homeScore, g.awayScore, `"${g.flight}"`, g.ageGroup, g.gender].join(",")
  );
  fs.writeFileSync(path.join(OUTPUT_DIR, "games.csv"), [gCsvH, ...gCsvR].join("\n"));

  console.log(`\n=== FINAL ===`);
  console.log(`Standings: ${allStandings.length} team entries`);
  console.log(`Games: ${allGames.length} (${allGames.filter((g) => g.homeScore >= 0).length} with scores)`);
  console.log(`Scoring leaders: ${allLeaders.length} players`);
  console.log(`Saved to: ${OUTPUT_DIR}/`);
}

main().catch(console.error);
