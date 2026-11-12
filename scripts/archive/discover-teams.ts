/**
 * Discovers GotSport team IDs by:
 * 1. Using the rankings page search with Playwright to find teams by state
 * 2. Scanning known event IDs for team participants
 * 3. Brute-force scanning team_id ranges to find valid teams in target states
 *
 * Usage: npx tsx scripts/discover-teams.ts --states CAS,CAN,AZ,NV
 */

import * as fs from "fs";
import * as path from "path";

const API_BASE = "https://system.gotsport.com/api/v1";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
  "x-rankings-client": "rankings-web",
  Referer: "https://rankings.gotsport.com/",
  Accept: "application/json",
};
const OUTPUT_DIR = path.join(process.cwd(), "data", "gotsport");
const DELAY_MS = 200;

interface TeamData {
  team_ranking_data: {
    team_id: number;
    team_name: string;
    club_name: string;
    team_association: string;
    age: number;
    gender: string;
    national_rank: number;
    total_matches: number;
  };
  events: Array<{ id: number; name: string }>;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchTeam(teamId: number): Promise<TeamData | null> {
  try {
    const res = await fetch(`${API_BASE}/team_ranking_data?team_id=${teamId}`, {
      headers: HEADERS,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.team_ranking_data?.team_name) return null;
    return data as TeamData;
  } catch {
    return null;
  }
}

async function scanRange(
  start: number,
  end: number,
  targetStates: Set<string>,
  batchSize = 10
): Promise<TeamData[]> {
  const found: TeamData[] = [];
  let checked = 0;
  const total = end - start;

  for (let id = start; id <= end; id += batchSize) {
    const batch = Array.from(
      { length: Math.min(batchSize, end - id + 1) },
      (_, i) => id + i
    );

    const results = await Promise.all(batch.map(fetchTeam));

    for (const data of results) {
      if (data) {
        const assoc = data.team_ranking_data.team_association;
        if (targetStates.size === 0 || targetStates.has(assoc)) {
          found.push(data);
        }
      }
    }

    checked += batch.length;
    if (checked % 100 === 0) {
      const pct = ((checked / total) * 100).toFixed(1);
      console.log(
        `  Scanned ${checked}/${total} (${pct}%) — found ${found.length} teams in target states`
      );
    }

    await sleep(DELAY_MS);
  }

  return found;
}

async function main() {
  const args = process.argv.slice(2);
  const statesIdx = args.indexOf("--states");
  const targetStates = new Set(
    statesIdx >= 0 ? args[statesIdx + 1].split(",") : []
  );

  const rangeStartIdx = args.indexOf("--start");
  const rangeEndIdx = args.indexOf("--end");
  const rangeStart = rangeStartIdx >= 0 ? parseInt(args[rangeStartIdx + 1]) : 1;
  const rangeEnd = rangeEndIdx >= 0 ? parseInt(args[rangeEndIdx + 1]) : 800000;

  console.log(
    `Discovering teams for states: ${targetStates.size > 0 ? [...targetStates].join(", ") : "ALL"}`
  );
  console.log(`Scanning team_id range: ${rangeStart} - ${rangeEnd}`);
  console.log(`Batch size: 10 concurrent requests, ${DELAY_MS}ms delay\n`);

  const teams = await scanRange(rangeStart, rangeEnd, targetStates);

  // Save results
  const outFile = path.join(OUTPUT_DIR, "discovered_teams.json");

  // Merge with existing
  let existing: TeamData[] = [];
  if (fs.existsSync(outFile)) {
    existing = JSON.parse(fs.readFileSync(outFile, "utf-8"));
  }

  const merged = new Map<number, TeamData>();
  for (const t of existing) merged.set(t.team_ranking_data.team_id, t);
  for (const t of teams) merged.set(t.team_ranking_data.team_id, t);

  const all = Array.from(merged.values());
  fs.writeFileSync(outFile, JSON.stringify(all, null, 2));

  // Print summary
  const byState: Record<string, number> = {};
  for (const t of all) {
    const s = t.team_ranking_data.team_association;
    byState[s] = (byState[s] || 0) + 1;
  }

  console.log(`\n=== Results ===`);
  console.log(`New teams found: ${teams.length}`);
  console.log(`Total in database: ${all.length}`);
  console.log(`\nBy state:`);
  for (const [s, c] of Object.entries(byState).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${s}: ${c}`);
  }
}

main().catch(console.error);
