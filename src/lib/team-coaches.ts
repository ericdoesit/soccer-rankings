import fs from "fs";
import path from "path";

/** Head coaches by GotSport team id (data/seed/team-coaches.json), re-read when the file changes */
const FILE = path.join(process.cwd(), "data", "seed", "team-coaches.json");
let cache: { mtime: number; byId: Map<number, string> } | null = null;

function load(): Map<number, string> {
  let mtime = 0;
  try { mtime = fs.statSync(FILE).mtimeMs; } catch { return new Map(); }
  if (cache && cache.mtime === mtime) return cache.byId;
  const byId = new Map<number, string>();
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf-8")) as Record<string, { coach?: string } | unknown>;
    for (const [k, v] of Object.entries(raw)) {
      const coach = (v as { coach?: string })?.coach;
      if (/^\d+$/.test(k) && coach) byId.set(Number(k), coach);
    }
  } catch { /* keep empty */ }
  cache = { mtime, byId };
  return byId;
}

export function coachFor(gotsportTeamId: number | undefined | null): string | null {
  return gotsportTeamId ? load().get(gotsportTeamId) ?? null : null;
}
