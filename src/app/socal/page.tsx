import fs from "fs";
import Link from "next/link";
import path from "path";
import { ClubMap, type MapClub } from "@/components/club-map";
import { SoCalTable } from "@/components/socal-table";
import { chip, segment, segmentItem } from "@/lib/ui-classes";
import { SOCAL_AGES, getSoCalClubs, getSoCalTeams, type SoCalGender } from "@/lib/socal";

export const metadata = { title: "Southern California · Youth Soccer Rankings" };

/** data/seed/socal-club-locations.json, written by scripts/geocode-socal-clubs.ts */
function loadClubs(): { clubs: MapClub[]; generatedAt: string | null } {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "seed", "socal-club-locations.json"), "utf8"));
    return { clubs: d.clubs as MapClub[], generatedAt: d.generatedAt ?? null };
  } catch {
    return { clubs: [], generatedAt: null };
  }
}

type View = "clubs" | "teams";
interface Q { view?: string; gender?: string; age?: string }

export default async function SoCalPage({ searchParams }: { searchParams: Promise<Q> }) {
  const sp = await searchParams;
  const view: View = sp.view === "teams" ? "teams" : "clubs";
  const ages = SOCAL_AGES as readonly string[];
  // teams: one age group and gender; clubs: either may be "All"
  const gender = sp.gender === "Boys" || sp.gender === "Girls" ? sp.gender : view === "teams" ? "Girls" : "All";
  const age = sp.age && ages.includes(sp.age) ? sp.age : view === "teams" ? "U12" : "All";
  const href = (q: Q) => {
    const next = { view, gender, age, ...q };
    return `/socal?${new URLSearchParams({ view: next.view, gender: next.gender, age: next.age }).toString()}`;
  };
  const { clubs: mapClubs, generatedAt } = loadClubs();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="display mb-3">Southern California <span className="tail">every team, every league.</span></h1>
      <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
        Every Cal South team with at least four games in the last 15 months and one this season, whatever league it plays
        in: the elite leagues, N1 and NPL, the SoCal League, Coast and the local tournaments. The{" "}
        <Link href="/rankings" className="font-medium text-foreground underline underline-offset-4">West rankings</Link>{" "}list only
        teams in tracked competitions; here they all count, because their ratings hold up. Tested on 47,000 Southern
        California games, ratings called state-league games as well as elite-league ones, and placed the leagues correctly
        against each other. Club strength is the average percentile of a club&apos;s best team in each age group it fields
        (0–100), so clubs of any size compare fairly across ages.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className={segment} role="group" aria-label="View">
          <Link href={href({ view: "clubs", gender: gender === "All" ? "All" : gender, age: "All" })} className={segmentItem(view === "clubs")}>Clubs</Link>
          <Link href={href({ view: "teams", gender: gender === "All" ? "Girls" : gender, age: age === "All" ? "U12" : age })} className={segmentItem(view === "teams")}>Teams</Link>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Gender">
          {(view === "clubs" ? ["All", "Boys", "Girls"] : ["Boys", "Girls"]).map((g) => (
            <Link key={g} href={href({ gender: g })} className={chip(gender === g)}>{g}</Link>
          ))}
        </div>
      </div>
      <div className="mb-5 flex flex-wrap gap-1.5" role="group" aria-label="Age group">
        {(view === "clubs" ? ["All", ...ages] : ages).map((a) => (
          <Link key={a} href={href({ age: a })} className={chip(age === a)}>{a === "All" ? "All ages" : a}</Link>
        ))}
      </div>

      {view === "teams" ? (
        <SoCalTable kind="teams" key={`t${age}${gender}`} rows={getSoCalTeams(age, gender as SoCalGender)}
          caption={`${getSoCalTeams(age, gender as SoCalGender).length} ${age} ${gender.toLowerCase()} teams`} />
      ) : (
        <SoCalTable kind="clubs" key={`c${age}${gender}`} rows={getSoCalClubs(gender as SoCalGender | "All", age)}
          caption={`${getSoCalClubs(gender as SoCalGender | "All", age).length} clubs (${age === "All" ? "all ages" : age}${gender === "All" ? "" : `, ${gender.toLowerCase()}`}). ${age === "All"
            ? "Strength: average percentile of the club's best team in each age group (clubs with 3+ age groups)."
            : "Strength: percentile of the club's best team in this age group."}`} />
      )}

      <h2 className="heading mt-12 mb-3">Club map</h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Each dot is a club, placed at the field where its teams play most of their home league games (or its city when
        we don&apos;t know the field). Colour is the club&apos;s highest league among those switched on, and Boys or Girls
        uses only that side&apos;s teams; click a club to see every league it plays in. Size is its number of teams. Fields
        shared by many clubs, such as league hubs, aren&apos;t used. Clubs that play only friendlies or tournaments may
        be missing. Locations from OpenStreetMap
        {generatedAt ? `, ${new Date(generatedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : ""}.
      </p>
      <ClubMap clubs={mapClubs} token={process.env.NEXT_PUBLIC_MAPBOX_TOKEN} />
      <p className="mt-4 text-sm">
        <Link href="/states" className="text-primary hover:underline">Every Western state: its leagues, clubs and teams →</Link>
      </p>
    </div>
  );
}
