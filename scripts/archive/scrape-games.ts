/**
 * GotSport Game Score Scraper (Persistent Session)
 *
 * Uses Playwright with a persistent browser profile to scrape game scores.
 * The CAPTCHA only needs to be solved ONCE manually — the session cookie
 * persists across runs.
 *
 * First run: browser opens visually, solve CAPTCHA manually, then it scrapes.
 * Subsequent runs: session cookie is valid, no CAPTCHA needed.
 *
 * Usage:
 *   npx tsx scripts/scrape-games.ts                    # scrape first 5 teams
 *   npx tsx scripts/scrape-games.ts --limit 50         # scrape 50 teams
 *   npx tsx scripts/scrape-games.ts --team-id 264749   # specific team
 *   npx tsx scripts/scrape-games.ts --headless          # headless (after first solve)
 */

import { chromium, type BrowserContext, type Page } from "playwright";
import * as fs from "fs";
import * as path from "path";

const BASE_URL = "https://system.gotsport.com";
const BROWSER_PROFILE = path.join(process.cwd(), ".browser-profile");
const OUTPUT_DIR = path.join(process.cwd(), "data", "gotsport", "games");
const TEAMS_FILE = path.join(process.cwd(), "data", "gotsport", "teams.json");
const PROGRESS_FILE = path.join(OUTPUT_DIR, "games_progress.json");

interface GameScore {
  teamId: number;
  eventId: number;
  eventName: string;
  date: string | null;
  time: string | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  field: string | null;
}

interface TeamEntry {
  team_ranking_data: {
    team_id: number;
    team_name: string;
    club_name: string;
    age: number;
    gender: string;
  };
  events: Array<{ id: number; name: string }>;
}

async function handleCaptcha(page: Page): Promise<boolean> {
  const url = page.url();
  if (!url.includes("verify_captchas")) return true;

  console.log("    CAPTCHA detected — please solve it in the browser window...");
  try {
    await page.waitForURL("**/schedules**", { timeout: 120000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 });
    console.log("    CAPTCHA solved!");
    return true;
  } catch {
    console.log("    CAPTCHA timeout — could not solve within 2 minutes");
    return false;
  }
}

async function extractGames(
  page: Page,
  teamId: number,
  eventId: number,
  eventName: string
): Promise<GameScore[]> {
  const games: GameScore[] = [];

  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // Extract all text content from table cells to understand the structure
  const tableData = await page.evaluate(() => {
    const rows: string[][] = [];
    document.querySelectorAll("table tr").forEach((tr) => {
      const cells: string[] = [];
      tr.querySelectorAll("td, th").forEach((cell) => {
        cells.push((cell as HTMLElement).innerText.trim());
      });
      if (cells.length > 0) rows.push(cells);
    });
    return rows;
  });

  for (const row of tableData) {
    // Look for rows that contain a score pattern
    for (let i = 0; i < row.length; i++) {
      const scoreMatch = row[i].match(/^(\d+)\s*[-–]\s*(\d+)$/);
      if (!scoreMatch) continue;

      const homeScore = parseInt(scoreMatch[1]);
      const awayScore = parseInt(scoreMatch[2]);

      // Try to find team names near the score
      const homeTeam = i > 0 ? row[i - 1] : "";
      const awayTeam = i + 1 < row.length ? row[i + 1] : "";

      // Skip if team names look like headers or are too short
      if (homeTeam.length < 2 || awayTeam.length < 2) continue;
      if (homeTeam.toLowerCase().includes("score")) continue;

      // Look for date and time
      let date: string | null = null;
      let time: string | null = null;
      let field: string | null = null;

      for (const cell of row) {
        if (!date) {
          const dm = cell.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
          if (dm) date = dm[1];
        }
        if (!time) {
          const tm = cell.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
          if (tm) time = tm[1];
        }
        if (!field && cell.match(/field|pitch/i)) {
          field = cell;
        }
      }

      games.push({
        teamId,
        eventId,
        eventName,
        date,
        time,
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        field,
      });
      break; // only one score per row
    }
  }

  // If table extraction failed, try a broader approach
  if (games.length === 0) {
    // Get all text content and look for score patterns with context
    const pageText = await page.evaluate(() => document.body?.innerText || "");
    const lines = pageText.split("\n").filter((l) => l.trim());

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const scoreMatch = line.match(/^(\d+)\s*[-–]\s*(\d+)$/);
      if (!scoreMatch) continue;

      // Look at surrounding lines for team names
      const above = i > 0 ? lines[i - 1].trim() : "";
      const below = i + 1 < lines.length ? lines[i + 1].trim() : "";

      if (above.length > 2 && below.length > 2) {
        games.push({
          teamId,
          eventId,
          eventName,
          date: null,
          time: null,
          homeTeam: above,
          awayTeam: below,
          homeScore: parseInt(scoreMatch[1]),
          awayScore: parseInt(scoreMatch[2]),
          field: null,
        });
      }
    }
  }

  return games;
}

async function main() {
  const args = process.argv.slice(2);
  const teamIdIdx = args.indexOf("--team-id");
  const limitIdx = args.indexOf("--limit");
  const headless = args.includes("--headless");
  const targetTeamId = teamIdIdx >= 0 ? parseInt(args[teamIdIdx + 1]) : null;
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 5;

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(BROWSER_PROFILE, { recursive: true });

  // Load team data
  if (!fs.existsSync(TEAMS_FILE)) {
    console.log("No team data. Run: npx tsx scripts/scrape-gotsport.ts first");
    process.exit(1);
  }

  let teams: TeamEntry[] = JSON.parse(fs.readFileSync(TEAMS_FILE, "utf-8"));
  if (targetTeamId) {
    teams = teams.filter((t) => t.team_ranking_data.team_id === targetTeamId);
  }
  teams = teams.slice(0, limit);
  console.log(`Will scrape games for ${teams.length} teams`);

  // Load progress
  let progress: Record<string, boolean> = {};
  if (fs.existsSync(PROGRESS_FILE)) {
    progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8"));
    const done = Object.keys(progress).length;
    console.log(`Resuming: ${done} teams already scraped`);
  }

  // Launch with persistent context
  console.log(`Browser profile: ${BROWSER_PROFILE}`);
  console.log(`Headless: ${headless}\n`);

  const context = await chromium.launchPersistentContext(BROWSER_PROFILE, {
    headless,
    args: ["--disable-blink-features=AutomationControlled"],
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
  });

  const page = context.pages()[0] || (await context.newPage());
  let totalGames = 0;

  for (let i = 0; i < teams.length; i++) {
    const team = teams[i];
    const teamId = team.team_ranking_data.team_id;

    if (progress[String(teamId)]) {
      console.log(`[${i + 1}/${teams.length}] Skipping ${team.team_ranking_data.team_name} (already done)`);
      continue;
    }

    console.log(
      `[${i + 1}/${teams.length}] ${team.team_ranking_data.team_name} (${team.events.length} events)`
    );

    const teamGames: GameScore[] = [];

    for (const event of team.events) {
      const url = `${BASE_URL}/org_event/events/${event.id}/schedules?team=${teamId}`;

      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

        // Handle CAPTCHA
        if (page.url().includes("verify_captchas")) {
          const solved = await handleCaptcha(page);
          if (!solved) {
            console.log("  Aborting — CAPTCHA could not be solved");
            await context.close();
            process.exit(1);
          }
        }

        const games = await extractGames(page, teamId, event.id, event.name);
        teamGames.push(...games);

        if (games.length > 0) {
          console.log(`  ${event.name}: ${games.length} games`);
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes("navigating")) {
          // CAPTCHA redirect — try handling it
          const solved = await handleCaptcha(page);
          if (!solved) continue;

          // Retry the page
          try {
            await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
            const games = await extractGames(page, teamId, event.id, event.name);
            teamGames.push(...games);
            if (games.length > 0) {
              console.log(`  ${event.name}: ${games.length} games (after CAPTCHA)`);
            }
          } catch {
            // skip this event
          }
        }
      }

      await page.waitForTimeout(500);
    }

    // Save team games
    if (teamGames.length > 0) {
      const outFile = path.join(OUTPUT_DIR, `team_${teamId}.json`);
      fs.writeFileSync(outFile, JSON.stringify(teamGames, null, 2));
      totalGames += teamGames.length;
      console.log(`  => Saved ${teamGames.length} games`);
    }

    progress[String(teamId)] = true;
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  }

  console.log(`\n=== Done ===`);
  console.log(`Teams processed: ${teams.length}`);
  console.log(`Total games: ${totalGames}`);

  await context.close();
}

main().catch(console.error);
