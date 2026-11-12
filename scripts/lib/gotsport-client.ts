/**
 * The one GotSport API client every crawler uses.
 *
 *  - one request at a time, DELAY_MS apart
 *  - a lock file so two crawlers never run at once (parallel runs got the
 *    whole IP rate-limited with HTTP 403 by CloudFront)
 *  - on 403/429: back off for minutes (2, 5, 10, 20, 30), not seconds
 */
import * as fs from "fs";
import * as path from "path";

const API = "https://system.gotsport.com/api/v1";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
  "x-rankings-client": "rankings-web",
  Referer: "https://rankings.gotsport.com/",
  Accept: "application/json",
};
export const DELAY_MS = 1500;
const BACKOFF_MIN = [2, 5, 10, 20, 30];
const LOCK = path.join(process.cwd(), "data", ".gotsport.lock");

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let locked = false;
export function acquireLock() {
  if (locked) return;
  if (fs.existsSync(LOCK)) {
    const pid = Number(fs.readFileSync(LOCK, "utf-8"));
    let alive = false;
    try { process.kill(pid, 0); alive = pid !== process.pid; } catch { /* stale */ }
    if (alive) throw new Error(`another GotSport crawler is running (pid ${pid}); wait for it or remove ${LOCK}`);
  }
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  fs.writeFileSync(LOCK, String(process.pid));
  locked = true;
  const release = () => { try { if (Number(fs.readFileSync(LOCK, "utf-8")) === process.pid) fs.unlinkSync(LOCK); } catch {} };
  process.on("exit", release);
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { release(); process.exit(130); });
}

export const stats = { requests: 0, rateLimited: 0 };
let last = 0;

/** GET an API path ("/team_ranking_data?..."). null on 404 or after retries. */
export async function gsGet<T>(pathAndQuery: string): Promise<T | null> {
  acquireLock();
  for (let attempt = 0; attempt <= BACKOFF_MIN.length; attempt++) {
    const wait = last + DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    stats.requests++;
    try {
      const res = await fetch(`${API}${pathAndQuery}`, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
      if (res.ok) return (await res.json()) as T;
      if (res.status === 404) return null;
      if (res.status === 403 || res.status === 429) {
        stats.rateLimited++;
        const min = BACKOFF_MIN[attempt] ?? 30;
        console.warn(`    rate limited (${res.status}); pausing ${min} min`);
        await sleep(min * 60e3);
        continue;
      }
      console.warn(`    HTTP ${res.status} ${pathAndQuery}`);
    } catch (e) {
      console.warn(`    ${(e as Error).message}`);
    }
    await sleep(DELAY_MS * 10);
  }
  return null;
}
