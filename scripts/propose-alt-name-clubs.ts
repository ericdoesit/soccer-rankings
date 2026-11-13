/**
 * Proposals (not applied): clubs for West teams GotSport lists without one, from the other
 * names the same GotSport team used at other events ("B2016 LB Payeras" was also entered as
 * "Beach FC B2016 LB Payeras" → Beach Futbol Club).
 *
 *   npx tsx scripts/propose-alt-name-clubs.ts      → data/review/alt-name-club-proposals.json
 *
 * Each alternate name's leading words (up to 6, longest first) are looked up among GotSport
 * directory clubs (normalized: "Beach F.C." = "Beach Futbol Club"). Confidence:
 *   high   – the club's name has 2+ words and the club is in the team's state
 *   medium – a 1-word club name, or the club is in another state
 *   conflict – the team's names point to different clubs (nothing proposed)
 * The proposed name is the club + the team's current label (the other name only finds the club).
 * Reads local files only.
 */
import fs from "fs";
import path from "path";
import { normalizeClubName, standardizeAbbreviations } from "../src/lib/directory/normalize";
import { formatTeamName } from "../src/lib/directory/team-names";

const ROOT = process.cwd();
type Team = { id: number; name: string; club: string; state: string; region: string; ageGroup: string; gender: string; sourceName?: string; gotsportTeamId?: number; clubVerified?: boolean; rankable?: boolean };
const snap = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "snapshot.json"), "utf8")) as { teams: Team[] };
const dir = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "gotsport-teams", "region4.json"), "utf8")) as Array<{ clubName: string; association: string }>;
const disc = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "discovery", "teams.json"), "utf8"));
const discovered = new Map<number, { names: string[] }>(
  (Array.isArray(disc) ? disc : Object.values(disc) as Array<{ teamId: number; names: string[] }>).map((x: { teamId: number; names: string[] }) => [x.teamId, x]));

// directory clubs by normalized name → { name, association, teams }
const clubs = new Map<string, Array<{ name: string; association: string; n: number }>>();
const counts = new Map<string, number>();
for (const d of dir) counts.set(`${d.clubName.trim()}\u0000${d.association}`, (counts.get(`${d.clubName.trim()}\u0000${d.association}`) ?? 0) + 1);
for (const [k, n] of counts) {
  const [name, association] = k.split("\u0000");
  const key = normalizeClubName(name);
  if (key.length < 4) continue;
  clubs.set(key, [...(clubs.get(key) ?? []), { name, association, n }]);
}

const sameState = (team: string, club: string) => team === club || (team.startsWith("CA") && club.startsWith("CA"));
type Proposal = {
  teamId: number; team: string; current: string; state: string; age: string; gender: string; ranked: boolean;
  via: string; club: string | null; clubState: string | null; confidence: "high" | "medium" | "conflict"; candidates?: string[];
  /** display name the team would get: the full name it used elsewhere, formatted with the club */
  newName?: string;
};
const proposals: Proposal[] = [];
for (const t of snap.teams) {
  if (t.region !== "Region4" || t.clubVerified || !t.gotsportTeamId || !/#\d+$/.test(t.sourceName ?? "")) continue;
  const names = discovered.get(t.gotsportTeamId)?.names ?? [];
  const short = (t.sourceName ?? "").replace(/\s*#\d+$/, "").trim().toLowerCase();
  const hits = new Map<string, { club: { name: string; association: string }; via: string; words: number }>();
  for (const alt of names) {
    if (alt.trim().toLowerCase() === short) continue;
    const words = alt.replace(/\s*#\d+$/, "").split(/\s+/);
    for (let k = Math.min(6, words.length - 1); k >= 1; k--) {
      const cands = clubs.get(normalizeClubName(words.slice(0, k).join(" ")));
      if (!cands) continue;
      // prefer the club in the team's state, then the biggest
      const best = [...cands].sort((a, b) => Number(sameState(t.state, b.association)) - Number(sameState(t.state, a.association)) || b.n - a.n)[0];
      const prev = hits.get(best.name);
      if (!prev || k > prev.words) hits.set(best.name, { club: best, via: alt, words: normalizeClubName(best.name).split(" ").length });
      break;
    }
  }
  if (!hits.size) continue;
  const base = { teamId: t.id, team: t.name, current: t.club, state: t.state, age: t.ageGroup, gender: t.gender, ranked: !!t.rankable };
  if (hits.size > 1) {
    proposals.push({ ...base, via: [...hits.values()].map((h) => h.via).join(" | "), club: null, clubState: null, confidence: "conflict", candidates: [...hits.keys()] });
    continue;
  }
  const [h] = hits.values();
  const confidence = h.words >= 2 && sameState(t.state, h.club.association) ? "high" : "medium";
  // The other name only identifies the club; the team keeps its current label (the other name
  // is often an older season's entry: "Yuba Sutter U16G - United" for today's "YSYSL Sharks").
  // The proposed name is built the way the data build will build it (team-identity.ts): the
  // team's current name formatted with the club, then the repeated short form tidied away.
  const clubName = standardizeAbbreviations(h.club.name);
  const raw = standardizeAbbreviations((t.sourceName ?? "").trim());
  let newName = standardizeAbbreviations(formatTeamName(raw, clubName, t.ageGroup === "Unknown" ? null : t.ageGroup));
  if (newName.startsWith(`${clubName} `)) {
    const rest = newName.slice(clubName.length + 1).replace(/^[A-Z]{2,5}\s+(FC|SC)\s+(?=\S)/, "").replace(/^[A-Za-z]{1,4}-\s+(?=\S)/, "");
    newName = `${clubName} ${rest}`;
  }
  proposals.push({ ...base, via: h.via, club: clubName, clubState: h.club.association, confidence, newName });
}

const order = { high: 0, medium: 1, conflict: 2 };
proposals.sort((a, b) => order[a.confidence] - order[b.confidence] || (a.club ?? "").localeCompare(b.club ?? "") || a.team.localeCompare(b.team));
const out = path.join(ROOT, "data", "review", "alt-name-club-proposals.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), proposals }, null, 1) + "\n");
const by = (c: string) => proposals.filter((p) => p.confidence === c).length;
console.log(`${proposals.length} proposals → ${path.relative(ROOT, out)}: ${by("high")} high, ${by("medium")} medium, ${by("conflict")} conflicts · ${new Set(proposals.map((p) => p.club).filter(Boolean)).size} clubs`);
