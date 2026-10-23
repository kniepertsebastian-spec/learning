CREATE TABLE "lesson_skips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"source" text DEFAULT 'placement' NOT NULL,
	"skipped_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_skips_user_section_unique" UNIQUE("user_id","section_id")
);
--> statement-breakpoint
ALTER TABLE "mandatory_rules" ADD COLUMN "allow_placement_skip" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_skips" ADD CONSTRAINT "lesson_skips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_skips" ADD CONSTRAINT "lesson_skips_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;