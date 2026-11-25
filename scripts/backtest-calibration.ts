/**
 * Are the win / draw / loss chances overconfident, and what fixes it? Walk-forward backtest.
 *
 * The outcome table (src/lib/predict.ts) maps a rating gap to how often teams with that gap
 * won, drew and lost. Today it is learned from the same games the ratings were fitted on, so
 * gaps look more decisive than they are on games the ratings haven't seen. After DPL Mesa
 * 2026, favourites at 80–90% won 70% of the time.
 *
 * For each test window: rate teams on games before the cutoff only, then predict what followed.
 *   in-sample      today's model
 *   shrink k       the same table, looked up at k × the rating gap
 *   out-of-sample  the table learned from games the ratings had not seen: ratings frozen at
 *                  earlier cutoffs (every 4 weeks over the 6 months before), each predicting
 *                  the 4 weeks that followed it
 * Windows: everyday West games for six weeks after a cutoff, and three DPL events (rated the
 * day before each started). Scored with log loss (lower is better), Brier, and how often
 * favourites won against how often we said they would.
 *
 *   npx tsx scripts/backtest-calibration.ts
 */
import fs from "fs";
import path from "path";
import { calculateRankings, type GameInput } from "../src/lib/ranking/massey";
import { outcomeModel, outcomeTable, type OutcomeTable } from "../src/lib/predict";

type G = { team1Id: number; team2Id: number; team1Score: number; team2Score: number; date: string; tournamentName?: string };
const snap = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "snapshot.json"), "utf8")) as {
  teams: Array<{ id: number; region: string }>; games: Array<G & { status?: string }>;
};
const west = new Set(snap.teams.filter((t) => t.region === "Region4").map((t) => t.id));
const games: G[] = snap.games.filter((g) => /^\d{4}-\d{2}-\d{2}$/.test(g.date) && g.status !== "scheduled");
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);

const ratingCache = new Map<string, Map<number, number>>();
function ratingsAt(cutoff: string) {
  if (!ratingCache.has(cutoff)) {
    const train = games.filter((g) => g.date < cutoff && g.date >= addDays(cutoff, -800));
    const input: GameInput[] = train.map((g) => ({ ...g, status: "completed" }));
    ratingCache.set(cutoff, new Map(calculateRankings(input).map((r) => [r.teamId, r.score])));
  }
  return ratingCache.get(cutoff)!;
}

/** out-of-sample table: frozen ratings at earlier cutoffs predicting the 4 weeks after each */
function oosTable(cutoff: string, windows = 6, stepDays = 28): OutcomeTable {
  const rows: Array<{ g: G; r: Map<number, number> }> = [];
  for (let k = 1; k <= windows; k++) {
    const from = addDays(cutoff, -k * stepDays), to = addDays(from, stepDays);
    const r = ratingsAt(from);
    for (const g of games) if (g.date >= from && g.date < to) rows.push({ g, r });
  }
  return outcomeTable(rows.map(({ g, r }) => ({ ...g, _r: r })), (g, id) => (g as G & { _r: Map<number, number> })._r.get(id));
}

type Predict = (a: number, b: number) => { win: number; draw: number; loss: number };
function score(test: G[], r: Map<number, number>, predict: Predict) {
  let n = 0, ll = 0, brier = 0, decisive = 0, right = 0;
  const bins = [0.5, 0.6, 0.7, 0.8, 0.9, 1.01].map((hi, i, a) => ({ lo: i ? a[i - 1] : 0, hi, n: 0, p: 0, won: 0 }));
  for (const g of test) {
    const a = r.get(g.team1Id), b = r.get(g.team2Id);
    if (a === undefined || b === undefined) continue;
    const o = predict(a, b);
    const act = g.team1Score > g.team2Score ? "win" : g.team1Score < g.team2Score ? "loss" : "draw";
    ll -= Math.log(Math.max(o[act], 1e-4));
    brier += (["win", "draw", "loss"] as const).reduce((t, k) => t + (o[k] - (k === act ? 1 : 0)) ** 2, 0);
    if (act !== "draw" && a !== b) { decisive++; if ((act === "win") === a > b) right++; }
    const favA = o.win >= o.loss, pf = favA ? o.win : o.loss, bin = bins.find((x) => pf >= x.lo && pf < x.hi)!;
    bin.n++; bin.p += pf; if (act !== "draw" && (act === "win") === favA) bin.won++;
    n++;
  }
  return { n, ll: ll / n, brier: brier / n, right: right / (decisive || 1), bins };
}

const WINDOWS: Array<{ name: string; cutoff: string; test: (g: G) => boolean }> = [
  { name: "Fall 2025, West games Oct 1 – Nov 12", cutoff: "2025-10-01", test: (g) => g.date >= "2025-10-01" && g.date < "2025-11-13" },
  { name: "Spring 2026, West games Mar 1 – Apr 11", cutoff: "2026-03-01", test: (g) => g.date >= "2026-03-01" && g.date < "2026-04-12" },
  { name: "Fall 2026, West games Oct 1 – Nov 12", cutoff: "2026-10-01", test: (g) => g.date >= "2026-10-01" && g.date < "2026-11-13" },
  { name: "DPL Mesa 2025 (U15–U19)", cutoff: "2025-11-20", test: (g) => g.tournamentName === "2025 DPL Western Regional, U15-19 - Mesa, Arizona" },
  { name: "DPL Provo 2026 (U13–U14)", cutoff: "2026-10-01", test: (g) => g.tournamentName === "2026 DPL Western Regional, U13/U14 - Provo, Utah" },
  { name: "DPL Mesa 2026 (U15–U19)", cutoff: "2026-11-19", test: (g) => g.tournamentName === "2026 DPL Western Regional, U15-19 - Mesa, Arizona" },
  { name: "DPL Mesa 2026, rated Nov 12 (when published)", cutoff: "2026-11-12", test: (g) => g.tournamentName === "2026 DPL Western Regional, U15-19 - Mesa, Arizona" },
];
// ---- --no-data: what rating should an unrated team at an event get? ----
// predict-event.ts gives it the median rating of the event's rated teams in its age group.
// Try lower percentiles of that field, on every event game involving an unrated team.
if (process.argv.includes("--no-data")) {
  const ageOf = new Map((snap.teams as Array<{ id: number; ageGroup?: string; gender?: string }>).map((t) => [t.id, `${t.gender}|${t.ageGroup}`]));
  const QS = [0.5, 0.4, 0.3, 0.25, 0.2, 0.1];
  const tot = new Map<number, { n: number; ll: number; pts: number; exp: number }>();
  const quantile = (xs: number[], q: number) => { const v = [...xs].sort((a, b) => a - b); return v.length ? v[Math.min(v.length - 1, Math.floor(q * v.length))] : 0; };
  for (const w of WINDOWS.filter((x) => !/West games/.test(x.name))) {
    const r = ratingsAt(w.cutoff);
    const test = games.filter(w.test);
    const predict = outcomeModel(games.filter((g) => g.date < w.cutoff), r, addDays(w.cutoff, -455));
    const field = new Map<string, number[]>();
    for (const id of new Set(test.flatMap((g) => [g.team1Id, g.team2Id]))) {
      const x = r.get(id), k = ageOf.get(id) ?? "?";
      if (x !== undefined) field.set(k, [...(field.get(k) ?? []), x]);
    }
    const nd = test.filter((g) => r.get(g.team1Id) === undefined || r.get(g.team2Id) === undefined);
    console.log(`\n=== ${w.name}: ${nd.length} of ${test.length} games involve a team unrated on ${w.cutoff}`);
    console.log("unrated team set to".padEnd(26) + "games  logloss  unrated pts/game: actual vs expected");
    for (const q of QS) {
      let n = 0, ll = 0, pts = 0, exp = 0;
      for (const g of nd) {
        const rate = (id: number) => r.get(id) ?? quantile(field.get(ageOf.get(id) ?? "?") ?? [], q);
        const a = rate(g.team1Id), b = rate(g.team2Id), o = predict(a, b);
        const act = g.team1Score > g.team2Score ? "win" : g.team1Score < g.team2Score ? "loss" : "draw";
        ll -= Math.log(Math.max(o[act], 1e-4)); n++;
        for (const [id, mine, theirs, pw] of [[g.team1Id, g.team1Score, g.team2Score, o.win], [g.team2Id, g.team2Score, g.team1Score, o.loss]] as const) {
          if (r.get(id) !== undefined) continue;
          pts += mine > theirs ? 3 : mine === theirs ? 1 : 0; exp += 3 * pw + o.draw;
        }
      }
      const t = tot.get(q) ?? { n: 0, ll: 0, pts: 0, exp: 0 }; t.n += n; t.ll += ll; t.pts += pts; t.exp += exp; tot.set(q, t);
      console.log(`${`${Math.round(q * 100)}th percentile`.padEnd(26)}${String(n).padStart(5)}  ${(ll / n).toFixed(4)}  ${(pts / n).toFixed(2)} vs ${(exp / n).toFixed(2)}`);
    }
  }
  console.log("\n=== All three events");
  for (const [q, t] of tot) console.log(`${`${Math.round(q * 100)}th percentile`.padEnd(26)}${String(t.n).padStart(5)}  ${(t.ll / t.n).toFixed(4)}`);
  process.exit(0);
}

const SHRINK = [0.9, 0.8, 0.7, 0.6, 0.5];
const pct = (x: number) => `${Math.round(100 * x)}%`;
const totals = new Map<string, { n: number; ll: number; everydayN: number; everydayLL: number; eventN: number; eventLL: number }>();

for (const w of WINDOWS) {
  const r = ratingsAt(w.cutoff);
  const test = games.filter((g) => w.test(g) && (west.has(g.team1Id) || west.has(g.team2Id)));
  const inSample = outcomeModel(games.filter((g) => g.date < w.cutoff), r, addDays(w.cutoff, -455));
  const oos = outcomeModel([], r, "", oosTable(w.cutoff));
  const variants: Array<[string, Predict]> = [
    ["in-sample (today)", inSample],
    ...SHRINK.map((k): [string, Predict] => [`shrink ${k}`, (a, b) => inSample(a * k, b * k)]),
    ["out-of-sample table", oos],
  ];
  console.log(`\n=== ${w.name}: rated on games before ${w.cutoff}`);
  console.log("variant".padEnd(22) + "games  logloss  brier  fav→won  calibration (predicted → actual win, by favourite bin)");
  for (const [name, p] of variants) {
    const s = score(test, r, p);
    const cal = s.bins.filter((b) => b.n >= 10).map((b) => `${pct(b.p / b.n)}→${pct(b.won / b.n)}`).join("  ");
    console.log(`${name.padEnd(22)}${String(s.n).padStart(5)}  ${s.ll.toFixed(4)}  ${s.brier.toFixed(4)}  ${pct(s.right).padStart(5)}    ${cal}`);
    const t = totals.get(name) ?? { n: 0, ll: 0, everydayN: 0, everydayLL: 0, eventN: 0, eventLL: 0 };
    t.n += s.n; t.ll += s.ll * s.n;
    if (/West games/.test(w.name)) { t.everydayN += s.n; t.everydayLL += s.ll * s.n; } else { t.eventN += s.n; t.eventLL += s.ll * s.n; }
    totals.set(name, t);
  }
}
console.log("\n=== All windows (games-weighted log loss)");
console.log("variant".padEnd(22) + "everyday   events    all");
for (const [name, t] of totals) console.log(`${name.padEnd(22)}${(t.everydayLL / t.everydayN).toFixed(4)}    ${(t.eventLL / t.eventN).toFixed(4)}    ${(t.ll / t.n).toFixed(4)}`);
