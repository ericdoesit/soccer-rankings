import Link from "next/link";
import { notFound } from "next/navigation";
import { AGE_ORDER, areaBySlug, getClubRow, getLeague } from "@/lib/explore";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function LeaguePage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ state?: string }>;
}) {
  const { slug } = await params;
  const { state } = await searchParams;
  const league = getLeague(slug);
  if (!league) notFound();
  const area = state ? areaBySlug(state) : null;

  const rows = [...league.clubs.entries()]
    .map(([clubSlug, teamIds]) => {
      const club = getClubRow(clubSlug)!;
      const ids = new Set(teamIds);
      const teams = club.teams.filter((t) => ids.has(t.id));
      const ages = [...new Set(teams.map((t) => t.ageGroup))].sort((a, b) => AGE_ORDER.indexOf(a) - AGE_ORDER.indexOf(b));
      const best = teams.reduce<number | null>((m, t) => (t.rank !== null && (m === null || t.rank < m) ? t.rank : m), null);
      return { club, teams, ages, best };
    })
    .filter((r) => !area || r.club.area?.code === area.code)
    .sort((a, b) => b.teams.length - a.teams.length);
  const teamCount = rows.reduce((n, r) => n + r.teams.length, 0);
  const season = league.seasons[0];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <p className="text-sm text-muted-foreground">
        <Link href="/states" className="hover:text-primary">States</Link>
        {area && <> / <Link href={`/state/${area.slug}`} className="hover:text-primary">{area.name}</Link></>}
        {" "}/ {league.name}
      </p>
      <h1 className="heading mt-1">{league.name}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {league.tier && league.tier !== "CUP" && <Badge variant="secondary">{league.tier}</Badge>}
        {league.kind === "cup" && <Badge variant="secondary">Cup</Badge>}
        <span>{season.season} season</span>
        <span>&middot;</span>
        <span>{rows.length} clubs · {teamCount.toLocaleString()} teams{area ? ` from ${area.name}` : ""}</span>
        {league.def?.website && (
          <>
            <span>&middot;</span>
            <a href={`https://${league.def.website}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              {league.def.website}
            </a>
          </>
        )}
      </div>
      {area && (
        <p className="mt-2 text-sm">
          <Link href={`/league/${league.slug}`} className="text-primary hover:underline">Show clubs from every state</Link>
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Schedules: {season.events.join(" · ")}
        {league.seasons.length > 1 && <> (earlier seasons: {league.seasons.slice(1).map((s) => s.season).join(", ")})</>}
      </p>

      <Card className="mt-6">
        <CardHeader><CardTitle className="heading">Clubs</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2">Club</th>
                <th className="px-4 py-2 hidden sm:table-cell">State</th>
                <th className="px-4 py-2 text-right">Teams</th>
                <th className="px-4 py-2 hidden md:table-cell">Ages</th>
                <th className="px-4 py-2 text-right hidden sm:table-cell">Best rank</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ club, teams, ages, best }) => (
                <tr key={club.slug} className="border-b last:border-b-0 border-border/50 hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-2.5">
                    <Link href={`/club/${club.slug}`} className="font-medium hover:text-primary transition-colors">{club.name}</Link>
                  </td>
                  <td className="px-4 py-2.5 hidden sm:table-cell text-muted-foreground">{club.area?.short ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">{teams.length}</td>
                  <td className="px-4 py-2.5 hidden md:table-cell text-muted-foreground text-xs">
                    {ages.length > 1 ? `${ages[0]}–${ages[ages.length - 1]}` : ages[0]}
                  </td>
                  <td className="px-4 py-2.5 text-right hidden sm:table-cell text-muted-foreground">{best ? `#${best}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
