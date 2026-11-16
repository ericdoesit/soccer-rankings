/**
 * (Also ECNL schedule teams from data/ecnl.)
 * One real team can arrive twice: from GotSport ("Sparta U17B MLS NEXT AD", its
 * tournaments) and from Modular11 ("Sparta United MLS NEXT AD B2009", its league
 * games). Split in two, neither copy has all its games and both could be listed.
 *
 * After team identity, a Modular11 team is merged into a GotSport team of the same
 * club, age group and gender whose name carries the same competition marker, when
 * there is exactly one such team. With two or more candidates, one is chosen when it is
 * the only one that (1) carries the schedule name exactly, (2) played in the same
 * Aug–Jul season (last season's registration is a different roster, especially across
 * the 2026-27 switch to school-year age groups), or (3) also has the same birth years in
 * its name, or (4) is the one GotSport-registered team among those. When no candidate
 * played this season, there is no current twin. Otherwise ("… AD" and "… AD 2" both active) the teams stay separate.
 */
interface TeamLike { id: number; club: string; ageGroup: string; gender: string; region: string; sourceName?: string; clubVerified?: boolean; gotsportTeamId?: number }
interface GameLike { team1Id: number; team2Id: number; team1Score: number; team2Score: number; date: string }

const MARKER: Array<[RegExp, RegExp]> = [
  // ECNL schedule names ("FC Portland ECNL B2013/14", "… ECNL RL B12", "… Pre-ECNL B14")
  [/pre[- ]?ecnl/i, /pre[- ]?ecnl/i],
  [/\becnl[- ]?rl\b|\becrl\b/i, /\becnl[- ]?rl\b|\becrl\b|\brl\b/i],
  [/\becnl\b/i, /\becnl\b(?![- ]?rl)/i],
  // Modular11 label in our team name → what a GotSport twin's name looks like
  [/ EA2 B\d{4}$/, /\bEA ?2\b/i],
  [/ EA B\d{4}$/, /\bEA\b(?! ?2)|elite academy/i],
  [/ USL Academy B\d{4}$/, /\busl\b/i],
  [/ MLS NEXT AD B\d{4}$/, /\bAD\b|academy division|mls ?next/i],
  [/ MLS NEXT HD B\d{4}$/, /\bHD\b|homegrown|mls ?next/i],
  [/ MLS NEXT B\d{4}$/, /mls ?next|\bAD\b|\bHD\b|homegrown/i],
];

export function mergeModularTwins<T extends TeamLike, G extends GameLike>(
  teams: T[], games: G[], modularNames: Set<string>,
): { teams: T[]; games: G[]; merged: number; ambiguous: number; noCurrent: number; ambiguousCases: Array<{ team: T; candidates: T[] }> } {
  const pool = new Map<string, T[]>();
  for (const t of teams) {
    // GotSport teams are always merge targets, even when an ECNL schedule used the
    // exact same name (then both sources already share the team)
    if (!t.clubVerified || t.region !== "Region4" || (modularNames.has(t.sourceName ?? "") && !t.gotsportTeamId)) continue;
    const k = `${t.club}|${t.ageGroup}|${t.gender}`;
    pool.set(k, [...(pool.get(k) ?? []), t]);
  }
  // Each team's game dates, to tell which season a candidate played in
  const lastDate = new Map<number, string>(), firstDate = new Map<number, string>();
  for (const g of games) {
    if (!g.date) continue;
    for (const id of [g.team1Id, g.team2Id]) {
      if (g.date > (lastDate.get(id) ?? "")) lastDate.set(id, g.date);
      if (g.date < (firstDate.get(id) ?? "9999")) firstDate.set(id, g.date);
    }
  }
  // Season = Aug 1 – Jul 31 (from 2026-27 the age groups follow the school year too)
  const seasonOf = (d: string) => (d ? (Number(d.slice(5, 7)) >= 8 ? Number(d.slice(0, 4)) : Number(d.slice(0, 4)) - 1) : null);
  const playedIn = (id: number, season: number) => {
    const f = seasonOf(firstDate.get(id) ?? ""), l = seasonOf(lastDate.get(id) ?? "");
    return f !== null && l !== null && f <= season && season <= l;
  };
  const norm = (n: string) => n.toLowerCase().replace(/[^a-z0-9/]+/g, " ").trim();
  // "B2012/13" → matches "2012/13" or "12/13"; "B2013" → "2013" or "B13"
  const yearPattern = (n: string): RegExp | null => {
    const m = n.match(/\b[BG](20\d\d)(?:\/(\d\d))?\b/i);
    if (!m) return null;
    const yy = m[1].slice(2);
    return m[2] ? new RegExp(`(?:20)?${yy}\\/${m[2]}(?!\\d)`) : new RegExp(`20${yy}(?!\\d)|\\b[bg]${yy}\\b`, "i");
  };
  /** Among several candidates, pick the one twin when one rule singles it out. */
  const pick = (t: T, cands: T[]): T | null => {
    const name = norm(t.sourceName ?? "");
    // 1. the GotSport name is the schedule name, maybe with the club name in front
    const exact = cands.filter((c) => { const n = norm(c.sourceName ?? ""); return n === name || n.endsWith(" " + name); });
    if (exact.length === 1) return exact[0];
    // 2. played in the same season as the schedule team (last season's team is a different roster)
    const season = seasonOf(firstDate.get(t.id) ?? "");
    const same = season === null ? cands : cands.filter((c) => playedIn(c.id, season));
    if (same.length === 1) return same[0];
    // 3. same season and the same birth years in the name
    const yp = yearPattern(t.sourceName ?? "");
    const byYear = yp ? same.filter((c) => yp.test(c.sourceName ?? "")) : [];
    if (byYear.length === 1) return byYear[0];
    // 4. of those, the one GotSport-registered team (the others are tournament-site copies)
    const pool = byYear.length ? byYear : same;
    const registered = pool.filter((c) => c.gotsportTeamId);
    if (registered.length === 1) return registered[0];
    return null;
  };
  const gameDays = new Map<number, Set<string>>();
  for (const g of games) if (g.date) for (const id of [g.team1Id, g.team2Id]) (gameDays.get(id) ?? gameDays.set(id, new Set()).get(id)!).add(g.date);
  // MLS NEXT 2026-27: a club with both a Homegrown and an Academy team has its Academy side named
  // "… MLS NEXT AD B2012" (src/lib/mlsnext-divisions.ts). Then the plain-named team is the
  // Homegrown one, and neither may merge into a GotSport team labelled for the other division
  // (2026-11-16: "SoCal Reds MLS NEXT HD AR" / "… AD EC" were matched the wrong way round).
  const AD_SPLIT = / MLS NEXT AD [BG]20\d\d\b/i;
  const splitClubs = new Set(teams.filter((t) => AD_SPLIT.test(t.sourceName ?? "")).map((t) => `${t.club}|${t.ageGroup}|${t.gender}`));
  const divisionLabel = (n: string) => (/\b(AD|academy division)\b/i.test(n) ? "AD" : /\b(HD|homegrown)\b/i.test(n) ? "HD" : null);
  const mlsDivisionOf = (t: T) => AD_SPLIT.test(t.sourceName ?? "") ? "AD"
    : /\bmls next\b/i.test(t.sourceName ?? "") && splitClubs.has(`${t.club}|${t.ageGroup}|${t.gender}`) ? "HD" : null;
  const into = new Map<number, number>();
  let ambiguous = 0, noCurrent = 0;
  const ambiguousCases: Array<{ team: T; candidates: T[] }> = [];
  for (const t of teams) {
    const name = t.sourceName ?? "";
    // never merge away a GotSport team ("Napa United ECNL RL G2011/12" is both a GotSport
    // name and an ECNL schedule name): only teams that came purely from ECNL / Modular11
    if (!t.clubVerified || !modularNames.has(name) || t.gotsportTeamId) continue;
    const marker = MARKER.find(([own]) => own.test(name));
    if (!marker) continue;
    const pre = /pre[- ]?ecnl/i;
    const myDays = gameDays.get(t.id);
    const myTag = designatorOf(name, t.club);
    const myDiv = mlsDivisionOf(t);
    const cands = (pool.get(`${t.club}|${t.ageGroup}|${t.gender}`) ?? []).filter((c) => marker[1].test(c.sourceName ?? "")
      // an ECNL team's twin is not the club's Pre-ECNL team, and vice versa
      && pre.test(name) === pre.test(c.sourceName ?? "")
      // two teams that played on the same day are two teams ("… RL Red" and "… RL White")
      && !sharesDay(myDays, gameDays.get(c.id))
      // and different colors / coaches / conferences are different teams
      && !tagsConflict(myTag, designatorOf(c.sourceName ?? "", c.club))
      // Homegrown vs Academy: never the other division's team
      && !(myDiv && divisionLabel(c.sourceName ?? "") !== null && divisionLabel(c.sourceName ?? "") !== myDiv));
    const chosen = cands.length === 1 ? cands[0] : cands.length > 1 ? pick(t, cands) : null;
    if (chosen) into.set(t.id, chosen.id);
    else if (cands.length > 1) {
      // none of them played this season: last season's teams, not a twin
      const season = seasonOf(firstDate.get(t.id) ?? "");
      if (season !== null && !cands.some((c) => playedIn(c.id, season))) { noCurrent++; continue; }
      ambiguous++; ambiguousCases.push({ team: t, candidates: cands });
    }
  }
  // Two schedule teams can't both be the same GotSport team when they're different
  // teams themselves ("Rebels … RL B2013/14 Blue" and "… White" both fitting the
  // color-less "Rebels SC ECNL RL B2013/14"): then neither is merged.
  {
    const byId = new Map(teams.map((t) => [t.id, t]));
    const bySource = new Map<number, number[]>();
    for (const [from, to] of into) bySource.set(to, [...(bySource.get(to) ?? []), from]);
    for (const [to, froms] of bySource) {
      if (froms.length < 2) continue;
      const clash = froms.some((a, i) => froms.slice(i + 1).some((b) => {
        const ta = byId.get(a)!, tb = byId.get(b)!;
        return sharesDay(gameDays.get(a), gameDays.get(b)) || tagsConflict(designatorOf(ta.sourceName ?? "", ta.club), designatorOf(tb.sourceName ?? "", tb.club));
      }));
      if (!clash) continue;
      for (const f of froms) into.delete(f);
      ambiguous += froms.length;
      ambiguousCases.push({ team: byId.get(froms[0])!, candidates: [byId.get(to)!] });
    }
  }
  if (!into.size) return { teams, games, merged: 0, ambiguous, noCurrent, ambiguousCases };

  const seen = new Set<string>();
  const outGames: G[] = [];
  for (const g of games) {
    const a = into.get(g.team1Id) ?? g.team1Id, b = into.get(g.team2Id) ?? g.team2Id;
    if (a === b) continue;
    // the same match from both sources: keep one
    const [lo, hi, sLo, sHi] = a < b ? [a, b, g.team1Score, g.team2Score] : [b, a, g.team2Score, g.team1Score];
    const key = `${lo}_${hi}_${sLo}_${sHi}_${g.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    outGames.push(a === g.team1Id && b === g.team2Id ? g : { ...g, team1Id: a, team2Id: b });
  }
  return { teams: teams.filter((t) => !into.has(t.id)), games: outGames, merged: into.size, ambiguous, noCurrent, ambiguousCases };
}

/**
 * Tournament copies of one team. A club's ECNL (or GA, DPL, MLS NEXT, EA …) team of one
 * age is a single team, but each tournament site registers it under its own name:
 * "San Diego Surf ECNL G2011/12" (ECNL schedule), "SD Surf ECNL Girls 2012 (Deza)"
 * (GotSport), "San Diego Surf ECNL Girls 2012" (Surf Challenge), "… ECNL G12" (SNCL).
 * Split up, no copy reaches the ranking minimum and the club's top team goes unranked.
 *
 * Records of the same club, age group, gender and competition tier are joined when
 * every pair is compatible:
 *   - birth years in the names overlap (when both names have them),
 *   - their distinguishing words (coach name, color, number) agree (when both have them),
 *   - they never played on the same day (two teams in one tournament are two teams),
 *   - two GotSport registrations never played in the same Aug–Jul season.
 * A record that fits more than one group (e.g. a name with no color next to "Blue" and
 * "White" teams) is left alone.
 */
const TIER: Array<[string, RegExp]> = [
  ["pre-ecnl", /pre[- ]?ecnl/i],
  ["ecnl-rl", /\becnl[- ]?rl\b|\becrl\b/i],
  ["ecnl", /\becnl\b/i],
  ["ga-aspire", /\baspire\b/i],
  ["ga", /\bga\b|girls academy/i],
  ["dplo", /\bdplo\b/i],
  ["dpl", /\bdpl\b/i],
  ["mls-hd", /\bhd\b|homegrown/i],
  ["mls-ad", /\bad\b|academy division/i],
  ["ea2", /\bea ?2\b/i],
  ["ea", /\bea\b|elite academy/i],
];
const tierOf = (n: string) => TIER.find(([, re]) => re.test(n))?.[0] ?? null;
const GENERIC = new Set(("soccer club fc sc futbol football academy united girls boys girl boy g b u the of de cf " +
  "ecnl rl pre ga dpl dplo mls next hd ad ea aspire homegrown division elite npl " +
  "ca team").split(" "));
/** ECNL RL / GA conference words: a club can have a SoCal and a Southwest RL team of one age */
const CONFERENCE: Array<[RegExp, string]> = [
  [/\bs\.? ?cal\b|\bso\.? ?cal\b|\bsocal\b|\bsouthern cal(ifornia)?\b/g, " ~socal "],
  [/\bn\.? ?cal\b|\bnor\.? ?cal\b|\bnorcal\b|\bnorthern cal(ifornia)?\b/g, " ~norcal "],
  [/\bsouthwest\b|\bsw\b/g, " ~southwest "],
  [/\bnorthwest\b|\bnw\b/g, " ~northwest "],
  [/\bmountain\b/g, " ~mountain "],
  [/\bstxcl\b|\bntx\b|\btexas\b/g, " ~texas "],
];
/** birth years written in a team name: 2012, G12, 12G, 2011/12, G2011/12 */
export function birthYears(n: string): Set<number> {
  const out = new Set<number>();
  for (const m of n.matchAll(/(?:^|[^0-9])(?:[bg])?(20[01]\d)(?:\s*\/\s*(\d{2,4}))?(?![0-9])/gi)) {
    out.add(Number(m[1]));
    if (m[2]) out.add(Number(m[2].length === 2 ? "20" + m[2] : m[2]));
  }
  for (const m of n.matchAll(/\b[bg](\d{2})(?:\/(\d{2}))?\b|\b(\d{2})(?:\/(\d{2}))?[bg]\b/gi)) {
    for (const y of [m[1], m[2], m[3], m[4]]) if (y && Number(y) >= 5 && Number(y) <= 22) out.add(2000 + Number(y));
  }
  return out;
}
function designator(name: string, club: string): Set<string> {
  const clubWords = new Set(club.toLowerCase().split(/[^a-z0-9]+/));
  let n = name.toLowerCase().replace(/\([^)]*\b(ca|tx|az|nv|or|wa|co|ut)\b[^)]*\)/g, " ").replace(/#\d+/g, " ");
  for (const [re, w] of CONFERENCE) n = n.replace(re, w);
  return new Set(n.split(/[^a-z0-9~]+/)
    .filter((w) => w && !GENERIC.has(w) && (w.startsWith("~") || !clubWords.has(w))
      // years and age labels aren't designators; a lone team number ("RL 2", "MLS 2") is
      && !(/^\d{2,}$/.test(w)) && !/^[bgu]\d+$/.test(w) && !/^\d+[bg]$/.test(w) && !/^\d+\/\d+$/.test(w)));
}

export function mergeTournamentCopies<T extends TeamLike, G extends GameLike>(teams: T[], games: G[]): { teams: T[]; games: G[]; merged: number; joins: Array<{ into: T; from: T[] }> } {
  const joins: Array<{ into: T; from: T[] }> = [];
  const dates = new Map<number, Set<string>>();
  const seasons = new Map<number, Set<number>>();
  const count = new Map<number, number>();
  const last = new Map<number, string>();
  const seasonOf = (d: string) => (Number(d.slice(5, 7)) >= 8 ? Number(d.slice(0, 4)) : Number(d.slice(0, 4)) - 1);
  for (const g of games) for (const id of [g.team1Id, g.team2Id]) {
    count.set(id, (count.get(id) ?? 0) + 1);
    if (!g.date) continue;
    (dates.get(id) ?? dates.set(id, new Set()).get(id)!).add(g.date);
    (seasons.get(id) ?? seasons.set(id, new Set()).get(id)!).add(seasonOf(g.date));
    if (g.date > (last.get(id) ?? "")) last.set(id, g.date);
  }
  const groups = new Map<string, T[]>();
  for (const t of teams) {
    if (!t.clubVerified || !t.club) continue;
    const tier = tierOf(t.sourceName ?? "");
    if (!tier) continue;
    const k = `${t.club}|${t.ageGroup}|${t.gender}|${tier}`;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  const overlap = <X>(a: Set<X> | undefined, b: Set<X> | undefined) => { if (!a || !b) return false; for (const x of a) if (b.has(x)) return true; return false; };
  const fits = (a: T, b: T) => {
    const ya = birthYears(a.sourceName ?? ""), yb = birthYears(b.sourceName ?? "");
    if (ya.size && yb.size && !overlap(ya, yb)) return false;
    const da = designator(a.sourceName ?? "", a.club), db = designator(b.sourceName ?? "", b.club);
    if (da.size && db.size && !overlap(da, db)) return false;
    if (overlap(dates.get(a.id), dates.get(b.id))) return false;
    if (a.gotsportTeamId && b.gotsportTeamId && a.gotsportTeamId !== b.gotsportTeamId && overlap(seasons.get(a.id), seasons.get(b.id))) return false;
    return true;
  };
  const into = new Map<number, number>();
  for (const grp of groups.values()) {
    if (grp.length < 2) continue;
    // biggest records first: they anchor the clusters
    const sorted = [...grp].sort((a, b) => (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0));
    const clusters: T[][] = [];
    for (const t of sorted) {
      if (!count.get(t.id)) continue;
      const ok = clusters.filter((c) => c.every((m) => fits(m, t)));
      if (ok.length === 1) ok[0].push(t);
      else if (ok.length === 0) clusters.push([t]);
      // fits 2+ clusters: can't tell which team it is
    }
    for (const c of clusters) {
      if (c.length < 2) continue;
      // keep the GotSport-registered record that played most recently, else the most recent
      const target = [...c].sort((a, b) => Number(!!b.gotsportTeamId) - Number(!!a.gotsportTeamId) || (last.get(b.id) ?? "").localeCompare(last.get(a.id) ?? ""))[0];
      for (const m of c) if (m.id !== target.id) into.set(m.id, target.id);
      joins.push({ into: target, from: c.filter((m) => m.id !== target.id) });
    }
  }
  if (!into.size) return { teams, games, merged: 0, joins };
  const outGames: G[] = [];
  const seen = new Set<string>();
  for (const g of games) {
    const a = into.get(g.team1Id) ?? g.team1Id, b = into.get(g.team2Id) ?? g.team2Id;
    if (a === b) continue;
    const [lo, hi, sLo, sHi] = a < b ? [a, b, g.team1Score, g.team2Score] : [b, a, g.team2Score, g.team1Score];
    const key = `${lo}_${hi}_${sLo}_${sHi}_${g.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    outGames.push(a === g.team1Id && b === g.team2Id ? g : { ...g, team1Id: a, team2Id: b });
  }
  return { teams: teams.filter((t) => !into.has(t.id)), games: outGames, merged: into.size, joins };
}

// shared helpers for both merges (function declarations: hoisted)
function sharesDay(a: Set<string> | undefined, b: Set<string> | undefined): boolean {
  if (!a || !b) return false;
  for (const d of a) if (b.has(d)) return true;
  return false;
}
function designatorOf(name: string, club: string): Set<string> { return designator(name, club); }
function tagsConflict(a: Set<string>, b: Set<string>): boolean {
  if (!a.size || !b.size) return false;
  for (const w of a) if (b.has(w)) return false;
  return true;
}
