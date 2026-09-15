CREATE TABLE "study_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"certification_id" uuid NOT NULL,
	"exam_date" timestamp with time zone,
	"daily_goal_type" text DEFAULT 'minutes' NOT NULL,
	"daily_goal_value" integer DEFAULT 15 NOT NULL,
	"active_days" jsonb DEFAULT '[1,2,3,4,5,6,7]'::jsonb NOT NULL,
	"preferred_locale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_profiles_user_certification_unique" UNIQUE("user_id","certification_id"),
	CONSTRAINT "study_profiles_daily_goal_type_check" CHECK ("study_profiles"."daily_goal_type" in ('minutes', 'questions')),
	CONSTRAINT "study_profiles_daily_goal_value_check" CHECK ("study_profiles"."daily_goal_value" > 0),
	CONSTRAINT "study_profiles_preferred_locale_check" CHECK ("study_profiles"."preferred_locale" is null or "study_profiles"."preferred_locale" in ('de', 'en'))
);
--> statement-breakpoint
ALTER TABLE "study_profiles" ADD CONSTRAINT "study_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_profiles" ADD CONSTRAINT "study_profiles_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE cascade ON UPDATE no action;