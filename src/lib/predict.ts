/**
 * Match predictions from the ratings.
 *
 * Ratings are Massey ratings in goals, so the predicted goal margin of A vs B on a
 * neutral field is rating(A) − rating(B). Win / draw / loss chances come from what
 * actually happened in recent games between teams with the same rating gap (bands of
 * 0.5 goals, counted from both sides so the table is symmetric). Same idea as the
 * fairness check (scripts/correlator.ts).
 */
export interface Outcome { win: number; draw: number; loss: number; margin: number }
type GameLike = { team1Id: number; team2Id: number; team1Score: number; team2Score: number; date: string };
/** rating-gap band → wins / draws / losses of the side with that gap */
export type OutcomeTable = Map<number, { w: number; d: number; l: number }>;

const BAND = 0.5, MAX_BAND = 12; // ±6 goals
const band = (diff: number) => Math.max(-MAX_BAND, Math.min(MAX_BAND, Math.round(diff / BAND)));

/** Count outcomes by rating gap. `ratingOf` may depend on the game (ratings frozen before it). */
export function outcomeTable<T extends GameLike>(games: T[], ratingOf: (g: T, teamId: number) => number | undefined): OutcomeTable {
  const table: OutcomeTable = new Map();
  for (const g of games) {
    const a = ratingOf(g, g.team1Id), b = ratingOf(g, g.team2Id);
    if (a === undefined || b === undefined) continue;
    for (const [diff, mine, theirs] of [[a - b, g.team1Score, g.team2Score], [b - a, g.team2Score, g.team1Score]]) {
      const k = band(diff);
      const x = table.get(k) ?? { w: 0, d: 0, l: 0 };
      if (mine > theirs) x.w++; else if (mine === theirs) x.d++; else x.l++;
      table.set(k, x);
    }
  }
  return table;
}

/**
 * Chances for the side rated `a` against `b`. By default the table is learned from `games`
 * since `since` with today's ratings; pass `table` to use one learned elsewhere.
 */
export function outcomeModel(games: GameLike[], rating: Map<number, number>, since: string, table?: OutcomeTable) {
  const t = table ?? outcomeTable(games.filter((g) => g.date && g.date >= since), (_g, id) => rating.get(id));
  return (a: number, b: number): Outcome => {
    const k = band(a - b);
    // thin bands at the extremes: widen to neighbours until there are 200 games
    let w = 0, d = 0, l = 0;
    for (let r = 0; r <= MAX_BAND && w + d + l < 200; r++) {
      for (const kk of r === 0 ? [k] : [k - r, k + r]) {
        const x = t.get(kk);
        if (x) { w += x.w; d += x.d; l += x.l; }
      }
    }
    const n = w + d + l || 1;
    return { win: w / n, draw: d / n, loss: l / n, margin: a - b };
  };
}
