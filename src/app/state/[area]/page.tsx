import Link from "next/link";
import { notFound } from "next/navigation";
import type { Area } from "@/lib/explore";
import { getStatePage, type StatePageLeague } from "@/lib/page-data";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function LeagueTable({ rows, area }: { rows: StatePageLeague[]; area: Area }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs text-muted-foreground">
          <th className="px-4 py-2">Name</th>
          <th className="px-4 py-2 hidden sm:table-cell">Tier</th>
          <th className="px-4 py-2 text-right">{area.name} teams</th>
          <th className="px-4 py-2 text-right hidden sm:table-cell">Clubs</th>
          <th className="px-4 py-2 text-right hidden md:table-cell">Season</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((l) => (
          <tr key={l.slug} className="border-b last:border-b-0 border-border/50 hover:bg-muted/50 transition-colors">
            <td className="px-4 py-2.5">
              <Link href={`/league/${l.slug}?state=${area.slug}`} className="font-medium hover:text-primary transition-colors">
                {l.name}
              </Link>
            </td>
            <td className="px-4 py-2.5 hidden sm:table-cell">
              {l.tier && l.tier !== "CUP" ? <Badge variant="secondary">{l.tier}</Badge> : <span className="text-muted-foreground">—</span>}
            </td>
            <td className="px-4 py-2.5 text-right">{l.areaTeams.toLocaleString()}</td>
            <td className="px-4 py-2.5 text-right hidden sm:table-cell text-muted-foreground">{l.clubs}</td>
            <td className="px-4 py-2.5 text-right hidden md:table-cell text-muted-foreground">{l.season}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function StatePage({ params }: { params: Promise<{ area: string }> }) {
  const { area: slug } = await params;
  // precomputed with the data build (src/lib/page-data.ts): a cold server skips the snapshot
  const data = getStatePage(slug);
  if (!data) notFound();
  const { area, leagues, clubs } = data;
  const leagueRows = leagues.filter((l) => l.kind === "league");
  const cups = leagues.filter((l) => l.kind === "cup");
  const clubRows = clubs;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <p className="text-sm text-muted-foreground">
        <Link href="/states" className="hover:text-primary">States</Link> / {area.name}
      </p>
      <h1 className="display mt-1">{area.name}</h1>
      <p className="body-text mt-1 text-muted-foreground">
        {leagueRows.length} leagues · {clubs.length} clubs · {data.teams.toLocaleString()} teams
      </p>

      <Card className="mt-6">
        <CardHeader><CardTitle className="heading-sm">Leagues</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {leagueRows.length ? <LeagueTable rows={leagueRows} area={area} /> : (
            <p className="px-4 pb-4 text-sm text-muted-foreground">No league schedules collected for {area.name} yet.</p>
          )}
        </CardContent>
      </Card>

      {cups.length > 0 && (
        <Card className="mt-6">
          <CardHeader><CardTitle className="heading-sm">Cups</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto"><LeagueTable rows={cups} area={area} /></CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader><CardTitle className="heading-sm">Clubs</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2">Club</th>
                <th className="px-4 py-2 text-right">Teams</th>
                <th className="px-4 py-2 text-right hidden sm:table-cell">Ranked</th>
                <th className="px-4 py-2 text-right hidden sm:table-cell">Best rank</th>
                <th className="px-4 py-2 text-right hidden md:table-cell">Leagues</th>
              </tr>
            </thead>
            <tbody>
              {clubRows.map((c) => (
                <tr key={c.slug} className="border-b last:border-b-0 border-border/50 hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-2.5">
                    <Link href={`/club/${c.slug}`} className="font-medium hover:text-primary transition-colors">{c.name}</Link>
                  </td>
                  <td className="px-4 py-2.5 text-right">{c.teams}</td>
                  <td className="px-4 py-2.5 text-right hidden sm:table-cell text-muted-foreground">{c.ranked}</td>
                  <td className="px-4 py-2.5 text-right hidden sm:table-cell text-muted-foreground">{c.bestRank ? `#${c.bestRank}` : "—"}</td>
                  <td className="px-4 py-2.5 text-right hidden md:table-cell text-muted-foreground">{c.leagues}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
