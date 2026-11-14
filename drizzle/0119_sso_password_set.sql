ALTER TABLE "users" ADD COLUMN "password_set" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Aufgabe 09: Bestandskonten ohne bekanntes Passwort. Per SSO angelegt (Konto und Identität in derselben Transaktion) oder beim
-- ersten Verknüpfen ohne bestätigte E-Mail übernommen (Bestätigung und Identität zur selben Zeit, das alte Passwort wurde ersetzt).
UPDATE "users" u SET "password_set" = false
WHERE EXISTS (
  SELECT 1 FROM "user_identities" i
  WHERE i."user_id" = u."id"
    AND (abs(extract(epoch from (i."created_at" - u."created_at"))) < 5
      OR (u."email_verified_at" is not null and abs(extract(epoch from (i."created_at" - u."email_verified_at"))) < 5))
);
