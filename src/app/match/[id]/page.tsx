import Link from "next/link";
import { notFound } from "next/navigation";
import { getMatchById } from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

function FormBadge({ result }: { result: "W" | "L" | "D" }) {
  const colors = {
    W: "bg-green-600 text-white",
    L: "bg-red-600 text-white",
    D: "bg-yellow-600 text-white",
  };
  return (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center rounded text-xs font-bold ${colors[result]}`}
    >
      {result}
    </span>
  );
}

export default async function MatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const match = getMatchById(parseInt(id));
  if (!match) notFound();

  const predictedDiff =
    match.team1Ranking && match.team2Ranking
      ? match.team1Ranking.score - match.team2Ranking.score
      : null;

  const t1 = match.team1Ranking;
  const t2 = match.team2Ranking;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Match Header + Rankings — single card */}
      <Card className="mb-6">
        <CardContent>
          {/* Tournament + Date */}
          <div className="mb-4 text-center text-xs text-muted-foreground">
            {match.tournamentName} &middot; {match.date}
          </div>

          {/* Score Row */}
          <div className="flex items-center justify-center gap-6 sm:gap-10">
            <div className="flex-1 text-right">
              <Link
                href={`/team/${match.team1.id}`}
                className="text-lg font-bold hover:text-primary transition-colors"
              >
                {match.team1.name}
              </Link>
              <p className="text-xs text-muted-foreground">
                <Link
                  href={`/club/${encodeURIComponent(match.team1.club)}`}
                  className="hover:text-primary transition-colors"
                >
                  {match.team1.club}
                </Link>
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span
                className={`text-4xl font-bold ${
                  match.team1Score > match.team2Score
                    ? "text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {match.team1Score}
              </span>
              <span className="text-xl text-muted-foreground">-</span>
              <span
                className={`text-4xl font-bold ${
                  match.team2Score > match.team1Score
                    ? "text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {match.team2Score}
              </span>
            </div>

            <div className="flex-1 text-left">
              <Link
                href={`/team/${match.team2.id}`}
                className="text-lg font-bold hover:text-primary transition-colors"
              >
                {match.team2.name}
              </Link>
              <p className="text-xs text-muted-foreground">
                <Link
                  href={`/club/${encodeURIComponent(match.team2.club)}`}
                  className="hover:text-primary transition-colors"
                >
                  {match.team2.club}
                </Link>
              </p>
            </div>
          </div>

          <div className="mt-2 text-center">
            <Badge variant="secondary">FT</Badge>
          </div>

          {/* Rankings Comparison — centered under score */}
          {t1 && t2 && (
            <div className="mt-6 border-t border-border pt-5">
              <table className="keep-align w-full max-w-2xl mx-auto text-sm table-fixed">
                <colgroup>
                  <col className="w-[40%]" />
                  <col className="w-[20%]" />
                  <col className="w-[40%]" />
                </colgroup>
                <thead>
                  <tr>
                    <th className="pb-2 text-center font-medium text-foreground">
                      <Link href={`/team/${match.team1.id}`} className="hover:text-primary transition-colors">
                        {match.team1.name}
                      </Link>
                    </th>
                    <th className="pb-2"></th>
                    <th className="pb-2 text-center font-medium text-foreground">
                      <Link href={`/team/${match.team2.id}`} className="hover:text-primary transition-colors">
                        {match.team2.name}
                      </Link>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { left: t1.score.toFixed(1), label: "Rating", right: t2.score.toFixed(1) },
                    { left: `#${t1.rank}`, label: "Rank", right: `#${t2.rank}` },
                    { left: `${t1.wins}-${t1.losses}-${t1.draws}`, label: "Record", right: `${t2.wins}-${t2.losses}-${t2.draws}` },
                    { left: String(t1.gamesPlayed), label: "Games", right: String(t2.gamesPlayed) },
                  ].map((row) => (
                    <tr key={row.label} className="border-t border-border/30">
                      <td className="py-2.5 text-center font-semibold text-foreground">{row.left}</td>
                      <td className="py-2.5 text-center"><span className="lowbrow">{row.label}</span></td>
                      <td className="py-2.5 text-center font-semibold text-foreground">{row.right}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Predicted Margin */}
              {predictedDiff !== null && (
                <div className="mt-4 rounded-[10px] bg-muted p-3 text-center max-w-sm mx-auto">
                  <p className="lowbrow">Predicted Margin</p>
                  <p className="text-lg font-bold mt-1">
                    {predictedDiff > 0
                      ? `${match.team1.name} by ${predictedDiff.toFixed(1)}`
                      : predictedDiff < 0
                        ? `${match.team2.name} by ${Math.abs(predictedDiff).toFixed(1)}`
                        : "Even match"}
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Head to Head */}
      <Card className="mb-6">
        <CardContent>
          <h2 className="heading-sm mb-4">Head to Head</h2>
          {match.h2hGames.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No previous meetings found.
            </p>
          ) : (
            <div className="space-y-2">
              {match.h2hGames.map((g) => {
                const t1Won = g.team1Id === match.team1.id
                  ? g.team1Score > g.team2Score
                  : g.team2Score > g.team1Score;
                const t1Score = g.team1Id === match.team1.id ? g.team1Score : g.team2Score;
                const t2Score = g.team1Id === match.team1.id ? g.team2Score : g.team1Score;

                return (
                  <Link
                    key={g.id}
                    href={`/match/${g.id}`}
                    className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl bg-card p-3 shadow-[var(--surface-shadow)] text-sm hover:bg-muted/50 transition-colors"
                  >
                    <div className="text-left">
                      <span className={`font-semibold ${t1Won ? "text-foreground" : "text-muted-foreground"}`}>
                        {match.team1.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">{g.date}</span>
                    </div>
                    <span className="font-semibold text-base px-2">
                      {t1Score} - {t2Score}
                    </span>
                    <div className="text-right">
                      <span className={`font-semibold ${!t1Won && t1Score !== t2Score ? "text-foreground" : "text-muted-foreground"}`}>
                        {match.team2.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">&rarr; View match</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Team Form — side by side */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardContent>
            <h2 className="heading-sm mb-3">{match.team1.name} Form</h2>
            <div className="mb-3 flex gap-1">
              {match.team1Form.map((g) => (
                <Link key={g.id} href={`/match/${g.id}`}>
                  <FormBadge result={g.result} />
                </Link>
              ))}
            </div>
            <div className="space-y-1.5">
              {match.team1Form.map((g) => (
                <Link
                  key={g.id}
                  href={`/match/${g.id}`}
                  className="flex items-center justify-between text-sm hover:bg-muted/50 rounded px-1 py-1 -mx-1 transition-colors"
                >
                  <span className="truncate flex-1 text-muted-foreground">vs {g.opponentName}</span>
                  <span className="ml-2 font-semibold">{g.teamScore}-{g.opponentScore}</span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="heading-sm mb-3">{match.team2.name} Form</h2>
            <div className="mb-3 flex gap-1">
              {match.team2Form.map((g) => (
                <Link key={g.id} href={`/match/${g.id}`}>
                  <FormBadge result={g.result} />
                </Link>
              ))}
            </div>
            <div className="space-y-1.5">
              {match.team2Form.map((g) => (
                <Link
                  key={g.id}
                  href={`/match/${g.id}`}
                  className="flex items-center justify-between text-sm hover:bg-muted/50 rounded px-1 py-1 -mx-1 transition-colors"
                >
                  <span className="truncate flex-1 text-muted-foreground">vs {g.opponentName}</span>
                  <span className="ml-2 font-semibold">{g.teamScore}-{g.opponentScore}</span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
