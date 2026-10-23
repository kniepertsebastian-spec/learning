CREATE TABLE "reactivation_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"anchor_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reactivation_message_stage_check" CHECK ("reactivation_message"."stage" in ('d5', 'd12', 'd26'))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reactivation_opt_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reactivation_message" ADD CONSTRAINT "reactivation_message_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reactivation_message_user_idx" ON "reactivation_message" USING btree ("user_id","sent_at");