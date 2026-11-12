/**
 * GotSport Game Score Scraper (Playwright)
 *
 * Scrapes individual game scores from GotSport event schedule pages.
 * Uses Playwright with visible browser to handle reCAPTCHA.
 *
 * Strategy:
 * 1. Navigate to event schedule page for a team
 * 2. Wait for reCAPTCHA to auto-solve (or manual intervention)
 * 3. Extract game scores from the rendered page
 * 4. Save to JSON
 *
 * Usage:
 *   npx tsx scripts/scrape-games-playwright.ts --team-id 264749
 *   npx tsx scripts/scrape-games-playwright.ts --limit 5
 */

import { chromium, type Page } from "playwright";
import * as fs from "fs";
import * as path from "path";

const BASE_URL = "https://system.gotsport.com";
const OUTPUT_DIR = path.join(process.cwd(), "data", "gotsport", "games");
const TEAMS_FILE = path.join(process.cwd(), "data", "gotsport", "teams.json");

interface GameScore {
  teamId: number;
  eventId: number;
  eventName: string;
  date: string | null;
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
  };
  events: Array<{
    id: number;
    name: string;
  }>;
}

async function waitForCaptcha(page: Page, maxWaitMs = 60000): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const html = await page.content();

    // Check if we're past the captcha
    if (
      !html.includes("verify") &&
      !html.includes("captcha") &&
      !html.includes("verify_captchas")
    ) {
      return true;
    }

    // Check if schedule data is visible
    if (html.includes("schedule-game") || html.includes("match-row")) {
      return true;
    }

    await page.waitForTimeout(2000);
  }

  return false;
}

async function extractGames(
  page: Page,
  teamId: number,
  eventId: number,
  eventName: string
): Promise<GameScore[]> {
  const games: GameScore[] = [];

  // Wait for page content to load
  await page.waitForTimeout(3000);

  // Try to extract from table rows
  const rows = await page.$$("table tbody tr, .schedule-row, .game-row");

  for (const row of rows) {
    try {
      const cells = await row.$$("td");
      if (cells.length < 3) continue;

      const cellTexts = await Promise.all(
        cells.map((c) => c.textContent().then((t) => (t || "").trim()))
      );

      // Look for score pattern (e.g., "3 - 2" or "3-2")
      let scoreIdx = -1;
      let homeScore = -1;
      let awayScore = -1;

      for (let i = 0; i < cellTexts.length; i++) {
        const match = cellTexts[i].match(/^(\d+)\s*[-–]\s*(\d+)$/);
        if (match) {
          scoreIdx = i;
          homeScore = parseInt(match[1]);
          awayScore = parseInt(match[2]);
          break;
        }
      }

      if (scoreIdx === -1) continue;

      // Extract team names from cells around the score
      const homeTeam =
        scoreIdx > 0 ? cellTexts[scoreIdx - 1] : "";
      const awayTeam =
        scoreIdx + 1 < cellTexts.length ? cellTexts[scoreIdx + 1] : "";

      // Look for date
      let date: string | null = null;
      for (const text of cellTexts) {
        const dateMatch = text.match(
          /(\d{1,2}\/\d{1,2}\/\d{2,4})/
        );
        if (dateMatch) {
          date = dateMatch[1];
          break;
        }
      }

      // Look for field info
      let field: string | null = null;
      for (const text of cellTexts) {
        if (text.match(/field|pitch|#\d/i)) {
          field = text;
          break;
        }
      }

      games.push({
        teamId,
        eventId,
        eventName,
        date,
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        field,
      });
    } catch {
      continue;
    }
  }

  // If no table data, try extracting from the raw HTML
  if (games.length === 0) {
    const html = await page.content();
    // Look for score patterns in the page
    const scoreMatches = html.matchAll(
      /(\d+)\s*[-–]\s*(\d+)/g
    );
    let scoreCount = 0;
    for (const _ of scoreMatches) {
      scoreCount++;
    }
    if (scoreCount > 2) {
      console.log(
        `    Found ${scoreCount} potential scores but couldn't extract structured data`
      );
    }
  }

  return games;
}

async function main() {
  const args = process.argv.slice(2);
  const teamIdIdx = args.indexOf("--team-id");
  const limitIdx = args.indexOf("--limit");
  const targetTeamId =
    teamIdIdx >= 0 ? parseInt(args[teamIdIdx + 1]) : null;
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 3;

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Load team data
  if (!fs.existsSync(TEAMS_FILE)) {
    console.log("No team data found. Run scrape-gotsport.ts first.");
    process.exit(1);
  }

  let teams: TeamEntry[] = JSON.parse(
    fs.readFileSync(TEAMS_FILE, "utf-8")
  );

  if (targetTeamId) {
    teams = teams.filter(
      (t) => t.team_ranking_data.team_id === targetTeamId
    );
  }
  teams = teams.slice(0, limit);

  console.log(`Will scrape games for ${teams.length} teams\n`);

  // Launch browser (visible for CAPTCHA handling)
  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();
  let totalGames = 0;
  let captchaSolved = false;

  for (let i = 0; i < teams.length; i++) {
    const team = teams[i];
    const teamId = team.team_ranking_data.team_id;
    const teamName = team.team_ranking_data.team_name;
    const events = team.events;

    console.log(
      `[${i + 1}/${teams.length}] ${teamName} (${events.length} events)`
    );

    const teamGames: GameScore[] = [];

    for (const event of events) {
      const url = `${BASE_URL}/org_event/events/${event.id}/schedules?team=${teamId}`;
      console.log(`  Event: ${event.name}`);

      try {
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });

        // Handle CAPTCHA on first visit
        const html = await page.content();
        if (
          html.includes("verify_captchas") ||
          html.includes("Please verify")
        ) {
          if (!captchaSolved) {
            console.log(
              "    CAPTCHA detected. Waiting up to 60s for it to resolve..."
            );
            console.log(
              "    (If running with visible browser, you can solve it manually)"
            );
          }

          const solved = await waitForCaptcha(page, 60000);
          if (solved) {
            captchaSolved = true;
            console.log("    CAPTCHA resolved!");
          } else {
            console.log("    CAPTCHA not resolved, skipping event");
            continue;
          }
        }

        // Extract games
        const games = await extractGames(
          page,
          teamId,
          event.id,
          event.name
        );
        teamGames.push(...games);

        if (games.length > 0) {
          console.log(`    Found ${games.length} games`);
        } else {
          console.log(`    No games found`);
        }
      } catch (error: unknown) {
        const msg =
          error instanceof Error ? error.message : String(error);
        console.log(`    Error: ${msg.substring(0, 100)}`);
      }

      await page.waitForTimeout(1000);
    }

    // Save team games
    if (teamGames.length > 0) {
      const outFile = path.join(
        OUTPUT_DIR,
        `team_${teamId}_games.json`
      );
      fs.writeFileSync(outFile, JSON.stringify(teamGames, null, 2));
      totalGames += teamGames.length;
      console.log(
        `  Saved ${teamGames.length} games for ${teamName}`
      );
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Teams processed: ${teams.length}`);
  console.log(`Total games found: ${totalGames}`);

  await browser.close();
}

main().catch(console.error);
