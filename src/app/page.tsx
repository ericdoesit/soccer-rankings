import Link from "next/link";
import { getRecentTournaments, getStats } from "@/lib/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Top25Rankings } from "@/components/rankings/top-25";

export default function HomePage() {
  const recentTournaments = getRecentTournaments(8);
  const stats = getStats();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Hero */}
      <section className="mb-10 text-center">
        <h1 className="title text-4xl sm:text-5xl">
          Youth Soccer Rankings
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          The most accurate rankings for youth soccer club teams in the USA
        </p>
      </section>

      {/* Stats Ticker */}
      <section className="mb-10 grid grid-cols-1 sm:grid-cols-3 gap-8 lg:gap-0">
        {[
          { value: stats.rankedTeams.toLocaleString(), label: "Teams Ranked", desc: "Across the Southwest region", align: "sm:items-start sm:text-left" },
          { value: stats.totalGames.toLocaleString(), label: "Games Tracked", desc: "Individual match results", align: "sm:items-center sm:text-center" },
          { value: stats.totalTeams.toLocaleString(), label: "Total Teams", desc: "In our database", align: "sm:items-end sm:text-right" },
        ].map((s) => (
          <div
            key={s.label}
            className={`flex flex-col gap-2 items-center text-center ${s.align}`}
          >
            <p className="stat-number">
              {s.value}
            </p>
            <div className="space-y-0.5">
              <p className="lowbrow">{s.label}</p>
              <p className="text-sm text-muted-foreground/70 leading-relaxed">{s.desc}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Score Explanation */}
      <section className="mb-8 rounded-[10px] border border-border bg-card p-6">
        <h2 className="heading mb-2">How the Score Works</h2>
        <p className="body-text">
          Each team is assigned a score measured in <strong className="text-foreground">goals</strong>. To predict the goal
          difference when two teams play, subtract one score from the other. For example, if Team A
          has a score of 2.4 and Team B has a score of 0.8, you can expect Team A to win by about
          1.6 goals. Scores are calculated using the Enhanced Massey Rating System, which analyzes
          every game result with a 3-goal margin cap and weights recent games more heavily.
        </p>
      </section>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Rankings Table */}
        <div className="lg:col-span-2">
          <Top25Rankings />
        </div>

        {/* Recent Tournaments & Leagues */}
        <div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="heading">Recent Events</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-4 pt-0">
              {recentTournaments.map((t) => (
                <Link
                  key={t.name}
                  href={`/tournament/${encodeURIComponent(t.name)}`}
                  className="block rounded-[10px] border border-border/50 p-4 hover:bg-muted/50 transition-colors"
                >
                  <p className="text-sm font-semibold mb-1">{t.name}</p>
                  <div className="flex gap-3">
                    <span className="lowbrow">{t.gameCount} games</span>
                    <span className="lowbrow">{t.teamCount} teams</span>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
