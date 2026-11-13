/**
 * How much should last season count? Backtest of the rating's season-boundary weight.
 *
 * For each test season: rate teams on games before Oct 1, then predict Oct 1 – Nov 12 (the
 * next six weeks). Rosters turn over each Aug 1, so games before it get an extra weight
 * (`priorSeasonWeight`) on top of the normal recency decay:
 *   1    = today's behaviour (decay only)
 *   0.5  = last season counts half
 *   0    = this season only
 *
 * Scored on games involving a West team where both teams have a rating, three ways:
 *   - log loss of the win/draw/loss chances (lower is better; the main number)
 *   - % of decisive games where the higher-rated team won
 *   - mean error of the predicted goal margin (capped at 6, as in the ratings)
 * "Fair" set: both teams already played 3+ games this season before Oct 1, so every
 * variant can rate them. "All" adds teams rated only from last season (the
 * this-season-only variant can't predict those; its coverage is shown).
 *
 *   npx tsx scripts/backtest-season-weight.ts [--grid]
 */
import fs from "fs";
import path from "path";
import { calculateRankings, type GameInput } from "../src/lib/ranking/massey";
import { outcomeModel } from "../src/lib/predict";

type Snap = {
  teams: Array<{ id: number; region: string }>;
  games: Array<{ team1Id: number; team2Id: number; team1Score: number; team2Score: number; date: string }>;
};
const snap = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "snapshot.json"), "utf8")) as Snap;
const west = new Set(snap.teams.filter((t) => t.region === "Region4").map((t) => t.id));
const games = snap.games.filter((g) => /^\d{4}-\d{2}-\d{2}$/.test(g.date));

const VARIANTS: Array<{ label: string; w: number; halfLife?: number }> = process.argv.includes("--grid")
  ? [0.1, 0.2, 0.25, 0.35].flatMap((w) => [105, 80].map((h) => ({ label: `last season × ${w}, ${h}-day half-life`, w, halfLife: h })))
  : [
    { label: "decay only (today)", w: 1 },
    { label: "last season × 0.75", w: 0.75 },
    { label: "last season × 0.5", w: 0.5 },
    { label: "last season × 0.25", w: 0.25 },
    { label: "this season only", w: 0 },
    { label: "decay only, 60-day half-life", w: 1, halfLife: 60 },
  ];

for (const year of [2025, 2026]) {
  const seasonStart = `${year}-08-01`, cutoff = `${year}-10-01`, end = `${year}-11-13`;
  const train = games.filter((g) => g.date < cutoff && g.date >= `${year - 2}-08-01`);
  const test = games.filter((g) => g.date >= cutoff && g.date < end && (west.has(g.team1Id) || west.has(g.team2Id)));
  const seasonGames = new Map<number, number>();
  for (const g of train) if (g.date >= seasonStart) for (const id of [g.team1Id, g.team2Id]) seasonGames.set(id, (seasonGames.get(id) ?? 0) + 1);
  const fair = (g: (typeof test)[number]) => (seasonGames.get(g.team1Id) ?? 0) >= 3 && (seasonGames.get(g.team2Id) ?? 0) >= 3;

  console.log(`\n=== ${year}-${String(year + 1).slice(2)}: rate on games before ${cutoff}, predict ${cutoff} → ${end} (${test.length} West games, ${test.filter(fair).length} in the fair set)`);
  console.log("variant".padEnd(32) + "fair: logloss  right%  marginErr | all: logloss  right%  covered");
  for (const v of VARIANTS) {
    const input: GameInput[] = train.map((g) => ({ ...g, status: "completed" }));
    const ratings = new Map(calculateRankings(input, {
      minGames: 3, seasonStart, priorSeasonWeight: v.w, ...(v.halfLife ? { decayHalfLifeDays: v.halfLife } : {}),
    }).map((r) => [r.teamId, r.score]));
    // win/draw/loss chances by rating gap, learned from the training games themselves
    const model = outcomeModel(train, ratings, `${year - 1}-08-01`);
    const score = (set: typeof test) => {
      let n = 0, ll = 0, decisive = 0, right = 0, err = 0;
      for (const g of set) {
        const a = ratings.get(g.team1Id), b = ratings.get(g.team2Id);
        if (a === undefined || b === undefined) continue;
        const o = model(a, b);
        const p = g.team1Score > g.team2Score ? o.win : g.team1Score < g.team2Score ? o.loss : o.draw;
        ll += -Math.log(Math.max(p, 1e-4));
        const diff = Math.max(-6, Math.min(6, g.team1Score - g.team2Score));
        err += Math.abs(diff - Math.max(-6, Math.min(6, a - b)));
        if (diff !== 0 && a !== b) { decisive++; if (Math.sign(diff) === Math.sign(a - b)) right++; }
        n++;
      }
      return { n, ll: ll / (n || 1), right: (100 * right) / (decisive || 1), err: err / (n || 1) };
    };
    const f = score(test.filter(fair)), all = score(test);
    console.log(v.label.padEnd(32) +
      `      ${f.ll.toFixed(4)}  ${f.right.toFixed(1)}%  ${f.err.toFixed(3)}   |      ${all.ll.toFixed(4)}  ${all.right.toFixed(1)}%  ${((100 * all.n) / test.length).toFixed(0)}%`);
  }
}
