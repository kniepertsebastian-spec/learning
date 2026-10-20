CREATE TABLE "course_completion_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certification_id" uuid,
	"course_name" text NOT NULL,
	"kind" text NOT NULL,
	"completed_on" date NOT NULL,
	"calendar_days" integer NOT NULL,
	"active_minutes" integer,
	"backfilled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "course_completion_events_kind_check" CHECK ("course_completion_events"."kind" in ('final_exam_passed', 'certified'))
);
--> statement-breakpoint
CREATE TABLE "learning_time" (
	"user_id" uuid NOT NULL,
	"certification_id" uuid NOT NULL,
	"day" date NOT NULL,
	"seconds" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "learning_time_user_id_certification_id_day_pk" PRIMARY KEY("user_id","certification_id","day"),
	CONSTRAINT "learning_time_seconds_check" CHECK ("learning_time"."seconds" between 0 and 86400)
);
--> statement-breakpoint
ALTER TABLE "course_completion_events" ADD CONSTRAINT "course_completion_events_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_time" ADD CONSTRAINT "learning_time_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_time" ADD CONSTRAINT "learning_time_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_completion_events_cert_idx" ON "course_completion_events" USING btree ("certification_id","completed_on");--> statement-breakpoint
CREATE INDEX "course_completion_events_day_idx" ON "course_completion_events" USING btree ("completed_on");