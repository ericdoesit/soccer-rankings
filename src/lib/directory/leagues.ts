/**
 * League taxonomy for the West. Tiers follow the sibling research project
 * (data/seed/leagues.csv, clubs.csv):
 *   L1  MLS NEXT Homegrown Division
 *   L2  ECNL (Girls/Boys), Girls Academy
 *   L3  ECNL Regional League, MLS NEXT Academy Division, EAL, NAL, GA Aspire, DPL
 *   L4  USYS National League, USYS Elite 64
 *   L5  State / regional premier leagues (N1 conferences, SoCal, Coast, NorCal …)
 *   L6  Local / district leagues (club-run area leagues such as NWRGSL in Albuquerque)
 *   CUP State Cups and other knockout competitions (not a tier; excluded from tiering)
 */
import type { WestState } from "./geo";

export interface LeagueDef {
  slug: string;
  name: string;
  shortName: string;
  tier: string;
  gender: "Boys" | "Girls" | "Both";
  scope: "national" | "regional" | "state";
  states: WestState[] | null;
  governingBody?: string;
  website?: string;
  /** Spellings used in data/seed/clubs.csv "leagues" column. */
  csvNames?: string[];
  /** GotSport event ids (season) that are this league's schedule. */
  gotsportEvents?: Array<[eventId: number, season: string, name: string]>;
}

export const TIER_RANK: Record<string, number> = { L1: 1, L2: 2, L3: 3, L4: 4, L5: 5, L6: 6, PRO: 0, CUP: 9 };

export const LEAGUES: LeagueDef[] = [
  // ── L1 ──
  { slug: "mls-next-hd", name: "MLS NEXT Homegrown Division", shortName: "MLS NEXT HD", tier: "L1",
    gender: "Boys", scope: "national", states: null, governingBody: "Major League Soccer",
    website: "mlsnext.com", csvNames: ["MLS Next HD"] },

  // ── L2 ──
  { slug: "ecnl-girls", name: "ECNL Girls", shortName: "ECNL", tier: "L2", gender: "Girls",
    scope: "national", states: null, governingBody: "US Club Soccer", website: "theecnl.com",
    csvNames: ["ECNL"] },
  { slug: "ecnl-boys", name: "ECNL Boys", shortName: "ECNL", tier: "L2", gender: "Boys",
    scope: "national", states: null, governingBody: "US Club Soccer", website: "theecnl.com",
    csvNames: ["ECNL Boys"] },
  { slug: "girls-academy", name: "Girls Academy", shortName: "GA", tier: "L2", gender: "Girls",
    scope: "national", states: null, website: "thegirlsacademy.com",
    gotsportEvents: [[42137, "2025-26", "25/26 Girls Academy League"], [56497, "2026-27", "26/27 Girls Academy League"]] },

  // USL Academy: pre-pro academies of USL pro clubs (Championship / League One),
  // pathway to USL and MLS contracts ("academy contracts"). Mixed-age U20-style
  // rosters, so teams don't map to one birth year. Schedule on Modular11
  // (modular11.com/league-schedule/usl-academy), not GotSport. Tier L2 is provisional;
  // per the overlap chart, tier is descriptive only, and ratings decide.
  { slug: "usl-academy", name: "USL Academy League", shortName: "USL Academy", tier: "L2", gender: "Both",
    scope: "national", states: null, governingBody: "United Soccer League", website: "usl-academy.com" },

  // ── L3 ──
  { slug: "ecnl-rl", name: "ECNL Regional League", shortName: "ECNL RL", tier: "L3", gender: "Both",
    scope: "regional", states: null, governingBody: "US Club Soccer", csvNames: ["ECNL Regional League"] },
  { slug: "mls-next-ad", name: "MLS NEXT Academy Division", shortName: "MLS NEXT AD", tier: "L3",
    gender: "Boys", scope: "national", states: null, governingBody: "Major League Soccer",
    csvNames: ["MLS Next AD"] },
  { slug: "ga-aspire", name: "GA Aspire", shortName: "Aspire", tier: "L3", gender: "Girls",
    scope: "national", states: null, website: "thegirlsacademy.com",
    gotsportEvents: [[42138, "2025-26", "25/26 Girls Academy Aspire League"], [56498, "2026-27", "26/27 Girls Academy Aspire League"]] },
  { slug: "dpl", name: "Development Player League", shortName: "DPL", tier: "L3", gender: "Girls",
    scope: "national", states: null, website: "developmentplayerleague.com" },
  { slug: "eal", name: "Elite Academy League", shortName: "EAL", tier: "L3", gender: "Boys",
    scope: "national", states: null, website: "eliteacademyleague.com", csvNames: ["Elite Academy League"] },
  // second tier of the Elite Academy League (Modular11 bracket "EA2")
  { slug: "ea2", name: "Elite Academy League 2", shortName: "EA2", tier: "L4", gender: "Boys",
    scope: "national", states: null, website: "eliteacademyleague.com/ea2" },
  { slug: "nal", name: "National Academy League", shortName: "NAL", tier: "L3", gender: "Both",
    scope: "national", states: null, website: "nationalacademyleague.com", csvNames: ["National Academy League"] },

  // ── L4 ──
  { slug: "usys-national-league", name: "USYS National League", shortName: "National League", tier: "L4",
    gender: "Both", scope: "national", states: null, governingBody: "US Youth Soccer",
    csvNames: ["The National League"] },
  { slug: "usys-elite-64", name: "USYS Elite 64", shortName: "Elite 64", tier: "L4", gender: "Both",
    scope: "national", states: null, governingBody: "US Youth Soccer", csvNames: ["USYS Elite 64"] },

  // ── L5: West state / regional premier leagues ──
  { slug: "socal-soccer-league", name: "SoCal Soccer League", shortName: "SoCal", tier: "L5", gender: "Both",
    scope: "state", states: ["CA"], website: "socalsoccerleague.org", csvNames: ["SoCal"],
    gotsportEvents: [
      [43086, "2025-26", "SOCAL Fall League 2025 - 2026"],
      [48745, "2026-27", "SOCAL Fall League 2026 - 2027"],
    ] },
  { slug: "coast-soccer-league", name: "Coast Soccer League", shortName: "Coast", tier: "L5", gender: "Both",
    scope: "state", states: ["CA"], website: "coastsoccer.us", csvNames: ["Coast Soccer"] },
  { slug: "norcal-premier", name: "NorCal Premier Soccer", shortName: "NorCal", tier: "L5", gender: "Both",
    scope: "state", states: ["CA"], website: "norcalpremier.com",
    gotsportEvents: [
      [33458, "2024-25", "2024-25 NorCal Premier Fall League U8-U19"],
      [41823, "2024-25", "2025 NorCal Spring NPL"],
      [44142, "2025-26", "2025-26 NorCal Premier Fall League U8-U19"],
      [49370, "2025-26", "2025-26 NorCal Premier Spring League U8-U19"],
    ] },
  { slug: "wpl", name: "Washington Premier League", shortName: "WPL", tier: "L5", gender: "Both",
    scope: "state", states: ["WA", "OR", "ID"], website: "wplsoccer.com" },
  // Washington Youth Soccer District 1 & 2 competitive league; schedule on Demosphere
  // (scripts/scrape-demosphere-league.ts), not GotSport
  { slug: "north-puget-sound-league", name: "North Puget Sound League", shortName: "NPSL", tier: "L5", gender: "Both",
    scope: "regional", states: ["WA"], governingBody: "Washington Youth Soccer", website: "northpugetsoundleague.org" },
  // Nevada Youth Soccer's statewide competitive league; GotSport runs it as several
  // events per season (fall, spring U9-U14, U15-U19 extended fall)
  { slug: "nevada-state-league", name: "Nevada State League", shortName: "NSL", tier: "L5", gender: "Both",
    scope: "state", states: ["NV"], governingBody: "Nevada Youth Soccer" },
  // Las Vegas club-run league under US Club Soccer (also runs N1 West District 5);
  // member list in data/league-clubs/nv-lv-club-soccer-league.json
  { slug: "lv-club-soccer-league", name: "Las Vegas Club Soccer League", shortName: "LVCSL", tier: "L5", gender: "Both",
    scope: "regional", states: ["NV"], governingBody: "US Club Soccer", website: "downtownlvsc.com/programs/las-vegas-club-soccer-league/" },
  // Reno / Tahoe competitive league (GotSport events 45209, 50419, 56157)
  { slug: "gbysl-select", name: "GBYSL Select (Great Basin Youth Soccer League)", shortName: "GBYSL", tier: "L6", gender: "Both",
    scope: "regional", states: ["NV"], governingBody: "US Club Soccer", website: "gbysl.org/select/" },
  // Las Vegas district league (Vegas West Youth Soccer League dba NSYSL)
  { slug: "nevada-south-ysl", name: "Nevada South Youth Soccer League", shortName: "NSYSL", tier: "L6", gender: "Both",
    scope: "regional", states: ["NV"], governingBody: "Nevada Youth Soccer" },
  // Albuquerque-area district league under New Mexico Youth Soccer; member list
  // in data/league-clubs/nm-nwrgsl.json, schedule not collected yet
  { slug: "nwrgsl", name: "Northwest Rio Grande Soccer League", shortName: "NWRGSL", tier: "L6", gender: "Both",
    scope: "regional", states: ["NM"], governingBody: "New Mexico Youth Soccer", website: "nwrgsl.com" },
  { slug: "wa-regional-club-league", name: "Regional Club League (Washington)", shortName: "RCL", tier: "L5", gender: "Both",
    scope: "state", states: ["WA"], governingBody: "Washington Youth Soccer", website: "rclwashington.com" },
  // N1 League (2026-27 merger of US Club Soccer NPL and USYS National League),
  // run as one GotSport league event per district. Tier L5 like the NPL/N1
  // conferences it replaces; each district is its own league for rankings.
  ...([
    ["n1-west-1-csa", "N1 West District 1 (Colorado Soccer Association)", "N1 West 1", ["CO", "WY"], [[54030, "N1 I West District 1 (CSA) I 2026 - 2027"]], []],
    ["n1-west-2-arizona", "N1 West District 2 (Arizona Soccer Association)", "N1 West 2", ["AZ"], [
      [54448, "N1 I West District 2 (Arizona Soccer Association) I 2026-27"],
      [54034, "N1 I West District 2 (Arizona Soccer Association-Club Based) I 2026-27"]], []],
    ["n1-west-3-socal", "N1 West District 3 (SoCal Soccer League)", "N1 West 3 SoCal", ["CA"], [[54026, "N1 I West District 3 (SOCAL) I 2026-27"]], ["SoCal N1"]],
    ["n1-west-3-cssl", "N1 West District 3 (Coast Soccer League)", "N1 West 3 CSSL", ["CA"], [[54341, "N1 WEST 3 DISTRICT (CSSL) 26/27"]], []],
    ["n1-west-3-arizona", "N1 West District 3 (Arizona Soccer Association)", "N1 West 3 AZ", ["AZ", "CA"], [[54063, "N1 I West District 3 (Arizona Soccer Association) I 2026-27"]], []],
    ["n1-west-4-norcal", "N1 West District 4 (NorCal Premier)", "N1 West 4 NorCal", ["CA"], [[54043, "N1 I West District 4 (NorCal) I 2026-27"]], ["NorCal N1"]],
    ["n1-west-5-las-vegas", "N1 West District 5 (Las Vegas Club Soccer League)", "N1 West 5", ["NV"], [[54042, "N1 I West District 5 (Las Vegas Club Soccer League) I 2026-27"]], []],
    ["n1-west-6-utah", "N1 West District 6 (Utah Soccer)", "N1 West 6", ["UT"], [[54036, "N1 I West District 6 (Utah Soccer) I 2026-27"]], []],
    ["n1-northwest-1-idaho", "N1 Northwest District 1 (Idaho Youth Soccer Association)", "N1 Northwest 1", ["ID", "MT"], [[55157, "N1 I Northwest District 1 (ID, MT) (Idaho Youth Soccer Association) I 2026 - 2027"]], []],
    ["n1-northwest-2-oysa", "N1 Northwest District 2 (Oregon Youth Soccer Association)", "N1 Northwest 2", ["OR"], [
      [54037, "N1 I Northwest District 2 (OYSA) U13-U14 I 2026-27"],
      [57626, "N1 U15-U19 I Northwest District 2 (OYSA) I 2026-27"]], []],
    ["n1-northwest-3-rcl", "N1 Northwest District 3 (Regional Club League)", "N1 Northwest 3 RCL", ["WA"], [[54035, "N1 I Northwest District 3 (Regional Club League) I 2026-27"]], []],
    ["n1-northwest-3-wpl", "N1 Northwest District 3 (Washington Premier League)", "N1 Northwest 3 WPL", ["WA"], [[54050, "N1 I Northwest District 3 (Washington Premier League) I 2026-27"]], ["WPL N1 (Washington)"]],
    // South conference, but its district covers West Texas, El Paso and New Mexico (eppremierleague.com/national-1)
    ["n1-south-4-el-paso", "N1 South District 4 (El Paso Premier League)", "N1 South 4", ["NM"], [[54049, "N1 I South District 4 (El Paso Premier League) I 2026-27"]], []],
    ["n1-northwest-5-miso", "N1 Northwest District 5 (MISO Junior League)", "N1 Northwest 5", ["HI"], [[54048, "N1 I Northwest District 5 (MISO Junior League) I 2026-27"]], []],
  ] as Array<[string, string, string, WestState[], Array<[number, string]>, string[]]>).map(
    ([slug, name, shortName, states, events, csvNames]): LeagueDef => ({
      slug, name, shortName, tier: "L5", gender: "Both", scope: "state", states,
      governingBody: "N1 League (US Club Soccer / US Youth Soccer)", website: "national1league.org", csvNames,
      gotsportEvents: events.map(([id, n]) => [id, "2026-27", n] as [number, string, string]),
    })),
  { slug: "mountain-west-n1", name: "Mountain West N1", shortName: "Mountain West", tier: "L5",
    gender: "Both", scope: "regional", states: ["UT", "ID", "MT", "WY", "CO", "NV"],
    csvNames: ["Mountain West N1"] },
  { slug: "frontier-premier", name: "Frontier Premier League", shortName: "FPL", tier: "L5", gender: "Both",
    scope: "regional", states: ["CO", "NM", "WY"], csvNames: ["Frontier Premier League"] },
  { slug: "usl-youth", name: "USL Youth", shortName: "USL Youth", tier: "L5", gender: "Both",
    scope: "national", states: null, csvNames: ["USL Youth"] },

  // ── Cups ──
  { slug: "cal-south-state-cup", name: "Cal South State Cup", shortName: "State Cup", tier: "CUP",
    gender: "Both", scope: "state", states: ["CA"],
    gotsportEvents: [[48929, "2025-26", "SOCAL State Cup 2026 - Youngers 2019 - 2012"]] },
  { slug: "cal-north-state-cup", name: "Cal North State Cup", shortName: "State Cup", tier: "CUP",
    gender: "Both", scope: "state", states: ["CA"],
    gotsportEvents: [
      [44146, "2025-26", "2025-26 NorCal State Cup U9-U19"],
      [48531, "2025-26", "2025-26 U9-U10 NorCal State Cup RD 2 and 3"],
    ] },
];

/** clubs.csv league spelling → league slug */
export const CSV_LEAGUE_TO_SLUG: Map<string, string> = new Map(
  LEAGUES.flatMap((l) => (l.csvNames ?? []).map((n) => [n, l.slug] as [string, string]))
);
