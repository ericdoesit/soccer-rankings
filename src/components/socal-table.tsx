"use client";

/**
 * Southern California rankings table: 25 rows a page with club/team search (src/components/table-tools.tsx,
 * shared with the league pages). Rows keep their rank in the full list while filtered.
 */
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import type { SoCalClub, SoCalTeam } from "@/lib/socal";
import { NoMatch, Pager, SearchBox, TableBar, td, th, useTable } from "@/components/table-tools";

type Props = { caption: string } & ({ kind: "teams"; rows: SoCalTeam[] } | { kind: "clubs"; rows: SoCalClub[] });

export function SoCalTable(props: Props) {
  const { caption, kind } = props;
  const t = useTable<SoCalTeam | SoCalClub>(props.rows, (r) => ("name" in r ? [r.name] : []));
  const shown = t.shown;

  return (
    <Card className="gap-0 pb-0">
      <CardContent className="p-0">
        <TableBar caption={caption}>
          <SearchBox id="socal-suggest" query={t.query} setQuery={t.setQuery} suggestions={t.suggestions} />
        </TableBar>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm" data-no-sort>
            {kind === "teams" ? (
              <>
                <thead>
                  <tr className="border-b border-border">
                    <th className={`${th} w-12 sm:w-16`}>#</th>
                    <th className={th}>Team</th>
                    <th className={`${th} hidden lg:table-cell w-56`}>League</th>
                    <th className={`${th} w-16 text-right`}>Rating</th>
                    <th className={`${th} hidden sm:table-cell w-28 text-center`}>This season</th>
                    <th className={`${th} hidden md:table-cell w-24 text-right`}>West rank</th>
                  </tr>
                </thead>
                <tbody>
                  {(shown as SoCalTeam[]).map((t) => (
                    <tr key={t.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                      <td className={`${td} rank-num`}>{t.rank}</td>
                      <td className={`${td} min-w-0`}>
                        <Link href={`/team/${t.id}`} className="block truncate font-medium hover:text-primary" title={t.name}>{t.name}</Link>
                        <span className="block truncate text-xs text-muted-foreground lg:hidden">{t.league}</span>
                      </td>
                      <td className={`${td} hidden lg:table-cell truncate text-muted-foreground`} title={t.league}>{t.league}</td>
                      <td className={`${td} text-right tabular-nums font-medium`}>{t.rating.toFixed(2)}</td>
                      <td className={`${td} hidden sm:table-cell text-center tabular-nums text-muted-foreground`}>{t.record}</td>
                      <td className={`${td} hidden md:table-cell text-right tabular-nums text-muted-foreground`}>{t.westRank ? `#${t.westRank}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </>
            ) : (
              <>
                <thead>
                  <tr className="border-b border-border">
                    <th className={`${th} w-12 sm:w-16`}>#</th>
                    <th className={th}>Club</th>
                    <th className={`${th} w-20 text-right`}>Strength</th>
                    <th className={`${th} hidden sm:table-cell w-24 text-center`}>Age groups</th>
                    <th className={`${th} hidden sm:table-cell w-20 text-center`}>Teams</th>
                    <th className={`${th} hidden lg:table-cell w-64`}>Leagues</th>
                  </tr>
                </thead>
                <tbody>
                  {(shown as SoCalClub[]).map((c) => (
                    <tr key={c.club} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                      <td className={`${td} rank-num`}>{c.rank}</td>
                      <td className={`${td} min-w-0`}>
                        <Link href={`/club/${c.slug}`} className="block truncate font-medium hover:text-primary" title={c.club}>{c.club}</Link>
                        {c.best && (
                          <span className="block truncate text-xs text-muted-foreground">
                            best: {c.best.ageGroup} {c.best.gender.toLowerCase()}, top {Math.max(1, Math.round(100 - c.best.percentile))}%
                          </span>
                        )}
                      </td>
                      <td className={`${td} text-right tabular-nums font-medium`}>{c.strength.toFixed(1)}</td>
                      <td className={`${td} hidden sm:table-cell text-center tabular-nums text-muted-foreground`}>{c.ageGroups}</td>
                      <td className={`${td} hidden sm:table-cell text-center tabular-nums text-muted-foreground`}>{c.teams}</td>
                      <td className={`${td} hidden lg:table-cell truncate text-muted-foreground`} title={c.leagues.join(", ")}>{c.leagues.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}
          </table>
          <NoMatch show={!shown.length} what={kind} query={t.query} />
        </div>
        <Pager current={t.current} pages={t.pages} total={t.filtered.length} setPage={t.setPage} />
      </CardContent>
    </Card>
  );
}
