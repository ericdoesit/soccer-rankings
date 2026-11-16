"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
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
import { LeagueStrength } from "@/components/rankings/league-strength";

const PROGRAMS = ["MLS NEXT", "ECNL", "ECNL RL", "Pre-ECNL", "GA", "GA Aspire", "DPL", "EA", "EA2", "USL Academy", "N1", "NPL"];

/** Applies ?program=… from the URL (the header's Leagues menu links here). Reads the URL in
 *  its own Suspense boundary so the rest of the page still prerenders. */
function ProgramFromUrl({ onProgram }: { onProgram: (p: string) => void }) {
  const program = useSearchParams().get("program");
  useEffect(() => {
    if (program && PROGRAMS.includes(program)) onProgram(program);
  }, [program, onProgram]);
  return null;
}

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
  program?: string;
}

const REGIONS = [
  { value: "National", label: "All regions" },
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
  const [program, setProgram] = useState("All");
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

  // only offer states and regions that have listed teams
  const [coverage, setCoverage] = useState<{ states: Record<string, number>; regions: Record<string, number> } | null>(null);
  useEffect(() => {
    fetch("/api/rankings?coverage=1")
      .then((r) => r.json())
      .then(setCoverage)
      .catch(() => {});
  }, []);
  const places = REGIONS.filter((r) => r.value === "National" || !coverage ||
    (r.value.startsWith("Region") ? (coverage.regions[r.value] ?? 0) > 0 : (coverage.states[r.value] ?? 0) > 0));
  // Labels for the closed menus: without items the trigger shows the raw value ("All")
  const ageItems = [{ value: "All", label: "All ages" }, ...["U8", "U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17", "U18", "U19"].map((a) => ({ value: a, label: a })), { value: "U20", label: "U20 (USL Academy)" }];
  const genderItems = [{ value: "Both", label: "Boys & girls" }, { value: "Boys", label: "Boys" }, { value: "Girls", label: "Girls" }];
  const programItems = [{ value: "All", label: "All leagues" }, ...PROGRAMS.map((p) => ({ value: p, label: p }))];
  const eventItems = [{ value: "All", label: "All events" }, ...leagues.map((l) => ({ value: l, label: l }))];
  const coveredNames = coverage ? REGIONS.filter((r) => !r.value.startsWith("Region") && r.value !== "National" && (coverage.states[r.value] ?? 0) > 0).map((r) => r.label) : [];

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
    if (program !== "All") params.set("program", program);
    if (search) params.set("search", search);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(page * PAGE_SIZE));

    const res = await fetch(`/api/rankings?${params}`);
    const data = await res.json();
    setTeams(data);
    setTotalCount(Number(res.headers.get("X-Total-Count") ?? data.length));

    setLoading(false);
  }, [region, ageGroup, gender, league, program, search, page]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [region, ageGroup, gender, league, program, search]);

  useEffect(() => {
    fetchRankings();
  }, [fetchRankings]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <Suspense fallback={null}><ProgramFromUrl onProgram={setProgram} /></Suspense>
      <h1 className="display mb-6">Rankings <span className="tail">by age and gender.</span></h1>

      <div className="surface mb-6 space-y-2 p-6 text-sm leading-relaxed text-muted-foreground">
        <p className="eyebrow">What We Rank</p>
        <p>
          These rankings cover the Western US{coveredNames.length ? <> ({coveredNames.join(", ")})</> : null}. Other states
          aren&apos;t ranked yet: ranking a state fairly takes its league and tournament results, and we don&apos;t collect
          those yet. Teams from other states still count in the ratings whenever they play Western teams, so the rankings
          reflect national competition. Hawaii isn&apos;t ranked because its teams rarely play mainland opponents.
        </p>
        <p>
          Within the West, a team is listed when it plays in tracked competitions (elite leagues, State Cups,
          championships and major showcases) and has enough recent games. Teams that only play in local leagues stay in
          the directory, and their games still count.
        </p>
        <p>
          Next: tracking teams from outside the West that compete nationally in Los Angeles.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Select items={places} value={region} onValueChange={(v) => v !== null && setRegion(v)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Region" />
          </SelectTrigger>
          <SelectContent>
            {places.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select items={ageItems} value={ageGroup} onValueChange={(v) => v !== null && setAgeGroup(v)}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Age" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All ages</SelectItem>
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

        <Select items={genderItems} value={gender} onValueChange={(v) => v !== null && setGender(v)}>
          <SelectTrigger className="w-auto min-w-[150px] whitespace-nowrap">
            <SelectValue placeholder="Gender" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Both">Boys &amp; girls</SelectItem>
            <SelectItem value="Boys">Boys</SelectItem>
            <SelectItem value="Girls">Girls</SelectItem>
          </SelectContent>
        </Select>

        <Select items={programItems} value={program} onValueChange={(v) => v !== null && setProgram(v)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="League" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All leagues</SelectItem>
            {PROGRAMS.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select items={eventItems} value={league} onValueChange={(v) => v !== null && setLeague(v)}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Event" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All events</SelectItem>
            {leagues.map((l) => (
              <SelectItem key={l} value={l}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Search teams"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-[240px]"
        />
      </div>

      {ageGroup !== "All" && gender !== "Both" && (
        <LeagueStrength ageGroup={ageGroup} gender={gender} onPick={setProgram} />
      )}

      {/* Table */}
      <Card className="gap-0 pb-0">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-sm" data-no-sort>
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  {[
                    { key: "rank", label: "#", className: "w-20", align: "" },
                    { key: "name", label: "Team", className: "", align: "" },
                    { key: "club", label: "Club", className: "hidden md:table-cell w-56", align: "" },
                    { key: "state", label: "State", className: "hidden sm:table-cell w-20", align: "" },
                    { key: "score", label: "Score", className: "w-20", align: "text-right" },
                    { key: "record", label: "Record", className: "hidden sm:table-cell w-28", align: "text-center" },
                    { key: "gp", label: "GP", className: "hidden md:table-cell w-16", align: "text-center" },
                  ].map((col) => (
                    <th
                      key={col.key}
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
                      <td colSpan={7} className="px-4 py-3">
                        <div className="h-4 w-full animate-pulse rounded bg-muted" />
                      </td>
                    </tr>
                  ))
                ) : teams.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      No teams found matching your filters.
                    </td>
                  </tr>
                ) : (
                  sortedTeams.map((team) => (
                    <tr
                      key={team.id}
                      className="border-b border-border/50 hover:bg-muted/50 transition-colors"
                    >
                      <td className="rank-num px-4 py-2.5">{team.rank}</td>
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/team/${team.id}`}
                          className="font-medium hover:text-primary transition-colors"
                        >
                          {team.name}
                        </Link>
                        {team.program && (
                          <span className="league-tag ml-2">
                            {team.program}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 hidden md:table-cell truncate text-muted-foreground" title={team.club}>
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
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
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
          <div className="flex items-center justify-between border-t border-[var(--surface-line)] px-6 py-4">
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
