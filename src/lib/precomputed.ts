/**
 * Page data computed ahead of time by scripts/build-precomputed.ts (the last step of
 * `npm run build:data`) and shipped in the data release: data/precomputed/*.json.
 *
 * A cold server instance otherwise parses the ~110 MB snapshot (0.7 s here, 2–3 s on Vercel) and
 * builds the explore / rankings indexes before it can render Southern California, a league or
 * state page, or answer /api/rankings and /api/proven. With these files those read a few small
 * JSON files instead and never load the snapshot.
 *
 * A file is used only while it matches the snapshot it was built from (same size, recorded in
 * _stamp.json); otherwise callers compute from the snapshot as before. The build script sets
 * PRECOMPUTE_BUILD=1 so it always computes fresh.
 */
import fs from "fs";
import path from "path";

const DIR = path.join(process.cwd(), "data", "precomputed");
const SNAPSHOT = path.join(process.cwd(), "data", "snapshot.json");

let checkedAt = 0;
let valid = false;
const memo = new Map<string, unknown>();

function isCurrent(): boolean {
  if (process.env.PRECOMPUTE_BUILD) return false;
  if (Date.now() - checkedAt < 10_000) return valid;
  checkedAt = Date.now();
  let now = false;
  try {
    const stamp = JSON.parse(fs.readFileSync(path.join(DIR, "_stamp.json"), "utf8")) as { snapshotSize: number };
    now = stamp.snapshotSize === fs.statSync(SNAPSHOT).size;
  } catch { /* no precomputed data (or no snapshot): compute */ }
  if (now !== valid) memo.clear();
  valid = now;
  return valid;
}

/** data/precomputed/<name>.json, or null when missing or built from another snapshot */
export function readPrecomputed<T>(name: string): T | null {
  if (!isCurrent()) return null;
  if (memo.has(name)) return memo.get(name) as T | null;
  let value: T | null = null;
  try { value = JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), "utf8")) as T; } catch { /* not precomputed */ }
  memo.set(name, value);
  return value;
}

export const PRECOMPUTED_DIR = DIR;
