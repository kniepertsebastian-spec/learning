CREATE TABLE "lesson_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_completions_user_section_unique" UNIQUE("user_id","section_id")
);
--> statement-breakpoint
ALTER TABLE "certifications" ADD COLUMN "include_section_quizzes" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "certifications" ADD COLUMN "include_final_exam" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "course_generation_jobs" ADD COLUMN "include_section_quizzes" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "course_generation_jobs" ADD COLUMN "include_final_exam" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_completions" ADD CONSTRAINT "lesson_completions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_completions" ADD CONSTRAINT "lesson_completions_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;