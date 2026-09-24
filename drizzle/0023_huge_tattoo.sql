CREATE TABLE "objective_generation_costs" (
	"objective_id" uuid PRIMARY KEY NOT NULL,
	"model" text,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost_usd" numeric(10, 4),
	"accepted_lesson_count" integer DEFAULT 0 NOT NULL,
	"accepted_question_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "objective_generation_costs" ADD CONSTRAINT "objective_generation_costs_objective_id_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."objectives"("id") ON DELETE cascade ON UPDATE no action;