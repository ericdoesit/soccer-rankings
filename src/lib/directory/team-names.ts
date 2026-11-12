/**
 * Team identity: current-season age group and a standard display name.
 *
 * Display format (product rule):
 *   [club acronym] [club name] [team identifier] U##
 *   "COSC Pre-ECNL B2014/15 II" of California Odyssey Soccer Club
 *     → "COSC California Odyssey Soccer Club Pre-ECNL II U12"
 *   "COSC Jaguars 2015" (club unknown) → "COSC Jaguars U12"
 * The identifier is whatever the club uses to tell its teams apart (a color,
 * letter, mascot, level such as ECNL RL); birth years and gender markers are
 * dropped in favor of the U## age group.
 *
 * Age groups follow US Soccer's school-year registration from 2026-27: season
 * Aug 1 – Jul 31, U## = season end year − birth year, so a "2015" team is U12 in
 * 2026-27. Dual-year names ("B2014/15", the school-year cohort Aug 2014–Jul
 * 2015) use the later year, matching GotSport's own age field.
 */

/** End year of the season containing `date` (Aug–Dec → next year). */
export function seasonEndYear(date: Date = new Date()): number {
  return date.getUTCMonth() >= 7 ? date.getUTCFullYear() + 1 : date.getUTCFullYear();
}

export const CURRENT_SEASON_END = seasonEndYear();

/** "U12" for a birth year in the current season; "U19+" once a cohort has aged out. */
export function ageGroupFromBirthYear(birthYear: number, seasonEnd = CURRENT_SEASON_END): string | null {
  const age = seasonEnd - birthYear;
  if (age < 6) return null;
  return age > 19 ? "U19+" : `U${age}`;
}

const YEAR = "(20[01]\\d|0[5-9]|1\\d|2[0-2])";
/** Birth-year / gender / age tokens inside a team name, in match order. */
const AGE_TOKENS: Array<[RegExp, (m: RegExpMatchArray) => { years?: number[]; gender?: "Boys" | "Girls"; u?: number; keep?: string }]> = [
  // BU15A, GU9B: gender + U-age + team letter (keep the letter as the identifier)
  [/(?<![A-Za-z0-9])([BG])U-?(\d{1,2})([A-D])(?![A-Za-z0-9])/g, (m) => ({ u: Number(m[2]), gender: g(m[1]), keep: m[3] })],
  // B2014/15, G2010/11, 2014/15, B08/07
  [new RegExp(`(?<![A-Za-z0-9])([BG])?${YEAR}\\s*/\\s*${YEAR}([BG])?(?![A-Za-z0-9])`, "gi"),
    (m) => ({ years: [m[2], m[3]].map(fullYear), gender: g(m[1] ?? m[4]) })],
  // B2014, G2012, 2015, 2015B, 2014G, B14, 14B, G13
  [new RegExp(`(?<![A-Za-z0-9])([BG])?(20[01]\\d)([BG])?(?![A-Za-z0-9])`, "gi"),
    (m) => ({ years: [fullYear(m[2])], gender: g(m[1] ?? m[3]) })],
  [new RegExp(`(?<![A-Za-z0-9])([BG])${YEAR}(?![A-Za-z0-9])`, "gi"), (m) => ({ years: [fullYear(m[2])], gender: g(m[1]) })],
  [new RegExp(`(?<![A-Za-z0-9])${YEAR}([BG])(?![A-Za-z0-9])`, "gi"), (m) => ({ years: [fullYear(m[1])], gender: g(m[2]) })],
  // U12, BU12, GU-14, U12B
  [/(?<![A-Za-z0-9])([BG])?U-?(\d{1,2})([BG])?(?![A-Za-z0-9])/gi, (m) => ({ u: Number(m[2]), gender: g(m[1] ?? m[3]) })],
  [/\b(boys|girls)\b/gi, (m) => ({ gender: m[1].toLowerCase() === "girls" ? "Girls" : "Boys" })],
];
function fullYear(y: string): number { return y.length === 4 ? Number(y) : 2000 + Number(y); }
function g(x?: string): "Boys" | "Girls" | undefined {
  if (!x) return undefined;
  return x.toUpperCase() === "G" ? "Girls" : "Boys";
}

export interface ParsedTeamName {
  birthYear: number | null;
  /** U-number written in the name, valid for the season the name was used in */
  writtenAge: number | null;
  gender: "Boys" | "Girls" | null;
  /** the name with age/gender tokens and "#id" suffixes removed */
  rest: string;
}

export function parseTeamName(name: string): ParsedTeamName {
  let rest = name.replace(/\s#\d+$/, "");
  let birthYear: number | null = null, writtenAge: number | null = null;
  let gender: "Boys" | "Girls" | null = null;
  for (const [re, f] of AGE_TOKENS) {
    rest = rest.replace(re, (...args) => {
      const r = f(args.slice(0, -2) as unknown as RegExpMatchArray);
      if (r.years && birthYear === null) birthYear = Math.max(...r.years);
      if (r.u !== undefined && writtenAge === null) writtenAge = r.u;
      if (r.gender && !gender) gender = r.gender;
      return r.keep ? ` ${r.keep} ` : " ";
    });
  }
  rest = rest.replace(STATE_TAG, " ").replace(/\(\s*\)/g, " ").replace(/['"’]+(?=\s|$)/g, " ")
    .replace(/\s+/g, " ").trim();
  rest = tidy(rest);
  return { birthYear, writtenAge, gender, rest };
}

/** "(CA)", "(CA-S)", "(S-CA)", "(AZ)": state tags some events append to team names */
const STATE_TAG = /\(\s*(?:CA-?[SN]|[SN]-?CA|AK|AZ|CA|CO|HI|ID|MT|NV|NM|OR|UT|WA|WY)\s*\)/g;

/** Drop separators left dangling at either end or doubled ("Club - ECNL" → "Club ECNL"). */
function tidy(s: string): string {
  return s.replace(/\s+[-–|/:]+(?=\s)/g, " ").replace(/^[\s\-–|/:,]+|[\s\-–|/:,]+$/g, "").replace(/\s+/g, " ").trim();
}

const ACRONYM_SKIP = new Set(["of", "the", "and", "de", "&"]);
/** Possible acronyms of a club name: "California Odyssey Soccer Club" → COSC, COS, CO. */
export function clubAcronyms(clubName: string): string[] {
  const words = clubName.replace(/[^A-Za-z0-9& ]+/g, " ").split(/\s+/).filter((w) => w && !ACRONYM_SKIP.has(w.toLowerCase()));
  const out = new Set<string>();
  const initials = words.map((w) => (/^[A-Z0-9]{2,}$/.test(w) ? w : w[0].toUpperCase())).join("");
  out.add(initials);
  // without trailing generic words ("Soccer Club", "FC", "SC")
  const core = words.filter((w) => !/^(soccer|club|fc|sc|jsc|futbol|football|academy|association|youth)$/i.test(w));
  if (core.length >= 2) out.add(core.map((w) => w[0].toUpperCase()).join(""));
  return [...out].filter((a) => a.length >= 2);
}

/**
 * Drop a leading short form of the club name: "Walnut Creek Surf White" for
 * Walnut Creek Surf Soccer Club → "White". Needs at least two words, or one
 * distinctive word (≥ 5 letters, not generic) so "FC" or "Real" never match.
 */
function stripClubPrefix(rest: string, clubName: string): string {
  const club = clubName.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  const words = rest.split(" ");
  const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9]+/g, "");
  for (let k = Math.min(club.length, words.length - 1); k >= 1; k--) {
    if (!words.slice(0, k).every((w, i) => norm(w) === club[i])) continue;
    if (k === 1 && (club[0].length < 5 || GENERIC.has(club[0]))) break;
    return tidy(words.slice(k).join(" "));
  }
  return rest;
}
const GENERIC = new Set(["soccer", "club", "futbol", "football", "united", "academy", "youth", "real", "city", "sporting", "athletic"]);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Display name in the standard format. `clubName` is the club's real name when
 * known (GotSport directory); without it the team's own prefix stands in.
 */
export function formatTeamName(rawName: string, clubName: string | null, ageGroup: string | null): string {
  const parsed = parseTeamName(rawName);
  let rest = parsed.rest;
  let acronym = "";
  if (clubName) {
    // drop the club name if the team name repeats it
    const clubRe = new RegExp(`^${escapeRe(clubName).replace(/\\ /g, "\\s+")}\\b\\s*`, "i");
    rest = rest.replace(clubRe, "");
    // "Sparta United Soccer Club …" for club "Sparta United": drop the leftover suffix
    if (rest !== parsed.rest) rest = rest.replace(/^(soccer club|futbol club|football club|soccer|sc|fc)\b\s*/i, "");
    const acr = clubAcronyms(clubName);
    // "FME SC Blue": the acronym may be followed by SC/FC, which belongs to it
    const lead = rest.match(/^([A-Z][A-Z0-9]{1,6})\b(?:\s+(?:SC|FC|JSC))?\s*/);
    if (lead && acr.some((a) => a === lead[1] || (lead[1].length >= 3 && a.startsWith(lead[1])))) {
      acronym = lead[1]; rest = rest.slice(lead[0].length);
    }
    // a club-name copy after the acronym ("COSC California Odyssey …"), or a
    // repeated one ("ALBION SC San Diego ALBION SC San Diego B16")
    rest = rest.replace(clubRe, "");
    rest = rest.replace(new RegExp(`\\b${escapeRe(clubName).replace(/\\ /g, "\\s+")}\\b`, "gi"), " ");
    rest = tidy(rest);
    rest = stripClubPrefix(rest, clubName);
    // the club name's last word repeated: "Pilchuck Soccer Alliance - Force" + "Force N1 Black"
    const last = clubName.trim().split(/\s+/).pop() ?? "";
    if (last.length >= 4 && /^[A-Za-z]+$/.test(last) && !/^(club|soccer|futbol|football|academy|united|association|league)$/i.test(last))
      rest = rest.replace(new RegExp(`^${escapeRe(last)}\\b\\s*`, "i"), "");
    if (!acronym) {
      const anywhere = acr.find((a) => new RegExp(`(?<![A-Za-z0-9])${a}(?![A-Za-z0-9])`).test(rest));
      if (anywhere) { acronym = anywhere; rest = rest.replace(new RegExp(`(?<![A-Za-z0-9])${anywhere}(?![A-Za-z0-9])\\s*`), ""); }
    }
  }
  const age = ageGroup && ageGroup !== "U19+" ? ageGroup : ageGroup ?? "";
  return [acronym, clubName ?? "", rest, age].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/** Current-season age group for a team, from the best evidence available. */
export function currentAgeGroup(opts: {
  directoryAge?: number | null;
  rawName: string;
  division?: string;
  /** date of the game the name/division was seen in (to age a written U## forward) */
  seenDate?: string;
}): string | null {
  if (opts.directoryAge && opts.directoryAge >= 6 && opts.directoryAge <= 19) return `U${opts.directoryAge}`;
  const p = parseTeamName(opts.rawName);
  if (p.birthYear) return ageGroupFromBirthYear(p.birthYear);
  const d = opts.division ? parseTeamName(opts.division) : null;
  if (d?.birthYear) return ageGroupFromBirthYear(d.birthYear);
  const u = p.writtenAge ?? d?.writtenAge ?? null;
  if (u) {
    const seen = opts.seenDate && /^\d{4}-\d{2}-\d{2}/.test(opts.seenDate) ? seasonEndYear(new Date(opts.seenDate)) : CURRENT_SEASON_END;
    return ageGroupFromBirthYear(seen - u);
  }
  return null;
}
