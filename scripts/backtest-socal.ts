/**
 * Are ratings good enough to rank Southern California teams outside the tracked competitions
 * (SoCal League, Coast …)? Walk-forward backtest.
 *
 * For each fold: rate every team on games before the cutoff, then predict the six weeks after.
 * Games with a Southern California team (state CAS) and both teams on 4+ games are split by the
 * teams' kind: "elite" = plays a tracked competition (listed-eligible), "state" = doesn't.
 *   elite vs elite, state vs state, elite vs state (the cross games that place the leagues)
 * Scored with log loss, % of decided games the favourite won, and, for cross games, the bias:
 * the state-league side's actual points per game minus what the model expected. A bias near 0
 * means state-league teams sit at the right level relative to the elite leagues.
 *
 *   npx tsx scripts/backtest-socal.ts
 */
import fs from "fs";
import path from "path";
import { calculateRankings, type GameInput } from "../src/lib/ranking/massey";
import { outcomeModel } from "../src/lib/predict";

type G = { team1Id: number; team2Id: number; team1Score: number; team2Score: number; date: string; tournamentName?: string; status?: string };
const snap = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "snapshot.json"), "utf8")) as {
  teams: Array<{ id: number; state: string; tracked?: boolean; ageGroup: string }>; games: G[];
};
const team = new Map(snap.teams.map((t) => [t.id, t]));
const games = snap.games.filter((g) => /^\d{4}-\d{2}-\d{2}$/.test(g.date) && g.status !== "scheduled");
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
const FOLDS = ["2025-10-01", "2026-03-01", "2026-10-01"];
type Kind = "elite vs elite" | "state vs state" | "elite vs state";
const tot = new Map<string, { n: number; ll: number; dec: number; fav: number; bias: number; biasN: number }>();
const add = (k: string, ll: number, decided: boolean, favWon: boolean) => {
  const x = tot.get(k) ?? { n: 0, ll: 0, dec: 0, fav: 0, bias: 0, biasN: 0 };
  x.n++; x.ll += ll; if (decided) { x.dec++; if (favWon) x.fav++; }
  tot.set(k, x); return x;
};

for (const cutoff of FOLDS) {
  const train = games.filter((g) => g.date < cutoff && g.date >= addDays(cutoff, -800));
  const rating = new Map(calculateRankings(train.map((g) => ({ ...g, status: "completed" })) as GameInput[], { minGames: 1 }).map((r) => [r.teamId, r.score]));
  const recent = train.filter((g) => g.date >= addDays(cutoff, -455));
  const count = new Map<number, number>();
  for (const g of recent) for (const id of [g.team1Id, g.team2Id]) count.set(id, (count.get(id) ?? 0) + 1);
  const established = new Map([...rating].filter(([id]) => (count.get(id) ?? 0) >= 4));
  const predict = outcomeModel(recent, established, addDays(cutoff, -455));
  const test = games.filter((g) => g.date >= cutoff && g.date < addDays(cutoff, 42));
  let used = 0;
  for (const g of test) {
    const A = team.get(g.team1Id), B = team.get(g.team2Id);
    if (!A || !B || (A.state !== "CAS" && B.state !== "CAS")) continue;
    const ra = established.get(g.team1Id), rb = established.get(g.team2Id);
    if (ra === undefined || rb === undefined) continue;
    const ka = A.tracked ? "elite" : "state", kb = B.tracked ? "elite" : "state";
    const kind: Kind = ka === kb ? (`${ka} vs ${kb}` as Kind) : "elite vs state";
    const o = predict(ra, rb);
    const act = g.team1Score > g.team2Score ? "win" : g.team1Score < g.team2Score ? "loss" : "draw";
    const ll = -Math.log(Math.max(o[act], 1e-4));
    const favA = o.win >= o.loss;
    const x = add(kind, ll, act !== "draw", act !== "draw" && (act === "win") === favA);
    add(`${kind} · ${A.ageGroup <= "U12" && A.ageGroup.length === 3 ? "U8–U12" : "U13+"}`, ll, act !== "draw", act !== "draw" && (act === "win") === favA);
    if (kind === "elite vs state") {
      // the state-league side: actual points minus expected points
      const stateIsA = ka === "state";
      const pts = (mine: number, theirs: number) => (mine > theirs ? 3 : mine === theirs ? 1 : 0);
      const actual = stateIsA ? pts(g.team1Score, g.team2Score) : pts(g.team2Score, g.team1Score);
      const expected = stateIsA ? 3 * o.win + o.draw : 3 * o.loss + o.draw;
      x.bias += actual - expected; x.biasN++;
    }
    used++;
  }
  console.log(`rated before ${cutoff}: ${used} Southern California games graded`);
}
console.log("\ngames                        n    log loss   favourite won   state side: points vs expected");
for (const [k, x] of [...tot].sort()) {
  console.log(`${k.padEnd(26)} ${String(x.n).padStart(6)}   ${(x.ll / x.n).toFixed(4)}     ${((100 * x.fav) / (x.dec || 1)).toFixed(1)}%` +
    (x.biasN ? `          ${(x.bias / x.biasN >= 0 ? "+" : "")}${(x.bias / x.biasN).toFixed(2)} per game` : ""));
}
