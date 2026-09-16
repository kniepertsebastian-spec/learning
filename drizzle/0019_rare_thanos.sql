ALTER TABLE "study_sessions" ADD COLUMN "energy_level" text;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD COLUMN "is_comeback" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_energy_level_check" CHECK ("study_sessions"."energy_level" is null or "study_sessions"."energy_level" in ('low', 'medium', 'high'));