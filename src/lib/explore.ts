/**
 * Browse hierarchy: Area (state, with California split into Cal South / Cal
 * North) → Leagues → Clubs → Teams by age and gender.
 *
 * Built once per loaded dataset from the snapshot:
 *  - a competition is every distinct event name in the games
 *  - it is a league when it runs longer than a tournament weekend (> 45 days
 *    between first and last game), is a known league (directory/leagues.ts) or
 *    the discovery crawler marked it a league; names with "Cup" are cups
 *  - seasons of one league ("SOCAL Fall League 2025 - 2026", "… 2026 - 2027")
 *    are grouped by the name with years removed
 *  - a league shows in an area when ≥ 8 of its teams (latest season) are from it
 *  - clubs come only from verified club data (GotSport directory, league club
 *    lists, directory club-name matches), never from guessing at a team name
 */
import * as fs from "fs";
import * as path from "path";
import { getDataSet, type DataSet, type Team } from "./data";
import { ASSOCIATIONS, STATE_NAMES, type WestState } from "./directory/geo";
import { LEAGUES, type LeagueDef } from "./directory/leagues";
import { slugify } from "./directory/normalize";
import { seasonEndYear } from "./directory/team-names";
import { clubMatcher } from "./directory/club-match";
import { normalizeWebsite } from "./directory/url";

export interface Area { code: string; slug: string; name: string; short: string }

/** Association code → browse area. California is two areas (Cal South / Cal North). */
export const AREAS: Area[] = Object.entries(ASSOCIATIONS).map(([code, [state, cup]]) => ({
  code,
  slug: cup.toLowerCase(),
  name: code === "CAS" ? "Cal South" : code === "CAN" ? "Cal North" : STATE_NAMES[state as WestState],
  short: cup,
})).sort((a, b) => a.name.localeCompare(b.name));
const AREA_BY_CODE = new Map(AREAS.map((a) => [a.code, a]));
export const areaBySlug = (slug: string) => AREAS.find((a) => a.slug === slug.toLowerCase()) ?? null;
export const areaByCode = (code: string) => AREA_BY_CODE.get(code) ?? null;

export const AGE_ORDER = ["U6", "U7", "U8", "U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17", "U18", "U19"];

export interface TeamRow {
  id: number; name: string; ageGroup: string; gender: "Boys" | "Girls";
  rank: number | null; score: number | null; wins: number; losses: number; draws: number;
  lastPlayed: string;
  leagues: string[]; // league slugs, latest season
}
export interface ClubRow {
  slug: string; name: string; area: Area | null; teams: TeamRow[];
  leagues: string[]; ranked: number; bestRank: number | null;
  website: string | null; city: string | null;
  /** leagues whose own member list names this club (league-clubs files with a "league" key) */
  memberOf: string[];
  /** where the website / city came from */
  infoSource: string | null;
}
export interface LeagueRow {
  slug: string; name: string; kind: "league" | "cup"; tier: string | null; def: LeagueDef | null;
  seasons: Array<{ season: string; events: string[]; teamIds: Set<number> }>;
  /** latest season's teams */
  teamIds: Set<number>;
  clubs: Map<string, number[]>; // club slug → team ids (latest season)
  areaCounts: Map<string, number>;
}

interface ExploreIndex {
  leagues: Map<string, LeagueRow>;
  clubs: Map<string, ClubRow>;
  clubSlugByName: Map<string, string>;
  areaStats: Map<string, { leagues: LeagueRow[]; clubs: ClubRow[]; teams: number; ranked: number }>;
}
const cache = new WeakMap<DataSet, ExploreIndex>();

function frontierEvents(): Map<string, { id: number; league: boolean }> {
  const out = new Map<string, { id: number; league: boolean }>();
  try {
    const f = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "discovery", "frontier.json"), "utf-8"));
    for (const e of Array.isArray(f.events) ? f.events : Object.values(f.events) as Array<{ id: number; name?: string; league?: boolean }>)
      if (e.name) out.set(e.name, { id: e.id, league: !!e.league });
  } catch { /* no frontier yet */ }
  return out;
}

/** "SOCAL Fall League 2025 - 2026" → "SOCAL Fall League"; "25/26 Girls Academy League" → "Girls Academy League" */
function stripSeason(name: string): string {
  return name
    .replace(/\b(19|20)\d{2}\s*[-/–]\s*(19|20)?\d{2}\b/g, " ")
    .replace(/\b\d{2}\s*[-/]\s*\d{2}\b/g, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/^\s*(fall|spring|winter|summer)\s+|\s+(fall|spring|winter|summer)\s*$/gi, " ")
    .replace(/\s*\|\s*|\s+I\s+(?=\S)|\s+I$/g, " ")
    .replace(/\s+[-–]\s*$|^\s*[-–]\s+/g, " ")
    .replace(/\s+/g, " ").trim();
}

/** Event-name patterns that belong to a known league (State Cup rounds are separate GotSport events) */
const NAME_ALIASES: Array<[RegExp, LeagueDef]> = ([
  [/norcal state cup|cal north state cup/i, "cal-north-state-cup"],
  [/socal state cup|cal south state cup/i, "cal-south-state-cup"],
  [/norcal premier (fall|spring) league/i, "norcal-premier"],
  [/socal fall league/i, "socal-soccer-league"],
  [/^npsl\b/i, "north-puget-sound-league"],
  [/\bwpl\b(?!.*eastern)/i, "wpl"],
  [/^nevada state league\b/i, "nevada-state-league"],
  [/^lv club soccer league\b/i, "lv-club-soccer-league"],
  [/^gbysl select\b/i, "gbysl-select"],
  [/^nevada south youth soccer league\b/i, "nevada-south-ysl"],
  // ECNL events (data/ecnl)
  [/^ecnl rl\b/i, "ecnl-rl"],
  [/^ecnl boys\b/i, "ecnl-boys"],
  [/^ecnl girls\b/i, "ecnl-girls"],
  // Modular11 events (scripts/scrape-modular11.ts)
  [/^elite academy league ea2\b/i, "ea2"],
  [/^elite academy league\b/i, "eal"],
  [/^mls next academy division\b/i, "mls-next-ad"],
  [/^usl academy\b/i, "usl-academy"],
] as Array<[RegExp, string]>).map(([re, slug]) => [re, LEAGUES.find((l) => l.slug === slug)!] as [RegExp, LeagueDef]).filter(([, d]) => d);

/** Teams with no game in this many days are left off club pages and counts. */
const ACTIVE_DAYS = 455;

function build(data: DataSet): ExploreIndex {
  const { teams, games, rankings } = data;
  const teamById = new Map<number, Team>(teams.map((t) => [t.id, t]));
  const rankBy = new Map(rankings.map((r) => [r.teamId, r]));
  // Rank shown on club pages: position among listed West teams of the same age group
  // and gender (as on /rankings). Listed = passes the ranking hurdles (data.ts RANK_RULES).
  const listedRank = new Map<number, number>();
  {
    const groups = new Map<string, Array<{ id: number; score: number }>>();
    for (const t of teams) {
      const r = rankBy.get(t.id);
      if (!r || t.region !== "Region4" || t.ageGroup === "U19+" || t.tracked === false || t.rankable === false) continue;
      const k = `${t.ageGroup}|${t.gender}`;
      groups.set(k, [...(groups.get(k) ?? []), { id: t.id, score: r.score }]);
    }
    for (const g of groups.values()) g.sort((a, b) => b.score - a.score).forEach((x, i) => listedRank.set(x.id, i + 1));
  }
  const frontier = frontierEvents();
  const lastPlayed = new Map<number, string>();
  for (const g of games) for (const id of [g.team1Id, g.team2Id]) if (g.date && g.date > (lastPlayed.get(id) ?? "")) lastPlayed.set(id, g.date);
  const activeSince = new Date(Date.now() - ACTIVE_DAYS * 864e5).toISOString().slice(0, 10);

  // Known leagues by event id and by event name
  const defByEventId = new Map<number, LeagueDef>();
  const defByEventName = new Map<string, LeagueDef>();
  for (const def of LEAGUES) for (const [id, , name] of def.gotsportEvents ?? []) { defByEventId.set(id, def); defByEventName.set(name, def); }

  // Competitions by event name
  const comps = new Map<string, { first: string; last: string; teamIds: Set<number> }>();
  for (const g of games) {
    if (!g.tournamentName || g.status !== "completed") continue;
    const c = comps.get(g.tournamentName) ?? { first: g.date || "9999", last: g.date || "0000", teamIds: new Set<number>() };
    if (g.date) { if (g.date < c.first) c.first = g.date; if (g.date > c.last) c.last = g.date; }
    c.teamIds.add(g.team1Id); c.teamIds.add(g.team2Id);
    comps.set(g.tournamentName, c);
  }

  const leagues = new Map<string, LeagueRow>();
  for (const [name, c] of comps) {
    const fe = frontier.get(name);
    const def = defByEventName.get(name) ?? (fe ? defByEventId.get(fe.id) : undefined) ??
      NAME_ALIASES.find(([re]) => re.test(name))?.[1] ?? null;
    const days = c.first < "9999" && c.last > "0000" ? (Date.parse(c.last) - Date.parse(c.first)) / 864e5 : 0;
    const isCup = def?.tier === "CUP" || /\bcup\b/i.test(name);
    const isLeague = !!def || fe?.league || days > 45;
    if (!isLeague) continue;
    const base = def?.name ?? stripSeason(name);
    const slug = def?.slug ?? slugify(base);
    if (!slug) continue;
    const season = c.last > "0000" ? `${seasonEndYear(new Date(c.last)) - 1}-${String(seasonEndYear(new Date(c.last))).slice(2)}` : "unknown";
    const row = leagues.get(slug) ?? {
      slug, name: base, kind: isCup ? "cup" : "league", tier: def?.tier ?? null, def,
      seasons: [], teamIds: new Set<number>(), clubs: new Map(), areaCounts: new Map(),
    } as LeagueRow;
    let s = row.seasons.find((x) => x.season === season);
    if (!s) { s = { season, events: [], teamIds: new Set() }; row.seasons.push(s); }
    s.events.push(name);
    for (const id of c.teamIds) s.teamIds.add(id);
    leagues.set(slug, row);
  }

  // Clubs from verified team data
  const clubs = new Map<string, ClubRow>();
  const clubSlugByName = new Map<string, string>();
  const clubAreaVotes = new Map<string, Map<string, number>>();
  for (const t of teams) {
    if (!t.clubVerified || !t.club || t.region !== "Region4" || t.ageGroup === "U19+") continue;
    if ((lastPlayed.get(t.id) ?? "") < activeSince) continue;
    const key = t.club.toLowerCase();
    let slug = clubSlugByName.get(key);
    if (!slug) {
      slug = slugify(t.club);
      if (clubs.has(slug)) slug = `${slug}-${t.state.toLowerCase()}`;
      clubSlugByName.set(key, slug);
      clubs.set(slug, { slug, name: t.club, area: null, teams: [], leagues: [], ranked: 0, bestRank: null, website: null, city: null, infoSource: null, memberOf: [] });
    }
    const r = rankBy.get(t.id);
    clubs.get(slug)!.teams.push({
      id: t.id, name: t.name, ageGroup: t.ageGroup, gender: t.gender,
      rank: listedRank.get(t.id) ?? null, score: r?.score ?? null, wins: r?.wins ?? 0, losses: r?.losses ?? 0, draws: r?.draws ?? 0, lastPlayed: lastPlayed.get(t.id) ?? "", leagues: [],
    });
    const v = clubAreaVotes.get(slug) ?? new Map<string, number>();
    v.set(t.state, (v.get(t.state) ?? 0) + 1);
    clubAreaVotes.set(slug, v);
  }
  for (const [slug, v] of clubAreaVotes) {
    const top = [...v].sort((a, b) => b[1] - a[1])[0][0];
    const club = clubs.get(slug)!;
    club.area = areaByCode(top);
    club.ranked = club.teams.filter((t) => t.rank !== null).length;
    club.bestRank = club.teams.reduce<number | null>((m, t) => (t.rank !== null && (m === null || t.rank < m) ? t.rank : m), null);
  }
  attachClubInfo(clubs, teams);
  const teamRow = new Map<number, TeamRow>();
  for (const c of clubs.values()) for (const t of c.teams) teamRow.set(t.id, t);
  const clubOfTeam = new Map<number, string>();
  for (const c of clubs.values()) for (const t of c.teams) clubOfTeam.set(t.id, c.slug);

  // Latest season per league; membership, clubs, areas
  for (const l of leagues.values()) {
    l.seasons.sort((a, b) => b.season.localeCompare(a.season));
    l.teamIds = l.seasons[0].teamIds;
    for (const id of l.teamIds) {
      const t = teamById.get(id);
      if (t?.region === "Region4") l.areaCounts.set(t.state, (l.areaCounts.get(t.state) ?? 0) + 1);
      const cs = clubOfTeam.get(id);
      if (cs) {
        l.clubs.set(cs, [...(l.clubs.get(cs) ?? []), id]);
        teamRow.get(id)!.leagues.push(l.slug);
      }
    }
  }
  for (const c of clubs.values()) c.leagues = [...new Set(c.teams.flatMap((t) => t.leagues))];

  const areaStats = new Map<string, { leagues: LeagueRow[]; clubs: ClubRow[]; teams: number; ranked: number }>();
  for (const a of AREAS) {
    const ls = [...leagues.values()].filter((l) => (l.areaCounts.get(a.code) ?? 0) >= 8);
    const cs = [...clubs.values()].filter((c) => c.area?.code === a.code);
    areaStats.set(a.code, {
      leagues: ls, clubs: cs,
      teams: cs.reduce((n, c) => n + c.teams.length, 0),
      ranked: cs.reduce((n, c) => n + c.ranked, 0),
    });
  }
  return { leagues, clubs, clubSlugByName, areaStats };
}

function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), file), "utf-8")) as T; } catch { return fallback; }
}

/**
 * Website and city for each club, from league sources:
 *  - NorCal Premier club pages, joined by GotSport team id (exact)
 *  - association member-club lists (data/league-clubs/*.json), matched by name within the state
 *  - data/seed/club-websites.json: websites found by searching, override the above
 */
function attachClubInfo(clubs: Map<string, ClubRow>, teams: Team[]) {
  // website: null means "checked, no working site": don't show the league's dead link
  const overrides = new Map(readJson<Array<{ gotsportOrgId?: number; name: string; website: string | null }>>("data/seed/club-websites.json", [])
    .map((o) => [o.gotsportOrgId ?? o.name.toLowerCase(), o.website] as [number | string, string | null]));
  const pick = (key: number | string, fallback: string | null | undefined) => (overrides.has(key) ? overrides.get(key) : fallback);
  const gsIdOf = new Map(teams.map((t) => [t.id, t.gotsportTeamId]));

  const norcal = readJson<Array<{ gotsportOrgId: number; name: string; city: string | null; website: string | null; teams: Array<{ gotsportTeamId: number }> }>>(
    "data/norcal-premier/clubs.json", []);
  const npByTeam = new Map<number, (typeof norcal)[number]>();
  for (const c of norcal) for (const t of c.teams) npByTeam.set(t.gotsportTeamId, c);
  for (const club of clubs.values()) {
    const votes = new Map<(typeof norcal)[number], number>();
    for (const t of club.teams) { const c = npByTeam.get(gsIdOf.get(t.id) ?? -1); if (c) votes.set(c, (votes.get(c) ?? 0) + 1); }
    const best = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!best) continue;
    club.website = normalizeWebsite(pick(best.gotsportOrgId, best.website));
    club.city = best.city;
    club.infoSource = `NorCal Premier club page (norcalpremier.com/club/${best.gotsportOrgId}/)`;
  }

  const dir = path.join(process.cwd(), "data", "league-clubs");
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith(".json")) : []) {
    const list = readJson<{ source: string; association: string; league?: string; clubs: Array<{ name: string; area?: string; city?: string; website?: string | null; association?: string }> }>(
      path.join("data", "league-clubs", f), { source: f, association: "", clubs: [] });
    // entries may carry their own state (SoCal League has Nevada clubs)
    const byAssoc = new Map<string, { matcher: ReturnType<typeof clubMatcher>; byName: Map<string, ClubRow> }>();
    const forAssoc = (code: string) => {
      let m = byAssoc.get(code);
      if (!m) {
        const inState = [...clubs.values()].filter((c) => c.area?.code === code);
        m = { matcher: clubMatcher(inState.map((c) => c.name)), byName: new Map(inState.map((c) => [c.name, c])) };
        byAssoc.set(code, m);
      }
      return m;
    };
    for (const entry of list.clubs) {
      const { matcher, byName } = forAssoc(entry.association ?? list.association);
      const hit = matcher.match(entry.name);
      const club = hit ? byName.get(hit) : undefined;
      if (!club) continue;
      if (list.league && !club.memberOf.includes(list.league)) club.memberOf.push(list.league);
      if (club.website || !entry.website) { if (!club.city) club.city = entry.city ?? entry.area ?? null; continue; }
      club.website = normalizeWebsite(pick(entry.name.toLowerCase(), entry.website));
      club.city = entry.city ?? entry.area ?? null;
      club.infoSource = list.source;
    }
  }
}

/** Newest modification time of the club-info sources, so new lists show up without a restart. */
function sourcesStamp(): number {
  let t = 0;
  // (not frontier.json: the crawler rewrites it constantly; league data changes with the snapshot)
  const files = ["data/norcal-premier/clubs.json", "data/seed/club-websites.json"];
  const dir = path.join(process.cwd(), "data", "league-clubs");
  try { for (const f of fs.readdirSync(dir)) files.push(path.join("data", "league-clubs", f)); } catch { /* none */ }
  for (const f of files) { try { t = Math.max(t, fs.statSync(path.join(process.cwd(), f)).mtimeMs); } catch { /* missing */ } }
  return t;
}
let lastCheck = 0, lastStamp = 0;

function index(): ExploreIndex {
  const data = getDataSet();
  if (Date.now() - lastCheck > 60_000) {
    lastCheck = Date.now();
    const stamp = sourcesStamp();
    if (stamp !== lastStamp) { lastStamp = stamp; cache.delete(data); }
  }
  let ix = cache.get(data);
  if (!ix) { ix = build(data); cache.set(data, ix); }
  return ix;
}

const TIER_ORDER: Record<string, number> = { L1: 1, L2: 2, L3: 3, L4: 4, L5: 5, CUP: 8 };
export const sortLeagues = (ls: LeagueRow[], areaCode?: string) => [...ls].sort((a, b) =>
  (a.kind === b.kind ? 0 : a.kind === "league" ? -1 : 1) ||
  (TIER_ORDER[a.tier ?? ""] ?? 6) - (TIER_ORDER[b.tier ?? ""] ?? 6) ||
  (areaCode ? (b.areaCounts.get(areaCode) ?? 0) - (a.areaCounts.get(areaCode) ?? 0) : b.teamIds.size - a.teamIds.size));

export function getAreas() {
  const ix = index();
  return AREAS.map((a) => ({ area: a, ...ix.areaStats.get(a.code)! }));
}
export function getArea(slug: string) {
  const a = areaBySlug(slug);
  if (!a) return null;
  return { area: a, ...index().areaStats.get(a.code)! };
}
export function getLeague(slug: string) { return index().leagues.get(slug) ?? null; }
export function getLeagueName(slug: string) { return index().leagues.get(slug)?.name ?? slug; }
export function getClubRow(slugOrName: string) {
  const ix = index();
  return ix.clubs.get(slugOrName) ?? ix.clubs.get(ix.clubSlugByName.get(slugOrName.toLowerCase()) ?? "") ?? null;
}
export function clubSlugFor(name: string) { return index().clubSlugByName.get(name.toLowerCase()) ?? null; }
