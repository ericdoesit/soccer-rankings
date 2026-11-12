import fs from "fs";
import path from "path";

/** data/upcoming-events.json, written by `npm run events:upcoming` (scripts/upcoming-events.ts). */
export interface UpcomingEvent {
  id: number; name: string; start: string; end: string | null; city: string | null; state: string;
  kind: string; lastEditionGames: number | null; predictions: boolean;
}

export interface PredTeam {
  club: string; team: string; label: string; teamId: number | null; matchedName: string | null;
  match: "exact" | "club" | "none"; rating: number | null; assumedRating: number | null;
  record: string | null; rankInDivision: number | null;
  winGroup?: number; expPoints?: number; group?: string | null; beatsAverage?: number;
  /** knockout brackets: chance to win each round (reach the next stage) */
  reach?: { qf: number; sf: number; final: number; title: number };
}
export interface PredMatch {
  a: PredTeam; b: PredTeam; win: number; draw: number; loss: number; margin: number;
  schedule: { match: string; date: string; time: string; field: string; home: string; round?: string } | null;
}
export interface KnockoutRow {
  match: string; round: string; date: string; time: string; field: string; home: string; away: string;
  likely: { home: string; away: string; chance: number } | null;
}
export interface PredGroup { name: string; kind: "round-robin" | "bracket"; teams: PredTeam[]; matches: PredMatch[]; knockout?: KnockoutRow[] }
export interface Prediction {
  event: { id: number; name: string; fullName?: string; league?: string; gender?: string; start?: string; end?: string;
    venue?: string; city?: string; state?: string; format?: string };
  generatedAt: string; ratingsFrom: string; model: string;
  teams: { total: number; rated: number };
  divisions: Array<{ division: string; teams: number; groups: PredGroup[]; ranking: PredTeam[] }>;
  score?: { games: number; correct: number; logLoss: number | null };
}

const DATA = path.join(process.cwd(), "data");
const readJson = <T>(f: string): T | null => {
  try { return JSON.parse(fs.readFileSync(f, "utf8")) as T; } catch { return null; }
};

export function getUpcomingEvents(): { generatedAt: string | null; until: string | null; events: UpcomingEvent[] } {
  const j = readJson<{ generatedAt: string; until: string; events: UpcomingEvent[] }>(path.join(DATA, "upcoming-events.json"));
  return { generatedAt: j?.generatedAt ?? null, until: j?.until ?? null, events: j?.events ?? [] };
}

export function getPrediction(id: number): Prediction | null {
  if (!Number.isInteger(id)) return null;
  return readJson<Prediction>(path.join(DATA, "predictions", `${id}.json`));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Nov 19–22, 2026", "Nov 27 – Dec 1, 2026" */
export function formatDates(start?: string | null, end?: string | null): string {
  if (!start) return "";
  const [y, m, d] = start.split("-").map(Number);
  if (!end || end === start) return `${MONTHS[m - 1]} ${d}, ${y}`;
  const [y2, m2, d2] = end.split("-").map(Number);
  if (y2 !== y) return `${MONTHS[m - 1]} ${d}, ${y} – ${MONTHS[m2 - 1]} ${d2}, ${y2}`;
  if (m2 !== m) return `${MONTHS[m - 1]} ${d} – ${MONTHS[m2 - 1]} ${d2}, ${y}`;
  return `${MONTHS[m - 1]} ${d}–${d2}, ${y}`;
}
export const monthLabel = (date: string) => {
  const [y, m] = date.split("-").map(Number);
  return `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1]} ${y}`;
};
