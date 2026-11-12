/**
 * Scrapes game data for the remaining West Division states:
 * Colorado, Utah, Montana, Wyoming
 *
 * Uses same club-first approach as scrape-az-nv.ts
 *
 * Usage: npx tsx scripts/scrape-west-division.ts
 */

import { chromium, type Page } from "playwright";
import * as fs from "fs";
import * as path from "path";

const BROWSER_PROFILE = path.join(process.cwd(), ".browser-profile");
const OUTPUT_DIR = path.join(process.cwd(), "data", "gotsport", "west-division-games");
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
  // Colorado
  { id: 33862, name: "Fall 2024 CCSAI Classic League (CO)" },
  { id: 50887, name: "CLS Spring 2026 (CO)" },
  { id: 39601, name: "2025 Real CO Cup / Colorado Showcase" },
  { id: 49875, name: "Boulder Cup 2026" },
  // Montana
  { id: 40682, name: "2025 Montana State Spring League" },
  // Utah
  { id: 49142, name: "2026 Spring Thruway League (UT)" },
  // Wyoming / Northwest
  { id: 34040, name: "Northwest Conference 2024-25 (WY/OR/WA/ID)" },
  // Multi-state / Cross-regional
  { id: 34558, name: "Desert Conference 2024-25 (NV/UT/CO/AZ/HI/NM/ID)" },
  { id: 42977, name: "Far West Regional Championships 2025" },
  { id: 42900, name: "2025 SoCal Summer Showcase" },
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
      const m = (a.getAttribute("href") || "").match(/schedules\?club=(\d+)/);
      if (m) ids.add(parseInt(m[1]));
    });
    return [...ids];
  });
}

async function getTeamIdsFromClub(page: Page, eventId: number, clubId: number): Promise<number[]> {
  await page.goto(
    `https://system.gotsport.com/org_event/events/${eventId}/schedules?club=${clubId}`,
    { waitUntil: "domcontentloaded", timeout: 15000 }
  );
  await handleCaptcha(page);
  await page.waitForTimeout(1500);
  return page.evaluate(() => {
    const ids = new Set<number>();
    document.querySelectorAll("a").forEach((a) => {
      const m = (a.getAttribute("href") || "").match(/schedules\?team=(\d+)/);
      if (m) ids.add(parseInt(m[1]));
    });
    return [...ids];
  });
}

async function extractGames(page: Page, eventId: number, eventName: string): Promise<GameRecord[]> {
  const games: GameRecord[] = [];
  await page.waitForTimeout(1500);

  const matchDivs = await page.evaluate(() => {
    const matches: Array<{ home: string; away: string; homeScore: number; awayScore: number; date: string }> = [];
    document.querySelectorAll(".public-match, .row.public-match").forEach((div) => {
      const text = (div as HTMLElement).innerText;
      const lines = text.split("\n").map((l) => l.trim()).filter((l) => l);
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^(\d+)\s*-\s*(\d+)$/);
        if (!m) continue;
        const home = lines.slice(0, i).find((l) => l.length > 5 && !l.match(/^\d|^Match|^Schedule|^Venue/));
        const away = lines.slice(i + 1).find((l) => l.length > 5 && !l.match(/^\d|^Powered|^©|^Do Not/));
        const dateStr = lines.find((l) => l.match(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/));
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
    games.push({ matchNumber: "", date: m.date, homeTeam: m.home, awayTeam: m.away, homeScore: m.homeScore, awayScore: m.awayScore, location: "", division: "", eventId, eventName });
  }

  if (games.length === 0) {
    const tableGames = await page.evaluate(() => {
      const r: Array<{ mn: string; d: string; h: string; a: string; hs: number; as_: number; l: string; dv: string }> = [];
      document.querySelectorAll("table.table-bordered tr").forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll("td")).map((td) => (td as HTMLElement).innerText.trim());
        if (cells.length < 5) return;
        for (let i = 0; i < cells.length; i++) {
          const sm = cells[i].match(/(\d+)\s*-\s*(\d+)/);
          if (!sm) continue;
          const h = i > 0 ? cells[i - 1] : "";
          const a = i + 1 < cells.length ? cells[i + 1] : "";
          if (h.length > 2 && a.length > 2) {
            r.push({ mn: cells[0], d: cells[1], h, a, hs: parseInt(sm[1]), as_: parseInt(sm[2]), l: cells[i + 2] || "", dv: cells[i + 3] || "" });
          }
          break;
        }
      });
      return r;
    });
    for (const g of tableGames) {
      games.push({ matchNumber: g.mn, date: g.d, homeTeam: g.h, awayTeam: g.a, homeScore: g.hs, awayScore: g.as_, location: g.l, division: g.dv, eventId, eventName });
    }
  }

  return games;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  let progress: Record<string, boolean> = {};
  if (fs.existsSync(PROGRESS_FILE)) progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8"));

  const context = await chromium.launchPersistentContext(BROWSER_PROFILE, {
    headless: false, args: ["--disable-blink-features=AutomationControlled"], viewport: { width: 1280, height: 720 },
  });
  const page = context.pages()[0] || (await context.newPage());
  let firstPage = true;
  let totalGames = 0;
  const allGames: GameRecord[] = [];
  const gamesFile = path.join(OUTPUT_DIR, "games.json");
  if (fs.existsSync(gamesFile)) { allGames.push(...JSON.parse(fs.readFileSync(gamesFile, "utf-8"))); console.log(`Loaded ${allGames.length} existing`); }

  for (const event of EVENTS) {
    console.log(`\n=== ${event.name} (event ${event.id}) ===`);
    let clubIds: number[];
    try { clubIds = await getClubIds(page, event.id); } catch { console.log("  Failed clubs page"); continue; }
    if (firstPage) { const btn = page.locator('button:has-text("Accept All")').first(); if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) await btn.click(); firstPage = false; }
    console.log(`  Found ${clubIds.length} clubs`);
    if (clubIds.length === 0) continue;

    const allTeamIds = new Set<number>();
    for (const clubId of clubIds) {
      const ck = `club_${event.id}_${clubId}`;
      if (progress[ck]) continue;
      try {
        const teamIds = await getTeamIdsFromClub(page, event.id, clubId);
        teamIds.forEach((id) => allTeamIds.add(id));
        const games = await extractGames(page, event.id, event.name);
        allGames.push(...games); totalGames += games.length;
        progress[ck] = true;
      } catch {}
      await page.waitForTimeout(300);
    }
    console.log(`  Discovered ${allTeamIds.size} teams`);

    const teamList = [...allTeamIds];
    let eventGames = 0;
    for (let i = 0; i < teamList.length; i++) {
      const key = `${event.id}_${teamList[i]}`;
      if (progress[key]) continue;
      try {
        await page.goto(`https://system.gotsport.com/org_event/events/${event.id}/schedules?team=${teamList[i]}`, { waitUntil: "domcontentloaded", timeout: 15000 });
        await handleCaptcha(page);
        const games = await extractGames(page, event.id, event.name);
        allGames.push(...games); eventGames += games.length; totalGames += games.length;
        progress[key] = true;
        if ((i + 1) % 20 === 0) {
          console.log(`  [${i + 1}/${teamList.length}] ${eventGames} games`);
          fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
          fs.writeFileSync(gamesFile, JSON.stringify(allGames, null, 2));
        }
      } catch {}
      await page.waitForTimeout(400);
    }
    console.log(`  Event total: ${eventGames} games from ${teamList.length} teams`);
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
    fs.writeFileSync(gamesFile, JSON.stringify(allGames, null, 2));
  }

  const unique = new Map<string, GameRecord>();
  for (const g of allGames) unique.set(`${g.eventId}_${g.homeTeam}_${g.awayTeam}_${g.homeScore}_${g.awayScore}_${g.date}`, g);
  fs.writeFileSync(gamesFile, JSON.stringify(Array.from(unique.values()), null, 2));

  const csvH = "event_id,event_name,date,home_team,away_team,home_score,away_score,division";
  const csvR = Array.from(unique.values()).map((g) => [g.eventId, `"${g.eventName}"`, `"${g.date}"`, `"${g.homeTeam.replace(/"/g, '""')}"`, `"${g.awayTeam.replace(/"/g, '""')}"`, g.homeScore, g.awayScore, `"${g.division}"`].join(","));
  fs.writeFileSync(path.join(OUTPUT_DIR, "games.csv"), [csvH, ...csvR].join("\n"));

  console.log(`\n=== FINAL ===\nTotal games (raw): ${allGames.length}\nUnique: ${unique.size}\nSaved to: ${OUTPUT_DIR}/`);
  await context.close();
}

main().catch(console.error);
