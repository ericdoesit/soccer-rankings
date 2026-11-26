"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TeamNameCell } from "@/components/rankings/team-name-cell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Proven rankings: the age group's teams whose ratings have been tested against other leagues
 * (src/lib/data.ts getProvenRankings), ranked by rating. Replaced the composite Power Rankings.
 */
const AGES = ["U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17", "U18", "U19", "U20"];
const AGE_ITEMS = AGES.map((a) => ({ value: a, label: a === "U20" ? "U20 (USL Academy)" : a }));
const GENDER_ITEMS = [{ value: "Boys", label: "Boys" }, { value: "Girls", label: "Girls" }];
const MIN_CROSS = 8;

type Rec = { w: number; d: number; l: number };
interface ProvenTeam {
  id: number; name: string; club: string; program?: string; score: number; provenRank: number;
  range: [number, number] | null; league: string | null; cross: Rec; top25: Rec;
}
interface Untested { id: number; name: string; score: number }
const rec = (r: Rec) => `${r.w}-${r.d}-${r.l}`;
const n = (r: Rec) => r.w + r.d + r.l;

export default function ProvenPage() {
  const [ageGroup, setAgeGroup] = useState("U15");
  const [gender, setGender] = useState("Boys");
  const key = `${ageGroup}|${gender}`;
  const [loaded, setLoaded] = useState<{ key: string; teams: ProvenTeam[]; untested: Untested[]; untestedCount: number } | null>(null);
  // the shown data belongs to the current selection, or it's still loading
  const data = loaded?.key === key ? loaded : null;

  useEffect(() => {
    let live = true;
    fetch(`/api/proven?${new URLSearchParams({ ageGroup, gender })}`).then((r) => r.json()).then((d) => live && setLoaded({ key: `${ageGroup}|${gender}`, ...d }));
    return () => { live = false; };
  }, [ageGroup, gender]);

  const teams = data?.teams ?? [];
  // untested teams that would rank inside the shown top 25
  const cut = teams[Math.min(24, teams.length - 1)]?.score ?? Infinity;
  const strongUntested = (data?.untested ?? []).filter((t) => t.score >= cut);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="display mb-3">Proven <span className="tail">tested across leagues.</span></h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Teams ranked by rating once that rating has been tested: at least {MIN_CROSS} games in the last 15 months
          against teams from other leagues. Games inside a league only put its teams in order; games between leagues
          show how strong they really are.{" "}
          <Link href="/findings" className="font-medium text-foreground underline underline-offset-4">Why this matters</Link>
        </p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Select items={AGE_ITEMS} value={ageGroup} onValueChange={(v) => v !== null && setAgeGroup(v)}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>{AGE_ITEMS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select items={GENDER_ITEMS} value={gender} onValueChange={(v) => v !== null && setGender(v)}>
          <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
          <SelectContent>{GENDER_ITEMS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
        </Select>
        {data && <span className="lowbrow ml-2">{teams.length} proven · {data.untestedCount} not yet tested</span>}
      </div>

      {strongUntested.length > 0 && (
        <p className="mb-6 rounded-lg bg-muted px-4 py-3 text-sm leading-relaxed">
          Rated high enough for this list but not yet tested against other leagues:{" "}
          {strongUntested.map((t, i) => (
            <span key={t.id}>
              {i > 0 && ", "}
              <Link href={`/team/${t.id}`} className="font-medium hover:text-primary">{t.name}</Link>{" "}
              <span className="tabular-nums text-muted-foreground">({t.score.toFixed(1)})</span>
            </span>
          ))}
          .
        </p>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="heading-sm">{ageGroup} {gender}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!data ? (
            <div className="p-8 text-center text-muted-foreground">Loading…</div>
          ) : !teams.length ? (
            <div className="p-8 text-center text-muted-foreground">No team in this age group has {MIN_CROSS}+ games against other leagues yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-sm sm:table-auto">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="w-10 px-4 py-2 sm:w-14">#</th>
                    <th className="px-4 py-2">Team</th>
                    <th className="hidden px-4 py-2 md:table-cell">League</th>
                    <th className="w-16 px-4 py-2 text-right sm:w-20" title="Rating in goals: expected goal difference against an average team">Rating</th>
                    <th className="hidden px-4 py-2 text-right sm:table-cell" title="Where the rating landed in 80% of re-runs with the games between leagues reshuffled">Likely range</th>
                    <th className="hidden px-4 py-2 text-right sm:table-cell" title="Win-draw-loss against teams whose own league is different, last 15 months">vs other leagues</th>
                    <th className="hidden px-4 py-2 text-right lg:table-cell" title="Win-draw-loss against the age group's 25 highest-rated teams, last 15 months">vs top 25</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.slice(0, 100).map((t) => (
                    <tr key={t.id} className="border-b border-border/50 transition-colors hover:bg-muted/50">
                      <td className="rank-num px-4 py-2.5">{t.provenRank}</td>
                      <td className="px-4 py-2.5">
                        <TeamNameCell id={t.id} name={t.name} program={t.program}
                          meta={[t.range ? `likely ${t.range[0].toFixed(1)}–${t.range[1].toFixed(1)}` : null, `${rec(t.cross)} vs other leagues`, n(t.top25) ? `${rec(t.top25)} vs top 25` : null].filter(Boolean).join(" · ")} />
                      </td>
                      <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">{t.league ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{t.score.toFixed(2)}</td>
                      <td className="hidden px-4 py-2.5 text-right tabular-nums text-muted-foreground sm:table-cell">{t.range ? `${t.range[0].toFixed(1)}–${t.range[1].toFixed(1)}` : "—"}</td>
                      <td className="hidden px-4 py-2.5 text-right tabular-nums text-muted-foreground sm:table-cell">{rec(t.cross)}</td>
                      <td className="hidden px-4 py-2.5 text-right tabular-nums text-muted-foreground lg:table-cell">{n(t.top25) ? rec(t.top25) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      {teams.length > 100 && <p className="mt-3 text-xs text-muted-foreground">Showing the top 100 of {teams.length} proven teams.</p>}
    </div>
  );
}
