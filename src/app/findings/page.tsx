import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { getAboutCharts, getLeagueRanges, SOCAL_LEAGUE_ORDER } from "@/lib/about-charts";
import { LeagueOverlap, LeagueRanges } from "@/components/about/charts";
import { Pyramid } from "@/components/about/pyramid";

export const metadata: Metadata = {
  title: "Findings · Youth Soccer Rankings",
  description: "What the ratings show about youth soccer leagues in the West, and about the US youth system.",
};

const PITFALLS = "https://pitfalls-on-the-pathway.vercel.app/";
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };

export default function FindingsPage() {
  const charts = getAboutCharts();
  const ranges = getLeagueRanges();
  // SoCal League: first-team flights only (F2–F4 are development teams), as in the pyramid key
  const shownLeagues = SOCAL_LEAGUE_ORDER.filter((l) => !/^SoCal F[2-4]$/.test(l));
  // headline numbers: U15 boys, MLS NEXT HD (the thinnest-linked elite league)
  const hd = ranges?.ranges["U15|Boys"]?.["MLS NEXT HD"];
  const hdEvent = ranges?.events.map((e) => ({ event: e.event, d: e.shifts["U15|Boys"]?.["MLS NEXT HD"] ?? 0 }))
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0];
  const mostLinked = ranges ? Object.entries(ranges.ranges["U15|Boys"] ?? {}).filter(([l]) => shownLeagues.includes(l))
    .sort((a, b) => b[1].crossGames - a[1].crossGames)[0] : undefined;
  // share of U15 boys N1 + Elite Academy teams rated at or above the median MLS NEXT HD team
  const u15 = charts.socal["U15|Boys"] ?? {};
  const hdMed = u15["MLS NEXT HD"]?.length ? median(u15["MLS NEXT HD"]) : null;
  const below = [...(u15["N1"] ?? []), ...(u15["EA"] ?? [])];
  const atHd = hdMed === null ? 0 : below.filter((r) => r >= hdMed).length;
  const share = below.length ? atHd / below.length : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="display mb-3">Findings <span className="tail">What the ratings show.</span></h1>
      <p className="mb-8 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Rating every team on one scale shows how leagues really compare, and how loosely the US youth system ties price
        and league badges to the level of play. How the ratings are made is on the{" "}
        <Link href="/about" className="font-medium text-foreground underline underline-offset-2">About</Link> page; the
        money side is on{" "}
        <a href={PITFALLS} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline underline-offset-2">Pitfalls on the Pathway</a>.
      </p>

      <div className="space-y-6">
        <Card>
          <CardContent>
            <h2 className="heading-sm mb-3">In Short</h2>
            <div className="insight-row">
              {below.length > 0 && hdMed !== null && (
                <div className="insight">
                  <div className="i-num">{Math.round(share * 100)}%</div>
                  <p>of U15 SoCal N1 and Elite Academy boys teams rate at or above the typical MLS NEXT Homegrown team</p>
                </div>
              )}
              {hd && (
                <div className="insight">
                  <div className="i-num">{hd.crossGames}</div>
                  <p>games tie U15 MLS NEXT Homegrown teams to other leagues{mostLinked ? `, against ${mostLinked[1].crossGames} for ${mostLinked[0]}` : ""}</p>
                </div>
              )}
              {hdEvent && Math.abs(hdEvent.d) >= 0.3 && (
                <div className="insight">
                  <div className="i-num">{hdEvent.d > 0 ? "+" : "−"}{Math.abs(hdEvent.d).toFixed(1)}</div>
                  <p>goals MLS NEXT Homegrown&rsquo;s U15 level moves without one preseason showcase</p>
                </div>
              )}
              <div className="insight">
                <div className="i-num">59%</div>
                <p>of MLS roster spots are held by foreign players. From college to MLS, American teams are bought, not built</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="heading-sm mb-3">The Pyramid Against the Results</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Leagues are usually drawn as a pyramid, each level a step up from the one below. Our ratings test that
              order with results: where the medians fall and how much the leagues overlap.
            </p>
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
            <h2 className="heading-sm mb-3">What This Says About the US System</h2>
            <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
              <p>
                Our ratings measure teams, not the system around them. Read next to{" "}
                <a href={PITFALLS} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
                  Pitfalls on the Pathway
                </a>
                , which follows the money and the MLS pipeline, they point the same way: American youth soccer sorts
                players by administration and price more than by competition.
              </p>
              <p className="border-l-2 border-[var(--surface-line)] pl-3 text-foreground">
                <strong>From college to MLS, American teams are bought, not built.</strong>{" "}
                <span className="text-muted-foreground">
                  MLS fills 59% of its roster spots with foreign players and signs about 345 players from abroad a year,
                  against 75 Homegrowns. D1 men&apos;s rosters hold 30–35% international players and fill 25–30% of
                  spots from the transfer portal. At both levels, the strongest teams are put together by recruiting
                  finished players, not by developing them.
                </span>
              </p>
              <h3 className="heading-sm pt-2 text-foreground">Why the US is poorly positioned</h3>
              <ul className="list-disc space-y-2 pl-5">
                <li><strong className="text-foreground">Youth soccer is run as a private market, not a public good.</strong> In much of Europe, clubs are member-run and often play on public fields, and federation rules send money back to the clubs that develop players. In the US, clubs are businesses, fees are unregulated, and developing a player earns a club almost nothing, so the system is paid for by families&apos; hopes rather than by producing players. Wealth makes that market possible; the lack of public governance makes it the only model that pays.</li>
                <li><strong className="text-foreground">Leagues are joined, not earned.</strong> MLS NEXT, ECNL, Elite Academy and N1 are memberships clubs apply and pay for, with no promotion or relegation. On results, the top three levels of the pyramid overlap: {`${Math.round(share * 100)}%`} of U15 SoCal N1 and Elite Academy boys teams rate as high as a typical MLS NEXT Homegrown team.</li>
                <li><strong className="text-foreground">The leagues barely test each other.</strong> MLS NEXT Homegrown teams play about 6% of their games against other leagues{hdEvent && Math.abs(hdEvent.d) >= 0.3 ? `, and one preseason showcase moves the league's measured level by ${Math.abs(hdEvent.d).toFixed(1)} goals` : ""}. Nobody, the leagues included, can say with confidence which one is strongest.</li>
                <li><strong className="text-foreground">Price filters before talent does.</strong> Club soccer costs about $3,000–$4,000 a year in a regional league and $5,000–$15,000 at independent MLS NEXT clubs. Households under $50K are roughly 40% of US families but under 8% of club parents.</li>
                <li><strong className="text-foreground">The paid middle tier is an American invention.</strong> In England, Spain, Germany and Brazil, training at this intensity is free once a pro club selects a player, or costs a few hundred euros at a community club. US clubs are businesses paid for retention: more teams, more flights, more tournaments. Second and third teams often pay the same fee as the first team and subsidize it.</li>
                <li><strong className="text-foreground">The club that collects the fees is not the one that decides.</strong> College coaches and MLS academy directors judge players at showcases and tryouts, with no stake in who developed them. MLS academies are free and sign their best players directly as Homegrowns; families at the 122 independent MLS NEXT clubs pay to compete for a draft pool those academies have already skimmed, with two roster spots per MLS team reserved for Homegrowns.</li>
                <li><strong className="text-foreground">Sorting happens at the wrong ages.</strong> Elsewhere, serious professional filtering typically happens at 15–17, and the best debut at 18–20. The US does its biggest sorting at college recruiting showcases and in college itself, after that window.</li>
                <li><strong className="text-foreground">College is a minor road to MLS and the national team.</strong> MLS takes about 82 draft picks a year, against about 345 signings from abroad and 75 Homegrowns. 79% of the 2020–25 draft picks were off MLS rosters by 2026, and the median survivor earns $113K. D1 men&apos;s rosters, capped at 28, hold 30–35% international players and fill 25–30% of spots from the transfer portal. High school soccer plays almost no part: recruiting runs through club showcases.</li>
                <li><strong className="text-foreground">MLS buys more than it builds.</strong> 59% of MLS roster spots are held by foreign players, and 92.6% of the money in the league&apos;s 100 biggest transfers went to non-Americans. The domestic pipeline families pay for is not how the league builds its best teams.</li>
                <li><strong className="text-foreground">MLS is a league of franchises, not independent clubs.</strong> It is organized as a single company: investor-operators own the right to run a team, players sign with the league, the league sets the salary budget, and no team can be relegated. A franchise&apos;s value comes from its scarcity, its stadium and its media rights, not from producing and selling players, which is how independent clubs in Europe and South America survive. The two pressures that make clubs elsewhere develop talent, the risk of relegation and the need to sell players, barely apply.</li>
                <li><strong className="text-foreground">Without relegation, the league manufactures its drama.</strong> Open leagues get stakes from the table itself: relegation, promotion and qualification make every position matter. A closed franchise league has to create interest instead, through star signings, playoffs and expansion. In MLS, the 73 Designated Players, 6.6% of the league, earn 31% of all pay; the median one earns $2.6M against $304K for everyone else.</li>
                <li><strong className="text-foreground">Rich leagues buy before they build, in England as well as MLS.</strong> Premier League academies are often criticized for not leading to their own first teams; in 2026 Manchester United&apos;s 16-year-old prospect JJ Gabriel left for Real Madrid, citing a clearer route to the first team. The difference from the US is who pays and who is compensated: English academies are free, their players are contracted and fought over at 16, and the developing club has legal claims when they leave.</li>
                <li><strong className="text-foreground">Quality is invisible to the people paying.</strong> A club&apos;s coaches predict a player&apos;s development better than its league, tier or fee, but families can&apos;t see coaching from outside, so badge and price stand in for it.</li>
                <li><strong className="text-foreground">Distance decides exposure.</strong> Scouts concentrate in a few markets and national events, so the best player in a smaller market stays invisible, and strong teams can only meet by flying.</li>
              </ul>
              <h3 className="heading-sm pt-2 text-foreground">Structural changes that would help</h3>
              <ul className="list-disc space-y-2 pl-5">
                <li><strong className="text-foreground">Let results move teams.</strong> Promotion and relegation between the top of N1 and Elite Academy and the bottom of ECNL and MLS NEXT, region by region, even one place a season.</li>
                <li><strong className="text-foreground">An open regional cup at every age.</strong> Every league enters and it is played locally, creating the cross-league games the system lacks at a fraction of the cost of travel showcases.</li>
                <li><strong className="text-foreground">Pay the club that developed the player.</strong> Apply training compensation and solidarity payments between US clubs, so an MLS contract or transfer rewards the $2,000 club that taught the player, not only the last badge on his jersey.</li>
                <li><strong className="text-foreground">Make the top tier free for selected players</strong>, as it is almost everywhere else, funded by pro clubs, the federation and development payments, so the price of a team stops deciding who reaches it.</li>
                <li><strong className="text-foreground">Separate the pro track from the college track by 15–17.</strong> Identify and contract professional prospects at the ages the rest of the world does, and treat college as an education route rather than the main sorting point for pros.</li>
                <li><strong className="text-foreground">Open, cheap scouting.</strong> Regional talent-ID days open to any team&apos;s players, steered by where strong teams actually are rather than by league badges, so regional standouts are seen.</li>
                <li><strong className="text-foreground">Make coaching visible.</strong> Publish coach licenses, training hours and what each team in a club receives, and price lower teams for what they get.</li>
                <li><strong className="text-foreground">Rate everyone on one scale.</strong> A common rating across all leagues, with how well tested each rating is. That is what this site tries to do.</li>
              </ul>
            </div>
            <p className="mt-4 border-t border-[var(--surface-line)] pt-3 text-xs leading-relaxed text-muted-foreground">
              Cost, income, MLS salary, draft and transfer figures are from{" "}
              <a href={PITFALLS} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">Pitfalls on the Pathway</a>{" "}
              (MLSPA 2026 salary guide, MLS SuperDraft 2020–25, Transfermarkt, NCAA, Aspen Institute and its own family survey),
              where each is sourced. League overlap and cross-league figures are from this site&apos;s ratings. The ages
              of professional filtering elsewhere are typical, not fixed, and vary by country and club.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
