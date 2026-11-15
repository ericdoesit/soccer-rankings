import { getDataSet, type DataSet } from "@/lib/data";

/**
 * Finished tournaments for the Events tab: every event in our games whose games span at
 * most a week (so season-long leagues stay out) and that has finished, newest first.
 * Results are on /tournament/<name>.
 */
export interface PastEvent {
  name: string; start: string; end: string; games: number; teams: number;
  /** most common state among its teams ("CAS", "AZ"…), for a hint of where it was */
  state: string | null;
}

const MAX_SPAN_DAYS = 7;
const MIN_GAMES = 6;
const cache = new WeakMap<DataSet, PastEvent[]>();

const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 864e5;

export function getPastEvents(): PastEvent[] {
  const data = getDataSet();
  const hit = cache.get(data);
  if (hit) return hit;
  const teamState = new Map(data.teams.map((t) => [t.id, t.state]));
  const west = new Set(data.teams.filter((t) => t.region === "Region4").map((t) => t.id));
  const today = new Date().toISOString().slice(0, 10);
  const by = new Map<string, { start: string; end: string; games: number; teams: Set<number> }>();
  for (const g of data.games) {
    if (!g.tournamentName || !/^\d{4}-\d{2}-\d{2}/.test(g.date ?? "")) continue;
    const e = by.get(g.tournamentName) ?? { start: g.date, end: g.date, games: 0, teams: new Set<number>() };
    if (g.date < e.start) e.start = g.date;
    if (g.date > e.end) e.end = g.date;
    e.games++;
    e.teams.add(g.team1Id); e.teams.add(g.team2Id);
    by.set(g.tournamentName, e);
  }
  const out: PastEvent[] = [];
  for (const [name, e] of by) {
    if (e.games < MIN_GAMES || e.end >= today || days(e.start, e.end) > MAX_SPAN_DAYS) continue;
    // West events only: most of its teams are West teams
    let w = 0; for (const id of e.teams) if (west.has(id)) w++;
    if (w * 2 < e.teams.size) continue;
    const votes = new Map<string, number>();
    for (const id of e.teams) { const s = teamState.get(id); if (s && s !== "—") votes.set(s, (votes.get(s) ?? 0) + 1); }
    const state = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    out.push({ name, start: e.start, end: e.end, games: e.games, teams: e.teams.size, state });
  }
  out.sort((a, b) => b.end.localeCompare(a.end) || b.games - a.games);
  cache.set(data, out);
  return out;
}
