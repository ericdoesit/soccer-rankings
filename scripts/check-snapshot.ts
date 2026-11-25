/**
 * Sanity checks on data/snapshot.json. Exits 1 if any ERROR check fails.
 *   npm run check:data [-- --prev path/to/old-snapshot.json]
 */
import * as fs from "fs";
import * as path from "path";
import { SNAPSHOT_FILE, type DataSet } from "../src/lib/data";

const snap: DataSet = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf-8"));
const prevArg = process.argv.indexOf("--prev");
const prev: DataSet | null = prevArg > 0 ? JSON.parse(fs.readFileSync(process.argv[prevArg + 1], "utf-8")) : null;

let errors = 0;
const check = (level: "ERROR" | "WARN", name: string, bad: number, total: number, sample: unknown[] = []) => {
  const ok = bad === 0;
  if (!ok && level === "ERROR") errors++;
  console.log(`${ok ? "  ok  " : level === "ERROR" ? "  FAIL" : "  warn"}  ${name}: ${bad} of ${total}` +
    (sample.length && !ok ? `\n          e.g. ${sample.slice(0, 3).map((x) => JSON.stringify(x)).join("\n               ")}` : ""));
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const teams = snap.teams as any[], games = snap.games as any[], rankings = snap.rankings as any[];
const teamById = new Map(teams.map((t) => [t.id, t]));
const today = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);

console.log(`\nSnapshot: ${teams.length} teams, ${games.length} games, ${rankings.length} rankings\n`);
console.log("Teams");
const dupTeamIds = teams.length - teamById.size;
check("ERROR", "duplicate team ids", dupTeamIds, teams.length);
check("WARN", "teams without name", teams.filter((t) => !t.name?.trim()).length, teams.length);
check("WARN", "teams without age group", teams.filter((t) => !t.ageGroup).length, teams.length,
  teams.filter((t) => !t.ageGroup).map((t) => t.name));

console.log("Games");
check("ERROR", "game references missing team", games.filter((g) => !teamById.has(g.team1Id) || !teamById.has(g.team2Id)).length, games.length,
  games.filter((g) => !teamById.has(g.team1Id) || !teamById.has(g.team2Id)));
check("ERROR", "team plays itself", games.filter((g) => g.team1Id === g.team2Id).length, games.length,
  games.filter((g) => g.team1Id === g.team2Id).map((g) => [teamById.get(g.team1Id)?.name, g.tournamentName]));
const badScore = (s: unknown) => typeof s !== "number" || !Number.isInteger(s) || s < 0;
check("ERROR", "invalid score (negative / non-integer)", games.filter((g) => badScore(g.team1Score) || badScore(g.team2Score)).length, games.length,
  games.filter((g) => badScore(g.team1Score) || badScore(g.team2Score)));
check("WARN", "blowout ≥ 15 goals (likely data entry; capped by marginCap in the model)",
  games.filter((g) => Math.abs(g.team1Score - g.team2Score) >= 15).length, games.length,
  games.filter((g) => Math.abs(g.team1Score - g.team2Score) >= 15).map((g) => [g.team1Score, g.team2Score, g.tournamentName]));
check("WARN", "undated games (weighted as current)", games.filter((g) => !/^\d{4}-\d{2}-\d{2}$/.test(g.date)).length, games.length);
check("ERROR", "games dated in the future", games.filter((g) => g.date > today).length, games.length,
  games.filter((g) => g.date > today).map((g) => [g.date, g.tournamentName]));
const key = (g: { team1Id: number; team2Id: number; team1Score: number; team2Score: number; date: string }) => {
  const [a, sa, b, sb] = g.team1Id < g.team2Id ? [g.team1Id, g.team1Score, g.team2Id, g.team2Score] : [g.team2Id, g.team2Score, g.team1Id, g.team1Score];
  return `${a}-${b}-${sa}-${sb}-${g.date}`;
};
const seen = new Map<string, number>();
for (const g of games) seen.set(key(g), (seen.get(key(g)) ?? 0) + 1);
check("WARN", "identical games (same teams, score, date) — possible double count",
  [...seen.values()].filter((n) => n > 1).reduce((a, n) => a + n - 1, 0), games.length);

console.log("Rankings");
check("ERROR", "non-finite rating", rankings.filter((r) => !Number.isFinite(r.score)).length, rankings.length);
check("ERROR", "ranked team missing", rankings.filter((r) => !teamById.has(r.teamId)).length, rankings.length);
// every team with a game is rated; rank numbers go only to teams with 4+ games (data.ts shrinkFewGames)
const numbered = rankings.filter((r) => r.gamesPlayed >= 4);
const ranks = numbered.map((r) => r.rank).sort((a, b) => a - b);
check("ERROR", "ranks of 4+-game teams not 1..N", ranks.filter((r, i) => r !== i + 1).length, numbered.length);
check("ERROR", "rank number on a team with < 4 games", rankings.filter((r) => r.gamesPlayed < 4 && r.rank !== 0).length, rankings.length);
check("ERROR", "listed with < 4 games", rankings.filter((r) => r.gamesPlayed < 4 && teamById.get(r.teamId)?.rankable).length, rankings.length);
check("WARN", "ranked teams with placeholder #team_id names",
  rankings.filter((r) => / #\d+$/.test(teamById.get(r.teamId)?.name ?? "")).length, rankings.length);
const scores = rankings.map((r) => r.score);
const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
const sd = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length);
check("WARN", "ratings > 5 SD from mean", rankings.filter((r) => Math.abs(r.score - mean) > 5 * sd).length, rankings.length,
  rankings.filter((r) => Math.abs(r.score - mean) > 5 * sd).map((r) => [teamById.get(r.teamId)?.name, r.score.toFixed(2)]));

console.log("Sources (discovery files vs snapshot)");
// Compare by (GotSport team ids, date): GotSport lists some matches twice under
// different game ids (NL Club P1 Pacific), and showcase games also appear in
// their league's schedule, so per-event row counts overstate what is missing.
const gamesDir = path.join(process.cwd(), "data", "discovery", "games");
// the build reads sources at its start and writes the snapshot ~10-30 s later
const snapTime = fs.statSync(SNAPSHOT_FILE).mtimeMs - 60_000;
const gsOf = new Map(teams.filter((t) => t.gotsportTeamId).map((t) => [t.id, t.gotsportTeamId as number]));
const pairKey = (a: number, b: number, d: string) => `${Math.min(a, b)}_${Math.max(a, b)}_${d}`;
const inSnap = new Set<string>();
for (const g of games) { const a = gsOf.get(g.team1Id), b = gsOf.get(g.team2Id); if (a && b) inSnap.add(pairKey(a, b, g.date)); }
// Merged teams keep only one GotSport id, so a game against the merged-away id can't match by
// id pair. Accept it when the side we do know has a game that day with the same score
// (2026-11-16: this was all 59 "missing" events, ~2,000 games, every one present).
const teamByGs = new Map([...gsOf].map(([id, gs]) => [gs, id]));
const scoreKey = (a: number, b: number) => [a, b].sort((x, y) => x - y).join("-");
const teamDay = new Set<string>();
for (const g of games) {
  const sk = scoreKey(g.team1Score, g.team2Score);
  teamDay.add(`${g.team1Id}|${g.date}|${sk}`); teamDay.add(`${g.team2Id}|${g.date}|${sk}`);
}
type RawGame = { eventName: string; homeTeamId: number; awayTeamId: number; date: string; homeScore?: number; awayScore?: number };
const present = (g: RawGame) => {
  if (inSnap.has(pairKey(g.homeTeamId, g.awayTeamId, g.date))) return true;
  const sk = scoreKey(Number(g.homeScore), Number(g.awayScore));
  return [g.homeTeamId, g.awayTeamId].some((gs) => teamByGs.has(gs) && teamDay.has(`${teamByGs.get(gs)}|${g.date}|${sk}`));
};
// events the build dropped on purpose as outside the West (written by build-snapshot)
const droppedFile = path.join(process.cwd(), "data", "snapshot-dropped-events.json");
const dropped = new Set<string>(fs.existsSync(droppedFile) ? JSON.parse(fs.readFileSync(droppedFile, "utf-8")) : []);
let short = 0, n = 0, newer = 0;
const shortList: unknown[] = [];
for (const f of fs.existsSync(gamesDir) ? fs.readdirSync(gamesDir) : []) {
  const file = path.join(gamesDir, f);
  if (fs.statSync(file).mtimeMs > snapTime) { newer++; continue; } // crawled after this build
  const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as RawGame[];
  if (!raw.length || dropped.has(raw[0].eventName)) continue;
  // the importer skips scores over 20 (futsal / data errors), so don't expect those
  const want = [...new Map(raw.filter((g) => g.homeTeamId && g.awayTeamId && !(g.homeScore! > 20 || g.awayScore! > 20))
    .map((g) => [pairKey(g.homeTeamId, g.awayTeamId, g.date), g])).values()];
  if (!want.length) continue;
  n++;
  const have = want.filter(present).length;
  if (have < want.length * 0.97) { short++; shortList.push([raw[0].eventName, `${have}/${want.length}`]); }
}
check("ERROR", "discovered events with >3% of matches missing from snapshot", short, n, shortList);
if (newer) console.log(`          (${newer} event files changed after this build; rebuild to include them)`);

console.log(`\nRatings: mean ${mean.toFixed(2)}, sd ${sd.toFixed(2)}, max ${Math.max(...scores).toFixed(2)}`);
// West listing order, as the site shows it: only West teams from tracked competitions; others are rated but not listed
const listed = [...rankings].sort((a, b) => a.rank - b.rank)
  .filter((r) => { const t = teamById.get(r.teamId); return t.region === "Region4" && t.ageGroup !== "U19+" && t.tracked !== false && t.rankable !== false; });
const top = listed.slice(0, 10);
console.log("Top 10 listed (West):");
top.forEach((r, i) => { const t = teamById.get(r.teamId); console.log(`  ${String(i + 1).padStart(3)} ${r.score.toFixed(2)}  ${t.name} (${t.ageGroup} ${t.gender}, ${t.state}) ${r.wins}-${r.losses}-${r.draws}`); });

if (prev) {
  // Team ids are assigned per build, so match on the source name.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const key = (t: any) => t?.sourceName ?? t?.name;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prevTeams = new Map((prev.teams as any[]).map((t) => [t.id, t]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prevRank = new Map((prev.rankings as any[]).map((r) => [key(prevTeams.get(r.teamId)), r.rank]));
  const moves = listed.slice(0, 100)
    .map((r) => ({ name: teamById.get(r.teamId).name, now: r.rank, was: prevRank.get(key(teamById.get(r.teamId))) }))
    .filter((m) => m.was === undefined || Math.abs(m.was - m.now) > 40);
  console.log(`\nTop-100 listed teams new or moved > 40 places vs previous snapshot: ${moves.length}`);
  for (const m of moves.slice(0, 12)) console.log(`  #${m.now} (was ${m.was ?? "unranked"})  ${m.name}`);
}
console.log(errors ? `\n${errors} check(s) FAILED` : "\nAll error checks passed.");
process.exit(errors ? 1 : 0);
