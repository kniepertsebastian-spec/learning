CREATE TABLE "push_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"ref" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_deliveries_unique" UNIQUE("user_id","kind","ref"),
	CONSTRAINT "push_deliveries_kind_check" CHECK ("push_deliveries"."kind" in ('exam_soon', 'voucher_expiring', 'retake_included', 'reviews_due', 'streak_risk'))
);
--> statement-breakpoint
CREATE TABLE "push_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"exam_reminders" boolean DEFAULT true NOT NULL,
	"reviews_due" boolean DEFAULT true NOT NULL,
	"streak_risk" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth_key" text NOT NULL,
	"locale" text DEFAULT 'de' NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "push_subscriptions_locale_check" CHECK ("push_subscriptions"."locale" in ('de', 'en')),
	CONSTRAINT "push_subscriptions_failure_check" CHECK ("push_subscriptions"."failure_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_preferences" ADD CONSTRAINT "push_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_deliveries_user_idx" ON "push_deliveries" USING btree ("user_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_unique" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");