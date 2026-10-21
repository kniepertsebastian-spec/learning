CREATE TABLE "concept" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"topic_area" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "concept_course_name_unique" UNIQUE("course_id","name")
);
--> statement-breakpoint
CREATE TABLE "item_concept" (
	"item_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	CONSTRAINT "item_concept_item_id_concept_id_pk" PRIMARY KEY("item_id","concept_id")
);
--> statement-breakpoint
CREATE TABLE "item_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"stability" numeric(10, 4) NOT NULL,
	"difficulty" numeric(8, 4) NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"fsrs_state" integer DEFAULT 2 NOT NULL,
	"last_review" timestamp with time zone,
	"due" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_state_user_item_unique" UNIQUE("user_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "probe_result" (
	"review_log_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"topic_area" text NOT NULL,
	"predicted_r" numeric(6, 5) NOT NULL,
	"self_rating" integer,
	"population_rate" numeric(6, 5),
	"success" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "probe_variant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"concept_id" uuid NOT NULL,
	"question_id" uuid,
	"format" text NOT NULL,
	"content" jsonb NOT NULL,
	"is_bottleneck" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "probe_variant_format_check" CHECK ("probe_variant"."format" in ('embedded_step', 'distractor', 'error_spotting', 'transfer'))
);
--> statement-breakpoint
CREATE TABLE "review_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"timestamp_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"local_hour" integer NOT NULL,
	"weekday" integer NOT NULL,
	"raw_rating" integer NOT NULL,
	"response_time_ms" integer,
	"review_type" text DEFAULT 'card' NOT NULL,
	"probe_variant_id" uuid,
	"predicted_r" numeric(6, 5),
	CONSTRAINT "review_log_raw_rating_check" CHECK ("review_log"."raw_rating" between 1 and 4),
	CONSTRAINT "review_log_type_check" CHECK ("review_log"."review_type" in ('card', 'interleaved', 'probe')),
	CONSTRAINT "review_log_hour_check" CHECK ("review_log"."local_hour" between 0 and 23),
	CONSTRAINT "review_log_weekday_check" CHECK ("review_log"."weekday" between 1 and 7)
);
--> statement-breakpoint
CREATE TABLE "session_checkin" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"energy_level" integer NOT NULL,
	"time_budget_min" integer NOT NULL,
	"had_workday" boolean NOT NULL,
	"imputed" boolean DEFAULT false NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_checkin_energy_check" CHECK ("session_checkin"."energy_level" between 1 and 5),
	CONSTRAINT "session_checkin_budget_check" CHECK ("session_checkin"."time_budget_min" > 0)
);
--> statement-breakpoint
CREATE TABLE "session_derived" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"phi" numeric(5, 4) NOT NULL,
	"r_target" numeric(5, 4) NOT NULL,
	"daily_limit" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_calibration" (
	"user_id" uuid NOT NULL,
	"topic_area" text NOT NULL,
	"bias" numeric(6, 5) NOT NULL,
	"ci_low" numeric(6, 5) NOT NULL,
	"ci_high" numeric(6, 5) NOT NULL,
	"n_probes" integer NOT NULL,
	"brier" numeric(6, 5),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_calibration_user_id_topic_area_pk" PRIMARY KEY("user_id","topic_area")
);
--> statement-breakpoint
CREATE TABLE "user_checkin_flags" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"monotone" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_fsrs_params" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"weights" jsonb NOT NULL,
	"review_count" integer NOT NULL,
	"fitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "study_profiles" ADD COLUMN "light_weekdays" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "age_range" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "timezone" text DEFAULT 'Europe/Berlin' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "evaluation_group" text;--> statement-breakpoint
ALTER TABLE "concept" ADD CONSTRAINT "concept_course_id_certifications_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_concept" ADD CONSTRAINT "item_concept_item_id_questions_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_concept" ADD CONSTRAINT "item_concept_concept_id_concept_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concept"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_state" ADD CONSTRAINT "item_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_state" ADD CONSTRAINT "item_state_item_id_questions_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_result" ADD CONSTRAINT "probe_result_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_result" ADD CONSTRAINT "probe_result_concept_id_concept_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concept"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_result" ADD CONSTRAINT "probe_result_variant_id_probe_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."probe_variant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_variant" ADD CONSTRAINT "probe_variant_concept_id_concept_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concept"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_variant" ADD CONSTRAINT "probe_variant_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_log" ADD CONSTRAINT "review_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_log" ADD CONSTRAINT "review_log_item_id_questions_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_checkin" ADD CONSTRAINT "session_checkin_session_id_study_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."study_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_checkin" ADD CONSTRAINT "session_checkin_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_derived" ADD CONSTRAINT "session_derived_session_id_study_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."study_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_calibration" ADD CONSTRAINT "user_calibration_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_checkin_flags" ADD CONSTRAINT "user_checkin_flags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_fsrs_params" ADD CONSTRAINT "user_fsrs_params_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_state_user_due_idx" ON "item_state" USING btree ("user_id","due");--> statement-breakpoint
CREATE INDEX "probe_result_user_topic_idx" ON "probe_result" USING btree ("user_id","topic_area");--> statement-breakpoint
CREATE INDEX "probe_variant_concept_idx" ON "probe_variant" USING btree ("concept_id");--> statement-breakpoint
CREATE INDEX "review_log_user_time_idx" ON "review_log" USING btree ("user_id","timestamp_utc");--> statement-breakpoint
CREATE INDEX "review_log_item_idx" ON "review_log" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "session_checkin_user_idx" ON "session_checkin" USING btree ("user_id","timestamp");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_age_range_check" CHECK ("users"."age_range" is null or "users"."age_range" in ('under_18', '18_24', '25_34', '35_44', '45_54', '55_plus'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_evaluation_group_check" CHECK ("users"."evaluation_group" is null or "users"."evaluation_group" in ('vanilla', 'planning', 'planning_state'));
--> statement-breakpoint
CREATE FUNCTION "review_log_immutable"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'review_log ist append-only (UPDATE nicht erlaubt)';
  END IF;
  -- DELETE nur, wenn der Nutzer selbst gelöscht wird (Kaskade, DSGVO): dann existiert die users-Zeile nicht mehr.
  IF EXISTS (SELECT 1 FROM "users" WHERE "id" = OLD."user_id") THEN
    RAISE EXCEPTION 'review_log ist append-only (DELETE nur beim Löschen des Nutzers)';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "review_log_no_update" BEFORE UPDATE ON "review_log" FOR EACH ROW EXECUTE FUNCTION "review_log_immutable"();--> statement-breakpoint
CREATE TRIGGER "review_log_no_delete" BEFORE DELETE ON "review_log" FOR EACH ROW EXECUTE FUNCTION "review_log_immutable"();
