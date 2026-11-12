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

fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(data));
fs.writeFileSync(DROPPED_EVENTS_FILE, JSON.stringify(lastDroppedEvents, null, 1));
const mb = (fs.statSync(SNAPSHOT_FILE).size / 1e6).toFixed(1);

console.log(`Wrote ${SNAPSHOT_FILE} (${mb} MB) in ${((Date.now() - start) / 1000).toFixed(1)}s`);
console.log(`  teams:    ${data.teams.length}`);
console.log(`  games:    ${data.games.length} (${undated} without a usable date)`);
console.log(`  rankings: ${data.rankings.length}`);
