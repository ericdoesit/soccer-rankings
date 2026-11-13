/**
 * Precompute teams, games and Massey rankings from all raw scraped sources
 * into data/snapshot.json, which the app loads at runtime.
 *
 * Re-run after any scrape:  npm run build:data
 */
import * as fs from "fs";
import { buildData, SNAPSHOT_FILE, DROPPED_EVENTS_FILE, lastDroppedEvents } from "../src/lib/data";

const start = Date.now();
const data = buildData();

const undated = data.games.filter((g) => !/^\d{4}-\d{2}-\d{2}$/.test(g.date)).length;

// buildData() falls back to the 50-team sample when loading the real data throws. Never let that
// replace a real snapshot: the site would quietly serve sample data.
if (data.teams.length < 1000) {
  console.error(`Not writing ${SNAPSHOT_FILE}: only ${data.teams.length} teams (the build fell back to sample data; see the error above). The existing snapshot is unchanged.`);
  process.exit(1);
}

fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(data));
fs.writeFileSync(DROPPED_EVENTS_FILE, JSON.stringify(lastDroppedEvents, null, 1));
const mb = (fs.statSync(SNAPSHOT_FILE).size / 1e6).toFixed(1);

console.log(`Wrote ${SNAPSHOT_FILE} (${mb} MB) in ${((Date.now() - start) / 1000).toFixed(1)}s`);
console.log(`  teams:    ${data.teams.length}`);
console.log(`  games:    ${data.games.length} (${undated} without a usable date)`);
console.log(`  rankings: ${data.rankings.length}`);
