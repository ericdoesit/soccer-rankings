"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Flight Planner (src/lib/flight-planner.ts): paste a tournament's teams, confirm each match, then
 * split them into flights of similar strength across leagues or within one league, with every
 * game predicted.
 */
interface Candidate { id: number; name: string; club: string; state: string; rating: number; games: number; league: string | null; listed: boolean; match: number }
interface Row { input: string; candidates: Candidate[] }
interface Level { league: string; median: number; teams: number }
interface PlanTeam { key: string; name: string; rating: number; league: string | null; id?: number }
interface Game { a: string; b: string; margin: number; outcome: { win: number; draw: number; loss: number } }
interface Flight { name: string; teams: PlanTeam[]; avg: number; spread: number; level: string | null; close: number; mismatches: number; games: Game[] }

const AGES = ["U8", "U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17", "U18", "U19"];
const AGE_ITEMS = [{ value: "", label: "Age: from names" }, ...AGES.map((a) => ({ value: a, label: a }))];
const GENDER_ITEMS = [{ value: "", label: "Gender: from names" }, { value: "Boys", label: "Boys" }, { value: "Girls", label: "Girls" }];
const SIZE_ITEMS = [4, 5, 6, 8].map((n) => ({ value: String(n), label: `${n} teams per flight` }));
const MODE_ITEMS = [{ value: "mixed", label: "Mixed leagues" }, { value: "league", label: "Within each league" }];

const SAMPLE = `ALBION SC San Diego B2014 Academy
LA Galaxy B2014
Beach Futbol Club B2014
LA City United B2014
Legends FC B2014
Oxnard FC Los Toros B2014
Strikers FC B2014
Pateadores B2014`;

/** choice per row: a candidate id, or "level:<league>" (unmatched team placed at a league's median) */
type Choice = string;
const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function FlightPlannerPage() {
  const [text, setText] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [match, setMatch] = useState<{ ageGroup: string; gender: string; rows: Row[]; levels: Level[] } | null>(null);
  const [choice, setChoice] = useState<Choice[]>([]);
  const [size, setSize] = useState("4");
  const [mode, setMode] = useState<"mixed" | "league">("mixed");
  const [onlyLeague, setOnlyLeague] = useState("");
  const [flights, setFlights] = useState<Flight[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function runMatch() {
    setBusy(true); setError(""); setFlights(null);
    try {
      const res = await fetch("/api/flight-planner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "match", teamList: text, ageGroup: age, gender }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Matching failed");
      setMatch(d);
      setChoice(d.rows.map((r: Row) => (r.candidates[0] ? String(r.candidates[0].id) : `level:${d.levels[Math.floor(d.levels.length / 2)]?.league ?? ""}`)));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }

  // the confirmed teams, as the planner sees them
  const teams: PlanTeam[] = useMemo(() => {
    if (!match) return [];
    return match.rows.map((r, i): PlanTeam | null => {
      const c = choice[i] ?? "";
      if (c === "skip") return null;
      if (c.startsWith("level:")) {
        const lv = match.levels.find((l) => l.league === c.slice(6));
        return lv ? { key: `row${i}`, name: r.input, rating: lv.median, league: lv.league } : null;
      }
      const cand = r.candidates.find((x) => String(x.id) === c);
      return cand ? { key: `row${i}`, name: cand.name, rating: cand.rating, league: cand.league, id: cand.id } : null;
    }).filter((t): t is PlanTeam => !!t && (!onlyLeague || t.league === onlyLeague));
  }, [match, choice, onlyLeague]);
  const leaguesHere = useMemo(() => [...new Set(teams.map((t) => t.league).filter(Boolean))] as string[], [teams]);

  useEffect(() => {
    if (!match || teams.length < 2) return;
    let live = true;
    const t = setTimeout(async () => {
      const res = await fetch("/api/flight-planner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "plan", teams, size: Number(size), mode, ageGroup: match.ageGroup, gender: match.gender }) });
      const d = await res.json();
      if (live) { if (res.ok) setFlights(d.flights); else setError(d.error); }
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [teams, size, mode, match]);

  function exportCsv() {
    if (!flights) return;
    const rows = [["Flight", "Seed", "Team", "Rating", "League"], ...flights.flatMap((f) => f.teams.map((t, i) => [f.name, String(i + 1), t.name, t.rating.toFixed(2), t.league ?? ""]))];
    const blob = new Blob([rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "flights.csv"; a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="display">Flight planner</h1>
      <p className="lead mt-3 max-w-3xl">
        Paste a tournament&rsquo;s teams, confirm each match, and split them into flights of similar strength, across
        leagues or within each league. Every game is predicted from the ratings.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="heading-sm">1. Teams</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} placeholder={"One team per line, e.g.\n" + SAMPLE}
              className="w-full rounded-lg border border-border bg-background p-3 font-mono text-xs" />
            <div className="flex flex-wrap gap-2">
              <Select items={AGE_ITEMS} value={age} onValueChange={(v) => setAge(v ?? "")}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>{AGE_ITEMS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
              </Select>
              <Select items={GENDER_ITEMS} value={gender} onValueChange={(v) => setGender(v ?? "")}>
                <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent>{GENDER_ITEMS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={runMatch} disabled={busy}>{busy ? "Matching…" : "Match teams"}</Button>
              <Button variant="outline" onClick={() => setText(SAMPLE)}>Sample</Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <p className="text-xs text-muted-foreground">
              Age and gender come from names like B2014, BU13 or B14 when you leave them blank. Matching uses every rated
              team of that age, listed or not.
            </p>
          </CardContent>
        </Card>

        {match && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="heading-sm">2. Confirm matches · {match.ageGroup} {match.gender}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="keep-align w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2">Pasted</th>
                      <th className="px-4 py-2">Team</th>
                      <th className="px-4 py-2 text-right">Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {match.rows.map((r, i) => {
                      const c = choice[i] ?? "";
                      const cand = r.candidates.find((x) => String(x.id) === c);
                      const lv = c.startsWith("level:") ? match.levels.find((l) => l.league === c.slice(6)) : null;
                      const items = [
                        ...r.candidates.map((x) => ({ value: String(x.id), label: `${x.name} · ${x.league ?? x.state} · ${x.games} games` })),
                        ...match.levels.map((l) => ({ value: `level:${l.league}`, label: `Not found: place at ${l.league} level (${l.median.toFixed(1)})` })),
                        { value: "skip", label: "Leave out" },
                      ];
                      return (
                        <tr key={i} className="border-b border-border/50 align-top">
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.input}</td>
                          <td className="px-4 py-2">
                            <Select items={items} value={c} onValueChange={(v) => v !== null && setChoice((p) => p.map((x, j) => (j === i ? v : x)))}>
                              <SelectTrigger className={`w-full max-w-[420px] ${!r.candidates.length ? "border-amber-500" : ""}`}><SelectValue /></SelectTrigger>
                              <SelectContent>{items.map((it) => <SelectItem key={it.value} value={it.value}>{it.label}</SelectItem>)}</SelectContent>
                            </Select>
                            {cand && <Link href={`/team/${cand.id}`} target="_blank" className="mt-1 inline-block text-xs text-muted-foreground hover:text-primary">{cand.club} · {cand.listed ? "ranked" : "rated, not listed"} →</Link>}
                            {!r.candidates.length && <p className="mt-1 text-xs text-amber-600">No match found: choose a level or leave it out.</p>}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{(cand?.rating ?? lv?.median)?.toFixed(2) ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {match && (
        <div className="mt-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="heading-sm mr-2">3. Flights</span>
            <Select items={MODE_ITEMS} value={mode} onValueChange={(v) => v && setMode(v as "mixed" | "league")}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>{MODE_ITEMS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select items={[{ value: "", label: "All leagues" }, ...leaguesHere.map((l) => ({ value: l, label: `Only ${l}` }))]} value={onlyLeague} onValueChange={(v) => setOnlyLeague(v ?? "")}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All leagues</SelectItem>
                {leaguesHere.map((l) => <SelectItem key={l} value={l}>Only {l}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select items={SIZE_ITEMS} value={size} onValueChange={(v) => v && setSize(v)}>
              <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>{SIZE_ITEMS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
            {flights && <Button variant="outline" onClick={exportCsv}>Export CSV</Button>}
          </div>

          {flights && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {flights.map((f) => (
                <Card key={f.name}>
                  <CardHeader className="pb-2">
                    <CardTitle className="heading-sm">{f.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      avg {f.avg.toFixed(1)}{f.level ? ` · about ${f.level} level` : ""} · spread {f.spread.toFixed(1)} goals ·{" "}
                      {f.close}% of games within a goal{f.mismatches ? ` · ${f.mismatches} lopsided` : ""}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ol className="space-y-1 text-sm">
                      {f.teams.map((t, i) => (
                        <li key={t.key} className="flex items-baseline gap-2">
                          <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                          {t.id ? <Link href={`/team/${t.id}`} className="min-w-0 flex-1 truncate hover:text-primary">{t.name}</Link> : <span className="min-w-0 flex-1 truncate italic">{t.name}</span>}
                          <span className="shrink-0 text-xs text-muted-foreground">{t.league ?? ""}</span>
                          <span className="w-10 shrink-0 text-right tabular-nums">{t.rating.toFixed(1)}</span>
                        </li>
                      ))}
                    </ol>
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground">{f.games.length} predicted games</summary>
                      <ul className="mt-2 space-y-1">
                        {f.games.map((g, j) => {
                          const fav = g.margin >= 0;
                          const p = fav ? g.outcome.win : g.outcome.loss;
                          return (
                            <li key={j} className={`flex gap-2 ${p >= 0.85 ? "text-amber-600" : ""}`}>
                              <span className="min-w-0 flex-1 truncate">{fav ? g.a : g.b} over {fav ? g.b : g.a}</span>
                              <span className="shrink-0 tabular-nums">by {Math.abs(g.margin).toFixed(1)} · {pct(p)} win · {pct(g.outcome.draw)} draw</span>
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Flights are cut from a ladder of ratings, strongest first, so sizes differ by at most one team. &ldquo;Within
            a goal&rdquo; counts games whose predicted margin is one goal or less; &ldquo;lopsided&rdquo; ones have a
            favorite who wins 85% of the time or more. Teams placed at a league&rsquo;s level use that league&rsquo;s
            median rating for this age group.
          </p>
        </div>
      )}
    </div>
  );
}
