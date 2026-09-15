ALTER TABLE "certifications" ADD COLUMN "exam_question_count" integer;--> statement-breakpoint
ALTER TABLE "certifications" ADD COLUMN "exam_duration_minutes" integer;--> statement-breakpoint
ALTER TABLE "certifications" ADD COLUMN "passing_score" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "certifications" ADD COLUMN "score_scale" text;