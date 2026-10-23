CREATE TABLE "energy_mode_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"certification_id" uuid,
	"mode" text NOT NULL,
	"energy_level" integer,
	"deescalated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "energy_mode_event_mode_check" CHECK ("energy_mode_event"."mode" in ('simulation', 'cheat_sheet', 'reviews_only', 'single_task', 'normal'))
);
--> statement-breakpoint
CREATE TABLE "learning_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"certification_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_activity_kind_check" CHECK ("learning_activity"."kind" in ('cheat_sheet'))
);
--> statement-breakpoint
CREATE TABLE "objective_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"certification_id" uuid NOT NULL,
	"day" text NOT NULL,
	"secure_objectives" integer NOT NULL,
	"total_objectives" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "objective_snapshot_day_unique" UNIQUE("user_id","certification_id","day")
);
--> statement-breakpoint
ALTER TABLE "energy_mode_event" ADD CONSTRAINT "energy_mode_event_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_mode_event" ADD CONSTRAINT "energy_mode_event_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_activity" ADD CONSTRAINT "learning_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_activity" ADD CONSTRAINT "learning_activity_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_snapshot" ADD CONSTRAINT "objective_snapshot_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_snapshot" ADD CONSTRAINT "objective_snapshot_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "energy_mode_event_user_idx" ON "energy_mode_event" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "learning_activity_user_idx" ON "learning_activity" USING btree ("user_id","created_at");