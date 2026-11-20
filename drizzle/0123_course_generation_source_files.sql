CREATE TABLE "course_generation_source_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"order_num" integer NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_generation_source_files" ADD CONSTRAINT "course_generation_source_files_job_id_course_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."course_generation_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_generation_source_files_job_idx" ON "course_generation_source_files" USING btree ("job_id","order_num");
