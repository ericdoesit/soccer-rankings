/**
 * GotSport Data Scraper
 *
 * Systematically scrapes team ranking data from GotSport's public API.
 *
 * Strategy:
 * 1. Collect team_ids from existing CSV data + leaderboard API
 * 2. For each team_id, fetch full ranking data + event history
 * 3. Save all data to JSON files for import into our database
 *
 * The API endpoint: system.gotsport.com/api/v1/team_ranking_data?team_id={id}
 * Returns: team ranking data (W-L-D, goals, points, rank) + event list
 *
 * Usage: npx tsx scripts/scrape-gotsport.ts [--age 14] [--limit 100]
 */

import * as fs from "fs";
import * as path from "path";

const API_BASE = "https://system.gotsport.com/api/v1";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "x-rankings-client": "rankings-web",
  Referer: "https://rankings.gotsport.com/",
  Accept: "application/json",
};

const OUTPUT_DIR = path.join(process.cwd(), "data", "gotsport");
const DELAY_MS = 300; // polite rate limiting

interface TeamData {
  team_ranking_data: {
    id: number;
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
    team_id: number;
    total_goals: number;
    total_goals_against: number;
    goal_ratio: string;
    ranking_date: string;
    logo_url: string;
  };
  events: Array<{
    id: number;
    name: string;
    city: string;
    state: string;
    start_date_formatted: { dashed: string };
    end_date_formatted: { dashed: string };
  }>;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTeamData(
  teamId: number
): Promise<TeamData | null> {
  try {
    const response = await fetch(
      `${API_BASE}/team_ranking_data?team_id=${teamId}`,
      { headers: HEADERS }
    );
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.team_ranking_data?.team_name) return null;
    return data as TeamData;
  } catch {
    return null;
  }
}

async function fetchLeaderboard(): Promise<number[]> {
  const response = await fetch(`${API_BASE}/team_ranking_data`, {
    headers: HEADERS,
  });
  const data = await response.json();
  return (data as Array<{ team_id: number }>).map((t) => t.team_id);
}

function loadExistingTeamIds(): number[] {
  const csvPath =
    "/Users/Eric/Documents/Claude/soccer/data/gotsport_cas_u10_boys.csv";
  if (!fs.existsSync(csvPath)) return [];

  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.trim().split("\n");
  const headers = lines[0].split(",");
  const teamIdIdx = headers.indexOf("team_id");
  if (teamIdIdx === -1) return [];

  return lines
    .slice(1)
    .map((line) => parseInt(line.split(",")[teamIdIdx]))
    .filter((id) => !isNaN(id) && id > 0);
}

function loadSoCalTeamIds(): number[] {
  const csvPath =
    "/Users/Eric/Documents/Claude/soccer/data/socal_league_teams.csv";
  if (!fs.existsSync(csvPath)) return [];

  const content = fs.readFileSync(csvPath, "utf-8");
  const ids: number[] = [];
  for (const line of content.split("\n").slice(1)) {
    const match = line.match(/team=(\d+)/);
    if (match) ids.push(parseInt(match[1]));
  }
  return ids;
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : Infinity;

  // Ensure output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Collect all known team IDs
  console.log("Collecting team IDs...");

  const leaderboardIds = await fetchLeaderboard();
  console.log(`  Leaderboard: ${leaderboardIds.length} teams`);

  const existingIds = loadExistingTeamIds();
  console.log(`  Existing CSV: ${existingIds.length} teams`);

  const socalIds = loadSoCalTeamIds();
  console.log(`  SoCal leagues: ${socalIds.length} teams`);

  // Deduplicate
  const allIds = [...new Set([...leaderboardIds, ...existingIds, ...socalIds])];
  console.log(`  Total unique IDs: ${allIds.length}`);

  const toScrape = allIds.slice(0, Math.min(allIds.length, limit));
  console.log(`  Will scrape: ${toScrape.length} teams\n`);

  // Check for existing progress
  const progressFile = path.join(OUTPUT_DIR, "progress.json");
  let scraped: Record<string, boolean> = {};
  if (fs.existsSync(progressFile)) {
    scraped = JSON.parse(fs.readFileSync(progressFile, "utf-8"));
    console.log(`  Resuming: ${Object.keys(scraped).length} already scraped\n`);
  }

  // Scrape each team
  const results: TeamData[] = [];
  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < toScrape.length; i++) {
    const teamId = toScrape[i];

    if (scraped[String(teamId)]) {
      skipped++;
      continue;
    }

    const data = await fetchTeamData(teamId);

    if (data) {
      results.push(data);
      scraped[String(teamId)] = true;
      success++;

      if (success % 50 === 0) {
        console.log(
          `  [${i + 1}/${toScrape.length}] ${success} scraped, ${failed} failed, ${skipped} skipped`
        );
        // Save progress periodically
        fs.writeFileSync(progressFile, JSON.stringify(scraped));
      }
    } else {
      failed++;
    }

    // Rate limit
    await sleep(DELAY_MS);
  }

  // Save final progress
  fs.writeFileSync(progressFile, JSON.stringify(scraped));

  // Save all team data
  const outputFile = path.join(OUTPUT_DIR, "teams.json");

  // Load existing data and merge
  let existingData: TeamData[] = [];
  if (fs.existsSync(outputFile)) {
    existingData = JSON.parse(fs.readFileSync(outputFile, "utf-8"));
  }

  const merged = new Map<number, TeamData>();
  for (const t of existingData) {
    merged.set(t.team_ranking_data.team_id, t);
  }
  for (const t of results) {
    merged.set(t.team_ranking_data.team_id, t);
  }

  const allTeams = Array.from(merged.values());
  fs.writeFileSync(outputFile, JSON.stringify(allTeams, null, 2));

  // Generate summary CSV
  const csvHeaders = [
    "team_id",
    "national_rank",
    "team_name",
    "club_name",
    "age",
    "gender",
    "association",
    "region",
    "total_points",
    "wins",
    "losses",
    "draws",
    "matches",
    "goals_for",
    "goals_against",
    "events_count",
    "ranking_date",
  ];

  const csvRows = allTeams.map((t) => {
    const r = t.team_ranking_data;
    return [
      r.team_id,
      r.national_rank,
      `"${(r.team_name || "").replace(/"/g, '""')}"`,
      `"${(r.club_name || "").replace(/"/g, '""')}"`,
      r.age,
      r.gender,
      r.team_association,
      r.team_region,
      r.total_points,
      r.total_wins,
      r.total_losses,
      r.total_draws,
      r.total_matches,
      r.total_goals,
      r.total_goals_against,
      t.events.length,
      r.ranking_date,
    ].join(",");
  });

  const csvFile = path.join(OUTPUT_DIR, "teams.csv");
  fs.writeFileSync(csvFile, [csvHeaders.join(","), ...csvRows].join("\n"));

  // Print summary
  console.log(`\n=== Scraping Complete ===`);
  console.log(`  Success: ${success}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Total in database: ${allTeams.length}`);
  console.log(`  Saved to: ${outputFile}`);
  console.log(`  CSV: ${csvFile}`);

  // Stats
  const stats: Record<string, number> = {};
  const states: Record<string, number> = {};
  for (const t of allTeams) {
    const r = t.team_ranking_data;
    const key = `U${r.age} ${r.gender === "m" ? "Boys" : "Girls"}`;
    stats[key] = (stats[key] || 0) + 1;
    states[r.team_association] = (states[r.team_association] || 0) + 1;
  }

  console.log("\nBy age/gender:");
  Object.entries(stats)
    .sort()
    .forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  console.log("\nTop states:");
  Object.entries(states)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([k, v]) => console.log(`  ${k}: ${v}`));
}

main().catch(console.error);
