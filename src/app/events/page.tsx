import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getUpcomingEvents, formatDates, monthLabel } from "@/lib/events";

export const metadata = { title: "Upcoming Events · Youth Soccer Rankings" };

export default function EventsPage() {
  const { events, until } = getUpcomingEvents();
  const byMonth = new Map<string, typeof events>();
  for (const e of events) {
    const k = e.start.slice(0, 7);
    byMonth.set(k, [...(byMonth.get(k) ?? []), e]);
  }
  const withPredictions = events.filter((e) => e.predictions);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="heading mb-2">Upcoming Events</h1>
      <p className="text-sm text-muted-foreground mb-6 max-w-3xl">
        Major tournaments, State Cups and league events in the West over the next six months
        {until ? ` (through ${formatDates(until)})` : ""}: tracked competitions, events whose last edition had 300+ games,
        and events we have predictions for.
      </p>

      {withPredictions.length > 0 && (
        <Card className="mb-8 border-primary/40">
          <CardContent className="py-4">
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
              <div className="divide-y divide-border/50">
                {list.map((e) => {
                  const row = (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                      <span className="w-40 shrink-0 text-sm tabular-nums text-muted-foreground">{formatDates(e.start, e.end)}</span>
                      <span className="flex-1 min-w-[12rem] text-sm font-medium">{e.name}</span>
                      <span className="text-sm text-muted-foreground">{e.city ? `${e.city}, ` : ""}{e.state}</span>
                      {e.kind !== "Tournament" && <Badge variant="secondary">{e.kind}</Badge>}
                      {e.lastEditionGames ? <span className="text-xs text-muted-foreground">last time {e.lastEditionGames.toLocaleString()} games</span> : null}
                      {e.predictions && <Badge>Predictions</Badge>}
                    </div>
                  );
                  return e.predictions
                    ? <Link key={e.id} href={`/events/${e.id}`} className="block hover:bg-muted/50 transition-colors">{row}</Link>
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
