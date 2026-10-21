ALTER TABLE "course_generation_jobs" ADD COLUMN "split_of_job_id" uuid;--> statement-breakpoint
ALTER TABLE "course_generation_jobs" ADD COLUMN "split_part" integer;--> statement-breakpoint
ALTER TABLE "course_generation_jobs" ADD COLUMN "split_parts" integer;