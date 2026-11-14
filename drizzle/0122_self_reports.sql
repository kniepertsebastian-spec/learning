CREATE TABLE "self_report_settings" (
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"skip_streak" integer DEFAULT 0 NOT NULL,
	"paused_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "self_report_settings_user_id_kind_pk" PRIMARY KEY("user_id","kind"),
	CONSTRAINT "self_report_settings_kind_check" CHECK ("self_report_settings"."kind" in ('effort', 'retention_forecast', 'exam_confidence', 'learning_reason', 'work_relevance', 'learning_environment')),
	CONSTRAINT "self_report_settings_skip_streak_check" CHECK ("self_report_settings"."skip_streak" >= 0)
);
--> statement-breakpoint
CREATE TABLE "self_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value" text,
	"ref_type" text,
	"ref_id" uuid,
	"session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "self_reports_kind_check" CHECK ("self_reports"."kind" in ('effort', 'retention_forecast', 'exam_confidence', 'learning_reason', 'work_relevance', 'learning_environment')),
	CONSTRAINT "self_reports_ref_type_check" CHECK ("self_reports"."ref_type" is null or "self_reports"."ref_type" in ('section', 'course', 'session'))
);
--> statement-breakpoint
ALTER TABLE "self_report_settings" ADD CONSTRAINT "self_report_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "self_reports" ADD CONSTRAINT "self_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "self_reports" ADD CONSTRAINT "self_reports_session_id_study_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."study_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "self_reports_user_kind_time_idx" ON "self_reports" USING btree ("user_id","kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "self_reports_session_unique" ON "self_reports" USING btree ("session_id") WHERE "self_reports"."session_id" is not null;