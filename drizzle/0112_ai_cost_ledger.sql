CREATE TABLE "ai_cost_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"detail" text,
	"certification_id" uuid,
	"generation_job_id" uuid,
	"model" text,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"cached_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6),
	"byok" boolean DEFAULT false NOT NULL,
	"historic" boolean DEFAULT false NOT NULL,
	CONSTRAINT "ai_cost_entries_source_check" CHECK ("ai_cost_entries"."source" in ('course_generation', 'translation', 'workshop', 'batch', 'overview', 'legacy_script', 'other'))
);
--> statement-breakpoint
ALTER TABLE "ai_cost_entries" ADD CONSTRAINT "ai_cost_entries_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_cost_entries" ADD CONSTRAINT "ai_cost_entries_generation_job_id_course_generation_jobs_id_fk" FOREIGN KEY ("generation_job_id") REFERENCES "public"."course_generation_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_cost_entries_certification_idx" ON "ai_cost_entries" USING btree ("certification_id");--> statement-breakpoint
CREATE INDEX "ai_cost_entries_generation_job_idx" ON "ai_cost_entries" USING btree ("generation_job_id");--> statement-breakpoint
CREATE INDEX "ai_cost_entries_created_idx" ON "ai_cost_entries" USING btree ("created_at");--> statement-breakpoint
-- Frühere Kosten ins Kostenbuch übernehmen (historic = true): bis jetzt standen sie verteilt in Summenfeldern. Nur dort, wo ein
-- Betrag steht; Token sind nicht bekannt. Die Quellen überschneiden sich nicht: Der Auftrag der Kursgenerierung zählt nur die
-- Generierung, die Werkstatt-Summe am Kurs schließt die Läufe „Qualitätsbericht“ und „Formatfragen“ ein (sie laufen über
-- denselben Vorschlags-Aufruf), von den Sammelläufen steht nur bei den Simulationen ein eigener Betrag am Lauf. Die Tabelle
-- objective_generation_costs bleibt außen vor: Sie ist ein Schnappschuss je Lernziel derselben Aufrufe, die schon in
-- content_generation_jobs bzw. (seit dem Umbau) im laufenden Buch stehen.
INSERT INTO "ai_cost_entries" ("created_at", "source", "certification_id", "generation_job_id", "cost_usd", "historic")
SELECT COALESCE("completed_at", "updated_at"), 'course_generation', "result_certification_id", "id", "actual_cost_usd", true
FROM "course_generation_jobs"
WHERE "actual_cost_usd" > 0;
--> statement-breakpoint
INSERT INTO "ai_cost_entries" ("created_at", "source", "certification_id", "cost_usd", "historic")
SELECT COALESCE("translated_at", "updated_at"), 'translation', "id", "translation_cost_usd", true
FROM "certifications"
WHERE "translation_cost_usd" > 0;
--> statement-breakpoint
INSERT INTO "ai_cost_entries" ("created_at", "source", "certification_id", "cost_usd", "historic")
SELECT "updated_at", 'workshop', "id", "ai_edit_cost_usd", true
FROM "certifications"
WHERE "ai_edit_cost_usd" > 0;
--> statement-breakpoint
INSERT INTO "ai_cost_entries" ("created_at", "source", "detail", "certification_id", "cost_usd", "historic")
SELECT COALESCE("finished_at", "updated_at"), 'batch', "kind", "certification_id", "cost_usd", true
FROM "ai_batch_runs"
WHERE "kind" = 'simulations' AND "cost_usd" > 0;
--> statement-breakpoint
INSERT INTO "ai_cost_entries" ("created_at", "source", "certification_id", "model", "prompt_tokens", "completion_tokens", "cost_usd", "historic")
SELECT COALESCE("completed_at", "created_at"), 'legacy_script', "certification_id", "model", "prompt_tokens", "completion_tokens", "estimated_cost_usd", true
FROM "content_generation_jobs"
WHERE "estimated_cost_usd" > 0;
