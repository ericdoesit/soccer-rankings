/**
 * Correlator: are the ratings fair to each group of teams?
 *
 * Idea from the "RPI for Division I Women's Soccer" site (Chris Thomas): for each
 * group (a state, a league type, …) take only its games against teams OUTSIDE the
 * group, and compare actual results with what the ratings predicted.
 *   performance % = actual points / expected points   (win 1, draw ½)
 *     100% = fairly rated · above = underrated · below = overrated
 *   goal residual = actual goal margin − predicted margin (rating difference), per game
 * Expected points come from a table of win/draw/loss rates by rating gap, built from
 * all games in the window. Ratings are in-sample, so small biases are understated:
 * a group showing a clear gap is a real signal.
 *
 * Usage: npx tsx scripts/correlator.ts            (last 15 months)
 *        npx tsx scripts/correlator.ts --min 40   (min inter-group games to report)
 */
import { getDataSet } from "../src/lib/data";

const ds = getDataSet();
const score = new Map(ds.rankings.map((r) => [r.teamId, r.score]));
const team = new Map(ds.teams.map((t) => [t.id, t]));
const since = new Date(Date.now() - 455 * 864e5).toISOString().slice(0, 10);
const minArg = process.argv.indexOf("--min");
const MIN = minArg > 0 ? Number(process.argv[minArg + 1]) : 30;

const games = ds.games.filter((g) => g.date && g.date >= since && score.has(g.team1Id) && score.has(g.team2Id));

// Result probability by rating gap (bands of 0.5 rating points, gap from team1's side)
const band = (d: number) => Math.max(-12, Math.min(12, Math.round(d * 2)));
const table = new Map<number, { w: number; d: number; l: number }>();
// counted from both sides, so the table is symmetric (some sources list the winner
// or home team first, which would skew a team1-only table)
for (const g of games) {
  for (const [me, them, mine, theirs] of [[g.team1Id, g.team2Id, g.team1Score, g.team2Score], [g.team2Id, g.team1Id, g.team2Score, g.team1Score]]) {
    const b = band(score.get(me)! - score.get(them)!);
    const x = table.get(b) ?? { w: 0, d: 0, l: 0 };
    if (mine > theirs) x.w++; else if (mine === theirs) x.d++; else x.l++;
    table.set(b, x);
  }
}
const expected = (diff: number) => {
  const x = table.get(band(diff))!;
  const n = x.w + x.d + x.l;
  return (x.w + 0.5 * x.d) / n;
};

interface Acc { games: number; actual: number; expected: number; residual: number }
function correlate(groupOf: (id: number) => string | null): Map<string, Acc> {
  const out = new Map<string, Acc>();
  for (const g of games) {
    const a = groupOf(g.team1Id), b = groupOf(g.team2Id);
    if (a === b) continue; // only games between groups
    for (const [me, them, mine, theirs, grp] of [
      [g.team1Id, g.team2Id, g.team1Score, g.team2Score, a],
      [g.team2Id, g.team1Id, g.team2Score, g.team1Score, b],
    ] as const) {
      if (!grp) continue;
      const diff = score.get(me)! - score.get(them)!;
      const x = out.get(grp) ?? { games: 0, actual: 0, expected: 0, residual: 0 };
      x.games++;
      x.actual += mine > theirs ? 1 : mine === theirs ? 0.5 : 0;
      x.expected += expected(diff);
      x.residual += (mine - theirs) - diff;
      out.set(grp, x);
    }
  }
  return out;
}

function report(title: string, m: Map<string, Acc>) {
  console.log(`\n${title}`);
  console.log("  group                              games   perf%   goals/game   verdict");
  for (const [k, x] of [...m].filter(([, x]) => x.games >= MIN).sort((p, q) => q[1].games - p[1].games)) {
    const perf = (100 * x.actual) / x.expected;
    const res = x.residual / x.games;
    const verdict = perf > 110 ? "UNDERRATED" : perf < 90 ? "OVERRATED" : "ok";
    console.log(`  ${k.padEnd(34)} ${String(x.games).padStart(6)}  ${perf.toFixed(1).padStart(6)}   ${(res >= 0 ? "+" : "") + res.toFixed(2).padStart(5)}      ${verdict}`);
  }
}

console.log(`${games.length} rated games since ${since}; higher-rated team: ` +
  (() => { let w = 0, d = 0, n = 0; for (const g of games) { const s = score.get(g.team1Id)! - score.get(g.team2Id)!; if (s === 0) continue; n++; const hi = s > 0 ? g.team1Score - g.team2Score : g.team2Score - g.team1Score; if (hi > 0) w++; else if (hi === 0) d++; } return `won ${(100 * w / n).toFixed(1)}%, drew ${(100 * d / n).toFixed(1)}%, lost ${(100 * (n - w - d) / n).toFixed(1)}%`; })());

const west = (id: number) => team.get(id)?.region === "Region4";
report("By state (West teams vs everyone else)", correlate((id) => (west(id) ? team.get(id)!.state : "outside / unknown")));
report("Ranked vs not (West teams)", correlate((id) => (!west(id) ? null : team.get(id)!.rankable ? "listed in rankings" : "not listed")));
report("Tracked-competition teams vs directory-only (West)", correlate((id) => (!west(id) ? null : team.get(id)!.tracked ? "plays tracked competitions" : "state/district leagues only")));
report("By state, listed teams only (vs other listed teams)", correlate((id) => (west(id) && team.get(id)!.rankable ? team.get(id)!.state : null)));
