import { detectAgeGender, leagueLevels, matchTeams, planFlights, type PlanTeam } from "@/lib/flight-planner";

/**
 * POST { action: "match", teamList, ageGroup?, gender? } → detected age/gender, candidates per line, league levels
 * POST { action: "plan", teams, size, mode, ageGroup, gender } → flights with predicted games
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "Request body must be JSON" }, { status: 400 }); }

  if (body.action === "plan") {
    const teams = Array.isArray(body.teams) ? (body.teams as PlanTeam[]).filter((t) => t && typeof t.name === "string" && Number.isFinite(t.rating)) : [];
    if (teams.length < 2) return Response.json({ error: "Need at least 2 teams with a rating" }, { status: 400 });
    if (teams.length > 300) return Response.json({ error: "At most 300 teams" }, { status: 400 });
    const size = [3, 4, 5, 6, 8, 10].includes(Number(body.size)) ? Number(body.size) : 4;
    const mode = body.mode === "league" ? "league" : "mixed";
    return Response.json({ flights: planFlights(teams, size, mode, String(body.ageGroup ?? ""), String(body.gender ?? "")) });
  }

  const text = typeof body.teamList === "string" ? body.teamList : "";
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 2).slice(0, 300);
  if (lines.length < 2) return Response.json({ error: "Paste at least 2 teams, one per line" }, { status: 400 });
  const detected = detectAgeGender(lines);
  const ageGroup = typeof body.ageGroup === "string" && body.ageGroup ? body.ageGroup : detected.ageGroup;
  const gender = typeof body.gender === "string" && body.gender ? body.gender : detected.gender;
  if (!ageGroup || !gender) return Response.json({ error: "Choose the age group and gender (the names don't say)", detected }, { status: 400 });
  return Response.json({ ageGroup, gender, detected, rows: matchTeams(lines, ageGroup, gender), levels: leagueLevels(ageGroup, gender) });
}
