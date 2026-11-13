import fs from "fs";
import path from "path";
import { getDataSet, type DataSet } from "@/lib/data";
import { LEAGUES } from "@/lib/directory/leagues";

/**
 * Rankings inside one league (SoCal Soccer League, NorCal Premier, …): every rated team that
 * plays this season's league event(s), ranked by rating within its age group + gender, with
 * its division and league record. Unlike the main rankings, a team doesn't need tracked
 * competitions to appear here: these are for clubs comparing themselves within their league.
 */
export interface LeagueRankRow {
  rank: number; teamId: number; name: string; club: string; ageGroup: string; gender: string;
  rating: number; division: string | null; w: number; d: number; l: number;
  /** flight level for filtering: SoCal "F1"–"F4", NorCal "Premier" / "Gold" / "Silver" / "Bronze" */
  level: string | null;
  /** listed in the main West rankings */
  westListed: boolean;
}
export interface LeagueRankings {
  season: string; events: string[];
  groups: Map<string, LeagueRankRow[]>; // "U13|Boys" → rows
  unrated: number;
}

/** Leagues with a rankings view (shown in the Leagues menu) */
export const RANKED_LOCAL_LEAGUES = ["socal-soccer-league", "norcal-premier"];

const cache = new WeakMap<DataSet, Map<string, LeagueRankings | null>>();

/** "U13B BU13 - F1 Central" → "BU13 - F1 Central"; "U9B Bronze Central - Region 6" → "Bronze Central - Region 6" */
const cleanDivision = (d: string) => d.replace(/^U\d{1,2}[BG]\s+/, "").trim();
const levelOf = (division: string | null) =>
  !division ? null : division.match(/\bF\d\b/)?.[0] ?? division.match(/^(Premier|Gold|Silver|Bronze|Copper|Elite|Classic|Select)\b/i)?.[1] ?? null;

export function getLeagueRankings(slug: string): LeagueRankings | null {
  const data = getDataSet();
  let byLeague = cache.get(data);
  if (!byLeague) { byLeague = new Map(); cache.set(data, byLeague); }
  if (byLeague.has(slug)) return byLeague.get(slug)!;

  const def = LEAGUES.find((l) => l.slug === slug);
  const events = def?.gotsportEvents ?? [];
  const season = events.map(([, s]) => s).sort().at(-1);
  if (!def || !season) { byLeague.set(slug, null); return null; }
  const current = events.filter(([, s]) => s === season);
  const eventNames = new Set(current.map(([, , name]) => name));

  // division of each GotSport team in this season's league event(s)
  const divisionByGs = new Map<number, string>();
  for (const [id] of current) {
    const file = path.join(process.cwd(), "data", "discovery", "games", `${id}.json`);
    if (!fs.existsSync(file)) continue;
    for (const g of JSON.parse(fs.readFileSync(file, "utf8")) as Array<{ division?: string; homeTeamId: number; awayTeamId: number }>) {
      if (!g.division) continue;
      divisionByGs.set(g.homeTeamId, cleanDivision(g.division));
      divisionByGs.set(g.awayTeamId, cleanDivision(g.division));
    }
  }

  const teamById = new Map(data.teams.map((t) => [t.id, t]));
  const rating = new Map(data.rankings.map((r) => [r.teamId, r.score]));
  const record = new Map<number, { w: number; d: number; l: number }>();
  for (const g of data.games) {
    if (!eventNames.has(g.tournamentName)) continue;
    for (const [me, a, b] of [[g.team1Id, g.team1Score, g.team2Score], [g.team2Id, g.team2Score, g.team1Score]]) {
      const r = record.get(me) ?? { w: 0, d: 0, l: 0 };
      if (a > b) r.w++; else if (a < b) r.l++; else r.d++;
      record.set(me, r);
    }
  }

  const groups = new Map<string, LeagueRankRow[]>();
  let unrated = 0;
  for (const [id, r] of record) {
    const t = teamById.get(id);
    if (!t || t.region !== "Region4") continue;
    const score = rating.get(id);
    if (score === undefined) { unrated++; continue; }
    const key = `${t.ageGroup}|${t.gender}`;
    const rows = groups.get(key) ?? [];
    rows.push({
      rank: 0, teamId: id, name: t.name, club: t.club, ageGroup: t.ageGroup, gender: t.gender, rating: score,
      division: (t.gotsportTeamId !== undefined ? divisionByGs.get(t.gotsportTeamId) : undefined) ?? null,
      level: null,
      ...r, westListed: !!t.rankable,
    });
    groups.set(key, rows);
  }
  for (const rows of groups.values()) {
    for (const r of rows) r.level = levelOf(r.division);
    rows.sort((a, b) => b.rating - a.rating);
    rows.forEach((r, i) => { r.rank = i + 1; });
  }
  const result = { season, events: [...eventNames], groups, unrated };
  byLeague.set(slug, result);
  return result;
}
