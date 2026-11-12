import Link from "next/link";
import { notFound } from "next/navigation";
import { getClubByName, getClubMeta } from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Club page for a club name without verified club data (teams named by source only). */
export function LegacyClub({ clubName }: { clubName: string }) {
  const club = getClubByName(clubName);
  if (!club) notFound();

  const meta = getClubMeta(clubName);
  const winRate =
    club.totalGames > 0
      ? Math.round((club.totalWins / club.totalGames) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Club Header */}
      <div className="mb-8">
        <h1 className="heading">{club.name}</h1>
        {meta && (
          <p className="body-text mt-1">{meta.fullName}</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {meta?.city && <span>{meta.city}</span>}
          {!meta?.city && <span>{club.state}</span>}
          <span>&middot;</span>
          <span>{club.teams.length} ranked teams</span>
          {meta?.website && (
            <>
              <span>&middot;</span>
              <a
                href={meta.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {meta.website.replace(/^https?:\/\//, "")}
              </a>
            </>
          )}
        </div>
      </div>

      {/* Club Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-bold">#{club.clubRank}</p>
            <p className="lowbrow mt-1">Club Rank</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-bold">{club.avgScore.toFixed(1)}</p>
            <p className="lowbrow mt-1">Avg Rating</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-bold">{winRate}%</p>
            <p className="lowbrow mt-1">Win Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-bold">{club.totalGames}</p>
            <p className="lowbrow mt-1">Total Games</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-bold">
              {club.totalWins}-{club.totalLosses}-{club.totalDraws}
            </p>
            <p className="lowbrow mt-1">W-L-D</p>
          </CardContent>
        </Card>
      </div>

      {/* Age Group Coverage */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="lowbrow mr-1">Age groups:</span>
        {club.ageGroups.map((ag) => (
          <Badge key={ag} variant="secondary">
            {ag}
          </Badge>
        ))}
      </div>

      {/* All Club Teams */}
      <Card>
        <CardHeader>
          <CardTitle className="heading">Teams</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 w-12">#</th>
                  <th className="px-4 py-2">Team</th>
                  <th className="px-4 py-2 hidden sm:table-cell">Age</th>
                  <th className="px-4 py-2 hidden sm:table-cell">Gender</th>
                  <th className="px-4 py-2 text-right">Rating</th>
                  <th className="px-4 py-2 text-center">Record</th>
                  <th className="px-4 py-2 text-center hidden md:table-cell">
                    Nat&apos;l Rank
                  </th>
                </tr>
              </thead>
              <tbody>
                {club.teams.map((team, idx) => (
                  <tr
                    key={team.id}
                    className="border-b last:border-b-0 border-border/50 hover:bg-muted/50 transition-colors"
                  >
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/team/${team.id}`}
                        className="font-medium hover:text-primary transition-colors"
                      >
                        {team.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 hidden sm:table-cell text-muted-foreground">
                      {team.ageGroup}
                    </td>
                    <td className="px-4 py-2.5 hidden sm:table-cell text-muted-foreground">
                      {team.gender}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold">
                      {team.score?.toFixed(1) ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-center text-muted-foreground">
                      {team.wins}-{team.losses}-{team.draws}
                    </td>
                    <td className="px-4 py-2.5 text-center hidden md:table-cell text-muted-foreground">
                      #{team.rank}
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
