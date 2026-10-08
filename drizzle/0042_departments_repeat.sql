CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_org_name_unique" UNIQUE("organization_id","name")
);
--> statement-breakpoint
CREATE TABLE "mandatory_rule_departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	CONSTRAINT "mandatory_rule_departments_unique" UNIQUE("rule_id","department_id")
);
--> statement-breakpoint
ALTER TABLE "company_assignments" ADD COLUMN "round" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "company_assignments" ADD COLUMN "round_started_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "company_assignments" ADD COLUMN "last_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mandatory_rules" ADD COLUMN "repeat_every_months" integer;--> statement-breakpoint
ALTER TABLE "mandatory_rules" ADD COLUMN "apply_on_change" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "mandatory_rules" ADD COLUMN "all_departments" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD COLUMN "department_id" uuid;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandatory_rule_departments" ADD CONSTRAINT "mandatory_rule_departments_rule_id_mandatory_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."mandatory_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandatory_rule_departments" ADD CONSTRAINT "mandatory_rule_departments_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandatory_rules" ADD CONSTRAINT "mandatory_rules_repeat_check" CHECK ("mandatory_rules"."repeat_every_months" is null or "mandatory_rules"."repeat_every_months" between 1 and 60);