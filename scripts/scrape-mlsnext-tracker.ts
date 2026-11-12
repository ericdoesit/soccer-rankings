/**
 * MLS NEXT 2026-27 (Homegrown + Academy Division) games and fixtures from mlsnexttracker.com.
 *
 * Why this source: the 2026-27 MLS NEXT season isn't on Modular11's public schedule (the
 * league moved platforms), and mlssoccer.com only publishes standings tables. MLS NEXT
 * Tracker, an independent site, republishes the league's public schedule; its robots.txt
 * allows everything including /api/*. It's a one-person site that pays for its traffic,
 * so this script is deliberately light:
 *   - one request per conference + age group: /api/standings?team=<slug>&division=<d>
 *     returns that team's whole conference schedule (played and upcoming) plus its Flex
 *     group, so every other team in that schedule is skipped;
 *   - 3 s between requests, one pass, no retries beyond one; run it at most daily.
 *
 * Team slugs come from the site's sitemap (/academy/<slug>, /homegrown/<slug>).
 *
 * Output: data/mlsnext-tracker/games.json, one row per game (completed and upcoming).
 * Team names follow the Modular11 convention ("<club> MLS NEXT U15") so this season joins
 * last season's Modular11 history; the club spelling is taken from Modular11 when the
 * names match ignoring case ("Albion SC Los Angeles" → "ALBION SC Los Angeles").
 *
 *   npx tsx scripts/scrape-mlsnext-tracker.ts            # both divisions
 *   npx tsx scripts/scrape-mlsnext-tracker.ts --division homegrown
 */
import * as fs from "fs";
import * as path from "path";

const SITE = "https://mlsnexttracker.com";
const OUT_DIR = path.join(process.cwd(), "data", "mlsnext-tracker");
const OUT = path.join(OUT_DIR, "games.json");
const DELAY_MS = 3000;
const UA = "soccer-rankings research (youth soccer ratings; low volume, once a day)";
const SEASON = "2026-27";

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const DIVISIONS = (arg("--division") ? [arg("--division")!] : ["homegrown", "academy"]) as Array<"homegrown" | "academy">;
const DIV_NAME = { homegrown: "Homegrown Division", academy: "Academy Division" } as const;

export interface TrackerGame {
  matchId: number;
  gameKey: string;
  date: string;            // local date, YYYY-MM-DD
  startTime: string;       // ISO UTC
  eventName: string;       // "MLS NEXT 2026-27 Homegrown Division" | "MLS NEXT Flex 2026-27"
  division: "homegrown" | "academy";
  conference: string;      // "Southwest"; Flex group for Flex games
  ageGroup: string;        // "U15"
  gender: "Boys";
  homeClub: string;
  awayClub: string;
  homeTeam: string;        // "ALBION SC Los Angeles MLS NEXT U19"
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  completed: boolean;
  location: string | null;
  proPathway: boolean;
  flex: boolean;
}

interface ApiGame {
  id: number; gameKey: string; startTime: string; timezone: string; completed: boolean;
  home: string; away: string; homeScore: number | null; awayScore: number | null;
  location: string | null; proPathway: boolean; flex: boolean;
}
interface ApiResponse {
  team: { slug: string; name: string; ageGroup: string; conference: string };
  schedule: ApiGame[];
  flex: { group: string; schedule: ApiGame[] } | null;
}

/** Kitman spelling → last season's Modular11 spelling, for clubs whose name changed */
const RENAMED: Record<string, string> = {
  "Red Bull New York": "New York Red Bulls",
  "Charlotte Independence Soccer Club": "Charlotte Independence",
  "City SC - San Diego": "City SC San Diego",
  "FC Golden State Force": "FC Golden State",
  "Los Angeles Bulls Soccer Club": "LA Bulls",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function localDate(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  } catch { return iso.slice(0, 10); }
}

/** Modular11 club spellings, so this season's teams join last season's */
function modularClubNames(): Map<string, string> {
  const f = path.join(process.cwd(), "data", "modular11", "games.json");
  const out = new Map<string, string>();
  if (!fs.existsSync(f)) return out;
  for (const g of JSON.parse(fs.readFileSync(f, "utf8")) as Array<{ leagueId: number; homeClub?: string; awayClub?: string }>) {
    if (g.leagueId !== 12 && g.leagueId !== 35) continue;
    for (const c of [g.homeClub, g.awayClub]) if (c) out.set(c.trim().toLowerCase(), c.trim());
  }
  return out;
}

async function get<T>(url: string): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (res.ok) return (await res.json()) as T;
      console.warn(`  ${res.status} ${url}`);
      if (res.status === 404) return null;
    } catch (e) { console.warn(`  ${(e as Error).message} ${url}`); }
    await sleep(DELAY_MS * 3);
  }
  return null;
}

async function main() {
  const sitemap = await (await fetch(`${SITE}/sitemap.xml`, { headers: { "User-Agent": UA } })).text();
  const m11 = modularClubNames();
  const clubName = (n: string) => { const k = RENAMED[n.trim()] ?? n.trim(); return m11.get(k.toLowerCase()) ?? k; };
  const games = new Map<number, TrackerGame>();
  let requests = 0;
  const unmatchedClubs = new Set<string>();

  for (const division of DIVISIONS) {
    const slugs = [...sitemap.matchAll(new RegExp(`<loc>${SITE}/${division}/([a-z0-9-]+-u\\d\\d)</loc>`, "g"))].map((m) => m[1]);
    const covered = new Set<string>();
    console.log(`\n${DIV_NAME[division]}: ${slugs.length} teams in sitemap`);
    for (const slug of slugs) {
      if (covered.has(slug)) continue;
      await sleep(DELAY_MS);
      requests++;
      const d = await get<ApiResponse>(`${SITE}/api/standings?team=${encodeURIComponent(slug)}&division=${division}`);
      covered.add(slug);
      if (!d?.team) continue;
      const age = d.team.ageGroup;
      const add = (list: ApiGame[], flex: boolean, group: string) => {
        for (const g of list) {
          covered.add(`${slugify(g.home)}-${age.toLowerCase()}`);
          covered.add(`${slugify(g.away)}-${age.toLowerCase()}`);
          if (games.has(g.id)) continue;
          const hc = clubName(g.home), ac = clubName(g.away);
          for (const [raw, c] of [[g.home, hc], [g.away, ac]]) if (!m11.has(c.toLowerCase())) unmatchedClubs.add(raw.trim());
          games.set(g.id, {
            matchId: g.id, gameKey: g.gameKey, date: localDate(g.startTime, g.timezone), startTime: g.startTime,
            eventName: flex ? `MLS NEXT Flex ${SEASON}` : `MLS NEXT ${SEASON} ${DIV_NAME[division]}`,
            division, conference: group, ageGroup: age, gender: "Boys",
            homeClub: hc, awayClub: ac, homeTeam: `${hc} MLS NEXT ${age}`, awayTeam: `${ac} MLS NEXT ${age}`,
            homeScore: g.completed ? g.homeScore : null, awayScore: g.completed ? g.awayScore : null,
            completed: g.completed && g.homeScore != null && g.awayScore != null,
            location: g.location ?? null, proPathway: !!g.proPathway, flex,
          });
        }
      };
      add(d.schedule ?? [], false, d.team.conference);
      if (d.flex?.schedule) add(d.flex.schedule, true, d.flex.group);
      const left = slugs.filter((s) => !covered.has(s)).length;
      console.log(`  ${age} ${d.team.conference.padEnd(18)} via ${slug} → ${games.size} games so far, ${left} teams left`);
    }
  }

  // a one-division run keeps the other division's rows from the last run
  if (fs.existsSync(OUT)) for (const g of JSON.parse(fs.readFileSync(OUT, "utf8")) as TrackerGame[])
    if (!DIVISIONS.includes(g.division) && !games.has(g.matchId)) games.set(g.matchId, g);
  const list = [...games.values()].sort((a, b) => a.date.localeCompare(b.date) || a.matchId - b.matchId);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(list, null, 1) + "\n");
  const done = list.filter((g) => g.completed).length;
  console.log(`\n${requests} requests · ${list.length} games (${done} played, ${list.length - done} upcoming) → ${path.relative(process.cwd(), OUT)}`);
  if (unmatchedClubs.size) console.log(`${unmatchedClubs.size} clubs not in last season's Modular11 data (new to MLS NEXT or renamed): ${[...unmatchedClubs].slice(0, 30).join(", ")}${unmatchedClubs.size > 30 ? " …" : ""}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
