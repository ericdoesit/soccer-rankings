/**
 * Normalize the many date formats our scrapers produce into ISO "YYYY-MM-DD".
 *
 * Seen in the wild:
 *   "2026-03-27"                 (rankings API, MLS Next, adidas)
 *   "2025-10-18T16:55:00Z"       (GotSport API matchTime)
 *   "Sep 06, 2025" / "Sep 7, 2025"
 *   "Friday, Oct 24, 2025"       (AZ/NV, sometimes with a trailing "\n9:00 AM")
 *   "SEPTEMBER 6, 2025"          (Coast Soccer)
 *   "06:40 PM"                   (Utah, Surf Cup — a time only, no date)
 *
 * Returns "" when no calendar date can be recovered. Parsing is done by hand
 * (not `new Date(str)`) so results don't depend on the server's timezone.
 */
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function valid(y: number, m: number, d: number): boolean {
  return y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

export function normalizeDate(input: unknown): string {
  if (typeof input !== "string") return "";
  const s = input.trim();
  if (!s) return "";

  // ISO date or datetime
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    return valid(y, m, d) ? `${iso[1]}-${iso[2]}-${iso[3]}` : "";
  }

  // "[Weekday, ]Month D[D], YYYY" with full or abbreviated month, any case
  const named = s.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (named) {
    const m = MONTHS[named[1].slice(0, 3).toLowerCase()];
    const d = Number(named[2]);
    const y = Number(named[3]);
    if (m && valid(y, m, d)) return `${y}-${pad(m)}-${pad(d)}`;
  }

  // "MM/DD/YYYY" or "MM/DD/YY"
  const slashed = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/);
  if (slashed) {
    const m = Number(slashed[1]);
    const d = Number(slashed[2]);
    const y = slashed[3].length === 2 ? 2000 + Number(slashed[3]) : Number(slashed[3]);
    if (valid(y, m, d)) return `${y}-${pad(m)}-${pad(d)}`;
  }

  return "";
}
