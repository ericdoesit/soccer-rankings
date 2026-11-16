/**
 * West discovery crawler — works state by state, metro by metro, through every
 * competitive league and tournament on GotSport, collecting clubs, teams and
 * scored games. Resumable: all progress lives in data/discovery/, so each run
 * continues where the last one stopped.
 *
 * Event sources (the "frontier"):
 *   1. GotSport event search per Region IV state (current & upcoming events)
 *   2. Every event a Region IV team earned ranking points in
 *      (eventIds from data/gotsport-teams/region4.json) — the historical record
 *   3. Leagues pinned in src/lib/directory/leagues.ts
 *
 * Competitive filter: recreational/AYSO/in-house/adult/futsal events are skipped
 * (see NOT_COMPETITIVE). Events outside the West are only crawled when at least
 * MIN_WEST_TEAMS Region IV teams played in them (national leagues, showcases).
 *
 * Order: league events first, then tournaments; within each, states in
 * WEST_STATES order, then metro, then most Region IV teams first.
 *
 *   npx tsx scripts/discover-west.ts                 # crawl until budget is spent
 *   npx tsx scripts/discover-west.ts --budget 500    # max API requests this run
 *   npx tsx scripts/discover-west.ts --state UT      # one state only
 *   npx tsx scripts/discover-west.ts --loop          # keep going; refresh frontier daily
 *   npx tsx scripts/discover-west.ts --events-only   # skip the directory phase
 *   npx tsx scripts/discover-west.ts --status        # print progress and exit
 *
 * Output:
 *   data/discovery/frontier.json      event queue + status per event
 *   data/discovery/teams.json         every team seen: team_id → names, club org, events
 *   data/discovery/games/<event>.json scored games, same shape as rankings-api games
 */
import * as fs from "fs";
import * as path from "path";
import { WEST_STATES, inferMetro, METROS } from "../src/lib/directory/geo";
import { LEAGUES } from "../src/lib/directory/leagues";
import { scrapeDirectory, type DirectoryTeam } from "./scrape-gotsport-team-directory";
import { gsGet, stats, sleep, acquireLock } from "./lib/gotsport-client";

const MIN_WEST_TEAMS = 8;
const REFRESH_SEARCH_HOURS = 24;
const REFRESH_ACTIVE_LEAGUE_DAYS = 7;
/** A finished division is re-checked this often anyway (late playoff games, corrections). */
const RECHECK_COMPLETE_DIVISION_DAYS = 28;
/** An unscored match older than this is treated as cancelled/forfeit, not pending. */
const ABANDONED_AFTER_DAYS = 14;

/** Finished = it has matches, the last one is in the past, and none is still waiting for a score. */
function divisionComplete(matches: ApiMatch[], today: string, abandonedBefore: string): boolean {
  if (matches.length === 0) return false;
  let last = "";
  for (const m of matches) {
    const d = m.match_date ?? "";
    if (d > last) last = d;
    const scored = m.home_score != null && m.away_score != null;
    if (!scored && (!d || d >= abandonedBefore)) return false;
  }
  return last !== "" && last < today;
}

const DIR = path.join(process.cwd(), "data", "discovery");
const GAMES_DIR = path.join(DIR, "games");
const FRONTIER_FILE = path.join(DIR, "frontier.json");
const TEAMS_FILE = path.join(DIR, "teams.json");
const DIRECTORY_FILE = path.join(process.cwd(), "data", "gotsport-teams", "region4.json");

/** Event names that are not competitive club soccer. */
export const NOT_COMPETITIVE =
  /\b(ayso|rec|recreational|recreation|in[- ]?house|adult|men'?s|women'?s|over ?\d\d|o\d\d|coed|futsal|indoor|tots|parks? (and|&) rec|ymca|tryouts?|camp|clinic|high school|hs league|cif)\b/i;

type Status = "pending" | "done" | "skipped" | "error";
interface EventEntry {
  id: number;
  status: Status;
  source: string[]; // search:UT | directory | pinned
  westTeams: number; // Region IV directory teams that played it
  name?: string;
  state?: string;
  city?: string;
  metro?: string | null;
  league?: boolean;
  startDate?: string;
  endDate?: string;
  reason?: string;
  flights?: number;
  games?: number;
  teams?: number;
  fetchedAt?: string;
  attempts?: number;
  /** Per-division (schedule group) state, so re-crawls skip finished divisions. */
  divisions?: Record<string, { complete: boolean; checkedAt: string; games: number }>;
}
interface Frontier {
  events: Record<string, EventEntry>;
  searchedAt: Record<string, string>; // state → ISO time
  ysgQueued?: boolean;
  requests: number;
}
interface SeenTeam {
  teamId: number;
  names: string[];
  shortName: string;
  orgId: number | null; // GotSport organization (club) id, from logo path
  events: number[];
}

const readJson = <T>(f: string, fallback: T): T =>
  fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf-8")) as T) : fallback;
const writeJson = (f: string, v: unknown) => {
  fs.writeFileSync(`${f}.tmp`, JSON.stringify(v));
  fs.renameSync(`${f}.tmp`, f);
};

const args = process.argv.slice(2);
const argVal = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const BUDGET = Number(argVal("--budget") ?? Infinity);
const ONLY_STATE = argVal("--state")?.toUpperCase();
const LOOP = args.includes("--loop");

let frontier: Frontier;
let teams: Record<string, SeenTeam>;
let spent = 0;

async function get<T>(pathAndQuery: string): Promise<T | null> {
  spent++;
  frontier.requests++;
  return gsGet<T>(pathAndQuery);
}

function addEvent(id: number, source: string, westTeams = 0) {
  const e = (frontier.events[id] ??= { id, status: "pending", source: [], westTeams: 0 });
  if (!e.source.includes(source)) e.source.push(source);
  e.westTeams = Math.max(e.westTeams, westTeams);
}

/** 1+2+3: grow the frontier. */
async function refreshFrontier() {
  // directory history
  const dir = readJson<DirectoryTeam[]>(DIRECTORY_FILE, []);
  const counts = new Map<number, number>();
  for (const t of dir) for (const ev of t.eventIds) counts.set(ev, (counts.get(ev) ?? 0) + 1);
  for (const [ev, n] of counts) addEvent(ev, "directory", n);
  // events the (retired, corrupt-score) YSG scrape had covered — re-collect them
  const ysgFile = path.join(process.cwd(), "data", "ysg", "games.json");
  if (fs.existsSync(ysgFile) && !frontier.ysgQueued) {
    const ids = new Set<number>();
    for (const g of readJson<Array<{ sourceUrl?: string }>>(ysgFile, [])) {
      const m = g.sourceUrl?.match(/gotsport\.com\/org_event\/events\/(\d+)/);
      if (m) ids.add(Number(m[1]));
    }
    for (const id of ids) addEvent(id, "ysg", 0);
    frontier.ysgQueued = true;
  }
  // pinned leagues
  for (const l of LEAGUES) for (const [ev] of l.gotsportEvents ?? []) addEvent(ev, "pinned", 999);
  // search per state (current/upcoming), at most once per REFRESH_SEARCH_HOURS
  for (const st of WEST_STATES) {
    if (ONLY_STATE && st !== ONLY_STATE) continue;
    const last = frontier.searchedAt[st];
    if (last && Date.now() - Date.parse(last) < REFRESH_SEARCH_HOURS * 3600e3) continue;
    for (let page = 1; page <= 50; page++) {
      const r = await get<{ total_pages: number; events: Array<{ id: number }> }>(
        `/events/search?state=${st}&page=${page}`);
      if (!r) break;
      for (const ev of r.events ?? []) addEvent(ev.id, `search:${st}`, 0);
      if (page >= (r.total_pages ?? 1)) break;
    }
    frontier.searchedAt[st] = new Date().toISOString();
    save();
  }
  // Re-check events that still have unfinished divisions (active league seasons,
  // tournaments that had not been played yet) weekly, until 30 days after they end.
  // Re-crawls only fetch unfinished divisions, so this is cheap.
  const graceEnd = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  // Weekend-aware (user, 2026-11-16: updates run on Monday for the weekend's games): an event is
  // also due when its last fetch was before this week's Monday 00:00 local time, so the first run
  // each Monday picks up every Saturday/Sunday result.
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  for (const e of Object.values(frontier.events)) {
    if (e.status !== "done" || !e.fetchedAt) continue;
    const fetched = Date.parse(e.fetchedAt);
    if (fetched >= monday.getTime() && Date.now() - fetched < REFRESH_ACTIVE_LEAGUE_DAYS * 864e5) continue;
    const divs = Object.values(e.divisions ?? {});
    const unfinished = divs.length === 0 ? (e.flights ?? 1) > 0 : divs.some((d) => !d.complete);
    if (unfinished && (!e.endDate || e.endDate >= graceEnd)) e.status = "pending";
  }
}

const STATE_ORDER = new Map(WEST_STATES.map((s, i) => [s as string, i]));
function priority(e: EventEntry): number[] {
  const known = e.name !== undefined;
  const west = e.state && STATE_ORDER.has(e.state) ? STATE_ORDER.get(e.state)! : 99;
  const metroIdx = e.metro ? METROS.findIndex((m) => m.slug === e.metro) : 999;
  return [
    e.attempts ?? 0, // retries go to the back of the queue
    e.source.includes("pinned") ? 0 : 1,
    known ? (e.league ? 0 : 1) : 0, // unknown events need details first anyway
    ONLY_STATE ? 0 : west,
    metroIdx,
    -e.westTeams,
    e.id,
  ];
}
const cmp = (a: number[], b: number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };

interface EventDetails {
  event: {
    id: number; name: string; city: string; state: string; league: boolean;
    start_date_formatted?: { dashed: string }; end_date_formatted?: { dashed: string };
    schedule_groups?: Array<{ id: number; division: string; age: number; gender: string }>;
  };
}
interface ApiMatch {
  id: number; match_number: number; match_date: string; home_score: number | null; away_score: number | null;
  division_name: string; event_id: number; event_name: string; venue?: { name?: string } | null;
  homeTeam?: { team_id: number; full_name: string; short_name: string; team_logo?: string };
  awayTeam?: { team_id: number; full_name: string; short_name: string; team_logo?: string };
}

const orgFromLogo = (logo?: string) => {
  const m = logo?.match(/organizations\/logos\/(\d{3})\/(\d{3})\/(\d{3})/);
  return m ? Number(`${m[1]}${m[2]}${m[3]}`) : null;
};

async function crawlEvent(e: EventEntry) {
  const d = await get<EventDetails>(`/event_ranking_data/event_details?event_id=${e.id}`);
  if (!d?.event) {
    e.attempts = (e.attempts ?? 0) + 1;
    e.status = e.attempts >= 3 ? "error" : "pending";
    e.reason = "no event details";
    return;
  }
  const ev = d.event;
  Object.assign(e, {
    name: ev.name, state: ev.state, city: ev.city, league: ev.league,
    startDate: ev.start_date_formatted?.dashed, endDate: ev.end_date_formatted?.dashed,
    metro: STATE_ORDER.has(ev.state) ? inferMetro(`${ev.city} ${ev.name}`, null, ev.state)?.slug ?? null : null,
  });
  if (ONLY_STATE && ev.state !== ONLY_STATE) { e.status = "pending"; return; }
  if (NOT_COMPETITIVE.test(ev.name)) { e.status = "skipped"; e.reason = "not competitive"; return; }
  if (!STATE_ORDER.has(ev.state) && e.westTeams < MIN_WEST_TEAMS && !e.source.includes("pinned")) {
    e.status = "skipped"; e.reason = `outside West (${ev.state}), ${e.westTeams} West teams`; return;
  }
  const groups = ev.schedule_groups ?? [];
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (e.startDate && e.startDate > today) {
    // Not played yet: note it, come back after it starts (see refreshFrontier).
    Object.assign(e, { status: "done", flights: groups.length, games: 0, teams: 0,
      fetchedAt: now.toISOString(), reason: `starts ${e.startDate}`, divisions: e.divisions ?? {} });
    return;
  }
  const abandonedBefore = new Date(now.getTime() - ABANDONED_AFTER_DAYS * 864e5).toISOString().slice(0, 10);
  const recheckBefore = now.getTime() - RECHECK_COMPLETE_DIVISION_DAYS * 864e5;

  // Games already on disk, by division. Files written before division tracking
  // have no flightId: those events get one full pass to build division state.
  type Game = { flightId?: number; homeTeamId: number; awayTeamId: number } & Record<string, unknown>;
  const gamesFile = path.join(GAMES_DIR, `${e.id}.json`);
  const previous = e.divisions ? readJson<Game[]>(gamesFile, []) : [];
  const divisions = e.divisions ?? {};
  const skip = new Set(groups.filter((g) => {
    const d = divisions[g.id];
    return d?.complete && Date.parse(d.checkedAt) > recheckBefore;
  }).map((g) => g.id));
  const games: Game[] = previous.filter((g) => g.flightId !== undefined && skip.has(g.flightId));
  const eventTeams = new Set<number>(games.flatMap((g) => [g.homeTeamId, g.awayTeamId]));

  console.log(`  → ${ev.name} (${ev.city}, ${ev.state}) — ${groups.length} divisions` +
    (skip.size ? `, ${skip.size} finished (skipped)` : ""));
  let failedFlights = 0;
  for (const g of groups) {
    if (skip.has(g.id)) continue;
    const matches = await get<ApiMatch[]>(`/event_ranking_data/flight_matches?flight_id=${g.id}&event_id=${e.id}`);
    if (matches === null) {
      failedFlights++;
      // keep whatever we had for this division
      games.push(...previous.filter((x) => x.flightId === g.id));
      continue;
    }
    let divisionGames = 0;
    for (const m of matches) {
      for (const side of [m.homeTeam, m.awayTeam]) {
        if (!side?.team_id) continue;
        eventTeams.add(side.team_id);
        const t = (teams[side.team_id] ??= { teamId: side.team_id, names: [], shortName: side.short_name, orgId: null, events: [] });
        if (side.full_name && !t.names.includes(side.full_name)) t.names.push(side.full_name);
        t.orgId ??= orgFromLogo(side.team_logo);
        if (!t.events.includes(e.id)) t.events.push(e.id);
      }
      if (m.home_score == null || m.away_score == null || !m.homeTeam?.team_id || !m.awayTeam?.team_id) continue;
      divisionGames++;
      games.push({
        gameId: m.id, matchNumber: m.match_number, date: m.match_date,
        homeTeam: m.homeTeam.full_name, awayTeam: m.awayTeam.full_name,
        homeTeamId: m.homeTeam.team_id, awayTeamId: m.awayTeam.team_id,
        homeScore: m.home_score, awayScore: m.away_score, venue: m.venue?.name ?? "",
        division: m.division_name, flightId: g.id, eventId: e.id, eventName: ev.name,
      });
    }
    divisions[g.id] = { complete: divisionComplete(matches, today, abandonedBefore), checkedAt: now.toISOString(), games: divisionGames };
  }
  writeJson(gamesFile, games);
  const finished = groups.filter((g) => divisions[g.id]?.complete).length;
  Object.assign(e, { status: "done", flights: groups.length, games: games.length, teams: eventTeams.size,
    fetchedAt: now.toISOString(), reason: undefined, divisions });
  // Some divisions never answered: keep what we have, retry the event later (max 3 tries).
  // The retry only re-fetches divisions that are not finished.
  if (failedFlights > 0) {
    e.attempts = (e.attempts ?? 0) + 1;
    e.reason = `${failedFlights}/${groups.length} divisions failed`;
    if (e.attempts < 3) e.status = "pending";
  }
  if (finished) console.log(`    ${finished}/${groups.length} divisions finished`);
}

function save() {
  writeJson(FRONTIER_FILE, frontier);
  writeJson(TEAMS_FILE, teams);
}

function status() {
  const ev = Object.values(frontier.events);
  const by = (s: Status) => ev.filter((e) => e.status === s).length;
  console.log(`events: ${ev.length} total · ${by("done")} done · ${by("pending")} pending · ${by("skipped")} skipped · ${by("error")} error`);
  console.log(`teams seen: ${Object.keys(teams).length} · games: ${ev.reduce((n, e) => n + (e.games ?? 0), 0)} · requests so far: ${frontier.requests}`);
  const rows: Record<string, { done: number; pending: number; skipped: number; games: number; teams: number }> = {};
  for (const e of ev) {
    const k = e.state && STATE_ORDER.has(e.state) ? e.state : e.state ? "other" : "unknown";
    rows[k] ??= { done: 0, pending: 0, skipped: 0, games: 0, teams: 0 };
    if (e.status === "done") { rows[k].done++; rows[k].games += e.games ?? 0; rows[k].teams += e.teams ?? 0; }
    else if (e.status === "pending") rows[k].pending++;
    else rows[k].skipped++;
  }
  console.table(rows);
}

let lastDirectoryRefresh = 0;
async function runOnce(): Promise<boolean> {
  // Phase 1: the Region IV team directory (clubs + team ids + event history).
  // Refreshed weekly in --loop mode since rankings and rosters change.
  const refresh = LOOP && lastDirectoryRefresh > 0 && Date.now() - lastDirectoryRefresh > 7 * 864e5;
  const before = stats.requests;
  const complete = args.includes("--events-only") ? true : await scrapeDirectory({ budget: () => spent + (stats.requests - before) < BUDGET, refresh });
  spent += stats.requests - before;
  frontier.requests += stats.requests - before;
  if (!complete) { save(); return stats.requests > before; }
  if (refresh || !lastDirectoryRefresh) lastDirectoryRefresh = Date.now();
  // Phase 2: events, state by state.
  await refreshFrontier();
  save();
  let progressed = false;
  while (spent < BUDGET) {
    const next = Object.values(frontier.events)
      .filter((e) => e.status === "pending" && (!ONLY_STATE || !e.state || e.state === ONLY_STATE))
      .sort((a, b) => cmp(priority(a), priority(b)))[0];
    if (!next) break;
    await crawlEvent(next);
    progressed = true;
    save();
    const tag = next.status === "done" ? `${next.games} games, ${next.teams} teams` : `${next.status}: ${next.reason}`;
    console.log(`[${next.state ?? "??"}${next.metro ? "/" + next.metro : ""}] ${next.id} ${next.name ?? ""} — ${tag}`);
  }
  return progressed;
}

async function main() {
  fs.mkdirSync(GAMES_DIR, { recursive: true });
  frontier = readJson<Frontier>(FRONTIER_FILE, { events: {}, searchedAt: {}, requests: 0 });
  teams = readJson<Record<string, SeenTeam>>(TEAMS_FILE, {});
  if (args.includes("--status")) return status();
  acquireLock();
  do {
    const progressed = await runOnce();
    status();
    if (!LOOP || spent >= BUDGET) break;
    if (!progressed) {
      console.log("Frontier exhausted — sleeping 6h before refreshing.");
      await sleep(6 * 3600e3);
    }
  } while (true);
}

main().catch((e) => { console.error(e); process.exit(1); });
