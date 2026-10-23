CREATE TABLE "learning_exit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"session_id" uuid,
	"section_id" uuid,
	"question_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_exit_source_check" CHECK ("learning_exit"."source" in ('session', 'section_quiz'))
);
--> statement-breakpoint
ALTER TABLE "learning_exit" ADD CONSTRAINT "learning_exit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_exit" ADD CONSTRAINT "learning_exit_session_id_study_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."study_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_exit" ADD CONSTRAINT "learning_exit_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_exit" ADD CONSTRAINT "learning_exit_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "learning_exit_user_time_idx" ON "learning_exit" USING btree ("user_id","created_at");