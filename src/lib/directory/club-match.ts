/**
 * Match a club name from a league / association list to our clubs, within one
 * state. League lists write names differently from GotSport:
 *   "AZ Arsenal"                    ↔ "Arizona Arsenal Soccer Club"   (state abbreviation)
 *   "Futbolito Bimbo Soccer League" ↔ "FBSL"                          (acronym)
 *   "CDO Soccer Club"               ↔ "Canyon Del Oro Soccer Club"    (acronym inside)
 *   "RSL-AZ Souther"                ↔ "RSL-AZ Southern AZ"            (cut off)
 * Matching is only ever within one state, since acronyms repeat across states.
 */
import { normalizeClubName } from "./normalize";

const STATE_WORDS: Record<string, string> = {
  az: "arizona", ca: "california", co: "colorado", nv: "nevada", ut: "utah", wa: "washington",
  or: "oregon", id: "idaho", mt: "montana", nm: "new mexico", wy: "wyoming", hi: "hawaii", ak: "alaska",
};
/** normalized key with state abbreviations expanded and trailing state tags dropped */
export function clubKey(name: string): string {
  const words = normalizeClubName(name).split(" ").map((w) => STATE_WORDS[w] ?? w);
  return words.join(" ").trim();
}

const STATE_ONLY = new Set(Object.values(STATE_WORDS));
/** national programs whose name starts every local club's name: "AYSO Region 1447" ≠ "AYSO United" */
const SHARED_ACRONYMS = new Set(["AYSO", "USYS", "USSF", "YMCA", "TOPS"]);

export interface ClubMatcher { match(name: string): string | null }

const words = (name: string) => name.replace(/\([^)]*\)/g, " ").replace(/[^A-Za-z0-9 ]+/g, " ").split(/\s+/)
  .filter((w) => w && !/^(of|the|and|de)$/i.test(w));
const initials = (name: string) => words(name).map((w) => w[0].toUpperCase()).join("");
/** initials keeping short all-caps tokens whole: "Mercer Island FC" → "MIFC" */
const initialsKeepCaps = (name: string) => words(name).map((w) => (/^[A-Z]{2,4}$/.test(w) ? w : w[0].toUpperCase())).join("");
const asAcronym = (name: string) => {
  const bare = name.replace(/\s*\([^)]*\)/g, "").trim();
  return /^[A-Z][A-Z0-9-]{2,5}$/.test(bare) ? bare.replace(/-/g, "") : null;
};

export function clubMatcher(candidates: string[]): ClubMatcher {
  const byKey = new Map<string, string>();
  // exact spelling wins over the loose key: "FC Hawaii" and "Hawaii Youth Soccer
  // Association" both reduce to "hawaii"
  const byLower = new Map(candidates.map((c) => [c.trim().toLowerCase(), c]));
  const acronymClubs = new Map<string, Set<string>>(); // "FBSL" → clubs whose whole name is that acronym
  const byInitials = new Map<string, Set<string>>();   // "CDO" (Canyon Del Oro …) → clubs
  const add = (m: Map<string, Set<string>>, k: string, c: string) => m.set(k, (m.get(k) ?? new Set()).add(c));
  for (const c of candidates) {
    byKey.set(clubKey(c), c);
    const a = asAcronym(c);
    if (a) add(acronymClubs, a, c);
    for (const ini of new Set([initials(c), initialsKeepCaps(c)]))
      for (let n = 3; n <= Math.min(5, ini.length); n++) add(byInitials, ini.slice(0, n), c);
  }
  const keys = [...byKey.keys()];
  // unique club, treating spellings with the same key ("Fife-Milton-Edgewood SC" /
  // "Fife-Milton-Edgewood Soccer Club") as one club
  const one = (set?: Set<string>) => {
    if (!set?.size) return null;
    const keysSeen = new Set([...set].map(clubKey));
    return keysSeen.size === 1 ? [...set][0] : null;
  };
  return {
    match(name: string) {
      const same = byLower.get(name.trim().toLowerCase());
      if (same) return same;
      const k = clubKey(name);
      if (!k) return null;
      const exact = byKey.get(k);
      if (exact) return exact;
      // cut-off or shortened names: one is a prefix of the other (≥ 8 chars, unique)
      if (k.length >= 8) {
        // a key that is only a state name ("New Mexico Youth Soccer" → "new mexico")
        // is the association itself, not a prefix of a club
        const pre = keys.filter((c) => !STATE_ONLY.has(c) && (c.startsWith(k) || (k.startsWith(c) && c.length >= 8)));
        if (pre.length === 1) return byKey.get(pre[0])!;
        if (pre.length > 1) return null; // ambiguous ("RSL-AZ Souther": South or Southern AZ)
      }
      // "Futbolito Bimbo Soccer League" → a club named "FBSL"
      const full = one(acronymClubs.get(initials(name)));
      if (full) return full;
      // "FBSL" or "CDO Soccer Club" → the club whose name starts with those initials
      const lead = asAcronym(name) ?? name.match(/^([A-Z]{3,5})\s/)?.[1] ?? null;
      if (lead && !SHARED_ACRONYMS.has(lead)) return one(byInitials.get(lead));
      return null;
    },
  };
}
