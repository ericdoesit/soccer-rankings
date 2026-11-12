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

interface RankedTeam {
  id: number;
  name: string;
  club: string;
  state: string;
  score: number;
  rank: number;
  previousRank: number | null;
  wins: number;
  losses: number;
  draws: number;
}

function RankChange({ current, previous }: { current: number; previous: number | null }) {
  const base = "inline-flex items-center justify-center gap-0.5 h-5 text-xs font-medium";
  // null = no rank history yet; show neutral dash rather than "NEW" for every team
  if (previous === null) return <span className={`${base} text-muted-foreground`}>&mdash;</span>;
  const diff = previous - current;
  if (diff === 0) return <span className={`${base} text-muted-foreground`}>&mdash;</span>;
  if (diff > 0)
    return <span className={`${base}`}><img src="/arrowup.svg" alt="up" className="h-2.5 w-2.5" /></span>;
  return <span className={`${base}`}><img src="/arrowdown.svg" alt="down" className="h-2.5 w-2.5" /></span>;
}

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(Fc|Sc|Sd|Ie|Rl|Ecnl|Npl|Ga|La|Lv)\b/gi, (m) => m.toUpperCase());
}

export function Top25Rankings() {
  const [ageGroup, setAgeGroup] = useState("All");
  const [gender, setGender] = useState("Both");
  const [teams, setTeams] = useState<RankedTeam[]>([]);

  const fetchTeams = useCallback(async () => {
    const params = new URLSearchParams();
    if (ageGroup !== "All") params.set("ageGroup", ageGroup);
    if (gender !== "Both") params.set("gender", gender);
    params.set("limit", "25");
    const res = await fetch(`/api/rankings?${params}`);
    setTeams(await res.json());
  }, [ageGroup, gender]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="heading">Top 25 Rankings</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={ageGroup} onValueChange={(v) => v !== null && setAgeGroup(v)}>
            <SelectTrigger className="w-[90px] h-8 text-xs">
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
              <SelectItem value="U20">U20 (USL Academy)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={gender} onValueChange={(v) => v !== null && setGender(v)}>
            <SelectTrigger className="w-[80px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Both">All</SelectItem>
              <SelectItem value="Girls">Girls</SelectItem>
              <SelectItem value="Boys">Boys</SelectItem>
            </SelectContent>
          </Select>
          <Link
            href="/rankings"
            className="text-xs text-primary hover:underline ml-2"
          >
            View All &rarr;
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 w-12">#</th>
                <th className="px-4 py-2 w-10 text-center"></th>
                <th className="px-4 py-2">Team</th>
                <th className="px-4 py-2 hidden sm:table-cell">State</th>
                <th className="px-4 py-2 text-right">Score</th>
                <th className="px-4 py-2 text-center hidden sm:table-cell">Record</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => (
                <tr
                  key={team.id}
                  className="border-b border-border/50 hover:bg-muted/50 transition-colors"
                >
                  <td className="px-4 py-2.5 font-medium">{team.rank}</td>
                  <td className="px-4 py-2.5 text-center">
                    <RankChange current={team.rank} previous={team.previousRank} />
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/team/${team.id}`}
                      className="font-medium hover:text-primary transition-colors"
                    >
                      {team.name}
                    </Link>
                    <Link
                      href={`/club/${encodeURIComponent(team.club)}`}
                      className="ml-2 text-xs text-muted-foreground hover:text-primary transition-colors"
                    >
                      {team.club}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 hidden sm:table-cell text-muted-foreground">
                    {team.state}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold">
                    {team.score?.toFixed(1) ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-center hidden sm:table-cell text-muted-foreground">
                    {team.wins}-{team.losses}-{team.draws}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
      <div className="flex items-center px-4 py-3">
        <p className="lowbrow">Last updated: {new Date().toISOString().split("T")[0]}</p>
      </div>
    </Card>
  );
}
