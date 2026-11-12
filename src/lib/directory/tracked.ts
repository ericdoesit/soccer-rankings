/**
 * Which competitions put a team in the rankings (user decision 2026-11-11).
 *
 * Ratings use every game. The rankings LIST only teams that played, in the last
 * 15 months, in a tracked competition:
 *   - elite leagues: MLS NEXT, Elite Academy League (EA / EA2), USL Academy,
 *     Girls Academy, GA Aspire, DPL (ECNL / ECNL RL once their data is available)
 *   - N1 League and the USYS National League
 *   - multi-state leagues (JPL Mountain West NPL) and national / regional
 *     championships (Presidents Cup, National Cup, NPL Finals, regionals)
 *   - State Cups
 *   - multi-state showcases: at least 3 West states with 5+ teams each, 150+ West
 *     teams in total, and 15%+ of them from outside the host (largest) state
 * State and district leagues (SoCal, NorCal Premier, NPSL, Nevada State League, …)
 * stay in the directory but don't by themselves make a team ranked.
 */

const NAMED: Array<[RegExp, string]> = [
  [/^mls next\b/i, "MLS NEXT"],
  [/^elite academy league\b/i, "Elite Academy League"],
  [/^usl academy\b/i, "USL Academy"],
  [/\bgirls academy\b|^\d\d\/\d\d girls academy/i, "Girls Academy"],
  // GA's national events are named "GA Winter Showcase & Champions Cup", "GA Summer Showcase & Playoffs" …
  [/^ga\b.*\b(showcase|playoffs?|champions cup|finals?)\b/i, "Girls Academy"],
  [/\baspire\b/i, "GA Aspire"],
  [/development player league|\bdpl\b/i, "DPL"],
  [/\becnl\b/i, "ECNL"],
  [/^n1\b|\bn1 i\b|national 1 league/i, "N1"],
  [/^nl (team|club)\b|\busys national league\b|^national league\b/i, "USYS National League"],
  [/jpl mountain west|\bnpl finals\b/i, "Multi-state league / NPL Finals"],
  // USYS / US Club championships, not club tournaments that borrow the words
  // ("Hawaii International Cup", "San Juan SC Presidents' Cup", "Surf Select Regional Cup")
  [/national presidents.? cup|presidents.? cup.*national qualifier|^\d{4} [a-z ]+ presidents.? cup|national championships?|\bnational cup (finals|west regional)|regional championships?|far west regional|elite 64/i, "Championship"],
  [/state cup/i, "State Cup"],
  // SOCAL + NorCal Premier state final for U9–U12 State Cup champions and finalists
  // (socalstatecup.com/california-cup) — not Rated Sports' Memorial Day "California Cup"
  [/\b(socal|norcal|cal south|cal north)\b.*\bcalifornia cup\b/i, "State Cup"],
];

/** Classify one competition by name, or null when it's not tracked by name. */
export function trackedByName(name: string): string | null {
  for (const [re, reason] of NAMED) if (re.test(name)) return reason;
  return null;
}

/**
 * Tracked competitions: by name, plus multi-state showcases found from the data.
 * `stateOf` gives a team's association (CAS, AZ, …); `west` is the set of West codes.
 */
export function trackedCompetitions(
  games: Array<{ team1Id: number; team2Id: number; tournamentName: string }>,
  stateOf: (id: number) => string | undefined,
  west: Set<string>,
): Map<string, string> {
  const teamsBy = new Map<string, Set<number>>();
  for (const g of games) {
    if (!g.tournamentName) continue;
    const s = teamsBy.get(g.tournamentName) ?? new Set<number>();
    s.add(g.team1Id); s.add(g.team2Id);
    teamsBy.set(g.tournamentName, s);
  }
  const out = new Map<string, string>();
  for (const [name, ids] of teamsBy) {
    const named = trackedByName(name);
    if (named) { out.set(name, named); continue; }
    const perState = new Map<string, number>();
    for (const id of ids) {
      const st = stateOf(id);
      if (st && west.has(st)) perState.set(st, (perState.get(st) ?? 0) + 1);
    }
    const westTeams = [...perState.values()].reduce((a, b) => a + b, 0);
    const states = [...perState.values()].filter((n) => n >= 5).length;
    const host = Math.max(0, ...perState.values());
    // "RSL-AZ Holiday Classic": 596 of 621 West teams from Arizona is a state event
    if (states >= 3 && westTeams >= 150 && (westTeams - host) / westTeams >= 0.15) out.set(name, "Multi-state showcase");
  }
  return out;
}
