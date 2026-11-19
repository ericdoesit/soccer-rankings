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
import { trackedByName } from "@/lib/directory/tracked";

/** 2026-27 season start: league membership is this season's league games only (data must be fresh) */
const SEASON_START = "2026-08-01";
/** teams in the overlap chart need this many rated games (the rankings' own minimum) */
const MIN_GAMES = 10;

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
];
export const SOCAL_LEAGUE_ORDER = [
  "MLS NEXT HD", "MLS NEXT AD", "ECNL", "ECNL RL", "Pre-ECNL", "GA", "GA Aspire", "EA", "EA2", "DPL", "N1",
  "SoCal Soccer League", "Coast Soccer League", "PSSLU",
];
const socalLeagueOf = (name: string) => SOCAL_LEAGUES.find(([re]) => re.test(name))?.[1] ?? null;

const ELITE = new Set(["MLS NEXT", "Elite Academy League", "USL Academy", "Girls Academy", "GA Aspire", "DPL", "ECNL", "N1", "USYS National League", "Multi-state league / NPL Finals"]);
export const GAME_TYPES = ["Elite & national leagues", "State & local leagues", "Tournaments & showcases", "State Cups & championships"] as const;
function gameType(name: string): (typeof GAME_TYPES)[number] {
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

const cache = new WeakMap<object, AboutCharts>();
export function getAboutCharts(): AboutCharts {
  const data = getDataSet();
  const hit = cache.get(data);
  if (hit) return hit;

  const teamById = new Map(data.teams.map((t) => [t.id, t]));
  const west = (id: number) => teamById.get(id)?.region === "Region4";
  const cas = (id: number) => teamById.get(id)?.state === "CAS";

  const byType = new Map<string, number>();
  const comps = new Set<string>();
  let westGames = 0;
  const leagueGames = new Map<number, Map<string, number>>();
  for (const g of data.games) {
    if (g.status !== "completed" || !(west(g.team1Id) || west(g.team2Id))) continue;
    westGames++;
    if (g.tournamentName) comps.add(g.tournamentName);
    const type = gameType(g.tournamentName);
    byType.set(type, (byType.get(type) ?? 0) + 1);
    if (!g.date || g.date < SEASON_START) continue;
    const league = socalLeagueOf(g.tournamentName ?? "");
    if (!league) continue;
    for (const id of [g.team1Id, g.team2Id]) {
      if (!cas(id)) continue;
      const m = leagueGames.get(id) ?? new Map<string, number>();
      m.set(league, (m.get(league) ?? 0) + 1);
      leagueGames.set(id, m);
    }
  }

  // each team counts in the league it played most (ties: the stronger tier, by display order)
  const primary = new Map<number, string>();
  for (const [id, m] of leagueGames) {
    const best = [...m].sort((a, b) => b[1] - a[1] || SOCAL_LEAGUE_ORDER.indexOf(a[0]) - SOCAL_LEAGUE_ORDER.indexOf(b[0]))[0][0];
    primary.set(id, best);
  }
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
