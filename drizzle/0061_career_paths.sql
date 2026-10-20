CREATE TABLE "career_suggestions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"input_hash" text NOT NULL,
	"paths" jsonb NOT NULL,
	"model" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"runs_today" integer DEFAULT 1 NOT NULL,
	"runs_day" date DEFAULT (now() at time zone 'utc')::date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salary_datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"reference_date" date NOT NULL,
	"file_name" text,
	"row_count" integer DEFAULT 0 NOT NULL,
	"imported_by_user_id" uuid,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salary_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"kldb" text NOT NULL,
	"occupation_name" text,
	"level" integer,
	"region" text NOT NULL,
	"median" integer NOT NULL,
	"q25" integer,
	"q75" integer,
	CONSTRAINT "salary_stats_kldb_check" CHECK ("salary_stats"."kldb" ~ '^[0-9]{3,5}$'),
	CONSTRAINT "salary_stats_level_check" CHECK ("salary_stats"."level" is null or "salary_stats"."level" between 1 and 4)
);
--> statement-breakpoint
ALTER TABLE "career_suggestions" ADD CONSTRAINT "career_suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_datasets" ADD CONSTRAINT "salary_datasets_imported_by_user_id_users_id_fk" FOREIGN KEY ("imported_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_stats" ADD CONSTRAINT "salary_stats_dataset_id_salary_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."salary_datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "salary_stats_lookup_idx" ON "salary_stats" USING btree ("dataset_id","kldb","region");