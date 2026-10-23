CREATE TABLE "engagement_state" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'normal' NOT NULL,
	"signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"since" timestamp with time zone,
	"until" timestamp with time zone,
	"sessions_left" integer DEFAULT 0 NOT NULL,
	"declined_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "engagement_state_status_check" CHECK ("engagement_state"."status" in ('normal', 'deescalated'))
);
--> statement-breakpoint
ALTER TABLE "study_sessions" ADD COLUMN "deescalated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "engagement_state" ADD CONSTRAINT "engagement_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;