/**
 * Games from AthleteOne (TotalGlobalSports) schedule pages the user copied and pasted.
 * AthleteOne's robots.txt blocks automated access, so pages are never fetched: the user
 * pastes a division's schedule text into data/fixtures/athleteone-<eventId>-*.txt.
 *
 *   npx tsx scripts/import-athleteone-paste.ts [--build]
 *
 * - Each game in the paste: date, time, division ("GU8 7v7 (08/01/2018-07/31/2019) - Yellow"),
 *   home, away, venue, game #, type, status, home score, away score.
 * - Event name: the paste's first line ("LA Champions Cup"), with the year of its games.
 * - Teams: data/seed/athleteone-team-map.json maps a pasted name to its GotSport team (its
 *   name as the GotSport importer keys it), so the games join that team's record. Other
 *   teams get the division's birth year ("Tudela FC - U8 Blue G2019"): the birth window
 *   08/01/2018-07/31/2019 is the 2019 age group.
 * - Output: data/athleteone/games.json (all pasted events; re-running replaces by game #).
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();
const FIX = path.join(ROOT, "data", "fixtures");
const OUT = path.join(ROOT, "data", "athleteone", "games.json");
const MAP = path.join(ROOT, "data", "seed", "athleteone-team-map.json");

const map = JSON.parse(fs.readFileSync(MAP, "utf8")) as Record<string, { gotsportTeamId?: number }>;
// GotSport-keyed team names: the snapshot's sourceName for the mapped team id
const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "snapshot.json"), "utf8")) as { teams: Array<{ gotsportTeamId?: number; sourceName?: string }> };
const gsName = new Map(snapshot.teams.filter((t) => t.gotsportTeamId && t.sourceName).map((t) => [t.gotsportTeamId!, t.sourceName!]));

const DATE = /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}$/;
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const iso = (d: string) => { const [m, day, y] = d.replace(",", "").split(" "); return `${y}-${String(MONTHS.indexOf(m.toLowerCase()) + 1).padStart(2, "0")}-${day.padStart(2, "0")}`; };

type Game = { gameNumber: string; date: string; eventName: string; eventId: string; division: string; homeTeam: string; awayTeam: string; homeScore: number; awayScore: number; venue: string; pastedHome: string; pastedAway: string };
const games = new Map<string, Game>();
const unmapped = new Set<string>();

for (const f of fs.readdirSync(FIX).filter((n) => /^athleteone-\d+-.*\.(txt|html?)$/.test(n))) {
  const eventId = f.match(/^athleteone-(\d+)-/)![1];
  let raw = fs.readFileSync(path.join(FIX, f), "utf8");
  // the page's HTML (copied from the browser's inspector) reads the same once tags are removed
  const htmlTitle = raw.match(/class="hero-title">([^<]+)</)?.[1]?.trim();
  if (/<(tr|div|td)\b/i.test(raw)) raw = raw.replace(/<[^>]*>/g, "\n").replace(/&amp;/g, "&");
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const eventTitle = htmlTitle ?? lines[0];
  for (let i = 0; i < lines.length; i++) {
    if (!DATE.test(lines[i])) continue;
    // date, time, division, home, away, venue, game #, type, status, score, score
    const [date, , division, home, away, venue, num, , , s1, s2] = lines.slice(i, i + 11);
    if (!/^\d+$/.test(num ?? "") || !/^\d+$/.test(s1 ?? "") || !/^\d+$/.test(s2 ?? "")) continue;
    const window = division.match(/\(\d{2}\/\d{2}\/(\d{4})-\d{2}\/\d{2}\/(\d{4})\)/);
    const gender = /^\s*G/i.test(division) ? "G" : "B";
    const key = (n: string) => {
      const id = map[n]?.gotsportTeamId;
      if (id && gsName.has(id)) return gsName.get(id)!;
      if (id) unmapped.add(`${n} (GotSport ${id} not in the snapshot)`);
      return window ? `${n} ${gender}${window[2]}` : n;
    };
    const d = iso(date);
    games.set(num, {
      gameNumber: num, date: d, eventName: `${eventTitle} ${d.slice(0, 4)}`, eventId, division,
      homeTeam: key(home), awayTeam: key(away), homeScore: Number(s1), awayScore: Number(s2), venue,
      pastedHome: home, pastedAway: away,
    });
    i += 10;
  }
}

const old: Game[] = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : [];
for (const g of old) if (!games.has(g.gameNumber)) games.set(g.gameNumber, g);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify([...games.values()].sort((a, b) => a.date.localeCompare(b.date) || a.gameNumber.localeCompare(b.gameNumber)), null, 1));
console.log(`${games.size} AthleteOne games → ${path.relative(ROOT, OUT)}`);
for (const u of unmapped) console.log(`  not joined: ${u}`);
if (process.argv.includes("--build")) execSync("npm run build:data", { stdio: "inherit" });
