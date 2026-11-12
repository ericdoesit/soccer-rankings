/**
 * Upcoming major events in the West for the next 6 months → data/upcoming-events.json
 * (the website's /events calendar).
 *
 * An event is listed when it's in a West state and either
 *   - is a tracked competition by name (State Cup, championships, DPL / GA / ECNL events …), or
 *   - its previous edition had 300+ games (data/recurring-events.json, `npm run check:events`), or
 *   - it has predictions (data/predictions/<id>.json).
 * Event dates come from the GotSport crawler's queue (data/discovery/frontier.json) and from
 * data/fixtures/<id>-event.json for events entered by hand.
 *
 *   npx tsx scripts/upcoming-events.ts [--months 6]
 */
import * as fs from "fs";
import * as path from "path";
import { trackedByName } from "../src/lib/directory/tracked";
import { WEST_STATES } from "../src/lib/directory/geo";

const DATA = path.join(process.cwd(), "data");
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const months = Number(arg("--months") ?? 6);
const today = new Date().toISOString().slice(0, 10);
const until = new Date(Date.now() + months * 30.5 * 864e5).toISOString().slice(0, 10);
const read = <T>(f: string, fb: T): T => { try { return JSON.parse(fs.readFileSync(f, "utf8")) as T; } catch { return fb; } };
const west = new Set<string>(WEST_STATES);

// same series key as scripts/recurring-events.ts
const seriesKey = (n: string) => n.toLowerCase()
  .replace(/presented by.*$/, "")
  .replace(/\b(19|20)\d\d\b|'\d\d\b|\b\d\d[-/]\d\d\b|\b\d+(st|nd|rd|th)\b|\b(fall|spring|summer|winter)\b|\bseason\b|\bannual\b/g, " ")
  .replace(/[^a-z]+/g, " ").trim();
const lastEdition = new Map<string, number>();
for (const r of read<Array<{ platform: string; series: string; biggestEdition: number }>>(path.join(DATA, "recurring-events.json"), []))
  if (r.platform === "gotsport") lastEdition.set(seriesKey(r.series), r.biggestEdition);

const predictions = new Set(fs.existsSync(path.join(DATA, "predictions"))
  ? fs.readdirSync(path.join(DATA, "predictions")).filter((f) => f.endsWith(".json")).map((f) => Number(f.replace(".json", ""))) : []);

interface Upcoming { id: number; name: string; start: string; end: string | null; city: string | null; state: string; kind: string; lastEditionGames: number | null; predictions: boolean }
const out = new Map<number, Upcoming>();

const NOT_MAJOR = /\b(futsal|recreational|all ?star|tryouts?|jamboree|3v3)\b/i;
const frontier = read<{ events: Record<string, { id: number; name?: string; startDate?: string; endDate?: string; city?: string; state: string; league?: boolean; status: string }> }>(path.join(DATA, "discovery", "frontier.json"), { events: {} });
for (const e of Object.values(frontier.events)) {
  if (!e.name || !e.startDate || e.startDate < today || e.startDate > until || e.league) continue;
  if (!west.has(e.state) || e.status === "skipped" || NOT_MAJOR.test(e.name)) continue;
  const tracked = trackedByName(e.name);
  const prev = lastEdition.get(seriesKey(e.name)) ?? null;
  if (!tracked && (prev ?? 0) < 300 && !predictions.has(e.id)) continue;
  out.set(e.id, { id: e.id, name: e.name, start: e.startDate, end: e.endDate ?? null, city: e.city ?? null, state: e.state,
    kind: tracked ?? "Tournament", lastEditionGames: prev, predictions: predictions.has(e.id) });
}
// hand-entered events (data/fixtures/<id>-event.json)
const fix = path.join(DATA, "fixtures");
if (fs.existsSync(fix)) for (const f of fs.readdirSync(fix).filter((f) => f.endsWith("-event.json"))) {
  const m = read<{ id: number; name: string; fullName?: string; start?: string; end?: string; city?: string; state: string } | null>(path.join(fix, f), null);
  if (!m?.start || m.start > until || (m.end ?? m.start) < today) continue;
  const prev = out.get(m.id);
  out.set(m.id, { id: m.id, name: m.fullName ?? m.name, start: m.start, end: m.end ?? null, city: m.city ?? null, state: m.state,
    kind: prev?.kind ?? trackedByName(m.fullName ?? m.name) ?? "Tournament", lastEditionGames: prev?.lastEditionGames ?? null, predictions: predictions.has(m.id) });
}

const list = [...out.values()].sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
fs.writeFileSync(path.join(DATA, "upcoming-events.json"), JSON.stringify({ generatedAt: new Date().toISOString(), from: today, until, events: list }, null, 2) + "\n");
console.log(`${list.length} upcoming major West events ${today} → ${until} (${list.filter((e) => e.predictions).length} with predictions) → data/upcoming-events.json`);
