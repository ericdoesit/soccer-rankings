/**
 * Simple load test: N concurrent virtual users hit a realistic mix of pages and
 * API calls for a fixed duration; reports throughput, latency percentiles and errors.
 *
 *   npx tsx scripts/load-test.ts [baseUrl=http://localhost:3000] [concurrency=20] [seconds=20]
 */
import * as fs from "fs";
import { SNAPSHOT_FILE } from "../src/lib/data";

const [base = "http://localhost:3000", conc = "20", secs = "20"] = process.argv.slice(2);
const CONCURRENCY = Number(conc);
const DURATION_MS = Number(secs) * 1000;

// Real ids from the snapshot so detail pages do real work
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const snap: any = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf-8"));
const teamIds: number[] = snap.rankings.slice(0, 2000).map((r: { teamId: number }) => r.teamId);
const clubs: string[] = [...new Set<string>(snap.teams.slice(0, 5000).map((t: { club: string }) => t.club).filter(Boolean))].slice(0, 500);
const gameIds: number[] = snap.games.slice(0, 5000).map((g: { id: number }) => g.id);
const events: string[] = [...new Set<string>(snap.games.map((g: { tournamentName: string }) => g.tournamentName).filter(Boolean))].slice(0, 200);
const ages = ["U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17", "U19"];
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

// weight, label, url factory
const MIX: Array<[number, string, () => string]> = [
  [20, "api rankings (filtered)", () => `/api/rankings?ageGroup=${pick(ages)}&gender=${pick(["Boys", "Girls"])}&limit=25`],
  [10, "api rankings (search)", () => `/api/rankings?search=${encodeURIComponent(pick(clubs).slice(0, 5))}&limit=25`],
  [5, "api rankings (page 20)", () => `/api/rankings?limit=50&offset=1000`],
  [5, "api power-rankings", () => `/api/power-rankings?ageGroup=${pick(ages)}&gender=${pick(["Boys", "Girls"])}`],
  [15, "page /", () => `/`],
  [10, "page /rankings", () => `/rankings`],
  [20, "page /team/[id]", () => `/team/${pick(teamIds)}`],
  [7, "page /club/[name]", () => `/club/${encodeURIComponent(pick(clubs))}`],
  [5, "page /match/[id]", () => `/match/${pick(gameIds)}`],
  [3, "page /tournament/[name]", () => `/tournament/${encodeURIComponent(pick(events))}`],
];
const totalW = MIX.reduce((a, m) => a + m[0], 0);
const choose = () => { let r = Math.random() * totalW; for (const m of MIX) { r -= m[0]; if (r <= 0) return m; } return MIX[0]; };

const stats = new Map<string, { lat: number[]; errors: number; codes: Record<number, number> }>();
const pct = (a: number[], p: number) => a.length ? a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))] : NaN;

async function user(deadline: number) {
  while (Date.now() < deadline) {
    const [, label, url] = choose();
    const s = stats.get(label) ?? { lat: [], errors: 0, codes: {} };
    stats.set(label, s);
    const t0 = performance.now();
    try {
      const res = await fetch(base + url(), { signal: AbortSignal.timeout(30_000) });
      await res.arrayBuffer();
      s.codes[res.status] = (s.codes[res.status] ?? 0) + 1;
      if (res.status >= 500) s.errors++;
    } catch {
      s.errors++;
      s.codes[0] = (s.codes[0] ?? 0) + 1;
    }
    s.lat.push(performance.now() - t0);
  }
}

(async () => {
  console.log(`Load test ${base}: ${CONCURRENCY} concurrent users for ${secs}s`);
  const t0 = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => user(t0 + DURATION_MS)));
  const elapsed = (Date.now() - t0) / 1000;
  let n = 0, err = 0;
  const all: number[] = [];
  console.log(`\n${"endpoint".padEnd(26)} ${"reqs".padStart(6)} ${"p50".padStart(7)} ${"p95".padStart(7)} ${"p99".padStart(7)} ${"max".padStart(7)}  errors  status codes`);
  for (const [label, s] of [...stats].sort()) {
    s.lat.sort((a, b) => a - b);
    n += s.lat.length; err += s.errors; all.push(...s.lat);
    console.log(`${label.padEnd(26)} ${String(s.lat.length).padStart(6)} ${pct(s.lat, 50).toFixed(0).padStart(5)}ms ${pct(s.lat, 95).toFixed(0).padStart(5)}ms ${pct(s.lat, 99).toFixed(0).padStart(5)}ms ${Math.max(...s.lat).toFixed(0).padStart(5)}ms  ${String(s.errors).padStart(6)}  ${JSON.stringify(s.codes)}`);
  }
  all.sort((a, b) => a - b);
  console.log(`\nTOTAL ${n} requests in ${elapsed.toFixed(1)}s = ${(n / elapsed).toFixed(1)} req/s · p50 ${pct(all, 50).toFixed(0)}ms · p95 ${pct(all, 95).toFixed(0)}ms · p99 ${pct(all, 99).toFixed(0)}ms · errors ${err} (${((100 * err) / n).toFixed(2)}%)`);
})();
