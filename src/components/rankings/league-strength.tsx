"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Row {
  program: string; teams: number; avgScore: number; topScore: number;
  crossGames: number; links: Array<{ program: string; games: number }>; lessCertain: boolean;
}

/** How the leagues compare in one age group + gender (shared rating scale). */
export function LeagueStrength({ ageGroup, gender, onPick }: { ageGroup: string; gender: string; onPick?: (program: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/rankings?strength=1&ageGroup=${encodeURIComponent(ageGroup)}&gender=${encodeURIComponent(gender)}`)
      .then((r) => r.json()).then((d) => { if (live) setRows(d); }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [ageGroup, gender]);
  if (!rows || rows.length < 2) return null;
  const max = Math.max(...rows.map((r) => r.avgScore)), min = Math.min(...rows.map((r) => r.avgScore));
  const width = (v: number) => `${max === min ? 100 : 15 + (85 * (v - min)) / (max - min)}%`;
  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">League strength · {ageGroup} {gender}</CardTitle>
        <p className="text-xs text-muted-foreground">
          Average rating of each league&apos;s listed teams, on the same scale as the rankings. The gap between two
          leagues comes from the games their teams played against each other (showcases, cups); fewer than 50 such
          games makes that league&apos;s position less certain.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((r) => (
          <div key={r.program} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-sm">
            <button type="button" className="text-left font-medium hover:text-primary" onClick={() => onPick?.(r.program)} title={`Show only ${r.program} teams`}>
              {r.program}
            </button>
            <div className="h-2 rounded bg-muted">
              <div className={`h-2 rounded ${r.lessCertain ? "bg-muted-foreground/40" : "bg-primary"}`} style={{ width: width(r.avgScore) }} />
            </div>
            <div className="text-right text-xs tabular-nums text-muted-foreground" title={r.links.slice(0, 4).map((l) => `${l.games} vs ${l.program}`).join(" · ")}>
              avg {r.avgScore.toFixed(1)} · top {r.topScore.toFixed(1)} · {r.teams} teams · {r.crossGames} cross-league games
              {r.lessCertain && <span className="ml-1 text-amber-600 dark:text-amber-400">· less certain</span>}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
