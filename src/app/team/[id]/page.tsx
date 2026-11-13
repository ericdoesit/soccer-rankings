import Link from "next/link";
import { notFound } from "next/navigation";
import { getTeamById } from "@/lib/data";
import { getTeamContext } from "@/lib/team-context";
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
  const ctx = getTeamContext(team.gotsportTeamId, !!team.clubVerified);

  // Records by season (Aug 1 – Jul 31). Rosters turn over each August, so the headline
  // record is this season's; earlier seasons are listed separately below.
  const seasonOf = (date: string) => {
    const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
    const start = m >= 8 ? y : y - 1;
    return `${start}-${String(start + 1).slice(2)}`;
  };
  const now = new Date();
  const currentSeason = seasonOf(now.toISOString().slice(0, 10));
  const seasons = new Map<string, { w: number; d: number; l: number; gf: number; ga: number; events: Map<string, number> }>();
  for (const g of team.games) {
    if (!g.date) continue;
    const k = seasonOf(g.date);
    const x = seasons.get(k) ?? { w: 0, d: 0, l: 0, gf: 0, ga: 0, events: new Map<string, number>() };
    if (g.result === "W") x.w++; else if (g.result === "L") x.l++; else x.d++;
    x.gf += g.teamScore; x.ga += g.opponentScore;
    if (g.tournamentName) x.events.set(g.tournamentName, (x.events.get(g.tournamentName) ?? 0) + 1);
    seasons.set(k, x);
  }
  const seasonRows = [...seasons].sort((a, b) => b[0].localeCompare(a[0]));
  const cur = seasons.get(currentSeason) ?? { w: 0, d: 0, l: 0, gf: 0, ga: 0, events: new Map<string, number>() };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Team Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="heading">{team.name}</h1>
            <p className="mt-1 text-muted-foreground">
              {team.clubVerified ? (
                <Link
                  href={`/club/${encodeURIComponent(team.club)}`}
                  className="hover:text-primary transition-colors"
                >
                  {team.club}
                </Link>
              ) : (
                // GotSport lists the team without a club; its stand-in "club" is a piece of its own name
                <span>Club not listed{ctx?.likelyClub ? ` (possibly ${ctx.likelyClub.club})` : ""}</span>
              )}
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
              {team.rankable ? (
                <>
                  <p className="text-2xl font-bold">#{team.rank}</p>
                  <p className="lowbrow mt-1">National Rank</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold text-muted-foreground">Unranked</p>
                  <p className="mt-1 text-xs text-muted-foreground">{team.notRankedReason ?? "not enough games"}</p>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold">{cur.w + cur.d + cur.l}</p>
              <p className="lowbrow mt-1">Games {currentSeason}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold text-green-500">{cur.w}</p>
              <p className="lowbrow mt-1">Wins</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold text-red-500">{cur.l}</p>
              <p className="lowbrow mt-1">Losses</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold text-yellow-500">{cur.d}</p>
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

      {/* About this team */}
      {ctx && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="heading">About this team</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="lowbrow">Club</p>
              {team.clubVerified ? (
                <p className="mt-1"><Link href={`/club/${encodeURIComponent(team.club)}`} className="hover:text-primary">{team.club}</Link></p>
              ) : (
                <div className="mt-1">
                  <p>Not listed. GotSport publishes this team without a club.</p>
                  {ctx.likelyClub && (
                    <p className="mt-1 text-muted-foreground">
                      Possibly <span className="font-medium text-foreground">{ctx.likelyClub.club}</span>: its teams play {ctx.likelyClub.games} home games at {ctx.likelyClub.field}, this team&apos;s home field.
                    </p>
                  )}
                </div>
              )}
            </div>
            <div>
              <p className="lowbrow">GotSport team</p>
              <p className="mt-1 tabular-nums">
                <a
                  href={`https://rankings.gotsport.com/teams/${ctx.gotsportTeamId}/game-history`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  #{ctx.gotsportTeamId} on GotSport ↗
                </a>
              </p>
              {ctx.otherNames.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Listed as: {ctx.otherNames.join(" · ")}</p>}
            </div>
            {ctx.divisions.length > 0 && (
              <div>
                <p className="lowbrow">This season</p>
                <ul className="mt-1 space-y-0.5">
                  {ctx.divisions.map((d) => <li key={d.event + d.division}>{d.event} · <span className="text-muted-foreground">{d.division}</span></li>)}
                </ul>
              </div>
            )}
            {ctx.homeFields.length > 0 && (
              <div>
                <p className="lowbrow">Home fields</p>
                <ul className="mt-1 space-y-0.5">
                  {ctx.homeFields.map((f) => <li key={f.field}>{f.field} <span className="text-xs text-muted-foreground">({f.games} games)</span></li>)}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Season by season */}
      {seasonRows.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="heading">By season</CardTitle>
            <p className="text-xs text-muted-foreground">
              Seasons run Aug 1 – Jul 31. Rosters change between seasons, so earlier records may be a different group of
              players. The rating counts recent games most: a game from a year ago counts about a tenth as much as one this week.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2">Season</th>
                    <th className="px-4 py-2 text-right">Games</th>
                    <th className="px-4 py-2 text-right">W-D-L</th>
                    <th className="px-4 py-2 text-right">GF-GA</th>
                    <th className="px-4 py-2 hidden sm:table-cell">Main competitions</th>
                  </tr>
                </thead>
                <tbody>
                  {seasonRows.map(([season, x]) => (
                    <tr key={season} className="border-b last:border-b-0 border-border/50">
                      <td className="px-4 py-2.5 font-medium">{season}{season === currentSeason && <span className="ml-1.5 text-xs text-muted-foreground">(current)</span>}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{x.w + x.d + x.l}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{x.w}-{x.d}-{x.l}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{x.gf}-{x.ga}</td>
                      <td className="px-4 py-2.5 hidden sm:table-cell text-xs text-muted-foreground">
                        {[...x.events].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e]) => e).join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

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
