import fs from "fs";
import path from "path";
import { getDataSet, type DataSet } from "@/lib/data";

/**
 * Extra description for a team page, from the GotSport discovery files: the divisions it plays
 * in this season, its home fields, and, for a team GotSport lists without a club, the club whose
 * teams use the same home fields (a hint, not a fact).
 */
export interface TeamContext {
  gotsportTeamId: number;
  otherNames: string[];
  divisions: Array<{ event: string; division: string }>;
  homeFields: Array<{ field: string; games: number }>;
  /** only for teams without a confirmed club */
  likelyClub: { club: string; games: number; field: string } | null;
}

const ROOT = process.cwd();
const DISC = path.join(ROOT, "data", "discovery");
type DiscGame = { eventId: number; eventName: string; division?: string; venue?: string; homeTeamId: number; awayTeamId: number; date: string };

let discTeams: Map<number, { names: string[]; events: number[] }> | null = null;
function discoveredTeams() {
  if (discTeams) return discTeams;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(DISC, "teams.json"), "utf8"));
    discTeams = new Map((Array.isArray(raw) ? raw : Object.values(raw) as Array<{ teamId: number; names: string[]; events: number[] }>)
      .map((x: { teamId: number; names: string[]; events: number[] }) => [x.teamId, x]));
  } catch { discTeams = new Map(); }
  return discTeams;
}
const eventGames = new Map<number, DiscGame[]>();
function gamesOf(eventId: number): DiscGame[] {
  if (!eventGames.has(eventId)) {
    try { eventGames.set(eventId, JSON.parse(fs.readFileSync(path.join(DISC, "games", `${eventId}.json`), "utf8"))); }
    catch { eventGames.set(eventId, []); }
  }
  return eventGames.get(eventId)!;
}
const cleanField = (v: string) => v.trim().replace(/\s*[-–,#(].*$/, "").replace(/\s+(field|fld|pitch|turf)\s*\w*$/i, "").trim();

/** directory-confirmed clubs by GotSport team id, for the shared-field hint */
const clubByGs = new WeakMap<DataSet, Map<number, string>>();

export function getTeamContext(gotsportTeamId: number | undefined, confirmedClub: boolean): TeamContext | null {
  if (!gotsportTeamId) return null;
  const info = discoveredTeams().get(gotsportTeamId);
  if (!info) return null;
  const seasonStart = (() => { const d = new Date(); const y = d.getUTCMonth() >= 7 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; return `${y}-08-01`; })();

  const divisions = new Map<string, { event: string; division: string }>();
  const fields = new Map<string, number>();
  for (const ev of info.events) {
    for (const g of gamesOf(ev)) {
      if (g.homeTeamId !== gotsportTeamId && g.awayTeamId !== gotsportTeamId) continue;
      if (g.date >= seasonStart && g.division) divisions.set(`${g.eventName}|${g.division}`, { event: g.eventName.trim(), division: g.division.replace(/^U\d{1,2}[BG]\s+/, "").trim() });
      if (g.homeTeamId === gotsportTeamId && g.venue) { const f = cleanField(g.venue); if (f.length > 3 && !/\btbd\b/i.test(f)) fields.set(f, (fields.get(f) ?? 0) + 1); }
    }
  }
  const homeFields = [...fields].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([field, games]) => ({ field, games }));

  // Likely club: the confirmed club with the most home games at this team's main home fields
  let likelyClub: TeamContext["likelyClub"] = null;
  if (!confirmedClub && homeFields.length) {
    const data = getDataSet();
    let byGs = clubByGs.get(data);
    if (!byGs) { byGs = new Map(data.teams.filter((t) => t.clubVerified && t.gotsportTeamId).map((t) => [t.gotsportTeamId!, t.club])); clubByGs.set(data, byGs); }
    const want = new Set(homeFields.map((f) => f.field.toLowerCase()));
    const votes = new Map<string, { games: number; field: string }>();
    for (const ev of info.events) {
      for (const g of gamesOf(ev)) {
        if (!g.venue || g.homeTeamId === gotsportTeamId) continue;
        const f = cleanField(g.venue);
        const club = want.has(f.toLowerCase()) ? byGs.get(g.homeTeamId) : undefined;
        if (!club) continue;
        const v = votes.get(club) ?? { games: 0, field: f };
        v.games++;
        votes.set(club, v);
      }
    }
    const best = [...votes].sort((a, b) => b[1].games - a[1].games)[0];
    if (best && best[1].games >= 3) likelyClub = { club: best[0], ...best[1] };
  }
  return { gotsportTeamId, otherNames: info.names, divisions: [...divisions.values()], homeFields, likelyClub };
}
