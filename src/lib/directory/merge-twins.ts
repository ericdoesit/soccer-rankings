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
    const cands = (pool.get(`${t.club}|${t.ageGroup}|${t.gender}`) ?? []).filter((c) => marker[1].test(c.sourceName ?? "")
      // an ECNL team's twin is not the club's Pre-ECNL team, and vice versa
      && pre.test(name) === pre.test(c.sourceName ?? ""));
    const chosen = cands.length === 1 ? cands[0] : cands.length > 1 ? pick(t, cands) : null;
    if (chosen) into.set(t.id, chosen.id);
    else if (cands.length > 1) {
      // none of them played this season: last season's teams, not a twin
      const season = seasonOf(firstDate.get(t.id) ?? "");
      if (season !== null && !cands.some((c) => playedIn(c.id, season))) { noCurrent++; continue; }
      ambiguous++; ambiguousCases.push({ team: t, candidates: cands });
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
