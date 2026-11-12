/**
 * Finds league clubs whose website is missing or doesn't load, so they can be
 * looked up online and added to data/seed/club-websites.json (which overrides
 * the league's link).
 *
 *   npx tsx scripts/check-club-websites.ts
 * Writes data/seed/club-websites-todo.json: [{ gotsportOrgId, name, city, league, website, problem }]
 */
import * as fs from "fs";
import * as path from "path";
import { normalizeWebsite } from "../src/lib/directory/url";

const LEAGUE_FILES: Array<[string, string]> = [["norcal-premier", path.join("data", "norcal-premier", "clubs.json")]];
const OVERRIDES = path.join("data", "seed", "club-websites.json");
const TODO = path.join("data", "seed", "club-websites-todo.json");

interface Club { gotsportOrgId: number; name: string; city: string | null; website: string | null }
// website null = already checked, no working site: skip it
const overrides = new Map<number, string | null>(
  (fs.existsSync(OVERRIDES) ? JSON.parse(fs.readFileSync(OVERRIDES, "utf-8")) : []).map((o: { gotsportOrgId: number; website: string | null }) => [o.gotsportOrgId, o.website]));

async function loads(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15_000) });
    // 401/403/406/429: the site exists but refuses automated checks; count it as loading
    if ([401, 403, 406, 429].includes(res.status)) return null;
    if (!res.ok) return `HTTP ${res.status}`;
    const body = (await res.text()).slice(0, 20_000).toLowerCase();
    if (/domain (is )?for sale|buy this domain|parked|godaddy\.com\/forsale|this domain has expired/.test(body)) return "parked or for sale";
    return null;
  } catch (e) { return (e as Error).name === "TimeoutError" ? "timeout" : "unreachable"; }
}

(async () => {
  const todo: unknown[] = [];
  for (const [league, file] of LEAGUE_FILES) {
    if (!fs.existsSync(file)) continue;
    const clubs: Club[] = JSON.parse(fs.readFileSync(file, "utf-8"));
    let ok = 0;
    for (const c of clubs) {
      if (overrides.has(c.gotsportOrgId) && overrides.get(c.gotsportOrgId) === null) { ok++; continue; }
      const website = normalizeWebsite(overrides.get(c.gotsportOrgId) ?? c.website);
      const problem = website ? await loads(website) : "no website listed";
      if (problem) todo.push({ gotsportOrgId: c.gotsportOrgId, name: c.name, city: c.city, league, website, problem });
      else ok++;
    }
    console.log(`${league}: ${clubs.length} clubs, ${ok} websites load, ${clubs.length - ok} need a lookup`);
  }
  fs.writeFileSync(TODO, JSON.stringify(todo, null, 1));
  console.log(`Wrote ${TODO}`);
})();
