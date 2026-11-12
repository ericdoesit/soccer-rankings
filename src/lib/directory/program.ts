/**
 * A team's program: the elite league it plays in (ECNL, ECNL RL, MLS NEXT, GA,
 * DPL, EA …). Ratings stay one national scale; the program lets the rankings show
 * "within ECNL" views and how leagues compare (see leagueStrength in data.ts).
 *
 * MLS NEXT is one program: our MLS NEXT league games are 2025-26, before the Homegrown /
 * Academy Division split, and team names don't reliably say HD or AD.
 *
 * N1 League (2026-27) merged the NPL and the USYS National League; older NPL leagues
 * stay "NPL".
 *
 * Assigned from the league games a team played in the last 15 months (the program it
 * played most), falling back to the competition word in its name ("… DPL", "… ECNL RL").
 */
export const PROGRAMS = [
  "MLS NEXT", "ECNL", "ECNL RL", "Pre-ECNL", "GA", "GA Aspire",
  "DPL", "EA", "EA2", "USL Academy", "N1", "NPL",
] as const;
export type Program = (typeof PROGRAMS)[number];

/** League games only (not showcases or cups), by competition name */
function fromEvent(event: string): Program | null {
  const e = event.toLowerCase();
  if (/^pre-?ecnl\b/.test(e)) return "Pre-ECNL";
  if (/^ecnl rl\b/.test(e)) return "ECNL RL";
  if (/^ecnl (boys|girls)\b/.test(e)) return "ECNL";
  if (/^mls next( academy division)? 20\d\d/.test(e)) return "MLS NEXT";
  if (/^elite academy league ea2\b/.test(e)) return "EA2";
  if (/^elite academy league\b/.test(e)) return "EA";
  if (/^usl academy\b/.test(e)) return "USL Academy";
  if (/girls academy aspire|\baspire league\b/.test(e)) return "GA Aspire";
  if (/girls academy league\b/.test(e)) return "GA";
  if (/^n1\b|\bn1 i\b|national 1 league/.test(e)) return "N1";
  if (/\bnpl\b/.test(e) && !/finals/.test(e)) return "NPL";
  return null;
}

/** From the team's name when it has no league games ("… GU17 DPL", "… ECNL RL G2010") */
export function fromName(name: string): Program | null {
  if (/pre[- ]?ecnl/i.test(name)) return "Pre-ECNL";
  if (/\becnl[- ]?rl\b|\becrl\b/i.test(name)) return "ECNL RL";
  if (/\becnl\b/i.test(name)) return "ECNL";
  if (/\busl academy\b/i.test(name)) return "USL Academy";
  if (/\bmls\b|mls ?next/i.test(name)) return "MLS NEXT";
  if (/\bea ?2\b/i.test(name)) return "EA2";
  if (/\bea\b|elite academy/i.test(name)) return "EA";
  if (/\bdplo?\b/i.test(name)) return "DPL";
  if (/\baspire\b/i.test(name)) return "GA Aspire";
  if (/\bga\b|girls academy/i.test(name)) return "GA";
  if (/\bnpl\b/i.test(name)) return "NPL";
  return null;
}

export function assignPrograms(
  teams: Array<{ id: number; sourceName?: string; name: string }>,
  games: Array<{ team1Id: number; team2Id: number; date: string; tournamentName?: string }>,
  since: string,
): Map<number, Program> {
  const tally = new Map<number, Map<Program, { n: number; last: string }>>();
  for (const g of games) {
    if (!g.tournamentName || !g.date || g.date < since) continue;
    for (const id of [g.team1Id, g.team2Id]) {
      const p = fromEvent(g.tournamentName);
      if (!p) continue;
      const m = tally.get(id) ?? new Map();
      const x = m.get(p) ?? { n: 0, last: "" };
      x.n++; if (g.date > x.last) x.last = g.date;
      m.set(p, x); tally.set(id, m);
    }
  }
  const out = new Map<number, Program>();
  for (const t of teams) {
    const m = tally.get(t.id);
    const best = m ? [...m].sort((a, b) => b[1].n - a[1].n || b[1].last.localeCompare(a[1].last))[0][0] : fromName(t.sourceName ?? t.name);
    if (best) out.set(t.id, best);
  }
  return out;
}
