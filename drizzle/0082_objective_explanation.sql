CREATE TABLE "objective_explanation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"objective_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"content" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "objective_explanation_objective_kind_unique" UNIQUE("objective_id","kind"),
	CONSTRAINT "objective_explanation_kind_check" CHECK ("objective_explanation"."kind" in ('worked_example', 'analogy', 'example')),
	CONSTRAINT "objective_explanation_status_check" CHECK ("objective_explanation"."status" in ('draft', 'approved', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "objective_explanation" ADD CONSTRAINT "objective_explanation_objective_id_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."objectives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_explanation" ADD CONSTRAINT "objective_explanation_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "objective_explanation_status_idx" ON "objective_explanation" USING btree ("status");