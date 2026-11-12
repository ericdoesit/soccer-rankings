import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  date,
  real,
  pgEnum,
  index,
  uniqueIndex,
  boolean,
  pgView,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const genderEnum = pgEnum("gender", ["Boys", "Girls"]);
export const gameStatusEnum = pgEnum("game_status", [
  "completed",
  "forfeited",
  "cancelled",
]);
export const eventTypeEnum = pgEnum("event_type", [
  "goal",
  "yellow_card",
  "red_card",
  "substitution",
]);
export const sourceTypeEnum = pgEnum("source_type", ["tournament", "league"]);
export const scrapeStatusEnum = pgEnum("scrape_status", [
  "running",
  "completed",
  "failed",
]);

export const seasons = pgTable("seasons", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
});

export const dataSources = pgTable("data_sources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url"),
  type: sourceTypeEnum("type").notNull(),
  scrapeConfig: text("scrape_config"),
  lastScraped: timestamp("last_scraped"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const teams = pgTable(
  "teams",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    club: text("club"),
    state: text("state").notNull(),
    region: text("region"),
    ageGroup: text("age_group").notNull(),
    gender: genderEnum("gender").notNull(),
    logoUrl: text("logo_url"),
    // Directory links (step 2). club/state text columns above are kept as the
    // raw source values; these are the resolved references.
    clubId: integer("club_id").references(() => clubs.id),
    metroId: integer("metro_id").references(() => metros.id),
    birthYear: integer("birth_year"),
    association: text("association"), // GotSport state association: CAS, CAN, AZ, ...
    stateCup: text("state_cup"), // State Cup bracket key: CA-S, CA-N, AZ, ... (see STATE_CUPS)
    gotsportTeamId: integer("gotsport_team_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("teams_name_idx").on(table.name),
    index("teams_club_idx").on(table.clubId),
    uniqueIndex("teams_gotsport_idx").on(table.gotsportTeamId),
  ]
);

export const teamAliases = pgTable(
  "team_aliases",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .references(() => teams.id)
      .notNull(),
    sourceId: integer("source_id")
      .references(() => dataSources.id)
      .notNull(),
    externalId: text("external_id").notNull(),
    externalName: text("external_name").notNull(),
  },
  (table) => [
    uniqueIndex("team_aliases_source_external_idx").on(
      table.sourceId,
      table.externalId
    ),
  ]
);

export const games = pgTable(
  "games",
  {
    id: serial("id").primaryKey(),
    team1Id: integer("team1_id")
      .references(() => teams.id)
      .notNull(),
    team2Id: integer("team2_id")
      .references(() => teams.id)
      .notNull(),
    team1Score: integer("team1_score").notNull(),
    team2Score: integer("team2_score").notNull(),
    date: date("date").notNull(),
    status: gameStatusEnum("status").notNull().default("completed"),
    forfeitWinnerId: integer("forfeit_winner_id").references(() => teams.id),
    sourceId: integer("source_id").references(() => dataSources.id),
    externalId: text("external_id"),
    season: text("season"),
    tournamentName: text("tournament_name"),
    venue: text("venue"),
    field: text("field"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("games_date_source_idx").on(
      table.date,
      table.sourceId,
      table.externalId
    ),
    index("games_team1_idx").on(table.team1Id),
    index("games_team2_idx").on(table.team2Id),
  ]
);

export const gameEvents = pgTable(
  "game_events",
  {
    id: serial("id").primaryKey(),
    gameId: integer("game_id")
      .references(() => games.id)
      .notNull(),
    teamId: integer("team_id")
      .references(() => teams.id)
      .notNull(),
    eventType: eventTypeEnum("event_type").notNull(),
    minute: integer("minute"),
    playerName: text("player_name"),
  },
  (table) => [index("game_events_game_idx").on(table.gameId)]
);

export const rankings = pgTable(
  "rankings",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .references(() => teams.id)
      .notNull(),
    score: real("score").notNull(),
    rank: integer("rank").notNull(),
    previousRank: integer("previous_rank"),
    ratingChange: real("rating_change"),
    gamesPlayed: integer("games_played").notNull(),
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    draws: integer("draws").notNull().default(0),
    ageGroup: text("age_group").notNull(),
    gender: genderEnum("gender").notNull(),
    region: text("region"),
    snapshotDate: date("snapshot_date").notNull(),
  },
  (table) => [
    index("rankings_snapshot_idx").on(
      table.snapshotDate,
      table.ageGroup,
      table.gender,
      table.region,
      table.rank
    ),
    index("rankings_team_idx").on(table.teamId),
  ]
);

export const scrapeRuns = pgTable("scrape_runs", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id")
    .references(() => dataSources.id)
    .notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  status: scrapeStatusEnum("status").notNull().default("running"),
  gamesFound: integer("games_found").default(0),
  gamesNew: integer("games_new").default(0),
  errors: text("errors"),
});

// ─────────────────────────────────────────────────────────────────────────────
// Directory: metros, leagues, clubs (step 2 of the West roadmap)
// ─────────────────────────────────────────────────────────────────────────────

/** Metropolitan areas in US Youth Soccer Region IV. */
export const metros = pgTable(
  "metros",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    state: text("state").notNull(), // 2-letter postal code
    stateCup: text("state_cup").notNull(), // CA-S / CA-N / state code
    lat: real("lat"),
    lng: real("lng"),
  },
  (t) => [uniqueIndex("metros_slug_idx").on(t.slug)]
);

/**
 * Leagues and competitions. tier follows the sibling project's taxonomy:
 * L1 MLS NEXT Homegrown · L2 ECNL / GA · L3 ECNL RL, MLS NEXT Academy, EAL, NAL,
 * GA Aspire, DPL · L4 USYS National League / Elite 64 · L5 state & regional
 * premier leagues (N1, SoCal, Coast, NorCal Premier, WPL, ...).
 */
export const leagues = pgTable(
  "leagues",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    shortName: text("short_name"),
    tier: text("tier").notNull(), // L1..L5, PRO, CUP
    tierRank: integer("tier_rank").notNull(), // 1 = highest; for sorting
    gender: text("gender").notNull(), // Boys | Girls | Both
    scope: text("scope").notNull(), // national | regional | state
    states: text("states").array(), // states it operates in (null = national)
    governingBody: text("governing_body"),
    website: text("website"),
    notes: text("notes"),
  },
  (t) => [uniqueIndex("leagues_slug_idx").on(t.slug)]
);

/** External event ids (GotSport etc.) that belong to a league, per season. */
export const leagueEvents = pgTable(
  "league_events",
  {
    leagueId: integer("league_id").references(() => leagues.id).notNull(),
    source: text("source").notNull(), // "gotsport"
    externalEventId: text("external_event_id").notNull(),
    season: text("season"), // "2025-26"
    name: text("name"),
  },
  (t) => [primaryKey({ columns: [t.source, t.externalEventId] })]
);

export const clubs = pgTable(
  "clubs",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    city: text("city"),
    state: text("state"), // 2-letter postal code
    association: text("association"), // CAS / CAN / ... (from GotSport)
    metroId: integer("metro_id").references(() => metros.id),
    website: text("website"),
    topTier: text("top_tier"), // best league tier any team plays in
    teamCount: integer("team_count").default(0),
  },
  (t) => [
    uniqueIndex("clubs_slug_idx").on(t.slug),
    index("clubs_state_idx").on(t.state),
  ]
);

/**
 * Every spelling of a club seen in any source. normalized = normalizeClubName(alias);
 * matching is done on normalized keys scoped by state (null = any state).
 */
export const clubAliases = pgTable(
  "club_aliases",
  {
    id: serial("id").primaryKey(),
    clubId: integer("club_id").references(() => clubs.id).notNull(),
    alias: text("alias").notNull(),
    normalized: text("normalized").notNull(),
    source: text("source").notNull(),
  },
  (t) => [
    uniqueIndex("club_aliases_unique_idx").on(t.normalized, t.clubId),
    index("club_aliases_norm_idx").on(t.normalized),
  ]
);

export const clubLeagues = pgTable(
  "club_leagues",
  {
    clubId: integer("club_id").references(() => clubs.id).notNull(),
    leagueId: integer("league_id").references(() => leagues.id).notNull(),
    gender: text("gender").notNull().default("Both"),
    season: text("season").notNull().default(""),
    source: text("source").notNull(),
  },
  (t) => [primaryKey({ columns: [t.clubId, t.leagueId, t.gender, t.season] })]
);

export const teamLeagues = pgTable(
  "team_leagues",
  {
    teamId: integer("team_id").references(() => teams.id).notNull(),
    leagueId: integer("league_id").references(() => leagues.id).notNull(),
    season: text("season").notNull().default(""),
    division: text("division"),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.leagueId, t.season] })]
);

// ─────────────────────────────────────────────────────────────────────────────
// Players (step 7) — minors. Visibility is enforced here, in the data layer:
// app code must read players only through the public_players view.
//   • public only from PLAYER_PUBLIC_MIN_AGE (U15) upward
//   • suppressed / removal-requested rows never appear
//   • only information an organization already published (sourceUrl required
//     on every recognition); no birthdates, photos or login-gated rosters
// ─────────────────────────────────────────────────────────────────────────────

export const recognitionKindEnum = pgEnum("recognition_kind", [
  "college_commitment",
  "ynt_callup",
  "odp_selection",
  "league_award",
  "scoring_leader",
  "pro_signing",
  "homegrown_contract",
  "other",
]);

export const players = pgTable(
  "players",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    displayName: text("display_name").notNull(),
    birthYear: integer("birth_year"), // year only, never full birthdate
    gradYear: integer("grad_year"),
    gender: genderEnum("gender").notNull(),
    position: text("position"),
    state: text("state"),
    clubId: integer("club_id").references(() => clubs.id),
    teamId: integer("team_id").references(() => teams.id),
    suppressed: boolean("suppressed").notNull().default(false),
    removalRequestedAt: timestamp("removal_requested_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("players_slug_idx").on(t.slug),
    index("players_state_idx").on(t.state, t.gender, t.birthYear),
  ]
);

export const recognitions = pgTable(
  "recognitions",
  {
    id: serial("id").primaryKey(),
    playerId: integer("player_id").references(() => players.id).notNull(),
    kind: recognitionKindEnum("kind").notNull(),
    title: text("title").notNull(), // "Committed to Stanford", "U-15 BNT camp"
    organization: text("organization"),
    season: text("season"),
    date: date("date"),
    sourceName: text("source_name").notNull(),
    sourceUrl: text("source_url").notNull(), // must be a public page
  },
  (t) => [index("recognitions_player_idx").on(t.playerId)]
);

/** Youngest age group whose players may be shown by name. */
export const PLAYER_PUBLIC_MIN_AGE = 15;

/**
 * Season runs Aug 1 – Jul 31; age group U = season end year − birth year.
 * Players with unknown birth year and no grad year are hidden.
 */
export const publicPlayers = pgView("public_players").as((qb) =>
  qb
    .select()
    .from(players)
    .where(
      sql`${players.suppressed} = false
        AND ${players.removalRequestedAt} IS NULL
        AND (
          (${players.birthYear} IS NOT NULL AND
            (extract(year from current_date)::int
              + (CASE WHEN extract(month from current_date) >= 8 THEN 1 ELSE 0 END)
              - ${players.birthYear}) >= ${sql.raw(String(PLAYER_PUBLIC_MIN_AGE))})
          OR (${players.birthYear} IS NULL AND ${players.gradYear} IS NOT NULL AND
            ${players.gradYear} - (extract(year from current_date)::int
              + (CASE WHEN extract(month from current_date) >= 8 THEN 1 ELSE 0 END)) <= 3)
        )`
    )
);
