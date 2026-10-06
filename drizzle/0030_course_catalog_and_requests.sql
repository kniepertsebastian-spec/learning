CREATE TABLE "company_course_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"certification_id" uuid NOT NULL,
	"released_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_by_user_id" uuid,
	"request_id" uuid,
	CONSTRAINT "company_course_entitlements_org_cert_unique" UNIQUE("organization_id","certification_id")
);
--> statement-breakpoint
CREATE TABLE "course_request_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"requested_by_user_id" uuid,
	"certification_id" uuid,
	"wish_title" text,
	"wish_description" text,
	"status" text DEFAULT 'submitted' NOT NULL,
	"status_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_requests_status_check" CHECK ("course_requests"."status" in ('submitted', 'on_hold', 'in_creation', 'in_review', 'released', 'rejected')),
	CONSTRAINT "course_requests_target_check" CHECK ("course_requests"."certification_id" is not null or "course_requests"."wish_title" is not null)
);
--> statement-breakpoint
ALTER TABLE "certifications" ADD COLUMN "kind" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "certifications" ADD COLUMN "owner_organization_id" uuid;--> statement-breakpoint
ALTER TABLE "certifications" ADD COLUMN "catalog_status" text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "certifications" ADD COLUMN "approved_by_name" text;--> statement-breakpoint
ALTER TABLE "certifications" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "company_course_entitlements" ADD CONSTRAINT "company_course_entitlements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_course_entitlements" ADD CONSTRAINT "company_course_entitlements_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_course_entitlements" ADD CONSTRAINT "company_course_entitlements_released_by_user_id_users_id_fk" FOREIGN KEY ("released_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_course_entitlements" ADD CONSTRAINT "company_course_entitlements_request_id_course_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."course_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_request_events" ADD CONSTRAINT "course_request_events_request_id_course_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."course_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_request_events" ADD CONSTRAINT "course_request_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_requests" ADD CONSTRAINT "course_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_requests" ADD CONSTRAINT "course_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_requests" ADD CONSTRAINT "course_requests_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_course_entitlements_org_idx" ON "company_course_entitlements" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "course_request_events_request_idx" ON "course_request_events" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "course_requests_org_idx" ON "course_requests" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "course_requests_status_idx" ON "course_requests" USING btree ("status");--> statement-breakpoint
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_owner_organization_id_organizations_id_fk" FOREIGN KEY ("owner_organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_kind_check" CHECK ("certifications"."kind" in ('general', 'internal'));--> statement-breakpoint
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_catalog_status_check" CHECK ("certifications"."catalog_status" in ('draft', 'in_review', 'approved'));--> statement-breakpoint
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_owner_check" CHECK (("certifications"."kind" = 'internal' and "certifications"."owner_organization_id" is not null) or ("certifications"."kind" = 'general' and "certifications"."owner_organization_id" is null));--> statement-breakpoint
-- Bestandsdaten: Firmen, die einen Lernpfad schon zugewiesen haben, behalten ihn (Freigabe nachtragen).
INSERT INTO "company_course_entitlements" ("organization_id", "certification_id")
SELECT DISTINCT "organization_id", "certification_id" FROM "company_assignments"
ON CONFLICT DO NOTHING;
