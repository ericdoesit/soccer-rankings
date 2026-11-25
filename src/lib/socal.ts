/**
 * Southern California rankings: every Cal South team, not only those in tracked competitions.
 *
 * Backtest (scripts/backtest-socal.ts, 2026-11-25, 47K Southern California games over three folds):
 * games between state-league teams (SoCal League, Coast …) are predicted at least as well as games
 * between elite-league teams (log loss 0.746 vs 0.816), and in elite-vs-state-league games the
 * state-league side earned 0.05 points a game less than expected, i.e. the leagues sit at the right
 * level relative to each other. So here a team needs only enough games (RANK_RULES.minGames in the
 * last 15 months) and a game this season; select / international / aged-out teams stay out.
 *
 * Club strength: ratings run on different scales by age (U8 teams sit far below U19), so a club's
 * score is the average percentile (0–100) of its best team in each age group it fields, among the
 * Southern California teams of that age and gender. Clubs need teams in 3+ age groups, and a club
 * page: a team GotSport lists without a club gets a fragment of its own name as "club" ("B19 Gold",
 * "JALA BU8"), which is not a club (424 of 791 names, 2026-11-25). Those teams are still ranked.
 */
import { getDataSet, RANK_RULES, type Team } from "./data";
import { clubSlugFor } from "./explore";

export const SOCAL_AGES = ["U8", "U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17", "U18", "U19"] as const;
export type SoCalGender = "Boys" | "Girls";
export interface SoCalTeam {
  id: number; name: string; club: string; ageGroup: string; gender: string;
  rating: number; rank: number; league: string; record: string; games: number; westRank: number | null;
}
export interface SoCalClub {
  /** club page address (/club/<slug>); only confirmed clubs are ranked */
  club: string; slug: string; rank: number; strength: number; ageGroups: number; teams: number;
  best: { ageGroup: string; gender: string; percentile: number; teamId: number } | null; leagues: string[];
}

/** reasons a Cal South team is left out here too (not a club team, or not a current youth team) */
const OUT = /select team|state select|outside the West|aged out|Hawaii/;
const MIN_CLUB_AGES = 3;

let cache: { teams: SoCalTeam[]; byKey: Map<string, SoCalTeam[]> } | null = null;

function build() {
  const ds = getDataSet();
  const score = new Map(ds.rankings.map((r) => [r.teamId, r.score]));
  const since = new Date(Date.now() - 455 * 864e5).toISOString().slice(0, 10);
  const now = new Date();
  const seasonStart = `${now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1}-08-01`;
  const stat = new Map<number, { recent: number; w: number; l: number; d: number; season: number; comps: Map<string, number> }>();
  const get = (id: number) => { let x = stat.get(id); if (!x) { x = { recent: 0, w: 0, l: 0, d: 0, season: 0, comps: new Map() }; stat.set(id, x); } return x; };
  for (const g of ds.games) {
    if (!g.date || g.date < since) continue;
    for (const [me, mine, theirs] of [[g.team1Id, g.team1Score, g.team2Score], [g.team2Id, g.team2Score, g.team1Score]] as const) {
      const x = get(me);
      x.recent++;
      if (g.date < seasonStart) continue;
      x.season++;
      if (mine > theirs) x.w++; else if (mine < theirs) x.l++; else x.d++;
      const comp = (g.tournamentName ?? "").replace(/\s*\b(19|20)\d{2}\b.*$|\s*\d{2}\/\d{2}.*$/, "").trim();
      if (/league|liga/i.test(comp)) x.comps.set(comp, (x.comps.get(comp) ?? 0) + 1);
    }
  }
  // the West rankings' own order, for "also #N in the West"
  const west = new Map<string, Team[]>();
  for (const t of ds.teams) if (t.rankable) west.set(`${t.ageGroup}|${t.gender}`, [...(west.get(`${t.ageGroup}|${t.gender}`) ?? []), t]);
  const westRank = new Map<number, number>();
  for (const list of west.values()) list.sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0)).forEach((t, i) => westRank.set(t.id, i + 1));

  const teams: SoCalTeam[] = [];
  for (const t of ds.teams) {
    const x = stat.get(t.id), r = score.get(t.id);
    if (t.state !== "CAS" || t.region !== "Region4" || r === undefined || !x) continue;
    if (!(SOCAL_AGES as readonly string[]).includes(t.ageGroup) || (t.notRankedReason && OUT.test(t.notRankedReason))) continue;
    if (x.recent < RANK_RULES.minGames || x.season < 1) continue;
    const topComp = [...x.comps].sort((a, b) => b[1] - a[1])[0]?.[0];
    teams.push({
      id: t.id, name: t.name, club: t.club, ageGroup: t.ageGroup, gender: t.gender, rating: r, rank: 0,
      league: t.program ?? topComp ?? "Tournaments", record: `${x.w}-${x.l}-${x.d}`, games: x.season, westRank: westRank.get(t.id) ?? null,
    });
  }
  const byKey = new Map<string, SoCalTeam[]>();
  for (const t of teams) byKey.set(`${t.ageGroup}|${t.gender}`, [...(byKey.get(`${t.ageGroup}|${t.gender}`) ?? []), t]);
  for (const list of byKey.values()) list.sort((a, b) => b.rating - a.rating).forEach((t, i) => { t.rank = i + 1; });
  return { teams, byKey };
}
const data = () => (cache ??= build());

export function getSoCalTeams(ageGroup: string, gender: SoCalGender): SoCalTeam[] {
  return data().byKey.get(`${ageGroup}|${gender}`) ?? [];
}

/** clubs by strength; one age group: its best team's percentile there; all ages: the average over its age groups */
export function getSoCalClubs(gender: SoCalGender | "All", ageGroup: string | "All"): SoCalClub[] {
  const { byKey } = data();
  const per = new Map<string, Array<{ ageGroup: string; gender: string; percentile: number; teamId: number }>>();
  const teams = new Map<string, number>();
  const leagues = new Map<string, Set<string>>();
  for (const [key, list] of byKey) {
    const [age, g] = key.split("|");
    if ((gender !== "All" && g !== gender) || (ageGroup !== "All" && age !== ageGroup)) continue;
    const seen = new Set<string>();
    list.forEach((t, i) => {
      teams.set(t.club, (teams.get(t.club) ?? 0) + 1);
      leagues.set(t.club, (leagues.get(t.club) ?? new Set()).add(t.league));
      if (seen.has(t.club)) return; // only the club's best team in this age group
      seen.add(t.club);
      const percentile = list.length > 1 ? 100 * (1 - i / (list.length - 1)) : 100;
      per.set(t.club, [...(per.get(t.club) ?? []), { ageGroup: age, gender: g, percentile, teamId: t.id }]);
    });
  }
  const minAges = ageGroup === "All" ? MIN_CLUB_AGES : 1;
  const clubs: SoCalClub[] = [...per].filter(([club, xs]) => xs.length >= minAges && clubSlugFor(club)).map(([club, xs]) => ({
    club, slug: clubSlugFor(club)!, rank: 0, strength: Math.round(10 * xs.reduce((s, x) => s + x.percentile, 0) / xs.length) / 10,
    ageGroups: xs.length, teams: teams.get(club) ?? 0,
    best: xs.reduce((a, b) => (b.percentile > a.percentile ? b : a)),
    leagues: [...(leagues.get(club) ?? [])].sort(),
  }));
  clubs.sort((a, b) => b.strength - a.strength || b.ageGroups - a.ageGroups);
  clubs.forEach((c, i) => { c.rank = i + 1; });
  return clubs;
}
