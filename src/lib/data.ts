import * as fs from "fs";
import * as path from "path";
import { generateFullSampleData } from "./sample-data";
import { calculateRankings, type RankingResult } from "./ranking/massey";
import { loadGotsportData, hasRealData, inferAgeAndGender, type RealTeam } from "./import-gotsport-data";
import { trackedCompetitions } from "./directory/tracked";
import { mergeModularTwins, mergeTournamentCopies } from "./directory/merge-twins";
import { buildTeamIdentity } from "./directory/team-identity";
import { joinUslAcademySeasons } from "./directory/usl-academy";
import { assignPrograms, PROGRAMS } from "./directory/program";

export interface Team {
  id: number;
  name: string;
  club: string;
  state: string;
  region: string;
  ageGroup: string;
  gender: "Boys" | "Girls";
  /** the name as the source wrote it ("COSC Jaguars 2015"); `name` is the display name */
  sourceName?: string;
  /** GotSport team_id when the team came from the GotSport API */
  gotsportTeamId?: number;
  /** true when the club comes from the GotSport directory, a league club list or a club-name match */
  clubVerified?: boolean;
  /** played a tracked competition (src/lib/directory/tracked.ts) in the last 15 months: listed in rankings */
  tracked?: boolean;
  /** the tracked competitions that qualified it ("N1", "State Cup", …) */
  trackedVia?: string[];
  /** passes every ranking hurdle (see RANK_RULES): listed in rankings */
  rankable?: boolean;
  /** first hurdle it failed, for "unranked" explanations */
  notRankedReason?: string;
  /** elite league it plays in ("ECNL", "MLS NEXT AD", …; directory/program.ts) */
  program?: string;
}

export interface Game {
  id: number;
  team1Id: number;
  team2Id: number;
  team1Score: number;
  team2Score: number;
  date: string;
  tournamentName: string;
  status: "completed" | "forfeited" | "cancelled";
}

export interface RankedTeam extends Team {
  score: number;
  rank: number;
  previousRank: number | null;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface TeamDetail extends RankedTeam {
  games: GameWithOpponent[];
}

export interface GameWithOpponent {
  id: number;
  opponentId: number;
  opponentName: string;
  opponentClub: string;
  teamScore: number;
  opponentScore: number;
  date: string;
  tournamentName: string;
  result: "W" | "L" | "D";
}

export interface MatchDetail {
  id: number;
  team1: Team;
  team2: Team;
  team1Score: number;
  team2Score: number;
  date: string;
  tournamentName: string;
  team1Ranking: RankingResult | null;
  team2Ranking: RankingResult | null;
  team1Form: GameWithOpponent[];
  team2Form: GameWithOpponent[];
  h2hGames: Game[];
}

const TOURNAMENTS = [
  "Dallas Cup",
  "Surf Cup",
  "Jefferson Cup",
  "Disney Showcase",
  "Potomac Memorial",
  "National League",
  "State Cup",
  "ECNL Playoffs",
  "GA Cup",
  "NPL Finals",
];

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export interface DataSet {
  teams: Team[];
  games: Game[];
  rankings: RankingResult[];
}

let _cache: DataSet | null = null;

// Precomputed output of buildData(), written by `npm run build:data`.
// Loading it takes well under a second, versus parsing ~470MB of raw scraped
// JSON and solving Massey ratings on every cold start.
export const SNAPSHOT_FILE = path.join(process.cwd(), "data", "snapshot.json");

export function getDataSet(): DataSet { return getData(); }

/** mtime of the snapshot _cache was read from, and when it was last checked */
let _cacheMtime = 0;
let _checkedAt = 0;

function getData(): DataSet {
  // After `npm run build:data` the running server picks up the new snapshot (checked at
  // most every 10 s). Derived caches are keyed by this object, so they refresh with it.
  if (_cache && _cacheMtime && Date.now() - _checkedAt > 10_000) {
    _checkedAt = Date.now();
    try { if (fs.statSync(SNAPSHOT_FILE).mtimeMs !== _cacheMtime) _cache = null; } catch { /* keep serving */ }
  }
  if (_cache) return _cache;

  if (fs.existsSync(SNAPSHOT_FILE)) {
    try {
      const mtime = fs.statSync(SNAPSHOT_FILE).mtimeMs;
      _cache = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf-8")) as DataSet;
      _cacheMtime = mtime;
      _checkedAt = Date.now();
      return _cache;
    } catch (e) {
      console.warn("[data] Failed to read data/snapshot.json, rebuilding from raw data:", e);
    }
  } else {
    console.warn(
      "[data] data/snapshot.json not found — building from raw scraped data (slow). Run `npm run build:data`."
    );
  }

  _cache = buildData();
  return _cache;
}

/** Load all raw scraped sources and compute rankings. Slow; see SNAPSHOT_FILE. */
/** Rankings list only teams with a tracked-competition game in this many days (15 months). */
const TRACKED_DAYS = 455;

/** Flag teams that played a tracked competition recently (see directory/tracked.ts). */
function markTracked(teams: Team[], games: Game[]): { teams: Team[]; stats: string } {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const westCodes = new Set(teams.filter((t) => t.region === "Region4").map((t) => t.state));
  const comps = trackedCompetitions(games, (id) => { const t = byId.get(id); return t?.region === "Region4" ? t.state : undefined; }, westCodes);
  const since = new Date(Date.now() - TRACKED_DAYS * 864e5).toISOString().slice(0, 10);
  const via = new Map<number, Set<string>>();
  for (const g of games) {
    const reason = comps.get(g.tournamentName);
    if (!reason || !g.date || g.date < since) continue;
    for (const id of [g.team1Id, g.team2Id]) via.set(id, (via.get(id) ?? new Set()).add(reason));
  }
  const reasons = new Map<string, number>();
  for (const r of comps.values()) reasons.set(r, (reasons.get(r) ?? 0) + 1);
  const out = teams.map((t) => {
    const v = via.get(t.id);
    return v ? { ...t, tracked: true, trackedVia: [...v].sort() } : { ...t, tracked: false };
  });
  const n = out.filter((t) => t.tracked && t.region === "Region4").length;
  return { teams: out, stats: `${comps.size} tracked competitions (${[...reasons].map(([r, c]) => `${r} ${c}`).join(", ")}) · ${n} West teams tracked` };
}

/**
 * Hurdles a team must clear to be listed (user decision 2026-11-11): one team can
 * look excellent against weak, isolated competition. Teams that miss a hurdle keep
 * their rating and stay in the directory as unranked.
 */
export const RANK_RULES = {
  /** isolated from the mainland: rated, in the directory, not ranked */
  excludedStates: new Set(["HI"]),
  /** rated games in the last 15 months */
  minGames: 10,
  /** of those, games in tracked competitions (elite leagues, N1, State Cups, …) */
  minTrackedGames: 4,
  /** games against opponents who themselves play tracked competitions */
  minQualityOpponentGames: 5,
  /** average opponent rating must be above this percentile of its age group + gender */
  minSchedulePercentile: 0.2,
  /** games this season (from Aug 1). A team that hasn't played may have folded, merged or
   *  moved leagues, so its old rating is no longer a current team's. Applies once the
   *  season is two months old (Oct 1), so nobody drops out in the first weeks. */
  minSeasonGames: 1,
  seasonGraceMonths: 2,
  /** U15 and older: high school soccer is in the fall in many West states (NM, MT, NV, OR, …),
   *  when club teams pause, so the check waits until Jan 1 */
  highSchoolGraceMonths: 5,
};

/** Aug 1 that starts the current season, and whether the grace period after it is over. */
function currentSeason(now = new Date()) {
  const y = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const start = `${y}-08-01`;
  const after = (months: number) => now >= new Date(Date.UTC(y, 7 + months, 1));
  return {
    start, label: `${y}-${String(y + 1).slice(2)}`,
    /** whether the check applies yet for a team of this age group */
    enforced: (ageGroup: string) => after(/^U(1[5-9]|20)$/.test(ageGroup) ? RANK_RULES.highSchoolGraceMonths : RANK_RULES.seasonGraceMonths),
  };
}

/** data/seed/select-teams.json: composite showcase teams that aren't listed (see that file) */
function loadSelectTeams(): RegExp[] {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "seed", "select-teams.json"), "utf8")) as { teams: Array<{ pattern: string }> };
    return d.teams.map((t) => new RegExp(t.pattern, "i"));
  } catch { return []; }
}

function markRankable(teams: Team[], games: Game[], rankings: DataSet["rankings"]): { teams: Team[]; stats: string } {
  const selectTeams = loadSelectTeams();
  const byId = new Map(teams.map((t) => [t.id, t]));
  const score = new Map(rankings.map((r) => [r.teamId, r.score]));
  const since = new Date(Date.now() - TRACKED_DAYS * 864e5).toISOString().slice(0, 10);
  const westCodes = new Set(teams.filter((t) => t.region === "Region4").map((t) => t.state));
  const comps = trackedCompetitions(games, (id) => { const t = byId.get(id); return t?.region === "Region4" ? t.state : undefined; }, westCodes);
  const season = currentSeason();
  const n = new Map<number, { games: number; season: number; tracked: number; quality: number; oppSum: number; oppN: number }>();
  const get = (id: number) => { let x = n.get(id); if (!x) { x = { games: 0, season: 0, tracked: 0, quality: 0, oppSum: 0, oppN: 0 }; n.set(id, x); } return x; };
  for (const g of games) {
    if (!g.date || g.date < since) continue;
    const isTracked = comps.has(g.tournamentName);
    for (const [me, them] of [[g.team1Id, g.team2Id], [g.team2Id, g.team1Id]]) {
      const x = get(me);
      x.games++;
      if (g.date >= season.start) x.season++;
      if (isTracked) x.tracked++;
      if (byId.get(them)?.tracked) x.quality++;
      const s = score.get(them);
      if (s !== undefined) { x.oppSum += s; x.oppN++; }
    }
  }
  // schedule-strength floor per age group + gender, among rated West teams
  const sos = (id: number) => { const x = n.get(id); return x && x.oppN ? x.oppSum / x.oppN : -Infinity; };
  const floor = new Map<string, number>();
  {
    const groups = new Map<string, number[]>();
    for (const t of teams) if (t.region === "Region4" && score.has(t.id)) {
      const k = `${t.ageGroup}|${t.gender}`;
      groups.set(k, [...(groups.get(k) ?? []), sos(t.id)]);
    }
    for (const [k, v] of groups) { v.sort((a, b) => a - b); floor.set(k, v[Math.floor(v.length * RANK_RULES.minSchedulePercentile)] ?? -Infinity); }
  }
  const failed = new Map<string, number>();
  const out = teams.map((t) => {
    const x = n.get(t.id);
    const reason =
      t.region !== "Region4" ? "outside the West" :
      t.ageGroup === "U19+" ? "aged out (U19+)" :
      RANK_RULES.excludedStates.has(t.state) ? "Hawaii teams aren't ranked (too few games against mainland teams)" :
      // State ODP / EPD squads are all-star selections, not club teams: their games still
      // count for their opponents' ratings, but they aren't listed
      /\b(ODP|EPD)\b|olympic development/i.test(`${t.name} ${t.sourceName ?? ""} ${t.club}`) ? "state select team (ODP), not a club team" :
      selectTeams.some((re) => re.test(`${t.name} ${t.sourceName ?? ""}`)) ? "select team (players from several clubs), not a club team" :
      !score.has(t.id) || !x || x.games < RANK_RULES.minGames ? `fewer than ${RANK_RULES.minGames} games in the last 15 months` :
      !t.tracked || x.tracked < RANK_RULES.minTrackedGames ? `fewer than ${RANK_RULES.minTrackedGames} games in tracked competitions` :
      x.quality < RANK_RULES.minQualityOpponentGames ? `fewer than ${RANK_RULES.minQualityOpponentGames} games against ranked-level opponents` :
      season.enforced(t.ageGroup) && x.season < RANK_RULES.minSeasonGames ? `no games yet this season (${season.label})` :
      // U20 is one closed league (USL Academy): every team plays the same field, so no schedule floor
      t.ageGroup !== "U20" && sos(t.id) < (floor.get(`${t.ageGroup}|${t.gender}`) ?? -Infinity) ? "schedule too weak (bottom 20% of its age group)" :
      null;
    if (reason) failed.set(reason, (failed.get(reason) ?? 0) + 1);
    return reason ? { ...t, rankable: false, notRankedReason: reason } : { ...t, rankable: true };
  });
  const ok = out.filter((t) => t.rankable).length;
  const westFails = [...failed].filter(([r]) => r !== "outside the West");
  return { teams: out, stats: `${ok} listed · not listed: ${westFails.map(([r, c]) => `${c} ${r.split(" (")[0]}`).join("; ")}` };
}

/** Events the last buildData() dropped as outside the West (for check-snapshot). */
export let lastDroppedEvents: string[] = [];
/** Twin-merge cases left separate (2+ GotSport candidates), from the last build, for diagnostics. */
export let lastAmbiguousTwins: Array<{ team: { id: number; sourceName?: string }; candidates: Array<{ id: number; sourceName?: string }> }> = [];
/** tournament copies joined in the last build (scripts/twin-ambiguity.ts --copies) */
export let lastTournamentCopies: Array<{ into: { id: number; club: string; ageGroup: string; gender: string; sourceName?: string }; from: Array<{ id: number; sourceName?: string }> }> = [];
export const DROPPED_EVENTS_FILE = path.join(process.cwd(), "data", "snapshot-dropped-events.json");

export function buildData(): DataSet {
  // Try to use real scraped data first
  if (hasRealData()) {
    try {
      const real = loadGotsportData();

      const teams: Team[] = real.teams.map((t) => ({
        id: t.id,
        name: t.name,
        club: t.club,
        state: t.state,
        region: t.region,
        ageGroup: t.ageGroup,
        gender: t.gender,
      }));

      // Load YSG teams file for pre-computed gender/age
      const ysgTeamsFile = path.join(process.cwd(), "data", "ysg", "teams.json");
      const ysgTeamLookup = new Map<string, { gender: "Boys" | "Girls"; ageGroup: string }>();
      if (fs.existsSync(ysgTeamsFile)) {
        const ysgTeams: Array<{ name: string; gender: string; ageGroup: string }> = JSON.parse(
          fs.readFileSync(ysgTeamsFile, "utf-8")
        );
        for (const t of ysgTeams) {
          ysgTeamLookup.set(t.name, {
            gender: t.gender === "Girls" ? "Girls" : "Boys",
            ageGroup: t.ageGroup,
          });
        }
      }

      // Add teams discovered from games but not in API data
      const teamIds = new Set(teams.map((t) => t.id));
      for (const g of real.games) {
        for (const [teamName, isTeam1] of [[g.team1Name, true], [g.team2Name, false]] as const) {
          const tId = real.teamNameToId.get(teamName);
          if (tId && !teamIds.has(tId)) {
            teamIds.add(tId);
            const club = teamName.split(" ").slice(0, 2).join(" ");
            const ysgMatch = ysgTeamLookup.get(teamName);
            const { ageGroup, gender } = ysgMatch || inferAgeAndGender(teamName, g.division || "");
            teams.push({
              id: tId, name: teamName, club, state: "CAS",
              region: "Region4", ageGroup, gender,
            });
          }
        }
      }

      const games: Game[] = real.games.map((g) => ({
        id: g.id,
        team1Id: real.teamNameToId.get(g.team1Name) || 0,
        team2Id: real.teamNameToId.get(g.team2Name) || 0,
        team1Score: g.team1Score,
        team2Score: g.team2Score,
        date: g.date,
        tournamentName: g.eventName,
        status: "completed" as const,
      }));

      // Club, state, current-season age group and standard display name
      // (src/lib/directory/team-identity.ts). Identity stays keyed by id.
      const divisionByName = new Map<string, { division: string; date: string }>();
      for (const g of real.games) {
        if (!g.division) continue;
        for (const n of [g.team1Name, g.team2Name]) if (!divisionByName.has(n)) divisionByName.set(n, { division: g.division, date: g.date });
      }
      const identity = buildTeamIdentity(teams, games, real.gsIdByName, divisionByName, real.sourceAssocByName, real.mlsWestNames);
      if (real.droppedEvents.length) console.log(`  dropped ${real.droppedEvents.length} events outside the West: ${real.droppedEvents.join("; ")}`);
      console.log(`  team identity: ${identity.stats}`);

      lastDroppedEvents = real.droppedEvents;
      // Modular11 copies of GotSport teams → one team; ratings recomputed on the merged games
      const m11 = mergeModularTwins(identity.teams, games, real.modularTeamNames);
      lastAmbiguousTwins = m11.ambiguousCases;
      // tournament copies of one team (each event's own name for the club's ECNL / GA / DPL … team)
      const copies = mergeTournamentCopies(m11.teams, m11.games);
      lastTournamentCopies = copies.joins;
      // USL Academy: one program across seasons (B2006 → B2007), listed as U20
      const usl = joinUslAcademySeasons(copies.teams, copies.games);
      const twins = { ...m11, teams: usl.teams, games: usl.games };
      console.log(`  tournament copies: ${copies.merged} records joined into their team`);
      console.log(`  USL Academy: ${usl.joined} last-season records joined, ${usl.listed} teams playing this season listed as U20`);
      let rankings = real.rankings;
      if (m11.merged || copies.merged || usl.joined) {
        rankings = calculateRankings(twins.games.map((g) => ({ ...g, status: "completed" as const })), { minGames: 10 });
      }
      console.log(`  modular11 twins: ${twins.merged} merged into GotSport teams, ${twins.ambiguous} left separate (2+ candidates), ${twins.noCurrent} with only last season's teams`);
      const tracked = markTracked(twins.teams, twins.games);
      console.log(`  tracked: ${tracked.stats}`);
      const eligible = markRankable(tracked.teams, twins.games, rankings);
      console.log(`  rankable: ${eligible.stats}`);
      const programs = assignPrograms(eligible.teams, twins.games, new Date(Date.now() - TRACKED_DAYS * 864e5).toISOString().slice(0, 10));
      const withPrograms = eligible.teams.map((t) => (programs.has(t.id) ? { ...t, program: programs.get(t.id) } : t));
      console.log(`  programs: ${programs.size} teams tagged with their league`);
      return { teams: withPrograms, games: twins.games, rankings };
    } catch (e) {
      console.warn("Failed to load real data, falling back to sample:", e);
    }
  }

  // Fallback to sample data
  const { teams: sampleTeams, games: sampleGames } = generateFullSampleData();
  const rand = seededRandom(456);

  const teams: Team[] = sampleTeams.map((t) => ({
    id: t.id,
    name: t.name,
    club: t.club,
    state: t.state,
    region: t.region,
    ageGroup: t.ageGroup,
    gender: t.gender,
  }));

  const games: Game[] = sampleGames.map((g, i) => ({
    id: i + 1,
    ...g,
    tournamentName: TOURNAMENTS[Math.floor(rand() * TOURNAMENTS.length)],
  }));

  const rankings = calculateRankings(sampleGames);

  return { teams, games, rankings };
}

// ─── Lookup indexes ───────────────────────────────────────────────────────────
// Built once per loaded dataset and reused by every request. Previously each
// request scanned all teams/games (tournament pages did teams.find per game row),
// which made pages take seconds under load.
interface DataIndex {
  teamById: Map<number, Team>;
  rankingByTeam: Map<number, DataSet["rankings"][number]>;
  gameById: Map<number, Game>;
  /** completed games per team, newest first */
  gamesByTeam: Map<number, Game[]>;
  /** completed games per tournament, newest first */
  gamesByTournament: Map<string, Game[]>;
  /** every ranked team, normalized, highest score first (rank = overall rank) */
  rankedBase: RankedTeam[];
}
const indexCache = new WeakMap<DataSet, DataIndex>();

function getIndex(): DataIndex {
  const data = getData();
  const cached = indexCache.get(data);
  if (cached) return cached;
  const { teams, games, rankings } = data;
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const rankingByTeam = new Map(rankings.map((r) => [r.teamId, r]));
  const gameById = new Map(games.map((g) => [g.id, g]));
  const gamesByTeam = new Map<number, Game[]>();
  const gamesByTournament = new Map<string, Game[]>();
  const completed = games.filter((g) => g.status === "completed").sort((a, b) => b.date.localeCompare(a.date));
  for (const g of completed) {
    for (const id of [g.team1Id, g.team2Id]) {
      const list = gamesByTeam.get(id);
      if (list) list.push(g); else gamesByTeam.set(id, [g]);
    }
    if (g.tournamentName) {
      const list = gamesByTournament.get(g.tournamentName);
      if (list) list.push(g); else gamesByTournament.set(g.tournamentName, [g]);
    }
  }
  const index: DataIndex = { teamById, rankingByTeam, gameById, gamesByTeam, gamesByTournament,
    rankedBase: buildRankedBase(teams, rankings, teamById) };
  indexCache.set(data, index);
  return index;
}

export interface RankingsFilter {
  region?: string;
  ageGroup?: string;
  gender?: string;
  league?: string;
  /** elite league program ("ECNL", "MLS NEXT AD", …) */
  program?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export function getLeagues(): string[] {
  const { games } = getData();
  const leagues = new Set<string>();
  for (const g of games) {
    if (g.tournamentName) leagues.add(g.tournamentName);
  }
  return Array.from(leagues).sort();
}

// Club metadata (websites, full names)
const CLUB_META: Record<string, { fullName: string; website: string; city: string }> = {
  "Downtown Los Angeles SC": {
    fullName: "Downtown Los Angeles Soccer Club",
    website: "https://downtownlasoccerclub.com",
    city: "Los Angeles, CA",
  },
  "Las Vegas Heat Surf FC": {
    fullName: "Las Vegas Heat Surf Soccer Club",
    website: "https://lasvegasheatsurf.com",
    city: "Las Vegas, NV",
  },
  "Total Futbol Academy": {
    fullName: "Total Futbol Academy",
    website: "https://www.totalfutbolacademy.com",
    city: "Los Angeles, CA",
  },
};

export function getClubMeta(clubName: string) {
  return CLUB_META[clubName] || null;
}

// Filter out futsal and non-team entries
const EXCLUDE_TEAM = /futsal|association|youth soccer|cal north|cal south|state soccer|ussf|usys/i;

function buildRankedBase(
  teams: Team[],
  rankings: DataSet["rankings"],
  teamMap: Map<number, Team>
): RankedTeam[] {
  void teams;
  return rankings
    .filter((r) => {
      const team = teamMap.get(r.teamId);
      // Out-of-region teams count in the ratings (they connect West teams to the
      // rest of the country) but are not listed in West rankings.
      // Aged-out cohorts (U19+) graduated; they keep their games but aren't listed.
      // Only teams from tracked competitions are listed; state-league-only teams
      // stay in the directory (their games still count in everyone's ratings).
      // Listed: confirmed West teams only (national leagues bring in many teams with
      // no known state; they count in ratings but aren't West teams).
      return !!team && team.region === "Region4" && team.ageGroup !== "U19+" && team.tracked !== false && team.rankable !== false &&
        !EXCLUDE_TEAM.test(team.sourceName ?? team.name);
    })
    .map((r) => {
      const team = teamMap.get(r.teamId)!;
      return {
        ...team,
        score: r.score,
        rank: r.rank,
        previousRank: null, // no rank history stored yet
        gamesPlayed: r.gamesPlayed,
        wins: r.wins,
        losses: r.losses,
        draws: r.draws,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/** Listed teams per state and region: the rankings page only offers places we rank. */
const coverageCache = new WeakMap<RankedTeam[], { states: Record<string, number>; regions: Record<string, number> }>();
export function getCoverage(): { states: Record<string, number>; regions: Record<string, number> } {
  const { rankedBase } = getIndex();
  const hit = coverageCache.get(rankedBase);
  if (hit) return hit;
  const states: Record<string, number> = {}, regions: Record<string, number> = {};
  for (const t of rankedBase) {
    if (t.state) states[t.state] = (states[t.state] ?? 0) + 1;
    if (t.region) regions[t.region] = (regions[t.region] ?? 0) + 1;
  }
  const out = { states, regions };
  coverageCache.set(rankedBase, out);
  return out;
}

export function getRankings(filter: RankingsFilter = {}): RankedTeam[] {
  const { teamById: teamMap, rankedBase, gamesByTournament } = getIndex();
  let rankedTeams: RankedTeam[] = rankedBase;

  if (filter.region && filter.region !== "National") {
    rankedTeams = rankedTeams.filter((t) => {
      if (filter.region!.startsWith("Region")) return t.region === filter.region;
      return t.state === filter.region;
    });
  }
  if (filter.ageGroup && filter.ageGroup !== "All") {
    rankedTeams = rankedTeams.filter((t) => t.ageGroup === filter.ageGroup);
  }
  if (filter.gender && filter.gender !== "Both") {
    rankedTeams = rankedTeams.filter((t) => t.gender === filter.gender);
  }
  if (filter.league && filter.league !== "All") {
    const teamIdsInLeague = new Set<number>();
    for (const g of gamesByTournament.get(filter.league) ?? []) {
      teamIdsInLeague.add(g.team1Id);
      teamIdsInLeague.add(g.team2Id);
    }
    rankedTeams = rankedTeams.filter((t) => teamIdsInLeague.has(t.id));
  }
  if (filter.program && filter.program !== "All") {
    rankedTeams = rankedTeams.filter((t) => t.program === filter.program);
  }
  if (filter.search) {
    const q = filter.search.toLowerCase();
    rankedTeams = rankedTeams.filter((t) => {
      const original = teamMap.get(t.id);
      return (
        t.name.toLowerCase().includes(q) ||
        t.club.toLowerCase().includes(q) ||
        (original?.sourceName?.toLowerCase().includes(q) ?? false)
      );
    });
  }

  // Re-rank after filtering (base is already sorted by score). Copy only the
  // returned slice so the shared base is never mutated.
  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? 50;
  return rankedTeams.slice(offset, offset + limit).map((t, i) => ({ ...t, rank: offset + i + 1 }));
}

export function getTeamById(id: number): TeamDetail | null {
  const { teamById: teamMap, rankingByTeam, gamesByTeam } = getIndex();
  const team = teamMap.get(id);
  if (!team) return null;

  const ranking = rankingByTeam.get(id);

  const teamGames = (gamesByTeam.get(id) ?? [])
    .map((g): GameWithOpponent => {
      const isTeam1 = g.team1Id === id;
      const opponentId = isTeam1 ? g.team2Id : g.team1Id;
      const opponent = teamMap.get(opponentId)!;
      const teamScore = isTeam1 ? g.team1Score : g.team2Score;
      const opponentScore = isTeam1 ? g.team2Score : g.team1Score;
      return {
        id: g.id,
        opponentId,
        opponentName: opponent.name,
        opponentClub: opponent.club,
        teamScore,
        opponentScore,
        date: g.date,
        tournamentName: g.tournamentName,
        result: teamScore > opponentScore ? "W" : teamScore < opponentScore ? "L" : "D",
      };
    });

  return {
    ...team,
    score: ranking?.score ?? 0,
    rank: ranking?.rank ?? 0,
    previousRank: null, // no rank history stored yet
    gamesPlayed: ranking?.gamesPlayed ?? 0,
    wins: ranking?.wins ?? 0,
    losses: ranking?.losses ?? 0,
    draws: ranking?.draws ?? 0,
    games: teamGames,
  };
}

export function getMatchById(id: number): MatchDetail | null {
  const { teamById: teamMap, rankingByTeam: rankingMap, gameById, gamesByTeam } = getIndex();
  const game = gameById.get(id);
  if (!game) return null;

  const team1 = teamMap.get(game.team1Id)!;
  const team2 = teamMap.get(game.team2Id)!;

  const getForm = (teamId: number): GameWithOpponent[] =>
    (gamesByTeam.get(teamId) ?? [])
      .slice(0, 5)
      .map((g) => {
        const isTeam1 = g.team1Id === teamId;
        const opponentId = isTeam1 ? g.team2Id : g.team1Id;
        const opponent = teamMap.get(opponentId)!;
        const ts = isTeam1 ? g.team1Score : g.team2Score;
        const os = isTeam1 ? g.team2Score : g.team1Score;
        return {
          id: g.id,
          opponentId,
          opponentName: opponent.name,
          opponentClub: opponent.club,
          teamScore: ts,
          opponentScore: os,
          date: g.date,
          tournamentName: g.tournamentName,
          result: (ts > os ? "W" : ts < os ? "L" : "D") as "W" | "L" | "D",
        };
      });

  const h2hGames = (gamesByTeam.get(game.team1Id) ?? []).filter(
    (g) => g.team1Id === game.team2Id || g.team2Id === game.team2Id
  );

  return {
    id: game.id,
    team1,
    team2,
    team1Score: game.team1Score,
    team2Score: game.team2Score,
    date: game.date,
    tournamentName: game.tournamentName,
    team1Ranking: rankingMap.get(game.team1Id) ?? null,
    team2Ranking: rankingMap.get(game.team2Id) ?? null,
    team1Form: getForm(game.team1Id),
    team2Form: getForm(game.team2Id),
    h2hGames,
  };
}

export function getRecentGames(limit = 10): Game[] {
  const { games } = getData();
  return games
    .filter((g) => g.status === "completed")
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

export function getTeamName(id: number): string {
  return getIndex().teamById.get(id)?.name ?? "Unknown";
}

export function getRecentTournaments(limit = 6): Array<{
  name: string;
  gameCount: number;
  teamCount: number;
  latestDate: string;
}> {
  const { games } = getData();
  const tournaments = new Map<string, { games: number; teams: Set<number>; latestDate: string }>();

  for (const g of games) {
    if (!g.tournamentName || g.status !== "completed") continue;
    const t = tournaments.get(g.tournamentName) || { games: 0, teams: new Set(), latestDate: "" };
    t.games++;
    t.teams.add(g.team1Id);
    t.teams.add(g.team2Id);
    if (g.date > t.latestDate) t.latestDate = g.date;
    tournaments.set(g.tournamentName, t);
  }

  return Array.from(tournaments.entries())
    .map(([name, data]) => ({
      name,
      gameCount: data.games,
      teamCount: data.teams.size,
      latestDate: data.latestDate,
    }))
    .sort((a, b) => b.latestDate.localeCompare(a.latestDate))
    .slice(0, limit);
}

export function getTournamentGames(name: string): Game[] {
  return getIndex().gamesByTournament.get(name) ?? [];
}

/**
 * Home page numbers, West only: teams listed on /rankings, completed games involving a
 * West team, and West teams that played in the last 15 months.
 */
const statsCache = new WeakMap<object, { rankedTeams: number; westGames: number; activeWestTeams: number }>();
export function getStats() {
  const data = getData();
  let st = statsCache.get(data);
  if (!st) {
    const west = new Set(data.teams.filter((t) => t.region === "Region4").map((t) => t.id));
    const since = new Date(Date.now() - 455 * 864e5).toISOString().slice(0, 10);
    const active = new Set<number>();
    let westGames = 0;
    for (const g of data.games) {
      if (g.status !== "completed") continue;
      const a = west.has(g.team1Id), b = west.has(g.team2Id);
      if (!a && !b) continue;
      westGames++;
      if (g.date && g.date >= since) { if (a) active.add(g.team1Id); if (b) active.add(g.team2Id); }
    }
    st = { rankedTeams: getIndex().rankedBase.length, westGames, activeWestTeams: active.size };
    statsCache.set(data, st);
  }
  return { ...st, lastUpdated: new Date().toISOString().split("T")[0] };
}

export interface PowerRankedTeam extends RankedTeam {
  powerScore: number;
  powerRank: number;
  sos: number;
  qualityWins: number;
  crossLeagueWins: number;
  crossLeagueGames: number;
}

export function getPowerRankings(filter: { ageGroup?: string; gender?: string } = {}): PowerRankedTeam[] {
  const { games, rankings } = getData();
  const allRanked = getIndex().rankedBase;

  const rankingMap = new Map(rankings.map((r) => [r.teamId, r]));
  const teamMap = new Map(allRanked.map((t) => [t.id, t]));

  // Build game lookup per team
  const teamGames = new Map<number, Game[]>();
  for (const g of games) {
    if (g.status !== "completed") continue;
    for (const tid of [g.team1Id, g.team2Id]) {
      if (!teamGames.has(tid)) teamGames.set(tid, []);
      teamGames.get(tid)!.push(g);
    }
  }

  // Detect each team's "home league" (most frequent event)
  function getHomeLeague(tid: number): string {
    const tg = teamGames.get(tid) || [];
    const freq = new Map<string, number>();
    for (const g of tg) {
      if (g.tournamentName) freq.set(g.tournamentName, (freq.get(g.tournamentName) || 0) + 1);
    }
    let best = "";
    let bestCount = 0;
    for (const [name, count] of freq) {
      if (count > bestCount) { best = name; bestCount = count; }
    }
    return best;
  }

  const results: PowerRankedTeam[] = [];

  for (const team of allRanked) {
    const r = rankingMap.get(team.id);
    if (!r || r.gamesPlayed < 15) continue;
    if (filter.ageGroup && filter.ageGroup !== "All" && team.ageGroup !== filter.ageGroup) continue;
    if (filter.gender && filter.gender !== "Both" && team.gender !== filter.gender) continue;

    const tg = teamGames.get(team.id) || [];
    if (tg.length === 0) continue;

    // 1. SOS — average opponent Massey rating
    let sosSum = 0;
    let sosCount = 0;
    for (const g of tg) {
      const oppId = g.team1Id === team.id ? g.team2Id : g.team1Id;
      const oppR = rankingMap.get(oppId);
      if (oppR && !isNaN(oppR.score)) {
        sosSum += oppR.score;
        sosCount++;
      }
    }
    const sos = sosCount > 0 ? sosSum / sosCount : 0;

    // 2. Quality Wins — wins against teams in top 50% by Massey
    let qualityWins = 0;
    const medianScore = allRanked.length > 0 ? allRanked[Math.floor(allRanked.length / 2)]?.score || 0 : 0;
    for (const g of tg) {
      const isT1 = g.team1Id === team.id;
      const myScore = isT1 ? g.team1Score : g.team2Score;
      const oppScore = isT1 ? g.team2Score : g.team1Score;
      if (myScore <= oppScore) continue; // not a win
      const oppId = isT1 ? g.team2Id : g.team1Id;
      const oppR = rankingMap.get(oppId);
      if (oppR && oppR.score > medianScore) {
        qualityWins++;
      }
    }

    // 3. Cross-league games
    const homeLeague = getHomeLeague(team.id);
    let crossWins = 0;
    let crossGames = 0;
    for (const g of tg) {
      if (g.tournamentName && g.tournamentName !== homeLeague) {
        crossGames++;
        const isT1 = g.team1Id === team.id;
        const myScore = isT1 ? g.team1Score : g.team2Score;
        const oppScore = isT1 ? g.team2Score : g.team1Score;
        if (myScore > oppScore) crossWins++;
      }
    }

    // Eligibility: at least 5 cross-league games and 5 quality wins
    if (crossGames < 5) continue;
    if (qualityWins < 5) continue;

    // Massey rating must be in top 10%
    const top10Cutoff = allRanked[Math.floor(allRanked.length * 0.1)]?.score || 0;
    if (r.score < top10Cutoff) continue;

    results.push({
      ...team,
      powerScore: 0,
      powerRank: 0,
      sos,
      qualityWins,
      crossLeagueWins: crossWins,
      crossLeagueGames: crossGames,
    });
  }

  // Normalize components and compute composite power score
  if (results.length === 0) return [];

  const maxMassey = Math.max(...results.map((r) => r.score));
  const minMassey = Math.min(...results.map((r) => r.score));
  const maxSos = Math.max(...results.map((r) => r.sos));
  const minSos = Math.min(...results.map((r) => r.sos));
  const maxQW = Math.max(...results.map((r) => r.qualityWins), 1);
  const maxCross = Math.max(...results.map((r) => r.crossLeagueGames > 0 ? r.crossLeagueWins / r.crossLeagueGames : 0), 0.01);

  for (const t of results) {
    const masseyNorm = maxMassey > minMassey ? (t.score - minMassey) / (maxMassey - minMassey) : 0.5;
    const sosNorm = maxSos > minSos ? (t.sos - minSos) / (maxSos - minSos) : 0.5;
    const qwNorm = t.qualityWins / maxQW;
    const crossNorm = t.crossLeagueGames > 0 ? (t.crossLeagueWins / t.crossLeagueGames) / maxCross : 0;

    t.powerScore = Math.round(
      (masseyNorm * 0.4 + sosNorm * 0.25 + qwNorm * 0.2 + crossNorm * 0.15) * 100
    ) / 100;
  }

  results.sort((a, b) => b.powerScore - a.powerScore);
  results.forEach((t, i) => { t.powerRank = i + 1; });

  return results;
}

export interface ClubDetail {
  name: string;
  state: string;
  region: string;
  teams: RankedTeam[];
  avgScore: number;
  bestTeam: RankedTeam | null;
  totalWins: number;
  totalLosses: number;
  totalDraws: number;
  totalGames: number;
  ageGroups: string[];
  clubRank: number;
}

export function getClubByName(clubName: string): ClubDetail | null {
  // All ranked teams (this used to stop at the top 10,000, so clubs whose teams
  // ranked lower returned 404).
  const allRanked = getIndex().rankedBase;

  const clubTeams = allRanked.filter(
    (t) => t.club.toLowerCase() === clubName.toLowerCase()
  );

  if (clubTeams.length === 0) return null;

  const scores = clubTeams.map((t) => t.score);
  const avgScore =
    scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
      : 0;

  const bestTeam = clubTeams.reduce(
    (best, t) => (t.score > (best?.score ?? -Infinity) ? t : best),
    null as RankedTeam | null
  );

  const ageGroups = [...new Set(clubTeams.map((t) => t.ageGroup))].sort();

  const totalWins = clubTeams.reduce((s, t) => s + t.wins, 0);
  const totalLosses = clubTeams.reduce((s, t) => s + t.losses, 0);
  const totalDraws = clubTeams.reduce((s, t) => s + t.draws, 0);
  const totalGames = clubTeams.reduce((s, t) => s + t.gamesPlayed, 0);

  // Club rank: rank among all clubs by average score
  const allClubs = new Map<string, number[]>();
  for (const t of allRanked) {
    const existing = allClubs.get(t.club) ?? [];
    existing.push(t.score);
    allClubs.set(t.club, existing);
  }
  const clubAvgs = Array.from(allClubs.entries())
    .map(([name, scores]) => ({
      name,
      avg: scores.reduce((a, b) => a + b, 0) / scores.length,
    }))
    .sort((a, b) => b.avg - a.avg);
  const clubRank = clubAvgs.findIndex(
    (c) => c.name.toLowerCase() === clubName.toLowerCase()
  ) + 1;

  return {
    name: clubTeams[0].club,
    state: clubTeams[0].state,
    region: clubTeams[0].region,
    teams: clubTeams.sort((a, b) => b.score - a.score),
    avgScore,
    bestTeam,
    totalWins,
    totalLosses,
    totalDraws,
    totalGames,
    ageGroups,
    clubRank,
  };
}

export function getAllClubs(): Array<{
  name: string;
  state: string;
  teamCount: number;
  avgScore: number;
  rank: number;
}> {
  const allRanked = getIndex().rankedBase;

  const clubs = new Map<
    string,
    { name: string; state: string; scores: number[] }
  >();
  for (const t of allRanked) {
    const existing = clubs.get(t.club);
    if (existing) {
      existing.scores.push(t.score);
    } else {
      clubs.set(t.club, { name: t.club, state: t.state, scores: [t.score] });
    }
  }

  return Array.from(clubs.values())
    .map((c) => ({
      name: c.name,
      state: c.state,
      teamCount: c.scores.length,
      avgScore:
        Math.round(
          (c.scores.reduce((a, b) => a + b, 0) / c.scores.length) * 100
        ) / 100,
      rank: 0,
    }))
    .sort((a, b) => b.avgScore - a.avgScore)
    .map((c, i) => ({ ...c, rank: i + 1 }));
}

/**
 * How the leagues compare in one age group and gender: each program's listed teams,
 * their average and top rating, and how many games connect it to other programs in the
 * last 15 months. The gaps between leagues come only from those games, so a program
 * with few of them (under 50) is flagged as less certain.
 */
export interface LeagueStrengthRow {
  program: string; teams: number; avgScore: number; topScore: number;
  crossGames: number; links: Array<{ program: string; games: number }>; lessCertain: boolean;
}
export function getLeagueStrength(ageGroup: string, gender: string): LeagueStrengthRow[] {
  const { teams, games } = getData();
  const { rankedBase } = getIndex();
  const listed = rankedBase.filter((t) => t.ageGroup === ageGroup && t.gender === gender && t.program);
  const progOf = new Map<number, string>();
  for (const t of teams) if (t.program && t.ageGroup === ageGroup && t.gender === gender && t.region === "Region4") progOf.set(t.id, t.program);
  const since = new Date(Date.now() - TRACKED_DAYS * 864e5).toISOString().slice(0, 10);
  const link = new Map<string, Map<string, number>>();
  for (const g of games) {
    if (!g.date || g.date < since) continue;
    const a = progOf.get(g.team1Id), b = progOf.get(g.team2Id);
    if (!a || !b || a === b) continue;
    for (const [x, y] of [[a, b], [b, a]]) {
      const m = link.get(x) ?? new Map<string, number>();
      m.set(y, (m.get(y) ?? 0) + 1); link.set(x, m);
    }
  }
  const rows: LeagueStrengthRow[] = [];
  for (const p of PROGRAMS) {
    const ts = listed.filter((t) => t.program === p);
    if (!ts.length) continue;
    const links = [...(link.get(p) ?? new Map<string, number>())].map(([program, n]) => ({ program, games: n })).sort((a, b) => b.games - a.games);
    const crossGames = links.reduce((s, l) => s + l.games, 0);
    rows.push({ program: p, teams: ts.length, avgScore: ts.reduce((s, t) => s + t.score, 0) / ts.length,
      topScore: Math.max(...ts.map((t) => t.score)), crossGames, links, lessCertain: crossGames < 50 });
  }
  return rows.sort((a, b) => b.avgScore - a.avgScore);
}
