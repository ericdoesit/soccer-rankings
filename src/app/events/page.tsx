import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getUpcomingEvents, formatDates, monthLabel } from "@/lib/events";
import { PastResults } from "./past-results";
import { segment, segmentItem } from "@/lib/ui-classes";
import { ChevronRight } from "lucide-react";

export const metadata = { title: "Events · Youth Soccer Rankings" };

const tab = segmentItem;

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; state?: string }> }) {
  const sp = await searchParams;
  const past = sp.view === "past";
  const tabs = (
    <div className={`${segment} mb-6`}>
      <Link href="/events" className={tab(!past)}>Upcoming</Link>
      <Link href="/events?view=past" className={tab(past)}>Past results</Link>
    </div>
  );
  if (past) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="display mb-6">Past events</h1>
        {tabs}
        <PastResults q={sp.q ?? ""} state={sp.state ?? ""} />
      </div>
    );
  }
  const { events, until } = getUpcomingEvents();
  const byMonth = new Map<string, typeof events>();
  for (const e of events) {
    const k = e.start.slice(0, 7);
    byMonth.set(k, [...(byMonth.get(k) ?? []), e]);
  }
  const withPredictions = events.filter((e) => e.predictions);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="display mb-6">Upcoming events</h1>
      {tabs}
      <p className="mb-6 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Major tournaments, State Cups and league events in the West over the next six months
        {until ? ` (through ${formatDates(until)})` : ""}: tracked competitions, events whose last edition had 300+ games,
        and events we have predictions for.
      </p>

      {withPredictions.length > 0 && (
        <Card className="mb-8">
          <CardContent>
            <p className="lowbrow mb-2">Predictions</p>
            {withPredictions.map((e) => (
              <Link key={e.id} href={`/events/${e.id}`} className="flex flex-wrap items-baseline justify-between gap-2 py-1 hover:underline">
                <span className="font-semibold">{e.name}</span>
                <span className="text-sm text-muted-foreground">{formatDates(e.start, e.end)} · {e.city ? `${e.city}, ` : ""}{e.state}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {events.length === 0 && <p className="text-muted-foreground">No upcoming events yet. Run <code>npm run events:upcoming</code>.</p>}

      {[...byMonth.entries()].map(([month, list]) => (
        <section key={month} className="mb-8">
          <p className="lowbrow mb-3">{monthLabel(`${month}-01`)}</p>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-[var(--surface-line)] px-6">
                {list.map((e) => {
                  const row = (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3.5">
                      <span className="w-40 shrink-0 text-sm tabular-nums text-muted-foreground">{formatDates(e.start, e.end)}</span>
                      <span className="flex-1 min-w-[12rem] text-sm font-medium">{e.name}</span>
                      <span className="text-sm text-muted-foreground">{e.city ? `${e.city}, ` : ""}{e.state}</span>
                      {e.kind !== "Tournament" && <Badge variant="secondary">{e.kind}</Badge>}
                      {e.lastEditionGames ? <span className="text-xs text-muted-foreground">last time {e.lastEditionGames.toLocaleString()} games</span> : null}
                      {e.predictions && <Badge>Predictions</Badge>}
                      {e.predictions && <span className="row-arrow ml-auto" aria-hidden><ChevronRight strokeWidth={2} /></span>}
                    </div>
                  );
                  return e.predictions
                    ? <Link key={e.id} href={`/events/${e.id}`} className="group block">{row}</Link>
                    : <div key={e.id}>{row}</div>;
                })}
              </div>
            </CardContent>
          </Card>
        </section>
      ))}
    </div>
  );
}
