/**
 * Region IV geography: states, GotSport associations, State Cup brackets, metros.
 *
 * State Cups (fantasy tournament): one per state, except California which has
 * two state associations — Cal South (CA-S, GotSport "CAS") and Cal North
 * (CA-N, GotSport "CAN").
 */

export const WEST_STATES = [
  "AK", "AZ", "CA", "CO", "HI", "ID", "MT", "NV", "NM", "OR", "UT", "WA", "WY",
] as const;
export type WestState = (typeof WEST_STATES)[number];

export const STATE_NAMES: Record<WestState, string> = {
  AK: "Alaska", AZ: "Arizona", CA: "California", CO: "Colorado", HI: "Hawaii",
  ID: "Idaho", MT: "Montana", NV: "Nevada", NM: "New Mexico", OR: "Oregon",
  UT: "Utah", WA: "Washington", WY: "Wyoming",
};

/** GotSport team_association → [postal state, State Cup key]. */
export const ASSOCIATIONS: Record<string, [WestState, string]> = {
  CAS: ["CA", "CA-S"], CAN: ["CA", "CA-N"],
  AK: ["AK", "AK"], AZ: ["AZ", "AZ"], CO: ["CO", "CO"], HI: ["HI", "HI"],
  ID: ["ID", "ID"], MT: ["MT", "MT"], NV: ["NV", "NV"], NM: ["NM", "NM"],
  OR: ["OR", "OR"], UT: ["UT", "UT"], WA: ["WA", "WA"], WY: ["WY", "WY"],
};

export const STATE_CUPS = [
  "CA-S", "CA-N", "AK", "AZ", "CO", "HI", "ID", "MT", "NV", "NM", "OR", "UT", "WA", "WY",
] as const;

export interface MetroDef {
  slug: string;
  name: string;
  state: WestState;
  stateCup: string;
  lat: number;
  lng: number;
  /** Lower-case place names; a club whose name or city contains one belongs here. */
  places: string[];
}

const m = (
  slug: string, name: string, state: WestState, stateCup: string,
  lat: number, lng: number, places: string[]
): MetroDef => ({ slug, name, state, stateCup, lat, lng, places });

export const METROS: MetroDef[] = [
  // ── Southern California (Cal South) ──
  m("los-angeles", "Los Angeles", "CA", "CA-S", 34.05, -118.24, [
    "los angeles", "la galaxy", "lafc", "pasadena", "glendale", "burbank", "santa monica",
    "torrance", "long beach", "south bay", "san fernando", "valencia", "santa clarita",
    "palmdale", "lancaster", "antelope valley", "west valley", "sgv", "san gabriel",
    "arcadia", "cerritos", "downey", "whittier", "pomona", "la canada", "manhattan beach",
    "palos verdes", "beach futbol", "eagle rock", "culver city", "calabasas", "chino",
  ]),
  m("orange-county", "Orange County", "CA", "CA-S", 33.72, -117.83, [
    "orange county", "irvine", "anaheim", "santa ana", "huntington beach", "newport",
    "costa mesa", "fullerton", "mission viejo", "laguna", "san clemente", "tustin",
    "yorba linda", "brea", "placentia", "garden grove", "fountain valley", "slammers",
    "strikers fc", "pateadores", "rancho santa margarita", "aliso viejo", "dana point",
    "seal beach", "cypress", "los alamitos", "orange",
  ]),
  m("inland-empire", "Inland Empire", "CA", "CA-S", 34.0, -117.4, [
    "inland empire", "riverside", "san bernardino", "temecula", "murrieta", "corona",
    "ontario", "rancho cucamonga", "fontana", "redlands", "menifee", "hemet", "eastvale",
    "upland", "yucaipa", "victorville", "high desert", "lake elsinore", "norco",
  ]),
  m("san-diego", "San Diego", "CA", "CA-S", 32.72, -117.16, [
    "san diego", "carlsbad", "encinitas", "del mar", "chula vista", "oceanside",
    "escondido", "poway", "rancho santa fe", "la jolla", "el cajon", "vista", "surf",
    "albion sc", "nomads", "rebels", "san marcos", "coronado", "otay", "north county",
  ]),
  m("ventura-santa-barbara", "Ventura & Santa Barbara", "CA", "CA-S", 34.28, -119.23, [
    "ventura", "oxnard", "thousand oaks", "conejo", "simi valley", "camarillo",
    "moorpark", "santa barbara", "goleta", "santa maria", "san luis obispo", "gold coast",
  ]),
  m("coachella-valley", "Coachella Valley", "CA", "CA-S", 33.72, -116.37, [
    "coachella", "palm springs", "palm desert", "indio", "la quinta", "desert",
  ]),
  m("bakersfield", "Bakersfield", "CA", "CA-S", 35.37, -119.02, ["bakersfield", "kern"]),

  // ── Northern California (Cal North) ──
  m("sf-bay-area", "San Francisco Bay Area", "CA", "CA-N", 37.6, -122.2, [
    "san francisco", "bay area", "oakland", "berkeley", "east bay", "walnut creek",
    "danville", "mustang", "lamorinda", "pleasanton", "fremont", "hayward", "san ramon",
    "concord", "palo alto", "menlo park", "peninsula", "burlingame", "san mateo",
    "marin", "novato", "santa rosa", "sonoma", "napa", "vallejo", "benicia", "livermore",
    "mvla", "mountain view", "los altos", "sunnyvale", "san jose", "santa clara",
    "cupertino", "de anza", "los gatos", "almaden", "milpitas", "gilroy", "morgan hill",
    "silicon valley", "earthquakes", "blackhawks", "bay oaks", "diablo", "newark",
    "union city", "san leandro", "alameda", "castro valley", "dublin", "brentwood", "antioch",
  ]),
  m("sacramento", "Sacramento", "CA", "CA-N", 38.58, -121.49, [
    "sacramento", "roseville", "rocklin", "folsom", "elk grove", "davis", "natomas",
    "placer", "el dorado", "granite bay", "lincoln", "woodland", "rio vista", "republic",
  ]),
  m("central-valley", "Central Valley", "CA", "CA-N", 37.3, -120.5, [
    "fresno", "clovis", "visalia", "modesto", "stockton", "merced", "turlock",
    "manteca", "tracy", "lodi", "hanford", "tulare", "central valley", "madera",
  ]),
  m("monterey-bay", "Monterey Bay", "CA", "CA-N", 36.8, -121.8, [
    "monterey", "salinas", "santa cruz", "watsonville", "hollister", "seaside",
  ]),
  m("north-state", "North State", "CA", "CA-N", 40.3, -122.0, [
    "redding", "chico", "eureka", "humboldt", "yuba", "marysville", "oroville",
  ]),

  // ── Arizona ──
  m("phoenix", "Phoenix", "AZ", "AZ", 33.45, -112.07, [
    "phoenix", "scottsdale", "tempe", "mesa", "chandler", "gilbert", "glendale az",
    "peoria", "surprise", "goodyear", "avondale", "queen creek", "rsl az", "rsl-az",
    "arizona arsenal", "sc del sol", "del sol", "cefc", "fc tucson",
  ]),
  m("tucson", "Tucson", "AZ", "AZ", 32.22, -110.97, ["tucson", "oro valley", "marana", "sierra vista"]),
  m("northern-arizona", "Northern Arizona", "AZ", "AZ", 35.2, -111.65, ["flagstaff", "prescott", "sedona"]),

  // ── Nevada ──
  m("las-vegas", "Las Vegas", "NV", "NV", 36.17, -115.14, [
    "las vegas", "henderson", "summerlin", "north las vegas", "vegas", "lvsa",
  ]),
  m("reno", "Reno", "NV", "NV", 39.53, -119.81, ["reno", "sparks", "carson city", "tahoe"]),

  // ── Utah ──
  m("salt-lake-city", "Salt Lake City", "UT", "UT", 40.76, -111.89, [
    "salt lake", "slc", "sandy", "west jordan", "draper", "murray", "park city",
    "real salt lake", "rsl", "la roca", "wasatch", "sparta", "herriman", "bountiful",
  ]),
  m("provo-orem", "Provo–Orem", "UT", "UT", 40.23, -111.66, ["provo", "orem", "utah county", "lehi", "american fork", "spanish fork"]),
  m("ogden", "Ogden", "UT", "UT", 41.22, -111.97, ["ogden", "layton", "davis county", "weber"]),
  m("st-george", "St. George", "UT", "UT", 37.1, -113.58, ["st george", "st. george", "southern utah", "cedar city"]),

  // ── Colorado ──
  m("denver", "Denver", "CO", "CO", 39.74, -104.99, [
    "denver", "real colorado", "colorado rush", "rush", "aurora", "lakewood", "littleton",
    "arvada", "westminster", "boulder", "broomfield", "highlands ranch", "parker",
    "castle rock", "golden", "colorado rapids", "rapids", "storm", "colorado edge",
  ]),
  m("colorado-springs", "Colorado Springs", "CO", "CO", 38.83, -104.82, ["colorado springs", "pride", "pikes peak", "pueblo"]),
  m("northern-colorado", "Northern Colorado", "CO", "CO", 40.55, -105.08, ["fort collins", "loveland", "greeley", "northern colorado", "windsor"]),
  m("western-slope", "Western Slope", "CO", "CO", 39.06, -108.55, ["grand junction", "western slope", "durango", "vail", "aspen", "steamboat"]),

  // ── Washington ──
  m("seattle", "Seattle", "WA", "WA", 47.61, -122.33, [
    "seattle", "sounders", "bellevue", "redmond", "kirkland", "issaquah", "eastside",
    "crossfire", "everett", "snohomish", "lynnwood", "shoreline", "renton", "kent",
    "federal way", "north sound", "seattle united", "pacific nw", "pnw",
  ]),
  m("tacoma", "Tacoma–South Sound", "WA", "WA", 47.25, -122.44, ["tacoma", "olympia", "puyallup", "gig harbor", "south sound", "lakewood wa"]),
  m("spokane", "Spokane", "WA", "WA", 47.66, -117.43, ["spokane", "coeur d'alene", "coeur dalene", "inland northwest"]),
  m("tri-cities", "Tri-Cities", "WA", "WA", 46.23, -119.1, ["tri-cities", "tri cities", "kennewick", "richland", "pasco", "yakima", "wenatchee"]),

  // ── Oregon ──
  m("portland", "Portland", "OR", "OR", 45.52, -122.68, [
    "portland", "timbers", "thorns", "beaverton", "hillsboro", "lake oswego", "tualatin",
    "gresham", "vancouver wa", "westside", "eastside timbers", "fc portland",
  ]),
  m("salem", "Salem", "OR", "OR", 44.94, -123.03, ["salem", "albany", "corvallis", "mid valley"]),
  m("eugene", "Eugene", "OR", "OR", 44.05, -123.09, ["eugene", "springfield", "lane"]),
  m("bend", "Bend", "OR", "OR", 44.06, -121.31, ["bend", "redmond or", "central oregon"]),
  m("medford", "Medford", "OR", "OR", 42.33, -122.87, ["medford", "ashland", "rogue", "southern oregon"]),

  // ── Idaho ──
  m("boise", "Boise", "ID", "ID", 43.62, -116.2, ["boise", "meridian", "nampa", "eagle", "treasure valley", "idaho rush", "idaho juniors"]),
  m("eastern-idaho", "Eastern Idaho", "ID", "ID", 43.49, -112.03, ["idaho falls", "pocatello", "twin falls", "rexburg"]),

  // ── Montana / Wyoming ──
  m("billings", "Billings", "MT", "MT", 45.78, -108.5, ["billings"]),
  m("missoula", "Missoula", "MT", "MT", 46.87, -113.99, ["missoula", "kalispell", "flathead"]),
  m("bozeman", "Bozeman", "MT", "MT", 45.68, -111.04, ["bozeman", "helena", "butte", "great falls"]),
  m("cheyenne", "Cheyenne", "WY", "WY", 41.14, -104.82, ["cheyenne", "laramie"]),
  m("casper", "Casper", "WY", "WY", 42.87, -106.31, ["casper", "gillette", "sheridan", "jackson"]),

  // ── New Mexico ──
  m("albuquerque", "Albuquerque", "NM", "NM", 35.08, -106.65, ["albuquerque", "rio rancho", "abq", "santa fe", "new mexico united"]),
  m("las-cruces", "Las Cruces", "NM", "NM", 32.32, -106.76, ["las cruces"]),

  // ── Hawaii / Alaska ──
  m("honolulu", "Honolulu", "HI", "HI", 21.31, -157.86, ["honolulu", "oahu", "kapolei", "mililani", "pearl city", "kailua", "hawaii rush", "hawaii surf"]),
  m("hawaii-neighbor-islands", "Neighbor Islands", "HI", "HI", 20.8, -156.33, ["maui", "kauai", "hilo", "kona", "big island"]),
  m("anchorage", "Anchorage", "AK", "AK", 61.22, -149.9, ["anchorage", "mat-su", "wasilla", "eagle river", "alaska rush"]),
  m("fairbanks", "Fairbanks", "AK", "AK", 64.84, -147.72, ["fairbanks", "juneau"]),
];

/**
 * Best-guess metro for a club from its name/city, restricted to its State Cup
 * area. Longest matching place name wins (so "north las vegas" beats "vegas").
 */
export function inferMetro(text: string, stateCup: string | null, state?: string | null): MetroDef | null {
  const hay = ` ${text.toLowerCase().replace(/[^a-z0-9' .-]+/g, " ")} `;
  let best: MetroDef | null = null;
  let bestLen = 0;
  for (const metro of METROS) {
    if (stateCup && metro.stateCup !== stateCup) continue;
    if (state && metro.state !== state) continue;
    for (const p of metro.places) {
      if (p.length > bestLen && hay.includes(` ${p}`) ) {
        // require a word boundary after the place too
        const i = hay.indexOf(` ${p}`) + p.length + 1;
        if (!/[a-z0-9]/.test(hay[i] ?? " ")) {
          best = metro;
          bestLen = p.length;
        }
      }
    }
  }
  // States with a single metro default to it
  if (!best && stateCup) {
    const inState = METROS.filter((x) => x.stateCup === stateCup);
    if (inState.length === 1) best = inState[0];
  }
  return best;
}
