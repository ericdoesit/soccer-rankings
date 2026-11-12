/**
 * MLS NEXT Scraper via Modular11
 * Playwright scraper that sets date filters and parses server-rendered match HTML
 *
 * Usage:
 *   npx tsx scripts/scrape-mlsnext.ts                    # all age groups
 *   npx tsx scripts/scrape-mlsnext.ts --age U16          # specific age
 *   npx tsx scripts/scrape-mlsnext.ts --from 05/23/2026 --to 05/30/2026
 */

import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";

const OUTPUT_DIR = path.join(process.cwd(), "data", "mlsnext");
const BASE_URL = "https://www.modular11.com/schedule";

interface MLSNextGame {
  matchId: string;
  date: string;
  time: string;
  location: string;
  ageGroup: string;
  gender: string;
  competition: string;
  division: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  homePK: number | null;
  awayPK: number | null;
  bracketLevel: string;
  homeLogoUrl: string;
  awayLogoUrl: string;
}

const AGE_GROUPS: Record<string, string> = {
  U13: "21",
  U14: "22",
  U15: "33",
  U16: "14",
  U17: "15",
  U19: "26",
};

function parseScore(scoreText: string): { home: number; away: number; homePK: number | null; awayPK: number | null } {
  const cleaned = scoreText.replace(/ /g, " ").replace(/&nbsp;/g, " ").trim();
  const pkMatch = cleaned.match(/\((\d+)\s*:\s*(\d+)\)/);
  const mainMatch = cleaned.match(/^(\d+)\s*:\s*(\d+)/);

  return {
    home: mainMatch ? parseInt(mainMatch[1]) : 0,
    away: mainMatch ? parseInt(mainMatch[2]) : 0,
    homePK: pkMatch ? parseInt(pkMatch[1]) : null,
    awayPK: pkMatch ? parseInt(pkMatch[2]) : null,
  };
}

async function scrapeAgeGroup(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>,
  yearId: string,
  ageLabel: string,
  dateFrom: string,
  dateTo: string
): Promise<MLSNextGame[]> {
  console.log(`\n=== ${ageLabel} (year=${yearId}) ===`);

  await page.goto(`${BASE_URL}?year=${yearId}`, {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  await page.waitForTimeout(2000);

  // Set date range via the daterangepicker
  const dateInput = await page.$('input[name="datefilter"]');
  if (dateInput) {
    await dateInput.click();
    await page.waitForTimeout(500);

    // Use JavaScript to set the daterangepicker value and trigger callback
    await page.evaluate(
      ({ from, to }) => {
        const $ = (window as any).jQuery;
        if ($) {
          const input = $('input[name="datefilter"]');
          const dr = input.data("daterangepicker");
          if (dr) {
            dr.setStartDate(from);
            dr.setEndDate(to);
            input.val(from + " - " + to);
            dr.clickApply();
          } else {
            input.val(from + " - " + to).trigger("change");
          }
        }
      },
      { from: dateFrom, to: dateTo }
    );

    await page.waitForTimeout(5000);
  }

  // Parse match rows from the DOM
  const games = await page.evaluate((age) => {
    const results: Array<{
      matchId: string;
      dateTime: string;
      location: string;
      ageGroup: string;
      gender: string;
      competition: string;
      division: string;
      homeTeam: string;
      awayTeam: string;
      scoreText: string;
      bracketLevel: string;
      homeLogoUrl: string;
      awayLogoUrl: string;
    }> = [];

    const rows = document.querySelectorAll(".container-row");
    for (const row of rows) {
      const desktop = row.querySelector(".hidden-xs.hidden-sm");
      if (!desktop) continue;

      const cols = desktop.querySelectorAll(".col-sm-1, .col-sm-2, .col-sm-5");

      // Match ID from first col
      const matchId = (row.getAttribute("id") || "").trim();

      // Date/time and location from second col
      const detailCol = desktop.querySelector(".col-sm-1.pad-0");
      const dateTime = detailCol?.childNodes[0]?.textContent?.trim()
        ?.replace(/<!--.*?-->/g, "").trim() || "";
      const locationEl = detailCol?.querySelector("p[data-title]");
      const location = locationEl?.getAttribute("data-title") || "";

      // Age from third col
      const ageCol = desktop.querySelector(".adaptive-age-events");
      const ageGroup = ageCol?.textContent?.trim() || age;

      // Competition + Division
      const compCol = desktop.querySelectorAll(".col-sm-2")[0];
      const compText = compCol?.textContent?.trim() || "";
      const compParts = compText.split(/\n/).map((s: string) => s.trim()).filter(Boolean);
      const competition = compParts[0] || "";
      const division = compParts[1] || "";

      // Gender from first col
      const firstCol = desktop.querySelector(".col-sm-1.pad-left");
      const gender = firstCol?.textContent?.includes("FEMALE") ? "Girls" : "Boys";

      // Teams
      const homeEl = desktop.querySelector(".container-first-team p[data-title]");
      const awayEl = desktop.querySelector(".container-second-team p[data-title]");
      const homeTeam = homeEl?.getAttribute("data-title") || homeEl?.textContent?.trim() || "";
      const awayTeam = awayEl?.getAttribute("data-title") || awayEl?.textContent?.trim() || "";

      // Score
      const scoreEl = desktop.querySelector(".score-match-table");
      const scoreText = scoreEl?.textContent?.trim() || "";

      // Bracket level (last col)
      const lastCol = desktop.querySelector(".col-sm-2.dspl-f, .col-sm-2:last-child");
      const bracketLevel = lastCol?.textContent?.trim() || "";

      // Logos
      const logos = desktop.querySelectorAll(".club-photo");
      const homeLogoStyle = logos[0]?.getAttribute("style") || "";
      const awayLogoStyle = logos[1]?.getAttribute("style") || "";
      const extractUrl = (style: string) => {
        const m = style.match(/url\('([^']+)'\)/);
        return m ? m[1] : "";
      };

      if (homeTeam && awayTeam) {
        results.push({
          matchId,
          dateTime,
          location,
          ageGroup,
          gender,
          competition,
          division,
          homeTeam,
          awayTeam,
          scoreText,
          bracketLevel,
          homeLogoUrl: extractUrl(homeLogoStyle),
          awayLogoUrl: extractUrl(awayLogoStyle),
        });
      }
    }

    return results;
  }, ageLabel);

  console.log(`  Found ${games.length} matches`);

  return games.map((g) => {
    const score = parseScore(g.scoreText);
    // Parse date from "05/23/26 12:30pm" format
    const dateMatch = g.dateTime.match(/(\d{2}\/\d{2}\/\d{2})\s*([\d:]+\w+)?/);
    let dateStr = "";
    let timeStr = "";
    if (dateMatch) {
      const [m, d, y] = dateMatch[1].split("/");
      dateStr = `20${y}-${m}-${d}`;
      timeStr = dateMatch[2] || "";
    }

    return {
      matchId: g.matchId,
      date: dateStr,
      time: timeStr,
      location: g.location,
      ageGroup: g.ageGroup,
      gender: g.gender,
      competition: g.competition,
      division: g.division,
      homeTeam: g.homeTeam,
      awayTeam: g.awayTeam,
      homeScore: score.home,
      awayScore: score.away,
      homePK: score.homePK,
      awayPK: score.awayPK,
      bracketLevel: g.bracketLevel,
      homeLogoUrl: g.homeLogoUrl,
      awayLogoUrl: g.awayLogoUrl,
    };
  });
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const args = process.argv.slice(2);
  const ageIdx = args.indexOf("--age");
  const fromIdx = args.indexOf("--from");
  const toIdx = args.indexOf("--to");

  const targetAge = ageIdx >= 0 ? args[ageIdx + 1] : null;
  const dateFrom = fromIdx >= 0 ? args[fromIdx + 1] : "05/23/2026";
  const dateTo = toIdx >= 0 ? args[toIdx + 1] : "05/30/2026";

  const ageGroups = targetAge
    ? { [targetAge]: AGE_GROUPS[targetAge] }
    : AGE_GROUPS;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const allGames: MLSNextGame[] = [];

  for (const [label, yearId] of Object.entries(ageGroups)) {
    const games = await scrapeAgeGroup(page, yearId, label, dateFrom, dateTo);
    allGames.push(...games);

    for (const g of games.slice(0, 3)) {
      console.log(`  ${g.date} ${g.homeTeam} ${g.homeScore}-${g.awayScore} ${g.awayTeam} [${g.bracketLevel}]`);
    }
    if (games.length > 3) console.log(`  ... +${games.length - 3} more`);
  }

  // Save
  const gamesFile = path.join(OUTPUT_DIR, "games.json");
  const existing: MLSNextGame[] = fs.existsSync(gamesFile)
    ? JSON.parse(fs.readFileSync(gamesFile, "utf-8"))
    : [];

  // Deduplicate by matchId
  const byId = new Map<string, MLSNextGame>();
  for (const g of [...existing, ...allGames]) {
    byId.set(g.matchId, g);
  }

  fs.writeFileSync(gamesFile, JSON.stringify(Array.from(byId.values()), null, 2));

  await browser.close();

  console.log(`\n=== DONE ===`);
  console.log(`New: ${allGames.length}, Total: ${byId.size}`);
  console.log(`Saved to: ${gamesFile}`);
}

main().catch(console.error);
