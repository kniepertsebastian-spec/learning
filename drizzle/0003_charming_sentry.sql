ALTER TABLE "content_generation_jobs" ADD COLUMN "started_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'learner' NOT NULL;--> statement-breakpoint
ALTER TABLE "content_generation_jobs" ADD CONSTRAINT "content_generation_jobs_started_by_user_id_users_id_fk" FOREIGN KEY ("started_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_generation_jobs_active_per_cert" ON "content_generation_jobs" USING btree ("certification_id") WHERE "content_generation_jobs"."status" in ('queued', 'running');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("users"."role" in ('learner', 'admin'));