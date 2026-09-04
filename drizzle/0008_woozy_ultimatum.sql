CREATE TABLE "objective_source_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"objective_id" uuid NOT NULL,
	"source_chunk_id" uuid NOT NULL,
	"locator" text NOT NULL,
	"confidence" numeric(3, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "objective_source_refs_objective_chunk_unique" UNIQUE("objective_id","source_chunk_id")
);
--> statement-breakpoint
ALTER TABLE "certification_sources" ADD COLUMN "supersedes_source_id" uuid;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "source_version_id" uuid;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "review_status" text DEFAULT 'unreviewed' NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "source_chunk_id" uuid;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "stale" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "objective_source_refs" ADD CONSTRAINT "objective_source_refs_objective_id_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."objectives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_source_refs" ADD CONSTRAINT "objective_source_refs_source_chunk_id_source_chunks_id_fk" FOREIGN KEY ("source_chunk_id") REFERENCES "public"."source_chunks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_sources" ADD CONSTRAINT "certification_sources_supersedes_source_id_certification_sources_id_fk" FOREIGN KEY ("supersedes_source_id") REFERENCES "public"."certification_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_source_version_id_certification_sources_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."certification_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_source_chunk_id_source_chunks_id_fk" FOREIGN KEY ("source_chunk_id") REFERENCES "public"."source_chunks"("id") ON DELETE set null ON UPDATE no action;