CREATE TABLE "exam_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"certification_id" uuid NOT NULL,
	"scheduled_at" timestamp with time zone,
	"delivery_mode" text,
	"voucher_expires_at" timestamp with time zone,
	"retake_included" boolean DEFAULT false NOT NULL,
	"share_with_company" boolean DEFAULT false NOT NULL,
	"weekly_goal_hours" integer DEFAULT 5 NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"reminders_sent" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_plans_status_check" CHECK ("exam_plans"."status" in ('planned', 'passed', 'failed', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "certifications" ADD COLUMN "exam_provider" text;--> statement-breakpoint
ALTER TABLE "certifications" ADD COLUMN "delivery_modes" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "certifications" ADD COLUMN "booking_url" text;--> statement-breakpoint
ALTER TABLE "certifications" ADD COLUMN "test_center_url" text;--> statement-breakpoint
ALTER TABLE "certifications" ADD COLUMN "validity_months" integer;--> statement-breakpoint
ALTER TABLE "certifications" ADD COLUMN "successor_note" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "exam_reminders_opt_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "exam_plans" ADD CONSTRAINT "exam_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_plans" ADD CONSTRAINT "exam_plans_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exam_plans_user_idx" ON "exam_plans" USING btree ("user_id");