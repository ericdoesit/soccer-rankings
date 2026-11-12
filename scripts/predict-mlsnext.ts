/**
 * MLS NEXT 2026-27 predictions: every upcoming league game (win / draw / loss) and each
 * conference's projected final table (10,000 simulated seasons).
 *
 * Input:  data/mlsnext-tracker/games.json (npm run scrape:mlsnext) + data/snapshot.json
 *         (npm run build:data, which rates the played games).
 * Output: data/predictions/mlsnext.json (the /mls-next page)
 *         data/predictions/mlsnext-log.json: the first prediction made for each game,
 *         kept so accuracy can be scored honestly once results come in.
 *
 * Conference tables follow MLS NEXT: points per game (3 win, 1 draw), league games only.
 * Flex games and Pro Pathway games (MLS academies) are predicted but don't count in the table.
 * Teams we can't rate yet count as their conference's median rated team ("no data").
 *
 *   npx tsx scripts/predict-mlsnext.ts [--days 21]
 */
import * as fs from "fs";
import * as path from "path";
import { getDataSet } from "../src/lib/data";
import { outcomeModel } from "../src/lib/predict";
import { calculateRankings } from "../src/lib/ranking/massey";
import type { TrackerGame } from "./scrape-mlsnext-tracker";

const DATA = path.join(process.cwd(), "data");
const SRC = path.join(DATA, "mlsnext-tracker", "games.json");
const OUT = path.join(DATA, "predictions", "mlsnext.json");
const LOG = path.join(DATA, "predictions", "mlsnext-log.json");
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const DAYS = Number(arg("--days") ?? 21);
const RUNS = 10000;
const today = new Date().toISOString().slice(0, 10);
const until = new Date(Date.now() + DAYS * 864e5).toISOString().slice(0, 10);

if (!fs.existsSync(SRC)) { console.error("no data/mlsnext-tracker/games.json: run npm run scrape:mlsnext"); process.exit(1); }
const all = JSON.parse(fs.readFileSync(SRC, "utf8")) as TrackerGame[];
const { teams, games, rankings } = getDataSet();
const rating = new Map(rankings.map((r) => [r.teamId, r.score]));
const since = new Date(Date.now() - 455 * 864e5).toISOString().slice(0, 10);
// win/draw/loss table from published ratings only
const model = outcomeModel(games.filter((g) => g.status === "completed"), rating, since);
// Published ratings need 10+ games; early in the season many MLS NEXT teams have fewer.
// For predictions only, teams with 3–9 games get a provisional rating from the same
// model (flagged "few games"); published ratings are unchanged.
const provisional = new Set<number>();
for (const r of calculateRankings(games.map((g) => ({ ...g, status: "completed" as const })), { minGames: 3 }))
  if (!rating.has(r.teamId)) { rating.set(r.teamId, r.score); provisional.add(r.teamId); }
const teamById = new Map(teams.map((t) => [t.id, t]));


// ---- tracker name → our team id, learned from played games (same date, event, score) ----
const byKey = new Map<string, Array<[number, number]>>();
for (const g of games) {
  if (g.status !== "completed" || !/^mls next/i.test(g.tournamentName ?? "")) continue;
  const k = `${g.date}|${g.tournamentName}|${g.team1Score}-${g.team2Score}`;
  byKey.set(k, [...(byKey.get(k) ?? []), [g.team1Id, g.team2Id]]);
  const r = `${g.date}|${g.tournamentName}|${g.team2Score}-${g.team1Score}`;
  byKey.set(r, [...(byKey.get(r) ?? []), [g.team2Id, g.team1Id]]);
}
const GENERIC = new Set(["fc", "sc", "soccer", "club", "the", "academy", "football", "united", "city", "youth", "association", "de", "cf", "ac"]);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !GENERIC.has(w));
const clubFits = (club: string, id: number) => {
  const t = teamById.get(id); if (!t) return false;
  const hay = `${t.sourceName ?? ""} ${t.name} ${t.club}`.toLowerCase();
  const w = words(club);
  return w.length === 0 ? hay.includes(club.toLowerCase()) : w.some((x) => hay.includes(x));
};
const votes = new Map<string, Map<number, number>>();
const vote = (name: string, id: number) => {
  const m = votes.get(name) ?? new Map<number, number>(); m.set(id, (m.get(id) ?? 0) + 1); votes.set(name, m);
};
for (const g of all) {
  if (!g.completed) continue;
  // same day, event and score, and both teams' records name the right clubs; only an
  // unambiguous match teaches anything
  const c = (byKey.get(`${g.date}|${g.eventName}|${g.homeScore}-${g.awayScore}`) ?? [])
    .filter(([h, a]) => clubFits(g.homeClub, h) && clubFits(g.awayClub, a));
  if (c.length === 1) { vote(g.homeTeam, c[0][0]); vote(g.awayTeam, c[0][1]); }
}
const westIds = new Set(teams.filter((t) => t.region === "Region4").map((t) => t.id));
const idOf = new Map<string, number>();
// 1) by name: the data build names these teams by birth year for the season
//    ("Ventura County Fusion MLS NEXT U19" → "… MLS NEXT B2008" in 2026-27)
const bySource = new Map<string, number>();
for (const t of teams) if (t.sourceName) bySource.set(t.sourceName, t.id);
const seasonEnd = 2027;
for (const name of new Set(all.flatMap((g) => [g.homeTeam, g.awayTeam]))) {
  const id = bySource.get(name.replace(/ U(\d{1,2})$/, (_m, a: string) => ` B${seasonEnd - Number(a)}`));
  if (id !== undefined) idOf.set(name, id);
}
// 2) by result, for teams merged into another record (their GotSport twin)
for (const [name, m] of votes) if (!idOf.has(name)) idOf.set(name, [...m].sort((a, b) => b[1] - a[1])[0][0]);

// ---- tables ----
type Row = { name: string; club: string; teamId: number | null; rating: number | null; assumed: boolean; provisional: boolean;
  p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number };
const confKey = (g: TrackerGame) => `${g.division}|${g.ageGroup}|${g.conference}`;
const league = all.filter((g) => !g.flex && !g.proPathway);
const confs = new Map<string, TrackerGame[]>();
for (const g of league) confs.set(confKey(g), [...(confs.get(confKey(g)) ?? []), g]);

const median = (xs: number[]) => { const v = [...xs].sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : 0; };
const ppm = (r: { pts: number; p: number }) => (r.p ? r.pts / r.p : 0);
const round = (x: number, n = 3) => Math.round(x * 10 ** n) / 10 ** n;

interface Pick { matchId: number; date: string; startTime: string; home: string; away: string; homeTeamId: number | null; awayTeamId: number | null;
  win: number; draw: number; loss: number; margin: number; location: string | null; kind: "league" | "flex" | "pro-pathway"; noData: boolean }

const ratingOrMedian = (name: string, fallback: number) => {
  const id = idOf.get(name); const r = id !== undefined ? rating.get(id) : undefined;
  return { id: id ?? null, r: r ?? null, use: r ?? fallback };
};

const out: Array<{ division: string; ageGroup: string; conference: string; west: boolean; teams: Array<Row & { ppm: number; expPpm: number; first: number; top4: number; remaining: number }>; upcoming: Pick[] }> = [];
const log: Record<string, { predictedAt: string; date: string; home: string; away: string; win: number; draw: number; loss: number }> =
  fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, "utf8")) : {};

for (const [key, list] of [...confs].sort()) {
  const [division, ageGroup, conference] = key.split("|");
  const names = new Set(list.flatMap((g) => [g.homeTeam, g.awayTeam]));
  const rated = [...names].map((n) => { const id = idOf.get(n); return id !== undefined ? rating.get(id) : undefined; }).filter((x): x is number => x !== undefined);
  const med = median(rated);
  const rows = new Map<string, Row>();
  for (const n of names) {
    const x = ratingOrMedian(n, med);
    const g0 = list.find((g) => g.homeTeam === n) ?? list.find((g) => g.awayTeam === n)!;
    rows.set(n, { name: n, club: g0.homeTeam === n ? g0.homeClub : g0.awayClub, teamId: x.id, rating: x.r, assumed: x.r === null, provisional: x.id !== null && provisional.has(x.id),
      p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
  }
  const apply = (r: Row, mine: number, theirs: number) => {
    r.p++; r.gf += mine; r.ga += theirs;
    if (mine > theirs) { r.w++; r.pts += 3; } else if (mine === theirs) { r.d++; r.pts += 1; } else r.l++;
  };
  for (const g of list) if (g.completed) { apply(rows.get(g.homeTeam)!, g.homeScore!, g.awayScore!); apply(rows.get(g.awayTeam)!, g.awayScore!, g.homeScore!); }

  // remaining league games (today on); unplayed games already in the past are left out
  const rest = list.filter((g) => !g.completed && g.date >= today);
  const probs = rest.map((g) => model(rows.get(g.homeTeam)!.rating ?? med, rows.get(g.awayTeam)!.rating ?? med));
  const first = new Map<string, number>(), top4 = new Map<string, number>(), sumPpm = new Map<string, number>();
  const base = [...rows.values()];
  for (let run = 0; run < RUNS; run++) {
    const pts = new Map(base.map((r) => [r.name, r.pts])), p = new Map(base.map((r) => [r.name, r.p]));
    rest.forEach((g, i) => {
      const o = probs[i], u = Math.random();
      const [h, a] = u < o.win ? [3, 0] : u < o.win + o.draw ? [1, 1] : [0, 3];
      pts.set(g.homeTeam, pts.get(g.homeTeam)! + h); pts.set(g.awayTeam, pts.get(g.awayTeam)! + a);
      p.set(g.homeTeam, p.get(g.homeTeam)! + 1); p.set(g.awayTeam, p.get(g.awayTeam)! + 1);
    });
    const order = base.map((r) => ({ n: r.name, v: (p.get(r.name)! ? pts.get(r.name)! / p.get(r.name)! : 0) + Math.random() * 1e-6 }))
      .sort((a, b) => b.v - a.v);
    order.forEach((x, i) => {
      if (i === 0) first.set(x.n, (first.get(x.n) ?? 0) + 1);
      if (i < 4) top4.set(x.n, (top4.get(x.n) ?? 0) + 1);
      sumPpm.set(x.n, (sumPpm.get(x.n) ?? 0) + x.v);
    });
  }

  // upcoming games for this conference's teams: league games, plus their Flex / Pro Pathway games
  const confTeams = names;
  const upcoming: Pick[] = all
    .filter((g) => !g.completed && g.date >= today && g.date <= until && g.division === division && g.ageGroup === ageGroup &&
      (confKey(g) === key || (g.flex || g.proPathway) && (confTeams.has(g.homeTeam) || confTeams.has(g.awayTeam))))
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map((g) => {
      const h = ratingOrMedian(g.homeTeam, med), a = ratingOrMedian(g.awayTeam, med);
      const o = model(h.use, a.use);
      return { matchId: g.matchId, date: g.date, startTime: g.startTime, home: g.homeClub, away: g.awayClub,
        homeTeamId: h.id, awayTeamId: a.id, win: round(o.win), draw: round(o.draw), loss: round(o.loss), margin: round(o.margin, 2),
        location: g.location, kind: g.flex ? "flex" : g.proPathway ? "pro-pathway" : "league", noData: h.r === null || a.r === null };
    });
  for (const u of upcoming) if (!log[u.matchId]) log[u.matchId] = { predictedAt: today, date: u.date, home: u.home, away: u.away, win: u.win, draw: u.draw, loss: u.loss };

  // a Western conference: most of its matched teams are Region IV teams
  const ids = base.map((r) => r.teamId).filter((x): x is number => x !== null);
  const west = ids.length > 0 && ids.filter((id) => westIds.has(id)).length / ids.length >= 0.5;
  out.push({
    division, ageGroup, conference, west, upcoming,
    teams: base.map((r) => ({ ...r, ppm: round(ppm(r), 2), expPpm: round(sumPpm.get(r.name)! / RUNS, 2), first: round((first.get(r.name) ?? 0) / RUNS),
      top4: round((top4.get(r.name) ?? 0) / RUNS), remaining: rest.filter((g) => g.homeTeam === r.name || g.awayTeam === r.name).length }))
      .sort((a, b) => b.expPpm - a.expPpm),
  });
}

// conferences that haven't started at some ages: decide West from the conference's other ages
{
  const share = new Map<string, { w: number; n: number }>();
  for (const c of out) for (const t of c.teams) if (t.teamId !== null) {
    const k = `${c.division}|${c.conference}`, x = share.get(k) ?? { w: 0, n: 0 };
    x.n++; if (westIds.has(t.teamId)) x.w++; share.set(k, x);
  }
  for (const c of out) { const x = share.get(`${c.division}|${c.conference}`); if (x && x.n) c.west = x.w / x.n >= 0.5; }
}

// ---- score earlier predictions against results ----
const result = new Map(all.filter((g) => g.completed).map((g) => [String(g.matchId), g]));
let n = 0, correct = 0, ll = 0;
for (const [id, p] of Object.entries(log)) {
  const g = result.get(id); if (!g) continue;
  const actual = g.homeScore! > g.awayScore! ? "win" : g.homeScore === g.awayScore ? "draw" : "loss";
  const pick = (["win", "draw", "loss"] as const).reduce((a, b) => (p[b] > p[a] ? b : a));
  n++; if (pick === actual) correct++; ll += -Math.log(Math.max(1e-6, p[actual]));
}

const unmatched = [...new Set(all.flatMap((g) => [g.homeTeam, g.awayTeam]))].filter((x) => !idOf.has(x));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(), source: "mlsnexttracker.com (league schedule)", days: DAYS,
  teams: { total: idOf.size + unmatched.length, rated: [...idOf.values()].filter((id) => rating.has(id)).length, west: [...idOf.values()].filter((id) => westIds.has(id)).length },
  score: n ? { games: n, correct, logLoss: round(ll / n) } : null,
  conferences: out,
}) + "\n");
fs.writeFileSync(LOG, JSON.stringify(log) + "\n");

const ups = out.reduce((s, c) => s + c.upcoming.length, 0);
console.log(`${out.length} conference tables · ${ups} games in the next ${DAYS} days predicted · ${idOf.size} teams matched to ratings, ${unmatched.length} not (count as their conference median)`);
if (n) console.log(`earlier predictions scored: ${correct}/${n} most-likely results right (${Math.round(100 * correct / n)}%), log loss ${round(ll / n)}`);
