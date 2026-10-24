CREATE TABLE "reviewer_certifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"vendor" text NOT NULL,
	"name" text NOT NULL,
	"earned_on" date NOT NULL,
	"valid_until" date,
	"verification_url" text NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by_user_id" uuid,
	"reminders_sent" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviewer_experience" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"organization" text,
	"period_from" text NOT NULL,
	"period_to" text,
	"description" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviewer_experience_kind_check" CHECK ("reviewer_experience"."kind" in ('job', 'project', 'teaching'))
);
--> statement-breakpoint
CREATE TABLE "reviewer_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"country" text NOT NULL,
	"region" text,
	"bio" jsonb,
	"linkedin_url" text,
	"consent" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviewer_profiles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "reviewer_certifications" ADD CONSTRAINT "reviewer_certifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_certifications" ADD CONSTRAINT "reviewer_certifications_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_experience" ADD CONSTRAINT "reviewer_experience_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_profiles" ADD CONSTRAINT "reviewer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reviewer_certifications_user_idx" ON "reviewer_certifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reviewer_experience_user_idx" ON "reviewer_experience" USING btree ("user_id");