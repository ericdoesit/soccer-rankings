/**
 * Internal review (2026-11-16): does counting last season's games compress the MLS NEXT
 * Homegrown–Academy gap? Rates teams on games before CUTOFF, predicts CUTOFF..now, with
 * priorSeasonWeight 0.25 (current) vs 0 (this season only). Not used by the site.
 *   npx tsx scripts/backtest-mls-divisions.ts
 */
import { getDataSet, } from "../src/lib/data";
import { calculateRankings, leagueName } from "../src/lib/ranking/massey";

const CUTOFF = "2026-10-15";
const { teams, games } = getDataSet();
const teamAG = new Map(teams.map((t) => [t.id, `${t.gender}|${t.ageGroup}`]));
const done = games.filter((g) => g.status === "completed");
const train = done.filter((g) => g.date < CUTOFF);
const test = done.filter((g) => g.date >= CUTOFF);

// division of each team from this season's MLS NEXT league games (before the cutoff)
const div = new Map<number, string>();
const cnt = new Map<number, Record<string, number>>();
for (const g of train) {
  if (g.date < "2026-08-01") continue;
  const d = /^mls next\b.*\b(homegrown|flex)\b/i.test(g.tournamentName) ? "HD" : /^mls next\b.*academy division/i.test(g.tournamentName) ? "AD" : null;
  if (!d) continue;
  for (const id of [g.team1Id, g.team2Id]) { const c = cnt.get(id) ?? {}; c[d] = (c[d] ?? 0) + 1; cnt.set(id, c); }
}
for (const [id, c] of cnt) div.set(id, (c.HD ?? 0) >= (c.AD ?? 0) ? "HD" : "AD");

const cap = (x: number) => Math.max(-6, Math.min(6, x));
for (const [label, w] of [["last season at 0.25 (current)", 0.25], ["this season only", 0]] as const) {
  const r = new Map(calculateRankings(train, {
    minGames: 3, priorSeasonWeight: w,
    leagueOf: (id, t) => { const ln = leagueName(t); const ag = teamAG.get(id); return ln && ag ? `${ln}|${ag}` : null; },
  }).map((x) => [x.teamId, x.score]));
  const score = (filter: (a?: string, b?: string) => boolean) => {
    let n = 0, se = 0, bias = 0, right = 0;
    for (const g of test) {
      const a = r.get(g.team1Id), b = r.get(g.team2Id);
      if (a === undefined || b === undefined) continue;
      const da = div.get(g.team1Id), db = div.get(g.team2Id);
      if (!filter(da, db)) continue;
      // orient HD-vs-AD games from the HD side
      const flip = da === "AD" && db === "HD";
      const pred = flip ? b - a : a - b, act = cap(flip ? g.team2Score - g.team1Score : g.team1Score - g.team2Score);
      n++; se += (act - pred) ** 2; bias += act - pred;
      if (Math.sign(pred) === Math.sign(act) || (act === 0 && Math.abs(pred) < 0.5)) right++;
    }
    return `n=${n}  RMSE ${Math.sqrt(se / n).toFixed(3)}  bias ${(bias / n >= 0 ? "+" : "") + (bias / n).toFixed(2)}  right ${(100 * right / n).toFixed(1)}%`;
  };
  console.log(`\n${label}`);
  console.log("  HD vs AD games:   ", score((a, b) => (a === "HD" && b === "AD") || (a === "AD" && b === "HD")));
  console.log("  all MLS NEXT:     ", score((a, b) => !!a && !!b));
  console.log("  all games:        ", score(() => true));
}
