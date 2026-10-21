ALTER TABLE "probe_variant" ADD COLUMN "source_item_id" uuid;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "probe_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "probe_variant" ADD CONSTRAINT "probe_variant_source_item_id_questions_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;