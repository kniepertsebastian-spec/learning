-- Ein Prüfer betreut genau einen Kurs: bestehende Mehrfachzuweisungen auf die älteste reduzieren, bevor die Eindeutigkeit gilt.
DELETE FROM "course_reviewers" a USING "course_reviewers" b WHERE a."user_id" = b."user_id" AND (a."assigned_at", a."id") > (b."assigned_at", b."id");--> statement-breakpoint
DROP INDEX "course_reviewers_user_idx";--> statement-breakpoint
ALTER TABLE "course_reviewers" ADD CONSTRAINT "course_reviewers_user_unique" UNIQUE("user_id");