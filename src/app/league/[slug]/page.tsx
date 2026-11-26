import Link from "next/link";
import { notFound } from "next/navigation";
import { AGE_ORDER, areaBySlug, getClubRow, getLeague } from "@/lib/explore";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getLeagueRankings } from "@/lib/league-rankings";
import { getLeagueAccuracy } from "@/lib/league-accuracy";
import { PredictionAccuracy } from "@/components/league/prediction-accuracy";
import { LeagueClubTable, LeagueTeamTable } from "@/components/league/league-tables";
import { chip } from "@/lib/ui-classes";

export default async function LeaguePage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ state?: string; age?: string; gender?: string; level?: string }>;
}) {
  const { slug } = await params;
  const { state, age: ageParam, gender: genderParam, level: levelParam } = await searchParams;
  const league = getLeague(slug);
  if (!league) notFound();
  const area = state ? areaBySlug(state) : null;

  const rows = [...league.clubs.entries()]
    .map(([clubSlug, teamIds]) => {
      const club = getClubRow(clubSlug)!;
      const ids = new Set(teamIds);
      const teams = club.teams.filter((t) => ids.has(t.id));
      const ages = [...new Set(teams.map((t) => t.ageGroup))].sort((a, b) => AGE_ORDER.indexOf(a) - AGE_ORDER.indexOf(b));
      const best = teams.reduce<number | null>((m, t) => (t.rank !== null && (m === null || t.rank < m) ? t.rank : m), null);
      return { club, teams, ages, best };
    })
    .filter((r) => !area || r.club.area?.code === area.code)
    .sort((a, b) => b.teams.length - a.teams.length);
  const teamCount = rows.reduce((n, r) => n + r.teams.length, 0);

  // Rankings within the league (SoCal, NorCal Premier): every rated team, by age + gender
  const lr = getLeagueRankings(slug);
  const genders = lr ? (["Boys", "Girls"] as const).filter((g) => [...lr.groups.keys()].some((k) => k.endsWith(`|${g}`))) : [];
  const gender = genders.find((g) => g === genderParam) ?? genders[0];
  const ages = lr && gender ? [...lr.groups.keys()].filter((k) => k.endsWith(`|${gender}`)).map((k) => k.split("|")[0])
    .sort((a, b) => AGE_ORDER.indexOf(a) - AGE_ORDER.indexOf(b)) : [];
  const age = ages.find((a) => a === ageParam) ?? (ages.includes("U13") ? "U13" : ages[0]);
  const group = lr && gender && age ? lr.groups.get(`${age}|${gender}`) ?? [] : [];
  const LEVEL_ORDER = ["Premier", "Elite", "Gold", "Champions", "Division 1", "Division 2", "Division 3", "Silver", "Bronze", "Copper", "Classic", "Select"];
  const levels = [...new Set(group.map((r) => r.level).filter((l): l is string => !!l))]
    .sort((a, b) => (LEVEL_ORDER.indexOf(a) + 1 || 99) - (LEVEL_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b));
  const level = levels.find((l) => l === levelParam) ?? null;
  // rank stays the team's place among all teams of its age group; the level filter only hides rows
  const ranked = level ? group.filter((r) => r.level === level) : group;
  const rankHref = (a: string, g: string, l: string | null = null) => {
    const q = new URLSearchParams();
    if (state) q.set("state", state);
    q.set("age", a); q.set("gender", g);
    if (l) q.set("level", l);
    return `/league/${slug}?${q}#rankings`;
  };
  const pill = chip;
  const accuracy = getLeagueAccuracy(slug);
  const season = league.seasons[0];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <p className="text-sm text-muted-foreground">
        <Link href="/states" className="hover:text-primary">States</Link>
        {area && <> / <Link href={`/state/${area.slug}`} className="hover:text-primary">{area.name}</Link></>}
        {" "}/ {league.name}
      </p>
      <h1 className="display mt-1">{league.name}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {league.tier && league.tier !== "CUP" && <Badge variant="secondary">{league.tier}</Badge>}
        {league.kind === "cup" && <Badge variant="secondary">Cup</Badge>}
        <span>{season.season} season</span>
        <span>&middot;</span>
        <span>{rows.length} clubs · {teamCount.toLocaleString()} teams{area ? ` from ${area.name}` : ""}</span>
        {league.def?.website && (
          <>
            <span>&middot;</span>
            <a href={`https://${league.def.website}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              {league.def.website}
            </a>
          </>
        )}
      </div>
      {area && (
        <p className="mt-2 text-sm">
          <Link href={`/league/${league.slug}`} className="text-primary hover:underline">Show clubs from every state</Link>
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Schedules: {season.events.join(" · ")}
        {league.seasons.length > 1 && <> (earlier seasons: {league.seasons.slice(1).map((s) => s.season).join(", ")})</>}
      </p>

      {accuracy && <PredictionAccuracy acc={accuracy} leagueName={league.name} slug={slug} />}

      {lr && ranked.length > 0 && (
        <Card className="mt-6 gap-0 pb-0" id="rankings">
          <CardHeader>
            <CardTitle className="heading-sm">{league.name} rankings · {lr.season}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {`Every team playing ${lr.events.join(" and ")} that has a rating, ranked by rating within its age group. `}
              Ratings use all of a team&apos;s games, not just league games. The record is league games only.
              West rank is the team’s place in the main West rankings, for teams listed there. Search finds a club or team in this age group.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {genders.map((g) => <Link key={g} href={rankHref(age!, g)} scroll={false} className={pill(g === gender)}>{g}</Link>)}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {ages.map((a) => <Link key={a} href={rankHref(a, gender!)} scroll={false} className={pill(a === age)}>{a}</Link>)}
            </div>
            {levels.length > 1 && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Flight:</span>
                <Link href={rankHref(age!, gender!)} scroll={false} className={pill(!level)}>All</Link>
                {levels.map((l) => <Link key={l} href={rankHref(age!, gender!, l)} scroll={false} className={pill(l === level)}>{l}</Link>)}
                {level && <span className="text-xs text-muted-foreground"># is the team&apos;s place among all {age} {gender.toLowerCase()} in the league</span>}
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <LeagueTeamTable key={`${age}|${gender}|${level ?? ""}`} rows={ranked}
              caption={`${ranked.length.toLocaleString()} ${level ? `${level} ` : ""}${age} ${gender!.toLowerCase()} teams`} />
          </CardContent>
        </Card>
      )}

      <Card className="mt-6 gap-0 pb-0">
        <CardHeader><CardTitle className="heading-sm">Clubs</CardTitle></CardHeader>
        <CardContent className="p-0">
          <LeagueClubTable
            caption={`${rows.length.toLocaleString()} clubs · ${teamCount.toLocaleString()} teams`}
            rows={rows.map(({ club, teams, ages, best }) => ({
              slug: club.slug, club: club.name, state: club.area?.short ?? null, teams: teams.length,
              ages: ages.length > 1 ? `${ages[0]}–${ages[ages.length - 1]}` : (ages[0] ?? "—"), best,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
