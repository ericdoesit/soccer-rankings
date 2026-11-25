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

const YEAR = "(20[01]\\d|202[01]|0[5-9]|1\\d|2[0-2])";
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
  return s.replace(/\s+[-–|/:]+(?=\s)/g, " ").replace(/^[\s\-–|/:,._]+|[\s\-–|/:,_]+$/g, "").replace(/\s+/g, " ").trim();
}

const ACRONYM_SKIP = new Set(["of", "the", "and", "de", "&"]);
/** Possible acronyms of a club name: "California Odyssey Soccer Club" → COSC, COS, CO. */
export function clubAcronyms(clubName: string): string[] {
  const words = clubName.replace(STATE_TAG, " ").replace(/[^A-Za-z0-9& ]+/g, " ").split(/\s+/).filter((w) => w && !ACRONYM_SKIP.has(w.toLowerCase()));
  const out = new Set<string>();
  out.add(words.map((w) => (/^[A-Z0-9]{2,}$/.test(w) ? w : w[0].toUpperCase())).join(""));
  // a name written in capitals: "TOTAL FUTBOL ACADEMY" → TFA
  out.add(words.map((w) => w[0].toUpperCase()).join(""));
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
    // "TOTAL FUTBOL ACADEMY (CA)": the team name has had its state tag removed, so match without it
    const matchName = clubName.replace(STATE_TAG, " ").replace(/\s+/g, " ").trim() || clubName;
    // drop the club name if the team name repeats it
    const clubRe = new RegExp(`^${escapeRe(matchName).replace(/\\ /g, "\\s+")}\\b\\s*`, "i");
    rest = rest.replace(clubRe, "");
    // "Sparta United Soccer Club …" for club "Sparta United": drop the leftover suffix
    if (rest !== parsed.rest) rest = rest.replace(/^(soccer club|futbol club|football club|soccer|sc|fc)\b\s*/i, "");
    const acr = clubAcronyms(matchName);
    // "FME SC Blue": the acronym may be followed by SC/FC, which belongs to it
    const lead = rest.match(/^([A-Z][A-Z0-9]{1,6})\b(?:\s+(?:SC|FC|JSC)\b)?\s*/);
    const firstWord = matchName.split(/\s+/)[0];
    if (lead && lead[1] === firstWord && /^[A-Z0-9]{4,}$/.test(firstWord)) {
      // "PRIME SC White" for PRIME Soccer Club: the club's own first word, not an acronym
      rest = tidy(rest.slice(lead[0].length));
    } else if (lead && acr.some((a) => a === lead[1] || (lead[1].length >= 3 && a.startsWith(lead[1])))) {
      acronym = lead[1]; rest = tidy(rest.slice(lead[0].length));
    }
    // a club-name copy after the acronym ("COSC California Odyssey …"), or a
    // repeated one ("ALBION SC San Diego ALBION SC San Diego B16")
    rest = rest.replace(clubRe, "");
    rest = rest.replace(new RegExp(`\\b${escapeRe(matchName).replace(/\\ /g, "\\s+")}\\b`, "gi"), " ");
    // the club name without its first word at the start: "S1 Alliance SLA" for AYSO S1 Alliance
    const tail = matchName.split(/\s+/).slice(1);
    if (tail.length >= 2)
      rest = tidy(rest.replace(new RegExp(`^${escapeRe(tail.join(" ")).replace(/\\ /g, "\\s*")}(?![A-Za-z0-9])[\\s-]*`, "i"), ""));
    // the club's short form anywhere: "Beach FC" for Beach Futbol Club, "Arsenal SC" for Arsenal Soccer Club
    const shortForm = matchName.replace(/\b(?:Futbol|Football) Club\b/i, "FC").replace(/\bSoccer Club\b/i, "SC");
    if (shortForm !== matchName && shortForm.split(/\s+/).length >= 2)
      rest = rest.replace(new RegExp(`(?<![A-Za-z0-9])${escapeRe(shortForm).replace(/\\ /g, "[\\s,]+")}(?![A-Za-z0-9])[\\s,-]*`, "gi"), " ");
    rest = tidy(rest);
    rest = stripClubPrefix(rest, matchName);
    // the club name's last word repeated: "Pilchuck Soccer Alliance - Force" + "Force N1 Black"
    const last = matchName.trim().split(/\s+/).pop() ?? "";
    if (last.length >= 4 && /^[A-Za-z]+$/.test(last) && !/^(club|soccer|futbol|football|academy|united|association|league)$/i.test(last))
      rest = rest.replace(new RegExp(`^${escapeRe(last)}\\b\\s*`, "i"), "");
    if (!acronym) {
      const anywhere = acr.find((a) => new RegExp(`(?<![A-Za-z0-9])${a}(?![A-Za-z0-9])`).test(rest));
      if (anywhere) { acronym = anywhere; rest = rest.replace(new RegExp(`(?<![A-Za-z0-9])${anywhere}(?![A-Za-z0-9])\\s*`), ""); }
    }
  }
  // colors and directions written in capitals ("SELA NAVY", "CENTRAL LA") read as words; codes stay
  rest = rest.replace(CAPS_WORD, (w) => w[0] + w.slice(1).toLowerCase())
    // a stray closing parenthesis: "Central LA Prado)"
    .replace(/^([^(]*)\)/, "$1").trim();
  const age = ageGroup && ageGroup !== "U19+" ? ageGroup : ageGroup ?? "";
  return [acronym, clubName ?? "", rest, age].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

const CAPS_WORD = /\b(RED|WHITE|BLUE|NAVY|BLACK|GOLD|GREEN|ORANGE|GREY|GRAY|SILVER|PURPLE|YELLOW|MAROON|PINK|ROYAL|TEAL|NORTH|SOUTH|EAST|WEST|CENTRAL)\b/g;

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

/** All-caps words that are names, not abbreviations, even though "Next" etc. exist in title case. */
const KEEP_CAPS = new Set(["NEXT", "ECNL", "ECRL", "AYSO", "USYS", "USSF", "YMCA", "NPSL", "PSSLU", "DPLO", "NPLO", "LAFC", "CCFC", "MLS", "USA"]);
/**
 * Consistent casing for names typed in capitals: "ALBION SC Santa Ana SANTA ANA ACADEMY" →
 * "Albion SC Santa Ana Santa Ana Academy". An all-caps word (3+ letters) becomes title case only
 * when the data also writes it that way (`titleWords`: lowercased words seen as "Albion", "Santa"),
 * so abbreviations that never appear in title case stay ("SDSC", "FRAM", "OCSA"); KEEP_CAPS too.
 */
export function caseWords(name: string, titleWords: Set<string>): string {
  return name.replace(/\b[A-Z]{3,}\b/g, (w) => (KEEP_CAPS.has(w) || !titleWords.has(w.toLowerCase()) ? w : w[0] + w.slice(1).toLowerCase()));
}
/** lowercased words written in title case somewhere in these names ("Albion" → "albion") */
export function titleCaseWords(names: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const n of names) for (const w of n.match(/\b[A-Z][a-z]{2,}\b/g) ?? []) out.add(w.toLowerCase());
  return out;
}
