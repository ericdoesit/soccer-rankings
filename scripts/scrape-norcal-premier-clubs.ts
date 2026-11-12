/**
 * NorCal Premier club directory (norcalpremier.com/clubs/, ~300 clubs).
 *
 * Each club page gives the club's name, city, website and its team list, and
 * the links use GotSport ids (club = GotSport organization id, team = GotSport
 * team_id), so teams join to our data exactly, without name matching.
 *
 *   npx tsx scripts/scrape-norcal-premier-clubs.ts            # resume
 *   npx tsx scripts/scrape-norcal-premier-clubs.ts --refresh  # re-fetch every club
 *
 * robots.txt asks for Crawl-delay: 10, so requests are 10 s apart (~50 min).
 * Output: data/norcal-premier/clubs.json
 */
import * as fs from "fs";
import * as path from "path";

const BASE = "https://norcalpremier.com";
const OUT = path.join(process.cwd(), "data", "norcal-premier", "clubs.json");
const DELAY_MS = 10_000;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";

export interface NorcalTeam { gotsportTeamId: number; name: string; gender: "Boys" | "Girls" | null; age: number | null }
export interface NorcalClub {
  gotsportOrgId: number; name: string; city: string | null; state: string | null;
  website: string | null; teams: NorcalTeam[]; fetchedAt: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function get(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const wait = last + DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (res.ok) return await res.text();
      if (res.status === 404) return null;
      console.warn(`  HTTP ${res.status} ${url}`);
      if (res.status === 429 || res.status === 403) await sleep(5 * 60e3);
    } catch (e) { console.warn(`  ${(e as Error).message} ${url}`); }
  }
  return null;
}

const decode = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#0?39;|&#8217;/g, "'")
  .replace(/&quot;/g, '"').replace(/&#8211;/g, "–").replace(/\s+/g, " ").trim();

export function parseClubPage(id: number, html: string): NorcalClub {
  const name = decode(html.match(/<h1 class="masthead-title">([\s\S]*?)<\/h1>/)?.[1] ?? "");
  const place = decode(html.match(/<h4 class="masthead-subtitle">([\s\S]*?)<\/h4>/)?.[1] ?? "");
  const [city, state] = place.includes(",") ? place.split(",").map((x) => x.trim()) : [place || null, null];
  const website = html.match(/<a class="masthead-site-link" href="([^"]+)"/)?.[1] ?? null;
  const teams: NorcalTeam[] = [];
  const row = /<a href="\/club\/\d+\/team\/(\d+)">([\s\S]*?)<\/a>[\s\S]*?<a href="#">\s*([\s\S]*?)<\/a>[\s\S]*?<a href="#">\s*([\s\S]*?)<\/a>/g;
  for (const m of html.matchAll(row)) {
    const g = decode(m[3]).toLowerCase();
    const age = Number(decode(m[4]));
    teams.push({
      gotsportTeamId: Number(m[1]), name: decode(m[2]),
      gender: g === "male" ? "Boys" : g === "female" ? "Girls" : null,
      age: Number.isFinite(age) && age > 0 ? age : null,
    });
  }
  return { gotsportOrgId: id, name, city, state, website, teams, fetchedAt: new Date().toISOString() };
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  const existing: NorcalClub[] = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf-8")) : [];
  const byId = new Map(existing.map((c) => [c.gotsportOrgId, c]));

  const list = await get(`${BASE}/clubs/`);
  if (!list) throw new Error("could not load the clubs list");
  const ids = [...new Set([...list.matchAll(/href="(?:https:\/\/norcalpremier\.com)?\/club\/(\d+)\/?"/g)].map((m) => Number(m[1])))];
  const todo = ids.filter((id) => refresh || !byId.has(id));
  console.log(`NorCal Premier: ${ids.length} clubs, ${todo.length} to fetch (~${Math.ceil((todo.length * DELAY_MS) / 60e3)} min)`);

  const save = () => {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify([...byId.values()].sort((a, b) => a.name.localeCompare(b.name)), null, 1));
  };
  let n = 0;
  for (const id of todo) {
    const html = await get(`${BASE}/club/${id}/`);
    if (!html) continue;
    const club = parseClubPage(id, html);
    byId.set(id, club);
    n++;
    console.log(`  [${n}/${todo.length}] ${club.name} (${club.city ?? "?"}) — ${club.teams.length} teams${club.website ? "" : ", no website"}`);
    if (n % 10 === 0) save();
  }
  save();
  const teams = [...byId.values()].reduce((a, c) => a + c.teams.length, 0);
  console.log(`Wrote ${OUT}: ${byId.size} clubs, ${teams} teams`);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
