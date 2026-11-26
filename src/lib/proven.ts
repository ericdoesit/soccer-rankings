/** /api/proven answers, computed per age group + gender; precomputed by scripts/build-precomputed.ts. */
import { getProvenRankings } from "./data";
import { getLeagueRanges } from "./about-charts";
import { readPrecomputed } from "./precomputed";

export interface ProvenResponse {
  teams: ReturnType<typeof getProvenRankings>["teams"];
  untested: Array<{ id: number; name: string; score: number; rank: number }>;
  untestedCount: number;
}

export function computeProven(ageGroup: string, gender: string): ProvenResponse {
  const { teams, untested } = getProvenRankings(ageGroup, gender, getLeagueRanges()?.teams);
  // the highest-rated teams that aren't tested enough yet (shown as a note)
  return { teams, untested: untested.slice(0, 10).map((t) => ({ id: t.id, name: t.name, score: t.score, rank: t.rank })), untestedCount: untested.length };
}

/** precomputed with the data build when it matches the snapshot: no snapshot load on a cold server */
export function getProven(ageGroup: string, gender: string): ProvenResponse {
  return readPrecomputed<Record<string, ProvenResponse>>("proven")?.[`${ageGroup}|${gender}`] ?? computeProven(ageGroup, gender);
}
