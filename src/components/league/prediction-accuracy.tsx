import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PairedBars, PointLine, RegressionChart } from "@/components/about/charts";
import { AGE_ORDER } from "@/lib/explore";
import type { AccuracyStats, LeagueAccuracy } from "@/lib/league-accuracy";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const TIER_ORDER = ["Pre-Elite", "F1", "F1/2", "F2", "F2/3", "F3", "F3/4", "F4", "Other"];
const weekend = (monday: string) =>
  new Date(Date.parse(monday) + 5 * 864e5).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function StatsTable({ title, rows }: { title: string; rows: Array<[string, AccuracyStats]> }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs text-muted-foreground">
          <th className="py-2 pr-2">{title}</th>
          <th className="py-2 px-2 text-right">Games</th>
          <th className="py-2 px-2 text-right">Favorite won</th>
          <th className="py-2 px-2 text-right hidden sm:table-cell">Draws</th>
          <th className="py-2 pl-2 text-right">Margin miss</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([k, s]) => (
          <tr key={k} className="border-b last:border-b-0 border-border/50">
            <td className="py-1.5 pr-2">{k}</td>
            <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{s.n.toLocaleString()}</td>
            <td className="py-1.5 px-2 text-right tabular-nums font-medium">{pct(s.favWon)}</td>
            <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground hidden sm:table-cell">{pct(s.draws)}</td>
            <td className="py-1.5 pl-2 text-right tabular-nums text-muted-foreground">{s.mae.toFixed(1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PredictionAccuracy({ acc, leagueName }: { acc: LeagueAccuracy; leagueName: string }) {
  const o = acc.overall;
  // weeks with a full slate (a stray midweek make-up week is too small to read)
  const weeks = Object.entries(acc.byWeek).filter(([, s]) => s.n >= 100).sort(([a], [b]) => a.localeCompare(b));
  // opening weeks lean on last season; the last two thirds of the season on this one
  const first = weeks[0]?.[1], later = weeks.slice(Math.max(1, Math.floor(weeks.length / 3)));
  const laterFav = later.length ? later.reduce((s, [, w]) => s + w.favWon * w.decided, 0) / later.reduce((s, [, w]) => s + w.decided, 0) : null;
  const tiers = Object.entries(acc.byTier).filter(([, s]) => s.n >= 100)
    .sort(([a], [b]) => (TIER_ORDER.indexOf(a) + 1 || 99) - (TIER_ORDER.indexOf(b) + 1 || 99));
  const ages = Object.entries(acc.byAge).sort(([a], [b]) => AGE_ORDER.indexOf(a) - AGE_ORDER.indexOf(b));
  const genders = Object.entries(acc.byGender).sort(([a], [b]) => a.localeCompare(b));
  const worstTier = [...tiers].sort(([, a], [, b]) => (b.expFavWon - b.favWon) - (a.expFavWon - a.favWon))[0];

  return (
    <Card className="mt-6" id="accuracy">
      <CardHeader>
        <CardTitle className="heading-sm">How well the ratings predict {leagueName} games</CardTitle>
        <p className="text-xs text-muted-foreground">
          Every weekend this season was predicted using only games played before it, so the ratings never saw the
          results they are graded on. {acc.graded.toLocaleString()} of {acc.seasonGames.toLocaleString()} completed games
          were predicted; the rest had a team with no earlier games. Updated {acc.generated}.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="insight-row">
          <div className="insight">
            <div className="i-num">{Math.round(o.favWon * 100)}%</div>
            <p>of {o.decided.toLocaleString()} games with a winner went to the higher-rated team</p>
          </div>
          {first && laterFav !== null && (
            <div className="insight">
              <div className="i-num">{Math.round(first.favWon * 100)}% → {Math.round(laterFav * 100)}%</div>
              <p>favorite won on opening weekend, then from {weekend(later[0][0])} on, as this season&apos;s games fill in the ratings</p>
            </div>
          )}
          <div className="insight">
            <div className="i-num">{o.mae.toFixed(1)}</div>
            <p>goals: the average miss on the final margin (predicted goal difference vs actual)</p>
          </div>
          <div className="insight">
            <div className="i-num">{Math.round(o.draws * 100)}%</div>
            <p>of games were draws, which no favorite-pick can call</p>
          </div>
        </div>

        {weeks.length > 1 && (
          <div>
            <div className="chart-title">Favorite won, by weekend</div>
            <PointLine
              domain={[0.6, 0.9]}
              points={weeks.map(([wk, s]) => ({
                label: weekend(wk), v: s.favWon,
                tip: `${s.decided.toLocaleString()} games with a winner<br>margin miss ${s.mae.toFixed(1)} goals`,
              }))}
            />
          </div>
        )}

        {acc.scatter && (
          <div>
            <div className="chart-title">Predicted vs actual goal difference, every game</div>
            <RegressionChart
              cells={acc.scatter.cells} means={acc.scatter.means} slope={o.slope} intercept={o.intercept}
              xLabel="Predicted goal difference (rating gap)" yLabel="Actual goal difference"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Each square counts games with that predicted and actual goal difference (home side first); darker means more games. The regression
              line is actual = {o.intercept.toFixed(2)} + {o.slope.toFixed(2)} × predicted: a slope near 1 means a one-goal
              rating gap played out as about one goal on the field. The rating gap explains {Math.round(o.r2 * 100)}% of the
              spread in results (R² {o.r2.toFixed(2)}); the rest is the ordinary randomness of a single game.
            </p>
          </div>
        )}

        {tiers.length > 1 && (
          <div>
            <div className="chart-title">By flight: how often the favorite was expected to win, and did</div>
            <PairedBars
              max={1}
              series={[{ name: "Expected", c: "dim" }, { name: "Actual", c: "blue" }]}
              rows={tiers.map(([k, s]) => ({ label: k, a: s.expFavWon, b: s.favWon, tip: `${s.n.toLocaleString()} games · margin miss ${s.mae.toFixed(1)}` }))}
            />
            {worstTier && worstTier[1].expFavWon - worstTier[1].favWon > 0.03 && (
              <p className="mt-2 text-xs text-muted-foreground">
                The ratings are a little overconfident: favorites were expected to win {pct(o.expFavWon)} and won {pct(o.favWon)},
                with the widest gap in {worstTier[0]} ({pct(worstTier[1].expFavWon)} expected, {pct(worstTier[1].favWon)} actual).
              </p>
            )}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <StatsTable title="Age group" rows={ages} />
          <div>
            <StatsTable title="Gender" rows={genders} />
            <p className="mt-3 text-xs text-muted-foreground">
              Favorite won is among games with a winner. Margin miss is the average gap, in goals, between the predicted and
              actual goal difference. Ages and flights are the {leagueName} divisions the games were played in.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
