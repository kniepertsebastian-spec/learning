ALTER TABLE "study_sessions" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD COLUMN "draft" jsonb;