ALTER TABLE "practice_task_submissions" ADD COLUMN "learned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "practice_tasks" ADD COLUMN "objective_id" uuid;--> statement-breakpoint
ALTER TABLE "practice_tasks" ADD CONSTRAINT "practice_tasks_objective_id_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."objectives"("id") ON DELETE set null ON UPDATE no action;