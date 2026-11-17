/**
 * Games from SincSports league schedules, saved as text in data/fixtures/sincsports-<TID>.txt
 * (read in the browser at the user's request; SincSports's robots.txt allows schedule pages but
 * plain requests get a bot check, so nothing is fetched here).
 *
 *   npx tsx scripts/import-sincsports-paste.ts
 *
 * Fixture format: "@team <id>\t<U##>\t<name>" lines, then "MM-DD game# F|- homeId:score awayId:score"
 * (ids without the "CAM" prefix; no score = not played yet).
 * - Teams are named "<club/team> B<birth year>" from the division's age group (2026-27 school-year
 *   groups: U13 = 2014), so a team keeps its name next season.
 * - "@same <id>\t<name>" joins a team to one already in the data (its name as the importer keys it,
 *   e.g. a Coast Soccer League or GotSport team), so its games add to that team's record.
 * - Forfeits and unplayed games are skipped: they aren't results.
 * - Output: data/sincsports/games.json, with state "CAS" (Southern California leagues).
 */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const FIX = path.join(ROOT, "data", "fixtures");
const OUT = path.join(ROOT, "data", "sincsports", "games.json");
const EVENTS: Record<string, { name: string; year: number; season: number; state: string }> = {
  PACRSL: { name: "Pacific Regional Soccer League 2026", year: 2026, season: 2027, state: "CAS" },
};

/** "Inter United FC U10 White (2016/17)" in U10 → "Inter United FC White B2017" */
function teamName(raw: string, age: string, season: number): string {
  const birth = season - Number(age.slice(1));
  const base = raw
    .replace(/\|/g, " ")
    .replace(/\(\s*B?\d{4}(\/\d{2,4})?\s*\)/gi, " ")
    .replace(/\bB?\d{4}(\/\d{2,4})?\b/gi, " ")
    .replace(/\bB\d{2}\/\d{2}\b/gi, " ")
    .replace(/\bB?U\d{1,2}\b/gi, " ")
    .replace(/\s+/g, " ").trim();
  return `${base} B${birth}`;
}

const games: object[] = [];
for (const f of fs.readdirSync(FIX).filter((n) => /^sincsports-[A-Z0-9]+\.txt$/.test(n))) {
  const tid = f.match(/^sincsports-([A-Z0-9]+)\.txt$/)![1];
  const ev = EVENTS[tid];
  if (!ev) { console.warn(`skip ${f}: add ${tid} to EVENTS`); continue; }
  const teams = new Map<string, string>();
  const same = new Map<string, string>();
  let skipped = 0;
  for (const line of fs.readFileSync(path.join(FIX, f), "utf8").split("\n")) {
    if (line.startsWith("@team ")) {
      const [id, age, name] = line.slice(6).split("\t");
      teams.set(id.replace(/^CAM/, ""), teamName(name, age, ev.season));
      continue;
    }
    if (line.startsWith("@same ")) {
      const [id, name] = line.slice(6).split("\t");
      same.set(id.replace(/^CAM/, ""), name.trim());
      continue;
    }
    const m = line.match(/^(\d{2})-(\d{1,2}) (\d+) ([F-]) (\w+):(\d*) (\w+):(\d*)$/);
    if (!m) continue;
    const [, mm, dd, num, flag, h, hs, a, as] = m;
    if (flag === "F" || hs === "" || as === "") { skipped++; continue; }
    if (!teams.has(h) || !teams.has(a)) throw new Error(`${f} game ${num}: unknown team`);
    for (const [id, name] of same) teams.set(id, name);
    games.push({
      gameNumber: `${tid}-${num}`, date: `${ev.year}-${mm}-${dd.padStart(2, "0")}`, eventName: ev.name, state: ev.state,
      homeTeam: teams.get(h), awayTeam: teams.get(a), homeScore: Number(hs), awayScore: Number(as),
    });
  }
  console.log(`${tid}: ${teams.size} teams, ${games.length} games (${skipped} forfeits/unplayed skipped)`);
  console.log([...new Set(teams.values())].join(" | "));
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(games, null, 1));
