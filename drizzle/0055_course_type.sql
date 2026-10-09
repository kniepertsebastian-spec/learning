ALTER TABLE "certifications" ADD COLUMN "course_type" text DEFAULT 'certification' NOT NULL;--> statement-breakpoint
ALTER TABLE "course_generation_jobs" ADD COLUMN "course_type" text DEFAULT 'certification' NOT NULL;
--> statement-breakpoint
-- Individuelle Trainings sind nicht auf die IT beschränkt: Gruppen für weitere Themen (vorhandene bleiben unverändert).
INSERT INTO "course_categories" ("slug", "name", "color", "position")
SELECT v.slug, v.name, v.color, v.pos + COALESCE((SELECT max("position") FROM "course_categories"), 0)
FROM (VALUES
  ('creative-media', jsonb_build_object('de', 'Kreativ & Medien', 'en', 'Creative & Media'), 'violet', 1),
  ('office-productivity', jsonb_build_object('de', 'Büro & Produktivität', 'en', 'Office & Productivity'), 'info', 2),
  ('other-topics', jsonb_build_object('de', 'Weitere Themen', 'en', 'Other Topics'), 'mint', 3)
) AS v(slug, name, color, pos)
ON CONFLICT ("slug") DO NOTHING;
