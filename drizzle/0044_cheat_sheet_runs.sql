CREATE TABLE "cheat_sheet_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"certification_id" uuid NOT NULL,
	"started_by_user_id" uuid,
	"status" text DEFAULT 'running' NOT NULL,
	"total" integer NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "cheat_sheet_runs_status_check" CHECK ("cheat_sheet_runs"."status" in ('running', 'done', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "cheat_sheet_runs" ADD CONSTRAINT "cheat_sheet_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheat_sheet_runs" ADD CONSTRAINT "cheat_sheet_runs_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheat_sheet_runs" ADD CONSTRAINT "cheat_sheet_runs_started_by_user_id_users_id_fk" FOREIGN KEY ("started_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cheat_sheet_runs_cert_idx" ON "cheat_sheet_runs" USING btree ("certification_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cheat_sheet_runs_one_running" ON "cheat_sheet_runs" USING btree ("certification_id") WHERE "cheat_sheet_runs"."status" = 'running';