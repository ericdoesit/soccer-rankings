import Link from "next/link";
import { notFound } from "next/navigation";
import { getTournamentGames, getTeamName } from "@/lib/data";
import { Card, CardContent } from "@/components/ui/card";

// Big leagues have 20K+ games; rendering them all produced a 32 MB page.
const PAGE_SIZE = 300;

export default async function TournamentPage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { name } = await params;
  const tournamentName = decodeURIComponent(name);
  const games = getTournamentGames(tournamentName);
  if (games.length === 0) notFound();

  const teams = new Set<number>();
  for (const g of games) {
    teams.add(g.team1Id);
    teams.add(g.team2Id);
  }

  const pageCount = Math.ceil(games.length / PAGE_SIZE);
  const requested = Number((await searchParams).page);
  const page = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), pageCount) : 1;
  const pageGames = games.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageHref = (p: number) => `/tournament/${encodeURIComponent(tournamentName)}?page=${p}`;

  // Group by date
  const byDate = new Map<string, typeof games>();
  for (const g of pageGames) {
    const date = g.date || "Unknown";
    const existing = byDate.get(date) || [];
    existing.push(g);
    byDate.set(date, existing);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="heading mb-2">{tournamentName}</h1>
      <div className="flex gap-4 mb-8">
        <span className="lowbrow">{games.length} games</span>
        <span className="lowbrow">{teams.size} teams</span>
        {pageCount > 1 && (
          <span className="lowbrow">
            page {page} of {pageCount}
          </span>
        )}
      </div>

      {Array.from(byDate.entries()).map(([date, dateGames]) => (
        <div key={date} className="mb-6">
          <p className="lowbrow mb-3">{date}</p>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border/50">
                {dateGames.map((game) => (
                  <Link
                    key={game.id}
                    href={`/match/${game.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm truncate ${
                          game.team1Score > game.team2Score
                            ? "font-semibold"
                            : "text-muted-foreground"
                        }`}
                      >
                        {getTeamName(game.team1Id)}
                      </p>
                      <p
                        className={`text-sm truncate ${
                          game.team2Score > game.team1Score
                            ? "font-semibold"
                            : "text-muted-foreground"
                        }`}
                      >
                        {getTeamName(game.team2Id)}
                      </p>
                    </div>
                    <div className="ml-4 text-right">
                      <p
                        className={`text-sm ${
                          game.team1Score > game.team2Score
                            ? "font-semibold"
                            : "text-muted-foreground"
                        }`}
                      >
                        {game.team1Score}
                      </p>
                      <p
                        className={`text-sm ${
                          game.team2Score > game.team1Score
                            ? "font-semibold"
                            : "text-muted-foreground"
                        }`}
                      >
                        {game.team2Score}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ))}

      {pageCount > 1 && (
        <nav className="flex items-center justify-between mt-8" aria-label="Pages">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="text-sm text-primary hover:underline">&larr; Newer games</Link>
          ) : <span />}
          <span className="lowbrow">page {page} of {pageCount}</span>
          {page < pageCount ? (
            <Link href={pageHref(page + 1)} className="text-sm text-primary hover:underline">Older games &rarr;</Link>
          ) : <span />}
        </nav>
      )}
    </div>
  );
}
