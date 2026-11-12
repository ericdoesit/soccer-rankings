import fs from "fs";
import path from "path";

/** data/predictions/mlsnext.json, written by `npm run predict:mlsnext` (scripts/predict-mlsnext.ts). */
export interface MlsTeamRow {
  name: string; club: string; teamId: number | null; rating: number | null; assumed: boolean; provisional: boolean;
  p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number;
  ppm: number; expPpm: number; first: number; top4: number; remaining: number;
}
export interface MlsPick {
  matchId: number; date: string; startTime: string; home: string; away: string;
  homeTeamId: number | null; awayTeamId: number | null;
  win: number; draw: number; loss: number; margin: number; location: string | null;
  kind: "league" | "flex" | "pro-pathway"; noData: boolean;
}
export interface MlsConference { division: string; ageGroup: string; conference: string; west: boolean; teams: MlsTeamRow[]; upcoming: MlsPick[] }
export interface MlsPredictions {
  generatedAt: string; source: string; days: number;
  teams: { total: number; rated: number; west: number };
  score: { games: number; correct: number; logLoss: number } | null;
  conferences: MlsConference[];
}

const FILE = path.join(process.cwd(), "data", "predictions", "mlsnext.json");
let cache: { mtime: number; data: MlsPredictions } | null = null;

export function getMlsPredictions(): MlsPredictions | null {
  try {
    const mtime = fs.statSync(FILE).mtimeMs;
    if (!cache || cache.mtime !== mtime) cache = { mtime, data: JSON.parse(fs.readFileSync(FILE, "utf8")) as MlsPredictions };
    return cache.data;
  } catch { return null; }
}
