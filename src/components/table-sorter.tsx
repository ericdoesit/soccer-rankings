"use client";

import { useEffect } from "react";
import "./table-sorter.css";

/**
 * Makes every <table> on the site sortable by clicking its column headers, without
 * per-page code. Mounted once in the root layout.
 *
 * - Values are read from each cell's text: numbers win ("#74", "52%", "1,234", "9-3-1",
 *   "U13–U18" all sort by their first number), otherwise text order. Blank and "—" cells
 *   always go last. A cell can override its value with data-sort="…".
 * - First click sorts numbers high→low and text A→Z (rank and age columns, whose header
 *   contains "rank", "#" or "age", sort low→high); a second click reverses.
 * - Opt out with data-no-sort on the <table> (e.g. tables that sort server-side across
 *   pages) or on a single <th>.
 * - If React re-renders the rows (client tables), the current sort is re-applied.
 */

type Dir = "asc" | "desc";
const BLANK = /^(|—|–|-|n\/a|no data)$/i;

function cellValue(cell: Element | undefined): number | string | null {
  if (!cell) return null;
  const raw = (cell as HTMLElement).dataset.sort ?? cell.textContent ?? "";
  const text = raw.replace(/\s+/g, " ").trim();
  if (BLANK.test(text)) return null;
  const m = text.replace(/,/g, "").match(/^[#$+]?\s*(?:U)?(-?\d+(?:\.\d+)?)/i);
  if (m) return parseFloat(m[1]);
  return text.toLowerCase();
}

function headerCells(table: HTMLTableElement): HTMLTableCellElement[] {
  const rows = table.tHead?.rows;
  if (!rows?.length) return [];
  return [...rows[rows.length - 1].cells];
}

function sortable(table: HTMLTableElement) {
  if (table.hasAttribute("data-no-sort") || !table.tHead || !table.tBodies.length) return false;
  // Skip tables whose headers already handle clicks or use merged cells.
  return ![...table.tHead.querySelectorAll("th")].some((th) => th.colSpan > 1 || th.rowSpan > 1);
}

const state = new WeakMap<HTMLTableElement, { col: number; dir: Dir; observer: MutationObserver; busy: boolean }>();

function applySort(table: HTMLTableElement) {
  const s = state.get(table);
  if (!s || s.col < 0) return;
  const width = headerCells(table).length;
  for (const body of table.tBodies) {
    const rows = [...body.rows];
    // Only full-width data rows move; spacer/loading rows (colSpan) stay at the end.
    const data = rows.filter((r) => r.cells.length === width);
    const other = rows.filter((r) => r.cells.length !== width);
    const sign = s.dir === "asc" ? 1 : -1;
    const keyed = data.map((r, i) => ({ r, i, v: cellValue(r.cells[s.col]) }));
    keyed.sort((a, b) => {
      if (a.v === null || b.v === null) return a.v === b.v ? a.i - b.i : a.v === null ? 1 : -1;
      if (typeof a.v === "number" && typeof b.v === "number") return sign * (a.v - b.v) || a.i - b.i;
      if (typeof a.v === "number") return -1;
      if (typeof b.v === "number") return 1;
      return sign * (a.v as string).localeCompare(b.v as string, undefined, { numeric: true }) || a.i - b.i;
    });
    const order = [...keyed.map((k) => k.r), ...other];
    if (order.every((r, i) => r === rows[i])) continue;
    s.busy = true;
    for (const r of order) body.appendChild(r);
  }
  s.observer.takeRecords();
  s.busy = false;
}

function enhance(table: HTMLTableElement) {
  if (state.has(table) || !sortable(table)) return;
  const observer = new MutationObserver(() => {
    const s = state.get(table);
    if (s && !s.busy) applySort(table);
  });
  for (const body of table.tBodies) observer.observe(body, { childList: true });
  state.set(table, { col: -1, dir: "asc", observer, busy: false });
  table.dataset.sortable = "";
  for (const th of headerCells(table)) {
    if (th.hasAttribute("data-no-sort") || !th.textContent?.trim()) continue;
    th.dataset.sortCol = "";
    th.tabIndex = 0;
    th.setAttribute("aria-sort", "none");
  }
}

function onActivate(th: HTMLTableCellElement) {
  const table = th.closest("table") as HTMLTableElement | null;
  const s = table && state.get(table);
  if (!table || !s) return;
  const col = headerCells(table).indexOf(th);
  if (col < 0) return;
  const label = (th.textContent ?? "").toLowerCase();
  const sample = [...table.tBodies[0].rows].map((r) => cellValue(r.cells[col])).find((v) => v !== null);
  const first: Dir = /rank|#|age/.test(label) || typeof sample !== "number" ? "asc" : "desc";
  s.dir = s.col === col ? (s.dir === "asc" ? "desc" : "asc") : first;
  s.col = col;
  for (const h of headerCells(table)) {
    if (h.dataset.sortCol === undefined) continue;
    h.setAttribute("aria-sort", h === th ? (s.dir === "asc" ? "ascending" : "descending") : "none");
  }
  applySort(table);
}

export function TableSorter() {
  useEffect(() => {
    const scan = () => document.querySelectorAll("table").forEach((t) => enhance(t as HTMLTableElement));
    scan();
    const pageObserver = new MutationObserver(scan);
    pageObserver.observe(document.body, { childList: true, subtree: true });

    const header = (e: Event) => {
      const th = (e.target as Element).closest?.("th[data-sort-col]") as HTMLTableCellElement | null;
      if (!th || (e.target as Element).closest("a,button,input,select")) return null;
      return th;
    };
    const click = (e: MouseEvent) => { const th = header(e); if (th) onActivate(th); };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const th = header(e);
      if (th) { e.preventDefault(); onActivate(th); }
    };
    document.addEventListener("click", click);
    document.addEventListener("keydown", key);
    return () => {
      pageObserver.disconnect();
      document.removeEventListener("click", click);
      document.removeEventListener("keydown", key);
    };
  }, []);
  return null;
}
