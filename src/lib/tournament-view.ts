import fs from "fs";
import path from "path";
import { getDataSet, getTournamentGames, type Game, type Team } from "@/lib/data";
import { AGE_ORDER, getListedRank, clubSlugFor } from "@/lib/explore";
import { tidyEventName } from "./names";

/**
 * A tournament's games organized for its page: age group + gender → divisions (the event's
 * own flights/brackets where the source names them, else teams that played each other) →
 * standings, the group winner, and how often current ratings pick the winner.
 */
export interface StandingRow {
  teamId: number; name: string; club: string; clubSlug: string | null;
  w: number; d: number; l: number; gf: number; ga: number; pts: number;
  rating: number | null; westRank: number | null;
}
export interface ViewGame {
  id: number; date: string; home: number; away: number; hs: number; as: number;
  /** did the higher-rated team win? null: a draw, or a team without a rating */
  pick: boolean | null;
}
export interface Division {
  key: string; label: string; standings: StandingRow[]; games: ViewGame[];
  picks: { correct: number; decided: number };
}
export interface AgeGroupView { key: string; gender: string; ageGroup: string; divisions: Division[] }
export interface TournamentView {
  name: string; start: string; end: string; games: number; teams: number;
  groups: AgeGroupView[]; picks: { correct: number; decided: number; draws: number };
}

// ---- division labels from the source files (GotSport discovery, pasted AthleteOne) ----
const ROOT = process.cwd();
let eventFiles: Map<string, string[]> | null = null;
export function discoveryFilesFor(eventName: string): string[] {
  if (!eventFiles) {
    eventFiles = new Map();
    const dir = path.join(ROOT, "data", "discovery", "games");
    for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith(".json")) : []) {
      try {
        const fd = fs.openSync(path.join(dir, f), "r");
        const buf = Buffer.alloc(4000); const n = fs.readSync(fd, buf, 0, 4000, 0); fs.closeSync(fd);
        const m = buf.toString("utf8", 0, n).match(/"eventName":"((?:[^"\\]|\\.)*)"/);
        if (m) { const name = tidyEventName(JSON.parse(`"${m[1]}"`)); eventFiles.set(name, [...(eventFiles.get(name) ?? []), path.join(dir, f)]); }
      } catch { /* skip */ }
    }
  }
  return eventFiles.get(tidyEventName(eventName)) ?? [];
}
const pairKey = (date: string, a: string | number, b: string | number) => {
  const [x, y] = [String(a), String(b)].sort();
  return `${date}|${x}|${y}`;
};
/** "U11B BU11 Flight 2" → "BU11 Flight 2"; "GU12 9v9 (08/01/2014-07/31/2015) - White" → "GU12 9v9 White" */
const cleanDivision = (d: string) => d.replace(/^U\d{1,2}[BG]\s+/, "").replace(/\s*\(\d{2}\/\d{2}\/\d{4}-\d{2}\/\d{2}\/\d{4}\)\s*-?\s*/, " ").replace(/\s+/g, " ").trim();

function divisionLookup(eventName: string): { byGs: Map<string, string>; byName: Map<string, string> } {
  const byGs = new Map<string, string>(), byName = new Map<string, string>();
  for (const f of discoveryFilesFor(eventName)) {
    try {
      for (const g of JSON.parse(fs.readFileSync(f, "utf8")) as Array<{ date: string; homeTeamId: number; awayTeamId: number; division?: string }>) {
        if (g.division && g.homeTeamId && g.awayTeamId) byGs.set(pairKey(g.date, g.homeTeamId, g.awayTeamId), cleanDivision(g.division));
      }
    } catch { /* skip */ }
  }
  const ao = path.join(ROOT, "data", "athleteone", "games.json");
  if (fs.existsSync(ao)) {
    for (const g of JSON.parse(fs.readFileSync(ao, "utf8")) as Array<{ date: string; eventName: string; homeTeam: string; awayTeam: string; division: string }>) {
      if (g.eventName === eventName) byName.set(pairKey(g.date, g.homeTeam, g.awayTeam), cleanDivision(g.division));
    }
  }
  return { byGs, byName };
}

// ---- level order inside an age group: Premier/Elite/Gold/Flight 1 … before lower flights ----
const LEVEL_WORDS = ["premier", "elite", "platinum", "gold", "silver", "bronze", "copper"];
function levelRank(label: string): number {
  const l = label.toLowerCase();
  const f = l.match(/\b(?:flight|f)\s?(\d)\b/); if (f) return Number(f[1]) * 10;
  const i = LEVEL_WORDS.findIndex((w) => l.includes(w)); if (i >= 0) return i;
  return 100;
}

const cache = new Map<string, { at: unknown; view: TournamentView }>();

export function getTournamentView(name: string): TournamentView | null {
  const data = getDataSet();
  const hit = cache.get(name);
  if (hit && hit.at === data) return hit.view;
  const games = getTournamentGames(name).filter((g) => g.status === "completed");
  if (!games.length) return null;
  const teamById = new Map(data.teams.map((t) => [t.id, t]));
  const rating = new Map(data.rankings.map((r) => [r.teamId, r.score]));
  const { byGs, byName } = divisionLookup(name);

  const divisionOf = (g: Game, a: Team | undefined, b: Team | undefined): string | null => {
    if (a?.gotsportTeamId && b?.gotsportTeamId) { const d = byGs.get(pairKey(g.date, a.gotsportTeamId, b.gotsportTeamId)); if (d) return d; }
    if (a?.sourceName && b?.sourceName) { const d = byName.get(pairKey(g.date, a.sourceName, b.sourceName)); if (d) return d; }
    return null;
  };

  const ageIdx = (a: string) => { const i = AGE_ORDER.indexOf(a); return i < 0 ? 99 : i; };
  const pickOf = (g: Game): boolean | null => {
    const ra = rating.get(g.team1Id), rb = rating.get(g.team2Id);
    if (ra === undefined || rb === undefined || g.team1Score === g.team2Score || ra === rb) return null;
    return (g.team1Score > g.team2Score) === (ra > rb);
  };
  let draws = 0;

  // divisions across the event: the source's label; an unlabeled game joins the label its
  // teams play under, else teams that played each other form a group (per current age group)
  const labelOf = new Map<number, string>();
  const teamLabel = new Map<number, string>();
  for (const g of games) {
    const l = divisionOf(g, teamById.get(g.team1Id), teamById.get(g.team2Id));
    if (l) { labelOf.set(g.id, l); teamLabel.set(g.team1Id, l); teamLabel.set(g.team2Id, l); }
  }
  const byDiv = new Map<string, Game[]>();
  const parent = new Map<number, number>();
  const find = (x: number): number => { while (parent.has(x) && parent.get(x) !== x) x = parent.get(x)!; return x; };
  const unlabeled: Game[] = [];
  for (const g of games) {
    const l = labelOf.get(g.id) ?? teamLabel.get(g.team1Id) ?? teamLabel.get(g.team2Id);
    if (l) byDiv.set(l, [...(byDiv.get(l) ?? []), g]);
    else { unlabeled.push(g); for (const id of [g.team1Id, g.team2Id]) if (!parent.has(id)) parent.set(id, id); parent.set(find(g.team1Id), find(g.team2Id)); }
  }
  const comps = new Map<number, Game[]>();
  for (const g of unlabeled) { const r = find(g.team1Id); comps.set(r, [...(comps.get(r) ?? []), g]); }
  const autoCount = new Map<string, number>();
  for (const c of [...comps.values()].sort((a, b) => b.length - a.length)) {
    const t = teamById.get(c[0].team1Id) ?? teamById.get(c[0].team2Id);
    const base = t ? `${t.gender === "Girls" ? "G" : "B"}${t.ageGroup}` : "Other";
    const k = (autoCount.get(base) ?? 0) + 1; autoCount.set(base, k);
    byDiv.set(`${base} · group ${k}`, c);
  }

  // age group + gender of a division: from its label ("BU9 7v7 Red", "U11B …", "GU08 Flight 2")
  // as at the event; else the most common among its teams
  const ageOfDivision = (label: string, dgames: Game[]): { gender: string; ageGroup: string } => {
    const m = label.match(/\b([BG])U?0?(\d{1,2})\b/i) ?? label.match(/\bU0?(\d{1,2})([BG])\b/i);
    if (m) {
      const [gl, age] = /^[BG]$/i.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
      return { gender: gl.toUpperCase() === "G" ? "Girls" : "Boys", ageGroup: `U${Number(age)}` };
    }
    const votes = new Map<string, number>();
    for (const g of dgames) for (const id of [g.team1Id, g.team2Id]) { const t = teamById.get(id); if (t) votes.set(`${t.gender}|${t.ageGroup}`, (votes.get(`${t.gender}|${t.ageGroup}`) ?? 0) + 1); }
    const [gender, ageGroup] = ([...votes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Boys|Unknown").split("|");
    return { gender, ageGroup };
  };

  const groupsMap = new Map<string, AgeGroupView>();
  for (const [label, dgames] of byDiv) {
    const rows = new Map<number, StandingRow>();
    const row = (id: number): StandingRow => {
      let r = rows.get(id);
      if (!r) {
        const t = teamById.get(id);
        r = { teamId: id, name: t?.name ?? `#${id}`, club: t?.club ?? "", clubSlug: t?.clubVerified && t.club ? clubSlugFor(t.club) : null,
          w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, rating: rating.get(id) ?? null, westRank: getListedRank(id) };
        rows.set(id, r);
      }
      return r;
    };
    let correct = 0, decided = 0;
    const vgames: ViewGame[] = [];
    for (const g of [...dgames].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)) {
      const a = row(g.team1Id), b = row(g.team2Id);
      a.gf += g.team1Score; a.ga += g.team2Score; b.gf += g.team2Score; b.ga += g.team1Score;
      if (g.team1Score > g.team2Score) { a.w++; b.l++; a.pts += 3; }
      else if (g.team1Score < g.team2Score) { b.w++; a.l++; b.pts += 3; }
      else { a.d++; b.d++; a.pts++; b.pts++; draws++; }
      const pick = pickOf(g);
      if (pick !== null) { decided++; if (pick) correct++; }
      vgames.push({ id: g.id, date: g.date, home: g.team1Id, away: g.team2Id, hs: g.team1Score, as: g.team2Score, pick });
    }
    const standings = [...rows.values()].sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.name.localeCompare(y.name));
    const { gender, ageGroup } = ageOfDivision(label, dgames);
    const gk = `${gender}|${ageGroup}`;
    const grp = groupsMap.get(gk) ?? { key: gk, gender, ageGroup, divisions: [] };
    grp.divisions.push({ key: `${gk}|${label}`, label, standings, games: vgames, picks: { correct, decided } });
    groupsMap.set(gk, grp);
  }
  const out = [...groupsMap.values()];
  for (const g of out) g.divisions.sort((a, b) => levelRank(a.label) - levelRank(b.label) || a.label.localeCompare(b.label, undefined, { numeric: true }));
  out.sort((a, b) => ageIdx(a.ageGroup) - ageIdx(b.ageGroup) || a.gender.localeCompare(b.gender));

  const teams = new Set<number>(); for (const g of games) { teams.add(g.team1Id); teams.add(g.team2Id); }
  const dates = games.map((g) => g.date).filter(Boolean).sort();
  const picks = out.flatMap((a) => a.divisions).reduce((s, d) => ({ correct: s.correct + d.picks.correct, decided: s.decided + d.picks.decided }), { correct: 0, decided: 0 });
  const view: TournamentView = { name, start: dates[0] ?? "", end: dates.at(-1) ?? "", games: games.length, teams: teams.size, groups: out, picks: { ...picks, draws } };
  cache.set(name, { at: data, view });
  return view;
}
