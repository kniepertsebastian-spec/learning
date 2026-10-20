CREATE TABLE "simulation_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"sim_index" integer NOT NULL,
	"solves" integer DEFAULT 1 NOT NULL,
	"best_helps" integer NOT NULL,
	"last_helps" integer NOT NULL,
	"first_solved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_solved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "simulation_results_user_section_sim_unique" UNIQUE("user_id","section_id","sim_index")
);
--> statement-breakpoint
ALTER TABLE "simulation_results" ADD CONSTRAINT "simulation_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_results" ADD CONSTRAINT "simulation_results_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;