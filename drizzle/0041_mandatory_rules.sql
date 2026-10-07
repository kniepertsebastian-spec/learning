CREATE TABLE "assignment_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_notices_assignment_kind_unique" UNIQUE("assignment_id","kind"),
	CONSTRAINT "assignment_notices_kind_check" CHECK ("assignment_notices"."kind" in ('reminder', 'overdue', 'escalation'))
);
--> statement-breakpoint
CREATE TABLE "mandatory_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"certification_id" uuid NOT NULL,
	"roles" text[] NOT NULL,
	"due_in_days" integer NOT NULL,
	"reminder_days_before" integer DEFAULT 7 NOT NULL,
	"escalate_after_days" integer DEFAULT 3 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mandatory_rules_org_cert_unique" UNIQUE("organization_id","certification_id"),
	CONSTRAINT "mandatory_rules_roles_check" CHECK (cardinality("mandatory_rules"."roles") > 0 and "mandatory_rules"."roles" <@ array['company_admin', 'mentor', 'learner']::text[]),
	CONSTRAINT "mandatory_rules_due_check" CHECK ("mandatory_rules"."due_in_days" between 1 and 365),
	CONSTRAINT "mandatory_rules_reminder_check" CHECK ("mandatory_rules"."reminder_days_before" between 0 and 60),
	CONSTRAINT "mandatory_rules_escalate_check" CHECK ("mandatory_rules"."escalate_after_days" between 1 and 60)
);
--> statement-breakpoint
ALTER TABLE "company_assignments" ADD COLUMN "mandatory_rule_id" uuid;--> statement-breakpoint
ALTER TABLE "assignment_notices" ADD CONSTRAINT "assignment_notices_assignment_id_company_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."company_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandatory_rules" ADD CONSTRAINT "mandatory_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandatory_rules" ADD CONSTRAINT "mandatory_rules_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandatory_rules" ADD CONSTRAINT "mandatory_rules_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_assignments" ADD CONSTRAINT "company_assignments_mandatory_rule_id_mandatory_rules_id_fk" FOREIGN KEY ("mandatory_rule_id") REFERENCES "public"."mandatory_rules"("id") ON DELETE set null ON UPDATE no action;