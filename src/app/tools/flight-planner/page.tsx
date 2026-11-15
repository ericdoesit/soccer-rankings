"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface MatchedTeam {
  input: { name: string; club?: string };
  matched: {
    id: number;
    name: string;
    club: string;
    score: number;
    rank: number;
  } | null;
  confidence: "exact" | "fuzzy" | "unknown";
  score: number | null;
}

interface Flight {
  id: number;
  name: string;
  teams: MatchedTeam[];
  avgRating: number;
  ratingSpread: number;
  predictedCloseness: number;
}

interface FlightPlan {
  flights: Flight[];
  totalTeams: number;
  matchedTeams: number;
  unmatchedTeams: number;
  coveragePercent: number;
}

const SAMPLE_TEAMS = `ALBION SC San Diego B16 Academy
Celtic Soccer Club B16
Surf SC B16 Elite
LA Galaxy B16 Academy
Real Colorado B16
Phoenix Rising B16
Legends FC B16
Strikers FC B16
Beach Futbol Club B16
San Diego Surf B16
Crossfire Premier B16
FC Dallas Gold
Solar SC Red
Houston Dynamo Blue
Sporting KC Premier
LAFC Academy B16`;

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const styles = {
    exact: "bg-green-600 text-white",
    fuzzy: "bg-yellow-600 text-white",
    unknown: "bg-red-600 text-white",
  };
  const labels = { exact: "Matched", fuzzy: "Fuzzy", unknown: "Unknown" };
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
        styles[confidence as keyof typeof styles] || styles.unknown
      }`}
    >
      {labels[confidence as keyof typeof labels] || "Unknown"}
    </span>
  );
}

function ClosenessBar({ value }: { value: number }) {
  const color =
    value >= 70
      ? "bg-green-500"
      : value >= 40
        ? "bg-yellow-500"
        : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">{value}%</span>
    </div>
  );
}

export default function FlightPlannerPage() {
  const [teamList, setTeamList] = useState("");
  const [numFlights, setNumFlights] = useState(3);
  const [plan, setPlan] = useState<FlightPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generatePlan() {
    if (!teamList.trim()) {
      setError("Paste your team list first");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/flight-planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamList, numFlights }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate plan");
      }
      const data = await res.json();
      setPlan(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
    setLoading(false);
  }

  function exportCSV() {
    if (!plan) return;
    const rows = ["Flight,Team,Club,Rating,Confidence"];
    for (const flight of plan.flights) {
      for (const team of flight.teams) {
        rows.push(
          [
            flight.name,
            `"${team.input.name}"`,
            `"${team.matched?.club || ""}"`,
            team.score?.toFixed(1) || "N/A",
            team.confidence,
          ].join(",")
        );
      }
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flight-plan.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="display mb-3">Tournament flight planner</h1>
      <p className="lead mb-8">
        Paste your registered teams and we&apos;ll automatically group them into
        competitive flights based on our rankings data.
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Input */}
        <Card>
          <CardHeader>
            <CardTitle className="heading-sm">Team List</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <textarea
              className="w-full rounded-[var(--radius-surface)] border-0 bg-card p-4 text-sm shadow-[var(--surface-shadow)] min-h-[300px] tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder={"Paste one team per line:\n\nALBION SC San Diego B16\nCeltic Soccer Club B16\nSurf SC B16 Elite\n..."}
              value={teamList}
              onChange={(e) => setTeamList(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <label className="text-sm text-muted-foreground">Flights:</label>
              <Input
                type="number"
                min={2}
                max={10}
                value={numFlights}
                onChange={(e) => setNumFlights(parseInt(e.target.value) || 3)}
                className="w-20"
              />
              <Button onClick={generatePlan} disabled={loading} className="flex-1">
                {loading ? "Generating..." : "Generate Flights"}
              </Button>
            </div>
            <button
              onClick={() => setTeamList(SAMPLE_TEAMS)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Load sample teams
            </button>
            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}
          </CardContent>
        </Card>

        {/* Coverage Stats */}
        {plan && (
          <Card>
            <CardHeader>
              <CardTitle className="heading-sm">Coverage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <p className="text-3xl font-bold">{plan.coveragePercent}%</p>
                  <p className="text-xs text-muted-foreground">Coverage</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold">{plan.totalTeams}</p>
                  <p className="text-xs text-muted-foreground">Total Teams</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-green-500">
                    {plan.matchedTeams}
                  </p>
                  <p className="text-xs text-muted-foreground">Matched</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-red-500">
                    {plan.unmatchedTeams}
                  </p>
                  <p className="text-xs text-muted-foreground">Unmatched</p>
                </div>
              </div>
              <Button onClick={exportCSV} variant="secondary" className="w-full">
                Export as CSV
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Flight Results */}
      {plan && (
        <div className="mt-8 space-y-6">
          <h2 className="heading-sm">Flight Assignments</h2>

          {plan.flights.map((flight) => (
            <Card key={flight.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="heading-sm">{flight.name}</CardTitle>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">
                      Avg: <span className="font-semibold tabular-nums text-foreground">{flight.avgRating.toFixed(1)}</span>
                    </span>
                    <span className="text-muted-foreground">
                      Spread: <span className="font-semibold tabular-nums text-foreground">{flight.ratingSpread.toFixed(1)}</span>
                    </span>
                    <div>
                      <span className="text-muted-foreground mr-1">Balance:</span>
                      <ClosenessBar value={flight.predictedCloseness} />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2">Team</th>
                      <th className="px-4 py-2">Matched To</th>
                      <th className="px-4 py-2 text-center">Status</th>
                      <th className="px-4 py-2 text-right">Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flight.teams.map((team, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-border/50 hover:bg-muted/50"
                      >
                        <td className="px-4 py-2 font-medium">
                          {team.input.name}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {team.matched ? (
                            <span>
                              {team.matched.name}
                              <span className="ml-1 text-xs">
                                ({team.matched.club})
                              </span>
                            </span>
                          ) : (
                            <span className="italic">No match found</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <ConfidenceBadge confidence={team.confidence} />
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {team.score !== null ? team.score.toFixed(1) : "N/A"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
