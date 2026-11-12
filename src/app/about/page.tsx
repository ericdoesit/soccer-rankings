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
                Youth Soccer Rankings USA provides the most accurate rankings for
                youth soccer club teams in the United States. Each team is assigned
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
                across the Southwest region. We currently track over{" "}
                <strong className="text-foreground">120,000 games</strong> from multiple platforms
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
            <h2 className="heading mb-4">Regions</h2>
            <p className="body-text mb-6">
              Rankings are organized into eight conferences based on the{" "}
              <strong className="text-foreground">National 1 League</strong> district structure.
              Each conference contains multiple districts grouped by geography.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/us-regions-map.svg"
              alt="US map color-coded by N1L region"
              className="w-full max-w-2xl mx-auto mb-6"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                {
                  name: "West",
                  color: "bg-blue-500",
                  districts: [
                    "D1: Colorado, Wyoming (Cheyenne)",
                    "D2: Arizona",
                    "D3: Southern California",
                    "D4: Northern California",
                    "D5: Las Vegas, Nevada",
                    "D6: Utah",
                  ],
                },
                {
                  name: "Northwest",
                  color: "bg-teal-500",
                  districts: [
                    "D1: Idaho, Montana",
                    "D2: Oregon",
                    "D3: Washington",
                    "D4: Alaska",
                    "D5: Hawaii",
                  ],
                },
                {
                  name: "South",
                  color: "bg-red-500",
                  districts: [
                    "D1: Oklahoma, Arkansas",
                    "D2: North Texas",
                    "D3: South Texas",
                    "D4: West Texas, New Mexico",
                  ],
                },
                {
                  name: "Southeast",
                  color: "bg-orange-500",
                  districts: [
                    "D1: Georgia, South Carolina",
                    "D2: Florida",
                    "D3: Alabama, FL Panhandle",
                    "D4: Louisiana, Mississippi",
                  ],
                },
                {
                  name: "Mid-Atlantic",
                  color: "bg-purple-500",
                  districts: [
                    "D1: Delaware, Maryland, DC",
                    "D2: Virginia",
                    "D3: North Carolina",
                    "D4: Tennessee",
                  ],
                },
                {
                  name: "Northeast",
                  color: "bg-indigo-500",
                  districts: [
                    "D1: ME, VT, NH, MA, RI",
                    "D2: Eastern New York, CT",
                    "D3: New Jersey, Eastern PA",
                    "D4: Upstate New York",
                  ],
                },
                {
                  name: "Midwest",
                  color: "bg-green-600",
                  districts: [
                    "D1: N. Ohio, W. PA, W. NY, WV",
                    "D2: S. Ohio, S. Indiana, KY",
                    "D3: Wisconsin, Illinois",
                    "D4: Chicago",
                    "D5: Michigan, N. Indiana",
                  ],
                },
                {
                  name: "Central",
                  color: "bg-yellow-600",
                  districts: [
                    "D1: Minnesota, W. Wisconsin",
                    "D2: MO, KS, NE, IA",
                  ],
                },
              ].map((region) => (
                <div
                  key={region.name}
                  className="rounded-[10px] border border-border p-4"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className={`h-3 w-3 rounded-full ${region.color}`}
                    />
                    <span className="font-semibold text-foreground">
                      {region.name}
                    </span>
                  </div>
                  <ul className="space-y-0.5">
                    {region.districts.map((d) => (
                      <li key={d} className="text-xs text-muted-foreground">
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
