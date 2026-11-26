"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { NoMatch, Pager, SearchBox, TableBar, rowClass, td, th, useTable } from "@/components/table-tools";
import { chip } from "@/lib/ui-classes";

/**
 * Proven rankings: the age group's teams whose ratings have been tested against other leagues
 * (src/lib/data.ts getProvenRankings), ranked by rating. Replaced the composite Power Rankings.
 * Same layout as the Southern California page: chips for gender and age, 25-row pages, search.
 */
const AGES = ["U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17", "U18", "U19", "U20"];
const MIN_CROSS = 8;

type Rec = { w: number; d: number; l: number };
interface ProvenTeam {
  id: number; name: string; club: string; program?: string; score: number; provenRank: number;
  range: [number, number] | null; league: string | null; cross: Rec; top25: Rec;
}
interface Untested { id: number; name: string; score: number }
const rec = (r: Rec) => `${r.w}-${r.d}-${r.l}`;
const n = (r: Rec) => r.w + r.d + r.l;

function ProvenTable({ teams, caption }: { teams: ProvenTeam[]; caption: string }) {
  const t = useTable(teams, (r) => [r.name, r.league ?? ""]);
  return (
    <>
      <TableBar caption={caption}>
        <SearchBox id="proven-suggest" query={t.query} setQuery={t.setQuery} suggestions={t.suggestions} />
      </TableBar>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-sm" data-no-sort>
          <thead>
            <tr className="border-b border-border">
              <th className={`${th} w-12 sm:w-16`}>#</th>
              <th className={th}>Team</th>
              <th className={`${th} hidden lg:table-cell w-48`}>League</th>
              <th className={`${th} w-16 text-right`} title="Rating in goals: expected goal difference against an average team">Rating</th>
              <th className={`${th} hidden sm:table-cell w-28 text-center`} title="Where the rating landed in 80% of re-runs with the games between leagues reshuffled">Likely range</th>
              <th className={`${th} hidden sm:table-cell w-32 text-center`} title="Win-draw-loss against teams whose own league is different, last 15 months">vs other leagues</th>
              <th className={`${th} hidden md:table-cell w-24 text-center`} title="Win-draw-loss against the age group's 25 highest-rated teams, last 15 months">vs top 25</th>
            </tr>
          </thead>
          <tbody>
            {t.shown.map((r) => (
              <tr key={r.id} className={rowClass}>
                <td className={`${td} rank-num`}>{r.provenRank}</td>
                <td className={`${td} min-w-0`}>
                  <Link href={`/team/${r.id}`} className="block truncate font-medium hover:text-primary" title={r.name}>{r.name}</Link>
                  <span className="block truncate text-xs text-muted-foreground lg:hidden">
                    {[r.league, `${rec(r.cross)} vs other leagues`].filter(Boolean).join(" · ")}
                  </span>
                </td>
                <td className={`${td} hidden lg:table-cell truncate text-muted-foreground`} title={r.league ?? undefined}>{r.league ?? "—"}</td>
                <td className={`${td} text-right tabular-nums font-medium`}>{r.score.toFixed(2)}</td>
                <td className={`${td} hidden sm:table-cell text-center tabular-nums text-muted-foreground`}>{r.range ? `${r.range[0].toFixed(1)}–${r.range[1].toFixed(1)}` : "—"}</td>
                <td className={`${td} hidden sm:table-cell text-center tabular-nums text-muted-foreground`}>{rec(r.cross)}</td>
                <td className={`${td} hidden md:table-cell text-center tabular-nums text-muted-foreground`}>{n(r.top25) ? rec(r.top25) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <NoMatch show={!t.shown.length} what="teams" query={t.query} />
      </div>
      <Pager current={t.current} pages={t.pages} total={t.filtered.length} setPage={t.setPage} />
    </>
  );
}

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
  // untested teams that would rank inside the top 25
  const cut = teams[Math.min(24, teams.length - 1)]?.score ?? Infinity;
  const strongUntested = (data?.untested ?? []).filter((t) => t.score >= cut);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="display mb-3">Proven <span className="tail">tested across leagues.</span></h1>
      <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
        Teams ranked by rating once that rating has been tested: at least {MIN_CROSS} games in the last 15 months against
        teams from other leagues. Games inside a league only put its teams in order; games between leagues show how strong
        they really are. Likely range is where the rating landed in 80% of re-runs with the games between leagues
        reshuffled.{" "}
        <Link href="/findings" className="font-medium text-foreground underline underline-offset-4">Why this matters</Link>
      </p>

      <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Gender">
        {["Boys", "Girls"].map((g) => (
          <button key={g} type="button" onClick={() => setGender(g)} aria-pressed={gender === g} className={chip(gender === g)}>{g}</button>
        ))}
      </div>
      <div className="mb-5 flex flex-wrap gap-1.5" role="group" aria-label="Age group">
        {AGES.map((a) => (
          <button key={a} type="button" onClick={() => setAgeGroup(a)} aria-pressed={ageGroup === a} className={chip(ageGroup === a)}>
            {a === "U20" ? "U20 (USL Academy)" : a}
          </button>
        ))}
      </div>

      {strongUntested.length > 0 && (
        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
          Rated high enough for this list but not yet tested against other leagues:{" "}
          {strongUntested.map((t, i) => (
            <span key={t.id}>
              {i > 0 && ", "}
              <Link href={`/team/${t.id}`} className="font-medium text-foreground hover:text-primary">{t.name}</Link>{" "}
              <span className="tabular-nums">({t.score.toFixed(1)})</span>
            </span>
          ))}
          .
        </p>
      )}

      <Card className="gap-0 pb-0">
        <CardContent className="p-0">
          {!data ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : !teams.length ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No team in this age group has {MIN_CROSS}+ games against other leagues yet.</div>
          ) : (
            <ProvenTable key={key} teams={teams}
              caption={`${teams.length} proven ${ageGroup} ${gender.toLowerCase()} teams · ${data.untestedCount} not yet tested`} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
