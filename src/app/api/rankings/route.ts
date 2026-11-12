import { getRankings, getLeagues, getLeagueStrength, getCoverage } from "@/lib/data";

const MAX_LIMIT = 500;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  if (searchParams.get("leagues") === "list") {
    return Response.json(getLeagues());
  }
  // listed teams per state / region (which places the filter offers)
  if (searchParams.get("coverage")) {
    return Response.json(getCoverage());
  }
  // league comparison for one age group + gender
  if (searchParams.get("strength")) {
    const age = searchParams.get("ageGroup"), gender = searchParams.get("gender");
    if (!age || !gender || age === "All" || gender === "Both") return Response.json([]);
    return Response.json(getLeagueStrength(age, gender));
  }

  // limit 1..MAX_LIMIT (default 50), offset >= 0; junk values fall back to defaults
  const int = (v: string | null, fallback: number) => {
    const n = Number.parseInt(v ?? "", 10);
    return Number.isFinite(n) ? n : fallback;
  };
  const limit = Math.min(Math.max(int(searchParams.get("limit"), 50), 1), MAX_LIMIT);
  const offset = Math.max(int(searchParams.get("offset"), 0), 0);
  const search = searchParams.get("search")?.slice(0, 100) || undefined;

  const all = getRankings({
    region: searchParams.get("region") ?? undefined,
    ageGroup: searchParams.get("ageGroup") ?? undefined,
    gender: searchParams.get("gender") ?? undefined,
    league: searchParams.get("league") ?? undefined,
    program: searchParams.get("program") ?? undefined,
    search,
    limit: Number.MAX_SAFE_INTEGER,
    offset: 0,
  });

  // Total matching rows go in a header so clients can paginate without
  // downloading every row.
  return Response.json(all.slice(offset, offset + limit), {
    headers: { "X-Total-Count": String(all.length) },
  });
}
