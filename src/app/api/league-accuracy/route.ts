import { NextRequest, NextResponse } from "next/server";
import { getLeagueAccuracyPoints } from "@/lib/league-accuracy";
import { DATA_CACHE } from "@/lib/cache-headers";

/** One point per graded game for a league's "every game" regression chart (fetched on demand). */
export async function GET(request: NextRequest) {
  const points = getLeagueAccuracyPoints(request.nextUrl.searchParams.get("league") ?? "");
  if (!points) return NextResponse.json({ error: "no data" }, { status: 404 });
  return NextResponse.json(points, { headers: DATA_CACHE });
}
