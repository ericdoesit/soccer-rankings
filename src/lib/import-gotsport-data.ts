/**
 * Imports scraped GotSport data into the app's data layer.
 * Reads from data/gotsport/league-games/games.json and
 * data/gotsport/teams.json to provide real rankings data.
 *
 * This replaces the sample data generator for development.
 */

import * as fs from "fs";
import * as path from "path";
import { calculateRankings, type GameInput, type RankingResult } from "./ranking/massey";
import { normalizeDate } from "./dates";
import { seasonEndYear as seasonEndOf } from "./directory/team-names";

export interface RealTeam {
  id: number;
  name: string;
  club: string;
  state: string;
  region: string;
  ageGroup: string;
  gender: "Boys" | "Girls";
  gotsportTeamId: number;
  nationalRank: number | null;
  gotsportPoints: number | null;
}

export interface RealGame {
  id: number;
  team1Name: string;
  team2Name: string;
  team1Score: number;
  team2Score: number;
  date: string;
  eventName: string;
  division: string;
}

interface GotsportTeamEntry {
  team_ranking_data: {
    team_id: number;
    team_name: string;
    club_name: string;
    team_association: string;
    team_region: number;
    age: number;
    gender: string;
    national_rank: number;
    total_points: number;
    total_wins: number;
    total_losses: number;
    total_draws: number;
    total_matches: number;
    total_goals: number;
    total_goals_against: number;
    ranking_date: string;
  };
  events: Array<{ id: number; name: string }>;
}

interface LeagueGame {
  matchNumber: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  location: string;
  division: string;
  eventId: number;
  eventName: string;
}

const DATA_DIR = path.join(process.cwd(), "data", "gotsport");

let _cache: {
  teams: RealTeam[];
  games: RealGame[];
  rankings: RankingResult[];
  teamNameToId: Map<string, number>;
  /** display key → GotSport team_id, for teams that came from the GotSport API */
  gsIdByName: Map<string, number>;
  /** event names dropped as outside the West */
  droppedEvents: string[];
  /** team name → association of the league it came from (sources outside GotSport, e.g. NPSL → WA) */
  sourceAssocByName: Map<string, string>;
  /** MLS NEXT team names ("<club> MLS NEXT B2014") that play in a Western conference */
  mlsWestNames: Set<string>;
  /** team name → association its league is in, used only for state/region (Coast Soccer League → CAS) */
  stateHintByName: Map<string, string>;
  /** team names from Modular11 (MLS NEXT, EA, USL Academy) */
  modularTeamNames: Set<string>;
} | null = null;

function regionFromAssociation(assoc: string): string {
  const regionMap: Record<string, string> = {
    CAS: "Region4", CAN: "Region4", AZ: "Region4", NV: "Region4",
    CO: "Region4", NM: "Region4", UT: "Region4", WA: "Region4",
    OR: "Region4", HI: "Region4", ID: "Region4", MT: "Region4",
    WY: "Region4", AK: "Region4",
    TX: "Region3", OK: "Region3", LA: "Region3", AR: "Region3",
    FL: "Region3", GA: "Region3", SC: "Region3", NC: "Region3",
    TN: "Region3", MS: "Region3", AL: "Region3",
    IL: "Region2", IN: "Region2", OH: "Region2", MI: "Region2",
    WI: "Region2", MN: "Region2", IA: "Region2", MO: "Region2",
    KS: "Region2", NE: "Region2", ND: "Region2", SD: "Region2",
    KY: "Region2", WV: "Region2",
    NY: "Region1", NJ: "Region1", PA: "Region1", CT: "Region1",
    MA: "Region1", RI: "Region1", NH: "Region1", VT: "Region1",
    ME: "Region1", MD: "Region1", VA: "Region1", DE: "Region1",
    DC: "Region1",
    NYE: "Region1", NYW: "Region1", PAE: "Region1", PAW: "Region1",
    ON: "Region2", OS: "Region2", TXN: "Region3", TXS: "Region3",
  };
  return regionMap[assoc] || "National";
}

function ageFromNumber(age: number): string {
  return `U${age}`;
}

// Birth year to age group mapping.
// Pre-2026: calendar year system. U-age = season_end_year - birth_year.
// 2026-27+: school year system (Aug-Jul cutoff). Same formula, different cutoff.
//
// Most of our scraped data is from the 2025-2026 season (Fall 2025 - Spring 2026).
// For that season: U-age = 2026 - birth_year.
// For 2026-27 season: U-age = 2027 - birth_year.
//
// We default to current season. The gameDate param allows per-game accuracy.

function birthYearToAge(birthYear: number, gameDate?: string): string {
  // Determine which season this game belongs to
  // Season runs Aug-Jul. A game in Sep 2025 = 2025-26 season (end year 2026)
  let seasonEndYear = 2026; // default: 2025-26 season (most of our data)

  if (gameDate) {
    const d = new Date(gameDate);
    const year = d.getFullYear();
    const month = d.getMonth(); // 0-indexed
    // Aug-Dec = first half of season ending next year
    // Jan-Jul = second half of season ending this year
    seasonEndYear = month >= 7 ? year + 1 : year;
  }

  const age = seasonEndYear - birthYear;
  if (age < 3 || age > 20) return "U14";
  return `U${age}`;
}

/**
 * Coast Soccer League team key. One CSL name can be several teams ("RIVERSIDE ELITE" has nine
 * birth years, "SLA MAMBAS" a boys and a girls team), so the schedule's gender + age group are
 * turned into a birth year: "RIVERSIDE ELITE B2014". Same birth year next season = same team.
 * CSL's age labels: spring 2026 and fall 2026 use the standard season age (next year − birth
 * year: B2015 is U12 in fall 2026); the fall 2025 pages counted one year lower (B2015 listed as
 * U10). Checked against names with a birth year and a club's coach list.
 * A stray dash before the team's own name ("S1 ALLIANCE -SLA MAMBAS" one season, "S1 ALLIANCE
 * SLA MAMBAS" the next) is dropped so one team isn't split in two.
 */
export function cslTeamName(name: string, g: { ageGroup?: string; gender?: string; season?: string; year?: number | string }): string {
  let n = name.trim().replace(/\s+-(?=[A-Za-z])/g, " ");
  const age = String(g.ageGroup ?? "").match(/^U(\d{1,2})$/);
  if (age && (g.gender === "Boys" || g.gender === "Girls")) {
    const base = g.season === "fall" && Number(g.year) <= 2025 ? Number(g.year) : Number(g.year) + 1;
    const tag = `${g.gender === "Girls" ? "G" : "B"}${base - Number(age[1])}`;
    if (!new RegExp(`\\b${tag}\\b`, "i").test(n)) n = `${n} ${tag}`;
  }
  return n;
}

export function inferAgeAndGender(
  teamName: string,
  division: string
): { ageGroup: string; gender: "Boys" | "Girls" } {
  const combined = `${teamName} ${division}`;

  // Try birth year first (most reliable): "2013", "B2016", "G2012"
  const byMatch = combined.match(/\b20(0[6-9]|1[0-9])\b/);
  if (byMatch) {
    const year = parseInt(byMatch[0]);
    const age = birthYearToAge(year) || "U14";
    const gender = inferGender(combined);
    return { ageGroup: age, gender };
  }

  // Try division birth year pattern: "B08/07", "G13", "B09"
  // These are 2-digit birth years (07=2007, 16=2016)
  const divByMatch = division.match(/^([BG]?)(\d{2})(?:\/(\d{2}))?/);
  if (divByMatch) {
    const num = parseInt(divByMatch[2]);
    const year = 2000 + num;
    if (year >= 2006 && year <= 2025) {
      const gender = divByMatch[1] === "G" ? "Girls" as const : "Boys" as const;
      return { ageGroup: birthYearToAge(year), gender };
    }
  }

  // Try explicit U-age pattern: "U13", "BU11", "GU14"
  const ageMatch = combined.match(/U(\d{1,2})\b/i);
  if (ageMatch) {
    const num = parseInt(ageMatch[1]);
    if (num >= 7 && num <= 20) {
      return { ageGroup: `U${num}`, gender: inferGender(combined) };
    }
  }

  // Try "B13", "G14" pattern — these are birth years, not ages
  // "ALBION SC B13" = birth year 2013, "Surf G16" = birth year 2016
  const bgMatch = combined.match(/\b([BG])(\d{2})\b/);
  if (bgMatch) {
    const num = parseInt(bgMatch[2]);
    const gender = bgMatch[1] === "G" ? "Girls" as const : "Boys" as const;
    const year = 2000 + num;
    if (year >= 2006 && year <= 2025) {
      return { ageGroup: birthYearToAge(year), gender };
    }
  }

  return { ageGroup: "U14", gender: inferGender(combined) };
}

function inferGender(text: string): "Boys" | "Girls" {
  const lower = text.toLowerCase();
  if (
    lower.includes("girl") ||
    /\bG\d{2,4}\b/.test(text) ||
    /\bGU\d/.test(text) ||
    /\d{2,4}G\b/.test(text)
  )
    return "Girls";
  return "Boys";
}

export function loadGotsportData() {
  if (_cache) return _cache;

  const teams: RealTeam[] = [];
  let games: RealGame[] = [];
  const teamNameToId = new Map<string, number>();

  // Load API team data
  const teamsFile = path.join(DATA_DIR, "teams.json");
  if (fs.existsSync(teamsFile)) {
    const apiTeams: GotsportTeamEntry[] = JSON.parse(
      fs.readFileSync(teamsFile, "utf-8")
    );

    for (const entry of apiTeams) {
      const r = entry.team_ranking_data;
      const team: RealTeam = {
        id: r.team_id,
        name: (r.team_name || "").trim(),
        club: (r.club_name || "").trim(),
        state: r.team_association,
        region: regionFromAssociation(r.team_association),
        ageGroup: ageFromNumber(r.age),
        gender: r.gender === "f" ? "Girls" : "Boys",
        gotsportTeamId: r.team_id,
        nationalRank: r.national_rank,
        gotsportPoints: r.total_points,
      };
      teams.push(team);
      teamNameToId.set(r.team_name, r.team_id);
    }
  }

  // GotSport rankings API games (stable match + team IDs, ISO dates). For any
  // event the API covers, it replaces the older Playwright scrape of the same
  // event: for SoCal Fall 2025-26 the API had 99.9% of the Playwright matches,
  // 433 more, and 99.8% score agreement.
  const apiGamesFile = path.join(process.cwd(), "data", "rankings-api", "games.json");
  // Plus every event the West discovery crawler has pulled (data/discovery/games/<event>.json),
  // same record shape; the crawler's copy wins for an event both have (it is newer).
  type ApiGame = { gameId: number; eventId: number; eventName: string; matchNumber: number; homeTeam: string; awayTeam: string; homeTeamId: number; awayTeamId: number };
  const discoveryDir = path.join(process.cwd(), "data", "discovery", "games");
  const discovered: ApiGame[] = fs.existsSync(discoveryDir)
    ? fs.readdirSync(discoveryDir).filter((f) => f.endsWith(".json"))
        .flatMap((f) => JSON.parse(fs.readFileSync(path.join(discoveryDir, f), "utf-8")) as ApiGame[])
    : [];
  const discoveredEvents = new Set(discovered.map((g) => g.eventId));
  let apiGames: ApiGame[] = [
    ...(fs.existsSync(apiGamesFile) ? (JSON.parse(fs.readFileSync(apiGamesFile, "utf-8")) as ApiGame[]) : [])
      .filter((g) => !discoveredEvents.has(g.eventId)),
    ...discovered,
  ];
  // Games GotSport's schedule pages label "Forfeit" (entered as 1-0, not played), from saved
  // schedule pages (scripts/import-standings-paste.ts). The API doesn't say which 1-0s are forfeits.
  const forfeitFile = path.join(process.cwd(), "data", "seed", "forfeit-games.json");
  if (fs.existsSync(forfeitFile)) {
    const forfeits = new Set((JSON.parse(fs.readFileSync(forfeitFile, "utf-8")) as number[]).map(Number));
    apiGames = apiGames.filter((g) => !forfeits.has(Number(g.gameId)));
  }

  // GotSport Region IV directory (data/gotsport-teams/region4.json,
  // scripts/scrape-gotsport-team-directory.ts): every ranked West team by team_id.
  const directoryFile = path.join(process.cwd(), "data", "gotsport-teams", "region4.json");
  const directory: Array<{ teamId: number; teamName: string; clubName: string }> =
    fs.existsSync(directoryFile) ? JSON.parse(fs.readFileSync(directoryFile, "utf-8")) : [];
  const westIds = new Set(directory.map((t) => t.teamId));

  // Drop events outside the West: an early API pull included South Jersey events
  // (SJSL, SJ Cup, Deptford, Gettysburg PA) with 0% Region IV teams. They formed a
  // closed pool whose teams ranked in the overall top 20. National leagues (GA,
  // ~25% West) stay, since they connect West teams to everyone else.
  const droppedEvents: string[] = [];
  if (westIds.size) {
    const teamsByEvent = new Map<number, { name: string; ids: Set<number> }>();
    for (const g of apiGames) {
      const e = teamsByEvent.get(g.eventId) ?? { name: g.eventName, ids: new Set<number>() };
      e.ids.add(g.homeTeamId); e.ids.add(g.awayTeamId);
      teamsByEvent.set(g.eventId, e);
    }
    const outside = new Set<number>();
    for (const [id, e] of teamsByEvent) {
      const west = [...e.ids].filter((t) => westIds.has(t)).length;
      if (e.ids.size >= 20 && west / e.ids.size < 0.05) { outside.add(id); droppedEvents.push(e.name); }
    }
    // …but a West team's own games in such an event still count (NM teams in the El Paso
    // Premier League, West teams at East Coast showcases). Only out-of-region vs
    // out-of-region games, the closed pool, are dropped.
    apiGames = apiGames.filter((g) => !outside.has(g.eventId) || westIds.has(g.homeTeamId) || westIds.has(g.awayTeamId));
  }
  const apiEventIds = new Set(apiGames.map((g) => g.eventId));

  // Load league game data
  let nextId = 900000;
  const seen = new Set<string>();
  let gameId = 1;
  const gamesFile = path.join(DATA_DIR, "league-games", "games.json");
  if (fs.existsSync(gamesFile)) {
    const leagueGames: LeagueGame[] = JSON.parse(
      fs.readFileSync(gamesFile, "utf-8")
    );

    // Build team name lookup from games (captures teams not in API data)
    for (const g of leagueGames) {
      const home = g.homeTeam.trim();
      const away = g.awayTeam.trim();
      if (!teamNameToId.has(home)) teamNameToId.set(home, nextId++);
      if (!teamNameToId.has(away)) teamNameToId.set(away, nextId++);
    }

    // Deduplicate games

    for (const g of leagueGames) {
      if (apiEventIds.has(g.eventId)) continue; // API is the source of record for this event
      const key = `${g.eventId}_${g.matchNumber}_${g.homeTeam.trim()}_${g.awayTeam.trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      games.push({
        id: gameId++,
        team1Name: g.homeTeam.trim(),
        team2Name: g.awayTeam.trim(),
        team1Score: g.homeScore,
        team2Score: g.awayScore,
        date: normalizeDate(g.date),
        eventName: g.eventName,
        division: g.division,
      });
    }
  }

  // The GotSport rankings API names teams without their club ("G2014 LB Tostado"),
  // while the Playwright scrape of the same matches has the full name
  // ("Beach Futbol Club G2014 LB Tostado"). Join the two on (eventId, matchNumber)
  // to learn a full name per stable API team_id, so API games line up with
  // every other source instead of creating duplicate, club-less teams.
  const apiTeamName = new Map<number, string>();
  if (fs.existsSync(gamesFile) && apiGames.length > 0) {
    const pwByMatch = new Map<string, { home: string; away: string }>();
    for (const g of JSON.parse(fs.readFileSync(gamesFile, "utf-8")) as LeagueGame[]) {
      if (g.matchNumber) {
        pwByMatch.set(`${g.eventId}_${g.matchNumber}`, { home: g.homeTeam.trim(), away: g.awayTeam.trim() });
      }
    }
    for (const g of apiGames) {
      const pw = pwByMatch.get(`${g.eventId}_${g.matchNumber}`);
      if (!pw) continue;
      for (const [short, id] of [[g.homeTeam.trim(), g.homeTeamId], [g.awayTeam.trim(), g.awayTeamId]] as const) {
        if (!id || apiTeamName.has(id)) continue;
        // Only accept unambiguous "<club> <short name>" matches
        if (pw.home.endsWith(short)) apiTeamName.set(id, pw.home);
        else if (pw.away.endsWith(short)) apiTeamName.set(id, pw.away);
      }
    }
  }

  // Full names copied from event standings pages (scripts/import-standings-paste.ts)
  const pastedNamesFile = path.join(process.cwd(), "data", "seed", "pasted-team-names.json");
  if (fs.existsSync(pastedNamesFile)) {
    for (const [id, name] of Object.entries(JSON.parse(fs.readFileSync(pastedNamesFile, "utf-8")) as Record<string, string>)) {
      if (!apiTeamName.has(Number(id))) apiTeamName.set(Number(id), name.trim());
    }
  }

  // Teams still unnamed: "<club> <team name>" from the directory.
  for (const t of directory) {
    if (apiTeamName.has(t.teamId) || !t.clubName) continue;
    const club = t.clubName.trim();
    const team = t.teamName.trim();
    apiTeamName.set(t.teamId, team.toLowerCase().startsWith(club.toLowerCase()) ? team : `${club} ${team}`);
  }

  // Two different GotSport teams can resolve to the same display name (a club with
  // two "B2009" squads). Sharing a name would merge them into one team that plays
  // itself, so colliding ids keep their #team_id suffix.
  const idsByName = new Map<string, number[]>();
  for (const [id, name] of apiTeamName) idsByName.set(name, [...(idsByName.get(name) ?? []), id]);
  for (const [name, ids] of idsByName) if (ids.length > 1) for (const id of ids) apiTeamName.set(id, `${name} #${id}`);

  const gsIdByName = new Map<string, number>();
  const sourceAssocByName = new Map<string, string>();
  const stateHintByName = new Map<string, string>();
  // MLS NEXT 2026-27 conferences made up of Western clubs (scripts/predict-mlsnext.ts flags the same set)
  const MLS_WEST_CONFERENCES = new Set(["Desert", "Mountain", "Northern California Coast", "Northern California Redwood",
    "Pacific Northwest", "South California", "Northwest", "Southwest"]);
  const mlsWestNames = new Set<string>();
  const demoDir = path.join(process.cwd(), "data", "demosphere");
  const demoAssoc = new Map<string, string>(
    (fs.existsSync(path.join(demoDir, "leagues.json")) ? JSON.parse(fs.readFileSync(path.join(demoDir, "leagues.json"), "utf-8")) : [])
      .map((l: { league: string; association: string }) => [l.league, l.association]));

  // Load additional data sources
  const modularFile = path.join(process.cwd(), "data", "modular11", "games.json");
  /** team names from Modular11 and the MLS NEXT Cup file, for merging with their GotSport twins */
  const modularTeamNames = new Set<string>();
  const mlsNextFile = path.join(process.cwd(), "data", "mlsnext", "games.json");
  // Generation adidas Cup: teams are written as bare club names ("LA Galaxy"). MLS NEXT clubs
  // get their league name ("LA Galaxy MLS NEXT U15") so the cup joins their league history;
  // foreign clubs ("FC Bayern U15") stay on their own.
  const adidasFile = path.join(process.cwd(), "data", "adidas-cup", "games.json");
  const ADIDAS_CLUB: Record<string, string> = { LAFC: "Los Angeles Football Club" };
  const mlsNextClubs = new Set<string>();
  for (const f of [modularFile, path.join(process.cwd(), "data", "mlsnext-tracker", "games.json")]) {
    if (!fs.existsSync(f)) continue;
    for (const g of JSON.parse(fs.readFileSync(f, "utf-8")) as Array<{ leagueId?: number; homeClub?: string; awayClub?: string }>) {
      if (g.leagueId !== undefined && g.leagueId !== 12) continue;
      for (const c of [g.homeClub, g.awayClub]) if (c) mlsNextClubs.add(c.trim().toLowerCase());
    }
  }
  // MLS NEXT 2026-27 (Homegrown + Academy) via mlsnexttracker.com (scripts/scrape-mlsnext-tracker.ts):
  // named like Modular11 ("<club> MLS NEXT U15") so it joins last season's teams
  const mlsTrackerFile = path.join(process.cwd(), "data", "mlsnext-tracker", "games.json");
  const ecnlFile = path.join(process.cwd(), "data", "ecnl", "games.json");
  const additionalSources = [
    { file: path.join(DATA_DIR, "az-nv-games", "games.json"), fields: ["homeTeam", "awayTeam", "homeScore", "awayScore", "date", "eventName"] },
    { file: path.join(process.cwd(), "data", "coast-soccer", "games.json"), fields: ["homeTeam", "awayTeam", "homeScore", "awayScore", "date"] },
    { file: path.join(process.cwd(), "data", "rankings-api", "games.json"), fields: ["homeTeam", "awayTeam", "homeScore", "awayScore", "date", "eventName"] },
    { file: path.join(process.cwd(), "data", "utah", "games.json"), fields: ["homeTeam", "awayTeam", "homeScore", "awayScore"] },
    // data/tgs (Pre-ECNL 2025-26 from TotalGlobalSports) is NOT used: TGS's robots.txt
    // disallows Claude's crawler, so it can't be kept fresh (user decision 2026-11-11).
    // MLS NEXT, Elite Academy League, USL Academy (scripts/scrape-modular11.ts)
    // ECNL, ECNL RL, Pre-ECNL (data/ecnl, collected by the user from the AthleteOne API)
    { file: ecnlFile, fields: ["homeTeam", "awayTeam", "homeScore", "awayScore", "date", "eventName"] },
    { file: modularFile, fields: ["homeTeam", "awayTeam", "homeScore", "awayScore", "date", "eventName"] },
    { file: mlsTrackerFile, fields: ["homeTeam", "awayTeam", "homeScore", "awayScore", "date", "eventName"] },
    // data/ysg is NOT used: its away scores are corrupt (2026-11-10 check against the
    // GotSport API on the same matches: 29% agreement, e.g. "2-37" vs "2-3"; average
    // margin 26 goals vs ~3 for every other source). Its GotSport events are queued in
    // the discovery crawler instead (scripts/discover-west.ts, source "ysg").
    { file: path.join(process.cwd(), "data", "surfcup", "games.json"), fields: ["homeTeam", "awayTeam", "homeScore", "awayScore", "date", "eventName"] },
    // AthleteOne (TotalGlobalSports) schedules pasted by the user (scripts/import-athleteone-paste.ts);
    // its robots.txt blocks automated access, so nothing is fetched
    { file: path.join(process.cwd(), "data", "athleteone", "games.json"), fields: ["homeTeam", "awayTeam", "homeScore", "awayScore", "date", "eventName"] },
    { file: mlsNextFile, fields: ["homeTeam", "awayTeam", "homeScore", "awayScore", "date", "tournament"] },
    { file: adidasFile, fields: ["homeTeam", "awayTeam", "homeScore", "awayScore", "date", "tournament"] },
    // Leagues not on GotSport, scraped from Demosphere (scripts/scrape-demosphere-league.ts)
    ...(fs.existsSync(path.join(process.cwd(), "data", "demosphere"))
      ? fs.readdirSync(path.join(process.cwd(), "data", "demosphere"), { withFileTypes: true }).filter((d) => d.isDirectory())
          .map((d) => ({ file: path.join(process.cwd(), "data", "demosphere", d.name, "games.json"),
            fields: ["homeTeam", "awayTeam", "homeScore", "awayScore", "date", "eventName"] }))
      : []),
  ];

  for (const source of additionalSources) {
    if (!fs.existsSync(source.file) && source.file !== apiGamesFile) continue;
    try {
      const raw = source.file === apiGamesFile ? apiGames : JSON.parse(fs.readFileSync(source.file, "utf-8"));
      const venues = new Set<string>(source.file === apiGamesFile ? [] :
        (raw as Array<{ venue?: unknown }>).map((g) => (typeof g.venue === "string" ? g.venue.trim().toLowerCase() : ""))
          .filter((v) => v.length > 5));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const g of raw as any[]) {
        let t1 = (g[source.fields[0]] || g.homeTeam || g.team1 || "").trim();
        let t2 = (g[source.fields[1]] || g.awayTeam || g.team2 || "").trim();
        const isApi = source.file === apiGamesFile;
        // Modular11 / MLS NEXT playoff names carry the age as written that season
        // ("Crusaders SC EA2 U13"): the same name means a different birth year next
        // season, so name the team by birth year instead ("… EA2 B2014").
        if (source.file === ecnlFile) {
          // ECNL names carry birth years ("FC Portland ECNL B2013/14"); age otherwise comes
          // from the division ("BU13") and the game date
          const d = normalizeDate(String(g.date ?? ""));
          if (!d || d > new Date().toISOString().slice(0, 10) || g.status !== "final") continue;
          modularTeamNames.add(t1); modularTeamNames.add(t2);
        }
        if (source.file === mlsTrackerFile && !g.completed) continue; // fixtures: predicted, not rated
        if (source.file === modularFile || source.file === mlsNextFile || source.file === mlsTrackerFile || source.file === adidasFile) {
          if (source.file === mlsNextFile && g.ageGroup) { t1 = `${t1} MLS NEXT ${g.ageGroup}`; t2 = `${t2} MLS NEXT ${g.ageGroup}`; }
          if (source.file === adidasFile && g.ageGroup) {
            const named = (t: string) => { const c = ADIDAS_CLUB[t] ?? t; return mlsNextClubs.has(c.toLowerCase()) ? `${c} MLS NEXT ${g.ageGroup}` : `${c} ${g.ageGroup}`; };
            t1 = named(t1); t2 = named(t2);
          }
          const d = normalizeDate(String(g.date ?? ""));
          const end = d && /^\d{4}-\d{2}-\d{2}/.test(d) ? seasonEndOf(new Date(d)) : null;
          if (end) {
            const byYear = (t: string) => t.replace(/ U(\d{1,2})$/, (_m: string, a: string) => ` B${end - Number(a)}`);
            t1 = byYear(t1); t2 = byYear(t2);
          }
          // a few Modular11 fixtures months ahead carry placeholder scores
          if (!d || d > new Date().toISOString().slice(0, 10)) continue;
          modularTeamNames.add(t1); modularTeamNames.add(t2);
          if (source.file === mlsTrackerFile && !g.flex && !g.proPathway && MLS_WEST_CONFERENCES.has(g.conference)) {
            mlsWestNames.add(t1); mlsWestNames.add(t2);
          }
        }
        // The TGS scrape glued a venue onto team names ("… Boys 2016 Surf Sports Park -
        // Field 14 7 v 7"), often one from a different row, splitting one team into
        // several. Strip any venue that appears anywhere in the same file.
        if (venues.size) { t1 = stripVenue(t1, venues); t2 = stripVenue(t2, venues); }
        // …and in some rows the "home team" was the away team plus a venue: the real
        // home team was lost, so the game can't be used.
        if (!isApi && t1 === t2) continue;
        // Coast Soccer League: when a team withdraws it is renamed "… DROP(PED)" and every game
        // left on its schedule is entered as a 1-0 forfeit, future dates included. Forfeits aren't
        // results; games it really played before dropping (other scores) still count.
        if (source.file.includes("coast-soccer")) {
          if (date0(g) > new Date().toISOString().slice(0, 10)) continue;
          const forfeit = Number(g.homeScore) + Number(g.awayScore) === 1;
          if (forfeit && /\bDROP(PED)?\b/i.test(`${t1} ${t2}`)) continue;
          // One CSL name can be several teams ("RIVERSIDE ELITE" has nine birth years, "SLA MAMBAS"
          // a boys and a girls team): the schedule gives age group and gender, so tell them apart
          // by gender + birth year ("RIVERSIDE ELITE B2014"). Same birth year next season = same team.
          t1 = cslTeamName(t1, g); t2 = cslTeamName(t2, g);
          // a Southern California league: its teams are Cal South (club matching and region)
          stateHintByName.set(t1, "CAS"); stateHintByName.set(t2, "CAS");
        }
        if (!isApi && g.league && demoAssoc.has(g.league)) {
          if (date0(g) > new Date().toISOString().slice(0, 10)) continue;
          sourceAssocByName.set(t1, demoAssoc.get(g.league)!); sourceAssocByName.set(t2, demoAssoc.get(g.league)!);
        }
        if (isApi) {
          // GotSport occasionally lists a team against itself (N1 NW1, IYSA D3L)
          if (g.homeTeamId && g.homeTeamId === g.awayTeamId) continue;
          // Key API teams by their stable team_id. Short names collide across
          // clubs (every GA club has a "13G GA"), so without a recovered full
          // name (Playwright join or GotSport directory), suffix the id to keep
          // teams distinct.
          // The first short name seen sticks to the id, so one team whose short
          // name varies by event ("Spartans 2016B" / "Spartans 2016") stays one team.
          for (const [short, id, side] of [[t1, g.homeTeamId, 1], [t2, g.awayTeamId, 2]] as const) {
            if (!id) continue; // a few records lack a team id: keep the short name
            if (!apiTeamName.has(id)) apiTeamName.set(id, `${short} #${id}`);
            const key = apiTeamName.get(id)!;
            gsIdByName.set(key, id);
            if (side === 1) t1 = key; else t2 = key;
          }
        } else {
          // Other scrapes (YSG, AZ/NV) re-captured GotSport events team by team,
          // with differently formatted names, so cross-source dedup can't catch
          // them. If the API covers the event, it is the source of record.
          const evId =
            Number(g.eventId) ||
            Number(String(g.sourceUrl ?? "").match(/gotsport\.com\/org_event\/events\/(\d+)/)?.[1]);
          if (evId && apiEventIds.has(evId)) continue;
        }
        const s1 = g[source.fields[2]] ?? g.homeScore ?? g.team1Score ?? 0;
        const s2 = g[source.fields[3]] ?? g.awayScore ?? g.team2Score ?? 0;
        // Some sources (Utah) only carry a kick-off time; normalizeDate
        // returns "" for those rather than a bogus string.
        const date = normalizeDate(g[source.fields[4]] || g.date || "");
        const event = g[source.fields[5]] || g.eventName || g.tournament
          // Coast Soccer League rows carry season + year ("fall", 2025) but no event name
          || (source.file.includes("coast-soccer") && g.season && g.year
            ? `Coast Soccer League ${g.season === "fall" ? `${g.year}-${String(Number(g.year) + 1).slice(2)}` : `${Number(g.year) - 1}-${String(g.year).slice(2)}`} ${g.season[0].toUpperCase()}${g.season.slice(1)}`
            : "");

        if (!t1 || !t2 || typeof s1 !== "number" || typeof s2 !== "number") continue;
        if (s1 > 20 || s2 > 20) continue;
        // Name heuristics guard against mis-parsed HTML rows; API rows have IDs.
        if (!isApi && (t1.length < 5 || t2.length < 5)) continue;
        const badName = (n: string) =>
          /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(n) ||
          /^\d{2,4}[BG]\s/i.test(n) ||
          /^\d{2}\/\d{2}[BG]\s/i.test(n);
        if (!isApi && (badName(t1) || badName(t2))) continue;

        // Normalize LV Heat Surf names at import time so all variants get same ID
        // (scraped sources only: API teams are already keyed by team_id)
        for (const tn of isApi ? [] : [0, 1]) {
          let name = tn === 0 ? t1 : t2;
          if (/las vegas heat|lv heat surf/i.test(name)) {
            name = name.replace(/^\s*(?:Las Vegas Heat Surf|LV Heat Surf)\s*(?:SC|FC)?\s*/gi, "");
            name = name.replace(/^(?:Las Vegas Heat Surf|LV Heat Surf)\s*(?:SC|FC)?\s*/gi, "");
            name = name.replace(/^\s*-\s*/, "");
            name = name.replace(/\s*-\s*\d+\/\d+\s*$/, "");
            name = name.replace(/&#\d+;/g, "'");
            name = name.replace(/\bS\.Cal\b/g, "SoCal");
            name = name.replace(/([BG])20(\d{2})/g, "$1$2");
            name = "LV Heat Surf " + name.trim();
            name = name.replace(/\s+/g, " ").trim();
          }
          if (tn === 0) t1 = name; else t2 = name;
        }

        if (!teamNameToId.has(t1)) teamNameToId.set(t1, nextId++);
        if (!teamNameToId.has(t2)) teamNameToId.set(t2, nextId++);

        const key = `${t1}_${t2}_${s1}_${s2}_${date}`;
        if (seen.has(key)) continue;
        seen.add(key);

        games.push({
          id: gameId++,
          team1Name: t1,
          team2Name: t2,
          team1Score: s1,
          team2Score: s2,
          date,
          eventName: event,
          division: typeof g.division === "string" ? g.division
            // Coast Soccer League rows give the age group and gender ("U13", "Girls")
            : source.file.includes("coast-soccer") && g.gender ? g.gender : "",
        });
      }
    } catch {
      // skip failed source
    }
  }

  // Dedup by team IDs + score + date (catches same game from different sources)
  const idDedup = new Set<string>();
  const dedupedGames = games.filter((g) => {
    const id1 = teamNameToId.get(g.team1Name) || 0;
    const id2 = teamNameToId.get(g.team2Name) || 0;
    const lo = Math.min(id1, id2);
    const hi = Math.max(id1, id2);
    const sLo = id1 < id2 ? g.team1Score : g.team2Score;
    const sHi = id1 < id2 ? g.team2Score : g.team1Score;
    const key = `${lo}_${hi}_${sLo}_${sHi}_${g.date}`;
    if (idDedup.has(key)) return false;
    idDedup.add(key);
    return true;
  });
  games = dedupedGames;

  // Run Massey rankings on the game data
  const gameInputs: GameInput[] = games.map((g) => ({
    team1Id: teamNameToId.get(g.team1Name) || 0,
    team2Id: teamNameToId.get(g.team2Name) || 0,
    team1Score: g.team1Score,
    team2Score: g.team2Score,
    date: g.date,
    status: "completed" as const,
  }));

  // provisional: getDataSet (src/lib/data.ts) re-rates the merged games with league ties
  const rankings = calculateRankings(gameInputs.map((g, i) => ({ ...g, tournamentName: games[i].eventName })), { minGames: 10 });

  _cache = { teams, games, rankings, teamNameToId, gsIdByName, droppedEvents, sourceAssocByName, modularTeamNames, mlsWestNames, stateHintByName };
  return _cache;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const date0 = (g: any) => normalizeDate(g.date || "");

/** Remove a trailing venue ("Surf Sports Park - Field 14 7 v 7") from a team name. */
function stripVenue(name: string, venues: Set<string>): string {
  const lower = name.toLowerCase();
  let best = "";
  for (const v of venues) if (v.length > best.length && lower.endsWith(v) && lower.length > v.length + 3) best = v;
  return best ? name.slice(0, -best.length).replace(/[\s\-–]+$/, "") : name;
}

export function hasRealData(): boolean {
  const teamsFile = path.join(DATA_DIR, "teams.json");
  const gamesFile = path.join(DATA_DIR, "league-games", "games.json");
  return fs.existsSync(teamsFile) || fs.existsSync(gamesFile);
}
