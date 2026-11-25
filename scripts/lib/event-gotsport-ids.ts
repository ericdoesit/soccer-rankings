/**
 * Which GotSport team id is each entrant of an event?
 *
 * Entrants come from our fixtures (club + team as pasted from the event page); GotSport matches
 * (data/discovery/schedules and /games) carry team ids but often generic names ("U16G DPL").
 * Two kinds of evidence:
 *   - names: every name GotSport has used for the id, at any event (data/discovery/teams.json).
 *     "Central Coast Surf 11G DPL" names its club, which settles it.
 *   - slots: our fixtures and GotSport's matches share match numbers, so the id that played match
 *     #30 as home votes for our home entrant of #30. GotSport re-slots teams after we paste the
 *     schedule (a swapped bracket seed sends every vote to the wrong team), so votes only count
 *     when the id's DPL / DPLO tag agrees with the entrant's and no name says otherwise.
 * An id the evidence can't place stays unassigned: better "no data" than the wrong team's rating.
 */
import * as fs from "fs";
import * as path from "path";

export interface Entrant { division: string; club: string; team: string }
export interface Slot<E extends Entrant> { match: string; date: string; home?: E; away?: E }
export interface GsMatch { matchNumber: number | string; date: string; homeTeamId: number; awayTeamId: number; homeTeam?: string; awayTeam?: string; division?: string }

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
/** tokens that say nothing about the club: ages, birth years, league tags, filler */
const GENERIC = /^(u?\d+[bg]?|[bg]u?\d+|\d+\/\d+[bg]?|g|b|gu|bu|girls|boys|dpl|dplo|n1|npl|ga|ecnl|rl|academy|elite|premier|select|soccer|club|sc|fc|futbol|football|de|the|of|and|g\d+|b\d+|\d+g|\d+b|xx\w*)$/;
const clubWords = (club: string) => words(club).filter((w) => !GENERIC.test(w) && !/^(ca|cas|tx|az|stx)$/.test(w));
const tagOf = (s: string) => (/\bdplo\b/i.test(s) ? "dplo" : /\bdpl\b/i.test(s) ? "dpl" : null);

export function readGsMatches(eventId: string | number): GsMatch[] {
  return ["schedules", "games"].flatMap((d) => {
    const f = path.join(process.cwd(), "data", "discovery", d, `${eventId}.json`);
    return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")) as GsMatch[]) : [];
  });
}
export function readGsNames(): Record<string, { names?: string[] }> {
  const f = path.join(process.cwd(), "data", "discovery", "teams.json");
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
}

export function assignGotsportIds<E extends Entrant>(entrants: E[], slots: Array<Slot<E>>, gs: GsMatch[], gsNames = readGsNames()) {
  const byMatch = new Map(gs.map((g) => [`${g.matchNumber}|${g.date}`, g]));
  const names = new Map<number, Set<string>>();
  const addName = (id: number, n?: string) => { if (!n) return; const s = names.get(id) ?? new Set<string>(); s.add(n); names.set(id, s); };
  for (const g of gs) { addName(g.homeTeamId, g.homeTeam); addName(g.awayTeamId, g.awayTeam); }
  for (const id of names.keys()) for (const n of gsNames[id]?.names ?? []) addName(id, n);

  // votes from shared match numbers
  const votes = new Map<number, Map<E, number>>();
  for (const s of slots) {
    const g = byMatch.get(`${s.match}|${s.date}`);
    if (!g) continue;
    for (const [e, id] of [[s.home, g.homeTeamId], [s.away, g.awayTeamId]] as const) {
      if (!e) continue;
      const v = votes.get(id) ?? new Map<E, number>(); v.set(e, (v.get(e) ?? 0) + 1); votes.set(id, v);
    }
  }
  const division = new Map<number, string>();
  for (const [id, v] of votes) division.set(id, [...v.keys()][0].division);

  const owner = new Map<number, { e: E; by: "name" | "slots"; n: number }>();
  for (const id of votes.keys()) {
    const ns = [...(names.get(id) ?? [])];
    const nameWords = new Set(ns.flatMap(words));
    const pool = entrants.filter((e) => e.division === division.get(id));
    // name evidence: an entrant whose club words all appear in a name GotSport used for this id
    const named = pool.filter((e) => { const cw = clubWords(e.club); return cw.length > 0 && cw.every((w) => nameWords.has(w)); });
    const v = votes.get(id)!;
    if (named.length === 1) { owner.set(id, { e: named[0], by: "name", n: v.get(named[0]) ?? 0 }); continue; }
    const [e, n] = [...v].sort((a, b) => b[1] - a[1])[0];
    if (named.length > 1 && !named.includes(e)) continue; // names point elsewhere, ambiguously
    // a name that names a different club rules the vote out
    const otherClub = pool.some((o) => o !== e && !named.includes(o) && clubWords(o.club).length > 0 && clubWords(o.club).every((w) => nameWords.has(w)));
    if (otherClub) continue;
    const tags = new Set(ns.map(tagOf).filter(Boolean));
    const mine = tagOf(`${e.club} ${e.team}`) ?? "dpl";
    if (tags.size === 1 && !tags.has(mine)) continue; // GotSport calls it DPLO, our entrant is DPL (or vice versa)
    owner.set(id, { e, by: "slots", n });
  }
  // one id per entrant: name evidence first, then the most votes
  const result = new Map<E, { id: number; by: "name" | "slots" }>();
  const rank = (o: { by: string; n: number }) => (o.by === "name" ? 1e6 : 0) + o.n;
  const claim = new Map<E, { id: number; by: "name" | "slots"; n: number }>();
  for (const [id, o] of owner) {
    const cur = claim.get(o.e);
    if (!cur || rank(o) > rank(cur)) claim.set(o.e, { id, by: o.by, n: o.n });
  }
  for (const [e, c] of claim) result.set(e, { id: c.id, by: c.by });
  return result;
}
