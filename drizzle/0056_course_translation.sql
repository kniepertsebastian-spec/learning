ALTER TABLE "certifications" ADD COLUMN "content_locale" text;--> statement-breakpoint
ALTER TABLE "certifications" ADD COLUMN "translation_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "certifications" ADD COLUMN "translation_message" text;--> statement-breakpoint
ALTER TABLE "certifications" ADD COLUMN "translation_cost_usd" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "certifications" ADD COLUMN "translated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_content_locale_check" CHECK ("certifications"."content_locale" is null or "certifications"."content_locale" in ('de', 'en'));--> statement-breakpoint
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_translation_status_check" CHECK ("certifications"."translation_status" in ('none', 'running', 'done', 'failed'));