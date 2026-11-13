/**
 * Coast Soccer League Scraper
 *
 * Scrapes game results from coastsoccer.us — plain HTML, no CAPTCHA, no JS rendering.
 * Much faster than GotSport scraping.
 *
 * URL pattern: coastsoccer.us/coastsoccer/schedule?BRACKET={code}&AGE={age}&YEAR={year}&SEX={B|G}&SEASON={fall|spring}
 *
 * Bracket codes: 0P=Premier, 1G=Gold, 1N=Champ North, 1S=Champ South,
 *   2N=Div1 North, 2S=Div1 South, 3E/3N/3S/3W=Div2, 4C/4N/4S/4W=Div3, etc.
 *
 * Usage: npx tsx scripts/scrape-coast-soccer.ts                 # current season (fall 2026)
 *        npx tsx scripts/scrape-coast-soccer.ts --season spring-2026 --season fall-2025
 *
 * coastsoccer.us robots.txt allows all crawlers. ~830 pages per season at 1 request/second
 * (~14 min), with an honest User-Agent. New games are merged into data/coast-soccer/games.json
 * (keyed by season + game number), so earlier seasons are kept.
 */

import * as fs from "fs";
import * as path from "path";

const BASE_URL = "https://coastsoccer.us/coastsoccer/schedule";
const OUTPUT_DIR = path.join(process.cwd(), "data", "coast-soccer");
const DELAY_MS = 1000;
const USER_AGENT = "soccer-rankings research (youth soccer ratings; low volume, 1 request/s)";

interface GameRecord {
  gameNumber: string;
  date: string;
  time: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  field: string;
  ageGroup: string;
  gender: string;
  bracket: string;
  season: string;
  year: number;
}

const BRACKETS = [
  "0P", "1G", "1N", "1S",
  "2N", "2S", "2E", "2W",
  "3E", "3N", "3S", "3T", "3V", "3W",
  "4C", "4D", "4E", "4F", "4N", "4Q", "4S", "4VN", "4VS", "4W", "4WL",
  "CC", "CH", "JE", "JR", "JS", "S",
  "RP",
];

const AGES = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
const GENDERS = ["B", "G"];
// --season fall-2026 (repeatable); default: the current season
const seasonArgs = process.argv.flatMap((a, i, all) => (a === "--season" && all[i + 1] ? [all[i + 1]] : []));
const SEASONS = (seasonArgs.length ? seasonArgs : ["fall-2026"]).map((s) => {
  const [season, year] = s.split("-");
  if (!/^(fall|spring)$/.test(season) || !/^\d{4}$/.test(year)) throw new Error(`bad --season ${s} (use fall-2026)`);
  return { year: Number(year), season };
});

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseSchedulePage(
  html: string,
  age: number,
  gender: string,
  bracket: string,
  season: string,
  year: number
): GameRecord[] {
  const games: GameRecord[] = [];

  // Coast Soccer HTML structure:
  // Date rows: 1 cell with "SEPTEMBER 6, 2025 Saturday"
  // Game rows: 5 cells: [time, gameNum, "teamName \n score", "teamName \n score", field]
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];

  let currentDate = "";

  for (const row of rows) {
    const cells = (row.match(/<td[^>]*>[\s\S]*?<\/td>/g) || []).map((c) =>
      c.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
    );

    // Date row (1 cell with month name)
    if (cells.length === 1) {
      const dateMatch = cells[0].match(
        /((?:JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+\d{1,2},\s+\d{4})/i
      );
      if (dateMatch) {
        currentDate = dateMatch[1];
      }
      continue;
    }

    // Game row (5 cells: time, gameNum, homeTeam+score, awayTeam+score, field)
    if (cells.length >= 4) {
      const time = cells[0].trim();
      const gameNum = cells[1].trim();

      // Extract team name and score from "TEAM NAME  3" format
      const homeMatch = cells[2].match(/^(.+?)\s+(\d+)\s*$/);
      const awayMatch = cells[3].match(/^(.+?)\s+(\d+)\s*$/);

      if (homeMatch && awayMatch && gameNum.match(/^\d{4,6}$/)) {
        games.push({
          gameNumber: gameNum,
          date: currentDate,
          time,
          homeTeam: homeMatch[1].trim(),
          awayTeam: awayMatch[1].trim(),
          homeScore: parseInt(homeMatch[2]),
          awayScore: parseInt(awayMatch[2]),
          field: cells[4]?.trim() || "",
          ageGroup: `U${age}`,
          gender: gender === "B" ? "Boys" : "Girls",
          bracket,
          season,
          year,
        });
      }
    }
  }

  return games;
}

async function fetchSchedule(
  bracket: string,
  age: number,
  sex: string,
  year: number,
  season: string
): Promise<string> {
  const url = `${BASE_URL}?BRACKET=${bracket}&AGE=${age.toString().padStart(2, "0")}&YEAR=${year}&SEX=${sex}&SEASON=${season}`;
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  return response.text();
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const allGames: GameRecord[] = [];
  let totalRequests = 0;
  let pagesWithGames = 0;

  console.log("Scraping Coast Soccer League...\n");

  for (const { year, season } of SEASONS) {
    console.log(`\n=== ${season.toUpperCase()} ${year} ===`);

    for (const sex of GENDERS) {
      for (const age of AGES) {
        for (const bracket of BRACKETS) {
          try {
            const html = await fetchSchedule(bracket, age, sex, year, season);
            totalRequests++;

            // Skip if no teams in this bracket
            if (html.includes("There are no") || html.length < 1000) continue;

            const games = parseSchedulePage(html, age, sex, bracket, season, year);

            if (games.length > 0) {
              allGames.push(...games);
              pagesWithGames++;
              console.log(
                `  ${sex === "B" ? "Boys" : "Girls"} U${age} ${bracket}: ${games.length} games`
              );
            }
          } catch {
            // skip failed requests
          }

          await sleep(DELAY_MS);
        }
      }
    }
  }

  // Merge with games already saved (other seasons kept; re-scraped games replaced), dedupe by game number
  const gamesFile = path.join(OUTPUT_DIR, "games.json");
  const unique = new Map<string, GameRecord>();
  if (fs.existsSync(gamesFile)) {
    for (const g of JSON.parse(fs.readFileSync(gamesFile, "utf8")) as GameRecord[]) unique.set(`${g.year}_${g.season}_${g.gameNumber}`, g);
  }
  for (const g of allGames) {
    unique.set(`${g.year}_${g.season}_${g.gameNumber}`, g);
  }

  // Save JSON
  fs.writeFileSync(gamesFile, JSON.stringify(Array.from(unique.values()), null, 2));

  // Save CSV
  const csvHeaders =
    "game_number,date,time,home_team,away_team,home_score,away_score,field,age_group,gender,bracket,season,year";
  const csvRows = Array.from(unique.values()).map((g) =>
    [
      g.gameNumber,
      `"${g.date}"`,
      `"${g.time}"`,
      `"${g.homeTeam.replace(/"/g, '""')}"`,
      `"${g.awayTeam.replace(/"/g, '""')}"`,
      g.homeScore,
      g.awayScore,
      `"${g.field.replace(/"/g, '""')}"`,
      g.ageGroup,
      g.gender,
      g.bracket,
      g.season,
      g.year,
    ].join(",")
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "games.csv"),
    [csvHeaders, ...csvRows].join("\n")
  );

  console.log(`\n=== FINAL ===`);
  console.log(`Total requests: ${totalRequests}`);
  console.log(`Pages with games: ${pagesWithGames}`);
  console.log(`Total games (raw): ${allGames.length}`);
  console.log(`Unique games: ${unique.size}`);
  console.log(`Saved to: ${OUTPUT_DIR}/`);
}

main().catch(console.error);
