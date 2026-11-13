/**
 * Which GotSport standings pages to copy next: events ranked by how many West teams in them
 * still have no club (named only "<short name> #<team id>"), with the event's results page.
 * On that page open each flight, press Cmd+A, Cmd+C, run `npm run standings:import -- <event> --clip`.
 * (Our stored division ids are not the results page's ?group= ids, so flight links aren't listed.)
 *
 *   npm run standings:todo            # top 15 events (last 15 months)
 *   npm run standings:todo -- 52852   # one event
 *
 * Reads local files only (data/snapshot.json, data/discovery); makes no web requests.
 */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const only = process.argv.slice(2).find((a) => /^\d+$/.test(a));
const snap = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "snapshot.json"), "utf8")) as {
  teams: Array<{ id: number; region: string; sourceName?: string; gotsportTeamId?: number }>;
};
const clubless = new Set(snap.teams.filter((t) => t.region === "Region4" && /#\d+$/.test(t.sourceName ?? "")).map((t) => t.gotsportTeamId).filter(Boolean));
const named = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, "data", "seed", "pasted-team-names.json"), "utf8"))).map(Number));

const frontier = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "discovery", "frontier.json"), "utf8")).events;
const events: Array<{ id: number | string; name: string; startDate?: string; divisions?: Record<string, unknown> }> =
  Array.isArray(frontier) ? frontier : Object.entries(frontier).map(([id, v]) => ({ id, ...(v as object) })) as never;
const since = new Date(Date.now() - 455 * 864e5).toISOString().slice(0, 10);

const rows: Array<{ id: number; name: string; date: string; missing: number }> = [];
for (const e of events) {
  const id = Number(e.id);
  if (only ? String(id) !== only : (e.startDate ?? "") < since) continue;
  const file = path.join(ROOT, "data", "discovery", "games", `${id}.json`);
  if (!fs.existsSync(file)) continue;
  const ids = new Set<number>();
  for (const g of JSON.parse(fs.readFileSync(file, "utf8")) as Array<{ homeTeamId: number; awayTeamId: number }>) {
    for (const t of [g.homeTeamId, g.awayTeamId]) if (clubless.has(t) && !named.has(t)) ids.add(t);
  }
  if (ids.size) rows.push({ id, name: e.name, date: e.startDate ?? "", missing: ids.size });
}
rows.sort((a, b) => b.missing - a.missing);
for (const r of rows.slice(0, only ? 1 : 15)) {
  console.log(`\n${r.missing} club-less West teams · ${r.name} (${r.date}) · event ${r.id}`);
  console.log(`  https://system.gotsport.com/org_event/events/${r.id}/results`);
}
console.log("\nOn each results page: open a flight, Cmd+A, Cmd+C, then npm run standings:import -- <event> --clip");
