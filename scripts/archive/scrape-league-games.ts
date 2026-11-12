/**
 * GotSport League Game Scraper
 *
 * Scrapes game scores from GotSport league/event schedule pages.
 * Uses persistent browser session (solve CAPTCHA once, then scrape freely).
 *
 * HTML Structure discovered:
 * - Each game is in a `table.table-bordered.table-condensed.table-hover` with columns:
 *   Match # | Time | Home Team | Results | Away Team | Location | Division
 * - Standings in `table.table-bordered.table-hover` with:
 *   Team | MP | W | L | D | GF | GA | GD | PTS | PPG
 * - Score displayed as "1 - 1" in the Results column
 * - Export available at /org_event/events/{id}/matches_export?team={team_id}
 *
 * Data source: SoCal league teams CSV (4,720 teams with schedule URLs)
 *
 * Usage:
 *   npx tsx scripts/scrape-league-games.ts --limit 50
 *   npx tsx scripts/scrape-league-games.ts --event 43086 --limit 100
 */

import { chromium, type Page } from "playwright";
import * as fs from "fs";
import * as path from "path";

const BROWSER_PROFILE = path.join(process.cwd(), ".browser-profile");
const OUTPUT_DIR = path.join(process.cwd(), "data", "gotsport", "league-games");
const SOCAL_CSV = "/Users/Eric/Documents/Claude/soccer/data/socal_league_teams.csv";
const PROGRESS_FILE = path.join(OUTPUT_DIR, "progress.json");

interface GameRecord {
  matchNumber: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  location: string;
  division: string;
  eventId: number;
  eventName: string;
}

interface StandingsEntry {
  team: string;
  mp: number;
  w: number;
  l: number;
  d: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
  division: string;
  eventId: number;
}

function loadSoCalTeams(): Array<{
  club: string;
  teamName: string;
  url: string;
  gender: string;
  age: string;
  division: string;
  eventId: number;
  teamId: number;
}> {
  const content = fs.readFileSync(SOCAL_CSV, "utf-8");
  const lines = content.trim().split("\n").slice(1);

  return lines.map((line) => {
    const [club, teamName, url, gender, age, division] = line.split(",");
    const eventMatch = url.match(/events\/(\d+)/);
    const teamMatch = url.match(/team=(\d+)/);
    return {
      club,
      teamName,
      url,
      gender,
      age,
      division,
      eventId: eventMatch ? parseInt(eventMatch[1]) : 0,
      teamId: teamMatch ? parseInt(teamMatch[1]) : 0,
    };
  });
}

async function extractGamesFromPage(
  page: Page,
  eventId: number,
  eventName: string
): Promise<{ games: GameRecord[]; standings: StandingsEntry[] }> {
  const games: GameRecord[] = [];
  const standings: StandingsEntry[] = [];

  // Extract game data from match tables
  const matchData = await page.evaluate(() => {
    const results: Array<{
      cells: string[];
      isMatchRow: boolean;
    }> = [];

    document.querySelectorAll("table.table-bordered tr").forEach((tr) => {
      const cells: string[] = [];
      tr.querySelectorAll("td, th").forEach((cell) => {
        cells.push((cell as HTMLElement).innerText.trim());
      });

      if (cells.length >= 5) {
        const isMatchRow = cells.some((c) => /^\d+$/.test(c)) &&
          cells.some((c) => /\d+\s*-\s*\d+/.test(c));
        results.push({ cells, isMatchRow });
      }
    });

    return results;
  });

  // Parse match rows
  for (const row of matchData) {
    if (!row.isMatchRow) continue;
    const cells = row.cells;

    // Find the score cell
    for (let i = 0; i < cells.length; i++) {
      const scoreMatch = cells[i].match(/(\d+)\s*-\s*(\d+)/);
      if (!scoreMatch) continue;

      // Match table format: Match# | Time | Home | Score | Away | Location | Division
      const matchNum = cells[0] || "";
      const dateTime = cells[1] || "";
      const homeTeam = i > 0 ? cells[i - 1] : "";
      const awayTeam = i + 1 < cells.length ? cells[i + 1] : "";
      const location = i + 2 < cells.length ? cells[i + 2] : "";
      const division = i + 3 < cells.length ? cells[i + 3] : "";

      // Extract date from datetime string
      const dateMatch = dateTime.match(
        /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4})/
      );
      const date = dateMatch ? dateMatch[1] : dateTime;

      if (homeTeam.length > 2 && awayTeam.length > 2) {
        games.push({
          matchNumber: matchNum,
          date,
          homeTeam,
          awayTeam,
          homeScore: parseInt(scoreMatch[1]),
          awayScore: parseInt(scoreMatch[2]),
          location,
          division,
          eventId,
          eventName,
        });
      }
      break;
    }
  }

  // Also extract from public-match divs (alternative format)
  if (games.length === 0) {
    const matchDivs = await page.evaluate(() => {
      const matches: Array<{
        home: string;
        away: string;
        score: string;
        date: string;
      }> = [];

      document.querySelectorAll(".public-match").forEach((div) => {
        const text = (div as HTMLElement).innerText;
        const lines = text
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l);

        // Look for score pattern
        for (let i = 0; i < lines.length; i++) {
          const m = lines[i].match(/^(\d+)\s*-\s*(\d+)$/);
          if (m) {
            const home = lines
              .slice(0, i)
              .find((l) => l.length > 5 && !l.match(/^\d|^Match|^Schedule/));
            const away = lines
              .slice(i + 1)
              .find((l) => l.length > 5 && !l.match(/^\d|^Powered|^©/));
            const dateStr = lines.find((l) =>
              l.match(
                /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/
              )
            );

            if (home && away) {
              matches.push({
                home: home.replace(/\s*\(H\)\s*$/, "").trim(),
                away: away.replace(/\s*\(A\)\s*$/, "").trim(),
                score: lines[i],
                date: dateStr || "",
              });
            }
            break;
          }
        }
      });

      return matches;
    });

    for (const m of matchDivs) {
      const [h, a] = m.score.split("-").map((s) => parseInt(s.trim()));
      games.push({
        matchNumber: "",
        date: m.date,
        homeTeam: m.home,
        awayTeam: m.away,
        homeScore: h,
        awayScore: a,
        location: "",
        division: "",
        eventId,
        eventName,
      });
    }
  }

  // Extract standings
  const standingsData = await page.evaluate(() => {
    const rows: string[][] = [];
    document
      .querySelectorAll("table.table-bordered.table-hover tr")
      .forEach((tr) => {
        const cells: string[] = [];
        tr.querySelectorAll("td").forEach((td) => {
          cells.push((td as HTMLElement).innerText.trim());
        });
        // Standings rows have 10 columns: rank, team, MP, W, L, D, GF, GA, GD, PTS, PPG
        if (cells.length >= 9) {
          rows.push(cells);
        }
      });
    return rows;
  });

  for (const row of standingsData) {
    // Skip if it looks like a match row (has date)
    if (row.some((c) => c.match(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/)))
      continue;

    const teamName = row.find(
      (c) => c.length > 3 && !c.match(/^\d+\.?\d*$/)
    );
    const nums = row.filter((c) => /^\d+\.?\d*$/.test(c));

    if (teamName && nums.length >= 7) {
      standings.push({
        team: teamName,
        mp: parseInt(nums[0]),
        w: parseInt(nums[1]),
        l: parseInt(nums[2]),
        d: parseInt(nums[3]),
        gf: parseInt(nums[4]),
        ga: parseInt(nums[5]),
        gd: parseInt(nums[6]),
        pts: parseInt(nums[7] || "0"),
        division: "",
        eventId,
      });
    }
  }

  return { games, standings };
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const eventIdx = args.indexOf("--event");
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 20;
  const targetEvent = eventIdx >= 0 ? parseInt(args[eventIdx + 1]) : null;
  const headless = args.includes("--headless");

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Load SoCal teams
  const allTeams = loadSoCalTeams();
  console.log(`Loaded ${allTeams.length} SoCal teams`);

  // Filter to target event if specified
  let teams = targetEvent
    ? allTeams.filter((t) => t.eventId === targetEvent)
    : allTeams;
  teams = teams.slice(0, limit);

  // Load progress
  let progress: Record<string, boolean> = {};
  if (fs.existsSync(PROGRESS_FILE)) {
    progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8"));
  }
  const alreadyDone = Object.keys(progress).length;
  console.log(`Will scrape ${teams.length} teams (${alreadyDone} already done)`);

  // Launch browser
  const context = await chromium.launchPersistentContext(BROWSER_PROFILE, {
    headless,
    args: ["--disable-blink-features=AutomationControlled"],
    viewport: { width: 1280, height: 720 },
  });
  const page = context.pages()[0] || (await context.newPage());

  let totalGames = 0;
  let totalStandings = 0;
  const allGames: GameRecord[] = [];
  const allStandings: StandingsEntry[] = [];

  for (let i = 0; i < teams.length; i++) {
    const team = teams[i];
    const key = `${team.eventId}_${team.teamId}`;

    if (progress[key]) continue;

    console.log(
      `[${i + 1}/${teams.length}] ${team.teamName} (${team.age} ${team.gender})`
    );

    try {
      await page.goto(team.url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Handle CAPTCHA
      if (page.url().includes("verify_captchas")) {
        console.log("  CAPTCHA — waiting for solve...");
        await page.waitForURL("**/schedules**", { timeout: 120000 });
        console.log("  CAPTCHA solved!");
      }

      // Dismiss cookie consent (first time only)
      if (i === 0) {
        for (const label of ["Accept All", "Reject All"]) {
          const btn = page.locator(`button:has-text("${label}")`).first();
          if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await btn.click();
            break;
          }
        }
      }

      await page.waitForTimeout(2000);

      const eventName = await page
        .locator(".navbar-brand-event")
        .first()
        .textContent()
        .catch(() => `Event ${team.eventId}`);

      const { games, standings } = await extractGamesFromPage(
        page,
        team.eventId,
        eventName || `Event ${team.eventId}`
      );

      allGames.push(...games);
      allStandings.push(...standings);
      totalGames += games.length;
      totalStandings += standings.length;

      if (games.length > 0 || standings.length > 0) {
        console.log(
          `  Found ${games.length} games, ${standings.length} standings entries`
        );
      }

      progress[key] = true;

      // Save progress every 10 teams
      if (i % 10 === 0) {
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
        fs.writeFileSync(
          path.join(OUTPUT_DIR, "games.json"),
          JSON.stringify(allGames, null, 2)
        );
        fs.writeFileSync(
          path.join(OUTPUT_DIR, "standings.json"),
          JSON.stringify(allStandings, null, 2)
        );
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  Error: ${msg.substring(0, 100)}`);
    }

    await page.waitForTimeout(500);
  }

  // Save final results
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "games.json"),
    JSON.stringify(allGames, null, 2)
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "standings.json"),
    JSON.stringify(allStandings, null, 2)
  );

  // Deduplicate games by matchNumber + eventId
  const uniqueGames = new Map<string, GameRecord>();
  for (const g of allGames) {
    const key = `${g.eventId}_${g.matchNumber}_${g.homeTeam}_${g.awayTeam}`;
    uniqueGames.set(key, g);
  }

  // Save CSV
  const csvHeaders =
    "match_number,date,home_team,away_team,home_score,away_score,location,division,event_id,event_name";
  const csvRows = Array.from(uniqueGames.values()).map((g) =>
    [
      g.matchNumber,
      `"${g.date}"`,
      `"${g.homeTeam.replace(/"/g, '""')}"`,
      `"${g.awayTeam.replace(/"/g, '""')}"`,
      g.homeScore,
      g.awayScore,
      `"${g.location.replace(/"/g, '""')}"`,
      `"${g.division.replace(/"/g, '""')}"`,
      g.eventId,
      `"${g.eventName.replace(/"/g, '""')}"`,
    ].join(",")
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "games.csv"),
    [csvHeaders, ...csvRows].join("\n")
  );

  console.log(`\n=== Summary ===`);
  console.log(`Teams processed: ${Object.keys(progress).length}`);
  console.log(`Total games: ${uniqueGames.size} (${totalGames} raw)`);
  console.log(`Total standings: ${totalStandings}`);
  console.log(`Saved to: ${OUTPUT_DIR}/`);

  await context.close();
}

main().catch(console.error);
