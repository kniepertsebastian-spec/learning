CREATE TABLE "certification_categories" (
	"certification_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certification_categories_certification_id_category_id_pk" PRIMARY KEY("certification_id","category_id")
);
--> statement-breakpoint
ALTER TABLE "certification_categories" ADD CONSTRAINT "certification_categories_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_categories" ADD CONSTRAINT "certification_categories_category_id_course_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."course_categories"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Bisherige Hauptgruppe der Kurse in die neue Zuordnung übernehmen.
INSERT INTO "certification_categories" ("certification_id", "category_id")
SELECT "id", "category_id" FROM "certifications" WHERE "category_id" IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Übliche IT-Kursgruppen anlegen (vorhandene Gruppen mit gleichem Kürzel bleiben unverändert).
INSERT INTO "course_categories" ("slug", "name", "color", "position")
SELECT v.slug, v.name, v.color, v.pos + COALESCE((SELECT max("position") FROM "course_categories"), 0)
FROM (VALUES
  ('cloud', jsonb_build_object('de', 'Cloud', 'en', 'Cloud'), 'info', 1),
  ('security', jsonb_build_object('de', 'Security', 'en', 'Security'), 'danger', 2),
  ('networking', jsonb_build_object('de', 'Netzwerk', 'en', 'Networking'), 'mint', 3),
  ('kubernetes-und-containers', jsonb_build_object('de', 'Kubernetes & Container', 'en', 'Kubernetes & Containers'), 'violet', 4),
  ('devops-und-automation', jsonb_build_object('de', 'DevOps & Automatisierung', 'en', 'DevOps & Automation'), 'warning', 5),
  ('operating-systems-und-administration', jsonb_build_object('de', 'Betriebssysteme & Admin', 'en', 'Operating Systems & Administration'), 'info', 6),
  ('databases-und-data', jsonb_build_object('de', 'Datenbanken & Daten', 'en', 'Databases & Data'), 'mint', 7),
  ('development', jsonb_build_object('de', 'Entwicklung', 'en', 'Development'), 'violet', 8),
  ('ai-und-machine-learning', jsonb_build_object('de', 'KI & Machine Learning', 'en', 'AI & Machine Learning'), 'warning', 9),
  ('ai-und-generative-ai', jsonb_build_object('de', 'AI & Generative KI', 'en', 'AI & Generative AI'), 'danger', 10),
  ('it-service-und-governance', jsonb_build_object('de', 'IT-Service & Governance', 'en', 'IT Service & Governance'), 'info', 11),
  ('project-und-agile', jsonb_build_object('de', 'Projekt & Agilität', 'en', 'Project & Agile'), 'mint', 12),
  ('fundamentals-entry-level', jsonb_build_object('de', 'Grundlagen / Einstieg', 'en', 'Fundamentals / Entry Level'), 'violet', 13),
  ('vendor-ecosystems', jsonb_build_object('de', 'Hersteller-Ökosysteme', 'en', 'Vendor Ecosystems'), 'warning', 14)
) AS v(slug, name, color, pos)
ON CONFLICT ("slug") DO NOTHING;
