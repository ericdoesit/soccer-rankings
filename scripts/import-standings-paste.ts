/**
 * Learn full team names ("One Ivy FC BU07 Pink") from pasted GotSport standings.
 *
 * GotSport's published schedule names many teams only by their short name ("BU07 Pink"),
 * without the club, so those teams end up club-less ("BU07 Pink #716607"). An event's
 * standings page shows the full names. GotSport's robots.txt disallows automated access, so
 * standings are copied by hand: open the event's standings/brackets, select all, copy, and
 * paste into data/fixtures/<event>-standings-paste.txt (any number of flights, one after
 * another). Then:
 *
 *   npx tsx scripts/import-standings-paste.ts 52852     # then: npm run build:data
 *
 * Reads blocks like:
 *   Male U7 - U7 Black
 *   1    One Ivy FC BU07 Pink    4    4    0    0    14    7    11    12
 * and matches each full name to the flight's short names in data/discovery/games/<event>.json
 * (the full name must end with the short name, and only one short name may fit).
 * Writes data/seed/pasted-team-names.json (GotSport team id → full name), merged with
 * earlier events; the importer (src/lib/import-gotsport-data.ts) uses it to name teams.
 */
import * as fs from "fs";
import * as path from "path";

const eventId = process.argv[2];
if (!eventId) { console.error("usage: npx tsx scripts/import-standings-paste.ts <eventId>"); process.exit(1); }
const ROOT = process.cwd();
const pasteFile = path.join(ROOT, "data", "fixtures", `${eventId}-standings-paste.txt`);
const gamesFile = path.join(ROOT, "data", "discovery", "games", `${eventId}.json`);
const outFile = path.join(ROOT, "data", "seed", "pasted-team-names.json");
for (const f of [pasteFile, gamesFile]) if (!fs.existsSync(f)) { console.error(`missing ${path.relative(ROOT, f)}`); process.exit(1); }

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

// short names per flight, from the event's published games
type G = { division?: string; homeTeam: string; awayTeam: string; homeTeamId: number; awayTeamId: number };
const flights = new Map<string, Map<string, number>>(); // division → short name → team id
for (const g of JSON.parse(fs.readFileSync(gamesFile, "utf8")) as G[]) {
  if (!g.division) continue;
  const m = flights.get(g.division) ?? new Map<string, number>();
  if (g.homeTeamId) m.set(g.homeTeam.trim(), g.homeTeamId);
  if (g.awayTeamId) m.set(g.awayTeam.trim(), g.awayTeamId);
  flights.set(g.division, m);
}

// pasted standings: "Male U7 - U7 Black" headers, then numbered team rows
const names: Record<string, string> = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, "utf8")) : {};
let flight: string | null = null, matched = 0, unmatched: string[] = [];
for (const raw of fs.readFileSync(pasteFile, "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  const header = line.match(/^(?:Male|Female|Coed)\s+U\d{1,2}\s+-\s+(.+)$/i);
  if (header) {
    // "U7 Black" is the end of the published division "U7B U7 Black"
    const want = norm(header[1]);
    flight = [...flights.keys()].find((d) => norm(d).endsWith(want)) ?? null;
    if (!flight) console.warn(`  no flight in event ${eventId} ends with "${header[1]}"`);
    continue;
  }
  const row = line.split(/\t+|\s{2,}/).map((c) => c.trim()).filter(Boolean);
  if (!flight || row.length < 4 || !/^\d+$/.test(row[0]) || /^\d+$/.test(row[1])) continue;
  const full = row[1];
  const shorts = [...flights.get(flight)!].filter(([short]) => norm(full).endsWith(norm(short)));
  // the longest fitting short name wins ("BU07 Pink" over "Pink"); ties are ambiguous
  shorts.sort((a, b) => b[0].length - a[0].length);
  if (shorts.length === 0 || (shorts.length > 1 && shorts[0][0].length === shorts[1][0].length)) { unmatched.push(`${full} (${flight})`); continue; }
  names[String(shorts[0][1])] = full;
  matched++;
}
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(names, null, 1) + "\n");
console.log(`${matched} teams named from event ${eventId} → ${path.relative(ROOT, outFile)} (${Object.keys(names).length} total)`);
if (unmatched.length) console.log(`  not matched: ${unmatched.join("; ")}`);
