/**
 * Shared class strings for the site theme's pill controls (see globals.css).
 *
 * - segment / segmentItem: switching between views of one page ("By division / All games",
 *   "Upcoming / Past results"): one white pill holding the options, the active one filled.
 * - chip: one-tap filters (age groups, genders, states, levels): white pills, active filled.
 *
 * Hover: light gray; pressed: a darker gray; leaving fades back out (same as the header nav).
 */
export const segment = "inline-flex items-center gap-1 rounded-full bg-card p-1 shadow-[var(--surface-shadow)]";

export const segmentItem = (on: boolean) =>
  `rounded-full px-4 py-1.5 text-sm font-medium ${
    on ? "bg-foreground text-background" : "text-foreground hover:bg-muted active:bg-[var(--press)] transition-colors duration-300 ease-out hover:duration-150 active:duration-75"
  }`;

export const chip = (on: boolean) =>
  `inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
    on
      ? "bg-foreground text-background"
      : "bg-card text-foreground shadow-[var(--surface-shadow)] hover:bg-muted active:bg-[var(--press)] transition-colors duration-300 ease-out hover:duration-150 active:duration-75"
  }`;
