/**
 * Where Southern California clubs play: each club's most-used home field in league games,
 * geocoded once with OpenStreetMap's Nominatim, for the SoCal club map.
 *
 *   npx tsx scripts/geocode-socal-clubs.ts
 *
 * - Home field: the venue a club's teams used most as the home side in league events
 *   (data/discovery, 2025-26 onward) and MLS NEXT games (data/mlsnext-tracker), at least 3
 *   home games, beaches skipped (beach-soccer events). A venue that is "home" to 5+ clubs is
 *   a league hub (Bellflower HS, Artesia HS), not anyone's home field, so it is skipped.
 *   Clubs without a home field fall back to their city from the Cal South / SoCal Soccer
 *   League club lists.
 * - Geocoders: Nominatim first; for names it can't find, Photon (komoot, also OSM), whose
 *   fuzzy match is accepted only when the distinctive words of the name agree.
 * - Nominatim usage policy: at most 1 request per second, an identifying User-Agent, and
 *   results cached. Every answer (including "not found") is kept in
 *   data/seed/venue-geocodes.json, so re-runs only look up new venues.
 * - Output: data/seed/socal-club-locations.json.
 */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const CACHE_FILE = path.join(ROOT, "data", "seed", "venue-geocodes.json");
const OUT_FILE = path.join(ROOT, "data", "seed", "socal-club-locations.json");
const UA = "soccer-rankings research (youth soccer club map; one-time geocoding, 1 req/s)";
// Southern California box: Santa Barbara / Kern south to the border, east to the Colorado River
const VIEWBOX = "-121.0,35.8,-114.1,32.5";

type Geo = { lat: number; lng: number; label: string; city: string | null } | null;
const cache: Record<string, Geo> = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) : {};
const saveCache = () => fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 1) + "\n");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** fetch with one retry after a dropped connection; null when the service is unreachable */
async function get(url: string): Promise<Response | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en" } }); }
    catch (e) { console.warn(`  network error (${(e as Error).message}), ${attempt ? "skipping" : "retrying in 5 s"}`); await sleep(5000); }
  }
  return null;
}

/** words that say what a place is, not which one */
const GENERIC = new Set(("park parks field fields soccer sports sport complex center centre community high school middle elementary " +
  "college academy stadium playfields playfield recreation rec area the of at and turf club fc sc oc").split(" "));
const distinctive = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !GENERIC.has(w)));
/** a fuzzy hit counts only if the names agree both ways: most of the query's distinctive words
 *  are in the hit's name, and most of the hit's are in the query ("UCSB Rec Cen" is not
 *  "Rec Cen Pottery Studio") */
const sameName = (query: string, name: string) => {
  const q = distinctive(query), n = distinctive(name);
  if (!q.size || !n.size) return false;
  const shared = [...q].filter((w) => n.has(w)).length;
  return shared / q.size >= 0.67 && shared / n.size >= 0.5;
};

async function photon(query: string): Promise<Geo> {
  const key = `photon:${query}`;
  if (key in cache) return cache[key];
  await sleep(1100);
  const res = await get(`https://photon.komoot.io/api/?limit=3&bbox=${VIEWBOX}&q=${encodeURIComponent(query)}`);
  if (!res) return null;
  if (!res.ok) throw new Error(`Photon ${res.status} for ${query}`);
  const { features } = (await res.json()) as { features: Array<{ geometry: { coordinates: [number, number] }; properties: { name?: string; city?: string; town?: string } }> };
  const hit = features.find((f) => f.properties.name && sameName(query, f.properties.name));
  cache[key] = hit ? { lat: hit.geometry.coordinates[1], lng: hit.geometry.coordinates[0], label: `${hit.properties.name} (Photon)`, city: hit.properties.city ?? hit.properties.town ?? null } : null;
  saveCache();
  return cache[key];
}

/** Nominatim, then Photon for names Nominatim doesn't know */
async function locate(venue: string): Promise<Geo> {
  return (await geocode(`${venue}, California`)) ?? (await photon(venue));
}

async function geocode(query: string): Promise<Geo> {
  if (query in cache) return cache[query];
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&countrycodes=us` +
    `&viewbox=${VIEWBOX}&bounded=1&q=${encodeURIComponent(query)}`;
  await sleep(1100);
  const res = await get(url);
  if (!res) return null; // not cached: tried again next run
  if (!res.ok) throw new Error(`Nominatim ${res.status} for ${query}`);
  const [hit] = (await res.json()) as Array<{ lat: string; lon: string; display_name: string; address?: Record<string, string> }>;
  const a = hit?.address ?? {};
  cache[query] = hit ? { lat: +hit.lat, lng: +hit.lon, label: hit.display_name, city: a.city ?? a.town ?? a.village ?? a.suburb ?? null } : null;
  saveCache();
  return cache[query];
}

// --- each club's home field -------------------------------------------------------------
type Snap = { teams: Array<{ id: number; club: string; state: string; gender: string; rankable: boolean; clubVerified?: boolean; gotsportTeamId?: number; program?: string }> };
const snap = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "snapshot.json"), "utf8")) as Snap;
const clubByGsId = new Map<number, string>();
const clubInfo = new Map<string, { teams: number; listed: number; programs: Set<string>; by: Record<string, { teams: number; programs: Set<string> }> }>();
// Only confirmed clubs (GotSport directory, a league club list, or a directory name match).
// A team GotSport lists without a club gets a fragment of its own name as "club" ("Obama
// BU09", an LA City United team named after its park): that is a team, not a club.
for (const t of snap.teams) {
  if (t.state !== "CAS" || !t.club || !t.clubVerified) continue;
  if (t.gotsportTeamId) clubByGsId.set(t.gotsportTeamId, t.club);
  const c = clubInfo.get(t.club) ?? { teams: 0, listed: 0, programs: new Set<string>(), by: {} };
  c.teams++; if (t.rankable) c.listed++; if (t.program) c.programs.add(t.program);
  // per gender, so the map can show "Boys: EA · Girls: DPL" for a club in several leagues
  const g = (c.by[t.gender] ??= { teams: 0, programs: new Set<string>() });
  g.teams++; if (t.program) g.programs.add(t.program);
  clubInfo.set(t.club, c);
}
const frontier = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "discovery", "frontier.json"), "utf8")).events;
const events: Array<{ id: number | string; league?: boolean }> = Array.isArray(frontier) ? frontier : Object.entries(frontier).map(([id, v]) => ({ id, ...(v as object) }));
const leagueEvents = new Set(events.filter((e) => e.league).map((e) => Number(e.id)));

const byGender = (info: { by: Record<string, { teams: number; programs: Set<string> }> }) =>
  Object.fromEntries(Object.entries(info.by).map(([g, x]) => [g, { teams: x.teams, programs: [...x.programs].sort() }]));
const cleanVenue = (v: string) => v.trim().replace(/\s*[-–,#(].*$/, "").replace(/\s+(field|fld|pitch|turf)\s*\w*$/i, "").trim();
const venues = new Map<string, Map<string, number>>();
const gamesDir = path.join(ROOT, "data", "discovery", "games");
for (const f of fs.readdirSync(gamesDir)) {
  for (const g of JSON.parse(fs.readFileSync(path.join(gamesDir, f), "utf8")) as Array<{ eventId: number; venue?: string; date: string; homeTeamId: number }>) {
    if (!leagueEvents.has(Number(g.eventId)) || !g.venue || g.date < "2025-08-01") continue;
    const club = clubByGsId.get(g.homeTeamId);
    const v = club && cleanVenue(g.venue);
    if (!club || !v || v.length < 4 || /\bbeach\b|\bsand\b|\btbd\b/i.test(v)) continue;
    const m = venues.get(club) ?? new Map<string, number>();
    m.set(v, (m.get(v) ?? 0) + 1);
    venues.set(club, m);
  }
}

// league-hub detection uses local league games only (copied before MLS NEXT venues are
// added): several MLS NEXT clubs hosting at one stadium doesn't make it a league hub
const leagueVenues = new Map([...venues].map(([c, m]) => [c, new Map(m)]));

// MLS NEXT home games (location "Dignity Health Sports Park - Field 5"); tracker club names
// map to our clubs through the team names ("LA Galaxy MLS NEXT B2012")
const clubBySource = new Map<string, string>();
for (const t of snap.teams as Array<{ club: string; state: string; sourceName?: string }>) {
  const m = t.state === "CAS" && t.sourceName?.match(/^(.*) MLS NEXT B\d{4}$/);
  if (m) clubBySource.set(m[1].toLowerCase(), t.club);
}
const trackerFile = path.join(ROOT, "data", "mlsnext-tracker", "games.json");
if (fs.existsSync(trackerFile)) {
  for (const g of JSON.parse(fs.readFileSync(trackerFile, "utf8")) as Array<{ homeClub: string; location: string | null; date: string }>) {
    const club = clubBySource.get(g.homeClub.toLowerCase());
    const v = club && g.location && cleanVenue(g.location);
    if (!club || !v || v.length < 4 || /\btbd\b|\bbeach\b/i.test(v)) continue;
    const m = venues.get(club) ?? new Map<string, number>();
    m.set(v, (m.get(v) ?? 0) + 1);
    venues.set(club, m);
  }
}
// League hubs: a venue where 5+ clubs host 3+ home games and no club has half of them
// (Bellflower HS, Artesia HS). A club's own complex that others also use (Surf Sports Park)
// stays that club's home field.
const byVenue = new Map<string, Map<string, number>>();
for (const [club, m] of leagueVenues) for (const [v, n] of m) {
  if (n < 3) continue;
  const x = byVenue.get(v) ?? new Map<string, number>();
  x.set(club, n);
  byVenue.set(v, x);
}
const hubOwner = new Map<string, string | null>();
for (const [v, clubs] of byVenue) {
  if (clubs.size < 5) continue;
  const total = [...clubs.values()].reduce((a, b) => a + b, 0);
  const [owner, n] = [...clubs].sort((a, b) => b[1] - a[1])[0];
  hubOwner.set(v, n / total >= 0.5 ? owner : null);
}
const hubs = new Set([...hubOwner].filter(([, owner]) => owner === null).map(([v]) => v));
/** a club may use a shared venue only if it is the venue's main club */
const usable = (club: string, v: string) => !hubOwner.has(v) || hubOwner.get(v) === club;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const cityByClub = new Map<string, string>();
for (const f of ["cal-south", "socal-soccer-league"]) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "league-clubs", `${f}.json`), "utf8"));
  for (const c of (Array.isArray(d) ? d : d.clubs ?? []) as Array<{ name: string; city?: string }>) if (c.city) cityByClub.set(norm(c.name), c.city);
}

const OVERRIDES_FILE = path.join(ROOT, "data", "seed", "club-location-overrides.json");
const overrides: Record<string, { query?: string; lat?: number; lng?: number; sites?: Array<{ name: string; address: string }> }> =
  fs.existsSync(OVERRIDES_FILE) ? JSON.parse(fs.readFileSync(OVERRIDES_FILE, "utf8")) : {};

async function main() {
  const out: Array<Record<string, unknown>> = [];
  let looked = 0, viaVenue = 0, viaCity = 0;
  const clubs = [...clubInfo].sort((a, b) => b[1].listed - a[1].listed || b[1].teams - a[1].teams);
  for (const [club, info] of clubs) {
    // most-used home field that isn't a league hub; try the next one if it can't be found
    const fields = [...(venues.get(club) ?? [])].filter(([v, n]) => n >= 3 && usable(club, v)).sort((a, b) => b[1] - a[1]).slice(0, 3);
    let geo: Geo = null, venue: string | null = null;
    const o = overrides[club];
    if (o?.sites?.length) {
      // a club with several sites: one dot per site
      for (const site of o.sites) {
        const g = await geocode(site.address);
        if (!g) { console.warn(`  couldn't find ${club} site ${site.address}`); continue; }
        out.push({
          club, lat: +g.lat.toFixed(5), lng: +g.lng.toFixed(5), source: "club's own listing", venue: site.name,
          site: site.name, city: g.city, teams: info.teams, listed: info.listed, programs: [...info.programs].sort(), byGender: byGender(info),
        });
      }
      viaVenue++;
      continue;
    }
    if (o) {
      geo = o.lat !== undefined && o.lng !== undefined ? { lat: o.lat, lng: o.lng, label: "override", city: null } : o.query ? await geocode(o.query) : null;
      if (geo) venue = "(club's own listing)";
    }
    for (const [v] of geo ? [] : fields) {
      if (!(`${v}, California` in cache) || !(`photon:${v}` in cache)) looked++;
      geo = await locate(v);
      if (geo) { venue = v; viaVenue++; break; }
    }
    const city = cityByClub.get(norm(club));
    if (!geo && city) {
      if (!(`${city}, California` in cache)) looked++;
      geo = await geocode(`${city}, California`);
      if (geo) viaCity++;
    }
    if (!geo) continue;
    out.push({
      club, lat: +geo.lat.toFixed(5), lng: +geo.lng.toFixed(5),
      source: venue ? "home field" : "club city",
      venue,
      city: geo.city ?? city ?? null,
      teams: info.teams, listed: info.listed, programs: [...info.programs].sort(), byGender: byGender(info),
    });
    if (looked && looked % 25 === 0) console.log(`  ${looked} lookups…`);
  }
  fs.writeFileSync(OUT_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), source: "OpenStreetMap Nominatim", clubs: out }, null, 1) + "\n");
  const withListed = clubs.filter(([, i]) => i.listed > 0).length;
  console.log(`league hubs skipped: ${[...hubs].join("; ")}`);
  console.log(`${out.length} of ${clubs.length} SoCal clubs placed (${viaVenue} by home field, ${viaCity} by city) · ` +
    `${out.filter((c) => (c.listed as number) > 0).length} of ${withListed} clubs with a listed team · ${looked} new lookups → ${path.relative(ROOT, OUT_FILE)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
