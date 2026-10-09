CREATE TABLE "exam_vouchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"certification_id" uuid NOT NULL,
	"assigned_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"redeemed_at" timestamp with time zone,
	"note" text DEFAULT '' NOT NULL,
	"code_encrypted" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "user_certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"certification_id" uuid,
	"title" text NOT NULL,
	"vendor" text DEFAULT '' NOT NULL,
	"earned_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"evidence_url" text,
	"shared_with_company" boolean DEFAULT false NOT NULL,
	"reminders_sent" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exam_vouchers" ADD CONSTRAINT "exam_vouchers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_vouchers" ADD CONSTRAINT "exam_vouchers_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_vouchers" ADD CONSTRAINT "exam_vouchers_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_vouchers" ADD CONSTRAINT "exam_vouchers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_certificates" ADD CONSTRAINT "user_certificates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_certificates" ADD CONSTRAINT "user_certificates_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exam_vouchers_org_idx" ON "exam_vouchers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "user_certificates_user_idx" ON "user_certificates" USING btree ("user_id");