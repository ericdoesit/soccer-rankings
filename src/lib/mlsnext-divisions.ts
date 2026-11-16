/**
 * MLS NEXT 2026-27: a club can field TWO teams per age group, one in the Homegrown Division and
 * one in the Academy Division, and mlsnexttracker.com names both "<club> MLS NEXT U15".
 * Checked 2026-11-16: all 1,818 same-day doubles in the data pair a Homegrown game with an
 * Academy game, so they are two squads, not one.
 *
 * The Homegrown team keeps the plain name: 2025-26 had one tier, and a club's team then is its
 * Homegrown team now (same conference, same opponents), so its history stays joined. The
 * Academy team becomes "<club> MLS NEXT AD U15". Flex games belong to the Homegrown team (they
 * fall on the same day as the club's Academy game 843 times, its Homegrown game 28).
 */
export interface TrackerDivisionGame {
  homeTeam: string;
  awayTeam: string;
  division?: string;
  flex?: boolean;
}

const sideOf = (g: TrackerDivisionGame) => (g.flex || g.division === "homegrown" ? "HD" : g.division === "academy" ? "AD" : null);

/** Names used by both a Homegrown and an Academy team. */
export function namesInBothDivisions(games: TrackerDivisionGame[]): Set<string> {
  const divs = new Map<string, Set<string>>();
  for (const g of games) {
    const d = sideOf(g);
    if (!d) continue;
    for (const t of [g.homeTeam?.trim(), g.awayTeam?.trim()]) if (t) (divs.get(t) ?? divs.set(t, new Set()).get(t)!).add(d);
  }
  return new Set([...divs].filter(([, ds]) => ds.size === 2).map(([t]) => t));
}

/** The name of a team in this game: the Academy side of a shared name gets " MLS NEXT AD". */
export function divisionTeamName(name: string, g: TrackerDivisionGame, both: Set<string>): string {
  const n = name.trim();
  if (sideOf(g) !== "AD" || !both.has(n)) return n;
  return n.replace(/ MLS NEXT (U\d{1,2})$/i, " MLS NEXT AD $1");
}

/** Rename in place (for scripts that read the tracker file directly). */
export function splitDivisionNames<T extends TrackerDivisionGame>(games: T[]): T[] {
  const both = namesInBothDivisions(games);
  for (const g of games) {
    g.homeTeam = divisionTeamName(g.homeTeam, g, both);
    g.awayTeam = divisionTeamName(g.awayTeam, g, both);
  }
  return games;
}
