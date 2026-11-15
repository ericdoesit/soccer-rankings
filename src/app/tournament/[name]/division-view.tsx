import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTeamName } from "@/lib/data";
import { formatDates } from "@/lib/events";
import type { TournamentView, Division } from "@/lib/tournament-view";
import { chip } from "@/lib/ui-classes";

const pct = (c: number, n: number) => (n ? `${Math.round((100 * c) / n)}%` : "—");

function Picks({ c, n }: { c: number; n: number }) {
  if (!n) return <span className="text-xs text-muted-foreground">no rated matchups</span>;
  return <span className="text-xs text-muted-foreground">ratings picked {c} of {n} winners ({pct(c, n)})</span>;
}

function DivisionCard({ d }: { d: Division }) {
  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle className="heading-sm">{d.label}</CardTitle>
          <Picks c={d.picks.correct} n={d.picks.decided} />
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-2 w-8">#</th>
              <th className="px-4 py-2">Team</th>
              <th className="px-3 py-2 text-right">W-D-L</th>
              <th className="px-3 py-2 text-right hidden sm:table-cell">GF-GA</th>
              <th className="px-3 py-2 text-right">Pts</th>
              <th className="px-3 py-2 text-right" title="Current rating">Rating</th>
              <th className="px-4 py-2 text-right" title="Rank among listed West teams of this age and gender">West rank</th>
            </tr>
          </thead>
          <tbody>
            {d.standings.map((r, i) => (
              <tr key={r.teamId} className={`border-b last:border-b-0 border-border/50 ${i === 0 ? "bg-primary/5" : ""}`}>
                <td className="px-4 py-2 tabular-nums text-muted-foreground">{i === 0 ? "🏆" : i + 1}</td>
                <td className="px-4 py-2">
                  <Link href={`/team/${r.teamId}`} className="font-medium hover:text-primary">{r.name}</Link>
                  {r.clubSlug && <Link href={`/club/${r.clubSlug}`} className="ml-2 text-xs text-muted-foreground hover:text-primary">{r.club}</Link>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.w}-{r.d}-{r.l}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground hidden sm:table-cell">{r.gf}-{r.ga}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.pts}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.rating === null ? "—" : r.rating.toFixed(1)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.westRank ? `#${r.westRank}` : <span className="text-muted-foreground">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <details className="border-t border-[var(--surface-line)]">
          <summary className="cursor-pointer px-6 py-4 text-xs text-muted-foreground hover:text-foreground">{d.games.length} games</summary>
          <div className="divide-y divide-border/50">
            {d.games.map((g) => (
              <Link key={g.id} href={`/match/${g.id}`} className="flex items-center gap-3 px-6 py-2 text-sm hover:bg-muted/50">
                <span className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums">{formatDates(g.date)}</span>
                <span className={`flex-1 truncate text-right ${g.hs > g.as ? "font-semibold" : "text-muted-foreground"}`}>{getTeamName(g.home)}</span>
                <span className="tabular-nums font-semibold">{g.hs}–{g.as}</span>
                <span className={`flex-1 truncate ${g.as > g.hs ? "font-semibold" : "text-muted-foreground"}`}>{getTeamName(g.away)}</span>
                <span className="w-5 text-center text-xs" title={g.pick === null ? "draw or unrated team" : g.pick ? "higher-rated team won" : "upset: lower-rated team won"}>
                  {g.pick === null ? "" : g.pick ? "✓" : "✗"}
                </span>
              </Link>
            ))}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

export function DivisionView({ v, age, tabs }: { v: TournamentView; age: string | null; tabs: React.ReactNode }) {
  const groups = age ? v.groups.filter((g) => g.key === age) : v.groups;
  const base = `/tournament/${encodeURIComponent(v.name)}`;
  const pill = chip;
  const short = (g: { gender: string; ageGroup: string }) => `${g.gender === "Girls" ? "G" : "B"}${g.ageGroup}`;
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="display mb-2">{v.name.trim()}</h1>
      <p className="lowbrow mb-4">
        {formatDates(v.start, v.end)} · {v.games.toLocaleString()} games · {v.teams.toLocaleString()} teams ·{" "}
        {v.groups.reduce((n, g) => n + g.divisions.length, 0)} divisions
      </p>
      {tabs}
      <Card className="mb-6">
        <CardContent className="text-sm">
          <p>
            <span className="font-semibold">Ratings check:</span>{" "}
            {v.picks.decided
              ? <>the higher-rated team won {v.picks.correct} of {v.picks.decided} games with a winner ({pct(v.picks.correct, v.picks.decided)}); {v.picks.draws} games were draws.</>
              : <>not enough rated teams here to check (young age groups often have no ratings yet).</>}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Uses today&apos;s ratings, which already include these games, so it flatters the ratings for older events.
            🏆 marks the team on top of the group by points (3 for a win, 1 for a draw); playoff and final games are counted the same as group games.
          </p>
        </CardContent>
      </Card>
      <div className="mb-6 flex flex-wrap gap-2">
        <Link href={base} scroll={false} className={pill(!age)}>All ages</Link>
        {v.groups.map((g) => (
          <Link key={g.key} href={`${base}?age=${encodeURIComponent(g.key)}`} scroll={false} className={pill(age === g.key)}>{short(g)}</Link>
        ))}
      </div>
      {groups.map((g) => (
        <section key={g.key} className="mb-8">
          <p className="lowbrow mb-3">{g.gender} {g.ageGroup}</p>
          {g.divisions.map((d) => <DivisionCard key={d.key} d={d} />)}
        </section>
      ))}
    </div>
  );
}
