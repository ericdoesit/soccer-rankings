/**
 * Prediction accuracy for a league's season, from scripts/backtest-socal-flights.ts
 * (data/predictions/socal-accuracy.json, shipped in the data release). Each week's games were
 * predicted by ratings built only from games before that week.
 */
import fs from "fs";
import path from "path";

export interface AccuracyStats {
  n: number; decided: number; favWon: number; expFavWon: number; draws: number;
  logLoss: number; skill: number; slope: number; intercept: number; r2: number; mae: number; provisionalShare: number;
}
export interface LeagueAccuracy {
  event: string; generated: string; seasonGames: number; graded: number; unrated: number;
  overall: AccuracyStats; established: AccuracyStats;
  byTier: Record<string, AccuracyStats>; byGender: Record<string, AccuracyStats>; byAge: Record<string, AccuracyStats>;
  byWeek: Record<string, AccuracyStats>;
  scatter?: { cells: Array<{ x: number; y: number; n: number }>; means: Array<{ x: number; y: number; n: number }> };
}

const FILES: Record<string, string> = { "socal-soccer-league": "socal-accuracy.json" };
let cache: { file: string; mtime: number; value: LeagueAccuracy } | null = null;

export function getLeagueAccuracy(slug: string): LeagueAccuracy | null {
  const name = FILES[slug];
  if (!name) return null;
  const file = path.join(process.cwd(), "data", "predictions", name);
  try {
    const mtime = fs.statSync(file).mtimeMs;
    if (cache?.file !== file || cache.mtime !== mtime) cache = { file, mtime, value: JSON.parse(fs.readFileSync(file, "utf8")) };
    return cache.value;
  } catch {
    return null;
  }
}
