/**
 * How well do the ratings predict SOCAL Fall League 2026-27 games, by flight tier, gender and age?
 * Walk-forward: for each week of the season, rate every team on games played before that week
 * (production settings: league tie per competition + gender + age, few-game shrink), then predict
 * that week's SOCAL games. Every completed game is predicted once, by ratings that never saw it.
 *
 * Per group: favourite won (% of decided games), draw rate, log loss vs a no-information baseline
 * (the season's own W/D/L rates), calibration (expected vs actual favourite wins), and a goal
 * regression: actual margin = a + b × predicted margin, with R² and mean absolute error.
 *
 * Writes data/predictions/socal-accuracy.json (or the path given), read by the SoCal league page.
 *
 *   npm run accuracy:socal          (≈3 min)
 */
import fs from "fs";
import path from "path";
import { calculateRankings, leagueName, type GameInput } from "../src/lib/ranking/massey";
import { outcomeModel } from "../src/lib/predict";

const EVENT = "SOCAL Fall League 2026 - 2027";
type G = { team1Id: number; team2Id: number; team1Score: number; team2Score: number; date: string; tournamentName?: string; status?: string };
type T = { id: number; ageGroup: string; gender: string; gotsportTeamId?: number };
const snap = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "snapshot.json"), "utf8")) as { teams: T[]; games: G[] };
const disc = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "discovery", "games", "48745.json"), "utf8")) as Array<{
  date: string; homeTeamId: number; awayTeamId: number; homeScore: number; awayScore: number; division: string;
}>;
const teamAG = new Map(snap.teams.map((t) => [t.id, `${t.gender}|${t.ageGroup}`]));
const games = snap.games.filter((g) => /^\d{4}-\d{2}-\d{2}$/.test(g.date) && g.status !== "scheduled");

// flight of each snapshot game: GotSport team id → snapshot team, then date + pair
const gsToSnap = new Map<number, number>();
for (const t of snap.teams) if (t.gotsportTeamId) gsToSnap.set(t.gotsportTeamId, t.id);
const pairKey = (a: number, b: number, d: string) => `${d}|${Math.min(a, b)}|${Math.max(a, b)}`;
const scoreKey = (d: string, s1: number, s2: number) => `${d}|${Math.min(s1, s2)}|${Math.max(s1, s2)}`;
const divByPair = new Map<string, string>();
for (const x of disc) {
  const a = gsToSnap.get(x.homeTeamId), b = gsToSnap.get(x.awayTeamId);
  if (a && b) divByPair.set(pairKey(a, b, x.date), x.division);
}
// a team merged into another record keeps one GotSport id: fall back to one known side + date + score
const divByOneSide = new Map<string, string>();
for (const x of disc) for (const id of [x.homeTeamId, x.awayTeamId]) {
  const s = gsToSnap.get(id);
  if (s) divByOneSide.set(`${s}|${scoreKey(x.date, x.homeScore, x.awayScore)}`, x.division);
}
function flightOf(g: G): string | undefined {
  return divByPair.get(pairKey(g.team1Id, g.team2Id, g.date))
    ?? divByOneSide.get(`${g.team1Id}|${scoreKey(g.date, g.team1Score, g.team2Score)}`)
    ?? divByOneSide.get(`${g.team2Id}|${scoreKey(g.date, g.team1Score, g.team2Score)}`);
}
/** "U9B BU9 - F3 South" → { age: "U9", gender: "Boys", tier: "F3" } */
function parseFlight(div: string) {
  const m = div.match(/^U(\d+)([BG])\b/);
  const rest = div.replace(/^U\d+[BG]\s+[BG]U\d+\s*-\s*/, "");
  const tier = /pre[\s-]?elite/i.test(rest) ? "Pre-Elite"
    : (rest.match(/^F\d(?:\/\d)?/)?.[0] ?? "Other");
  return { age: m ? `U${m[1]}` : "?", gender: m?.[2] === "G" ? "Girls" : "Boys", tier };
}

const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
const monday = (d: string) => addDays(d, -((new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7));
const FEW = (n: number) => (n >= 4 ? 1 : n >= 2 ? 0.8 : 0.6);

const season = games.filter((g) => g.tournamentName === EVENT);
const weeks = [...new Set(season.map((g) => monday(g.date)))].sort();
type Row = { age: string; gender: string; tier: string; week: string; pFav: number; pDraw: number; act: "win" | "draw" | "loss"; pAct: number;
  predMargin: number; margin: number; provisional: boolean; favWon: boolean | null };
const rows: Row[] = [];
let unmatched = 0, unrated = 0;

for (const wk of weeks) {
  const t0 = Date.now();
  const train = games.filter((g) => g.date < wk && g.date >= addDays(wk, -800));
  const raw = calculateRankings(train.map((g) => ({ ...g, status: "completed" })) as GameInput[], {
    minGames: 1,
    leagueOf: (id, t) => { const ln = leagueName(t); const ag = teamAG.get(id); return ln && ag ? `${ln}|${ag}` : null; },
  });
  // production's few-game shrink: 1–3 games pulled toward their opponents' average
  const rawScore = new Map(raw.map((r) => [r.teamId, r.score]));
  const opp = new Map<number, { s: number; n: number }>();
  for (const g of train) for (const [me, them] of [[g.team1Id, g.team2Id], [g.team2Id, g.team1Id]]) {
    const s = rawScore.get(them); if (s === undefined) continue;
    const x = opp.get(me) ?? { s: 0, n: 0 }; x.s += s; x.n++; opp.set(me, x);
  }
  const rating = new Map<number, number>(), played = new Map<number, number>();
  for (const r of raw) {
    const o = opp.get(r.teamId), w = FEW(r.gamesPlayed);
    rating.set(r.teamId, w === 1 || !o?.n ? r.score : o.s / o.n + w * (r.score - o.s / o.n));
    played.set(r.teamId, r.gamesPlayed);
  }
  const since = addDays(wk, -455);
  const predict = outcomeModel(train.filter((g) => g.date >= since), rating, since);
  const test = season.filter((g) => monday(g.date) === wk);
  for (const g of test) {
    const div = flightOf(g);
    if (!div) { unmatched++; continue; }
    const ra = rating.get(g.team1Id), rb = rating.get(g.team2Id);
    if (ra === undefined || rb === undefined) { unrated++; continue; }
    const o = predict(ra, rb);
    const act = g.team1Score > g.team2Score ? "win" : g.team1Score < g.team2Score ? "loss" : "draw";
    const favA = o.win >= o.loss;
    rows.push({
      ...parseFlight(div), week: wk,
      pFav: favA ? o.win : o.loss, pDraw: o.draw, act, pAct: o[act],
      predMargin: ra - rb, margin: g.team1Score - g.team2Score,
      provisional: (played.get(g.team1Id) ?? 0) < 4 || (played.get(g.team2Id) ?? 0) < 4,
      favWon: act === "draw" ? null : (act === "win") === favA,
    });
  }
  console.error(`week of ${wk}: ${test.length} games, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

// baseline: the season's own W/D/L split, no team information
const drawRate = rows.filter((r) => r.act === "draw").length / rows.length;
const baseLL = -(drawRate * Math.log(drawRate) + (1 - drawRate) * Math.log((1 - drawRate) / 2));

function summarize(rs: Row[]) {
  const n = rs.length, dec = rs.filter((r) => r.favWon !== null);
  const ll = rs.reduce((s, r) => s + -Math.log(Math.max(r.pAct, 1e-4)), 0) / n;
  // expected favourite wins among decided games: pFav / (pFav + pDog)
  const expFav = dec.reduce((s, r) => s + r.pFav / (1 - r.pDraw), 0) / (dec.length || 1);
  // OLS actual margin on predicted margin
  const mx = rs.reduce((s, r) => s + r.predMargin, 0) / n, my = rs.reduce((s, r) => s + r.margin, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const r of rs) { sxy += (r.predMargin - mx) * (r.margin - my); sxx += (r.predMargin - mx) ** 2; syy += (r.margin - my) ** 2; }
  const slope = sxy / sxx, r2 = (sxy * sxy) / (sxx * syy);
  const mae = rs.reduce((s, r) => s + Math.abs(r.margin - r.predMargin), 0) / n;
  return {
    n, decided: dec.length,
    favWon: dec.filter((r) => r.favWon).length / (dec.length || 1),
    expFavWon: expFav,
    draws: rs.filter((r) => r.act === "draw").length / n,
    logLoss: ll, skill: 1 - ll / baseLL,
    slope, intercept: my - slope * mx, r2, mae,
    provisionalShare: rs.filter((r) => r.provisional).length / n,
  };
}
const group = (key: (r: Row) => string) => {
  const m = new Map<string, Row[]>();
  for (const r of rows) { const k = key(r); m.set(k, [...(m.get(k) ?? []), r]); }
  return Object.fromEntries([...m].map(([k, rs]) => [k, summarize(rs)]));
};
// regression chart: games counted by predicted margin (0.5-goal bins) × actual margin (whole goals),
// plus the average actual margin per predicted bin. Both clipped to ±10 goals.
const clip = (v: number) => Math.max(-10, Math.min(10, v));
const cells = new Map<string, number>(), binMean = new Map<number, { s: number; n: number }>();
for (const r of rows) {
  const x = clip(Math.round(r.predMargin * 2) / 2), y = clip(r.margin);
  cells.set(`${x}|${y}`, (cells.get(`${x}|${y}`) ?? 0) + 1);
  const b = binMean.get(x) ?? { s: 0, n: 0 }; b.s += r.margin; b.n++; binMean.set(x, b);
}
// calibration: favourite's chance (among decided) in 5-point bins
const calib = new Map<number, { n: number; exp: number; won: number }>();
for (const r of rows) if (r.favWon !== null) {
  const p = r.pFav / (1 - r.pDraw), b = Math.min(95, Math.floor(p * 20) * 5);
  const x = calib.get(b) ?? { n: 0, exp: 0, won: 0 }; x.n++; x.exp += p; if (r.favWon) x.won++; calib.set(b, x);
}
const out = {
  event: EVENT, generated: new Date().toISOString().slice(0, 10),
  seasonGames: season.length, graded: rows.length, unmatched, unrated, baselineLogLoss: baseLL,
  overall: summarize(rows),
  established: summarize(rows.filter((r) => !r.provisional)),
  byTier: group((r) => r.tier), byGender: group((r) => r.gender), byAge: group((r) => r.age),
  byWeek: group((r) => r.week),
  byTierGender: group((r) => `${r.tier}|${r.gender}`),
  byAgeGender: group((r) => `${r.age}|${r.gender}`),
  byAgeTier: group((r) => `${r.age}|${r.tier}`),
  scatter: {
    cells: [...cells].map(([k, n]) => { const [x, y] = k.split("|").map(Number); return { x, y, n }; }),
    means: [...binMean].sort((a, b) => a[0] - b[0]).filter(([, b]) => b.n >= 20).map(([x, b]) => ({ x, y: b.s / b.n, n: b.n })),
  },
  calibration: [...calib].sort((a, b) => a[0] - b[0]).map(([b, x]) => ({ bin: b, n: x.n, expected: x.exp / x.n, actual: x.won / x.n })),
};
const file = process.argv[2] ?? path.join(process.cwd(), "data", "predictions", "socal-accuracy.json");
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(out, null, 1));
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
console.log(`${EVENT}: ${season.length} games, ${rows.length} predicted (${unrated} with an unrated team, ${unmatched} without a flight)`);
for (const [title, g] of [["tier", out.byTier], ["gender", out.byGender], ["age", out.byAge]] as const) {
  console.log(`\nby ${title}            n   fav won (exp)    draws  log loss  skill   slope   R²    MAE`);
  for (const [k, s] of Object.entries(g).sort()) console.log(
    `${k.padEnd(14)} ${String(s.n).padStart(6)}   ${pct(s.favWon)} (${pct(s.expFavWon)})  ${pct(s.draws).padStart(6)}  ${s.logLoss.toFixed(3)}   ${pct(s.skill).padStart(6)}  ${s.slope.toFixed(2)}  ${s.r2.toFixed(2)}  ${s.mae.toFixed(2)}`);
}
const o = out.overall;
console.log(`\nall            ${o.n}   ${pct(o.favWon)} (${pct(o.expFavWon)})  ${pct(o.draws)}  ${o.logLoss.toFixed(3)}  ${pct(o.skill)}  ${o.slope.toFixed(2)}  ${o.r2.toFixed(2)}  ${o.mae.toFixed(2)}`);
