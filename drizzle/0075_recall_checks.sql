CREATE TABLE "recall_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"status" text DEFAULT 'offered' NOT NULL,
	"question_count" integer NOT NULL,
	"correct_count" integer,
	"lesson_completed_at" timestamp with time zone NOT NULL,
	"hours_since_lesson" numeric(8, 2) NOT NULL,
	"phi_at_learning" numeric(5, 4),
	"hour_at_learning" integer NOT NULL,
	"phi_at_recall" numeric(5, 4) NOT NULL,
	"hour_at_recall" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recall_checks_session_section_unique" UNIQUE("session_id","section_id"),
	CONSTRAINT "recall_checks_status_check" CHECK ("recall_checks"."status" in ('offered', 'answered', 'skipped')),
	CONSTRAINT "recall_checks_hours_check" CHECK ("recall_checks"."hour_at_learning" between 0 and 23 and "recall_checks"."hour_at_recall" between 0 and 23)
);
--> statement-breakpoint
ALTER TABLE "review_log" DROP CONSTRAINT "review_log_type_check";--> statement-breakpoint
ALTER TABLE "study_session_items" ADD COLUMN "recall_check_id" uuid;--> statement-breakpoint
ALTER TABLE "recall_checks" ADD CONSTRAINT "recall_checks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recall_checks" ADD CONSTRAINT "recall_checks_session_id_study_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."study_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recall_checks" ADD CONSTRAINT "recall_checks_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recall_checks_user_section_idx" ON "recall_checks" USING btree ("user_id","section_id");--> statement-breakpoint
ALTER TABLE "study_session_items" ADD CONSTRAINT "study_session_items_recall_check_id_recall_checks_id_fk" FOREIGN KEY ("recall_check_id") REFERENCES "public"."recall_checks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_log" ADD CONSTRAINT "review_log_type_check" CHECK ("review_log"."review_type" in ('card', 'interleaved', 'probe', 'recall_check'));