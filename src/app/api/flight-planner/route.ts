import {
  parseTeamList,
  matchTeams,
  generateFlights,
} from "@/lib/flight-planner";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON" }, { status: 400 });
  }
  const { teamList, numFlights = 3 } = (body ?? {}) as {
    teamList: string;
    numFlights: number;
  };

  if (!teamList || typeof teamList !== "string") {
    return Response.json({ error: "teamList is required" }, { status: 400 });
  }

  const inputs = parseTeamList(teamList);
  if (inputs.length < 2) {
    return Response.json(
      { error: "Need at least 2 teams" },
      { status: 400 }
    );
  }

  const matched = matchTeams(inputs);
  const flights = Number.isInteger(numFlights) && numFlights > 0 ? numFlights : 3;
  const plan = generateFlights(matched, Math.min(flights, inputs.length));

  return Response.json(plan);
}
