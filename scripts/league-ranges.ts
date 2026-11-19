/**
 * How sure are the league levels on the About page? (data/league-ranges.json)
 *
 * A league's level is set only by games between leagues (games inside a league just order its
 * teams), and those games are few and irregular. Two checks, re-running the full rating each time:
 *
 *  1. Bootstrap: every game between teams of different leagues is resampled (each one counted
 *     0, 1, 2 … times, Poisson(1)); games inside a league stay as they are. The spread of each
 *     league's median rating over the replicates is its likely range (10th–90th percentile).
 *  2. One event out: the events with the most cross-league games are dropped one at a time, to
 *     see whether a single showcase carries a league's level.
 *
 * Teams and leagues are the About page's (socalLeagueMembership in src/lib/about-charts.ts).
 *
 *   npm run league:ranges            # after build:data; B=40 replicates (env B), up to EVENTS=10 events
 *   EVENTS_ONLY=1 npm run league:ranges   # keep the file's ranges, redo the one-event test
 */
import * as fs from "fs";
import * as path from "path";
import { getDataSet } from "../src/lib/data";
import { calculateRankings, leagueName } from "../src/lib/ranking/massey";
import { gameType, socalLeagueMembership } from "../src/lib/about-charts";

const B = Number(process.env.B ?? 40);
const EVENTS = Number(process.env.EVENTS ?? 10);
const MIN_GAMES = 10, MIN_TEAMS = 5;
const OUT = path.join(process.cwd(), "data", "league-ranges.json");

const data = getDataSet();
const t0 = Date.now();
const teamAG = new Map(data.teams.map((t) => [t.id, `${t.gender}|${t.ageGroup}`]));
const games = data.games.filter((g) => g.status === "completed");
const rate = (gs: typeof games) => {
  const r = calculateRankings(gs, {
    minGames: 1,
    leagueOf: (id, t) => { const ln = leagueName(t); const ag = teamAG.get(id); return ln && ag ? `${ln}|${ag}` : null; },
  });
  return new Map(r.map((x) => [x.teamId, x.score]));
};

// the About page's groups: age|gender → league → team ids (rated, 10+ games)
const base = new Map(data.rankings.filter((r) => r.gamesPlayed >= MIN_GAMES).map((r) => [r.teamId, r.score]));
const teamById = new Map(data.teams.map((t) => [t.id, t]));
const groups = new Map<string, Map<string, number[]>>();
for (const [id, league] of socalLeagueMembership(data)) {
  const t = teamById.get(id);
  if (!t || !base.has(id) || t.ageGroup === "U19+") continue;
  const k = `${t.ageGroup}|${t.gender}`;
  const g = groups.get(k) ?? groups.set(k, new Map()).get(k)!;
  (g.get(league) ?? g.set(league, []).get(league)!).push(id);
}
for (const g of groups.values()) for (const [l, ids] of g) if (ids.length < MIN_TEAMS) g.delete(l);
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const medians = (r: Map<number, number>) => {
  const out: Record<string, Record<string, number>> = {};
  for (const [k, g] of groups) for (const [l, ids] of g) {
    const v = ids.map((id) => r.get(id)).filter((x): x is number => x !== undefined);
    if (v.length) (out[k] ??= {})[l] = median(v);
  }
  return out;
};

// each team's own league: the competition it played most (as the rating's league ties)
const counts = new Map<number, Map<string, number>>();
for (const g of games) {
  const ln = leagueName(g.tournamentName ?? "");
  if (!ln) continue;
  for (const id of [g.team1Id, g.team2Id]) { const m = counts.get(id) ?? counts.set(id, new Map()).get(id)!; m.set(ln, (m.get(ln) ?? 0) + 1); }
}
const own = new Map<number, string>();
for (const [id, m] of counts) own.set(id, [...m].sort((a, b) => b[1] - a[1])[0][0]);
const cross = (g: (typeof games)[number]) => { const a = own.get(g.team1Id), b = own.get(g.team2Id); return !a || !b || a !== b; };
const crossGames = games.filter(cross), inside = games.filter((g) => !cross(g));
console.log(`${games.length} games: ${crossGames.length} between leagues (resampled), ${inside.length} inside one league`);

// seeded RNG (mulberry32) and Poisson(1)
let seed = 20261119;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const poisson1 = () => { const L = Math.exp(-1); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; };

const baseMed = medians(base);
const prev = process.env.EVENTS_ONLY && fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : null;
const reps: Array<Record<string, Record<string, number>>> = [];
// listed teams: their own rating in each replicate, for the Proven rankings' likely ranges
const listed = data.teams.filter((t) => t.rankable).map((t) => t.id);
const teamReps = new Map<number, number[]>(listed.map((id) => [id, []]));
for (let b = 0; b < (prev ? 0 : B); b++) {
  const sample = [...inside];
  for (const g of crossGames) for (let k = poisson1(); k > 0; k--) sample.push(g);
  const r = rate(sample);
  reps.push(medians(r));
  for (const [id, a] of teamReps) { const v = r.get(id); if (v !== undefined) a.push(v); }
  console.log(`  replicate ${b + 1}/${B} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; };
const ranges: Record<string, Record<string, { median: number; lo: number; hi: number; teams: number; crossGames: number }>> = prev?.ranges ?? {};
if (!prev) for (const [k, g] of groups) for (const [l, ids] of g) {
  const v = reps.map((r) => r[k]?.[l]).filter((x): x is number => x !== undefined);
  const set = new Set(ids);
  const cg = crossGames.filter((x) => set.has(x.team1Id) || set.has(x.team2Id)).length;
  (ranges[k] ??= {})[l] = { median: +baseMed[k][l].toFixed(2), lo: +pct(v, 0.1).toFixed(2), hi: +pct(v, 0.9).toFixed(2), teams: ids.length, crossGames: cg };
}

// each listed team: 10th–90th percentile of its rating over the replicates
const teams: Record<number, [number, number]> = prev?.teams ?? {};
if (!prev) for (const [id, a] of teamReps) if (a.length >= Math.min(10, B)) teams[id] = [+pct(a, 0.1).toFixed(2), +pct(a, 0.9).toFixed(2)];

// one event out: for each league shown (U13, U15, U17 boys), the tournament, showcase or cup (not a
// league) with the most of its teams' cross-league games, each dropped once
const evTeams = new Map<string, Set<number>>();
for (const k of ["U13|Boys", "U15|Boys", "U17|Boys"]) for (const [l, ids] of groups.get(k) ?? []) {
  const s = evTeams.get(l) ?? evTeams.set(l, new Set()).get(l)!; for (const id of ids) s.add(id);
}
const top: Array<[string, number]> = [];
for (const [, ids] of evTeams) {
  const byEvent = new Map<string, number>();
  for (const g of crossGames) if ((ids.has(g.team1Id) || ids.has(g.team2Id)) && g.tournamentName && /Tournaments|State Cups/.test(gameType(g.tournamentName))) byEvent.set(g.tournamentName, (byEvent.get(g.tournamentName) ?? 0) + 1);
  const best = [...byEvent].sort((a, b) => b[1] - a[1])[0];
  if (best && !top.some(([e]) => e === best[0])) top.push(best);
}
top.splice(EVENTS);
const events: Array<{ event: string; crossGames: number; shifts: Record<string, Record<string, number>> }> = [];
for (const [ev, n] of top) {
  const m = medians(rate(games.filter((g) => g.tournamentName !== ev)));
  const shifts: Record<string, Record<string, number>> = {};
  for (const k of Object.keys(baseMed)) for (const l of Object.keys(baseMed[k])) {
    const d = (m[k]?.[l] ?? baseMed[k][l]) - baseMed[k][l];
    if (Math.abs(d) >= 0.05) (shifts[k] ??= {})[l] = +d.toFixed(2);
  }
  events.push({ event: ev, crossGames: n, shifts });
  console.log(`  without ${ev} (${n} cross-league games)`);
}

fs.writeFileSync(OUT, JSON.stringify({ builtAt: prev?.builtAt ?? new Date().toISOString(), games: games.length, crossGames: crossGames.length, replicates: prev?.replicates ?? B, ranges, teams, events }));
console.log(`Wrote ${OUT} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
