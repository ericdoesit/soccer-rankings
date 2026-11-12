import type { GameInput } from "./ranking/massey";

interface SampleTeam {
  id: number;
  name: string;
  club: string;
  state: string;
  region: string;
  ageGroup: string;
  gender: "Boys" | "Girls";
  trueStrength: number;
}

const CLUBS = [
  { name: "FC Dallas", state: "TX", region: "Region3" },
  { name: "Solar SC", state: "TX", region: "Region3" },
  { name: "Texans SC", state: "TX", region: "Region3" },
  { name: "Lonestar SC", state: "TX", region: "Region3" },
  { name: "Challenge SC", state: "TX", region: "Region3" },
  { name: "Houston Dynamo", state: "TX", region: "Region3" },
  { name: "Real Colorado", state: "CO", region: "Region4" },
  { name: "Colorado Rapids", state: "CO", region: "Region4" },
  { name: "ECNL Colorado", state: "CO", region: "Region4" },
  { name: "Atlanta United", state: "GA", region: "Region3" },
  { name: "Concorde Fire", state: "GA", region: "Region3" },
  { name: "United FA", state: "GA", region: "Region3" },
  { name: "Charlotte SA", state: "NC", region: "Region3" },
  { name: "NCFC Youth", state: "NC", region: "Region3" },
  { name: "Charlotte Independence", state: "NC", region: "Region3" },
  { name: "Philadelphia Union", state: "PA", region: "Region1" },
  { name: "FC Delco", state: "PA", region: "Region1" },
  { name: "Penn Fusion", state: "PA", region: "Region1" },
  { name: "NYCFC", state: "NY", region: "Region1" },
  { name: "Manhattan SC", state: "NY", region: "Region1" },
  { name: "BW Gottschee", state: "NY", region: "Region1" },
  { name: "LA Galaxy", state: "CA", region: "Region4" },
  { name: "LAFC", state: "CA", region: "Region4" },
  { name: "Surf SC", state: "CA", region: "Region4" },
  { name: "Crossfire Premier", state: "WA", region: "Region4" },
  { name: "Seattle United", state: "WA", region: "Region4" },
  { name: "Sounders FC", state: "WA", region: "Region4" },
  { name: "Chicago Fire", state: "IL", region: "Region2" },
  { name: "Sockers FC", state: "IL", region: "Region2" },
  { name: "Eclipse Select", state: "IL", region: "Region2" },
  { name: "Sporting KC", state: "MO", region: "Region2" },
  { name: "St. Louis Scott Gallagher", state: "MO", region: "Region2" },
  { name: "Michigan Jaguars", state: "MI", region: "Region2" },
  { name: "Crew SC", state: "OH", region: "Region2" },
  { name: "Ohio Premier", state: "OH", region: "Region2" },
  { name: "Inter Miami", state: "FL", region: "Region3" },
  { name: "Weston FC", state: "FL", region: "Region3" },
  { name: "Tampa Bay United", state: "FL", region: "Region3" },
  { name: "Orlando City", state: "FL", region: "Region3" },
  { name: "Jacksonville FC", state: "FL", region: "Region3" },
  { name: "DC United", state: "VA", region: "Region1" },
  { name: "Virginia SA", state: "VA", region: "Region1" },
  { name: "Loudoun SC", state: "VA", region: "Region1" },
  { name: "Baltimore Armour", state: "MD", region: "Region1" },
  { name: "Bethesda SC", state: "MD", region: "Region1" },
  { name: "San Jose Earthquakes", state: "CA", region: "Region4" },
  { name: "De Anza Force", state: "CA", region: "Region4" },
  { name: "Bayern Munich USA", state: "CA", region: "Region4" },
  { name: "Portland Timbers", state: "OR", region: "Region4" },
  { name: "Eastside FC", state: "OR", region: "Region4" },
];

const TEAM_SUFFIXES = ["Blue", "Red", "Black", "White", "Gold", "Premier", "Elite", "Academy"];

const TOURNAMENTS = [
  "Dallas Cup",
  "Surf Cup",
  "Jefferson Cup",
  "Disney Showcase",
  "Potomac Memorial",
  "National League",
  "State Cup",
  "ECNL Playoffs",
  "GA Cup",
  "NPL Finals",
  "Region Championship",
  "Presidents Cup",
];

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export function generateSampleTeams(count = 50): SampleTeam[] {
  const rand = seededRandom(42);
  const teams: SampleTeam[] = [];

  for (let i = 0; i < count; i++) {
    const club = CLUBS[i % CLUBS.length];
    const suffix = TEAM_SUFFIXES[Math.floor(rand() * TEAM_SUFFIXES.length)];
    teams.push({
      id: i + 1,
      name: `${club.name} ${suffix}`,
      club: club.name,
      state: club.state,
      region: club.region,
      ageGroup: "U14",
      gender: "Boys",
      trueStrength: rand() * 6 - 1, // range: -1 to 5 goals
    });
  }

  return teams;
}

export function generateSampleGames(
  teams: SampleTeam[],
  gamesPerTeam = 15
): GameInput[] {
  const rand = seededRandom(123);
  const games: GameInput[] = [];
  const totalGames = Math.floor((teams.length * gamesPerTeam) / 2);

  const startDate = new Date("2025-09-01");

  for (let g = 0; g < totalGames; g++) {
    let t1 = Math.floor(rand() * teams.length);
    let t2 = Math.floor(rand() * teams.length);
    if (t1 === t2) t2 = (t2 + 1) % teams.length;

    const team1 = teams[t1];
    const team2 = teams[t2];

    // Simulate score based on true strength difference + randomness
    const diff = team1.trueStrength - team2.trueStrength;
    const noise = (rand() - 0.5) * 4; // random noise
    const scoreDiff = Math.round(diff + noise);

    const avgGoals = 2 + rand() * 2;
    let score1 = Math.max(0, Math.round(avgGoals + scoreDiff / 2));
    let score2 = Math.max(0, Math.round(avgGoals - scoreDiff / 2));

    // Cap at reasonable scores
    score1 = Math.min(score1, 10);
    score2 = Math.min(score2, 10);

    const daysOffset = Math.floor(rand() * 270); // spread over ~9 months
    const gameDate = new Date(startDate);
    gameDate.setDate(gameDate.getDate() + daysOffset);

    games.push({
      team1Id: team1.id,
      team2Id: team2.id,
      team1Score: score1,
      team2Score: score2,
      date: gameDate.toISOString().split("T")[0],
      status: "completed",
    });
  }

  return games;
}

export function generateFullSampleData() {
  const teams = generateSampleTeams(50);
  const games = generateSampleGames(teams, 15);

  return { teams, games };
}
