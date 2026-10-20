CREATE TABLE "content_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certification_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"origin" text NOT NULL,
	"note" text,
	"checkpoint_id" uuid,
	"author_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_revisions_target_type_check" CHECK ("content_revisions"."target_type" in ('section', 'question')),
	CONSTRAINT "content_revisions_origin_check" CHECK ("content_revisions"."origin" in ('manual', 'ai', 'backfill', 'translation', 'restore', 'checkpoint'))
);
--> statement-breakpoint
CREATE TABLE "course_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certification_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_checkpoint_id_course_checkpoints_id_fk" FOREIGN KEY ("checkpoint_id") REFERENCES "public"."course_checkpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_checkpoints" ADD CONSTRAINT "course_checkpoints_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_checkpoints" ADD CONSTRAINT "course_checkpoints_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_revisions_target_idx" ON "content_revisions" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "content_revisions_checkpoint_idx" ON "content_revisions" USING btree ("checkpoint_id");--> statement-breakpoint
CREATE INDEX "course_checkpoints_cert_idx" ON "course_checkpoints" USING btree ("certification_id","created_at");