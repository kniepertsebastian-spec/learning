ALTER TABLE "objective_explanation" DROP CONSTRAINT "objective_explanation_kind_check";--> statement-breakpoint
ALTER TABLE "objective_explanation" ADD COLUMN "solution" jsonb;--> statement-breakpoint
ALTER TABLE "objective_explanation" ADD CONSTRAINT "objective_explanation_kind_check" CHECK ("objective_explanation"."kind" in ('worked_example', 'gapped_example', 'analogy', 'example'));