import Link from "next/link";
import { getRecentTournaments, getStats } from "@/lib/data";
import { Top25Rankings } from "@/components/rankings/top-25";
import { ChevronRight } from "lucide-react";

export default function HomePage() {
  const recentTournaments = getRecentTournaments(8);
  const stats = getStats();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Hero */}
      <section className="mb-10 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <h1 className="title">
          Western youth soccer,
          <br />
          <span className="tail">ranked by results.</span>
        </h1>
        <p className="body-text max-w-sm">
          Ratings for competitive teams across the 13 Western states, from every game we can find.
        </p>
      </section>

      {/* Stats */}
      <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { value: stats.rankedTeams.toLocaleString(), label: "Teams ranked", desc: "Across 12 Western states; Hawaii isn't ranked yet" },
          { value: stats.westGames.toLocaleString(), label: "Games tracked", desc: "Involving Western teams" },
          { value: stats.activeWestTeams.toLocaleString(), label: "Western teams", desc: "Active in our directory" },
        ].map((s) => (
          <div key={s.label} className="surface flex min-h-40 flex-col justify-between gap-6 p-6">
            <p className="stat-number">{s.value}</p>
            <div className="space-y-0.5">
              <p className="lowbrow">{s.label}</p>
              <p className="text-sm text-muted-foreground">{s.desc}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Score Explanation */}
      <section className="surface mb-6 grid gap-6 p-6 md:grid-cols-[1fr_1.2fr] md:p-8">
        <div className="flex flex-col justify-between gap-6">
          <p className="heading-sm">How the Score Works</p>
          <h2 className="heading">
            Scores are goals.
            <br />
            <span className="tail">Subtract one from the other.</span>
          </h2>
        </div>
        <p className="body-text self-end">
          Each team&apos;s score is measured in goals. If Team A has a score of 2.4 and Team B has a
          score of 0.8, expect Team A to win by about 1.6 goals. Scores come from the Enhanced Massey
          Rating System: every game result counts, with a 6-goal margin cap, recent games weighted
          more heavily, and last season&apos;s games at a quarter of their weight, since rosters change
          each August.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Rankings Table */}
        <div className="lg:col-span-2">
          <Top25Rankings />
        </div>

        {/* Recent Tournaments & Leagues */}
        <section className="surface self-start p-6">
          <p className="heading-sm mb-2">Recent Events</p>
          <ul>
            {recentTournaments.map((t, i) => (
              <li key={t.name} className={i ? "border-t border-[var(--surface-line)]" : ""}>
                <Link
                  href={`/tournament/${encodeURIComponent(t.name)}`}
                  className="group flex items-center justify-between gap-4 py-3.5"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{t.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t.gameCount.toLocaleString()} games · {t.teamCount.toLocaleString()} teams
                    </span>
                  </span>
                  <span className="row-arrow" aria-hidden><ChevronRight strokeWidth={2} /></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
