ALTER TABLE "content_generation_jobs" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "content_generation_jobs" ADD COLUMN "prompt_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "content_generation_jobs" ADD COLUMN "completion_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "content_generation_jobs" ADD COLUMN "total_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "content_generation_jobs" ADD COLUMN "estimated_cost_usd" numeric(10, 4);