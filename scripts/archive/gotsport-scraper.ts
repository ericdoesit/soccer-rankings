/**
 * GotSport Rankings Scraper
 *
 * Scrapes team ranking data from GotSport's public API and rankings page.
 *
 * Data sources:
 * 1. Public API: system.gotsport.com/api/v1/team_ranking_data
 *    - Returns top teams per age/gender combo
 *    - Includes: team_id, club, name, points, W-L-D, goals, association, rank
 *
 * 2. Playwright browser: rankings.gotsport.com
 *    - Navigate and interact to load full rankings per age group
 *    - Extract team data from the rendered page
 *
 * Usage: npx tsx scripts/gotsport-scraper.ts
 */

import { chromium, type Page } from "playwright";
import * as fs from "fs";
import * as path from "path";

interface GotSportTeam {
  id: number;
  team_id: number;
  age: number;
  gender: string;
  club_name: string;
  team_name: string;
  total_points: number;
  total_wins: number;
  total_losses: number;
  total_draws: number;
  total_matches: number;
  bonus_points: number;
  team_country: string;
  national_rank: number;
  global_rank: number;
  team_association: string;
  association_rank: number;
  team_region: number;
  regional_rank: number;
  win_percent: string;
  logo_url: string;
  total_goals: number;
  total_goals_against: number;
  goal_ratio: string;
  ranking_date: string;
}

const API_BASE = "https://system.gotsport.com/api/v1";
const RANKINGS_URL = "https://rankings.gotsport.com/";
const OUTPUT_DIR = path.join(process.cwd(), "data");

async function fetchAPIRankings(): Promise<GotSportTeam[]> {
  console.log("Fetching rankings from public API...");

  const response = await fetch(`${API_BASE}/team_ranking_data`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      "x-rankings-client": "rankings-web",
      Referer: RANKINGS_URL,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`API returned ${response.status}`);
  }

  const data: GotSportTeam[] = await response.json();
  console.log(`  Got ${data.length} teams from API`);
  return data;
}

async function scrapeFullRankings(
  ageGroup: number,
  gender: "m" | "f"
): Promise<GotSportTeam[]> {
  console.log(
    `\nScraping full rankings for U${ageGroup} ${gender === "m" ? "Boys" : "Girls"}...`
  );

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  });

  const allTeams: GotSportTeam[] = [];

  // Intercept API responses
  context.on("response", async (response) => {
    const url = response.url();
    if (url.includes("team_ranking_data") && !url.includes("team_details")) {
      try {
        const data = await response.json();
        if (Array.isArray(data)) {
          for (const team of data) {
            if (team.age === ageGroup && team.gender === gender) {
              allTeams.push(team);
            }
          }
        }
      } catch {}
    }
  });

  const page = await context.newPage();

  try {
    await page.goto(RANKINGS_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(8000);

    // Open search panel
    const searchBtn = page.locator('button:has-text("Team Rankings Search")');
    await searchBtn.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Try to adjust age sliders to the target age group
    // and select the gender
    const genderBtn = page.locator(
      `button:has-text("${gender === "m" ? "Boys" : "Girls"}")`
    );
    await genderBtn.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // Scroll down to load more teams
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1000);
    }

    console.log(
      `  Captured ${allTeams.length} teams for U${ageGroup} ${gender}`
    );
  } catch (error) {
    console.error(`  Error scraping:`, error);
  }

  await browser.close();
  return allTeams;
}

async function importExistingData(): Promise<GotSportTeam[]> {
  const csvPath = "/Users/Eric/Documents/Claude/soccer/data/gotsport_cas_u10_boys.csv";

  if (!fs.existsSync(csvPath)) {
    console.log("No existing GotSport data found");
    return [];
  }

  console.log(`\nImporting existing data from ${csvPath}...`);
  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.trim().split("\n");
  const headers = lines[0].split(",");

  const teams: GotSportTeam[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || "";
    });

    teams.push({
      id: parseInt(row.team_id) || i,
      team_id: parseInt(row.team_id) || i,
      age: parseInt(row.age) || 0,
      gender: row.gender || "m",
      club_name: row.club_name || "",
      team_name: row.team_name || "",
      total_points: parseInt(row.total_points) || 0,
      total_wins: parseInt(row.total_wins) || 0,
      total_losses: parseInt(row.total_losses) || 0,
      total_draws: parseInt(row.total_draws) || 0,
      total_matches: parseInt(row.total_matches) || 0,
      bonus_points: 0,
      team_country: "USA",
      national_rank: parseInt(row.national_rank) || 0,
      global_rank: parseInt(row.national_rank) || 0,
      team_association: row.team_association || "",
      association_rank: parseInt(row.association_rank) || 0,
      team_region: parseInt(row.team_region) || 0,
      regional_rank: parseInt(row.regional_rank) || 0,
      win_percent: row.win_percent || "0",
      logo_url: "",
      total_goals: 0,
      total_goals_against: 0,
      goal_ratio: "0",
      ranking_date: row.ranking_date || new Date().toISOString().split("T")[0],
    });
  }

  console.log(`  Imported ${teams.length} teams from existing CSV`);
  return teams;
}

async function main() {
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 1. Fetch from public API
  const apiTeams = await fetchAPIRankings();

  // 2. Import existing data
  const existingTeams = await importExistingData();

  // 3. Combine all data
  const allTeams = [...apiTeams, ...existingTeams];

  // Deduplicate by team_id
  const teamMap = new Map<number, GotSportTeam>();
  for (const team of allTeams) {
    const existing = teamMap.get(team.team_id);
    if (
      !existing ||
      new Date(team.ranking_date) > new Date(existing.ranking_date)
    ) {
      teamMap.set(team.team_id, team);
    }
  }

  const uniqueTeams = Array.from(teamMap.values());
  console.log(`\n=== Summary ===`);
  console.log(`Total unique teams: ${uniqueTeams.length}`);

  // Stats by age/gender
  const stats: Record<string, number> = {};
  for (const t of uniqueTeams) {
    const key = `U${t.age} ${t.gender === "m" ? "Boys" : "Girls"}`;
    stats[key] = (stats[key] || 0) + 1;
  }
  console.log("By age/gender:");
  Object.entries(stats)
    .sort()
    .forEach(([k, v]) => console.log(`  ${k}: ${v} teams`));

  // Save to JSON
  const outputPath = path.join(OUTPUT_DIR, "gotsport_rankings.json");
  fs.writeFileSync(outputPath, JSON.stringify(uniqueTeams, null, 2));
  console.log(`\nSaved to ${outputPath}`);

  // Also save a CSV version
  const csvHeaders = [
    "team_id",
    "national_rank",
    "team_name",
    "club_name",
    "age",
    "gender",
    "team_association",
    "team_region",
    "total_points",
    "total_wins",
    "total_losses",
    "total_draws",
    "total_matches",
    "total_goals",
    "total_goals_against",
    "ranking_date",
  ];
  const csvRows = uniqueTeams.map((t) =>
    csvHeaders
      .map((h) => {
        const val = (t as unknown as Record<string, unknown>)[h];
        const str = String(val ?? "");
        return str.includes(",") ? `"${str}"` : str;
      })
      .join(",")
  );
  const csvContent = [csvHeaders.join(","), ...csvRows].join("\n");
  const csvPath = path.join(OUTPUT_DIR, "gotsport_rankings.csv");
  fs.writeFileSync(csvPath, csvContent);
  console.log(`Saved to ${csvPath}`);
}

main().catch(console.error);
