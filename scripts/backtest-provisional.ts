/**
 * How much is a rating built from few games worth? Sets the rules for provisional rankings.
 *
 * Walk-forward: rate every team on games before a cutoff (no minimum), then predict the six weeks
 * after. For a team with n games in the 15 months before the cutoff, its rating is pulled toward a
 * baseline, the average rating of the opponents it played (what we'd assume knowing only its level
 * of competition):
 *
 *     shown = baseline + w × (raw − baseline)        w = 0: baseline only, w = 1: raw rating
 *
 * For each n, the w that best predicts the team's next games (log loss, against opponents with 10+
 * games so only one side is uncertain) says how much that rating can be trusted. A curve
 * w(n) = n / (n + k) is then fitted to all games at once.
 *
 *   npx tsx scripts/backtest-provisional.ts
 */
import fs from "fs";
import path from "path";
import { calculateRankings, type GameInput } from "../src/lib/ranking/massey";
import { outcomeModel } from "../src/lib/predict";

type G = { team1Id: number; team2Id: number; team1Score: number; team2Score: number; date: string; tournamentName?: string; status?: string };
const snap = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "snapshot.json"), "utf8")) as {
  teams: Array<{ id: number; region: string }>; games: G[];
};
const west = new Set(snap.teams.filter((t) => t.region === "Region4").map((t) => t.id));
const games = snap.games.filter((g) => /^\d{4}-\d{2}-\d{2}$/.test(g.date) && g.status !== "scheduled");
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);

const BUCKETS: Array<[number, number, string]> = [[1, 1, "1"], [2, 2, "2"], [3, 3, "3"], [4, 4, "4"], [5, 5, "5"], [6, 7, "6–7"], [8, 9, "8–9"], [10, 12, "10–12"], [13, 19, "13–19"], [20, 999, "20+"]];
const W = Array.from({ length: 11 }, (_, i) => i / 10);
const FOLDS = [
  { name: "Fall 2025", cutoff: "2025-10-01" },
  { name: "Spring 2026", cutoff: "2026-03-01" },
  { name: "Fall 2026", cutoff: "2026-10-01" },
];

// per bucket, per w: games and summed log loss; plus raw rows for the curve fit
const agg = BUCKETS.map(() => W.map(() => ({ n: 0, ll: 0 })));
const rows: Array<{ n: number; raw: number; base: number; opp: number; act: "win" | "draw" | "loss"; predict: ReturnType<typeof outcomeModel> }> = [];

for (const f of FOLDS) {
  const train = games.filter((g) => g.date < f.cutoff && g.date >= addDays(f.cutoff, -800));
  const input: GameInput[] = train.map((g) => ({ ...g, status: "completed" }));
  const rating = new Map(calculateRankings(input, { minGames: 1 }).map((r) => [r.teamId, r.score]));
  const recent = train.filter((g) => g.date >= addDays(f.cutoff, -455));
  const count = new Map<number, number>();
  const opps = new Map<number, number[]>();
  for (const g of recent) for (const [a, b] of [[g.team1Id, g.team2Id], [g.team2Id, g.team1Id]]) {
    count.set(a, (count.get(a) ?? 0) + 1);
    const r = rating.get(b);
    if (r !== undefined) opps.set(a, [...(opps.get(a) ?? []), r]);
  }
  const base = (id: number) => { const o = opps.get(id); return o?.length ? o.reduce((s, x) => s + x, 0) / o.length : undefined; };
  // outcome table learned from established teams only, as in production
  const established = new Map([...rating].filter(([id]) => (count.get(id) ?? 0) >= 10));
  const predict = outcomeModel(recent, established, addDays(f.cutoff, -455));

  const test = games.filter((g) => g.date >= f.cutoff && g.date < addDays(f.cutoff, 42) && (west.has(g.team1Id) || west.has(g.team2Id)));
  let used = 0;
  for (const g of test) {
    for (const [me, op, mine, theirs] of [[g.team1Id, g.team2Id, g.team1Score, g.team2Score], [g.team2Id, g.team1Id, g.team2Score, g.team1Score]]) {
      const n = count.get(me) ?? 0, raw = rating.get(me), b = base(me), opp = rating.get(op);
      if (!n || raw === undefined || b === undefined || opp === undefined || (count.get(op) ?? 0) < 10) continue;
      const act = mine > theirs ? "win" : mine < theirs ? "loss" : "draw";
      const bi = BUCKETS.findIndex(([lo, hi]) => n >= lo && n <= hi);
      W.forEach((w, wi) => {
        const o = predict(b + w * (raw - b), opp);
        agg[bi][wi].n++; agg[bi][wi].ll -= Math.log(Math.max(o[act], 1e-4));
      });
      rows.push({ n, raw, base: b, opp, act, predict });
      used++;
    }
  }
  console.log(`${f.name}: rated on games before ${f.cutoff}, ${used} team-games graded`);
}

console.log("\ngames   graded   best w   log loss at w = 0 (baseline) · best · 1 (raw)");
BUCKETS.forEach(([, , label], bi) => {
  const a = agg[bi], n = a[0].n;
  if (!n) return;
  const ll = a.map((x) => x.ll / x.n);
  const best = ll.indexOf(Math.min(...ll));
  console.log(`${label.padEnd(7)} ${String(n).padStart(6)}   ${W[best].toFixed(1)}      ${ll[0].toFixed(4)} · ${ll[best].toFixed(4)} · ${ll[10].toFixed(4)}`);
});

// one curve for all n: w = n / (n + k)
const lossAt = (k: number) => rows.reduce((s, r) => {
  const w = r.n / (r.n + k), o = r.predict(r.base + w * (r.raw - r.base), r.opp);
  return s - Math.log(Math.max(o[r.act], 1e-4));
}, 0) / rows.length;
const ks = [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8];
const fits = ks.map((k) => ({ k, ll: lossAt(k) }));
console.log("\ncurve w = n / (n + k): " + fits.map((x) => `k=${x.k}: ${x.ll.toFixed(4)}`).join(" · "));
const bestK = fits.reduce((a, b) => (b.ll < a.ll ? b : a));
console.log(`best k = ${bestK.k} → w at n = 1…12: ${Array.from({ length: 12 }, (_, i) => (i + 1) / (i + 1 + bestK.k)).map((w) => w.toFixed(2)).join(" ")}`);
