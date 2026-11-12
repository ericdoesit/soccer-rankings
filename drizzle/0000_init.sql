CREATE TYPE "public"."event_type" AS ENUM('goal', 'yellow_card', 'red_card', 'substitution');--> statement-breakpoint
CREATE TYPE "public"."game_status" AS ENUM('completed', 'forfeited', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('Boys', 'Girls');--> statement-breakpoint
CREATE TYPE "public"."recognition_kind" AS ENUM('college_commitment', 'ynt_callup', 'odp_selection', 'league_award', 'scoring_leader', 'pro_signing', 'homegrown_contract', 'other');--> statement-breakpoint
CREATE TYPE "public"."scrape_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('tournament', 'league');--> statement-breakpoint
CREATE TABLE "club_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"club_id" integer NOT NULL,
	"alias" text NOT NULL,
	"normalized" text NOT NULL,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_leagues" (
	"club_id" integer NOT NULL,
	"league_id" integer NOT NULL,
	"gender" text DEFAULT 'Both' NOT NULL,
	"season" text DEFAULT '' NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "club_leagues_club_id_league_id_gender_season_pk" PRIMARY KEY("club_id","league_id","gender","season")
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"state" text,
	"association" text,
	"metro_id" integer,
	"website" text,
	"top_tier" text,
	"team_count" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "data_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"type" "source_type" NOT NULL,
	"scrape_config" text,
	"last_scraped" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"event_type" "event_type" NOT NULL,
	"minute" integer,
	"player_name" text
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" serial PRIMARY KEY NOT NULL,
	"team1_id" integer NOT NULL,
	"team2_id" integer NOT NULL,
	"team1_score" integer NOT NULL,
	"team2_score" integer NOT NULL,
	"date" date NOT NULL,
	"status" "game_status" DEFAULT 'completed' NOT NULL,
	"forfeit_winner_id" integer,
	"source_id" integer,
	"external_id" text,
	"season" text,
	"tournament_name" text,
	"venue" text,
	"field" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "league_events" (
	"league_id" integer NOT NULL,
	"source" text NOT NULL,
	"external_event_id" text NOT NULL,
	"season" text,
	"name" text,
	CONSTRAINT "league_events_source_external_event_id_pk" PRIMARY KEY("source","external_event_id")
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"tier" text NOT NULL,
	"tier_rank" integer NOT NULL,
	"gender" text NOT NULL,
	"scope" text NOT NULL,
	"states" text[],
	"governing_body" text,
	"website" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "metros" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"state" text NOT NULL,
	"state_cup" text NOT NULL,
	"lat" real,
	"lng" real
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"birth_year" integer,
	"grad_year" integer,
	"gender" "gender" NOT NULL,
	"position" text,
	"state" text,
	"club_id" integer,
	"team_id" integer,
	"suppressed" boolean DEFAULT false NOT NULL,
	"removal_requested_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rankings" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"score" real NOT NULL,
	"rank" integer NOT NULL,
	"previous_rank" integer,
	"rating_change" real,
	"games_played" integer NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"age_group" text NOT NULL,
	"gender" "gender" NOT NULL,
	"region" text,
	"snapshot_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recognitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"kind" "recognition_kind" NOT NULL,
	"title" text NOT NULL,
	"organization" text,
	"season" text,
	"date" date,
	"source_name" text NOT NULL,
	"source_url" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scrape_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"status" "scrape_status" DEFAULT 'running' NOT NULL,
	"games_found" integer DEFAULT 0,
	"games_new" integer DEFAULT 0,
	"errors" text
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"source_id" integer NOT NULL,
	"external_id" text NOT NULL,
	"external_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_leagues" (
	"team_id" integer NOT NULL,
	"league_id" integer NOT NULL,
	"season" text DEFAULT '' NOT NULL,
	"division" text,
	CONSTRAINT "team_leagues_team_id_league_id_season_pk" PRIMARY KEY("team_id","league_id","season")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"club" text,
	"state" text NOT NULL,
	"region" text,
	"age_group" text NOT NULL,
	"gender" "gender" NOT NULL,
	"logo_url" text,
	"club_id" integer,
	"metro_id" integer,
	"birth_year" integer,
	"association" text,
	"state_cup" text,
	"gotsport_team_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "club_aliases" ADD CONSTRAINT "club_aliases_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_leagues" ADD CONSTRAINT "club_leagues_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_leagues" ADD CONSTRAINT "club_leagues_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_metro_id_metros_id_fk" FOREIGN KEY ("metro_id") REFERENCES "public"."metros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_team1_id_teams_id_fk" FOREIGN KEY ("team1_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_team2_id_teams_id_fk" FOREIGN KEY ("team2_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_forfeit_winner_id_teams_id_fk" FOREIGN KEY ("forfeit_winner_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_events" ADD CONSTRAINT "league_events_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rankings" ADD CONSTRAINT "rankings_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recognitions" ADD CONSTRAINT "recognitions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_runs" ADD CONSTRAINT "scrape_runs_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_aliases" ADD CONSTRAINT "team_aliases_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_aliases" ADD CONSTRAINT "team_aliases_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_leagues" ADD CONSTRAINT "team_leagues_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_leagues" ADD CONSTRAINT "team_leagues_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_metro_id_metros_id_fk" FOREIGN KEY ("metro_id") REFERENCES "public"."metros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "club_aliases_unique_idx" ON "club_aliases" USING btree ("normalized","club_id");--> statement-breakpoint
CREATE INDEX "club_aliases_norm_idx" ON "club_aliases" USING btree ("normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "clubs_slug_idx" ON "clubs" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "clubs_state_idx" ON "clubs" USING btree ("state");--> statement-breakpoint
CREATE INDEX "game_events_game_idx" ON "game_events" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "games_date_source_idx" ON "games" USING btree ("date","source_id","external_id");--> statement-breakpoint
CREATE INDEX "games_team1_idx" ON "games" USING btree ("team1_id");--> statement-breakpoint
CREATE INDEX "games_team2_idx" ON "games" USING btree ("team2_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leagues_slug_idx" ON "leagues" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "metros_slug_idx" ON "metros" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "players_slug_idx" ON "players" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "players_state_idx" ON "players" USING btree ("state","gender","birth_year");--> statement-breakpoint
CREATE INDEX "rankings_snapshot_idx" ON "rankings" USING btree ("snapshot_date","age_group","gender","region","rank");--> statement-breakpoint
CREATE INDEX "rankings_team_idx" ON "rankings" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "recognitions_player_idx" ON "recognitions" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_aliases_source_external_idx" ON "team_aliases" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE INDEX "teams_name_idx" ON "teams" USING btree ("name");--> statement-breakpoint
CREATE INDEX "teams_club_idx" ON "teams" USING btree ("club_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_gotsport_idx" ON "teams" USING btree ("gotsport_team_id");--> statement-breakpoint
CREATE VIEW "public"."public_players" AS (select "id", "slug", "display_name", "birth_year", "grad_year", "gender", "position", "state", "club_id", "team_id", "suppressed", "removal_requested_at", "created_at" from "players" where "players"."suppressed" = false
        AND "players"."removal_requested_at" IS NULL
        AND (
          ("players"."birth_year" IS NOT NULL AND
            (extract(year from current_date)::int
              + (CASE WHEN extract(month from current_date) >= 8 THEN 1 ELSE 0 END)
              - "players"."birth_year") >= 15)
          OR ("players"."birth_year" IS NULL AND "players"."grad_year" IS NOT NULL AND
            "players"."grad_year" - (extract(year from current_date)::int
              + (CASE WHEN extract(month from current_date) >= 8 THEN 1 ELSE 0 END)) <= 3)
        ));