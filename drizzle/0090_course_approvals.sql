CREATE TABLE "course_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certification_id" uuid NOT NULL,
	"kind" text DEFAULT 'approval' NOT NULL,
	"reviewer_user_id" uuid,
	"reviewer_display_name" text NOT NULL,
	"recorded_by_user_id" uuid,
	"content_hash" text NOT NULL,
	"fingerprints" jsonb NOT NULL,
	"version_label" text NOT NULL,
	"scope" jsonb DEFAULT '"course"'::jsonb NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	CONSTRAINT "course_approvals_kind_check" CHECK ("course_approvals"."kind" in ('approval', 'editorial', 'legacy'))
);
--> statement-breakpoint
ALTER TABLE "course_approvals" ADD CONSTRAINT "course_approvals_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_approvals_cert_idx" ON "course_approvals" USING btree ("certification_id","approved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "course_approvals_legacy_unique" ON "course_approvals" USING btree ("certification_id") WHERE "course_approvals"."kind" = 'legacy';--> statement-breakpoint
CREATE FUNCTION "course_approvals_immutable"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'course_approvals ist append-only (UPDATE nicht erlaubt)';
  END IF;
  -- DELETE nur, wenn der Kurs selbst gelöscht wird (Kaskade): dann existiert die certifications-Zeile nicht mehr.
  IF EXISTS (SELECT 1 FROM "certifications" WHERE "id" = OLD."certification_id") THEN
    RAISE EXCEPTION 'course_approvals ist append-only (DELETE nur beim Löschen des Kurses)';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "course_approvals_no_update" BEFORE UPDATE ON "course_approvals" FOR EACH ROW EXECUTE FUNCTION "course_approvals_immutable"();--> statement-breakpoint
CREATE TRIGGER "course_approvals_no_delete" BEFORE DELETE ON "course_approvals" FOR EACH ROW EXECUTE FUNCTION "course_approvals_immutable"();
