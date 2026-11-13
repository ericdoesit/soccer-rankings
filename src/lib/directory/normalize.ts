/**
 * Club-name normalization for matching the same club across sources
 * ("Beach Futbol Club", "BEACH FC", "Beach F.C. (S-CA)" → "beach").
 */

const STOPWORDS = new Set([
  "fc", "sc", "jsc", "cf", "sa", "ysa", "ys", "yss", "yc", "afc", "cfc", "ssc",
  "soccer", "club", "futbol", "football", "youth", "the", "of", "de",
  "association", "assoc", "inc", "llc", "organization", "league",
]);

/** Tokens that identify a team/league rather than a club ("ECNL RL B08/07"). */
const TEAM_SUFFIX = /\b(ecnl|rl|pre|ga|aspire|mlsn|mls next|npl|dpl|eal|nal|b\d{2,4}(\/\d{2,4})?|g\d{2,4}(\/\d{2,4})?|u\d{1,2})\b.*$/i;

/**
 * Write club abbreviations without dots, as most clubs do: "Alianza F.C." → "Alianza FC",
 * "F.C .KATANA" → "FC KATANA", "Palmeras S.C" → "Palmeras SC", "A.F.C." → "AFC", "C.F." → "CF".
 * For display names; matching already ignores these words (normalizeClubName).
 */
export function standardizeAbbreviations(name: string): string {
  return name
    // (?<![A-Za-z]\.) leaves other dotted initials alone ("U.S.C.")
    .replace(/(?<![A-Za-z]\.\s?)\b(A\s?\.\s?)?F\s?\.\s?C\b\s?\.?\s*/gi, (_m, a: string | undefined) => (a ? "AFC " : "FC "))
    .replace(/(?<![A-Za-z]\.\s?)\bS\s?\.\s?C\b(?!\s?\.\s?[A-Za-z]\.)\s?\.?\s*/g, "SC ")
    .replace(/(?<![A-Za-z]\.\s?)\bC\s?\.\s?F\b\s?\.?\s*/g, "CF ")
    .replace(/\s+([),])/g, "$1")
    .replace(/\s{2,}/g, " ")
    // "Union Sacramento FC FC ADP" (club + a short name "Union FC …"): one FC is enough
    .replace(/\b(FC|SC|AFC)(\s+\1)+\b/g, "$1")
    .trim();
}

export function normalizeClubName(name: string): string {
  const key = normalizeTokens(name);
  // Names made only of stopwords ("Soccer Club", "FC") keep their raw tokens
  return key || name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeTokens(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ") // "(S-CA)", "(CFYSC)"
    .replace(/&/g, " and ")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !STOPWORDS.has(w))
    .join(" ")
    .trim();
}

/** Club part of a league-list entry like "Charlotte SA Blue ECNL RL B08/07". */
export function stripTeamSuffix(name: string): string {
  return name.replace(TEAM_SUFFIX, "").trim();
}

export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Birth year from a team name ("2013B", "B2013", "13G", "G13", "U13 (2014)"). */
export function birthYearFromName(name: string): number | null {
  const four = name.match(/(?:^|[^0-9])(20[01]\d)(?:[^0-9]|$)/);
  if (four) return Number(four[1]);
  const two = name.match(/(?:^|[^0-9])[BG]?(0[5-9]|1[0-9])[BG](?:[^0-9a-z]|$)/i) ??
    name.match(/(?:^|[^0-9a-z])[BG](0[5-9]|1[0-9])(?:[^0-9]|$)/i);
  if (two) return 2000 + Number(two[1]);
  return null;
}
