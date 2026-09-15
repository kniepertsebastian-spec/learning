CREATE TABLE "sync_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_event_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"client_created_at" timestamp with time zone NOT NULL,
	"result_summary" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_events_user_client_event_unique" UNIQUE("user_id","client_event_id")
);
--> statement-breakpoint
ALTER TABLE "sync_events" ADD CONSTRAINT "sync_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;