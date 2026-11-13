export interface GameInput {
  team1Id: number;
  team2Id: number;
  team1Score: number;
  team2Score: number;
  date: string;
  status: "completed" | "forfeited" | "cancelled";
  isTeam1Home?: boolean;
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
};

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
 * Enhancements tuned from 48K-game statistical analysis:
 * - Margin cap at 3 goals (optimal correlation with win rate)
 * - Home advantage adjustment of 1.1 goals
 * - Recency weighting via exponential decay (3.5-month half-life)
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
  const diagonal = new Float64Array(n);
  const p = new Float64Array(n);

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

  const ratings = jacobiSolve(diagonal, offDiag, p, n);

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

function jacobiSolve(
  diagonal: Float64Array,
  offDiag: Map<number, number>[],
  b: Float64Array,
  n: number,
  maxIter = 500,
  tolerance = 1e-8
): Float64Array {
  const x = new Float64Array(n);

  for (let iter = 0; iter < maxIter; iter++) {
    const xNew = new Float64Array(n);
    let maxDiff = 0;

    for (let i = 0; i < n; i++) {
      if (diagonal[i] === 0) continue;
      let sum = b[i];
      for (const [j, val] of offDiag[i]) {
        sum -= val * x[j];
      }
      xNew[i] = sum / diagonal[i];
    }

    let mean = 0;
    for (let i = 0; i < n; i++) mean += xNew[i];
    mean /= n;
    for (let i = 0; i < n; i++) {
      xNew[i] -= mean;
      maxDiff = Math.max(maxDiff, Math.abs(xNew[i] - x[i]));
    }

    for (let i = 0; i < n; i++) x[i] = xNew[i];
    if (maxDiff < tolerance) break;
  }

  return x;
}
