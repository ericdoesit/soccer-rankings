/**
 * Data for the About page charts ("What we count").
 *
 *  - gamesByType: every completed game involving a West team, by kind of competition.
 *  - socal: ratings of Cal South teams by the league each one played most this season,
 *    per age group + gender (the league-overlap chart).
 *
 * Computed from the snapshot once per snapshot object (like getStats in data.ts).
 */
import { getDataSet } from "@/lib/data";
import fs from "fs";
import path from "path";
import { trackedByName } from "@/lib/directory/tracked";
import { discoveryFilesFor } from "@/lib/tournament-view";

/** 2026-27 season start: league membership is this season's league games only (data must be fresh) */
const SEASON_START = "2026-08-01";
/** teams in the overlap chart need this many rated games (the rankings' own minimum) */
const MIN_GAMES = 10;
/** a team counts in a league only with this many of its games there this season */
const MIN_LEAGUE_GAMES = 5;
/** summer and off-season leagues (e.g. PSSLU Summer) aren't a team's league for the season */
const OFF_SEASON = /\b(summer|winter)\b/i;

/** Leagues a SoCal team can belong to, in display order (strongest tiers first).
 *  MLS NEXT: Homegrown (+ Flex, played by Homegrown teams) vs Academy Division. Clubs with a team
 *  in each division are split into two teams by the data build (src/lib/mlsnext-divisions.ts).
 *  Its cups and showcases are events, not league play. */
const SOCAL_LEAGUES: Array<[RegExp, string]> = [
  [/^mls next\b.*\b(homegrown|flex)\b(?!.*\b(cup|showcase|fest|playoffs?)\b)/i, "MLS NEXT HD"],
  [/^mls next\b.*\bacademy division\b/i, "MLS NEXT AD"],
  [/\becnl rl\b/i, "ECNL RL"],
  [/\bpre-?ecnl\b/i, "Pre-ECNL"],
  [/\becnl\b/i, "ECNL"],
  [/girls academy aspire|\baspire league\b/i, "GA Aspire"],
  [/girls academy league/i, "GA"],
  [/development player league/i, "DPL"],
  [/elite academy league ea2\b/i, "EA2"],
  [/elite academy league ea\b/i, "EA"],
  [/^n1\b|\bn1 i\b/i, "N1"],
  [/^socal (fall|spring) league/i, "SoCal Soccer League"],
  [/^coast soccer league/i, "Coast Soccer League"],
  [/^psslu\b/i, "PSSLU"],
  [/^sgv\b.*\bleague\b/i, "SGV Soccer League"],
  [/^southwest super league/i, "Southwest Super League"],
];
export const SOCAL_LEAGUE_ORDER = [
  "MLS NEXT HD", "MLS NEXT AD", "ECNL", "ECNL RL", "Pre-ECNL", "GA", "GA Aspire", "EA", "EA2", "DPL", "N1",
  "SoCal Pre-Elite", "SoCal F1", "SoCal F2", "SoCal F3", "SoCal F4", "SoCal Soccer League",
  "Coast Soccer League", "PSSLU", "SGV Soccer League", "Southwest Super League",
];
/** SoCal Soccer League's flights (its top tier for older ages is N1 West District 3, a league of its own) */
export const SOCAL_FLIGHTS = ["SoCal Pre-Elite", "SoCal F1", "SoCal F2", "SoCal F3", "SoCal F4"];
/** "BU13 - F2 West" → "SoCal F2"; "Pre-Elite Division I" → "SoCal Pre-Elite"; "F3/4 East" → "SoCal F3" */
function socalFlight(division: string): string | null {
  const d = division.split(" - ").slice(1).join(" - ") || division;
  if (/pre[- ]?elite/i.test(d)) return "SoCal Pre-Elite";
  const f = d.match(/\bF([1-4])\b/);
  return f ? `SoCal F${f[1]}` : null;
}
/** GotSport team id → SoCal League flight, from this season's schedule files (data/discovery) */
function socalFlights(eventNames: Iterable<string>): Map<number, string> {
  const out = new Map<number, string>();
  for (const name of eventNames) for (const f of discoveryFilesFor(name)) {
    try {
      for (const g of JSON.parse(fs.readFileSync(f, "utf8")) as Array<{ division?: string; homeTeamId?: number; awayTeamId?: number }>) {
        const fl = g.division ? socalFlight(g.division) : null;
        if (!fl) continue;
        for (const id of [g.homeTeamId, g.awayTeamId]) if (id && !out.has(id)) out.set(id, fl);
      }
    } catch { /* skip */ }
  }
  return out;
}
const socalLeagueOf = (name: string) => SOCAL_LEAGUES.find(([re]) => re.test(name))?.[1] ?? null;

const ELITE = new Set(["MLS NEXT", "Elite Academy League", "USL Academy", "Girls Academy", "GA Aspire", "DPL", "ECNL", "N1", "USYS National League", "Multi-state league / NPL Finals"]);
export const GAME_TYPES = ["Elite & national leagues", "State & local leagues", "Tournaments & showcases", "State Cups & championships"] as const;
export function gameType(name: string): (typeof GAME_TYPES)[number] {
  const t = trackedByName(name ?? "");
  if (t && ELITE.has(t)) return "Elite & national leagues";
  if (t === "State Cup" || t === "Championship") return "State Cups & championships";
  if (/\bleague\b/i.test(name ?? "")) return "State & local leagues";
  return "Tournaments & showcases";
}

export interface AboutCharts {
  gamesByType: Array<{ type: string; games: number }>;
  westGames: number;
  competitions: number;
  /** "U15|Boys" → league → ratings (1 decimal) */
  socal: Record<string, Record<string, number[]>>;
  socalTeams: number;
}

/**
 * Cal South team → its league this season: the league it played most (ties: the stronger tier,
 * by display order), with MIN_LEAGUE_GAMES there; summer and winter leagues don't count.
 * Shared with scripts/league-ranges.ts so the ranges describe the same teams as the charts.
 */
export function socalLeagueMembership(data: { teams: Array<{ id: number; state?: string; gotsportTeamId?: number }>; games: Array<{ team1Id: number; team2Id: number; date: string; status?: string; tournamentName?: string | null }> }): Map<number, string> {
  const casTeams = new Set(data.teams.filter((t) => t.state === "CAS").map((t) => t.id));
  const leagueGames = new Map<number, Map<string, number>>();
  const socalEvents = new Set<string>();
  for (const g of data.games) {
    if (g.status !== "completed" || !g.date || g.date < SEASON_START) continue;
    const league = socalLeagueOf(g.tournamentName ?? "");
    if (!league || OFF_SEASON.test(g.tournamentName ?? "")) continue;
    if (league === "SoCal Soccer League") socalEvents.add(g.tournamentName!);
    for (const id of [g.team1Id, g.team2Id]) {
      if (!casTeams.has(id)) continue;
      const m = leagueGames.get(id) ?? new Map<string, number>();
      m.set(league, (m.get(league) ?? 0) + 1);
      leagueGames.set(id, m);
    }
  }
  const primary = new Map<number, string>();
  for (const [id, m] of leagueGames) {
    const [best, n] = [...m].sort((a, b) => b[1] - a[1] || SOCAL_LEAGUE_ORDER.indexOf(a[0]) - SOCAL_LEAGUE_ORDER.indexOf(b[0]))[0];
    if (n >= MIN_LEAGUE_GAMES) primary.set(id, best);
  }
  // SoCal League teams by flight (a team whose flight isn't in the schedule files stays "SoCal Soccer League")
  const flights = socalFlights(socalEvents);
  const gs = new Map(data.teams.map((t) => [t.id, t.gotsportTeamId]));
  for (const [id, l] of primary) {
    if (l !== "SoCal Soccer League") continue;
    const fl = flights.get(gs.get(id) ?? -1);
    if (fl) primary.set(id, fl);
  }
  return primary;
}

const cache = new WeakMap<object, AboutCharts>();
export function getAboutCharts(): AboutCharts {
  const data = getDataSet();
  const hit = cache.get(data);
  if (hit) return hit;

  const teamById = new Map(data.teams.map((t) => [t.id, t]));
  const west = (id: number) => teamById.get(id)?.region === "Region4";

  const byType = new Map<string, number>();
  const comps = new Set<string>();
  let westGames = 0;
  for (const g of data.games) {
    if (g.status !== "completed" || !(west(g.team1Id) || west(g.team2Id))) continue;
    westGames++;
    if (g.tournamentName) comps.add(g.tournamentName);
    const type = gameType(g.tournamentName);
    byType.set(type, (byType.get(type) ?? 0) + 1);
  }
  const primary = socalLeagueMembership(data);
  const rating = new Map(data.rankings.filter((r) => r.gamesPlayed >= MIN_GAMES).map((r) => [r.teamId, r.score]));
  const socal: AboutCharts["socal"] = {};
  let socalTeams = 0;
  for (const [id, league] of primary) {
    const t = teamById.get(id)!;
    const r = rating.get(id);
    if (r === undefined || !Number.isFinite(r) || t.ageGroup === "U19+") continue;
    const key = `${t.ageGroup}|${t.gender}`;
    ((socal[key] ??= {})[league] ??= []).push(Math.round(r * 10) / 10);
    socalTeams++;
  }

  const out: AboutCharts = {
    gamesByType: GAME_TYPES.map((type) => ({ type, games: byType.get(type) ?? 0 })),
    westGames,
    competitions: comps.size,
    socal,
    socalTeams,
  };
  cache.set(data, out);
  return out;
}

/** data/league-ranges.json (scripts/league-ranges.ts): how sure each league's level is */
export interface LeagueRanges {
  builtAt: string;
  replicates: number;
  /** "U15|Boys" → league → median rating, its 80% range over the replicates, teams, games vs other leagues */
  ranges: Record<string, Record<string, { median: number; lo: number; hi: number; teams: number; crossGames: number }>>;
  /** the events with the most cross-league games, each dropped once: league median shifts */
  events: Array<{ event: string; crossGames: number; shifts: Record<string, Record<string, number>> }>;
}
let rangesCache: { mtime: number; value: LeagueRanges | null } | null = null;
export function getLeagueRanges(): LeagueRanges | null {
  const file = path.join(process.cwd(), "data", "league-ranges.json");
  try {
    const mtime = fs.statSync(file).mtimeMs;
    if (rangesCache?.mtime === mtime) return rangesCache.value;
    rangesCache = { mtime, value: JSON.parse(fs.readFileSync(file, "utf8")) as LeagueRanges };
    return rangesCache.value;
  } catch { return null; }
}
