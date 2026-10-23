CREATE TABLE "concept_prerequisite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"concept_id" uuid NOT NULL,
	"requires_concept_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concept_prerequisite_pair_unique" UNIQUE("concept_id","requires_concept_id"),
	CONSTRAINT "concept_prerequisite_not_self_check" CHECK ("concept_prerequisite"."concept_id" <> "concept_prerequisite"."requires_concept_id"),
	CONSTRAINT "concept_prerequisite_status_check" CHECK ("concept_prerequisite"."status" in ('draft', 'approved', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "concept_struggle" ADD COLUMN "prereq_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "concept_struggle" ADD COLUMN "bridge_section_id" uuid;--> statement-breakpoint
ALTER TABLE "concept_struggle" ADD COLUMN "bridge_concept_id" uuid;--> statement-breakpoint
ALTER TABLE "concept_prerequisite" ADD CONSTRAINT "concept_prerequisite_concept_id_concept_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concept"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_prerequisite" ADD CONSTRAINT "concept_prerequisite_requires_concept_id_concept_id_fk" FOREIGN KEY ("requires_concept_id") REFERENCES "public"."concept"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_prerequisite" ADD CONSTRAINT "concept_prerequisite_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "concept_prerequisite_requires_idx" ON "concept_prerequisite" USING btree ("requires_concept_id");--> statement-breakpoint
ALTER TABLE "concept_struggle" ADD CONSTRAINT "concept_struggle_bridge_section_id_sections_id_fk" FOREIGN KEY ("bridge_section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_struggle" ADD CONSTRAINT "concept_struggle_bridge_concept_id_concept_id_fk" FOREIGN KEY ("bridge_concept_id") REFERENCES "public"."concept"("id") ON DELETE set null ON UPDATE no action;