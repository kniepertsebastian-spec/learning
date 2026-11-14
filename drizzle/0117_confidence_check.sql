-- Aufgabe 04b (Review 12.11.2026): `confidence` ist erlaubt als NULL, 'guessed', 'unsure' oder 'sure'. Bestehende Abweichungen werden
-- vorher auf NULL gesetzt (die Antwort selbst bleibt, nur die ungültige Selbsteinschätzung entfällt) und als Meldung ausgegeben.
DO $$
DECLARE
	bad_answers integer;
	bad_items integer;
BEGIN
	SELECT count(*) INTO bad_answers FROM "quiz_answers" WHERE "confidence" IS NOT NULL AND "confidence" NOT IN ('guessed', 'unsure', 'sure');
	SELECT count(*) INTO bad_items FROM "study_session_items" WHERE "confidence" IS NOT NULL AND "confidence" NOT IN ('guessed', 'unsure', 'sure');
	IF bad_answers > 0 OR bad_items > 0 THEN
		RAISE NOTICE 'confidence: % Zeile(n) in quiz_answers und % in study_session_items hatten einen ungültigen Wert und wurden auf NULL gesetzt.', bad_answers, bad_items;
		UPDATE "quiz_answers" SET "confidence" = NULL WHERE "confidence" IS NOT NULL AND "confidence" NOT IN ('guessed', 'unsure', 'sure');
		UPDATE "study_session_items" SET "confidence" = NULL WHERE "confidence" IS NOT NULL AND "confidence" NOT IN ('guessed', 'unsure', 'sure');
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_confidence_check" CHECK ("quiz_answers"."confidence" is null or "quiz_answers"."confidence" in ('guessed', 'unsure', 'sure'));--> statement-breakpoint
ALTER TABLE "study_session_items" ADD CONSTRAINT "study_session_items_confidence_check" CHECK ("study_session_items"."confidence" is null or "study_session_items"."confidence" in ('guessed', 'unsure', 'sure'));
