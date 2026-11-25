"use client";

/**
 * Southern California rankings table: 25 rows a page, and a search box that suggests club names
 * as you type (pick one, or press Enter on the highlighted one, to fill it in). Rows keep their
 * rank in the full list while filtered.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import type { SoCalClub, SoCalTeam } from "@/lib/socal";

const PAGE = 25;
const th = "px-4 py-3 text-left text-xs font-normal text-muted-foreground";
const td = "px-4 py-2.5";
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

type Props = { caption: string } & ({ kind: "teams"; rows: SoCalTeam[] } | { kind: "clubs"; rows: SoCalClub[] });

export function SoCalTable(props: Props) {
  const { caption, kind } = props;
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);

  const clubs = useMemo(() => [...new Set(props.rows.map((r) => r.club))].sort((a, b) => a.localeCompare(b)), [props.rows]);
  const q = norm(query);
  // club suggestions: names starting with the query first, then names containing it
  const suggestions = useMemo(() => {
    if (!q) return [];
    const starts = clubs.filter((c) => norm(c).startsWith(q));
    const contains = clubs.filter((c) => !norm(c).startsWith(q) && norm(c).includes(q));
    return [...starts, ...contains].slice(0, 8);
  }, [clubs, q]);
  const rows = useMemo(() => (q
    ? (props.rows as Array<SoCalTeam | SoCalClub>).filter((r) => norm(r.club).includes(q) || ("name" in r && norm(r.name).includes(q)))
    : props.rows) as Array<SoCalTeam | SoCalClub>, [props.rows, q]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages);
  const shown = rows.slice((current - 1) * PAGE, current * PAGE);

  const pick = (club: string) => { setQuery(club); setPage(1); setOpen(false); };

  return (
    <Card className="gap-0 pb-0">
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 pb-2">
          <p className="text-xs text-muted-foreground">{caption}</p>
          <div className="relative w-full sm:w-72">
            <input
              type="search" value={query} placeholder="Search a club or team" aria-label="Search a club or team"
              role="combobox" aria-expanded={open && suggestions.length > 0} aria-controls="socal-suggest" aria-autocomplete="list"
              className="w-full rounded-full bg-card px-4 py-1.5 text-sm shadow-[var(--surface-shadow)] outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
              onChange={(e) => { setQuery(e.target.value); setPage(1); setOpen(true); setHi(0); }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 120)}
              onKeyDown={(e) => {
                if (!open || !suggestions.length) return;
                if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => (h + 1) % suggestions.length); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => (h - 1 + suggestions.length) % suggestions.length); }
                else if (e.key === "Enter") { e.preventDefault(); pick(suggestions[hi]); }
                else if (e.key === "Escape") setOpen(false);
              }}
            />
            {open && suggestions.length > 0 && !(suggestions.length === 1 && suggestions[0] === query) && (
              <ul id="socal-suggest" role="listbox" className="absolute right-0 left-0 z-20 mt-1 overflow-hidden rounded-2xl bg-popover py-1 text-sm text-popover-foreground shadow-[var(--surface-shadow)]">
                {suggestions.map((c, i) => (
                  <li key={c} role="option" aria-selected={i === hi}
                    onMouseDown={(e) => { e.preventDefault(); pick(c); }} onMouseEnter={() => setHi(i)}
                    className={`cursor-pointer truncate px-4 py-1.5 ${i === hi ? "bg-muted" : ""}`}>{c}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            {kind === "teams" ? (
              <>
                <thead>
                  <tr className="border-b border-border">
                    <th className={`${th} w-12 sm:w-16`}>#</th>
                    <th className={th}>Team</th>
                    <th className={`${th} hidden lg:table-cell w-56`}>League</th>
                    <th className={`${th} w-16 text-right`}>Rating</th>
                    <th className={`${th} hidden sm:table-cell w-28 text-center`}>This season</th>
                    <th className={`${th} hidden md:table-cell w-24 text-right`}>West rank</th>
                  </tr>
                </thead>
                <tbody>
                  {(shown as SoCalTeam[]).map((t) => (
                    <tr key={t.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                      <td className={`${td} rank-num`}>{t.rank}</td>
                      <td className={`${td} min-w-0`}>
                        <Link href={`/team/${t.id}`} className="block truncate font-medium hover:text-primary" title={t.name}>{t.name}</Link>
                        <span className="block truncate text-xs text-muted-foreground lg:hidden">{t.league}</span>
                      </td>
                      <td className={`${td} hidden lg:table-cell truncate text-muted-foreground`} title={t.league}>{t.league}</td>
                      <td className={`${td} text-right tabular-nums font-medium`}>{t.rating.toFixed(2)}</td>
                      <td className={`${td} hidden sm:table-cell text-center tabular-nums text-muted-foreground`}>{t.record}</td>
                      <td className={`${td} hidden md:table-cell text-right tabular-nums text-muted-foreground`}>{t.westRank ? `#${t.westRank}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </>
            ) : (
              <>
                <thead>
                  <tr className="border-b border-border">
                    <th className={`${th} w-12 sm:w-16`}>#</th>
                    <th className={th}>Club</th>
                    <th className={`${th} w-20 text-right`}>Strength</th>
                    <th className={`${th} hidden sm:table-cell w-24 text-center`}>Age groups</th>
                    <th className={`${th} hidden sm:table-cell w-20 text-center`}>Teams</th>
                    <th className={`${th} hidden lg:table-cell w-64`}>Leagues</th>
                  </tr>
                </thead>
                <tbody>
                  {(shown as SoCalClub[]).map((c) => (
                    <tr key={c.club} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                      <td className={`${td} rank-num`}>{c.rank}</td>
                      <td className={`${td} min-w-0`}>
                        <Link href={`/club/${c.slug}`} className="block truncate font-medium hover:text-primary" title={c.club}>{c.club}</Link>
                        {c.best && (
                          <span className="block truncate text-xs text-muted-foreground">
                            best: {c.best.ageGroup} {c.best.gender.toLowerCase()}, top {Math.max(1, Math.round(100 - c.best.percentile))}%
                          </span>
                        )}
                      </td>
                      <td className={`${td} text-right tabular-nums font-medium`}>{c.strength.toFixed(1)}</td>
                      <td className={`${td} hidden sm:table-cell text-center tabular-nums text-muted-foreground`}>{c.ageGroups}</td>
                      <td className={`${td} hidden sm:table-cell text-center tabular-nums text-muted-foreground`}>{c.teams}</td>
                      <td className={`${td} hidden lg:table-cell truncate text-muted-foreground`} title={c.leagues.join(", ")}>{c.leagues.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}
          </table>
          {!shown.length && <p className="px-4 py-8 text-center text-sm text-muted-foreground">No {kind} match “{query}”.</p>}
        </div>
        {pages > 1 && (
          <nav className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm" aria-label="Pages">
            <span className="text-xs text-muted-foreground">
              {(current - 1) * PAGE + 1}–{Math.min(current * PAGE, rows.length)} of {rows.length}
            </span>
            <span className="flex flex-wrap items-center gap-1">
              <PageButton label="‹ Prev" disabled={current === 1} onClick={() => setPage(current - 1)} />
              {pageList(current, pages).map((p, i) => (p === 0
                ? <span key={`gap${i}`} className="px-1 text-muted-foreground">…</span>
                : <PageButton key={p} label={String(p)} on={p === current} onClick={() => setPage(p)} />))}
              <PageButton label="Next ›" disabled={current === pages} onClick={() => setPage(current + 1)} />
            </span>
          </nav>
        )}
      </CardContent>
    </Card>
  );
}

/** 1 … 4 5 [6] 7 8 … 20 (0 = gap) */
function pageList(current: number, pages: number): number[] {
  const keep = new Set([1, pages, current - 1, current, current + 1].filter((p) => p >= 1 && p <= pages));
  const out: number[] = [];
  [...keep].sort((a, b) => a - b).forEach((p, i, a) => { if (i && p - a[i - 1] > 1) out.push(0); out.push(p); });
  return out;
}

function PageButton({ label, on, disabled, onClick }: { label: string; on?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} aria-current={on ? "page" : undefined} onClick={onClick}
      className={`min-w-8 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${on ? "bg-foreground text-background" : "bg-card shadow-[var(--surface-shadow)] hover:bg-muted"} disabled:opacity-40`}>
      {label}
    </button>
  );
}
