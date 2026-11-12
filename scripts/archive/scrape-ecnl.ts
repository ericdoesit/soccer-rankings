/**
 * LEGACY / INCOMPLETE: prefer `npm run scrape:ecnl` (scrape-ecnl-api.ts).
 * This Sidearm scraper cannot reliably identify both match participants.
 *
 * ECNL Standings & Schedule Scraper
 *
 * Scrapes from theecnl.com (SidearmSports platform).
 * No CAPTCHA needed — server-rendered HTML.
 *
 * Pages:
 * - Standings: /sports/2023/8/8/ECNLRLB_0808230006.aspx (RL Boys)
 * - Schedule:  /sports/ecnl-boys/schedule/2025-26
 *
 * Usage: npx tsx scripts/scrape-ecnl.ts
 */

import { chromium, type Page } from "playwright";
import * as fs from "fs";
import * as path from "path";

const OUTPUT_DIR = path.join(process.cwd(), "data", "ecnl");

interface StandingsEntry {
  pos: number;
  team: string;
  gp: number;
  wins: number;
  losses: number;
  draws: number;
  gf: number;
  ga: number;
  gd: number;
  ppg: number;
  pts: number;
  conference: string;
  ageGroup: string;
  league: string;
}

interface GameResult {
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  league: string;
  conference: string;
}

const STANDINGS_PAGES = [
  { url: "https://theecnl.com/sports/2023/8/8/ECNLRLB_0808230006.aspx", league: "ECNL RL Boys" },
  { url: "https://theecnl.com/sports/2023/8/8/ECNLB_0808235537.aspx", league: "ECNL Boys" },
];

const WEST_CONFERENCES = [
  "SoCal", "NorCal", "Southwest", "Mountain", "Far West",
  "Golden State", "Northwest", "Frontier",
];

const AGE_GROUPS = ["B2013", "B2012", "B2011", "B2010", "B2009", "B2008/2007"];

const SCHEDULE_PAGES = [
  { url: "https://theecnl.com/sports/ecnl-boys/schedule/2025-26", league: "ECNL Boys" },
  { url: "https://theecnl.com/sports/ecnl-regional-league-boys/schedule/2025-26", league: "ECNL RL Boys" },
  { url: "https://theecnl.com/sports/ecnl-girls/schedule/2025-26", league: "ECNL Girls" },
  { url: "https://theecnl.com/sports/ecnl-regional-league-girls/schedule/2025-26", league: "ECNL RL Girls" },
];

async function dismissCookies(page: Page) {
  for (const selector of ['button[aria-label="Close"]', ".close-button", 'button:has-text("×")', 'button:has-text("Accept")']) {
    const btn = page.locator(selector).first();
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(500);
      return;
    }
  }
}

async function scrapeStandings(page: Page, url: string, league: string): Promise<StandingsEntry[]> {
  const allStandings: StandingsEntry[] = [];

  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(3000);
  await dismissCookies(page);
  await page.waitForTimeout(1000);

  // Get available conferences
  const conferences = await page.evaluate(() => {
    const options: string[] = [];
    document.querySelectorAll("select option").forEach((opt) => {
      const text = (opt as HTMLOptionElement).text.trim();
      if (text.includes("ECNL") && text.includes("2025-26")) {
        options.push(text);
      }
    });
    return options;
  });

  console.log(`  ${conferences.length} conferences found`);

  // Filter to west conferences
  const westConfs = conferences.filter((c) =>
    WEST_CONFERENCES.some((w) => c.toLowerCase().includes(w.toLowerCase()))
  );

  console.log(`  ${westConfs.length} west conferences: ${westConfs.join(", ")}`);

  for (const conf of westConfs) {
    for (const age of AGE_GROUPS) {
      // Select conference — must dispatch change event for SidearmSports
      try {
        const selects = await page.$$("select");
        for (const sel of selects) {
          const options = await sel.$$eval("option", (opts) =>
            opts.map((o) => ({ text: (o as HTMLOptionElement).text.trim(), value: (o as HTMLOptionElement).value }))
          );
          const match = options.find((o) => o.text === conf);
          if (match) {
            await sel.selectOption(match.value);
            await sel.evaluate((el) => el.dispatchEvent(new Event("change", { bubbles: true })));
            break;
          }
        }
        await page.waitForTimeout(2000);

        // Select age group — find the age dropdown and dispatch change
        const ageSelects = await page.$$("select");
        for (const sel of ageSelects) {
          const options = await sel.$$eval("option", (opts) =>
            opts.map((o) => ({ text: (o as HTMLOptionElement).text.trim(), value: (o as HTMLOptionElement).value }))
          );
          const ageMatch = options.find((o) => o.text === age);
          if (ageMatch) {
            await sel.selectOption(ageMatch.value);
            await sel.evaluate((el) => el.dispatchEvent(new Event("change", { bubbles: true })));
            break;
          }
        }
        await page.waitForTimeout(2000);

        // Extract standings table
        const rawStandings = await page.evaluate(() => {
          const rows: Array<{ pos: number; team: string; gp: number; wins: number; losses: number; draws: number; gf: number; ga: number; gd: number; ppg: number; pts: number }> = [];
          const trs = document.querySelectorAll("table tr, .sidearm-standings-table tr");

          for (const tr of trs) {
            const tds = tr.querySelectorAll("td");
            if (tds.length < 8) continue;

            const cells = Array.from(tds).map((td) => (td as HTMLElement).innerText.trim());

            const pos = parseInt(cells[0]);
            if (isNaN(pos)) continue;

            const teamText = cells[1].split("\n")[0].trim();

            rows.push({
              pos, team: teamText,
              gp: parseInt(cells[2]) || 0, wins: parseInt(cells[3]) || 0,
              losses: parseInt(cells[4]) || 0, draws: parseInt(cells[5]) || 0,
              gf: parseInt(cells[6]) || 0, ga: parseInt(cells[7]) || 0,
              gd: parseInt(cells[8]) || 0, ppg: parseFloat(cells[9]) || 0,
              pts: parseInt(cells[10]) || 0,
            });
          }
          return rows;
        });
        const standings: StandingsEntry[] = rawStandings.map((r) => ({
          ...r, conference: conf, ageGroup: age, league,
        }));

        if (standings.length > 0) {
          allStandings.push(...standings);
          console.log(`    ${conf} ${age}: ${standings.length} teams`);
        }
      } catch (e) {
        // skip
      }
    }
  }

  return allStandings;
}

async function scrapeScheduleGames(page: Page, url: string, league: string): Promise<GameResult[]> {
  const games: GameResult[] = [];

  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(3000);
  await dismissCookies(page);
  await page.waitForTimeout(2000);

  // Extract all games from the schedule page
  const pageGames = await page.evaluate((leagueName: string) => {
    const results: GameResult[] = [];
    const gameBlocks = document.querySelectorAll(".sidearm-schedule-game");

    for (const block of gameBlocks) {
      const opponentEl = block.querySelector(".sidearm-schedule-game-opponent-name");
      const scoreEl = block.querySelector(".sidearm-schedule-game-result");
      const dateEl = block.querySelector(".sidearm-schedule-game-date, time");

      if (!opponentEl || !scoreEl) continue;

      const scoreText = (scoreEl as HTMLElement).innerText.trim();
      const scoreMatch = scoreText.match(/[WLD]\s*(\d+)\s*-\s*(\d+)/);
      if (!scoreMatch) continue;

      const opponent = (opponentEl as HTMLElement).innerText.trim();
      const date = dateEl ? (dateEl as HTMLElement).innerText.trim() : "";
      const wld = scoreText[0];

      // ECNL schedule shows from "our" team's perspective
      // W 3-1 means we scored 3, opponent scored 1
      const ourScore = parseInt(scoreMatch[1]);
      const theirScore = parseInt(scoreMatch[2]);

      results.push({
        date,
        homeTeam: "ECNL Team", // Will need context
        awayTeam: opponent,
        homeScore: ourScore,
        awayScore: theirScore,
        league: leagueName,
        conference: "",
      });
    }

    return results;
  }, league);

  games.push(...pageGames);
  return games;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  });
  const page = await context.newPage();

  const allStandings: StandingsEntry[] = [];
  const allGames: GameResult[] = [];

  // Scrape standings
  for (const sp of STANDINGS_PAGES) {
    console.log(`\n=== ${sp.league} Standings ===`);
    const standings = await scrapeStandings(page, sp.url, sp.league);
    allStandings.push(...standings);
    console.log(`  Total: ${standings.length} team entries`);
  }

  // Scrape schedule/results
  for (const sp of SCHEDULE_PAGES) {
    console.log(`\n=== ${sp.league} Schedule ===`);
    const games = await scrapeScheduleGames(page, sp.url, sp.league);
    allGames.push(...games);
    console.log(`  Total: ${games.length} games with scores`);
  }

  // Save standings
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "standings.json"),
    JSON.stringify(allStandings, null, 2)
  );

  // Save standings CSV
  const csvH = "pos,team,gp,wins,losses,draws,gf,ga,gd,ppg,pts,conference,age_group,league";
  const csvR = allStandings.map((s) =>
    [s.pos, `"${s.team}"`, s.gp, s.wins, s.losses, s.draws, s.gf, s.ga, s.gd, s.ppg, s.pts,
     `"${s.conference}"`, s.ageGroup, `"${s.league}"`].join(",")
  );
  fs.writeFileSync(path.join(OUTPUT_DIR, "standings.csv"), [csvH, ...csvR].join("\n"));

  // Save games
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "games.json"),
    JSON.stringify(allGames, null, 2)
  );

  console.log(`\n=== FINAL ===`);
  console.log(`Standings: ${allStandings.length} team entries`);
  console.log(`Games: ${allGames.length} results`);
  console.log(`Saved to: ${OUTPUT_DIR}/`);

  await browser.close();
}

main().catch(console.error);
