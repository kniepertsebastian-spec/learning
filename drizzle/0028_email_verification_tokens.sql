CREATE TABLE "account_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "account_tokens_purpose_check" CHECK ("account_tokens"."purpose" in ('verify_email', 'reset_password'))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_tokens" ADD CONSTRAINT "account_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_tokens_user_purpose_idx" ON "account_tokens" USING btree ("user_id","purpose");
--> statement-breakpoint
-- Bestandskonten gelten als bestätigt (sonst würden sie beim Einschalten des E-Mail-Versands ausgesperrt).
UPDATE "users" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;
