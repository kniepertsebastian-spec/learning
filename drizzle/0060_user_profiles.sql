CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"job_title" text,
	"job_description" text,
	"focus_areas" text,
	"state" text,
	"auto_skills" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_state_check" CHECK ("user_profiles"."state" is null or "user_profiles"."state" in ('BW','BY','BE','BB','HB','HH','HE','MV','NI','NW','RP','SL','SN','ST','SH','TH'))
);
--> statement-breakpoint
CREATE TABLE "user_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"level" text NOT NULL,
	"recency" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"source_certification_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_skills_kind_check" CHECK ("user_skills"."kind" in ('skill', 'tool')),
	CONSTRAINT "user_skills_level_check" CHECK ("user_skills"."level" in ('basic', 'confident', 'expert')),
	CONSTRAINT "user_skills_recency_check" CHECK ("user_skills"."recency" is null or "user_skills"."recency" in ('current', 'recent', 'older')),
	CONSTRAINT "user_skills_source_check" CHECK ("user_skills"."source" in ('manual', 'course', 'certificate'))
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_source_certification_id_certifications_id_fk" FOREIGN KEY ("source_certification_id") REFERENCES "public"."certifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_skills_user_kind_name_unique" ON "user_skills" USING btree ("user_id","kind",lower("name"));