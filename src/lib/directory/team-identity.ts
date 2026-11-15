/**
 * Fills in club, state, current-season age group, gender and display name for
 * every snapshot team, from the best evidence available:
 *
 *   1. GotSport Region IV directory by team_id (club, association, age, gender;
 *      GotSport's own current-season data)
 *   2. club-name prefix match against directory clubs ("Beach FC B2012 …")
 *   3. the states of the events the team played in (discovery frontier)
 *   4. the team name itself (birth year, U##, B/G)
 *
 * Acronyms are never used to guess a club for a team outside the directory:
 * "COSC" is California Odyssey SC in CA and Collingswood Oaklyn SC in NJ.
 */
import * as fs from "fs";
import * as path from "path";
import { ASSOCIATIONS, METROS } from "./geo";
import { normalizeClubName, standardizeAbbreviations } from "./normalize";
import { currentAgeGroup, formatTeamName, parseTeamName } from "./team-names";
import { clubMatcher } from "./club-match";

interface TeamLike {
  id: number; name: string; club: string; state: string; region: string;
  ageGroup: string; gender: "Boys" | "Girls"; sourceName?: string; gotsportTeamId?: number; clubVerified?: boolean;
}
interface GameLike { team1Id: number; team2Id: number; tournamentName: string; date: string }
interface DirTeam { teamId: number; teamName: string; clubName: string; association: string; age: number; gender: string }

const WEST_ASSOC = new Set(Object.keys(ASSOCIATIONS));
const CUP_TO_ASSOC: Record<string, string> = Object.fromEntries(
  Object.entries(ASSOCIATIONS).map(([assoc, [, cup]]) => [cup, assoc]));

function loadJson<T>(file: string, fallback: T): T {
  try { return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf-8")) as T) : fallback; } catch { return fallback; }
}

/**
 * League club directories: league sites that list each member club and its
 * teams by GotSport id (scripts/scrape-norcal-premier-clubs.ts, …). Each entry:
 * [file, association code of the league's clubs].
 */
const LEAGUE_CLUB_FILES: Array<[string, string]> = [
  [path.join("data", "norcal-premier", "clubs.json"), "CAN"],
];
interface LeagueClub { name: string; city: string | null; website: string | null; teams: Array<{ gotsportTeamId: number; name: string; age: number | null; gender: "Boys" | "Girls" | null }> }
/** Club websites found by searching when a league page has none or a dead one */
export function clubWebsiteOverrides(): Map<number, string> {
  const rows = loadJson<Array<{ gotsportOrgId: number; website: string }>>(path.join(process.cwd(), "data", "seed", "club-websites.json"), []);
  return new Map(rows.map((r) => [r.gotsportOrgId, r.website]));
}

function leagueTeams() {
  const out = new Map<number, { club: LeagueClub; team: LeagueClub["teams"][number]; association: string }>();
  for (const [file, association] of LEAGUE_CLUB_FILES)
    for (const club of loadJson<LeagueClub[]>(path.join(process.cwd(), file), []))
      for (const team of club.teams) if (!out.has(team.gotsportTeamId)) out.set(team.gotsportTeamId, { club, team, association });
  return out;
}

/** event name → association code (CAS/CAN/AZ/…, or a non-West state code) */
const NATIONAL_EVENT = /\bnational (championships?|cup finals|presidents.? cup)\b|\bnpl finals\b|\bdpl finals\b|\baspire finals\b|mls next (cup|fest)|\bnationals\b|elite 64|^nl (winter|spring|summer|fall) event|national league (winter|spring|showcase)/i;

function eventAssociations(): Map<string, string> {
  const f = loadJson<{ events: Record<string, { name?: string; state?: string; metro?: string | null }> | Array<{ name?: string; state?: string; metro?: string | null }> }>(
    path.join(process.cwd(), "data", "discovery", "frontier.json"), { events: [] });
  const metroCup = new Map(METROS.map((m) => [m.slug, m.stateCup]));
  const out = new Map<string, string>();
  for (const e of Array.isArray(f.events) ? f.events : Object.values(f.events)) {
    if (!e.name || !e.state) continue;
    // national finals are hosted somewhere but draw teams from everywhere: their
    // location says nothing about a team's state ("Minneapolis United" at NPL Finals in CO)
    if (NATIONAL_EVENT.test(e.name)) continue;
    if (e.state === "CA") {
      const cup = e.metro ? metroCup.get(e.metro) : undefined;
      if (cup && CUP_TO_ASSOC[cup]) out.set(e.name, CUP_TO_ASSOC[cup]);
      // CA event without a metro: north/south unknown. Never replaces a known side
      // (the same event name can be listed with and without a metro)
      if (!out.has(e.name)) out.set(e.name, "CA");
      continue;
    }
    out.set(e.name, e.state);
  }
  return out;
}

const US_STATES = new Set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" "));
const STATE_NAME_RE = /\b(arizona|california|colorado|nevada|utah|washington|oregon|idaho|montana|wyoming|alaska|hawaii|new mexico)\b/;

export function buildTeamIdentity<T extends TeamLike>(
  teams: T[],
  games: GameLike[],
  gsIdByName: Map<string, number>,
  divisionByName: Map<string, { division: string; date: string }> = new Map(),
  sourceAssocByName: Map<string, string> = new Map(),
  mlsWestNames: Set<string> = new Set(),
  /** association of a team's league, used only to place it (state, region), not to pick its club */
  stateHintByName: Map<string, string> = new Map(),
): { teams: T[]; stats: string } {
  const dir = loadJson<DirTeam[]>(path.join(process.cwd(), "data", "gotsport-teams", "region4.json"), []);
  const dirById = new Map(dir.map((t) => [t.teamId, t]));
  const leagueById = leagueTeams();

  // Directory clubs by normalized name; one name can be a club in several states
  const clubCount = new Map<string, number>();
  // NUL separator: club names can contain "|" ("Valley Surf | America")
  // (trimmed: GotSport has "LV Heat Surf SC" and "LV Heat Surf SC ")
  for (const t of dir) {
    const k = `${t.clubName.trim()}\u0000${t.association}`;
    clubCount.set(k, (clubCount.get(k) ?? 0) + 1);
  }
  const clubsByKey = new Map<string, Array<{ name: string; association: string; n: number }>>();
  for (const [k, n] of clubCount) {
    const [name, association] = k.split("\u0000");
    const key = normalizeClubName(name);
    if (key.length < 4) continue;
    clubsByKey.set(key, [...(clubsByKey.get(key) ?? []), { name, association, n }]);
  }
  /**
   * Club from the leading words of a team name. `es` is the state the team's
   * events point to: when known, only that state's clubs count ("United Silicon
   * Valley" must not land on "FC United (NM)"). Without evidence, a one-word key
   * ("united", "rush") counts only for a single large club.
   */
  const matchClub = (raw: string, es: string | null) => {
    const words = parseTeamName(raw).rest.split(" ");
    // a short name the club list can't resolve ("VILLARREAL LV" in Nevada)
    const alias = es ? aliasFor(es, words[0]) : undefined;
    if (alias) return { name: alias, association: es!, n: 0 };
    for (let k = Math.min(6, words.length); k >= 1; k--) {
      const key = normalizeClubName(words.slice(0, k).join(" "));
      const cands = clubsByKey.get(key);
      if (!cands) continue;
      if (es) {
        // "CA" = a California event whose north/south side we don't know
        const hit = es === "CA" ? cands.filter((c) => c.association === "CAS" || c.association === "CAN").sort((a, b) => b.n - a.n)[0]
          : cands.find((c) => c.association === es);
        if (hit) return hit;
        // a multi-word club name is specific enough to beat event evidence: teams
        // travel ("Villarreal Las Vegas Academy" at Surf Challenge in San Diego)
        // (>= 3 words, or a state name; two-word place names like "South Valley" or
        // "West Valley" exist in several states)
        if (key.split(" ").length >= 3 || STATE_NAME_RE.test(key)) return cands.reduce((a, b) => (b.n > a.n ? b : a));
        continue;
      }
      // no state evidence: a one-word name only when one large club holds ≥ 90% of the
      // teams under it ("Beach", "Legends"; not "United" or "Elite")
      const top = cands.reduce((a, b) => (b.n > a.n ? b : a));
      const total = cands.reduce((x, c) => x + c.n, 0);
      if (!key.includes(" ") && !(top.n >= 20 && top.n / total >= 0.9)) continue;
      return top;
    }
    return null;
  };

  // Teams from a non-GotSport league (NPSL → WA) are matched only against clubs of
  // that association: GotSport directory clubs plus the association/league club lists.
  const assocMatchers = new Map<string, { m: ReturnType<typeof clubMatcher>; canonical: Map<string, string> }>();
  const leagueClubNames = new Map<string, Set<string>>();
  const lcDir = path.join(process.cwd(), "data", "league-clubs");
  for (const f of fs.existsSync(lcDir) ? fs.readdirSync(lcDir).filter((x) => x.endsWith(".json")) : []) {
    const l = loadJson<{ association: string; clubs: Array<{ name: string; association?: string }> }>(path.join(lcDir, f), { association: "", clubs: [] });
    for (const c of l.clubs) {
      const a = c.association ?? l.association;
      leagueClubNames.set(a, (leagueClubNames.get(a) ?? new Set()).add(c.name));
    }
  }
  const matcherFor = (assoc: string) => {
    let x = assocMatchers.get(assoc);
    if (!x) {
      const dirNames = [...new Set(dir.filter((t) => t.association === assoc).map((t) => t.clubName.trim()))];
      const dm = clubMatcher(dirNames);
      // league-list names resolve to the directory spelling when they match one
      const canonical = new Map<string, string>();
      for (const n of leagueClubNames.get(assoc) ?? []) canonical.set(n, dm.match(n) ?? n);
      x = { m: clubMatcher([...new Set([...dirNames, ...canonical.keys()])]), canonical };
      assocMatchers.set(assoc, x);
    }
    return x;
  };
  const aliases = loadJson<Record<string, Record<string, { club: string; pattern?: string }>>>(
    path.join(process.cwd(), "data", "seed", "club-aliases.json"), {});
  /** pattern aliases: a regex on the full team name names the club of a team listed without one */
  const patternAliases = Object.entries(aliases).flatMap(([assoc, table]) =>
    typeof table === "object" ? Object.values(table).filter((a) => a.pattern).map((a) => ({ re: new RegExp(a.pattern!, "i"), club: a.club, association: assoc })) : []);
  /** alias lookup by first word, any case ("PSA", "Villarreal") */
  function aliasFor(assoc: string, word: string | undefined): string | undefined {
    if (!word) return undefined;
    const table = aliases[assoc];
    if (!table) return undefined;
    const key = Object.keys(table).find((k) => k.toUpperCase() === word.toUpperCase());
    return key ? table[key].club : undefined;
  }
  const matchInAssoc = (raw: string, assoc: string) => {
    const { m, canonical } = matcherFor(assoc);
    const words = parseTeamName(raw).rest.split(" ");
    const alias = aliasFor(assoc, words[0]);
    if (alias) return { name: canonical.get(alias) ?? m.match(alias) ?? alias, association: assoc };
    for (let k = Math.min(5, words.length); k >= 1; k--) {
      const hit = m.match(words.slice(0, k).join(" "));
      if (hit) return { name: canonical.get(hit) ?? hit, association: assoc };
    }
    return null;
  };

  // Majority event association per team
  const evAssoc = eventAssociations();
  const votes = new Map<number, Map<string, number>>();
  for (const g of games) {
    const a = evAssoc.get(g.tournamentName);
    if (!a) continue;
    for (const id of [g.team1Id, g.team2Id]) {
      const m = votes.get(id) ?? new Map<string, number>();
      m.set(a, (m.get(a) ?? 0) + 1);
      votes.set(id, m);
    }
  }
  const eventState = (id: number) => {
    const m = votes.get(id);
    if (!m) return null;
    // a known state wins over "CA" (California, side unknown), as before CA votes existed
    const known = [...m].filter(([a]) => a !== "CA").sort((a, b) => b[1] - a[1]);
    return known[0]?.[0] ?? "CA";
  };

  // Opponents' states: a team that mostly plays Cal South teams is in Cal South.
  // Fallback when its events don't say (league schedules from outside the GotSport
  // crawl have no event state). Opponent states are provisional: the directory,
  // else the source league's state, else a loose name match (any club, any length).
  const loose = (raw: string) => {
    const words = parseTeamName(raw).rest.split(" ");
    for (let k = Math.min(6, words.length); k >= 1; k--) {
      const cands = clubsByKey.get(normalizeClubName(words.slice(0, k).join(" ")));
      if (cands) return cands.reduce((a, b) => (b.n > a.n ? b : a)).association;
    }
    return null;
  };
  const provAssoc = new Map<number, string>();
  for (const t of teams) {
    const raw = t.sourceName ?? t.name;
    const id = gsIdByName.get(raw) ?? (dirById.has(t.id) ? t.id : undefined);
    const a = (id !== undefined ? dirById.get(id)?.association : undefined) ?? sourceAssocByName.get(raw) ?? stateHintByName.get(raw) ?? loose(raw);
    if (a) provAssoc.set(t.id, a);
  }
  const oppVotes = new Map<number, Map<string, number>>();
  for (const g of games) {
    for (const [me, them] of [[g.team1Id, g.team2Id], [g.team2Id, g.team1Id]]) {
      const a = provAssoc.get(them);
      if (!a) continue;
      const m = oppVotes.get(me) ?? new Map<string, number>();
      m.set(a, (m.get(a) ?? 0) + 1);
      oppVotes.set(me, m);
    }
  }
  /** opponents' state when at least 4 games and a 2/3 majority point to it */
  const opponentState = (id: number) => {
    const m = oppVotes.get(id);
    if (!m) return null;
    const total = [...m.values()].reduce((x, y) => x + y, 0);
    const [a, n] = [...m].sort((x, y) => y[1] - x[1])[0];
    return total >= 3 && n / total >= 2 / 3 ? a : null;
  };
  /** a state tag in the team's own name: "Beach FC (CA) …" → CA, "Celtic (S-CA)" → CAS */
  const tagState = (raw: string) => {
    const m = raw.match(/\((S-CA|N-CA|[A-Z]{2})\)/);
    if (!m) return null;
    if (m[1] === "S-CA") return "CAS";
    if (m[1] === "N-CA") return "CAN";
    return m[1] === "CA" || WEST_ASSOC.has(m[1]) ? m[1] : null;
  };
  /** the team's own name says it is from a state outside the West: "PSC Academy 12B (NJ)" */
  const outsideTag = (raw: string) => {
    const m = raw.match(/\(([A-Z]{2})\)/);
    return !!m && m[1] !== "CA" && !WEST_ASSOC.has(m[1]) && US_STATES.has(m[1]);
  };

  const s = { approved: 0, orgClub: 0, mlsConference: 0, league: 0, directory: 0, clubMatch: 0, eventState: 0, unknownState: 0, unknownAge: 0, outOfRegion: 0 };
  // GotSport organization (club account) per team, from the discovery crawl. Teams GotSport
  // publishes without a club ("B2016 LB Payeras") share an organization with named teams of
  // their club ("Beach FC B2016 LB Tostado"): when 80%+ of an organization's directory teams
  // (2 or more) are one club, its unnamed teams are that club.
  const orgByGs = new Map<number, number>();
  // data/discovery/teams.json is keyed by team id ({ "522": { teamId, orgId, … } })
  const discovered = loadJson<Record<string, { teamId: number; orgId: number | null }> | Array<{ teamId: number; orgId: number | null }>>(
    path.join(process.cwd(), "data", "discovery", "teams.json"), {});
  for (const x of Array.isArray(discovered) ? discovered : Object.values(discovered)) {
    if (x?.orgId) orgByGs.set(x.teamId, x.orgId);
  }
  const orgVotes = new Map<number, Map<string, number>>();
  for (const d of dir) {
    const org = orgByGs.get(d.teamId);
    if (!org) continue;
    const k = `${d.clubName.trim()}\u0000${d.association}`;
    const m = orgVotes.get(org) ?? new Map<string, number>();
    m.set(k, (m.get(k) ?? 0) + 1);
    orgVotes.set(org, m);
  }
  const orgClub = new Map<number, { name: string; association: string }>();
  for (const [org, m] of orgVotes) {
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    const [k, n] = [...m].sort((a, b) => b[1] - a[1])[0];
    if (n >= 2 && n / total >= 0.8) { const [name, association] = k.split("\u0000"); orgClub.set(org, { name, association }); }
  }

  // clubs the user approved for club-less teams (data/seed/approved-team-clubs.json, by GotSport team id)
  const approved = new Map(Object.entries(loadJson<{ teams?: Record<string, { club: string; association: string; name?: string }> }>(
    path.join(process.cwd(), "data", "seed", "approved-team-clubs.json"), {}).teams ?? {}).map(([id, v]) => [Number(id), v]));

  const stateOverrides = Object.entries(loadJson<Record<string, { state: string }>>(
    path.join(process.cwd(), "data", "seed", "club-state-overrides.json"), {})).filter(([k]) => !k.startsWith("_")).map(([k, v]) => [k, v.state] as const);

  // data/seed/club-merges.json: GotSport names for the same club ("Total Futbol Academy" and
  // "TOTAL FUTBOL ACADEMY (CA)") → the one name the site shows
  const merges = new Map(Object.entries(loadJson<Record<string, string | { into: string }>>(
    path.join(process.cwd(), "data", "seed", "club-merges.json"), {})).filter(([k]) => !k.startsWith("_"))
    .map(([k, v]) => [k.toLowerCase(), typeof v === "string" ? v : v.into]));

  const out = teams.map((t) => {
    const raw = t.sourceName ?? t.name;
    const gsId = gsIdByName.get(raw) ?? (dirById.has(t.id) ? t.id : undefined);
    // GotSport directory first; a league club list fills teams GotSport hasn't ranked yet
    const lt = gsId !== undefined && !dirById.has(gsId) ? leagueById.get(gsId) : undefined;
    const d: DirTeam | undefined = gsId !== undefined ? dirById.get(gsId) ?? (lt && {
      teamId: gsId, teamName: lt.team.name, clubName: lt.club.name, association: lt.association,
      age: lt.team.age ?? 0, gender: lt.team.gender === "Girls" ? "f" : "m",
    }) : undefined;
    if (lt) s.league++;
    const esAny = eventState(t.id);
    const es = esAny === "CA" ? null : esAny;
    // A GotSport team missing from the Region IV directory (which lists every
    // ranked West team) is out of region unless it plays West events (national events
    // excluded, see NATIONAL_EVENT). Requiring a West *league* instead was tried and
    // dropped 4,956 real West teams: the crawler's league flags are too sparse.
    const gsOutside = !d && gsId !== undefined && !(es && WEST_ASSOC.has(es));
    const srcAssoc = sourceAssocByName.get(raw);
    const ok = !d && gsId !== undefined ? approved.get(gsId) : undefined;
    if (ok) s.approved++;
    // also for teams the directory lists with a blank club
    const blankDir = !!d && !d.clubName.trim();
    const pat = (!d || blankDir) && !ok ? patternAliases.find((a) => a.re.test(raw) || (blankDir && a.re.test(d!.teamName))) : undefined;
    const org = !d && !ok && !pat && gsId !== undefined ? orgClub.get(orgByGs.get(gsId) ?? -1) : undefined;
    if (org) s.orgClub++;
    const club0 = d && !(blankDir && pat) ? { name: d.clubName.trim(), association: d.association }
      : ok ? { name: ok.club, association: ok.association }
      : pat ? { name: pat.club, association: pat.association }
      : org ? org
      : srcAssoc ? matchInAssoc(raw, srcAssoc)
      : gsOutside || outsideTag(raw) ? null : matchClub(raw, (esAny && esAny !== "CA" ? esAny : null) ?? opponentState(t.id) ?? tagState(raw) ?? stateHintByName.get(raw) ?? esAny);
    const merged = club0 ? merges.get(club0.name.toLowerCase()) : undefined;
    const club = club0 && merged ? { ...club0, name: merged } : club0;
    if (d) s.directory++; else if (club) s.clubMatch++;

    let state = d?.association ?? club?.association ?? srcAssoc ?? stateHintByName.get(raw) ?? es ?? "";
    // data/seed/club-state-overrides.json: clubs we know are in another state (Capital City SC → TX)
    const so = stateOverrides.find(([k]) => (club?.name ?? t.club ?? "").startsWith(k) || raw.startsWith(k));
    if (so) state = so[1];
    // MLS NEXT teams known only from the league schedule ("Classic FC MLS NEXT B2014") have
    // no GotSport record or West opponents to place them. If they play in a Western
    // conference, take the state of the directory club with exactly that name.
    let mlsClub: string | null = null;
    if (!state && mlsWestNames.has(raw)) {
      // "LA Bulls" is "Los Angeles Bulls Soccer Club" in the directory: also try LA spelled out
      const key = normalizeClubName(raw.replace(/ MLS NEXT B\d{4}$/, ""));
      const cands = clubsByKey.get(key) ?? clubsByKey.get(key.replace(/^la /, "los angeles "));
      const best = cands?.reduce((a, b) => (b.n > a.n ? b : a));
      if (best && WEST_ASSOC.has(best.association)) { state = best.association; mlsClub = best.name; s.mlsConference++; }
      // no directory club of that name ("Modesto Ajax United", "De Anza Force"): it still plays
      // in a Western conference, so take the most common West state among its opponents
      if (!state) {
        const votes = [...(oppVotes.get(t.id) ?? [])].filter(([a]) => WEST_ASSOC.has(a)).sort((x, y) => y[1] - x[1]);
        if (votes.length) { state = votes[0][0]; s.mlsConference++; }
      }
    }
    if (!d && !club && state) s.eventState++;
    if (!state) s.unknownState++;
    const region = gsOutside ? "Other" : WEST_ASSOC.has(state) ? "Region4" : state ? "Other" : "Unknown";
    if (region === "Other") s.outOfRegion++;
    if (state === "") state = "—";

    const div = divisionByName.get(raw);
    const ageGroup = currentAgeGroup({ directoryAge: d?.age, rawName: raw, division: div?.division, seenDate: div?.date }) ?? "Unknown";
    if (ageGroup === "Unknown") s.unknownAge++;
    const gender: "Boys" | "Girls" = d ? (d.gender === "f" ? "Girls" : "Boys") : parseTeamName(raw).gender ?? t.gender;

    // Prefer the directory's current team name ("GU12 SB Souza") over an old one
    const nameSource = d ? d.teamName : raw;
    /** When the club came from elsewhere (approval, alias, organization), the team's own name may
     *  start with the club's short form: drop an all-caps short form ending in FC/SC ("WSM FC
     *  Samba" for Westside Metros FC) or a dangling prefix ending in a hyphen ("TR- Cheetahs"). */
    const tidy = (name: string, clubName: string) => {
      if (!(ok || pat || org) || !name.startsWith(`${clubName} `)) return name;
      const rest = name.slice(clubName.length + 1)
        .replace(/^[A-Z]{2,5}\s+(FC|SC)\s+(?=\S)/, "")
        .replace(/^[A-Za-z]{1,4}-\s+(?=\S)/, "");
      return `${clubName} ${rest}`;
    };
    return {
      ...t,
      sourceName: raw,
      // "F.C." → "FC", "S.C." → "SC" (standardizeAbbreviations), so one club isn't split in two
      // (both inputs first, so "West Coast F.C. White" with club "West Coast F.C." drops the club cleanly)
      // a name the user typed on the review page wins
      name: ok?.name ?? tidy(standardizeAbbreviations(formatTeamName(standardizeAbbreviations(nameSource),
        club?.name ? standardizeAbbreviations(club.name) : null, ageGroup === "Unknown" ? null : ageGroup)),
        standardizeAbbreviations(club?.name ?? "")),
      club: standardizeAbbreviations(club?.name ?? mlsClub ?? t.club),
      state, region, ageGroup, gender,
      ...(gsId !== undefined ? { gotsportTeamId: gsId } : {}),
      // club from the GotSport directory, a league club list or a directory club-name match
      clubVerified: !!club,
    };
  });

  const stats = `${out.length} teams · directory ${s.directory} · club-name match ${s.clubMatch} · state from events ${s.eventState}` +
    ` · approved clubs ${s.approved} · club from GotSport organization ${s.orgClub} · MLS NEXT conference ${s.mlsConference} · from league club lists ${s.league} · state unknown ${s.unknownState} · out of region ${s.outOfRegion} · age unknown ${s.unknownAge}`;
  return { teams: out, stats };
}
