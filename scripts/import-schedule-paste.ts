/**
 * Turn pasted GotSport team schedule pages into data/fixtures/<event>-schedule.tsv.
 *
 * GotSport's robots.txt disallows automated access, so schedules are copied by hand:
 * open a team's schedule page, select all, copy, and paste it into
 * data/fixtures/<event>-schedule-paste.txt (any number of teams, one after another).
 * Each match only needs to appear once: one team per group covers all of its matches.
 *
 *   npx tsx scripts/import-schedule-paste.ts 57894      # then: npm run predict -- 57894
 *
 * Reads blocks like:
 *   Female U15 - U15 Showcase
 *   323    Nov 20, 2026
 *   3:00 PM MST
 *    San Diego Rush Soccer Club GU15 DPL    -     Houston Futsal Soccer Club U15G DPL
 *   Arizona Athletic Grounds - Field 21
 */
import * as fs from "fs";
import * as path from "path";

const eventId = process.argv[2];
if (!eventId) { console.error("usage: npx tsx scripts/import-schedule-paste.ts <eventId>"); process.exit(1); }
const FIX = path.join(process.cwd(), "data", "fixtures");
const pasteFile = path.join(FIX, `${eventId}-schedule-paste.txt`);
const outFile = path.join(FIX, `${eventId}-schedule.tsv`);
if (!fs.existsSync(pasteFile)) { console.error(`paste the schedules into ${pasteFile} first`); process.exit(1); }

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
const lines = fs.readFileSync(pasteFile, "utf8").split(/\r?\n/).map((l) => l.replace(/\s+$/, ""));

interface Row { division: string; match: string; date: string; time: string; field: string; home: string; away: string }
const rows = new Map<string, Row>();
let division = "";
for (let i = 0; i < lines.length; i++) {
  const l = lines[i].trim();
  const div = l.match(/^(?:Female|Male|Girls|Boys)\s+(U\d{1,2})\b/i);
  if (div) { division = div[1].toUpperCase(); continue; }
  const head = l.match(/^(\d+)\s+([A-Z][a-z]{2})[a-z]*\s+(\d{1,2}),\s*(\d{4})$/);
  if (!head) continue;
  const date = `${head[4]}-${MONTHS[head[2].toLowerCase()]}-${head[3].padStart(2, "0")}`;
  // next non-empty lines: time, "home  -  away" (or "home  2 - 1  away"), field
  const next: string[] = [];
  for (let j = i + 1; j < lines.length && next.length < 3; j++) if (lines[j].trim()) next.push(lines[j]);
  const [time, teams, field] = next;
  const parts = (teams ?? "").trim().split(/\s{2,}|\t/).map((s) => s.trim()).filter((s) => s && !/^\d*\s*-\s*\d*$/.test(s));
  if (parts.length < 2 || !division) { console.warn(`skipped match ${head[1]}: couldn't read the teams`); continue; }
  rows.set(head[1], { division, match: head[1], date, time: (time ?? "").trim(), field: (field ?? "").trim(), home: parts[0], away: parts[parts.length - 1] });
}

// keep matches already in the TSV that this paste doesn't have
const existing = fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf8").split("\n").filter((l) => l.trim() && !l.startsWith("#")) : [];
for (const l of existing) {
  const [d, match, date, time, field, home, away] = l.split("\t");
  if (!rows.has(match)) rows.set(match, { division: d, match, date, time, field, home, away });
}
const sorted = [...rows.values()].sort((a, b) => Number(a.match) - Number(b.match));
fs.writeFileSync(outFile,
  `# Event ${eventId} match schedule (from ${path.basename(pasteFile)}).\n# division\tmatch\tdate\ttime (local)\tfield\thome team (as shown)\taway team (as shown)\n` +
  sorted.map((r) => [r.division, r.match, r.date, r.time, r.field, r.home, r.away].join("\t")).join("\n") + "\n");
console.log(`${sorted.length} matches in ${path.relative(process.cwd(), outFile)} (${rows.size - existing.length >= 0 ? rows.size - existing.length : 0} new). Next: npm run predict -- ${eventId}`);
