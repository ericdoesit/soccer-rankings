/**
 * Scrapes ALL California league/tournament game data from GotSport.
 * Covers SoCal Spring 2026 + NorCal leagues.
 * (SoCal Fall 2025-2026 already scraped as event 43086)
 *
 * Uses same club-first approach as scrape-az-nv.ts
 *
 * Usage: npx tsx scripts/scrape-california.ts
 */

import { chromium, type Page } from "playwright";
import * as fs from "fs";
import * as path from "path";

const BROWSER_PROFILE = path.join(process.cwd(), ".browser-profile");
const OUTPUT_DIR = path.join(process.cwd(), "data", "gotsport", "california-games");
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

const EVENTS = [
  // SoCal Spring 2026 leagues
  { id: 51407, name: "SOCAL Spring 2026 - Los Angeles" },
  { id: 51408, name: "SOCAL Spring 2026 - Orange County" },
  { id: 51409, name: "SOCAL Spring 2026 - Inland Empire" },
  { id: 51411, name: "SOCAL Spring 2026 - San Diego" },
  { id: 52038, name: "SOCAL Spring League 2026" },
  // NorCal leagues
  { id: 49370, name: "NorCal Premier Fall League 2025-26" },
  { id: 33458, name: "NorCal Premier Fall League 2024-25" },
  { id: 41823, name: "NorCal Spring NPL 2025" },
  { id: 43082, name: "NorCal Premier Spring Showcase 2025" },
  { id: 44146, name: "NorCal State Cup 2025-26" },
  { id: 40753, name: "NorCal event" },
  // SoCal Fall 2024-25 (previous season)
  { id: 33123, name: "SOCAL Fall League 2024-2025" },
];

async function handleCaptcha(page: Page): Promise<void> {
  if (page.url().includes("verify_captchas")) {
    console.log("  CAPTCHA — solve it in the browser...");
    await page.waitForURL(/schedules|clubs|teams/, { timeout: 120000 });
    console.log("  CAPTCHA solved!");
  }
}

async function getClubIds(page: Page, eventId: number): Promise<number[]> {
  await page.goto(
    `https://system.gotsport.com/org_event/events/${eventId}/clubs`,
    { waitUntil: "domcontentloaded", timeout: 20000 }
  );
  await handleCaptcha(page);
  await page.waitForTimeout(2000);

  return page.evaluate(() => {
    const ids = new Set<number>();
    document.querySelectorAll("a").forEach((a) => {
      const href = a.getAttribute("href") || "";
      const m = href.match(/schedules\?club=(\d+)/);
      if (m) ids.add(parseInt(m[1]));
    });
    return [...ids];
  });
}

async function getTeamIdsFromClub(
  page: Page,
  eventId: number,
  clubId: number
): Promise<number[]> {
  await page.goto(
    `https://system.gotsport.com/org_event/events/${eventId}/schedules?club=${clubId}`,
    { waitUntil: "domcontentloaded", timeout: 15000 }
  );
  await handleCaptcha(page);
  await page.waitForTimeout(1500);

  return page.evaluate(() => {
    const ids = new Set<number>();
    document.querySelectorAll("a").forEach((a) => {
      const href = a.getAttribute("href") || "";
      const m = href.match(/schedules\?team=(\d+)/);
      if (m) ids.add(parseInt(m[1]));
    });
    return [...ids];
  });
}

async function extractGames(
  page: Page,
  eventId: number,
  eventName: string
): Promise<GameRecord[]> {
  const games: GameRecord[] = [];
  await page.waitForTimeout(1500);

  const matchDivs = await page.evaluate(() => {
    const matches: Array<{
      home: string;
      away: string;
      homeScore: number;
      awayScore: number;
      date: string;
    }> = [];

    document.querySelectorAll(".public-match, .row.public-match").forEach((div) => {
      const text = (div as HTMLElement).innerText;
      const lines = text.split("\n").map((l) => l.trim()).filter((l) => l);

      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^(\d+)\s*-\s*(\d+)$/);
        if (!m) continue;

        const home = lines.slice(0, i).find((l) =>
          l.length > 5 && !l.match(/^\d|^Match|^Schedule|^Venue/)
        );
        const away = lines.slice(i + 1).find((l) =>
          l.length > 5 && !l.match(/^\d|^Powered|^©|^Do Not/)
        );
        const dateStr = lines.find((l) =>
          l.match(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/)
        );

        if (home && away) {
          matches.push({
            home: home.replace(/\s*\([HA]\)\s*$/, "").trim(),
            away: away.replace(/\s*\([HA]\)\s*$/, "").trim(),
            homeScore: parseInt(m[1]),
            awayScore: parseInt(m[2]),
            date: dateStr || "",
          });
        }
        break;
      }
    });

    return matches;
  });

  for (const m of matchDivs) {
    games.push({
      matchNumber: "",
      date: m.date,
      homeTeam: m.home,
      awayTeam: m.away,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      location: "",
      division: "",
      eventId,
      eventName,
    });
  }

  if (games.length === 0) {
    const tableGames = await page.evaluate(() => {
      const results: Array<{
        matchNum: string;
        date: string;
        home: string;
        away: string;
        homeScore: number;
        awayScore: number;
        location: string;
        division: string;
      }> = [];

      document.querySelectorAll("table.table-bordered tr").forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll("td")).map(
          (td) => (td as HTMLElement).innerText.trim()
        );
        if (cells.length < 5) return;

        for (let i = 0; i < cells.length; i++) {
          const sm = cells[i].match(/(\d+)\s*-\s*(\d+)/);
          if (!sm) continue;
          const home = i > 0 ? cells[i - 1] : "";
          const away = i + 1 < cells.length ? cells[i + 1] : "";
          if (home.length > 2 && away.length > 2) {
            results.push({
              matchNum: cells[0] || "",
              date: cells[1] || "",
              home,
              away,
              homeScore: parseInt(sm[1]),
              awayScore: parseInt(sm[2]),
              location: i + 2 < cells.length ? cells[i + 2] : "",
              division: i + 3 < cells.length ? cells[i + 3] : "",
            });
          }
          break;
        }
      });
      return results;
    });

    for (const g of tableGames) {
      games.push({
        matchNumber: g.matchNum,
        date: g.date,
        homeTeam: g.home,
        awayTeam: g.away,
        homeScore: g.homeScore,
        awayScore: g.awayScore,
        location: g.location,
        division: g.division,
        eventId,
        eventName,
      });
    }
  }

  return games;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let progress: Record<string, boolean> = {};
  if (fs.existsSync(PROGRESS_FILE)) {
    progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8"));
  }

  const context = await chromium.launchPersistentContext(BROWSER_PROFILE, {
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
    viewport: { width: 1280, height: 720 },
  });

  const page = context.pages()[0] || (await context.newPage());
  let firstPage = true;
  let totalGames = 0;
  let totalTeams = 0;
  const allGames: GameRecord[] = [];

  const gamesFile = path.join(OUTPUT_DIR, "games.json");
  if (fs.existsSync(gamesFile)) {
    const existing = JSON.parse(fs.readFileSync(gamesFile, "utf-8"));
    allGames.push(...existing);
    console.log(`Loaded ${existing.length} existing games`);
  }

  for (const event of EVENTS) {
    console.log(`\n=== ${event.name} (event ${event.id}) ===`);

    let clubIds: number[];
    try {
      clubIds = await getClubIds(page, event.id);
    } catch (e) {
      console.log(`  Failed to load clubs: ${e}`);
      continue;
    }

    if (firstPage) {
      const btn = page.locator('button:has-text("Accept All")').first();
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) await btn.click();
      firstPage = false;
    }

    console.log(`  Found ${clubIds.length} clubs`);
    if (clubIds.length === 0) continue;

    // Discover team IDs from clubs
    const allTeamIds = new Set<number>();
    for (const clubId of clubIds) {
      const clubKey = `club_${event.id}_${clubId}`;
      if (progress[clubKey]) continue;

      try {
        const teamIds = await getTeamIdsFromClub(page, event.id, clubId);
        teamIds.forEach((id) => allTeamIds.add(id));

        const games = await extractGames(page, event.id, event.name);
        allGames.push(...games);
        totalGames += games.length;

        progress[clubKey] = true;
      } catch {
        // skip
      }
      await page.waitForTimeout(300);
    }

    console.log(`  Discovered ${allTeamIds.size} teams`);

    // Scrape each team's schedule
    const teamList = [...allTeamIds];
    let eventGames = 0;

    for (let i = 0; i < teamList.length; i++) {
      const teamId = teamList[i];
      const key = `${event.id}_${teamId}`;
      if (progress[key]) continue;

      try {
        await page.goto(
          `https://system.gotsport.com/org_event/events/${event.id}/schedules?team=${teamId}`,
          { waitUntil: "domcontentloaded", timeout: 15000 }
        );
        await handleCaptcha(page);

        const games = await extractGames(page, event.id, event.name);
        allGames.push(...games);
        eventGames += games.length;
        totalGames += games.length;
        totalTeams++;

        progress[key] = true;

        if ((i + 1) % 20 === 0) {
          console.log(`  [${i + 1}/${teamList.length}] ${eventGames} games`);
          fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
          fs.writeFileSync(gamesFile, JSON.stringify(allGames, null, 2));
        }
      } catch {
        // skip
      }
      await page.waitForTimeout(400);
    }

    console.log(`  Event total: ${eventGames} games from ${teamList.length} teams`);
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
    fs.writeFileSync(gamesFile, JSON.stringify(allGames, null, 2));
  }

  // Deduplicate
  const unique = new Map<string, GameRecord>();
  for (const g of allGames) {
    const key = `${g.eventId}_${g.homeTeam}_${g.awayTeam}_${g.homeScore}_${g.awayScore}_${g.date}`;
    unique.set(key, g);
  }

  fs.writeFileSync(gamesFile, JSON.stringify(Array.from(unique.values()), null, 2));

  const csvHeaders = "event_id,event_name,date,home_team,away_team,home_score,away_score,division";
  const csvRows = Array.from(unique.values()).map((g) =>
    [g.eventId, `"${g.eventName}"`, `"${g.date}"`,
     `"${g.homeTeam.replace(/"/g, '""')}"`, `"${g.awayTeam.replace(/"/g, '""')}"`,
     g.homeScore, g.awayScore, `"${g.division}"`].join(",")
  );
  fs.writeFileSync(path.join(OUTPUT_DIR, "games.csv"), [csvHeaders, ...csvRows].join("\n"));

  console.log(`\n=== FINAL ===`);
  console.log(`Teams scraped: ${totalTeams}`);
  console.log(`Total games (raw): ${allGames.length}`);
  console.log(`Unique games: ${unique.size}`);
  console.log(`Saved to: ${OUTPUT_DIR}/`);

  await context.close();
}

main().catch(console.error);
