/**
 * Build the West directory (metros, leagues, clubs, club aliases, teams, league
 * memberships) in Postgres from:
 *   - data/gotsport-teams/region4.json   (GotSport rankings list, Region IV — the
 *                                          backbone: every ranked team + its club)
 *   - data/seed/*.csv                     (league club lists from the research project)
 *
 * Idempotent: metros/leagues/clubs are upserted by slug and teams by GotSport
 * team_id, so ids stay stable for anything that references them (players);
 * derived link tables are rebuilt.
 *
 *   npm run db:seed          (runs migrations first)
 * Writes a match report to data/seed/report.json.
 */
import * as fs from "fs";
import * as path from "path";
import { sql, inArray } from "drizzle-orm";
import { getDb, migrateDb } from "../src/db";
import * as s from "../src/db/schema";
import { ASSOCIATIONS, METROS, WEST_STATES, inferMetro, type WestState } from "../src/lib/directory/geo";
import { LEAGUES, CSV_LEAGUE_TO_SLUG, TIER_RANK } from "../src/lib/directory/leagues";
import { normalizeClubName, stripTeamSuffix, slugify } from "../src/lib/directory/normalize";
import type { DirectoryTeam } from "./scrape-gotsport-team-directory";

const ROOT = process.cwd();
const SEED = path.join(ROOT, "data", "seed");
const WEST = new Set<string>(WEST_STATES);
/** ECNL RL conferences made up of Region IV clubs. */
const WEST_RL_CONFERENCES = new Set(["NorCal", "SoCal", "Golden State", "Far West", "Northwest", "Mountain", "Southwest"]);

// ── tiny CSV reader (RFC 4180 quotes) ────────────────────────────────────────
function readCsv(file: string): Record<string, string>[] {
  const text = fs.readFileSync(path.join(SEED, file), "utf-8").replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.length > 1 || r[0]);
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

async function chunked<T>(rows: T[], size: number, fn: (part: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

function seasonEndYear(isoDate: string): number {
  const d = isoDate ? new Date(isoDate) : new Date();
  return d.getUTCFullYear() + (d.getUTCMonth() >= 7 ? 1 : 0);
}

// ── club registry built in memory, then written ──────────────────────────────
interface ClubDraft {
  key: string; // normalized|state
  names: Map<string, number>; // spelling → count
  state: WestState | null;
  association: string | null;
  city: string | null;
  website: string | null;
  aliases: Map<string, string>; // alias → source
  leagues: Map<string, { gender: string; season: string; source: string }>;
  teamCount: number;
}

async function main() {
  await migrateDb();
  const db = await getDb();
  const report: Record<string, unknown> = {};

  // 1. Metros & leagues ──────────────────────────────────────────────────────
  await db.insert(s.metros).values(METROS.map(({ places: _p, ...m }) => m))
    .onConflictDoUpdate({ target: s.metros.slug, set: {
      name: sql`excluded.name`, state: sql`excluded.state`, stateCup: sql`excluded.state_cup`,
      lat: sql`excluded.lat`, lng: sql`excluded.lng` } });
  await db.insert(s.leagues).values(LEAGUES.map((l) => ({
    slug: l.slug, name: l.name, shortName: l.shortName, tier: l.tier, tierRank: TIER_RANK[l.tier] ?? 9,
    gender: l.gender, scope: l.scope, states: l.states, governingBody: l.governingBody ?? null,
    website: l.website ?? null })))
    .onConflictDoUpdate({ target: s.leagues.slug, set: {
      name: sql`excluded.name`, shortName: sql`excluded.short_name`, tier: sql`excluded.tier`,
      tierRank: sql`excluded.tier_rank`, gender: sql`excluded.gender`, scope: sql`excluded.scope`,
      states: sql`excluded.states`, governingBody: sql`excluded.governing_body`, website: sql`excluded.website` } });

  const metroRows = await db.select().from(s.metros);
  const metroId = new Map(metroRows.map((m) => [m.slug, m.id]));
  const leagueRows = await db.select().from(s.leagues);
  const leagueId = new Map(leagueRows.map((l) => [l.slug, l.id]));

  const leagueEventRows = LEAGUES.flatMap((l) => (l.gotsportEvents ?? []).map(([id, season, name]) => ({
    leagueId: leagueId.get(l.slug)!, source: "gotsport", externalEventId: String(id), season, name })));
  if (leagueEventRows.length)
    await db.insert(s.leagueEvents).values(leagueEventRows).onConflictDoUpdate({
      target: [s.leagueEvents.source, s.leagueEvents.externalEventId],
      set: { leagueId: sql`excluded.league_id`, season: sql`excluded.season`, name: sql`excluded.name` } });
  const eventLeague = new Map(
    (await db.select().from(s.leagueEvents)).map((e) => [Number(e.externalEventId), e]));

  // 2. Clubs from the GotSport Region IV directory ───────────────────────────
  const dirFile = path.join(ROOT, "data", "gotsport-teams", "region4.json");
  const dirTeams: DirectoryTeam[] = fs.existsSync(dirFile) ? JSON.parse(fs.readFileSync(dirFile, "utf-8")) : [];
  const clubs = new Map<string, ClubDraft>();
  const byNorm = new Map<string, ClubDraft[]>(); // normalized → drafts in any state

  const getClub = (name: string, state: WestState | null, association: string | null, create: boolean) => {
    const norm = normalizeClubName(name);
    if (!norm) return null;
    const candidates = byNorm.get(norm) ?? [];
    let club = state ? candidates.find((c) => c.state === state) : candidates.length === 1 ? candidates[0] : undefined;
    if (!club && create && state) {
      club = { key: `${norm}|${state}`, names: new Map(), state, association, city: null, website: null,
        aliases: new Map(), leagues: new Map(), teamCount: 0 };
      clubs.set(club.key, club);
      byNorm.set(norm, [...candidates, club]);
    }
    return club ?? null;
  };

  let skippedNoClub = 0;
  for (const t of dirTeams) {
    const assoc = ASSOCIATIONS[t.association];
    if (!assoc) continue; // outside Region IV associations
    if (!t.clubName.trim()) { skippedNoClub++; continue; }
    const club = getClub(t.clubName, assoc[0], t.association, true)!;
    club.names.set(t.clubName, (club.names.get(t.clubName) ?? 0) + 1);
    club.aliases.set(t.clubName, "gotsport");
    club.association ??= t.association;
    club.teamCount++;
  }
  report.gotsport = { teams: dirTeams.length, clubs: clubs.size, teamsWithoutClub: skippedNoClub };

  // 3. Enrich / extend from research CSVs ────────────────────────────────────
  type Src = { file: string; name: (r: Record<string, string>) => string;
    state: (r: Record<string, string>) => string; leagues: (r: Record<string, string>) => string[];
    gender?: (r: Record<string, string>) => string; create: boolean; city?: string; website?: string };
  const sources: Src[] = [
    { file: "clubs.csv", name: (r) => r.club_name, state: (r) => r.state,
      leagues: (r) => r.leagues.split(",").map((x) => CSV_LEAGUE_TO_SLUG.get(x.trim()) ?? "").filter(Boolean),
      gender: (r) => r.gender || "Both", create: true, city: "city" },
    { file: "ecnl_clubs.csv", name: (r) => r.club_name, state: (r) => r.state,
      leagues: (r) => [r.age_groups.includes("B20") ? "ecnl-boys" : "ecnl-girls"], create: true, website: "website" },
    { file: "ecnl_rl_clubs.csv", name: (r) => stripTeamSuffix(r.club_name),
      state: (r) => (WEST_RL_CONFERENCES.has(r.conference) ? "" : "XX"),
      leagues: () => ["ecnl-rl"], gender: (r) => (r.league.includes("Boys") ? "Boys" : "Girls"), create: false },
    { file: "girls_academy_clubs.csv", name: (r) => r.club_name, state: (r) => r.state,
      leagues: () => ["girls-academy"], gender: () => "Girls", create: true },
    { file: "nal_clubs.csv", name: (r) => r.club_name, state: (r) => r.state, leagues: () => ["nal"], create: true },
    { file: "usl_youth_clubs.csv", name: (r) => r.club_name, state: (r) => r.state, leagues: () => ["usl-youth"], create: true, city: "city" },
    { file: "mlsnext_club_programs_scrape.csv", name: (r) => r.club, state: (r) => r.state,
      leagues: () => [], create: true, website: "website" },
    { file: "socal_soccer_clubs.csv", name: (r) => r.club_name, state: () => "CA",
      leagues: () => ["socal-soccer-league"], create: true },
    { file: "coast_soccer_clubs.csv", name: (r) => r.club, state: () => "CA",
      leagues: () => ["coast-soccer-league"], create: true },
    { file: "npl_teams.csv", name: (r) => r.club, state: (r) =>
        r.league.startsWith("NorCal") ? "CA" : r.league.startsWith("WPL") ? "WA" : "",
      leagues: (r) => [r.league.startsWith("NorCal") ? "norcal-premier" : r.league.startsWith("WPL") ? "wpl"
        : r.league.startsWith("Mountain West") ? "mountain-west-n1" : r.league.startsWith("Frontier") ? "frontier-premier" : ""].filter(Boolean),
      gender: (r) => (r.gender === "Female" ? "Girls" : r.gender === "Male" ? "Boys" : "Both"), create: false },
  ];

  const csvStats: Record<string, { rows: number; west: number; matched: number; created: number; unmatched: string[] }> = {};
  for (const src of sources) {
    const st = (csvStats[src.file] = { rows: 0, west: 0, matched: 0, created: 0, unmatched: [] as string[] });
    const seen = new Set<string>();
    for (const r of readCsv(src.file)) {
      const name = src.name(r);
      const stateRaw = src.state(r).toUpperCase();
      const leagues = src.leagues(r);
      // Rows without a state only count if they are in a West-only league list
      if (stateRaw && !WEST.has(stateRaw)) continue;
      const k = `${normalizeClubName(name)}|${stateRaw}`;
      const firstSeen = !seen.has(k);
      seen.add(k);
      const state = (stateRaw || null) as WestState | null;
      const before = clubs.size;
      const club = getClub(name, state, null, src.create);
      if (firstSeen) {
        st.rows++;
        if (state) st.west++;
        if (!club) { if (state || leagues.length) st.unmatched.push(stateRaw ? `${name} (${stateRaw})` : name); }
        else if (clubs.size > before) st.created++;
        else st.matched++;
      }
      if (!club) continue;
      club.names.set(name, (club.names.get(name) ?? 0) + (clubs.size > before ? 1 : 0));
      club.aliases.set(name, src.file);
      if (src.city && r[src.city]) club.city ??= r[src.city];
      if (src.website && r[src.website]) club.website ??= r[src.website];
      const gender = src.gender?.(r) ?? "Both";
      for (const slug of leagues) club.leagues.set(`${slug}|${gender}`, { gender, season: "", source: src.file });
    }
    st.unmatched = [...new Set(st.unmatched)];
  }
  report.csv = Object.fromEntries(Object.entries(csvStats).map(([f, v]) =>
    [f, { ...v, unmatchedCount: v.unmatched.length, unmatched: v.unmatched.slice(0, 40) }]));

  // 4. Write clubs (upsert by slug) ──────────────────────────────────────────
  const drafts = [...clubs.values()];
  const slugCount = new Map<string, number>();
  const displayName = (c: ClubDraft) => [...c.names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    ?? [...c.aliases.keys()][0];
  for (const c of drafts) slugCount.set(slugify(displayName(c)), (slugCount.get(slugify(displayName(c))) ?? 0) + 1);
  const slugOf = (c: ClubDraft) => {
    const base = slugify(displayName(c));
    return (slugCount.get(base) ?? 0) > 1 ? `${base}-${c.state!.toLowerCase()}` : base;
  };

  let metroHits = 0;
  const clubValues = drafts.map((c) => {
    const stateCup = c.association ? ASSOCIATIONS[c.association]?.[1] ?? null : c.state === "CA" ? null : c.state;
    const metro = inferMetro(`${[...c.aliases.keys()].join(" ")} ${c.city ?? ""}`, stateCup, c.state);
    if (metro) metroHits++;
    // California clubs not (yet) on GotSport: Cal South vs Cal North from their metro
    if (!c.association && c.state === "CA" && metro) c.association = metro.stateCup === "CA-S" ? "CAS" : "CAN";
    const tiers = [...c.leagues.keys()].map((k) => LEAGUES.find((l) => l.slug === k.split("|")[0])!.tier)
      .filter((t) => t !== "CUP");
    const topTier = tiers.sort((a, b) => (TIER_RANK[a] ?? 9) - (TIER_RANK[b] ?? 9))[0] ?? null;
    return { slug: slugOf(c), name: displayName(c), city: c.city, state: c.state, association: c.association,
      metroId: metro ? metroId.get(metro.slug)! : null, website: c.website, topTier, teamCount: c.teamCount };
  });
  await chunked(clubValues, 500, (part) => db.insert(s.clubs).values(part).onConflictDoUpdate({
    target: s.clubs.slug, set: { name: sql`excluded.name`, city: sql`excluded.city`, state: sql`excluded.state`,
      association: sql`excluded.association`, metroId: sql`excluded.metro_id`, website: sql`excluded.website`,
      topTier: sql`excluded.top_tier`, teamCount: sql`excluded.team_count` } }));
  const clubIdBySlug = new Map((await db.select({ id: s.clubs.id, slug: s.clubs.slug }).from(s.clubs)).map((r) => [r.slug, r.id]));
  const clubIdOf = (c: ClubDraft) => clubIdBySlug.get(slugOf(c))!;

  // derived link tables: rebuild
  await db.delete(s.teamLeagues);
  await db.delete(s.clubLeagues);
  await db.delete(s.clubAliases);
  await chunked(drafts.flatMap((c) => [...c.aliases.entries()].map(([alias, source]) => ({
    clubId: clubIdOf(c), alias, normalized: normalizeClubName(alias), source }))), 1000,
    (part) => db.insert(s.clubAliases).values(part).onConflictDoNothing());
  await chunked(drafts.flatMap((c) => [...c.leagues.entries()].map(([k, v]) => ({
    clubId: clubIdOf(c), leagueId: leagueId.get(k.split("|")[0])!, gender: v.gender, season: v.season, source: v.source }))),
    1000, (part) => db.insert(s.clubLeagues).values(part).onConflictDoNothing());

  // 5. Teams (upsert by GotSport team_id) ─────────────────────────────────────
  const metroOfClub = new Map(clubValues.map((v) => [v.slug, v.metroId]));
  const teamValues = dirTeams.flatMap((t) => {
    const assoc = ASSOCIATIONS[t.association];
    if (!assoc) return [];
    const club = t.clubName.trim() ? getClub(t.clubName, assoc[0], null, false) : null;
    const name = t.clubName && !t.teamName.toLowerCase().startsWith(t.clubName.toLowerCase())
      ? `${t.clubName} ${t.teamName}`.trim() : t.teamName;
    return [{
      name, club: t.clubName || null, state: assoc[0], region: "Region4", ageGroup: `U${t.age}`,
      gender: (t.gender === "f" ? "Girls" : "Boys") as "Girls" | "Boys",
      clubId: club ? clubIdOf(club) : null, metroId: club ? metroOfClub.get(slugOf(club)) ?? null : null,
      birthYear: seasonEndYear(t.rankingDate) - t.age, association: t.association, stateCup: assoc[1],
      gotsportTeamId: t.teamId,
    }];
  });
  await chunked(teamValues, 500, (part) => db.insert(s.teams).values(part).onConflictDoUpdate({
    target: s.teams.gotsportTeamId, set: { name: sql`excluded.name`, club: sql`excluded.club`,
      state: sql`excluded.state`, ageGroup: sql`excluded.age_group`, gender: sql`excluded.gender`,
      clubId: sql`excluded.club_id`, metroId: sql`excluded.metro_id`, birthYear: sql`excluded.birth_year`,
      association: sql`excluded.association`, stateCup: sql`excluded.state_cup` } }));

  // team_leagues from the events each team earned ranking points in
  const teamIdByGs = new Map<number, number>();
  const gsIds = dirTeams.map((t) => t.teamId);
  await chunked(gsIds, 5000, async (part) => {
    for (const r of await db.select({ id: s.teams.id, gs: s.teams.gotsportTeamId }).from(s.teams)
      .where(inArray(s.teams.gotsportTeamId, part))) teamIdByGs.set(r.gs!, r.id);
  });
  const tl = new Map<string, { teamId: number; leagueId: number; season: string }>();
  for (const t of dirTeams) for (const ev of t.eventIds) {
    const le = eventLeague.get(ev);
    const id = teamIdByGs.get(t.teamId);
    if (le && id) tl.set(`${id}|${le.leagueId}|${le.season}`, { teamId: id, leagueId: le.leagueId, season: le.season ?? "" });
  }
  // ...and from games actually played in a league's events (discovery crawler):
  // a team belongs to every league it played games in.
  const gamesDir = path.join(ROOT, "data", "discovery", "games");
  const leagueGames = new Map<string, number>(); // teamId|leagueId|season → games
  if (fs.existsSync(gamesDir)) {
    for (const f of fs.readdirSync(gamesDir)) {
      const le = eventLeague.get(Number(f.replace(".json", "")));
      if (!le) continue;
      for (const g of JSON.parse(fs.readFileSync(path.join(gamesDir, f), "utf-8")) as Array<{ homeTeamId: number; awayTeamId: number }>) {
        for (const gs of [g.homeTeamId, g.awayTeamId]) {
          const id = teamIdByGs.get(gs);
          if (!id) continue;
          const k = `${id}|${le.leagueId}|${le.season ?? ""}`;
          leagueGames.set(k, (leagueGames.get(k) ?? 0) + 1);
        }
      }
    }
  }
  for (const k of leagueGames.keys()) {
    const [teamId, lid, season] = k.split("|");
    tl.set(k, { teamId: Number(teamId), leagueId: Number(lid), season });
  }
  await chunked([...tl.values()], 1000, (part) => db.insert(s.teamLeagues).values(part).onConflictDoNothing());

  // Club tier = best league tier any of its teams plays in (when lists missed it)
  await db.execute(sql`
    update clubs c set top_tier = x.tier from (
      select t.club_id, (array_agg(l.tier order by l.tier_rank))[1] tier
      from team_leagues tl join teams t on t.id = tl.team_id join leagues l on l.id = tl.league_id
      where l.tier <> 'CUP' and t.club_id is not null group by t.club_id) x
    where c.id = x.club_id and (c.top_tier is null or
      (select tier_rank from leagues where tier = x.tier limit 1) < (select tier_rank from leagues where tier = c.top_tier limit 1))`);

  // 6. Report ────────────────────────────────────────────────────────────────
  const byState: Record<string, { clubs: number; withMetro: number; teams: number }> = {};
  for (const v of clubValues) {
    const k = v.association === "CAS" ? "CA-S" : v.association === "CAN" ? "CA-N" : v.state ?? "?";
    byState[k] ??= { clubs: 0, withMetro: 0, teams: 0 };
    byState[k].clubs++; byState[k].teams += v.teamCount;
    if (v.metroId) byState[k].withMetro++;
  }
  report.totals = { clubs: clubValues.length, clubsWithMetro: metroHits, teams: teamValues.length,
    teamsWithClub: teamValues.filter((t) => t.clubId).length, teamLeagueLinks: tl.size };
  report.byState = byState;
  report.unplacedClubSample = clubValues.filter((v) => !v.metroId && v.teamCount > 0)
    .sort((a, b) => b.teamCount - a.teamCount).slice(0, 60).map((v) => `${v.name} [${v.association ?? v.state}] ${v.teamCount}`);
  fs.writeFileSync(path.join(SEED, "report.json"), JSON.stringify(report, null, 2));

  console.log("Directory seeded:", report.totals);
  console.table(byState);
  for (const [f, v] of Object.entries(csvStats))
    console.log(`  ${f.padEnd(36)} rows ${String(v.rows).padStart(5)}  matched ${String(v.matched).padStart(4)}  created ${String(v.created).padStart(4)}  unmatched ${v.unmatched.length}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
