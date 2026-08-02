CREATE TYPE "public"."processing_status" AS ENUM('pending', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."split_unit" AS ENUM('km', 'mile');--> statement-breakpoint
CREATE TYPE "public"."sport_type" AS ENUM('Run', 'TrailRun', 'VirtualRun', 'Ride', 'MountainBikeRide', 'GravelRide', 'EBikeRide', 'EMountainBikeRide', 'VirtualRide', 'Handcycle', 'Velomobile', 'Swim', 'OpenWaterSwim', 'WeightTraining', 'Crossfit', 'HighIntensityIntervalTraining', 'Hike', 'Walk', 'Rucking', 'Wheelchair', 'AlpineSki', 'BackcountrySki', 'NordicSki', 'Snowboard', 'Snowshoe', 'Rowing', 'VirtualRow', 'Kayaking', 'Canoeing', 'StandUpPaddling', 'Surfing', 'Kitesurf', 'Windsurf', 'Sail', 'IceSkate', 'InlineSkate', 'RollerSki', 'Skateboard', 'Elliptical', 'StairStepper', 'Pilates', 'Yoga', 'Stretching', 'PhysicalTherapy', 'Workout', 'RockClimbing', 'IndoorClimbing', 'Tennis', 'Padel', 'Squash', 'Racquetball', 'Badminton', 'TableTennis', 'Pickleball', 'Soccer', 'Basketball', 'Volleyball', 'Rugby', 'AmericanFootball', 'Baseball', 'Cricket', 'IceHockey', 'FieldHockey', 'Handball', 'Boxing', 'MartialArts', 'Golf', 'Dance', 'Triathlon', 'Hyrox');--> statement-breakpoint
CREATE TYPE "public"."stream_type" AS ENUM('time', 'latlng', 'latlng_clean', 'altitude', 'altitude_clean', 'heartrate', 'cadence', 'power', 'velocity', 'temperature', 'moving');--> statement-breakpoint
CREATE TYPE "public"."swim_stroke" AS ENUM('freestyle', 'backstroke', 'breaststroke', 'butterfly', 'mixed', 'unknown');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"upload_id" uuid,
	"sport_type" "sport_type" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"visibility" "visibility" DEFAULT 'followers' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"elapsed_s" integer DEFAULT 0 NOT NULL,
	"moving_s" integer DEFAULT 0 NOT NULL,
	"distance_m" double precision DEFAULT 0 NOT NULL,
	"elev_gain_m" double precision DEFAULT 0 NOT NULL,
	"elev_loss_m" double precision DEFAULT 0 NOT NULL,
	"avg_speed_ms" double precision,
	"max_speed_ms" double precision,
	"avg_hr" real,
	"max_hr" smallint,
	"avg_cadence" real,
	"max_cadence" real,
	"avg_power_w" real,
	"max_power_w" real,
	"avg_gap_sec_per_km" double precision,
	"calories" integer,
	"hr_zone_times" jsonb,
	"avg_swolf" real,
	"total_strokes" integer,
	"pool_length_m" double precision,
	"is_manual" boolean DEFAULT false NOT NULL,
	"is_trainer" boolean DEFAULT false NOT NULL,
	"is_indoor" boolean DEFAULT false NOT NULL,
	"device_name" text,
	"source_app" text,
	"processing_status" "processing_status" DEFAULT 'pending' NOT NULL,
	"processing_error" text,
	"processed_at" timestamp with time zone,
	"start_lat" double precision,
	"start_lng" double precision,
	"end_lat" double precision,
	"end_lng" double precision,
	"map_summary" jsonb,
	"privacy_fuzz_seed" integer NOT NULL,
	"region" text DEFAULT 'global' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_efforts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"activity_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"distance_m" double precision NOT NULL,
	"elapsed_s" double precision NOT NULL,
	"start_index" integer NOT NULL,
	"end_index" integer NOT NULL,
	"achieved_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_splits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"activity_id" uuid NOT NULL,
	"unit" "split_unit" NOT NULL,
	"index" integer NOT NULL,
	"distance_m" double precision NOT NULL,
	"elapsed_s" double precision NOT NULL,
	"moving_s" double precision NOT NULL,
	"elev_gain_m" double precision DEFAULT 0 NOT NULL,
	"avg_hr" real,
	"gap_s" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_streams" (
	"id" uuid PRIMARY KEY NOT NULL,
	"activity_id" uuid NOT NULL,
	"stream_type" "stream_type" NOT NULL,
	"sample_count" integer NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_zone_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"max_hr" smallint,
	"z1_pct" smallint DEFAULT 50 NOT NULL,
	"z2_pct" smallint DEFAULT 60 NOT NULL,
	"z3_pct" smallint DEFAULT 70 NOT NULL,
	"z4_pct" smallint DEFAULT 80 NOT NULL,
	"z5_pct" smallint DEFAULT 90 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "swim_lengths" (
	"id" uuid PRIMARY KEY NOT NULL,
	"activity_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"stroke" "swim_stroke" DEFAULT 'unknown' NOT NULL,
	"duration_s" double precision NOT NULL,
	"stroke_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_efforts" ADD CONSTRAINT "activity_efforts_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_efforts" ADD CONSTRAINT "activity_efforts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_splits" ADD CONSTRAINT "activity_splits_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_streams" ADD CONSTRAINT "activity_streams_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_zone_settings" ADD CONSTRAINT "hr_zone_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swim_lengths" ADD CONSTRAINT "swim_lengths_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activities_user_upload_unique" ON "activities" USING btree ("user_id","upload_id");--> statement-breakpoint
CREATE INDEX "activities_user_started_idx" ON "activities" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "activities_status_idx" ON "activities" USING btree ("processing_status");--> statement-breakpoint
CREATE INDEX "activities_region_idx" ON "activities" USING btree ("region");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_efforts_unique" ON "activity_efforts" USING btree ("activity_id","distance_m");--> statement-breakpoint
CREATE INDEX "activity_efforts_user_distance_idx" ON "activity_efforts" USING btree ("user_id","distance_m","elapsed_s");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_splits_unique" ON "activity_splits" USING btree ("activity_id","unit","index");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_streams_unique" ON "activity_streams" USING btree ("activity_id","stream_type");--> statement-breakpoint
CREATE UNIQUE INDEX "swim_lengths_unique" ON "swim_lengths" USING btree ("activity_id","index");