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
  teamId: number;
  /** GotSport team id: stable across data builds (our teamId is not), so decisions use it */
  gs: number;
  team: string; current: string; state: string; age: string; gender: string; ranked: boolean;
  via: string; club: string | null; clubState: string | null; confidence: "high" | "medium" | "conflict"; candidates?: string[];
  /** display name the team would get: the full name it used elsewhere, formatted with the club */
  newName?: string;
  /** medium/conflict rows: what else points to a club (state, home fields, organization, name words) */
  hints?: string[];
  /** a better-supported club than the proposed one, when the hints find one */
  better?: { club: string; association: string; why: string };
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
  const base = { teamId: t.id, gs: t.gotsportTeamId, team: t.name, current: t.club, state: t.state, age: t.ageGroup, gender: t.gender, ranked: !!t.rankable };
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

// ── Hints for medium and conflict rows ──────────────────────────────────────────────────────
// Where each GotSport team plays its home games (all published events), and which directory
// club uses each field, so a team can be placed by the fields it shares with a club's teams.
const gamesDir = path.join(ROOT, "data", "discovery", "games");
const homeFields = new Map<number, Map<string, number>>();
// league games only: at tournaments the "home" field is the host's, not the team's
const frontierEv = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "discovery", "frontier.json"), "utf8")).events;
const leagueEvents = new Set((Array.isArray(frontierEv) ? frontierEv : Object.entries(frontierEv).map(([id, v]) => ({ id, ...(v as object) })))
  .filter((e: { league?: boolean }) => e.league).map((e: { id: number | string }) => String(e.id)));
const cleanVenue = (v: string) => v.trim().replace(/\s*[-–,#(].*$/, "").replace(/\s+(field|fld|pitch|turf)\s*\w*$/i, "").trim().toLowerCase();
for (const f of fs.readdirSync(gamesDir)) {
  if (!leagueEvents.has(f.replace(/\.json$/, ""))) continue;
  for (const g of JSON.parse(fs.readFileSync(path.join(gamesDir, f), "utf8")) as Array<{ homeTeamId: number; venue?: string }>) {
    if (!g.venue || !g.homeTeamId) continue;
    const v = cleanVenue(g.venue);
    if (v.length < 4 || /\btbd\b/.test(v)) continue;
    const m = homeFields.get(g.homeTeamId) ?? new Map<string, number>();
    m.set(v, (m.get(v) ?? 0) + 1);
    homeFields.set(g.homeTeamId, m);
  }
}
const dirTeams = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "gotsport-teams", "region4.json"), "utf8")) as Array<{ teamId: number; clubName: string; association: string }>;
const clubsByField = new Map<string, Map<string, number>>(); // field → "club\0assoc" → home games
for (const d of dirTeams) {
  for (const [v, n] of homeFields.get(d.teamId) ?? []) {
    const k = `${d.clubName.trim()}\u0000${d.association}`;
    const m = clubsByField.get(v) ?? new Map<string, number>();
    m.set(k, (m.get(k) ?? 0) + n);
    clubsByField.set(v, m);
  }
}
const orgOf = new Map<number, number>();
for (const x of (Array.isArray(disc) ? disc : Object.values(disc)) as Array<{ teamId: number; orgId: number | null }>) if (x.orgId) orgOf.set(x.teamId, x.orgId);
const orgClubs = new Map<number, Map<string, number>>();
for (const d of dirTeams) {
  const o = orgOf.get(d.teamId);
  if (!o) continue;
  const m = orgClubs.get(o) ?? new Map<string, number>();
  const k = `${d.clubName.trim()}\u0000${d.association}`;
  m.set(k, (m.get(k) ?? 0) + 1);
  orgClubs.set(o, m);
}
const top = (m?: Map<string, number>) => m ? [...m].sort((a, b) => b[1] - a[1])[0] : undefined;
const allClubs = [...clubs.values()].flat();
for (const p of proposals) {
  if (p.confidence === "high") continue;
  const hints: string[] = [];
  const gsId = p.gs;
  // 1. home fields shared with one club's directory teams
  const fields = [...(homeFields.get(gsId) ?? [])].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const fieldVotes = new Map<string, number>();
  for (const [v, n] of fields) {
    // a field counts only when one club has most (60%+) of its directory teams' home games there
    const m = clubsByField.get(v);
    const owner = top(m);
    const total = m ? [...m.values()].reduce((a, b) => a + b, 0) : 0;
    if (owner && owner[1] >= 5 && owner[1] / total >= 0.6) fieldVotes.set(owner[0], (fieldVotes.get(owner[0]) ?? 0) + n);
  }
  if (fields.length) hints.push(`home fields: ${fields.map(([v]) => v).join(", ")}`);
  const fieldClub = top(fieldVotes);
  if (fieldClub) hints.push(`those fields are home to ${fieldClub[0].replace("\u0000", " (")})`);
  // 2. GotSport organization
  const org = orgOf.get(gsId);
  const orgClub = org ? top(orgClubs.get(org)) : undefined;
  if (orgClub) hints.push(`GotSport organization ${org} belongs to ${orgClub[0].replace("\u0000", " (")})`);
  // 3. a club with the same key word in the team's own state
  const word = normalizeClubName(p.club ?? (p.candidates?.[0] ?? "")).split(" ")[0];
  const inState = word ? allClubs.filter((c) => sameState(p.state, c.association) && normalizeClubName(c.name).split(" ").includes(word))
    .sort((a, b) => b.n - a.n) : [];
  if (p.clubState && !sameState(p.state, p.clubState)) hints.push(`team plays in ${p.state}, proposed club is in ${p.clubState}`);
  if (inState.length && inState[0].name !== p.club) hints.push(`clubs with "${word}" in ${p.state}: ${inState.slice(0, 3).map((c) => c.name).join(", ")}`);
  // Better club: organization first, then home fields, then the only same-word club in the team's state
  const pick = (k: string) => { const [club, association] = k.split("\u0000"); return { club: standardizeAbbreviations(club), association }; };
  let better: Proposal["better"];
  if (orgClub && pick(orgClub[0]).club !== p.club) better = { ...pick(orgClub[0]), why: "same GotSport organization" };
  else if (fieldClub && pick(fieldClub[0]).club !== p.club && sameState(p.state, pick(fieldClub[0]).association)) better = { ...pick(fieldClub[0]), why: "plays home games on that club's fields" };

  p.hints = hints;
  // a league is not a club ("El Paso Premier League", "Carlsbad Youth Soccer League")
  if (better && !/\bleague\b/i.test(better.club)) p.better = better;
}

const order = { high: 0, medium: 1, conflict: 2 };
proposals.sort((a, b) => order[a.confidence] - order[b.confidence] || (a.club ?? "").localeCompare(b.club ?? "") || a.team.localeCompare(b.team));
const out = path.join(ROOT, "data", "review", "alt-name-club-proposals.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), proposals }, null, 1) + "\n");
const by = (c: string) => proposals.filter((p) => p.confidence === c).length;
console.log(`${proposals.length} proposals → ${path.relative(ROOT, out)}: ${by("high")} high, ${by("medium")} medium, ${by("conflict")} conflicts · ${new Set(proposals.map((p) => p.club).filter(Boolean)).size} clubs`);
