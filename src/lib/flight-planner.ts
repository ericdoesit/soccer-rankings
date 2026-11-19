/**
 * Flight Planner: seed a tournament's teams into flights (brackets) of similar strength.
 *
 *  1. match: each pasted name is matched to rated teams of the chosen age group and gender
 *     (every rated team, listed or not), returning the top candidates for the organizer to confirm.
 *  2. plan:  confirmed teams (or unmatched ones given a level) are split into flights of a
 *     chosen size, across leagues or within one league, and each flight gets a youth-tournament
 *     bracket (seeded groups, crossovers, a final), with every game predicted from the site's
 *     outcome model (src/lib/predict.ts) and teams that don't fit their flight flagged.
 *
 * Rebuilt 2026-11-19: the first version ignored age and gender ("B16" matched U16 and U18
 * teams), searched only listed teams by plain string distance, and put unmatched teams in the
 * last flight.
 */
import { getDataSet, leagueFamily } from "./data";
import { outcomeModel, type Outcome } from "./predict";

const SEASON_END = 2027; // 2026-27: U## = 2027 − birth year (school-year age groups)

export interface Candidate {
  id: number; name: string; club: string; state: string; rating: number; games: number;
  league: string | null; listed: boolean; match: number;
}
export interface MatchRow { input: string; candidates: Candidate[] }
export interface PlanTeam { key: string; name: string; rating: number; league: string | null; id?: number }
export interface PlannedGame { a: string; b: string; stage: string; margin: number; outcome: Outcome }
export interface PlannedGroup { name: string; teams: PlanTeam[] }
export interface PlannedFlight {
  name: string; teams: PlanTeam[]; avg: number; spread: number; level: string | null;
  format: string; groups: PlannedGroup[]; close: number; games: PlannedGame[]; mismatches: number;
  final: PlannedGame | null; flags: Array<{ name: string; direction: "up" | "down"; note: string }>;
}

/** "Surf B2014 Elite", "BU13", "B14", "2014B" → age group and gender, when the names say so */
export function detectAgeGender(lines: string[]): { ageGroup?: string; gender?: string } {
  const ages = new Map<string, number>(), genders = new Map<string, number>();
  for (const l of lines) {
    const s = ` ${l} `;
    let m = s.match(/\b([BG])U?(\d{2})\b(?!\/)/i) ?? s.match(/\bU(\d{2})\s*([BG])\b/i)?.slice(0).reverse() ?? null;
    let age: string | undefined, g: string | undefined;
    const by = s.match(/\b([BG])?\s?(20[01]\d)\s?([BG])?\b/i);
    if (by) { age = `U${SEASON_END - Number(by[2])}`; g = (by[1] ?? by[3])?.toUpperCase(); }
    else if ((m = s.match(/\b([BG])U(\d{1,2})\b/i))) { age = `U${m[2]}`; g = m[1].toUpperCase(); }
    else if ((m = s.match(/\bU(\d{1,2})\b/i))) age = `U${m[1]}`;
    else if ((m = s.match(/\b([BG])(\d{2})\b/i))) { age = `U${SEASON_END - 2000 - Number(m[2])}`; g = m[1].toUpperCase(); }
    if (!g && /\bboys?\b/i.test(s)) g = "B";
    if (!g && /\bgirls?\b/i.test(s)) g = "G";
    if (age) ages.set(age, (ages.get(age) ?? 0) + 1);
    if (g) genders.set(g, (genders.get(g) ?? 0) + 1);
  }
  const top = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1])[0]?.[0];
  const g = top(genders);
  return { ageGroup: top(ages), gender: g === "B" ? "Boys" : g === "G" ? "Girls" : undefined };
}

const LEVEL_WORDS = new Set("ecnl rl pre mls next hd ad ea ea2 n1 npl ga dpl academy elite premier select gold black white blue red".split(" "));
const GENERIC = new Set("fc sc cf soccer club futbol football the de of boys girls boy girl team".split(" "));
/** a name's identifying words: no age labels, years or generic words */
function words(s: string): string[] {
  return s.toLowerCase().replace(/[()#.,'/]/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !GENERIC.has(w) && !/^(\d+|[bgu]{1,2}\d{1,4}|\d{1,4}[bgu])$/.test(w));
}
/** share of the pasted words found in the candidate (prefix match for 4+ letters: "lostoros" ~ "los toros") */
function similarity(input: string[], cand: string[]): number {
  if (!input.length || !cand.length) return 0;
  const joined = cand.join("");
  let hit = 0;
  for (const w of input) {
    if (cand.includes(w)) hit += 1;
    else if (w.length >= 4 && (cand.some((c) => c.startsWith(w) || w.startsWith(c) && c.length >= 4) || joined.includes(w))) hit += 0.7;
  }
  // league and level words in the candidate ("ECNL", "MLS NEXT", "Elite") aren't a mismatch
  const extra = cand.filter((c) => !input.includes(c) && !LEVEL_WORDS.has(c)).length;
  return hit / input.length - Math.min(0.3, extra * 0.04);
}

interface Pool { teams: Array<Candidate & { words: string[] }> }
const poolCache = new WeakMap<object, Map<string, Pool>>();
function pool(ageGroup: string, gender: string): Pool {
  const data = getDataSet();
  const byKey = poolCache.get(data) ?? poolCache.set(data, new Map()).get(data)!;
  const key = `${ageGroup}|${gender}`;
  const hit = byKey.get(key);
  if (hit) return hit;
  const rating = new Map(data.rankings.map((r) => [r.teamId, r]));
  const since = new Date(Date.now() - 455 * 864e5).toISOString().slice(0, 10);
  const leagueCount = new Map<number, Map<string, number>>();
  for (const g of data.games) {
    if (g.status !== "completed" || g.date < since) continue;
    const l = leagueFamily(g.tournamentName ?? "");
    if (!l) continue;
    for (const id of [g.team1Id, g.team2Id]) { const m = leagueCount.get(id) ?? leagueCount.set(id, new Map()).get(id)!; m.set(l, (m.get(l) ?? 0) + 1); }
  }
  const teams: Pool["teams"] = [];
  for (const t of data.teams) {
    if (t.ageGroup !== ageGroup || t.gender !== gender) continue;
    const r = rating.get(t.id);
    if (!r || r.gamesPlayed < 5) continue;
    const league = [...(leagueCount.get(t.id) ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    teams.push({ id: t.id, name: t.name, club: t.club, state: t.state, rating: r.score, games: r.gamesPlayed, league,
      listed: !!t.rankable, match: 0, words: [...new Set(words(`${t.name} ${t.club} ${t.sourceName ?? ""}`))] });
  }
  const p = { teams };
  byKey.set(key, p);
  return p;
}

export function matchTeams(lines: string[], ageGroup: string, gender: string): MatchRow[] {
  const { teams } = pool(ageGroup, gender);
  return lines.map((input) => {
    const w = words(input);
    const scored = teams.map((t) => ({ t, s: similarity(w, t.words) }))
      .filter((x) => x.s >= 0.5)
      // best word match first; then West, listed and well-tested teams
      // (within 0.05 counts as a tie: then the club's listed, stronger team first)
      .sort((a, b) => (Math.abs(b.s - a.s) > 0.05 ? b.s - a.s : 0) || Number(b.t.listed) - Number(a.t.listed) || b.t.rating - a.t.rating)
      .slice(0, 3);
    return { input, candidates: scored.map(({ t, s }) => ({ id: t.id, name: t.name, club: t.club, state: t.state, rating: t.rating, games: t.games, league: t.league, listed: t.listed, match: Math.round(Math.min(1, s) * 100) / 100 })) };
  });
}

/** median rating of each league's listed teams at this age (for "about N1 level" and unmatched teams) */
export function leagueLevels(ageGroup: string, gender: string): Array<{ league: string; median: number; teams: number }> {
  const by = new Map<string, number[]>();
  for (const t of pool(ageGroup, gender).teams) if (t.listed && t.league) (by.get(t.league) ?? by.set(t.league, []).get(t.league)!).push(t.rating);
  const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
  return [...by].filter(([, v]) => v.length >= 8).map(([league, v]) => ({ league, median: Math.round(med(v) * 100) / 100, teams: v.length }))
    .sort((a, b) => b.median - a.median);
}

let modelCache: { data: object; predict: ReturnType<typeof outcomeModel> } | null = null;
function predictor() {
  const data = getDataSet();
  if (modelCache?.data !== data) {
    const rating = new Map(data.rankings.map((r) => [r.teamId, r.score]));
    const since = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
    modelCache = { data, predict: outcomeModel(data.games.filter((g) => g.status === "completed"), rating, since) };
  }
  return modelCache.predict;
}

/** flight names, strongest first, as youth tournaments label them */
const FLIGHT_NAMES = ["Premier", "Gold", "Silver", "Bronze", "Copper"];
const flightName = (f: number) => FLIGHT_NAMES[f] ?? `Flight ${f + 1}`;

/**
 * Split teams into flights of about `size` (sizes differ by at most one), strongest first, then
 * build each flight's bracket the way US youth tournaments do:
 *   3–4 teams: round robin, top 2 meet in the final
 *   5 teams:   round robin (4 games each), 1st place wins, no final
 *   6 teams:   two seeded groups of 3 (1·4·5 and 2·3·6) plus one crossover game each, group winners meet in the final
 *   7–8 teams: two seeded groups (1·4·5·8 and 2·3·6·7), round robin in each, group winners meet in the final
 * Seeding keeps the top two teams apart until the final. The likely final takes the teams with the
 * most expected points (3 per win, 1 per draw) from the predicted group games.
 * mode "mixed": one ladder across leagues. mode "league": each league seeded on its own.
 */
export function planFlights(teams: PlanTeam[], size: number, mode: "mixed" | "league", ageGroup: string, gender: string): PlannedFlight[] {
  const predict = predictor();
  const levels = leagueLevels(ageGroup, gender);
  const levelOf = (r: number) => levels.length ? levels.reduce((b, x) => (Math.abs(x.median - r) < Math.abs(b.median - r) ? x : b)).league : null;
  const game = (a: PlanTeam, b: PlanTeam, stage: string): PlannedGame => {
    const o = predict(a.rating, b.rating);
    return { a: a.name, b: b.name, stage, margin: Math.round((a.rating - b.rating) * 10) / 10,
      outcome: { win: Math.round(o.win * 100) / 100, draw: Math.round(o.draw * 100) / 100, loss: Math.round(o.loss * 100) / 100, margin: o.margin } };
  };
  const roundRobin = (ts: PlanTeam[], stage: string) => {
    const g: PlannedGame[] = [];
    for (let x = 0; x < ts.length; x++) for (let y = x + 1; y < ts.length; y++) g.push(game(ts[x], ts[y], stage));
    return g;
  };
  const lopsided = (g: PlannedGame) => Math.max(g.outcome.win, g.outcome.loss) >= 0.85;

  const groups: Array<[string, PlanTeam[]]> = mode === "league"
    ? [...teams.reduce((m, t) => m.set(t.league ?? "Other", [...(m.get(t.league ?? "Other") ?? []), t]), new Map<string, PlanTeam[]>())]
    : [["", teams]];
  const out: PlannedFlight[] = [];
  for (const [label, g] of groups.sort((a, b) => b[1].length - a[1].length)) {
    const sorted = [...g].sort((a, b) => b.rating - a.rating);
    const k = Math.max(1, Math.round(sorted.length / size));
    const base = Math.floor(sorted.length / k), extra = sorted.length % k;
    let i = 0;
    for (let f = 0; f < k; f++) {
      const n = base + (f < extra ? 1 : 0);
      const ft = sorted.slice(i, i + n); i += n;
      if (!ft.length) continue;

      // bracket
      let format: string, pools: PlannedGroup[] = [], games: PlannedGame[];
      if (ft.length >= 6) {
        // snake seeding: A gets seeds 1,4,5,8; B gets 2,3,6,7
        const A: PlanTeam[] = [], B: PlanTeam[] = [];
        ft.forEach((t, s) => ([0, 3].includes(s % 4) ? A : B).push(t));
        pools = [{ name: "Group A", teams: A }, { name: "Group B", teams: B }];
        games = [...roundRobin(A, "Group A"), ...roundRobin(B, "Group B")];
        if (ft.length === 6) {
          // crossovers keep the top two seeds apart: 1v6, 4v3, 5v2
          for (let c = 0; c < 3; c++) games.push(game(A[c], B[2 - c], "Crossover"));
          format = "Two seeded groups of 3, one crossover game each, group winners meet in the final";
        } else format = `Two seeded groups of ${A.length}${A.length !== B.length ? ` and ${B.length}` : ""}, group winners meet in the final`;
      } else {
        pools = [{ name: "", teams: ft }];
        games = roundRobin(ft, "Group");
        format = ft.length === 2 ? "Two-team flight: one game" : ft.length === 5 ? "Round robin, 4 games each, 1st place wins" : `Round robin, ${ft.length - 1} games each, top 2 meet in the final`;
      }

      // expected points from the predicted group games
      const pts = new Map<string, number>(ft.map((t) => [t.name, 0]));
      for (const x of games) {
        pts.set(x.a, pts.get(x.a)! + 3 * x.outcome.win + x.outcome.draw);
        pts.set(x.b, pts.get(x.b)! + 3 * x.outcome.loss + x.outcome.draw);
      }
      const byPts = (ts: PlanTeam[]) => [...ts].sort((a, b) => pts.get(b.name)! - pts.get(a.name)! || b.rating - a.rating);
      let final: PlannedGame | null = null;
      if (pools.length === 2) final = game(byPts(pools[0].teams)[0], byPts(pools[1].teams)[0], "Final");
      else if (ft.length >= 3 && ft.length <= 4) { const [a, b] = byPts(ft); final = game(a, b, "Final"); }

      // teams that don't fit: the favorite (or underdog) by 85%+ in most of their games
      const flags: PlannedFlight["flags"] = [];
      if (ft.length >= 3) for (const t of ft) {
        const mine = games.filter((x) => x.a === t.name || x.b === t.name);
        const winsBig = mine.filter((x) => (x.a === t.name ? x.outcome.win : x.outcome.loss) >= 0.85).length;
        const losesBig = mine.filter((x) => (x.a === t.name ? x.outcome.loss : x.outcome.win) >= 0.85).length;
        if (winsBig * 2 > mine.length && f > 0) flags.push({ name: t.name, direction: "up", note: `favored by 85%+ in ${winsBig} of ${mine.length} games: belongs a flight up` });
        else if (losesBig * 2 > mine.length) flags.push({ name: t.name, direction: "down", note: `underdog by 85%+ in ${losesBig} of ${mine.length} games: belongs a flight down${f === k - 1 ? " or in a lower bracket" : ""}` });
        else if (winsBig * 2 > mine.length) flags.push({ name: t.name, direction: "up", note: `favored by 85%+ in ${winsBig} of ${mine.length} games: too strong for this field` });
      }

      const r = ft.map((t) => t.rating);
      const avg = r.reduce((a, b) => a + b, 0) / r.length;
      out.push({
        name: `${label ? `${label} · ` : ""}${flightName(f)}`,
        teams: ft,
        avg: Math.round(avg * 100) / 100,
        spread: Math.round((Math.max(...r) - Math.min(...r)) * 100) / 100,
        level: levelOf(avg),
        format,
        groups: pools,
        // share of group games predicted within one goal
        close: games.length ? Math.round((games.filter((x) => Math.abs(x.margin) <= 1).length / games.length) * 100) : 100,
        mismatches: games.filter(lopsided).length,
        games,
        final,
        flags,
      });
    }
  }
  return out;
}
