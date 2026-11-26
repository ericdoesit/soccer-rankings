"use client";

/**
 * League page tables (rankings within the league, clubs): same look, 25-row pages and club/team
 * search as the Southern California tables (src/components/table-tools.tsx).
 */
import Link from "next/link";
import type { LeagueRankRow } from "@/lib/league-rankings";
import { NoMatch, Pager, SearchBox, TableBar, rowClass, td, th, useTable } from "@/components/table-tools";

export function LeagueTeamTable({ rows, caption }: { rows: LeagueRankRow[]; caption: string }) {
  const t = useTable(rows, (r) => [r.name]);
  return (
    <>
      <TableBar caption={caption}>
        <SearchBox id="league-team-suggest" query={t.query} setQuery={t.setQuery} suggestions={t.suggestions} />
      </TableBar>
      <div className="overflow-x-auto">
        {/* fixed column widths, so switching age group or flight doesn't shift the columns */}
        <table className="w-full table-fixed text-sm" data-no-sort>
          <thead>
            <tr className="border-b border-border">
              <th className={`${th} w-12 sm:w-16`}>#</th>
              <th className={th}>Team</th>
              <th className={`${th} hidden lg:table-cell w-56`}>Division</th>
              <th className={`${th} w-16 text-right`}>Rating</th>
              <th className={`${th} hidden sm:table-cell w-28 text-center`}>League W-D-L</th>
              <th className={`${th} hidden md:table-cell w-24 text-right`}>West rank</th>
            </tr>
          </thead>
          <tbody>
            {t.shown.map((r) => (
              <tr key={r.teamId} className={rowClass}>
                <td className={`${td} rank-num`}>{r.rank}</td>
                <td className={`${td} min-w-0`}>
                  <Link href={`/team/${r.teamId}`} className="block truncate font-medium hover:text-primary" title={r.name}>{r.name}</Link>
                  <span className="block truncate text-xs text-muted-foreground lg:hidden">
                    {[r.division, `${r.w}-${r.d}-${r.l} league`].filter(Boolean).join(" · ")}
                  </span>
                </td>
                <td className={`${td} hidden lg:table-cell truncate text-muted-foreground`} title={r.division ?? undefined}>{r.division ?? "—"}</td>
                <td className={`${td} text-right tabular-nums font-medium`}>{r.rating.toFixed(2)}</td>
                <td className={`${td} hidden sm:table-cell text-center tabular-nums text-muted-foreground`}>{r.w}-{r.d}-{r.l}</td>
                <td className={`${td} hidden md:table-cell text-right tabular-nums text-muted-foreground`}>{r.westRank ? `#${r.westRank}` : "—"}</td>
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

export interface LeagueClubRow { slug: string; club: string; state: string | null; teams: number; ages: string; best: number | null }

export function LeagueClubTable({ rows, caption }: { rows: LeagueClubRow[]; caption: string }) {
  const t = useTable(rows);
  return (
    <>
      <TableBar caption={caption}>
        <SearchBox id="league-club-suggest" query={t.query} setQuery={t.setQuery} suggestions={t.suggestions} />
      </TableBar>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-sm" data-no-sort>
          <thead>
            <tr className="border-b border-border">
              <th className={th}>Club</th>
              <th className={`${th} hidden sm:table-cell w-20`}>State</th>
              <th className={`${th} w-20 text-center`}>Teams</th>
              <th className={`${th} hidden md:table-cell w-28 text-center`}>Ages</th>
              <th className={`${th} hidden sm:table-cell w-24 text-right`}>Best rank</th>
            </tr>
          </thead>
          <tbody>
            {t.shown.map((c) => (
              <tr key={c.slug} className={rowClass}>
                <td className={`${td} min-w-0`}>
                  <Link href={`/club/${c.slug}`} className="block truncate font-medium hover:text-primary" title={c.club}>{c.club}</Link>
                </td>
                <td className={`${td} hidden sm:table-cell text-muted-foreground`}>{c.state ?? "—"}</td>
                <td className={`${td} text-center tabular-nums`}>{c.teams}</td>
                <td className={`${td} hidden md:table-cell text-center tabular-nums text-muted-foreground`}>{c.ages}</td>
                <td className={`${td} hidden sm:table-cell text-right tabular-nums text-muted-foreground`}>{c.best ? `#${c.best}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <NoMatch show={!t.shown.length} what="clubs" query={t.query} />
      </div>
      <Pager current={t.current} pages={t.pages} total={t.filtered.length} setPage={t.setPage} />
    </>
  );
}
