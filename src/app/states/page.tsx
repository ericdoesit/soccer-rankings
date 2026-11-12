import Link from "next/link";
import { getAreas } from "@/lib/explore";
import { Card, CardContent } from "@/components/ui/card";
import { WestMap } from "@/components/west-map";

export const metadata = { title: "States · Youth Soccer Rankings" };

export default function StatesPage() {
  const areas = getAreas();
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="heading">West states</h1>
      <p className="body-text mt-1 text-muted-foreground">
        Pick a state to see its leagues, clubs and teams. California is split into Cal South and Cal North,
        the two state associations.
      </p>

      <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,380px)_1fr] md:items-start">
        <WestMap
          className="w-full max-w-[380px] mx-auto"
          areas={areas.map(({ area, clubs, teams }) => ({ code: area.code, slug: area.slug, name: area.name, teams, clubs: clubs.length }))}
        />
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2">State</th>
                  <th className="px-4 py-2 text-right">Leagues</th>
                  <th className="px-4 py-2 text-right">Clubs</th>
                  <th className="px-4 py-2 text-right">Teams</th>
                  <th className="px-4 py-2 text-right hidden sm:table-cell">Ranked teams</th>
                </tr>
              </thead>
              <tbody>
                {areas.map(({ area, leagues, clubs, teams, ranked }) => (
                  <tr key={area.code} className="border-b last:border-b-0 border-border/50 hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-2.5">
                      <Link href={`/state/${area.slug}`} className="font-medium hover:text-primary transition-colors">
                        {area.name}
                      </Link>
                      <span className="ml-2 text-xs text-muted-foreground">{area.short}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">{leagues.filter((l) => l.kind === "league").length}</td>
                    <td className="px-4 py-2.5 text-right">{clubs.length}</td>
                    <td className="px-4 py-2.5 text-right">{teams.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right hidden sm:table-cell text-muted-foreground">{ranked.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Counts cover teams that played in the last 15 months. States with few leagues listed are still being crawled.
      </p>
    </div>
  );
}
