import { Card, CardContent } from "@/components/ui/card";
import { getStats, RANK_RULES } from "@/lib/data";
import { getAreas } from "@/lib/explore";
import { WestMap } from "@/components/west-map";
import { getAboutCharts, getLeagueRanges, SOCAL_LEAGUE_ORDER } from "@/lib/about-charts";
import { HBars, LeagueOverlap, LeagueRanges } from "@/components/about/charts";
import { Pyramid } from "@/components/about/pyramid";

/** 2026-27 season: school-year age groups (Aug 1 – Jul 31); U## = 2027 − school birth year */
const SEASON_END = 2027;
const format = (u: number) => (u >= 13 ? "11v11" : u >= 11 ? "9v9" : u >= 9 ? "7v7" : "4v4 / 5v5");

export default function AboutPage() {
  const stats = getStats();
  const areas = getAreas();
  const charts = getAboutCharts();
  const ranges = getLeagueRanges();
  // SoCal League: first-team flights only (F2–F4 are development teams), as in the pyramid key
  const shownLeagues = SOCAL_LEAGUE_ORDER.filter((l) => !/^SoCal F[2-4]$/.test(l));
  // headline numbers for "How We Compare Leagues": U15 boys, MLS NEXT HD (the thinnest-linked elite league)
  const hd = ranges?.ranges["U15|Boys"]?.["MLS NEXT HD"];
  const hdEvent = ranges?.events.map((e) => ({ event: e.event, d: e.shifts["U15|Boys"]?.["MLS NEXT HD"] ?? 0 }))
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0];
  const mostLinked = ranges ? Object.entries(ranges.ranges["U15|Boys"] ?? {}).filter(([l]) => shownLeagues.includes(l))
    .sort((a, b) => b[1].crossGames - a[1].crossGames)[0] : undefined;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const typeColor = { "Elite & national leagues": "red", "State & local leagues": "blue", "Tournaments & showcases": "gold", "State Cups & championships": "green" } as const;
  const ageRows = Array.from({ length: 14 }, (_, i) => 2008 + i).map((by) => ({
    by,
    early: SEASON_END - by,      // born Jan–Jul: school year that ends in their birth year
    late: SEASON_END - by - 1,   // born Aug–Dec: school year that ends the following year
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="display mb-8">About <span className="tail">Youth Soccer Rankings.</span></h1>

      <div className="space-y-6">
        <Card>
          <CardContent>
            <h2 className="heading-sm mb-3">How It Works</h2>
            <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
              <p>
                Youth Soccer Rankings rates competitive youth club teams in the Western US. Each team has a score
                measured in <strong className="text-foreground">goals</strong>. To predict the goal difference when two
                teams play, subtract one team&apos;s score from the other&apos;s.
              </p>
              <p>
                For example, if Team A has a score of 3.6 and Team B has a score of 1.5, expect Team A to win by about
                2 goals. Compare teams within the same age group and gender: each age group is rated on its own.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="heading-sm mb-3">The Enhanced Massey Rating System</h2>
            <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
              <p>
                Ratings come from an Enhanced Massey rating system, a long-standing method in sports analytics. It
                finds the team strengths that best explain the goal differences in every game we have.
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong className="text-foreground">Margin cap (6 goals).</strong> A 10-0 win counts the same as a
                  6-0 win, so blowouts don&apos;t distort the ratings.
                </li>
                <li>
                  <strong className="text-foreground">Recent games count more.</strong> A game&apos;s weight halves
                  about every 3.5 months (105 days).
                </li>
                <li>
                  <strong className="text-foreground">Last season counts a quarter.</strong> Rosters change every
                  August, so games from before Aug 1 count at a quarter of their weight.
                </li>
                <li>
                  <strong className="text-foreground">League ties.</strong> Each team is very lightly tied to the
                  league it plays in most, so that groups of teams that rarely meet, such as MLS NEXT conferences in
                  different regions, are rated on one scale. Wherever real games connect them, the games decide.
                </li>
                <li>
                  <strong className="text-foreground">Every game is treated as neutral.</strong> Most results
                  don&apos;t record which team was at home, so there is no home-field adjustment.
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="heading-sm mb-3">Data Sources</h2>
            <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
              <p>
                We rate <strong className="text-foreground">{stats.westGames.toLocaleString()} games</strong> involving
                Western teams, collected from the leagues and events themselves:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>GotSport: state leagues, NPL and N1 leagues, State Cups and most tournaments</li>
                <li>MLS NEXT: the league&apos;s 2026-27 schedule (Homegrown, Academy, Flex and Pro Player Pathway games), earlier seasons, MLS NEXT Cup and Generation adidas Cup</li>
                <li>ECNL, ECNL Regional League and Pre-ECNL</li>
                <li>Elite Academy League and USL Academy</li>
                <li>Coast Soccer League, leagues run on Demosphere, Surf Cup, and other event schedules</li>
              </ul>
              <p>Ratings are recalculated whenever new results come in.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="heading-sm mb-3">What We Count</h2>
            <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
              <p>
                A rating is only as good as the games behind it. We don&apos;t rate a league on its own: league games,
                local leagues, tournaments, showcases and State Cups all go into one rating, so a team that plays a
                weekend showcase against a team from another league connects the two leagues.
              </p>
            </div>

            <div className="insight-row mt-5">
              <div className="insight">
                <div className="i-num">{charts.westGames.toLocaleString()}</div>
                <p>games involving Western teams, every one counted in the ratings</p>
              </div>
              <div className="insight">
                <div className="i-num">{charts.competitions.toLocaleString()}</div>
                <p>leagues, tournaments, showcases and cups those games come from</p>
              </div>
              <div className="insight">
                <div className="i-num">{charts.socalTeams.toLocaleString()}</div>
                <p>Southern California teams rated from this season&apos;s league play, local leagues included</p>
              </div>
            </div>

            <div className="mt-8">
              <p className="chart-title">Where the games come from</p>
              <HBars
                rows={charts.gamesByType.map((t) => ({
                  label: t.type,
                  v: t.games,
                  c: typeColor[t.type as keyof typeof typeColor],
                  end: `${t.games.toLocaleString()} · ${pct(t.games / charts.westGames)}`,
                }))}
              />
            </div>

            <div className="mt-10">
              <Pyramid groups={charts.socal} />
            </div>

            <div className="mt-10">
              <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
                The curves overlap: the best teams in a lower league are stronger than typical teams a tier up, which is
                why we rate teams, not leagues. The pyramid levels (L1–L5) rank a league&rsquo;s access to the pro pathway,
                not the strength of its teams: on results, levels 1 to 3 overlap. Hover or tap the chart for team counts.
              </p>
              {/* SoCal League: first-team flights only (F2–F4 are development teams), as in the pyramid key */}
              <LeagueOverlap groups={charts.socal} order={shownLeagues} />
            </div>
          </CardContent>
        </Card>

        {ranges && hd && (
          <Card>
            <CardContent>
              <h2 className="heading-sm mb-3">How We Compare Leagues</h2>
              <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                <p>
                  Games inside a league only put its teams in order. If every team in a league drew with every other,
                  we would learn that they are equal, not how good they are.
                </p>
                <p>
                  A league&rsquo;s level comes from games against other leagues: tournaments, showcases, State Cups and
                  friendlies, and chains of results (if A beats B and B beats C, A sits above C). The best teams
                  meeting each other is enough, because each team&rsquo;s league games already place it among its
                  league-mates.
                </p>
                <p>
                  Those games are few and uneven, so we test how firm each league&rsquo;s level is. We re-run the full
                  ratings {`${ranges.replicates} times`}, each time reshuffling which games between leagues count, and we
                  leave out each league&rsquo;s biggest connecting tournament, one at a time.
                </p>
              </div>

              <div className="insight-row mt-5">
                <div className="insight">
                  <div className="i-num">{hd.crossGames}</div>
                  <p>games tie U15 MLS NEXT HD teams to other leagues, the fewest of the elite leagues{mostLinked ? ` (${mostLinked[0]}: ${mostLinked[1].crossGames})` : ""}</p>
                </div>
                <div className="insight">
                  <div className="i-num">{hd.lo.toFixed(1)}–{hd.hi.toFixed(1)}</div>
                  <p>where U15 MLS NEXT HD&rsquo;s median of {hd.median.toFixed(1)} landed in 80% of the re-runs</p>
                </div>
                {hdEvent && Math.abs(hdEvent.d) >= 0.3 && (
                  <div className="insight">
                    <div className="i-num">{hdEvent.d > 0 ? "+" : "−"}{Math.abs(hdEvent.d).toFixed(1)}</div>
                    <p>goals U15 MLS NEXT HD moves without one event: {hdEvent.event}</p>
                  </div>
                )}
              </div>

              <div className="mt-10">
                <LeagueRanges groups={ranges.ranges} events={ranges.events} leagues={shownLeagues} replicates={ranges.replicates} />
              </div>
              <p className="mt-4 border-t border-[var(--surface-line)] pt-3 text-xs leading-relaxed text-muted-foreground">
                The ranges show how much each level depends on which games happened to be played. They can&rsquo;t catch
                games that misrepresent a team, such as a preseason showcase where teams rotate players. That is what the
                one-event test is for. Recomputed with each data refresh ({ranges.builtAt.slice(0, 10)}).
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent>
            <h2 className="heading-sm mb-3">Which Teams Are Listed</h2>
            <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
              <p>
                Every team with games gets a rating. The rankings list a Western team when it has:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>at least {RANK_RULES.minGames} rated games in the last 15 months</li>
                <li>at least {RANK_RULES.minTrackedGames} of them in tracked competitions: elite leagues, N1, State Cups, championships and major showcases</li>
                <li>at least {RANK_RULES.minQualityOpponentGames} games against teams that also play tracked competitions</li>
                <li>a schedule stronger than the weakest {Math.round(RANK_RULES.minSchedulePercentile * 100)}% in its age group</li>
                <li>a game this season, once the season is two months old (January 1 for U15 and older, whose high school season runs in the fall)</li>
              </ul>
              <p>
                Teams that only play local leagues stay in the directory, and their games still count in everyone&apos;s
                ratings. Teams from other regions are rated when they play Western teams but aren&apos;t listed.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="heading-sm mb-3">2026-27 Age Groups</h2>
            <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
              <p>
                From the 2026-27 season, youth soccer groups players by{" "}
                <strong className="text-foreground">school year</strong> (August 1 – July 31) instead of calendar
                birth year. A player born from January through July plays with their birth year; a player born from
                August through December plays one group younger, with the next year&apos;s birthdays. Age groups move
                up one every August 1.
              </p>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs">
                    <th>Birth year</th>
                    <th>Born Jan–Jul</th>
                    <th>Born Aug–Dec</th>
                  </tr>
                </thead>
                <tbody>
                  {ageRows.map((r) => (
                    <tr key={r.by} className="border-t border-[var(--surface-line)]">
                      <td className="font-medium tabular-nums">{r.by}</td>
                      <td className="tabular-nums">U{r.early} <span className="text-muted-foreground">· {format(r.early)}</span></td>
                      <td className="tabular-nums">U{r.late} <span className="text-muted-foreground">· {format(r.late)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              For the 2026-27 season (August 2026 – July 2027). Example: a player born in March 2014 is U13; one born in
              October 2014 is U12. Game format moves from small-sided to 7v7 at U9, 9v9 at U11 and 11v11 at U13.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="heading-sm mb-3">Predictive Power</h2>
            <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
              <p>
                A rating system is only as good as its predictions. Flipping a coin picks the winner half the time;
                no system gets close to every game, because soccer has a lot of chance in it.
              </p>
              <p>
                To test ours, we rated teams using only games played before October 1, 2026, then predicted the next
                six weeks of games involving Western teams. The higher-rated team won{" "}
                <strong className="text-foreground">76% of the games that weren&apos;t draws</strong>, and about 90% when
                it was favored by 2 goals or more. The same test in spring 2026 gave 75%.
              </p>
              <p>
                National events are harder, because they bring together teams from groups that rarely play each
                other. At the 2026 MLS NEXT Cup the league ties raised the share of winners picked in the U13/U14
                Championship from 69% to 76%, and halved the average miss on the goal margin in the Homegrown
                brackets, from 3.6 to 1.8 goals.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="heading-sm mb-4">Coverage: Region IV</h2>
            <p className="body-text mb-6">
              We cover <strong className="text-foreground">US Youth Soccer Region IV</strong>, the 13 Western states.
              California is split into Cal South and Cal North, the way its two state associations run it. Twelve of
              the states are ranked; Hawaii isn&apos;t yet.
            </p>
            {/* the same map as the States page: each area links to its state page */}
            <div className="mb-6 grid gap-6 md:grid-cols-[minmax(0,380px)_1fr] md:items-start">
              <WestMap
                className="mx-auto w-full max-w-[380px]"
                areas={areas.map(({ area, clubs, teams }) => ({ code: area.code, slug: area.slug, name: area.name, teams, clubs: clubs.length }))}
              />
              <div className="grid content-start gap-4">
                {[
                  {
                    name: "West",
                    note: "N1 West conference; New Mexico plays in the South conference with west Texas",
                    states: ["Arizona", "Cal North", "Cal South", "Colorado", "Nevada", "New Mexico", "Utah", "Wyoming"],
                  },
                  {
                    name: "Northwest",
                    note: "N1 Northwest conference",
                    states: ["Alaska", "Hawaii (not ranked yet)", "Idaho", "Montana", "Oregon", "Washington"],
                  },
                ].map((group) => (
                  <div key={group.name} className="surface p-5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="size-2.5 rounded-full bg-[var(--brand)]" aria-hidden />
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
            </div>
            <h3 className="heading-sm mb-2">Why Region IV</h3>
            <ul className="body-text space-y-2 list-disc pl-5">
              <li>
                <strong className="text-foreground">It&apos;s how Western youth soccer is organized.</strong>{" "}Region IV is
                US Youth Soccer&apos;s Western region: its state associations, State Cups, Far West Regional Championships
                and Olympic Development Program all run on these 13 states.
              </li>
              <li>
                <strong className="text-foreground">Western teams play each other.</strong>{" "}The elite leagues group the
                West the same way: N1&apos;s West and Northwest conferences cover every Region IV state except New Mexico,
                and ECNL, Girls Academy, DPL and MLS NEXT run Western conferences and showcases (Surf Cup, DPL Western
                Regional, GA West). Teams that play each other often can be compared accurately.
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
