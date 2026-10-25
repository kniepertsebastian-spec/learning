CREATE TABLE "pre_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"certification_id" uuid NOT NULL,
	"status" text NOT NULL,
	"correct_count" integer,
	"total_count" integer,
	"domain_results" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pre_assessments_user_certification_unique" UNIQUE("user_id","certification_id"),
	CONSTRAINT "pre_assessments_status_check" CHECK ("pre_assessments"."status" in ('completed', 'skipped'))
);
--> statement-breakpoint
ALTER TABLE "pre_assessments" ADD CONSTRAINT "pre_assessments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_assessments" ADD CONSTRAINT "pre_assessments_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE cascade ON UPDATE no action;