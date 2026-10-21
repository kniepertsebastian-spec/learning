ALTER TABLE "certifications" ADD COLUMN "ai_edit_cost_usd" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "translation_outdated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "translation_outdated" boolean DEFAULT false NOT NULL;