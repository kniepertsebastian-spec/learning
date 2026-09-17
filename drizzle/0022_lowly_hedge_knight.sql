CREATE TABLE "course_generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requested_by_user_id" uuid,
	"course_title" text NOT NULL,
	"course_description" text NOT NULL,
	"language" text NOT NULL,
	"provider" text NOT NULL,
	"certification_version" text,
	"source_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"auto_publish" boolean DEFAULT false NOT NULL,
	"initial_cost_limit_usd" numeric(10, 2) NOT NULL,
	"absolute_cost_limit_usd" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"phase" text DEFAULT 'queued' NOT NULL,
	"message" text,
	"blueprint_provider" text NOT NULL,
	"routine_session_url" text,
	"blueprint_json" jsonb,
	"package_json" jsonb,
	"estimated_cost_usd" numeric(10, 4),
	"actual_cost_usd" numeric(10, 4) DEFAULT '0' NOT NULL,
	"result_certification_id" uuid,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "course_generation_jobs_status_check" CHECK ("course_generation_jobs"."status" in ('queued', 'preflight', 'preflight_failed', 'blueprint_requested', 'blueprint_generating', 'blueprint_validating', 'cost_estimating', 'blueprint_ready', 'canary_generating', 'canary_validating', 'canary_failed', 'content_generating', 'batch_generating', 'validating', 'repairing', 'circuit_breaker_open', 'package_ready', 'importing', 'published', 'waiting_for_quota', 'paused_budget', 'cost_limit_reached', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "course_generation_objectives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"domain_id" text NOT NULL,
	"objective_id" text NOT NULL,
	"code" text NOT NULL,
	"is_canary" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"provider" text,
	"model" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 4),
	"content_json" jsonb,
	"validation_errors_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_generation_objectives_job_objective_unique" UNIQUE("job_id","objective_id"),
	CONSTRAINT "course_generation_objectives_status_check" CHECK ("course_generation_objectives"."status" in ('pending', 'generating', 'validating', 'repairing', 'valid', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "course_generation_jobs" ADD CONSTRAINT "course_generation_jobs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_generation_jobs" ADD CONSTRAINT "course_generation_jobs_result_certification_id_certifications_id_fk" FOREIGN KEY ("result_certification_id") REFERENCES "public"."certifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_generation_objectives" ADD CONSTRAINT "course_generation_objectives_job_id_course_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."course_generation_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_generation_jobs_status_idx" ON "course_generation_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "course_generation_objectives_job_idx" ON "course_generation_objectives" USING btree ("job_id");