import Link from "next/link";
import { AGE_ORDER, getClubRow, getLeagueName, type TeamRow } from "@/lib/explore";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LegacyClub } from "./legacy-club";
import { LEAGUES } from "@/lib/directory/leagues";

// "Walnut Creek Surf Soccer Club Blue U12" → "Blue" inside the club's own grid
function shortName(t: TeamRow, clubName: string) {
  const s = t.name.replace(clubName, "").replace(new RegExp(`\\s*${t.ageGroup}$`), "").trim();
  return s || t.ageGroup;
}

function TeamCell({ teams, clubName }: { teams: TeamRow[]; clubName: string }) {
  return (
    <ul className="space-y-1">
      {teams.map((t) => (
        <li key={t.id} className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate">
            <Link href={`/team/${t.id}`} className="hover:text-primary transition-colors" title={t.name}>{shortName(t, clubName)}</Link>
            {t.coach && <span className="ml-1.5 text-xs text-muted-foreground">{t.coach}</span>}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">{t.rank ? `#${t.rank}` : "unranked"}</span>
        </li>
      ))}
    </ul>
  );
}

/** /club/<slug> (or a club name, for older links): teams by age group × gender */
export default async function ClubPage({ params, searchParams }: {
  params: Promise<{ name: string }>; searchParams: Promise<{ loc?: string }>;
}) {
  const { name } = await params;
  const { loc } = await searchParams;
  const key = decodeURIComponent(name);
  const club = getClubRow(key);
  if (!club) return <LegacyClub clubName={key} />;

  const ages = [...new Set(club.teams.map((t) => t.ageGroup))]
    .sort((a, b) => (AGE_ORDER.indexOf(a) + 1 || 99) - (AGE_ORDER.indexOf(b) + 1 || 99));
  // clubs with several locations: ?loc=<location> narrows the grid to one
  const location = club.locations.find((l) => l.name === loc) ?? null;
  const shown = location ? club.teams.filter((t) => t.location === location.name) : club.teams;
  const locHref = (l: string | null) => `/club/${club.slug}${l ? `?loc=${encodeURIComponent(l)}` : ""}`;
  const pill = (on: boolean) =>
    `rounded-full border px-3 py-1 text-xs transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`;
  const cell = (age: string, gender: "Boys" | "Girls") =>
    shown.filter((t) => t.ageGroup === age && t.gender === gender)
      .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  const ranked = club.teams.filter((t) => t.rank !== null);
  const rec = ranked.reduce((r, t) => [r[0] + t.wins, r[1] + t.losses, r[2] + t.draws], [0, 0, 0]);
  const boys = club.teams.filter((t) => t.gender === "Boys").length;
  // leagues whose member list names this club but whose schedules we haven't collected
  const memberOnly = club.memberOf.filter((l) => !club.leagues.includes(l))
    .map((l) => LEAGUES.find((d) => d.slug === l)).filter((d) => d !== undefined);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <p className="text-sm text-muted-foreground">
        <Link href="/states" className="hover:text-primary">States</Link>
        {club.area && <> / <Link href={`/state/${club.area.slug}`} className="hover:text-primary">{club.area.name}</Link></>}
        {" "}/ {club.name}
      </p>
      <h1 className="heading mt-1">{club.name}</h1>
      {(club.city || club.website) && (
        <p className="mt-1 text-sm text-muted-foreground">
          {club.city}
          {club.city && club.website && <> &middot; </>}
          {club.website && (
            <a href={club.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              {club.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
            </a>
          )}
        </p>
      )}
      <p className="body-text mt-1 text-muted-foreground">
        {club.teams.length} teams ({boys} boys, {club.teams.length - boys} girls) · {ranked.length} ranked
        {club.bestRank && <> · best rank #{club.bestRank}</>}
        {ranked.length > 0 && <> · {rec[0]}-{rec[1]}-{rec[2]} W-L-D</>}
      </p>

      {club.leagues.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="lowbrow mr-1">Plays in:</span>
          {club.leagues.map((l) => (
            <Link key={l} href={`/league/${l}${club.area ? `?state=${club.area.slug}` : ""}`}>
              <Badge variant="secondary" className="hover:bg-primary hover:text-primary-foreground transition-colors">{getLeagueName(l)}</Badge>
            </Link>
          ))}
        </div>
      )}

      {memberOnly.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="lowbrow mr-1">Member of:</span>
          {memberOnly.map((d) => d.website ? (
            <a key={d.slug} href={`https://${d.website}`} target="_blank" rel="noopener noreferrer" title="League member list; schedule not collected yet">
              <Badge variant="outline" className="hover:bg-muted transition-colors">{d.name}</Badge>
            </a>
          ) : <Badge key={d.slug} variant="outline">{d.name}</Badge>)}
        </div>
      )}

      {club.locations.length > 0 && (
        <div className="mt-6">
          <p className="lowbrow">Locations</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href={locHref(null)} scroll={false} className={pill(!location)}>All · {club.teams.length}</Link>
            {club.locations.filter((l) => l.teams > 0).map((l) => (
              <Link key={l.name} href={locHref(l.name)} scroll={false} className={pill(location?.name === l.name)} title={l.area ?? undefined}>
                {l.name} · {l.teams}
              </Link>
            ))}
          </div>
          {location?.area && <p className="mt-2 text-xs text-muted-foreground">{location.area}</p>}
          {club.locationSource && (
            <p className="mt-1 text-xs text-muted-foreground">
              Locations from the club&apos;s site; a team&apos;s location is read from its name.
            </p>
          )}
        </div>
      )}

      <Card className="mt-6">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 w-16">Age</th>
                <th className="px-4 py-2">Boys</th>
                <th className="px-4 py-2">Girls</th>
              </tr>
            </thead>
            <tbody>
              {ages.filter((age) => cell(age, "Boys").length + cell(age, "Girls").length > 0).map((age) => (
                <tr key={age} className="border-b last:border-b-0 border-border/50 align-top">
                  <td className="px-4 py-2.5 font-semibold">{age}</td>
                  <td className="px-4 py-2.5 w-1/2"><TeamCell teams={cell(age, "Boys")} clubName={club.name} /></td>
                  <td className="px-4 py-2.5 w-1/2"><TeamCell teams={cell(age, "Girls")} clubName={club.name} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">
        Teams that played in the last 15 months. Ranks are within each age group and gender across the West. A team is ranked once it has 10 games and has played in an elite league, N1, a State Cup or a regional championship or showcase in the last 15 months.
      </p>
    </div>
  );
}
