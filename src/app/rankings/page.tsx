"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  ageGroup: string;
  gender: string;
  score: number;
  rank: number;
  previousRank: number | null;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
}

const REGIONS = [
  { value: "National", label: "All Regions" },
  { value: "Region4", label: "--- West ---" },
  { value: "Region3", label: "--- South ---" },
  { value: "Region2", label: "--- Midwest ---" },
  { value: "Region1", label: "--- East ---" },
  ...[
    { value: "AL", label: "Alabama" },
    { value: "AK", label: "Alaska" },
    { value: "AZ", label: "Arizona" },
    { value: "AR", label: "Arkansas" },
    { value: "CAN", label: "California North" },
    { value: "CAS", label: "California South" },
    { value: "CO", label: "Colorado" },
    { value: "CT", label: "Connecticut" },
    { value: "DE", label: "Delaware" },
    { value: "FL", label: "Florida" },
    { value: "GA", label: "Georgia" },
    { value: "HI", label: "Hawaii" },
    { value: "ID", label: "Idaho" },
    { value: "IL", label: "Illinois" },
    { value: "IN", label: "Indiana" },
    { value: "IA", label: "Iowa" },
    { value: "KS", label: "Kansas" },
    { value: "KY", label: "Kentucky" },
    { value: "LA", label: "Louisiana" },
    { value: "ME", label: "Maine" },
    { value: "MD", label: "Maryland" },
    { value: "MA", label: "Massachusetts" },
    { value: "MI", label: "Michigan" },
    { value: "MN", label: "Minnesota" },
    { value: "MS", label: "Mississippi" },
    { value: "MO", label: "Missouri" },
    { value: "MT", label: "Montana" },
    { value: "NE", label: "Nebraska" },
    { value: "NV", label: "Nevada" },
    { value: "NH", label: "New Hampshire" },
    { value: "NJ", label: "New Jersey" },
    { value: "NM", label: "New Mexico" },
    { value: "NY", label: "New York" },
    { value: "NC", label: "North Carolina" },
    { value: "ND", label: "North Dakota" },
    { value: "OH", label: "Ohio" },
    { value: "OK", label: "Oklahoma" },
    { value: "OR", label: "Oregon" },
    { value: "PA", label: "Pennsylvania" },
    { value: "RI", label: "Rhode Island" },
    { value: "SC", label: "South Carolina" },
    { value: "SD", label: "South Dakota" },
    { value: "TN", label: "Tennessee" },
    { value: "TX", label: "Texas" },
    { value: "UT", label: "Utah" },
    { value: "VT", label: "Vermont" },
    { value: "VA", label: "Virginia" },
    { value: "WA", label: "Washington" },
    { value: "WV", label: "West Virginia" },
    { value: "WI", label: "Wisconsin" },
    { value: "WY", label: "Wyoming" },
  ],
];

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

export default function RankingsPage() {
  const [region, setRegion] = useState("National");
  const [ageGroup, setAgeGroup] = useState("All");
  const [gender, setGender] = useState("Both");
  const [league, setLeague] = useState("All");
  const [search, setSearch] = useState("");
  const [teams, setTeams] = useState<RankedTeam[]>([]);
  const [leagues, setLeagues] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState<string>("rank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const PAGE_SIZE = 100;

  function handleSort(column: string) {
    if (sortBy === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDir(column === "name" || column === "club" || column === "state" ? "asc" : "desc");
    }
  }

  const sortedTeams = [...teams].sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "rank": cmp = a.rank - b.rank; break;
      case "name": cmp = a.name.localeCompare(b.name); break;
      case "club": cmp = a.club.localeCompare(b.club); break;
      case "state": cmp = a.state.localeCompare(b.state); break;
      case "score": cmp = a.score - b.score; break;
      case "record": cmp = a.wins - b.wins; break;
      case "gp": cmp = a.gamesPlayed - b.gamesPlayed; break;
      default: cmp = a.rank - b.rank;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  useEffect(() => {
    fetch("/api/rankings?leagues=list")
      .then((r) => r.json())
      .then(setLeagues)
      .catch(() => {});
  }, []);

  const fetchRankings = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (region !== "National") params.set("region", region);
    if (ageGroup !== "All") params.set("ageGroup", ageGroup);
    if (gender !== "Both") params.set("gender", gender);
    if (league !== "All") params.set("league", league);
    if (search) params.set("search", search);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(page * PAGE_SIZE));

    const res = await fetch(`/api/rankings?${params}`);
    const data = await res.json();
    setTeams(data);
    setTotalCount(Number(res.headers.get("X-Total-Count") ?? data.length));

    setLoading(false);
  }, [region, ageGroup, gender, league, search, page]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [region, ageGroup, gender, league, search]);

  useEffect(() => {
    fetchRankings();
  }, [fetchRankings]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">Rankings</h1>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Select value={region} onValueChange={(v) => v !== null && setRegion(v)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Region" />
          </SelectTrigger>
          <SelectContent>
            {REGIONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={ageGroup} onValueChange={(v) => v !== null && setAgeGroup(v)}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Age" />
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
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Gender" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Both">Girls &amp; Boys</SelectItem>
            <SelectItem value="Girls">Girls</SelectItem>
            <SelectItem value="Boys">Boys</SelectItem>
          </SelectContent>
        </Select>

        <Select value={league} onValueChange={(v) => v !== null && setLeague(v)}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="League" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Leagues</SelectItem>
            {leagues.map((l) => (
              <SelectItem key={l} value={l}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Search teams..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-[240px]"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  {[
                    { key: "rank", label: "#", className: "w-12", align: "" },
                    { key: "", label: "", className: "w-10", align: "" },
                    { key: "name", label: "Team", className: "", align: "" },
                    { key: "club", label: "Club", className: "hidden md:table-cell", align: "" },
                    { key: "state", label: "State", className: "hidden sm:table-cell", align: "" },
                    { key: "score", label: "Score", className: "", align: "text-right" },
                    { key: "record", label: "Record", className: "hidden sm:table-cell", align: "text-center" },
                    { key: "gp", label: "GP", className: "hidden md:table-cell", align: "text-center" },
                  ].map((col) => (
                    <th
                      key={col.key || "change"}
                      className={`px-4 py-3 ${col.className} ${col.align} ${col.key ? "cursor-pointer hover:text-foreground select-none transition-colors" : ""}`}
                      onClick={() => col.key && handleSort(col.key)}
                    >
                      {col.label}
                      {sortBy === col.key && (
                        <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td colSpan={8} className="px-4 py-3">
                        <div className="h-4 w-full animate-pulse rounded bg-muted" />
                      </td>
                    </tr>
                  ))
                ) : teams.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                      No teams found matching your filters.
                    </td>
                  </tr>
                ) : (
                  sortedTeams.map((team) => (
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
                      </td>
                      <td className="px-4 py-2.5 hidden md:table-cell text-muted-foreground">
                        <Link
                          href={`/club/${encodeURIComponent(team.club)}`}
                          className="hover:text-primary transition-colors"
                        >
                          {team.club}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 hidden sm:table-cell text-muted-foreground">
                        {team.state}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-medium">
                        {team.score?.toFixed(1) ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-center hidden sm:table-cell text-muted-foreground">
                        {team.wins}-{team.losses}-{team.draws}
                      </td>
                      <td className="px-4 py-2.5 text-center hidden md:table-cell text-muted-foreground">
                        {team.gamesPlayed}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>

        {/* Pagination */}
        {totalCount > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="lowbrow">
              {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount.toLocaleString()} teams
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground px-2">
                Page {page + 1} of {Math.ceil(totalCount / PAGE_SIZE)}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * PAGE_SIZE >= totalCount}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
