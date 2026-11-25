/**
 * Does matching event entrants by GotSport id improve predictions? Test on a graded event.
 *
 * Ratings are frozen the day predictions were made (no event games leak in). Every graded
 * match is predicted twice with the same ratings and outcome table:
 *   names  teams the published predictions matched; the rest get the field median ("no data")
 *   ids    every team whose GotSport id (recorded by --score) maps to a rated team of ours
 *
 *   npx tsx scripts/backtest-id-matching.ts 57894
 */
import fs from "fs";
import path from "path";
import { calculateRankings } from "../src/lib/ranking/massey";
import { outcomeModel } from "../src/lib/predict";
import type { Prediction, PredTeam } from "../src/lib/events";

const eventId = process.argv[2] ?? "57894";
const pred = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "predictions", `${eventId}.json`), "utf8")) as Prediction;
const snap = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "snapshot.json"), "utf8")) as {
  teams: Array<{ id: number; gotsportTeamId?: number }>;
  games: Array<{ team1Id: number; team2Id: number; team1Score: number; team2Score: number; date: string }>;
};
const cutoff = pred.ratingsFrom.slice(0, 10);
const train = snap.games.filter((g) => /^\d{4}-\d{2}-\d{2}$/.test(g.date) && g.date < cutoff && g.date >= new Date(Date.parse(cutoff) - 800 * 864e5).toISOString().slice(0, 10));
const rating = new Map(calculateRankings(train.map((g) => ({ ...g, status: "completed" as const }))).map((r) => [r.teamId, r.score]));
const predict = outcomeModel(train, rating, new Date(Date.parse(cutoff) - 455 * 864e5).toISOString().slice(0, 10));
const played = new Map<number, number>();
for (const g of train) for (const id of [g.team1Id, g.team2Id]) played.set(id, (played.get(id) ?? 0) + 1);
const byGs = new Map<number, number[]>();
for (const t of snap.teams) if (t.gotsportTeamId) byGs.set(t.gotsportTeamId, [...(byGs.get(t.gotsportTeamId) ?? []), t.id]);
const idRating = (t: PredTeam) => {
  const ids = (byGs.get(t.gotsportTeamId ?? -1) ?? []).filter((id) => rating.has(id)).sort((a, b) => (played.get(b) ?? 0) - (played.get(a) ?? 0));
  return ids.length ? rating.get(ids[0])! : undefined;
};

console.log(`${pred.event.name}: ratings frozen ${cutoff}`);
for (const mode of ["names", "ids"] as const) {
  let n = 0, ll = 0, right = 0, rated = 0, teams = 0;
  for (const d of pred.divisions) {
    const all = d.groups.flatMap((g) => g.teams);
    const r = (t: PredTeam) => (mode === "names" && t.rating === null ? undefined : idRating(t));
    const known = all.map(r).filter((x): x is number => x !== undefined).sort((a, b) => a - b);
    const median = known[Math.floor(known.length / 2)] ?? 0;
    teams += all.length; rated += known.length;
    for (const g of d.groups) for (const m of g.matches) {
      if (!m.result) continue;
      const o = predict(r(m.a) ?? median, r(m.b) ?? median);
      const act = m.result.a > m.result.b ? "win" : m.result.a < m.result.b ? "loss" : "draw";
      const call = (["win", "draw", "loss"] as const).reduce((x, y) => (o[y] > o[x] ? y : x));
      ll -= Math.log(Math.max(o[act], 1e-4)); if (call === act) right++; n++;
    }
  }
  console.log(`${mode.padEnd(6)} ${rated}/${teams} teams rated · ${n} games · log loss ${(ll / n).toFixed(4)} · most-likely right ${((100 * right) / n).toFixed(1)}%`);
}
