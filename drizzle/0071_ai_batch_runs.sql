CREATE TABLE "ai_batch_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"certification_id" uuid,
	"started_by_user_id" uuid,
	"status" text DEFAULT 'running' NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"processed" integer DEFAULT 0 NOT NULL,
	"applied" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 4),
	"message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "ai_batch_runs_kind_check" CHECK ("ai_batch_runs"."kind" in ('quality', 'simulations', 'concepts')),
	CONSTRAINT "ai_batch_runs_status_check" CHECK ("ai_batch_runs"."status" in ('running', 'done', 'failed', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "ai_batch_runs" ADD CONSTRAINT "ai_batch_runs_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_batch_runs" ADD CONSTRAINT "ai_batch_runs_started_by_user_id_users_id_fk" FOREIGN KEY ("started_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_batch_runs_kind_idx" ON "ai_batch_runs" USING btree ("kind","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_batch_runs_one_running_cert" ON "ai_batch_runs" USING btree ("kind","certification_id") WHERE "ai_batch_runs"."status" = 'running' and "ai_batch_runs"."certification_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_batch_runs_one_running_all" ON "ai_batch_runs" USING btree ("kind") WHERE "ai_batch_runs"."status" = 'running' and "ai_batch_runs"."certification_id" is null;