/**
 * USL Academy (boys U20, from Modular11). Modular11 names each season's team after its
 * oldest birth year: "Capo FC USL Academy B2006" played 2025-26, "… B2007" plays 2026-27.
 * It's one program, so the seasons are joined into the newest record, and the team
 * that plays this season is listed as "U20" (other U19+ cohorts stay aged out).
 * Clubs our directory can't place get their club and state from
 * data/seed/usl-academy-clubs.json.
 */
import * as fs from "fs";
import * as path from "path";

interface TeamLike { id: number; name: string; club: string; state: string; region: string; ageGroup: string; gender: string; sourceName?: string; clubVerified?: boolean }
interface GameLike { team1Id: number; team2Id: number; team1Score: number; team2Score: number; date: string; tournamentName?: string }

const USL = /^(.*?)\s+USL Academy B(\d{4})$/i;
const seasonOf = (d: string) => (Number(d.slice(5, 7)) >= 8 ? Number(d.slice(0, 4)) : Number(d.slice(0, 4)) - 1);

export function joinUslAcademySeasons<T extends TeamLike, G extends GameLike>(teams: T[], games: G[], today = new Date().toISOString().slice(0, 10)):
  { teams: T[]; games: G[]; joined: number; listed: number } {
  const seed = (() => {
    const f = path.join(process.cwd(), "data", "seed", "usl-academy-clubs.json");
    try { return (JSON.parse(fs.readFileSync(f, "utf8")) as { clubs: Record<string, { club: string; state: string }> }).clubs; } catch { return {}; }
  })();
  const dates = new Map<number, Set<string>>(), last = new Map<number, string>();
  for (const g of games) for (const id of [g.team1Id, g.team2Id]) {
    if (!g.date) continue;
    (dates.get(id) ?? dates.set(id, new Set()).get(id)!).add(g.date);
    if (g.date > (last.get(id) ?? "")) last.set(id, g.date);
  }
  const programs = new Map<string, Array<{ t: T; year: number }>>();
  for (const t of teams) {
    const m = (t.sourceName ?? "").match(USL);
    if (!m) continue;
    const k = `${m[1].toLowerCase()}|${t.gender}`;
    programs.set(k, [...(programs.get(k) ?? []), { t, year: Number(m[2]) }]);
  }
  const into = new Map<number, number>();
  const patched = new Map<number, T>();
  const current = seasonOf(today);
  let listed = 0;
  for (const [k, recs] of programs) {
    recs.sort((a, b) => b.year - a.year);
    const keep = recs[0].t;
    // seasons never overlap: a shared game day would mean two different teams
    const members = [keep];
    for (const r of recs.slice(1)) {
      const d = dates.get(r.t.id);
      if (d && members.some((m) => [...d].some((x) => dates.get(m.id)?.has(x)))) continue;
      members.push(r.t); into.set(r.t.id, keep.id);
    }
    const name = k.split("|")[0];
    const fix = Object.entries(seed).find(([n]) => n.toLowerCase() === name)?.[1];
    const known = members.find((m) => m.region === "Region4" && m.state && m.state !== "—");
    const playsNow = !!last.get(keep.id) && seasonOf(last.get(keep.id)!) === current;
    const next: T = { ...keep,
      ...(fix ? { club: fix.club, state: fix.state, region: "Region4", clubVerified: true } : known && keep.region !== "Region4" ? { club: known.club, state: known.state, region: known.region, clubVerified: known.clubVerified } : {}),
      ageGroup: playsNow ? "U20" : keep.ageGroup,
      name: playsNow ? keep.name.replace(/ U19\+$/, " U20") : keep.name };
    if (playsNow) listed++;
    patched.set(keep.id, next);
  }
  if (!into.size && !patched.size) return { teams, games, joined: 0, listed: 0 };
  const outGames: G[] = [];
  for (const g of games) {
    const a = into.get(g.team1Id) ?? g.team1Id, b = into.get(g.team2Id) ?? g.team2Id;
    if (a === b) continue;
    outGames.push(a === g.team1Id && b === g.team2Id ? g : { ...g, team1Id: a, team2Id: b });
  }
  return { teams: teams.filter((t) => !into.has(t.id)).map((t) => patched.get(t.id) ?? t), games: outGames, joined: into.size, listed };
}
