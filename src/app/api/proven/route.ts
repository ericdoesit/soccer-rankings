import { NextRequest, NextResponse } from "next/server";
import { getProvenRankings } from "@/lib/data";
import { getLeagueRanges } from "@/lib/about-charts";
import { DATA_CACHE } from "@/lib/cache-headers";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ageGroup = searchParams.get("ageGroup") || "U15";
  const gender = searchParams.get("gender") || "Boys";
  const { teams, untested } = getProvenRankings(ageGroup, gender, getLeagueRanges()?.teams);
  // the highest-rated teams that aren't tested enough yet (shown as a note)
  return NextResponse.json({ teams, untested: untested.slice(0, 10).map((t) => ({ id: t.id, name: t.name, score: t.score, rank: t.rank })), untestedCount: untested.length }, { headers: DATA_CACHE });
}
