CREATE TABLE "gemini_batch_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"certification_id" uuid NOT NULL,
	"gemini_name" text NOT NULL,
	"model" text NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"payload" jsonb NOT NULL,
	"request_count" integer NOT NULL,
	"message" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "gemini_batch_jobs_name_unique" UNIQUE("gemini_name"),
	CONSTRAINT "gemini_batch_jobs_kind_check" CHECK ("gemini_batch_jobs"."kind" in ('tagging')),
	CONSTRAINT "gemini_batch_jobs_status_check" CHECK ("gemini_batch_jobs"."status" in ('submitted', 'applying', 'done', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "gemini_batch_jobs" ADD CONSTRAINT "gemini_batch_jobs_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gemini_batch_jobs_status_idx" ON "gemini_batch_jobs" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "gemini_batch_jobs_certification_idx" ON "gemini_batch_jobs" USING btree ("certification_id");