CREATE TABLE "concept_struggle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	"status" text DEFAULT 'detected' NOT NULL,
	"signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concept_struggle_user_concept_unique" UNIQUE("user_id","concept_id"),
	CONSTRAINT "concept_struggle_status_check" CHECK ("concept_struggle"."status" in ('detected', 'in_progress', 'resolved', 'declined'))
);
--> statement-breakpoint
ALTER TABLE "study_session_items" ADD COLUMN "concept_struggle_id" uuid;--> statement-breakpoint
ALTER TABLE "study_session_items" ADD COLUMN "selected_option_id" uuid;--> statement-breakpoint
ALTER TABLE "concept_struggle" ADD CONSTRAINT "concept_struggle_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_struggle" ADD CONSTRAINT "concept_struggle_concept_id_concept_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concept"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "concept_struggle_user_status_idx" ON "concept_struggle" USING btree ("user_id","status");--> statement-breakpoint
ALTER TABLE "study_session_items" ADD CONSTRAINT "study_session_items_concept_struggle_id_concept_struggle_id_fk" FOREIGN KEY ("concept_struggle_id") REFERENCES "public"."concept_struggle"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_session_items" ADD CONSTRAINT "study_session_items_selected_option_id_question_options_id_fk" FOREIGN KEY ("selected_option_id") REFERENCES "public"."question_options"("id") ON DELETE set null ON UPDATE no action;