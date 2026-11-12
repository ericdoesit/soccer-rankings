import Link from "next/link";
import { notFound } from "next/navigation";
import { getTeamById } from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const team = getTeamById(parseInt(id));
  if (!team) notFound();

  const formBadge = (result: "W" | "L" | "D") => {
    const colors = {
      W: "bg-green-600 text-white",
      L: "bg-red-600 text-white",
      D: "bg-yellow-600 text-white",
    };
    return (
      <span className={`inline-flex h-6 w-6 items-center justify-center rounded text-xs font-bold ${colors[result]}`}>
        {result}
      </span>
    );
  };

  const recentForm = team.games.slice(0, 5);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Team Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="heading">{team.name}</h1>
            <p className="mt-1 text-muted-foreground">
              <Link
                href={`/club/${encodeURIComponent(team.club)}`}
                className="hover:text-primary transition-colors"
              >
                {team.club}
              </Link>
              {" "}&middot; {team.state} &middot; {team.ageGroup} {team.gender}
            </p>
          </div>
          <div className="text-right">
            <p className="text-4xl font-bold">{team.score.toFixed(1)}</p>
            <p className="lowbrow mt-1">Rating</p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold">#{team.rank}</p>
              <p className="lowbrow mt-1">National Rank</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold">{team.gamesPlayed}</p>
              <p className="lowbrow mt-1">Games</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold text-green-500">{team.wins}</p>
              <p className="lowbrow mt-1">Wins</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold text-red-500">{team.losses}</p>
              <p className="lowbrow mt-1">Losses</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold text-yellow-500">{team.draws}</p>
              <p className="lowbrow mt-1">Draws</p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Form */}
        <div className="mt-4 flex items-center gap-2">
          <span className="text-sm text-muted-foreground mr-1">Form:</span>
          {recentForm.map((g) => (
            <Link key={g.id} href={`/match/${g.id}`}>
              {formBadge(g.result)}
            </Link>
          ))}
        </div>
      </div>

      {/* Game History */}
      <Card>
        <CardHeader>
          <CardTitle className="heading">Game History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Opponent</th>
                  <th className="px-4 py-2 text-center">Result</th>
                  <th className="px-4 py-2 text-center">Score</th>
                  <th className="px-4 py-2 hidden sm:table-cell">Event</th>
                </tr>
              </thead>
              <tbody>
                {team.games.map((game) => (
                  <tr
                    key={game.id}
                    className="border-b last:border-b-0 border-border/50 hover:bg-muted/50 transition-colors"
                  >
                    <td className="px-4 py-2.5 text-muted-foreground">{game.date}</td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/team/${game.opponentId}`}
                        className="hover:text-primary transition-colors"
                      >
                        {game.opponentName}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {formBadge(game.result)}
                    </td>
                    <td className="px-4 py-2.5 text-center font-semibold">
                      <Link
                        href={`/match/${game.id}`}
                        className="hover:text-primary transition-colors"
                      >
                        {game.teamScore} - {game.opponentScore}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 hidden sm:table-cell text-muted-foreground text-xs">
                      {game.tournamentName}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
