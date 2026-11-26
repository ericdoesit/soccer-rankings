/**
 * Precompute what the request-time pages and data routes need, so a cold server instance reads a
 * few small files instead of parsing the ~110 MB snapshot (src/lib/precomputed.ts):
 *   socal.json            Southern California teams + club pages        (/socal)
 *   league/<slug>.json    each league / cup page                         (/league/[slug])
 *   state/<slug>.json     each state page                                (/state/[area])
 *   rankings.json         listed teams, competitions, coverage           (/api/rankings)
 *   strength.json         league strength per age group + gender         (/api/rankings?strength=1)
 *   proven.json           proven rankings per age group + gender         (/api/proven)
 *   _stamp.json           size of the snapshot these were built from
 * Runs after build-snapshot (npm run build:data). Written to a temp folder, then swapped in.
 *
 *   npx tsx scripts/build-precomputed.ts
 */
process.env.PRECOMPUTE_BUILD = "1"; // always compute from the snapshot, never from older files

import fs from "fs";
import path from "path";
import { AREAS, getLeagueSlugs } from "../src/lib/explore";
import { computeLeaguePage, computeStatePage } from "../src/lib/page-data";
import { computeSoCal } from "../src/lib/socal";
import { computeRankingsPrecomputed, getLeagueStrength } from "../src/lib/data";
import { computeProven } from "../src/lib/proven";
import { PRECOMPUTED_DIR } from "../src/lib/precomputed";

const t0 = Date.now();
const tmp = `${PRECOMPUTED_DIR}.tmp`;
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(path.join(tmp, "league"), { recursive: true });
fs.mkdirSync(path.join(tmp, "state"), { recursive: true });
let bytes = 0;
const write = (name: string, value: unknown) => {
  const s = JSON.stringify(value);
  bytes += s.length;
  fs.writeFileSync(path.join(tmp, `${name}.json`), s);
};

write("socal", computeSoCal());

const leagueIndex: Record<string, true> = {};
for (const slug of getLeagueSlugs()) {
  const page = computeLeaguePage(slug);
  if (!page) continue;
  write(`league/${slug}`, page);
  leagueIndex[slug] = true;
}
write("league-index", leagueIndex);

for (const a of AREAS) { const page = computeStatePage(a.slug); if (page) write(`state/${a.slug}`, page); }

const rankings = computeRankingsPrecomputed();
write("rankings", rankings);

const groups = [...new Set(rankings.base.map((t) => `${t.ageGroup}|${t.gender}`))];
write("strength", Object.fromEntries(groups.map((k) => { const [a, g] = k.split("|"); return [k, getLeagueStrength(a, g)]; })));

const PROVEN_AGES = ["U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17", "U18", "U19", "U20"];
const proven: Record<string, ReturnType<typeof computeProven>> = {};
for (const a of PROVEN_AGES) for (const g of ["Boys", "Girls"]) proven[`${a}|${g}`] = computeProven(a, g);
write("proven", proven);

// last: the stamp that makes the set valid for this snapshot
write("_stamp", { snapshotSize: fs.statSync(path.join(process.cwd(), "data", "snapshot.json")).size, builtAt: new Date().toISOString() });
fs.rmSync(PRECOMPUTED_DIR, { recursive: true, force: true });
fs.renameSync(tmp, PRECOMPUTED_DIR);
console.log(`precomputed: ${Object.keys(leagueIndex).length} league pages, ${AREAS.length} state pages, socal, rankings (${rankings.base.length} teams), ` +
  `${groups.length} strength groups, ${Object.keys(proven).length} proven groups · ${(bytes / 1e6).toFixed(1)} MB · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
