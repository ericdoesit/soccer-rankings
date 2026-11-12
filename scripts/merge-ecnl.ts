/**
 * Merge single-event ECNL pulls back into data/ecnl.
 *
 * `npm run scrape:ecnl -- --event <id>` REPLACES data/ecnl with that one event, so a
 * single-event fetch is: back up data/ecnl, run the event, save it, restore, merge:
 *
 *   cp -R data/ecnl data/ecnl-full
 *   npm run scrape:ecnl -- --event 4354 && cp -R data/ecnl data/ecnl-event-4354
 *   cp -R data/ecnl-full/. data/ecnl/ && rm -rf data/ecnl-full
 *   npm run ecnl:merge -- data/ecnl-event-4354      # merges, then deletes the folder
 *
 * Rows are de-duplicated by matchId (games), eventId:teamId (teams), clubId (clubs,
 * league / gender lists are combined) and eventId:division:flight:teamId (standings).
 */
import * as fs from "fs";
import * as path from "path";

const OUT = path.join(process.cwd(), "data", "ecnl");
const srcs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const keep = process.argv.includes("--keep");
if (!srcs.length) { console.error("usage: npm run ecnl:merge -- <folder> [<folder> …] [--keep]"); process.exit(1); }

type Row = Record<string, any>;
const KEYS: Record<string, (r: Row) => string> = {
  games: (r) => String(r.matchId),
  teams: (r) => `${r.eventId}:${r.teamId}`,
  clubs: (r) => String(r.clubId),
  standings: (r) => `${r.eventId}:${r.division}:${r.flight}:${r.teamId}`,
};
const read = (f: string): Row[] => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : []);

for (const [name, key] of Object.entries(KEYS)) {
  const m = new Map<string, Row>();
  const before = read(path.join(OUT, `${name}.json`));
  for (const dir of [OUT, ...srcs]) for (const r of read(path.join(dir, `${name}.json`))) {
    const k = key(r), prev = m.get(k);
    if (!prev) { m.set(k, r); continue; }
    if (name === "clubs") {
      prev.leagues = [...new Set([...(prev.leagues ?? []), ...(r.leagues ?? [])])];
      prev.genders = [...new Set([...(prev.genders ?? []), ...(r.genders ?? [])])];
    }
  }
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify([...m.values()], null, 2) + "\n");
  console.log(`${name}: ${before.length} → ${m.size}`);
}
if (!keep) for (const d of srcs) fs.rmSync(d, { recursive: true, force: true });
console.log(keep ? "Merged (source folders kept)." : "Merged; source folders removed. Next: npm run rebuild");
