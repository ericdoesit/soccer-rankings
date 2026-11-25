import fs from "fs";
import Link from "next/link";
import path from "path";
import { ClubMap, type MapClub } from "@/components/club-map";
import { Card, CardContent } from "@/components/ui/card";
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
        <Link href="/rankings" className="font-medium text-foreground underline underline-offset-4">West rankings</Link> list only
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

      {view === "teams" ? <TeamsTable age={age} gender={gender as SoCalGender} /> : <ClubsTable age={age} gender={gender as SoCalGender | "All"} />}

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

const th = "px-4 py-3 text-left text-xs font-normal text-muted-foreground";
const td = "px-4 py-2.5";

function TeamsTable({ age, gender }: { age: string; gender: SoCalGender }) {
  const teams = getSoCalTeams(age, gender);
  return (
    <Card className="gap-0 pb-0">
      <CardContent className="p-0">
        <p className="px-4 pt-4 pb-2 text-xs text-muted-foreground">{teams.length} {age} {gender.toLowerCase()} teams</p>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className={`${th} w-12 sm:w-16`}>#</th>
                <th className={th}>Team</th>
                <th className={`${th} hidden lg:table-cell w-56`}>League</th>
                <th className={`${th} w-16 text-right`}>Rating</th>
                <th className={`${th} hidden sm:table-cell w-28 text-center`}>This season</th>
                <th className={`${th} hidden md:table-cell w-24 text-right`}>West rank</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                  <td className={`${td} rank-num`}>{t.rank}</td>
                  <td className={`${td} min-w-0`}>
                    <Link href={`/team/${t.id}`} className="block truncate font-medium hover:text-primary" title={t.name}>{t.name}</Link>
                    <span className="block truncate text-xs text-muted-foreground lg:hidden">{t.league}</span>
                  </td>
                  <td className={`${td} hidden lg:table-cell truncate text-muted-foreground`} title={t.league}>{t.league}</td>
                  <td className={`${td} text-right tabular-nums font-medium`}>{t.rating.toFixed(2)}</td>
                  <td className={`${td} hidden sm:table-cell text-center tabular-nums text-muted-foreground`}>{t.record}</td>
                  <td className={`${td} hidden md:table-cell text-right tabular-nums text-muted-foreground`}>{t.westRank ? `#${t.westRank}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ClubsTable({ age, gender }: { age: string; gender: SoCalGender | "All" }) {
  const clubs = getSoCalClubs(gender, age);
  const scope = `${age === "All" ? "all ages" : age}${gender === "All" ? "" : `, ${gender.toLowerCase()}`}`;
  return (
    <Card className="gap-0 pb-0">
      <CardContent className="p-0">
        <p className="px-4 pt-4 pb-2 text-xs text-muted-foreground">
          {clubs.length} clubs ({scope}).{" "}
          {age === "All" ? "Strength: average percentile of the club's best team in each age group (clubs with 3+ age groups)." : "Strength: percentile of the club's best team in this age group."}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className={`${th} w-12 sm:w-16`}>#</th>
                <th className={th}>Club</th>
                <th className={`${th} w-20 text-right`}>Strength</th>
                <th className={`${th} hidden sm:table-cell w-24 text-center`}>Age groups</th>
                <th className={`${th} hidden sm:table-cell w-20 text-center`}>Teams</th>
                <th className={`${th} hidden lg:table-cell w-64`}>Leagues</th>
              </tr>
            </thead>
            <tbody>
              {clubs.map((c) => (
                <tr key={c.club} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                  <td className={`${td} rank-num`}>{c.rank}</td>
                  <td className={`${td} min-w-0`}>
                    <Link href={`/club/${encodeURIComponent(c.club)}`} className="block truncate font-medium hover:text-primary" title={c.club}>{c.club}</Link>
                    {c.best && (
                      <span className="block truncate text-xs text-muted-foreground">
                        best: {c.best.ageGroup} {c.best.gender.toLowerCase()}, top {Math.max(1, Math.round(100 - c.best.percentile))}%
                      </span>
                    )}
                  </td>
                  <td className={`${td} text-right tabular-nums font-medium`}>{c.strength.toFixed(1)}</td>
                  <td className={`${td} hidden sm:table-cell text-center tabular-nums text-muted-foreground`}>{c.ageGroups}</td>
                  <td className={`${td} hidden sm:table-cell text-center tabular-nums text-muted-foreground`}>{c.teams}</td>
                  <td className={`${td} hidden lg:table-cell truncate text-muted-foreground`} title={c.leagues.join(", ")}>{c.leagues.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
