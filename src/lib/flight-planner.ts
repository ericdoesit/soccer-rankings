import { getRankings, type RankedTeam } from "./data";

export interface FlightTeamInput {
  name: string;
  club?: string;
  ageGroup?: string;
  gender?: string;
}

export interface MatchedTeam {
  input: FlightTeamInput;
  matched: RankedTeam | null;
  confidence: "exact" | "fuzzy" | "unknown";
  score: number | null;
}

export interface Flight {
  id: number;
  name: string;
  teams: MatchedTeam[];
  avgRating: number;
  ratingSpread: number;
  predictedCloseness: number; // 0-100, higher = more competitive games
}

export interface FlightPlan {
  flights: Flight[];
  totalTeams: number;
  matchedTeams: number;
  unmatchedTeams: number;
  coveragePercent: number;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\bfc\b|\bsc\b|\bsoccer\b|\bclub\b|\bacademy\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function similarityScore(input: string, candidate: string): number {
  const a = normalize(input);
  const b = normalize(candidate);
  if (a === b) return 1.0;
  if (a.includes(b) || b.includes(a)) return 0.85;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  return Math.max(0, 1 - dist / maxLen);
}

export function matchTeams(inputs: FlightTeamInput[]): MatchedTeam[] {
  const allRanked = getRankings({ limit: 10000 });

  return inputs.map((input) => {
    let bestMatch: RankedTeam | null = null;
    let bestScore = 0;

    for (const team of allRanked) {
      // Check name similarity
      let score = similarityScore(input.name, team.name);

      // Boost if club matches
      if (input.club && team.club) {
        const clubSim = similarityScore(input.club, team.club);
        score = score * 0.7 + clubSim * 0.3;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = team;
      }
    }

    let confidence: "exact" | "fuzzy" | "unknown";
    if (bestScore >= 0.85) confidence = "exact";
    else if (bestScore >= 0.5) confidence = "fuzzy";
    else confidence = "unknown";

    return {
      input,
      matched: confidence !== "unknown" ? bestMatch : null,
      confidence,
      score: confidence !== "unknown" && bestMatch ? bestMatch.score : null,
    };
  });
}

export function generateFlights(
  matchedTeams: MatchedTeam[],
  numFlights: number
): FlightPlan {
  // Separate matched and unmatched
  const withScores = matchedTeams
    .filter((t) => t.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const withoutScores = matchedTeams.filter((t) => t.score === null);

  const teamsPerFlight = Math.ceil(withScores.length / numFlights);
  const flights: Flight[] = [];

  for (let i = 0; i < numFlights; i++) {
    const flightTeams = withScores.slice(
      i * teamsPerFlight,
      (i + 1) * teamsPerFlight
    );

    // Add unmatched teams to the last flight
    if (i === numFlights - 1) {
      flightTeams.push(...withoutScores);
    }

    const scores = flightTeams
      .map((t) => t.score)
      .filter((s): s is number => s !== null);

    const avgRating =
      scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
    const minScore = scores.length > 0 ? Math.min(...scores) : 0;
    const ratingSpread = maxScore - minScore;

    // Predicted closeness: smaller spread = more competitive
    // Scale: 0 spread = 100% close, 5+ goal spread = 0% close
    const predictedCloseness = Math.max(
      0,
      Math.round((1 - ratingSpread / 5) * 100)
    );

    flights.push({
      id: i + 1,
      name: `Flight ${i + 1}`,
      teams: flightTeams,
      avgRating: Math.round(avgRating * 100) / 100,
      ratingSpread: Math.round(ratingSpread * 100) / 100,
      predictedCloseness,
    });
  }

  const matchedCount = matchedTeams.filter((t) => t.confidence !== "unknown").length;

  return {
    flights,
    totalTeams: matchedTeams.length,
    matchedTeams: matchedCount,
    unmatchedTeams: matchedTeams.length - matchedCount,
    coveragePercent: Math.round((matchedCount / matchedTeams.length) * 100),
  };
}

export function parseTeamList(text: string): FlightTeamInput[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 2)
    .map((line) => {
      // Try to parse "Team Name, Club Name" or just "Team Name"
      const parts = line.split(/[,\t]/).map((p) => p.trim());
      return {
        name: parts[0],
        club: parts[1] || undefined,
      };
    });
}
