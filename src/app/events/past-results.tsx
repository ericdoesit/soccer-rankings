import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { formatDates, monthLabel } from "@/lib/events";
import { getPastEvents } from "@/lib/past-events";
import { AREAS } from "@/lib/explore";
import { chip } from "@/lib/ui-classes";
import { ChevronRight } from "lucide-react";

/** Finished tournaments, newest first; each links to its results (/tournament/<name>). */
export function PastResults({ q, state }: { q: string; state: string }) {
  const all = getPastEvents();
  const states = [...new Set(all.map((e) => e.state).filter((s): s is string => !!s))]
    .sort((a, b) => all.filter((e) => e.state === b).length - all.filter((e) => e.state === a).length);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = all.filter((e) => (!state || e.state === state) && words.every((w) => e.name.toLowerCase().includes(w)));
  const byMonth = new Map<string, typeof list>();
  for (const e of list) byMonth.set(e.end.slice(0, 7), [...(byMonth.get(e.end.slice(0, 7)) ?? []), e]);
  const label = (code: string) => AREAS.find((a) => a.code === code)?.short ?? code;
  const href = (s: string) => `/events?view=past${s ? `&state=${s}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const pill = chip;

  return (
    <>
      <p className="lead mb-6">
        Tournaments that have finished, newest first: {all.length.toLocaleString()} West events with results in our data. Leagues
        that run all season are not listed here.
      </p>
      <form action="/events" className="mb-3 flex gap-2">
        <input type="hidden" name="view" value="past" />
        {state && <input type="hidden" name="state" value={state} />}
        <input name="q" defaultValue={q} placeholder="Search events (e.g. Surf Cup, State Cup)"
          className="h-9 w-full max-w-sm rounded-full bg-card px-4 text-sm shadow-[var(--surface-shadow)] outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <button className="h-9 rounded-full bg-foreground px-4 text-sm font-medium text-background hover:bg-foreground/85">Search</button>
      </form>
      <div className="mb-6 flex flex-wrap gap-2">
        <Link href={href("")} scroll={false} className={pill(!state)}>All</Link>
        {states.map((s) => <Link key={s} href={href(s)} scroll={false} className={pill(state === s)}>{label(s)}</Link>)}
      </div>
      {list.length === 0 && <p className="text-muted-foreground">No finished events match.</p>}
      {[...byMonth.entries()].map(([month, events]) => (
        <section key={month} className="mb-8">
          <p className="lowbrow mb-3">{monthLabel(`${month}-01`)}</p>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-[var(--surface-line)] px-6">
                {events.map((e) => (
                  <Link key={e.name} href={`/tournament/${encodeURIComponent(e.name)}`}
                    className="group flex flex-wrap items-center gap-x-4 gap-y-1 py-3.5">
                    <span className="w-40 shrink-0 text-sm tabular-nums text-muted-foreground">{formatDates(e.start, e.end)}</span>
                    <span className="flex-1 min-w-[12rem] text-sm font-medium">{e.name}</span>
                    {e.state && <span className="text-sm text-muted-foreground">{label(e.state)}</span>}
                    <span className="text-xs text-muted-foreground tabular-nums">{e.games.toLocaleString()} games · {e.teams.toLocaleString()} teams</span>
                    <span className="row-arrow" aria-hidden><ChevronRight strokeWidth={2} /></span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      ))}
    </>
  );
}
