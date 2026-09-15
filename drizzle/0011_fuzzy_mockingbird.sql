CREATE TABLE "review_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"due_at" timestamp with time zone DEFAULT now() NOT NULL,
	"interval_days" numeric(6, 2) DEFAULT '0' NOT NULL,
	"repetitions" integer DEFAULT 0 NOT NULL,
	"ease_factor" numeric(4, 2) DEFAULT '2.5' NOT NULL,
	"last_outcome" text,
	"last_answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_items_user_question_unique" UNIQUE("user_id","question_id"),
	CONSTRAINT "review_items_last_outcome_check" CHECK ("review_items"."last_outcome" is null or "review_items"."last_outcome" in ('correct', 'incorrect'))
);
--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;