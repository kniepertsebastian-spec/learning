CREATE TABLE "probe_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"reports" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result" jsonb,
	"passed" boolean
);
--> statement-breakpoint
CREATE TABLE "probe_set_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"set_id" uuid NOT NULL,
	"order_num" integer NOT NULL,
	"question" text NOT NULL,
	"options" jsonb NOT NULL,
	"explanation" text NOT NULL,
	"planted_error" jsonb
);
--> statement-breakpoint
CREATE TABLE "probe_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"topic" text NOT NULL,
	"language" text DEFAULT 'de' NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviewer_qualifications" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"attempt_id" uuid,
	"granted_by_user_id" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "probe_attempts" ADD CONSTRAINT "probe_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_attempts" ADD CONSTRAINT "probe_attempts_set_id_probe_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."probe_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_set_items" ADD CONSTRAINT "probe_set_items_set_id_probe_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."probe_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_sets" ADD CONSTRAINT "probe_sets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_qualifications" ADD CONSTRAINT "reviewer_qualifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_qualifications" ADD CONSTRAINT "reviewer_qualifications_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "probe_attempts_user_idx" ON "probe_attempts" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "probe_set_items_set_idx" ON "probe_set_items" USING btree ("set_id","order_num");--> statement-breakpoint
-- Bestehende Prüfer behalten ihre Freigaberechte (vor dem Probe-Review ausgewählt).
INSERT INTO "reviewer_qualifications" ("user_id", "source") SELECT "id", 'admin' FROM "users" WHERE "role" = 'reviewer' ON CONFLICT DO NOTHING;
