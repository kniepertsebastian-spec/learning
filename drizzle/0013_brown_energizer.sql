CREATE TABLE "study_session_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"order_num" integer NOT NULL,
	"category" text NOT NULL,
	"reference_type" text NOT NULL,
	"reference_id" uuid NOT NULL,
	"outcome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"certification_id" uuid NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"goal_type" text NOT NULL,
	"goal_value" integer NOT NULL,
	"planned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_sessions_status_check" CHECK ("study_sessions"."status" in ('planned', 'in_progress', 'completed', 'skipped', 'abandoned')),
	CONSTRAINT "study_sessions_goal_type_check" CHECK ("study_sessions"."goal_type" in ('minutes', 'questions'))
);
--> statement-breakpoint
ALTER TABLE "study_session_items" ADD CONSTRAINT "study_session_items_session_id_study_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."study_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "study_sessions_active_per_user_cert" ON "study_sessions" USING btree ("user_id","certification_id") WHERE "study_sessions"."status" in ('planned', 'in_progress');