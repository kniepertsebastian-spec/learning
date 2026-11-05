CREATE TABLE "second_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"approval_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"reviewer_user_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "second_reviews_approval_question_unique" UNIQUE("approval_id","question_id"),
	CONSTRAINT "second_reviews_status_check" CHECK ("second_reviews"."status" in ('pending', 'agreed', 'deviated'))
);
--> statement-breakpoint
ALTER TABLE "second_reviews" ADD CONSTRAINT "second_reviews_approval_id_course_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."course_approvals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "second_reviews" ADD CONSTRAINT "second_reviews_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "second_reviews" ADD CONSTRAINT "second_reviews_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "second_reviews_reviewer_idx" ON "second_reviews" USING btree ("reviewer_user_id","status");--> statement-breakpoint
CREATE INDEX "second_reviews_status_idx" ON "second_reviews" USING btree ("status");