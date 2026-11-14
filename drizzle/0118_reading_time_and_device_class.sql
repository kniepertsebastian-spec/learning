CREATE TABLE "lesson_reading_time" (
	"user_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"seconds" integer DEFAULT 0 NOT NULL,
	"opens" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_reading_time_user_id_section_id_pk" PRIMARY KEY("user_id","section_id"),
	CONSTRAINT "lesson_reading_time_seconds_check" CHECK ("lesson_reading_time"."seconds" between 0 and 86400),
	CONSTRAINT "lesson_reading_time_opens_check" CHECK ("lesson_reading_time"."opens" >= 0)
);
--> statement-breakpoint
ALTER TABLE "study_sessions" ADD COLUMN "device_class" text;--> statement-breakpoint
ALTER TABLE "lesson_reading_time" ADD CONSTRAINT "lesson_reading_time_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_reading_time" ADD CONSTRAINT "lesson_reading_time_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_device_class_check" CHECK ("study_sessions"."device_class" is null or "study_sessions"."device_class" in ('narrow', 'wide'));