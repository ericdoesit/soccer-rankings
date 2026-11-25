import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPrediction, formatDates, type PredTeam, type PredMatch, type PredGroup, type KnockoutRow, type EventScore } from "@/lib/events";
import { PairedBars } from "@/components/about/charts";
import { chip } from "@/lib/ui-classes";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = getPrediction(Number(id));
  return { title: p ? `${p.event.name} predictions · Youth Soccer Rankings` : "Event · Youth Soccer Rankings" };
}

const pct = (x: number | undefined) => `${Math.round(100 * (x ?? 0))}%`;

/** "Colorado Rush" + "Colorado Rush East U15G DPL" → "Colorado Rush East U15G DPL" */
function displayName(t: PredTeam) {
  const first = t.club.split(/\s+/)[0].toLowerCase();
  return t.team.toLowerCase().startsWith(first) ? t.team : `${t.club} ${t.team}`;
}

function TeamName({ t }: { t: PredTeam }) {
  const name = displayName(t);
  const note = t.rating === null ? "no data" : t.match === "club" ? "rating from a related team" : null;
  return (
    <span className="min-w-0">
      {t.teamId && t.rating !== null ? (
        <Link href={`/team/${t.teamId}`} className="hover:underline" title={t.match === "club" ? `Rating from ${t.matchedName}` : undefined}>{name}</Link>
      ) : (
        <span>{name}</span>
      )}
      {note && <span className="ml-1.5 text-[11px] text-muted-foreground">({note})</span>}
    </span>
  );
}

function OutcomeBar({ m }: { m: PredMatch }) {
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <div className="bg-primary" style={{ width: pct(m.win) }} />
      <div className="bg-muted-foreground/40" style={{ width: pct(m.draw) }} />
      <div className="bg-foreground/70" style={{ width: pct(m.loss) }} />
    </div>
  );
}

function MatchRow({ m: raw }: { m: PredMatch }) {
  // scheduled matches: home team on the left, as on the event schedule
  const m = raw.schedule && raw.schedule.home === raw.b.label
    ? { ...raw, a: raw.b, b: raw.a, win: raw.loss, loss: raw.win, margin: -raw.margin, result: raw.result && { a: raw.result.b, b: raw.result.a } } : raw;
  const fav = m.margin >= 0 ? m.a : m.b;
  const gap = Math.abs(m.margin);
  const r = m.result;
  const call = (["win", "draw", "loss"] as const).reduce((x, y) => (m[y] > m[x] ? y : x));
  const actual = r ? (r.a > r.b ? "win" : r.a === r.b ? "draw" : "loss") : null;
  return (
    <div className="py-2.5">
      {m.schedule && (
        <p className="text-[11px] text-muted-foreground mb-1">
          #{m.schedule.match}{m.schedule.round ? ` · ${m.schedule.round}` : ""} · {formatDates(m.schedule.date)} {m.schedule.time} · {m.schedule.field.replace("Arizona Athletic Grounds - ", "")}
        </p>
      )}
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="truncate">{m.a.club}</span>
        <span className="shrink-0 tabular-nums text-xs text-muted-foreground">{pct(m.win)} · {pct(m.draw)} · {pct(m.loss)}</span>
        <span className="truncate text-right">{m.b.club}</span>
      </div>
      <div className="mt-1.5"><OutcomeBar m={m} /></div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {gap < 0.25 ? "Even match" : `${fav.club} by ${gap.toFixed(1)} goal${gap >= 1.05 ? "s" : ""}`}
        {r && (
          <>
            {" · "}
            <span className="font-semibold text-foreground tabular-nums">Final {r.a}–{r.b}</span>
            {" · "}
            <span className={actual === call ? "text-foreground" : undefined}>{actual === call ? "✓ called it" : "✗ missed"}</span>
          </>
        )}
      </p>
    </div>
  );
}

const pct1 = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "—");

/** After the event: the pre-event predictions graded against the results. */
function ModelResults({ s, generatedAt, teams }: { s: EventScore; generatedAt: string; teams: Map<string, PredTeam> }) {
  const big = s.bigUpsets;
  const nm = (label: string | null | undefined) => (label ? (teams.has(label) ? displayName(teams.get(label)!) : label) : "");
  return (
    <Card className="mt-6">
      <CardContent className="space-y-6">
        <div>
          <h2 className="heading-sm">How the Model Did</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            These predictions were made on {formatDates(generatedAt.slice(0, 10))}, before the event, and haven&apos;t been changed.
            Here they are checked against {s.games} results.
          </p>
        </div>

        <div className="insight-row">
          <div className="insight">
            <div className="i-num">{pct1(s.correct, s.games)}</div>
            <p>of games ended in the result we rated most likely (win, draw or loss): {s.correct} of {s.games}. A random pick gets about a third.</p>
          </div>
          {s.favGames ? (
            <div className="insight">
              <div className="i-num">{pct1(s.favWon ?? 0, s.favGames)}</div>
              <p>of games with a winner went to the team we favored; {s.draws} more were draws</p>
            </div>
          ) : null}
          {s.rated && s.noData && s.noData.games > 0 && (
            <div className="insight">
              <div className="i-num">{pct1(s.rated.correct, s.rated.games)} <span className="text-muted-foreground text-xl">vs {pct1(s.noData.correct, s.noData.games)}</span></div>
              <p>right when both teams had a rating, against games with a &ldquo;no data&rdquo; team ({s.noData.games} of {s.games} games)</p>
            </div>
          )}
          {big && big.games > 0 && (
            <div className="insight">
              <div className="i-num">{big.lost} <span className="text-muted-foreground text-xl">of {big.games}</span></div>
              <p>strong favorites (70%+) lost{big.lostNoData ? `, ${big.lostNoData} of them in games with a team we had no data on` : ""}</p>
            </div>
          )}
        </div>

        {s.buckets && s.buckets.length > 1 && (
          <div>
            <p className="chart-title">Favorites won less often than predicted</p>
            <PairedBars
              series={[{ name: "Predicted win", c: "dim" }, { name: "Actually won", c: "blue" }]}
              rows={s.buckets.map((b) => ({
                label: b.from === 0 ? "Under 50% favorite" : `${Math.round(b.from * 100)}–${Math.round(b.to * 100)}% favorite`,
                a: b.predicted, b: b.won / b.games,
                tip: `${b.games} games · ${Math.round((100 * b.drew) / b.games)}% drawn`,
              }))}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Games grouped by how likely we made the favorite to win. Draws count as not winning.
            </p>
          </div>
        )}

        {s.finals && s.finals.length > 0 && (
          <div>
            <p className="chart-title">SuperGroup champions</p>
            <div className="divide-y divide-border/50 text-sm">
              {s.finals.map((f) => {
                const favWon = f.winner === f.favorite;
                return (
                  <div key={`${f.division}${f.group}`} className="grid gap-1 py-2.5 md:grid-cols-[4rem_1fr_1.4fr] md:gap-4">
                    <span className="font-semibold">{f.division}{f.kind === "group" ? ` ${f.group.replace("SuperGroup ", "")}` : ""}</span>
                    <span className="text-muted-foreground">Favorite: <span className="text-foreground">{nm(f.favorite)}</span> ({pct(f.favChance)})</span>
                    <span>
                      {f.kind === "final" ? <>Final: {nm(f.home)} <span className="font-semibold tabular-nums">{f.score}</span> {nm(f.away)}</> : <>Won by {nm(f.winner)}</>}
                      <span className="text-muted-foreground">
                        {f.winner === null
                          ? (f.home === f.favorite || f.away === f.favorite ? " · favorite reached the final, decided on penalties" : " · decided on penalties")
                          : favWon ? " · ✓ the favorite" : f.winnerRank ? ` · our #${f.winnerRank} pick (${pct(f.winnerChance ?? 0)})` : ""}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
            {s.groups && s.groups.played > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Across all {s.groups.played} round-robin groups, our favorite finished first in {s.groups.favTopped}; the model expected about {Math.round(s.groups.expected)}.
              </p>
            )}
          </div>
        )}

        {s.upsets && s.upsets.length > 0 && (
          <div>
            <p className="chart-title">Biggest upsets</p>
            <div className="divide-y divide-border/50 text-sm">
              {s.upsets.slice(0, 5).map((u) => (
                <div key={`${u.division}${u.fav}${u.opp}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
                  <span><span className="font-semibold tabular-nums">{pct(u.chance)}</span> favorite {nm(u.fav)} lost <span className="tabular-nums">{u.score}</span> to {nm(u.opp)}</span>
                  <span className="text-xs text-muted-foreground">{u.division} {u.group}{u.noData ? " · no-data team" : ""}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-border/60 bg-muted/40 p-4 text-sm">
          <p>
            <span className="font-semibold">What this tells us.</span> The ratings put teams in the right order more often than not, but
            favorites won less often than predicted. On everyday games the odds hold up, so the gap here comes mostly from the
            teams marked &ldquo;no data&rdquo;: about half the games involved one, and many of those teams had played all season under a
            different name on GotSport, so we never connected them to their results.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function GroupCard({ g }: { g: PredGroup }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="heading-sm">{g.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-3">
          <div className="flex justify-between lowbrow mb-1"><span>Team</span><span>Wins group · exp. pts</span></div>
          {g.teams.map((t) => (
            <div key={t.label} className="flex items-center justify-between gap-3 py-1 text-sm">
              <TeamName t={t} />
              <span className="shrink-0 tabular-nums">
                <span className="font-semibold">{pct(t.winGroup)}</span>
                <span className="text-muted-foreground"> · {(t.expPoints ?? 0).toFixed(1)}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="divide-y divide-border/50 border-t border-border/50">
          {g.matches.map((m) => <MatchRow key={`${m.a.label}|${m.b.label}`} m={m} />)}
        </div>
      </CardContent>
    </Card>
  );
}

function KnockoutList({ rows }: { rows: KnockoutRow[] }) {
  return (
    <div className="divide-y divide-border/50">
      {rows.map((k) => (
        <div key={k.match} className="py-2 text-sm">
          <p className="text-[11px] text-muted-foreground">
            #{k.match} · {k.round} · {formatDates(k.date)} {k.time} · {k.field.replace("Arizona Athletic Grounds - ", "")}
          </p>
          <p>{k.home} vs {k.away}</p>
          {k.likely && (
            <p className="text-[11px] text-muted-foreground">
              Most likely: {k.likely.home} vs {k.likely.away} ({pct(k.likely.chance)})
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function BracketCard({ g }: { g: PredGroup }) {
  const sim = g.teams.some((t) => t.reach);
  const main = (g.knockout ?? []).filter((k) => !/consolation/i.test(k.round));
  const consolation = (g.knockout ?? []).filter((k) => /consolation/i.test(k.round));
  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="heading-sm">{g.name}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {sim
            ? "Single-elimination bracket, played out 10,000 times. A draw goes to penalties (counted as 50/50)."
            : "Championship bracket: teams ranked by rating until the bracket is posted."}
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {sim && (
          <div className="flex items-center gap-3 px-4 pb-1 lowbrow">
            <span className="flex-1">Team</span>
            <span className="w-14 text-right">Rating</span>
            <span className="w-14 text-right">Quarters</span>
            <span className="w-14 text-right">Semis</span>
            <span className="w-14 text-right">Final</span>
            <span className="w-14 text-right">Title</span>
          </div>
        )}
        <div className="divide-y divide-border/50">
          {g.teams.map((t, i) => (
            <div key={t.label} className="flex items-center gap-3 px-4 py-2 text-sm">
              {!sim && <span className="w-6 text-right tabular-nums text-muted-foreground">{i + 1}</span>}
              <span className="flex-1 min-w-0"><TeamName t={t} /></span>
              {!sim && <span className="w-16 text-right tabular-nums text-muted-foreground">{t.record ?? ""}</span>}
              <span className={`${sim ? "w-14" : "w-12"} text-right tabular-nums ${sim ? "text-muted-foreground" : "font-semibold"}`}>{t.rating !== null ? t.rating.toFixed(2) : "—"}</span>
              {t.reach && (
                <>
                  <span className="w-14 text-right tabular-nums text-muted-foreground">{pct(t.reach.qf)}</span>
                  <span className="w-14 text-right tabular-nums text-muted-foreground">{pct(t.reach.sf)}</span>
                  <span className="w-14 text-right tabular-nums">{pct(t.reach.final)}</span>
                  <span className="w-14 text-right tabular-nums font-semibold">{pct(t.reach.title)}</span>
                </>
              )}
            </div>
          ))}
        </div>
        {g.matches.length > 0 && (
          <div className="border-t border-border/50 px-4 pt-3">
            <p className="lowbrow">First round</p>
            <div className="grid gap-x-8 md:grid-cols-2">
              {g.matches.map((m) => <MatchRow key={`${m.a.label}|${m.b.label}`} m={m} />)}
            </div>
          </div>
        )}
        {main.length > 0 && (
          <div className="border-t border-border/50 px-4 pt-3 pb-2">
            <p className="lowbrow">Later rounds</p>
            <KnockoutList rows={main} />
          </div>
        )}
        {consolation.length > 0 && (
          <details className="border-t border-border/50 px-4 py-3">
            <summary className="cursor-pointer lowbrow">Consolation rounds ({consolation.length} matches)</summary>
            <KnockoutList rows={consolation} />
          </details>
        )}
      </CardContent>
    </Card>
  );
}

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = getPrediction(Number(id));
  if (!p) notFound();
  const e = p.event;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/events" className="text-sm text-muted-foreground hover:text-foreground">&larr; Upcoming events</Link>
      <h1 className="display mt-2">{e.name}</h1>
      <p className="mt-1 text-muted-foreground">
        {formatDates(e.start, e.end)}{e.venue ? ` · ${e.venue}` : ""}{e.city ? ` · ${e.city}, ${e.state}` : ""}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {e.league && <Badge variant="secondary">{e.league}</Badge>}
        {e.gender && <Badge variant="outline">{e.gender}</Badge>}
      </div>
      {e.format && <p className="mt-4 max-w-3xl text-sm">{e.format}</p>}

      {p.score?.buckets && (
        <ModelResults s={p.score} generatedAt={p.generatedAt}
          teams={new Map(p.divisions.flatMap((d) => d.groups.flatMap((g) => g.teams)).map((t) => [t.label, t]))} />
      )}

      <Card className="mt-6">
        <CardContent className="text-sm text-muted-foreground space-y-1.5">
          <p>
            <span className="font-semibold text-foreground">How these predictions work.</span> Each match is predicted from
            the two teams&apos; ratings: we look at how often teams with the same rating gap won, drew or lost in real games over
            the last 15 months. Each group is then played out 10,000 times to get every team&apos;s chance of finishing first.
          </p>
          <p>
            {"Each bar shows the chance of a "}
            <span className="font-medium text-foreground">left-team win</span>
            {", a draw and a right-team win. "}
            {`${p.teams.rated} of ${p.teams.total} teams have a rating. Teams marked “no data,” mostly from outside the West, are treated as an average team in their age group.`}
          </p>
          {p.score && !p.score.buckets && (
            <p className="text-foreground">
              Result check: the most likely result was right in {p.score.correct} of {p.score.games} games.
            </p>
          )}
        </CardContent>
      </Card>

      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Age groups">
        {p.divisions.map((d) => (
          <a key={d.division} href={`#${d.division}`} className={chip(false)}>{d.division}</a>
        ))}
      </nav>

      {p.divisions.map((d) => {
        const brackets = d.groups.filter((g) => g.kind === "bracket");
        const superRR = d.groups.filter((g) => g.kind === "round-robin" && /supergroup/i.test(g.name));
        const showcase = d.groups.filter((g) => g.kind === "round-robin" && !/supergroup/i.test(g.name));
        return (
          <section key={d.division} id={d.division} className="mt-10 scroll-mt-20">
            <h2 className="heading mb-1">{d.division} {e.gender ?? ""}</h2>
            <p className="lowbrow mb-4">{d.teams} teams</p>
            {(brackets.length > 0 || superRR.length > 0) && <h3 className="heading-sm mb-3">SuperGroup</h3>}
            {brackets.map((g) => <BracketCard key={g.name} g={g} />)}
            {superRR.length > 0 && (
              <div className="grid gap-4 md:grid-cols-2 mb-6">{superRR.map((g) => <GroupCard key={g.name} g={g} />)}</div>
            )}
            {showcase.length > 0 && <h3 className="heading-sm mb-3">Showcase Groups</h3>}
            <div className="grid gap-4 md:grid-cols-2">
              {showcase.map((g) => <GroupCard key={g.name} g={g} />)}
            </div>
          </section>
        );
      })}

      <p className="mt-10 text-xs text-muted-foreground">
        Ratings as of {p.ratingsFrom.slice(0, 10)} · predictions generated {p.generatedAt.slice(0, 10)}.
      </p>
    </div>
  );
}
