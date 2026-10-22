CREATE TABLE "item_variant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"source" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_variant_item_question_unique" UNIQUE("item_id","question_id"),
	CONSTRAINT "item_variant_source_check" CHECK ("item_variant"."source" in ('original', 'probe', 'generated'))
);
--> statement-breakpoint
ALTER TABLE "review_log" ADD COLUMN "variant_question_id" uuid;--> statement-breakpoint
ALTER TABLE "item_variant" ADD CONSTRAINT "item_variant_item_id_questions_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_variant" ADD CONSTRAINT "item_variant_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_variant_question_idx" ON "item_variant" USING btree ("question_id");--> statement-breakpoint
-- Backfill: jede bestehende Wiederholungsfrage ist Variante ihrer selbst (source = original).
INSERT INTO "item_variant" ("item_id", "question_id", "source")
SELECT "id", "id", 'original' FROM "questions" WHERE "probe_only" = false
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Neue Fragen bekommen ihre Original-Variante automatisch (Fragen werden an mehreren Stellen angelegt).
CREATE FUNCTION "questions_add_original_variant"() RETURNS trigger AS $$
BEGIN
  IF NEW."probe_only" = false THEN
    INSERT INTO "item_variant" ("item_id", "question_id", "source") VALUES (NEW."id", NEW."id", 'original') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "questions_original_variant" AFTER INSERT ON "questions" FOR EACH ROW EXECUTE FUNCTION "questions_add_original_variant"();
