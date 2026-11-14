ALTER TABLE "quiz_answers" ADD COLUMN "response_time_ms" integer;--> statement-breakpoint
ALTER TABLE "quiz_answers" ADD COLUMN "changed_answer" boolean;--> statement-breakpoint
ALTER TABLE "study_session_items" ADD COLUMN "changed_answer" boolean;