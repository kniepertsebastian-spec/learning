CREATE TABLE "company_course_group_items" (
	"group_id" uuid NOT NULL,
	"certification_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "company_course_group_items_group_id_certification_id_pk" PRIMARY KEY("group_id","certification_id")
);
--> statement-breakpoint
CREATE TABLE "company_course_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"color" text DEFAULT 'info' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid
);
--> statement-breakpoint
ALTER TABLE "company_assignments" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "company_course_group_items" ADD CONSTRAINT "company_course_group_items_group_id_company_course_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."company_course_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_course_group_items" ADD CONSTRAINT "company_course_group_items_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_course_groups" ADD CONSTRAINT "company_course_groups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_course_groups" ADD CONSTRAINT "company_course_groups_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_course_groups_org_idx" ON "company_course_groups" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "company_assignments" ADD CONSTRAINT "company_assignments_group_id_company_course_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."company_course_groups"("id") ON DELETE set null ON UPDATE no action;