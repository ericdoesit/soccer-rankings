/**
 * Diagnostics: ECNL / Modular11 teams left unmerged because their club has 2+ GotSport
 * teams of the same age, gender and competition marker. Prints examples with each
 * candidate's games, last game and main competitions, to judge which twin is right.
 * Usage: npx tsx scripts/twin-ambiguity.ts [--n 25] [--club "Empire Surf"]
 */
import { buildData, lastAmbiguousTwins } from "../src/lib/data";

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const N = Number(arg("--n") ?? 25);
const club = arg("--club")?.toLowerCase();

const ds = buildData();
const team = new Map(ds.teams.map((t) => [t.id, t]));
const stats = new Map<number, { n: number; last: string; first: string; comps: Map<string, number> }>();
for (const g of ds.games) for (const id of [g.team1Id, g.team2Id]) {
  const s = stats.get(id) ?? { n: 0, last: "", first: "9999", comps: new Map() };
  s.n++; if (g.date && g.date > s.last) s.last = g.date; if (g.date && g.date < s.first) s.first = g.date;
  const c = (g.tournamentName ?? "").slice(0, 45); s.comps.set(c, (s.comps.get(c) ?? 0) + 1);
  stats.set(id, s);
}
const line = (id: number, src?: string) => {
  const t = team.get(id) as any, s = stats.get(id);
  const comps = s ? [...s.comps].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => `${c} (${n})`).join("; ") : "";
  return `${(src ?? t?.sourceName ?? "?").padEnd(48)} id ${String(id).padEnd(6)} gs ${String(t?.gotsportTeamId ?? "-").padEnd(8)} ${String(s?.n ?? 0).padStart(3)} games ${s ? s.first + "→" + s.last : ""}  ${comps}`;
};

let cases = lastAmbiguousTwins.filter((c) => team.has(c.team.id));
if (club) cases = cases.filter((c) => ((team.get(c.team.id) as any)?.club ?? "").toLowerCase().includes(club));
// pattern tally: how many candidates, and are candidates differing only by color/number
const byCount = new Map<number, number>();
for (const c of cases) byCount.set(c.candidates.length, (byCount.get(c.candidates.length) ?? 0) + 1);
console.log(`${cases.length} ambiguous cases · candidates per case: ${[...byCount].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}→${v}`).join(", ")}\n`);
for (const c of cases.slice(0, N)) {
  const t = team.get(c.team.id) as any;
  console.log(`${t.club} · ${t.ageGroup} ${t.gender}`);
  console.log(`  ECNL/M11  ${line(c.team.id, c.team.sourceName)}`);
  for (const k of c.candidates) console.log(`  GotSport  ${line(k.id, k.sourceName)}`);
  console.log();
}
