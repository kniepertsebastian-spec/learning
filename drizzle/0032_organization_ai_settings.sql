CREATE TABLE "organization_ai_settings" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"mode" text,
	"provider" text DEFAULT 'gemini' NOT NULL,
	"key_encrypted" text,
	"key_last4" text,
	"key_updated_at" timestamp with time zone,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_ai_settings_mode_check" CHECK ("organization_ai_settings"."mode" is null or "organization_ai_settings"."mode" in ('platform', 'byok')),
	CONSTRAINT "organization_ai_settings_key_check" CHECK (("organization_ai_settings"."key_encrypted" is null) = ("organization_ai_settings"."key_last4" is null))
);
--> statement-breakpoint
ALTER TABLE "organization_ai_settings" ADD CONSTRAINT "organization_ai_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_ai_settings" ADD CONSTRAINT "organization_ai_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;