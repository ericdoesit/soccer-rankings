/**
 * ECNL / ECNL RL / Pre-ECNL importer using the public AthleteOne (TGS) API.
 *
 * The old scrape-ecnl.ts scraped team-centric Sidearm schedule pages and could
 * not reliably identify both sides of a match. This importer uses match records
 * with stable match/team/club IDs from AthleteOne.
 *
 * Usage:
 *   npm run scrape:ecnl
 *   npm run scrape:ecnl -- --season 2026-27
 *   npm run scrape:ecnl -- --event 12345
 *
 * No player endpoints are called and no player data is written.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const API = (process.env.ATHLETEONE_API_BASE || "https://api.athleteone.com/api").replace(/\/$/, "");
const OUT = path.join(process.cwd(), "data", "ecnl");
const ORGS = [
  { id: 9, league: "ECNL", gender: "Girls" },
  { id: 12, league: "ECNL", gender: "Boys" },
  { id: 13, league: "ECNL RL", gender: "Girls" },
  { id: 16, league: "ECNL RL", gender: "Boys" },
] as const;
const SEASONS = new Set((process.env.ECNL_SEASONS || "2025-26,2026-27").split(",").map(s => s.trim()));
const WEST = [
  "SoCal", "NorCal", "Golden State", "Far West",
  "Frontier", "Mountain", "Northwest", "Southwest", "Colorado", "Utah",
];
const DELAY_MS = Number(process.env.ECNL_API_DELAY_MS || 250);

type Obj = Record<string, any>;
type EventMeta = { eventId: number; eventName: string; league: string; gender: string; conference: string; season: string };

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const str = (v: unknown) => v == null ? "" : String(v).trim();
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
function unwrap(payload: any): any {
  if (payload && typeof payload === "object" && "data" in payload) return payload.data;
  return payload;
}
function records(payload: any, preferredKeys: string[] = []): Obj[] {
  const data = unwrap(payload);
  if (Array.isArray(data)) return data.filter(x => x && typeof x === "object");
  if (!data || typeof data !== "object") return [];
  for (const key of preferredKeys) if (Array.isArray(data[key])) return data[key];
  for (const value of Object.values(data)) {
    if (Array.isArray(value) && value.length && value.every(x => x && typeof x === "object")) return value as Obj[];
  }
  return [];
}
async function get(endpoint: string): Promise<any> {
  const response = await fetch(`${API}/${endpoint.replace(/^\/+/, "")}`, {
    headers: { accept: "application/json", referer: "https://public.totalglobalsports.com/" },
  });
  if (!response.ok) throw new Error(`AthleteOne ${response.status} ${endpoint}`);
  const json = await response.json();
  if (json?.result && String(json.result).toLowerCase() !== "success") {
    throw new Error(`AthleteOne API error for ${endpoint}: ${str(json.message || json.result)}`);
  }
  await sleep(DELAY_MS);
  return unwrap(json);
}
function conferenceFrom(name: string): string {
  const n = name.toLowerCase();
  const aliases: Array<[string[], string]> = [
    [["socal", "so cal", "southern cal"], "SoCal"],
    [["norcal", "northern cal", "northern california"], "NorCal"],
    [["golden state"], "Golden State"],
    [["far west"], "Far West"],
    [["frontier"], "Frontier"],
    [["mountain"], "Mountain"],
    [["northwest", "pacific northwest"], "Northwest"],
    [["southwest"], "Southwest"], [["colorado"], "Colorado"], [["utah"], "Utah"],
  ];
  return aliases.find(([keys]) => keys.some(k => n.includes(k)))?.[1] || "";
}
function classify(meta: Obj, org: typeof ORGS[number]): EventMeta | null {
  const eventId = num(meta.eventID ?? meta.eventId ?? meta.id);
  const eventName = str(meta.name ?? meta.eventName ?? meta.event_name);
  if (!eventId || !eventName) return null;
  const season = eventName.match(/20\d{2}\s*-\s*2\d{2}/)?.[0].replace(/\s/g, "") || "";
  if (season && !SEASONS.has(season)) return null;
  const conference = conferenceFrom(eventName);
  if (!conference || !WEST.includes(conference)) return null;
  const lower = eventName.toLowerCase();
  const league = /pre[- ]?ecnl/.test(lower) ? "Pre-ECNL" :
    /regional|ecnl\s*rl|ecrl/.test(lower) ? "ECNL RL" : org.league;
  const gender = /girls/.test(lower) ? "Girls" : /boys/.test(lower) ? "Boys" : org.gender;
  return { eventId, eventName, league, gender, conference, season };
}
function findObjectsWithEventId(value: any, out: Obj[] = []): Obj[] {
  if (Array.isArray(value)) for (const item of value) findObjectsWithEventId(item, out);
  else if (value && typeof value === "object") {
    if (value.eventID !== undefined || value.eventId !== undefined) out.push(value);
    for (const v of Object.values(value)) if (v && typeof v === "object") findObjectsWithEventId(v, out);
  }
  return out;
}
function normalizeDate(value: unknown): string {
  const raw = str(value);
  if (!raw) return "";
  const iso = raw.match(/20\d{2}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}
function divisionGender(division: string, fallback: string): string {
  const s = division.trim().toUpperCase();
  if (s.startsWith("B")) return "Boys";
  if (s.startsWith("G")) return "Girls";
  return fallback;
}
function birthYear(division: string): number | null {
  const m = division.match(/(?:B|G)?(20\d{2})/i);
  return m ? Number(m[1]) : null;
}
function idOf(obj: Obj, ...keys: string[]): number | null {
  for (const key of keys) {
    const n = num(obj[key]);
    if (n !== null) return n;
  }
  return null;
}
function nameOf(obj: Obj, ...keys: string[]): string {
  for (const key of keys) if (str(obj[key])) return str(obj[key]);
  return "";
}

async function discoverEvents(eventArg?: number): Promise<EventMeta[]> {
  const found = new Map<number, EventMeta>();
  for (const org of ORGS) {
    if (eventArg) break;
    try {
      const data = await get(`Event/get-org-club-list-by-orgID/${org.id}`);
      for (const candidate of findObjectsWithEventId(data)) {
        const eventId = idOf(candidate, "eventID", "eventId");
        if (!eventId || eventId <= 0) continue;
        if (found.has(eventId)) continue;
        try {
          const details = await get(`team/get-event-details-by-eventid/${eventId}`);
          const meta = classify(Array.isArray(details) ? details[0] : details, org);
          if (meta) found.set(meta.eventId, meta);
        } catch (error) {
          console.warn(`[ECNL] event ${eventId}: ${String(error)}`);
        }
      }
    } catch (error) {
      console.warn(`[ECNL] org ${org.id} discovery failed: ${String(error)}`);
    }
  }
  if (eventArg) {
    const details = await get(`team/get-event-details-by-eventid/${eventArg}`);
    const meta = classify(Array.isArray(details) ? details[0] : details, ORGS[0]);
    if (meta) found.set(meta.eventId, meta);
    else console.warn(`[ECNL] Event ${eventArg} did not classify as a West ECNL/ECRL event in selected seasons.`);
  } else {
    // Known historical Pre-ECNL seeds from the project's earlier TGS discovery.
    // Add newer IDs with ECNL_PRE_EVENT_IDS once verified; Pre-ECNL does not yet
    // have a confirmed organization ID in the public discovery walk.
    const preIds = (process.env.ECNL_PRE_EVENT_IDS || "3923,4205").split(",").map(Number).filter(Boolean);
    for (const id of preIds) {
      try {
        const details = await get(`team/get-event-details-by-eventid/${id}`);
        const meta = classify(Array.isArray(details) ? details[0] : details, ORGS[0]);
        if (meta && meta.league === "Pre-ECNL") found.set(meta.eventId, meta);
      } catch (error) {
        console.warn(`[ECNL] Pre-ECNL seed ${id} unavailable: ${String(error)}`);
      }
    }
  }
  return [...found.values()].sort((a, b) => a.eventName.localeCompare(b.eventName));
}

async function scrapeEvent(event: EventMeta) {
  console.log(`[ECNL] ${event.eventName} (${event.eventId})`);
  const [overviewRaw, teamRaw, clubRaw] = await Promise.all([
    get(`Event/get-event-schedule-or-standings/${event.eventId}`),
    get(`Event/get-team-list/${event.eventId}`),
    get(`Event/get-org-club-list-by-event/${event.eventId}`),
  ]);
  const overview = unwrap(overviewRaw) || {};
  const divs = [
    ...(Array.isArray(overview.boysDivAndFlightList) ? overview.boysDivAndFlightList : []),
    ...(Array.isArray(overview.girlsDivAndFlightList) ? overview.girlsDivAndFlightList : []),
    ...(Array.isArray(overview.data?.boysDivAndFlightList) ? overview.data.boysDivAndFlightList : []),
    ...(Array.isArray(overview.data?.girlsDivAndFlightList) ? overview.data.girlsDivAndFlightList : []),
  ];
  const teamRows = records(teamRaw, ["teamList", "teams"]);
  const clubRows = records(clubRaw, ["clubList", "clubs"]);
  const teamsById = new Map<number, Obj>();
  const clubsById = new Map<number, Obj>();
  for (const t of teamRows) {
    const id = idOf(t, "teamID", "teamId");
    if (id) teamsById.set(id, t);
  }
  for (const c of clubRows) {
    const id = idOf(c, "clubID", "clubId");
    if (id) clubsById.set(id, c);
  }

  const eventTeams: Obj[] = [];
  for (const [teamId, t] of teamsById) {
    const clubId = idOf(t, "clubID", "clubId");
    const club = clubId ? clubsById.get(clubId) : undefined;
    const division = nameOf(t, "divisionName", "division", "ageGroup");
    const gender = divisionGender(division, event.gender);
    eventTeams.push({
      teamId, teamName: nameOf(t, "name", "teamName"),
      clubId, clubName: club ? nameOf(club, "clubName", "clubFullName", "name") : "",
      league: event.league, conference: event.conference, gender,
      birthYear: birthYear(division), ageGroup: division || null, eventId: event.eventId,
      state: club ? nameOf(club, "stateCode", "state") || null : null,
    });
  }

  const eventClubs: Obj[] = [];
  for (const [clubId, c] of clubsById) {
    eventClubs.push({
      clubId, clubName: nameOf(c, "clubName", "clubFullName", "name"),
      city: nameOf(c, "city") || null, state: nameOf(c, "stateCode", "state") || null,
      website: nameOf(c, "website", "webSite", "clubWebsite") || null,
      leagues: [event.league], genders: [event.gender],
    });
  }

  const eventGames: Obj[] = [];
  const eventStandings: Obj[] = [];
  for (const division of divs) {
    const divisionName = nameOf(division, "divisionName", "name");
    const flights = records(division, ["flightList", "flights"]);
    for (const flight of flights) {
      const flightId = idOf(flight, "flightID", "flightId");
      const divisionId = idOf(division, "divisionID", "divisionId") ?? idOf(flight, "divisionID", "divisionId");
      if (!flightId) continue;
      const flightName = nameOf(flight, "flightName", "name");
      const [scheduleRaw, standingsRaw, flightTeamsRaw] = await Promise.all([
        get(`Event/get-schedules-by-flight/${event.eventId}/${flightId}/0`).catch(e => { console.warn(`  schedule ${flightId}: ${String(e)}`); return []; }),
        get(`Event/get-standings-by-div-and-flight/${divisionId ?? 0}/${flightId}/${event.eventId}`).catch(() => []),
        get(`Event/get-team-list-by-flight/${flightId}`).catch(() => []),
      ]);
      const flightTeamRows = records(flightTeamsRaw, ["teamList", "teams"]);
      for (const t of flightTeamRows) {
        const id = idOf(t, "teamID", "teamId");
        if (id && !teamsById.has(id)) {
          teamsById.set(id, t);
          const clubId = idOf(t, "clubID", "clubId");
          const club = clubId ? clubsById.get(clubId) : undefined;
          eventTeams.push({
            teamId: id, teamName: nameOf(t, "name", "teamName"), clubId,
            clubName: club ? nameOf(club, "clubName", "clubFullName", "name") : "",
            league: event.league, conference: event.conference,
            gender: divisionGender(divisionName, event.gender),
            birthYear: birthYear(divisionName), ageGroup: divisionName || null, eventId: event.eventId,
            state: club ? nameOf(club, "stateCode", "state") || null : null,
          });
        }
      }
      const matches = records(scheduleRaw, ["scheduleList", "matchList", "matches", "gameList"]);
      for (const m of matches) {
        const homeScore = num(m.hometeamscore ?? m.homeTeamScore ?? m.homeScore);
        const awayScore = num(m.awayteamscore ?? m.awayTeamScore ?? m.awayScore);
        const statusText = nameOf(m, "type", "status", "matchStatus").toLowerCase();
        const date = normalizeDate(m.gameDate ?? m.matchDate ?? m.date);
        if (homeScore === null || awayScore === null || !date || /forfeit|cancel|postpon|walkover/.test(statusText)) continue;
        const homeTeamId = idOf(m, "hometeamID", "homeTeamID", "homeTeamId");
        const awayTeamId = idOf(m, "awayteamID", "awayTeamID", "awayTeamId");
        const homeTeam = nameOf(m, "homeTeam", "hometeam") || (homeTeamId ? nameOf(teamsById.get(homeTeamId) || {}, "name", "teamName") : "");
        const awayTeam = nameOf(m, "awayTeam", "awayteam") || (awayTeamId ? nameOf(teamsById.get(awayTeamId) || {}, "name", "teamName") : "");
        if (!homeTeam || !awayTeam || !homeTeamId || !awayTeamId) continue;
        const home = teamsById.get(homeTeamId);
        const away = teamsById.get(awayTeamId);
        const homeClubId = idOf(home || {}, "clubID", "clubId");
        const awayClubId = idOf(away || {}, "clubID", "clubId");
        const homeClub = homeClubId ? clubsById.get(homeClubId) : undefined;
        const awayClub = awayClubId ? clubsById.get(awayClubId) : undefined;
        eventGames.push({
          matchId: idOf(m, "matchID", "matchId") ?? `${event.eventId}-${flightId}-${date}-${homeTeamId}-${awayTeamId}`,
          date, eventId: event.eventId, eventName: event.eventName, league: event.league,
          conference: event.conference, division: divisionName, flight: flightName,
          gender: divisionGender(divisionName, event.gender),
          homeTeamId, awayTeamId, homeTeam, awayTeam,
          homeClubId, awayClubId,
          homeClub: homeClub ? nameOf(homeClub, "clubName", "clubFullName", "name") : "",
          awayClub: awayClub ? nameOf(awayClub, "clubName", "clubFullName", "name") : "",
          homeScore, awayScore, status: "final",
          venue: nameOf(m, "venue", "complex") || null,
        });
      }
      const standingsData = records(standingsRaw, ["teamStandings", "standings", "standingsList"]);
      for (const row of standingsData) {
        const teamId = idOf(row, "teamID", "teamId");
        eventStandings.push({
          eventId: event.eventId, eventName: event.eventName, league: event.league,
          conference: event.conference, gender: divisionGender(divisionName, event.gender),
          division: divisionName, flight: flightName, teamId,
          team: nameOf(row, "name", "teamName"),
          wins: num(row.wins) ?? 0, losses: num(row.losses) ?? 0, draws: num(row.draws) ?? 0,
          goalsFor: num(row.goalsfor ?? row.goalsFor), goalsAgainst: num(row.goalsagainst ?? row.goalsAgainst),
          points: num(row.standingpoints ?? row.points),
        });
      }
    }
  }
  return { teams: eventTeams, clubs: eventClubs, games: eventGames, standings: eventStandings };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const args = process.argv.slice(2);
  const eventIndex = args.indexOf("--event");
  const eventArg = eventIndex >= 0 ? Number(args[eventIndex + 1]) : undefined;
  const events = await discoverEvents(eventArg);
  if (!events.length) throw new Error("No West ECNL/ECRL events discovered. Check API availability and season filters.");
  console.log(`[ECNL] Discovered ${events.length} West events: ${events.map(e => e.eventName).join(" | ")}`);

  const all = { games: [] as Obj[], teams: [] as Obj[], clubs: [] as Obj[], standings: [] as Obj[] };
  for (const event of events) {
    try {
      const result = await scrapeEvent(event);
      all.games.push(...result.games);
      all.teams.push(...result.teams);
      all.clubs.push(...result.clubs);
      all.standings.push(...result.standings);
    } catch (error) {
      console.error(`[ECNL] Failed event ${event.eventId}:`, error);
    }
  }
  const unique = <T extends Obj>(rows: T[], key: (r: T) => string) => [...new Map(rows.map(r => [key(r), r])).values()];
  all.games = unique(all.games, r => String(r.matchId));
  all.teams = unique(all.teams, r => `${r.eventId}:${r.teamId}`);
  all.clubs = unique(all.clubs, r => String(r.clubId));
  all.standings = unique(all.standings, r => `${r.eventId}:${r.division}:${r.flight}:${r.teamId}`);

  for (const [name, data] of Object.entries(all)) {
    const file = path.join(OUT, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
    console.log(`[ECNL] ${name}: ${data.length} → ${file}`);
  }
  console.log("[ECNL] Import complete. No player data was requested or stored.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
