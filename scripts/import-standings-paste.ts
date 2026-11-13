/**
 * Learn full team names ("One Ivy FC BU07 Pink") from GotSport standings pages you copied.
 *
 * GotSport's published schedule names many teams only by their short name ("BU07 Pink"),
 * without the club, so those teams end up club-less ("BU07 Pink #716607"). An event's
 * standings (results) page shows the full names. GotSport's robots.txt disallows automated
 * access, so pages are copied by hand while browsing, and this script reads the copies:
 *
 *   npm run standings:import -- --clip            # clipboard: copied page text (Cmd+A, Cmd+C) or page source
 *   npm run standings:import -- --dir             # every page saved with Cmd+S into data/gotsport-pages/ (.html/.htm/.txt)
 *   npm run standings:import -- --dir <folder>    # …or another folder (macOS may block Terminal from ~/Downloads)
 *   pbpaste | npm run standings:import --         # piped text or HTML
 *   npm run standings:import -- 52852             # re-match data/fixtures/52852-standings-paste.txt
 *   …add --build to rebuild the data afterwards (npm run build:data)
 *
 * The event id is read from the page source (/org_event/events/<id>/…). Copied page text has
 * no links, so give the id for it: `npm run standings:import -- 52852 --clip`.
 *
 * Input, per flight: a "Male U9 - BU9 Black" header, then the standings rows (copied text:
 * "1    Legends FC (CA) SGV BU9    3    2 …"; HTML: the team links in the standings table).
 * Each flight's text is kept in data/fixtures/<event>-standings-paste.txt, and each full name is
 * matched to the flight's short names in data/discovery/games/<event>.json (the full name must
 * end with the short name; only one short name may fit). Results go to
 * data/seed/pasted-team-names.json (GotSport team id → full name), used by the importer
 * (src/lib/import-gotsport-data.ts). Importing the same page twice is harmless.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const argEvent = args.find((a) => /^\d+$/.test(a));
const outFile = path.join(ROOT, "data", "seed", "pasted-team-names.json");
const pasteFileFor = (ev: string) => path.join(ROOT, "data", "fixtures", `${ev}-standings-paste.txt`);
const HEADER = /^(?:Male|Female|Coed)\s+U\d{1,2}\s+-\s+\S/im;

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");

/** Saved page / page source → the same text a copy of the page gives: flight headers + numbered team rows. */
function htmlToText(html: string): string {
  const out: string[] = [];
  // walk flight headers and standings-table team links in page order
  // (saved pages quote attributes with ' , the browser's element view with ")
  const re = /<div class=["']lead no-margin-bottom["']>\s*([^<]+?)\s*<\/div>|<a href=["']\/org_event\/events\/\d+\/schedules\?team=\d+["']>([^<]+)<\/a>/g;
  let n = 0;
  for (const m of html.matchAll(re)) {
    if (m[1]) { out.push("", decode(m[1]).replace(/\s+/g, " ").trim()); n = 0; }
    else if (m[2]) out.push(`${++n}    ${decode(m[2]).replace(/\s+/g, " ").trim()}    0`);
  }
  return out.join("\n").trim();
}

/** One input (clipboard, pipe or file) → { event id, text } */
function readInput(raw: string, label: string): { event: string; text: string } | null {
  const isHtml = /<(?:div|table|html)\b/i.test(raw);
  const event = raw.match(/\/org_event\/events\/(\d+)\//)?.[1] ?? argEvent;
  const text = isHtml ? htmlToText(raw) : raw.trim();
  if (!HEADER.test(text)) { console.warn(`  ${label}: doesn't look like a GotSport standings page (no "Male U12 - …" flight header), skipped`); return null; }
  if (!event) { console.warn(`  ${label}: no event id in it; give one: npm run standings:import -- <eventId> --clip`); return null; }
  return { event, text };
}

/** text is being piped or redirected in (not a terminal, not an empty background stdin) */
function piped() {
  try { const st = fs.fstatSync(0); return st.isFIFO() || st.isFile(); } catch { return false; }
}

const inputs: Array<{ event: string; text: string }> = [];
if (args.includes("--clip")) { const r = readInput(execSync("pbpaste", { encoding: "utf8" }), "clipboard"); if (r) inputs.push(r); }
else if (!args.includes("--dir") && piped()) { const r = readInput(fs.readFileSync(0, "utf8"), "input"); if (r) inputs.push(r); }
const DEFAULT_DIR = path.join(ROOT, "data", "gotsport-pages");
if (args.includes("--dir")) {
  const next = args[args.indexOf("--dir") + 1];
  const dir = next && !next.startsWith("--") && !/^\d+$/.test(next) ? next.replace(/^~(?=\/|$)/, os.homedir()) : DEFAULT_DIR;
  let files: string[] = [];
  try { files = fs.readdirSync(dir); }
  catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") { fs.mkdirSync(dir, { recursive: true }); console.error(`created ${dir}: save GotSport standings pages there (Cmd+S), then run this again`); }
    else if (code === "EPERM" || code === "EACCES") console.error(`macOS won't let Terminal read ${dir}. Save the pages into ${path.relative(ROOT, DEFAULT_DIR)}/ instead and run with just --dir, or allow it: System Settings → Privacy & Security → Files and Folders → Terminal.`);
    else throw e;
    process.exit(1);
  }
  for (const f of files.filter((f) => /\.(html?|txt)$/i.test(f)).sort()) {
    const r = readInput(fs.readFileSync(path.join(dir, f), "utf8"), f);
    if (r) inputs.push(r);
  }
}

// keep each page's text with its event, then (re)match every event touched
const events = new Set<string>(argEvent && !inputs.length ? [argEvent] : []);
for (const { event, text } of inputs) {
  const file = pasteFileFor(event);
  const prior = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (!prior.includes(text)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `\n${text}\n`);
  }
  events.add(event);
}
if (!events.size) { console.error("nothing to import: use --clip, --dir <folder>, pipe a page in, or give an event id"); process.exit(1); }

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const names: Record<string, string> = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, "utf8")) : {};
const before = Object.keys(names).length;

for (const eventId of events) {
  const gamesFile = path.join(ROOT, "data", "discovery", "games", `${eventId}.json`);
  const pasteFile = pasteFileFor(eventId);
  if (!fs.existsSync(gamesFile)) { console.warn(`event ${eventId}: no published games in data/discovery yet (run discovery first); text kept in ${path.relative(ROOT, pasteFile)}`); continue; }

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

  let flight: string | null = null, matched = 0;
  const unmatched = new Set<string>(), seen = new Set<string>();
  for (const raw of fs.readFileSync(pasteFile, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    const header = line.match(/^(?:Male|Female|Coed)\s+U\d{1,2}\s+-\s+(.+)$/i);
    if (header) {
      // "U7 Black" is the end of the published division "U7B U7 Black"
      const want = norm(header[1]);
      flight = [...flights.keys()].find((d) => norm(d).endsWith(want)) ?? null;
      if (!flight) console.warn(`  event ${eventId}: no flight ends with "${header[1]}"`);
      continue;
    }
    const row = line.split(/\t+|\s{2,}/).map((c) => c.trim()).filter(Boolean);
    if (!flight || row.length < 3 || !/^\d+$/.test(row[0]) || /^\d+$/.test(row[1])) continue;
    const full = row[1];
    if (seen.has(`${flight}|${full}`)) continue;
    seen.add(`${flight}|${full}`);
    let shorts = [...flights.get(flight)!].filter(([short]) => norm(full).endsWith(norm(short)));
    // fallback: every word of the short name appears in the full name, and only one short name
    // in the flight fits ("BU09 Arriaga Strikers Costa Mesa" ⊂ "Strikers FC - CM/NB BU09 Arriaga Costa Mesa")
    if (!shorts.length) {
      const words = new Set(norm(full).split(/[\s/-]+/));
      const fits = [...flights.get(flight)!].filter(([short]) => norm(short).split(/[\s/-]+/).every((w) => words.has(w)));
      if (fits.length === 1) shorts = fits;
    }
    // the longest fitting short name wins ("BU07 Pink" over "Pink"); ties are ambiguous
    shorts.sort((a, b) => b[0].length - a[0].length);
    if (shorts.length === 0 || (shorts.length > 1 && shorts[0][0].length === shorts[1][0].length)) { unmatched.add(`${full} (${flight})`); continue; }
    names[String(shorts[0][1])] = full;
    matched++;
  }
  console.log(`event ${eventId}: ${matched} teams named`);
  if (unmatched.size) console.log(`  not matched: ${[...unmatched].join("; ")}`);
}

fs.writeFileSync(outFile, JSON.stringify(names, null, 1) + "\n");
console.log(`${Object.keys(names).length - before} new names → ${path.relative(ROOT, outFile)} (${Object.keys(names).length} total)`);
if (args.includes("--build")) execSync("npm run build:data", { stdio: "inherit" });
