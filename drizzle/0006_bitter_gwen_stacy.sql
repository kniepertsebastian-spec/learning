CREATE TABLE "blueprint_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"certification_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"suggested_slug" text NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"truncated_source" boolean DEFAULT false NOT NULL,
	"model_version" text,
	"prompt_version" text,
	"generated_by_user_id" uuid,
	"edited_by_user_id" uuid,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blueprint_drafts_source_id_unique" UNIQUE("source_id")
);
--> statement-breakpoint
ALTER TABLE "blueprint_drafts" ADD CONSTRAINT "blueprint_drafts_source_id_certification_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."certification_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_drafts" ADD CONSTRAINT "blueprint_drafts_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_drafts" ADD CONSTRAINT "blueprint_drafts_generated_by_user_id_users_id_fk" FOREIGN KEY ("generated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_drafts" ADD CONSTRAINT "blueprint_drafts_edited_by_user_id_users_id_fk" FOREIGN KEY ("edited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;