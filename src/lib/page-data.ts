/**
 * What the league and state pages render, as plain JSON: read from data/precomputed (see
 * precomputed.ts) when it matches the snapshot, otherwise computed from the explore index.
 * scripts/build-precomputed.ts writes these with the compute functions below.
 */
import { areaBySlug, getArea, getClubRow, getLeague, sortLeagues, type Area } from "./explore";
import { getLeagueRankings, type LeagueRankRow } from "./league-rankings";
import type { LeagueDef } from "./directory/leagues";
import { readPrecomputed } from "./precomputed";

/* ───────────── league page ───────────── */

export interface LeaguePageClub {
  slug: string; name: string; area: Area | null;
  /** the club's teams in this league's latest season */
  teams: Array<{ id: number; ageGroup: string; rank: number | null }>;
}
export interface LeaguePage {
  slug: string; name: string; kind: "league" | "cup"; tier: string | null; def: LeagueDef | null;
  seasons: Array<{ season: string; events: string[] }>;
  clubs: LeaguePageClub[];
  rankings: { season: string; events: string[]; groups: Record<string, LeagueRankRow[]>; unrated: number } | null;
}

export function computeLeaguePage(slug: string): LeaguePage | null {
  const league = getLeague(slug);
  if (!league) return null;
  const clubs: LeaguePageClub[] = [];
  for (const [clubSlug, teamIds] of league.clubs) {
    const club = getClubRow(clubSlug);
    if (!club) continue;
    const ids = new Set(teamIds);
    clubs.push({
      slug: club.slug, name: club.name, area: club.area,
      teams: club.teams.filter((t) => ids.has(t.id)).map((t) => ({ id: t.id, ageGroup: t.ageGroup, rank: t.rank })),
    });
  }
  const lr = getLeagueRankings(slug);
  return {
    slug: league.slug, name: league.name, kind: league.kind, tier: league.tier, def: league.def,
    seasons: league.seasons.map((s) => ({ season: s.season, events: s.events })),
    clubs,
    rankings: lr ? { season: lr.season, events: lr.events, groups: Object.fromEntries(lr.groups), unrated: lr.unrated } : null,
  };
}

export function getLeaguePage(slug: string): LeaguePage | null {
  const pre = readPrecomputed<Record<string, true>>("league-index");
  if (pre) return pre[slug] ? readPrecomputed<LeaguePage>(`league/${slug}`) : null;
  return computeLeaguePage(slug);
}

/* ───────────── state page ───────────── */

export interface StatePageLeague { slug: string; name: string; kind: "league" | "cup"; tier: string | null; season: string; areaTeams: number; clubs: number }
export interface StatePage {
  area: Area; teams: number;
  /** leagues and cups, in the order the page lists them */
  leagues: StatePageLeague[];
  /** clubs, most teams first */
  clubs: Array<{ slug: string; name: string; teams: number; ranked: number; bestRank: number | null; leagues: number }>;
}

export function computeStatePage(slug: string): StatePage | null {
  const data = getArea(slug);
  if (!data) return null;
  const { area, leagues, clubs } = data;
  return {
    area, teams: data.teams,
    leagues: sortLeagues(leagues, area.code).map((l) => ({
      slug: l.slug, name: l.name, kind: l.kind, tier: l.tier, season: l.seasons[0].season,
      areaTeams: l.areaCounts.get(area.code) ?? 0, clubs: l.clubs.size,
    })),
    clubs: [...clubs].sort((a, b) => b.teams.length - a.teams.length)
      .map((c) => ({ slug: c.slug, name: c.name, teams: c.teams.length, ranked: c.ranked, bestRank: c.bestRank, leagues: c.leagues.length })),
  };
}

export function getStatePage(slug: string): StatePage | null {
  const area = areaBySlug(slug);
  if (!area) return null;
  return readPrecomputed<StatePage>(`state/${area.slug}`) ?? computeStatePage(area.slug);
}
