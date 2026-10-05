CREATE TABLE "company_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"accepted_at" timestamp with time zone,
	"accepted_by_user_id" uuid,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "company_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "company_invitations_role_check" CHECK ("company_invitations"."role" in ('company_admin', 'mentor', 'learner'))
);
--> statement-breakpoint
ALTER TABLE "company_invitations" ADD CONSTRAINT "company_invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_invitations" ADD CONSTRAINT "company_invitations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_invitations" ADD CONSTRAINT "company_invitations_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_invitations_pending_unique" ON "company_invitations" USING btree ("organization_id","email") WHERE "company_invitations"."accepted_at" is null and "company_invitations"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "company_invitations_org_idx" ON "company_invitations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "company_invitations_email_idx" ON "company_invitations" USING btree ("email");