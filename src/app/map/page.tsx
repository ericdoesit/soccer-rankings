import fs from "fs";
import path from "path";
import { ClubMap, type MapClub } from "@/components/club-map";

export const metadata = { title: "Southern California club map · Youth Soccer Rankings" };

/** data/seed/socal-club-locations.json, written by scripts/geocode-socal-clubs.ts */
function loadClubs(): { clubs: MapClub[]; generatedAt: string | null } {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "seed", "socal-club-locations.json"), "utf8"));
    return { clubs: d.clubs as MapClub[], generatedAt: d.generatedAt ?? null };
  } catch {
    return { clubs: [], generatedAt: null };
  }
}

export default function MapPage() {
  const { clubs, generatedAt } = loadClubs();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="display mb-3">Southern California clubs</h1>
      <p className="lead mb-6">
        Each dot is a club, placed at the field where its teams play most of their home league games (or its city when
        we don&apos;t know the field). Colour is the highest league the club fields; size is its number of teams. Fields
        shared by many clubs, such as league hubs, aren&apos;t used. Clubs that play only friendlies or tournaments may
        be missing. Locations from OpenStreetMap
        {generatedAt ? `, ${new Date(generatedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : ""}.
      </p>
      <ClubMap clubs={clubs} token={process.env.NEXT_PUBLIC_MAPBOX_TOKEN} />
    </div>
  );
}
