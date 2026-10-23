CREATE TABLE "learning_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"weekly_goal_days" integer DEFAULT 4 NOT NULL,
	"show_streak" boolean DEFAULT false NOT NULL,
	"ask_confidence" boolean DEFAULT true NOT NULL,
	"offer_checkin" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_preferences_goal_check" CHECK ("learning_preferences"."weekly_goal_days" between 1 and 7)
);
--> statement-breakpoint
ALTER TABLE "learning_preferences" ADD CONSTRAINT "learning_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;