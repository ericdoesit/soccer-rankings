/**
 * Modular11 public schedules: MLS NEXT, Elite Academy League (EA / EA2), USL Academy.
 *
 * Endpoint (what modular11.com/schedule calls from the browser):
 *   /public_schedule/league/get_matches?tournament=<league id>&age=<age code>&open_page=<n>
 *     &status=all&match_type=2&start_date=…&end_date=…   → HTML rows, 25 per page
 * Age codes come from /public_schedule/league/get-filter-options?UID_league=<id>.
 *
 * Modular11 has no robots.txt; we still go slowly (1.5 s between requests).
 * Only played games with a score are kept. The current season is re-fetched on every
 * run so results stay fresh; finished seasons are fetched once (--refresh to redo).
 *
 * Usage:
 *   npx tsx scripts/scrape-modular11.ts            # current season + any season not yet fetched
 *   npx tsx scripts/scrape-modular11.ts --refresh  # refetch everything
 *
 * Output: data/modular11/games.json
 */
import * as fs from "fs";
import * as path from "path";

const BASE = "https://www.modular11.com/public_schedule/league";
const OUT_DIR = path.join(process.cwd(), "data", "modular11");
const OUT = path.join(OUT_DIR, "games.json");
const DONE = path.join(OUT_DIR, "progress.json");
const DELAY_MS = 1500;

interface Season { label: string; start: string; end: string }
const SEASONS: Season[] = [
  { label: "2025-26", start: "2025-08-01", end: "2026-07-31" },
  { label: "2026-27", start: "2026-08-01", end: "2027-07-31" },
];
/** season that is still being played: always refetched */
const CURRENT = "2026-27";

/**
 * Modular11 league ids (found by probing; see memory note ecnl-data-source).
 * 12 = MLS NEXT through 2025-26 (both divisions); 35 = MLS NEXT Academy Division
 * 2026-27, which as of 2026-11-11 has only a few unscored fixtures: the 2026-27 MLS NEXT
 * regular season (HD and AD) is not on Modular11's public schedule.
 */
const LEAGUES: Array<{ id: number; name: string; seasons: string[] }> = [
  { id: 12, name: "MLS NEXT", seasons: ["2025-26", "2026-27"] },
  { id: 35, name: "MLS NEXT Academy Division", seasons: ["2026-27"] },
  { id: 27, name: "Elite Academy League", seasons: ["2025-26", "2026-27"] },
  { id: 22, name: "USL Academy", seasons: ["2025-26", "2026-27"] },
];

export interface M11Game {
  matchId: string;
  date: string;          // YYYY-MM-DD
  leagueId: number;
  eventName: string;     // "Elite Academy League EA2 2026-27"
  competition: string;   // "EA2", "AD", "League", …
  division: string;      // "SD / OC / IE", "Desert", …
  ageGroup: string;      // as written by Modular11 in that season ("U13")
  gender: "Boys" | "Girls";
  homeTeam: string;      // "ALBION SC San Diego (1) EA2 U13" (club + competition + age)
  awayTeam: string;
  homeClub: string;
  awayClub: string;
  homeAcademyId: number | null;
  awayAcademyId: number | null;
  homeScore: number;
  awayScore: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (soccer-rankings research)", "X-Requested-With": "XMLHttpRequest" } });
      if (res.ok) return await res.text();
      if (attempt >= 3) throw new Error(`HTTP ${res.status} ${url}`);
    } catch (e) {
      if (attempt >= 3) throw e;
    }
    await sleep(DELAY_MS * 4 * attempt);
  }
}

const decode = (s: string) => s.replace(/&nbsp;?/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** Competition label used in team names, so one club's EA and EA2 U13 teams stay apart */
function compLabel(leagueId: number, competition: string): string {
  if (leagueId === 27) return /ea2/i.test(competition) ? "EA2" : "EA";
  if (leagueId === 22) return "USL Academy";
  if (leagueId === 35) return "MLS NEXT AD";
  return /homegrown|\bhd\b/i.test(competition) ? "MLS NEXT HD" : "MLS NEXT";
}

/** Parse the desktop rows of one get_matches page. */
export function parseMatches(html: string, leagueId: number, leagueName: string, season: string): { rows: number; games: M11Game[] } {
  const games: M11Game[] = [];
  const chunks = html.split("<!-- desktop version -->").filter((c) => c.includes("container-first-team"));
  for (const c of chunks) {
    // two layouts: the standard one (col-sm-*) and USL's (col-xs-*, team links)
    const idBlock = c.match(/<div class="col-(?:sm|xs)-1 pad-0[^"]*">\s*(\d+)\s*<br>\s*(MALE|FEMALE)/);
    const when = c.match(/(\d\d)\/(\d\d)\/(\d\d) \d/);
    const age = c.match(/<!--Age-->\s*<div class="[^"]*">\s*(U-?\d+)\s*<\/div>/);
    const comp = c.match(/<!--Competition-->([\s\S]*?)<!--Competition-->[\s\S]*?<!--Division-->([\s\S]*?)<!--Division-->/)
      ?? c.match(/<!-- Bracket -->([\s\S]*?)<br>\s*<!-- Group -->([\s\S]*?)<\/div>/);
    const home = c.match(/container-first-team">[\s\S]*?data-title="([^"]*)"/);
    const away = c.match(/container-second-team">[\s\S]*?data-title="([^"]*)"/);
    const score = c.match(/score-match-table[^>]*>\s*(\d+)&nbsp:&nbsp(\d+)/);
    const logos = [...c.matchAll(/cloudfront\.net\/academy\/(\d+)\//g)].map((m) => Number(m[1]));
    if (!idBlock || !when || !home || !away) continue;
    if (!score) continue; // not played yet ("TBD") or no result posted
    const competition = decode(comp?.[1] ?? "");
    const division = decode(comp?.[2] ?? "");
    const ageGroup = (age?.[1] ?? "").replace("-", "");
    const label = compLabel(leagueId, competition);
    const homeClub = decode(home[1]), awayClub = decode(away[1]);
    games.push({
      matchId: idBlock[1],
      date: `20${when[3]}-${when[1]}-${when[2]}`,
      leagueId,
      eventName: `${leagueName}${leagueId === 27 ? ` ${label}` : ""} ${season}`,
      competition, division, ageGroup,
      gender: idBlock[2] === "FEMALE" ? "Girls" : "Boys",
      homeTeam: `${homeClub} ${label} ${ageGroup}`.trim(),
      awayTeam: `${awayClub} ${label} ${ageGroup}`.trim(),
      homeClub, awayClub,
      homeAcademyId: logos[0] ?? null, awayAcademyId: logos[1] ?? null,
      homeScore: Number(score[1]), awayScore: Number(score[2]),
    });
  }
  return { rows: chunks.length, games };
}

async function ageCodes(leagueId: number, s: Season): Promise<Array<{ value: string; name: string }>> {
  const url = `${BASE}/get-filter-options?UID_league=${leagueId}&match_type=2&start_date=${s.start}+00%3A00%3A00&end_date=${s.end}+23%3A59%3A59&with_steps=1&with_fields=0&with_locations=0`;
  const j = JSON.parse(await get(url)) as { steps?: { ages?: Array<{ value: string; name: string }> } };
  return j.steps?.ages ?? [];
}

function matchesUrl(leagueId: number, age: string, page: number, s: Season) {
  return `${BASE}/get_matches?open_page=${page}&academy=0&tournament=${leagueId}&gender=0&age=${age}&brackets=&groups=&group=&match_number=0` +
    `&status=all&match_type=2&schedule=0&team=0&location=0&as_referee=0&report_status=0&match_status=0` +
    `&start_date=${s.start}+00%3A00%3A00&end_date=${s.end}+23%3A59%3A59`;
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const existing: M11Game[] = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf-8")) : [];
  const done: Record<string, string> = fs.existsSync(DONE) ? JSON.parse(fs.readFileSync(DONE, "utf-8")) : {};
  const byId = new Map(existing.map((g) => [`${g.leagueId}:${g.matchId}`, g]));

  for (const league of LEAGUES) {
    for (const label of league.seasons) {
      const key = `${league.id}:${label}`;
      if (!refresh && label !== CURRENT && done[key]) { console.log(`skip ${league.name} ${label} (fetched ${done[key]})`); continue; }
      const season = SEASONS.find((s) => s.label === label)!;
      const ages = await ageCodes(league.id, season);
      await sleep(DELAY_MS);
      let total = 0;
      for (const age of ages) {
        const seen = new Set<string>();
        // pages are 1-based (open_page=0 returns the same rows as 1)
        for (let page = 1; page < 400; page++) {
          const html = await get(matchesUrl(league.id, age.value, page, season));
          await sleep(DELAY_MS);
          const { rows, games } = parseMatches(html, league.id, league.name, label);
          if (!rows) break;
          // stop if the page repeats (past the last page some endpoints return page 0 again)
          const ids = games.map((g) => g.matchId).join(",");
          if (rows && ids && seen.has(ids)) break;
          seen.add(ids);
          for (const g of games) byId.set(`${g.leagueId}:${g.matchId}`, g);
          total += games.length;
          if (rows < 25) break;
        }
        console.log(`  ${league.name} ${label} ${age.name}: ${total} played so far`);
      }
      done[key] = new Date().toISOString().slice(0, 10);
      fs.writeFileSync(OUT, JSON.stringify([...byId.values()], null, 0));
      fs.writeFileSync(DONE, JSON.stringify(done, null, 1));
      console.log(`${league.name} ${label}: ${total} played games`);
    }
  }
  console.log(`wrote ${OUT}: ${byId.size} games`);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
