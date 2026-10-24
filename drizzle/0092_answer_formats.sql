ALTER TABLE "questions" ADD COLUMN "answer_format" text DEFAULT 'choice' NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "answer_data" jsonb;--> statement-breakpoint
ALTER TABLE "quiz_answers" ADD COLUMN "answer" jsonb;--> statement-breakpoint
ALTER TABLE "study_session_items" ADD COLUMN "answer" jsonb;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_answer_format_check" CHECK ("questions"."answer_format" in ('choice', 'ordering', 'short_answer', 'matching'));