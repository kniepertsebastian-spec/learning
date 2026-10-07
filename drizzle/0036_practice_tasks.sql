CREATE TABLE "practice_task_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"learner_note" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"reviewer_note" text,
	CONSTRAINT "practice_task_submissions_task_user_unique" UNIQUE("task_id","user_id"),
	CONSTRAINT "practice_task_submissions_status_check" CHECK ("practice_task_submissions"."status" in ('submitted', 'confirmed', 'rework'))
);
--> statement-breakpoint
CREATE TABLE "practice_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"certification_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "practice_task_submissions" ADD CONSTRAINT "practice_task_submissions_task_id_practice_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."practice_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_task_submissions" ADD CONSTRAINT "practice_task_submissions_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_task_submissions" ADD CONSTRAINT "practice_task_submissions_member_fk" FOREIGN KEY ("user_id","organization_id") REFERENCES "public"."organization_memberships"("user_id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_tasks" ADD CONSTRAINT "practice_tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_tasks" ADD CONSTRAINT "practice_tasks_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_tasks" ADD CONSTRAINT "practice_tasks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "practice_task_submissions_org_status_idx" ON "practice_task_submissions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "practice_tasks_org_cert_idx" ON "practice_tasks" USING btree ("organization_id","certification_id");