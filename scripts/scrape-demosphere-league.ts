/**
 * Demosphere league schedules (static division pages): standings and every game.
 * Used for leagues not on GotSport, e.g. North Puget Sound League (WA).
 *
 *   npx tsx scripts/scrape-demosphere-league.ts            # all leagues in data/demosphere/leagues.json
 *
 * Only the static pages elements.demosphere-secure.com/<org>/schedules/<season>/<division>.html
 * are fetched (robots.txt disallows /scripts/). Division lists live in leagues.json.
 * Output: data/demosphere/<league>/games.json in the shape the importer reads.
 */
import * as fs from "fs";
import * as path from "path";

const DIR = path.join(process.cwd(), "data", "demosphere");
const DELAY_MS = 3000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface LeagueCfg {
  league: string; leagueName: string; association: string; orgId: number; source: string;
  seasons: Array<{ season: string; eventName: string; divisions: Array<{ id: number; name: string }> }>;
}
export interface DemoGame {
  date: string; homeTeam: string; awayTeam: string; homeScore: number; awayScore: number;
  eventName: string; division: string; venue: string; gameNumber: string; league: string;
}

const text = (x: string) => x.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&rsquo;/g, "'")
  .replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const MONTHS: Record<string, string> = { january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12" };

export function parseDivision(html: string, eventName: string, division: string, league: string): DemoGame[] {
  const games: DemoGame[] = [];
  let date = "";
  for (const row of html.replace(/<(script|style)\b[\s\S]*?<\/\1>/g, "").matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => text(c[1]));
    const d = cells.length <= 2 && cells[0]?.match(/^[A-Za-z]{3}, ([A-Za-z]+) (\d{1,2}), (\d{4})$/);
    if (d) { date = `${d[3]}-${MONTHS[d[1].toLowerCase()]}-${d[2].padStart(2, "0")}`; continue; }
    // GAME# | | time | home | score | away | location
    if (cells.length >= 7 && /^\d+$/.test(cells[0])) {
      const sc = cells[4].match(/^(\d+)\s*-\s*(\d+)$/);
      if (!sc || !date) continue; // not played yet / no score
      if (date > new Date().toISOString().slice(0, 10)) continue; // pre-entered placeholder score
      games.push({ date, homeTeam: cells[3], awayTeam: cells[5], homeScore: Number(sc[1]), awayScore: Number(sc[2]),
        eventName, division, venue: cells[6], gameNumber: cells[0], league });
    }
  }
  return games;
}

async function main() {
  const leagues: LeagueCfg[] = JSON.parse(fs.readFileSync(path.join(DIR, "leagues.json"), "utf-8"));
  for (const l of leagues) {
    const all: DemoGame[] = [];
    for (const s of l.seasons) {
      for (const div of s.divisions) {
        const url = `https://elements.demosphere-secure.com/${l.orgId}/schedules/${s.season}/${div.id}.html`;
        try {
          const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh)" }, signal: AbortSignal.timeout(30_000) });
          if (res.ok) {
            const g = parseDivision(await res.text(), s.eventName, div.name, l.league);
            all.push(...g);
            console.log(`  ${l.leagueName} ${s.season} ${div.name}: ${g.length} games`);
          } else console.warn(`  HTTP ${res.status} ${url}`);
        } catch (e) { console.warn(`  ${(e as Error).message} ${url}`); }
        await sleep(DELAY_MS);
      }
    }
    const out = path.join(DIR, l.league, "games.json");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(all, null, 1));
    console.log(`Wrote ${out}: ${all.length} games`);
  }
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
