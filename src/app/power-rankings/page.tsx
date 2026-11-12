"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PowerTeam {
  id: number;
  name: string;
  club: string;
  state: string;
  ageGroup: string;
  gender: string;
  score: number;
  powerScore: number;
  powerRank: number;
  sos: number;
  qualityWins: number;
  crossLeagueWins: number;
  crossLeagueGames: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
}

export default function PowerRankingsPage() {
  const [ageGroup, setAgeGroup] = useState("All");
  const [gender, setGender] = useState("Both");
  const [teams, setTeams] = useState<PowerTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<string>("powerRank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(col: string) {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir(col === "name" || col === "club" ? "asc" : "desc");
    }
  }

  const sortedTeams = [...teams].sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "powerRank": cmp = a.powerRank - b.powerRank; break;
      case "name": cmp = a.name.localeCompare(b.name); break;
      case "club": cmp = a.club.localeCompare(b.club); break;
      case "powerScore": cmp = a.powerScore - b.powerScore; break;
      case "score": cmp = a.score - b.score; break;
      case "sos": cmp = a.sos - b.sos; break;
      case "qualityWins": cmp = a.qualityWins - b.qualityWins; break;
      case "cross": cmp = (a.crossLeagueWins / (a.crossLeagueGames || 1)) - (b.crossLeagueWins / (b.crossLeagueGames || 1)); break;
      case "record": cmp = a.wins - b.wins; break;
      default: cmp = a.powerRank - b.powerRank;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const fetchRankings = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (ageGroup !== "All") params.set("ageGroup", ageGroup);
    if (gender !== "Both") params.set("gender", gender);
    const res = await fetch(`/api/power-rankings?${params}`);
    setTeams(await res.json());
    setLoading(false);
  }, [ageGroup, gender]);

  useEffect(() => {
    fetchRankings();
  }, [fetchRankings]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="heading">Power Rankings</h1>
        <p className="body-text mt-2">
          The top 1% of teams who prove themselves against elite competition across leagues.
          Composite score based on rating, strength of schedule, quality wins, and cross-league performance.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Select value={ageGroup} onValueChange={(v) => v !== null && setAgeGroup(v)}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Ages</SelectItem>
            <SelectItem value="U8">U8</SelectItem>
            <SelectItem value="U9">U9</SelectItem>
            <SelectItem value="U10">U10</SelectItem>
            <SelectItem value="U11">U11</SelectItem>
            <SelectItem value="U12">U12</SelectItem>
            <SelectItem value="U13">U13</SelectItem>
            <SelectItem value="U14">U14</SelectItem>
            <SelectItem value="U15">U15</SelectItem>
            <SelectItem value="U16">U16</SelectItem>
            <SelectItem value="U17">U17</SelectItem>
            <SelectItem value="U18">U18</SelectItem>
            <SelectItem value="U19">U19</SelectItem>
          </SelectContent>
        </Select>

        <Select value={gender} onValueChange={(v) => v !== null && setGender(v)}>
          <SelectTrigger className="w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Both">All</SelectItem>
            <SelectItem value="Girls">Girls</SelectItem>
            <SelectItem value="Boys">Boys</SelectItem>
          </SelectContent>
        </Select>

        <span className="lowbrow ml-2">{teams.length} elite teams</span>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="heading-sm">
            {teams.length > 0 ? `Top ${teams.length} Power Ranked Teams` : "Loading..."}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading power rankings...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    {[
                      { key: "powerRank", label: "#", tip: "Power rank position", className: "px-4 py-2 w-12 cursor-pointer hover:text-foreground" },
                      { key: "name", label: "Team", tip: "Team name", className: "px-4 py-2 cursor-pointer hover:text-foreground" },
                      { key: "club", label: "Club", tip: "Club affiliation", className: "px-4 py-2 hidden md:table-cell cursor-pointer hover:text-foreground" },
                      { key: "powerScore", label: "Power", tip: "Composite score: 40% rating, 25% strength of schedule, 20% quality wins, 15% cross-league performance", className: "px-4 py-2 text-right cursor-pointer hover:text-foreground" },
                      { key: "score", label: "Rating", tip: "Massey rating measured in expected goal difference vs an average team", className: "px-4 py-2 text-right hidden sm:table-cell cursor-pointer hover:text-foreground" },
                      { key: "sos", label: "SOS", tip: "Strength of Schedule — average Massey rating of all opponents faced", className: "px-4 py-2 text-right hidden sm:table-cell cursor-pointer hover:text-foreground" },
                      { key: "qualityWins", label: "Quality W", tip: "Wins against opponents ranked in the top 50%", className: "px-4 py-2 text-center hidden lg:table-cell cursor-pointer hover:text-foreground" },
                      { key: "cross", label: "Cross-League", tip: "Win-loss record in games outside the team's primary league (tournaments, cups, showcases)", className: "px-4 py-2 text-center hidden lg:table-cell cursor-pointer hover:text-foreground" },
                      { key: "record", label: "Record", tip: "Overall win-loss-draw record", className: "px-4 py-2 text-center hidden sm:table-cell cursor-pointer hover:text-foreground" },
                    ].map((col) => (
                      <th
                        key={col.key}
                        className={col.className}
                        onClick={() => handleSort(col.key)}
                        title={col.tip}
                      >
                        {col.label}
                        {sortBy === col.key && (
                          <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedTeams.map((team) => (
                    <tr
                      key={team.id}
                      className="border-b border-border/50 hover:bg-muted/50 transition-colors"
                    >
                      <td className="px-4 py-2.5 font-medium">{team.powerRank}</td>
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/team/${team.id}`}
                          className="font-medium hover:text-primary transition-colors"
                        >
                          {team.name}
                        </Link>
                        <span className="ml-2 text-xs text-muted-foreground hidden sm:inline">
                          {team.ageGroup} {team.gender}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        <Link
                          href={`/club/${encodeURIComponent(team.club)}`}
                          className="text-muted-foreground hover:text-primary transition-colors"
                        >
                          {team.club}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold">
                        {team.powerScore.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right hidden sm:table-cell text-muted-foreground">
                        {team.score?.toFixed(1) ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right hidden sm:table-cell text-muted-foreground">
                        {team.sos.toFixed(1)}
                      </td>
                      <td className="px-4 py-2.5 text-center hidden lg:table-cell text-muted-foreground">
                        {team.qualityWins}
                      </td>
                      <td className="px-4 py-2.5 text-center hidden lg:table-cell text-muted-foreground">
                        {team.crossLeagueWins}-{team.crossLeagueGames - team.crossLeagueWins}
                      </td>
                      <td className="px-4 py-2.5 text-center hidden sm:table-cell text-muted-foreground">
                        {team.wins}-{team.losses}-{team.draws}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
