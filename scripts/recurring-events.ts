/**
 * Recurring large events: which tournaments and leagues come back every year, where
 * each one is collected from, when the next edition is due, and whether it's already
 * queued. Run it before a season (or monthly) to see what to re-scrape.
 *
 *   npx tsx scripts/recurring-events.ts            # table, soonest next edition first
 *   npx tsx scripts/recurring-events.ts --min 300  # only series with an edition of 300+ games
 *
 * Writes data/recurring-events.json.
 *
 * GotSport events are picked up by the discovery crawler on its own (daily state
 * search, scripts/discover-west.ts --loop): for those the list only shows whether the
 * next edition is already in its queue. Every other platform needs its scraper re-run,
 * usually with the new edition's event ID added (see `refresh`).
 */
import * as fs from "fs";
import * as path from "path";

const DATA = path.join(process.cwd(), "data");
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const MIN = Number(arg("--min") ?? 300);
const today = new Date().toISOString().slice(0, 10);

interface Edition { platform: string; eventId: string; name: string; first: string; last: string; games: number }
const editions = new Map<string, Edition>();
const read = (f: string): any[] => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : []);
const iso = (d: unknown) => { const s = String(d ?? ""); const m = s.match(/20\d\d-\d\d-\d\d/); if (m) return m[0]; const t = Date.parse(s); return Number.isNaN(t) ? "" : new Date(t).toISOString().slice(0, 10); };

function add(platform: string, eventId: unknown, name: unknown, date: unknown) {
  const n = String(name ?? "").trim();
  if (!n) return;
  const key = `${platform}|${eventId ?? n}`;
  const e = editions.get(key) ?? { platform, eventId: String(eventId ?? ""), name: n, first: "", last: "", games: 0 };
  const d = iso(date);
  e.games++;
  if (d && (!e.first || d < e.first)) e.first = d;
  if (d && d > e.last) e.last = d;
  editions.set(key, e);
}

// GotSport (crawler output + the older rankings-API pull)
const gsDir = path.join(DATA, "discovery", "games");
if (fs.existsSync(gsDir)) for (const f of fs.readdirSync(gsDir)) for (const g of read(path.join(gsDir, f))) add("gotsport", g.eventId, g.eventName, g.date);
for (const g of read(path.join(DATA, "rankings-api", "games.json"))) add("gotsport", g.eventId, g.eventName, g.date);
for (const g of read(path.join(DATA, "surfcup", "games.json"))) add("surfcup", g.eventId, g.eventName, g.date);
for (const g of read(path.join(DATA, "ecnl", "games.json"))) add("ecnl", g.eventId, g.eventName, g.date);
for (const g of read(path.join(DATA, "modular11", "games.json"))) add("modular11", g.leagueId, g.eventName, g.date);
for (const g of read(path.join(DATA, "mlsnext", "games.json"))) add("mlsnext", null, g.tournament, g.date);
for (const g of read(path.join(DATA, "adidas-cup", "games.json"))) add("adidas-cup", null, g.tournament, g.date);
for (const g of read(path.join(DATA, "coast-soccer", "games.json"))) add("coast-soccer", g.season, `Coast Soccer League ${g.season}`, g.date);
const demoDir = path.join(DATA, "demosphere");
if (fs.existsSync(demoDir)) for (const d of fs.readdirSync(demoDir, { withFileTypes: true })) if (d.isDirectory())
  for (const g of read(path.join(demoDir, d.name, "games.json"))) add(`demosphere:${d.name}`, g.eventId, g.eventName, g.date);

const REFRESH: Record<string, string> = {
  gotsport: "automatic: discovery crawler (scripts/discover-west.ts --loop) finds new editions in its daily state search",
  surfcup: "add the new event ID to KNOWN_EVENTS in scripts/scrape-surfcup.ts, then npx tsx scripts/scrape-surfcup.ts --event <id>",
  ecnl: "user-run: npm run scrape:ecnl (new season: check the event dropdowns on theecnl.com schedule pages)",
  modular11: "npx tsx scripts/scrape-modular11.ts (add the new season's league id)",
  mlsnext: "npx tsx scripts/scrape-mlsnext.ts",
  "adidas-cup": "npx tsx scripts/scrape-mlsnext.ts (Generation adidas Cup)",
  "coast-soccer": "add the season to SEASONS in scripts/scrape-coast-soccer.ts, then run it",
};

// Series: the name without years, edition numbers and season labels
const seriesKey = (n: string) => n.toLowerCase()
  .replace(/presented by.*$/, "")
  .replace(/\b(19|20)\d\d\b|'\d\d\b|\b\d\d[-/]\d\d\b|\b\d+(st|nd|rd|th)\b|\b(fall|spring|summer|winter)\b|\bseason\b|\bannual\b/g, " ")
  .replace(/[^a-z]+/g, " ").trim();

const series = new Map<string, Edition[]>();
for (const e of editions.values()) {
  const k = `${e.platform.split(":")[0]}|${seriesKey(e.name)}`;
  series.set(k, [...(series.get(k) ?? []), e]);
}

// GotSport events already queued in the crawler (upcoming editions)
const frontier = (() => { try { return Object.values(JSON.parse(fs.readFileSync(path.join(DATA, "discovery", "frontier.json"), "utf8")).events) as any[]; } catch { return []; } })();
const queuedBySeries = new Map<string, any[]>();
for (const ev of frontier) {
  if (!ev.name) continue;
  const k = `gotsport|${seriesKey(ev.name)}`;
  queuedBySeries.set(k, [...(queuedBySeries.get(k) ?? []), ev]);
}

const addYear = (d: string) => (d ? `${Number(d.slice(0, 4)) + 1}${d.slice(4)}` : "");
const out = [];
for (const [k, eds] of series) {
  const dated = eds.filter((e) => e.last).sort((a, b) => a.first.localeCompare(b.first));
  if (!dated.length) continue;
  const biggest = Math.max(...eds.map((e) => e.games));
  if (biggest < MIN) continue;
  const latest = dated[dated.length - 1];
  const platform = k.split("|")[0];
  const recurring = dated.length >= 2 || /\b20\d\d\b|\d\d[-/]\d\d/.test(latest.name);
  if (!recurring) continue;
  // the latest edition is still running (a league season, or a tournament in progress)
  const running = latest.last >= new Date(Date.now() - 21 * 864e5).toISOString().slice(0, 10);
  const next = running ? "" : addYear(latest.first);
  const queued = (queuedBySeries.get(k) ?? []).filter((ev) => ev.startDate && ev.startDate > latest.last)
    .map((ev) => ({ id: ev.id, name: ev.name, start: ev.startDate, status: ev.status }));
  out.push({
    series: latest.name, platform, editions: dated.length, biggestEdition: biggest,
    latest: { eventId: latest.eventId, name: latest.name, first: latest.first, last: latest.last, games: latest.games },
    status: running ? "in progress" : queued.length ? "next edition queued" : next < today ? "next edition overdue — look for it" : "next edition not listed yet",
    nextExpected: next, queued,
    refresh: REFRESH[platform] ?? (platform.startsWith("demosphere") ? "npx tsx scripts/scrape-demosphere-league.ts (see SCRAPING.md)" : ""),
  });
}
out.sort((a, b) => (a.nextExpected || "0").localeCompare(b.nextExpected || "0") || b.biggestEdition - a.biggestEdition);
fs.writeFileSync(path.join(DATA, "recurring-events.json"), JSON.stringify(out, null, 2) + "\n");

const pad = (s: unknown, n: number) => String(s).slice(0, n).padEnd(n);
console.log(`${out.length} recurring series with an edition of ${MIN}+ games (wrote data/recurring-events.json)\n`);
console.log(`${pad("next due", 11)} ${pad("platform", 12)} ${pad("latest edition", 58)} ${pad("dates", 23)} ${pad("games", 6)} status`);
for (const r of out) {
  console.log(`${pad(r.nextExpected || "running", 11)} ${pad(r.platform, 12)} ${pad(r.latest.name, 58)} ${pad(`${r.latest.first}→${r.latest.last}`, 23)} ${pad(r.latest.games, 6)} ${r.status}${r.queued.length ? ` (${r.queued.map((q) => `#${q.id} ${q.start}`).join(", ")})` : ""}`);
}
