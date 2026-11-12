import { Card, CardContent } from "@/components/ui/card";

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="heading mb-8">About Youth Soccer Rankings</h1>

      <div className="space-y-6">
        <Card>
          <CardContent className="py-6">
            <h2 className="heading mb-3">How It Works</h2>
            <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
              <p>
                Youth Soccer Rankings ranks competitive youth soccer club teams in
                the Western US. Each team is assigned
                a score measured in <strong className="text-foreground">goals</strong>. To predict the goal difference when two
                teams play each other, subtract the score of one team from the
                other.
              </p>
              <p>
                For example, if Team A has a score of 3.6 and Team B has a score
                of 1.5, you can expect Team A to win by about 2 goals. This works
                across age groups and genders.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-6">
            <h2 className="heading mb-3">The Enhanced Massey Rating System</h2>
            <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
              <p>
                Our rankings use an Enhanced Massey Rating System, a
                well-established approach in sports analytics. The core algorithm
                solves a linear system to find team strengths that best explain
                observed goal differences across all games.
              </p>
              <p className="font-semibold text-foreground">Enhancements tuned from 80,000+ game analysis:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong className="text-foreground">Margin cap (6 goals)</strong> — A 10-0 win counts the same as a 6-0 win to prevent outliers from distorting ratings.
                </li>
                <li>
                  <strong className="text-foreground">Recency weighting</strong> — Recent games are weighted more heavily than older games, with a half-life of about 3.5 months.
                </li>
                <li>
                  <strong className="text-foreground">Home advantage (0.1 goals)</strong> — A small adjustment based on rematch analysis of 24,000 games.
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-6">
            <h2 className="heading mb-3">Data Sources</h2>
            <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
              <p>
                Game results are collected from tournament and league websites
                across the Western US. We currently track over{" "}
                <strong className="text-foreground">470,000 games</strong> from multiple platforms
                including GotSport, Coast Soccer League, Total Global Sports,
                and state association sites.
              </p>
              <p>
                Teams must play a minimum of 10 games before they are ranked.
                Rankings are recalculated regularly as new game data becomes
                available.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-6">
            <h2 className="heading mb-3">2026-27 Age Group Changes</h2>
            <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
              <p>
                Starting with the 2026-27 season, US Youth Soccer is transitioning
                from <strong className="text-foreground">calendar birth year</strong> (Jan-Dec) to{" "}
                <strong className="text-foreground">school year</strong> (Aug-Jul) age grouping. The age cutoff
                is now <strong className="text-foreground">August 31st</strong>. This means a player&apos;s age
                group may shift depending on their birth month.
              </p>
              <p className="text-xs">
                Find your birth year in the left column. Your age group before
                August is in the Jan-Jul columns. After August 1st, use the
                Aug-Dec columns for the new season.
              </p>
            </div>
            <div className="overflow-x-auto mt-4 -mx-2">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="border border-border px-2 py-1.5 bg-muted/50 text-left font-semibold" rowSpan={2}>
                      Birth Year
                    </th>
                    <th className="border border-border px-2 py-1 bg-primary/20 text-center font-semibold" colSpan={7}>
                      Jan - Jul 2027
                    </th>
                    <th className="border border-border px-2 py-1 bg-muted/30 text-center font-semibold" colSpan={5}>
                      Aug - Dec 2027
                    </th>
                    <th className="border border-border px-2 py-1.5 bg-muted/50 text-center font-semibold" rowSpan={2}>
                      Format
                    </th>
                  </tr>
                  <tr>
                    {["Jan","Feb","Mar","Apr","May","Jun","Jul"].map(m => (
                      <th key={m} className="border border-border px-1.5 py-1 bg-primary/10 text-center font-medium">{m}</th>
                    ))}
                    {["Aug","Sep","Oct","Nov","Dec"].map(m => (
                      <th key={m} className="border border-border px-1.5 py-1 bg-muted/20 text-center font-medium">{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { by: 2007, pre: "U20", post: "U19", format: "11v11" },
                    { by: 2008, pre: "U19", post: "U18", format: "11v11" },
                    { by: 2009, pre: "U18", post: "U17", format: "11v11" },
                    { by: 2010, pre: "U17", post: "U16", format: "11v11" },
                    { by: 2011, pre: "U16", post: "U15", format: "11v11" },
                    { by: 2012, pre: "U15", post: "U14", format: "11v11" },
                    { by: 2013, pre: "U14", post: "U13", format: "11v11" },
                    { by: 2014, pre: "U13", post: "U12", format: "9v9" },
                    { by: 2015, pre: "U12", post: "U11", format: "9v9" },
                    { by: 2016, pre: "U11", post: "U10", format: "7v7" },
                    { by: 2017, pre: "U10", post: "U9", format: "7v7" },
                    { by: 2018, pre: "U9", post: "U8", format: "5v5" },
                    { by: 2019, pre: "U8", post: "U7", format: "5v5" },
                    { by: 2020, pre: "U7", post: "U6", format: "5v5" },
                  ].map((row) => (
                    <tr key={row.by} className="hover:bg-muted/30 transition-colors">
                      <td className="border border-border px-2 py-1.5 font-semibold bg-muted/50">
                        {row.by}
                      </td>
                      {Array(7).fill(null).map((_, i) => (
                        <td key={`pre-${i}`} className="border border-border px-1.5 py-1.5 text-center bg-primary/5">
                          {row.pre}
                        </td>
                      ))}
                      {Array(5).fill(null).map((_, i) => (
                        <td key={`post-${i}`} className="border border-border px-1.5 py-1.5 text-center">
                          {row.post}
                        </td>
                      ))}
                      <td className="border border-border px-2 py-1.5 text-center text-muted-foreground">
                        {row.format}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-muted-foreground text-xs">
              Age cutoff: August 31st. A player born in 2013 is U14 from
              January through July 2027, then becomes U13 when the new season
              starts in August 2027. Game format transitions from 5v5 to 7v7
              at U9, 7v7 to 9v9 at U11, and 9v9 to 11v11 at U13.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-6">
            <h2 className="heading mb-3">Predictive Power</h2>
            <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
              <p>
                A ranking system&apos;s accuracy is measured by its{" "}
                <strong className="text-foreground">Predictive Power</strong> — how often a higher-ranked team beats
                a lower-ranked team. A Predictive Power of 0% is equivalent to
                flipping a coin. 100% would mean the rankings always predict the
                result (impossible given the random nature of the sport).
              </p>
              <p>
                Our algorithm achieves <strong className="text-foreground">66.6% prediction accuracy</strong> on
                a test set of 16,000 games, validated through grid search
                optimization across margin caps, home advantage, and recency
                weighting parameters.
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-6">
            <h2 className="heading mb-4">Coverage: Region IV</h2>
            <p className="body-text mb-6">
              We rank teams in <strong className="text-foreground">US Youth Soccer Region IV</strong>, the 13 Western
              states. California is split into Cal South and Cal North, the way its two state associations run it, so the
              West has 14 areas.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/region-iv-map.svg"
              alt="US map with the 13 Region IV states highlighted: Alaska, Arizona, California, Colorado, Hawaii, Idaho, Montana, Nevada, New Mexico, Oregon, Utah, Washington and Wyoming"
              className="w-full max-w-2xl mx-auto mb-6"
            />
            <div className="grid gap-4 sm:grid-cols-2 mb-6">
              {[
                {
                  name: "West",
                  note: "N1 League West conference, plus New Mexico",
                  states: ["Arizona", "Cal North", "Cal South", "Colorado", "Nevada", "New Mexico", "Utah", "Wyoming"],
                },
                {
                  name: "Northwest",
                  note: "N1 League Northwest conference",
                  states: ["Alaska", "Hawaii (not ranked yet)", "Idaho", "Montana", "Oregon", "Washington"],
                },
              ].map((group) => (
                <div key={group.name} className="rounded-[10px] border border-border p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-3 w-3 rounded-full bg-blue-600" />
                    <span className="font-semibold text-foreground">{group.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{group.note}</p>
                  <ul className="space-y-0.5">
                    {group.states.map((st) => (
                      <li key={st} className="text-xs text-muted-foreground">{st}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <h3 className="font-semibold text-foreground mb-2">Why Region IV</h3>
            <ul className="body-text space-y-2 list-disc pl-5">
              <li>
                <strong className="text-foreground">It&apos;s how Western youth soccer is organized.</strong>{" "}Region IV is
                US Youth Soccer&apos;s Western region: its state associations, State Cups, Far West Regional Championships
                and Olympic Development Program all run on these 13 states.
              </li>
              <li>
                <strong className="text-foreground">Western teams play each other.</strong>{" "}The elite leagues group the
                West the same way: the N1 League&apos;s West and Northwest conferences together cover every Region IV state except New Mexico,
                and ECNL, Girls Academy and DPL run Western conferences and showcases (Surf Cup, DPL Western Regional,
                GA West). Teams that play each other often can be compared accurately.
              </li>
              <li>
                <strong className="text-foreground">Depth over breadth.</strong>{" "}We&apos;d rather cover every competitive
                league, club and team in the West than rank the whole country thinly. Teams from other regions still
                count in the ratings when they play Western teams, so national strength is reflected.
              </li>
              <li>
                <strong className="text-foreground">Hawaii</strong>{" "}is part of Region IV, but its teams rarely play
                mainland opponents, so they can&apos;t yet be rated on the same scale.
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
