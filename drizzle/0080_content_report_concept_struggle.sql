ALTER TABLE "content_reports" DROP CONSTRAINT "content_reports_reason_check";--> statement-breakpoint
ALTER TABLE "content_reports" ADD COLUMN "detail" jsonb;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reason_check" CHECK ("content_reports"."reason" in ('incorrect', 'unclear', 'outdated', 'variant_outlier', 'concept_struggle'));