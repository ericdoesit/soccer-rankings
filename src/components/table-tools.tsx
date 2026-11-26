"use client";

/**
 * Shared pieces of the ranking tables (Southern California, league pages): 25 rows a page, a search
 * box that suggests club names as you type (pick one, or press Enter on the highlighted one), and
 * the pager. Rows keep their rank in the full list while filtered.
 */
import { useMemo, useState } from "react";

export const PAGE = 25;
export const th = "px-4 py-3 text-left text-xs font-normal text-muted-foreground";
export const td = "px-4 py-2.5";
export const rowClass = "border-b border-border/50 hover:bg-muted/50 transition-colors";
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** search + paging state over `rows`; a row matches on its club or any of `text(row)` */
export function useTable<T extends { club: string }>(rows: T[], text: (r: T) => string[] = () => []) {
  const [query, setQueryRaw] = useState("");
  const [page, setPage] = useState(1);
  const clubs = useMemo(() => [...new Set(rows.map((r) => r.club).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [rows]);
  const q = norm(query);
  // club suggestions: names starting with the query first, then names containing it
  const suggestions = useMemo(() => {
    if (!q) return [];
    const starts = clubs.filter((c) => norm(c).startsWith(q));
    const contains = clubs.filter((c) => !norm(c).startsWith(q) && norm(c).includes(q));
    return [...starts, ...contains].slice(0, 8);
  }, [clubs, q]);
  const filtered = useMemo(() => (q ? rows.filter((r) => [r.club, ...text(r)].some((s) => norm(s).includes(q))) : rows),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, q]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages);
  const shown = filtered.slice((current - 1) * PAGE, current * PAGE);
  const setQuery = (v: string) => { setQueryRaw(v); setPage(1); };
  return { query, setQuery, suggestions, filtered, shown, pages, current, setPage };
}

export function SearchBox({ query, setQuery, suggestions, id }: {
  query: string; setQuery: (v: string) => void; suggestions: string[]; id: string;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const pick = (club: string) => { setQuery(club); setOpen(false); };
  return (
    <div className="relative w-full sm:w-72">
      <input
        type="search" value={query} placeholder="Search a club or team" aria-label="Search a club or team"
        role="combobox" aria-expanded={open && suggestions.length > 0} aria-controls={id} aria-autocomplete="list"
        className="h-9 w-full rounded-full border border-border bg-background px-4 text-[13px] font-medium outline-none transition-colors placeholder:font-normal placeholder:text-muted-foreground hover:border-foreground/25 focus:border-foreground/40"
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setHi(0); }}
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
        <ul id={id} role="listbox" className="absolute right-0 left-0 z-20 mt-1 overflow-hidden rounded-2xl border border-border bg-popover py-1 text-[13px] text-popover-foreground">
          {suggestions.map((c, i) => (
            <li key={c} role="option" aria-selected={i === hi}
              onMouseDown={(e) => { e.preventDefault(); pick(c); }} onMouseEnter={() => setHi(i)}
              className={`cursor-pointer truncate px-4 py-1.5 ${i === hi ? "bg-muted" : ""}`}>{c}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** caption on the left, search on the right */
export function TableBar({ caption, children }: { caption: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 pb-2">
      <p className="text-xs text-muted-foreground">{caption}</p>
      {children}
    </div>
  );
}

export function NoMatch({ show, what, query }: { show: boolean; what: string; query: string }) {
  return show ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">No {what} match “{query}”.</p> : null;
}

export function Pager({ current, pages, total, setPage }: { current: number; pages: number; total: number; setPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <nav className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm" aria-label="Pages">
      <span className="text-xs text-muted-foreground">
        {(current - 1) * PAGE + 1}–{Math.min(current * PAGE, total)} of {total}
      </span>
      <span className="flex flex-wrap items-center gap-1">
        <PageButton label="‹ Prev" disabled={current === 1} onClick={() => setPage(current - 1)} />
        {pageList(current, pages).map((p, i) => (p === 0
          ? <span key={`gap${i}`} className="px-1 text-muted-foreground">…</span>
          : <PageButton key={p} label={String(p)} on={p === current} onClick={() => setPage(p)} />))}
        <PageButton label="Next ›" disabled={current === pages} onClick={() => setPage(current + 1)} />
      </span>
    </nav>
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
