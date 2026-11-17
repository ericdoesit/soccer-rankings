import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMlsPredictions, type MlsPick, type MlsTeamRow } from "@/lib/mlsnext";
import { chip } from "@/lib/ui-classes";

export const metadata = { title: "MLS NEXT predictions · Youth Soccer Rankings" };

const pct = (x: number) => `${Math.round(100 * x)}%`;
const DIVISIONS = [{ key: "homegrown", label: "Homegrown Division" }, { key: "academy", label: "Academy Division" }];
const fmtDate = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });

type SP = Promise<{ [k: string]: string | string[] | undefined }>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function Pill({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} scroll={false}
      className={chip(on)}>
      {children}
    </Link>
  );
}

function Team({ name, id }: { name: string; id: number | null }) {
  return id ? <Link href={`/team/${id}`} className="hover:underline">{name}</Link> : <span>{name}</span>;
}

function Bar({ m }: { m: MlsPick }) {
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <div className="bg-primary" style={{ width: pct(m.win) }} />
      <div className="bg-muted-foreground/40" style={{ width: pct(m.draw) }} />
      <div className="bg-foreground/70" style={{ width: pct(m.loss) }} />
    </div>
  );
}

export default async function MlsNextPage({ searchParams }: { searchParams: SP }) {
  const data = getMlsPredictions();
  if (!data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="display mb-4">MLS NEXT</h1>
        <p className="text-muted-foreground">No predictions yet. Run <code>npm run scrape:mlsnext</code>, <code>npm run build:data</code> and <code>npm run predict:mlsnext</code>.</p>
      </div>
    );
  }
  const sp = await searchParams;
  const division = DIVISIONS.some((d) => d.key === one(sp.division)) ? one(sp.division)! : "homegrown";
  const inDiv = data.conferences.filter((c) => c.division === division);
  const ages = [...new Set(inDiv.map((c) => c.ageGroup))].sort();
  const age = ages.includes(one(sp.age) ?? "") ? one(sp.age)! : ages.includes("U15") ? "U15" : ages[0];
  const confs = inDiv.filter((c) => c.ageGroup === age)
    .sort((a, b) => Number(b.west) - Number(a.west) || a.conference.localeCompare(b.conference));
  const conf = confs.find((c) => c.conference === one(sp.conf)) ?? confs[0];
  const href = (d: string, a: string, c?: string) => `/mls-next?division=${d}&age=${a}${c ? `&conf=${encodeURIComponent(c)}` : ""}`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="display mb-3">MLS NEXT predictions</h1>
      <p className="lead mb-6">
        2026-27 season, Homegrown and Academy Divisions. Each upcoming game is predicted from the two teams&apos; ratings, and each
        conference&apos;s remaining schedule is played out 10,000 times to project the final table. Tables rank by points per game,
        as MLS NEXT does. Schedule and results come from the league&apos;s public schedule via{" "}
        <a href="https://mlsnexttracker.com/" className="underline" target="_blank" rel="noreferrer">MLS NEXT Tracker</a>.
        {data.score && <> So far {data.score.correct} of {data.score.games} predicted games ({pct(data.score.correct / data.score.games)}) went the way we said was most likely.</>}
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        {DIVISIONS.map((d) => <Pill key={d.key} href={href(d.key, age)} on={d.key === division}>{d.label}</Pill>)}
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {ages.map((a) => <Pill key={a} href={href(division, a, conf?.conference)} on={a === age}>{a}</Pill>)}
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {confs.map((c) => <Pill key={c.conference} href={href(division, age, c.conference)} on={c === conf}>{c.conference}</Pill>)}
      </div>

      {conf && (
        <>
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="heading-sm">{conf.conference} · {age} · projected final table</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full table-fixed text-sm sm:table-auto">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left">Team</th>
                    <th className="hidden px-2 py-2 text-right sm:table-cell">W-D-L</th>
                    <th className="hidden px-2 py-2 text-right sm:table-cell">GF-GA</th>
                    <th className="w-14 px-2 py-2 text-right sm:w-auto">PPG now</th>
                    <th className="w-[4.5rem] px-2 py-2 text-right sm:w-auto">Projected</th>
                    <th className="hidden px-2 py-2 text-right sm:table-cell">1st</th>
                    <th className="w-16 px-4 py-2 text-right sm:w-auto">Top 4</th>
                  </tr>
                </thead>
                <tbody>
                  {conf.teams.map((t: MlsTeamRow) => (
                    <tr key={t.name} className="border-b last:border-0">
                      <td className="px-4 py-2">
                        <Team name={t.club} id={t.teamId} />
                        {t.assumed && <span className="ml-1.5 text-[11px] text-muted-foreground">(no data)</span>}
                        {t.provisional && <span className="ml-1.5 text-[11px] text-muted-foreground" title="Fewer than 10 games: rating is provisional">(few games)</span>}
                        <div className="mt-0.5 text-xs text-muted-foreground tabular-nums sm:hidden">{t.w}-{t.d}-{t.l}{t.first >= 0.005 ? ` · 1st ${pct(t.first)}` : ""}</div>
                      </td>
                      <td className="hidden px-2 py-2 text-right tabular-nums sm:table-cell">{t.w}-{t.d}-{t.l}</td>
                      <td className="hidden px-2 py-2 text-right tabular-nums text-muted-foreground sm:table-cell">{t.gf}-{t.ga}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{t.ppm.toFixed(2)}</td>
                      <td className="px-2 py-2 text-right tabular-nums font-medium">{t.expPpm.toFixed(2)}</td>
                      <td className="hidden px-2 py-2 text-right tabular-nums sm:table-cell">{t.first >= 0.005 ? pct(t.first) : "–"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{t.top4 >= 0.005 ? pct(t.top4) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="heading-sm">Next {data.days} days · {conf.upcoming.length} games</CardTitle>
              <p className="text-xs text-muted-foreground">
                Each bar shows the chance of a home win, a draw and an away win. Flex and Pro Pathway games are included but
                don&apos;t count in the table. Times are Pacific.
              </p>
            </CardHeader>
            <CardContent className="divide-y">
              {conf.upcoming.length === 0 && <p className="py-3 text-sm text-muted-foreground">No games scheduled in this window.</p>}
              {conf.upcoming.map((m) => (
                <div key={m.matchId} className="py-2.5">
                  <p className="mb-1 text-[11px] text-muted-foreground">
                    {fmtDate(m.startTime)}{m.location ? ` · ${m.location}` : ""}{m.kind !== "league" ? ` · ${m.kind === "flex" ? "Flex" : "Pro Pathway"}` : ""}
                  </p>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate"><Team name={m.home} id={m.homeTeamId} /></span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{pct(m.win)} · {pct(m.draw)} · {pct(m.loss)}</span>
                    <span className="truncate text-right"><Team name={m.away} id={m.awayTeamId} /></span>
                  </div>
                  <div className="mt-1.5"><Bar m={m} /></div>
                  {m.noData && <p className="mt-1 text-[11px] text-muted-foreground">One team has no rating yet; it counts as an average team in its conference.</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
      <p className="mt-4 text-xs text-muted-foreground">Updated {new Date(data.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.</p>
    </div>
  );
}
