export interface GameInput {
  team1Id: number;
  team2Id: number;
  team1Score: number;
  team2Score: number;
  date: string;
  status: "completed" | "forfeited" | "cancelled";
  isTeam1Home?: boolean;
  /** the competition ("MLS NEXT 2026-27 Homegrown Division"): ties a team to its league, see `leagueTie` */
  tournamentName?: string;
}

export interface RankingResult {
  teamId: number;
  score: number;
  rank: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface MasseyConfig {
  marginCap: number;
  decayHalfLifeDays: number;
  minGames: number;
  homeAdvantage: number;
  /** Games before `seasonStart` (e.g. "2026-08-01") are multiplied by this on top of the
   *  decay: rosters turn over between seasons. 1 = no extra discount, 0 = this season only. */
  priorSeasonWeight: number;
  /** null = Aug 1 of the season containing the most recent game */
  seasonStart: string | null;
  /** Weight of a pseudo-game (margin 0) between each team and its league: the competition
   *  it plays most, season stripped (+ age group and gender with `leagueOf`). Teams only meet
   *  their own conference, and our data is deep in the West (top leagues down to local) but
   *  only MLS NEXT elsewhere, so whole pools can be unconnected by games: each pool's average
   *  then floats to zero on its own and a West conference sat ~15 goals above equal teams
   *  elsewhere (MLS NEXT Cup 2026). The tie gives every league one level shared across pools;
   *  where real games connect them, they outweigh it. 0 = off. */
  leagueTie: number;
  /** league key of a team in a game; default: the competition name without its season */
  leagueOf?: (teamId: number, tournamentName: string) => string | null;
}

// Tuned from grid search on 81,588 games (65K train / 16K test):
// - marginCap 6: r=0.661, accuracy=66.6%, MAE=2.30 (best overall prediction)
//   Cap 3 had higher win-rate correlation but worse actual prediction accuracy
// - homeAdvantage 0.1: optimal from grid search. Raw avg was 1.08 but
//   rematch analysis (24K games) showed only 0.32 real advantage,
//   and grid search confirmed ~0.1 is the sweet spot
// - shutout bonus NOT included (no additional predictive signal)
const DEFAULT_CONFIG: MasseyConfig = {
  marginCap: 6,
  decayHalfLifeDays: 105,
  minGames: 10,
  homeAdvantage: 0.1,
  // Backtest (scripts/backtest-season-weight.ts, 2026-11-13): rating on games before Oct 1
  // and predicting Oct 1 – Nov 12, last season × 0.25 beat decay-only in both 2025 and 2026
  // (log loss 0.8087 → 0.7852 in 2026; 0.2–0.35 all similar). This-season-only was worse
  // and left 8% more games unpredictable.
  priorSeasonWeight: 0.25,
  seasonStart: null,
  // Backtest 2026-11-14 (ratings frozen at a cutoff, predicting what followed): 0.05 left
  // everyday West games unchanged (fall 76.3%, spring 74.5% winners) and fixed national
  // events: MLS NEXT Cup Homegrown 52% → 60% (margin error 3.9 → 1.8 goals), U13/U14
  // Championship 69% → 76% (5.8 → 1.5). 0.2+ helped the Cup a bit more but cost everyday games.
  leagueTie: 0.05,
};

/** "MLS NEXT 2026-27 Homegrown Division" → "MLS NEXT Homegrown Division" */
export const leagueName = (tournamentName: string) =>
  tournamentName.replace(/\b20\d\d(-\d\d)?\b/g, "").replace(/\s+/g, " ").trim();

function daysBetween(d1: string, d2: string): number {
  const ms = new Date(d2).getTime() - new Date(d1).getTime();
  return ms / (1000 * 60 * 60 * 24);
}

function capMargin(diff: number, cap: number): number {
  return Math.max(-cap, Math.min(cap, diff));
}

/**
 * Enhanced Massey Rating System
 *
 * Solves M·r = p where:
 * - M[i][j] = -count of games between team i and team j (off-diagonal)
 * - M[i][i] = total games played by team i (diagonal)
 * - p[i] = weighted sum of adjusted point differentials for team i
 *
 * Enhancements (see DEFAULT_CONFIG for the backtests):
 * - margin cap 6, home advantage 0.1 goals
 * - recency: exponential decay (105-day half-life), last season × 0.25
 * - league ties: each team pulled very lightly toward its league's level (leagueTie)
 */
export function calculateRankings(
  games: GameInput[],
  config: Partial<MasseyConfig> = {}
): RankingResult[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const completedGames = games.filter((g) => g.status === "completed");
  if (completedGames.length === 0) return [];

  // Most recent game date. Only ISO "YYYY-MM-DD" strings are compared: a
  // lexical max over mixed formats ("Sep 9, 2025" > "2026-03-27") previously
  // picked a stale reference date and gave most games a weight > 1.
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;
  const referenceDate = completedGames.reduce(
    (max, g) => (ISO_DATE.test(g.date) && g.date > max ? g.date : max),
    "1900-01-01"
  );

  const seasonStart = cfg.seasonStart ?? (referenceDate > "1900-01-01"
    ? `${Number(referenceDate.slice(5, 7)) >= 8 ? referenceDate.slice(0, 4) : Number(referenceDate.slice(0, 4)) - 1}-08-01`
    : null);

  const teamIds = new Set<number>();
  for (const g of completedGames) {
    teamIds.add(g.team1Id);
    teamIds.add(g.team2Id);
  }

  const teamList = Array.from(teamIds);
  const n = teamList.length;
  if (n < 2) return [];

  const teamIndex = new Map<number, number>();
  teamList.forEach((id, i) => teamIndex.set(id, i));

  const gamesPlayed = new Float64Array(n);
  const wins = new Int32Array(n);
  const losses = new Int32Array(n);
  const draws = new Int32Array(n);

  const offDiag: Map<number, number>[] = Array.from(
    { length: n },
    () => new Map()
  );
  let diagonal = new Float64Array(n);
  let p = new Float64Array(n);

  const decayLambda = Math.LN2 / cfg.decayHalfLifeDays;

  for (const game of completedGames) {
    const i = teamIndex.get(game.team1Id)!;
    const j = teamIndex.get(game.team2Id)!;

    // Undated games get full weight; dated games decay and never exceed 1.
    const daysAgo = ISO_DATE.test(game.date) ? daysBetween(game.date, referenceDate) : NaN;
    let weight = isNaN(daysAgo) ? 1 : Math.exp(-decayLambda * Math.max(0, daysAgo));
    if (seasonStart && cfg.priorSeasonWeight !== 1 && ISO_DATE.test(game.date) && game.date < seasonStart) {
      weight *= cfg.priorSeasonWeight;
      if (weight === 0) continue;
    }

    // Adjust for home advantage: subtract home edge from the raw differential
    // so ratings reflect neutral-site strength
    let rawDiff = game.team1Score - game.team2Score;
    if (game.isTeam1Home === true) {
      rawDiff -= cfg.homeAdvantage;
    } else if (game.isTeam1Home === false) {
      rawDiff += cfg.homeAdvantage;
    }
    // If home/away unknown, no adjustment (tournament games are often neutral)

    const cappedDiff = capMargin(rawDiff, cfg.marginCap);

    diagonal[i] += weight;
    diagonal[j] += weight;
    offDiag[i].set(j, (offDiag[i].get(j) ?? 0) - weight);
    offDiag[j].set(i, (offDiag[j].get(i) ?? 0) - weight);

    p[i] += weight * cappedDiff;
    p[j] -= weight * cappedDiff;

    // W/L/D uses raw score (not adjusted)
    const actualDiff = game.team1Score - game.team2Score;
    gamesPlayed[i]++;
    gamesPlayed[j]++;
    if (actualDiff > 0) {
      wins[i]++;
      losses[j]++;
    } else if (actualDiff < 0) {
      losses[i]++;
      wins[j]++;
    } else {
      draws[i]++;
      draws[j]++;
    }
  }

  // league nodes: index n.. ; each team tied to the league it played most (decay-weighted)
  let size = n;
  if (cfg.leagueTie > 0) {
    const leagueOf = cfg.leagueOf ?? ((_id: number, t: string) => leagueName(t) || null);
    const weightIn: Map<string, number>[] = Array.from({ length: n }, () => new Map());
    for (const game of completedGames) {
      if (!game.tournamentName) continue;
      const daysAgo = ISO_DATE.test(game.date) ? daysBetween(game.date, referenceDate) : 0;
      const w = Math.exp(-decayLambda * Math.max(0, daysAgo));
      for (const id of [game.team1Id, game.team2Id]) {
        const k = leagueOf(id, game.tournamentName);
        if (!k) continue;
        const m = weightIn[teamIndex.get(id)!];
        m.set(k, (m.get(k) ?? 0) + w);
      }
    }
    const leagueIdx = new Map<string, number>();
    const ties: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      let best: string | null = null, bw = 0;
      for (const [k, w] of weightIn[i]) if (w > bw) { best = k; bw = w; }
      if (!best) continue;
      let L = leagueIdx.get(best);
      if (L === undefined) { L = n + leagueIdx.size; leagueIdx.set(best, L); }
      ties.push([i, L]);
    }
    size = n + leagueIdx.size;
    const grow = <T extends Float64Array>(a: T) => { const b = new Float64Array(size); b.set(a); return b; };
    const diag2 = grow(diagonal), p2 = grow(p);
    for (let k = n; k < size; k++) offDiag.push(new Map());
    for (const [i, L] of ties) {
      diag2[i] += cfg.leagueTie; diag2[L] += cfg.leagueTie;
      offDiag[i].set(L, (offDiag[i].get(L) ?? 0) - cfg.leagueTie);
      offDiag[L].set(i, (offDiag[L].get(i) ?? 0) - cfg.leagueTie);
    }
    diagonal = diag2; p = p2;
  }

  const ratings = cgSolve(diagonal, offDiag, p, size, n);

  const results: RankingResult[] = [];
  for (let i = 0; i < n; i++) {
    if (gamesPlayed[i] < cfg.minGames) continue;
    results.push({
      teamId: teamList[i],
      score: Math.round(ratings[i] * 100) / 100,
      rank: 0,
      gamesPlayed: gamesPlayed[i],
      wins: wins[i],
      losses: losses[i],
      draws: draws[i],
    });
  }

  results.sort((a, b) => b.score - a.score);
  results.forEach((r, i) => {
    r.rank = i + 1;
  });

  return results;
}

/**
 * Predict the outcome of a game between two rated teams.
 * Returns expected goal difference (positive = team1 favored).
 * Add homeAdvantage if team1 is home.
 */
export function predictGame(
  team1Score: number,
  team2Score: number,
  isTeam1Home: boolean | null = null,
  homeAdvantage = DEFAULT_CONFIG.homeAdvantage
): {
  expectedMargin: number;
  team1WinProb: number;
  drawProb: number;
  team2WinProb: number;
} {
  let expectedMargin = team1Score - team2Score;
  if (isTeam1Home === true) expectedMargin += homeAdvantage;
  else if (isTeam1Home === false) expectedMargin -= homeAdvantage;

  // Convert margin to win probability using logistic function
  // Calibrated: 1 goal margin ≈ 65% win probability
  const k = 0.7;
  const team1WinProb = 1 / (1 + Math.exp(-k * expectedMargin));
  const drawProb = Math.max(0, 0.25 - 0.04 * Math.abs(expectedMargin));
  const team2WinProb = Math.max(0, 1 - team1WinProb - drawProb);

  return {
    expectedMargin: Math.round(expectedMargin * 10) / 10,
    team1WinProb: Math.round(team1WinProb * 1000) / 10,
    drawProb: Math.round(drawProb * 1000) / 10,
    team2WinProb: Math.round(team2WinProb * 1000) / 10,
  };
}

/**
 * Solves M·x = b (M = weighted game Laplacian + league ties) with Jacobi-preconditioned
 * conjugate gradient. Plain Jacobi iteration (used before 2026-11-14) converges very slowly
 * across thinly connected pools, which the league ties create on purpose. A tiny ridge keeps
 * pools with no connection at all defined; ratings are centered on the mean of the teams
 * (the first `nTeams` unknowns).
 */
function cgSolve(
  diagonal: Float64Array,
  offDiag: Map<number, number>[],
  b: Float64Array,
  size: number,
  nTeams: number,
  maxIter = 3000,
  tolerance = 1e-7
): Float64Array {
  const d = new Float64Array(size);
  for (let i = 0; i < size; i++) d[i] = diagonal[i] + 1e-6;
  const mul = (v: Float64Array, out: Float64Array) => {
    for (let i = 0; i < size; i++) {
      let s = d[i] * v[i];
      for (const [j, val] of offDiag[i]) s += val * v[j];
      out[i] = s;
    }
  };
  const x = new Float64Array(size);
  const r = Float64Array.from(b);
  const z = new Float64Array(size), q = new Float64Array(size), Aq = new Float64Array(size);
  for (let i = 0; i < size; i++) z[i] = r[i] / d[i];
  q.set(z);
  let rz = 0, bn = 0;
  for (let i = 0; i < size; i++) { rz += r[i] * z[i]; bn += b[i] * b[i]; }
  bn = Math.sqrt(bn);
  if (bn > 0) {
    for (let iter = 0; iter < maxIter; iter++) {
      mul(q, Aq);
      let qAq = 0;
      for (let i = 0; i < size; i++) qAq += q[i] * Aq[i];
      if (qAq <= 0) break;
      const a = rz / qAq;
      let rn = 0;
      for (let i = 0; i < size; i++) { x[i] += a * q[i]; r[i] -= a * Aq[i]; rn += r[i] * r[i]; }
      if (Math.sqrt(rn) < tolerance * bn) break;
      let rz2 = 0;
      for (let i = 0; i < size; i++) { z[i] = r[i] / d[i]; rz2 += r[i] * z[i]; }
      const beta = rz2 / rz;
      rz = rz2;
      for (let i = 0; i < size; i++) q[i] = z[i] + beta * q[i];
    }
  }
  let mean = 0;
  for (let i = 0; i < nTeams; i++) mean += x[i];
  mean /= nTeams;
  for (let i = 0; i < size; i++) x[i] -= mean;
  return x;
}
